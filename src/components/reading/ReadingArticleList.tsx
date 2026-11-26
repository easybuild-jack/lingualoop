'use client'

import React, { useMemo } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { type ReadingArticle, countArticleSentences } from '@/resources/readingData'

export const READING_PAGE_SIZE = 30

interface ReadingArticleListProps {
  articles: ReadingArticle[]
  currentId: string
  cloudMode: boolean
  page: number
  onPageChange: (page: number) => void
  onSelectArticle: (article: ReadingArticle) => void
  onDeleteArticle: (id: string) => void
}

function buildPageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: Array<number | 'ellipsis'> = [1]
  if (current > 3) pages.push('ellipsis')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let p = start; p <= end; p += 1) pages.push(p)
  if (current < total - 2) pages.push('ellipsis')
  pages.push(total)
  return pages
}

function articleBadge(article: ReadingArticle, cloudMode: boolean): { label: string; className: string } {
  if (!article.isCustom) {
    return { label: '示例', className: 'bg-muted text-muted-foreground' }
  }
  if (!cloudMode) {
    return { label: '自定义', className: 'bg-primary/10 text-primary' }
  }
  if (article.accountId) {
    return { label: '个人', className: 'bg-primary/10 text-primary' }
  }
  return { label: '共享', className: 'bg-emerald-500/10 text-emerald-400' }
}

export function ReadingArticleList({
  articles,
  currentId,
  cloudMode,
  page,
  onPageChange,
  onSelectArticle,
  onDeleteArticle,
}: ReadingArticleListProps) {
  const totalPages = Math.max(1, Math.ceil(articles.length / READING_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const startIndex = (safePage - 1) * READING_PAGE_SIZE
  const pagedArticles = useMemo(
    () => articles.slice(startIndex, startIndex + READING_PAGE_SIZE),
    [articles, startIndex]
  )
  const pageNumbers = useMemo(() => buildPageNumbers(safePage, totalPages), [safePage, totalPages])

  if (articles.length === 0) {
    return (
      <div className="py-16 text-center rounded-lg border border-dashed border-border select-none">
        <p className="text-sm text-foreground">暂无匹配的文章</p>
        <p className="mt-1.5 text-xs text-muted-foreground">点击右上角「上传文章」添加自定义双语阅读文章</p>
      </div>
    )
  }

  return (
    <div className="select-none">
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b border-border">
        <span>
          共 <span className="font-mono text-foreground">{articles.length}</span> 篇文章
          {totalPages > 1 && (
            <span className="ml-2">
              · 第 <span className="font-mono text-foreground">{safePage}</span> /{' '}
              <span className="font-mono">{totalPages}</span> 页
            </span>
          )}
        </span>
        <span>点击即可进入阅读</span>
      </div>

      <ol className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
        {pagedArticles.map((article, idx) => {
          const isCurrent = article.id === currentId
          const hasLoadedBody = article.paragraphsLoaded !== false
          const sentenceCount = hasLoadedBody ? countArticleSentences(article) : null
          const badge = articleBadge(article, cloudMode)

          return (
            <li
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className="group flex items-center gap-4 py-3.5 border-b border-border cursor-pointer"
            >
              <span className="w-7 text-right font-mono text-xs tabular-nums text-muted-foreground/70 shrink-0">
                {String(startIndex + idx + 1).padStart(2, '0')}
              </span>

              <div className="size-10 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
                <BookOpen className="size-4 text-muted-foreground" />
              </div>

              <div className="min-w-0 flex-1 flex items-center gap-2">
                <h4
                  className={`text-sm truncate transition-colors ${
                    isCurrent ? 'text-primary font-medium' : 'text-foreground group-hover:text-primary'
                  }`}
                  title={article.title}
                >
                  {article.title}
                </h4>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] leading-none ${badge.className}`}>
                  {badge.label}
                </span>
              </div>

              {sentenceCount !== null && (
                <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                  {sentenceCount} 句
                </span>
              )}

              {article.isCustom && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteArticle(article.id)
                  }}
                  className="size-7 rounded-md flex items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0"
                  title="移除该文章"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          )
        })}
      </ol>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>
            显示第 <span className="font-mono text-foreground">{startIndex + 1}</span>–
            <span className="font-mono text-foreground">
              {Math.min(startIndex + READING_PAGE_SIZE, articles.length)}
            </span>{' '}
            篇（每页最多 {READING_PAGE_SIZE} 篇）
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(safePage - 1)}
              disabled={safePage <= 1}
              className="h-8 px-2.5 rounded-md border border-border inline-flex items-center gap-1 hover:bg-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="上一页"
            >
              <ChevronLeft className="size-3.5" />
              <span className="hidden sm:inline">上一页</span>
            </button>

            {pageNumbers.map((item, index) =>
              item === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="px-1.5 text-muted-foreground/60">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                  className={`min-w-8 h-8 px-2 rounded-md font-mono text-xs transition-colors cursor-pointer ${
                    item === safePage
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {item}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => onPageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              className="h-8 px-2.5 rounded-md border border-border inline-flex items-center gap-1 hover:bg-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="下一页"
            >
              <span className="hidden sm:inline">下一页</span>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

