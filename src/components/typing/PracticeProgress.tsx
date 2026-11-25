'use client'

import React from 'react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

interface PracticeProgressProps {
  /** 页面数据是否就绪；未就绪时显示占位符 */
  isReady?: boolean
  className?: string
}

/** 练习进度文案：`6 / 202 单词`；错词攻坚默写时改写为已消灭数量 */
export function PracticeProgress({ isReady = true, className = '' }: PracticeProgressProps) {
  const activeWordIndex = useWorkspaceStore((s) => s.activeWordIndex)
  const currentLoadedWords = useWorkspaceStore((s) => s.currentLoadedWords)
  const isErrorPracticeActive = useWorkspaceStore((s) => s.isErrorPracticeActive)
  const conqueredErrorWordIds = useWorkspaceStore((s) => s.conqueredErrorWordIds)
  const mode = useWorkspaceStore((s) => s.mode)
  const isUnitLoading = useWorkspaceStore((s) => s.isUnitLoading)

  const total = currentLoadedWords.length || 20
  const currentNum = Math.min(activeWordIndex + 1, total)
  const isDictationError = isErrorPracticeActive && mode === 'dictation'
  const isPreparing = !isReady || isUnitLoading

  return (
    <div className={`flex items-baseline gap-1.5 tabular-nums whitespace-nowrap ${className}`}>
      <span className="text-foreground font-medium">
        {isPreparing
          ? '···'
          : isDictationError
            ? `${conqueredErrorWordIds?.length || 0} / ${total}`
            : `${currentNum} / ${total}`}
      </span>
      <span className="text-muted-foreground">{isDictationError ? '已消灭' : '单词'}</span>
    </div>
  )
}
