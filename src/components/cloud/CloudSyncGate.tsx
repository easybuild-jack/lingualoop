'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react'
import { ensureWorkspaceHydrated } from '@/store/useWorkspaceStore'
import { isCloudConfigured, isCloudMode, setOfflineFallback, subscribeCloudMode } from '@/core/cloud/config'
import { probeCloudConnection, type CloudProbeStatus } from '@/core/cloud/client'
import {
  hydrateTranslateProgress,
  hydrateWorkspaceProgress,
  startTranslateSync,
  startWorkspaceProgressSync,
} from '@/core/cloud/sync'

type GateStatus = 'idle' | 'checking' | 'ready' | 'error'

/**
 * 云数据库连接守卫。
 *
 * 配置了数据库时负责：启动体检 → 从云端拉回进度 → 启动变更推送。
 * 连不上时给出「重试 / 临时改用本地模式」两个出口，
 * 选本地模式后业务数据回到浏览器，且不会与云端互相覆盖（下次恢复云端以云端为准）。
 */
export function CloudSyncGate() {
  const [status, setStatus] = useState<GateStatus>('idle')
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState<CloudProbeStatus>('unknown')
  const cleanupsRef = useRef<Array<() => void>>([])

  const stopSync = useCallback(() => {
    cleanupsRef.current.forEach((dispose) => dispose())
    cleanupsRef.current = []
  }, [])

  const start = useCallback(async () => {
    stopSync()

    if (!isCloudConfigured() || !isCloudMode()) {
      setStatus('idle')
      return
    }

    setStatus('checking')
    const probe = await probeCloudConnection()
    if (!probe.ok) {
      setKind(probe.status)
      setMessage(probe.message)
      setStatus('error')
      return
    }

    try {
      await ensureWorkspaceHydrated()
      await hydrateWorkspaceProgress()
      await hydrateTranslateProgress()
      cleanupsRef.current.push(startWorkspaceProgressSync(), startTranslateSync())
      setStatus('ready')
    } catch (error) {
      setKind('unknown')
      setMessage(error instanceof Error ? error.message : '云数据库初始化失败')
      setStatus('error')
    }
  }, [stopSync])

  useEffect(() => {
    // 放到微任务里启动，避免在 effect 体内同步 setState 触发级联渲染
    queueMicrotask(() => void start())
    const unsubscribe = subscribeCloudMode(() => void start())
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

  const useLocalMode = () => {
    setOfflineFallback(true)
    stopSync()
    window.location.reload()
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
              : '请先检查设置里的项目地址与 anon key；如果是首次配置，还需要先在 Supabase 的 SQL Editor 里执行建表脚本。'}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
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
