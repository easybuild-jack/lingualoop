/**
 * 口语陪练 · 语音识别（ASR）配置
 *
 * 职责边界：
 * - ASR 只做「你说的话 → 文本」，不做翻译、不改写、不参与对话。
 *   拿到文本后交给 runTurn()，由「AI 模型配置」里那套大模型生成回复。
 * - 与 TTS 是两条独立链路、两个独立资源：TTS 合成声音，ASR 听写你说的话。
 *   火山上它们要分别开通（TTS 是 seed-tts-*，ASR 是 volc.seedasr.auc）。
 * - 凭据默认「跟随语音合成里的豆包凭据」：同一个火山应用 / 同一个 API Key，
 *   只是资源 ID 不同，不必让用户把 AppID、Token 再抄一遍。
 *
 * 资源版本说明：
 * - volc.seedasr.auc   录音文件识别 2.0 · 标准版。控制台可直接开通、送 20 小时额度。
 *   这是唯一走法：极速版（volc.bigasr.auc_turbo）已从控制台下线，新账号开不出来。
 *
 * 存储：只写浏览器 localStorage（lingualoop_speaking_v3），服务端无状态转发。
 */

import type { SpeakingTtsConfig } from '@/lib/speaking/ttsConfig'

export type AsrProvider = 'doubao' | 'browser'

/** 与 TTS 一致：apikey 走新版控制台，token 走旧版 AppID + Access Token */
export type AsrAuthMode = 'apikey' | 'token'

/** 识别语言。auto 时不传 language，交给服务端自行判断 */
export type AsrLanguage = 'auto' | 'en-US' | 'en-GB' | 'zh-CN'

export const ASR_LANGUAGE_OPTIONS: { id: AsrLanguage; label: string; desc: string }[] = [
  { id: 'en-US', label: '英语（美式）', desc: '当前练习为美音时选这个' },
  { id: 'en-GB', label: '英语（英式）', desc: '当前练习为英音时选这个' },
  { id: 'zh-CN', label: '中文', desc: '练习中文口语时使用' },
  { id: 'auto', label: '自动', desc: '不指定语言，由服务端判断，中英混说时更宽松' },
]

export interface DoubaoAsrConfig {
  /** follow：复用语音合成里已填的豆包凭据；own：单独填写 */
  credentialSource: 'follow' | 'own'
  authMode: AsrAuthMode
  /** 新版控制台 API Key */
  apiKey: string
  /** 旧版控制台应用凭据 */
  appId: string
  accessToken: string
  language: AsrLanguage
}

export interface SpeakingAsrConfig {
  provider: AsrProvider
  doubao: DoubaoAsrConfig
}

/** 录音文件识别 2.0：先 submit 提交、再 query 轮询取结果 */
export const DOUBAO_ASR_SUBMIT_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit'
export const DOUBAO_ASR_QUERY_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query'

/** 识别资源 ID，固定 volc.seedasr.auc（录音文件识别 2.0） */
export const DOUBAO_ASR_RESOURCE_ID = 'volc.seedasr.auc'

export const DOUBAO_ASR_CONSOLE_URL = 'https://console.volcengine.com/speech/service'
export const DOUBAO_ASR_APIKEY_URL = 'https://console.volcengine.com/speech/new/setting/apikeys'

export const ASR_PROVIDERS: {
  id: AsrProvider
  name: string
  vendor: string
  summary: string
  tag?: string
}[] = [
  {
    id: 'doubao',
    name: '豆包语音识别',
    vendor: '火山引擎',
    summary: '录音文件识别 2.0，松手后整句识别，中英文准确率高，与语音合成共用同一个火山账号。',
    tag: '推荐',
  },
  {
    id: 'browser',
    name: '浏览器内置识别',
    vendor: '本机',
    summary: '免配置、边说边出字，但依赖浏览器厂商的在线服务，国内网络经常报 network。',
  },
]

export const SPEAKING_ASR_DEFAULT: SpeakingAsrConfig = {
  provider: 'doubao',
  doubao: {
    credentialSource: 'follow',
    authMode: 'apikey',
    apiKey: '',
    appId: '',
    accessToken: '',
    language: 'en-US',
  },
}

export interface AsrCredentials {
  authMode: AsrAuthMode
  apiKey: string
  appId: string
  accessToken: string
}

/** 解析实际要用的凭据：跟随语音合成时直接取豆包那套 */
export function resolveAsrCredentials(
  asr: SpeakingAsrConfig,
  tts: SpeakingTtsConfig
): AsrCredentials {
  const d = asr.doubao
  if (d.credentialSource === 'follow') {
    return {
      authMode: tts.doubao.authMode,
      apiKey: tts.doubao.apiKey,
      appId: tts.doubao.appId,
      accessToken: tts.doubao.accessToken,
    }
  }
  return {
    authMode: d.authMode,
    apiKey: d.apiKey,
    appId: d.appId,
    accessToken: d.accessToken,
  }
}

/** 识别是否可用（不看浏览器支持情况，只判断配置） */
export function isAsrReady(
  asr: SpeakingAsrConfig,
  tts: SpeakingTtsConfig
): { ready: boolean; reason?: string } {
  if (asr.provider === 'browser') return { ready: true }

  if (asr.doubao.credentialSource === 'follow' && tts.provider !== 'doubao') {
    return {
      ready: false,
      reason: '当前语音合成不是豆包，无法沿用它的凭据，请改选「单独填写」',
    }
  }

  const cred = resolveAsrCredentials(asr, tts)
  if (cred.authMode === 'apikey') {
    if (!cred.apiKey.trim()) return { ready: false, reason: '缺少豆包 API Key' }
  } else {
    if (!cred.appId.trim()) return { ready: false, reason: '缺少豆包 AppID' }
    if (!cred.accessToken.trim()) return { ready: false, reason: '缺少豆包 Access Token' }
  }
  return { ready: true }
}

/** 缺字段时补默认值，避免 undefined 进请求体 */
export function normalizeAsrConfig(raw: unknown): SpeakingAsrConfig {
  const saved = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const d = saved.doubao && typeof saved.doubao === 'object' ? (saved.doubao as Record<string, unknown>) : {}

  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
  const provider: AsrProvider = saved.provider === 'browser' ? 'browser' : 'doubao'
  const authMode: AsrAuthMode = d.authMode === 'token' ? 'token' : 'apikey'
  const source = d.credentialSource === 'own' ? 'own' : 'follow'
  const language: AsrLanguage =
    d.language === 'en-GB' || d.language === 'zh-CN' || d.language === 'auto' || d.language === 'en-US'
      ? d.language
      : 'en-US'

  return {
    provider,
    doubao: {
      credentialSource: source,
      authMode,
      apiKey: str(d.apiKey, ''),
      appId: str(d.appId, ''),
      accessToken: str(d.accessToken, ''),
      language,
    },
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // 分块拼接，避免超长参数把 String.fromCharCode 撑爆
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function readError(json: unknown, fallback: string): string {
  const err = json as { error?: { message?: string } } | null
  return err?.error?.message || fallback
}

export interface TranscribeResult {
  text: string
  /** 识别耗时（毫秒），用于面板上的性能提示 */
  latencyMs: number
  /** 服务端音频时长（毫秒） */
  durationMs?: number
  logid?: string
}

/**
 * 上传一段 WAV 并返回识别文本。
 * 走本站 /api/asr/doubao 无状态转发：浏览器无法给火山接口设鉴权头，直连也会被 CORS 拦。
 */
export async function transcribeSpeech(
  asr: SpeakingAsrConfig,
  tts: SpeakingTtsConfig,
  options: { audio: Blob; signal?: AbortSignal }
): Promise<TranscribeResult> {
  if (asr.provider === 'browser') {
    throw new Error('浏览器内置识别不需要上传音频，请直接使用 startSpeechCapture')
  }

  const startedAt = Date.now()
  const cred = resolveAsrCredentials(asr, tts)
  const data = await blobToBase64(options.audio)

  const res = await fetch('/api/asr/doubao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authMode: cred.authMode,
      apiKey: cred.apiKey,
      appId: cred.appId,
      accessToken: cred.accessToken,
      language: asr.doubao.language,
      format: 'wav',
      audio: data,
    }),
    signal: options.signal,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(readError(body, `语音识别失败 (HTTP ${res.status})`))
  }

  const json = (await res.json()) as { text?: string; durationMs?: number; logid?: string }
  return {
    text: (json.text ?? '').trim(),
    latencyMs: Date.now() - startedAt,
    durationMs: json.durationMs,
    logid: json.logid,
  }
}
