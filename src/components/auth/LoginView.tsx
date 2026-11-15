'use client'

import React, { useCallback, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, LogOut } from 'lucide-react'
import { SkinPicker } from '@/components/layout/SkinPicker'
import {
  getCloudSession,
  isCloudConfigured,
  isCloudMode,
  setOfflineFallback,
  subscribeCloudMode,
} from '@/core/cloud/config'
import { logoutAccount } from '@/core/cloud/account'
import { flushCloudSync } from '@/core/cloud/sync'
import { LookingWordmark, type EyeState } from './LookingWordmark'
import { AccountAuthForm, type AccountAuthMode } from './AccountAuthForm'

type LoginState = 'loading' | 'local' | 'offline' | 'signed-out' | 'signed-in'

function readLoginState(): LoginState {
  if (!isCloudConfigured()) return 'local'
  if (!isCloudMode()) return 'offline'
  return getCloudSession() ? 'signed-in' : 'signed-out'
}

/** 只接受站内路径，防止 ?next= 被拿来跳到外站 */
function resolveNextPath(): string {
  if (typeof window === 'undefined') return '/learn'
  const next = new URLSearchParams(window.location.search).get('next') ?? ''
  return next.startsWith('/') && !next.startsWith('//') && next !== '/login' ? next : '/learn'
}

/**
 * 登录 / 注册页：账号名 + 密码。
 *
 * 只有配置了云数据库才需要登录；没配置时这里只提示「数据保存在本机，无需登录」。
 * 登录成功后账号 id 保存在本机，整页跳转让所有 store 按该账号重新载入。
 * 字标里的两只眼睛会看向当前操作的区域。
 */
export function LoginView() {
  const loginState = useSyncExternalStore<LoginState>(subscribeCloudMode, readLoginState, () => 'loading')
  const [mode, setMode] = useState<AccountAuthMode>('login')
  const [gazeTarget, setGazeTarget] = useState<HTMLElement | null>(null)
  const [eyeState, setEyeState] = useState<EyeState>('open')
  const [leaving, setLeaving] = useState(false)

  const handleGaze = useCallback((target: HTMLElement | null, state: EyeState) => {
    setGazeTarget(target)
    setEyeState(state)
  }, [])

  const goNext = () => {
    setLeaving(true)
    window.location.replace(resolveNextPath())
  }

  const useLocalMode = () => {
    setOfflineFallback(true)
    goNext()
  }

  // 先把上一个账号待推送的进度发完，再整页重载：内存里上一个账号的进度不能留到下一个账号登录后
  const switchAccount = async () => {
    setLeaving(true)
    await flushCloudSync()
    logoutAccount()
    window.location.reload()
  }

  const subtitle =
    loginState === 'signed-out'
      ? mode === 'register'
        ? '创建账号，之后可在任意设备同步'
        : '登录后同步词库、生错词本和学习进度'
      : '您的私人专属英语学习搭子'

  const session = loginState === 'signed-in' ? getCloudSession() : null

  return (
    <div className="flex-1 min-h-full flex flex-col text-foreground">
      <header className="flex items-center justify-between px-6 h-14 shrink-0">
        <img src="/logo111.png" alt="LinguaLoop" className="size-7 object-contain" />
        <div className="flex items-center gap-3">
          {loginState === 'signed-out' ? (
            <button
              type="button"
              onClick={useLocalMode}
              className="text-[14px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              暂不登录，临时用本地模式
              <ArrowRight className="size-3.5" />
            </button>
          ) : (
            <Link
              href="/learn"
              className="text-[14px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              {loginState === 'signed-in' ? '进入学习' : '跳过，继续本地使用'}
              <ArrowRight className="size-3.5" />
            </Link>
          )}
          <SkinPicker />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[360px]">
          <LookingWordmark gazeTarget={gazeTarget} eyeState={eyeState} className="text-center" />
          <p className="mt-3 text-center text-[14px] text-muted-foreground">{subtitle}</p>

          <div className="pt-9">
            {loginState === 'loading' && (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}

            {(loginState === 'local' || loginState === 'offline') && (
              <div className="space-y-5">
                <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
                  {loginState === 'local'
                    ? '当前未配置云数据库，所有数据都保存在这台设备上，无需登录。需要跨设备同步时，请先在「设置 → 云同步」里配置数据库，再回到这里登录。'
                    : '当前处于临时本地模式，数据保存在这台设备上。恢复云端连接后需要登录账号。'}
                </p>
                <Link
                  href="/learn"
                  className="w-full h-10 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors inline-flex items-center justify-center"
                >
                  继续使用
                </Link>
              </div>
            )}

            {loginState === 'signed-in' && session && (
              <div className="space-y-4">
                <p className="text-center text-sm text-muted-foreground">
                  已登录账号 <span className="font-medium text-foreground">{session.displayName || session.username}</span>
                </p>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={leaving}
                  className="w-full h-10 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  继续学习
                </button>
                <button
                  type="button"
                  onClick={() => void switchAccount()}
                  disabled={leaving}
                  className="w-full h-10 rounded-md border border-border text-sm text-foreground hover:bg-muted transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <LogOut className="size-4" />
                  切换账号
                </button>
              </div>
            )}

            {loginState === 'signed-out' && (
              <AccountAuthForm mode={mode} onModeChange={setMode} onGaze={handleGaze} onSuccess={goNext} />
            )}
          </div>

          {loginState === 'signed-out' && (
            <p className="mt-10 text-center text-xs text-muted-foreground">
              继续即表示同意{' '}
              <a href="#" className="underline underline-offset-2 hover:text-foreground transition-colors">
                用户协议
              </a>{' '}
              和{' '}
              <a href="#" className="underline underline-offset-2 hover:text-foreground transition-colors">
                隐私政策
              </a>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
