'use client'

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, Loader2, LogOut } from 'lucide-react'
import { getCloudSession, subscribeCloudMode } from '@/core/cloud/config'
import { logoutAccount } from '@/core/cloud/account'
import { waitForCloudWrites } from '@/core/cloud/progress'

/** 返回原始字符串作为 useSyncExternalStore 快照，避免 getCloudSession() 每次返回新对象引致无限重渲染 */
function getSessionSnapshot(): string {
  const s = getCloudSession()
  if (!s) return ''
  return `${s.accountId}\0${s.username}\0${s.displayName ?? ''}`
}

/**
 * 顶部右上角用户头像与账号菜单（仅在已登录云账号时显示）。
 * 点击下拉可退出登录：退出前会等待待发送的学习进度落库，再清理会话并跳转。
 */
export function UserAccountMenu() {
  const pathname = usePathname()
  const snapshot = useSyncExternalStore(subscribeCloudMode, getSessionSnapshot, () => '')

  const [open, setOpen] = useState(false)
  const [exiting, setExiting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  if (!snapshot) return null

  const [, username = '', displayName = ''] = snapshot.split('\0')
  const label = (displayName || username || '用户').trim()
  const avatarChar = Array.from(label)[0]?.toUpperCase() || 'U'

  const handleLogout = async () => {
    if (exiting) return
    setExiting(true)
    try {
      await waitForCloudWrites()
      logoutAccount()
      if (pathname === '/') {
        window.location.reload()
      } else {
        window.location.replace('/login')
      }
    } catch {
      logoutAccount()
      window.location.replace('/login')
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 pl-1.5 pr-2 rounded-full border border-border bg-muted/40 hover:bg-muted/80 inline-flex items-center gap-2 text-sm text-foreground transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        title={label}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span
          className="size-5 rounded-full bg-primary/20 text-primary border border-primary/35 inline-flex items-center justify-center text-[11px] font-semibold shrink-0"
          aria-hidden
        >
          {avatarChar}
        </span>
        <span className="max-w-[96px] truncate text-[13px] font-medium leading-none">{label}</span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[110] w-48 rounded-xl bg-[#12141A] p-1.5 border border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-2 border-b border-white/10 mb-1">
            <div className="text-xs font-medium text-white truncate">{label}</div>
            <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">@{username}</div>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            disabled={exiting}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            {exiting ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
            <span>{exiting ? '正在退出…' : '退出登录'}</span>
          </button>
        </div>
      )}
    </div>
  )
}

