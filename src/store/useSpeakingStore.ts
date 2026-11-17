import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  getScenario,
  type CorrectionMode,
  type SpeakingCorrection,
  type SpeakingLevel,
  type SpeakingVocab,
  type SpeakingVoiceId,
} from '@/lib/speaking/scenarios'
import {
  normalizeTtsConfig,
  SPEAKING_TTS_DEFAULT,
  isChatModelReady,
  isTtsReady,
  type CloudTtsProvider,
  type DoubaoTtsConfig,
  type QwenTtsConfig,
  type SpeakingTtsConfig,
} from '@/lib/speaking/ttsConfig'
import {
  isAsrReady,
  normalizeAsrConfig,
  SPEAKING_ASR_DEFAULT,
  transcribeSpeech,
  type DoubaoAsrConfig,
  type SpeakingAsrConfig,
} from '@/lib/speaking/asrConfig'
import { isRecordingSupported, startVoiceRecording, type VoiceRecording } from '@/lib/speaking/recorder'
import { requestSpeakingTurn, translateReplyToChinese, type SpeakingHistoryItem } from '@/lib/speaking/chatEngine'
import { speakSentences, stopSpeaking, unlockAudioPlayback } from '@/lib/speaking/speechPlayer'
import { isSpeechRecognitionSupported, startSpeechCapture, type SpeechCapture } from '@/lib/speaking/speechRecognition'
import { useAiAssistantStore } from '@/store/useAiAssistantStore'
import type { AiClientConfig } from '@/lib/aiClient'

export type SpeakingWindowMode = 'expanded' | 'mini'
export type SpeakingSubtitleMode = 'en' | 'bi' | 'off'
export type SpeakingView = 'setup' | 'chat' | 'summary'
export type SpeakingPhase = 'idle' | 'listening' | 'recognizing' | 'thinking' | 'speaking'

export interface SpeakingMessage {
  id: string
  role: 'ai' | 'user'
  /** AI 消息按句存，便于逐句朗读高亮；用户消息只有一句 */
  sentences: string[]
  zh: string
  /** 模型没给中文、正在单独补翻译 */
  zhPending?: boolean
  correction?: SpeakingCorrection
  vocab?: SpeakingVocab[]
}

/** 悬浮窗以左下角为锚点定位（默认紧贴左侧边栏右侧），切换形态时左下角保持不动 */
export interface SpeakingAnchor {
  left: number
  bottom: number
}

export const PHASE_LABEL: Record<SpeakingPhase, string> = {
  idle: '按住麦克风说话',
  listening: '正在聆听，松开发送',
  recognizing: '识别中…',
  thinking: '思考中…',
  speaking: '正在朗读',
}

export const EXPANDED_MIN = { w: 420, h: 480 }
export const EXPANDED_DEFAULT = { w: 680, h: 700 }
const MIN_PRESS_MS = 350

interface SpeakingState {
  isOpen: boolean
  mode: SpeakingWindowMode
  /** null 表示默认居中显示，用户拖拽后记录具体坐标 */
  anchor: SpeakingAnchor | null
  size: { w: number; h: number }

  view: SpeakingView
  subtitle: SpeakingSubtitleMode
  scenarioId: string
  customTopic: string
  level: SpeakingLevel
  voice: SpeakingVoiceId
  speed: number
  correction: CorrectionMode
  /** 语音合成（TTS）配置：只负责文本转音频，对话模型沿用 AI 对话那套；只存本机 */
  tts: SpeakingTtsConfig
  /** 语音识别（ASR）配置：把用户说的话转成文本，同样只存本机 */
  asr: SpeakingAsrConfig

  messages: SpeakingMessage[]
  /** 字幕关闭时，用户点开查看过的消息 */
  revealedIds: string[]
  phase: SpeakingPhase
  /** 正在朗读的消息与句子下标，用于高亮 */
  speakingMsgId: string | null
  speakingSentence: number
  /** 语音识别的临时结果，松手后会被最终文本替换 */
  interim: string
  startedAt: number | null
  endedAt: number | null
  turnIndex: number
  savedVocab: string[]
  notice: string | null

  open: () => void
  close: () => void
  toggle: () => void
  setMode: (mode: SpeakingWindowMode) => void
  setAnchor: (anchor: SpeakingAnchor | null) => void
  setSize: (size: { w: number; h: number }) => void
  /** 位置与尺寸一次写入：从左侧/底部边缘缩放时锚点会跟着动，分两次 set 会闪一帧 */
  setBox: (box: { left: number; bottom: number; w: number; h: number }) => void
  setSubtitle: (s: SpeakingSubtitleMode) => void
  setScenario: (id: string) => void
  setCustomTopic: (t: string) => void
  setLevel: (l: SpeakingLevel) => void
  setVoice: (v: SpeakingVoiceId) => void
  setSpeed: (s: number) => void
  setCorrection: (c: CorrectionMode) => void
  setTts: (partial: Partial<SpeakingTtsConfig>) => void
  updateDoubao: (partial: Partial<DoubaoTtsConfig>) => void
  updateQwen: (partial: Partial<QwenTtsConfig>) => void
  setTtsVoice: (provider: CloudTtsProvider, slot: SpeakingVoiceId, voiceType: string) => void
  clearTtsCredentials: (provider: CloudTtsProvider) => void
  resetTts: () => void
  setAsrProvider: (provider: SpeakingAsrConfig['provider']) => void
  updateDoubaoAsr: (partial: Partial<DoubaoAsrConfig>) => void
  resetAsr: () => void
  toggleReveal: (id: string) => void

  startSession: () => void
  pressMic: () => void
  releaseMic: () => void
  sendText: (text: string) => void
  replay: (msgId: string, slow?: boolean) => void
  endSession: () => void
  backToSetup: () => void
  saveVocab: (words: string[]) => void
}

let pressStartedAt = 0
let activeCapture: SpeechCapture | null = null
let activeRecording: VoiceRecording | null = null
let activeAbort: AbortController | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null
/** 补翻译跟随会话而不是单轮：朗读、重播、下一轮开口都会推进 turnSeq，但译文仍然属于那条消息 */
let translateAbort: AbortController | null = null
let turnSeq = 0

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export const useSpeakingStore = create<SpeakingState>()(
  persist(
    (set, get) => {
      /** 提示信息，autoClearMs 后自动消失（同一条才会清，避免覆盖更新的提示） */
      const setNotice = (message: string | null, autoClearMs?: number) => {
        if (noticeTimer) {
          clearTimeout(noticeTimer)
          noticeTimer = null
        }
        set({ notice: message })
        if (message && autoClearMs) {
          noticeTimer = setTimeout(() => {
            set((s) => (s.notice === message ? { notice: null } : {}))
          }, autoClearMs)
        }
      }

      /** 打断正在进行的朗读与请求，用于用户重新开口或离开对话 */
      const interrupt = () => {
        turnSeq += 1
        if (activeAbort) {
          activeAbort.abort()
          activeAbort = null
        }
        if (activeCapture) {
          activeCapture.abort()
          activeCapture = null
        }
        if (activeRecording) {
          activeRecording.abort()
          activeRecording = null
        }
        stopSpeaking()
      }

      const resetTranslations = () => {
        translateAbort?.abort()
        translateAbort = null
      }

      const patchMessage = (id: string, patch: Partial<SpeakingMessage>) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))

      /** 模型漏给中文时单独补一次翻译；失败只影响双语字幕第二行 */
      const fillTranslation = async (msg: SpeakingMessage, aiConfig: AiClientConfig) => {
        if (!translateAbort) translateAbort = new AbortController()
        const signal = translateAbort.signal
        patchMessage(msg.id, { zhPending: true })
        let zh = ''
        try {
          zh = await translateReplyToChinese(aiConfig, msg.sentences, signal)
        } catch {
          // 忽略：最多只显示英文
        }
        if (signal.aborted) return
        patchMessage(msg.id, { zh, zhPending: false })
      }

      /** 真实朗读一条 AI 消息：逐句合成、逐句播放，句间不等待 */
      const playMessage = async (msg: SpeakingMessage, speed = get().speed) => {
        const { tts, voice } = get()
        const readiness = isTtsReady(tts, voice)
        if (!readiness.ready) {
          set({ phase: 'idle', speakingMsgId: null, speakingSentence: 0, interim: '' })
          setNotice(`${readiness.reason ?? '语音合成未配置'}，当前只显示文字。可在「设置 → 语音合成」里配置。`, 7000)
          return
        }

        const myTurn = (turnSeq += 1)
        set({ phase: 'speaking', speakingMsgId: msg.id, speakingSentence: 0, interim: '' })

        try {
          await speakSentences({
            tts,
            voice,
            speed,
            sentences: msg.sentences,
            onSentenceStart: (index) => {
              if (myTurn !== turnSeq) return
              set({ speakingSentence: index })
            },
            onSentenceError: (_index, message) => {
              if (myTurn !== turnSeq) return
              setNotice(`朗读中断：${message}`, 6000)
            },
          })
        } catch (err) {
          if (myTurn === turnSeq) {
            setNotice(err instanceof Error ? err.message : '语音合成失败', 7000)
          }
        } finally {
          if (myTurn === turnSeq) {
            set({ phase: 'idle', speakingMsgId: null, speakingSentence: 0 })
          }
        }
      }

      /** 一轮对话：追加用户消息 → 请求模型 → 显示回复 → 朗读 */
      const runTurn = async (userText: string) => {
        const snapshot = get()
        const aiConfig = useAiAssistantStore.getState().aiConfig
        const chatReady = isChatModelReady(aiConfig)
        if (!chatReady.ready) {
          set({ phase: 'idle' })
          setNotice(`${chatReady.reason ?? '对话模型未配置'}，请先在「设置 → AI 模型配置」里完成配置。`, 7000)
          return
        }

        const history: SpeakingHistoryItem[] = snapshot.messages.map((m) => ({
          role: m.role,
          text: m.sentences.join(' '),
          zh: m.zh,
        }))

        const userMsg: SpeakingMessage = {
          id: uid('user'),
          role: 'user',
          sentences: [userText],
          zh: '',
        }

        interrupt()
        const myTurn = turnSeq
        const abort = new AbortController()
        activeAbort = abort

        set((s) => ({
          messages: [...s.messages, userMsg],
          phase: 'thinking',
          notice: null,
          interim: '',
        }))

        try {
          const reply = await requestSpeakingTurn(
            aiConfig,
            {
              scenario: getScenario(snapshot.scenarioId),
              level: snapshot.level,
              correction: snapshot.correction,
              history,
              userText,
            },
            abort.signal
          )

          if (abort.signal.aborted || myTurn !== turnSeq) return

          const aiMsg: SpeakingMessage = {
            id: uid('ai'),
            role: 'ai',
            sentences: reply.sentences,
            zh: reply.zh,
            vocab: reply.vocab,
          }

          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === userMsg.id && reply.correction ? { ...m, correction: reply.correction } : m
            ),
          }))
          set((s) => ({
            messages: [...s.messages, aiMsg],
            turnIndex: s.turnIndex + 1,
            endedAt: null,
          }))

          // 与朗读并行，不拖慢开口
          if (!aiMsg.zh) void fillTranslation(aiMsg, aiConfig)

          await playMessage(aiMsg)
        } catch (err) {
          if (abort.signal.aborted || myTurn !== turnSeq) return
          set({ phase: 'idle' })
          setNotice(err instanceof Error ? err.message : '对话请求失败，请稍后重试', 7000)
        } finally {
          if (activeAbort === abort) activeAbort = null
        }
      }

      return {
        isOpen: false,
        mode: 'expanded',
        anchor: null,
        size: EXPANDED_DEFAULT,

        view: 'setup',
        subtitle: 'en',
        scenarioId: 'cafe',
        customTopic: '',
        level: 'B1',
        voice: 'us-female',
        speed: 1,
        correction: 'live',
        tts: SPEAKING_TTS_DEFAULT,
        asr: SPEAKING_ASR_DEFAULT,

        messages: [],
        revealedIds: [],
        phase: 'idle',
        speakingMsgId: null,
        speakingSentence: 0,
        interim: '',
        startedAt: null,
        endedAt: null,
        turnIndex: 0,
        savedVocab: [],
        notice: null,

        open: () =>
          set((st) => ({
            isOpen: true,
            mode: 'expanded',
            anchor: st.isOpen ? st.anchor : null,
          })),
        close: () => {
          interrupt()
          setNotice(null)
          set({ isOpen: false, phase: 'idle', speakingMsgId: null, speakingSentence: 0, interim: '' })
        },
        toggle: () => (get().isOpen ? get().close() : get().open()),
        setMode: (mode) => set({ mode }),
        setAnchor: (anchor) => set({ anchor }),
        setSize: (size) => set({ size }),
        setBox: ({ left, bottom, w, h }) => set({ anchor: { left, bottom }, size: { w, h } }),
        setSubtitle: (subtitle) => set({ subtitle }),
        setScenario: (scenarioId) => set({ scenarioId, customTopic: '' }),
        setCustomTopic: (customTopic) => set({ customTopic }),
        setLevel: (level) => set({ level }),
        setVoice: (voice) => set({ voice }),
        setSpeed: (speed) => set({ speed }),
        setCorrection: (correction) => set({ correction }),
        setTts: (partial) => set((st) => ({ tts: { ...st.tts, ...partial } })),
        updateDoubao: (partial) =>
          set((st) => ({
            tts: {
              ...st.tts,
              doubao: { ...st.tts.doubao, ...partial },
            },
          })),
        updateQwen: (partial) =>
          set((st) => ({
            tts: {
              ...st.tts,
              qwen: { ...st.tts.qwen, ...partial },
            },
          })),
        setTtsVoice: (provider, slot, voiceType) =>
          set((st) => ({
            tts: {
              ...st.tts,
              [provider]: {
                ...st.tts[provider],
                voices: { ...st.tts[provider].voices, [slot]: voiceType },
              },
            },
          })),
        clearTtsCredentials: (provider) =>
          set((st) => ({
            tts: {
              ...st.tts,
              [provider]:
                provider === 'doubao'
                  ? { ...st.tts.doubao, apiKey: '', appId: '', accessToken: '' }
                  : { ...st.tts.qwen, apiKey: '' },
            },
          })),
        resetTts: () => set({ tts: SPEAKING_TTS_DEFAULT }),
        setAsrProvider: (provider) => set((st) => ({ asr: { ...st.asr, provider } })),
        updateDoubaoAsr: (partial) =>
          set((st) => ({
            asr: {
              ...st.asr,
              doubao: { ...st.asr.doubao, ...partial },
            },
          })),
        resetAsr: () => set({ asr: SPEAKING_ASR_DEFAULT }),
        toggleReveal: (id) =>
          set((st) => ({
            revealedIds: st.revealedIds.includes(id)
              ? st.revealedIds.filter((x) => x !== id)
              : [...st.revealedIds, id],
          })),

        startSession: () => {
          interrupt()
          resetTranslations()
          unlockAudioPlayback()
          const sc = getScenario(get().scenarioId)
          const greet: SpeakingMessage = {
            id: uid('ai'),
            role: 'ai',
            sentences: sc.greeting,
            zh: sc.greetingZh,
          }
          set({
            view: 'chat',
            messages: [greet],
            revealedIds: [],
            turnIndex: 0,
            startedAt: Date.now(),
            endedAt: null,
            savedVocab: [],
            phase: 'thinking',
            interim: '',
            notice: null,
          })
          void playMessage(greet)
        },

        pressMic: () => {
          const { phase, asr, tts } = get()
          if (phase === 'recognizing' || phase === 'thinking') return

          // 开口即打断上一轮朗读与请求
          interrupt()
          pressStartedAt = Date.now()
          set({ phase: 'listening', speakingMsgId: null, speakingSentence: 0, interim: '', notice: null })
          unlockAudioPlayback()

          // 豆包识别：先录成 WAV，松手后再上传，松手前无法出字
          if (asr.provider === 'doubao') {
            const readiness = isAsrReady(asr, tts)
            if (!readiness.ready) {
              set({ phase: 'idle' })
              setNotice(`${readiness.reason ?? '语音识别未配置'}。可在「设置 → 语音识别」里配置，或先用文字输入。`, 7000)
              return
            }
            if (!isRecordingSupported()) {
              set({ phase: 'idle' })
              setNotice('当前浏览器不支持录音，请改用文字输入', 6000)
              return
            }
            activeRecording = startVoiceRecording()
            return
          }

          // 兜底：浏览器内置识别（边说边出字，但依赖浏览器厂商服务）
          if (!isSpeechRecognitionSupported()) {
            set({ phase: 'idle' })
            setNotice('当前浏览器不支持语音识别，请点键盘图标用文字输入。', 6000)
            return
          }

          activeCapture = startSpeechCapture({
            lang: get().voice.startsWith('uk') ? 'en-GB' : 'en-US',
            onInterim: (text) => {
              if (get().phase === 'listening') set({ interim: text })
            },
          })
        },

        releaseMic: () => {
          if (get().phase !== 'listening') return
          const recording = activeRecording
          const capture = activeCapture
          activeRecording = null
          activeCapture = null

          if (Date.now() - pressStartedAt < MIN_PRESS_MS) {
            recording?.abort()
            capture?.abort()
            set({ phase: 'idle', interim: '' })
            setNotice('说话时间太短，请按住麦克风说完再松开', 2600)
            return
          }

          if (recording) {
            set({ phase: 'recognizing', interim: '' })
            void (async () => {
              try {
                const { blob, durationMs, peak } = await recording.stop()
                if (get().phase !== 'recognizing') return
                if (blob.size === 0 || durationMs < 300) {
                  set({ phase: 'idle' })
                  setNotice('没有录到声音，请靠近麦克风再说一次', 5000)
                  return
                }
                // 音量极低基本等于没说话，先本地拦一次，省一次请求
                if (peak < 0.01) {
                  set({ phase: 'idle' })
                  setNotice('麦克风里几乎没有声音，请检查输入设备或靠近一点', 5000)
                  return
                }

                const snapshot = get()
                const { text } = await transcribeSpeech(snapshot.asr, snapshot.tts, { audio: blob })
                if (get().phase !== 'recognizing') return

                if (!text) {
                  set({ phase: 'idle' })
                  setNotice('没有识别到内容，请再说一次', 5000)
                  return
                }

                void runTurn(text)
              } catch (err) {
                if (get().phase !== 'recognizing') return
                set({ phase: 'idle', interim: '' })
                setNotice(err instanceof Error ? err.message : '语音识别失败，请改用文字输入', 8000)
              }
            })()
            return
          }

          if (!capture) {
            set({ phase: 'idle', interim: '' })
            setNotice('麦克风没有启动，请重试或改用文字输入', 5000)
            return
          }

          set({ phase: 'recognizing' })
          capture.stop()

          void capture.result.then(({ transcript, error }) => {
            if (get().phase !== 'recognizing') return
            const text = transcript.trim()
            if (!text) {
              set({ phase: 'idle', interim: '' })
              setNotice(error ?? '没有识别到内容，请再说一次', 5000)
              return
            }
            void runTurn(text)
          })
        },

        sendText: (text) => {
          const t = text.trim()
          const { phase } = get()
          if (!t || phase === 'recognizing' || phase === 'thinking') return
          void runTurn(t)
        },

        replay: (msgId, slow) => {
          const msg = get().messages.find((m) => m.id === msgId)
          if (!msg || get().phase === 'listening') return
          const speed = slow ? Math.max(0.5, get().speed * 0.75) : get().speed
          void playMessage(msg, speed)
        },

        endSession: () => {
          interrupt()
          set({ view: 'summary', phase: 'idle', speakingMsgId: null, speakingSentence: 0, endedAt: Date.now(), mode: 'expanded' })
        },

        backToSetup: () => {
          interrupt()
          resetTranslations()
          set({ view: 'setup', messages: [], phase: 'idle', startedAt: null, endedAt: null, interim: '' })
        },

        saveVocab: (words) => set((st) => ({ savedVocab: Array.from(new Set([...st.savedVocab, ...words])) })),
      }
    },
    {
      name: 'lingualoop_speaking_v3',
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({
        mode: st.mode,
        size: st.size,
        subtitle: st.subtitle,
        scenarioId: st.scenarioId,
        level: st.level,
        voice: st.voice,
        speed: st.speed,
        correction: st.correction,
        tts: st.tts,
        asr: st.asr,
      }),
      // 老版本存档里没有 tts / asr / 新增字段时，用默认值补齐，避免 undefined 进入请求体
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SpeakingState>
        return {
          ...current,
          ...saved,
          tts: normalizeTtsConfig(saved.tts),
          asr: normalizeAsrConfig(saved.asr),
        }
      },
    }
  )
)
