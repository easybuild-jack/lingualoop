/**
 * 豆包（火山引擎）语音合成代理
 *
 * 只负责把文本转成音频：
 * - 凭证从请求体拿，仅在内存中拼进请求头，请求结束即丢弃；
 * - 不写数据库、不写日志、不缓存音频。
 *
 * 两种鉴权方式并存：
 * - apikey（新版控制台，推荐）：V3 单向流式
 *   POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
 *   请求头 X-Api-Key + X-Api-Resource-Id，响应是 chunked JSON，音频在 data 字段（base64）
 * - token（旧版控制台）：V1 非流式
 *   POST https://openspeech.bytedance.com/api/v1/tts
 *   请求头 Authorization: Bearer;{token}，body 里带 app.cluster
 *
 * 上游的英文报错会尽量翻译成可操作的中文（同时保留原始信息，便于排查）。
 */

import {
  DOUBAO_TTS_ENDPOINT,
  DOUBAO_V3_ENDPOINT,
  doubaoLoudnessRate,
  doubaoSpeechRate,
} from '@/lib/speaking/ttsConfig'

const MAX_TEXT_LENGTH = 600
const V3_CHUNK_SUCCESS = 20000000

interface TtsRequestBody {
  authMode?: 'apikey' | 'token'
  apiKey?: string
  resourceId?: string
  appId?: string
  accessToken?: string
  cluster?: string
  voiceType?: string
  text?: string
  speed?: number
  volume?: number
  encoding?: 'mp3' | 'wav'
}

const CONTENT_TYPE: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

/** 把火山常见英文报错翻译成能照着做的中文提示 */
function explainUpstream(raw: string): string | null {
  const m = raw.toLowerCase()
  if (
    m.includes('requested grant') ||
    m.includes('grant not found') ||
    m.includes('requested resource not granted') ||
    m.includes('resource not granted') ||
    m.includes('permission denied')
  ) {
    return '该音色所属服务未开通或未授权：确认控制台已开通对应资源版本，且「资源版本」与音色配套（2.0 音色只能用 seed-tts-2.0，1.0 音色用 seed-tts-1.0）'
  }
  if (m.includes('quota exceeded') || m.includes('concurrency') || m.includes('rate limit')) {
    return '额度或并发不足：免费额度可能已用完，或同时合成的请求过多，稍后重试'
  }
  if (
    m.includes('invalid x-api-key') ||
    m.includes('invalid auth') ||
    m.includes('unauthorized') ||
    m.includes('api key')
  ) {
    return 'API Key 或 Access Token 无效：确认复制完整、没有多余空格，并确认它属于当前控制台应用'
  }
  if (m.includes('requested resource not found')) {
    return '音色 ID 不存在：请到控制台音色库核对，并确认音色与资源版本配套'
  }
  if (m.includes('exceededtextlimit') || m.includes('text limit')) {
    return '文本超出单次上限，请按句拆分后再合成'
  }
  return null
}

/** 状态码兜底：V3 有时只回状态码、message 在 body.header 里，甚至为空 */
function explainStatus(status: number): string | null {
  if (status === 401 || status === 403) {
    return 'API Key 无效或无权限：确认复制完整、没有多余空格，并确认它属于当前控制台且已开通语音合成服务'
  }
  if (status === 429) return '请求过于频繁或并发超限，稍后重试'
  return null
}

function fail(message: string, status: number, raw?: string, logid?: string | null) {
  const hint = explainUpstream(raw || message) ?? (raw ? null : explainStatus(status))
  return Response.json(
    {
      error: {
        message: hint ? `${hint}（上游原始信息：${raw || message}）` : message,
        hint: hint ?? undefined,
        raw: raw ?? message,
        logid: logid ?? undefined,
      },
    },
    { status }
  )
}

function audioResponse(bytes: Uint8Array, contentType: string) {
  // 复制到独立 ArrayBuffer，避免把带 offset 的视图直接当 BodyInit
  const body = new Uint8Array(bytes.byteLength)
  body.set(bytes)
  return new Response(body.buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * V3 响应是一串直接拼接的 JSON 对象（不是 NDJSON，也不保证按行切）。
 * 逐个括号配对切出对象，收集 data 里的 base64 音频分片。
 */
function collectV3Audio(raw: string): { audio: Buffer[]; errorMessage: string | null } {
  const audio: Buffer[] = []
  let errorMessage: string | null = null

  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  const handle = (slice: string) => {
    try {
      const obj = JSON.parse(slice) as {
        code?: number
        message?: string
        data?: string | null
        header?: { code?: number; message?: string }
      }
      const code = typeof obj.code === 'number' ? obj.code : obj.header?.code
      const message = obj.message || obj.header?.message
      if (typeof code === 'number' && code !== 0 && code !== V3_CHUNK_SUCCESS) {
        errorMessage = message || `语音合成失败（code ${code}）`
      }
      if (typeof obj.data === 'string' && obj.data.length > 0) {
        audio.push(Buffer.from(obj.data, 'base64'))
      }
    } catch {
      // 单个分片解析失败不影响其它分片
    }
  }

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }
    if (ch === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        handle(raw.slice(start, i + 1))
        start = -1
      }
    }
  }

  return { audio, errorMessage }
}

async function synthesizeV3(params: {
  apiKey: string
  resourceId: string
  voiceType: string
  text: string
  speed: number
  volume: number
}) {
  const { apiKey, resourceId, voiceType, text, speed, volume } = params

  const upstream = await fetch(DOUBAO_V3_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey.trim(),
      'X-Api-Resource-Id': resourceId.trim(),
      'X-Api-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({
      user: { uid: 'lingualoop-speaking' },
      req_params: {
        text,
        speaker: voiceType,
        audio_params: {
          // 流式接口对 wav 支持不佳，统一用 mp3
          format: 'mp3',
          sample_rate: 24000,
          speech_rate: doubaoSpeechRate(speed),
          loudness_rate: doubaoLoudnessRate(volume),
        },
      },
    }),
    signal: AbortSignal.timeout(60000),
  })

  const raw = await upstream.text()
  const logid = upstream.headers.get('x-tt-logid')

  if (!upstream.ok) {
    let message = `语音服务返回 HTTP ${upstream.status}`
    try {
      // V3 的错误体形如 { header: { code, message } }，也有直接平铺的情况
      const parsed = JSON.parse(raw) as {
        header?: { message?: string }
        message?: string
        error?: { message?: string }
      }
      message = parsed.header?.message || parsed.error?.message || parsed.message || message
    } catch {
      if (raw.trim()) message = raw.slice(0, 200)
    }
    return fail(message, upstream.status, message === `语音服务返回 HTTP ${upstream.status}` ? undefined : message, logid)
  }

  const { audio, errorMessage } = collectV3Audio(raw)

  if (errorMessage) {
    return fail(errorMessage, 502, errorMessage, logid)
  }
  if (audio.length === 0) {
    return fail('语音服务未返回音频数据', 502, raw.slice(0, 300), logid)
  }

  const merged = Buffer.concat(audio)
  if (merged.byteLength === 0) {
    return fail('语音服务返回了空音频', 502, undefined, logid)
  }

  return audioResponse(new Uint8Array(merged), CONTENT_TYPE.mp3)
}

async function synthesizeV1(params: {
  appId: string
  accessToken: string
  cluster: string
  voiceType: string
  text: string
  speed: number
  volume: number
  encoding: 'mp3' | 'wav'
}) {
  const { appId, accessToken, cluster, voiceType, text, speed, volume, encoding } = params
  const audioFormat = encoding === 'wav' ? 'wav' : 'mp3'

  const upstream = await fetch(DOUBAO_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 火山 v1 的鉴权格式是 Bearer;{token}（分号分隔，不是空格）
      Authorization: `Bearer;${accessToken.trim()}`,
    },
    body: JSON.stringify({
      app: {
        appid: appId.trim(),
        token: accessToken.trim(),
        cluster: cluster.trim() || 'volcano_tts',
      },
      user: { uid: 'lingualoop-speaking' },
      audio: {
        voice_type: voiceType,
        encoding: audioFormat,
        speed_ratio: Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : 1,
        volume_ratio: Number.isFinite(volume) ? Math.min(2, Math.max(0.1, volume)) : 1,
      },
      request: {
        reqid: crypto.randomUUID(),
        text,
        text_type: 'plain',
        operation: 'query',
        with_frontend: 1,
      },
    }),
    signal: AbortSignal.timeout(60000),
  })

  const payload = (await upstream.json().catch(() => null)) as {
    code?: number
    message?: string
    data?: string
  } | null

  if (!upstream.ok) {
    return fail(payload?.message || `语音服务返回 HTTP ${upstream.status}`, upstream.status, payload?.message)
  }

  // code 为 0 或 3000 才表示成功（3000 为部分合成成功后的收尾码）
  if (typeof payload?.code === 'number' && payload.code !== 0 && payload.code !== 3000) {
    return fail(payload.message || `语音合成失败 (code ${payload.code})`, 502, payload.message)
  }
  if (!payload?.data) {
    return fail(payload?.message || '语音服务未返回音频数据', 502, payload?.message)
  }

  const audio = Buffer.from(payload.data, 'base64')
  if (audio.byteLength === 0) {
    return fail('语音服务返回了空音频', 502)
  }

  return audioResponse(new Uint8Array(audio), CONTENT_TYPE[audioFormat])
}

export async function POST(req: Request) {
  let body: TtsRequestBody
  try {
    body = (await req.json()) as TtsRequestBody
  } catch {
    return Response.json({ error: { message: '请求体不是合法 JSON' } }, { status: 400 })
  }

  const {
    authMode = 'apikey',
    apiKey,
    resourceId,
    appId,
    accessToken,
    cluster,
    voiceType,
    text,
    speed = 1,
    volume = 1,
    encoding = 'mp3',
  } = body

  if (!voiceType?.trim()) {
    return Response.json({ error: { message: '缺少音色 ID' } }, { status: 400 })
  }
  if (!text?.trim()) {
    return Response.json({ error: { message: '缺少待合成文本' } }, { status: 400 })
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: { message: `单次合成文本不能超过 ${MAX_TEXT_LENGTH} 字，请按句拆分` } },
      { status: 400 }
    )
  }

  const useApiKey = authMode === 'apikey'

  if (useApiKey) {
    if (!apiKey?.trim()) {
      return Response.json({ error: { message: '缺少豆包 API Key' } }, { status: 400 })
    }
    if (!resourceId?.trim()) {
      return Response.json(
        { error: { message: '缺少资源版本（X-Api-Resource-Id），例如 seed-tts-2.0' } },
        { status: 400 }
      )
    }
  } else if (!appId?.trim() || !accessToken?.trim()) {
    return Response.json({ error: { message: '缺少豆包 AppID 或 Access Token' } }, { status: 400 })
  }

  try {
    const common = {
      voiceType: voiceType.trim(),
      text: text.trim(),
      speed: Number.isFinite(speed) ? speed : 1,
      volume: Number.isFinite(volume) ? volume : 1,
    }

    if (useApiKey) {
      return await synthesizeV3({
        ...common,
        apiKey: apiKey as string,
        resourceId: resourceId as string,
      })
    }

    return await synthesizeV1({
      ...common,
      appId: appId as string,
      accessToken: accessToken as string,
      cluster: cluster || 'volcano_tts',
      encoding: encoding === 'wav' ? 'wav' : 'mp3',
    })
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'TimeoutError'
        ? '语音服务响应超时，请稍后重试'
        : err instanceof Error
          ? err.message
          : '语音合成请求异常'
    return Response.json({ error: { message } }, { status: 500 })
  }
}
