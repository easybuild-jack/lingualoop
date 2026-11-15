/**
 * 口语陪练 · 语音合成（TTS）配置
 *
 * 职责边界：
 * - 对话内容由「AI 模型配置」那套大模型生成（DeepSeek / 豆包 / OpenAI / 通义均可），
 *   口语这里不另配大模型，完全与 AI 对话保持一致。
 * - TTS 只负责语音输出这一步：把一段文本实时合成音频（语种跟随当前练习的语言）。
 *   它不参与对话、不做纠错、不改写内容，也不预设语种。
 * - 因此 TTS 必须先有 AI 模型配置才允许配置：没有对话模型，合成出来的声音也没内容可读。
 *
 * 服务商可切换，各家的凭据与音色各自独立保存，切走再切回不会丢配置：
 * - doubao  火山引擎豆包语音合成
 *     · apikey 鉴权：新版控制台 API Key + X-Api-Resource-Id，走 V3 unidirectional
 *     · token  鉴权：旧版控制台 AppID + Access Token + cluster，走 V1 /api/v1/tts
 * - qwen    阿里云百炼千问 TTS（API Key，multimodal-generation 非流式，返回音频 URL）
 * - browser 浏览器内置 speechSynthesis（免密钥，纯本地，音色由系统决定）
 *
 * 存储：全部写在浏览器 localStorage（lingualoop_speaking_v3），服务端只做无状态转发。
 */

import { SPEAKING_VOICES, type SpeakingVoiceId } from '@/lib/speaking/scenarios'

export type TtsProvider = 'doubao' | 'qwen' | 'browser'

/** 需要凭据的云端服务商 */
export type CloudTtsProvider = Exclude<TtsProvider, 'browser'>

export interface TtsProviderMeta {
  id: TtsProvider
  name: string
  vendor: string
  summary: string
  /** 控制台 / 密钥申请地址 */
  consoleUrl: string
  consoleLabel: string
  tag?: string
}

export const TTS_PROVIDERS: TtsProviderMeta[] = [
  {
    id: 'doubao',
    name: '豆包语音合成',
    vendor: '火山引擎',
    summary: '音色多、英文表现好，支持 API Key 与旧版 AppID 两种鉴权。',
    consoleUrl: 'https://console.volcengine.com/speech/service/8',
    consoleLabel: '火山引擎控制台',
    tag: '常见首选',
  },
  {
    id: 'qwen',
    name: '千问语音合成',
    vendor: '阿里云百炼',
    summary: '通义千问 TTS，一个 API Key 即可，多语种通用。音色不分英美口音。',
    consoleUrl: 'https://bailian.console.aliyun.com/',
    consoleLabel: '百炼控制台',
    tag: '国产可选',
  },
  {
    id: 'browser',
    name: '浏览器内置语音',
    vendor: '本机',
    summary: '无需密钥、完全本地。音色与自然度取决于系统和浏览器，适合先试听效果。',
    consoleUrl: '',
    consoleLabel: '',
  },
]

export function getTtsProviderMeta(id: TtsProvider): TtsProviderMeta {
  return TTS_PROVIDERS.find((p) => p.id === id) ?? TTS_PROVIDERS[0]
}

/* ------------------------------------------------------------------ */
/* 豆包（火山引擎）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 鉴权方式：
 * - apikey 新版控制台（推荐，旧版后续会下线）：请求头 X-Api-Key + X-Api-Resource-Id
 * - token  旧版控制台：请求头 Authorization: Bearer;{token} + body.app.cluster
 */
export type DoubaoAuthMode = 'apikey' | 'token'

/** 音色家族，必须与资源版本配套，否则会报 requested resource not granted */
export type DoubaoVoiceFamily = '2.0' | '1.0'

export interface DoubaoResourceOption {
  id: string
  label: string
  family: DoubaoVoiceFamily
  desc: string
}

export const DOUBAO_RESOURCE_OPTIONS: DoubaoResourceOption[] = [
  {
    id: 'seed-tts-2.0',
    label: '语音合成 2.0',
    family: '2.0',
    desc: '音质最好，只能用 2.0 音色（*_uranus_bigtts）',
  },
  {
    id: 'seed-tts-1.0',
    label: '语音合成 1.0',
    family: '1.0',
    desc: '兼容老音色（*_moon_bigtts / *_mars_bigtts）',
  },
  {
    id: 'seed-icl-2.0',
    label: '声音复刻 2.0',
    family: '2.0',
    desc: '使用自己克隆的音色（S_ 开头）',
  },
]

export interface DoubaoTtsConfig {
  authMode: DoubaoAuthMode
  /** 新版控制台 API Key（控制台 > API Key 管理） */
  apiKey: string
  /** V3 的资源标识，决定可用音色与计费方式 */
  resourceId: string
  /** 旧版控制台应用凭据 */
  appId: string
  accessToken: string
  cluster: string
  encoding: 'mp3' | 'wav'
  /** 音量 0.5 ~ 2.0 */
  volume: number
  /** 四个音色槽位各自绑定一个音色 ID，与准备页「音色」选项一一对应 */
  voices: Record<SpeakingVoiceId, string>
}

export const DOUBAO_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts'
export const DOUBAO_V3_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
export const DOUBAO_CONSOLE_URL = 'https://console.volcengine.com/speech/service/8'
export const DOUBAO_APIKEY_URL = 'https://console.volcengine.com/speech/service/10019'

type VoiceSet = Record<SpeakingVoiceId, string>

/** 2.0 默认音色：官方音色库里的英文音色，配合 seed-tts-2.0 使用 */
const DOUBAO_VOICES_2: VoiceSet = {
  'us-female': 'en_female_jane_uranus_bigtts',
  'us-male': 'en_male_tim_uranus_bigtts',
  'uk-female': 'en_female_dacey_uranus_bigtts',
  'uk-male': 'en_male_knightley_uranus_bigtts',
}

/** 1.0 默认音色：配合 seed-tts-1.0 或旧版 V1 接口使用 */
const DOUBAO_VOICES_1: VoiceSet = {
  'us-female': 'en_female_mars_bigtts',
  'us-male': 'en_male_mars_bigtts',
  'uk-female': 'en_female_daisy_moon_bigtts',
  'uk-male': 'en_male_dave_moon_bigtts',
}

const DOUBAO_TTS_DEFAULT: DoubaoTtsConfig = {
  authMode: 'apikey',
  apiKey: '',
  resourceId: 'seed-tts-2.0',
  appId: '',
  accessToken: '',
  cluster: 'volcano_tts',
  encoding: 'mp3',
  volume: 1,
  voices: DOUBAO_VOICES_2,
}

/** 当前配置实际会用的音色家族 */
export function doubaoVoiceFamily(doubao: DoubaoTtsConfig): DoubaoVoiceFamily {
  if (doubao.authMode === 'token') return '1.0'
  const option = DOUBAO_RESOURCE_OPTIONS.find((o) => o.id === doubao.resourceId)
  return option?.family ?? '2.0'
}

export function defaultDoubaoVoices(doubao: DoubaoTtsConfig): VoiceSet {
  return { ...(doubaoVoiceFamily(doubao) === '2.0' ? DOUBAO_VOICES_2 : DOUBAO_VOICES_1) }
}

/** 音色 ID 与当前版本是否明显不配套（只做粗判：*_uranus_bigtts 属于 2.0） */
export function hasVoiceFamilyMismatch(doubao: DoubaoTtsConfig): boolean {
  const family = doubaoVoiceFamily(doubao)
  return SPEAKING_VOICES.some((v) => {
    const id = doubao.voices[v.id as SpeakingVoiceId]?.trim()
    if (!id) return false
    const isUranus = id.includes('_uranus_')
    return family === '2.0' ? !isUranus && !id.startsWith('S_') : isUranus
  })
}

/* ------------------------------------------------------------------ */
/* 千问（阿里云百炼）                                                   */
/* ------------------------------------------------------------------ */

/** 非流式接口按地域区分，两个地域的 API Key 不通用 */
export type QwenRegion = 'beijing' | 'singapore'

export const QWEN_TTS_ENDPOINT: Record<QwenRegion, string> = {
  beijing: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  singapore:
    'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
}

export const QWEN_CONSOLE_URL = 'https://bailian.console.aliyun.com/'

export const QWEN_MODEL_SUGGESTIONS = [
  { id: 'qwen3-tts-flash', label: 'qwen3-tts-flash' },
  { id: 'qwen-tts-latest', label: 'qwen-tts-latest' },
  { id: 'qwen-tts', label: 'qwen-tts' },
]

export interface QwenTtsConfig {
  /** 百炼 API Key（sk- 开头），与对话大模型的 Key 是两套 */
  apiKey: string
  model: string
  region: QwenRegion
  /** 四个音色槽位各自绑定一个千问音色名，例如 Cherry */
  voices: Record<SpeakingVoiceId, string>
}

const QWEN_TTS_DEFAULT: QwenTtsConfig = {
  apiKey: '',
  model: 'qwen3-tts-flash',
  region: 'beijing',
  voices: {
    'us-female': 'Jennifer',
    'us-male': 'Ryan',
    'uk-female': 'Serena',
    'uk-male': 'Ethan',
  },
}

/* ------------------------------------------------------------------ */
/* 汇总配置                                                            */
/* ------------------------------------------------------------------ */

export interface SpeakingTtsConfig {
  provider: TtsProvider
  doubao: DoubaoTtsConfig
  qwen: QwenTtsConfig
}

export const SPEAKING_TTS_DEFAULT: SpeakingTtsConfig = {
  provider: 'doubao',
  doubao: DOUBAO_TTS_DEFAULT,
  qwen: QWEN_TTS_DEFAULT,
}

type Suggestion = { id: string; label: string }

/** 豆包按版本给音色建议，避免 2.0 资源配 1.0 音色 */
const DOUBAO_VOICE_SUGGESTIONS: Record<DoubaoVoiceFamily, Record<SpeakingVoiceId, Suggestion[]>> = {
  '2.0': {
    'us-female': [
      { id: 'en_female_jane_uranus_bigtts', label: 'Jane 美式' },
      { id: 'en_female_myra_uranus_bigtts', label: 'Myra 美式' },
      { id: 'en_female_hayley_uranus_bigtts', label: 'Hayley 美式' },
    ],
    'us-male': [
      { id: 'en_male_tim_uranus_bigtts', label: 'Tim 美式' },
      { id: 'en_male_david_uranus_bigtts', label: 'David 美式' },
      { id: 'en_male_michael_uranus_bigtts', label: 'Hank 美式' },
    ],
    'uk-female': [
      { id: 'en_female_dacey_uranus_bigtts', label: 'Dacey' },
      { id: 'en_female_jane_uranus_bigtts', label: 'Jane' },
      { id: 'en_female_mel_uranus_bigtts', label: 'Mel' },
    ],
    'uk-male': [
      { id: 'en_male_knightley_uranus_bigtts', label: 'Knightley 英式' },
      { id: 'en_male_father-christmas_uranus_bigtts', label: 'Alfred 英式' },
      { id: 'en_male_ryan_uranus_bigtts', label: 'Ryan' },
    ],
  },
  '1.0': {
    'us-female': [
      { id: 'en_female_mars_bigtts', label: '活泼女声' },
      { id: 'en_female_nara_moon_bigtts', label: 'Nara' },
      { id: 'en_female_candice_emo_v2_mars_bigtts', label: 'Candice 多情感' },
    ],
    'us-male': [
      { id: 'en_male_mars_bigtts', label: '柔和男声' },
      { id: 'en_male_michael_moon_bigtts', label: 'Michael' },
      { id: 'en_male_glen_emo_v2_mars_bigtts', label: 'Glen 多情感' },
    ],
    'uk-female': [
      { id: 'en_female_daisy_moon_bigtts', label: 'Daisy' },
      { id: 'en_female_onez_moon_bigtts', label: 'Onez' },
      { id: 'en_female_nadia_tips_emo_v2_mars_bigtts', label: 'Nadia 多情感' },
    ],
    'uk-male': [
      { id: 'en_male_dave_moon_bigtts', label: 'Dave' },
      { id: 'en_male_hades_moon_bigtts', label: 'Hades' },
      { id: 'en_male_corey_emo_v2_mars_bigtts', label: 'Corey 多情感' },
    ],
  },
}

const QWEN_VOICE_SUGGESTIONS: Record<SpeakingVoiceId, Suggestion[]> = {
  'us-female': [
    { id: 'Jennifer', label: 'Jennifer 美式' },
    { id: 'Cherry', label: 'Cherry' },
    { id: 'Serena', label: 'Serena' },
  ],
  'us-male': [
    { id: 'Ryan', label: 'Ryan 美式' },
    { id: 'Aiden', label: 'Aiden 美式' },
    { id: 'Ethan', label: 'Ethan' },
  ],
  'uk-female': [
    { id: 'Serena', label: 'Serena（偏通用）' },
    { id: 'Cherry', label: 'Cherry（偏通用）' },
    { id: 'Chelsie', label: 'Chelsie' },
  ],
  'uk-male': [
    { id: 'Ethan', label: 'Ethan（偏通用）' },
    { id: 'Moon', label: 'Moon' },
    { id: 'Kai', label: 'Kai' },
  ],
}

/** 当前服务商 / 当前版本下，某个槽位的常用音色 */
export function voiceSuggestionsFor(tts: SpeakingTtsConfig, slot: SpeakingVoiceId): Suggestion[] {
  if (tts.provider === 'qwen') return QWEN_VOICE_SUGGESTIONS[slot]
  return DOUBAO_VOICE_SUGGESTIONS[doubaoVoiceFamily(tts.doubao)][slot]
}

export const VOICE_SLOT_LABEL: Record<SpeakingVoiceId, string> = SPEAKING_VOICES.reduce(
  (acc, v) => ({ ...acc, [v.id]: v.label }),
  {} as Record<SpeakingVoiceId, string>
)

export const TTS_SAMPLE_TEXT = 'Hi there! I am Emma. How has your day been so far?'

/* ------------------------------------------------------------------ */
/* 就绪判定与读取                                                       */
/* ------------------------------------------------------------------ */

/** 对话大模型是否可用于口语（TTS 配置的前置条件） */
export function isChatModelReady(config: {
  enabled?: boolean
  apiKey?: string
  endpoint?: string
  model?: string
}): { ready: boolean; reason?: string } {
  if (config.enabled === false) return { ready: false, reason: 'AI 功能当前处于关闭状态' }
  if (!config.endpoint?.trim()) return { ready: false, reason: '还没有填写大模型 API 端点' }
  if (!config.model?.trim()) return { ready: false, reason: '还没有选择对话模型' }
  if (!config.apiKey?.trim()) return { ready: false, reason: '还没有填写大模型 API Key' }
  return { ready: true }
}

/** 指定服务商的凭据是否填全（不含音色绑定） */
export function isTtsProviderConfigured(tts: SpeakingTtsConfig, provider: TtsProvider = tts.provider): boolean {
  if (provider === 'browser') return true
  if (provider === 'doubao') {
    const d = tts.doubao
    return d.authMode === 'apikey'
      ? Boolean(d.apiKey.trim() && d.resourceId.trim())
      : Boolean(d.appId.trim() && d.accessToken.trim() && d.cluster.trim())
  }
  const q = tts.qwen
  return Boolean(q.apiKey.trim() && q.model.trim())
}

/** 该服务商当前还没绑定音色的槽位；浏览器内置语音不绑定音色 */
export function missingVoiceSlots(tts: SpeakingTtsConfig, provider: TtsProvider = tts.provider): SpeakingVoiceId[] {
  if (provider === 'browser') return []
  const voices = provider === 'doubao' ? tts.doubao.voices : tts.qwen.voices
  return SPEAKING_VOICES.filter((v) => !voices[v.id as SpeakingVoiceId]?.trim()).map(
    (v) => v.id as SpeakingVoiceId
  )
}

/** TTS 自身是否可用于合成 */
export function isTtsReady(
  tts: SpeakingTtsConfig,
  voice: SpeakingVoiceId = 'us-female'
): { ready: boolean; reason?: string } {
  if (tts.provider === 'browser') {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? { ready: true }
      : { ready: false, reason: '当前浏览器不支持内置语音合成' }
  }

  if (tts.provider === 'qwen') {
    if (!tts.qwen.apiKey.trim()) return { ready: false, reason: '缺少千问 API Key' }
    if (!tts.qwen.model.trim()) return { ready: false, reason: '还没有选择千问 TTS 模型' }
    if (!tts.qwen.voices[voice]?.trim()) {
      return { ready: false, reason: `「${VOICE_SLOT_LABEL[voice]}」还没有绑定音色名` }
    }
    return { ready: true }
  }

  const d = tts.doubao
  if (d.authMode === 'apikey') {
    if (!d.apiKey.trim()) return { ready: false, reason: '缺少豆包 API Key' }
    if (!d.resourceId.trim()) return { ready: false, reason: '还没有选择资源版本（X-Api-Resource-Id）' }
  } else {
    if (!d.appId.trim()) return { ready: false, reason: '缺少豆包 AppID' }
    if (!d.accessToken.trim()) return { ready: false, reason: '缺少豆包 Access Token' }
    if (!d.cluster.trim()) return { ready: false, reason: '缺少业务集群 Cluster' }
  }
  if (!d.voices[voice]?.trim()) {
    return { ready: false, reason: `「${VOICE_SLOT_LABEL[voice]}」还没有绑定音色 ID` }
  }
  return { ready: true }
}

export function resolveVoiceId(tts: SpeakingTtsConfig, voice: SpeakingVoiceId): string {
  if (tts.provider === 'qwen') {
    return tts.qwen.voices[voice]?.trim() || QWEN_TTS_DEFAULT.voices[voice]
  }
  return tts.doubao.voices[voice]?.trim() || DOUBAO_TTS_DEFAULT.voices[voice]
}

/** 千问需要显式声明语种，否则多语种混排会读错；槽位只有英美，统一给 English */
export function resolveQwenLanguage(voice: SpeakingVoiceId): string {
  return voice.startsWith('uk') || voice.startsWith('us') ? 'English' : 'Auto'
}

/**
 * 语速换算：
 * - 豆包 V3 走 speech_rate（-50~100，100 = 2 倍速），由服务端合成；
 * - 豆包 V1 走 speed_ratio，同样服务端合成；
 * - 千问接口没有语速参数，只能在播放端用 playbackRate 调节。
 * 返回 1 表示播放端不需要二次变速。
 */
export function playbackRateFor(tts: SpeakingTtsConfig, speed: number): number {
  if (tts.provider !== 'qwen') return 1
  return Math.min(2, Math.max(0.5, speed))
}

/** 语速倍率 → 豆包 V3 的 speech_rate（0.8 → -20，1.0 → 0，1.2 → 20） */
export function doubaoSpeechRate(speed: number): number {
  const rate = Math.round((Math.min(2, Math.max(0.5, speed)) - 1) * 100)
  return Math.min(100, Math.max(-50, rate))
}

/** 音量倍率 → 豆包 V3 的 loudness_rate */
export function doubaoLoudnessRate(volume: number): number {
  const rate = Math.round((Math.min(2, Math.max(0.5, volume)) - 1) * 100)
  return Math.min(100, Math.max(-50, rate))
}

/* ------------------------------------------------------------------ */
/* 存档兼容                                                            */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function mergeVoices(defaults: VoiceSet, ...sources: unknown[]): VoiceSet {
  const out = { ...defaults }
  for (const source of sources) {
    const rec = asRecord(source)
    for (const v of SPEAKING_VOICES) {
      const raw = rec[v.id]
      if (typeof raw === 'string') out[v.id as SpeakingVoiceId] = raw
    }
  }
  return out
}

/**
 * 把存档补齐成当前结构。
 *
 * 存档只可能来自本版本的 localStorage，因此不做旧形态兼容，只按字段兜底默认值，
 * 避免用户没填过的项以 undefined 进请求体。
 */
export function normalizeTtsConfig(raw: unknown): SpeakingTtsConfig {
  const saved = asRecord(raw)
  const savedDoubao = asRecord(saved.doubao)
  const savedQwen = asRecord(saved.qwen)

  const provider: TtsProvider =
    saved.provider === 'qwen' || saved.provider === 'browser' || saved.provider === 'doubao'
      ? saved.provider
      : 'doubao'

  const authMode: DoubaoAuthMode = savedDoubao.authMode === 'token' ? 'token' : 'apikey'

  // V1 接口只能配 1.0 音色，因此 token 鉴权默认落到 1.0 资源
  const resourceId = str(
    savedDoubao.resourceId,
    authMode === 'token' ? 'seed-tts-1.0' : DOUBAO_TTS_DEFAULT.resourceId
  )

  const doubao: DoubaoTtsConfig = {
    authMode,
    apiKey: str(savedDoubao.apiKey, ''),
    resourceId,
    appId: str(savedDoubao.appId, ''),
    accessToken: str(savedDoubao.accessToken, ''),
    cluster: str(savedDoubao.cluster, 'volcano_tts'),
    encoding: savedDoubao.encoding === 'wav' ? 'wav' : 'mp3',
    volume: typeof savedDoubao.volume === 'number' ? savedDoubao.volume : DOUBAO_TTS_DEFAULT.volume,
    voices: mergeVoices(DOUBAO_VOICES_2, savedDoubao.voices),
  }

  const qwen: QwenTtsConfig = {
    apiKey: str(savedQwen.apiKey, ''),
    model: str(savedQwen.model, QWEN_TTS_DEFAULT.model),
    region: savedQwen.region === 'singapore' ? 'singapore' : 'beijing',
    voices: mergeVoices(QWEN_TTS_DEFAULT.voices, savedQwen.voices),
  }

  return { provider, doubao, qwen }
}

/* ------------------------------------------------------------------ */
/* 合成调用                                                            */
/* ------------------------------------------------------------------ */

function readError(json: unknown, fallback: string): string {
  const err = json as { error?: { message?: string } } | null
  return err?.error?.message || fallback
}

export interface SynthesizeOptions {
  text: string
  voice: SpeakingVoiceId
  /** 0.5 ~ 2.0；豆包在服务端生效，千问通过 playbackRate 在播放端生效 */
  speed?: number
  signal?: AbortSignal
}

/**
 * 合成一句话，返回可直接播放的 Blob。
 * 优先走本站 /api/tts/* 转发（浏览器直连各家长商都会被 CORS 拦截）；
 * 服务端只在内存里转一次凭证，不落盘、不写日志。
 */
export async function synthesizeSpeech(
  tts: SpeakingTtsConfig,
  options: SynthesizeOptions
): Promise<{ blob: Blob; latencyMs: number }> {
  const { text, voice, speed = 1, signal } = options
  const startedAt = Date.now()

  if (tts.provider === 'browser') {
    throw new Error('浏览器内置语音无需请求接口，请直接使用 speechSynthesis 播放')
  }

  const isQwen = tts.provider === 'qwen'
  const payload = isQwen
    ? {
        apiKey: tts.qwen.apiKey,
        model: tts.qwen.model,
        region: tts.qwen.region,
        voice: resolveVoiceId(tts, voice),
        language: resolveQwenLanguage(voice),
        text,
      }
    : {
        authMode: tts.doubao.authMode,
        apiKey: tts.doubao.apiKey,
        resourceId: tts.doubao.resourceId,
        appId: tts.doubao.appId,
        accessToken: tts.doubao.accessToken,
        cluster: tts.doubao.cluster,
        voiceType: resolveVoiceId(tts, voice),
        text,
        speed,
        volume: tts.doubao.volume,
        // V3 的流式接口对 wav 支持不佳，API Key 模式统一用 mp3
        encoding: tts.doubao.authMode === 'apikey' ? 'mp3' : tts.doubao.encoding,
      }

  const res = await fetch(isQwen ? '/api/tts/qwen' : '/api/tts/doubao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(readError(body, `语音合成失败 (HTTP ${res.status})`))
  }

  const blob = await res.blob()
  if (blob.size === 0) throw new Error('语音合成返回了空音频，请检查音色是否有效')
  return { blob, latencyMs: Date.now() - startedAt }
}

/** 没有云端账号时的兜底：用系统内置语音朗读，纯本地，不走任何接口 */
export function speakWithSystemVoice(
  text: string,
  options: { lang: 'en-US' | 'en-GB'; rate: number }
): Promise<{ latencyMs: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      reject(new Error('当前浏览器不支持内置语音合成'))
      return
    }
    const startedAt = Date.now()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = options.lang
    utter.rate = options.rate
    utter.onend = () => resolve({ latencyMs: Date.now() - startedAt })
    utter.onerror = () => reject(new Error('浏览器语音合成失败'))
    window.speechSynthesis.speak(utter)
  })
}
