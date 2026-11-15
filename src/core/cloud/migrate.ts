/**
 * 把本机「本地模式」下的数据上传到当前登录的账号（可重复执行）。
 *
 * 规则：只补齐、不覆盖。所有写入都是 INSERT ... ON CONFLICT DO NOTHING，
 * 由数据库判断是否已存在，不依赖先把云端整表读回来比对（那样会被 1000 行上限截断）。
 * - 进度类（生词/错词记录、单元进度含官方词库、书内位置、单词修改、学习位置、翻译完成记录）写入当前账号；
 * - 内容类（自定义词库、句库、阅读文章）按用户选择存为「个人」或「共享」。
 * 读取的始终是本地模式那份数据（IndexedDB 与 localStorage 原 key），不受云模式缓存影响。
 */
import { localRepositories } from '@/db/repository'
import type { BookModeEntry } from '@/db/repository'
import type { PracticeMode, TranslationBook } from '@/types'
import type { ReadingArticle } from '@/resources/readingData'
import { cloudMigration, cloudRepositories } from './supabaseRepository'
import { getCloudAccountId } from './config'
import { readLocalPersistedState } from './scopedStorage'
import type { ContentVisibility } from './visibility'

const READING_STORAGE_KEY = 'lingualoop_reading_articles_v1'
const WORKSPACE_STORAGE_KEY = 'lingualoop-workspace-storage'
const TRANSLATE_STORAGE_KEY = 'lingualoop-translate-storage'
const PRACTICE_MODES: PracticeMode[] = ['learn', 'dictation', 'phonetic']

export type { ContentVisibility }

export interface MigrationResult {
  books: number
  words: number
  progress: number
  bookProgress: number
  overrides: number
  translateBooks: number
  readingArticles: number
  appState: boolean
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

function readLocalBookModes(progress: unknown, updatedAt: number): BookModeEntry[] {
  if (!progress || typeof progress !== 'object') return []
  const entries: BookModeEntry[] = []
  for (const [bookId, record] of Object.entries(progress as Record<string, Record<string, unknown>>)) {
    if (!bookId || !record || typeof record !== 'object') continue
    for (const mode of PRACTICE_MODES) {
      const value = record[mode]
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        entries.push({ bookId, mode, unitIndex: value, updatedAt })
      }
    }
  }
  return entries
}

/** 把本地数据补齐到当前账号，已存在的不动 */
export async function uploadLocalDataToCloud(visibility: ContentVisibility): Promise<MigrationResult> {
  const accountId = getCloudAccountId()
  if (!accountId) throw new Error('请先登录账号再上传。')
  const owner = visibility === 'personal' ? accountId : null
  const result: MigrationResult = {
    books: 0,
    words: 0,
    progress: 0,
    bookProgress: 0,
    overrides: 0,
    translateBooks: 0,
    readingArticles: 0,
    appState: false,
    skipped: 0,
  }
  const track = (total: number, inserted: number) => {
    result.skipped += total - inserted
    return inserted
  }

  // ---------------- 自定义词库 ----------------
  const localBooks = await localRepositories.books.getCustom()
  result.books = track(
    localBooks.length,
    await cloudMigration.insertBooks(localBooks.map((book) => ({ ...book, accountId: owner })))
  )

  // ---------------- 错词本 / 生词记录 ----------------
  const localRecords = await localRepositories.wordRecords.getAll()
  result.words = track(localRecords.length, await cloudMigration.insertWordRecords(localRecords))

  // ---------------- 单元进度（官方词库 + 自定义词库） ----------------
  const localProgress = await localRepositories.unitProgress.getAll()
  result.progress = track(localProgress.length, await cloudMigration.insertUnitProgress(localProgress))

  // ---------------- 单词自定义覆盖 ----------------
  const localOverrides = await localRepositories.wordOverrides.getAll()
  result.overrides = track(localOverrides.length, await cloudMigration.insertWordOverrides(localOverrides))

  // ---------------- 学习位置 / 书内单元位置 ----------------
  const workspace = readLocalPersistedState(WORKSPACE_STORAGE_KEY)
  const now = Date.now()
  const bookModes = readLocalBookModes(workspace.bookModeProgress, now)
  result.bookProgress = track(bookModes.length, await cloudMigration.insertBookProgress(bookModes))

  const remoteAppState = await cloudRepositories.appState.get()
  if (!remoteAppState || !remoteAppState.updatedAt) {
    await cloudRepositories.appState.put({
      currentBookId: typeof workspace.currentBookId === 'string' ? workspace.currentBookId : undefined,
      currentUnitIndex: typeof workspace.currentUnitIndex === 'number' ? workspace.currentUnitIndex : 0,
      bookModeProgress: {},
      loopCounts: (workspace.loopCounts as Record<string, unknown>) ?? {},
      learnedRootIds: Array.isArray(workspace.learnedRootIds) ? (workspace.learnedRootIds as string[]) : [],
      updatedAt: now,
    })
    result.appState = true
  }

  // ---------------- 翻译模块：自定义题库 + 完成记录 ----------------
  const translate = readLocalPersistedState(TRANSLATE_STORAGE_KEY)
  const translateBooks = (Array.isArray(translate.books) ? (translate.books as TranslationBook[]) : []).filter(
    (book) => book?.isCustom && book.id
  )
  result.translateBooks = track(
    translateBooks.length,
    await cloudMigration.insertTranslateBooks(translateBooks.map((book) => ({ ...book, accountId: owner })))
  )

  const remoteTranslateState = await cloudRepositories.translate.getState()
  const completed = translate.completedSentenceIds
  await cloudRepositories.translate.putState({
    // 云端已有位置时不改它，只合并完成记录
    currentBookId:
      !remoteTranslateState && typeof translate.currentBookId === 'string' ? translate.currentBookId : undefined,
    completedSentenceIds: completed && typeof completed === 'object' ? (completed as Record<string, unknown>) : {},
    updatedAt: now,
  })

  // ---------------- 阅读：用户上传的文章 ----------------
  const localArticles = readLocalReadingArticles().filter((article) => article.isCustom && article.id)
  result.readingArticles = track(
    localArticles.length,
    await cloudMigration.insertReadingArticles(localArticles.map((article) => ({ ...article, accountId: owner })))
  )

  return result
}
