'use client'

/**
 * 设置 · 语音识别（ASR）
 *
 * 职责边界：
 * 1. 只做「你说的话 → 文本」，拿到文本后交给对话模型；不做翻译、不改写、不纠错。
 * 2. 与「语音合成」是两条独立链路：TTS 让 AI 说话，ASR 听你说话。
 *    火山上两者是两个独立资源（ASR 是 volc.seedasr.auc），要分别开通。
 * 3. 凭据默认沿用语音合成里已填的豆包凭据，同一个账号不必填两遍。
 * 4. 所有配置只写本机 localStorage，服务端代理无状态、不落盘。
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle,
  Cloud,
  Ear,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Mic,
  MonitorSpeaker,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { useAiAssistantStore } from '@/store/useAiAssistantStore'
import { useSpeakingStore } from '@/store/useSpeakingStore'
import {
  ASR_LANGUAGE_OPTIONS,
  ASR_PROVIDERS,
  DOUBAO_ASR_APIKEY_URL,
  DOUBAO_ASR_CONSOLE_URL,
  DOUBAO_ASR_RESOURCE_ID,
  isAsrReady,
  resolveAsrCredentials,
  transcribeSpeech,
  type AsrAuthMode,
  type AsrLanguage,
  type AsrProvider,
} from '@/lib/speaking/asrConfig'
import { isRecordingSupported, startVoiceRecording, type VoiceRecording } from '@/lib/speaking/recorder'
import { isChatModelReady } from '@/lib/speaking/ttsConfig'

const inputClass =
  'w-full bg-black/20 border border-border rounded-md px-4 py-3 text-sm font-mono text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 disabled:cursor-not-allowed disabled:opacity-60'

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

const PROVIDER_ICON: Record<AsrProvider, React.ReactNode> = {
  doubao: <Cloud className="size-3.5" />,
  browser: <MonitorSpeaker className="size-3.5" />,
}

type TestState =
  | { status: 'idle' }
  | { status: 'recording' }
  | { status: 'uploading' }
  | { status: 'ok'; text: string; latencyMs: number; durationMs?: number }
  | { status: 'error'; message: string }

export function SpeakingAsrPanel({ onGoAiModels }: { onGoAiModels: () => void }) {
  const asr = useSpeakingStore((s) => s.asr)
  const tts = useSpeakingStore((s) => s.tts)
  const setAsrProvider = useSpeakingStore((s) => s.setAsrProvider)
  const updateDoubaoAsr = useSpeakingStore((s) => s.updateDoubaoAsr)
  const resetAsr = useSpeakingStore((s) => s.resetAsr)
  const aiConfig = useAiAssistantStore((s) => s.aiConfig)

  const [showSecret, setShowSecret] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const recordingRef = useRef<VoiceRecording | null>(null)

  const chat = isChatModelReady(aiConfig)
  const locked = !chat.ready
  const provider = asr.provider
  const doubao = asr.doubao
  const credentials = resolveAsrCredentials(asr, tts)
  const readiness = isAsrReady(asr, tts)
  const micSupported = isRecordingSupported()

  const ttsIsDoubao = tts.provider === 'doubao'
  const inheritedReady =
    credentials.authMode === 'apikey'
      ? Boolean(credentials.apiKey.trim())
      : Boolean(credentials.appId.trim() && credentials.accessToken.trim())

  useEffect(() => {
    return () => {
      recordingRef.current?.abort()
    }
  }, [])

  const startTest = () => {
    if (locked || provider !== 'doubao' || test.status === 'recording' || test.status === 'uploading') {
      return
    }
    if (!micSupported) {
      setTest({ status: 'error', message: '当前浏览器不支持录音，换个浏览器再试' })
      return
    }
    if (!readiness.ready) {
      setTest({ status: 'error', message: readiness.reason ?? '识别尚未配置完成' })
      return
    }

    recordingRef.current?.abort()
    recordingRef.current = startVoiceRecording()
    setTest({ status: 'recording' })
  }

  const stopTest = () => {
    const recording = recordingRef.current
    recordingRef.current = null
    if (!recording || test.status !== 'recording') return

    setTest({ status: 'uploading' })
    void (async () => {
      try {
        const { blob, durationMs, peak } = await recording.stop()
        if (blob.size === 0 || durationMs < 300) {
          setTest({ status: 'error', message: '没录到声音，按住多说一会儿再松开' })
          return
        }
        if (peak < 0.01) {
          setTest({ status: 'error', message: '麦克风里几乎没有声音，请检查输入设备' })
          return
        }

        const snapshot = useSpeakingStore.getState()
        const res = await transcribeSpeech(snapshot.asr, snapshot.tts, { audio: blob })
        setTest({
          status: 'ok',
          text: res.text || '（识别结果为空）',
          latencyMs: res.latencyMs,
          durationMs: res.durationMs ?? durationMs,
        })
      } catch (err) {
        setTest({
          status: 'error',
          message: err instanceof Error ? err.message : '语音识别失败',
        })
      }
    })()
  }

  const setAuthMode = (authMode: AsrAuthMode) => {
    updateDoubaoAsr({ authMode })
    setTest({ status: 'idle' })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Ear className="size-4 text-primary" />
          语音识别
        </h3>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          口语陪练的语音链路分三步：听（本页，语音转文字）、想（对话模型）、说（语音合成）。本页只配「听」——
          把你按下麦克风说的话转成文本，再交给对话模型生成回复，识别结果不参与翻译、不改写、不纠错。
        </p>
      </div>

      {/* 前置条件：必须有对话模型 */}
      <div
        className={`p-4 rounded-lg border ${
          chat.ready ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5 min-w-0">
            {chat.ready ? (
              <CheckCircle className="size-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <TriangleAlert className="size-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">
                {chat.ready ? '对话模型已配置' : '需要先配置对话模型'}
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {chat.ready
                  ? `识别出的文本会交给「AI 模型配置」里的 ${aiConfig.model || '当前模型'} 生成回复。对话模型与语音识别是两套服务，可以混搭：豆包听写、DeepSeek 对话。`
                  : `${chat.reason}。语音识别只负责听写，回复仍需对话模型生成，所以要先把它配好。`}
              </p>
              {chat.ready && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-mono text-muted-foreground">
                  <span>{aiConfig.model || '未选择模型'}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="truncate max-w-[280px]">{aiConfig.endpoint}</span>
                </div>
              )}
            </div>
          </div>
          {!chat.ready && (
            <button
              type="button"
              onClick={onGoAiModels}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[12px] font-medium text-amber-200 hover:bg-amber-500/25 transition-colors cursor-pointer"
            >
              去配置
              <ArrowUpRight className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className={locked ? 'space-y-6 opacity-50 pointer-events-none select-none' : 'space-y-6'}>
        {/* 识别引擎 */}
        <div className="p-5 rounded-lg border border-border space-y-4">
          <SectionTitle
            icon={<Ear className="size-3.5" />}
            title="识别引擎"
            desc="豆包识别准确率高、松手后整句返回；浏览器内置识别免配置，但依赖浏览器厂商的在线服务。"
          />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {ASR_PROVIDERS.map((p) => {
              const active = provider === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setAsrProvider(p.id)
                    setTest({ status: 'idle' })
                  }}
                  className={`relative text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
                    active
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border bg-transparent hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={active ? 'text-primary' : 'text-muted-foreground'}>{PROVIDER_ICON[p.id]}</span>
                    <span className="text-sm font-semibold text-white">{p.name}</span>
                    {p.tag && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[11px] font-medium">
                        {p.tag}
                      </span>
                    )}
                    {active && <CheckCircle className="size-3.5 text-primary ml-auto" />}
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed">{p.summary}</p>
                </button>
              )
            })}
          </div>

          {provider === 'browser' && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 space-y-1">
              <p className="text-[12px] text-amber-200/90 leading-relaxed flex items-start gap-1.5">
                <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
                浏览器识别走的是 Chrome / Edge 厂商的在线服务，国内网络下常见 network 报错，且无法保证隐私。正式使用建议选豆包。
              </p>
            </div>
          )}
        </div>

        {/* 豆包凭据 */}
        {provider === 'doubao' && (
          <div className="p-5 rounded-lg border border-border space-y-5">
            <SectionTitle
              icon={<KeyRound className="size-3.5" />}
              title="豆包凭据"
              desc="识别与合成是火山上的两个独立资源，同一个 API Key 即可调用，但要分别开通。识别用的是「录音文件识别 2.0」。"
              right={
                <a
                  href={DOUBAO_ASR_CONSOLE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[12px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  打开控制台
                  <ExternalLink className="size-3" />
                </a>
              }
            />

            {/* 凭据来源 */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-white">凭据来源</div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {(
                  [
                    { id: 'follow' as const, label: '跟随语音合成的豆包凭据', desc: '同一账号只填一次' },
                    { id: 'own' as const, label: '单独填写', desc: '识别用另一个火山应用' },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={locked}
                    onClick={() => updateDoubaoAsr({ credentialSource: opt.id })}
                    className={`text-left px-3 py-2.5 rounded-md border transition-all cursor-pointer ${
                      doubao.credentialSource === opt.id
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border hover:bg-white/5'
                    }`}
                  >
                    <div className="text-xs font-medium text-white">{opt.label}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {doubao.credentialSource === 'follow' && (
                <div
                  className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed ${
                    ttsIsDoubao && inheritedReady
                      ? 'bg-emerald-500/[0.08] text-emerald-200/90'
                      : 'bg-amber-500/[0.08] text-amber-200/90'
                  }`}
                >
                  {ttsIsDoubao && inheritedReady ? (
                    <>
                      <CheckCircle className="size-3.5 shrink-0 mt-0.5" />
                      <span>
                        已沿用语音合成里的豆包凭据（
                        {credentials.authMode === 'apikey' ? 'API Key' : 'AppID + Access Token'}）。这里只把资源 ID
                        换成识别的 {DOUBAO_ASR_RESOURCE_ID}。
                      </span>
                    </>
                  ) : (
                    <>
                      <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
                      <span>
                        {!ttsIsDoubao
                          ? '当前语音合成不是豆包，没有可沿用的凭据。请改选「单独填写」，或先把语音合成切回豆包。'
                          : '语音合成里的豆包凭据还没填。先去「语音合成」填好，或在这里改选「单独填写」。'}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 独立凭据 */}
            {doubao.credentialSource === 'own' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-white">鉴权方式</div>
                  <div className="flex items-center gap-2">
                    {(
                      [
                        { id: 'apikey' as const, label: 'API Key', hint: '新版控制台' },
                        { id: 'token' as const, label: 'AppID + Access Token', hint: '旧版控制台' },
                      ]
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={locked}
                        onClick={() => setAuthMode(m.id)}
                        className={`px-3 py-1.5 rounded-md text-xs border transition-all cursor-pointer ${
                          doubao.authMode === m.id
                            ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                            : 'bg-transparent text-muted-foreground border-border hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {m.label}
                        <span className="ml-1 text-[11px] opacity-70">{m.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {doubao.authMode === 'apikey' ? (
                    <div className="space-y-2 xl:col-span-2">
                      <label className="text-xs font-semibold text-white">API Key</label>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          value={doubao.apiKey}
                          onChange={(e) => updateDoubaoAsr({ apiKey: e.target.value.trim() })}
                          placeholder="控制台 → API Key 管理"
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
                      <a
                        href={DOUBAO_ASR_APIKEY_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                      >
                        去创建 API Key
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-white">AppID</label>
                        <input
                          type="text"
                          value={doubao.appId}
                          onChange={(e) => updateDoubaoAsr({ appId: e.target.value.trim() })}
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
                            onChange={(e) => updateDoubaoAsr({ accessToken: e.target.value.trim() })}
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
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">识别模型</label>
                <div className="h-9 px-3 rounded-md bg-muted/40 border border-border flex items-center font-mono text-xs text-muted-foreground select-all">
                  录音文件识别 2.0 · {DOUBAO_ASR_RESOURCE_ID}
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  固定走这个模型，不需要填资源 ID。控制台「服务管理 → 语音识别」里开通它即可，
                  它与语音合成的 seed-tts-* 是两个独立资源。
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">识别语言</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ASR_LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={locked}
                      title={opt.desc}
                      onClick={() => updateDoubaoAsr({ language: opt.id as AsrLanguage })}
                      className={`px-2.5 py-1.5 rounded-md text-xs border transition-all cursor-pointer ${
                        doubao.language === opt.id
                          ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                          : 'bg-transparent text-muted-foreground border-border hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {ASR_LANGUAGE_OPTIONS.find((o) => o.id === doubao.language)?.desc}。选错语种会明显影响识别准确率。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 试识别 */}
        <div className="p-5 rounded-lg border border-border space-y-4">
          <SectionTitle
            icon={<Mic className="size-3.5" />}
            title="试识别"
            desc={
              provider === 'doubao'
                ? '按住下面的按钮说一句英文，松开后会真的上传到豆包识别，用来确认凭据与资源是否开通。'
                : '浏览器内置识别在对话页直接可用，这里不做额外测试。'
            }
          />

          {provider === 'doubao' ? (
            <>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={locked || test.status === 'uploading'}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.currentTarget.setPointerCapture(e.pointerId)
                    startTest()
                  }}
                  onPointerUp={stopTest}
                  onPointerCancel={stopTest}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`h-11 px-5 rounded-full text-sm font-medium inline-flex items-center gap-2 touch-none select-none transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                    test.status === 'recording'
                      ? 'bg-primary text-primary-foreground scale-105'
                      : 'bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25'
                  }`}
                >
                  {test.status === 'recording' ? (
                    <>
                      <span className="size-2 rounded-full bg-primary-foreground animate-pulse" />
                      正在录音，松手识别
                    </>
                  ) : test.status === 'uploading' ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      识别中…
                    </>
                  ) : (
                    <>
                      <Mic className="size-4" />
                      按住试识别
                    </>
                  )}
                </button>

                {!micSupported && (
                  <span className="text-[12px] text-amber-300/90 inline-flex items-center gap-1.5">
                    <TriangleAlert className="size-3.5" />
                    当前浏览器不支持录音
                  </span>
                )}
              </div>

              {test.status === 'ok' && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3.5 py-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-[12px] text-emerald-300">
                    <CheckCircle className="size-3.5" />
                    识别成功
                    <span className="text-muted-foreground font-mono">
                      耗时 {test.latencyMs} ms
                      {test.durationMs ? ` · 音频 ${(test.durationMs / 1000).toFixed(1)}s` : ''}
                    </span>
                  </div>
                  <div className="text-sm text-white leading-relaxed">{test.text}</div>
                </div>
              )}

              {test.status === 'error' && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3.5 py-3">
                  <div className="flex items-start gap-2 text-[12px] text-rose-200 leading-relaxed">
                    <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
                    <span className="break-words">{test.message}</span>
                  </div>
                </div>
              )}

              {!readiness.ready && (
                <div className="text-xs text-amber-300/90 inline-flex items-center gap-1.5">
                  <TriangleAlert className="size-3.5" />
                  {readiness.reason}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              当前选择浏览器内置识别，无需凭据。到口语对话页按住麦克风即可测试；若提示 network
              或识别不出内容，说明浏览器厂商的语音服务在当前网络不可达，建议换成豆包识别。
            </p>
          )}
        </div>

        {/* 本机数据 */}
        <div className="p-5 rounded-lg border border-border space-y-4">
          <SectionTitle
            icon={<Lock className="size-3.5" />}
            title="本机数据"
            desc="识别凭据只存在这台设备的浏览器里，不上传、不同步；服务端代理只做一次无状态转发，音频与文本都不留痕。"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                updateDoubaoAsr({ apiKey: '', appId: '', accessToken: '', credentialSource: 'own' })
                setTest({ status: 'idle' })
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <ShieldCheck className="size-3.5" />
              清除识别凭据
            </button>
            <button
              type="button"
              onClick={() => {
                resetAsr()
                setTest({ status: 'idle' })
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              恢复默认
            </button>
          </div>

          <p className="text-[12px] text-muted-foreground flex items-start gap-1.5 leading-relaxed">
            <Info className="size-3.5 shrink-0 mt-0.5" />
            「恢复默认」会把引擎切回豆包、凭据来源切回跟随语音合成，并清空这里单独填写的凭据。
          </p>
        </div>
      </div>
    </div>
  )
}
