/**
 * 云模式下读写失败与操作结果的页面提示。
 *
 * 配置数据库且开启云端存储后，所有读写都直接打到数据库，失败不重发、不自动切到本地模式，
 * 只在页面顶部提示原因。
 */
import { cloudErrorMessage } from './client'

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

/** 数据库读写失败：action 是给用户看的操作名，如「保存学习进度」 */
export function reportCloudError(error: unknown, action: string): void {
  const reason = error instanceof Error ? error.message : cloudErrorMessage(error)
  const text = `${action}失败：${reason}`
  emit({ tone: 'error', text })
}

export function pushCloudNotice(text: string, tone: CloudNoticeTone = 'info'): void {
  emit({ tone, text })
}
