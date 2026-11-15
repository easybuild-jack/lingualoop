/**
 * 数据访问层（Repository）。
 *
 * 上层业务代码（页面、store、db/index.ts 的业务函数）只认这里的接口，
 * 具体落到「本地 IndexedDB」还是「云端 Supabase」由 isCloudMode() 决定：
 *   未配置数据库 → localRepositories（与改造前行为完全一致）
 *   已配置数据库 → cloudRepositories（数据只有云端一份，本地不再保留副本）
 *
 * 之所以做成整表级接口而不是行级 SQL 拼装，是因为业务函数里大量
 * 「读一条 → 算 → 写回一条」的逻辑可以原样复用，不必为两种模式各写一遍。
 */
import type {
  PracticeMode,
  TranslationBook,
  UnitProgressRecord,
  VocabularyBook,
  WordMasteryRecord,
  WordOverrideRecord,
} from '@/types'
import type { ReadingArticle } from '@/resources/readingData'
import { db } from './local'
import { isCloudMode } from '@/core/cloud/config'
import { cloudRepositories } from '@/core/cloud/supabaseRepository'

export type DataMode = 'local' | 'cloud'

export interface BooksRepository {
  get(id: string): Promise<VocabularyBook | undefined>
  getAll(): Promise<VocabularyBook[]>
  getCustom(): Promise<VocabularyBook[]>
  put(book: VocabularyBook): Promise<void>
  update(id: string, patch: Partial<VocabularyBook>): Promise<void>
  delete(id: string): Promise<void>
}

export interface WordRecordsRepository {
  get(wordId: string): Promise<WordMasteryRecord | undefined>
  getAll(): Promise<WordMasteryRecord[]>
  put(record: WordMasteryRecord): Promise<void>
  update(wordId: string, patch: Partial<WordMasteryRecord>): Promise<void>
  delete(wordId: string): Promise<void>
}

export interface UnitProgressRepository {
  get(unitId: string, mode: PracticeMode): Promise<UnitProgressRecord | undefined>
  getByBook(bookId: string): Promise<UnitProgressRecord[]>
  put(record: UnitProgressRecord): Promise<void>
  delete(unitId: string, mode: PracticeMode): Promise<void>
  deleteByBook(bookId: string): Promise<void>
}

export interface WordOverridesRepository {
  get(wordId: string): Promise<WordOverrideRecord | undefined>
  getAll(): Promise<WordOverrideRecord[]>
  bulkGet(wordIds: string[]): Promise<(WordOverrideRecord | undefined)[]>
  put(record: WordOverrideRecord): Promise<void>
}

/**
 * 原来散落在 localStorage 的「学习进度」类字段。
 * 注意：皮肤、音量、快捷键、AI Key 等设置项不在其中，它们永远只留在本机。
 */
export interface ProgressState {
  currentBookId?: string
  currentUnitIndex: number
  bookModeProgress: Record<string, unknown>
  loopCounts: Record<string, unknown>
  learnedRootIds: string[]
  updatedAt: number
}

export interface TranslateProgressState {
  currentBookId?: string
  completedSentenceIds: Record<string, unknown>
  updatedAt: number
}

export interface AppStateRepository {
  get(): Promise<ProgressState | null>
  put(state: ProgressState): Promise<void>
}

export interface TranslateRepository {
  getBooks(): Promise<TranslationBook[]>
  putBook(book: TranslationBook): Promise<void>
  deleteBook(bookId: string): Promise<void>
  getState(): Promise<TranslateProgressState | null>
  putState(state: TranslateProgressState): Promise<void>
}

export interface ReadingRepository {
  getArticles(): Promise<ReadingArticle[]>
  putArticle(article: ReadingArticle): Promise<void>
  deleteArticle(articleId: string): Promise<void>
}

export interface Repositories {
  mode: DataMode
  books: BooksRepository
  wordRecords: WordRecordsRepository
  unitProgress: UnitProgressRepository
  wordOverrides: WordOverridesRepository
  appState: AppStateRepository
  translate: TranslateRepository
  reading: ReadingRepository
}

/* -------------------------------------------------------------------------- */
/* 本地实现（Dexie / IndexedDB）                                               */
/* -------------------------------------------------------------------------- */

export const localRepositories: Repositories = {
  mode: 'local',
  books: {
    get: (id) => db.books.get(id),
    getAll: () => db.books.toArray(),
    getCustom: () => db.books.filter((book) => Boolean(book.isCustom)).toArray(),
    put: async (book) => {
      await db.books.put(book)
    },
    update: async (id, patch) => {
      await db.books.update(id, patch)
    },
    delete: async (id) => {
      await db.books.delete(id)
    },
  },
  wordRecords: {
    get: (wordId) => db.wordRecords.get(wordId),
    getAll: () => db.wordRecords.toArray(),
    put: async (record) => {
      await db.wordRecords.put(record)
    },
    update: async (wordId, patch) => {
      await db.wordRecords.update(wordId, patch)
    },
    delete: async (wordId) => {
      await db.wordRecords.delete(wordId)
    },
  },
  unitProgress: {
    get: (unitId, mode) => db.unitProgress.get([unitId, mode]),
    getByBook: (bookId) => db.unitProgress.where('bookId').equals(bookId).toArray(),
    put: async (record) => {
      await db.unitProgress.put(record)
    },
    delete: async (unitId, mode) => {
      await db.unitProgress.delete([unitId, mode])
    },
    deleteByBook: async (bookId) => {
      await db.unitProgress.where('bookId').equals(bookId).delete()
    },
  },
  wordOverrides: {
    get: (wordId) => db.wordOverrides.get(wordId),
    getAll: () => db.wordOverrides.toArray(),
    bulkGet: async (wordIds) => db.wordOverrides.bulkGet(wordIds),
    put: async (record) => {
      await db.wordOverrides.put(record)
    },
  },
  appState: {
    // 本地模式的进度本来就存在 localStorage（zustand persist），这里只是占位实现
    get: async () => null,
    put: async () => {},
  },
  translate: {
    // 本地模式的翻译题库走 localStorage，云端实现才有真正的读写
    getBooks: async () => [],
    putBook: async () => {},
    deleteBook: async () => {},
    getState: async () => null,
    putState: async () => {},
  },
  reading: {
    getArticles: async () => [],
    putArticle: async () => {},
    deleteArticle: async () => {},
  },
}

/** 按当前模式取仓库。云端实现只做类型依赖，不会形成运行时循环引用。 */
export function getRepositories(): Repositories {
  return isCloudMode() ? cloudRepositories : localRepositories
}
