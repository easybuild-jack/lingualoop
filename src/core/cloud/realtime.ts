/**
 * 云模式实时刷新中枢：配置了数据库且已登录时，所有业务数据一律以数据库为准。
 *
 * 1. 页面挂载时直接查数据库；
 * 2. 切回窗口 / 标签页（focus / visibilitychange）或收到外部同步变更时，
 *    并行刷新全局云端 store（学习进度、收藏星标、已学词根、翻译句库与进度），
 *    并通知当前活跃的业务页面（词库、生错词、阅读、电台等）实时重新查库。
 * 3. 未配置数据库（本地模式）时全部为空操作，完全走本地存储。
 */
import { isCloudSignedIn } from './config'
import { loadWorkspaceProgress } from './progress'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useTranslateStore } from '@/store/useTranslateStore'

type CloudRefreshListener = () => void

const listeners = new Set<CloudRefreshListener>()
const MIN_REFRESH_INTERVAL_MS = 2000

let lastRefreshAt = 0
let inFlightRefresh: Promise<void> | null = null

/** 订阅云端数据刷新事件（各业务页面在挂载时订阅，收到通知即实时重查数据库） */
export function subscribeCloudRefresh(listener: CloudRefreshListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 仅通知当前订阅的页面重新向数据库查询最新数据 */
export function notifyCloudRefresh(): void {
  if (!isCloudSignedIn()) return
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn('[cloud/realtime] listener failed:', error)
    }
  })
}

/**
 * 统一从数据库实时拉取全站业务状态（节流 2 秒，并发去重）：
 * - 工作台学习位置 / 各书进度 / 循环次数 / 已学词根（app_state）
 * - 单词收藏星标（word_records.is_starred）
 * - 翻译自定义句库与完成进度（translate_books + translate_state）
 * - 通知当前挂载的业务页面重新查询对应数据表（vocab_books / word_records / reading_articles / radio_items）
 */
export function refreshAllCloudData(options?: { force?: boolean }): Promise<void> {
  if (!isCloudSignedIn()) return Promise.resolve()
  const now = Date.now()
  if (!options?.force && now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
    return inFlightRefresh ?? Promise.resolve()
  }
  if (inFlightRefresh) return inFlightRefresh

  lastRefreshAt = now
  notifyCloudRefresh()

  inFlightRefresh = Promise.allSettled([
    loadWorkspaceProgress(),
    useWorkspaceStore.getState().syncStarredWordIds(),
    useTranslateStore.getState().refreshCloudBooks(),
  ])
    .then(() => undefined)
    .finally(() => {
      inFlightRefresh = null
    })

  return inFlightRefresh
}
