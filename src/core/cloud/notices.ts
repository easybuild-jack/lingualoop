/**
 * 云模式下读写失败与操作结果的页面提示。
 *
 * 配置数据库后所有读写都直接打到数据库，失败不重发，只在页面顶部提示，不遮挡页面：
 * - 连不上数据库：提示里附带「重新加载」「临时用本地模式」两个出口；
 * - 其他失败（约束拒绝、账号失效等）：只提示原因，本次操作不生效。
 */
import { cloudErrorMessage, isNetworkCloudError } from './client'

export type CloudNoticeTone = 'error' | 'info'

export interface CloudNotice {
  id: number
  tone: CloudNoticeTone
  text: string
  /** 连接类故障：附带「重新加载 / 临时用本地模式」 */
  unavailable: boolean
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
export function reportCloudError(error: unknown, action: string, options: { unavailable?: boolean } = {}): void {
  const unavailable = options.unavailable === true || isNetworkCloudError(error)
  const reason = error instanceof Error ? error.message : cloudErrorMessage(error)
  emit({ tone: 'error', unavailable, text: `${action}失败：${reason}` })
}

export function pushCloudNotice(text: string, tone: CloudNoticeTone = 'info', unavailable = false): void {
  emit({ tone, text, unavailable })
}
