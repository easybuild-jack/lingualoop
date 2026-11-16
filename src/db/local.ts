import Dexie, { type Table } from 'dexie'
import type {
  VocabularyBook,
  VocabularyUnit,
  WordMasteryRecord,
  UnitProgressRecord,
  WordItem,
  WordOverrideRecord,
  PracticeMode,
} from '@/types'
import { BUILTIN_BOOKS } from '@/resources/books'
import { buildWordId } from '@/lib/wordId'

const STORE_SCHEMA_V1: Record<string, string> = {
  books: 'id, name, category, isCustom, updatedAt',
  wordRecords: 'wordId, bookId, isMastered, isStarred, isError, lastPracticedAt',
  unitProgress: '[bookId+unitIndex], bookId, isFinished',
}

const STORE_SCHEMA_V3: Record<string, string> = {
  ...STORE_SCHEMA_V1,
  wordOverrides: 'wordId, name, updatedAt',
}

const STORE_SCHEMA_V4: Record<string, string> = {
  ...STORE_SCHEMA_V3,
  aiWordCache: 'id, name',
}

const UNITS_SCHEMA = 'id, bookId, [bookId+order]'

// IndexedDB 不能原地修改主键，因此先删除旧的空进度表，再按新主键重建。
const STORE_SCHEMA_V5 = {
  ...STORE_SCHEMA_V4,
  units: UNITS_SCHEMA,
  unitProgress: null,
}

const STORE_SCHEMA_V6 = {
  ...STORE_SCHEMA_V4,
  units: UNITS_SCHEMA,
  unitProgress: '[unitId+mode], unitId, bookId, mode, status, lastStudiedAt',
}

/**
 * 把同一个单词散落的多条记录合成一条：
 * 累计类字段相加，「当前状态」类字段取最近一次练习的那条，加星是用户意图不能丢。
 */
function mergeMasteryRecords(a: WordMasteryRecord, b: WordMasteryRecord): WordMasteryRecord {
  const latest = (b.lastPracticedAt || 0) >= (a.lastPracticedAt || 0) ? b : a
  const older = latest === b ? a : b

  return {
    ...latest,
    wordItem: latest.wordItem || older.wordItem,
    wordName: latest.wordName || older.wordName,
    totalPracticeCount: (a.totalPracticeCount || 0) + (b.totalPracticeCount || 0),
    dictationErrorCount: (a.dictationErrorCount || 0) + (b.dictationErrorCount || 0),
    isStarred: Boolean(a.isStarred || b.isStarred),
  }
}

export class LinguaLoopDatabase extends Dexie {
  books!: Table<VocabularyBook, string>
  units!: Table<VocabularyUnit, string>
  wordRecords!: Table<WordMasteryRecord, string>
  unitProgress!: Table<UnitProgressRecord, [string, PracticeMode]>
  wordOverrides!: Table<WordOverrideRecord, string>
  aiWordCache!: Table<WordItem, string>

  constructor() {
    super('LinguaLoopDB')
    this.version(1).stores(STORE_SCHEMA_V1)

    // v1 的 wordId 掺了随机数与时间戳，同一个单词每次加载都会写成一条新记录。
    // 改用拼写派生的确定性 id 后，把历史数据按拼写归并回同一条，避免错词本重复与进度归零。
    this.version(2)
      .stores(STORE_SCHEMA_V1)
      .upgrade(async (tx) => {
        const booksTable = tx.table<VocabularyBook, string>('books')
        const customBooks = await booksTable.toArray()
        for (const book of customBooks) {
          if (!book.words?.length) continue
          const rekeyed = book.words.map((w) => ({ ...w, id: buildWordId(w.name) }))
          await booksTable.put({ ...book, words: rekeyed })
        }

        const recordsTable = tx.table<WordMasteryRecord, string>('wordRecords')
        const legacyRecords = await recordsTable.toArray()

        const mergedById = new Map<string, WordMasteryRecord>()
        const consumedIds: string[] = []

        for (const record of legacyRecords) {
          const name = record.wordItem?.name || record.wordName
          // 连拼写都没有的记录无法归位（例如仅加星过、未练习过的词），原样留下
          if (!name) continue

          const canonicalId = buildWordId(name)
          const existing = mergedById.get(canonicalId)
          const next = existing ? mergeMasteryRecords(existing, record) : record

          mergedById.set(canonicalId, { ...next, wordId: canonicalId })
          consumedIds.push(record.wordId)
        }

        if (consumedIds.length) await recordsTable.bulkDelete(consumedIds)
        if (mergedById.size) await recordsTable.bulkPut(Array.from(mergedById.values()))
      })

    // v3: 增加用户自定义单词拆分与构词覆盖表
    this.version(3).stores(STORE_SCHEMA_V3)

    // v4: 增加 AI 字典单词本地缓存表（只在本地，永不入库）
    this.version(4).stores(STORE_SCHEMA_V4)

    // v5-v6: 增加单元表，并把进度主键从单元序号改为稳定的 unitId + mode
    this.version(5).stores(STORE_SCHEMA_V5)
    this.version(6).stores(STORE_SCHEMA_V6)
  }

  async initializeDefaults() {
    for (const book of BUILTIN_BOOKS) {
      const existing = await this.books.get(book.id)
      if (!existing || !existing.isCustom) {
        await this.books.put(book)
      }
    }
  }
}

export const db = new LinguaLoopDatabase()

// 初始化默认词库
if (typeof window !== 'undefined') {
  // 调试用句柄：控制台里可以直接 __lingualoop_db 查看本地库
  Object.assign(window, { __lingualoop_db: db })
  db.initializeDefaults().catch(console.error)
}
