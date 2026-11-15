/**
 * 口语陪练的对话引擎。
 *
 * 负责三件事：
 * 1. 把场景、等级、纠错模式拼成角色扮演提示词；
 * 2. 调用「AI 模型配置」里那套大模型（口语不复用它的 systemPrompt，但共用 Endpoint / Key / Model）；
 * 3. 把模型返回的「正文 + ###FEEDBACK### + JSON」拆成可朗读的分句、中文翻译、纠错与生词。
 *
 * 这里不涉及语音：文本拿到后交给 speechPlayer 逐句合成播放。
 */

import { callAiChatCompletion, type AiChatMessage, type AiClientConfig } from '@/lib/aiClient'
import {
  type CorrectionMode,
  type SpeakingCorrection,
  type SpeakingLevel,
  type SpeakingScenario,
  type SpeakingVocab,
} from './scenarios'

/** 正文与结构化反馈的分隔标记 */
const FEEDBACK_MARKER = /#{2,}\s*FEEDBACK\s*#{0,}/i

export interface SpeakingHistoryItem {
  role: 'ai' | 'user'
  text: string
}

export interface SpeakingTurnInput {
  scenario: SpeakingScenario
  level: SpeakingLevel
  correction: CorrectionMode
  /** 之前的对话，按时间正序；只取最近若干轮 */
  history: SpeakingHistoryItem[]
  userText: string
}

export interface ParsedSpeakingReply {
  /** 按句切分，便于逐句朗读与高亮 */
  sentences: string[]
  zh: string
  correction?: SpeakingCorrection
  vocab?: SpeakingVocab[]
}

const LEVEL_HINT: Record<SpeakingLevel, string> = {
  A2: 'very simple words and short sentences, present tenses mostly, slow and clear',
  B1: 'everyday vocabulary, simple connected sentences, occasional past tense',
  B2: 'natural everyday speech, some idioms, varied sentence structure',
  C1: 'natural fluent speech with richer vocabulary and nuance, still conversational',
}

/** 纠错模式决定提示词里要不要让模型挑错 */
function correctionInstruction(mode: CorrectionMode): string {
  if (mode === 'live') {
    return `- "correction": quote the learner's exact wrong phrase in "original", the fixed phrase in "better", and a short Chinese explanation in "reason". Use null when the learner's sentence has no clear grammar or word-choice error — never invent a mistake.`
  }
  if (mode === 'summary') {
    return `- "correction": always null. Corrections are collected at the end of the session, so do not correct the learner mid-conversation.`
  }
  return `- "correction": always null.`
}

export function buildSpeakingSystemPrompt(input: SpeakingTurnInput): string {
  const { scenario, level, correction } = input
  return `You are playing a character in a spoken English role-play with a Chinese learner of English. Stay in character the whole time.

# Scene
- Setting: ${scenario.title}
- You are: ${scenario.roleName}, the ${scenario.role}
- Learner's level: CEFR ${level}

# How to reply
- Speak only English, in your character's voice.
- Keep each reply to 1-3 short sentences, roughly 10-35 words. It is read out loud by a speech engine, so it must sound natural when spoken.
- Match the learner's level: ${LEVEL_HINT[level]}.
- Always end with something easy for the learner to answer, so the conversation keeps going.
- Plain spoken text only: no markdown, no emoji, no stage directions, no parentheses, no bullet points, no quotation marks around the whole reply.
- Never mention being an AI or that this is a practice exercise.

# Output format
First write your spoken reply.
Then, if you have feedback, write a line containing exactly ###FEEDBACK### followed by one single-line JSON object:

{"zh":"...","correction":null,"vocab":[{"word":"...","meaning":"..."}]}

Rules for the JSON:
- "zh": always include a natural Chinese translation of your spoken reply.
- "vocab": 0-2 useful words or chunks taken from YOUR reply that a learner at this level may not know; "meaning" in Chinese.
${correctionInstruction(correction)}
- Output valid JSON on a single line, Chinese text directly (not \\u escapes).`
}

/** 历史太长会把 token 烧在上下文上，只保留最近几轮 */
const MAX_HISTORY_TURNS = 8

export function buildSpeakingMessages(input: SpeakingTurnInput): AiChatMessage[] {
  const messages: AiChatMessage[] = [{ role: 'system', content: buildSpeakingSystemPrompt(input) }]

  const recent = input.history.slice(-MAX_HISTORY_TURNS)
  for (const item of recent) {
    const content = item.text.trim()
    if (!content) continue
    messages.push({ role: item.role === 'ai' ? 'assistant' : 'user', content })
  }

  messages.push({ role: 'user', content: input.userText.trim() })
  return messages
}

/* ------------------------------------------------------------------ */
/* 解析                                                                */
/* ------------------------------------------------------------------ */

/** 尽可能从模型输出里抠出 JSON 对象，容忍 Markdown 代码块与前后杂字 */
function parseJsonLoose(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  if (!text) return null

  const candidates: string[] = [text]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null
}

/** 去掉朗读时会显得奇怪的 Markdown、动作提示与角色名前缀 */
export function cleanSpokenText(raw: string): string {
  return raw
    .replace(/```[a-z]*/gi, '')
    .replace(/^\s*(assistant|ai|system|[\w' ]{1,20})\s*[:：]\s*/i, (match, name: string) => {
      // 只把明显的角色名前缀去掉，避免误伤 "Sure: yes" 这类正常表达
      const lowered = String(name).toLowerCase()
      return ['assistant', 'ai', 'system'].includes(lowered) ? '' : match
    })
    .replace(/\*[^*\n]{1,60}\*/g, ' ') // *smiles*
    .replace(/[*_`#>]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * 按句末标点切分；保留标点，TTS 更自然。
 * 过短的句子（如 "Sure!"）会并入下一句：每句都要发一次合成请求，
 * 碎片太多既慢又费额度，合并后语气也更连贯。
 */
const MIN_WORDS_PER_SENTENCE = 5

export function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const merged: string[] = []
  let buffer = ''

  parts.forEach((part, index) => {
    buffer = buffer ? `${buffer} ${part}` : part
    if (index === parts.length - 1) {
      merged.push(buffer)
      buffer = ''
      return
    }
    const words = buffer.match(/[A-Za-z']+/g)?.length ?? 0
    if (words >= MIN_WORDS_PER_SENTENCE) {
      merged.push(buffer)
      buffer = ''
    }
  })

  if (buffer) merged.push(buffer)
  return merged
}

function toCorrection(value: unknown, userText: string): SpeakingCorrection | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const original = typeof raw.original === 'string' ? raw.original.trim() : ''
  const better = typeof raw.better === 'string' ? raw.better.trim() : ''
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (!original || !better || !reason) return undefined
  if (original.toLowerCase() === better.toLowerCase()) return undefined

  // 防止模型编造用户没说过的话：original 的实词应大部分出现在用户原句里
  const words = original.toLowerCase().match(/[a-z']{2,}/g) ?? []
  if (words.length > 0) {
    const userWords = new Set(userText.toLowerCase().match(/[a-z']{2,}/g) ?? [])
    const hit = words.filter((w) => userWords.has(w)).length
    if (hit / words.length < 0.6) return undefined
  }

  return { original, better, reason }
}

function toVocab(value: unknown): SpeakingVocab[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value
    .map((item) => {
      const raw = item as Record<string, unknown> | null
      const word = typeof raw?.word === 'string' ? raw.word.trim() : ''
      const meaning = typeof raw?.meaning === 'string' ? raw.meaning.trim() : ''
      return word && meaning ? { word, meaning } : null
    })
    .filter((v): v is SpeakingVocab => Boolean(v))
    .slice(0, 2)
  return list.length > 0 ? list : undefined
}

export function parseSpeakingReply(
  raw: string,
  options: { correction: CorrectionMode; userText: string }
): ParsedSpeakingReply {
  let spoken = raw
  let meta: Record<string, unknown> | null = null

  const marker = raw.match(FEEDBACK_MARKER)
  if (marker && marker.index !== undefined) {
    spoken = raw.slice(0, marker.index)
    const parsed = parseJsonLoose(raw.slice(marker.index + marker[0].length))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = parsed as Record<string, unknown>
    }
  }

  const cleaned = cleanSpokenText(spoken)
  const sentences = splitSentences(cleaned)

  const zh = typeof meta?.zh === 'string' ? meta.zh.trim() : ''
  const correction =
    options.correction === 'live' ? toCorrection(meta?.correction, options.userText) : undefined

  return {
    sentences,
    zh,
    correction,
    vocab: toVocab(meta?.vocab),
  }
}

/**
 * 让模型生成这一轮回复。
 * temperature 固定偏高一点让口语更自然，maxTokens 只留够一轮对话的量。
 */
export async function requestSpeakingTurn(
  config: AiClientConfig,
  input: SpeakingTurnInput,
  signal?: AbortSignal
): Promise<ParsedSpeakingReply> {
  const messages = buildSpeakingMessages(input)
  const raw = await callAiChatCompletion(
    { ...config, temperature: 0.8, maxTokens: Math.min(1024, Math.max(320, config.maxTokens ?? 700)) },
    messages,
    signal
  )
  const parsed = parseSpeakingReply(raw, { correction: input.correction, userText: input.userText })

  if (parsed.sentences.length === 0) {
    throw new Error('模型没有返回可朗读的内容，请重试或换一个对话模型')
  }
  return parsed
}
