/**
 * 云模式下的「进度类」数据同步。
 *
 * 大部分业务数据（词库、错词本、单元进度）走 repository 直读直写，
 * 但学习位置、翻译进度这类字段是 zustand persist 在 localStorage 里的（云模式下按账号分 key 缓存）。
 * 这里做三件事：
 *   1. 启动时用云端值覆盖本地 store（hydrate）。云端还没有记录时保持本地不动，
 *      绝不用空行把本地进度清掉；
 *   2. 之后本地每次变更做防抖推送；书内单元位置只推送发生变化的 (书, 模式)；
 *   3. 页面隐藏 / 卸载前立即推送待发送的变更，推送失败稍后重试。
 *
 * 设置类字段（皮肤/音量/快捷键/AI Key）不在此列，永远只在本地。
 */
import { useWorkspaceStore, DEFAULT_LOOP_COUNTS } from '@/store/useWorkspaceStore'
import type { BookModeUnitRecord } from '@/store/useWorkspaceStore'
import { useTranslateStore } from '@/store/useTranslateStore'
import { getRepositories } from '@/db/repository'
import type { BookModeEntry, ProgressState, TranslateProgressState } from '@/db/repository'
import type { PracticeMode, TranslationBook } from '@/types'
import { DEFAULT_TRANSLATION_BOOKS } from '@/resources/translateData'
import { isCloudSignedIn } from './config'

const PUSH_DEBOUNCE_MS = 1200
const RETRY_DELAY_MS = 5000
const PRACTICE_MODES: PracticeMode[] = ['learn', 'dictation', 'phonetic']
const LOOP_COUNT_VALUES = [1, 2, 3, 5] as const

type PushTask = () => Promise<void>

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingTasks = new Map<string, PushTask>()
let applyingRemote = false

function runTask(key: string, task: PushTask) {
  pendingTasks.delete(key)
  void task().catch((error) => {
    console.warn(`[cloud-sync] ${key} push failed, will retry:`, error)
    if (isCloudSignedIn()) schedule(key, task, RETRY_DELAY_MS)
  })
}

function schedule(key: string, task: PushTask, delay = PUSH_DEBOUNCE_MS) {
  const existing = timers.get(key)
  if (existing) clearTimeout(existing)
  pendingTasks.set(key, task)
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      runTask(key, task)
    }, delay)
  )
}

/** 立即发出所有等待中的推送（页面隐藏、卸载、停止同步时调用） */
export function flushCloudSync(): void {
  for (const [key, task] of Array.from(pendingTasks.entries())) {
    const timer = timers.get(key)
    if (timer) clearTimeout(timer)
    timers.delete(key)
    runTask(key, task)
  }
}

function withRemoteApplied(fn: () => void | Promise<void>): Promise<void> {
  applyingRemote = true
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      setTimeout(() => {
        applyingRemote = false
      }, 0)
    })
}

/* -------------------------------------------------------------------------- */
/* 学习位置 / 累计进度                                                         */
/* -------------------------------------------------------------------------- */

function entryKey(bookId: string, mode: PracticeMode): string {
  return `${bookId}\u0000${mode}`
}

/** 把 bookModeProgress 拍平成 `(书, 模式) → 单元序号`，只保留合法的非负整数 */
function flattenBookModes(progress: Record<string, Partial<Record<PracticeMode, unknown>>>): Map<string, number> {
  const result = new Map<string, number>()
  for (const [bookId, record] of Object.entries(progress ?? {})) {
    if (!bookId || !record || typeof record !== 'object') continue
    for (const mode of PRACTICE_MODES) {
      const value = record[mode]
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        result.set(entryKey(bookId, mode), value)
      }
    }
  }
  return result
}

function sanitizeLoopCounts(raw: Record<string, unknown> | undefined): Record<PracticeMode, 1 | 2 | 3 | 5> {
  const result = { ...DEFAULT_LOOP_COUNTS }
  for (const mode of PRACTICE_MODES) {
    const value = raw?.[mode]
    if (LOOP_COUNT_VALUES.includes(value as 1 | 2 | 3 | 5)) result[mode] = value as 1 | 2 | 3 | 5
  }
  return result
}

function readWorkspaceProgress(): ProgressState {
  const state = useWorkspaceStore.getState()
  return {
    currentBookId: state.currentBookId,
    currentUnitIndex: state.currentUnitIndex ?? 0,
    bookModeProgress: state.bookModeProgress ?? {},
    loopCounts: state.loopCounts ?? {},
    learnedRootIds: state.learnedRootIds ?? [],
    updatedAt: Date.now(),
  }
}

/** 已确认写入云端的 (书, 模式) 位置；推送时只发与之不同的条目 */
let pushedBookModes = new Map<string, number>()

/**
 * 用云端进度覆盖本地 store。
 * - 云端完全没有记录（新账号）：保持本地不动；
 * - 云端有 app_state：学习位置、循环次数、已学词根以云端为准；
 * - 书内位置：云端已有的 (书, 模式) 以云端为准，本机独有的保留并随后补推。
 */
export async function hydrateWorkspaceProgress(): Promise<void> {
  const remote = await getRepositories().appState.get()
  if (!remote) {
    pushedBookModes = new Map()
    return
  }

  const state = useWorkspaceStore.getState()
  const remoteModes = flattenBookModes(remote.bookModeProgress)
  const merged: Record<string, BookModeUnitRecord> = {}
  const assign = (modes: Map<string, number>) => {
    for (const [key, value] of modes) {
      const [bookId, mode] = key.split('\u0000') as [string, PracticeMode]
      merged[bookId] = { ...(merged[bookId] ?? { learn: 0, dictation: 0, phonetic: 0 }), [mode]: value }
    }
  }
  assign(flattenBookModes(state.bookModeProgress))
  assign(remoteModes)

  const hasAppState = remote.updatedAt > 0
  pushedBookModes = remoteModes
  await withRemoteApplied(() =>
    state.applyCloudProgress({
      currentBookId: (hasAppState && remote.currentBookId) || state.currentBookId,
      currentUnitIndex: hasAppState ? remote.currentUnitIndex : state.currentUnitIndex,
      bookModeProgress: merged,
      loopCounts: hasAppState ? sanitizeLoopCounts(remote.loopCounts) : state.loopCounts,
      learnedRootIds: hasAppState
        ? remote.learnedRootIds.filter((id): id is string => typeof id === 'string')
        : state.learnedRootIds,
    })
  )
}

function changedBookModes(): BookModeEntry[] {
  const now = Date.now()
  const changes: BookModeEntry[] = []
  for (const [key, unitIndex] of flattenBookModes(useWorkspaceStore.getState().bookModeProgress)) {
    if (pushedBookModes.get(key) === unitIndex) continue
    const [bookId, mode] = key.split('\u0000') as [string, PracticeMode]
    changes.push({ bookId, mode, unitIndex, updatedAt: now })
  }
  return changes
}

async function pushWorkspaceProgress(): Promise<void> {
  const changes = changedBookModes()
  await getRepositories().appState.put(readWorkspaceProgress(), changes)
  for (const change of changes) pushedBookModes.set(entryKey(change.bookId, change.mode), change.unitIndex)
}

function workspaceSignature(): string {
  return JSON.stringify({ ...readWorkspaceProgress(), updatedAt: 0 })
}

export function startWorkspaceProgressSync(): () => void {
  let lastSnapshot = workspaceSignature()
  // 本机独有、云端还没有的书内位置，在水合后立刻补推一次
  if (changedBookModes().length > 0) schedule('app_state', pushWorkspaceProgress)

  return useWorkspaceStore.subscribe(() => {
    if (applyingRemote || !isCloudSignedIn()) return
    const serialized = workspaceSignature()
    if (serialized === lastSnapshot) return
    lastSnapshot = serialized
    schedule('app_state', pushWorkspaceProgress)
  })
}

/* -------------------------------------------------------------------------- */
/* 翻译模块                                                                    */
/* -------------------------------------------------------------------------- */

function readCustomTranslateBooks(): TranslationBook[] {
  return useTranslateStore.getState().books.filter((book) => book.isCustom)
}

/**
 * 等 localStorage 里的翻译题库水合完成再决定从云端拉取。
 * 否则可能先读到默认值、随后又被 persist 的旧数据覆盖，把云端题库撞掉。
 */
export async function ensureTranslateHydrated(): Promise<void> {
  if (typeof window === 'undefined') return
  if (useTranslateStore.persist?.hasHydrated?.()) return
  await new Promise<void>((resolve) => {
    const unsubscribe = useTranslateStore.persist.onFinishHydration(() => {
      unsubscribe()
      resolve()
    })
  })
}

function translateStateSnapshot(): TranslateProgressState {
  const state = useTranslateStore.getState()
  return {
    currentBookId: state.currentBookId,
    completedSentenceIds: state.completedSentenceIds ?? {},
    updatedAt: Date.now(),
  }
}

/**
 * 用云端自定义题库 + 完成记录覆盖本地（内置预置题库始终以代码为准）。
 * 自定义题库以云端为准：本机缓存里有、云端没有的视为已被删除，不再「复活」上传；
 * 完成记录只增不减，与本机缓存取并集。
 */
export async function hydrateTranslateProgress(): Promise<void> {
  await ensureTranslateHydrated()
  const repositories = getRepositories()
  const [books, state] = await Promise.all([
    repositories.translate.getBooks(),
    repositories.translate.getState(),
  ])

  await withRemoteApplied(() => {
    const current = useTranslateStore.getState()
    const nextBooks = [...DEFAULT_TRANSLATION_BOOKS, ...books.map((book) => ({ ...book, isCustom: true }))]
    const preferredBookId =
      state?.currentBookId && nextBooks.some((book) => book.id === state.currentBookId)
        ? state.currentBookId
        : current.currentBookId
    const bookChanged = preferredBookId !== current.currentBookId
    useTranslateStore.setState({
      books: nextBooks,
      currentBookId: nextBooks.some((b) => b.id === preferredBookId)
        ? preferredBookId
        : nextBooks[0]?.id ?? current.currentBookId,
      completedSentenceIds: {
        ...(current.completedSentenceIds ?? {}),
        ...((state?.completedSentenceIds ?? {}) as Record<string, boolean>),
      },
      ...(bookChanged ? { currentSentenceIndex: 0, isSentenceCompleted: false } : {}),
    })
  })
}

function bookSignatures(books: TranslationBook[]): Map<string, string> {
  return new Map(books.map((book) => [book.id, JSON.stringify(book)]))
}

export function startTranslateSync(): () => void {
  let lastBooks = bookSignatures(readCustomTranslateBooks())
  let lastState = JSON.stringify({ ...translateStateSnapshot(), updatedAt: 0 })
  // 防抖期间累积的变更：多次操作合并成一次推送时，新增/修改与删除都不会丢
  const pendingUpserts = new Set<string>()
  const pendingDeletes = new Set<string>()

  const pushBooks: PushTask = async () => {
    const repositories = getRepositories()
    const byId = new Map(readCustomTranslateBooks().map((book) => [book.id, book]))
    for (const id of Array.from(pendingUpserts)) {
      const book = byId.get(id)
      if (book) await repositories.translate.putBook(book)
      pendingUpserts.delete(id)
    }
    for (const id of Array.from(pendingDeletes)) {
      await repositories.translate.deleteBook(id)
      pendingDeletes.delete(id)
    }
  }

  // 本机缓存里有、云端还没有的完成记录，水合后补推一次（服务端取并集）
  schedule('translate_state', () => getRepositories().translate.putState(translateStateSnapshot()))

  return useTranslateStore.subscribe(() => {
    if (applyingRemote || !isCloudSignedIn()) return

    const nextBooks = bookSignatures(readCustomTranslateBooks())
    let booksChanged = false
    for (const [id, signature] of nextBooks) {
      if (lastBooks.get(id) !== signature) {
        pendingUpserts.add(id)
        pendingDeletes.delete(id)
        booksChanged = true
      }
    }
    for (const id of lastBooks.keys()) {
      if (!nextBooks.has(id)) {
        pendingDeletes.add(id)
        pendingUpserts.delete(id)
        booksChanged = true
      }
    }
    lastBooks = nextBooks
    if (booksChanged) schedule('translate_books', pushBooks)

    const stateSignature = JSON.stringify({ ...translateStateSnapshot(), updatedAt: 0 })
    if (stateSignature !== lastState) {
      lastState = stateSignature
      schedule('translate_state', () => getRepositories().translate.putState(translateStateSnapshot()))
    }
  })
}

/** 页面隐藏或卸载前把待推送的变更立即发出去，返回取消监听函数 */
export function startFlushOnPageHide(): () => void {
  if (typeof window === 'undefined') return () => {}
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushCloudSync()
  }
  window.addEventListener('pagehide', flushCloudSync)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('pagehide', flushCloudSync)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
