'use client'

import React, { useCallback, useEffect, useState, useMemo, useRef, useSyncExternalStore } from 'react'
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
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal'
import { isCloudMode, subscribeCloudMode } from '@/core/cloud/config'
import { reportCloudError } from '@/core/cloud/notices'
import { subscribeCloudRefresh } from '@/core/cloud/realtime'
import { getRepositories } from '@/db/repository'

type ReadingScopeFilter = 'all' | 'personal' | 'shared' | 'sample'

const STORAGE_KEY = 'lingualoop_reading_articles_v1'

function loadInitialArticles(): ReadingArticle[] {
  // 云模式下本地存的是本地模式那份文章，不能先展示出来，等云端列表返回
  if (typeof window === 'undefined' || isCloudMode()) return DEFAULT_READING_ARTICLES
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        // 只保留用户自定义文章，固定示例始终以代码里的 DEFAULT_READING_ARTICLES 为准
        const customOnly = (parsed as ReadingArticle[]).filter((a) => Boolean(a?.isCustom))
        return [...customOnly, ...DEFAULT_READING_ARTICLES]
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

  const cloudMode = useSyncExternalStore(subscribeCloudMode, isCloudMode, () => false)

  // 搜索、筛选、分页与上传弹窗状态
  const [searchQuery, setSearchQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ReadingScopeFilter>('all')
  const [listPage, setListPage] = useState(1)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [articleToDelete, setArticleToDelete] = useState<ReadingArticle | null>(null)
  const [isDeletingArticle, setIsDeletingArticle] = useState(false)
  // 云模式下列表返回前不允许增删，避免基于不完整的列表写库
  const [isCloudLoading, setIsCloudLoading] = useState(() => isCloudMode())
  // 按需加载单篇云端文章正文的状态
  const [loadingArticleId, setLoadingArticleId] = useState<string | null>(null)
  const loadingArticleRef = useRef<string | null>(null)

  // 按需加载单篇云端文章的正文（paragraphs），加载后缓存到列表状态里
  const ensureArticleBodyLoaded = useCallback((article: ReadingArticle | null | undefined) => {
    if (!article || !isCloudMode() || article.paragraphsLoaded !== false) return
    if (loadingArticleRef.current === article.id) return
    loadingArticleRef.current = article.id
    setLoadingArticleId(article.id)
    setActionError(null)
    getRepositories()
      .reading.getArticle(article.id)
      .then((full) => {
        if (!full) return
        setArticles((prev) => prev.map((item) => (item.id === full.id ? full : item)))
      })
      .catch((error) => {
        console.warn('[reading] failed to load article body:', error)
        reportCloudError(error, '读取文章正文')
        setActionError(`文章正文加载失败：${error instanceof Error ? error.message : '请稍后重试'}`)
      })
      .finally(() => {
        if (loadingArticleRef.current === article.id) {
          loadingArticleRef.current = null
          setLoadingArticleId(null)
        }
      })
  }, [])

  // 云模式下先只拉文章列表元数据（按需加载正文），切回页面时实时重查并保留未变更文章的已缓存正文
  useEffect(() => {
    if (!isCloudMode()) return
    let cancelled = false
    const loadCloudArticles = (isInitial: boolean) => {
      getRepositories()
        .reading.getArticleSummaries()
        .then((remote) => {
          if (cancelled) return
          const remoteIds = new Set(remote.map((article) => article.id))
          setArticles((prev) => {
            const prevById = new Map(prev.map((item) => [item.id, item]))
            const hydratedRemote = remote.map((summary) => {
              const cached = prevById.get(summary.id)
              if (
                cached &&
                cached.paragraphsLoaded !== false &&
                cached.updatedAt !== undefined &&
                cached.updatedAt === summary.updatedAt
              ) {
                return { ...summary, paragraphs: cached.paragraphs, paragraphsLoaded: true }
              }
              return summary
            })
            return [
              ...hydratedRemote,
              ...DEFAULT_READING_ARTICLES.filter((article) => !remoteIds.has(article.id)),
            ]
          })
          setLoadError(null)
          setCurrentId((prev) => {
            if (remoteIds.has(prev) || DEFAULT_READING_ARTICLES.some((a) => a.id === prev)) return prev
            return remote[0]?.id || DEFAULT_READING_ARTICLES[0]?.id || ''
          })
        })
        .catch((error) => {
          console.warn('[reading] failed to load cloud articles:', error)
          reportCloudError(error, '读取文章')
          if (!cancelled && isInitial) {
            setLoadError('云数据库读取失败，暂时只能看到内置示例文章，上传与删除已暂停。')
          }
        })
        .finally(() => {
          if (!cancelled && isInitial) setIsCloudLoading(false)
        })
    }
    loadCloudArticles(true)
    const unsubscribe = subscribeCloudRefresh(() => loadCloudArticles(false))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const saveLocalArticles = (nextList: ReadingArticle[]) => {
    try {
      // 本地只持久化自定义文章，固定示例由代码提供
      const customOnly = nextList.filter((article) => Boolean(article.isCustom))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customOnly))
    } catch {
      // ignore storage errors
    }
  }

  const cloudWritable = !isCloudMode() || (!isCloudLoading && !loadError)

  // 当前正在阅读的文章
  const currentArticle = useMemo(() => {
    return articles.find((a) => a.id === currentId) || articles[0] || null
  }, [articles, currentId])

  // 各归属分类数量统计
  const scopeCounts = useMemo(() => {
    let personal = 0
    let shared = 0
    let sample = 0
    for (const article of articles) {
      if (!article.isCustom) {
        sample += 1
      } else if (!cloudMode || article.accountId) {
        personal += 1
      } else {
        shared += 1
      }
    }
    return { all: articles.length, personal, shared, sample }
  }, [articles, cloudMode])

  const scopeTabs = useMemo(() => {
    if (cloudMode) {
      return [
        { id: 'all' as const, label: '全部', count: scopeCounts.all },
        { id: 'personal' as const, label: '个人', count: scopeCounts.personal },
        { id: 'shared' as const, label: '共享', count: scopeCounts.shared },
        { id: 'sample' as const, label: '示例', count: scopeCounts.sample },
      ]
    }
    return [
      { id: 'all' as const, label: '全部', count: scopeCounts.all },
      { id: 'personal' as const, label: '自定义', count: scopeCounts.personal },
      { id: 'sample' as const, label: '示例', count: scopeCounts.sample },
    ]
  }, [cloudMode, scopeCounts])

  // 按归属分类与搜索词过滤后的文章列表
  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return articles.filter((article) => {
      if (scopeFilter === 'sample' && article.isCustom) return false
      if (scopeFilter === 'personal') {
        if (!article.isCustom) return false
        if (cloudMode && !article.accountId) return false
      }
      if (scopeFilter === 'shared') {
        if (!article.isCustom || article.accountId) return false
      }
      if (q && !article.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [articles, scopeFilter, cloudMode, searchQuery])

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

  // 点击删除：打开二次确认弹窗（固定示例不可删）
  const handleDeleteArticle = (id: string) => {
    if (!cloudWritable) return
    const target = articles.find((a) => a.id === id)
    if (!target?.isCustom) return
    setArticleToDelete(target)
  }

  // 确认永久删除：云模式先真实删库，成功后再更新列表；本地模式同步删除 localStorage
  const handleConfirmDeleteArticle = async () => {
    if (!articleToDelete || !cloudWritable) return
    const target = articleToDelete
    setIsDeletingArticle(true)
    setActionError(null)
    try {
      if (isCloudMode()) {
        await getRepositories().reading.deleteArticle(target.id)
      }
      const next = articles.filter((a) => a.id !== target.id)
      setArticles(next)
      if (currentId === target.id) {
        setCurrentId(next[0]?.id || '')
      }
      if (!isCloudMode()) {
        saveLocalArticles(next)
      }
      setArticleToDelete(null)
    } catch (error) {
      console.warn('[reading] failed to delete article:', error)
      reportCloudError(error, '删除文章')
      setActionError(`文章删除失败：${error instanceof Error ? error.message : '请稍后重试'}`)
    } finally {
      setIsDeletingArticle(false)
    }
  }

  return (
    <div className="reading-page flex-1 min-h-full w-full flex flex-col bg-background text-foreground animate-fadeIn pb-20">
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-5 sm:px-8 lg:px-10 pt-6 space-y-5">
        {/* 顶部标题、搜索与上传入口 */}
        <ReadingHeader
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q)
            setListPage(1)
          }}
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
              onClick={() => {
                setActiveTab('reader')
                ensureArticleBodyLoaded(currentArticle)
              }}
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
                onClick={() => {
                  setActiveTab('reader')
                  ensureArticleBodyLoaded(currentArticle)
                }}
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
        <div className={activeTab === 'list' ? 'space-y-5 animate-fadeIn' : 'hidden'}>
          {/* 归属筛选标签：全部 / 个人 / 共享 / 示例 */}
          <div className="shrink-0 flex items-center gap-1 overflow-x-auto max-w-full custom-scrollbar select-none -ml-2.5">
            {scopeTabs.map((tab) => {
              const active = scopeFilter === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setScopeFilter(tab.id)
                    setListPage(1)
                  }}
                  className={`shrink-0 h-7 px-2.5 rounded-md text-[14px] transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {tab.label}
                  <span className="ml-1 text-[12px] font-mono opacity-60">{tab.count}</span>
                </button>
              )
            })}
          </div>

          <ReadingArticleList
            articles={filteredArticles}
            currentId={currentId}
            cloudMode={cloudMode}
            page={listPage}
            onPageChange={setListPage}
            onSelectArticle={(article) => {
              setCurrentId(article.id)
              setActiveTab('reader')
              ensureArticleBodyLoaded(article)
            }}
            onDeleteArticle={handleDeleteArticle}
          />
        </div>

        {/* Tab 2：阅读页 */}
        <div className={activeTab === 'reader' ? 'animate-fadeIn' : 'hidden'}>
          <ReadingReaderView
            article={currentArticle}
            isLoading={
              Boolean(currentArticle) &&
              (loadingArticleId === currentArticle?.id || currentArticle?.paragraphsLoaded === false)
            }
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

      {/* 删除文章二次确认弹窗 */}
      <ConfirmDeleteModal
        isOpen={Boolean(articleToDelete)}
        title="永久删除自定义文章"
        targetName={articleToDelete?.title ?? ''}
        details={[
          cloudMode ? '该文章将从云端数据库真实删除' : '该文章将从本机存储真实删除',
        ]}
        isDeleting={isDeletingArticle}
        onCancel={() => setArticleToDelete(null)}
        onConfirm={() => void handleConfirmDeleteArticle()}
      />
    </div>
  )
}
