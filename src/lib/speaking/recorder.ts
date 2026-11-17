/**
 * 麦克风录音 → 16kHz 单声道 16bit WAV。
 *
 * 为什么不用 MediaRecorder：
 * Chrome / Edge 的 MediaRecorder 只稳定输出 webm/opus，而豆包录音文件识别
 * 只接受 WAV / MP3 / OGG OPUS，webm 容器会被拒（45000151 音频格式不正确）。
 * 自己用 AudioContext 采 PCM 再封 WAV，格式与采样率都可控，也不用额外依赖。
 *
 * 全流程在本机内存完成，音频不会落到磁盘，松手上传后即丢弃。
 */

export interface RecordingResult {
  blob: Blob
  /** 音频时长（毫秒），以实际采样点数为准 */
  durationMs: number
  /** 峰值音量 0~1，用来判断用户是否真的说了话 */
  peak: number
}

export interface VoiceRecording {
  /** 停止并返回音频；初始化失败时 reject */
  stop: () => Promise<RecordingResult>
  /** 立即丢弃并释放麦克风 */
  abort: () => void
  /** 已录制时长，供 UI 显示 */
  elapsedMs: () => number
}

export interface VoiceRecordingOptions {
  /** 实时归一化音量 0~1 */
  onLevel?: (level: number) => void
  /** 检测到有效人声开始说话 */
  onSpeechStart?: () => void
  /** 开口后连续静音进度 0~1，重新说话时归 0 */
  onSilenceProgress?: (progress: number) => void
  /** 开口后连续静音超过 silenceMs，通知自动发送 */
  onSilenceTimeout?: () => void
  /** 始终未开口超过 idleMs，通知自动休眠 */
  onIdleTimeout?: () => void
  /** 开口后停顿多少毫秒判定本句结束，默认 1800ms */
  silenceMs?: number
  /** 始终未开口多少毫秒判定闲置，默认 15000ms */
  idleMs?: number
}

/** 豆包识别推荐 16k，单声道足够 */
const TARGET_RATE = 16000

export function isRecordingSupported(): boolean {
  if (typeof window === 'undefined') return false
  const hasMic = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const hasCtx = 'AudioContext' in window || 'webkitAudioContext' in window
  return hasMic && hasCtx
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
}

/** Float32 PCM → 16bit PCM WAV */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = samples.length * 2
  const buffer = new ArrayBuffer(44 + bytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // 单声道
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // 字节率
  view.setUint16(32, 2, true) // 块对齐
  view.setUint16(34, 16, true) // 位深
  writeAscii(view, 36, 'data')
  view.setUint32(40, bytes, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * 降采样：按窗口取平均（等效一个简单的抗混叠低通）。
 * 输入 48k → 输出 16k 时每 3 个点合成 1 个。
 */
function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || to <= 0) return input
  const ratio = from / to
  const length = Math.floor(input.length / ratio)
  const out = new Float32Array(length)
  let cursor = 0

  for (let i = 0; i < length; i += 1) {
    const next = Math.min(input.length, Math.round((i + 1) * ratio))
    let sum = 0
    let count = 0
    for (let j = cursor; j < next; j += 1) {
      sum += input[j]
      count += 1
    }
    out[i] = count > 0 ? sum / count : 0
    cursor = next
  }

  return out
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  let total = 0
  for (const c of chunks) total += c.length
  const merged = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  return merged
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext

function createAudioContext(): AudioContext {
  const scoped = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  const Ctor = scoped.AudioContext ?? scoped.webkitAudioContext
  if (!Ctor) throw new Error('当前浏览器不支持音频采集')
  return new Ctor()
}

/**
 * 开始录音。同步返回控制器，内部异步申请麦克风权限，
 * 因此即使权限弹窗还没结束，调用方也可以正常拿到对象。
 */
export function startVoiceRecording(options: VoiceRecordingOptions = {}): VoiceRecording {
  const {
    onLevel,
    onSpeechStart,
    onSilenceProgress,
    onSilenceTimeout,
    onIdleTimeout,
    silenceMs = 1800,
    idleMs = 15000,
  } = options

  const startedAt = Date.now()
  const chunks: Float32Array[] = []

  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let sink: GainNode | null = null

  let sourceRate = TARGET_RATE
  let peak = 0
  let aborted = false
  let finalized = false
  let initError: Error | null = null

  // VAD 状态：忽略启动前 250ms 瞬态噪声，连续 2 帧高于阈值才算真正开口
  let activeAt = 0
  let speechFrames = 0
  let hasSpoken = false
  let lastVoiceAt = 0
  let timeoutFired = false
  let lastSilenceProgress = 0

  const release = () => {
    try {
      processor?.disconnect()
    } catch {
      // 忽略
    }
    try {
      source?.disconnect()
    } catch {
      // 忽略
    }
    try {
      sink?.disconnect()
    } catch {
      // 忽略
    }
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      stream = null
    }
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => undefined)
    }
    ctx = null
    processor = null
    source = null
    sink = null
  }

  const init = async () => {
    if (!isRecordingSupported()) throw new Error('当前浏览器不支持录音')

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    if (aborted) return

    ctx = createAudioContext()
    sourceRate = ctx.sampleRate || TARGET_RATE
    source = ctx.createMediaStreamSource(stream)
    activeAt = Date.now()

    // ScriptProcessor 已标记废弃，但兼容性最好；本场景只需短句采集，够用。
    processor = ctx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => {
      if (finalized) return
      const channel = event.inputBuffer.getChannelData(0)
      // 复制一份，inputBuffer 会被复用
      chunks.push(new Float32Array(channel))
      let sumSq = 0
      for (let i = 0; i < channel.length; i += 1) {
        const sample = channel[i]
        const v = Math.abs(sample)
        if (v > peak) peak = v
        sumSq += sample * sample
      }

      const rms = Math.sqrt(sumSq / Math.max(1, channel.length))
      const level = Math.min(1, rms * 6.5)
      onLevel?.(level)

      if (timeoutFired) return
      const now = Date.now()
      // 忽略启动瞬态（点击声 / 麦克风硬件开启噼啪声）
      if (now - activeAt < 250) return

      const isVoiceFrame = rms > 0.015
      if (!hasSpoken) {
        if (isVoiceFrame) {
          speechFrames += 1
          if (speechFrames >= 2) {
            hasSpoken = true
            lastVoiceAt = now
            onSpeechStart?.()
          }
        } else {
          speechFrames = 0
          if (onIdleTimeout && now - activeAt >= idleMs) {
            timeoutFired = true
            onIdleTimeout()
          }
        }
        return
      }

      if (isVoiceFrame) {
        lastVoiceAt = now
        if (lastSilenceProgress !== 0) {
          lastSilenceProgress = 0
          onSilenceProgress?.(0)
        }
      } else {
        const silenceElapsed = now - lastVoiceAt
        const progress = Math.min(1, silenceElapsed / Math.max(400, silenceMs))
        if (Math.abs(progress - lastSilenceProgress) >= 0.04 || progress === 1) {
          lastSilenceProgress = progress
          onSilenceProgress?.(progress)
        }
        if (onSilenceTimeout && silenceElapsed >= silenceMs) {
          timeoutFired = true
          onSilenceTimeout()
        }
      }
    }

    // 必须连到 destination 才会持续触发回调；用 0 增益避免把麦克风回放出来
    sink = ctx.createGain()
    sink.gain.value = 0
    source.connect(processor)
    processor.connect(sink)
    sink.connect(ctx.destination)
  }

  const ready = init().catch((err: unknown) => {
    initError = err instanceof Error ? err : new Error('麦克风启动失败')
  })

  const elapsedMs = () => Date.now() - startedAt

  return {
    elapsedMs,

    abort: () => {
      aborted = true
      finalized = true
      void ready.then(release)
    },

    stop: async () => {
      await ready
      finalized = true
      if (initError) {
        release()
        throw initError
      }
      if (aborted) {
        release()
        return { blob: new Blob(), durationMs: 0, peak: 0 }
      }

      release()

      const merged = mergeChunks(chunks)
      const samples = downsample(merged, sourceRate, TARGET_RATE)
      const durationMs = Math.round((samples.length / TARGET_RATE) * 1000)

      if (samples.length === 0) {
        return { blob: new Blob(), durationMs: 0, peak: 0 }
      }

      return { blob: encodeWav(samples, TARGET_RATE), durationMs, peak: Math.min(1, peak) }
    },
  }
}
