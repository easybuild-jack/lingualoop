'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ensureLocalWorkspaceHydrated } from '@/store/useWorkspaceStore'
import {
  cloudScopeSignature,
  getCloudSession,
  isCloudConfigured,
  isCloudMode,
  subscribeCloudMode,
} from '@/core/cloud/config'
import { isNetworkCloudError, probeCloudConnection } from '@/core/cloud/client'
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
import { switchToLocalMode, takePendingFallbackNotice } from '@/core/cloud/fallback'
import { isChromelessRoute } from '@/lib/chromelessRoutes'

const INFO_TIMEOUT_MS = 8000
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
 * 连不上数据库时自动切到本地模式（fallback.ts），重载后在顶部提示；其他失败只在顶部提示。都不重发、不遮挡页面。
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
      const pending = takePendingFallbackNotice()
      if (pending) pushCloudNotice(pending, 'error')
      return
    }

    if (!getCloudSession()) {
      markCloudHydrated()
      if (!isChromelessRoute(pathnameRef.current)) router.replace(loginHref(pathnameRef.current))
      return
    }

    const probe = await probeCloudConnection()
    if (!probe.ok) {
      if (probe.status === 'network' && switchToLocalMode(`连接失败：${probe.message}`)) return
      markCloudHydrated()
      pushCloudNotice(`云数据库无法使用：${probe.message}`, 'error')
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
      const reason = error instanceof Error ? error.message : '请稍后重试'
      if (isNetworkCloudError(error) && switchToLocalMode(`载入学习进度失败：${reason}`)) return
      // 没能载入就不启动进度写入，避免用默认值覆盖数据库
      markCloudHydrated()
      pushCloudNotice(`从数据库载入学习进度失败：${reason}。本次的学习位置不会保存，请稍后重新加载。`, 'error')
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
      // 错误提示（包括「已切换到本地模式」）留到用户手动关闭
      if (notice.tone !== 'error') setTimeout(() => dismiss(notice.id), INFO_TIMEOUT_MS)
    })
    const handleOffline = () => {
      switchToLocalMode('网络已断开')
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
        </div>
      ))}
    </div>
  )
}
