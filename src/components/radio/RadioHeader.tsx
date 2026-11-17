'use client'

import React from 'react'
import { FolderPlus, Plus, Search } from 'lucide-react'
import { SkinPicker } from '@/components/layout/SkinPicker'

interface RadioHeaderProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  totalCount: number
  onOpenUpload: () => void
  /** 右侧主按钮文案；「本地视频」Tab 下会换成选择本地文件 */
  actionLabel?: string
  /** 可选：主按钮左侧的次要操作（「本地视频」Tab 用来选择文件夹） */
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  secondaryActionDisabled?: boolean
}

export function RadioHeader({
  searchQuery,
  onSearchChange,
  totalCount,
  onOpenUpload,
  actionLabel = '添加视频',
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionDisabled = false,
}: RadioHeaderProps) {
  return (
    <div className="shrink-0 flex flex-col sm:flex-row sm:items-end justify-between gap-4 select-none">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">听力广场</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          母语级影音听力，随身磨耳朵 · 共 <span className="font-mono">{totalCount}</span> 个视频
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-48 sm:w-60">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索视频标题"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-white/[0.05] border border-transparent focus:border-border focus:bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors"
          />
        </div>

        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            disabled={secondaryActionDisabled}
            className="h-8 px-3 rounded-md border border-border text-[14px] font-medium text-foreground inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 hover:bg-muted disabled:opacity-50 disabled:cursor-default"
          >
            <FolderPlus className="size-3.5" />
            {secondaryActionLabel}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenUpload}
          className="h-8 px-3 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-[14px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="size-3.5" />
          {actionLabel}
        </button>

        <SkinPicker />
      </div>
    </div>
  )
}
