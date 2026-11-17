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
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  OG_IMAGE,
  SITE_BRAND,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_URL,
} from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: `%s | ${SITE_BRAND}`,
  },
  description: HOME_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: SITE_BRAND,
    url: '/',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  formatDetection: { telephone: false },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'LinguaLoop',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-elephant.png', type: 'image/png', sizes: '192x192' },
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon-elephant.png',
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
