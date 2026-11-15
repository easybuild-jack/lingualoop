/**
 * 云端仓库实现（Supabase / PostgREST）。
 *
 * 只覆盖「需要跨设备共享」的表：自定义词库、错词本、单元进度、单词覆盖、
 * 翻译自定义题库 + 完成记录、上传的阅读文章、学习位置。
 * 内置官方词库、离线词库缓存（aiWordCache）与所有设置项都不会走到这里。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PracticeMode,
  TranslationBook,
  UnitProgressRecord,
  VocabularyBook,
  WordMasteryRecord,
  WordOverrideRecord,
} from '@/types'
import type { ReadingArticle } from '@/resources/readingData'
import { getCloudClient, cloudErrorMessage } from './client'
import type {
  AppStateRepository,
  BooksRepository,
  ProgressState,
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

function fail(error: unknown, fallback: string): never {
  throw new Error(cloudErrorMessage(error, fallback))
}

/* -------------------------------------------------------------------------- */
/* 行 ↔ 领域对象                                                               */
/* -------------------------------------------------------------------------- */

interface BookRow {
  id: string
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

function bookToRow(book: VocabularyBook): BookRow {
  return {
    id: book.id,
    name: book.name,
    description: book.description ?? '',
    category: book.category ?? 'custom',
    is_custom: book.isCustom ?? true,
    unit_size: book.unitSize ?? 20,
    total_words: book.totalWords ?? book.words?.length ?? 0,
    words: book.words ?? [],
    created_at: book.createdAt || Date.now(),
    updated_at: book.updatedAt || Date.now(),
  }
}

function bookPatchToRow(patch: Partial<VocabularyBook>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.description !== undefined) row.description = patch.description
  if (patch.category !== undefined) row.category = patch.category
  if (patch.isCustom !== undefined) row.is_custom = patch.isCustom
  if (patch.unitSize !== undefined) row.unit_size = patch.unitSize
  if (patch.words !== undefined) row.words = patch.words
  if (patch.totalWords !== undefined) row.total_words = patch.totalWords
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt
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

function wordRecordToRow(record: WordMasteryRecord): WordRecordRow {
  return {
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

function unitProgressToRow(record: UnitProgressRecord): UnitProgressRow {
  return {
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

function wordOverrideToRow(record: WordOverrideRecord): WordOverrideRow {
  return {
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

function translateBookToRow(book: TranslationBook): TranslateBookRow {
  return {
    id: book.id,
    name: book.name,
    description: book.description ?? null,
    category: book.category ?? 'custom',
    scenario: book.scenario ?? null,
    total_sentences: book.totalSentences ?? book.sentences?.length ?? 0,
    sentences: book.sentences ?? [],
    created_at: book.createdAt || Date.now(),
    updated_at: book.updatedAt || Date.now(),
  }
}

interface ReadingRow {
  id: string
  title: string
  paragraphs: ReadingArticle['paragraphs'] | null
  is_custom: boolean | null
  created_at: number
  updated_at: number
}

function readingFromRow(row: ReadingRow): ReadingArticle {
  return {
    id: row.id,
    title: row.title,
    paragraphs: row.paragraphs ?? [],
    isCustom: row.is_custom ?? true,
    createdAt: row.created_at,
  }
}

function readingToRow(article: ReadingArticle): ReadingRow {
  const timestamp = article.createdAt || Date.now()
  return {
    id: article.id,
    title: article.title,
    paragraphs: article.paragraphs ?? [],
    is_custom: article.isCustom ?? true,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

/* -------------------------------------------------------------------------- */
/* 仓库实现                                                                    */
/* -------------------------------------------------------------------------- */

const books: BooksRepository = {
  async get(id) {
    const { data, error } = await client().from('vocab_books').select('*').eq('id', id).maybeSingle()
    if (error) fail(error, '读取词库失败')
    return data ? bookFromRow(data as BookRow) : undefined
  },
  async getAll() {
    const { data, error } = await client().from('vocab_books').select('*')
    if (error) fail(error, '读取词库列表失败')
    return (data as BookRow[] | null)?.map(bookFromRow) ?? []
  },
  async getCustom() {
    const { data, error } = await client()
      .from('vocab_books')
      .select('*')
      .eq('is_custom', true)
      .order('updated_at', { ascending: false })
    if (error) fail(error, '读取自定义词库失败')
    return (data as BookRow[] | null)?.map(bookFromRow) ?? []
  },
  async put(book) {
    const { error } = await client()
      .from('vocab_books')
      .upsert(bookToRow(book), { onConflict: 'id' })
    if (error) fail(error, '保存词库失败')
  },
  async update(id, patch) {
    const { error } = await client().from('vocab_books').update(bookPatchToRow(patch)).eq('id', id)
    if (error) fail(error, '更新词库失败')
  },
  async delete(id) {
    const { error } = await client().from('vocab_books').delete().eq('id', id)
    if (error) fail(error, '删除词库失败')
  },
}

const wordRecords: WordRecordsRepository = {
  async get(wordId) {
    const { data, error } = await client()
      .from('word_records')
      .select('*')
      .eq('word_id', wordId)
      .maybeSingle()
    if (error) fail(error, '读取单词记录失败')
    return data ? wordRecordFromRow(data as WordRecordRow) : undefined
  },
  async getAll() {
    const { data, error } = await client().from('word_records').select('*')
    if (error) fail(error, '读取单词记录失败')
    return (data as WordRecordRow[] | null)?.map(wordRecordFromRow) ?? []
  },
  async put(record) {
    const { error } = await client()
      .from('word_records')
      .upsert(wordRecordToRow(record), { onConflict: 'word_id' })
    if (error) fail(error, '保存单词记录失败')
  },
  async update(wordId, patch) {
    const { error } = await client()
      .from('word_records')
      .update(wordRecordPatchToRow(patch))
      .eq('word_id', wordId)
    if (error) fail(error, '更新单词记录失败')
  },
  async delete(wordId) {
    const { error } = await client().from('word_records').delete().eq('word_id', wordId)
    if (error) fail(error, '删除单词记录失败')
  },
}

const unitProgress: UnitProgressRepository = {
  async get(unitId, mode) {
    const { data, error } = await client()
      .from('unit_progress')
      .select('*')
      .eq('unit_id', unitId)
      .eq('mode', mode)
      .maybeSingle()
    if (error) fail(error, '读取单元进度失败')
    return data ? unitProgressFromRow(data as UnitProgressRow) : undefined
  },
  async getByBook(bookId) {
    const { data, error } = await client().from('unit_progress').select('*').eq('book_id', bookId)
    if (error) fail(error, '读取单元进度失败')
    return (data as UnitProgressRow[] | null)?.map(unitProgressFromRow) ?? []
  },
  async put(record) {
    const { error } = await client()
      .from('unit_progress')
      .upsert(unitProgressToRow(record), { onConflict: 'unit_id,mode' })
    if (error) fail(error, '保存单元进度失败')
  },
  async delete(unitId, mode) {
    const { error } = await client()
      .from('unit_progress')
      .delete()
      .eq('unit_id', unitId)
      .eq('mode', mode)
    if (error) fail(error, '删除单元进度失败')
  },
  async deleteByBook(bookId) {
    const { error } = await client().from('unit_progress').delete().eq('book_id', bookId)
    if (error) fail(error, '删除单元进度失败')
  },
}

const wordOverrides: WordOverridesRepository = {
  async get(wordId) {
    const { data, error } = await client()
      .from('word_overrides')
      .select('*')
      .eq('word_id', wordId)
      .maybeSingle()
    if (error) fail(error, '读取单词自定义数据失败')
    return data ? wordOverrideFromRow(data as WordOverrideRow) : undefined
  },
  async getAll() {
    const { data, error } = await client().from('word_overrides').select('*')
    if (error) fail(error, '读取单词自定义数据失败')
    return (data as WordOverrideRow[] | null)?.map(wordOverrideFromRow) ?? []
  },
  async bulkGet(wordIds) {
    if (!wordIds.length) return []
    const { data, error } = await client()
      .from('word_overrides')
      .select('*')
      .in('word_id', wordIds)
    if (error) fail(error, '读取单词自定义数据失败')
    const map = new Map(
      ((data as WordOverrideRow[] | null) ?? []).map((row) => [row.word_id, wordOverrideFromRow(row)])
    )
    return wordIds.map((id) => map.get(id))
  },
  async put(record) {
    const { error } = await client()
      .from('word_overrides')
      .upsert(wordOverrideToRow(record), { onConflict: 'word_id' })
    if (error) fail(error, '保存单词自定义数据失败')
  },
}

const appState: AppStateRepository = {
  async get() {
    const { data, error } = await client().from('app_state').select('*').eq('id', 1).maybeSingle()
    if (error) fail(error, '读取学习进度失败')
    if (!data) return null
    const row = data as {
      current_book_id: string | null
      current_unit_index: number | null
      book_mode_progress: Record<string, unknown> | null
      loop_counts: Record<string, unknown> | null
      learned_root_ids: string[] | null
      updated_at: number | null
    }
    return {
      currentBookId: row.current_book_id ?? undefined,
      currentUnitIndex: row.current_unit_index ?? 0,
      bookModeProgress: row.book_mode_progress ?? {},
      loopCounts: row.loop_counts ?? {},
      learnedRootIds: row.learned_root_ids ?? [],
      updatedAt: row.updated_at ?? 0,
    }
  },
  async put(state: ProgressState) {
    const { error } = await client()
      .from('app_state')
      .upsert(
        {
          id: 1,
          current_book_id: state.currentBookId ?? null,
          current_unit_index: state.currentUnitIndex ?? 0,
          book_mode_progress: state.bookModeProgress ?? {},
          loop_counts: state.loopCounts ?? {},
          learned_root_ids: state.learnedRootIds ?? [],
          updated_at: state.updatedAt || Date.now(),
        },
        { onConflict: 'id' }
      )
    if (error) fail(error, '保存学习进度失败')
  },
}

const translate: TranslateRepository = {
  async getBooks() {
    const { data, error } = await client().from('translate_books').select('*')
    if (error) fail(error, '读取自定义句库失败')
    return (data as TranslateBookRow[] | null)?.map(translateBookFromRow) ?? []
  },
  async putBook(book) {
    const { error } = await client()
      .from('translate_books')
      .upsert(translateBookToRow(book), { onConflict: 'id' })
    if (error) fail(error, '保存自定义句库失败')
  },
  async deleteBook(bookId) {
    const { error } = await client().from('translate_books').delete().eq('id', bookId)
    if (error) fail(error, '删除自定义句库失败')
  },
  async getState() {
    const { data, error } = await client()
      .from('translate_state')
      .select('*')
      .eq('id', 1)
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
  async putState(state: TranslateProgressState) {
    const { error } = await client()
      .from('translate_state')
      .upsert(
        {
          id: 1,
          current_book_id: state.currentBookId ?? null,
          completed_sentence_ids: state.completedSentenceIds ?? {},
          updated_at: state.updatedAt || Date.now(),
        },
        { onConflict: 'id' }
      )
    if (error) fail(error, '保存翻译进度失败')
  },
}

const reading: ReadingRepository = {
  async getArticles() {
    const { data, error } = await client()
      .from('reading_articles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) fail(error, '读取阅读文章失败')
    return (data as ReadingRow[] | null)?.map(readingFromRow) ?? []
  },
  async putArticle(article) {
    const { error } = await client()
      .from('reading_articles')
      .upsert(readingToRow(article), { onConflict: 'id' })
    if (error) fail(error, '保存阅读文章失败')
  },
  async deleteArticle(articleId) {
    const { error } = await client().from('reading_articles').delete().eq('id', articleId)
    if (error) fail(error, '删除阅读文章失败')
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
}
