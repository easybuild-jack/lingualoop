'use client'

import React, { useState } from 'react'
import { Check, Cloud, CloudOff, Database, KeyRound, Loader2, LogOut, RefreshCw, Upload, UserRound } from 'lucide-react'
import {
  clearCloudConfig,
  getCloudConfig,
  getCloudSession,
  isCloudConfigured,
  isCloudMode,
  isOfflineFallback,
  normalizeSupabaseUrl,
  saveCloudConfig,
  setOfflineFallback,
} from '@/core/cloud/config'
import { probeCloudConnection } from '@/core/cloud/client'
import { changeAccountPassword, logoutAccount, PASSWORD_MIN_LENGTH } from '@/core/cloud/account'
import { uploadLocalDataToCloud, type ContentVisibility, type MigrationResult } from '@/core/cloud/migrate'
import { hydrateTranslateProgress, hydrateWorkspaceProgress } from '@/core/cloud/sync'
import { VisibilityPicker } from '@/components/cloud/VisibilityPicker'

interface Feedback {
  tone: 'ok' | 'error' | 'info'
  text: string
}

function formatStats(result: MigrationResult): string {
  const parts = [
    result.books ? `词库 ${result.books}` : '',
    result.words ? `生词记录 ${result.words}` : '',
    result.progress ? `单元进度 ${result.progress}` : '',
    result.bookProgress ? `书内位置 ${result.bookProgress}` : '',
    result.appState ? '学习位置' : '',
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
 * 配置了就需要登录账号、跨设备同步；没配置就一切留在本机。设置项（AI Key、皮肤、音量）永远不入库。
 */
export function CloudSyncPanel() {
  const existing = getCloudConfig()
  const session = getCloudSession()
  const [url, setUrl] = useState(existing?.url ?? '')
  const [anonKey, setAnonKey] = useState(existing?.anonKey ?? '')
  const [busy, setBusy] = useState<'idle' | 'testing' | 'saving' | 'uploading' | 'password'>('idle')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [migration, setMigration] = useState<MigrationResult | null>(null)
  const [uploadVisibility, setUploadVisibility] = useState<ContentVisibility>('personal')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null)

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
      const result = await uploadLocalDataToCloud(uploadVisibility)
      setMigration(result)
      setFeedback({ tone: 'ok', text: formatStats(result) })
      // 新补上的学习位置与翻译记录立即生效，不必刷新页面
      await hydrateWorkspaceProgress()
      await hydrateTranslateProgress()
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

  const handleLogout = () => {
    logoutAccount()
    window.location.replace('/login')
  }

  const handleChangePassword = async () => {
    setPasswordFeedback(null)
    if (!oldPassword || !newPassword) {
      setPasswordFeedback({ tone: 'error', text: '请填写原密码和新密码。' })
      return
    }
    setBusy('password')
    try {
      await changeAccountPassword(oldPassword, newPassword)
      setOldPassword('')
      setNewPassword('')
      setPasswordFeedback({ tone: 'ok', text: '密码已修改，下次登录请使用新密码。' })
    } catch (error) {
      setPasswordFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : '修改密码失败，请稍后重试。',
      })
    } finally {
      setBusy('idle')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">跨设备数据同步 (Cloud Database)</h3>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            配置 Supabase 后需要登录账号：错词本、学习进度按账号保存，自定义词库、句库、阅读文章与影音可选「个人」或「共享」，换设备登录同一账号即可继续学。
            未配置时全部数据只留在本机，无需登录，与本机模式完全一致。
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

      {configured && cloudActive && (
        <div className="p-6 rounded-lg border border-border space-y-4">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <UserRound className="size-4 text-primary" />
            <span>当前账号</span>
          </h4>
          {session ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  已登录 <span className="font-medium text-foreground">{session.displayName || session.username}</span>
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="h-9 px-4 rounded-lg border border-border bg-background/60 hover:bg-muted text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="size-4" />
                  <span>退出登录</span>
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  placeholder="原密码"
                  className="h-9 w-full bg-transparent border border-border rounded-md px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={`新密码（至少 ${PASSWORD_MIN_LENGTH} 位）`}
                  className="h-9 w-full bg-transparent border border-border rounded-md px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                />
                <button
                  type="button"
                  onClick={() => void handleChangePassword()}
                  disabled={busy !== 'idle'}
                  className="h-9 px-4 rounded-lg border border-border bg-background/60 hover:bg-muted text-sm inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {busy === 'password' ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  <span>修改密码</span>
                </button>
              </div>
              {passwordFeedback && (
                <p
                  className={`text-xs leading-relaxed ${
                    passwordFeedback.tone === 'ok' ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {passwordFeedback.text}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">尚未登录，云端数据按账号保存，请先登录。</p>
              <a
                href="/login"
                className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium inline-flex items-center transition-colors"
              >
                去登录
              </a>
            </div>
          )}
        </div>
      )}

      {configured && (
        <div className="p-6 rounded-lg border border-border space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <span>本地数据迁移</span>
            </h4>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              把这个浏览器在本地模式下的数据上传到当前账号：错词本、单元进度（含官方词库）、学习位置与翻译记录归当前账号；
              自定义词库、句库与阅读文章按下方选择存为个人或共享。只补齐云端没有的记录，不会覆盖云端已有数据。
            </p>
          </div>
          <VisibilityPicker value={uploadVisibility} onChange={setUploadVisibility} />
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={busy !== 'idle' || !cloudActive || !session}
            className="h-9 px-4 rounded-lg border border-border bg-background/60 hover:bg-muted text-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {busy === 'uploading' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            <span>上传本地数据到当前账号</span>
          </button>
          {!cloudActive && (
            <p className="text-xs text-amber-400/90 leading-relaxed">
              当前处于本地模式，先在下方恢复云端连接后再上传。
            </p>
          )}
          {cloudActive && !session && (
            <p className="text-xs text-amber-400/90 leading-relaxed">请先登录账号再上传。</p>
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
          ，它会创建账号表与所需数据表并开放读写权限；从旧版本升级时重新执行一次即可。执行完成后点「测试连接」确认。
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          外部翻译小工具可以直接向 <code className="font-mono">collected_words</code> 表插入待收单词（可带 account_id 指定账号）；
          未配置数据库或未登录时本应用不会收词。
        </p>
      </div>
    </div>
  )
}
