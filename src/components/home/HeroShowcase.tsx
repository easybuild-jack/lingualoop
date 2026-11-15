'use client'

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ear, Mic, BookText, PenLine, Languages, Volume2 } from 'lucide-react'
import { audioEngine } from '@/core/audioEngine'

const SCENES = [
  { id: 'listen', key: '听', label: 'Listening', icon: Ear },
  { id: 'speak', key: '说', label: 'Speaking', icon: Mic },
  { id: 'read', key: '读', label: 'Reading', icon: BookText },
  { id: 'write', key: '写', label: 'Writing', icon: PenLine },
  { id: 'translate', key: '译', label: 'Translating', icon: Languages },
] as const

type SceneId = (typeof SCENES)[number]['id']

const SCENE_MS = 5600

const speak = (text: string) => audioEngine.playPronunciation(text, 'us')

/** 每隔 stepMs 自增一次，到 max 停住；用于场景内的逐步演示 */
function useStepper(max: number, stepMs: number) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= max) return
    const t = setTimeout(() => setStep((s) => s + 1), stepMs)
    return () => clearTimeout(t)
  }, [step, max, stepMs])
  return step
}

export function ListenScene() {
  const words = ['Could', 'you', 'recommend', 'a', 'good', 'place', 'for', 'brunch?']
  const step = useStepper(words.length, 420)
  return (
    <div className="space-y-6" onClick={() => speak(words.join(' '))}>
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 rounded bg-primary/12 text-primary font-mono">听力广场 · 场景对话</span>
        <span className="font-mono text-muted-foreground">0.75x · <span className="text-primary">1.0x</span> · 1.25x</span>
      </div>
      <div className="h-16 flex items-center justify-center gap-[3px]">
        {Array.from({ length: 42 }).map((_, i) => (
          <span
            key={i}
            style={{ animationDelay: `${(i % 7) * 0.12}s`, height: `${30 + ((i * 37) % 70)}%` }}
            className="w-1 rounded-full bg-primary/70 origin-center animate-[home-wave_1.1s_ease-in-out_infinite]"
          />
        ))}
      </div>
      <div className="text-center space-y-2">
        <p className="font-serif text-2xl leading-snug">
          {words.map((w, i) => (
            <span key={i} className={`transition-colors duration-200 ${i < step ? 'text-foreground' : 'text-muted-foreground/30'}`}>
              {w}{' '}
            </span>
          ))}
        </p>
        <p className="text-sm text-muted-foreground">你能推荐一个吃早午餐的好地方吗？</p>
      </div>
    </div>
  )
}

function SpeakScene() {
  const step = useStepper(3, 900)
  const bubbles = [
    { from: 'ai', text: 'Hey! How was your weekend?' },
    { from: 'me', text: 'It was great! I went hiking with my friends.' },
    { from: 'ai', text: 'Sounds fun! Where did you go hiking?' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 rounded bg-primary/12 text-primary font-mono">AI 口语陪练 · 日常闲聊</span>
        <span className="font-mono text-muted-foreground">实时纠音</span>
      </div>
      <div className="space-y-2.5 min-h-[168px]">
        {bubbles.slice(0, step + 1).map((b, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-end gap-2 ${b.from === 'me' ? 'justify-end' : ''}`}
          >
            {b.from === 'ai' && <img src="/logo222.png" alt="" className="size-7 object-contain shrink-0" />}
            <div
              className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm ${
                b.from === 'me'
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted text-foreground rounded-bl-md'
              }`}
            >
              {b.text}
              {b.from === 'me' && (
                <div className="mt-1 text-[12px] opacity-80 font-mono">发音 92 · 流利 88 · 语法 ✓</div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="flex justify-center pt-1">
        <span className="relative size-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <Mic className="relative size-5" />
        </span>
      </div>
    </div>
  )
}

function ReadScene() {
  const lines = [
    { words: [['Small', 'smɔːl'], ['habits', 'ˈhæbɪts'], ['always', 'ˈɔːlweɪz'], ['outweigh', 'ˌaʊtˈweɪ']], zh: '微小的习惯总是胜过' },
    { words: [['occasional', 'əˈkeɪʒənl'], ['effort.', 'ˈefərt']], zh: '偶尔的心血来潮。' },
  ]
  return (
    <div className="space-y-5">
      <div className="text-xs">
        <span className="px-2 py-0.5 rounded bg-primary/12 text-primary font-mono">文章阅读 · 音标 + 译文对照</span>
      </div>
      {lines.map((l, li) => (
        <div key={li} className="space-y-1">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {l.words.map(([w, ipa]) => (
              <span key={w} onClick={() => speak(w)} className="inline-flex flex-col items-center cursor-pointer group">
                <span className="text-xs text-muted-foreground group-hover:text-primary">{ipa}</span>
                <span className="font-serif text-2xl text-foreground group-hover:text-primary">{w}</span>
              </span>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{l.zh}</p>
        </div>
      ))}
    </div>
  )
}

function WriteScene() {
  const syllables = ['il', 'lu', 'mi', 'nate']
  const word = syllables.join('')
  const typed = useStepper(word.length, 130)
  const done = typed >= word.length
  let cursor = 0
  return (
    <div className="space-y-5" onClick={() => speak(word)}>
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 rounded bg-primary/12 text-primary font-mono">单词默写 · 听音盲打</span>
        <span className="font-mono text-muted-foreground">三连对 <span className="text-primary">●●</span>○</span>
      </div>
      <div className="text-center font-serif text-5xl tracking-tight">
        {syllables.map((syl, si) => (
          <React.Fragment key={si}>
            {si > 0 && <span className={`mx-1 text-primary/70 transition-opacity ${done ? 'opacity-100' : 'opacity-0'}`}>·</span>}
            {syl.split('').map((ch) => {
              const pos = cursor++
              return (
                <span key={pos} className={pos < typed ? (done && si === 1 ? 'text-primary' : 'text-foreground') : 'text-muted-foreground/25'}>
                  {ch}
                </span>
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <div className={`grid grid-cols-3 gap-2 transition-all duration-500 ${done ? 'opacity-100' : 'opacity-0 translate-y-2'}`}>
        {[
          ['il-', '进入', false],
          ['lumin', '光', true],
          ['-ate', '使…', false],
        ].map(([part, mean, root]) => (
          <div
            key={part as string}
            className={`py-2 rounded-lg border text-center ${root ? 'border-primary/50 bg-primary/12' : 'border-border bg-muted/60'}`}
          >
            <div className={`font-mono text-sm font-semibold ${root ? 'text-primary' : 'text-foreground'}`}>{part}</div>
            <div className="text-[12px] text-muted-foreground">{mean}</div>
          </div>
        ))}
      </div>
      <p className={`text-center text-xs text-muted-foreground transition-opacity ${done ? 'opacity-100' : 'opacity-0'}`}>
        /ɪˈluːmɪneɪt/ v. 照亮；阐明 —— 把光投射进去
      </p>
    </div>
  )
}

function TranslateScene() {
  const words = ['Yesterday', 'I', 'wrapped', 'up', 'the', 'project', 'ahead', 'of', 'schedule.']
  const step = useStepper(words.length, 380)
  return (
    <div className="space-y-6">
      <div className="text-xs">
        <span className="px-2 py-0.5 rounded bg-primary/12 text-primary font-mono">句子翻译 · 连词成句</span>
      </div>
      <p className="text-center text-lg text-foreground font-medium">昨天我提前完成了这个项目。</p>
      <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-3">
        {words.map((w, i) => (
          <span
            key={i}
            className={`pb-0.5 border-b-2 font-serif text-xl transition-colors ${
              i < step ? 'border-primary/60 text-foreground' : i === step ? 'border-primary text-primary' : 'border-border text-transparent'
            }`}
          >
            {w}
          </span>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        语法提示：<span className="text-primary">一般过去时</span> · 短语 <span className="font-mono text-primary">wrap up</span> = 完成收尾
      </p>
    </div>
  )
}

const SCENE_VIEW: Record<SceneId, () => React.ReactElement> = {
  listen: ListenScene,
  speak: SpeakScene,
  read: ReadScene,
  write: WriteScene,
  translate: TranslateScene,
}

/** 首屏右侧演示窗：听说读写译五个场景自动轮播，悬停暂停 */
export function HeroShowcase() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setActive((a) => (a + 1) % SCENES.length), SCENE_MS)
    return () => clearTimeout(t)
  }, [active, paused])

  const scene = SCENES[active]
  const View = SCENE_VIEW[scene.id]

  return (
    <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative rounded-2xl border border-border bg-sidebar/90 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#FF5F57]/80" />
            <span className="size-2.5 rounded-full bg-[#FEBC2E]/80" />
            <span className="size-2.5 rounded-full bg-[#28C840]/80" />
          </div>
          <span className="text-[12px] font-mono text-muted-foreground tracking-wider">LINGUALOOP · {scene.label.toUpperCase()}</span>
          <Volume2 className="size-3.5 text-primary" />
        </div>

        {/* 五项技能切换 */}
        <div className="grid grid-cols-5 border-b border-border">
          {SCENES.map((s, i) => {
            const Icon = s.icon
            const isActive = i === active
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(i)}
                className={`relative py-2.5 flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-4" />
                <span className="text-xs font-medium">{s.key}</span>
                {isActive && (
                  <motion.span
                    key={`bar-${active}-${paused}`}
                    className="absolute bottom-0 left-0 h-0.5 bg-primary"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: paused ? 0 : SCENE_MS / 1000, ease: 'linear' }}
                  />
                )}
              </button>
            )
          })}
        </div>

        <div className="p-6 sm:p-7 min-h-[300px] cursor-pointer">
          <AnimatePresence mode="wait">
            <motion.div
              key={scene.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3 }}
            >
              <View />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
