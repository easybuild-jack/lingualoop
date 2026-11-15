'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Keyboard, Send, Square } from 'lucide-react'
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
  const subtitle = useSpeakingStore((s) => s.subtitle)
  const speed = useSpeakingStore((s) => s.speed)
  const notice = useSpeakingStore((s) => s.notice)
  const interim = useSpeakingStore((s) => s.interim)
  const setSubtitle = useSpeakingStore((s) => s.setSubtitle)
  const setSpeed = useSpeakingStore((s) => s.setSpeed)
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
            <span className="text-sm text-destructive">{notice}</span>
          ) : phase === 'listening' ? (
            <div className="flex items-center gap-2 max-w-full min-w-0">
              <SpeakingWave active bars={14} className="h-4 shrink-0" />
              {interim && <span className="text-sm text-foreground truncate">{interim}</span>}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{PHASE_LABEL[phase]}</span>
          )}
        </div>
        {/* 三列等宽留白，麦克风才会真正落在窗口中线上；左右按钮各贴本侧 */}
        <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button
            type="button"
            title="文字输入"
            onClick={() => setTyping((v) => !v)}
            className={`justify-self-start size-10 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
              typing ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Keyboard className="size-[18px]" />
          </button>
          <SpeakingMicButton />
          <button
            type="button"
            title="结束对话"
            onClick={endSession}
            className="justify-self-end h-10 px-3.5 rounded-full text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Square className="size-3.5 fill-current" />
            结束
          </button>
        </div>
      </div>
    </>
  )
}
