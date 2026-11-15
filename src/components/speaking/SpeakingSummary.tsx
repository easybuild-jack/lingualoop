'use client'

import React from 'react'
import { Check, RotateCcw, LayoutGrid, BookmarkPlus } from 'lucide-react'
import { useSpeakingStore } from '@/store/useSpeakingStore'
import { formatDuration } from './SessionTimer'

export function SpeakingSummary() {
  const messages = useSpeakingStore((s) => s.messages)
  const startedAt = useSpeakingStore((s) => s.startedAt)
  const endedAt = useSpeakingStore((s) => s.endedAt)
  const savedVocab = useSpeakingStore((s) => s.savedVocab)
  const saveVocab = useSpeakingStore((s) => s.saveVocab)
  const startSession = useSpeakingStore((s) => s.startSession)
  const backToSetup = useSpeakingStore((s) => s.backToSetup)

  const userMsgs = messages.filter((m) => m.role === 'user')
  const corrections = userMsgs.flatMap((m) => (m.correction ? [m.correction] : []))
  const vocab = Array.from(
    new Map(messages.flatMap((m) => m.vocab ?? []).map((v) => [v.word, v])).values()
  )
  const allSaved = vocab.length > 0 && vocab.every((v) => savedVocab.includes(v.word))

  const stats = [
    { label: '练习时长', value: formatDuration(startedAt && endedAt ? endedAt - startedAt : 0) },
    { label: '开口次数', value: userMsgs.length },
    { label: '表达纠正', value: corrections.length },
  ]

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">
        <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border">
          {stats.map((s) => (
            <div key={s.label} className="py-3 text-center">
              <div className="font-serif text-2xl font-semibold text-foreground tabular-nums">{s.value}</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <section className="space-y-2">
          <div className="text-[13px] font-medium text-foreground">可以说得更地道</div>
          {corrections.length === 0 ? (
            <div className="text-[13px] text-muted-foreground">本次没有需要纠正的表达，继续保持。</div>
          ) : (
            <ol className="space-y-2">
              {corrections.map((c, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                  <span className="font-mono text-muted-foreground pt-px">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <span className="text-destructive line-through">{c.original}</span>
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    <span className="text-primary font-medium">{c.better}</span>
                    <div className="text-muted-foreground">{c.reason}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {vocab.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center">
              <span className="text-[13px] font-medium text-foreground">对话中的新词</span>
              <button
                type="button"
                disabled={allSaved}
                onClick={() => saveVocab(vocab.map((v) => v.word))}
                className="ml-auto inline-flex items-center gap-1 text-[13px] text-primary hover:underline disabled:text-muted-foreground disabled:no-underline cursor-pointer disabled:cursor-default"
              >
                {allSaved ? <Check className="size-3.5" /> : <BookmarkPlus className="size-3.5" />}
                {allSaved ? '已加入生词本' : '全部加入生词本'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {vocab.map((v) => {
                const saved = savedVocab.includes(v.word)
                return (
                  <button
                    key={v.word}
                    type="button"
                    onClick={() => saveVocab([v.word])}
                    className={`h-7 px-2.5 rounded-full border text-[13px] inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      saved ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/40'
                    }`}
                  >
                    {saved && <Check className="size-3" />}
                    <span className="font-medium">{v.word}</span>
                    <span className="text-muted-foreground">{v.meaning}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>

      <div className="shrink-0 p-4 border-t border-border grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={backToSetup}
          className="h-10 rounded-lg border border-border text-sm text-foreground hover:bg-muted inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <LayoutGrid className="size-4" />
          换个场景
        </button>
        <button
          type="button"
          onClick={startSession}
          className="h-10 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <RotateCcw className="size-4" />
          再练一次
        </button>
      </div>
    </>
  )
}
