/**
 * 云数据库（Supabase）配置与登录会话。
 *
 * 「有没有配置数据库」本身就是模式开关——
 *   已配置 → 需要登录系统账号（accounts 表），业务数据按 account_id 读写云端，跨设备共享；
 *   未配置 → 一切留在浏览器（IndexedDB + localStorage），不需要登录，功能与以前完全一致。
 *
 * 配置本身（URL / anon key，其中 anon key 加密存储）与登录会话（账号 id）只存在本机 localStorage，绝不入云。
 */
import { decryptLocalSecret, encryptLocalSecret, isEncryptedLocalSecret } from '@/lib/localSecret'

export interface CloudConfig {
  /** Supabase 项目地址，形如 https://xxxx.supabase.co */
  url: string
  /** Supabase anon (publishable) key */
  anonKey: string
  /** 首次配置完成的时间戳，仅用于展示 */
  configuredAt: number
}

const CONFIG_KEY = 'lingualoop_cloud_config'
/** 用户在设置里手动关闭云端存储、改用本地模式的标记（配置保留，可手动重新开启） */
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
    const decryptedKey = decryptLocalSecret(parsed.anonKey).trim()
    if (!decryptedKey) return null
    // 兼容历史明文 anonKey：首次读取时原地升级为密文存储
    if (!isEncryptedLocalSecret(parsed.anonKey)) {
      try {
        localStorage.setItem(
          CONFIG_KEY,
          JSON.stringify({
            ...parsed,
            url: normalizeSupabaseUrl(parsed.url),
            anonKey: encryptLocalSecret(decryptedKey),
          })
        )
      } catch {
        // 写入失败不影响本次读取
      }
    }
    return {
      url: normalizeSupabaseUrl(parsed.url),
      anonKey: decryptedKey,
      configuredAt: parsed.configuredAt ?? 0,
    }
  } catch {
    return null
  }
}

export function saveCloudConfig(url: string, anonKey: string): CloudConfig {
  const cleanKey = anonKey.trim()
  const config: CloudConfig = {
    url: normalizeSupabaseUrl(url),
    anonKey: cleanKey,
    configuredAt: Date.now(),
  }
  if (canUseStorage()) {
    const stored: CloudConfig = {
      ...config,
      anonKey: encryptLocalSecret(cleanKey),
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(stored))
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
  localStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(CLOUD_CONFIG_CHANGED_EVENT))
}

/* -------------------------------------------------------------------------- */
/* 登录会话                                                                    */
/* -------------------------------------------------------------------------- */

const SESSION_KEY = 'lingualoop_cloud_session'

export interface CloudSession {
  accountId: string
  username: string
  displayName: string | null
  /** 登录时的项目地址；换了数据库后旧会话自动失效 */
  projectUrl: string
  signedInAt: number
}

/** 当前数据库下的登录会话；未配置数据库、未登录或会话属于别的数据库时返回 null */
export function getCloudSession(): CloudSession | null {
  if (!canUseStorage()) return null
  const config = getCloudConfig()
  if (!config) return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CloudSession>
    if (!parsed?.accountId || !parsed.username || parsed.projectUrl !== config.url) return null
    return {
      accountId: parsed.accountId,
      username: parsed.username,
      displayName: parsed.displayName ?? null,
      projectUrl: parsed.projectUrl,
      signedInAt: parsed.signedInAt ?? 0,
    }
  } catch {
    return null
  }
}

export function getCloudAccountId(): string | null {
  return getCloudSession()?.accountId ?? null
}

export function saveCloudSession(session: Omit<CloudSession, 'projectUrl' | 'signedInAt'>): void {
  if (!canUseStorage()) return
  const config = getCloudConfig()
  if (!config) return
  const value: CloudSession = { ...session, projectUrl: config.url, signedInAt: Date.now() }
  localStorage.setItem(SESSION_KEY, JSON.stringify(value))
  window.dispatchEvent(new Event(CLOUD_CONFIG_CHANGED_EVENT))
}

export function clearCloudSession(): void {
  if (!canUseStorage()) return
  localStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(CLOUD_CONFIG_CHANGED_EVENT))
}

/** 云模式且已登录：只有这时才读写云端数据 */
export function isCloudSignedIn(): boolean {
  return isCloudMode() && getCloudSession() !== null
}

/**
 * 本页面使用的数据源签名（模式 + 数据库 + 账号）。
 * 任何一项变化都必须整页重载，避免内存里是 A 份数据、写入却落到 B 份。
 */
export function cloudScopeSignature(): string {
  if (!isCloudMode()) return 'local'
  const config = getCloudConfig()
  return `cloud:${config?.url ?? ''}:${getCloudAccountId() ?? 'anonymous'}`
}

/** 是否处于「已配置数据库且已开启云端存储」的云模式 */
export function isCloudMode(): boolean {
  if (!getCloudConfig()) return false
  if (!canUseStorage()) return false
  return localStorage.getItem(OFFLINE_FALLBACK_KEY) !== '1'
}

/** 是否已配置数据库（无论当前是否手动关闭了云端存储） */
export function isCloudConfigured(): boolean {
  return getCloudConfig() !== null
}

/** 是否手动关闭了云端存储（使用本地模式） */
export function isOfflineFallback(): boolean {
  if (!canUseStorage()) return false
  return localStorage.getItem(OFFLINE_FALLBACK_KEY) === '1'
}

/** 手动关闭 / 开启云端存储（enabled=true 表示关闭云端存储、改用本地模式；配置保留，可随时重新开启） */
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
    if (
      !event.key ||
      event.key === CONFIG_KEY ||
      event.key === OFFLINE_FALLBACK_KEY ||
      event.key === SESSION_KEY
    ) {
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
