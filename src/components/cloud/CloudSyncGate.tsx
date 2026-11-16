'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, CloudOff, Database, Loader2, LogOut, RefreshCw, Upload, X } from 'lucide-react'
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
  waitForCloudWrites,
} from '@/core/cloud/progress'
import {
  formatMigrationResult,
  getLocalUploadRecord,
  hasLocalDataToUpload,
  markLocalUploadHandled,
  uploadLocalDataToCloud,
} from '@/core/cloud/migrate'
import { clearLegacyCloudProgressCache } from '@/core/cloud/scopedStorage'
import { pushCloudNotice, subscribeCloudNotices, type CloudNotice } from '@/core/cloud/notices'
import type { ContentVisibility } from '@/core/cloud/visibility'
import { VisibilityPicker } from '@/components/cloud/VisibilityPicker'
import { isChromelessRoute } from '@/lib/chromelessRoutes'

type GateStatus = 'idle' | 'checking' | 'upload' | 'ready' | 'error'

const NOTICE_TIMEOUT_MS = 8000

function loginHref(pathname: string | null): string {
  const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : ''
  return `/login${next}`
}

/**
 * 云数据库连接守卫。
 *
 * 配置了数据库时负责：未登录跳转登录页 → 启动体检 → （本机第一次连这个库且有本地数据时）询问一次是否上传
 * → 从数据库载入进度 → 之后学习进度的变更直接写数据库。
 * 读写失败不重发：连不上或写入失败时显示「暂不可用」，重试会从数据库重新载入；其他失败在页面顶部提示。
 * 未配置数据库时什么都不做，与纯本地版本完全一致。
 */
export function CloudSyncGate() {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<GateStatus>('idle')
  const [message, setMessage] = useState('')
  const [notices, setNotices] = useState<CloudNotice[]>([])
  const [uploadVisibility, setUploadVisibility] = useState<ContentVisibility>('personal')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
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

  const fail = useCallback(
    (text: string) => {
      stopWrites()
      markCloudHydrated()
      setMessage(text)
      setStatus('error')
    },
    [stopWrites]
  )

  const loadAndStart = useCallback(async () => {
    try {
      await loadWorkspaceProgress()
      await loadTranslateProgress()
      markCloudHydrated()
      cleanupsRef.current.push(startWorkspaceProgressWrites(), startTranslateProgressWrites())
      setStatus('ready')
    } catch (error) {
      fail(error instanceof Error ? error.message : '从数据库载入数据失败')
    }
  }, [fail])

  const start = useCallback(async () => {
    stopWrites()
    resetCloudHydration()

    if (!isCloudConfigured() || !isCloudMode()) {
      markCloudHydrated()
      setStatus('idle')
      return
    }

    if (!getCloudSession()) {
      markCloudHydrated()
      setStatus('idle')
      if (!isChromelessRoute(pathnameRef.current)) router.replace(loginHref(pathnameRef.current))
      return
    }

    setStatus('checking')
    const probe = await probeCloudConnection()
    if (!probe.ok) {
      fail(probe.message)
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
      if (!getLocalUploadRecord() && (await hasLocalDataToUpload())) {
        setUploadError('')
        setStatus('upload')
        return
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : '云数据库初始化失败')
      return
    }
    await loadAndStart()
  }, [fail, loadAndStart, router, stopWrites])

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
    const unsubscribeNotices = subscribeCloudNotices((notice) => {
      if (notice.unavailable) {
        fail(notice.text)
        return
      }
      setNotices((prev) => [...prev.slice(-2), notice])
      setTimeout(() => setNotices((prev) => prev.filter((item) => item.id !== notice.id)), NOTICE_TIMEOUT_MS)
    })
    const handleOffline = () => {
      if (!isCloudMode()) return
      fail('网络已断开，云数据库暂时不可用。')
    }
    window.addEventListener('offline', handleOffline)
    return () => {
      stopWrites()
      unsubscribe()
      unsubscribeNotices()
      window.removeEventListener('offline', handleOffline)
    }
  }, [fail, start, stopWrites])

  // 未登录时访问任何业务页面都回到登录页
  useEffect(() => {
    if (!isCloudMode() || getCloudSession() || isChromelessRoute(pathname)) return
    router.replace(loginHref(pathname))
  }, [pathname, router])

  const useLocalMode = () => {
    stopWrites()
    setOfflineFallback(true)
  }

  const handleRelogin = async () => {
    await waitForCloudWrites()
    stopWrites()
    logoutAccount()
  }

  const handleUpload = async () => {
    setUploadBusy(true)
    setUploadError('')
    try {
      const result = await uploadLocalDataToCloud(uploadVisibility)
      markLocalUploadHandled(true)
      pushCloudNotice(formatMigrationResult(result))
      setStatus('checking')
      await loadAndStart()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '上传失败，请稍后再试。')
    } finally {
      setUploadBusy(false)
    }
  }

  const handleSkipUpload = async () => {
    markLocalUploadHandled(false)
    setStatus('checking')
    await loadAndStart()
  }

  return (
    <>
      {notices.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[2100] w-full max-w-lg px-4 space-y-2">
          {notices.map((notice) => (
            <div
              key={notice.id}
              role={notice.tone === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
                notice.tone === 'error'
                  ? 'border-red-500/30 bg-red-950/80 text-red-200'
                  : 'border-border bg-sidebar/95 text-foreground'
              }`}
            >
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
          ))}
        </div>
      )}

      {status === 'upload' && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
          <div className="w-full max-w-md rounded-2xl border border-border bg-sidebar text-foreground shadow-2xl">
            <div className="flex items-start gap-3 p-6 pb-4">
              <div className="size-10 shrink-0 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                <Database className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight">上传本机数据到数据库</h2>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  这台设备在本地模式下有学习数据。是否上传到当前账号？只会询问这一次，之后所有数据都直接读写数据库。
                </p>
              </div>
            </div>
            <div className="px-6 pb-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>错词本、单元进度、学习位置和翻译记录归当前账号；自定义词库、句库和阅读文章按下面的选择保存。数据库里已有的条目不会被覆盖。</p>
              <VisibilityPicker value={uploadVisibility} onChange={setUploadVisibility} />
              {uploadError && <p className="text-red-400 text-xs">{uploadError}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => void handleSkipUpload()}
                disabled={uploadBusy}
                className="h-9 px-4 rounded-lg border border-border bg-background/60 hover:bg-muted text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                不上传
              </button>
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={uploadBusy}
                className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                {uploadBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                <span>上传</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
          <div className="w-full max-w-md rounded-2xl border border-border bg-sidebar text-foreground shadow-2xl">
            <div className="flex items-start gap-3 p-6 pb-4">
              <div className="size-10 shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight">云数据库暂不可用</h2>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{message}</p>
              </div>
            </div>

            <div className="px-6 pb-4">
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                「重试连接」会从数据库重新载入数据，本页还没写进数据库的改动不会保留。
                也可以临时改用本地模式：数据保存在这台设备，不会上传；之后切回云端以数据库为准。
                如果是首次配置或刚升级，请先在 Supabase 的 SQL Editor 里执行最新的 supabase/schema.sql。
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => void handleRelogin()}
                className="h-9 px-4 rounded-lg border border-border bg-background/60 hover:bg-muted text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="size-4" />
                <span>退出登录</span>
              </button>
              <button
                type="button"
                onClick={useLocalMode}
                className="h-9 px-4 rounded-lg border border-border bg-background/60 hover:bg-muted text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CloudOff className="size-4" />
                <span>临时用本地模式</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="size-4" />
                <span>重试连接</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
