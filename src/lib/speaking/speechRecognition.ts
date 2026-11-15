/**
 * 浏览器内置语音识别（Web Speech API）的薄封装。
 *
 * 用途：在没有接入云端 ASR 之前，让「按住说话」真的能拿到一句文本。
 * 说明：Chrome 走需要联网的语音服务，部分网络环境下会返回 network 错误；
 * Edge 通常可用。不可用时由调用方引导用户改用文字输入，不影响对话与朗读。
 */

interface SpeechAlternativeLike {
  transcript: string
}

interface SpeechResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechAlternativeLike
}

interface SpeechResultListLike {
  length: number
  [index: number]: SpeechResultLike
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechResultListLike
}

interface SpeechRecognitionErrorEventLike {
  error: string
  message?: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const scoped = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

export interface SpeechCaptureResult {
  transcript: string
  error?: string
}

export interface SpeechCapture {
  /** 正常结束：让浏览器把最后一段结果吐出来 */
  stop: () => void
  /** 直接丢弃 */
  abort: () => void
  /** 结束时兑现；即使出错也会 resolve，错误放在 error 字段 */
  result: Promise<SpeechCaptureResult>
}

function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '浏览器拒绝了麦克风或语音识别服务，请检查地址栏的麦克风权限'
    case 'no-speech':
      return '没有听到声音，请靠近麦克风再说一次'
    case 'audio-capture':
      return '没有检测到可用的麦克风'
    case 'network':
      return '语音识别需要联网，当前网络无法访问语音服务，可先用文字输入'
    case 'aborted':
      return '语音识别已取消'
    default:
      return `语音识别失败（${code}）`
  }
}

export function startSpeechCapture(options: {
  lang?: string
  /** 识别过程中的临时结果，用于实时显示 */
  onInterim?: (text: string) => void
} = {}): SpeechCapture {
  const { lang = 'en-US', onInterim } = options
  const Ctor = getSpeechRecognitionCtor()

  if (!Ctor) {
    return {
      stop: () => undefined,
      abort: () => undefined,
      result: Promise.resolve({
        transcript: '',
        error: '当前浏览器不支持语音识别，请改用文字输入',
      }),
    }
  }

  const recognition = new Ctor()
  recognition.lang = lang
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let finalText = ''
  let interimText = ''
  let settled = false
  let resolveResult: (value: SpeechCaptureResult) => void = () => undefined

  const result = new Promise<SpeechCaptureResult>((resolve) => {
    resolveResult = resolve
  })

  const finish = (value: SpeechCaptureResult) => {
    if (settled) return
    settled = true
    resolveResult(value)
  }

  recognition.onresult = (event) => {
    let finalPart = ''
    let interimPart = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const item = event.results[i]
      const text = item[0]?.transcript ?? ''
      if (item.isFinal) finalPart += text
      else interimPart += text
    }
    if (finalPart) finalText = `${finalText} ${finalPart}`.trim()
    interimText = interimPart.trim()
    onInterim?.((finalText || interimText).trim())
  }

  recognition.onerror = (event) => {
    finish({
      transcript: (finalText || interimText).trim(),
      error: describeSpeechError(event.error),
    })
  }

  recognition.onend = () => {
    finish({ transcript: (finalText || interimText).trim() })
  }

  try {
    recognition.start()
  } catch {
    finish({ transcript: '', error: '语音识别启动失败，请稍后重试或改用文字输入' })
  }

  return {
    stop: () => {
      try {
        recognition.stop()
      } catch {
        finish({ transcript: (finalText || interimText).trim() })
      }
    },
    abort: () => {
      try {
        recognition.abort()
      } catch {
        // 忽略
      }
      finish({ transcript: '' })
    },
    result,
  }
}
