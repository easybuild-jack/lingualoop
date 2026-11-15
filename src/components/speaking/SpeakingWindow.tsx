'use client'

import React, { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X, PanelBottomClose, Maximize2, MessagesSquare, Settings2, MoveDiagonal2 } from 'lucide-react'
import { isChromelessRoute } from '@/lib/chromelessRoutes'
import { getScenario } from '@/lib/speaking/scenarios'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import {
  useSpeakingStore,
  EXPANDED_MIN,
  PHASE_LABEL,
  type SpeakingAnchor,
} from '@/store/useSpeakingStore'
import { SpeakingSetup } from './SpeakingSetup'
import { SpeakingChat } from './SpeakingChat'
import { SpeakingSummary } from './SpeakingSummary'
import { SpeakingMicButton } from './SpeakingMicButton'
import { SessionTimer } from './SessionTimer'

const SIDEBAR_W = 224
const EDGE_GAP = 12
const SNAP_RANGE = 28
const MINI_SIZE = { w: 420, h: 60 }

/** 八向缩放：n/s/e/w 是四条边，两两组合是四个角 */
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * 八向缩放：n/s/e/w 是四条边，两两组合是四个角。
 * 手柄贴在窗口外沿（负偏移），不占窗口内侧——内侧右边是消息列表的滚动条，
 * 压上去会导致滚动条拖不动。
 */
const RESIZE_HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: 'n', className: '-top-1.5 left-3 right-3 h-1.5 cursor-ns-resize' },
  { dir: 's', className: '-bottom-1.5 left-3 right-3 h-1.5 cursor-ns-resize' },
  { dir: 'w', className: '-left-1.5 top-3 bottom-3 w-1.5 cursor-ew-resize' },
  { dir: 'e', className: '-right-1.5 top-3 bottom-3 w-1.5 cursor-ew-resize' },
  { dir: 'nw', className: '-left-1.5 -top-1.5 size-3 cursor-nwse-resize' },
  { dir: 'ne', className: '-right-1.5 -top-1.5 size-3 cursor-nesw-resize' },
  { dir: 'sw', className: '-left-1.5 -bottom-1.5 size-3 cursor-nesw-resize' },
  { dir: 'se', className: '-right-1.5 -bottom-1.5 size-3 cursor-nwse-resize' },
]

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** 拖动/缩放期间禁止选中文字，否则整页会被刷蓝 */
function lockPageSelect(locked: boolean) {
  document.body.style.userSelect = locked ? 'none' : ''
}

function useViewport() {
  const [vp, setVp] = useState({ w: 1440, h: 900 })
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return vp
}

/** 口语陪练全局悬浮窗。注意不能使用 role="dialog"：默写页检测到 dialog 会整体停止响应键盘 */
export function SpeakingWindow() {
  const pathname = usePathname()
  const vp = useViewport()
  const isOpen = useSpeakingStore((s) => s.isOpen)
  const mode = useSpeakingStore((s) => s.mode)
  const anchor = useSpeakingStore((s) => s.anchor)
  const size = useSpeakingStore((s) => s.size)
  const view = useSpeakingStore((s) => s.view)
  const setAnchor = useSpeakingStore((s) => s.setAnchor)
  const setBox = useSpeakingStore((s) => s.setBox)
  const setMode = useSpeakingStore((s) => s.setMode)
  const close = useSpeakingStore((s) => s.close)
  const setSettingsModalOpen = useWorkspaceStore((s) => s.setSettingsModalOpen)

  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const movedRef = useRef(false)

  if (isChromelessRoute(pathname)) return null

  const box =
    mode === 'expanded'
      ? {
          w: Math.min(size.w, vp.w - EDGE_GAP * 2),
          h: Math.min(size.h, vp.h - EDGE_GAP * 2),
        }
      : MINI_SIZE

  const centerLeft = Math.round(SIDEBAR_W + (vp.w - SIDEBAR_W - box.w) / 2)
  const centerBottom = Math.round((vp.h - box.h) / 2)
  const rawLeft = typeof anchor?.left === 'number' ? anchor.left : centerLeft
  const rawBottom = typeof anchor?.bottom === 'number' ? anchor.bottom : centerBottom
  const left = Math.max(EDGE_GAP, Math.min(rawLeft, vp.w - box.w - EDGE_GAP))
  const bottom = Math.max(EDGE_GAP, Math.min(rawBottom, vp.h - box.h - EDGE_GAP))

  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, [data-no-drag]')) return
    e.preventDefault()
    movedRef.current = false
    setDragging(true)
    const sx = e.clientX
    const sy = e.clientY
    const start: SpeakingAnchor = { left, bottom }

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true
      setAnchor({
        left: Math.max(EDGE_GAP, Math.min(start.left + dx, vp.w - box.w - EDGE_GAP)),
        bottom: Math.max(EDGE_GAP, Math.min(start.bottom - dy, vp.h - box.h - EDGE_GAP)),
      })
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      lockPageSelect(false)
      // 靠近侧边栏或屏幕边缘时吸附
      const cur = useSpeakingStore.getState().anchor
      if (!cur) return
      const sidebarSnap = SIDEBAR_W + EDGE_GAP
      const rightEdge = vp.w - cur.left - box.w
      const topEdge = vp.h - cur.bottom - box.h
      setAnchor({
        left:
          Math.abs(cur.left - sidebarSnap) < SNAP_RANGE
            ? sidebarSnap
            : cur.left < SNAP_RANGE
              ? EDGE_GAP
              : rightEdge < SNAP_RANGE
                ? vp.w - box.w - EDGE_GAP
                : cur.left,
        bottom: cur.bottom < SNAP_RANGE ? EDGE_GAP : topEdge < SNAP_RANGE ? vp.h - box.h - EDGE_GAP : cur.bottom,
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
      lockPageSelect(true)
  }

  /**
   * 八向自由缩放。窗口用 left/bottom 定位，所以往左拖要同步改 left、往下拖要同步改 bottom，
   * 否则会变成「边拖边跑」。宽高上下限：不小于 EXPANDED_MIN，不超出视口留边。
   */
  const startResize = (e: React.PointerEvent, dir: ResizeDir) => {
    e.preventDefault()
    e.stopPropagation()
    const sx = e.clientX
    const sy = e.clientY
    const start = { w: box.w, h: box.h, left, bottom }
    const maxW = vp.w - EDGE_GAP * 2
    const maxH = vp.h - EDGE_GAP * 2
    setResizing(true)

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      let w = start.w
      let h = start.h
      let nextLeft = start.left
      let nextBottom = start.bottom

      if (dir.includes('e')) {
        // 右边界最多顶到视口右侧留边
        w = clamp(start.w + dx, EXPANDED_MIN.w, Math.min(maxW, vp.w - EDGE_GAP - start.left))
      } else if (dir.includes('w')) {
        // 左边界最多顶到视口左侧留边，右边固定不动
        w = clamp(start.w - dx, EXPANDED_MIN.w, Math.min(maxW, start.left + start.w - EDGE_GAP))
        nextLeft = start.left + (start.w - w)
      }

      if (dir.includes('s')) {
        // 下边界最多顶到视口底部留边，上边固定不动
        h = clamp(start.h + dy, EXPANDED_MIN.h, Math.min(maxH, start.bottom + start.h - EDGE_GAP))
        nextBottom = start.bottom - (h - start.h)
      } else if (dir.includes('n')) {
        h = clamp(start.h - dy, EXPANDED_MIN.h, Math.min(maxH, vp.h - EDGE_GAP - start.bottom))
      }

      setBox({ left: nextLeft, bottom: nextBottom, w, h })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      lockPageSelect(false)
      setResizing(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
      lockPageSelect(true)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.section
          role="complementary"
          aria-label="口语陪练"
          data-speaking=""
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{ left, bottom, width: box.w, height: box.h }}
          className={`group fixed z-50 origin-bottom-left ${
            dragging || resizing ? '' : 'transition-[width,height] duration-200'
          }`}
        >
          {mode === 'mini' && <MiniBar onDrag={startDrag} />}

          {/* 缩放手柄放在圆角容器外面：容器是 overflow-hidden，16px 圆角会把四角手柄裁掉 */}
          {mode === 'expanded' &&
            RESIZE_HANDLES.map((h) => (
              <div
                key={h.dir}
                data-no-drag
                onPointerDown={(e) => startResize(e, h.dir)}
                className={`absolute z-20 rounded-full transition-colors hover:bg-primary/30 ${h.className}`}
              />
            ))}

          {/* 右下角握把：只在悬停窗口时露出来，提示这里可以拖 */}
          {mode === 'expanded' && (
            <div className="pointer-events-none absolute bottom-0.5 right-0.5 z-10 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
              <MoveDiagonal2 className="size-3" />
            </div>
          )}

          {mode === 'expanded' && (
            <div className="relative size-full flex flex-col rounded-2xl border border-border bg-sidebar shadow-2xl overflow-hidden">
              <header
                onPointerDown={startDrag}
                className="shrink-0 h-[60px] px-4 border-b border-border flex items-center gap-2.5 cursor-move select-none"
              >
                <HeaderTitle />
                <div className="ml-auto flex items-center gap-1">
                  <HeaderButton
                    title="语音合成设置"
                    onClick={() => setSettingsModalOpen(true, 'tts')}
                  >
                    <Settings2 className="size-[18px]" />
                  </HeaderButton>
                  <HeaderButton title="收起" onClick={() => setMode('mini')}>
                    <PanelBottomClose className="size-[18px]" />
                  </HeaderButton>
                  <HeaderButton title="关闭" onClick={close}>
                    <X className="size-[18px]" />
                  </HeaderButton>
                </div>
              </header>
              <div className="flex-1 min-h-0 flex flex-col">
                {view === 'setup' && <SpeakingSetup />}
                {view === 'chat' && <SpeakingChat />}
                {view === 'summary' && <SpeakingSummary />}
              </div>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function HeaderButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="size-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
    >
      {children}
    </button>
  )
}

function HeaderTitle() {
  const view = useSpeakingStore((s) => s.view)
  const scenarioId = useSpeakingStore((s) => s.scenarioId)
  const customTopic = useSpeakingStore((s) => s.customTopic)
  const level = useSpeakingStore((s) => s.level)
  const sc = getScenario(scenarioId)

  if (view !== 'chat') {
    return (
      <>
        <div className="size-9 rounded-lg bg-primary/12 text-primary flex items-center justify-center shrink-0">
          <MessagesSquare className="size-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="text-base font-semibold text-foreground">口语陪练</div>
          <div className="text-[13px] text-muted-foreground">{view === 'setup' ? '选择场景，开始一段对话' : '本次练习总结'}</div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="size-8 rounded-lg bg-primary/12 text-primary flex items-center justify-center shrink-0">
        <MessagesSquare className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-semibold text-foreground truncate">
          {sc.roleName} · {customTopic ? '口语搭子' : sc.role}
        </div>
        <div className="text-[13px] text-muted-foreground flex items-center gap-1.5">
          <span className="truncate">{customTopic || sc.title}</span>
          <span>·</span>
          <span>{level}</span>
          <span>·</span>
          <SessionTimer />
        </div>
      </div>
    </>
  )
}

function MiniBar({ onDrag }: { onDrag: (e: React.PointerEvent) => void }) {
  const view = useSpeakingStore((s) => s.view)
  const phase = useSpeakingStore((s) => s.phase)
  const subtitle = useSpeakingStore((s) => s.subtitle)
  const messages = useSpeakingStore((s) => s.messages)
  const speakingMsgId = useSpeakingStore((s) => s.speakingMsgId)
  const speakingSentence = useSpeakingStore((s) => s.speakingSentence)
  const setMode = useSpeakingStore((s) => s.setMode)

  const lastAi = [...messages].reverse().find((m) => m.role === 'ai')
  const speakingMsg = messages.find((m) => m.id === speakingMsgId)
  const line = speakingMsg
    ? speakingMsg.sentences[speakingSentence]
    : lastAi?.sentences[lastAi.sentences.length - 1] ?? ''

  return (
    <div
      onPointerDown={onDrag}
      className="size-full rounded-full border border-border bg-sidebar shadow-xl pl-2.5 pr-1.5 flex items-center gap-3 cursor-move select-none"
    >
      <div className="size-9 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
        <MessagesSquare className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        {view === 'chat' ? (
          <>
            <div className={`text-[15px] truncate ${subtitle === 'off' ? 'text-muted-foreground' : 'text-foreground font-serif'}`}>
              {subtitle === 'off' ? '字幕已关闭' : line}
            </div>
            <div className="text-xs text-muted-foreground truncate">{PHASE_LABEL[phase]}</div>
          </>
        ) : (
          <div className="text-[15px] text-muted-foreground truncate">口语陪练 · 展开开始对话</div>
        )}
      </div>
      <button
        type="button"
        title="展开"
        onClick={() => setMode('expanded')}
        className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
      >
        <Maximize2 className="size-3.5" />
      </button>
      {view === 'chat' && <SpeakingMicButton size="sm" />}
    </div>
  )
}
