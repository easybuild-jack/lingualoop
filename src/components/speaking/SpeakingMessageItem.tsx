'use client'

import React from 'react'
import { Volume2, Snail, Eye, EyeOff } from 'lucide-react'
import { audioEngine } from '@/core/audioEngine'
import { useSpeakingStore, type SpeakingMessage } from '@/store/useSpeakingStore'
import { SpeakingWave } from './SpeakingWave'

/** 句子里的单词可点击发音；去掉标点后再朗读 */
function ClickableSentence({ text, active }: { text: string; active: boolean }) {
  return (
    <span className={`transition-colors duration-300 ${active ? 'text-primary' : ''}`}>
      {text.split(' ').map((w, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' '}
          <span
            onClick={() => audioEngine.playPronunciation(w.replace(/[^A-Za-z'’-]/g, ''), 'us')}
            className="cursor-pointer rounded-sm hover:bg-primary/12 hover:text-primary"
          >
            {w}
          </span>
        </React.Fragment>
      ))}
    </span>
  )
}

export function SpeakingMessageItem({ msg }: { msg: SpeakingMessage }) {
  const subtitle = useSpeakingStore((s) => s.subtitle)
  const correction = useSpeakingStore((s) => s.correction)
  const revealed = useSpeakingStore((s) => s.revealedIds.includes(msg.id))
  const speakingMsgId = useSpeakingStore((s) => s.speakingMsgId)
  const speakingSentence = useSpeakingStore((s) => s.speakingSentence)
  const toggleReveal = useSpeakingStore((s) => s.toggleReveal)
  const replay = useSpeakingStore((s) => s.replay)

  const isAi = msg.role === 'ai'
  const isSpeaking = speakingMsgId === msg.id
  const hidden = isAi && subtitle === 'off' && !revealed

  if (!isAi) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-base leading-relaxed">
          {msg.sentences[0]}
          {subtitle === 'bi' && msg.zh && <div className="mt-1 text-[13px] opacity-75">{msg.zh}</div>}
        </div>
        {msg.correction && correction === 'live' && (
          <div className="max-w-[85%] rounded-lg border border-dashed border-border px-3.5 py-2.5 text-[13px] leading-relaxed">
            <span className="text-destructive line-through">{msg.correction.original}</span>
            <span className="mx-1.5 text-muted-foreground">→</span>
            <span className="text-primary font-medium">{msg.correction.better}</span>
            <div className="mt-0.5 text-muted-foreground">{msg.correction.reason}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <img src="/logo222.png" alt="" className="size-8 mt-0.5 object-contain shrink-0 -scale-x-100" />
      <div className="max-w-[85%] min-w-0">
        <div
          className={`px-4 py-2.5 rounded-2xl rounded-tl-md border transition-colors ${
            isSpeaking ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-muted/60'
          }`}
        >
          {hidden ? (
            <button
              type="button"
              onClick={() => toggleReveal(msg.id)}
              className="flex items-center gap-2.5 py-1 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <SpeakingWave active={isSpeaking} bars={10} className="h-4" />
              <span className="text-[13px]">点击显示本句</span>
            </button>
          ) : (
            <>
              <p className="font-serif text-[17px] leading-relaxed text-foreground">
                {msg.sentences.map((s, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && ' '}
                    <ClickableSentence text={s} active={isSpeaking && speakingSentence === i} />
                  </React.Fragment>
                ))}
              </p>
              {subtitle === 'bi' && msg.zh && <p className="mt-1 text-[13px] text-muted-foreground">{msg.zh}</p>}
              {subtitle === 'bi' && !msg.zh && msg.zhPending && (
                <p className="mt-1 text-[13px] text-muted-foreground/60">翻译中…</p>
              )}
            </>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-[13px] text-muted-foreground">
          <button type="button" onClick={() => replay(msg.id)} className="inline-flex items-center gap-1.5 hover:text-foreground cursor-pointer">
            <Volume2 className="size-4" />
            重播
          </button>
          <button type="button" onClick={() => replay(msg.id, true)} className="inline-flex items-center gap-1.5 hover:text-foreground cursor-pointer">
            <Snail className="size-4" />
            慢速
          </button>
          {subtitle === 'off' && revealed && (
            <button type="button" onClick={() => toggleReveal(msg.id)} className="inline-flex items-center gap-1.5 hover:text-foreground cursor-pointer">
              <EyeOff className="size-4" />
              隐藏
            </button>
          )}
          {subtitle !== 'off' && msg.vocab?.length ? (
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-4" />
              {msg.vocab.map((v) => (
                <span key={v.word} className="px-1.5 py-px rounded bg-muted text-foreground">
                  {v.word} <span className="text-muted-foreground">{v.meaning}</span>
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
