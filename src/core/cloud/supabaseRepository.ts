/**
 * 云端仓库实现（Supabase / PostgREST）。
 *
 * 只覆盖「需要跨设备共享」的表：自定义词库、错词本、单元进度、单词覆盖、
 * 翻译自定义题库 + 完成记录、上传的阅读文章与影音条目、学习位置。
 * 内置官方词库、离线词库缓存（aiWordCache）与所有设置项都不会走到这里。
 *
 * 账号规则（与 supabase/schema.sql 对齐）：
 * - 进度表（word_records / unit_progress / book_progress / word_overrides / app_state / translate_state）
 *   读写都带当前登录账号的 account_id；
 * - 内容表（vocab_books / translate_books / reading_articles / radio_items）只读
 *   account_id 为空（共享）或等于当前账号（个人）的行；写入时显式带上归属。
 * - 计数、单元进度、合并词库、收件箱等「读-改-写」走数据库函数，在一条事务里完成。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ContentAccountId,
  PracticeMode,
  TranslationBook,
  UnitProgressRecord,
  VocabularyBook,
  WordItem,
  WordMasteryRecord,
  WordOverrideRecord,
} from '@/types'
import type { ReadingArticle } from '@/resources/readingData'
import type { RadioItem } from '@/resources/radioData'
import { getCloudClient, cloudErrorCode, cloudErrorMessage, CloudRequestError } from './client'
import { getCloudAccountId } from './config'
import type {
  AppStateRepository,
  BookModeEntry,
  BooksRepository,
  ProgressState,
  RadioRepository,
  ReadingRepository,
  Repositories,
  TranslateProgressState,
  TranslateRepository,
  UnitProgressRepository,
  WordOverridesRepository,
  WordRecordsRepository,
} from '@/db/repository'

function client(): SupabaseClient {
  const instance = getCloudClient()
  if (!instance) throw new Error('云数据库尚未配置')
  return instance
}

/** 当前登录账号；未登录时直接报错，绝不在没有账号的情况下读写进度 */
function accountId(): string {
  const id = getCloudAccountId()
  if (!id) throw new CloudRequestError('尚未登录账号，请先登录。', 'P0001')
  return id
}

/** 内容表的可见范围：共享 + 自己的个人内容 */
function visibleTo(id: string): string {
  return `account_id.is.null,account_id.eq.${id}`
}

function fail(error: unknown, fallback: string): never {
  throw new CloudRequestError(cloudErrorMessage(error, fallback), cloudErrorCode(error))
}

/** PostgREST 单次最多返回 Max Rows（默认 1000）行，超出部分会被静默截断，列表读取一律分页 */
const PAGE_SIZE = 1000
/** 批量写入每批行数，避免单个请求体过大 */
const WRITE_BATCH_SIZE = 500
/** `in` 过滤拼在 URL 上，分批避免 URL 过长 */
const IN_FILTER_CHUNK = 100

type PageResult = PromiseLike<{ data: unknown; error: unknown }>

async function selectAllPages<T>(
  page: (from: number, to: number) => PageResult,
  fallback: string
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) fail(error, fallback)
    const batch = (data as T[] | null) ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

/** 内容行写入时附带归属：undefined 表示不改（新行按数据库默认值，即共享） */
function withContentAccount<T extends object>(row: T, owner: ContentAccountId | undefined) {
  return owner === undefined ? row : { ...row, account_id: owner }
}

/* -------------------------------------------------------------------------- */
/* 行 ↔ 领域对象                                                               */
/* -------------------------------------------------------------------------- */

interface BookRow {
  id: string
  account_id?: string | null
  name: string
  description: string | null
  category: string | null
  is_custom: boolean | null
  unit_size: number | null
  total_words: number | null
  words: VocabularyBook['words'] | null
  created_at: number
  updated_at: number
}

function bookFromRow(row: BookRow): VocabularyBook {
  return {
    id: row.id,
    accountId: row.account_id ?? null,
    name: row.name,
    description: row.description ?? '',
    category: (row.category as VocabularyBook['category']) ?? 'custom',
    isCustom: row.is_custom ?? true,
    unitSize: row.unit_size ?? 20,
    totalWords: row.total_words ?? row.words?.length ?? 0,
    words: row.words ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function bookToRow(book: VocabularyBook) {
  return withContentAccount(
    {
      id: book.id,
      name: book.name,
      description: book.description ?? '',
      category: book.category ?? 'custom',
      is_custom: true,
      unit_size: book.unitSize ?? 20,
      total_words: book.totalWords ?? book.words?.length ?? 0,
      words: book.words ?? [],
      created_at: book.createdAt || Date.now(),
      updated_at: book.updatedAt || Date.now(),
    },
    book.accountId
  )
}

function bookPatchToRow(patch: Partial<VocabularyBook>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.description !== undefined) row.description = patch.description
  if (patch.category !== undefined) row.category = patch.category
  if (patch.unitSize !== undefined) row.unit_size = patch.unitSize
  if (patch.words !== undefined) row.words = patch.words
  if (patch.totalWords !== undefined) row.total_words = patch.totalWords
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt
  if (patch.accountId !== undefined) row.account_id = patch.accountId
  return row
}

interface WordRecordRow {
  word_id: string
  book_id: string
  word_name: string | null
  word_item: WordMasteryRecord['wordItem'] | null
  is_mastered: boolean
  is_starred: boolean
  is_error: boolean
  total_practice_count: number
  dictation_error_count: number
  consecutive_correct_count: number
  last_practiced_at: number
}

function wordRecordFromRow(row: WordRecordRow): WordMasteryRecord {
  return {
    wordId: row.word_id,
    bookId: row.book_id,
    wordName: row.word_name ?? undefined,
    wordItem: row.word_item ?? undefined,
    isMastered: row.is_mastered,
    isStarred: row.is_starred,
    isError: row.is_error,
    totalPracticeCount: row.total_practice_count,
    dictationErrorCount: row.dictation_error_count,
    consecutiveCorrectCount: row.consecutive_correct_count,
    lastPracticedAt: row.last_practiced_at,
  }
}

function wordRecordToRow(record: WordMasteryRecord, owner: string) {
  return {
    account_id: owner,
    word_id: record.wordId,
    book_id: record.bookId ?? '',
    word_name: record.wordName ?? null,
    word_item: record.wordItem ?? null,
    is_mastered: Boolean(record.isMastered),
    is_starred: Boolean(record.isStarred),
    is_error: Boolean(record.isError),
    total_practice_count: record.totalPracticeCount ?? 0,
    dictation_error_count: record.dictationErrorCount ?? 0,
    consecutive_correct_count: record.consecutiveCorrectCount ?? 0,
    last_practiced_at: record.lastPracticedAt ?? Date.now(),
  }
}

function wordRecordPatchToRow(patch: Partial<WordMasteryRecord>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.bookId !== undefined) row.book_id = patch.bookId
  if (patch.wordName !== undefined) row.word_name = patch.wordName
  if (patch.wordItem !== undefined) row.word_item = patch.wordItem
  if (patch.isMastered !== undefined) row.is_mastered = patch.isMastered
  if (patch.isStarred !== undefined) row.is_starred = patch.isStarred
  if (patch.isError !== undefined) row.is_error = patch.isError
  if (patch.totalPracticeCount !== undefined) row.total_practice_count = patch.totalPracticeCount
  if (patch.dictationErrorCount !== undefined) row.dictation_error_count = patch.dictationErrorCount
  if (patch.consecutiveCorrectCount !== undefined) {
    row.consecutive_correct_count = patch.consecutiveCorrectCount
  }
  if (patch.lastPracticedAt !== undefined) row.last_practiced_at = patch.lastPracticedAt
  return row
}

interface UnitProgressRow {
  unit_id: string
  mode: PracticeMode
  book_id: string
  status: UnitProgressRecord['status']
  current_word_index: number
  completed_word_ids: string[] | null
  retry_word_ids: string[] | null
  is_retrying: boolean | null
  started_at: number | null
  last_studied_at: number | null
  completed_at: number | null
}

function unitProgressFromRow(row: UnitProgressRow): UnitProgressRecord {
  return {
    unitId: row.unit_id,
    bookId: row.book_id,
    mode: row.mode,
    status: row.status,
    currentWordIndex: row.current_word_index ?? 0,
    completedWordIds: row.completed_word_ids ?? [],
    retryWordIds: row.retry_word_ids ?? [],
    isRetrying: row.is_retrying ?? false,
    startedAt: row.started_at ?? undefined,
    lastStudiedAt: row.last_studied_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  }
}

function unitProgressToRow(record: UnitProgressRecord, owner: string) {
  return {
    account_id: owner,
    unit_id: record.unitId,
    mode: record.mode,
    book_id: record.bookId,
    status: record.status,
    current_word_index: record.currentWordIndex ?? 0,
    completed_word_ids: record.completedWordIds ?? [],
    retry_word_ids: record.retryWordIds ?? [],
    is_retrying: Boolean(record.isRetrying),
    started_at: record.startedAt ?? null,
    last_studied_at: record.lastStudiedAt ?? null,
    completed_at: record.completedAt ?? null,
  }
}

interface WordOverrideRow {
  word_id: string
  name: string
  phonetic_us: string | null
  phonetic_uk: string | null
  pos_list: WordOverrideRecord['posList'] | null
  syllables: string[] | null
  etymology: WordOverrideRecord['etymology'] | null
  silent_indices: number[] | null
  examples: WordOverrideRecord['examples'] | null
  phrases: WordOverrideRecord['phrases'] | null
  updated_at: number
}

function wordOverrideFromRow(row: WordOverrideRow): WordOverrideRecord {
  return {
    wordId: row.word_id,
    name: row.name,
    phoneticUs: row.phonetic_us ?? undefined,
    phoneticUk: row.phonetic_uk ?? undefined,
    posList: row.pos_list ?? undefined,
    syllables: row.syllables ?? undefined,
    etymology: row.etymology ?? undefined,
    silentIndices: row.silent_indices ?? undefined,
    examples: row.examples ?? undefined,
    phrases: row.phrases ?? undefined,
    updatedAt: row.updated_at,
  }
}

function wordOverrideToRow(record: WordOverrideRecord, owner: string) {
  return {
    account_id: owner,
    word_id: record.wordId,
    name: record.name,
    phonetic_us: record.phoneticUs ?? null,
    phonetic_uk: record.phoneticUk ?? null,
    pos_list: record.posList ?? null,
    syllables: record.syllables ?? null,
    etymology: record.etymology ?? null,
    silent_indices: record.silentIndices ?? null,
    examples: record.examples ?? null,
    phrases: record.phrases ?? null,
    updated_at: record.updatedAt ?? Date.now(),
  }
}

interface TranslateBookRow {
  id: string
  account_id?: string | null
  name: string
  description: string | null
  category: string | null
  scenario: string | null
  total_sentences: number | null
  sentences: TranslationBook['sentences'] | null
  created_at: number
  updated_at: number
}

function translateBookFromRow(row: TranslateBookRow): TranslationBook {
  return {
    id: row.id,
    accountId: row.account_id ?? null,
    name: row.name,
    description: row.description ?? undefined,
    category: row.category ?? 'custom',
    scenario: row.scenario ?? undefined,
    isCustom: true,
    totalSentences: row.total_sentences ?? row.sentences?.length ?? 0,
    sentences: row.sentences ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function translateBookToRow(book: TranslationBook) {
  return withContentAccount(
    {
      id: book.id,
      name: book.name,
      description: book.description ?? null,
      category: book.category ?? 'custom',
      scenario: book.scenario ?? null,
      total_sentences: book.totalSentences ?? book.sentences?.length ?? 0,
      sentences: book.sentences ?? [],
      created_at: book.createdAt || Date.now(),
      updated_at: book.updatedAt || Date.now(),
    },
    book.accountId
  )
}

interface ReadingRow {
  id: string
  account_id?: string | null
  title: string
  paragraphs: ReadingArticle['paragraphs'] | null
  is_custom: boolean | null
  created_at: number
  updated_at: number
}

function readingFromRow(row: ReadingRow): ReadingArticle {
  return {
    id: row.id,
    accountId: row.account_id ?? null,
    title: row.title,
    paragraphs: row.paragraphs ?? [],
    isCustom: row.is_custom ?? true,
    createdAt: row.created_at,
  }
}

function readingToRow(article: ReadingArticle) {
  const timestamp = article.createdAt || Date.now()
  return withContentAccount(
    {
      id: article.id,
      title: article.title,
      paragraphs: article.paragraphs ?? [],
      is_custom: article.isCustom ?? true,
      created_at: timestamp,
      updated_at: Date.now(),
    },
    article.accountId
  )
}

interface RadioRow {
  id: string
  account_id: string | null
  category: RadioItem['category']
  title: string
  media_type: RadioItem['type']
  src: string
  poster: string | null
  duration: number | null
  scenario: string | null
  description: string | null
  transcript: string | null
  translation: string | null
  created_at: number
}

function radioFromRow(row: RadioRow): RadioItem {
  return {
    id: row.id,
    accountId: row.account_id ?? null,
    category: row.category,
    title: row.title,
    type: row.media_type ?? 'video',
    src: row.src,
    poster: row.poster ?? undefined,
    duration: row.duration ?? 0,
    scenario: row.scenario ?? '',
    description: row.description ?? undefined,
    transcript: row.transcript ?? undefined,
    translation: row.translation ?? undefined,
    createdAt: row.created_at,
    playCount: 0,
  }
}

function radioToRow(item: RadioItem) {
  return withContentAccount(
    {
      id: item.id,
      category: item.category,
      title: item.title,
      media_type: item.type,
      src: item.src,
      poster: item.poster ?? null,
      duration: Math.max(0, Math.round(item.duration || 0)),
      scenario: item.scenario ?? '',
      description: item.description ?? null,
      transcript: item.transcript ?? null,
      translation: item.translation ?? null,
      created_at: item.createdAt || Date.now(),
      updated_at: Date.now(),
    },
    item.accountId
  )
}

/* -------------------------------------------------------------------------- */
/* 仓库实现                                                                    */
/* -------------------------------------------------------------------------- */

const books: BooksRepository = {
  async get(id) {
    const { data, error } = await client()
      .from('vocab_books')
      .select('*')
      .eq('id', id)
      .or(visibleTo(accountId()))
      .maybeSingle()
    if (error) fail(error, '读取词库失败')
    return data ? bookFromRow(data as BookRow) : undefined
  },
  async getAll() {
    const me = accountId()
    const rows = await selectAllPages<BookRow>(
      (from, to) =>
        client().from('vocab_books').select('*').or(visibleTo(me)).order('id').range(from, to),
      '读取词库列表失败'
    )
    return rows.map(bookFromRow)
  },
  async getCustom() {
    const me = accountId()
    const rows = await selectAllPages<BookRow>(
      (from, to) =>
        client()
          .from('vocab_books')
          .select('*')
          .or(visibleTo(me))
          .order('updated_at', { ascending: false })
          .order('id')
          .range(from, to),
      '读取自定义词库失败'
    )
    return rows.map(bookFromRow)
  },
  async put(book) {
    accountId()
    const { error } = await client().from('vocab_books').upsert(bookToRow(book), { onConflict: 'id' })
    if (error) fail(error, '保存词库失败')
  },
  async update(id, patch) {
    const { error } = await client()
      .from('vocab_books')
      .update(bookPatchToRow(patch))
      .eq('id', id)
      .or(visibleTo(accountId()))
    if (error) fail(error, '更新词库失败')
  },
  async delete(id) {
    const { error } = await client()
      .from('vocab_books')
      .delete()
      .eq('id', id)
      .or(visibleTo(accountId()))
    if (error) fail(error, '删除词库失败')
  },
}

const wordRecords: WordRecordsRepository = {
  async get(wordId) {
    const { data, error } = await client()
      .from('word_records')
      .select('*')
      .eq('account_id', accountId())
      .eq('word_id', wordId)
      .maybeSingle()
    if (error) fail(error, '读取单词记录失败')
    return data ? wordRecordFromRow(data as WordRecordRow) : undefined
  },
  async getAll() {
    const me = accountId()
    const rows = await selectAllPages<WordRecordRow>(
      (from, to) =>
        client().from('word_records').select('*').eq('account_id', me).order('word_id').range(from, to),
      '读取单词记录失败'
    )
    return rows.map(wordRecordFromRow)
  },
  async put(record) {
    const { error } = await client()
      .from('word_records')
      .upsert(wordRecordToRow(record, accountId()), { onConflict: 'account_id,word_id' })
    if (error) fail(error, '保存单词记录失败')
  },
  async update(wordId, patch) {
    const { error } = await client()
      .from('word_records')
      .update(wordRecordPatchToRow(patch))
      .eq('account_id', accountId())
      .eq('word_id', wordId)
    if (error) fail(error, '更新单词记录失败')
  },
  async delete(wordId) {
    const { error } = await client()
      .from('word_records')
      .delete()
      .eq('account_id', accountId())
      .eq('word_id', wordId)
    if (error) fail(error, '删除单词记录失败')
  },
}

const unitProgress: UnitProgressRepository = {
  async get(unitId, mode) {
    const { data, error } = await client()
      .from('unit_progress')
      .select('*')
      .eq('account_id', accountId())
      .eq('unit_id', unitId)
      .eq('mode', mode)
      .maybeSingle()
    if (error) fail(error, '读取单元进度失败')
    return data ? unitProgressFromRow(data as UnitProgressRow) : undefined
  },
  async getByBook(bookId) {
    const me = accountId()
    const rows = await selectAllPages<UnitProgressRow>(
      (from, to) =>
        client()
          .from('unit_progress')
          .select('*')
          .eq('account_id', me)
          .eq('book_id', bookId)
          .order('unit_id')
          .order('mode')
          .range(from, to),
      '读取单元进度失败'
    )
    return rows.map(unitProgressFromRow)
  },
  async getAll() {
    const me = accountId()
    const rows = await selectAllPages<UnitProgressRow>(
      (from, to) =>
        client()
          .from('unit_progress')
          .select('*')
          .eq('account_id', me)
          .order('unit_id')
          .order('mode')
          .range(from, to),
      '读取单元进度失败'
    )
    return rows.map(unitProgressFromRow)
  },
  async put(record) {
    const { error } = await client()
      .from('unit_progress')
      .upsert(unitProgressToRow(record, accountId()), { onConflict: 'account_id,unit_id,mode' })
    if (error) fail(error, '保存单元进度失败')
  },
  async delete(unitId, mode) {
    const { error } = await client()
      .from('unit_progress')
      .delete()
      .eq('account_id', accountId())
      .eq('unit_id', unitId)
      .eq('mode', mode)
    if (error) fail(error, '删除单元进度失败')
  },
  async deleteByBook(bookId) {
    const { error } = await client()
      .from('unit_progress')
      .delete()
      .eq('account_id', accountId())
      .eq('book_id', bookId)
    if (error) fail(error, '删除单元进度失败')
  },
}

const wordOverrides: WordOverridesRepository = {
  async get(wordId) {
    const { data, error } = await client()
      .from('word_overrides')
      .select('*')
      .eq('account_id', accountId())
      .eq('word_id', wordId)
      .maybeSingle()
    if (error) fail(error, '读取单词自定义数据失败')
    return data ? wordOverrideFromRow(data as WordOverrideRow) : undefined
  },
  async getAll() {
    const me = accountId()
    const rows = await selectAllPages<WordOverrideRow>(
      (from, to) =>
        client().from('word_overrides').select('*').eq('account_id', me).order('word_id').range(from, to),
      '读取单词自定义数据失败'
    )
    return rows.map(wordOverrideFromRow)
  },
  async bulkGet(wordIds) {
    if (!wordIds.length) return []
    const me = accountId()
    const map = new Map<string, WordOverrideRecord>()
    for (const ids of chunk(Array.from(new Set(wordIds)), IN_FILTER_CHUNK)) {
      const { data, error } = await client()
        .from('word_overrides')
        .select('*')
        .eq('account_id', me)
        .in('word_id', ids)
      if (error) fail(error, '读取单词自定义数据失败')
      for (const row of (data as WordOverrideRow[] | null) ?? []) {
        map.set(row.word_id, wordOverrideFromRow(row))
      }
    }
    return wordIds.map((id) => map.get(id))
  },
  async put(record) {
    const { error } = await client()
      .from('word_overrides')
      .upsert(wordOverrideToRow(record, accountId()), { onConflict: 'account_id,word_id' })
    if (error) fail(error, '保存单词自定义数据失败')
  },
}

interface AppStateRow {
  current_book_id: string | null
  current_unit_index: number | null
  loop_counts: Record<string, unknown> | null
  learned_root_ids: string[] | null
  updated_at: number | null
}

interface BookProgressRow {
  book_id: string
  mode: PracticeMode
  unit_index: number
  updated_at: number
}

function bookProgressToRow(entry: BookModeEntry, owner: string) {
  return {
    account_id: owner,
    book_id: entry.bookId,
    mode: entry.mode,
    unit_index: Math.max(0, Math.floor(entry.unitIndex)),
    updated_at: entry.updatedAt || Date.now(),
  }
}

const appState: AppStateRepository = {
  /**
   * 读取学习位置与各书各模式的单元位置。
   * 两者都没有时返回 null；只有 book_progress 时 updatedAt 为 0（表示 app_state 行尚不存在）。
   */
  async get() {
    const me = accountId()
    const [{ data, error }, bookRows] = await Promise.all([
      client().from('app_state').select('*').eq('account_id', me).maybeSingle(),
      selectAllPages<BookProgressRow>(
        (from, to) =>
          client()
            .from('book_progress')
            .select('book_id,mode,unit_index,updated_at')
            .eq('account_id', me)
            .order('book_id')
            .order('mode')
            .range(from, to),
        '读取学习进度失败'
      ),
    ])
    if (error) fail(error, '读取学习进度失败')
    const row = data as AppStateRow | null
    if (!row && bookRows.length === 0) return null

    const bookModeProgress: ProgressState['bookModeProgress'] = {}
    for (const item of bookRows) {
      bookModeProgress[item.book_id] = { ...bookModeProgress[item.book_id], [item.mode]: item.unit_index }
    }
    return {
      currentBookId: row?.current_book_id ?? undefined,
      currentUnitIndex: row?.current_unit_index ?? 0,
      bookModeProgress,
      loopCounts: row?.loop_counts ?? {},
      learnedRootIds: row?.learned_root_ids ?? [],
      updatedAt: row ? row.updated_at ?? 0 : 0,
    }
  },
  async put(state: ProgressState, changedBookModes = []) {
    const me = accountId()
    const { error } = await client()
      .from('app_state')
      .upsert(
        {
          account_id: me,
          current_book_id: state.currentBookId ?? null,
          current_unit_index: Math.max(0, state.currentUnitIndex ?? 0),
          loop_counts: state.loopCounts ?? {},
          learned_root_ids: state.learnedRootIds ?? [],
          updated_at: state.updatedAt || Date.now(),
        },
        { onConflict: 'account_id' }
      )
    if (error) fail(error, '保存学习进度失败')
    if (changedBookModes.length === 0) return
    for (const batch of chunk(changedBookModes, WRITE_BATCH_SIZE)) {
      const { error: progressError } = await client()
        .from('book_progress')
        .upsert(
          batch.map((entry) => bookProgressToRow(entry, me)),
          { onConflict: 'account_id,book_id,mode' }
        )
      if (progressError) fail(progressError, '保存学习进度失败')
    }
  },
}

const translate: TranslateRepository = {
  async getBooks() {
    const me = accountId()
    const rows = await selectAllPages<TranslateBookRow>(
      (from, to) =>
        client().from('translate_books').select('*').or(visibleTo(me)).order('id').range(from, to),
      '读取自定义句库失败'
    )
    return rows.map(translateBookFromRow)
  },
  async putBook(book) {
    accountId()
    const { error } = await client()
      .from('translate_books')
      .upsert(translateBookToRow(book), { onConflict: 'id' })
    if (error) fail(error, '保存自定义句库失败')
  },
  async deleteBook(bookId) {
    const { error } = await client()
      .from('translate_books')
      .delete()
      .eq('id', bookId)
      .or(visibleTo(accountId()))
    if (error) fail(error, '删除自定义句库失败')
  },
  async getState() {
    const { data, error } = await client()
      .from('translate_state')
      .select('*')
      .eq('account_id', accountId())
      .maybeSingle()
    if (error) fail(error, '读取翻译进度失败')
    if (!data) return null
    const row = data as {
      current_book_id: string | null
      completed_sentence_ids: Record<string, unknown> | null
      updated_at: number | null
    }
    return {
      currentBookId: row.current_book_id ?? undefined,
      completedSentenceIds: row.completed_sentence_ids ?? {},
      updatedAt: row.updated_at ?? 0,
    }
  },
  /** 完成记录只增不减：服务端取并集，多设备不会互相抹掉 */
  async putState(state: TranslateProgressState) {
    const { error } = await client().rpc('merge_translate_state', {
      p_account_id: accountId(),
      p_current_book_id: state.currentBookId ?? null,
      p_completed: state.completedSentenceIds ?? {},
      p_updated_at: state.updatedAt || Date.now(),
    })
    if (error) fail(error, '保存翻译进度失败')
  },
}

const reading: ReadingRepository = {
  async getArticles() {
    const me = accountId()
    const rows = await selectAllPages<ReadingRow>(
      (from, to) =>
        client()
          .from('reading_articles')
          .select('*')
          .or(visibleTo(me))
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      '读取阅读文章失败'
    )
    return rows.map(readingFromRow)
  },
  async putArticle(article) {
    accountId()
    const { error } = await client()
      .from('reading_articles')
      .upsert(readingToRow(article), { onConflict: 'id' })
    if (error) fail(error, '保存阅读文章失败')
  },
  async deleteArticle(articleId) {
    const { error } = await client()
      .from('reading_articles')
      .delete()
      .eq('id', articleId)
      .or(visibleTo(accountId()))
    if (error) fail(error, '删除阅读文章失败')
  },
}

const radio: RadioRepository = {
  async getItems() {
    const me = accountId()
    const rows = await selectAllPages<RadioRow>(
      (from, to) =>
        client()
          .from('radio_items')
          .select('*')
          .or(visibleTo(me))
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      '读取影音列表失败'
    )
    return rows.map(radioFromRow)
  },
  async putItem(item) {
    accountId()
    const { error } = await client().from('radio_items').upsert(radioToRow(item), { onConflict: 'id' })
    if (error) fail(error, '保存影音条目失败')
  },
  async deleteItem(itemId) {
    const { error } = await client()
      .from('radio_items')
      .delete()
      .eq('id', itemId)
      .or(visibleTo(accountId()))
    if (error) fail(error, '删除影音条目失败')
  },
}

export const cloudRepositories: Repositories = {
  mode: 'cloud',
  books,
  wordRecords,
  unitProgress,
  wordOverrides,
  appState,
  translate,
  reading,
  radio,
}

/* -------------------------------------------------------------------------- */
/* 原子操作（数据库函数）                                                      */
/* -------------------------------------------------------------------------- */

export interface CollectedWordRow {
  id: number
  word: string
  meaning: string | null
  source: string | null
  word_item: WordItem | null
  attempts: number
  created_at: number
}

export interface MergeWordsResult {
  added: number
  updated: number
  totalWords: number
}

/**
 * 云模式专用：把「读-改-写」交给数据库函数在一条事务里完成，
 * 多设备、多标签页同时操作也不会互相覆盖计数或单元进度。
 */
export const cloudOperations = {
  async recordWordAttempt(params: {
    wordId: string
    bookId: string
    isCorrect: boolean
    mode: PracticeMode
    wordItem?: WordItem
  }): Promise<WordMasteryRecord> {
    const { data, error } = await client().rpc('record_word_attempt', {
      p_account_id: accountId(),
      p_word_id: params.wordId,
      p_book_id: params.bookId,
      p_is_correct: params.isCorrect,
      p_mode: params.mode,
      p_word_item: params.wordItem ?? null,
    })
    if (error) fail(error, '记录练习结果失败')
    return wordRecordFromRow(data as WordRecordRow)
  },

  async toggleStarWord(wordId: string, bookId: string, wordItem?: WordItem): Promise<boolean> {
    const { data, error } = await client().rpc('toggle_star_word', {
      p_account_id: accountId(),
      p_word_id: wordId,
      p_book_id: bookId,
      p_word_item: wordItem ?? null,
    })
    if (error) fail(error, '切换生词本失败')
    return data === true
  },

  /** 确保单词在生词本里（幂等）：不存在则建为已加星，存在则只置 is_starred，不动练习计数 */
  async starWord(wordId: string, bookId: string, wordItem?: WordItem): Promise<void> {
    const me = accountId()
    const now = Date.now()
    const { error: insertError } = await client()
      .from('word_records')
      .upsert(
        {
          account_id: me,
          word_id: wordId,
          book_id: bookId,
          word_name: wordItem?.name ?? null,
          word_item: wordItem ?? null,
          is_starred: true,
          last_practiced_at: now,
        },
        { onConflict: 'account_id,word_id', ignoreDuplicates: true }
      )
    if (insertError) fail(insertError, '加入生词本失败')
    const patch: Record<string, unknown> = { is_starred: true }
    if (wordItem) {
      patch.word_item = wordItem
      patch.word_name = wordItem.name
    }
    const { error } = await client()
      .from('word_records')
      .update(patch)
      .eq('account_id', me)
      .eq('word_id', wordId)
    if (error) fail(error, '加入生词本失败')
  },

  async getStarredWordIds(): Promise<string[]> {
    const { data, error } = await client().rpc('get_starred_word_ids', { p_account_id: accountId() })
    if (error) fail(error, '读取生词本失败')
    return (data as string[] | null) ?? []
  },

  async getTroubleWordRecords(): Promise<WordMasteryRecord[]> {
    const { data, error } = await client().rpc('get_trouble_word_records', { p_account_id: accountId() })
    if (error) fail(error, '读取生错词本失败')
    return ((data as WordRecordRow[] | null) ?? []).map(wordRecordFromRow)
  },

  async markUnitWordCompleted(params: {
    bookId: string
    unitId: string
    mode: PracticeMode
    wordId: string
    wordIndex: number
    unitWordIds: string[]
    deferForRetry: boolean
  }): Promise<UnitProgressRecord> {
    const { data, error } = await client().rpc('mark_unit_word_completed', {
      p_account_id: accountId(),
      p_book_id: params.bookId,
      p_unit_id: params.unitId,
      p_mode: params.mode,
      p_word_id: params.wordId,
      p_word_index: params.wordIndex,
      p_unit_word_ids: params.unitWordIds,
      p_defer_for_retry: params.deferForRetry,
    })
    if (error) fail(error, '保存单元进度失败')
    return unitProgressFromRow(data as UnitProgressRow)
  },

  async markUnitWordForRetry(params: {
    bookId: string
    unitId: string
    mode: PracticeMode
    wordId: string
    wordIndex: number
  }): Promise<UnitProgressRecord> {
    const { data, error } = await client().rpc('mark_unit_word_for_retry', {
      p_account_id: accountId(),
      p_book_id: params.bookId,
      p_unit_id: params.unitId,
      p_mode: params.mode,
      p_word_id: params.wordId,
      p_word_index: params.wordIndex,
    })
    if (error) fail(error, '保存单元进度失败')
    return unitProgressFromRow(data as UnitProgressRow)
  },

  /** 词库不存在或不可见时返回 null */
  async mergeWordsIntoBook(bookId: string, words: WordItem[]): Promise<MergeWordsResult | null> {
    const { data, error } = await client().rpc('merge_words_into_book', {
      p_account_id: accountId(),
      p_book_id: bookId,
      p_words: words,
    })
    if (error) fail(error, '合并词库失败')
    if (!data) return null
    const result = data as { added: number; updated: number; total_words: number }
    return { added: result.added, updated: result.updated, totalWords: result.total_words }
  },

  async claimCollectedWords(limit: number, claimer: string): Promise<CollectedWordRow[]> {
    const { data, error } = await client().rpc('claim_collected_words', {
      p_account_id: accountId(),
      p_limit: limit,
      p_claimer: claimer,
    })
    if (error) fail(error, '读取收件箱失败')
    return (data as CollectedWordRow[] | null) ?? []
  },

  async completeCollectedWords(ids: number[]): Promise<void> {
    if (!ids.length) return
    const { error } = await client().rpc('complete_collected_words', {
      p_account_id: accountId(),
      p_ids: ids,
    })
    if (error) fail(error, '更新收件箱失败')
  },

  async failCollectedWord(id: number, message: string, retryable: boolean): Promise<void> {
    const { error } = await client().rpc('fail_collected_word', {
      p_account_id: accountId(),
      p_id: id,
      p_error: message,
      p_retryable: retryable,
    })
    if (error) fail(error, '更新收件箱失败')
  },
}

/* -------------------------------------------------------------------------- */
/* 迁移：批量「只补齐、不覆盖」                                                */
/* -------------------------------------------------------------------------- */

/**
 * INSERT ... ON CONFLICT DO NOTHING，返回实际新增的行数。
 * 由数据库判断是否已存在，不依赖客户端先读后写（读到的列表可能被截断，也可能已过期）。
 */
async function insertMissing(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  returning: string
): Promise<number> {
  let inserted = 0
  for (const batch of chunk(rows, WRITE_BATCH_SIZE)) {
    const { data, error } = await client()
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates: true })
      .select(returning)
    if (error) fail(error, '上传本地数据失败')
    inserted += ((data as unknown[] | null) ?? []).length
  }
  return inserted
}

export const cloudMigration = {
  insertBooks(items: VocabularyBook[]) {
    return insertMissing('vocab_books', items.map(bookToRow), 'id', 'id')
  },
  insertWordRecords(items: WordMasteryRecord[]) {
    const me = accountId()
    return insertMissing(
      'word_records',
      items.map((item) => wordRecordToRow(item, me)),
      'account_id,word_id',
      'word_id'
    )
  },
  insertUnitProgress(items: UnitProgressRecord[]) {
    const me = accountId()
    return insertMissing(
      'unit_progress',
      items.map((item) => unitProgressToRow(item, me)),
      'account_id,unit_id,mode',
      'unit_id'
    )
  },
  insertWordOverrides(items: WordOverrideRecord[]) {
    const me = accountId()
    return insertMissing(
      'word_overrides',
      items.map((item) => wordOverrideToRow(item, me)),
      'account_id,word_id',
      'word_id'
    )
  },
  insertBookProgress(items: BookModeEntry[]) {
    const me = accountId()
    return insertMissing(
      'book_progress',
      items.map((item) => bookProgressToRow(item, me)),
      'account_id,book_id,mode',
      'book_id'
    )
  },
  insertTranslateBooks(items: TranslationBook[]) {
    return insertMissing('translate_books', items.map(translateBookToRow), 'id', 'id')
  },
  insertReadingArticles(items: ReadingArticle[]) {
    return insertMissing('reading_articles', items.map(readingToRow), 'id', 'id')
  },
}
