/**
 * zustand persist 的存储适配：设置类字段全设备共用，进度类字段按数据源分开存。
 *
 * - 本地模式：与以前完全相同，整份状态写在原 key 下。
 * - 云模式：进度字段写到 `${name}::cloud::${accountId}`，原 key 里的进度字段保持不动。
 *   这样本地模式的进度不会被云端值覆盖（断开数据库后仍是本地那份），
 *   不同账号在同一台设备上也不会看到彼此缓存的学习位置。
 *   云模式未登录时进度字段既不读也不写。
 */
import type { StateStorage } from 'zustand/middleware'
import { getCloudAccountId, isCloudMode } from './config'

interface PersistEnvelope {
  state?: Record<string, unknown>
  version?: number
}

const SCOPE_SEPARATOR = '::cloud::'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function parseEnvelope(raw: string | null): PersistEnvelope | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PersistEnvelope
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function pick(state: Record<string, unknown>, keys: readonly string[], include: boolean) {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(state)) {
    if (keys.includes(key) === include) result[key] = value
  }
  return result
}

/** 云模式下当前账号的进度 key；本地模式返回 'local'，云模式未登录返回 null */
function scopedKey(name: string): string | 'local' | null {
  if (!isCloudMode()) return 'local'
  const accountId = getCloudAccountId()
  return accountId ? `${name}${SCOPE_SEPARATOR}${accountId}` : null
}

export function createScopedProgressStorage(progressKeys: readonly string[]): StateStorage {
  return {
    getItem(name) {
      if (!canUseStorage()) return null
      const scope = scopedKey(name)
      const baseRaw = localStorage.getItem(name)
      if (scope === 'local') return baseRaw

      const base = parseEnvelope(baseRaw)
      const scoped = scope ? parseEnvelope(localStorage.getItem(scope)) : null
      if (!base && !scoped) return null
      const state = {
        ...pick(base?.state ?? {}, progressKeys, false),
        ...pick(scoped?.state ?? {}, progressKeys, true),
      }
      return JSON.stringify({ state, version: base?.version ?? scoped?.version ?? 0 })
    },
    setItem(name, value) {
      if (!canUseStorage()) return
      const scope = scopedKey(name)
      if (scope === 'local') {
        localStorage.setItem(name, value)
        return
      }
      const next = parseEnvelope(value)
      if (!next?.state) return
      const base = parseEnvelope(localStorage.getItem(name))
      const mergedBase = {
        ...pick(base?.state ?? {}, progressKeys, true),
        ...pick(next.state, progressKeys, false),
      }
      localStorage.setItem(name, JSON.stringify({ state: mergedBase, version: next.version ?? 0 }))
      if (scope) {
        localStorage.setItem(
          scope,
          JSON.stringify({ state: pick(next.state, progressKeys, true), version: next.version ?? 0 })
        )
      }
    },
    removeItem(name) {
      if (!canUseStorage()) return
      const scope = scopedKey(name)
      if (scope === 'local') localStorage.removeItem(name)
      else if (scope) localStorage.removeItem(scope)
    },
  }
}

/** 读取本地模式下 persist 的原始状态（迁移时用，不受当前模式影响） */
export function readLocalPersistedState(name: string): Record<string, unknown> {
  if (!canUseStorage()) return {}
  return parseEnvelope(localStorage.getItem(name))?.state ?? {}
}

/** 退出登录时清掉该账号在本机缓存的进度 */
export function clearScopedProgressCache(accountId: string): void {
  if (!canUseStorage()) return
  const suffix = `${SCOPE_SEPARATOR}${accountId}`
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.endsWith(suffix)) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
}
