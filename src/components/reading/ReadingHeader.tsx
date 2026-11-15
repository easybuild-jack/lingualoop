'use client'

import React from 'react'
import { Plus, Search } from 'lucide-react'
import { SkinPicker } from '@/components/layout/SkinPicker'

interface ReadingHeaderProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  totalCount: number
  onOpenUpload: () => void
}

export function ReadingHeader({
  searchQuery,
  onSearchChange,
  totalCount,
  onOpenUpload,
}: ReadingHeaderProps) {
  return (
    <div className="shrink-0 flex flex-col sm:flex-row sm:items-end justify-between gap-4 select-none">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">文章阅读</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          双语文章沉浸阅读，音标与译文可随时开关 · 共 <span className="font-mono">{totalCount}</span> 篇文章
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-48 sm:w-60">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索文章标题"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-white/[0.05] border border-transparent focus:border-border focus:bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={onOpenUpload}
          className="h-8 px-3 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-[14px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="size-3.5" />
          上传文章
        </button>

        <SkinPicker />
      </div>
    </div>
  )
}

