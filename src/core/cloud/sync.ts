/**
 * 云模式下的「进度类」数据同步。
 *
 * 大部分业务数据（词库、错词本、单元进度）走 repository 直读直写，
 * 但学习位置、翻译进度这类字段目前是 zustand persist 在 localStorage 里的。
 * 云模式下它们必须以数据库为准，因此这里做两件事：
 *   1. 启动时用云端值覆盖本地 store（hydrate）；
 *   2. 之后本地每次变更做防抖推送（debounce upsert），保持两端一致。
 *
 * 设置类字段（皮肤/音量/快捷键/AI Key）不在此列，永远只在本地。
 */
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useTranslateStore } from '@/store/useTranslateStore'
import { getRepositories } from '@/db/repository'
import type { ProgressState, TranslateProgressState } from '@/db/repository'
import type { TranslationBook } from '@/types'
import { DEFAULT_TRANSLATION_BOOKS } from '@/resources/translateData'
import { isCloudMode } from './config'

const PUSH_DEBOUNCE_MS = 1200

const timers = new Map<string, ReturnType<typeof setTimeout>>()
let applyingRemote = false

function debounce(key: string, task: () => Promise<void>) {
  const existing = timers.get(key)
  if (existing) clearTimeout(existing)
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      void task().catch((error) => {
        console.warn(`[cloud-sync] ${key} push failed:`, error)
      })
    }, PUSH_DEBOUNCE_MS)
  )
}

/* -------------------------------------------------------------------------- */
/* 学习位置 / 累计进度                                                         */
/* -------------------------------------------------------------------------- */

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

/** 用云端进度覆盖本地 store。云端没有记录时保持本地不动。 */
export async function hydrateWorkspaceProgress(): Promise<void> {
  const remote = await getRepositories().appState.get()
  if (!remote) return
  applyingRemote = true
  try {
    useWorkspaceStore.setState({
      currentBookId: remote.currentBookId ?? useWorkspaceStore.getState().currentBookId,
      currentUnitIndex: remote.currentUnitIndex ?? 0,
      bookModeProgress: remote.bookModeProgress as never,
      loopCounts: remote.loopCounts as never,
      learnedRootIds: remote.learnedRootIds ?? [],
    })
  } finally {
    setTimeout(() => {
      applyingRemote = false
    }, 0)
  }
}

export function startWorkspaceProgressSync(): () => void {
  let lastSnapshot = JSON.stringify(readWorkspaceProgress())
  return useWorkspaceStore.subscribe(() => {
    if (applyingRemote || !isCloudMode()) return
    const snapshot = readWorkspaceProgress()
    const serialized = JSON.stringify({ ...snapshot, updatedAt: 0 })
    if (serialized === lastSnapshot) return
    lastSnapshot = serialized
    debounce('app_state', () => getRepositories().appState.put(readWorkspaceProgress()))
  })
}

/* -------------------------------------------------------------------------- */
/* 翻译模块                                                                    */
/* -------------------------------------------------------------------------- */

function readCustomTranslateBooks(): TranslationBook[] {
  return useTranslateStore.getState().books.filter((book) => book.isCustom)
}

function translateStateSnapshot(): TranslateProgressState {
  const state = useTranslateStore.getState()
  return {
    currentBookId: state.currentBookId,
    completedSentenceIds: state.completedSentenceIds ?? {},
    updatedAt: Date.now(),
  }
}

/** 用云端自定义题库 + 完成记录覆盖本地（内置预置题库始终以代码为准） */
export async function hydrateTranslateProgress(): Promise<void> {
  const repositories = getRepositories()
  const [books, state] = await Promise.all([
    repositories.translate.getBooks(),
    repositories.translate.getState(),
  ])

  applyingRemote = true
  try {
    if (books.length || state) {
      const current = useTranslateStore.getState()
      const customIds = new Set(books.map((book) => book.id))
      const localCustom = current.books.filter((book) => book.isCustom && !customIds.has(book.id))
      const nextBooks = [...DEFAULT_TRANSLATION_BOOKS, ...books, ...localCustom]
      const preferredBookId =
        state?.currentBookId && nextBooks.some((book) => book.id === state.currentBookId)
          ? state.currentBookId
          : current.currentBookId
      useTranslateStore.setState({
        books: nextBooks,
        currentBookId: nextBooks.some((b) => b.id === preferredBookId)
          ? preferredBookId
          : nextBooks[0]?.id ?? current.currentBookId,
        completedSentenceIds: (state?.completedSentenceIds ?? current.completedSentenceIds) as never,
      })
    }
  } finally {
    setTimeout(() => {
      applyingRemote = false
    }, 0)
  }
}

export function startTranslateSync(): () => void {
  let lastBooks = JSON.stringify(readCustomTranslateBooks())
  let lastState = JSON.stringify({ ...translateStateSnapshot(), updatedAt: 0 })

  return useTranslateStore.subscribe(() => {
    if (applyingRemote || !isCloudMode()) return
    const repositories = getRepositories()

    // 1. 自定义题库：新增/修改 upsert，删除的同步移除
    const books = readCustomTranslateBooks()
    const booksSignature = JSON.stringify(books)
    if (booksSignature !== lastBooks) {
      const previousIds = new Set(
        (JSON.parse(lastBooks) as TranslationBook[]).map((book) => book.id)
      )
      const nextIds = new Set(books.map((book) => book.id))
      lastBooks = booksSignature
      debounce('translate_books', async () => {
        for (const book of books) await repositories.translate.putBook(book)
        for (const id of previousIds) {
          if (!nextIds.has(id)) await repositories.translate.deleteBook(id)
        }
      })
    }

    // 2. 学习位置与已完成句子
    const state = translateStateSnapshot()
    const stateSignature = JSON.stringify({ ...state, updatedAt: 0 })
    if (stateSignature !== lastState) {
      lastState = stateSignature
      debounce('translate_state', () =>
        repositories.translate.putState(translateStateSnapshot())
      )
    }
  })
}
