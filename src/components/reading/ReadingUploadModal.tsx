'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { X, Upload, Check, AlertCircle } from 'lucide-react'
import {
  type ReadingArticle,
  SAMPLE_UPLOAD_TEMPLATE,
  parseReadingArticleContent,
} from '@/resources/readingData'
import { dictionaryLoader } from '@/core/dictionaryLoader'

interface ReadingUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onAddArticle: (article: ReadingArticle) => void
}

export function ReadingUploadModal({
  isOpen,
  onClose,
  onAddArticle,
}: ReadingUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [rawContent, setRawContent] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      // 预热离线词典索引，支持只填两列「英文 | 译文」时同步自动生成音标
      dictionaryLoader.ensureLexiconIndex()
    }
  }, [isOpen])

  const resetForm = () => {
    setTitle('')
    setRawContent('')
    setError('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const parsedParagraphs = useMemo(() => {
    return parseReadingArticleContent(rawContent)
  }, [rawContent])

  const parsedSentenceCount = useMemo(() => {
    return parsedParagraphs.reduce((sum, p) => sum + p.length, 0)
  }, [parsedParagraphs])

  if (!isOpen) return null

  const handleFillSample = () => {
    setTitle('Reflections on Growth & Patience · 关于成长与耐心的思考')
    setRawContent(SAMPLE_UPLOAD_TEMPLATE)
    setError('')
  }

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_UPLOAD_TEMPLATE], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'reading-article-template.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = (ev.target?.result as string) || ''
      setRawContent(content)
      if (!title.trim()) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''))
      }
      setError('')
    }
    reader.readAsText(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      setError('请输入文章标题')
      return
    }

    if (parsedSentenceCount === 0) {
      setError('请按规定格式输入至少一句有效内容')
      return
    }

    const newArticle: ReadingArticle = {
      id: `reading_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      paragraphs: parsedParagraphs,
      isCustom: true,
      createdAt: Date.now(),
    }

    onAddArticle(newArticle)
    handleClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fadeIn select-none">
      <div className="w-full max-w-3xl h-[660px] max-h-[92vh] rounded-xl border border-border bg-sidebar p-6 flex flex-col gap-4 shadow-xl text-foreground overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="shrink-0 flex items-center justify-between border-b border-border pb-3.5">
          <div>
            <h3 className="text-base font-semibold text-foreground">上传自定义文章</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              支持按规定格式直接粘贴文本，或上传 .txt / .csv 文件
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="size-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 文章标题 */}
        <div className="shrink-0">
          <label className="block text-xs text-muted-foreground mb-1.5">
            文章标题 <span className="text-primary">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (error) setError('')
            }}
            placeholder="例如：The Art of Slow Reading · 慢读的艺术"
            className="w-full h-9 px-3 rounded-md border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* 规定格式说明卡片 */}
        <div className="shrink-0 rounded-md border border-border bg-card p-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground">
              规定格式：每行一句（空行分段），用竖线 <code className="text-primary font-mono">|</code> 分隔「英文 | 音标 | 译文」
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleFillSample}
                className="text-primary hover:underline cursor-pointer"
              >
                填入示例文章
              </button>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-accent hover:underline cursor-pointer"
              >
                下载标准模板 (.txt)
              </button>
            </div>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            示例：Reading shapes the mind. | ˈriːdɪŋ ʃeɪps ðə maɪnd | 阅读塑造心智。
          </p>
          <p className="text-xs text-muted-foreground">
            提示：若只填两列 <code className="font-mono text-foreground">英文 | 译文</code>，系统将自动从本地 5 万词库补全每个单词的音标。
          </p>
        </div>

        {/* 文本粘贴 / 文件上传 */}
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <div className="shrink-0 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              文章内容（已识别 <span className="font-mono text-primary">{parsedSentenceCount}</span> 个有效句子）
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-foreground hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Upload className="size-3.5" />
              <span>从本地文件读取 (.txt / .csv) →</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <textarea
            value={rawContent}
            onChange={(e) => {
              setRawContent(e.target.value)
              if (error) setError('')
            }}
            placeholder={`Reading shapes the mind. | ˈriːdɪŋ ʃeɪps ðə maɪnd | 阅读塑造心智。\nEvery book opens a window to a new world. | ˈevri bʊk ˈəʊpənz ə ˈwɪndəʊ tuː ə njuː wɜːld | 每本书都打开一扇通往新世界的窗。`}
            className="flex-1 min-h-0 w-full p-3.5 rounded-md border border-border bg-muted font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 outline-none resize-none focus:border-primary transition-colors custom-scrollbar"
          />
        </div>

        {/* 底部按钮 */}
        <div className="shrink-0 flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs text-destructive flex items-center gap-1.5">
            {error && (
              <>
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{error}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="h-9 px-4 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="h-9 px-4 rounded-md text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="size-3.5" />
              <span>保存并开始阅读</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
