'use client'

/**
 * 设置 · 语音合成（TTS）
 *
 * 设计约束：
 * 1. 对话模型不在这里配，直接沿用「AI 模型配置」（例如对话用 DeepSeek，朗读用豆包）。
 * 2. TTS 只做「文本 → 音频」，不参与对话、不纠错、不改写。
 * 3. 必须先有大模型配置才允许配 TTS：没有对话模型就没有可朗读的内容。
 * 4. 合成服务可切换（豆包 / 千问 / 浏览器内置），各家凭据与音色各自独立保存。
 * 5. 所有凭据只写本机 localStorage，服务端代理无状态、不落盘、不写日志。
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  AudioLines,
  Bot,
  Check,
  CheckCircle,
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  Info,
  KeyRound,
  Loader2,
  Lock,
  MonitorSpeaker,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Volume2,
  X,
} from 'lucide-react'
import { useAiAssistantStore } from '@/store/useAiAssistantStore'
import { useSpeakingStore } from '@/store/useSpeakingStore'
import { SPEAKING_VOICES, type SpeakingVoiceId } from '@/lib/speaking/scenarios'
import {
  DOUBAO_APIKEY_URL,
  DOUBAO_RESOURCE_OPTIONS,
  QWEN_CONSOLE_URL,
  QWEN_MODEL_SUGGESTIONS,
  TTS_PROVIDERS,
  TTS_SAMPLE_TEXT,
  VOICE_SLOT_LABEL,
  defaultDoubaoVoices,
  doubaoVoiceFamily,
  hasVoiceFamilyMismatch,
  isChatModelReady,
  isTtsProviderConfigured,
  isTtsReady,
  missingVoiceSlots,
  playbackRateFor,
  speakWithSystemVoice,
  synthesizeSpeech,
  voiceSuggestionsFor,
  type CloudTtsProvider,
  type DoubaoAuthMode,
  type TtsProvider,
} from '@/lib/speaking/ttsConfig'

const inputClass =
  'w-full bg-black/20 border border-border rounded-md px-4 py-3 text-sm font-mono text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 disabled:cursor-not-allowed'

function SectionTitle({
  icon,
  title,
  desc,
  right,
}: {
  icon: React.ReactNode
  title: string
  desc?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 size-6 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
          {icon}
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-white">{title}</h4>
          {desc && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

const PROVIDER_ICON: Record<TtsProvider, React.ReactNode> = {
  doubao: <Cloud className="size-3.5" />,
  qwen: <Globe2 className="size-3.5" />,
  browser: <MonitorSpeaker className="size-3.5" />,
}

type TestState =
  | { status: 'idle' }
  | { status: 'loading'; slot: SpeakingVoiceId }
  | { status: 'ok'; slot: SpeakingVoiceId; latencyMs: number }
  | { status: 'error'; message: string }

export function SpeakingTtsPanel({ onGoAiModels }: { onGoAiModels: () => void }) {
  const tts = useSpeakingStore((s) => s.tts)
  const setTts = useSpeakingStore((s) => s.setTts)
  const updateDoubao = useSpeakingStore((s) => s.updateDoubao)
  const updateQwen = useSpeakingStore((s) => s.updateQwen)
  const setTtsVoice = useSpeakingStore((s) => s.setTtsVoice)
  const clearTtsCredentials = useSpeakingStore((s) => s.clearTtsCredentials)
  const resetTts = useSpeakingStore((s) => s.resetTts)
  const aiConfig = useAiAssistantStore((s) => s.aiConfig)

  const [showSecret, setShowSecret] = useState(false)
  const [sampleText, setSampleText] = useState(TTS_SAMPLE_TEXT)
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const chat = isChatModelReady(aiConfig)
  const locked = !chat.ready
  const provider = tts.provider
  const cloudProvider = (provider === 'browser' ? null : provider) as CloudTtsProvider | null
  const configured = isTtsProviderConfigured(tts)
  const missingVoices = missingVoiceSlots(tts)
  const activeMeta = TTS_PROVIDERS.find((p) => p.id === provider) ?? TTS_PROVIDERS[0]
  const doubao = tts.doubao
  const voiceFamily = doubaoVoiceFamily(doubao)
  const mismatch = provider === 'doubao' && hasVoiceFamilyMismatch(doubao)

  /**
   * 切换鉴权方式 / 资源版本时，音色版本必须跟着换，否则一定报 not granted。
   * 只在音色仍是「上一版本的默认值」（说明用户没改过）时才自动替换，避免覆盖手工绑定。
   */
  const applyDoubaoMode = (patch: { authMode?: DoubaoAuthMode; resourceId?: string }) => {
    const next = { ...doubao, ...patch }
    const prevDefaults = defaultDoubaoVoices(doubao)
    const nextDefaults = defaultDoubaoVoices(next)
    const untouched = SPEAKING_VOICES.every(
      (v) => (doubao.voices[v.id as SpeakingVoiceId] ?? '') === prevDefaults[v.id as SpeakingVoiceId]
    )
    updateDoubao({ ...patch, ...(untouched ? { voices: nextDefaults } : {}) })
    setTest({ status: 'idle' })
  }

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  const handlePlay = async (slot: SpeakingVoiceId) => {
    if (locked) return
    const text = sampleText.trim()
    if (!text) return

    stopPlayback()
    setTest({ status: 'loading', slot })

    try {
      const speed = useSpeakingStore.getState().speed

      if (provider === 'browser') {
        const { latencyMs } = await speakWithSystemVoice(text, {
          lang: slot.startsWith('uk') ? 'en-GB' : 'en-US',
          rate: speed,
        })
        setTest({ status: 'ok', slot, latencyMs })
        return
      }

      const readiness = isTtsReady(tts, slot)
      if (!readiness.ready) {
        throw new Error(readiness.reason || '语音合成尚未配置完成')
      }

      const { blob, latencyMs } = await synthesizeSpeech(tts, {
        text,
        voice: slot,
        speed,
      })
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      // 千问没有语速参数，按准备页的语速在播放端变速；豆包已在服务端生成好速度
      audio.playbackRate = playbackRateFor(tts, speed)
      audio.onended = () => setTest({ status: 'ok', slot, latencyMs })
      audio.onerror = () => setTest({ status: 'error', message: '音频解码失败，请尝试切换输出格式或音色' })
      await audio.play()
      setTest({ status: 'ok', slot, latencyMs })
    } catch (err) {
      setTest({ status: 'error', message: err instanceof Error ? err.message : '试听失败' })
    }
  }

  const handleClearCredentials = () => {
    if (!cloudProvider) return
    const label = activeMeta?.name || '语音'
    if (!confirm(`清除本机保存的${label}凭据？清除后口语陪练将无法朗读。`)) return
    stopPlayback()
    clearTtsCredentials(cloudProvider)
    setTest({ status: 'idle' })
  }

  return (
    <div className="space-y-5">
      {/* 标题 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2.5">
            <AudioLines className="size-4.5 text-primary" />
            <span>语音合成（TTS）</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[12px] font-medium border ${
                locked
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                  : configured
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
              }`}
            >
              {locked ? '待前置' : configured ? '已就绪' : '待配置'}
            </span>
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            口语陪练的语音链路分三层：听（语音识别）、想（对话模型）、说（本页的 TTS）。本页只配「说」——把 AI
            的回复实时合成语音播放，不参与对话生成、不做纠错、不改写文本；语种跟随当前练习的语言，不限于英语。
            对话模型在「AI 模型配置」里统一设置。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!confirm('恢复语音合成的默认参数？（会清空所有服务商的凭据）')) return
            stopPlayback()
            resetTts()
            setTest({ status: 'idle' })
          }}
          className="shrink-0 text-sm text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw className="size-4" />
          <span>恢复默认</span>
        </button>
      </div>

      {/* 前置条件：AI 对话模型 */}
      {locked ? (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] flex gap-3">
          <Lock className="size-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="space-y-2 min-w-0">
            <div className="text-sm font-semibold text-amber-200">先配置 AI 对话模型，才能配置语音</div>
            <p className="text-xs text-amber-100/80 leading-relaxed">
              口语对话的每一句回复都来自 AI 大模型，TTS 只把它读出来。当前{chat.reason}
              ，所以先补齐这一步。
            </p>
            <button
              type="button"
              onClick={onGoAiModels}
              className="mt-0.5 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-100 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              去配置 AI 模型
              <ArrowUpRight className="size-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] flex gap-3">
          <Bot className="size-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              前置条件已满足：对话模型
              <Check className="size-3.5 text-emerald-400" />
            </div>
            <div className="text-xs text-muted-foreground font-mono truncate">
              {aiConfig.provider} · {aiConfig.model} · {aiConfig.endpoint}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              对话与朗读是两套独立服务，可以混搭：例如对话用 DeepSeek 生成回复，朗读用豆包或千问合成，互不影响。
            </p>
          </div>
        </div>
      )}

      {/* 锁定后整块置灰，避免用户在没配模型时先配语音 */}
      <div
        className={locked ? 'space-y-5 opacity-45 pointer-events-none select-none' : 'space-y-5'}
        aria-disabled={locked}
      >
        {/* 合成服务 */}
        <div className="p-5 rounded-lg border border-border space-y-4">
          <SectionTitle
            icon={<Volume2 className="size-3.5" />}
            title="合成服务"
            desc="TTS 服务商可自由切换，各家的凭据与音色分开保存，切走再切回不用重填。"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TTS_PROVIDERS.map((p) => {
              const active = provider === p.id
              const ready = isTtsProviderConfigured(tts, p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    stopPlayback()
                    setTts({ provider: p.id })
                    setTest({ status: 'idle' })
                  }}
                  className={`p-4 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                    active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-semibold flex items-center gap-1.5 ${active ? 'text-primary' : 'text-white'}`}
                    >
                      {PROVIDER_ICON[p.id]}
                      {p.name}
                    </span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] border ${
                        p.id === 'browser'
                          ? 'text-muted-foreground border-border'
                          : ready
                            ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                            : 'text-muted-foreground border-border'
                      }`}
                    >
                      {p.id === 'browser' ? '免密钥' : ready ? '已填' : '未填'}
                    </span>
                  </div>
                  <div className="text-[12px] text-muted-foreground">{p.vendor}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{p.summary}</p>
                  {p.tag && (
                    <span className="mt-auto inline-flex w-fit px-1.5 py-0.5 rounded text-[11px] bg-primary/10 text-primary border border-primary/20">
                      {p.tag}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 豆包凭据 */}
        {provider === 'doubao' && (
          <div className="p-5 rounded-lg border border-border space-y-5">
            <SectionTitle
              icon={<KeyRound className="size-3.5" />}
              title="豆包凭据"
              desc="火山引擎有两套鉴权：新版控制台用 API Key（推荐，旧版后续会下线），旧版用 AppID + Access Token。手上是哪套就选哪套。"
              right={
                <a
                  href={doubao.authMode === 'apikey' ? DOUBAO_APIKEY_URL : activeMeta.consoleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[12px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  {doubao.authMode === 'apikey' ? 'API Key 管理' : '打开控制台'}
                  <ExternalLink className="size-3" />
                </a>
              }
            />

            {/* 鉴权方式 */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-white">鉴权方式</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      id: 'apikey' as const,
                      title: 'API Key',
                      desc: '新版控制台，请求头 X-Api-Key + 资源版本',
                      badge: '推荐',
                    },
                    {
                      id: 'token' as const,
                      title: 'AppID + Access Token',
                      desc: '旧版控制台，V1 接口',
                      badge: '兼容',
                    },
                  ]
                ).map((opt) => {
                  const active = doubao.authMode === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        applyDoubaoMode({
                          authMode: opt.id,
                          resourceId: opt.id === 'token' ? 'seed-tts-1.0' : 'seed-tts-2.0',
                        })
                      }
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold ${active ? 'text-primary' : 'text-white'}`}>
                          {opt.title}
                        </span>
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] border ${
                            active
                              ? 'text-primary border-primary/40 bg-primary/10'
                              : 'text-muted-foreground border-border'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {doubao.authMode === 'apikey' ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white">API Key</label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={doubao.apiKey}
                      onChange={(e) => updateDoubao({ apiKey: e.target.value.trim() })}
                      placeholder="控制台 > API Key 管理里创建"
                      className={`${inputClass} pr-11`}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((v) => !v)}
                      aria-label={showSecret ? '隐藏 API Key' : '显示 API Key'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-white transition-colors cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    与对话大模型的 Key 是两套，注意别混用。
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white">资源版本（X-Api-Resource-Id）</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {DOUBAO_RESOURCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => applyDoubaoMode({ resourceId: opt.id })}
                        title={opt.desc}
                        className={`px-2.5 py-1.5 rounded-md text-[12px] border transition-all cursor-pointer ${
                          doubao.resourceId === opt.id
                            ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                            : 'bg-transparent text-muted-foreground border-border hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    {DOUBAO_RESOURCE_OPTIONS.find((o) => o.id === doubao.resourceId)?.desc ||
                      '自定义资源标识'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white">AppID</label>
                  <input
                    type="text"
                    value={doubao.appId}
                    onChange={(e) => updateDoubao({ appId: e.target.value.trim() })}
                    placeholder="例如 1234567890"
                    className={inputClass}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white">Access Token</label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={doubao.accessToken}
                      onChange={(e) => updateDoubao({ accessToken: e.target.value.trim() })}
                      placeholder="控制台应用里的 Access Token"
                      className={`${inputClass} pr-11`}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((v) => !v)}
                      aria-label={showSecret ? '隐藏 Token' : '显示 Token'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-white transition-colors cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white">Cluster（业务集群）</label>
                  <input
                    type="text"
                    value={doubao.cluster}
                    onChange={(e) => updateDoubao({ cluster: e.target.value.trim() })}
                    placeholder="volcano_tts"
                    className={inputClass}
                    spellCheck={false}
                  />
                  <p className="text-[12px] text-muted-foreground">普通语音合成固定填 volcano_tts。</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white">输出格式</label>
                  <div className="flex items-center gap-1.5">
                    {(['mp3', 'wav'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => updateDoubao({ encoding: f })}
                        className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all cursor-pointer ${
                          doubao.encoding === f
                            ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                            : 'bg-transparent text-muted-foreground border-border hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                    <span className="text-[12px] text-muted-foreground ml-2">mp3 体积小，wav 便于本地处理</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-white">音量</span>
                <span className="font-mono text-xs text-primary">{doubao.volume.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={doubao.volume}
                onChange={(e) => updateDoubao({ volume: parseFloat(e.target.value) })}
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                语速不在这里设：由准备页「语速 0.8x / 1.0x / 1.2x」控制，
                {doubao.authMode === 'apikey'
                  ? '合成时换算成 speech_rate；音量换算成 loudness_rate。'
                  : '合成时换算成 speed_ratio；音量换算成 volume_ratio。'}
                {doubao.authMode === 'apikey' ? ' API Key 模式输出固定为 mp3（流式接口对 wav 支持不佳）。' : ''}
              </p>
            </div>
          </div>
        )}

        {/* 千问凭据 */}
        {provider === 'qwen' && (
          <div className="p-5 rounded-lg border border-border space-y-5">
            <SectionTitle
              icon={<KeyRound className="size-3.5" />}
              title="千问凭据"
              desc="阿里云百炼控制台创建 API Key（sk- 开头）。注意北京与新加坡地域的 Key 不通用，要和下面的地域一致。"
              right={
                <a
                  href={QWEN_CONSOLE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[12px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  打开百炼控制台
                  <ExternalLink className="size-3" />
                </a>
              }
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">API Key</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={tts.qwen.apiKey}
                    onChange={(e) => updateQwen({ apiKey: e.target.value.trim() })}
                    placeholder="sk-..."
                    className={`${inputClass} pr-11`}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? '隐藏 Key' : '显示 Key'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-white transition-colors cursor-pointer"
                  >
                    {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">模型</label>
                <input
                  type="text"
                  value={tts.qwen.model}
                  onChange={(e) => updateQwen({ model: e.target.value.trim() })}
                  placeholder="qwen3-tts-flash"
                  className={inputClass}
                  spellCheck={false}
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12px] text-muted-foreground">常用：</span>
                  {QWEN_MODEL_SUGGESTIONS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => updateQwen({ model: m.id })}
                      className={`px-2 py-0.5 rounded-md text-[12px] border transition-all cursor-pointer ${
                        tts.qwen.model === m.id
                          ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                          : 'bg-transparent text-muted-foreground border-border hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">地域</label>
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'beijing', label: '北京' },
                      { id: 'singapore', label: '新加坡' },
                    ] as const
                  ).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => updateQwen({ region: r.id })}
                      className={`px-3 py-1.5 rounded-md text-xs border transition-all cursor-pointer ${
                        tts.qwen.region === r.id
                          ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                          : 'bg-transparent text-muted-foreground border-border hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-muted-foreground">走官方非流式接口，返回音频后由本站转发给浏览器。</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">语速</label>
                <div className="px-3 py-2 rounded-md bg-white/[0.03] border border-border text-[12px] text-muted-foreground leading-relaxed">
                  千问接口没有语速参数，因此按准备页的 0.8x / 1.0x / 1.2x 在播放端变速，音色不受影响。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 浏览器内置语音说明 */}
        {provider === 'browser' && (
          <div className="p-5 rounded-lg border border-border flex gap-3">
            <MonitorSpeaker className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-white">浏览器内置语音无需配置</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                直接调用系统的 speechSynthesis，不走任何接口、不产生费用，也不绑定音色 ID。四个音色选项会用系统里
                美式 / 英式的声音代替，具体效果取决于操作系统装了什么语音包。
              </p>
            </div>
          </div>
        )}

        {/* 音色绑定 */}
        <div className="p-5 rounded-lg border border-border space-y-4">
          <SectionTitle
            icon={<SlidersHorizontal className="size-3.5" />}
            title="音色绑定"
            desc={
              cloudProvider
                ? `准备页的四个音色选项，各自绑定一个${activeMeta?.name || ''}音色。合成时按当前选择的音色取值。`
                : '浏览器内置语音不绑定音色，直接使用系统声音。'
            }
            right={
              cloudProvider === 'doubao' ? (
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[12px] border border-border text-muted-foreground">
                  当前 {voiceFamily} 音色
                </span>
              ) : undefined
            }
          />

          {cloudProvider ? (
            <>
              {mismatch && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-3 space-y-2">
                  <div className="flex items-start gap-2 text-[12px] text-amber-200 leading-relaxed">
                    <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
                    <span>
                      绑定的音色与当前资源版本不配套，合成会报 requested resource not granted。2.0 资源只能用
                      *_uranus_bigtts 音色，1.0 资源只能用 *_moon_bigtts / *_mars_bigtts。
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateDoubao({ voices: defaultDoubaoVoices(doubao) })
                      setTest({ status: 'idle' })
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-100 text-[12px] font-medium transition-colors cursor-pointer"
                  >
                    换成 {voiceFamily} 默认音色
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {SPEAKING_VOICES.map((v) => {
                  const slot = v.id as SpeakingVoiceId
                  const source = cloudProvider === 'doubao' ? doubao.voices : tts.qwen.voices
                  const value = source[slot] ?? ''
                  const suggestions = voiceSuggestionsFor(tts, slot)
                  return (
                    <div key={slot} className="grid grid-cols-1 xl:grid-cols-[110px_1fr] gap-2 xl:items-center">
                      <span className="text-xs font-medium text-muted-foreground">{v.label}</span>
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setTtsVoice(cloudProvider, slot, e.target.value.trim())}
                          placeholder={
                            cloudProvider === 'doubao'
                              ? voiceFamily === '2.0'
                                ? '音色 ID，例如 en_female_jane_uranus_bigtts'
                                : '音色 ID，例如 en_female_mars_bigtts'
                              : '音色名，例如 Cherry'
                          }
                          className={`w-full bg-black/20 border rounded-md px-3 py-2 text-xs font-mono text-white placeholder:text-muted-foreground/60 focus:outline-none ${
                            value ? 'border-border focus:border-primary/60' : 'border-rose-500/40 focus:border-rose-400'
                          }`}
                          spellCheck={false}
                        />
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] text-muted-foreground">常用：</span>
                          {suggestions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setTtsVoice(cloudProvider, slot, s.id)}
                              title={s.id}
                              className={`px-2 py-0.5 rounded-md text-[12px] border transition-all cursor-pointer ${
                                value === s.id
                                  ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                                  : 'bg-transparent text-muted-foreground border-border hover:text-white hover:bg-white/10'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-[12px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                <Info className="size-3.5 shrink-0 mt-0.5" />
                {cloudProvider === 'doubao'
                  ? '音色 ID 只是常用示例，具体以控制台「音色库」为准；2.0 英文音色以美式为主，英式可选 Knightley（男）。'
                  : '千问音色不区分英美口音，四个槽位可以重复绑定同一个音色；填错音色名时试听会返回音色不存在。'}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              当前使用系统语音，音色来自操作系统。想要更自然、更稳定的发音，把合成服务切到豆包或千问即可。
            </p>
          )}
        </div>

        {/* 试听 */}
        <div className="p-5 rounded-lg border border-border space-y-4">
          <SectionTitle
            icon={<Play className="size-3.5" />}
            title="合成试听"
            desc="只会合成下面这一句，用来验证凭据、音色与网络是否可用。试听不经过对话模型，也不消耗大模型额度。"
          />

          <textarea
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            rows={2}
            className="w-full bg-black/20 border border-border rounded-md px-4 py-3 text-sm text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 resize-none"
            placeholder="输入一句试听文本（跟随当前练习语种）"
          />

          <div className="flex flex-wrap items-center gap-2">
            {SPEAKING_VOICES.map((v) => {
              const slot = v.id as SpeakingVoiceId
              const loading = test.status === 'loading' && test.slot === slot
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={test.status === 'loading'}
                  onClick={() => handlePlay(slot)}
                  className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-border text-white text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <Play className="size-3.5 text-primary" />
                  )}
                  试听{v.label}
                </button>
              )
            })}
          </div>

          {missingVoices.length > 0 && (
            <div className="text-xs text-amber-300/90 inline-flex items-center gap-1.5">
              <TriangleAlert className="size-3.5" />
              {missingVoices.map((id) => VOICE_SLOT_LABEL[id]).join('、')} 还没有绑定音色，对应音色无法合成
            </div>
          )}

          {test.status === 'ok' && (
            <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-xl border bg-emerald-500/10 border-emerald-500/25 text-sm text-emerald-300">
              <CheckCircle className="size-4 shrink-0 text-emerald-400 mt-0.5" />
              <span>
                合成成功（{test.latencyMs}ms）· 音色 {VOICE_SLOT_LABEL[test.slot]} · 已播放
              </span>
            </div>
          )}

          {test.status === 'error' && (
            <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-xl border bg-rose-500/10 border-rose-500/25 text-sm text-rose-300">
              <X className="size-4 shrink-0 text-rose-400 mt-0.5" />
              <span className="break-all">试听失败：{test.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* 本机数据 */}
      <div className="p-5 rounded-lg border border-border space-y-4">
        <SectionTitle
          icon={<ShieldCheck className="size-3.5" />}
          title="本机数据与清理"
          desc="语音凭据同样只留在本机，不进入账号、不参与云同步；切换到别的服务商时，原凭据仍保留在本机。"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="px-3.5 py-3 rounded-md bg-white/[0.03] border border-border">
            <div className="text-[12px] text-muted-foreground">存储位置</div>
            <div className="font-mono text-xs text-white mt-1 truncate">localStorage · lingualoop_speaking_v3</div>
          </div>
          <div className="px-3.5 py-3 rounded-md bg-white/[0.03] border border-border">
            <div className="text-[12px] text-muted-foreground">服务端</div>
            <div className="text-xs text-white mt-1">仅转发请求，不存凭据、不存音频、不记日志</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!cloudProvider}
            onClick={handleClearCredentials}
            className="px-3.5 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-white hover:bg-white/[0.06] transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="size-3.5" />
            清除当前服务商凭据
          </button>
          <span className="text-[12px] text-muted-foreground">
            {cloudProvider
              ? `只清空${activeMeta?.name || ''}的凭据，音色与输出格式保留。`
              : '浏览器内置语音没有凭据需要清除。'}
          </span>
        </div>
      </div>
    </div>
  )
}
