/**
 * 口语音频播放器。
 *
 * - 逐句合成、逐句播放，第 i 句播放时已经在合成第 i+1 句，减少句子之间的空白；
 * - 云端 TTS 走 /api/tts/*，浏览器内置语音走 speechSynthesis；
 * - 全局只有一个播放实例，任何人调用 stopSpeaking() 都能立即打断（用户按麦克风说话时用得到）。
 */

import {
  playbackRateFor,
  speakWithSystemVoice,
  synthesizeSpeech,
  type SpeakingTtsConfig,
} from './ttsConfig'
import type { SpeakingVoiceId } from './scenarios'

export interface SpeakSentencesOptions {
  tts: SpeakingTtsConfig
  voice: SpeakingVoiceId
  /** 0.5 ~ 2.0；豆包在服务端变速，千问在播放端变速 */
  speed: number
  sentences: string[]
  /** 开始朗读第 index 句，用于高亮 */
  onSentenceStart?: (index: number) => void
  /** 某一句失败；不影响后续句子继续尝试 */
  onSentenceError?: (index: number, message: string) => void
}

/** 每次打断都自增，旧的播放在循环里发现换代后自行退出 */
let generation = 0
let currentAudio: HTMLAudioElement | null = null
let currentUrl: string | null = null
let audioUnlocked = false

/** 首次用户点击时调用，解除浏览器对自动播放的限制 */
export function unlockAudioPlayback(): void {
  if (audioUnlocked || typeof window === 'undefined') return
  audioUnlocked = true
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    void ctx
      .resume()
      .then(() => ctx.close())
      .catch(() => ctx.close())
  } catch {
    // 解锁失败不影响后续正常播放
  }
}

/** 立即停止朗读并让正在进行的合成结果作废 */
export function stopSpeaking(): void {
  generation += 1
  if (currentAudio) {
    try {
      currentAudio.pause()
    } catch {
      // 忽略暂停失败
    }
    currentAudio.src = ''
    currentAudio = null
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

function playBlob(blob: Blob, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.playbackRate = rate
    currentUrl = url
    let settled = false

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      audio.onended = null
      audio.onerror = null
      if (currentAudio === audio) currentAudio = null
      if (currentUrl === url) currentUrl = null
      URL.revokeObjectURL(url)
      if (error) reject(error)
      else resolve()
    }

    audio.onended = () => finish()
    audio.onerror = () => finish(new Error('音频播放失败，可能是音频格式不被当前浏览器支持'))
    currentAudio = audio
    audio.play().catch((err: unknown) => {
      finish(err instanceof Error ? err : new Error('浏览器阻止了音频播放，请再点一次播放'))
    })
  })
}

/**
 * 朗读一组句子。返回时要么正常读完，要么被 stopSpeaking 打断。
 * 第一句合成失败会直接抛出（通常是凭据或音色问题）；后续句子失败只回调，不中断整段。
 */
export async function speakSentences(options: SpeakSentencesOptions): Promise<void> {
  const { tts, voice, speed, sentences, onSentenceStart, onSentenceError } = options
  const texts = sentences.map((s) => s.trim()).filter(Boolean)
  if (texts.length === 0) return

  stopSpeaking()
  const myGeneration = generation
  const stale = () => myGeneration !== generation

  const synthesize = async (text: string) => {
    if (tts.provider === 'browser') return null
    const { blob } = await synthesizeSpeech(tts, { text, voice, speed })
    return blob
  }

  let pending: Promise<Blob | null> = synthesize(texts[0])
  /** 提前退出时把还在合成、不会被消费的 Promise 兜住，避免 unhandled rejection */
  const bail = () => {
    pending.catch(() => undefined)
  }

  for (let i = 0; i < texts.length; i += 1) {
    let blob: Blob | null
    try {
      blob = await pending
    } catch (err) {
      if (stale()) {
        bail()
        return
      }
      throw err instanceof Error ? err : new Error('语音合成失败')
    }
    if (stale()) {
      bail()
      return
    }

    // 第 i 句开始播放前就把 i+1 句送去合成
    if (i + 1 < texts.length) {
      pending = synthesize(texts[i + 1])
    }

    onSentenceStart?.(i)

    try {
      if (blob) {
        await playBlob(blob, playbackRateFor(tts, speed))
      } else {
        await speakWithSystemVoice(texts[i], {
          lang: voice.startsWith('uk') ? 'en-GB' : 'en-US',
          rate: speed,
        })
      }
    } catch (err) {
      if (stale()) {
        bail()
        return
      }
      onSentenceError?.(i, err instanceof Error ? err.message : '播放失败')
    }

    if (stale()) {
      bail()
      return
    }
  }

  // 提前合成但没被消费的 Promise，避免出现 unhandled rejection
  pending.catch(() => undefined)
}
