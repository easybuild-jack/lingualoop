'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  AlertCircle,
  Settings,
  GraduationCap,
  PenLine,
  Sprout,
  SpellCheck,
  Languages,
  Keyboard,
  BookA,
  Mic,
  Radio,
  BookText,
  MessagesSquare,
} from 'lucide-react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useSpeakingStore } from '@/store/useSpeakingStore'
import { isChromelessRoute } from '@/lib/chromelessRoutes'

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  comingSoon?: boolean
}

export function AppSidebar() {
  const pathname = usePathname()
  const setSettingsModalOpen = useWorkspaceStore((state) => state.setSettingsModalOpen)
  const speakingOpen = useSpeakingStore((state) => state.isOpen)
  const toggleSpeaking = useSpeakingStore((state) => state.toggle)

  const navItems: NavItem[] = [
    { label: '单词查询', icon: BookA, href: '/dictionary' },
    { label: '单词学习', icon: GraduationCap, href: '/learn' },
    { label: '单词默写', icon: PenLine, href: '/dictation' },
    { label: '音标学习', icon: Mic, href: '/phonetics/learn' },
    { label: '音标练习', icon: Keyboard, href: '/phonetics' },
    { label: '词库管理', icon: BookOpen, href: '/books' },
    { label: '生错词本', icon: AlertCircle, href: '/errors' },
    { label: '词根词缀', icon: Sprout, href: '/roots' },
    { label: '基础语法', icon: SpellCheck, href: '/grammar' },
    { label: '听力广场', icon: Radio, href: '/radio' },
    { label: '句子翻译', icon: Languages, href: '/translate' },
    { label: '文章阅读', icon: BookText, href: '/reading' },
  ]

  // 登录页等独立页面不展示侧边栏
  if (isChromelessRoute(pathname)) return null

  return (
    <aside
      data-sidebar="true"
      className="relative w-56 shrink-0 h-screen sticky top-0 flex flex-col px-3.5 py-5 border-r border-border bg-sidebar z-40 overflow-hidden"
    >
      <div className="shrink-0 px-2.5 pb-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 group"
        >
          <img src="/logo111.png" alt="" className="size-7 shrink-0 object-contain" />
          <div className="min-w-0 flex flex-col gap-1">
            <h1 className="font-serif text-[23px] font-medium tracking-tight text-foreground leading-none">
              LinguaLoop
            </h1>
            <span className="text-[11px] leading-none text-muted-foreground tracking-[0.3em]">林瓜鲁普</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto custom-scrollbar -mr-3.5 pr-3.5 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          if (item.comingSoon) {
            return (
              <div
                key={item.href}
                aria-disabled
                title="功能开发中，敬请期待"
                className="flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm text-muted-foreground/40 cursor-not-allowed select-none"
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto text-xs">待开放</span>
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (item.href === '/learn') {
                  useWorkspaceStore.getState().setShouldAutoStartLearn(false)
                  if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('lingualoop_auto_start_learn')
                  }
                } else if (item.href === '/dictation') {
                  useWorkspaceStore.getState().setShouldAutoStartDictation(false)
                  if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('lingualoop_auto_start_dictation')
                  }
                }
              }}
              className={`relative flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {isActive && (
                <span className="absolute -left-3.5 top-2 bottom-2 w-0.5 rounded-full bg-primary" />
              )}
              <Icon className={`size-4 shrink-0 ${isActive ? 'text-primary' : ''}`} />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={toggleSpeaking}
          className={`relative w-full flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-colors cursor-pointer ${
            speakingOpen
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
        >
          <MessagesSquare className={`size-4 shrink-0 ${speakingOpen ? 'text-primary' : ''}`} />
          <span className="truncate">口语陪练</span>
          {speakingOpen && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
        </button>
      </nav>

      <div className="shrink-0 pt-3 mt-2 border-t border-border">
        <button
          onClick={() => setSettingsModalOpen(true)}
          className="w-full flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <Settings className="size-4 shrink-0" />
          <span className="truncate">偏好设置</span>
        </button>
      </div>
    </aside>
  )
}
