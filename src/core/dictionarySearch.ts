import type { WordItem, WordEtymology } from '@/types'
import { dictionaryLoader } from '@/core/dictionaryLoader'
import { getWordFromAiCache, searchWordsInAiCache } from '@/db'
import { queryAiWordCore } from '@/lib/aiWordCore'
import type { AiClientConfig } from '@/lib/aiClient'
import { isLikelyEnglishWord } from '@/lib/wordValidation'
import { AiDictionaryLookupError } from '@/lib/aiPrompts'


export interface DictSearchResult {
  word: WordItem
  sourceBookId: string
  sourceBookName: string
  isCurrentBook: boolean
}

export interface DictSuggestionItem {
  name: string
  meaning: string
  sourceBookName: string
  isCurrentBook: boolean
}

/**
 * 快速前缀搜索补全联想（用于搜索输入框下拉推荐）
 */
export async function searchWordSuggestions(
  prefix: string,
  limit: number = 6
): Promise<DictSuggestionItem[]> {
  const clean = prefix.trim().toLowerCase()
  if (!isLikelyEnglishWord(clean)) return []

  // 主动查词的联想只显示已经查询并缓存过的单词
  const cachedMatches = await searchWordsInAiCache(clean, limit)
  return cachedMatches
    .filter((item) => item.name?.toLowerCase().startsWith(clean))
    .slice(0, limit)
    .map((item) => ({
        name: item.name,
        meaning: item.posList?.[0]?.means?.[0] || '常用释义',
        sourceBookName: '',
        isCurrentBook: false,
      }))
}

export interface ImportWordCandidate {
  rawName: string
  customMeaning?: string
  customPhonetic?: string
  customSyllables?: string[]
  customEtymology?: WordEtymology
}

export interface ReconciledImportWord {
  word: WordItem
  sourceBookId: string // 'ai_cache' | 'book_xxx' | 'dict_extended' | 'new'
  sourceBookName: string
  isFromAiCache: boolean
}

/**
 * 单词导入核心比对与补全流转：
 * 1. 只查询 AI 缓存，未命中时调用 AI 基础查询并永久缓存
 * 2. 合并用户随导入文件提供的自定义字段
 */
export async function reconcileWordForImport(
  candidate: ImportWordCandidate,
  aiConfig?: AiClientConfig
): Promise<ReconciledImportWord | null> {
  const cleanName = candidate.rawName.trim()
  const lowerName = cleanName.toLowerCase()

  let baseWord: WordItem | null
  try {
    baseWord = aiConfig
      ? await queryAiWordCore(aiConfig, cleanName)
      : await getWordFromAiCache(cleanName)
  } catch (error) {
    if (error instanceof AiDictionaryLookupError) return null
    throw error
  }
  if (!baseWord) return null

  // 音标：导入数据有自定义音标时优先采用
  const customPhonetic = candidate.customPhonetic?.trim()
  const phoneticUs = customPhonetic || baseWord.phoneticUs || baseWord.phoneticUk || `/ ${lowerName} /`
  const phoneticUk = customPhonetic || baseWord.phoneticUk || baseWord.phoneticUs || `/ ${lowerName} /`

  let syllables = baseWord.syllables
  if (
    candidate.customSyllables?.length &&
    candidate.customSyllables.join('').toLowerCase() === lowerName
  ) {
    syllables = candidate.customSyllables
  }

  const etymology = baseWord.etymology || candidate.customEtymology
  let posList = baseWord.posList
  if (candidate.customMeaning?.trim()) {
    const parsedUserPos = dictionaryLoader.parsePosAndMeans([candidate.customMeaning.trim()])
    if (parsedUserPos.length > 0) {
      posList = [
        ...parsedUserPos,
        ...baseWord.posList.filter(
          (p) => !parsedUserPos.some((up) => up.pos.toLowerCase() === p.pos.toLowerCase())
        ),
      ]
    }
  }

  const mergedWord: WordItem = {
    ...baseWord,
    name: cleanName,
    phoneticUs,
    phoneticUk,
    syllables: syllables?.length ? syllables : [cleanName],
    etymology,
    posList: posList?.length ? posList : [{ pos: 'other', means: ['核心词义'] }],
    examples: baseWord.examples?.length ? baseWord.examples : [],
    phrases: baseWord.phrases?.length ? baseWord.phrases : [],
  }

  return {
    word: mergedWord,
    sourceBookId: 'ai_cache',
    sourceBookName: '',
    isFromAiCache: true,
  }
}

