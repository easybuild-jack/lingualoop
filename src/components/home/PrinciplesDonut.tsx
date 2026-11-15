'use client'

import React, { useEffect, useState } from 'react'
import { RotateCcw, AudioLines, Sprout, PenLine, ShieldCheck } from 'lucide-react'

const PRINCIPLES = [
  { icon: RotateCcw, title: '闭环，环环相扣', desc: '音、词、法、听、读、写、说连成一个圈，每一环都为下一环铺路。' },
  { icon: AudioLines, title: '从发音出发', desc: '以音标和音节为起点，让每个单词先读得准，再记得牢。' },
  { icon: Sprout, title: '理解胜于记忆', desc: '用词根词缀和语法结构解释“为什么”，学一个通一串。' },
  { icon: PenLine, title: '学以致用', desc: '默写、连词成句、AI 对话，让学到的内容在输出中真正落地。' },
  { icon: ShieldCheck, title: '开源与本地优先', desc: '代码完全开源，学习数据存于本机，离线也能随时学习。' },
]

const C = 100
const R_OUT = 92
const R_IN = 58
const GAP_DEG = 3
const SEG_DEG = 360 / PRINCIPLES.length
const STEP_MS = 3000

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)]
}

function segmentPath(i: number) {
  const a0 = i * SEG_DEG - 90 + GAP_DEG / 2
  const a1 = (i + 1) * SEG_DEG - 90 - GAP_DEG / 2
  const [x0, y0] = polar(R_OUT, a0)
  const [x1, y1] = polar(R_OUT, a1)
  const [x2, y2] = polar(R_IN, a1)
  const [x3, y3] = polar(R_IN, a0)
  return `M${x0} ${y0} A${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${R_IN} ${R_IN} 0 0 0 ${x3} ${y3} Z`
}

/** 五个设计理念的环形图：分段自动轮播，与右侧列表联动，悬停暂停 */
export function PrinciplesDonut() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setActive((a) => (a + 1) % PRINCIPLES.length), STEP_MS)
    return () => clearInterval(t)
  }, [paused])

  const current = PRINCIPLES[active]

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative mx-auto w-full max-w-[420px] aspect-square">
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
          {PRINCIPLES.map((p, i) => {
            const isActive = i === active
            const mid = ((i + 0.5) * SEG_DEG - 90) * (Math.PI / 180)
            const pop = isActive ? 6 : 0
            return (
              <path
                key={p.title}
                d={segmentPath(i)}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                style={{ transform: `translate(${Math.cos(mid) * pop}px, ${Math.sin(mid) * pop}px)` }}
                className={`cursor-pointer transition-all duration-500 ease-out ${
                  isActive ? 'fill-primary stroke-primary' : 'fill-primary/[0.08] stroke-border hover:fill-primary/20'
                }`}
                strokeWidth="0.6"
              />
            )
          })}
          <circle cx={C} cy={C} r={R_IN - 8} fill="none" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="1.5 2.5" />
        </svg>

        {PRINCIPLES.map((p, i) => {
          const Icon = p.icon
          const isActive = i === active
          const mid = ((i + 0.5) * SEG_DEG - 90) * (Math.PI / 180)
          const r = (R_OUT + R_IN) / 2 + (isActive ? 6 : 0)
          return (
            <span
              key={p.title}
              style={{ left: `${((C + r * Math.cos(mid)) / 200) * 100}%`, top: `${((C + r * Math.sin(mid)) / 200) * 100}%` }}
              className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${
                isActive ? 'text-primary-foreground scale-110' : 'text-muted-foreground'
              }`}
            >
              <Icon className="size-6" />
            </span>
          )
        })}

        <div className="absolute inset-[33%] rounded-full flex flex-col items-center justify-center text-center">
          <span className="font-mono text-xs text-muted-foreground tracking-widest">PRINCIPLE</span>
          <span key={active} className="mt-1 font-serif text-5xl text-primary leading-none animate-[home-pop_0.4s_ease-out]">
            0{active + 1}
          </span>
          <span className="mt-2 text-sm font-medium text-foreground">{current.title}</span>
        </div>
      </div>

      <ol className="space-y-1">
        {PRINCIPLES.map((p, i) => {
          const isActive = i === active
          return (
            <li key={p.title}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                className="group w-full text-left flex gap-5 py-4 cursor-pointer"
              >
                <span
                  className={`font-serif text-3xl leading-none w-10 shrink-0 transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground/40'
                  }`}
                >
                  0{i + 1}
                </span>
                <span className={`flex-1 border-l-2 pl-5 transition-colors ${isActive ? 'border-primary' : 'border-border'}`}>
                  <span
                    className={`block text-lg font-semibold transition-colors ${
                      isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                    }`}
                  >
                    {p.title}
                  </span>
                  <span
                    className={`block overflow-hidden text-sm text-muted-foreground leading-relaxed transition-all duration-500 ${
                      isActive ? 'max-h-20 mt-1.5 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    {p.desc}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
