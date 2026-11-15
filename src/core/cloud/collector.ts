/**
 * 外部工具收词。
 *
 * 旧方案是「翻译小工具 → Redis 队列 → 本应用轮询 Token 拉取」，
 * 现在数据库本身就是共享存储：外部工具直接把待收单词写进 collected_words，
 * 本应用在云模式下轮询收件箱，收进生词本与「翻译工具收藏」词库。
 *
 * 未配置数据库时不做任何请求——也就自然不会收词。
 */
import { getCloudClient } from './client'
import { isCloudMode } from './config'
import { getWordRecord, putWordRecord, updateWordRecord, mergeWordsIntoBook } from '@/db'
import { useAiAssistantStore } from '@/store/useAiAssistantStore'
import { queryAiWordCore } from '@/lib/aiWordCore'
import { AiDictionaryLookupError } from '@/lib/aiPrompts'
import { getRepositories } from '@/db/repository'
import { buildWordId } from '@/lib/wordId'
import type { VocabularyBook, WordItem, WordMasteryRecord } from '@/types'

export const COLLECTED_BOOK_ID = 'book_custom_collected'

interface CollectedRow {
  id: number
  word: string
  meaning: string | null
  source: string | null
  word_item: WordItem | null
  created_at: number
  pulled_at: number | null
}

export interface CollectResult {
  added: WordItem[]
  source?: string
  count: number
}

async function ensureCollectedBook(): Promise<void> {
  const repositories = getRepositories()
  const existing = await repositories.books.get(COLLECTED_BOOK_ID)
  if (existing) return
  const now = Date.now()
  const book: VocabularyBook = {
    id: COLLECTED_BOOK_ID,
    name: '翻译工具收藏',
    description: '从外部翻译小工具实时同步的专属单词库',
    category: 'custom',
    isCustom: true,
    unitSize: 20,
    totalWords: 0,
    words: [],
    createdAt: now,
    updatedAt: now,
  }
  await repositories.books.put(book)
}

/** 拉取并消化收件箱；返回本次新收的单词（用于 Toast 提示） */
export async function pullCollectedWords(): Promise<CollectResult | null> {
  if (!isCloudMode()) return null
  const client = getCloudClient()
  if (!client) return null

  const { data, error } = await client
    .from('collected_words')
    .select('*')
    .is('pulled_at', null)
    .order('id', { ascending: true })
    .limit(20)
  if (error) throw new Error(error.message)

  const rows = (data as CollectedRow[] | null) ?? []
  if (rows.length === 0) return null

  const aiConfig = useAiAssistantStore.getState().aiConfig
  const added: WordItem[] = []
  const consumedIds: number[] = []

  for (const row of rows) {
    const cleanWord = row.word?.trim()
    if (!cleanWord) {
      consumedIds.push(row.id)
      continue
    }
    const canonicalId = buildWordId(cleanWord)
    const existingRecord = await getWordRecord(canonicalId)

    // 已经在生词本里（加星或错词）就不必重复处理
    if (existingRecord && (existingRecord.isStarred || existingRecord.isError)) {
      consumedIds.push(row.id)
      continue
    }

    let targetWord: WordItem | null = row.word_item
    if (!targetWord) {
      try {
        targetWord = await queryAiWordCore(aiConfig, cleanWord)
      } catch (lookupError) {
        if (!(lookupError instanceof AiDictionaryLookupError)) {
          console.warn('[collector] AI lookup failed:', lookupError)
        }
        // 解析失败就留在收件箱，下次再试
        continue
      }
    }
    if (!targetWord) continue

    if (!existingRecord) {
      const newRecord: WordMasteryRecord = {
        wordId: targetWord.id || canonicalId,
        bookId: COLLECTED_BOOK_ID,
        wordName: targetWord.name,
        wordItem: targetWord,
        isMastered: false,
        isStarred: true,
        isError: false,
        totalPracticeCount: 0,
        dictationErrorCount: 0,
        consecutiveCorrectCount: 0,
        lastPracticedAt: Date.now(),
      }
      await putWordRecord(newRecord)
    } else {
      await updateWordRecord(targetWord.id || canonicalId, {
        isStarred: true,
        wordItem: targetWord,
        lastPracticedAt: Date.now(),
      })
    }

    added.push(targetWord)
    consumedIds.push(row.id)
  }

  if (added.length > 0) {
    await ensureCollectedBook()
    await mergeWordsIntoBook(COLLECTED_BOOK_ID, added)
  }

  if (consumedIds.length > 0) {
    const { error: markError } = await client
      .from('collected_words')
      .update({ pulled_at: Date.now() })
      .in('id', consumedIds)
    if (markError) console.warn('[collector] failed to mark pulled:', markError.message)
  }

  if (added.length === 0) return null

  return {
    added,
    source: rows.find((row) => row.source)?.source ?? undefined,
    count: added.length,
  }
}
