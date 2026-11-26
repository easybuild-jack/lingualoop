'use client'

import React, { useMemo } from 'react'
import type { TranslationBook } from '@/types'
import { ArrowRight, Trash2, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'

export const TRANSLATE_PAGE_SIZE = 30

interface TranslateGroupListProps {
  books: TranslationBook[]
  currentBookId: string
  completedSentenceIds: Record<string, boolean>
  cloudMode: boolean
  page: number
  onPageChange: (page: number) => void
  onSelectGroup: (bookId: string) => void
  onDeleteCustomGroup: (bookId: string, name: string) => void
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

function bookScopeBadge(book: TranslationBook): { label: string; className: string } | null {
  if (!book.isCustom) return null
  if (book.accountId) {
    return { label: '个人', className: 'bg-primary/10 text-primary' }
  }
  return { label: '共享', className: 'bg-emerald-500/10 text-emerald-400' }
}

export function TranslateGroupList({
  books,
  currentBookId,
  completedSentenceIds,
  cloudMode,
  page,
  onPageChange,
  onSelectGroup,
  onDeleteCustomGroup,
}: TranslateGroupListProps) {
  const totalPages = Math.max(1, Math.ceil(books.length / TRANSLATE_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const startIndex = (safePage - 1) * TRANSLATE_PAGE_SIZE
  const pagedBooks = useMemo(
    () => books.slice(startIndex, startIndex + TRANSLATE_PAGE_SIZE),
    [books, startIndex]
  )
  const pageNumbers = useMemo(() => buildPageNumbers(safePage, totalPages), [safePage, totalPages])

  if (books.length === 0) {
    return (
      <div className="py-20 text-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-foreground">没有找到符合条件的练习分组</p>
        <p className="mt-1.5 text-xs text-muted-foreground max-w-sm mx-auto">
          切换上方的场景试试，或通过「导入练习语句」添加自定义分组
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-2">
        <span>
          共 <span className="font-mono text-foreground">{books.length}</span> 个分组
          {totalPages > 1 && (
            <span className="ml-2">
              · 第 <span className="font-mono text-foreground">{safePage}</span> /{' '}
              <span className="font-mono">{totalPages}</span> 页
            </span>
          )}
        </span>
        <span>点击分组进入翻译练习</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10">
        {pagedBooks.map((book) => {
          const isCurrent = book.id === currentBookId
          const scenario =
            book.scenario === '工作实战' || book.scenario === '工作沟通'
              ? '工作常用'
              : book.scenario || '日常生活'
          const total = book.sentences.length
          const completedCount = book.sentences.filter((s) => completedSentenceIds[s.id]).length
          const isAllCompleted = total > 0 && completedCount === total
          const firstSentence = book.sentences[0]
          const scopeBadge = cloudMode ? bookScopeBadge(book) : null

          return (
            <article
              key={book.id}
              onClick={() => onSelectGroup(book.id)}
              className="group border-t border-border py-5 flex flex-col gap-3 cursor-pointer select-none"
            >
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">
                    {scenario} · <span className="font-mono">{total}</span> 句
                  </span>
                  {scopeBadge && (
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] leading-none ${scopeBadge.className}`}>
                      {scopeBadge.label}
                    </span>
                  )}
                  {isCurrent && !book.isOfficial && <span className="shrink-0 text-primary">上次练习</span>}
                </span>
                {book.isCustom && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteCustomGroup(book.id, book.name)
                    }}
                    title="删除此自定义分组"
                    className="size-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>

              <div>
                <h4 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                  {book.name}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {book.description || '精选场景地道英文表达，学练结合'}
                </p>
              </div>

              {firstSentence && (
                <blockquote className="border-l-2 border-border pl-3">
                  <p className="font-serif text-[16px] text-gray-200 line-clamp-1">{firstSentence.sentenceEn}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{firstSentence.sentenceZh}</p>
                </blockquote>
              )}

              <div className="mt-auto flex items-center justify-between text-xs">
                {book.isOfficial ? (
                  <span className="text-muted-foreground">体验示例 · 不记录练习进度</span>
                ) : isAllCompleted ? (
                  <span className="flex items-center gap-1 text-primary">
                    <CheckCircle2 className="size-3.5" />
                    已全部完成
                  </span>
                ) : completedCount > 0 ? (
                  <span className="text-muted-foreground">
                    已练习 <span className="font-mono text-foreground">{completedCount}</span> / {total}
                  </span>
                ) : (
                  <span className="text-muted-foreground">未开始练习</span>
                )}

                <span className="flex items-center gap-1 text-primary opacity-70 group-hover:opacity-100 transition-opacity">
                  {completedCount > 0 ? '继续练习' : '开始练习'}
                  <ArrowRight className="size-3.5" />
                </span>
              </div>
            </article>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-4 text-xs text-muted-foreground border-t border-border pt-4">
          <span>
            显示第 <span className="font-mono text-foreground">{startIndex + 1}</span>–
            <span className="font-mono text-foreground">
              {Math.min(startIndex + TRANSLATE_PAGE_SIZE, books.length)}
            </span>{' '}
            个分组（每页最多 {TRANSLATE_PAGE_SIZE} 个）
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
