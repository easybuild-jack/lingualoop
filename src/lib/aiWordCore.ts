'use client'

import { dictionaryLoader } from '@/core/dictionaryLoader'
import { applyAiFillToCustomBook, getWordFromAiCache, mergeWordIntoAiCache } from '@/db'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import {
  fetchAiDictionaryWordCore,
  getAiConfigFingerprint,
  type AiClientConfig,
} from '@/lib/aiClient'
import { isLikelyEnglishWord } from '@/lib/wordValidation'
import type { WordItem } from '@/types'

const inFlightCore = new Map<string, Promise<WordItem | null>>()

function isAiPhoneticReady(word: string, value?: string): boolean {
  const normalizedName = word.trim().toLowerCase()
  const raw = value?.trim() || ''
  const normalized = raw.replace(/^\/+|\/+$/g, '').trim()
  return Boolean(normalized && raw.toLowerCase() !== `/ ${normalizedName} /`)
}

function isAiMeaningReady(posList: WordItem['posList']): boolean {
  return Boolean(posList?.some(({ means }) =>
    means.some((meaning) => {
      const normalized = meaning.trim()
      return normalized && normalized !== '核心词义' && normalized !== '暂无释义'
    })
  ))
}

export function mergeAiWordCore(current: WordItem, generated: WordItem): WordItem {
  return {
    ...current,
    phoneticUs: isAiPhoneticReady(current.name, current.phoneticUs)
      ? current.phoneticUs
      : generated.phoneticUs,
    phoneticUk: isAiPhoneticReady(current.name, current.phoneticUk)
      ? current.phoneticUk
      : generated.phoneticUk,
    posList: isAiMeaningReady(current.posList) ? current.posList : generated.posList,
  }
}

export function isAiWordCoreReady(word: WordItem): boolean {
  return Boolean(
    isAiPhoneticReady(word.name, word.phoneticUs) &&
    isAiPhoneticReady(word.name, word.phoneticUk) &&
    isAiMeaningReady(word.posList)
  )
}

/** 查询并缓存音标、释义，不生成构词、例句和短语。 */
export function queryAiWordCore(
  config: AiClientConfig,
  word: string,
  fallback?: WordItem
): Promise<WordItem | null> {
  if (!isLikelyEnglishWord(word)) return Promise.resolve(null)

  const key = `${getAiConfigFingerprint(config)}::${word.trim().toLowerCase()}`
  const existing = inFlightCore.get(key)
  if (existing) return existing

  const task = (async () => {
    const cached = await getWordFromAiCache(word)
    const current = cached && fallback
      ? mergeAiWordCore(fallback, cached)
      : cached || fallback
    if (current && isAiWordCoreReady(current)) return current
    if (config.enabled === false || !config.apiKey?.trim()) return current || null

    const raw = await fetchAiDictionaryWordCore(config, word)
    if (!raw) return null
    const coreWord = await dictionaryLoader.convertRawEntryToWordItem(raw)
    const merged = current ? mergeAiWordCore(current, coreWord) : coreWord
    if (current) {
      void applyAiFillToCustomBook(useWorkspaceStore.getState().currentBook?.id, current.id, {
        phoneticUs: isAiPhoneticReady(current.name, current.phoneticUs) ? undefined : merged.phoneticUs,
        phoneticUk: isAiPhoneticReady(current.name, current.phoneticUk) ? undefined : merged.phoneticUk,
        posList: isAiMeaningReady(current.posList) ? undefined : merged.posList,
      })
    }

    return await mergeWordIntoAiCache(
      {
        name: merged.name,
        phoneticUs: merged.phoneticUs,
        phoneticUk: merged.phoneticUk,
        posList: merged.posList,
      },
      merged
    )
  })().finally(() => {
    if (inFlightCore.get(key) === task) inFlightCore.delete(key)
  })
  inFlightCore.set(key, task)
  return task
}
