/**
 * 数据访问层（Repository）。
 *
 * 上层业务代码（页面、store、db/index.ts 的业务函数）只认这里的接口，
 * 具体落到「本地 IndexedDB」还是「云端 Supabase」由 isCloudMode() 决定：
 *   未配置数据库 → localRepositories（与改造前行为完全一致）
 *   已配置数据库 → cloudRepositories（数据只有云端一份，本地不再保留副本；
 *                  每次读写都带上登录账号的 account_id，未登录时直接报错）
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
} from '@/types'
import type { ReadingArticle } from '@/resources/readingData'
import type { RadioItem } from '@/resources/radioData'
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
  /** 全部单元进度（官方词库 + 自定义词库），迁移时使用 */
  getAll(): Promise<UnitProgressRecord[]>
  put(record: UnitProgressRecord): Promise<void>
  delete(unitId: string, mode: PracticeMode): Promise<void>
  deleteByBook(bookId: string): Promise<void>
}

/**
 * 原来散落在 localStorage 的「学习进度」类字段。
 * 注意：皮肤、音量、快捷键、AI Key 等设置项不在其中，它们永远只留在本机。
 */
export interface ProgressState {
  currentBookId?: string
  currentUnitIndex: number
  /** 每本书在每种模式下上次学到的单元序号；云端存在 book_progress 表，一行一个 (book, mode) */
  bookModeProgress: Record<string, Partial<Record<PracticeMode, number>>>
  loopCounts: Record<string, unknown>
  learnedRootIds: string[]
  updatedAt: number
}

/** book_progress 的一行：只写发生变化的 (book, mode)，避免整表覆盖其他设备的新位置 */
export interface BookModeEntry {
  bookId: string
  mode: PracticeMode
  unitIndex: number
  updatedAt: number
}

export interface TranslateProgressState {
  currentBookId?: string
  completedSentenceIds: Record<string, unknown>
  updatedAt: number
}

export interface AppStateRepository {
  get(): Promise<ProgressState | null>
  /** 学习位置、循环次数、已学词根（不含书内位置） */
  put(state: ProgressState): Promise<void>
  /** 书内位置：unitIndex 为 0 等同于「没有记录」，删掉该行而不是写一行 0 */
  putBookModes(entries: BookModeEntry[]): Promise<void>
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
  /** 仅读取列表元数据（不含 paragraphs 正文），供列表页按需加载 */
  getArticleSummaries(): Promise<ReadingArticle[]>
  /** 按 id 读取单篇完整文章（含 paragraphs 正文） */
  getArticle(articleId: string): Promise<ReadingArticle | undefined>
  putArticle(article: ReadingArticle): Promise<void>
  deleteArticle(articleId: string): Promise<void>
}

export interface RadioRepository {
  getItems(): Promise<RadioItem[]>
  putItem(item: RadioItem): Promise<void>
  deleteItem(itemId: string): Promise<void>
}

export interface Repositories {
  mode: DataMode
  books: BooksRepository
  wordRecords: WordRecordsRepository
  unitProgress: UnitProgressRepository
  appState: AppStateRepository
  translate: TranslateRepository
  reading: ReadingRepository
  radio: RadioRepository
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
    getAll: () => db.unitProgress.toArray(),
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
  appState: {
    // 本地模式的进度本来就存在 localStorage（zustand persist），这里只是占位实现
    get: async () => null,
    put: async () => {},
    putBookModes: async () => {},
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
    getArticleSummaries: async () => [],
    getArticle: async () => undefined,
    putArticle: async () => {},
    deleteArticle: async () => {},
  },
  radio: {
    // 本地模式的影音条目只在页面内存里（与改造前一致）
    getItems: async () => [],
    putItem: async () => {},
    deleteItem: async () => {},
  },
}

/** 按当前模式取仓库。云端实现只做类型依赖，不会形成运行时循环引用。 */
export function getRepositories(): Repositories {
  return isCloudMode() ? cloudRepositories : localRepositories
}
