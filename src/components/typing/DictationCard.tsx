'use client'

import React from 'react'
import { Volume2 } from 'lucide-react'
import type { DictationCueMode, WordItem } from '@/types'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { WordCardShell } from '@/components/typing/WordCardShell'
import { PracticeProgress } from '@/components/typing/PracticeProgress'
import { TypingLines } from '@/components/typing/TypingLines'
import { WordMeaning } from '@/components/word/WordDisplay'
import { getWordExamples } from '@/lib/wordExamples'
import { audioEngine } from '@/core/audioEngine'
import { InteractiveSentence } from '@/components/sentence/InteractiveSentence'
import { WordLookupModal } from '@/components/dictionary/WordLookupModal'
import { useEnsureAiWordSections } from '@/hooks/useEnsureAiWordSections'

interface DictationCardProps {
  word: WordItem
  currentInput: string
  hasTypo: boolean
  isPeeking: boolean
  cueMode?: DictationCueMode
  phoneticPreference: 'us' | 'uk'
  remainingLoops?: number
  /** 页面数据是否就绪，用于进度占位 */
  isReady?: boolean
}

const DICTATION_AI_SECTIONS = ['core', 'examples'] as const
/**
 * 默写卡片：英文遮蔽，以中文释义与原声发音为线索，直接进行单词拼写盲打。
 */
export function DictationCard({
  word: sourceWord,
  currentInput,
  hasTypo,
  isPeeking,
  phoneticPreference,
  remainingLoops = 1,
  isReady = true,
}: DictationCardProps) {
  const word = useEnsureAiWordSections(sourceWord, DICTATION_AI_SECTIONS)

  const [speakingSentenceIdx, setSpeakingSentenceIdx] = React.useState<number | null>(null)
  const [lookupWordInfo, setLookupWordInfo] = React.useState<{
    word: string
    sentenceEn: string
    sentenceCn?: string
    targetRect?: DOMRect
  } | null>(null)
  const examplesStatus = word.aiSections?.examples
  const examples =
    word.examples?.length
      ? word.examples
      : word.aiSections?.examples
        ? []
        : getWordExamples(word)

  const handlePlaySentence = (sentence: string, idx: number) => {
    setSpeakingSentenceIdx(idx)
    audioEngine.playSentence(sentence, phoneticPreference, () => {
      setSpeakingSentenceIdx((current) => (current === idx ? null : current))
    })
  }

  return (
    <WordCardShell
      word={word}
      phoneticPreference={phoneticPreference}
      remainingLoops={remainingLoops}
      headerLeft={<PracticeProgress isReady={isReady} />}
      className="pt-[38px] xl:pt-[46px] pb-2"
    >
      <div className="flex flex-col h-full min-h-0">
        {/* 线索：中文释义，固定高度以容纳两行释义，避免切换单词时上下跳动 */}
        <div className="pt-5 xl:pt-7 h-36 xl:h-40 shrink-0 flex flex-col items-center justify-center px-6">
          <WordMeaning word={word} className="text-xl xl:text-2xl text-white" />
          <p className="mt-3.5 text-[14px] text-muted-foreground">听发音，拼写出这个单词</p>
        </div>

        <div
          className="relative w-full mt-2 xl:mt-3 cursor-pointer"
          onClick={() => {
            if (typeof document !== 'undefined' && document.activeElement && document.activeElement !== document.body) {
              (document.activeElement as HTMLElement).blur()
            }
          }}
        >
          <TypingLines target={word.name} currentInput={currentInput} hasTypo={hasTypo} />
          <p
            className="pointer-events-none absolute left-0 right-0 -bottom-6 h-5 text-center text-xs text-destructive"
            aria-live="polite"
          >
            {hasTypo ? '字母输入错误，请按退格键 (Backspace) 修正' : ''}
          </p>
        </div>

        {/* 下半区：语境例句填空，适当下移使上下留白比例与学习页更均衡 */}
        {(examples.length > 0 || examplesStatus === 'pending' || examplesStatus === 'error') && (
          <section className="mt-12 xl:mt-16 rounded-2xl bg-card/75 border border-border/60 px-4 py-3.5 xl:px-5 xl:py-4 flex-1 min-h-0 flex flex-col text-left backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 h-7 shrink-0">
              <div className="flex items-baseline gap-2.5">
                <span className="text-xs xl:text-[13px] text-foreground/85 font-medium">例句填空</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">结合上下文推导拼写</span>
              </div>
              <div className="flex items-center gap-3">
                {isPeeking && (
                  <span className="font-serif text-lg text-accent leading-none">{word.name}</span>
                )}
                <button
                  type="button"
                  onPointerDown={() => useWorkspaceStore.getState().peekHint(true)}
                  onPointerUp={() => useWorkspaceStore.getState().peekHint(false)}
                  onPointerLeave={() => useWorkspaceStore.getState().peekHint(false)}
                  className={`h-7 px-2.5 rounded-lg text-xs transition-colors cursor-pointer select-none ${
                    isPeeking
                      ? 'text-accent bg-accent/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  title="按住或按 Tab 键偷看答案"
                >
                  {isPeeking ? '正在偷看' : '按住偷看 (Tab)'}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1 mt-2.5 space-y-1.5 custom-scrollbar">
              {examplesStatus === 'pending' ? (
                <div className="space-y-3 pt-2 animate-pulse" aria-label="AI 例句生成中">
                  {[0, 1].map((item) => (
                    <div key={item} className="rounded-xl bg-muted/40 p-3 space-y-2">
                      <div className="h-4 w-11/12 rounded bg-muted" />
                      <div className="h-3.5 w-2/3 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : examplesStatus === 'error' ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  例句生成失败，下次进入时将重新补全
                </div>
              ) : (
                examples.map((item, idx) => {
                  const isPlaying = speakingSentenceIdx === idx
                  return (
                    <div
                      key={idx}
                      className="group rounded-xl grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-2.5 px-2.5 py-2.5 hover:bg-muted/45 transition-colors"
                    >
                      <span
                        className={`mt-0.5 size-5 rounded-full text-[11px] font-mono tabular-nums flex items-center justify-center shrink-0 transition-colors ${
                          isPlaying
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <InteractiveSentence
                          sentence={item.en}
                          wordName={word.name}
                          sentenceCn={item.cn}
                          isCloze={true}
                          isRevealed={isPeeking}
                          onWordClick={(clickedWord, en, cn, rect) => {
                            setLookupWordInfo({ word: clickedWord, sentenceEn: en, sentenceCn: cn, targetRect: rect })
                          }}
                        />
                        <p className="text-[13.5px] xl:text-sm text-muted-foreground leading-relaxed mt-0.5">
                          {item.cn}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePlaySentence(item.en, idx)
                        }}
                        className={`size-7 rounded-lg transition-colors cursor-pointer flex items-center justify-center shrink-0 ${
                          isPlaying
                            ? 'text-primary bg-primary/12 animate-pulse'
                            : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted'
                        }`}
                        title="朗读例句"
                        aria-label="朗读例句"
                      >
                        <Volume2 className="size-3.5" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        )}
      </div>

      {lookupWordInfo && (
        <WordLookupModal
          isOpen={Boolean(lookupWordInfo)}
          onClose={() => setLookupWordInfo(null)}
          wordQuery={lookupWordInfo.word}
          targetRect={lookupWordInfo.targetRect}
        />
      )}
    </WordCardShell>
  )
}
