'use client'

import React from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import {
  type ReadingArticle,
  type ReadingFontSize,
  cleanIpaToken,
  splitArticleTitle,
} from '@/resources/readingData'
import { audioEngine } from '@/core/audioEngine'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

interface ReadingReaderViewProps {
  article: ReadingArticle | null
  isLoading?: boolean
  showPhonetic: boolean
  onTogglePhonetic: () => void
  showTranslation: boolean
  onToggleTranslation: () => void
  fontSize: ReadingFontSize
  onChangeFontSize: (size: ReadingFontSize) => void
}

const FONT_SIZE_CONFIG: Record<
  ReadingFontSize,
  { label: string; enClass: string; ipaClass: string; zhClass: string }
> = {
  sm: {
    label: '小',
    enClass: 'text-[20px] leading-[1.28]',
    ipaClass: 'text-[14px] leading-[1.25]',
    zhClass: 'text-[14px] leading-[1.55]',
  },
  md: {
    label: '标准',
    enClass: 'text-[23px] leading-[1.28]',
    ipaClass: 'text-[16px] leading-[1.25]',
    zhClass: 'text-[15px] leading-[1.55]',
  },
  lg: {
    label: '大',
    enClass: 'text-[26px] leading-[1.28]',
    ipaClass: 'text-[18px] leading-[1.25]',
    zhClass: 'text-[16px] leading-[1.55]',
  },
}

const FONT_SIZES: ReadingFontSize[] = ['sm', 'md', 'lg']

export function ReadingReaderView({
  article,
  isLoading = false,
  showPhonetic,
  onTogglePhonetic,
  showTranslation,
  onToggleTranslation,
  fontSize,
  onChangeFontSize,
}: ReadingReaderViewProps) {
  const phoneticPreference = useWorkspaceStore((s) => s.phoneticPreference)

  if (isLoading) {
    return (
      <div className="h-80 rounded-lg border border-dashed border-border flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none">
        <Loader2 className="size-6 animate-spin text-primary mb-3" />
        <p className="text-sm text-foreground">正在加载文章正文…</p>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="h-80 rounded-lg border border-dashed border-border flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none">
        <BookOpen className="size-9 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">暂无选中的阅读文章</p>
        <p className="text-xs text-muted-foreground mt-1">回到文章列表选择一篇开始阅读，或上传新文章</p>
      </div>
    )
  }

  const { en: titleEn, zh: titleZh } = splitArticleTitle(article.title)
  const sizeStyles = FONT_SIZE_CONFIG[fontSize]

  const handleSpeakWord = (word: string) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, '')
    if (!clean) return
    audioEngine.playPronunciation(clean, phoneticPreference)
  }

  return (
    <div className="pt-4">
      <div className="max-w-[860px] mx-auto">
        {/* 文章报头 + 右侧音标/译文/字号控制条 */}
        <header className="flex flex-wrap items-start justify-between gap-4 pb-8 select-none">
          <div className="space-y-1.5 min-w-0">
            <div className="text-xs font-mono uppercase tracking-widest text-primary">
              Reading Passage
            </div>
            <h2 className="font-serif text-2xl sm:text-[29px] font-medium tracking-tight text-foreground leading-snug">
              {titleEn}
            </h2>
            {titleZh && <p className="text-sm text-muted-foreground">{titleZh}</p>}
          </div>

          <div className="flex items-center gap-2 pt-1 shrink-0">
            <button
              type="button"
              onClick={onTogglePhonetic}
              className={`h-[30px] px-2.5 rounded-md text-xs border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                showPhonetic
                  ? 'border-primary/45 bg-primary/12 text-primary font-medium'
                  : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <span
                className={`size-1.5 rounded-full bg-current transition-opacity ${
                  showPhonetic ? 'opacity-100' : 'opacity-40'
                }`}
              />
              <span>音标</span>
            </button>

            <button
              type="button"
              onClick={onToggleTranslation}
              className={`h-[30px] px-2.5 rounded-md text-xs border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                showTranslation
                  ? 'border-primary/45 bg-primary/12 text-primary font-medium'
                  : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <span
                className={`size-1.5 rounded-full bg-current transition-opacity ${
                  showTranslation ? 'opacity-100' : 'opacity-40'
                }`}
              />
              <span>译文</span>
            </button>

            <div className="flex items-center p-0.5 rounded-md border border-border ml-1">
              {FONT_SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onChangeFontSize(sz)}
                  className={`h-[26px] px-2 rounded text-xs transition-all cursor-pointer ${
                    fontSize === sz
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {FONT_SIZE_CONFIG[sz].label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* 连续文章正文区：无分割横线，句子顺着段落自然排布 */}
        <article className="space-y-9">
          {article.paragraphs.map((para, pIdx) => (
            <section
              key={pIdx}
              className={`flex flex-wrap items-start ${
                showTranslation
                  ? 'gap-x-[1.5em] gap-y-[1.35em]'
                  : 'gap-x-[0.55em] gap-y-[0.85em]'
              }`}
            >
              {para.map((sentence, sIdx) => {
                const tokens = sentence.en.trim().split(/\s+/).filter(Boolean)
                const ipas = sentence.ipa.trim().split(/\s+/)

                return (
                  <div
                    key={sIdx}
                    className="group/sent inline-flex flex-col items-start px-[9px] py-[6px] -mx-[9px] -my-[6px] rounded-lg hover:bg-card transition-colors"
                  >
                    {/* 句内单词行：音标在上，英文在下 */}
                    <div
                      className={`inline-flex flex-wrap items-end gap-x-[0.42em] ${
                        showPhonetic ? 'gap-y-[0.65em]' : 'gap-y-[0.25em]'
                      }`}
                    >
                      {tokens.map((token, wIdx) => {
                        const match = token.match(/^([a-zA-Z'-]+)(.*)$/)
                        const wordCore = match ? match[1] : token
                        const punct = match ? match[2] : ''
                        const ipa = cleanIpaToken(ipas[wIdx])

                        return (
                          <span
                            key={wIdx}
                            onClick={() => handleSpeakWord(wordCore)}
                            title={`点击朗读 ${wordCore}`}
                            className="group/word inline-flex flex-col items-center cursor-pointer rounded px-0.5 py-px -mx-0.5 -my-px hover:bg-muted transition-colors"
                          >
                            {showPhonetic && (
                              <span
                                className={`${sizeStyles.ipaClass} text-muted-foreground/90 group-hover/word:text-primary tracking-[0.01em] mb-1 whitespace-nowrap select-none transition-colors`}
                              >
                                {ipa}
                              </span>
                            )}
                            <span
                              className={`font-serif inline-flex items-baseline ${sizeStyles.enClass} tracking-[-0.005em]`}
                            >
                              <span className="text-foreground group-hover/word:text-primary transition-colors">
                                {wordCore}
                              </span>
                              {punct && (
                                <span className="text-muted-foreground ml-[0.5px]">{punct}</span>
                              )}
                            </span>
                          </span>
                        )
                      })}
                    </div>

                    {/* 句下中文译文 */}
                    {showTranslation && (
                      <div
                        className={`${sizeStyles.zhClass} text-muted-foreground group-hover/sent:text-foreground/80 mt-1.5 tracking-[0.015em] transition-colors`}
                      >
                        {sentence.zh}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}
