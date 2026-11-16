'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight, X } from 'lucide-react'
import { audioEngine } from '@/core/audioEngine'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { isCloudSignedIn, subscribeCloudMode } from '@/core/cloud/config'
import { pullCollectedWords } from '@/core/cloud/collector'
import { isNetworkCloudError } from '@/core/cloud/client'
import { switchToLocalMode } from '@/core/cloud/fallback'

interface SyncToastItem {
  id: string
  word: string
  meaning?: string
  source?: string
  count?: number
}

const POLL_INTERVAL_MS = 20000

/**
 * 外部工具收词提示。
 *
 * 只在云模式且已登录时轮询收件箱；没配置数据库或未登录时完全不发请求，也就不会收词。
 */
export function CollectedWordsWatcher() {
  const router = useRouter()
  const [toasts, setToasts] = useState<SyncToastItem[]>([])
  const isPollingRef = useRef(false)

  const runOnce = useCallback(async () => {
    if (!isCloudSignedIn() || isPollingRef.current) return
    isPollingRef.current = true
    try {
      const result = await pullCollectedWords()
      if (!result) return

      await useWorkspaceStore.getState().syncStarredWordIds()

      try {
        audioEngine.playCorrectSound(0.4)
      } catch {
        // 音频失败不影响数据
      }

      const latestWord = result.added[result.added.length - 1]
      setToasts((prev) => [
        ...prev.slice(-2),
        {
          id: `toast_${Date.now()}`,
          word: latestWord.name,
          meaning: latestWord.posList?.[0]?.means?.[0] || '',
          source: result.source || '翻译工具',
          count: result.count,
        },
      ])
    } catch (error) {
      console.warn('[CollectedWordsWatcher] pull failed:', error)
      // 收件箱是后台轮询：只有连不上数据库才切到本地模式，其他失败不打扰用户
      if (isNetworkCloudError(error)) switchToLocalMode('收件箱连接失败')
    } finally {
      isPollingRef.current = false
    }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (timer) clearInterval(timer)
      timer = null
      window.removeEventListener('focus', runOnce)
      if (!isCloudSignedIn()) return
      void runOnce()
      timer = setInterval(() => void runOnce(), POLL_INTERVAL_MS)
      window.addEventListener('focus', runOnce)
    }

    startPolling()
    const unsubscribe = subscribeCloudMode(startPolling)

    return () => {
      if (timer) clearInterval(timer)
      window.removeEventListener('focus', runOnce)
      unsubscribe()
    }
  }, [runOnce])

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1))
    }, 6000)
    return () => clearTimeout(timer)
  }, [toasts])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 p-4 rounded-lg bg-sidebar border border-border shadow-lg text-white animate-in slide-in-from-bottom-5 duration-300 select-none"
        >
          <div className="size-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400 mt-0.5">
            <Sparkles className="size-4.5 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                {toast.source || '外部同步'}
              </span>
              {toast.count && toast.count > 1 ? (
                <span className="text-xs text-amber-200/80 font-mono">+{toast.count} 词</span>
              ) : null}
            </div>

            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight text-white">{toast.word}</span>
              {toast.meaning && (
                <span className="text-xs text-gray-300 truncate max-w-[170px]">{toast.meaning}</span>
              )}
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id))
                  router.push('/errors')
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                <span>前往生错词本练习</span>
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="text-gray-400 hover:text-gray-200 p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="关闭提示"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
