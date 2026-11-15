'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { ensureLocalWorkspaceHydrated } from '@/store/useWorkspaceStore'
import {
  cloudScopeSignature,
  getCloudSession,
  isCloudConfigured,
  isCloudMode,
  setOfflineFallback,
  subscribeCloudMode,
} from '@/core/cloud/config'
import { probeCloudConnection, type CloudProbeStatus } from '@/core/cloud/client'
import { logoutAccount, verifyCurrentAccount } from '@/core/cloud/account'
import { markCloudHydrated, resetCloudHydration } from '@/core/cloud/readiness'
import {
  flushCloudSync,
  hydrateTranslateProgress,
  hydrateWorkspaceProgress,
  startFlushOnPageHide,
  startTranslateSync,
  startWorkspaceProgressSync,
} from '@/core/cloud/sync'
import { isChromelessRoute } from '@/lib/chromelessRoutes'

type GateStatus = 'idle' | 'checking' | 'ready' | 'error'

function loginHref(pathname: string | null): string {
  const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : ''
  return `/login${next}`
}

/**
 * 云数据库连接守卫。
 *
 * 配置了数据库时负责：未登录跳转登录页 → 启动体检 → 从云端拉回进度 → 启动变更推送。
 * 连不上时给出「重试 / 临时改用本地模式」两个出口，
 * 选本地模式后业务数据回到浏览器，且不会与云端互相覆盖（下次恢复云端以云端为准）。
 * 未配置数据库时什么都不做，与纯本地版本完全一致。
 */
export function CloudSyncGate() {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<GateStatus>('idle')
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState<CloudProbeStatus>('unknown')
  const cleanupsRef = useRef<Array<() => void>>([])
  const pathnameRef = useRef(pathname)
  const scopeRef = useRef<string | null>(null)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  const stopSync = useCallback(() => {
    flushCloudSync()
    cleanupsRef.current.forEach((dispose) => dispose())
    cleanupsRef.current = []
  }, [])

  const start = useCallback(async () => {
    stopSync()
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
      markCloudHydrated()
      setKind(probe.status)
      setMessage(probe.message)
      setStatus('error')
      return
    }

    try {
      if (!(await verifyCurrentAccount())) {
        logoutAccount()
        window.location.replace(loginHref(pathnameRef.current))
        return
      }
      await ensureLocalWorkspaceHydrated()
      await hydrateWorkspaceProgress()
      await hydrateTranslateProgress()
      markCloudHydrated()
      cleanupsRef.current.push(startWorkspaceProgressSync(), startTranslateSync(), startFlushOnPageHide())
      setStatus('ready')
    } catch (error) {
      markCloudHydrated()
      setKind('unknown')
      setMessage(error instanceof Error ? error.message : '云数据库初始化失败')
      setStatus('error')
    }
  }, [router, stopSync])

  useEffect(() => {
    scopeRef.current = cloudScopeSignature()
    // 放到微任务里启动，避免在 effect 体内同步 setState 触发级联渲染
    queueMicrotask(() => void start())
    const unsubscribe = subscribeCloudMode(() => {
      // 模式、数据库或账号变了（包括其他标签页里的操作）：整页重载，避免内存数据与写入目标错位
      // 登录页登录成功后会自己整页跳转，这里不抢先重载
      if (cloudScopeSignature() === scopeRef.current) return
      // 账号已经变了，还没推送的旧账号变更会被 sync 层丢弃，不会写进新账号
      stopSync()
      if (pathnameRef.current !== '/login') window.location.reload()
    })
    const handleOffline = () => {
      if (!isCloudMode()) return
      setKind('network')
      setMessage('网络已断开，云数据库暂时不可用。')
      setStatus('error')
    }
    window.addEventListener('offline', handleOffline)
    return () => {
      stopSync()
      unsubscribe()
      window.removeEventListener('offline', handleOffline)
    }
  }, [start, stopSync])

  // 未登录时访问任何业务页面都回到登录页
  useEffect(() => {
    if (!isCloudMode() || getCloudSession() || isChromelessRoute(pathname)) return
    router.replace(loginHref(pathname))
  }, [pathname, router])

  const useLocalMode = () => {
    stopSync()
    setOfflineFallback(true)
  }

  const handleRelogin = async () => {
    await flushCloudSync()
    stopSync()
    logoutAccount()
  }

  if (status !== 'error') return null

  const isNetworkIssue = kind === 'network'

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-sidebar text-foreground shadow-2xl">
        <div className="flex items-start gap-3 p-6 pb-4">
          <div className="size-10 shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">云数据库连接失败</h2>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="px-6 pb-4">
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {isNetworkIssue
              ? '可以选择临时使用本地模式：数据会保存到这台设备，不会同步到云端；恢复连接后重新切回云端，将以云端数据为准。'
              : '请先检查设置里的项目地址与 anon key；如果是首次配置或刚升级，还需要先在 Supabase 的 SQL Editor 里执行最新的 supabase/schema.sql。'}
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
            onClick={() => void start()}
            className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="size-4" />
            <span>重试连接</span>
          </button>
        </div>
      </div>
    </div>
  )
}
