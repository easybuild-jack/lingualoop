'use client'

import React from 'react'
import { RootsHeaderToolbar } from '@/components/roots/RootsHeaderToolbar'
import { RootsStage } from '@/components/roots/RootsStage'

export default function RootsPage() {
  return (
    // 整页锁定为一屏高：只有表格体滚动，顶部工具栏 + 表头 + 底部分页始终停在原位
    // 注意不能写 flex-1：flex-basis 为 0 时 height 会被忽略，h-screen 失效，页面又变回内容高度
    <div className="shrink-0 h-screen min-h-0 flex flex-col relative overflow-hidden pb-3">
      {/* 头部专属精简工具栏（含词根进度、全局搜索、掌握标记、皮肤与Restart） */}
      <RootsHeaderToolbar />

      {/* 核心词根卡片研习舞台：全高展开，自适应填满纵向可用高度 */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full px-0 py-0.5">
        <RootsStage />
      </div>
    </div>
  )
}
