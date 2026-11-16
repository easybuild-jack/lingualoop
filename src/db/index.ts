import type {
  VocabularyBook,
  WordMasteryRecord,
  UnitProgressRecord,
  WordItem,
  PracticeMode,
  ContentAccountId,
} from '@/types'
import { DEFAULT_SAMPLE_CUSTOM_BOOK } from '@/resources/books'
import { buildWordId } from '@/lib/wordId'
import { db } from './local'
import { getRepositories } from './repository'
import { getCloudAccountId, isCloudMode } from '@/core/cloud/config'
import { cloudMigration, cloudOperations } from '@/core/cloud/supabaseRepository'
import { reportCloudError } from '@/core/cloud/notices'
import type { ContentVisibility } from '@/core/cloud/visibility'

export { db }
export { localRepositories } from './repository'
export type { Repositories } from './repository'

/**
 * 数据访问统一入口。
 *
 * 这里所有函数都通过 getRepositories() 取数据仓库——配置了云数据库就落到 Supabase，
 * 没配置就落到本地 IndexedDB，业务逻辑只写一份。
 * 云模式下读写直接打到数据库，失败不重发，只在页面上提示（见 core/cloud/notices）。
 */

function reportFailure(err: unknown, action: string) {
  console.error(`${action}失败:`, err)
  if (isCloudMode()) reportCloudError(err, action)
}

/**
 * 本地模式下沿用 Dexie 事务。云模式下这里没有串行保护：
 * 计数与单元进度的读改写已改走数据库函数（cloudOperations），只有低频的修剪逻辑仍走这里。
 */
async function runInUnitProgressTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (isCloudMode()) return fn()
  return db.transaction('rw', db.unitProgress, fn)
}

/** 云模式返回原子操作集合，本地模式返回 null */
function cloudOps() {
  return getRepositories().mode === 'cloud' ? cloudOperations : null
}

/* -------------------------------------------------------------------------- */
/* 供页面直接读取的基础查询                                                    */
/* -------------------------------------------------------------------------- */

/** 按 id 取词库（云模式下只有自定义词库会命中，内置官方词库返回 undefined） */
export async function getVocabularyBookById(bookId: string): Promise<VocabularyBook | undefined> {
  if (!bookId) return undefined
  try {
    return await getRepositories().books.get(bookId)
  } catch (err) {
    reportFailure(err, '读取词库')
    return undefined
  }
}

/** 删除词库（不做 isCustom 保护，仅供内部已校验过的调用方使用） */
export async function deleteVocabularyBookById(bookId: string): Promise<void> {
  if (!bookId) return
  await getRepositories().books.delete(bookId)
}

/** 读取单个单词的掌握记录 */
export async function getWordRecord(wordId: string): Promise<WordMasteryRecord | undefined> {
  if (!wordId) return undefined
  try {
    return await getRepositories().wordRecords.get(wordId)
  } catch (err) {
    reportFailure(err, '读取单词记录')
    return undefined
  }
}

/** 写入单词掌握记录 */
export async function putWordRecord(record: WordMasteryRecord): Promise<void> {
  await getRepositories().wordRecords.put(record)
}

/** 局部更新单词掌握记录 */
export async function updateWordRecord(
  wordId: string,
  patch: Partial<WordMasteryRecord>
): Promise<void> {
  await getRepositories().wordRecords.update(wordId, patch)
}

/** 读取全部单词掌握记录 */
export async function getAllWordRecords(): Promise<WordMasteryRecord[]> {
  try {
    return await getRepositories().wordRecords.getAll()
  } catch (err) {
    reportFailure(err, '读取单词记录')
    return []
  }
}

/* -------------------------------------------------------------------------- */
/* 单词掌握记录                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 记录单词练习结果 (支持存储完整 wordItem 保证错词本跨词库独立展示与练习)
 */
export async function recordWordAttempt(
  wordId: string,
  bookId: string,
  isCorrect: boolean,
  mode: PracticeMode,
  wordItem?: WordItem
) {
  try {
    const ops = cloudOps()
    if (ops) return await ops.recordWordAttempt({ wordId, bookId, isCorrect, mode, wordItem })

    const repositories = getRepositories()
    const existing = await repositories.wordRecords.get(wordId)
    const now = Date.now()

    if (!existing) {
      const isDictationError = !isCorrect && mode === 'dictation'
      const newRecord: WordMasteryRecord = {
        wordId,
        bookId,
        wordName: wordItem?.name,
        wordItem,
        isMastered: isCorrect && mode === 'dictation',
        isStarred: false,
        isError: isDictationError,
        totalPracticeCount: 1,
        dictationErrorCount: isDictationError ? 1 : 0,
        consecutiveCorrectCount: isCorrect && mode === 'dictation' ? 1 : 0,
        lastPracticedAt: now,
      }
      await repositories.wordRecords.put(newRecord)
      return newRecord
    }

    const consecutive = isCorrect && mode === 'dictation' ? existing.consecutiveCorrectCount + 1 : 0
    const dictationErrors = !isCorrect && mode === 'dictation' ? existing.dictationErrorCount + 1 : existing.dictationErrorCount

    // 只有在【默写模式】下出现错误或偷看提示才加入错词本；
    // 在【跟学模式】下的输入错误完全不记录为错词；
    // 连续正确 3 次且在默写模式下，自动移出错词本
    let isError = existing.isError
    if (mode === 'dictation') {
      if (!isCorrect) {
        isError = true
      } else if (consecutive >= 3) {
        isError = false
      }
    }
    const isMastered = consecutive >= 3 || (isCorrect && mode === 'dictation')

    const updated: WordMasteryRecord = {
      ...existing,
      wordItem: wordItem || existing.wordItem,
      wordName: wordItem?.name || existing.wordName,
      totalPracticeCount: existing.totalPracticeCount + 1,
      dictationErrorCount: dictationErrors,
      consecutiveCorrectCount: consecutive,
      isError,
      isMastered,
      lastPracticedAt: now,
    }

    await repositories.wordRecords.put(updated)
    return updated
  } catch (err) {
    reportFailure(err, '记录练习结果')
  }
}

/**
 * 彻底消除单个生错词记录 (连续 3 次无误默写通关后调用)
 */
export async function eliminateErrorWord(wordId: string) {
  try {
    const repositories = getRepositories()
    const existing = await repositories.wordRecords.get(wordId)
    if (existing) {
      await repositories.wordRecords.update(wordId, {
        isError: false,
        isStarred: false,
        isMastered: true,
        consecutiveCorrectCount: 3,
        lastPracticedAt: Date.now(),
      })
    }
  } catch (err) {
    reportFailure(err, '更新错词本')
  }
}

/**
 * 手动从生错词本移除/删除单个生错词
 */
export async function removeErrorWord(wordId: string) {
  try {
    const repositories = getRepositories()
    const existing = await repositories.wordRecords.get(wordId)
    if (existing) {
      await repositories.wordRecords.update(wordId, {
        isError: false,
        isStarred: false,
        consecutiveCorrectCount: 0,
        lastPracticedAt: Date.now(),
      })
    }
  } catch (err) {
    reportFailure(err, '移出错词本')
  }
}

/**
 * 获取所有活跃待攻克的生错词（加星生词 + 默写错词）及完整信息
 */
export async function getActiveTroubleWords(): Promise<{ word: WordItem; record: WordMasteryRecord }[]> {
  try {
    const ops = cloudOps()
    const troubleRecords = ops
      ? await ops.getTroubleWordRecords()
      : (await getRepositories().wordRecords.getAll()).filter((r) => r.isError || r.isStarred)
    const result: { word: WordItem; record: WordMasteryRecord }[] = []

    for (const r of troubleRecords) {
      if (r.wordItem) {
        result.push({ word: r.wordItem, record: r })
      } else if (r.wordName) {
        result.push({
          word: {
            id: r.wordId,
            name: r.wordName,
            syllables: [r.wordName],
            posList: [],
          },
          record: r,
        })
      }
    }
    return result
  } catch (err) {
    reportFailure(err, '读取生错词本')
    return []
  }
}

/** 向前兼容 */
export const getActiveErrorWords = getActiveTroubleWords

/** 生词本里全部单词的 id（云模式由数据库函数一次返回，不受单次 1000 行上限影响） */
export async function getStarredWordIds(): Promise<string[]> {
  if (isCloudMode() && !getCloudAccountId()) return []
  const ops = cloudOps()
  if (ops) return ops.getStarredWordIds()
  const records = await getRepositories().wordRecords.getAll()
  return records.filter((record) => record.isStarred).map((record) => record.wordId)
}

/**
 * 切换单词生词本加星状态
 */
export async function toggleStarWord(wordId: string, bookId: string, wordItem?: WordItem): Promise<boolean> {
  try {
    const ops = cloudOps()
    if (ops) return await ops.toggleStarWord(wordId, bookId, wordItem)

    const repositories = getRepositories()
    const existing = await repositories.wordRecords.get(wordId)
    if (!existing) {
      await repositories.wordRecords.put({
        wordId,
        bookId,
        wordName: wordItem?.name,
        wordItem,
        isMastered: false,
        isStarred: true,
        isError: false,
        totalPracticeCount: 0,
        dictationErrorCount: 0,
        consecutiveCorrectCount: 0,
        lastPracticedAt: Date.now(),
      })
      return true
    }

    const nextStarred = !existing.isStarred
    await repositories.wordRecords.update(wordId, {
      isStarred: nextStarred,
      wordItem: wordItem || existing.wordItem,
      wordName: wordItem?.name || existing.wordName,
    })
    return nextStarred
  } catch (err) {
    reportFailure(err, '切换生词本')
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* 自定义词库                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 取出全部自定义词库，供导入时选择目标。
 *
 * 只返回自定义词库：官方词库的词是从 /dicts 下的 JSON 按需加载的，
 * 本地库里那条只是占位（setBookId 还会主动删掉它），写进去也不会被读出来。
 */
export async function getCustomBooks(): Promise<VocabularyBook[]> {
  try {
    const repositories = getRepositories()
    const custom = (await repositories.books.getCustom()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    )

    // 检查是否全为历史测试产生的多余重复默认生词本（如开发测试时产生的多个同名“我的自定义生词本”或临时记录）。
    // 「翻译工具收藏」词库（book_custom_collected 及按账号的 book_custom_collected_<账号>）是真实数据，
    // 一旦出现就不算冗余；云模式下 custom 只含当前账号可见的词库，清理也只作用于这些。
    const isRedundantLegacyTest =
      custom.length > 1 &&
      custom.every(
        (b) => b.name === '我的自定义生词本' || b.id === DEFAULT_SAMPLE_CUSTOM_BOOK.id
      )

    if (repositories.mode === 'cloud') {
      // 云端示例词库 id 固定，可能已被别的账号作为个人内容上传：只补插、不覆盖；
      // 也不做旧测试数据清理，那些可能是别的账号的共享词库，删了会连带清掉所有账号在该库上的进度
      if (custom.length > 0) return custom
      await cloudMigration.insertBooks([DEFAULT_SAMPLE_CUSTOM_BOOK])
      const sample = await repositories.books.get(DEFAULT_SAMPLE_CUSTOM_BOOK.id)
      return sample ? [sample] : []
    }

    // 若无数据或仅有旧测试产生的冗余条目，仅保留并呈现 1 个官方标准示例词库
    if (custom.length === 0 || isRedundantLegacyTest) {
      if (isRedundantLegacyTest) {
        for (const b of custom) {
          if (b.id !== DEFAULT_SAMPLE_CUSTOM_BOOK.id) {
            await repositories.books.delete(b.id).catch(() => { })
            await repositories.unitProgress.deleteByBook(b.id).catch(() => { })
          }
        }
      }
      await repositories.books.put(DEFAULT_SAMPLE_CUSTOM_BOOK)
      return [DEFAULT_SAMPLE_CUSTOM_BOOK]
    }

    return custom
  } catch (err) {
    reportFailure(err, '读取自定义词库')
    return isCloudMode() ? [] : [DEFAULT_SAMPLE_CUSTOM_BOOK]
  }
}

/**
 * 把导入的单词并进已有词库：同名单词覆盖原条目，新词追加到末尾。
 *
 * 同名的判断直接用 id，它由拼写派生（见 buildWordId），所以"已存在"就是"拼写相同"。
 * 覆盖时保留原有位置，否则重新导入一遍会打乱整本书的顺序，章节划分跟着全变。
 */
export async function mergeWordsIntoBook(bookId: string, words: WordItem[]) {
  try {
    const repositories = getRepositories()
    const ops = cloudOps()
    if (ops) {
      // 云端在一条事务里合并，多设备同时导入/收词不会互相覆盖
      const result = await ops.mergeWordsIntoBook(bookId, words)
      if (!result) return null
      const book = await repositories.books.get(bookId)
      if (!book) return null
      return { book, updated: result.updated, added: result.added }
    }

    const book = await repositories.books.get(bookId)
    if (!book) return null

    const merged = [...(book.words || [])]
    const indexById = new Map(merged.map((word, index) => [word.id, index]))
    let updated = 0
    let added = 0

    for (const word of words) {
      const at = indexById.get(word.id)
      if (at === undefined) {
        indexById.set(word.id, merged.length)
        merged.push(word)
        added++
      } else {
        merged[at] = word
        updated++
      }
    }

    const nextBook: VocabularyBook = {
      ...book,
      words: merged,
      totalWords: merged.length,
      updatedAt: Date.now(),
    }

    await repositories.books.put(nextBook)
    return { book: nextBook, updated, added }
  } catch (err) {
    reportFailure(err, '并入词库')
    return null
  }
}

export type ImportSkipReason = 'not-owned' | 'not-shared' | 'missing'

export interface ImportIntoBookResult {
  book: VocabularyBook | null
  added: number
  updated: number
  /** 没有写入的单词数（目标词库不符合所选归属，或已被删除） */
  skipped: number
  skipReason?: ImportSkipReason
}

/**
 * 重新导入：把单词并进已有词库。已有的词按新数据更新（保留原位置），没有的追加，文件里没有的旧词保留。
 *
 * 云模式下按所选归属处理（visibility 必传）：
 * - 「共享」：目标必须是共享词库，任何账号都能更新或新增；
 * - 「个人」：目标必须是当前账号的个人词库；
 * 不符合的整批跳过并计数，由调用方提示用户，不会写入也不会报 23514。
 * 数据库读写失败时抛出，由调用方提示。
 */
export async function importWordsIntoBook(
  bookId: string,
  words: WordItem[],
  visibility?: ContentVisibility
): Promise<ImportIntoBookResult> {
  const skipAll = (book: VocabularyBook | null, skipReason: ImportSkipReason): ImportIntoBookResult => ({
    book,
    added: 0,
    updated: 0,
    skipped: words.length,
    skipReason,
  })
  const ops = cloudOps()
  if (!ops) {
    const result = await mergeWordsIntoBook(bookId, words)
    return result ? { ...result, skipped: 0 } : skipAll(null, 'missing')
  }

  const repositories = getRepositories()
  const book = await repositories.books.get(bookId)
  if (!book) return skipAll(null, 'missing')
  const owner = book.accountId ?? null
  if (visibility === 'shared' ? owner !== null : owner !== getCloudAccountId()) {
    return skipAll(book, visibility === 'shared' ? 'not-shared' : 'not-owned')
  }
  const merged = await ops.mergeWordsIntoBook(bookId, words)
  // 读到之后被别的账号删除或改成个人：数据库函数返回 NULL，同样跳过
  if (!merged) return skipAll(book, 'not-owned')
  const updatedBook = (await repositories.books.get(bookId)) ?? book
  return { book: updatedBook, added: merged.added, updated: merged.updated, skipped: 0 }
}

/**
 * 把 AI 补全的字段写回自定义词库里的这个词（官方词库是本地 JSON，不写）。
 *
 * 本地模式写本机词库；云模式写数据库，只写共享词库或自己的个人词库，按单词走 merge_words_into_book，
 * 不整本覆盖。失败只提示，不重试。
 */
export async function applyAiFillToCustomBook(
  bookId: string | undefined,
  wordId: string,
  patch: Partial<WordItem>
): Promise<boolean> {
  const fields = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<WordItem>
  if (!bookId || Object.keys(fields).length === 0) return false
  try {
    const repositories = getRepositories()
    const book = await repositories.books.get(bookId)
    if (!book?.isCustom) return false
    const index = (book.words ?? []).findIndex((w) => w.id === wordId)
    if (index < 0) return false
    const updatedWord = { ...book.words![index], ...fields }

    const ops = cloudOps()
    if (!ops) {
      await db.transaction('rw', db.books, async () => {
        const latest = await db.books.get(bookId)
        if (!latest?.words) return
        const at = latest.words.findIndex((w) => w.id === wordId)
        if (at < 0) return
        const words = [...latest.words]
        words[at] = { ...words[at], ...fields }
        await db.books.put({ ...latest, words, updatedAt: Date.now() })
      })
      return true
    }

    const owner = book.accountId ?? null
    if (owner !== null && owner !== getCloudAccountId()) return false
    return (await ops.mergeWordsIntoBook(bookId, [updatedWord])) !== null
  } catch (err) {
    reportFailure(err, '保存 AI 补全结果')
    return false
  }
}

/**
 * 保存自定义新词库
 *
 * accountId 只在云模式下有意义：null = 共享给所有账号，账号 id = 个人词库。
 */
export async function saveCustomVocabularyBook(
  name: string,
  description: string,
  words: WordItem[],
  accountId?: ContentAccountId
) {
  const newBook: VocabularyBook = {
    id: `book_custom_${Date.now()}`,
    ...(accountId !== undefined ? { accountId } : {}),
    name: name.trim() || '自定义生词本',
    description: description.trim() || '用户自定义导入词库',
    category: 'custom',
    isCustom: true,
    unitSize: 20,
    totalWords: words.length,
    words,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await getRepositories().books.put(newBook)
  return newBook
}

/**
 * 删除用户自定义词库及关联的章节进度数据
 * 内置/官方词库受到保护，无法被删除
 */
export async function deleteCustomVocabularyBook(bookId: string): Promise<boolean> {
  try {
    const repositories = getRepositories()
    const book = await repositories.books.get(bookId)
    // 保护：仅允许删除明确标记为自定义的词库
    if (!book || !book.isCustom) return false

    // 1. 删除词库主体
    await repositories.books.delete(bookId)

    // 2. 级联清理该词库的所有单元学习进度记录
    await repositories.unitProgress.deleteByBook(bookId)

    return true
  } catch (err) {
    reportFailure(err, '删除词库')
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* 单元进度                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 读取某个语义单元在某个练习模式下的断点存档。
 *
 * 返回 undefined 代表这个单元从没被真正练过（只浏览过不算）。
 */
export async function getUnitProgressRecord(
  unitId: string,
  mode: PracticeMode
): Promise<UnitProgressRecord | undefined> {
  if (!unitId || typeof window === 'undefined') return undefined
  try {
    return await getRepositories().unitProgress.get(unitId, mode)
  } catch (err) {
    reportFailure(err, '读取单元进度')
    return undefined
  }
}

/** 词库内容更新后，用当前单元成员修剪历史进度并重新计算完成状态。 */
export async function reconcileUnitProgressRecord(params: {
  bookId: string
  unitId: string
  mode: PracticeMode
  unitWordIds: string[]
}): Promise<UnitProgressRecord | undefined> {
  const { bookId, unitId, mode, unitWordIds } = params
  if (!unitId || unitWordIds.length === 0 || typeof window === 'undefined') return undefined

  try {
    return await runInUnitProgressTransaction(async () => {
      const repositories = getRepositories()
      const existing = await repositories.unitProgress.get(unitId, mode)
      if (!existing) return undefined

      const currentIds = new Set(unitWordIds)
      const completedWordIds = existing.completedWordIds.filter((id) => currentIds.has(id))
      const retryWordIds = existing.retryWordIds.filter((id) => currentIds.has(id))
      const completed = new Set(completedWordIds)
      const isCompleted =
        retryWordIds.length === 0 && unitWordIds.every((id) => completed.has(id))
      const record: UnitProgressRecord = {
        ...existing,
        bookId,
        status: isCompleted ? 'completed' : 'in_progress',
        currentWordIndex: Math.min(existing.currentWordIndex, unitWordIds.length - 1),
        completedWordIds,
        retryWordIds,
        isRetrying: !isCompleted && retryWordIds.length > 0 && existing.isRetrying === true,
        completedAt: isCompleted ? existing.completedAt : undefined,
      }
      // 云模式下没有事务保护，内容没变就不回写，避免把并发完成的词覆盖掉
      const unchanged =
        record.status === existing.status &&
        record.currentWordIndex === existing.currentWordIndex &&
        record.isRetrying === (existing.isRetrying ?? false) &&
        record.completedAt === existing.completedAt &&
        JSON.stringify(record.completedWordIds) === JSON.stringify(existing.completedWordIds) &&
        JSON.stringify(record.retryWordIds) === JSON.stringify(existing.retryWordIds)
      if (unchanged && existing.bookId === bookId) return existing
      await repositories.unitProgress.put(record)
      return record
    })
  } catch (err) {
    reportFailure(err, '更新单元进度')
    return undefined
  }
}

/** 读取一本词库在指定模式下的全部真实单元进度。 */
export async function getBookUnitProgressRecords(
  bookId: string,
  mode: PracticeMode
): Promise<UnitProgressRecord[]> {
  if (!bookId || typeof window === 'undefined') return []
  try {
    const records = await getRepositories().unitProgress.getByBook(bookId)
    return records.filter((record) => record.mode === mode)
  } catch (err) {
    reportFailure(err, '读取单元进度')
    return []
  }
}

/** 将默写出错或偷看的单词放回本单元待重考队列。 */
export async function markUnitWordForRetry(params: {
  bookId: string
  unitId: string
  mode: PracticeMode
  wordId: string
  wordIndex: number
}): Promise<UnitProgressRecord | null> {
  const { bookId, unitId, mode, wordId, wordIndex } = params
  if (!unitId || !wordId || typeof window === 'undefined') return null

  try {
    const ops = cloudOps()
    if (ops) return await ops.markUnitWordForRetry({ bookId, unitId, mode, wordId, wordIndex })

    return await runInUnitProgressTransaction(async () => {
      const repositories = getRepositories()
      const existing = await repositories.unitProgress.get(unitId, mode)
      const now = Date.now()
      const record: UnitProgressRecord = {
        unitId,
        bookId,
        mode,
        status: 'in_progress',
        currentWordIndex: Math.max(existing?.currentWordIndex ?? 0, wordIndex),
        completedWordIds: (existing?.completedWordIds ?? []).filter((id) => id !== wordId),
        retryWordIds: Array.from(new Set([...(existing?.retryWordIds ?? []), wordId])),
        isRetrying: existing?.isRetrying ?? false,
        startedAt: existing?.startedAt ?? now,
        lastStudiedAt: now,
      }
      await repositories.unitProgress.put(record)
      return record
    })
  } catch (err) {
    reportFailure(err, '保存单元进度')
    return null
  }
}

/**
 * 标记单元内的一个单词「真正被敲完」。
 *
 * 这是 unitProgress 唯一的写入入口：只有用户在练习区逐字拼对这个词、
 * 并打满当前循环次数（与「达到消灭标准」同一时刻）才会调用。
 * 单纯浏览、按切换键翻词、加星、重放发音、偷看提示都不经过这里。
 *
 * 读改写放在一个事务里，避免连续完成多个词时互相覆盖。
 */
export async function markUnitWordCompleted(params: {
  bookId: string
  unitId: string
  mode: PracticeMode
  wordId: string
  /** 该词在单元内的下标，用来推进断点 */
  wordIndex: number
  /** 当前单元的实际词 ID，用集合覆盖而非历史计数判断完成 */
  unitWordIds: string[]
  /** 首轮出错的词暂不计完成，留到单元末尾重考 */
  deferForRetry?: boolean
}): Promise<UnitProgressRecord | null> {
  const { bookId, unitId, mode, wordId, wordIndex, unitWordIds, deferForRetry = false } = params
  if (!unitId || !wordId || unitWordIds.length === 0 || typeof window === 'undefined') return null

  try {
    const ops = cloudOps()
    if (ops) {
      return await ops.markUnitWordCompleted({
        bookId,
        unitId,
        mode,
        wordId,
        wordIndex,
        unitWordIds,
        deferForRetry,
      })
    }

    return await runInUnitProgressTransaction(async () => {
      const repositories = getRepositories()
      const existing = await repositories.unitProgress.get(unitId, mode)
      const now = Date.now()
      const currentWordIds = new Set(unitWordIds)
      const completed = new Set(
        (existing?.completedWordIds ?? []).filter((id) => currentWordIds.has(id))
      )
      const retry = new Set(
        (existing?.retryWordIds ?? []).filter((id) => currentWordIds.has(id))
      )

      if (deferForRetry) {
        completed.delete(wordId)
        retry.add(wordId)
      } else {
        completed.add(wordId)
        retry.delete(wordId)
      }

      const completedWordIds = Array.from(completed)
      const retryWordIds = Array.from(retry)
      const isUnitCompleted =
        retryWordIds.length === 0 && unitWordIds.every((id) => completed.has(id))
      const nextWordIndex = Math.min(wordIndex + 1, unitWordIds.length - 1)
      const isRetrying =
        !isUnitCompleted &&
        (existing?.isRetrying === true ||
          (wordIndex >= unitWordIds.length - 1 && retryWordIds.length > 0))

      const record: UnitProgressRecord = {
        unitId,
        bookId,
        mode,
        status: isUnitCompleted ? 'completed' : 'in_progress',
        // 断点只前进不后退：回头重练前面的词不会把存档拉回去
        currentWordIndex: Math.max(existing?.currentWordIndex ?? 0, nextWordIndex),
        completedWordIds,
        retryWordIds,
        isRetrying,
        startedAt: existing?.startedAt ?? now,
        lastStudiedAt: now,
        completedAt: isUnitCompleted ? existing?.completedAt ?? now : undefined,
      }

      await repositories.unitProgress.put(record)
      return record
    })
  } catch (err) {
    reportFailure(err, '保存单元进度')
    return null
  }
}

/**
 * 清空某个单元在某个模式下的练习存档，「重做本单元」时调用。
 *
 * 不清的话，重做过程中刷新页面会被旧存档顶回重做前的位置。
 */
export async function clearUnitProgress(unitId: string, mode: PracticeMode): Promise<void> {
  if (!unitId || typeof window === 'undefined') return
  try {
    await getRepositories().unitProgress.delete(unitId, mode)
  } catch (err) {
    reportFailure(err, '清空单元进度')
  }
}

/* -------------------------------------------------------------------------- */
/* AI 字典单词缓存（永远只在本地：可由内置词库重建，不入库、不同步）            */
/* -------------------------------------------------------------------------- */

/**
 * 从 AI 单词缓存表中查询单词（大小写不敏感匹配）
 */
export async function getWordFromAiCache(cleanWord: string): Promise<WordItem | null> {
  if (!cleanWord || typeof window === 'undefined') return null
  try {
    const lower = cleanWord.trim().toLowerCase()
    const directId = buildWordId(lower)

    // 1. 优先根据确定性 wordId 直查
    const byId = await db.aiWordCache.get(directId)
    if (byId) return byId

    // 2. 备选：根据 name 字段做大小写不敏感匹配
    const byName = await db.aiWordCache
      .where('name')
      .equalsIgnoreCase(lower)
      .first()

    return byName || null
  } catch (err) {
    console.warn('Failed to query AI word cache:', err)
    return null
  }
}

/**
 * 将 AI 字典生成的 WordItem 存入缓存表
 */
export async function saveWordToAiCache(wordItem: WordItem): Promise<void> {
  if (!wordItem?.name || typeof window === 'undefined') return
  try {
    const canonicalId = buildWordId(wordItem.name)
    await db.aiWordCache.put({
      ...wordItem,
      id: canonicalId,
    })
  } catch (err) {
    console.warn('Failed to save word to AI cache:', err)
  }
}

type AiWordCachePatch = Omit<Partial<WordItem>, 'aiSections'> &
  Pick<WordItem, 'name'> & {
    aiSections?: Partial<NonNullable<WordItem['aiSections']>>
  }

/** 原子合并 AI 分阶段结果，避免并发请求互相覆盖。 */
export async function mergeWordIntoAiCache(
  patch: AiWordCachePatch,
  fallback?: WordItem
): Promise<WordItem | null> {
  if (!patch.name || typeof window === 'undefined') return null

  try {
    const canonicalId = buildWordId(patch.name)
    const applyMerge = async () => {
        const existing = (await db.aiWordCache.get(canonicalId)) || fallback
        if (!existing) return null

        const mergeStatus = (
          current: NonNullable<WordItem['aiSections']>[keyof NonNullable<WordItem['aiSections']>] | undefined,
          next: NonNullable<WordItem['aiSections']>[keyof NonNullable<WordItem['aiSections']>] | undefined
        ) => next ?? current

        const merged: WordItem = {
          ...existing,
          ...patch,
          id: canonicalId,
          aiSections: patch.aiSections
            ? {
              syllables: mergeStatus(
                existing.aiSections?.syllables,
                patch.aiSections.syllables
              ),
              examples: mergeStatus(
                existing.aiSections?.examples,
                patch.aiSections.examples
              ),
              phrases: mergeStatus(
                existing.aiSections?.phrases,
                patch.aiSections.phrases
              ),
              etymology: mergeStatus(
                existing.aiSections?.etymology,
                patch.aiSections.etymology
              ),
            }
            : existing.aiSections,
        }
        await db.aiWordCache.put(merged)
        const record = await getWordRecord(canonicalId)
        if (record?.wordItem) {
          const recordWord: WordItem = {
            ...record.wordItem,
            ...patch,
            id: canonicalId,
            name: merged.name,
            aiSections: merged.aiSections,
          }
          await updateWordRecord(canonicalId, {
            wordName: merged.name,
            wordItem: recordWord,
          })
        }
        return merged
    }

    // 云模式下单词记录在远端，不能包在 Dexie 事务里（网络 await 会提前提交事务）
    if (isCloudMode()) return await applyMerge()
    return await db.transaction(
      'rw',
      db.aiWordCache,
      db.wordRecords,
      applyMerge
    )
  } catch (err) {
    console.warn('Failed to merge AI word cache:', err)
    return null
  }
}

/**
 * 前缀检索 AI 缓存中的单词（用于搜索下拉建议）
 */
export async function searchWordsInAiCache(
  prefix: string,
  limit: number = 6
): Promise<WordItem[]> {
  if (!prefix || typeof window === 'undefined') return []
  try {
    const lower = prefix.trim().toLowerCase()
    return await db.aiWordCache
      .where('name')
      .startsWithIgnoreCase(lower)
      .limit(limit)
      .toArray()
  } catch {
    return []
  }
}

/**
 * 清空 AI 字典缓存
 */
export async function clearAiWordCache(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await db.aiWordCache.clear()
  } catch (err) {
    console.warn('Failed to clear AI word cache:', err)
  }
}

/**
 * 获取本地离线单词缓存表中的总条目数
 */
export async function getAiWordCacheCount(): Promise<number> {
  if (typeof window === 'undefined') return 0
  try {
    return await db.aiWordCache.count()
  } catch (err) {
    console.warn('Failed to count AI word cache:', err)
    return 0
  }
}

/**
 * 手动维护能力：正常查询、收藏和导入流程不会调用。
 */
export async function deleteWordFromAiCache(cleanWord: string): Promise<void> {
  if (!cleanWord || typeof window === 'undefined') return
  try {
    const lower = cleanWord.trim().toLowerCase()
    const directId = buildWordId(lower)
    await db.aiWordCache.delete(directId)
    // 防御性清除以 name 匹配的条目
    await db.aiWordCache.filter((item) => item.name?.toLowerCase() === lower).delete()
  } catch (err) {
    console.warn('Failed to delete word from AI cache:', err)
  }
}

/**
 * 批量从 AI 缓存表中删除单词
 */
export async function deleteWordsFromAiCache(wordNames: string[]): Promise<void> {
  if (!wordNames?.length || typeof window === 'undefined') return
  try {
    const lowerNames = wordNames.map((w) => w.trim().toLowerCase()).filter(Boolean)
    if (!lowerNames.length) return

    const ids = lowerNames.map((w) => buildWordId(w))
    await db.aiWordCache.bulkDelete(ids)

    const lowerSet = new Set(lowerNames)
    await db.aiWordCache.filter((item) => lowerSet.has(item.name?.toLowerCase())).delete()
  } catch (err) {
    console.warn('Failed to bulk delete words from AI cache:', err)
  }
}
