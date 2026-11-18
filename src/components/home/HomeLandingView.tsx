'use client'

import React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  GraduationCap,
  Mic,
  BookText,
  Volume2,
  Sparkles,
  Star,
  RotateCcw,
  Check,
  ShieldCheck,
  WifiOff,
  Bot,
  Palette,
  Ear,
  PenTool,
  Briefcase,
  Plane,
  Coffee,
  RefreshCw,
  Users,
} from 'lucide-react'
import { SkinPicker } from '@/components/layout/SkinPicker'
import { audioEngine } from '@/core/audioEngine'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { SKINS } from '@/lib/skins'
import { HeroShowcase } from './HeroShowcase'
import { WordCarousel } from './WordCarousel'
import { PrinciplesDonut } from './PrinciplesDonut'
import { ModuleRouteMap } from './ModuleRouteMap'
import { LoopDiagram } from './LoopDiagram'
import { ProductPreview } from './ProductPreview'

/** 开源仓库地址（浏览器访问用，克隆地址为 https://github.com/easybuild-jack/lingualoop.git） */
const GITHUB_REPO_URL = 'https://github.com/easybuild-jack/lingualoop'

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.38-3.88-1.38-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

const NAV_ANCHORS = [
  { label: '学习闭环', href: '#loop' },
  { label: '听说读写', href: '#skills' },
  { label: '口语陪练', href: '#speaking' },
  { label: '产品体验', href: '#preview' },
  { label: '全部功能', href: '#modules' },
]

const STATS = [
  { value: '5', label: '项技能 听说读写译' },
  { value: '12', label: '个学习模块' },
  { value: '5 万+', label: '离线词条' },
  { value: '100%', label: '代码完全开源' },
]

const SKILLS = [
  {
    key: '听',
    en: 'Listening',
    icon: Ear,
    title: '听得懂',
    desc: '短语、场景对话、英语电台，变速播放 + 双语字幕；48 音素辨音打底。',
    modules: [
      { label: '听力广场', href: '/radio' },
      { label: '音标学习', href: '/phonetics/learn' },
    ],
  },
  {
    key: '说',
    en: 'Speaking',
    icon: Mic,
    title: '说得出',
    desc: '音标纠音、单词与例句真人发音跟读，再与 AI 进行场景对话，实时纠正发音。',
    modules: [
      { label: '音标练习', href: '/phonetics' },
      { label: 'AI 口语陪练', href: '#speaking' },
    ],
  },
  {
    key: '读',
    en: 'Reading',
    icon: BookText,
    title: '读得顺',
    desc: '音标 / 原文 / 译文三行对照，点词即查即读，离线词典秒出释义。',
    modules: [
      { label: '文章阅读', href: '/reading' },
      { label: '单词查询', href: '/dictionary' },
    ],
  },
  {
    key: '写',
    en: 'Writing',
    icon: PenTool,
    title: '写得对',
    desc: '键盘跟打、盲打默写、连词成句，语法成分逐个拆解校验。',
    modules: [
      { label: '单词默写', href: '/dictation' },
      { label: '句子翻译', href: '/translate' },
      { label: '基础语法', href: '/grammar' },
    ],
  },
]

const FLOATING_GLYPHS = [
  { text: 'θ', cls: 'left-[6%] top-[18%] text-5xl', delay: '0s' },
  { text: 'ʃ', cls: 'left-[44%] top-[8%] text-3xl', delay: '1.2s' },
  { text: 'æ', cls: 'left-[3%] bottom-[16%] text-4xl', delay: '2.1s' },
  { text: 'ð', cls: 'right-[4%] top-[12%] text-4xl', delay: '0.6s' },
  { text: 'ŋ', cls: 'right-[8%] bottom-[10%] text-5xl', delay: '1.8s' },
]

const SPEAKING_SCENARIOS = [
  { icon: Coffee, label: '日常闲聊' },
  { icon: Plane, label: '出国旅行' },
  { icon: Briefcase, label: '职场面试' },
  { icon: GraduationCap, label: '雅思口语' },
]

const PHONETIC_KEYS = [
  { ipa: 'iː', ex: 'see' },
  { ipa: 'ɪ', ex: 'sit' },
  { ipa: 'æ', ex: 'cat' },
  { ipa: 'ɑː', ex: 'car' },
  { ipa: 'ɜː', ex: 'bird' },
  { ipa: 'eɪ', ex: 'day' },
  { ipa: 'aɪ', ex: 'my' },
  { ipa: 'aʊ', ex: 'now' },
  { ipa: 'θ', ex: 'thin' },
  { ipa: 'ð', ex: 'this' },
  { ipa: 'ʃ', ex: 'she' },
  { ipa: 'tʃ', ex: 'chin' },
]

const KEY_SWITCHES = [
  { id: 'Cherry MX Blues', label: 'Cherry 青轴' },
  { id: 'Cherry MX Browns', label: 'Cherry 茶轴' },
  { id: 'Topre', label: 'Topre 静电容' },
  { id: 'Alpacas', label: '羊驼轴' },
  { id: 'NovelKeys Creams', label: '奶油轴' },
  { id: 'Buckling Spring', label: 'IBM 屈伸弹簧' },
]

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function SectionHeading({ eyebrow, title, desc }: { eyebrow: string; title: React.ReactNode; desc?: string }) {
  return (
    <Reveal className="text-center max-w-2xl mx-auto mb-12">
      <div className="text-xs font-mono uppercase tracking-[0.25em] text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-tight">{title}</h2>
      {desc && <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">{desc}</p>}
    </Reveal>
  )
}

export function HomeLandingView() {
  const skinId = useWorkspaceStore((s) => s.skinId)
  const setSkinId = useWorkspaceStore((s) => s.setSkinId)

  return (
    <div className="flex-1 min-h-full w-full flex flex-col bg-background text-foreground select-none">
      {/* ==================== 顶部导航 ==================== */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/75 backdrop-blur-xl">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 h-15 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo111.png" alt="LinguaLoop" className="size-7 object-contain" />
            <span className="font-serif text-[23px] font-medium tracking-tight text-foreground leading-none">
              LinguaLoop
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            {NAV_ANCHORS.map((a) => (
              <a key={a.href} href={a.href} className="hover:text-foreground transition-colors">
                {a.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub 仓库"
              className="size-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center transition-colors"
            >
              <GithubIcon className="size-4" />
            </a>
            <Link
              href="/learn"
              className="h-8 px-3.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-[14px] font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <span>开始学习</span>
              <ArrowRight className="size-3.5" />
            </Link>
            <SkinPicker showUserMenu={false} />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ==================== 1. 首屏 ==================== */}
        <section className="relative overflow-hidden">
          <div className="home-hero-bg pointer-events-none absolute inset-0" />
          {FLOATING_GLYPHS.map((g) => (
            <span
              key={g.text}
              style={{ animationDelay: g.delay }}
              className={`pointer-events-none absolute hidden lg:block font-serif text-primary/15 animate-[home-float_7s_ease-in-out_infinite] ${g.cls}`}
            >
              /{g.text}/
            </span>
          ))}

          <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-20 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/[0.08] text-xs text-primary"
              >
                <Sparkles className="size-3.5" />
                <span>开源项目 · 私人订制英语学习闭环</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.08 }}
                className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.1] text-foreground"
              >
                从第一个音标，
                <br />
                到第一场
                <span className="relative inline-block mx-2">
                  <span className="font-serif font-normal italic text-primary">English</span>
                  <svg
                    viewBox="0 0 120 12"
                    className="absolute left-0 -bottom-2 w-full h-3 text-primary/60"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <path d="M2 8 C 30 2, 60 12, 118 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </span>
                对话。
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.16 }}
                className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl"
              >
                LinguaLoop 把发音、词汇、语法、听力、阅读、写作和 AI 口语串成
                <span className="text-foreground">一条完整的学习闭环</span>
                ——听得懂、说得出、读得顺、写得对。
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Link
                  href="/learn"
                  className="h-11 px-6 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium inline-flex items-center gap-2 transition-all hover:-translate-y-0.5"
                >
                  <span>免费开始学习</span>
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#loop"
                  className="h-11 px-5 rounded-lg border border-border hover:bg-muted text-sm text-foreground inline-flex items-center gap-2 transition-colors"
                >
                  看看学习闭环
                </a>
              </motion.div>

              <motion.dl
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="mt-12 grid grid-cols-2 sm:grid-cols-[1.15fr_0.85fr_0.85fr_1.35fr] gap-4 max-w-xl"
              >
                {STATS.map((s) => (
                  <div key={s.label} className="border-l border-border pl-3">
                    <dt className="text-2xl sm:text-3xl font-semibold font-serif text-foreground whitespace-nowrap">{s.value}</dt>
                    <dd className="mt-1 text-[12px] sm:text-xs text-muted-foreground">{s.label}</dd>
                  </div>
                ))}
              </motion.dl>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <HeroShowcase />
            </motion.div>
          </div>

          <div className="relative border-y border-border">
            <WordCarousel />
          </div>
        </section>

        {/* ==================== 2. 学习闭环 ==================== */}
        <section id="loop" className="scroll-mt-16 max-w-[1240px] mx-auto px-5 sm:px-8 py-24">
          <SectionHeading
            eyebrow="The Loop"
            title={
              <>
                打基础 → 大量输入 → 主动输出
                <br className="hidden sm:block" />
                <span className="text-primary">学英语的完整闭环</span>
              </>
            }
            desc="LinguaLoop 把音、词、法、听、读、写、说七个环节连成一个圈：先打牢基础，再大量输入，最后主动输出，每一环都为下一环铺路。"
          />
          <Reveal>
            <LoopDiagram />
          </Reveal>
        </section>

        {/* ==================== 3. 听说读写四项技能 ==================== */}
        <section id="skills" className="scroll-mt-16 border-t border-border">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-24">
            <SectionHeading
              eyebrow="Four Skills, One System"
              title="听、说、读、写，一个都不落下"
              desc="四项技能共用同一套离线词库与本地学习记录，在一个地方完成全部练习。"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {SKILLS.map((s, i) => {
                const Icon = s.icon
                return (
                  <Reveal key={s.key} delay={i * 0.07} className="h-full">
                  <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300 ease-out hover:scale-[1.05] hover:-translate-y-1 hover:border-primary/50 hover:shadow-2xl hover:z-10">
                    <span className="pointer-events-none absolute -right-3 -top-6 font-serif text-[120px] leading-none text-primary/[0.07] transition-all duration-500 group-hover:text-primary/[0.16] group-hover:scale-110">
                      {s.key}
                    </span>
                    <div className="relative">
                      <div className="size-11 rounded-xl bg-primary/12 text-primary flex items-center justify-center transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="size-5" />
                      </div>
                      <div className="mt-5 text-xs font-mono uppercase tracking-wider text-muted-foreground">{s.en}</div>
                      <h3 className="mt-1 text-2xl font-semibold text-foreground">{s.title}</h3>
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed min-h-[66px]">{s.desc}</p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {s.modules.map((m) => (
                          <Link
                            key={m.label}
                            href={m.href}
                            className="px-2.5 py-1 rounded-md bg-muted text-xs text-foreground hover:text-primary transition-colors"
                          >
                            {m.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        {/* ==================== 4. AI 口语陪练 ==================== */}
        <section id="speaking" className="scroll-mt-16 border-t border-border bg-sidebar/40 overflow-hidden">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-24 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <Reveal>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/[0.08] text-xs text-primary">
                <Sparkles className="size-3.5" />
                AI Speaking · AI 口语陪练
              </span>
              <h2 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-tight">
                闭环的最后一环：
                <br />
                <span className="text-primary">开口说</span>
              </h2>
              <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-lg">
                学过的词、练过的句型，最终都要用在真实对话里。AI 口语陪练会扮演咖啡店员、面试官、雅思考官，
                随时陪你练，并对发音、流利度和语法给出即时反馈。
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  '真实场景角色扮演，随时开口、轻松练习',
                  '逐词发音评分，薄弱音素直接跳转音标专训',
                  '对话中的生词与病句，自动沉淀回你的词库',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-foreground">
                    <Check className="size-4 text-primary mt-0.5 shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-2">
                {SPEAKING_SCENARIOS.map((s) => {
                  const Icon = s.icon
                  return (
                    <span
                      key={s.label}
                      className="h-9 px-3 rounded-lg border border-border bg-background/60 text-xs text-foreground inline-flex items-center gap-1.5"
                    >
                      <Icon className="size-3.5 text-primary" />
                      {s.label}
                    </span>
                  )
                })}
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="relative">
                <div className="relative rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                    <img src="/logo222.png" alt="" className="size-8 object-contain" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">Interviewer · Emma</div>
                      <div className="text-[12px] text-muted-foreground">场景：外企技术面试</div>
                    </div>
                    <span className="text-[12px] font-mono text-primary">● LIVE</span>
                  </div>
                  <div className="p-5 space-y-3.5">
                    <div className="flex gap-2">
                      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-bl-md bg-muted text-sm text-foreground">
                        Could you tell me about a challenging project you’ve worked on?
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-sm">
                        Sure. Last year I <span className="underline decoration-wavy decoration-2 underline-offset-4">lead</span> a team to rebuild our payment system.
                      </div>
                    </div>
                    <div className="ml-auto max-w-[80%] rounded-xl border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">即时反馈</span>
                        <span className="font-mono text-foreground">
                          发音 <span className="text-primary">91</span> · 流利 <span className="text-primary">86</span>
                        </span>
                      </div>
                      <div className="text-xs text-foreground">
                        <span className="text-destructive line-through">lead</span>
                        <ArrowRight className="inline size-3 mx-1 text-muted-foreground" />
                        <span className="text-primary font-medium">led</span>
                        <span className="text-muted-foreground"> · 过去时，lead 的过去式为 led /led/</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pl-1 pt-1">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          style={{ animationDelay: `${d * 0.15}s` }}
                          className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="px-5 py-4 border-t border-border flex items-center justify-center">
                    <span className="relative size-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Mic className="relative size-5" />
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ==================== 5. 设计理念 ==================== */}
        <section id="principles" className="scroll-mt-16 border-t border-border">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-24">
            <SectionHeading
              eyebrow="Our Principles"
              title="LinguaLoop 的五个设计理念"
              desc="我们相信，学英语是一件连贯的事。每一个功能，都围绕这五点来打磨。"
            />

            <Reveal>
              <PrinciplesDonut />
            </Reveal>
          </div>
        </section>

        {/* ==================== 6. 产品交互预览 ==================== */}
        <section id="preview" className="scroll-mt-16 max-w-[1240px] mx-auto px-5 sm:px-8 py-24">
          <SectionHeading
            eyebrow="Try It Now"
            title="不用注册，现在就能学习"
            desc="下面是真实界面的缩影：点单词听发音、切换音标与译文、看连词成句的过程。"
          />
          <Reveal>
            <ProductPreview />
          </Reveal>
        </section>

        {/* ==================== 7. 细节亮点 Bento ==================== */}
        <section className="border-t border-border">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-24">
            <SectionHeading
              eyebrow="Crafted Details"
              title="每个细节，都为“学得会、用得上”服务"
            />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* 音标键帽 */}
              <Reveal className="md:col-span-7 rounded-2xl border border-border bg-card p-6 flex flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-mono text-primary">PHONETICS</span>
                    <h3 className="text-lg font-semibold text-foreground mt-1">48 个国际音标 + 42 个字母组合，点一下就能听</h3>
                    <p className="text-sm text-muted-foreground mt-1">覆盖 48 个单音素与 42 个常见字母组合发音，配合自然拼读，开口更有底气。</p>
                  </div>
                  <Link
                    href="/phonetics/learn"
                    className="shrink-0 h-8 px-3 rounded-md border border-border hover:bg-muted text-xs inline-flex items-center gap-1"
                  >
                    <span>音标专训</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {PHONETIC_KEYS.map((k) => (
                    <button
                      key={k.ipa}
                      type="button"
                      onClick={() => audioEngine.playPhoneticSound(k.ipa)}
                      className="h-14 rounded-xl border border-border border-b-[3px] bg-sidebar hover:border-primary/60 hover:bg-primary/10 active:translate-y-0.5 active:border-b flex flex-col items-center justify-center cursor-pointer transition-all group"
                    >
                      <span className="font-mono text-base font-semibold text-foreground group-hover:text-primary">/{k.ipa}/</span>
                      <span className="text-[11px] text-muted-foreground font-mono">{k.ex}</span>
                    </button>
                  ))}
                </div>
              </Reveal>

              {/* 三连对 */}
              <Reveal delay={0.08} className="md:col-span-5 rounded-2xl border border-border bg-card p-6 flex flex-col gap-6">
                <div>
                  <span className="text-xs font-mono text-primary">ANTI-ILLUSION</span>
                  <h3 className="text-lg font-semibold text-foreground mt-1">「三连对」才算真的会</h3>
                  <p className="text-sm text-muted-foreground mt-1">拼错或偷看自动进错词本，连续 3 次盲打全对才清零。</p>
                </div>
                <div className="space-y-2.5">
                  {[
                    { word: 'accommodate', streak: 3, tag: '已清零', done: true },
                    { word: 'conscientious', streak: 2, tag: '再对 1 次', done: false },
                    { word: 'Mediterranean', streak: 1, tag: '重点攻坚', done: false },
                  ].map((row) => (
                    <div
                      key={row.word}
                      className="p-3 rounded-lg border border-border bg-sidebar flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Star className="size-3.5 text-accent fill-accent shrink-0" />
                        <span className="font-serif text-base text-foreground truncate">{row.word}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3].map((step) => (
                            <span key={step} className={`size-2 rounded-full ${step <= row.streak ? 'bg-primary' : 'bg-muted'}`} />
                          ))}
                        </div>
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded ${
                            row.done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {row.tag}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>

              {/* 机械轴体 */}
              <Reveal className="md:col-span-5 rounded-2xl border border-border bg-card p-6 flex flex-col gap-5">
                <div>
                  <span className="text-xs font-mono text-primary">MECHANICAL SOUND</span>
                  <h3 className="text-lg font-semibold text-foreground mt-1">13 款机械轴体，打字上瘾</h3>
                  <p className="text-sm text-muted-foreground mt-1">真实采样击键声，让默写像玩键盘一样解压。点击试听：</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {KEY_SWITCHES.map((sw) => (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() => audioEngine.playKeySound(sw.id, 0.8)}
                      className="h-9 px-3 rounded-lg border border-border bg-sidebar hover:border-primary/50 hover:text-primary text-xs text-foreground inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Volume2 className="size-3.5 text-primary" />
                      <span>{sw.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => audioEngine.playCorrectSound(0.75)}
                    className="h-9 px-3 rounded-lg bg-primary/12 border border-primary/30 text-xs text-primary inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>通关音效</span>
                  </button>
                </div>
              </Reveal>

              {/* 换肤 */}
              <Reveal delay={0.08} className="md:col-span-7 rounded-2xl border border-border bg-card p-6 flex flex-col gap-5">
                <div className="flex items-start gap-3">
                  <Palette className="size-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">7 套护眼主题，点一下整页换肤</h3>
                    <p className="text-sm text-muted-foreground mt-1">深色沉静专注，浅色纸墨温润。试试看，这个页面会跟着变。</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {SKINS.map((skin) => {
                    const active = skinId === skin.id
                    return (
                      <button
                        key={skin.id}
                        type="button"
                        onClick={() => setSkinId(skin.id)}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-center gap-2.5 ${
                          active ? 'border-primary bg-primary/10' : 'border-border bg-sidebar hover:border-primary/40'
                        }`}
                      >
                        <span
                          className="size-5 rounded-full shrink-0 border border-white/15"
                          style={{ background: `linear-gradient(135deg, ${skin.tokens.background} 50%, ${skin.tokens.primary} 50%)` }}
                        />
                        <span className="text-xs font-medium text-foreground truncate">{skin.name}</span>
                      </button>
                    )
                  })}
                </div>
              </Reveal>

              {/* 四个核心能力卡片：离线 / 跨设备 / 团队共享 / 个性化 */}
              {[
                { icon: WifiOff, title: '离线可用', desc: '内置词典与词库本地加载，支持 PWA 安装到桌面，断网也能完整学习。' },
                { icon: RefreshCw, title: '跨设备同步', desc: '按需接入自有云数据库，词库、生错词本与学习进度在多端实时同步。' },
                { icon: Users, title: '团队共享', desc: '可将词库、句库、文章与听力资料设为团队共享，大家一起学、一起维护。' },
                { icon: Sparkles, title: '高度个性化', desc: '自由导入专属学习内容、定制外观皮肤与 AI 助教，打造私人学习系统。' },
              ].map((f, i) => {
                const Icon = f.icon
                return (
                  <Reveal key={f.title} delay={i * 0.06} className="md:col-span-6 lg:col-span-3 rounded-2xl border border-border bg-card p-6">
                    <div className="size-10 rounded-xl bg-primary/12 text-primary flex items-center justify-center">
                      <Icon className="size-5" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        {/* ==================== 8. 功能模块 ==================== */}
        <section id="modules" className="scroll-mt-16 border-t border-border bg-sidebar/40">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-24">
            <SectionHeading
              eyebrow="All Modules"
              title="一套系统，配齐学英语的全部环节"
              desc="打基础、巩固、输入、输出四大板块，从发音、词汇到听读写说，覆盖学英语的每一个环节。"
            />

            <ModuleRouteMap />
          </div>
        </section>
      </main>

      {/* ==================== 底部栏 ==================== */}
      <footer className="border-t border-border py-8 px-5 sm:px-8 text-xs text-muted-foreground">
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo111.png" alt="LinguaLoop" className="size-5 object-contain" />
            <span className="font-serif text-sm text-foreground">LinguaLoop</span>
            <span>· 开源的私人英语学习闭环</span>
          </div>
          <div className="flex items-center gap-4">
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
              <GithubIcon className="size-3.5" />
              <span>GitHub</span>
            </a>
            <Link href="/learn" className="hover:text-foreground transition-colors">
              开始学习 →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
