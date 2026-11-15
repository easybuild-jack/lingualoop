import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import './globals.css'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { RouteProgressBar } from '@/components/layout/RouteProgressBar'
import { PageTransitionWrapper } from '@/components/layout/PageTransitionWrapper'
import { SkinApplier } from '@/components/layout/SkinApplier'
import { PwaRegistrar } from '@/components/layout/PwaRegistrar'
import { PwaInstallPrompt } from '@/components/layout/PwaInstallPrompt'
import { ImportModal } from '@/components/modals/ImportModal'
import { SettingsModal } from '@/components/modals/SettingsModal'
import { AiApiKeyPromptModal } from '@/components/modals/AiApiKeyPromptModal'
import { CollectedWordsWatcher } from '@/components/cloud/CollectedWordsWatcher'
import { CloudSyncGate } from '@/components/cloud/CloudSyncGate'
import { AiAssistantDrawer } from '@/components/ai/AiAssistantDrawer'
import { AiFloatingTrigger } from '@/components/ai/AiFloatingTrigger'
import { SpeakingWindow } from '@/components/speaking/SpeakingWindow'

export const metadata: Metadata = {
  title: 'LinguaLoop — 您的私人专属英语学习搭子',
  description: '开源、本地优先的英语学习闭环：音标、词汇、语法、听力、阅读、写作与 AI 口语，听说读写一站式完成。',
  applicationName: 'LinguaLoop',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'LinguaLoop',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/icons/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0E1216',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-background text-foreground flex antialiased overflow-hidden">
        {/* 全局顶部路由流光进度条 */}
        <Suspense fallback={null}>
          <RouteProgressBar />
        </Suspense>

        {/* 左侧全局常驻侧边栏 */}
        <AppSidebar />

        {/* 右侧主内容区 */}
        <main className="flex-1 h-screen overflow-y-auto overflow-x-hidden flex flex-col relative custom-scrollbar">
          <PageTransitionWrapper>{children}</PageTransitionWrapper>
        </main>

        {/* 全局 AI 助手抽屉与右侧常驻触发器 */}
        <AiFloatingTrigger />
        <AiAssistantDrawer />

        {/* 口语陪练悬浮窗 */}
        <SpeakingWindow />

        {/* 皮肤应用器（无 UI，挂载即生效） */}
        <SkinApplier />

        {/* PWA：Service Worker 注册器 + 桌面安装提示浮窗（首页不弹出） */}
        <PwaRegistrar />
        <PwaInstallPrompt />

        {/* 全局弹窗 */}
        <ImportModal />
        <SettingsModal />
        <AiApiKeyPromptModal />

        {/* 云数据库连接守卫：配置了数据库时负责体检与进度同步 */}
        <CloudSyncGate />

        {/* 外部工具收词监听器（仅云模式轮询） */}
        <CollectedWordsWatcher />
      </body>
    </html>
  )
}
