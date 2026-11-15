'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, AudioLines, BookA, SpellCheck, Ear, BookText, PenLine, Mic, CornerDownLeft } from 'lucide-react'

const STEPS = [
  {
    key: '音',
    title: '发音地基',
    phase: '打基础',
    desc: '48 个国际音标逐个真人发音，配合自然拼读与 IPA 键盘练习，先做到“看到就会读”。',
    modules: ['音标学习', '音标练习'],
    href: '/phonetics/learn',
    icon: AudioLines,
  },
  {
    key: '词',
    title: '词汇内化',
    phase: '打基础',
    desc: '音节切分、词根词缀拆解、键盘跟打，再用三连对盲打检验，让单词真正长进脑子里。',
    modules: ['单词学习', '词根词缀', '生错词本'],
    href: '/learn',
    icon: BookA,
  },
  {
    key: '法',
    title: '语法骨架',
    phase: '打基础',
    desc: '词性、时态矩阵、介词与句型推导，把零散的词搭成正确的句子结构。',
    modules: ['基础语法'],
    href: '/grammar',
    icon: SpellCheck,
  },
  {
    key: '听',
    title: '听力输入',
    phase: '大量输入',
    desc: '常用短语、场景对话、英语电台，变速播放与双语字幕，磨出英语耳朵。',
    modules: ['听力广场'],
    href: '/radio',
    icon: Ear,
  },
  {
    key: '读',
    title: '阅读输入',
    phase: '大量输入',
    desc: '音标、原文、译文三行对照，点词即查即读，在真实文章里与学过的词重逢。',
    modules: ['文章阅读', '单词查询'],
    href: '/reading',
    icon: BookText,
  },
  {
    key: '写',
    title: '写作输出',
    phase: '主动输出',
    desc: '看中文连词成句，逐词校验、语法成分拆解，把“看得懂”变成“写得对”。',
    modules: ['句子翻译', '单词默写'],
    href: '/translate',
    icon: PenLine,
  },
  {
    key: '说',
    title: '口语对话',
    phase: '主动输出',
    desc: '与 AI 进行真实场景对话，实时纠正发音、流利度与语法，让英语从嘴里说出来。',
    modules: ['AI 口语陪练'],
    href: '#speaking',
    icon: Mic,
  },
]

const STEP_MS = 3200

/** 学英语的完整闭环：七个环节环形排布，自动轮播，悬停暂停 */
export function LoopDiagram() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => setActive((a) => (a + 1) % STEPS.length), STEP_MS)
    return () => clearInterval(timer)
  }, [paused])

  const step = STEPS[active]
  const StepIcon = step.icon

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative mx-auto w-full max-w-[480px] aspect-square hidden sm:block">
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
          <circle cx="50" cy="50" r="39" fill="none" stroke="var(--border)" strokeWidth="0.4" />
          <circle
            cx="50"
            cy="50"
            r="39"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="0.6"
            strokeDasharray="2 3"
            strokeLinecap="round"
            className="origin-center animate-[spin_40s_linear_infinite]"
            opacity="0.55"
          />
        </svg>

        <div className="absolute inset-[27%] rounded-full border border-border bg-sidebar flex flex-col items-center justify-center text-center">
          <span className="font-serif text-6xl text-primary leading-none">{step.key}</span>
          <span className="mt-2 text-xs text-foreground">{step.title}</span>
          <span className="mt-1 text-[11px] font-mono tracking-widest text-muted-foreground">
            {active + 1} / {STEPS.length}
          </span>
        </div>

        {STEPS.map((s, i) => {
          const angle = (i / STEPS.length) * Math.PI * 2 - Math.PI / 2
          const left = 50 + 39 * Math.cos(angle)
          const top = 50 + 39 * Math.sin(angle)
          const Icon = s.icon
          const isActive = i === active
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(i)}
              style={{ left: `${left}%`, top: `${top}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 size-15 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all duration-300 ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary scale-110'
                  : 'bg-card backdrop-blur-md border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
              }`}
            >
              <Icon className="size-5" />
              <span className="text-xs font-medium">{s.key}</span>
            </button>
          )
        })}
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <StepIcon className="size-5" />
            </div>
            <div>
              <div className="text-[12px] font-mono text-muted-foreground">{step.phase}</div>
              <h3 className="text-xl font-semibold text-foreground">
                {step.key} · {step.title}
              </h3>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground min-h-[44px]">{step.desc}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {step.modules.map((m) => (
              <span key={m} className="px-2.5 py-1 rounded-md bg-muted text-xs text-foreground">
                {m}
              </span>
            ))}
            <Link href={step.href} className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <span>去体验</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {STEPS.map((s, i) => (
            <button key={s.key} type="button" onClick={() => setActive(i)} className="group cursor-pointer">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className={`h-full bg-primary transition-all duration-500 ${i <= active ? 'w-full' : 'w-0'}`} />
              </div>
              <div
                className={`mt-2 text-sm text-center transition-colors ${
                  i === active ? 'text-primary font-medium' : 'text-muted-foreground group-hover:text-foreground'
                }`}
              >
                {s.key}
              </div>
            </button>
          ))}
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
          <CornerDownLeft className="size-3.5 mt-0.5 shrink-0 text-primary" />
          <span>闭环回流：练习中拼错的词自动进入错词本，查词时可一键加入生词本，回到词汇环节反复巩固，直到三连对清零。</span>
        </p>
      </div>
    </div>
  )
}
