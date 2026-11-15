/**
 * 外部工具收词。
 *
 * 外部工具直接把待收单词写进 collected_words（account_id 为空 = 任意账号可收，非空 = 只给该账号），
 * 本应用在云模式、已登录时轮询收件箱，收进当前账号的生词本与个人「翻译工具收藏」词库。
 *
 * 消费走数据库函数：claim（原子认领，带超时）→ complete / fail（失败计次，超过上限进入终态），
 * 多设备、多标签页不会重复处理，也不会因为几条处理不了的词把后面的词全部堵住。
 *
 * 未配置数据库或未登录时不做任何请求——也就自然不会收词。
 */
import { getCloudAccountId, isCloudSignedIn } from './config'
import { cloudOperations, cloudRepositories, type CollectedWordRow } from './supabaseRepository'
import { mergeWordsIntoBook } from '@/db'
import { useAiAssistantStore } from '@/store/useAiAssistantStore'
import { queryAiWordCore } from '@/lib/aiWordCore'
import { AiDictionaryLookupError } from '@/lib/aiPrompts'
import { isLikelyEnglishWord } from '@/lib/wordValidation'
import { buildWordId } from '@/lib/wordId'
import type { VocabularyBook, WordItem } from '@/types'

const CLAIM_LIMIT = 20
/** 本标签页的认领标识，便于在数据库里排查是谁认领了某一行 */
const TAB_ID = Math.random().toString(36).slice(2, 10)

/** 每个账号一本个人「翻译工具收藏」词库 */
export function collectedBookId(accountId: string): string {
  return `book_custom_collected_${accountId}`
}

export interface CollectResult {
  added: WordItem[]
  source?: string
  count: number
}

async function ensureCollectedBook(bookId: string, accountId: string): Promise<void> {
  const existing = await cloudRepositories.books.get(bookId)
  if (existing) return
  const now = Date.now()
  const book: VocabularyBook = {
    id: bookId,
    accountId,
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
  await cloudRepositories.books.put(book)
}

/**
 * 外部工具传来的 word_item 只做最小结构校验；id 一律按拼写重新派生，
 * 防止外部指定别的词的 id 把那个词的记录覆盖掉。
 */
function sanitizeWordItem(raw: unknown, cleanWord: string, wordId: string): WordItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<WordItem>
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : cleanWord
  if (buildWordId(name) !== wordId) return null
  const syllables =
    Array.isArray(item.syllables) && item.syllables.every((part) => typeof part === 'string') && item.syllables.length
      ? item.syllables
      : [name]
  const posList = Array.isArray(item.posList)
    ? item.posList.filter(
        (pos) => pos && typeof pos === 'object' && Array.isArray((pos as { means?: unknown }).means)
      )
    : []
  return { ...item, id: wordId, name, syllables, posList } as WordItem
}

type RowOutcome =
  | { kind: 'added'; word: WordItem }
  | { kind: 'done' }
  | { kind: 'failed'; message: string; retryable: boolean }

async function processRow(row: CollectedWordRow, bookId: string): Promise<RowOutcome> {
  const cleanWord = row.word?.trim()
  if (!cleanWord) return { kind: 'done' }

  const wordId = buildWordId(cleanWord)
  const provided = sanitizeWordItem(row.word_item, cleanWord, wordId)
  if (!provided && !isLikelyEnglishWord(cleanWord)) {
    return { kind: 'failed', message: '不是可识别的英文单词（短语、中文或带标点的内容暂不支持）', retryable: false }
  }

  // 读失败直接抛出，交给外层按可重试失败处理；绝不能把「读失败」当成「没有记录」去覆盖已有记录
  const existing = await cloudRepositories.wordRecords.get(wordId)
  if (existing && (existing.isStarred || existing.isError)) return { kind: 'done' }

  let targetWord = provided
  if (!targetWord) {
    try {
      const looked = await queryAiWordCore(useAiAssistantStore.getState().aiConfig, cleanWord)
      targetWord = looked ? { ...looked, id: wordId } : null
    } catch (lookupError) {
      if (lookupError instanceof AiDictionaryLookupError) {
        return { kind: 'failed', message: `词典判定无效：${lookupError.message}`, retryable: false }
      }
      return {
        kind: 'failed',
        message: lookupError instanceof Error ? lookupError.message : 'AI 查询失败',
        retryable: true,
      }
    }
  }
  if (!targetWord) {
    return { kind: 'failed', message: '未配置 AI Key，且离线词库未收录该词', retryable: true }
  }

  await cloudOperations.starWord(wordId, bookId, targetWord)
  return { kind: 'added', word: targetWord }
}

/** 拉取并消化收件箱；返回本次新收的单词（用于 Toast 提示） */
export async function pullCollectedWords(): Promise<CollectResult | null> {
  if (!isCloudSignedIn()) return null
  const accountId = getCloudAccountId()
  if (!accountId) return null

  const rows = await cloudOperations.claimCollectedWords(CLAIM_LIMIT, `${accountId}:${TAB_ID}`)
  if (rows.length === 0) return null

  const bookId = collectedBookId(accountId)
  const added: WordItem[] = []
  const addedIds: number[] = []
  const doneIds: number[] = []

  for (const row of rows) {
    let outcome: RowOutcome
    try {
      outcome = await processRow(row, bookId)
    } catch (error) {
      outcome = {
        kind: 'failed',
        message: error instanceof Error ? error.message : '处理失败',
        retryable: true,
      }
    }
    if (outcome.kind === 'failed') {
      await cloudOperations
        .failCollectedWord(row.id, outcome.message, outcome.retryable)
        .catch((error) => console.warn('[collector] failed to mark row as failed:', error))
      continue
    }
    if (outcome.kind === 'added') {
      added.push(outcome.word)
      addedIds.push(row.id)
      continue
    }
    doneIds.push(row.id)
  }

  let merged = false
  if (added.length > 0) {
    await ensureCollectedBook(bookId, accountId)
    merged = (await mergeWordsIntoBook(bookId, added)) !== null
  }
  // 并入收藏词库失败时不标记完成：这些行认领超时后会被重新认领（加星是幂等的）
  await cloudOperations.completeCollectedWords(merged ? [...doneIds, ...addedIds] : doneIds)
  if (!merged) return null

  if (added.length === 0) return null
  return {
    added,
    source: rows.find((row) => row.source)?.source ?? undefined,
    count: added.length,
  }
}
