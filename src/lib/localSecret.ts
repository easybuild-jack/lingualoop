/**
 * 本机敏感凭据（API Key / Access Token / Supabase anon key）的本地加密存储工具。
 *
 * - 所有密钥仅存本机浏览器 localStorage，绝不上传云端数据库；
 * - 写入 localStorage 前使用 ChaCha20 + 每条独立 96-bit 随机 nonce 加密，格式为 `enc:v1:<base64>`；
 * - 读取时自动兼容历史明文存档，并在首次读取时原地升级为密文写回；
 * - 全程同步执行，适配 Zustand persist 与 React useSyncExternalStore，不引入水合竞态。
 */
import type { StateStorage } from 'zustand/middleware'

const SECRET_PREFIX = 'enc:v1:'
const DEVICE_KEY_STORAGE = '__ll_dk_v1'
const NONCE_BYTES = 12
const KEY_BYTES = 32

let memoryFallbackKey: Uint8Array | null = null

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function fillRandomBytes(buf: Uint8Array): Uint8Array {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    return globalThis.crypto.getRandomValues(buf)
  }
  for (let i = 0; i < buf.length; i += 1) {
    buf[i] = Math.floor(Math.random() * 256)
  }
  return buf
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(encoded: string): Uint8Array | null {
  try {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(encoded, 'base64'))
    }
    const binary = atob(encoded)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i)
    }
    return out
  } catch {
    return null
  }
}

function rotl32(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) >>> 0
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

function quarterRound(s: Uint32Array, a: number, b: number, c: number, d: number): void {
  s[a] = (s[a] + s[b]) >>> 0
  s[d] = rotl32(s[d] ^ s[a], 16)
  s[c] = (s[c] + s[d]) >>> 0
  s[b] = rotl32(s[b] ^ s[c], 12)
  s[a] = (s[a] + s[b]) >>> 0
  s[d] = rotl32(s[d] ^ s[a], 8)
  s[c] = (s[c] + s[d]) >>> 0
  s[b] = rotl32(s[b] ^ s[c], 7)
}

/** RFC 8439 ChaCha20 流加密 / 解密 */
function chacha20Xor(key: Uint8Array, nonce: Uint8Array, counter: number, input: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.length)
  const state = new Uint32Array(16)
  const working = new Uint32Array(16)
  const block = new Uint8Array(64)

  state[0] = 0x61707865
  state[1] = 0x3320646e
  state[2] = 0x79622d32
  state[3] = 0x6b206574
  for (let i = 0; i < 8; i += 1) state[4 + i] = readU32LE(key, i * 4)
  state[13] = readU32LE(nonce, 0)
  state[14] = readU32LE(nonce, 4)
  state[15] = readU32LE(nonce, 8)

  let ctr = counter >>> 0
  for (let offset = 0; offset < input.length; offset += 64) {
    state[12] = ctr
    ctr = (ctr + 1) >>> 0
    working.set(state)

    for (let r = 0; r < 10; r += 1) {
      quarterRound(working, 0, 4, 8, 12)
      quarterRound(working, 1, 5, 9, 13)
      quarterRound(working, 2, 6, 10, 14)
      quarterRound(working, 3, 7, 11, 15)
      quarterRound(working, 0, 5, 10, 15)
      quarterRound(working, 1, 6, 11, 12)
      quarterRound(working, 2, 7, 8, 13)
      quarterRound(working, 3, 4, 9, 14)
    }

    for (let i = 0; i < 16; i += 1) {
      const word = (working[i] + state[i]) >>> 0
      block[i * 4] = word & 0xff
      block[i * 4 + 1] = (word >>> 8) & 0xff
      block[i * 4 + 2] = (word >>> 16) & 0xff
      block[i * 4 + 3] = (word >>> 24) & 0xff
    }

    const len = Math.min(64, input.length - offset)
    for (let i = 0; i < len; i += 1) {
      output[offset + i] = input[offset + i] ^ block[i]
    }
  }

  return output
}

function getDeviceKey(): Uint8Array {
  let raw: Uint8Array | null = null
  if (canUseStorage()) {
    const saved = localStorage.getItem(DEVICE_KEY_STORAGE)
    if (saved) {
      const decoded = base64ToBytes(saved)
      if (decoded && decoded.length === KEY_BYTES) raw = decoded
    }
    if (!raw) {
      raw = fillRandomBytes(new Uint8Array(KEY_BYTES))
      try {
        localStorage.setItem(DEVICE_KEY_STORAGE, bytesToBase64(raw))
      } catch {
        // 隐私模式或空间不足时回退到内存密钥
      }
    }
  } else {
    if (!memoryFallbackKey) memoryFallbackKey = fillRandomBytes(new Uint8Array(KEY_BYTES))
    raw = memoryFallbackKey
  }

  // 混入当前站点 origin，防止跨源直接复用密文
  const scope =
    typeof window !== 'undefined' && window.location?.origin
      ? `lingualoop:${window.location.origin}`
      : 'lingualoop:local'
  const scopeBytes = new TextEncoder().encode(scope)
  const mixed = new Uint8Array(KEY_BYTES)
  mixed.set(raw)
  for (let i = 0; i < scopeBytes.length; i += 1) {
    mixed[i % KEY_BYTES] ^= scopeBytes[i]
  }
  return mixed
}

export function isEncryptedLocalSecret(value: string): boolean {
  return value.startsWith(SECRET_PREFIX)
}

export function encryptLocalSecret(plain: string): string {
  if (!plain) return ''
  if (isEncryptedLocalSecret(plain)) return plain
  const key = getDeviceKey()
  const nonce = fillRandomBytes(new Uint8Array(NONCE_BYTES))
  const data = new TextEncoder().encode(plain)
  const cipher = chacha20Xor(key, nonce, 1, data)
  const combined = new Uint8Array(NONCE_BYTES + cipher.length)
  combined.set(nonce, 0)
  combined.set(cipher, NONCE_BYTES)
  return `${SECRET_PREFIX}${bytesToBase64(combined)}`
}

export function decryptLocalSecret(stored: string): string {
  if (!stored) return ''
  if (!isEncryptedLocalSecret(stored)) return stored
  const combined = base64ToBytes(stored.slice(SECRET_PREFIX.length))
  if (!combined || combined.length < NONCE_BYTES) return ''
  const nonce = combined.subarray(0, NONCE_BYTES)
  const cipher = combined.subarray(NONCE_BYTES)
  const plain = chacha20Xor(getDeviceKey(), nonce, 1, cipher)
  try {
    return new TextDecoder().decode(plain)
  } catch {
    return ''
  }
}

/* -------------------------------------------------------------------------- */
/* Zustand persist 存储包装：仅对指定嵌套凭据字段加密存储                            */
/* -------------------------------------------------------------------------- */

function transformPath(
  root: Record<string, unknown>,
  path: readonly string[],
  transform: (value: string) => string
): boolean {
  let cursor: unknown = root
  for (let i = 0; i < path.length - 1; i += 1) {
    if (!cursor || typeof cursor !== 'object') return false
    cursor = (cursor as Record<string, unknown>)[path[i]]
  }
  if (!cursor || typeof cursor !== 'object') return false
  const leafKey = path[path.length - 1]
  const container = cursor as Record<string, unknown>
  const value = container[leafKey]
  if (typeof value !== 'string' || !value) return false
  const next = transform(value)
  if (next === value) return false
  container[leafKey] = next
  return true
}

/**
 * 包装 localStorage 给 Zustand persist 使用：
 * - 写入时只加密 secretPaths 指定的敏感字段（其余字段仍可读，便于调试）；
 * - 读取时自动解密，若发现历史明文凭据则立刻原地加密写回 localStorage。
 */
export function createEncryptedFieldsStorage(secretPaths: ReadonlyArray<readonly string[]>): StateStorage {
  return {
    getItem(name) {
      if (!canUseStorage()) return null
      const raw = localStorage.getItem(name)
      if (!raw) return null
      try {
        const envelope = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number }
        if (!envelope?.state || typeof envelope.state !== 'object') return raw

        // 检查是否存在尚未加密的历史明文凭据；若有则先原地升级为密文落盘
        const encryptedCopy = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number }
        let hadPlaintext = false
        if (encryptedCopy.state) {
          for (const path of secretPaths) {
            if (transformPath(encryptedCopy.state, path, encryptLocalSecret)) {
              hadPlaintext = true
            }
          }
        }
        if (hadPlaintext) {
          try {
            localStorage.setItem(name, JSON.stringify(encryptedCopy))
          } catch {
            // 写入失败不影响本次解密读取
          }
        }

        for (const path of secretPaths) {
          transformPath(envelope.state, path, decryptLocalSecret)
        }
        return JSON.stringify(envelope)
      } catch {
        return raw
      }
    },
    setItem(name, value) {
      if (!canUseStorage()) return
      try {
        const envelope = JSON.parse(value) as { state?: Record<string, unknown>; version?: number }
        if (envelope?.state && typeof envelope.state === 'object') {
          for (const path of secretPaths) {
            transformPath(envelope.state, path, encryptLocalSecret)
          }
          localStorage.setItem(name, JSON.stringify(envelope))
          return
        }
      } catch {
        // 非 JSON 原样存储
      }
      localStorage.setItem(name, value)
    },
    removeItem(name) {
      if (!canUseStorage()) return
      localStorage.removeItem(name)
    },
  }
}

