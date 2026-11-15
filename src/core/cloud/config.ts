/**
 * 云数据库（Supabase）配置。
 *
 * 设计前提：不做账号体系。「有没有配置数据库」本身就是模式开关——
 *   已配置 → 业务数据直接读写云端，跨设备共享；
 *   未配置 → 一切留在浏览器（IndexedDB + localStorage），功能与以前完全一致。
 *
 * 配置本身（URL / anon key）永远只存在本机 localStorage，不入库、不分发。
 */

export interface CloudConfig {
  /** Supabase 项目地址，形如 https://xxxx.supabase.co */
  url: string
  /** Supabase anon (publishable) key */
  anonKey: string
  /** 首次配置完成的时间戳，仅用于展示 */
  configuredAt: number
}

const CONFIG_KEY = 'lingualoop_cloud_config'
/** 云端连不上时用户选择「临时切到本地模式」的标记 */
const OFFLINE_FALLBACK_KEY = 'lingualoop_cloud_offline'
/** 配置或模式发生变化时派发，同页面内监听用 */
export const CLOUD_CONFIG_CHANGED_EVENT = 'lingualoop_cloud_config_changed'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

/** 归一化用户输入的 URL，去掉末尾斜杠与误贴的 /rest/v1 */
export function normalizeSupabaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
}

export function getCloudConfig(): CloudConfig | null {
  if (!canUseStorage()) return null
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CloudConfig>
    if (!parsed?.url || !parsed?.anonKey) return null
    return {
      url: normalizeSupabaseUrl(parsed.url),
      anonKey: parsed.anonKey.trim(),
      configuredAt: parsed.configuredAt ?? 0,
    }
  } catch {
    return null
  }
}

export function saveCloudConfig(url: string, anonKey: string): CloudConfig {
  const config: CloudConfig = {
    url: normalizeSupabaseUrl(url),
    anonKey: anonKey.trim(),
    configuredAt: Date.now(),
  }
  if (canUseStorage()) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    // 重新配置意味着「回到云端」，之前选择的本地降级失效
    localStorage.removeItem(OFFLINE_FALLBACK_KEY)
    window.dispatchEvent(new Event(CLOUD_CONFIG_CHANGED_EVENT))
  }
  return config
}

export function clearCloudConfig(): void {
  if (!canUseStorage()) return
  localStorage.removeItem(CONFIG_KEY)
  localStorage.removeItem(OFFLINE_FALLBACK_KEY)
  window.dispatchEvent(new Event(CLOUD_CONFIG_CHANGED_EVENT))
}

/** 是否处于「配置了数据库、且没有降级到本地」的云模式 */
export function isCloudMode(): boolean {
  if (!getCloudConfig()) return false
  if (!canUseStorage()) return false
  return localStorage.getItem(OFFLINE_FALLBACK_KEY) !== '1'
}

/** 配置了数据库但用户因为断网选择了本地模式 */
export function isCloudConfigured(): boolean {
  return getCloudConfig() !== null
}

export function isOfflineFallback(): boolean {
  if (!canUseStorage()) return false
  return localStorage.getItem(OFFLINE_FALLBACK_KEY) === '1'
}

/** 云端不可用时，由用户主动选择切到本地模式（配置保留，下次联网可恢复） */
export function setOfflineFallback(enabled: boolean): void {
  if (!canUseStorage()) return
  if (enabled) {
    localStorage.setItem(OFFLINE_FALLBACK_KEY, '1')
  } else {
    localStorage.removeItem(OFFLINE_FALLBACK_KEY)
  }
  window.dispatchEvent(new Event(CLOUD_CONFIG_CHANGED_EVENT))
}

/** 监听模式切换（配置变更、降级开关），返回取消订阅函数 */
export function subscribeCloudMode(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === CONFIG_KEY || event.key === OFFLINE_FALLBACK_KEY) {
      listener()
    }
  }
  window.addEventListener(CLOUD_CONFIG_CHANGED_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CLOUD_CONFIG_CHANGED_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}
