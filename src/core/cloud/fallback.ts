/**
 * 数据库写入失败或无法访问时自动切到本地模式。
 *
 * 切换只是把读写目标换成本机（与「临时用本地模式」相同），不回传、不重试，也不覆盖或清空任何数据：
 * 本机那份是上次本地模式留下的数据（可能比数据库旧，甚至为空），用户在此基础上继续学习，
 * 数据库恢复后到设置里手动「同步资料」「同步进度」按加法合并。
 * 切换后 CloudSyncGate 会整页重载，提示文字先存起来，重载后再显示。
 */
import { isCloudMode, isCloudSignedIn, setOfflineFallback } from './config'

const PENDING_NOTICE_KEY = 'lingualoop_cloud_fallback_notice'

export const FALLBACK_NOTICE =
  '数据库暂时无法访问，已切换到本地模式，数据库恢复后请到设置里手动同步资料和进度。'

/** 只在已登录的云模式下切换：未登录时的失败（例如跳转登录页之前页面发出的请求）不算数据库不可用 */
export function switchToLocalMode(reason?: string): boolean {
  if (typeof window === 'undefined' || !isCloudMode() || !isCloudSignedIn()) return false
  try {
    localStorage.setItem(PENDING_NOTICE_KEY, reason ? `${FALLBACK_NOTICE}（${reason}）` : FALLBACK_NOTICE)
  } catch {
    // 提示存不下不影响切换
  }
  setOfflineFallback(true)
  return true
}

/** 取出并清除切换时留下的提示 */
export function takePendingFallbackNotice(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const text = localStorage.getItem(PENDING_NOTICE_KEY)
    if (text !== null) localStorage.removeItem(PENDING_NOTICE_KEY)
    return text
  } catch {
    return null
  }
}
