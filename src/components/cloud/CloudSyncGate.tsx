'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CloudOff, RefreshCw, X } from 'lucide-react'
import { ensureLocalWorkspaceHydrated } from '@/store/useWorkspaceStore'
import {
  cloudScopeSignature,
  getCloudSession,
  isCloudConfigured,
  isCloudMode,
  setOfflineFallback,
  subscribeCloudMode,
} from '@/core/cloud/config'
import { probeCloudConnection } from '@/core/cloud/client'
import { logoutAccount, verifyCurrentAccount } from '@/core/cloud/account'
import { markCloudHydrated, resetCloudHydration } from '@/core/cloud/readiness'
import {
  loadTranslateProgress,
  loadWorkspaceProgress,
  startTranslateProgressWrites,
  startWorkspaceProgressWrites,
} from '@/core/cloud/progress'
import { clearLegacyCloudProgressCache } from '@/core/cloud/scopedStorage'
import { pushCloudNotice, subscribeCloudNotices, type CloudNotice } from '@/core/cloud/notices'
import { isChromelessRoute } from '@/lib/chromelessRoutes'

const INFO_TIMEOUT_MS = 8000
const ERROR_TIMEOUT_MS = 15000
const MAX_NOTICES = 3

function loginHref(pathname: string | null): string {
  const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : ''
  return `/login${next}`
}

/**
 * 云数据库连接守卫。
 *
 * 配置了数据库时负责：未登录跳转登录页 → 启动体检 → 从数据库载入进度 → 之后学习进度的变更直接写数据库。
 * 这里没有任何本地与数据库之间的同步（手动同步在设置面板里）。
 * 失败不重发、不遮挡页面：在顶部提示原因；连不上数据库时提示里带「重新加载 / 临时用本地模式」。
 * 启动时没能从数据库载入进度就不启动进度写入，避免用默认值覆盖数据库。
 * 未配置数据库时什么都不做，与纯本地版本完全一致。
 */
export function CloudSyncGate() {
  const router = useRouter()
  const pathname = usePathname()
  const [notices, setNotices] = useState<CloudNotice[]>([])
  const cleanupsRef = useRef<Array<() => void>>([])
  const pathnameRef = useRef(pathname)
  const scopeRef = useRef<string | null>(null)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  const stopWrites = useCallback(() => {
    cleanupsRef.current.forEach((dispose) => dispose())
    cleanupsRef.current = []
  }, [])

  const start = useCallback(async () => {
    stopWrites()
    resetCloudHydration()

    if (!isCloudConfigured() || !isCloudMode()) {
      markCloudHydrated()
      return
    }

    if (!getCloudSession()) {
      markCloudHydrated()
      if (!isChromelessRoute(pathnameRef.current)) router.replace(loginHref(pathnameRef.current))
      return
    }

    const probe = await probeCloudConnection()
    if (!probe.ok) {
      markCloudHydrated()
      pushCloudNotice(`云数据库暂时连不上：${probe.message}`, 'error', true)
      return
    }

    try {
      if (!(await verifyCurrentAccount())) {
        logoutAccount()
        window.location.replace(loginHref(pathnameRef.current))
        return
      }
      await ensureLocalWorkspaceHydrated()
      clearLegacyCloudProgressCache()
      await loadWorkspaceProgress()
      await loadTranslateProgress()
      markCloudHydrated()
      cleanupsRef.current.push(startWorkspaceProgressWrites(), startTranslateProgressWrites())
    } catch (error) {
      markCloudHydrated()
      const reason = error instanceof Error ? error.message : '请稍后重试'
      pushCloudNotice(`从数据库载入学习进度失败：${reason}。本次的学习位置不会保存，请重新加载。`, 'error', true)
    }
  }, [router, stopWrites])

  useEffect(() => {
    scopeRef.current = cloudScopeSignature()
    // 放到微任务里启动，避免在 effect 体内同步 setState 触发级联渲染
    queueMicrotask(() => void start())
    const unsubscribe = subscribeCloudMode(() => {
      // 模式、数据库或账号变了（包括其他标签页里的操作）：整页重载，避免内存数据与写入目标错位
      // 登录页登录成功后会自己整页跳转，这里不抢先重载
      if (cloudScopeSignature() === scopeRef.current) return
      stopWrites()
      if (pathnameRef.current !== '/login') window.location.reload()
    })
    const dismiss = (id: number) => setNotices((prev) => prev.filter((item) => item.id !== id))
    const unsubscribeNotices = subscribeCloudNotices((notice) => {
      // 同样的提示只留最新一条，避免连续失败时刷屏
      setNotices((prev) => [...prev.filter((item) => item.text !== notice.text), notice].slice(-MAX_NOTICES))
      setTimeout(() => dismiss(notice.id), notice.tone === 'error' ? ERROR_TIMEOUT_MS : INFO_TIMEOUT_MS)
    })
    const handleOffline = () => {
      if (isCloudMode()) pushCloudNotice('网络已断开，云数据库暂时连不上，期间的操作不会保存。', 'error', true)
    }
    window.addEventListener('offline', handleOffline)
    return () => {
      stopWrites()
      unsubscribe()
      unsubscribeNotices()
      window.removeEventListener('offline', handleOffline)
    }
  }, [start, stopWrites])

  // 未登录时访问任何业务页面都回到登录页
  useEffect(() => {
    if (!isCloudMode() || getCloudSession() || isChromelessRoute(pathname)) return
    router.replace(loginHref(pathname))
  }, [pathname, router])

  const useLocalMode = () => {
    stopWrites()
    setOfflineFallback(true)
  }

  if (notices.length === 0) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[2100] w-full max-w-lg px-4 space-y-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
            notice.tone === 'error'
              ? 'border-red-500/30 bg-red-950/80 text-red-200'
              : 'border-border bg-sidebar/95 text-foreground'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="flex-1 leading-relaxed">{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotices((prev) => prev.filter((item) => item.id !== notice.id))}
              className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="关闭提示"
            >
              <X className="size-4" />
            </button>
          </div>
          {notice.unavailable && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-7 px-3 rounded-md border border-red-400/30 hover:bg-red-500/10 text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="size-3.5" />
                <span>重新加载</span>
              </button>
              <button
                type="button"
                onClick={useLocalMode}
                className="h-7 px-3 rounded-md border border-red-400/30 hover:bg-red-500/10 text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CloudOff className="size-3.5" />
                <span>临时用本地模式</span>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
