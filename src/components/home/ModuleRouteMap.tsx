'use client'

import React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  AudioLines,
  Repeat,
  Headphones,
  MessagesSquare,
} from 'lucide-react'

const STATIONS = [
  {
    title: '发音与词汇',
    en: 'Foundation',
    icon: AudioLines,
    stops: [
      { label: '音标学习', desc: '48 音标 + 42 拼读组合', href: '/phonetics/learn' },
      { label: '音标练习', desc: 'IPA 键盘实战', href: '/phonetics' },
      { label: '单词学习', desc: '音节构词跟打', href: '/learn' },
      { label: '词根词缀', desc: '同源词族串联', href: '/roots' },
    ],
  },
  {
    title: '巩固与工具',
    en: 'Retention',
    icon: Repeat,
    stops: [
      { label: '生错词本', desc: '三连对靶向清零', href: '/errors' },
      { label: '单词查询', desc: '5 万词离线秒查', href: '/dictionary' },
      { label: '词库管理', desc: 'CET / 考研 / IT 自由导入', href: '/books' },
    ],
  },
  {
    title: '输入 · 听与读',
    en: 'Input',
    icon: Headphones,
    stops: [
      { label: '听力广场', desc: '短语 · 对话 · 电台', href: '/radio' },
      { label: '文章阅读', desc: '音标译文三行对照', href: '/reading' },
      { label: '基础语法', desc: '词性 · 时态 · 句型', href: '/grammar' },
    ],
  },
  {
    title: '输出 · 写与说',
    en: 'Output',
    icon: MessagesSquare,
    stops: [
      { label: '单词默写', desc: '听音盲打默写', href: '/dictation' },
      { label: '句子翻译', desc: '连词成句精练', href: '/translate' },
      { label: 'AI 口语陪练', desc: '场景对话 · 实时纠音', href: '#speaking' },
    ],
  },
]

/** 全部模块的"学习路线图"：横向主轨串起四个板块，各板块下挂支线站点 */
export function ModuleRouteMap() {
  return (
    <div className="relative">
      {/* 横向主轨，仅宽屏显示；两端对齐首末站圆心（列无间距，圆心距列左侧 28px） */}
      <div className="hidden lg:block absolute left-7 right-[calc(25%-28px)] top-7 h-0.5 bg-border">
        <motion.div
          className="absolute inset-0 bg-primary origin-left"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <span className="absolute -top-[3px] size-2 rounded-full bg-primary-foreground border-2 border-primary animate-[home-route_6s_linear_infinite]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-y-12">
        {STATIONS.map((st, si) => {
          const Icon = st.icon
          return (
            <motion.div
              key={st.title}
              className="relative flex flex-col lg:pr-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: 0.3 + si * 0.15 }}
            >
              {/* 大站 */}
              <div className="flex lg:flex-col items-center lg:items-start gap-4 lg:gap-3">
                <div className="relative z-10 size-14 rounded-full bg-background border-2 border-primary text-primary flex items-center justify-center">
                  <Icon className="size-6" />
                  <span className="absolute -top-1 -right-1 size-5 rounded-full bg-primary text-primary-foreground text-[12px] font-mono font-semibold flex items-center justify-center">
                    {si + 1}
                  </span>
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">{st.title}</div>
                  <div className="text-[12px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{st.en}</div>
                </div>
              </div>

              {/* 支线站点 */}
              <ul className="relative mt-5 ml-[27px] border-l-2 border-dashed border-border space-y-1">
                {st.stops.map((stop) => (
                  <li key={stop.label}>
                    <Link href={stop.href} className="group relative flex items-start gap-3 py-2.5 pl-6">
                      <span className="absolute -left-[7px] top-[15px] size-3 rounded-full border-2 border-primary/60 bg-background transition-all duration-300 group-hover:bg-primary group-hover:border-primary group-hover:scale-125" />
                      <span className="flex-1 transition-transform duration-300 group-hover:translate-x-1">
                        <span className="flex items-center gap-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {stop.label}
                          <ArrowUpRight className="size-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                        </span>
                        <span className="block text-xs text-muted-foreground">{stop.desc}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
