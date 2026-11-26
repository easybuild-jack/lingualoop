'use client'

import React, { useMemo } from 'react'
import { type RadioItem } from '@/resources/radioData'
import { Play, Video, Trash2, Volume2, ChevronLeft, ChevronRight } from 'lucide-react'

export const RADIO_PAGE_SIZE = 30

interface RadioCardListProps {
  items: RadioItem[]
  currentId: string | null
  isPlaying: boolean
  /** 云模式下为自定义条目显示 个人 / 共享 徽标 */
  cloudMode?: boolean
  /** 是否显示场景分类等副标题信息（仅「场景对话」Tab 开启，日常短语与英语电台只显示名称） */
  showMetadata?: boolean
  page: number
  onPageChange: (page: number) => void
  emptyTitle?: string
  emptyHint?: string
  onSelectItem: (item: RadioItem) => void
  onTogglePlay: () => void
  onDeleteItem: (id: string) => void
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

function formatDuration(seconds: number): string {
  // 文件夹里的视频是懒加载的，没读过元数据前显示占位符而不是 00:00
  if (!seconds || seconds <= 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function itemScopeBadge(item: RadioItem): { label: string; className: string } | null {
  if (item.isOfficial || item.isLocal) return null
  if (item.accountId) {
    return { label: '个人', className: 'bg-primary/10 text-primary' }
  }
  return { label: '共享', className: 'bg-emerald-500/10 text-emerald-400' }
}

export function RadioCardList({
  items,
  currentId,
  isPlaying,
  cloudMode = false,
  showMetadata = false,
  page,
  onPageChange,
  emptyTitle = '暂无视频内容',
  emptyHint = '点击右上角「添加视频」添加自定义视频',
  onSelectItem,
  onTogglePlay,
  onDeleteItem,
}: RadioCardListProps) {
  const totalPages = Math.max(1, Math.ceil(items.length / RADIO_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const startIndex = (safePage - 1) * RADIO_PAGE_SIZE
  const pagedItems = useMemo(
    () => items.slice(startIndex, startIndex + RADIO_PAGE_SIZE),
    [items, startIndex]
  )
  const pageNumbers = useMemo(() => buildPageNumbers(safePage, totalPages), [safePage, totalPages])

  if (items.length === 0) {
    return (
      <div className="py-16 text-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-foreground">{emptyTitle}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b border-border">
        <span>
          共 <span className="font-mono text-foreground">{items.length}</span> 个视频
          {totalPages > 1 && (
            <span className="ml-2">
              · 第 <span className="font-mono text-foreground">{safePage}</span> /{' '}
              <span className="font-mono">{totalPages}</span> 页
            </span>
          )}
        </span>
        <span>点击即可播放</span>
      </div>

      <ol className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
        {pagedItems.map((item, idx) => {
          const isCurrent = item.id === currentId
          const scopeBadge = cloudMode ? itemScopeBadge(item) : null

          return (
            <li
              key={item.id}
              onClick={() => {
                if (isCurrent) {
                  onTogglePlay()
                } else {
                  onSelectItem(item)
                }
              }}
              className="group flex items-center gap-4 py-3 border-b border-border cursor-pointer"
            >
              <span className="w-7 text-right font-mono text-xs tabular-nums text-muted-foreground/70 shrink-0">
                {isCurrent && isPlaying ? (
                  <Volume2 className="size-3.5 text-primary animate-pulse ml-auto" />
                ) : (
                  <>
                    <span className="group-hover:hidden">{String(startIndex + idx + 1).padStart(2, '0')}</span>
                    <Play className="size-3.5 text-foreground fill-current ml-auto hidden group-hover:block" />
                  </>
                )}
              </span>

              <div className="relative size-11 rounded-md bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden">
                {item.poster ? (
                  <img src={item.poster} alt={item.title} className="size-full object-cover" />
                ) : (
                  <Video className="size-4.5 text-muted-foreground" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h4
                    className={`text-sm line-clamp-1 transition-colors ${
                      isCurrent ? 'text-primary font-medium' : 'text-foreground group-hover:text-primary'
                    }`}
                    title={item.title}
                  >
                    {item.title}
                  </h4>
                  {scopeBadge && (
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] leading-none ${scopeBadge.className}`}>
                      {scopeBadge.label}
                    </span>
                  )}
                </div>
                {item.isOfficial && item.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1" title={item.description}>
                    {item.description}
                  </p>
                ) : item.folderName ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1" title={item.folderName}>
                    {item.folderName}
                  </p>
                ) : (
                  showMetadata && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.scenario} · 已看 <span className="font-mono">{item.playCount}</span> 次
                    </p>
                  )
                )}
              </div>

              <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                {formatDuration(item.duration)}
              </span>

              {item.isOfficial || item.folderId ? (
                <span className="size-7 shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteItem(item.id)
                  }}
                  className="size-7 rounded-md flex items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0"
                  title="移除该视频"
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
              {Math.min(startIndex + RADIO_PAGE_SIZE, items.length)}
            </span>{' '}
            个视频（每页最多 {RADIO_PAGE_SIZE} 个）
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
