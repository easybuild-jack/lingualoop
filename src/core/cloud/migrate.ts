/**
 * 本机「本地模式」数据的一次性上传。
 *
 * 只在这台设备第一次连上某个数据库、并且本机有本地模式数据时询问一次（由 CloudSyncGate 发起），
 * 上传或放弃后都会记下标记，之后不再询问、也不再有任何本地与数据库之间的同步。
 *
 * 规则：只补齐、不覆盖。所有写入都是 INSERT ... ON CONFLICT DO NOTHING，
 * 由数据库判断是否已存在，不依赖先把云端整表读回来比对（那样会被 1000 行上限截断）。
 * - 进度类（生词/错词记录、单元进度含官方词库、书内位置、学习位置、翻译完成记录）写入当前账号；
 * - 内容类（自定义词库、句库、阅读文章）按用户选择存为「个人」或「共享」。
 * 读取的始终是本地模式那份数据（IndexedDB 与 localStorage 原 key）。
 */
import { localRepositories } from '@/db/repository'
import type { BookModeEntry } from '@/db/repository'
import type { PracticeMode, TranslationBook } from '@/types'
import type { ReadingArticle } from '@/resources/readingData'
import { DEFAULT_SAMPLE_CUSTOM_BOOK } from '@/resources/books'
import { cloudMigration, cloudRepositories } from './supabaseRepository'
import { getCloudAccountId, getCloudConfig } from './config'
import { readLocalPersistedState } from './scopedStorage'
import type { ContentVisibility } from './visibility'

const READING_STORAGE_KEY = 'lingualoop_reading_articles_v1'
const WORKSPACE_STORAGE_KEY = 'lingualoop-workspace-storage'
const TRANSLATE_STORAGE_KEY = 'lingualoop-translate-storage'
const UPLOAD_RECORD_PREFIX = 'lingualoop_cloud_local_upload::'
const PRACTICE_MODES: PracticeMode[] = ['learn', 'dictation', 'phonetic']

export type { ContentVisibility }

export interface MigrationResult {
  books: number
  words: number
  progress: number
  bookProgress: number
  translateBooks: number
  readingArticles: number
  appState: boolean
  skipped: number
}

/** 这台设备对当前数据库的一次性上传记录 */
export interface LocalUploadRecord {
  accountId: string
  handledAt: number
  uploaded: boolean
}

function uploadRecordKey(): string | null {
  const config = getCloudConfig()
  return config ? `${UPLOAD_RECORD_PREFIX}${config.url}` : null
}

export function getLocalUploadRecord(): LocalUploadRecord | null {
  const key = uploadRecordKey()
  if (!key || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as LocalUploadRecord) : null
  } catch {
    return null
  }
}

/** 记下「已处理」（上传完成或用户选择不上传），之后不再询问 */
export function markLocalUploadHandled(uploaded: boolean): void {
  const key = uploadRecordKey()
  const accountId = getCloudAccountId()
  if (!key || !accountId) return
  const record: LocalUploadRecord = { accountId, handledAt: Date.now(), uploaded }
  localStorage.setItem(key, JSON.stringify(record))
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

/** 书内位置只取大于 0 的：0 是默认值，数据库里不存 */
function readLocalBookModes(progress: unknown, updatedAt: number): BookModeEntry[] {
  if (!progress || typeof progress !== 'object') return []
  const entries: BookModeEntry[] = []
  for (const [bookId, record] of Object.entries(progress as Record<string, Record<string, unknown>>)) {
    if (!bookId || !record || typeof record !== 'object') continue
    for (const mode of PRACTICE_MODES) {
      const value = record[mode]
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        entries.push({ bookId, mode, unitIndex: value, updatedAt })
      }
    }
  }
  return entries
}

function readLocalTranslateBooks(): TranslationBook[] {
  const translate = readLocalPersistedState(TRANSLATE_STORAGE_KEY)
  return (Array.isArray(translate.books) ? (translate.books as TranslationBook[]) : []).filter(
    (book) => book?.isCustom && book.id
  )
}

/**
 * 本机是否有值得上传的本地模式数据：自定义内容（未改动的示例词库不算），或任何学习记录。
 */
export async function hasLocalDataToUpload(): Promise<boolean> {
  const books = await localRepositories.books.getCustom()
  const ownBooks = books.filter(
    (book) =>
      book.id !== DEFAULT_SAMPLE_CUSTOM_BOOK.id ||
      JSON.stringify(book.words ?? []) !== JSON.stringify(DEFAULT_SAMPLE_CUSTOM_BOOK.words ?? [])
  )
  if (ownBooks.length > 0) return true
  if (readLocalTranslateBooks().length > 0) return true
  if (readLocalReadingArticles().some((article) => article.isCustom && article.id)) return true
  if ((await localRepositories.wordRecords.getAll()).length > 0) return true
  if ((await localRepositories.unitProgress.getAll()).length > 0) return true
  const workspace = readLocalPersistedState(WORKSPACE_STORAGE_KEY)
  if (readLocalBookModes(workspace.bookModeProgress, 0).length > 0) return true
  const completed = readLocalPersistedState(TRANSLATE_STORAGE_KEY).completedSentenceIds
  return Boolean(completed && typeof completed === 'object' && Object.keys(completed).length > 0)
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
  const translateBooks = readLocalTranslateBooks()
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

/** 上传结果的中文摘要 */
export function formatMigrationResult(result: MigrationResult): string {
  const parts = [
    result.books ? `词库 ${result.books}` : '',
    result.words ? `生词记录 ${result.words}` : '',
    result.progress ? `单元进度 ${result.progress}` : '',
    result.bookProgress ? `书内位置 ${result.bookProgress}` : '',
    result.appState ? '学习位置' : '',
    result.translateBooks ? `自定义句库 ${result.translateBooks}` : '',
    result.readingArticles ? `阅读文章 ${result.readingArticles}` : '',
  ].filter(Boolean)
  if (parts.length === 0) return '数据库里已有这些数据，没有新增（已存在的条目不会被覆盖）。'
  return `已上传：${parts.join('、')}。${result.skipped ? `跳过 ${result.skipped} 条数据库里已存在的记录。` : ''}`
}
