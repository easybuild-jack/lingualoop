'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, GraduationCap, BookText, Languages, Radio, Volume2, Check } from 'lucide-react'
import { audioEngine } from '@/core/audioEngine'
import { ListenScene } from './HeroShowcase'

type PreviewStage = 'word' | 'reading' | 'translate' | 'radio'

const TABS = [
  { id: 'word' as const, label: '单词拆解', icon: GraduationCap, href: '/learn' },
  { id: 'reading' as const, label: '双语阅读', icon: BookText, href: '/reading' },
  { id: 'translate' as const, label: '连词成句', icon: Languages, href: '/translate' },
  { id: 'radio' as const, label: '听力广场', icon: Radio, href: '/radio' },
]

const DEMO_WORDS = [
  {
    word: 'perspective',
    syllables: ['per', 'spec', 'tive'],
    ipa: '/pərˈspektɪv/',
    pos: 'n.',
    meaning: '视角，观点；远景；透视法',
    morphemes: [
      { part: 'per-', mean: '贯穿、全部', role: 'prefix' },
      { part: 'spect', mean: '看 (look)', role: 'root' },
      { part: '-ive', mean: '名词后缀', role: 'suffix' },
    ],
    derivation: '看穿全部事物 → 洞察、视角',
  },
  {
    word: 'resilient',
    syllables: ['re', 'sil', 'ient'],
    ipa: '/rɪˈzɪliənt/',
    pos: 'adj.',
    meaning: '有韧性的；能迅速恢复的',
    morphemes: [
      { part: 're-', mean: '向后、往回', role: 'prefix' },
      { part: 'sil', mean: '跳 (jump)', role: 'root' },
      { part: '-ient', mean: '形容词后缀', role: 'suffix' },
    ],
    derivation: '受压后能立刻弹跳回来 → 有韧性的',
  },
  {
    word: 'illuminate',
    syllables: ['il', 'lu', 'mi', 'nate'],
    ipa: '/ɪˈluːmɪneɪt/',
    pos: 'v.',
    meaning: '照亮，照明；阐明，启发',
    morphemes: [
      { part: 'il-', mean: '进入、使…', role: 'prefix' },
      { part: 'lumin', mean: '光 (light)', role: 'root' },
      { part: '-ate', mean: '动词后缀', role: 'suffix' },
    ],
    derivation: '把光芒投射进去 → 照亮、阐明',
  },
]

const READING = [
  {
    words: [
      ['The', 'ðə', ''],
      ['morning', 'ˈmɔːrnɪŋ', ''],
      ['hours', 'ˈaʊərz', ''],
      ['offer', 'ˈɔːfər', ''],
      ['a', 'ə', ''],
      ['rare', 'rer', ''],
      ['silence', 'ˈsaɪləns', '.'],
    ],
    zh: '清晨的时光提供了一份难得的静谧。',
  },
  {
    words: [
      ['Small', 'smɔːl', ''],
      ['habits', 'ˈhæbɪts', ''],
      ['always', 'ˈɔːlweɪz', ''],
      ['outweigh', 'ˌaʊtˈweɪ', ''],
      ['occasional', 'əˈkeɪʒənl', ''],
      ['effort', 'ˈefərt', '.'],
    ],
    zh: '微小的习惯总是胜过偶尔的心血来潮。',
  },
]

const speak = (text: string) => audioEngine.playPronunciation(text, 'us')

/** 首页里的仿真应用窗口，四个画面都可交互 */
export function ProductPreview() {
  const [stage, setStage] = useState<PreviewStage>('word')
  const [wordIdx, setWordIdx] = useState(0)
  const [showIpa, setShowIpa] = useState(true)
  const [showZh, setShowZh] = useState(true)

  const activeWord = DEMO_WORDS[wordIdx]
  const activeTab = TABS.find((t) => t.id === stage)!

  return (
    <div className="rounded-2xl border border-border bg-sidebar shadow-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-background/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#FF5F57]/80" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E]/80" />
          <span className="size-2.5 rounded-full bg-[#28C840]/80" />
          <span className="ml-2 text-xs font-mono text-muted-foreground hidden sm:inline">
            LinguaLoop Interactive Preview
          </span>
        </div>

        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted border border-border overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = stage === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStage(tab.id)}
                className={`h-7 px-3 rounded-md text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
                  active ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        <Link href={activeTab.href} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <span>打开真实页面</span>
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="p-6 sm:p-10 bg-background min-h-[440px] flex flex-col justify-center">
        {stage === 'word' && (
          <div className="max-w-2xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {DEMO_WORDS.map((w, idx) => (
                  <button
                    key={w.word}
                    type="button"
                    onClick={() => {
                      setWordIdx(idx)
                      speak(w.word)
                    }}
                    className={`h-7 px-3 rounded-md text-xs font-mono cursor-pointer transition-colors ${
                      wordIdx === idx
                        ? 'bg-primary/15 text-primary border border-primary/40 font-medium'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {w.word}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => speak(activeWord.word)}
                className="h-8 px-3 rounded-md bg-primary/12 text-primary text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Volume2 className="size-3.5" />
                <span>朗读</span>
              </button>
            </div>

            <div
              onClick={() => speak(activeWord.word)}
              className="rounded-xl border border-border bg-card p-6 sm:p-8 text-center space-y-4 cursor-pointer"
            >
              <div className="inline-flex items-center gap-1.5 font-serif text-4xl sm:text-5xl tracking-tight">
                {activeWord.syllables.map((syl, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-muted-foreground/35">·</span>}
                    <span className={i === 1 ? 'text-primary' : 'text-foreground'}>{syl}</span>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-mono text-muted-foreground">
                <span>US {activeWord.ipa}</span>
                <span>·</span>
                <span>
                  <strong className="text-accent mr-1">{activeWord.pos}</strong>
                  <span className="font-sans text-foreground">{activeWord.meaning}</span>
                </span>
              </div>

              <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
                {activeWord.morphemes.map((m, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      m.role === 'root' ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-foreground">{m.part}</span>
                      <span className="text-[12px] font-mono text-muted-foreground uppercase">{m.role}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{m.mean}</div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-muted-foreground pt-1">
                语义推导：<span className="text-primary font-medium">{activeWord.derivation}</span>
              </div>
            </div>
          </div>
        )}

        {stage === 'reading' && (
          <div className="max-w-2xl mx-auto w-full space-y-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
              <div>
                <div className="text-xs font-mono text-primary uppercase">Reading Passage</div>
                <h3 className="font-serif text-xl text-foreground">The Quiet Power of Morning Reading</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {[
                  { label: '音标', on: showIpa, toggle: () => setShowIpa((v) => !v) },
                  { label: '译文', on: showZh, toggle: () => setShowZh((v) => !v) },
                ].map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={t.toggle}
                    className={`h-7 px-2.5 rounded-md text-xs border cursor-pointer ${
                      t.on ? 'border-primary/45 bg-primary/12 text-primary font-medium' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {t.label} {t.on ? 'ON' : 'OFF'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-5">
              {READING.map((sent, si) => (
                <div key={si} className="space-y-1.5">
                  <div className="inline-flex flex-wrap items-end gap-x-2.5 gap-y-2">
                    {sent.words.map(([w, ipa, p], wi) => (
                      <span
                        key={wi}
                        onClick={() => speak(w)}
                        className="inline-flex flex-col items-center cursor-pointer group/w"
                      >
                        {showIpa && (
                          <span className="text-[15px] text-muted-foreground/90 group-hover/w:text-primary mb-0.5">{ipa}</span>
                        )}
                        <span className="font-serif text-[22px] text-foreground group-hover/w:text-primary leading-tight">
                          {w}
                          {p && <span className="text-muted-foreground">{p}</span>}
                        </span>
                      </span>
                    ))}
                  </div>
                  {showZh && <p className="text-[14px] text-muted-foreground">{sent.zh}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === 'translate' && (
          <div className="max-w-2xl mx-auto w-full">
            <div className="p-6 rounded-xl border border-border bg-card space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/12 text-primary">句子翻译 · 职场商务</span>
                <span className="text-xs font-mono text-muted-foreground">03 / 20</span>
              </div>

              <div className="text-center space-y-2">
                <p className="text-lg font-medium text-foreground">昨天我完成了认证模块的重构。</p>
                <p className="text-xs text-muted-foreground">
                  核心词提示：<span className="font-mono text-primary">wrap up</span>（完成收尾） ·{' '}
                  <span className="font-mono text-primary">authentication</span>（认证）
                </p>
              </div>

              <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-4 py-3">
                {['Yesterday', 'I', 'wrapped', 'up', 'the', 'authentication', 'refactoring'].map((word, idx) => {
                  const done = idx < 5
                  const active = idx === 5
                  return (
                    <span
                      key={idx}
                      onClick={() => speak(word)}
                      className={`pb-1 border-b-2 font-serif text-xl cursor-pointer ${
                        done
                          ? 'border-primary/60 text-foreground'
                          : active
                            ? 'border-primary text-primary'
                            : 'border-border text-muted-foreground/40'
                      }`}
                    >
                      {done ? word : active ? 'authen|' : 'refactoring'}
                    </span>
                  )
                })}
                <span className="font-serif text-xl text-muted-foreground">.</span>
              </div>

              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Check className="size-3.5 text-primary" /> 语法成分拆解
                </span>
                <span className="inline-flex items-center gap-1">
                  <Check className="size-3.5 text-primary" /> 逐词校验与整句跟读
                </span>
              </div>
            </div>
          </div>
        )}

        {stage === 'radio' && (
          <div className="max-w-2xl mx-auto w-full cursor-pointer">
            <ListenScene />
          </div>
        )}
      </div>
    </div>
  )
}
