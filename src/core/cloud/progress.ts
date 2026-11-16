/**
 * 云模式下 store 里「进度类」字段与数据库的读写。
 *
 * 单词记录、单元进度、词库等由 db/index.ts 直接读写数据库；学习位置、循环次数、已学词根、
 * 书内单元位置和翻译进度是 zustand store 的字段，这里负责：
 *   1. 启动时从数据库载入（数据库为准；没有记录就用默认值，不写空行）；
 *   2. 之后每次变更立即写数据库。写入按顺序逐个执行，不防抖、不排队、失败不重发：
 *      失败时只在页面上提示；之后的变更照常写入（写的是当时与数据库不同的全部字段）。
 *
 * 设置类字段（皮肤/音量/快捷键/AI Key）不在此列，永远只在本地。
 */
import { useWorkspaceStore, DEFAULT_LOOP_COUNTS } from '@/store/useWorkspaceStore'
import type { BookModeUnitRecord } from '@/store/useWorkspaceStore'
import { useTranslateStore } from '@/store/useTranslateStore'
import { getRepositories } from '@/db/repository'
import type { BookModeEntry } from '@/db/repository'
import type { PracticeMode } from '@/types'
import { DEFAULT_TRANSLATION_BOOKS } from '@/resources/translateData'
import { getCloudAccountId } from './config'
import { reportCloudError } from './notices'

const PRACTICE_MODES: PracticeMode[] = ['learn', 'dictation', 'phonetic']
const LOOP_COUNT_VALUES = [1, 2, 3, 5] as const

/* -------------------------------------------------------------------------- */
/* 顺序写入                                                                    */
/* -------------------------------------------------------------------------- */

const writeChains = new Map<string, Promise<void>>()

/**
 * 同一类数据的写入按发生顺序逐个执行，避免旧值后到覆盖新值（app_state 没有「新者胜」触发器）。
 * owner 是开始写入监听时的账号：账号变了（如另一个标签页切换了账号）就不再写，避免写进新账号。
 */
function enqueueWrite(key: string, owner: string | null, action: string, task: () => Promise<void>) {
  const previous = writeChains.get(key) ?? Promise.resolve()
  const next = previous.then(async () => {
    if (!owner || getCloudAccountId() !== owner) return
    try {
      await task()
    } catch (error) {
      reportCloudError(error, action)
    }
  })
  writeChains.set(key, next)
}

/** 等正在进行的写入结束（退出登录、切换账号前调用，否则请求会随页面跳转被取消） */
export function waitForCloudWrites(): Promise<void> {
  return Promise.all(Array.from(writeChains.values())).then(() => undefined)
}

/* -------------------------------------------------------------------------- */
/* 学习位置 / 书内单元位置                                                     */
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

function appStateSnapshot() {
  const state = useWorkspaceStore.getState()
  return {
    currentBookId: state.currentBookId,
    currentUnitIndex: state.currentUnitIndex ?? 0,
    loopCounts: state.loopCounts ?? {},
    learnedRootIds: state.learnedRootIds ?? [],
  }
}

/** 数据库里现有的书内位置（没有行 = 0） */
let storedBookModes = new Map<string, number>()
/** 数据库里 app_state 的内容签名；与当前 store 不同才写 */
let storedAppState = ''

/**
 * 从数据库载入学习位置。数据库没有的字段保持 store 默认值，且不会因此写入任何行。
 */
export async function loadWorkspaceProgress(): Promise<void> {
  const remote = await getRepositories().appState.get()
  const state = useWorkspaceStore.getState()
  const remoteModes = remote ? flattenBookModes(remote.bookModeProgress) : new Map<string, number>()
  const bookModeProgress: Record<string, BookModeUnitRecord> = {}
  for (const [key, value] of remoteModes) {
    const [bookId, mode] = key.split('\u0000') as [string, PracticeMode]
    bookModeProgress[bookId] = { ...(bookModeProgress[bookId] ?? { learn: 0, dictation: 0, phonetic: 0 }), [mode]: value }
  }

  const hasAppState = Boolean(remote && remote.updatedAt > 0)
  await state.applyCloudProgress({
    currentBookId: (hasAppState && remote?.currentBookId) || state.currentBookId,
    currentUnitIndex: hasAppState && remote ? remote.currentUnitIndex : state.currentUnitIndex,
    bookModeProgress,
    loopCounts: hasAppState && remote ? sanitizeLoopCounts(remote.loopCounts) : state.loopCounts,
    learnedRootIds:
      hasAppState && remote
        ? remote.learnedRootIds.filter((id): id is string => typeof id === 'string')
        : state.learnedRootIds,
  })
  storedBookModes = remoteModes
  storedAppState = JSON.stringify(appStateSnapshot())
}

/** 与数据库不同的书内位置；数据库没有的 0（默认值）不算变化，不写入 */
function changedBookModes(): BookModeEntry[] {
  const now = Date.now()
  const changes: BookModeEntry[] = []
  const current = flattenBookModes(useWorkspaceStore.getState().bookModeProgress)
  for (const [key, unitIndex] of current) {
    const stored = storedBookModes.get(key) ?? 0
    if (stored === unitIndex) continue
    const [bookId, mode] = key.split('\u0000') as [string, PracticeMode]
    changes.push({ bookId, mode, unitIndex, updatedAt: now })
  }
  return changes
}

async function writeWorkspaceProgress(): Promise<void> {
  const repositories = getRepositories()
  const changes = changedBookModes()
  if (changes.length > 0) {
    await repositories.appState.putBookModes(changes)
    for (const change of changes) {
      const key = entryKey(change.bookId, change.mode)
      if (change.unitIndex > 0) storedBookModes.set(key, change.unitIndex)
      else storedBookModes.delete(key)
    }
  }
  const snapshot = appStateSnapshot()
  const signature = JSON.stringify(snapshot)
  if (signature === storedAppState) return
  await repositories.appState.put({ ...snapshot, bookModeProgress: {}, updatedAt: Date.now() })
  storedAppState = signature
}

/** 开始把学习位置的变更直接写入数据库，返回停止函数 */
export function startWorkspaceProgressWrites(): () => void {
  const owner = getCloudAccountId()
  return useWorkspaceStore.subscribe(() => {
    if (changedBookModes().length === 0 && JSON.stringify(appStateSnapshot()) === storedAppState) return
    enqueueWrite('app_state', owner, '保存学习进度', writeWorkspaceProgress)
  })
}

/* -------------------------------------------------------------------------- */
/* 翻译模块                                                                    */
/* -------------------------------------------------------------------------- */

function translateStateSnapshot() {
  const state = useTranslateStore.getState()
  return {
    currentBookId: state.currentBookId,
    completedSentenceIds: state.completedSentenceIds ?? {},
  }
}

let storedTranslateState = ''

/**
 * 从数据库载入自定义句库与翻译进度（内置预置题库始终以代码为准）。
 */
export async function loadTranslateProgress(): Promise<void> {
  const repositories = getRepositories()
  const [books, state] = await Promise.all([repositories.translate.getBooks(), repositories.translate.getState()])
  const current = useTranslateStore.getState()
  const nextBooks = [...DEFAULT_TRANSLATION_BOOKS, ...books.map((book) => ({ ...book, isCustom: true }))]
  const preferredBookId =
    state?.currentBookId && nextBooks.some((book) => book.id === state.currentBookId)
      ? state.currentBookId
      : nextBooks.some((book) => book.id === current.currentBookId)
        ? current.currentBookId
        : nextBooks[0].id
  useTranslateStore.setState({
    books: nextBooks,
    currentBookId: preferredBookId,
    completedSentenceIds: (state?.completedSentenceIds ?? {}) as Record<string, boolean>,
    ...(preferredBookId !== current.currentBookId ? { currentSentenceIndex: 0, isSentenceCompleted: false } : {}),
  })
  storedTranslateState = JSON.stringify(translateStateSnapshot())
}

/** 开始把翻译进度的变更直接写入数据库（完成记录在服务端取并集），返回停止函数 */
export function startTranslateProgressWrites(): () => void {
  const owner = getCloudAccountId()
  return useTranslateStore.subscribe(() => {
    if (JSON.stringify(translateStateSnapshot()) === storedTranslateState) return
    enqueueWrite('translate_state', owner, '保存翻译进度', async () => {
      const snapshot = translateStateSnapshot()
      const signature = JSON.stringify(snapshot)
      if (signature === storedTranslateState) return
      await getRepositories().translate.putState({ ...snapshot, updatedAt: Date.now() })
      storedTranslateState = signature
    })
  })
}
