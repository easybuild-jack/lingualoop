/**
 * 首次配置云数据库后，把本地已有数据搬上去（一次性）。
 *
 * 规则：不覆盖云端已有数据，只补齐「本地有、云端无」的部分。
 * 这样重复点「上传本地数据」不会把线上数据冲掉。
 */
import { localRepositories } from '@/db/repository'
import { cloudRepositories } from './supabaseRepository'
import { useTranslateStore } from '@/store/useTranslateStore'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { ReadingArticle } from '@/resources/readingData'

const READING_STORAGE_KEY = 'lingualoop_reading_articles_v1'

export interface MigrationResult {
  books: number
  words: number
  progress: number
  overrides: number
  translateBooks: number
  readingArticles: number
  skipped: number
}

function readLocalReadingArticles(): ReadingArticle[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(READING_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ReadingArticle[]) : []
  } catch {
    return []
  }
}

/** 把本地数据补齐到云端，已存在的不动 */
export async function uploadLocalDataToCloud(): Promise<MigrationResult> {
  const result: MigrationResult = {
    books: 0,
    words: 0,
    progress: 0,
    overrides: 0,
    translateBooks: 0,
    readingArticles: 0,
    skipped: 0,
  }

  // ---------------- 自定义词库 ----------------
  const localBooks = await localRepositories.books.getCustom()
  const remoteBooks = await cloudRepositories.books.getAll()
  const remoteBookIds = new Set(remoteBooks.map((book) => book.id))
  for (const book of localBooks) {
    if (remoteBookIds.has(book.id)) {
      result.skipped += 1
      continue
    }
    await cloudRepositories.books.put(book)
    result.books += 1
  }

  // ---------------- 错词本 / 生词记录 ----------------
  const localRecords = await localRepositories.wordRecords.getAll()
  const remoteRecords = await cloudRepositories.wordRecords.getAll()
  const remoteWordIds = new Set(remoteRecords.map((record) => record.wordId))
  for (const record of localRecords) {
    if (remoteWordIds.has(record.wordId)) {
      result.skipped += 1
      continue
    }
    await cloudRepositories.wordRecords.put(record)
    result.words += 1
  }

  // ---------------- 单元进度 ----------------
  for (const book of localBooks) {
    const records = await localRepositories.unitProgress.getByBook(book.id)
    for (const record of records) {
      const existing = await cloudRepositories.unitProgress.get(record.unitId, record.mode)
      if (existing) {
        result.skipped += 1
        continue
      }
      await cloudRepositories.unitProgress.put(record)
      result.progress += 1
    }
  }

  // ---------------- 单词自定义覆盖 ----------------
  const localOverrides = await localRepositories.wordOverrides.getAll()
  const remoteOverrides = await cloudRepositories.wordOverrides.getAll()
  const remoteOverrideIds = new Set(remoteOverrides.map((record) => record.wordId))
  for (const override of localOverrides) {
    if (remoteOverrideIds.has(override.wordId)) {
      result.skipped += 1
      continue
    }
    await cloudRepositories.wordOverrides.put(override)
    result.overrides += 1
  }

  // ---------------- 翻译模块：自定义题库 + 完成记录 ----------------
  const translateBooks = useTranslateStore.getState().books.filter((book) => book.isCustom)
  const remoteTranslateBooks = await cloudRepositories.translate.getBooks()
  const remoteTranslateIds = new Set(remoteTranslateBooks.map((book) => book.id))
  for (const book of translateBooks) {
    if (remoteTranslateIds.has(book.id)) {
      result.skipped += 1
      continue
    }
    await cloudRepositories.translate.putBook(book)
    result.translateBooks += 1
  }

  const translateState = await cloudRepositories.translate.getState()
  const localTranslateState = useTranslateStore.getState()
  if (!translateState) {
    await cloudRepositories.translate.putState({
      currentBookId: localTranslateState.currentBookId,
      completedSentenceIds: localTranslateState.completedSentenceIds,
      updatedAt: Date.now(),
    })
  }

  // ---------------- 学习位置 / 累计进度 ----------------
  const appState = await cloudRepositories.appState.get()
  if (!appState || !appState.updatedAt) {
    const state = useWorkspaceStore.getState()
    await cloudRepositories.appState.put({
      currentBookId: state.currentBookId,
      currentUnitIndex: state.currentUnitIndex ?? 0,
      bookModeProgress: state.bookModeProgress ?? {},
      loopCounts: state.loopCounts ?? {},
      learnedRootIds: state.learnedRootIds ?? [],
      updatedAt: Date.now(),
    })
  }

  // ---------------- 阅读：用户上传的文章 ----------------
  const localArticles = readLocalReadingArticles().filter((article) => article.isCustom)
  const remoteArticles = await cloudRepositories.reading.getArticles()
  const remoteArticleIds = new Set(remoteArticles.map((article) => article.id))
  for (const article of localArticles) {
    if (remoteArticleIds.has(article.id)) {
      result.skipped += 1
      continue
    }
    await cloudRepositories.reading.putArticle(article)
    result.readingArticles += 1
  }

  return result
}
