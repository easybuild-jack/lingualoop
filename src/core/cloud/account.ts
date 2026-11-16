/**
 * 系统账号：注册 / 登录 / 修改密码。
 *
 * 账号存在数据库自己的 accounts 表里（不依赖 Supabase Auth，也不发邮件验证码），
 * 通过 schema.sql 中的 register_account / login_account / change_account_password 三个函数完成。
 * 登录成功后只把账号 id 存在本机（见 config.ts 的会话），之后每次云端读写都显式带上它。
 */
import { getCloudClient, cloudErrorCode, cloudErrorMessage } from './client'
import { clearCloudSession, getCloudAccountId, saveCloudSession } from './config'
import { clearLegacyCloudProgressCache } from './scopedStorage'

export const USERNAME_MAX_LENGTH = 32
export const PASSWORD_MIN_LENGTH = 6

interface AccountPayload {
  account_id: string
  username: string
  display_name: string | null
}

export interface AccountProfile {
  accountId: string
  username: string
  displayName: string | null
}

function requireClient() {
  const client = getCloudClient()
  if (!client) throw new Error('尚未配置数据库，无法登录。')
  return client
}

function toProfile(payload: AccountPayload): AccountProfile {
  return {
    accountId: payload.account_id,
    username: payload.username,
    displayName: payload.display_name ?? null,
  }
}

function accountErrorMessage(error: unknown, fallback: string): string {
  const code = cloudErrorCode(error)
  const raw = (error as { message?: string } | null)?.message ?? ''
  if (code === '23505') return '账号名已被占用，请换一个。'
  if (code === '22023') {
    if (/username/i.test(raw)) return `账号名需为 1–${USERNAME_MAX_LENGTH} 个字符。`
    if (/password/i.test(raw)) return `密码至少 ${PASSWORD_MIN_LENGTH} 位。`
  }
  return cloudErrorMessage(error, fallback)
}

/** 本地先校验一遍，与数据库函数的规则保持一致 */
export function validateCredentials(username: string, password: string): string | null {
  const name = username.trim()
  if (!name) return '请输入账号名。'
  if (name.length > USERNAME_MAX_LENGTH) return `账号名最多 ${USERNAME_MAX_LENGTH} 个字符。`
  if (password.length < PASSWORD_MIN_LENGTH) return `密码至少 ${PASSWORD_MIN_LENGTH} 位。`
  return null
}

export async function registerAccount(username: string, password: string): Promise<AccountProfile> {
  const invalid = validateCredentials(username, password)
  if (invalid) throw new Error(invalid)
  const { data, error } = await requireClient().rpc('register_account', {
    p_username: username.trim(),
    p_password: password,
  })
  if (error) throw new Error(accountErrorMessage(error, '注册失败，请稍后重试。'))
  const profile = toProfile(data as AccountPayload)
  saveCloudSession(profile)
  return profile
}

export async function loginAccount(username: string, password: string): Promise<AccountProfile> {
  if (!username.trim() || !password) throw new Error('请输入账号名和密码。')
  const { data, error } = await requireClient().rpc('login_account', {
    p_username: username.trim(),
    p_password: password,
  })
  if (error) throw new Error(accountErrorMessage(error, '登录失败，请稍后重试。'))
  if (!data) throw new Error('账号名或密码错误。')
  const profile = toProfile(data as AccountPayload)
  saveCloudSession(profile)
  return profile
}

export async function changeAccountPassword(oldPassword: string, newPassword: string): Promise<void> {
  const accountId = getCloudAccountId()
  if (!accountId) throw new Error('请先登录。')
  if (newPassword.length < PASSWORD_MIN_LENGTH) throw new Error(`新密码至少 ${PASSWORD_MIN_LENGTH} 位。`)
  const { data, error } = await requireClient().rpc('change_account_password', {
    p_account_id: accountId,
    p_old_password: oldPassword,
    p_new_password: newPassword,
  })
  if (error) throw new Error(accountErrorMessage(error, '修改密码失败，请稍后重试。'))
  if (data !== true) throw new Error('原密码不正确。')
}

/** 本机保存的账号在当前数据库里是否仍然存在（账号被删或换了数据库时返回 false） */
export async function verifyCurrentAccount(): Promise<boolean> {
  const accountId = getCloudAccountId()
  if (!accountId) return false
  const { data, error } = await requireClient().from('accounts').select('id').eq('id', accountId).maybeSingle()
  if (error) throw new Error(cloudErrorMessage(error, '校验账号失败'))
  return Boolean(data)
}

export function logoutAccount(): void {
  clearLegacyCloudProgressCache()
  clearCloudSession()
}
