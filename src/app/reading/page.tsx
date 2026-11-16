'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  type ReadingArticle,
  type ReadingFontSize,
  DEFAULT_READING_ARTICLES,
} from '@/resources/readingData'
import { ReadingHeader } from '@/components/reading/ReadingHeader'
import { ReadingArticleList } from '@/components/reading/ReadingArticleList'
import { ReadingReaderView } from '@/components/reading/ReadingReaderView'
import { ReadingUploadModal } from '@/components/reading/ReadingUploadModal'
import { isCloudMode } from '@/core/cloud/config'
import { reportCloudError } from '@/core/cloud/notices'
import { getRepositories } from '@/db/repository'

const STORAGE_KEY = 'lingualoop_reading_articles_v1'

function loadInitialArticles(): ReadingArticle[] {
  // 云模式下本地存的是本地模式那份文章，不能先展示出来，等云端列表返回
  if (typeof window === 'undefined' || isCloudMode()) return DEFAULT_READING_ARTICLES
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_READING_ARTICLES
}

export default function ReadingPage() {
  // 当前激活的 Tab：'list' (文章列表，默认) | 'reader' (阅读页)
  const [activeTab, setActiveTab] = useState<'list' | 'reader'>('list')

  // 文章列表（支持本地持久化用户上传的文章）
  const [articles, setArticles] = useState<ReadingArticle[]>(loadInitialArticles)
  const [currentId, setCurrentId] = useState<string>(() => loadInitialArticles()[0]?.id || '')

  // 阅读页显示开关与字号
  const [showPhonetic, setShowPhonetic] = useState(true)
  const [showTranslation, setShowTranslation] = useState(true)
  const [fontSize, setFontSize] = useState<ReadingFontSize>('md')

  // 搜索与上传弹窗状态
  const [searchQuery, setSearchQuery] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  // 云模式下列表返回前不允许增删，避免基于不完整的列表写库
  const [isCloudLoading, setIsCloudLoading] = useState(() => isCloudMode())

  // 云模式下用数据库里的文章（内置示例文章仍以代码为准）
  useEffect(() => {
    if (!isCloudMode()) return
    let cancelled = false
    getRepositories()
      .reading.getArticles()
      .then((remote) => {
        if (cancelled) return
        const remoteIds = new Set(remote.map((article) => article.id))
        const merged = [
          ...remote,
          ...DEFAULT_READING_ARTICLES.filter((article) => !remoteIds.has(article.id)),
        ]
        setArticles(merged)
        setCurrentId((prev) => (merged.some((article) => article.id === prev) ? prev : merged[0]?.id || ''))
      })
      .catch((error) => {
        console.warn('[reading] failed to load cloud articles:', error)
        reportCloudError(error, '读取文章')
        if (!cancelled) {
          setLoadError('云数据库读取失败，暂时只能看到内置示例文章，上传与删除已暂停。')
        }
      })
      .finally(() => {
        if (!cancelled) setIsCloudLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveLocalArticles = (nextList: ReadingArticle[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList))
    } catch {
      // ignore storage errors
    }
  }

  const cloudWritable = !isCloudMode() || (!isCloudLoading && !loadError)

  // 当前正在阅读的文章
  const currentArticle = useMemo(() => {
    return articles.find((a) => a.id === currentId) || articles[0] || null
  }, [articles, currentId])

  // 搜索过滤后的文章列表
  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return articles
    return articles.filter((a) => a.title.toLowerCase().includes(q))
  }, [articles, searchQuery])

  // 新增自定义文章：云模式只写这一篇，失败则从列表撤回
  const handleAddArticle = (newArticle: ReadingArticle) => {
    if (!cloudWritable) return
    const next = [newArticle, ...articles]
    setArticles(next)
    setCurrentId(newArticle.id)
    setActiveTab('reader')
    if (!isCloudMode()) {
      saveLocalArticles(next)
      return
    }
    getRepositories()
      .reading.putArticle(newArticle)
      .catch((error) => {
        console.warn('[reading] failed to save article:', error)
        reportCloudError(error, '保存文章')
        setArticles((prev) => prev.filter((article) => article.id !== newArticle.id))
        setActionError(`文章保存失败：${error instanceof Error ? error.message : '请稍后重试'}`)
      })
  }

  // 删除文章：云模式只删这一篇，失败则恢复
  const handleDeleteArticle = (id: string) => {
    if (!cloudWritable) return
    const removed = articles.find((a) => a.id === id)
    const next = articles.filter((a) => a.id !== id)
    setArticles(next)
    if (currentId === id) {
      setCurrentId(next[0]?.id || '')
    }
    if (!isCloudMode()) {
      saveLocalArticles(next)
      return
    }
    if (!removed?.isCustom) return
    getRepositories()
      .reading.deleteArticle(id)
      .catch((error) => {
        console.warn('[reading] failed to delete article:', error)
        reportCloudError(error, '删除文章')
        setArticles((prev) => (prev.some((article) => article.id === id) ? prev : [removed, ...prev]))
        setActionError(`文章删除失败：${error instanceof Error ? error.message : '请稍后重试'}`)
      })
  }

  return (
    <div className="reading-page flex-1 min-h-full w-full flex flex-col bg-background text-foreground animate-fadeIn pb-20">
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-5 sm:px-8 lg:px-10 pt-6 space-y-5">
        {/* 顶部标题、搜索与上传入口 */}
        <ReadingHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalCount={articles.length}
          onOpenUpload={() => {
            if (cloudWritable) setIsUploadOpen(true)
          }}
        />

        {(loadError || actionError) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
            {loadError || actionError}
          </div>
        )}

        {/* 二级 Tab 导航：文章列表 | 阅读页 */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border">
          <div className="flex items-center gap-6 select-none">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`-mb-px pb-2.5 text-sm border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'list'
                  ? 'text-foreground font-medium border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              文章列表
              <span className="ml-1.5 text-xs font-mono text-muted-foreground">
                {filteredArticles.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reader')}
              className={`-mb-px pb-2.5 text-sm border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'reader'
                  ? 'text-foreground font-medium border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              阅读页
            </button>
          </div>

          {activeTab === 'reader' ? (
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className="mb-1.5 self-start sm:self-auto h-7 px-2 rounded-md inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              返回列表
            </button>
          ) : (
            currentArticle && (
              <button
                type="button"
                onClick={() => setActiveTab('reader')}
                className="mb-1.5 hidden sm:inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="前往阅读页"
              >
                当前：
                <span className="text-foreground truncate max-w-[200px] md:max-w-[280px]">
                  {currentArticle.title}
                </span>
                <span className="text-primary">→</span>
              </button>
            )
          )}
        </div>

        {/* Tab 1：文章列表 */}
        <div className={activeTab === 'list' ? 'space-y-6 animate-fadeIn' : 'hidden'}>
          <ReadingArticleList
            articles={filteredArticles}
            currentId={currentId}
            onSelectArticle={(article) => {
              setCurrentId(article.id)
              setActiveTab('reader')
            }}
            onDeleteArticle={handleDeleteArticle}
          />
        </div>

        {/* Tab 2：阅读页 */}
        <div className={activeTab === 'reader' ? 'animate-fadeIn' : 'hidden'}>
          <ReadingReaderView
            article={currentArticle}
            showPhonetic={showPhonetic}
            onTogglePhonetic={() => setShowPhonetic((v) => !v)}
            showTranslation={showTranslation}
            onToggleTranslation={() => setShowTranslation((v) => !v)}
            fontSize={fontSize}
            onChangeFontSize={setFontSize}
          />
        </div>
      </div>

      {/* 按规定格式上传文章弹窗 */}
      <ReadingUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onAddArticle={handleAddArticle}
      />
    </div>
  )
}
