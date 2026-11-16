import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCloudConfig, type CloudConfig } from './config'

/**
 * Supabase 客户端（懒加载单例）。
 *
 * anon key 走的是 PostgREST 的 REST 接口，不需要 realtime / auth 会话，
 * 因此关掉这几项以省掉无谓的心跳与本地存储写入。
 */

let cachedClient: SupabaseClient | null = null
let cachedSignature = ''

function signatureOf(config: CloudConfig): string {
  return `${config.url}::${config.anonKey}`
}

export function createCloudClient(config: CloudConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 0 } },
    global: { headers: { 'x-lingualoop-client': 'web' } },
  })
}

/** 当前配置对应的客户端；未配置返回 null */
export function getCloudClient(): SupabaseClient | null {
  const config = getCloudConfig()
  if (!config) {
    cachedClient = null
    cachedSignature = ''
    return null
  }
  const signature = signatureOf(config)
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createCloudClient(config)
    cachedSignature = signature
  }
  return cachedClient
}

/** 与 supabase/schema.sql 中 schema_meta.schema_version 对齐 */
export const EXPECTED_SCHEMA_VERSION = 2

export type CloudProbeStatus = 'ok' | 'network' | 'auth' | 'schema' | 'unknown'

export interface CloudProbeResult {
  ok: boolean
  status: CloudProbeStatus
  message: string
}

function describeError(error: unknown): { status: CloudProbeStatus; message: string } {
  const raw = error as { message?: string; code?: string; status?: number; details?: string } | null
  const message = raw?.message || String(error)
  const code = raw?.code || ''
  const status = raw?.status || 0

  if (/failed to fetch|networkerror|load failed|enotfound|econnrefused|timeout/i.test(message)) {
    return { status: 'network', message: '无法连接到数据库，请检查网络或项目地址是否正确。' }
  }
  if (status === 401 || status === 403 || code === 'PGRST301' || /jwt|apikey|unauthorized/i.test(message)) {
    return { status: 'auth', message: 'anon key 无效或已被轮换，请重新复制项目里的 anon public key。' }
  }
  if (code === 'P0001' && /account_id is required/i.test(message)) {
    return { status: 'unknown', message: '尚未登录账号，请先登录。' }
  }
  if (code === '23503' && /account/i.test(message)) {
    return { status: 'unknown', message: '当前登录的账号在数据库中已不存在，请重新登录。' }
  }
  if (code === '23514' && /belongs to/i.test(message)) {
    return { status: 'unknown', message: '这条数据已属于其他词库或账号，已拒绝写入，请刷新后重试。' }
  }
  if (code === '42P01' || code === 'PGRST202' || /does not exist|relation .* not found|schema cache/i.test(message)) {
    return { status: 'schema', message: '项目里还没有建表，请先在 SQL Editor 执行 supabase/schema.sql。' }
  }
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return { status: 'schema', message: '数据表权限未开启，请重新执行 supabase/schema.sql 里的 RLS 授权部分。' }
  }
  return { status: 'unknown', message }
}

/** 连通性 + 建表 + 权限一次性体检 */
export async function probeCloudConnection(config?: CloudConfig): Promise<CloudProbeResult> {
  const target = config ?? getCloudConfig()
  if (!target) {
    return { ok: false, status: 'unknown', message: '尚未配置数据库。' }
  }
  try {
    const client = config ? createCloudClient(target) : getCloudClient()
    if (!client) {
      return { ok: false, status: 'unknown', message: '尚未配置数据库。' }
    }
    const { data, error } = await client
      .from('schema_meta')
      .select('value')
      .eq('key', 'schema_version')
      .maybeSingle()
    if (error) {
      const { status, message } = describeError(error)
      return { ok: false, status, message }
    }
    const version = Number((data as { value?: string } | null)?.value ?? 0)
    if (!Number.isFinite(version) || version < EXPECTED_SCHEMA_VERSION) {
      return {
        ok: false,
        status: 'schema',
        message: `数据库结构版本过旧（当前 ${version || '未知'}，需要 ${EXPECTED_SCHEMA_VERSION}），请在 SQL Editor 重新执行最新的 supabase/schema.sql。`,
      }
    }
    return { ok: true, status: 'ok', message: '连接正常，数据表已就绪。' }
  } catch (error) {
    const { status, message } = describeError(error)
    return { ok: false, status, message }
  }
}

/** 把 Supabase 抛出的错误统一成可直接展示的中文文案 */
export function cloudErrorMessage(error: unknown, fallback = '数据库操作失败'): string {
  if (!error) return fallback
  const { message } = describeError(error)
  return message || fallback
}

/** 云端请求失败：message 为中文文案，code 保留原始错误码供调用方分支处理 */
export class CloudRequestError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'CloudRequestError'
    this.code = code
  }
}

/** Postgres / PostgREST 错误码（如 23505、23514、P0001），取不到时返回空串 */
export function cloudErrorCode(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? ''
  if (!code && !(error instanceof CloudRequestError) && describeError(error).status === 'network') {
    return NETWORK_ERROR_CODE
  }
  return code
}

/** 连不上数据库时 CloudRequestError 使用的错误码（PostgREST 自身没有这类错误码） */
export const NETWORK_ERROR_CODE = 'NETWORK'

/** 是否为「网络不可达」类错误——这种要提示用户可切到本地模式 */
export function isNetworkCloudError(error: unknown): boolean {
  if (error instanceof CloudRequestError) return error.code === NETWORK_ERROR_CODE
  return describeError(error).status === 'network'
}
