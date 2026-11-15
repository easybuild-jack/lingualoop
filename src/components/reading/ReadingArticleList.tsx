'use client'

import React from 'react'
import { BookOpen, Trash2 } from 'lucide-react'
import { type ReadingArticle, countArticleSentences } from '@/resources/readingData'

interface ReadingArticleListProps {
  articles: ReadingArticle[]
  currentId: string
  onSelectArticle: (article: ReadingArticle) => void
  onDeleteArticle: (id: string) => void
}

export function ReadingArticleList({
  articles,
  currentId,
  onSelectArticle,
  onDeleteArticle,
}: ReadingArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="py-16 text-center rounded-lg border border-dashed border-border select-none">
        <p className="text-sm text-foreground">暂无匹配的文章</p>
        <p className="mt-1.5 text-xs text-muted-foreground">点击右上角「上传文章」添加自定义双语阅读文章</p>
      </div>
    )
  }

  return (
    <div className="select-none">
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b border-border">
        <span>
          共 <span className="font-mono text-foreground">{articles.length}</span> 篇文章
        </span>
        <span>点击即可进入阅读</span>
      </div>

      <ol className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
        {articles.map((article, idx) => {
          const isCurrent = article.id === currentId
          const sentenceCount = countArticleSentences(article)

          return (
            <li
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className="group flex items-center gap-4 py-3.5 border-b border-border cursor-pointer"
            >
              <span className="w-6 text-right font-mono text-xs tabular-nums text-muted-foreground/70 shrink-0">
                {String(idx + 1).padStart(2, '0')}
              </span>

              <div className="size-10 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
                <BookOpen className="size-4 text-muted-foreground" />
              </div>

              <div className="min-w-0 flex-1">
                <h4
                  className={`text-sm truncate transition-colors ${
                    isCurrent ? 'text-primary font-medium' : 'text-foreground group-hover:text-primary'
                  }`}
                  title={article.title}
                >
                  {article.title}
                </h4>
              </div>

              <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                {sentenceCount} 句
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteArticle(article.id)
                }}
                className="size-7 rounded-md flex items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0"
                title="移除该文章"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

