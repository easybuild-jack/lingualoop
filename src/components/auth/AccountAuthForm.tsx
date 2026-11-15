'use client'

import React, { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  loginAccount,
  registerAccount,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  validateCredentials,
} from '@/core/cloud/account'
import type { EyeState } from './LookingWordmark'

export type AccountAuthMode = 'login' | 'register'

interface AccountAuthFormProps {
  mode: AccountAuthMode
  onModeChange: (mode: AccountAuthMode) => void
  /** 某个输入框获得焦点时通知字标：看向哪里、眼睛什么状态 */
  onGaze: (target: HTMLElement | null, eyeState: EyeState) => void
  /** 登录或注册成功后调用 */
  onSuccess: () => void
}

const inputClass =
  'h-10 w-full px-3 rounded-md border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary transition-colors'
const labelClass = 'block text-xs text-muted-foreground'

/**
 * 账号名 + 密码的登录 / 注册表单（同页切换）。
 * 账号存在数据库的 accounts 表里，账号名不区分大小写、不能重复，不需要邮箱或验证码。
 */
export function AccountAuthForm({ mode, onModeChange, onGaze, onSuccess }: AccountAuthFormProps) {
  const isRegister = mode === 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const passwordEyeState: EyeState = showPassword ? 'peek' : 'closed'

  const handleTogglePassword = () => {
    const next = !showPassword
    setShowPassword(next)
    const input = document.getElementById('auth-password')
    input?.focus()
    onGaze(input, next ? 'peek' : 'closed')
  }

  const switchMode = () => {
    setError('')
    setConfirmPassword('')
    onModeChange(isRegister ? 'login' : 'register')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')

    if (isRegister) {
      const invalid = validateCredentials(username, password)
      if (invalid) {
        setError(invalid)
        return
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致。')
        return
      }
    } else if (!username.trim() || !password) {
      setError('请输入账号名和密码。')
      return
    }

    setSubmitting(true)
    try {
      if (isRegister) {
        await registerAccount(username, password)
      } else {
        await loginAccount(username, password)
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试。')
      setSubmitting(false)
    }
  }

  const handleBlur = () => onGaze(null, 'open')

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="auth-username" className={cn(labelClass, 'mb-1.5')}>
          账号名
        </label>
        <input
          id="auth-username"
          type="text"
          autoComplete="username"
          autoFocus
          maxLength={USERNAME_MAX_LENGTH}
          placeholder={isRegister ? `1–${USERNAME_MAX_LENGTH} 个字符，不区分大小写` : '请输入账号名'}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onFocus={(e) => onGaze(e.currentTarget, 'open')}
          onBlur={handleBlur}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="auth-password" className={cn(labelClass, 'mb-1.5')}>
          密码
        </label>
        <div className="relative">
          <input
            id="auth-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            placeholder={isRegister ? `至少 ${PASSWORD_MIN_LENGTH} 位` : '请输入密码'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={(e) => onGaze(e.currentTarget, passwordEyeState)}
            onBlur={handleBlur}
            className={cn(inputClass, 'pr-10')}
          />
          <button
            type="button"
            // 阻止按钮抢走焦点，避免密码框 blur 导致眼睛先睁开再闭上
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleTogglePassword}
            title={showPassword ? '隐藏密码' : '显示密码'}
            aria-label={showPassword ? '隐藏密码' : '显示密码'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {showPassword ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
        </div>
      </div>

      {isRegister && (
        <div>
          <label htmlFor="auth-password-confirm" className={cn(labelClass, 'mb-1.5')}>
            确认密码
          </label>
          <input
            id="auth-password-confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="再输入一次密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onFocus={(e) => onGaze(e.currentTarget, passwordEyeState)}
            onBlur={handleBlur}
            className={inputClass}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-red-400 leading-relaxed">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="!mt-6 w-full h-10 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {isRegister ? '注册并登录' : '登录'}
      </button>

      <p className="text-center text-[14px] text-muted-foreground">
        {isRegister ? '已有账号？' : '还没有账号？'}
        <button
          type="button"
          onClick={switchMode}
          className="font-medium text-foreground hover:underline underline-offset-2 cursor-pointer"
        >
          {isRegister ? '登录' : '注册'}
        </button>
      </p>
    </form>
  )
}
