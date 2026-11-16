/**
 * zustand persist 的存储适配：设置类字段全设备共用，进度类字段只在本地模式下存本机。
 *
 * - 本地模式：与以前完全相同，整份状态写在原 key 下。
 * - 云模式：进度字段以数据库为准，本机既不读也不写（每次启动从数据库载入，改动直接写数据库）；
 *   原 key 里本地模式的进度保持不动，断开数据库后仍是本地那份。
 */
import type { StateStorage } from 'zustand/middleware'
import { isCloudMode } from './config'

interface PersistEnvelope {
  state?: Record<string, unknown>
  version?: number
}

/** 旧版本按账号缓存进度用的 key 片段（`${name}::cloud::${accountId}`），现在只用于清理 */
const LEGACY_SCOPE_SEPARATOR = '::cloud::'

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

export function createScopedProgressStorage(progressKeys: readonly string[]): StateStorage {
  // 页面载入时的数据源决定本页的读写方式；之后切换模式会整页重载
  const boundModes = new Map<string, boolean>()
  const cloudFor = (name: string) => (boundModes.has(name) ? boundModes.get(name)! : isCloudMode())

  return {
    getItem(name) {
      if (!canUseStorage()) return null
      const cloud = isCloudMode()
      boundModes.set(name, cloud)
      const baseRaw = localStorage.getItem(name)
      if (!cloud) return baseRaw
      const base = parseEnvelope(baseRaw)
      if (!base) return null
      return JSON.stringify({ state: pick(base.state ?? {}, progressKeys, false), version: base.version ?? 0 })
    },
    setItem(name, value) {
      if (!canUseStorage()) return
      if (!cloudFor(name)) {
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
    },
    removeItem(name) {
      if (!canUseStorage()) return
      if (!cloudFor(name)) localStorage.removeItem(name)
    },
  }
}

/** 读取本地模式下 persist 的原始状态（迁移时用，不受当前模式影响） */
export function readLocalPersistedState(name: string): Record<string, unknown> {
  if (!canUseStorage()) return {}
  return parseEnvelope(localStorage.getItem(name))?.state ?? {}
}

/** 清掉旧版本按账号缓存在本机的进度（现在进度只在数据库里） */
export function clearLegacyCloudProgressCache(): void {
  if (!canUseStorage()) return
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.includes(LEGACY_SCOPE_SEPARATOR)) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
}
