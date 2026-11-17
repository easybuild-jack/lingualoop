'use client'

import React, { useState } from 'react'
import {
  type RadioItem,
  type RadioCategory,
  type RadioScenario,
  RADIO_CATEGORY_LABELS,
} from '@/resources/radioData'
import { X, Link2, Check, AlertCircle } from 'lucide-react'
import { CloudVisibilityField } from '@/components/cloud/VisibilityPicker'
import { contentOwnerFor, type ContentVisibility } from '@/core/cloud/visibility'
import { isCloudSignedIn } from '@/core/cloud/config'

function normalizeMediaUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** 「分 / 秒」两个输入框换算成整数秒，填写不完整或为 0 时返回 null */
function parseDurationSeconds(minutes: string, seconds: string): number | null {
  const m = minutes.trim() ? Number(minutes) : 0
  const s = seconds.trim() ? Number(seconds) : 0
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || s >= 60) return null
  const total = m * 60 + s
  return total > 0 ? total : null
}

interface RadioUploadModalProps {
  isOpen: boolean
  defaultCategory: RadioCategory
  onClose: () => void
  /** 返回 false 表示保存失败（错误已提示），弹窗保持打开 */
  onAddItem: (item: RadioItem) => boolean | Promise<boolean>
}

const CATEGORIES: RadioCategory[] = ['phrases', 'dialogue', 'radio']

const COMMON_SCENARIOS = [
  '日常生活',
  '职场商务',
  '旅游出行',
  '餐饮美食',
  '购物消费',
]

export function RadioUploadModal({
  isOpen,
  defaultCategory,
  onClose,
  onAddItem,
}: RadioUploadModalProps) {
  // 关闭时整棵子树卸载，下次打开时各表单项自然回到初始值，无需手动重置
  if (!isOpen) return null
  return (
    <RadioUploadDialog
      defaultCategory={defaultCategory}
      onClose={onClose}
      onAddItem={onAddItem}
    />
  )
}

interface RadioUploadDialogProps {
  defaultCategory: RadioCategory
  onClose: () => void
  onAddItem: (item: RadioItem) => boolean | Promise<boolean>
}

function RadioUploadDialog({ defaultCategory, onClose, onAddItem }: RadioUploadDialogProps) {
  const [category, setCategory] = useState<RadioCategory>(defaultCategory)
  const [title, setTitle] = useState('')
  const [scenario, setScenario] = useState<RadioScenario>('日常生活')
  const [customScenario, setCustomScenario] = useState('')
  const [error, setError] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [visibility, setVisibility] = useState<ContentVisibility>('personal')
  const [durationMin, setDurationMin] = useState('')
  const [durationSec, setDurationSec] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    const remoteUrl = normalizeMediaUrl(linkUrl)
    if (!remoteUrl) {
      setError('请填写以 http:// 或 https:// 开头的视频链接')
      return
    }

    if (!title.trim()) {
      setError('请输入视频名称')
      return
    }

    const duration = parseDurationSeconds(durationMin, durationSec)
    if (!duration) {
      setError('请填写视频的实际时长（分、秒，秒数 0–59，总时长大于 0）')
      return
    }

    const finalScenario = category === 'dialogue' ? (customScenario.trim() || scenario) : ''

    // 只保存链接：文件本身始终留在原地址，数据库里存 URL 字符串
    const owner = contentOwnerFor(visibility)
    const newItem: RadioItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...(owner !== undefined ? { accountId: owner } : {}),
      category,
      title: title.trim(),
      type: 'video',
      src: remoteUrl,
      duration,
      scenario: finalScenario,
      createdAt: Date.now(),
      playCount: 0,
    }

    setIsSaving(true)
    const saved = await onAddItem(newItem)
    setIsSaving(false)
    if (!saved) {
      setError('保存失败，请稍后重试')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fadeIn select-none">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl bg-sidebar border border-border shadow-xl overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Link2 className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">添加自定义视频</h3>
              <p className="text-xs text-muted-foreground">填写视频链接，保存后即可在列表播放</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 表单内容区 */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 所属模块选择 */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              所属模块
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`h-9 rounded-lg text-xs font-medium transition-all cursor-pointer border ${category === cat
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-card/60 border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {RADIO_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* 视频链接 */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              视频链接 <span className="text-primary">*</span>
            </label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value)
                  if (error) setError('')
                }}
                placeholder="https://example.com/video.mp4"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-card border border-border text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {isCloudSignedIn()
                ? '支持 MP4 / WebM / MOV 直链地址，保存后写入云端数据库。'
                : '支持 MP4 / WebM / MOV 直链地址，需以 http:// 或 https:// 开头。'}
            </p>
            <CloudVisibilityField value={visibility} onChange={setVisibility} label="保存为" className="mt-3" />
          </div>

          {/* 视频名称 */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              视频名称 <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：机场值机与安检实录"
              className="w-full h-9 px-3 rounded-xl bg-card border border-border text-xs sm:text-sm text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* 视频时长：与视频一起保存，列表与统计直接使用 */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              视频时长 <span className="text-primary">*</span>
            </label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder="0"
                aria-label="分钟"
                className="w-20 h-9 px-3 rounded-xl bg-card border border-border text-xs sm:text-sm text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
              />
              <span>分</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
                placeholder="0"
                aria-label="秒"
                className="w-20 h-9 px-3 rounded-xl bg-card border border-border text-xs sm:text-sm text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
              />
              <span>秒</span>
            </div>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              视频链接无法自动读取时长，请填写实际时长。
            </p>
          </div>

          {/* 场景分类：仅「场景对话」可填；其他模块保留同样高度的占位，切换模块时弹窗不会跳动 */}
          <div
            className={category === 'dialogue' ? undefined : 'invisible'}
            aria-hidden={category !== 'dialogue'}
          >
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              所属场景分类
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_SCENARIOS.map((sc) => (
                <button
                  type="button"
                  key={sc}
                  onClick={() => {
                    setScenario(sc)
                    setCustomScenario('')
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer border ${scenario === sc && !customScenario
                    ? 'bg-primary/20 border-primary text-primary font-semibold'
                    : 'bg-card/60 border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {sc}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customScenario}
              onChange={(e) => setCustomScenario(e.target.value)}
              placeholder="或者输入自定义场景名称..."
              className="w-full h-8 px-3 rounded-xl bg-card border border-border/80 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
            />
          </div>
        </form>

        {/* 底部按钮区 */}
        <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-3.5 border-t border-border/60 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={(e) => void handleSubmit(e)}
            disabled={isSaving}
            className="flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Check className="size-3.5" />
            <span>保存并播放</span>
          </button>
        </div>
      </div>
    </div>
  )
}
