'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Keyboard, Pause, Send, Square } from 'lucide-react'
import { useSpeakingStore, PHASE_LABEL, type SpeakingSubtitleMode } from '@/store/useSpeakingStore'
import { SpeakingMessageItem } from './SpeakingMessageItem'
import { SpeakingMicButton } from './SpeakingMicButton'
import { SpeakingWave } from './SpeakingWave'

const SUBTITLE_OPTIONS: { id: SpeakingSubtitleMode; label: string }[] = [
  { id: 'en', label: '英文' },
  { id: 'bi', label: '双语' },
  { id: 'off', label: '关闭' },
]
const SPEEDS = [0.8, 1, 1.2]

export function SpeakingChat() {
  const messages = useSpeakingStore((s) => s.messages)
  const phase = useSpeakingStore((s) => s.phase)
  const talkMode = useSpeakingStore((s) => s.talkMode)
  const conversationActive = useSpeakingStore((s) => s.conversationActive)
  const hasSpoken = useSpeakingStore((s) => s.hasSpoken)
  const silenceProgress = useSpeakingStore((s) => s.silenceProgress)
  const subtitle = useSpeakingStore((s) => s.subtitle)
  const speed = useSpeakingStore((s) => s.speed)
  const notice = useSpeakingStore((s) => s.notice)
  const interim = useSpeakingStore((s) => s.interim)
  const setSubtitle = useSpeakingStore((s) => s.setSubtitle)
  const setSpeed = useSpeakingStore((s) => s.setSpeed)
  const setTalkMode = useSpeakingStore((s) => s.setTalkMode)
  const stopAutoConversation = useSpeakingStore((s) => s.stopAutoConversation)
  const sendText = useSpeakingStore((s) => s.sendText)
  const endSession = useSpeakingStore((s) => s.endSession)

  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, phase])

  const submit = () => {
    sendText(draft)
    setDraft('')
  }

  const waiting = phase === 'recognizing' || phase === 'thinking'
  const isAuto = talkMode === 'auto'

  const statusText = (() => {
    if (!isAuto) return phase === 'idle' ? '按住麦克风说话' : PHASE_LABEL[phase]
    if (phase === 'listening') {
      if (silenceProgress > 0.05) return '停顿中，即将发送…'
      if (hasSpoken) return '正在聆听，说完停顿自动发送'
      return '正在聆听，请直接开口说话'
    }
    if (phase === 'speaking' && conversationActive) {
      return 'AI 正在回复，说完后自动收音（点麦克风可插话）'
    }
    if (phase === 'idle' && !conversationActive) return '点击麦克风开始自然对话'
    return PHASE_LABEL[phase]
  })()

  return (
    <>
      <div className="shrink-0 h-12 px-3.5 border-b border-border flex items-center gap-2.5 text-sm">
        <span className="text-muted-foreground leading-none">字幕</span>
        <div className="flex items-center p-0.5 rounded-md bg-muted">
          {SUBTITLE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSubtitle(o.id)}
              className={`h-8 px-3.5 rounded text-sm leading-none cursor-pointer transition-colors ${
                subtitle === o.id ? 'bg-sidebar text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          title="切换语速"
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          className="ml-auto h-8 px-2.5 rounded font-mono text-sm leading-none text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
        >
          {speed.toFixed(1)}x
        </button>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3.5 py-4 space-y-4">
        {messages.map((m) => (
          <SpeakingMessageItem key={m.id} msg={m} />
        ))}
        {waiting && (
          <div className={`flex ${phase === 'recognizing' ? 'justify-end' : 'items-center gap-2'}`}>
            {phase === 'thinking' && <img src="/logo222.png" alt="" className="size-8 object-contain -scale-x-100" />}
            <div className="px-4 py-2.5 rounded-2xl bg-muted/60 border border-border flex items-center gap-1">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  style={{ animationDelay: `${d * 0.15}s` }}
                  className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {typing && (
        <div className="shrink-0 px-3.5 pt-3 flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
              if (e.key === 'Escape') setTyping(false)
            }}
            onBlur={() => !draft && setTyping(false)}
            placeholder="输入你想说的话，回车发送"
            className="flex-1 h-10 px-3 rounded-lg bg-muted border border-transparent focus:border-primary/50 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || waiting}
            className="size-10 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 cursor-pointer"
          >
            <Send className="size-[18px]" />
          </button>
        </div>
      )}

      <div className="shrink-0 px-3.5 pt-3 pb-3.5 border-t border-border mt-3">
        <div className="h-7 flex items-center justify-center">
          {notice ? (
            <span className="text-sm text-destructive truncate max-w-full">{notice}</span>
          ) : phase === 'listening' ? (
            <div className="flex items-center gap-2 max-w-full min-w-0">
              <SpeakingWave active bars={14} className="h-4 shrink-0" />
              <span className="text-sm text-foreground truncate">{interim || statusText}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground truncate max-w-full">{statusText}</span>
          )}
        </div>
        {/* 三列等宽留白，麦克风才会真正落在窗口中线上；左右按钮各贴本侧 */}
        <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="justify-self-start flex items-center gap-1.5">
            <button
              type="button"
              title="文字输入"
              onClick={() => setTyping((v) => !v)}
              className={`size-9 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                typing ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Keyboard className="size-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setTalkMode(isAuto ? 'hold' : 'auto')}
              title={isAuto ? '当前：自然连续对话（点击切为按住说话）' : '当前：按住说话（点击切为自然连续对话）'}
              className="h-8 px-2.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer whitespace-nowrap"
            >
              {isAuto ? '连续对话' : '按住说话'}
            </button>
          </div>
          <SpeakingMicButton />
          <div className="justify-self-end flex items-center gap-1">
            {isAuto && conversationActive && (
              <button
                type="button"
                title="暂停自动收音"
                onClick={stopAutoConversation}
                className="h-9 px-2.5 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Pause className="size-3.5" />
                暂停
              </button>
            )}
            <button
              type="button"
              title="结束对话"
              onClick={endSession}
              className="h-9 px-3 rounded-full text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Square className="size-3.5 fill-current" />
              结束
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
