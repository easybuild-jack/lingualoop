'use client'

import React from 'react'
import { Mic, Loader2 } from 'lucide-react'
import { useSpeakingStore } from '@/store/useSpeakingStore'

/** 按住说话：按下开始聆听，松开（或移出、取消）发送；朗读中按下会打断朗读 */
export function SpeakingMicButton({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const phase = useSpeakingStore((s) => s.phase)
  const pressMic = useSpeakingStore((s) => s.pressMic)
  const releaseMic = useSpeakingStore((s) => s.releaseMic)

  const listening = phase === 'listening'
  const waiting = phase === 'recognizing' || phase === 'thinking'
  const dim = size === 'lg' ? 'size-14' : 'size-11'

  return (
    <button
      type="button"
      data-no-drag
      disabled={waiting}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        pressMic()
      }}
      onPointerUp={releaseMic}
      onPointerCancel={releaseMic}
      onContextMenu={(e) => e.preventDefault()}
      title="按住说话"
      className={`relative ${dim} shrink-0 rounded-full flex items-center justify-center touch-none select-none transition-all duration-200 cursor-pointer disabled:cursor-wait ${
        listening
          ? 'bg-primary text-primary-foreground scale-110'
          : waiting
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30'
      }`}
    >
      {listening && <span className="absolute -inset-1.5 rounded-full border-2 border-primary/40 animate-pulse" />}
      {waiting ? (
        <Loader2 className={`${size === 'lg' ? 'size-6' : 'size-5'} animate-spin`} />
      ) : (
        <Mic className={size === 'lg' ? 'size-6' : 'size-5'} />
      )}
    </button>
  )
}
