'use client'

import React, { useSyncExternalStore } from 'react'
import { Lock, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isCloudSignedIn, subscribeCloudMode } from '@/core/cloud/config'
import type { ContentVisibility } from '@/core/cloud/visibility'

const OPTIONS: { id: ContentVisibility; label: string; hint: string; icon: typeof Lock }[] = [
  { id: 'personal', label: '个人', hint: '只有当前账号能看到', icon: Lock },
  { id: 'shared', label: '共享', hint: '所有账号都能看到、修改和删除', icon: Users },
]

interface VisibilityPickerProps {
  value: ContentVisibility
  onChange: (value: ContentVisibility) => void
  className?: string
}

/** 「个人 / 共享」选择 */
export function VisibilityPicker({ value, onChange, className }: VisibilityPickerProps) {
  const active = OPTIONS.find((option) => option.id === value) ?? OPTIONS[0]
  return (
    <div className={cn('space-y-1.5', className)}>
      <div role="radiogroup" aria-label="内容归属" className="inline-flex rounded-lg border border-border p-0.5">
        {OPTIONS.map((option) => {
          const Icon = option.icon
          const selected = option.id === value
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={cn(
                'h-8 px-3 rounded-md text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer',
                selected ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" />
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{active.hint}</p>
    </div>
  )
}

/** 只在云模式且已登录时显示的归属选择（本地模式下内容只在本机，不需要选） */
export function CloudVisibilityField(props: VisibilityPickerProps & { label?: string }) {
  const visible = useSyncExternalStore(subscribeCloudMode, isCloudSignedIn, () => false)
  if (!visible) return null
  const { label = '保存为', className, ...pickerProps } = props
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <span className="block text-xs font-medium text-muted-foreground">{label}</span>}
      <VisibilityPicker {...pickerProps} />
    </div>
  )
}
