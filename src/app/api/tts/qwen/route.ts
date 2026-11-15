/**
 * 千问（阿里云百炼）语音合成代理
 *
 * 只负责把文本转成音频：
 * - 凭证从请求体拿，仅在内存中拼进 Authorization，请求结束即丢弃；
 * - 不写数据库、不写日志、不缓存音频。
 *
 * 上游为非流式 Qwen-TTS：
 * POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 * 该接口返回的是音频文件 URL（有效期 24 小时）或 base64，这里统一取回字节再回给浏览器，
 * 避免把带签名的 OSS 地址暴露给前端、也避免前端跨域取音频被拦。
 *
 * 安全：目标地址只由 region 映射到两个官方端点，不接受任意 URL，避免把服务端当代理打内网。
 */

import { QWEN_TTS_ENDPOINT, type QwenRegion } from '@/lib/speaking/ttsConfig'

const MAX_TEXT_LENGTH = 600

interface TtsRequestBody {
  apiKey?: string
  model?: string
  region?: QwenRegion
  voice?: string
  language?: string
  text?: string
}

function contentTypeFrom(url: string, header: string | null): string {
  const fromHeader = header?.split(';')[0]?.trim()
  if (fromHeader && fromHeader.startsWith('audio/')) return fromHeader
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase()
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'pcm') return 'audio/wave'
  return 'audio/wav'
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

export async function POST(req: Request) {
  let body: TtsRequestBody
  try {
    body = (await req.json()) as TtsRequestBody
  } catch {
    return Response.json({ error: { message: '请求体不是合法 JSON' } }, { status: 400 })
  }

  const { apiKey, model, region, voice, language, text } = body

  if (!apiKey?.trim()) {
    return Response.json({ error: { message: '缺少千问 API Key' } }, { status: 400 })
  }
  if (!model?.trim()) {
    return Response.json({ error: { message: '缺少千问 TTS 模型名' } }, { status: 400 })
  }
  if (!voice?.trim()) {
    return Response.json({ error: { message: '缺少音色名，例如 Cherry' } }, { status: 400 })
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

  const endpoint = region === 'singapore' ? QWEN_TTS_ENDPOINT.singapore : QWEN_TTS_ENDPOINT.beijing

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model.trim(),
        input: {
          text: text.trim(),
          voice: voice.trim(),
          // Auto 会让模型自行判断语种；练习英语时显式给 English 发音更稳
          ...(language && language !== 'Auto' ? { language_type: language } : {}),
        },
      }),
      signal: AbortSignal.timeout(60000),
    })

    const payload = (await upstream.json().catch(() => null)) as {
      status_code?: number
      code?: string
      message?: string
      output?: { audio?: { url?: string; data?: string } }
    } | null

    if (!upstream.ok) {
      const detail =
        payload?.message ||
        (payload?.code ? `千问语音合成失败（${payload.code}）` : `千问接口返回 HTTP ${upstream.status}`)
      return Response.json({ error: { message: detail } }, { status: upstream.status })
    }

    if (payload?.code) {
      return Response.json(
        { error: { message: payload.message || `千问语音合成失败（${payload.code}）` } },
        { status: 502 }
      )
    }

    const audioUrl = payload?.output?.audio?.url
    const audioData = payload?.output?.audio?.data

    // 非流式下正常返回 url；少数情况直接给 base64
    if (audioUrl) {
      const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30000) })
      if (!audioRes.ok) {
        return Response.json(
          { error: { message: `音频下载失败 (HTTP ${audioRes.status})` } },
          { status: 502 }
        )
      }
      const buffer = await audioRes.arrayBuffer()
      if (buffer.byteLength === 0) {
        return Response.json({ error: { message: '千问返回了空音频' } }, { status: 502 })
      }
      return audioResponse(new Uint8Array(buffer), contentTypeFrom(audioUrl, audioRes.headers.get('content-type')))
    }

    if (audioData) {
      const decoded = Buffer.from(audioData, 'base64')
      if (decoded.byteLength === 0) {
        return Response.json({ error: { message: '千问返回了空音频' } }, { status: 502 })
      }
      return audioResponse(new Uint8Array(decoded), 'audio/wav')
    }

    return Response.json(
      { error: { message: payload?.message || '千问接口未返回音频数据' } },
      { status: 502 }
    )
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'TimeoutError'
        ? '千问语音合成超时，请稍后重试'
        : err instanceof Error
          ? err.message
          : '语音合成请求异常'
    return Response.json({ error: { message } }, { status: 500 })
  }
}
