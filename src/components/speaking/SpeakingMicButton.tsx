'use client'

import React from 'react'
import { Mic, Loader2, Send } from 'lucide-react'
import { useSpeakingStore } from '@/store/useSpeakingStore'

/**
 * 语音交互主按钮：
 * - auto（自然连续对话）：点击开始对话，AI 说完自动收音，说完停顿自动发送；收音中已开口时点击可立即发送；AI 说话时点击可插话。
 * - hold（按住说话）：按下开始聆听，松开发送。
 */
export function SpeakingMicButton({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const phase = useSpeakingStore((s) => s.phase)
  const talkMode = useSpeakingStore((s) => s.talkMode)
  const conversationActive = useSpeakingStore((s) => s.conversationActive)
  const micLevel = useSpeakingStore((s) => s.micLevel)
  const silenceProgress = useSpeakingStore((s) => s.silenceProgress)
  const hasSpoken = useSpeakingStore((s) => s.hasSpoken)
  const pressMic = useSpeakingStore((s) => s.pressMic)
  const releaseMic = useSpeakingStore((s) => s.releaseMic)
  const toggleAutoMic = useSpeakingStore((s) => s.toggleAutoMic)

  const listening = phase === 'listening'
  const waiting = phase === 'recognizing' || phase === 'thinking'
  const dim = size === 'lg' ? 'size-14' : 'size-11'
  const iconDim = size === 'lg' ? 'size-6' : 'size-5'
  const isAuto = talkMode === 'auto'

  const title = !isAuto
    ? '按住说话'
    : listening
      ? hasSpoken
        ? '点击立即发送'
        : '点击暂停对话'
      : phase === 'speaking'
        ? '点击打断 AI 并说话'
        : conversationActive
          ? '连续对话进行中'
          : '点击开始对话'

  // SVG 倒计时弧线参数（viewBox 0 0 64 64, r=29）
  const r = 29
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, silenceProgress)))

  return (
    <button
      type="button"
      data-no-drag
      disabled={waiting}
      onClick={isAuto ? toggleAutoMic : undefined}
      onPointerDown={
        isAuto
          ? undefined
          : (e) => {
              e.preventDefault()
              e.currentTarget.setPointerCapture(e.pointerId)
              pressMic()
            }
      }
      onPointerUp={isAuto ? undefined : releaseMic}
      onPointerCancel={isAuto ? undefined : releaseMic}
      onContextMenu={(e) => e.preventDefault()}
      title={title}
      className={`relative ${dim} shrink-0 rounded-full flex items-center justify-center touch-none select-none transition-all duration-200 cursor-pointer disabled:cursor-wait ${
        listening
          ? 'bg-primary text-primary-foreground scale-105'
          : waiting
            ? 'bg-muted text-muted-foreground'
            : conversationActive && isAuto
              ? 'bg-primary/25 text-primary border-2 border-primary/50 hover:bg-primary/35'
              : 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30'
      }`}
    >
      {/* 实时音量呼吸光晕 */}
      {listening && (
        <span
          aria-hidden
          style={{
            transform: `scale(${(1.06 + micLevel * 0.34).toFixed(2)})`,
            opacity: 0.25 + micLevel * 0.45,
          }}
          className="pointer-events-none absolute inset-0 rounded-full bg-primary transition-transform duration-75"
        />
      )}

      {/* 停顿发送倒计时进度弧 */}
      {isAuto && listening && silenceProgress > 0.04 && (
        <svg
          viewBox="0 0 64 64"
          className="pointer-events-none absolute -inset-1.5 size-[calc(100%+12px)] -rotate-90"
          aria-hidden
        >
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="text-primary opacity-85 transition-[stroke-dashoffset] duration-75"
          />
        </svg>
      )}

      {waiting ? (
        <Loader2 className={`${iconDim} animate-spin relative z-10`} />
      ) : isAuto && listening && hasSpoken ? (
        <Send className={`${size === 'lg' ? 'size-5' : 'size-4'} relative z-10`} />
      ) : (
        <Mic className={`${iconDim} relative z-10`} />
      )}
    </button>
  )
}
