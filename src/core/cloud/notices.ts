/**
 * 云模式下读写失败与操作结果的页面提示。
 *
 * 配置数据库后所有读写都直接打到数据库，失败不重发：
 * - 写入失败、或连不上数据库（读写都算）：自动切到本地模式（见 fallback.ts），重载后提示用户；
 * - 其他读取失败：只在页面顶部提示原因。
 */
import { cloudErrorMessage, isNetworkCloudError } from './client'
import { switchToLocalMode } from './fallback'

export type CloudNoticeTone = 'error' | 'info'

export interface CloudNotice {
  id: number
  tone: CloudNoticeTone
  text: string
}

type Listener = (notice: CloudNotice) => void

const listeners = new Set<Listener>()
let nextId = 1

function emit(notice: Omit<CloudNotice, 'id'>) {
  const full = { ...notice, id: nextId++ }
  listeners.forEach((listener) => listener(full))
}

export function subscribeCloudNotices(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 数据库读写失败：action 是给用户看的操作名，如「保存学习进度」。
 * options.read 为真表示只是读取失败，此时只有连不上数据库才切到本地模式。
 */
export function reportCloudError(error: unknown, action: string, options: { read?: boolean } = {}): void {
  const reason = error instanceof Error ? error.message : cloudErrorMessage(error)
  const text = `${action}失败：${reason}`
  if ((!options.read || isNetworkCloudError(error)) && switchToLocalMode(text)) return
  emit({ tone: 'error', text })
}

export function pushCloudNotice(text: string, tone: CloudNoticeTone = 'info'): void {
  emit({ tone, text })
}
