/**
 * 本地模式数据到数据库的手动同步（设置 → 数据同步 → 同步）。
 *
 * 本地与数据库之间只有这两个手动操作，没有任何自动同步；都可以重复执行，都只做加法：
 * - 同步资料：自定义词库、翻译句库、阅读文章。数据库没有的新增（归属按用户选择）；
 *   已有的按导入规则更新、追加（同 id 的条目用本地覆盖，新条目追加，数据库里多出来的保留）；
 *   别人的个人内容跳过并计数。示例词库保持原规则：只在数据库没有时新增。
 * - 同步进度：错词本 / 生词记录、单元进度、书内位置、学习位置里的已学词根、翻译完成记录，写到当前账号。
 *   合并规则见各函数注释，原则是只增不减，不用更旧、更少的本地数据冲掉数据库里的进度。
 *
 * 读取的始终是本地模式那份数据（IndexedDB 与 localStorage 原 key）。
 */
import { localRepositories } from '@/db/repository'
import type { BookModeEntry } from '@/db/repository'
import { importWordsIntoBook } from '@/db'
import type {
  PracticeMode,
  TranslationBook,
  TranslationSentenceItem,
  UnitProgressRecord,
  WordMasteryRecord,
} from '@/types'
import type { ReadingArticle } from '@/resources/readingData'
import { DEFAULT_SAMPLE_CUSTOM_BOOK } from '@/resources/books'
import { cloudMigration, cloudRepositories } from './supabaseRepository'
import { CloudRequestError } from './client'
import { getCloudAccountId } from './config'
import { readLocalPersistedState } from './scopedStorage'
import type { ContentVisibility } from './visibility'

const READING_STORAGE_KEY = 'lingualoop_reading_articles_v1'
const WORKSPACE_STORAGE_KEY = 'lingualoop-workspace-storage'
const TRANSLATE_STORAGE_KEY = 'lingualoop-translate-storage'
const PRACTICE_MODES: PracticeMode[] = ['learn', 'dictation', 'phonetic']

export type { ContentVisibility }

export interface SyncCounts {
  added: number
  updated: number
  skipped: number
}

const emptyCounts = (): SyncCounts => ({ added: 0, updated: 0, skipped: 0 })

export interface ContentSyncResult {
  books: SyncCounts
  /** 已有词库里更新 / 追加的单词数 */
  words: { added: number; updated: number }
  translateBooks: SyncCounts
  sentences: { added: number; updated: number }
  articles: SyncCounts
}

export interface ProgressSyncResult {
  wordRecords: SyncCounts
  unitProgress: SyncCounts
  bookProgress: SyncCounts
  appState: SyncCounts
  translateCompleted: SyncCounts
}

function requireAccount(): string {
  const accountId = getCloudAccountId()
  if (!accountId) throw new Error('请先登录账号再同步。')
  return accountId
}

function readLocalReadingArticles(): ReadingArticle[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(READING_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ReadingArticle[]).filter((a) => a?.isCustom && a.id) : []
  } catch {
    return []
  }
}

function readLocalTranslateBooks(): TranslationBook[] {
  const translate = readLocalPersistedState(TRANSLATE_STORAGE_KEY)
  return (Array.isArray(translate.books) ? (translate.books as TranslationBook[]) : []).filter(
    (book) => book?.isCustom && book.id
  )
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([k, v]) => [k, canonical(v)])
  )
}

/** 与键顺序（jsonb 会重排）、值为空的键无关的深比较 */
function sameRecord(a: object, b: object): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

function union(base: string[] = [], extra: string[] = []): string[] {
  const seen = new Set(base)
  return [...base, ...extra.filter((id) => !seen.has(id) && (seen.add(id), true))]
}

/** 同 id 用本地覆盖、新的追加、数据库多出来的保留；返回合并结果与新增 / 更新数量 */
function mergeById<T extends { id: string }>(remote: T[], local: T[]) {
  const merged = [...remote]
  const indexById = new Map(remote.map((item, index) => [item.id, index]))
  let added = 0
  let updated = 0
  for (const item of local) {
    const at = indexById.get(item.id)
    if (at === undefined) {
      indexById.set(item.id, merged.length)
      merged.push(item)
      added += 1
    } else if (!sameRecord(merged[at], item)) {
      merged[at] = item
      updated += 1
    }
  }
  return { merged, added, updated }
}

/* -------------------------------------------------------------------------- */
/* 同步资料                                                                    */
/* -------------------------------------------------------------------------- */

export async function syncLocalContentToCloud(visibility: ContentVisibility): Promise<ContentSyncResult> {
  const accountId = requireAccount()
  const owner = visibility === 'personal' ? accountId : null
  const result: ContentSyncResult = {
    books: emptyCounts(),
    words: { added: 0, updated: 0 },
    translateBooks: emptyCounts(),
    sentences: { added: 0, updated: 0 },
    articles: emptyCounts(),
  }

  // ---------------- 自定义词库：已有的走与导入相同的 merge_words_into_book ----------------
  for (const book of await localRepositories.books.getCustom()) {
    const remote = await cloudRepositories.books.get(book.id)
    if (!remote) {
      // 数据库没有、或是别人的个人词库（看不到，插入被主键挡住）
      const inserted = await cloudMigration.insertBooks([{ ...book, accountId: owner }])
      if (inserted) result.books.added += 1
      else result.books.skipped += 1
      continue
    }
    if (book.id === DEFAULT_SAMPLE_CUSTOM_BOOK.id) continue
    const remoteOwner = remote.accountId ?? null
    if (remoteOwner !== null && remoteOwner !== accountId) {
      result.books.skipped += 1
      continue
    }
    // 只提交与数据库不同的词，重复同步时不把没变的词算作更新
    const remoteWords = new Map((remote.words ?? []).map((word) => [word.id, word]))
    const changed = (book.words ?? []).filter((word) => {
      const existing = remoteWords.get(word.id)
      return !existing || !sameRecord(existing, word)
    })
    if (!changed.length) continue
    const merged = await importWordsIntoBook(book.id, changed, remoteOwner === null ? 'shared' : 'personal')
    if (merged.skipped > 0) {
      result.books.skipped += 1
      continue
    }
    result.words.added += merged.added
    result.words.updated += merged.updated
    if (merged.added || merged.updated) result.books.updated += 1
  }

  // ---------------- 翻译句库：按句子 id 合并 ----------------
  const localTranslate = readLocalTranslateBooks()
  if (localTranslate.length) {
    const visible = new Map((await cloudRepositories.translate.getBooks()).map((book) => [book.id, book]))
    for (const book of localTranslate) {
      const remote = visible.get(book.id)
      if (!remote) {
        const inserted = await cloudMigration.insertTranslateBooks([{ ...book, accountId: owner }])
        if (inserted) result.translateBooks.added += 1
        else result.translateBooks.skipped += 1
        continue
      }
      const remoteOwner = remote.accountId ?? null
      if (remoteOwner !== null && remoteOwner !== accountId) {
        result.translateBooks.skipped += 1
        continue
      }
      const { merged, added, updated } = mergeById<TranslationSentenceItem>(remote.sentences ?? [], book.sentences ?? [])
      if (!added && !updated) continue
      await cloudRepositories.translate.putBook({
        ...remote,
        sentences: merged,
        totalSentences: merged.length,
        updatedAt: Date.now(),
      })
      result.translateBooks.updated += 1
      result.sentences.added += added
      result.sentences.updated += updated
    }
  }

  // ---------------- 阅读文章：一篇是一个条目，已有的用本地内容更新 ----------------
  const localArticles = readLocalReadingArticles()
  if (localArticles.length) {
    const visible = new Map((await cloudRepositories.reading.getArticles()).map((article) => [article.id, article]))
    for (const article of localArticles) {
      const remote = visible.get(article.id)
      if (!remote) {
        const inserted = await cloudMigration.insertReadingArticles([{ ...article, accountId: owner }])
        if (inserted) result.articles.added += 1
        else result.articles.skipped += 1
        continue
      }
      const remoteOwner = remote.accountId ?? null
      if (remoteOwner !== null && remoteOwner !== accountId) {
        result.articles.skipped += 1
        continue
      }
      const next: ReadingArticle = { ...article, accountId: remoteOwner }
      const remoteFields = Object.fromEntries(
        Object.keys(next).map((key) => [key, (remote as unknown as Record<string, unknown>)[key]])
      )
      if (sameRecord(remoteFields, next)) continue
      await cloudRepositories.reading.putArticle(next)
      result.articles.updated += 1
    }
  }

  return result
}

/* -------------------------------------------------------------------------- */
/* 同步进度                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 单词记录，不比较时间，只增不减：
 * 累计练习次数、默写错误次数、连续答对次数取较大值；错词、生词、已掌握取「任一方为真」；最后练习时间取较晚的。
 */
export function mergeWordRecord(remote: WordMasteryRecord, local: WordMasteryRecord): WordMasteryRecord {
  return {
    ...remote,
    wordName: remote.wordName ?? local.wordName,
    wordItem: remote.wordItem ?? local.wordItem,
    isStarred: remote.isStarred || local.isStarred,
    isMastered: remote.isMastered || local.isMastered,
    totalPracticeCount: Math.max(remote.totalPracticeCount ?? 0, local.totalPracticeCount ?? 0),
    dictationErrorCount: Math.max(remote.dictationErrorCount ?? 0, local.dictationErrorCount ?? 0),
    isError: remote.isError || local.isError,
    consecutiveCorrectCount: Math.max(remote.consecutiveCorrectCount ?? 0, local.consecutiveCorrectCount ?? 0),
    lastPracticedAt: Math.max(remote.lastPracticedAt ?? 0, local.lastPracticedAt ?? 0),
  }
}

/**
 * 单元进度：已完成的词取并集；任一方已完成则为已完成（重考列表用已完成那一方的）；
 * 当前位置取较大值；开始时间取较早、最近学习时间取较晚。
 * 同一单元在数据库里挂在别的书下时返回 null（跳过）。
 */
export function mergeUnitProgress(remote: UnitProgressRecord, local: UnitProgressRecord): UnitProgressRecord | null {
  if (remote.bookId !== local.bookId) return null
  const completedWordIds = union(remote.completedWordIds, local.completedWordIds)
  const remoteDone = remote.status === 'completed'
  const localDone = local.status === 'completed'
  const done = remoteDone || localDone
  const minDefined = (a?: number, b?: number) =>
    a === undefined ? b : b === undefined ? a : Math.min(a, b)
  const maxDefined = (a?: number, b?: number) =>
    a === undefined ? b : b === undefined ? a : Math.max(a, b)
  return {
    ...remote,
    status: done
      ? 'completed'
      : remote.status === 'in_progress' || local.status === 'in_progress' || completedWordIds.length > 0
        ? 'in_progress'
        : 'not_started',
    currentWordIndex: Math.max(remote.currentWordIndex ?? 0, local.currentWordIndex ?? 0),
    completedWordIds,
    retryWordIds: done
      ? (remoteDone ? remote.retryWordIds : local.retryWordIds) ?? []
      : union(remote.retryWordIds, local.retryWordIds),
    isRetrying: done
      ? remote.isRetrying === undefined ? undefined : false
      : remote.isRetrying || local.isRetrying ? true : remote.isRetrying,
    startedAt: minDefined(remote.startedAt, local.startedAt),
    lastStudiedAt: maxDefined(remote.lastStudiedAt, local.lastStudiedAt),
    completedAt: done
      ? minDefined(remoteDone ? remote.completedAt : undefined, localDone ? local.completedAt : undefined)
      : undefined,
  }
}

const unitKey = (record: Pick<UnitProgressRecord, 'unitId' | 'mode'>) => `${record.unitId}\u0000${record.mode}`
const isMoveRejected = (error: unknown) => error instanceof CloudRequestError && error.code === '23514'

/** 批量写入；遇到「单元已属于别的书」（23514）时逐条重写，被拒的计为跳过 */
async function writeUnitProgress(records: UnitProgressRecord[]): Promise<number> {
  try {
    await cloudMigration.upsertUnitProgress(records)
    return 0
  } catch (error) {
    if (!isMoveRejected(error)) throw error
  }
  let rejected = 0
  for (const record of records) {
    try {
      await cloudMigration.upsertUnitProgress([record])
    } catch (error) {
      if (!isMoveRejected(error)) throw error
      rejected += 1
    }
  }
  return rejected
}

export async function syncLocalProgressToCloud(): Promise<ProgressSyncResult> {
  requireAccount()
  const result: ProgressSyncResult = {
    wordRecords: emptyCounts(),
    unitProgress: emptyCounts(),
    bookProgress: emptyCounts(),
    appState: emptyCounts(),
    translateCompleted: emptyCounts(),
  }
  const now = Date.now()

  // ---------------- 错词本 / 生词记录 ----------------
  const localRecords = await localRepositories.wordRecords.getAll()
  if (localRecords.length) {
    const remote = new Map((await cloudRepositories.wordRecords.getAll()).map((r) => [r.wordId, r]))
    const toInsert: WordMasteryRecord[] = []
    const toUpdate: WordMasteryRecord[] = []
    for (const local of localRecords) {
      const existing = remote.get(local.wordId)
      if (!existing) {
        toInsert.push(local)
        continue
      }
      const merged = mergeWordRecord(existing, local)
      if (!sameRecord(merged, existing)) toUpdate.push(merged)
    }
    result.wordRecords.added = await cloudMigration.insertWordRecords(toInsert)
    if (toUpdate.length) await cloudMigration.upsertWordRecords(toUpdate)
    result.wordRecords.updated = toUpdate.length
  }

  // ---------------- 单元进度（官方词库 + 自定义词库） ----------------
  const localUnits = await localRepositories.unitProgress.getAll()
  if (localUnits.length) {
    const remote = new Map((await cloudRepositories.unitProgress.getAll()).map((r) => [unitKey(r), r]))
    const toInsert: UnitProgressRecord[] = []
    const toUpdate: UnitProgressRecord[] = []
    for (const local of localUnits) {
      const existing = remote.get(unitKey(local))
      if (!existing) {
        toInsert.push(local)
        continue
      }
      const merged = mergeUnitProgress(existing, local)
      if (!merged) result.unitProgress.skipped += 1
      else if (!sameRecord(merged, existing)) toUpdate.push(merged)
    }
    if (toInsert.length) {
      const rejected = await writeUnitProgress(toInsert)
      result.unitProgress.added = toInsert.length - rejected
      result.unitProgress.skipped += rejected
    }
    if (toUpdate.length) {
      const rejected = await writeUnitProgress(toUpdate)
      result.unitProgress.updated = toUpdate.length - rejected
      result.unitProgress.skipped += rejected
    }
  }

  // ---------------- 书内位置（取较大值）与学习位置 ----------------
  const workspace = readLocalPersistedState(WORKSPACE_STORAGE_KEY)
  const remoteState = await cloudRepositories.appState.get()
  const remoteModes = remoteState?.bookModeProgress ?? {}
  const modeChanges: BookModeEntry[] = []
  for (const entry of readLocalBookModes(workspace.bookModeProgress, now)) {
    const current = remoteModes[entry.bookId]?.[entry.mode] ?? 0
    if (entry.unitIndex <= current) continue
    modeChanges.push(entry)
    if (current > 0) result.bookProgress.updated += 1
    else result.bookProgress.added += 1
  }
  await cloudRepositories.appState.putBookModes(modeChanges)

  const localRootIds = Array.isArray(workspace.learnedRootIds)
    ? (workspace.learnedRootIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  if (!remoteState || !remoteState.updatedAt) {
    // 数据库还没有学习位置：用本地的位置、循环次数和已学词根
    const hasLocalState =
      typeof workspace.currentBookId === 'string' || localRootIds.length > 0 || workspace.loopCounts !== undefined
    if (hasLocalState) {
      await cloudRepositories.appState.put({
        currentBookId: typeof workspace.currentBookId === 'string' ? workspace.currentBookId : undefined,
        currentUnitIndex: typeof workspace.currentUnitIndex === 'number' ? workspace.currentUnitIndex : 0,
        bookModeProgress: {},
        loopCounts: (workspace.loopCounts as Record<string, unknown>) ?? {},
        learnedRootIds: localRootIds,
        updatedAt: now,
      })
      result.appState.added = 1
    }
  } else {
    // 已有学习位置：位置与循环次数保持数据库的，已学词根取并集
    const roots = union(
      remoteState.learnedRootIds.filter((id): id is string => typeof id === 'string'),
      localRootIds
    )
    if (roots.length > remoteState.learnedRootIds.length) {
      await cloudRepositories.appState.put({ ...remoteState, bookModeProgress: {}, learnedRootIds: roots, updatedAt: now })
      result.appState.updated = 1
    }
  }

  // ---------------- 翻译完成记录（数据库函数取并集） ----------------
  const translate = readLocalPersistedState(TRANSLATE_STORAGE_KEY)
  const completed =
    translate.completedSentenceIds && typeof translate.completedSentenceIds === 'object'
      ? Object.keys(translate.completedSentenceIds as Record<string, unknown>).filter(
          (id) => (translate.completedSentenceIds as Record<string, unknown>)[id]
        )
      : []
  if (completed.length) {
    const remoteTranslate = await cloudRepositories.translate.getState()
    const already = remoteTranslate?.completedSentenceIds ?? {}
    const fresh = completed.filter((id) => !already[id])
    if (fresh.length || !remoteTranslate) {
      await cloudRepositories.translate.putState({
        currentBookId:
          !remoteTranslate && typeof translate.currentBookId === 'string' ? translate.currentBookId : undefined,
        completedSentenceIds: Object.fromEntries(fresh.map((id) => [id, true])),
        updatedAt: now,
      })
    }
    result.translateCompleted.added = fresh.length
  }

  return result
}

/* -------------------------------------------------------------------------- */
/* 结果摘要                                                                    */
/* -------------------------------------------------------------------------- */

function describe(label: string, counts: SyncCounts, unit = '项'): string {
  const parts = [
    counts.added ? `新增 ${counts.added}` : '',
    counts.updated ? `更新 ${counts.updated}` : '',
    counts.skipped ? `跳过 ${counts.skipped}` : '',
  ].filter(Boolean)
  return parts.length ? `${label}${parts.join('、')} ${unit}` : ''
}

function total(list: SyncCounts[]): SyncCounts {
  return list.reduce(
    (sum, item) => ({ added: sum.added + item.added, updated: sum.updated + item.updated, skipped: sum.skipped + item.skipped }),
    emptyCounts()
  )
}

export function formatContentSyncResult(result: ContentSyncResult): string {
  const sum = total([result.books, result.translateBooks, result.articles])
  const details = [
    describe('词库', result.books, '本'),
    result.words.added || result.words.updated
      ? `其中单词新增 ${result.words.added}、更新 ${result.words.updated} 个`
      : '',
    describe('句库', result.translateBooks, '本'),
    result.sentences.added || result.sentences.updated
      ? `其中句子新增 ${result.sentences.added}、更新 ${result.sentences.updated} 句`
      : '',
    describe('文章', result.articles, '篇'),
  ].filter(Boolean)
  if (!details.length) return '同步资料完成：本地没有需要同步的自定义资料，数据库里已是最新。'
  const skipped = sum.skipped ? `跳过的 ${sum.skipped} 项不属于你的内容（别的账号的个人内容），没有改动。` : ''
  return `同步资料完成：新增 ${sum.added}、更新 ${sum.updated}、跳过 ${sum.skipped} 项（${details.join('；')}）。${skipped}`
}

export function formatProgressSyncResult(result: ProgressSyncResult): string {
  const sum = total([result.wordRecords, result.unitProgress, result.bookProgress, result.appState, result.translateCompleted])
  const details = [
    describe('单词记录', result.wordRecords, '条'),
    describe('单元进度', result.unitProgress, '条'),
    describe('书内位置', result.bookProgress, '条'),
    describe('学习位置', result.appState, '条'),
    describe('翻译完成记录', result.translateCompleted, '句'),
  ].filter(Boolean)
  if (!details.length) return '同步进度完成：数据库里的进度已包含本地全部进度，没有改动。'
  const skipped = sum.skipped ? `跳过的 ${sum.skipped} 条单元进度在数据库里属于别的词库，没有改动。` : ''
  return `同步进度完成：新增 ${sum.added}、更新 ${sum.updated}、跳过 ${sum.skipped} 条（${details.join('；')}）。${skipped}`
}
