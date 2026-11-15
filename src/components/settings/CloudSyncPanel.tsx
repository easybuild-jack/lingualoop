'use client'

import React, { useState } from 'react'
import { Check, Cloud, CloudOff, Database, Loader2, RefreshCw, Upload } from 'lucide-react'
import {
  clearCloudConfig,
  getCloudConfig,
  isCloudConfigured,
  isCloudMode,
  isOfflineFallback,
  normalizeSupabaseUrl,
  saveCloudConfig,
  setOfflineFallback,
} from '@/core/cloud/config'
import { probeCloudConnection } from '@/core/cloud/client'
import { uploadLocalDataToCloud, type MigrationResult } from '@/core/cloud/migrate'

interface Feedback {
  tone: 'ok' | 'error' | 'info'
  text: string
}

function formatStats(result: MigrationResult): string {
  const parts = [
    result.books ? `词库 ${result.books}` : '',
    result.words ? `生词记录 ${result.words}` : '',
    result.progress ? `单元进度 ${result.progress}` : '',
    result.overrides ? `单词修改 ${result.overrides}` : '',
    result.translateBooks ? `自定义句库 ${result.translateBooks}` : '',
    result.readingArticles ? `阅读文章 ${result.readingArticles}` : '',
  ].filter(Boolean)
  if (parts.length === 0) {
    return '云端已是最新，无需上传（已存在的条目不会被覆盖）。'
  }
  return `已上传：${parts.join('、')}。${result.skipped ? `跳过 ${result.skipped} 条云端已存在的记录。` : ''}`
}

/**
 * 云数据库（Supabase）配置面板。
 *
 * 配置了就跨设备；没配置就一切留在本机。设置项（AI Key、皮肤、音量）永远不入库。
 */
export function CloudSyncPanel() {
  const existing = getCloudConfig()
  const [url, setUrl] = useState(existing?.url ?? '')
  const [anonKey, setAnonKey] = useState(existing?.anonKey ?? '')
  const [busy, setBusy] = useState<'idle' | 'testing' | 'saving' | 'uploading'>('idle')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [migration, setMigration] = useState<MigrationResult | null>(null)

  const configured = isCloudConfigured()
  const cloudActive = isCloudMode()
  const fallback = isOfflineFallback()

  const statusLabel = !configured ? '未配置（本地模式）' : cloudActive ? '已连接云端' : '已配置但使用本地模式'
  const statusTone = !configured
    ? 'bg-transparent text-muted-foreground border-border'
    : cloudActive
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'

  const handleTest = async () => {
    if (!url.trim() || !anonKey.trim()) {
      setFeedback({ tone: 'error', text: '请先填写项目地址和 anon key。' })
      return
    }
    setBusy('testing')
    setFeedback(null)
    const result = await probeCloudConnection({
      url: normalizeSupabaseUrl(url),
      anonKey: anonKey.trim(),
      configuredAt: 0,
    })
    setBusy('idle')
    setFeedback({ tone: result.ok ? 'ok' : 'error', text: result.message })
  }

  const handleSave = () => {
    if (!url.trim() || !anonKey.trim()) {
      setFeedback({ tone: 'error', text: '请先填写项目地址和 anon key。' })
      return
    }
    setBusy('saving')
    saveCloudConfig(url, anonKey)
    // 切换数据源需要把各页面/store 的初始状态全部重建，重载一次最省事也最可靠
    window.location.reload()
  }

  const handleUpload = async () => {
    setBusy('uploading')
    setFeedback(null)
    setMigration(null)
    try {
      const result = await uploadLocalDataToCloud()
      setMigration(result)
      setFeedback({ tone: 'ok', text: formatStats(result) })
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : '上传失败，请检查网络与数据库权限。',
      })
    } finally {
      setBusy('idle')
    }
  }

  const handleDisconnect = () => {
    clearCloudConfig()
    window.location.reload()
  }

  const handleRestoreCloud = () => {
    setOfflineFallback(false)
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">跨设备数据同步 (Cloud Database)</h3>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            配置 Supabase 后，错词本、学习进度、自定义词库、翻译题库与上传的阅读文章都会存进数据库，换设备登录同一份配置即可继续学。
            未配置时全部数据只留在本机，与本机模式完全一致。
          </p>
        </div>
        <span className={`shrink-0 self-start px-3 py-1 rounded-full text-xs font-semibold border ${statusTone}`}>
          {configured ? '● ' : '○ '}
          {statusLabel}
        </span>
      </div>

      <div className="p-6 rounded-lg border border-border space-y-4">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">项目地址 (Project URL)</label>
            <input
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://xxxxxxxx.supabase.co"
              spellCheck={false}
              className="w-full bg-transparent border border-border rounded-md px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">
              anon public key
            </label>
            <textarea
              value={anonKey}
              onChange={(event) => setAnonKey(event.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full bg-transparent border border-border rounded-md px-4 py-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none break-all"
            />
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              位置：Supabase 控制台 → Project Settings → API。该 key 会长期保存在本机浏览器，请勿使用 service_role key。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={busy !== 'idle'}
            className="h-9 px-4 rounded-lg border border-border bg-background/60 hover:bg-muted text-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {busy === 'testing' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span>测试连接</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy !== 'idle'}
            className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {busy === 'saving' ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
            <span>{configured ? '保存并重新加载' : '保存并启用'}</span>
          </button>
          {configured && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy !== 'idle'}
              className="h-9 px-4 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <CloudOff className="size-4" />
              <span>断开配置</span>
            </button>
          )}
        </div>

        {feedback && (
          <div
            className={`flex items-start gap-2 p-3.5 rounded-xl border text-sm leading-relaxed ${
              feedback.tone === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : feedback.tone === 'error'
                  ? 'bg-red-500/10 border-red-500/25 text-red-300'
                  : 'bg-muted/40 border-border text-muted-foreground'
            }`}
          >
            {feedback.tone === 'ok' ? <Check className="size-4 mt-0.5 shrink-0" /> : null}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {configured && (
        <div className="p-6 rounded-lg border border-border space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <span>本地数据迁移</span>
            </h4>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              首次配置数据库后，可以把这个浏览器里已有的数据上传一次。只补齐云端没有的记录，不会覆盖云端已有数据。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={busy !== 'idle' || !cloudActive}
            className="h-9 px-4 rounded-lg border border-border bg-background/60 hover:bg-muted text-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {busy === 'uploading' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            <span>上传本地数据到云端</span>
          </button>
          {!cloudActive && (
            <p className="text-xs text-amber-400/90 leading-relaxed">
              当前处于本地模式，先在下方恢复云端连接后再上传。
            </p>
          )}
          {fallback && (
            <button
              type="button"
              onClick={handleRestoreCloud}
              className="h-9 px-4 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="size-4" />
              <span>恢复云端连接（以云端数据为准）</span>
            </button>
          )}
          {migration && (
            <p className="text-xs text-muted-foreground leading-relaxed">{formatStats(migration)}</p>
          )}
        </div>
      )}

      <div className="p-6 rounded-lg border border-border space-y-3">
        <h4 className="text-sm font-semibold text-foreground">建表脚本</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">
          首次使用需要在 Supabase 控制台的 SQL Editor 里执行仓库中的{' '}
          <code className="text-primary font-mono font-semibold">supabase/schema.sql</code>
          ，它会创建所需数据表并开放 anon 读写权限。执行完成后点「测试连接」确认。
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          外部翻译小工具可以直接向 <code className="font-mono">collected_words</code> 表插入待收单词；未配置数据库时本应用不会收词。
        </p>
      </div>
    </div>
  )
}
