/**
 * 豆包（火山引擎）语音识别代理
 *
 * 只做一件事：把浏览器录好的一段 WAV 送去识别，回一句文本。
 * - 凭证从请求体拿，只在内存里拼进请求头，请求结束即丢弃；
 * - 不写数据库、不写日志、不缓存音频（音频本身也不落盘）。
 *
 * 上游是「录音文件识别 2.0」（volc.seedasr.auc），异步任务两段式：
 *    POST /api/v3/auc/bigmodel/submit   提交任务，音频以 base64 放在 audio.data
 *    POST /api/v3/auc/bigmodel/query    用同一个 X-Api-Request-Id 轮询取结果
 * 这是控制台唯一能开通的识别模型（极速版已下线），因此不做其他分支。
 *
 * 鉴权两种都支持：
 * - apikey：X-Api-Key（新版控制台）
 * - token ：X-Api-App-Key + X-Api-Access-Key（旧版控制台）
 *
 * 成功与否看响应头 X-Api-Status-Code（20000000 为成功），文本在 body.result.text。
 */

import {
  DOUBAO_ASR_QUERY_ENDPOINT,
  DOUBAO_ASR_RESOURCE_ID,
  DOUBAO_ASR_SUBMIT_ENDPOINT,
} from '@/lib/speaking/asrConfig'

export const runtime = 'nodejs'
/** 异步任务，留够提交 + 轮询的时间 */
export const maxDuration = 60

/** 一句口语，60 秒 16k 单声道 WAV 约 2MB，base64 后约 2.6MB；留足余量 */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

/** 轮询节奏：短句一般 1~2 秒出结果，400ms 一问不会太浪费 */
const POLL_INTERVAL_MS = 400
const MAX_POLL_MS = 25_000

const STATUS_OK = '20000000'
const STATUS_SILENT = '20000003'
/** 查询接口：任务在排队 / 处理中 */
const STATUS_PENDING = new Set(['20000001', '20000002'])

interface AsrRequestBody {
  authMode?: 'apikey' | 'token'
  apiKey?: string
  appId?: string
  accessToken?: string
  language?: string
  format?: 'wav' | 'mp3' | 'ogg'
  audio?: string
}

/** 火山识别错误码 → 能照着做的中文提示 */
function explainStatus(code: string, message: string): string | null {
  switch (code) {
    case '20000003':
      return '这段录音是静音，没有听到说话声：请靠近麦克风、确认没静音后再试'
    case '45000001':
      return '请求参数无效：确认「识别资源 ID」是 volc.seedasr.auc（录音文件识别 2.0），且控制台已开通该模型；若仍报错，把「识别语言」先改成「自动」再试'
    case '45000002':
      return '上传的音频是空的：按住麦克风多说一会儿再松开'
    case '45000151':
      return '音频格式不被支持：本接口只接受 WAV / MP3 / OGG OPUS，请确认录音没有被转码'
    case '45000010':
    case '45000020':
      return '识别资源未授权：到控制台确认已开通「录音文件识别 2.0」，并确认 API Key 属于开通了该模型的那个项目'
    case '55000031':
      return '语音服务繁忙，请稍后重试'
    default:
      break
  }

  const m = (message || '').toLowerCase()
  if (m.includes('invalid x-api-key') || m.includes('invalid auth') || m.includes('unauthorized')) {
    return 'API Key 或 Access Token 无效：确认复制完整、没有多余空格，且属于同一控制台应用'
  }
  if (
    m.includes('grant') ||
    m.includes('not granted') ||
    m.includes('permission denied') ||
    m.includes('no permission')
  ) {
    return '识别服务未开通或未授权：控制台「服务管理 → 语音识别」里需要开通「录音文件识别 2.0」，它与语音合成是两个独立资源'
  }
  if (m.includes('quota') || m.includes('concurrency') || m.includes('rate limit')) {
    return '识别额度或并发不足：可能免费额度已用完，或同时请求过多，稍后重试'
  }
  if (code.startsWith('55')) return '语音服务内部错误，请稍后重试'
  return null
}

function fail(message: string, status: number, extras?: { raw?: string; logid?: string | null }) {
  const raw = extras?.raw
  const hint = explainStatus('', raw || message)
  return Response.json(
    {
      error: {
        message: hint ? `${hint}（上游原始信息：${raw || message}）` : message,
        hint: hint ?? undefined,
        raw: raw ?? message,
        logid: extras?.logid ?? undefined,
      },
    },
    { status }
  )
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** 从上游响应里尽量抠出可读的错误信息 */
async function readUpstreamError(res: Response): Promise<{ message: string; logid: string | null }> {
  const logid = res.headers.get('X-Tt-Logid')
  const raw = await res.text()
  let message = res.headers.get('X-Api-Message') || `语音服务返回 HTTP ${res.status}`
  try {
    const parsed = JSON.parse(raw) as {
      message?: string
      error?: { message?: string }
      header?: { message?: string }
    }
    message = parsed.error?.message || parsed.message || parsed.header?.message || message
  } catch {
    if (raw.trim()) message = raw.slice(0, 200)
  }
  return { message, logid }
}

interface ParsedResult {
  text?: string
  utterances?: { text?: string }[]
  durationMs?: number
}

function pickText(parsed: {
  result?: ParsedResult
  audio_info?: { duration?: number }
}): { text: string; durationMs?: number } {
  const text = (
    parsed.result?.text ??
    parsed.result?.utterances?.map((u) => u.text ?? '').join(' ') ??
    ''
  ).trim()
  return { text, durationMs: parsed.audio_info?.duration }
}

export async function POST(request: Request) {
  let body: AsrRequestBody
  try {
    body = (await request.json()) as AsrRequestBody
  } catch {
    return fail('请求体不是合法 JSON', 400)
  }

  const {
    authMode = 'apikey',
    apiKey = '',
    appId = '',
    accessToken = '',
    language = '',
    format = 'wav',
    audio = '',
  } = body

  // 1. 凭据校验
  if (authMode === 'apikey') {
    if (!apiKey.trim()) return fail('缺少豆包 API Key', 400)
  } else {
    if (!appId.trim() || !accessToken.trim()) {
      return fail('缺少豆包 AppID 或 Access Token', 400)
    }
  }

  // 2. 音频校验
  if (!audio.trim()) return fail('缺少音频数据', 400)

  // base64 每 4 个字符 3 字节
  const audioBytes = Math.floor((audio.length * 3) / 4)
  if (audioBytes > MAX_AUDIO_BYTES) {
    return fail('录音过长，请把一句话分成几段说', 413)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': DOUBAO_ASR_RESOURCE_ID,
    'X-Api-Request-Id': crypto.randomUUID(),
    // 提交任务固定 -1
    'X-Api-Sequence': '-1',
  }

  if (authMode === 'apikey') {
    headers['X-Api-Key'] = apiKey.trim()
  } else {
    headers['X-Api-App-Key'] = appId.trim()
    headers['X-Api-Access-Key'] = accessToken.trim()
  }

  const reqParams: Record<string, unknown> = {
    model_name: 'bigmodel',
    enable_itn: true,
    enable_punc: true,
    // 顺滑只支持中/英/日，英文口语开着更自然
    enable_ddc: true,
  }
  if (language && language !== 'auto') reqParams.language = language

  const upstreamBody = {
    user: { uid: 'lingualoop-speaking' },
    // 识别接口接受 base64 直传，不必先上传到对象存储
    audio: { data: audio, format },
    request: reqParams,
  }

  // 提交任务
  let submitRes: Response
  try {
    submitRes = await fetch(DOUBAO_ASR_SUBMIT_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(upstreamBody),
      cache: 'no-store',
    })
  } catch (err) {
    return fail(err instanceof Error ? `提交识别任务失败：${err.message}` : '提交识别任务失败', 502)
  }

  const submitCode = submitRes.headers.get('X-Api-Status-Code') || ''
  const submitLogid = submitRes.headers.get('X-Tt-Logid')

  if (!submitRes.ok) {
    const { message } = await readUpstreamError(submitRes)
    return fail(message, submitRes.status, { raw: message, logid: submitLogid })
  }
  if (submitCode && submitCode !== STATUS_OK) {
    const { message } = await readUpstreamError(submitRes)
    return fail(message || `提交识别任务失败（code ${submitCode}）`, submitCode === STATUS_SILENT ? 422 : 502, {
      raw: message || submitCode,
      logid: submitLogid,
    })
  }
  // 提交成功时 body 可能是空的，读掉避免连接悬挂
  await submitRes.text().catch(() => undefined)

  const deadline = Date.now() + MAX_POLL_MS
  let lastLogid = submitLogid

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    let queryRes: Response
    try {
      queryRes = await fetch(DOUBAO_ASR_QUERY_ENDPOINT, {
        method: 'POST',
        headers,
        body: '{}',
        cache: 'no-store',
      })
    } catch (err) {
      return fail(err instanceof Error ? `查询识别结果失败：${err.message}` : '查询识别结果失败', 502)
    }

    lastLogid = queryRes.headers.get('X-Tt-Logid') || lastLogid
    const queryCode = queryRes.headers.get('X-Api-Status-Code') || ''
    const queryLogid = queryRes.headers.get('X-Tt-Logid')

    if (!queryRes.ok) {
      const { message } = await readUpstreamError(queryRes)
      return fail(message, queryRes.status, { raw: message, logid: queryLogid })
    }

    if (STATUS_PENDING.has(queryCode)) {
      // 还在队列里 / 正在转写，继续等
      await queryRes.text().catch(() => undefined)
      continue
    }

    if (queryCode && queryCode !== STATUS_OK) {
      const { message } = await readUpstreamError(queryRes)
      return fail(message || `语音识别失败（code ${queryCode}）`, queryCode === STATUS_SILENT ? 422 : 502, {
        raw: message || queryCode,
        logid: queryLogid,
      })
    }

    const raw = await queryRes.text()
    let parsed: { result?: ParsedResult; audio_info?: { duration?: number } }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return fail('语音服务返回了无法解析的内容', 502, { raw: raw.slice(0, 200), logid: queryLogid })
    }

    const { text, durationMs } = pickText(parsed)
    if (!text) {
      // 没有状态码也没结果时，按「还没好」再等一轮；连续空转到 deadline 会走到超时分支
      if (!queryCode) continue
      return fail('没有识别到内容，请再说一次', 422, { raw: 'empty result', logid: queryLogid })
    }

    return Response.json(
      { text, durationMs, logid: queryLogid ?? undefined },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  return fail('识别超时：录音文件识别 2.0 是异步任务，这句话太久没有结果，请缩短句子再试', 504, {
    raw: 'poll timeout',
    logid: lastLogid,
  })
}
