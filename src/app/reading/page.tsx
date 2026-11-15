'use client'

import React, { useState, useMemo } from 'react'
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

const STORAGE_KEY = 'lingualoop_reading_articles_v1'

function loadInitialArticles(): ReadingArticle[] {
  if (typeof window === 'undefined') return DEFAULT_READING_ARTICLES
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
  const [isUploadOpen, setIsUploadOpen] = useState(false)

  // 持久化文章列表
  const persistArticles = (nextList: ReadingArticle[]) => {
    setArticles(nextList)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList))
    } catch {
      // ignore storage errors
    }
  }

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

  // 新增自定义文章
  const handleAddArticle = (newArticle: ReadingArticle) => {
    const next = [newArticle, ...articles]
    persistArticles(next)
    setCurrentId(newArticle.id)
    setActiveTab('reader')
  }

  // 删除文章
  const handleDeleteArticle = (id: string) => {
    const next = articles.filter((a) => a.id !== id)
    persistArticles(next)
    if (currentId === id) {
      setCurrentId(next[0]?.id || '')
    }
  }

  return (
    <div className="reading-page flex-1 min-h-full w-full flex flex-col bg-background text-foreground animate-fadeIn pb-20">
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-5 sm:px-8 lg:px-10 pt-6 space-y-5">
        {/* 顶部标题、搜索与上传入口 */}
        <ReadingHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalCount={articles.length}
          onOpenUpload={() => setIsUploadOpen(true)}
        />

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
