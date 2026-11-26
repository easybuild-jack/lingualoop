'use client'

import React from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

interface ConfirmDeleteModalProps {
  isOpen: boolean
  title: string
  targetName: string
  details?: string[]
  isDeleting?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 统一的永久删除二次确认弹窗：
 * 明确提示将真实删除数据且不可恢复，删除期间禁用操作并等待数据库/本地存储完成。
 */
export function ConfirmDeleteModal({
  isOpen,
  title,
  targetName,
  details = [],
  isDeleting = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn select-none"
    >
      <div className="w-full max-w-md rounded-xl bg-sidebar border border-border shadow-xl p-6 text-left">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="size-5 text-destructive shrink-0" />
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>

        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          确定要永久删除「<span className="text-foreground font-medium">{targetName}</span>」吗？
        </p>

        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-red-300 leading-relaxed">
          此操作将真实删除数据，删除后数据不可恢复，请谨慎操作。
        </div>

        {details.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground leading-relaxed list-disc pl-5">
            {details.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="h-9 px-4 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="h-9 px-4 rounded-md bg-destructive hover:bg-destructive/90 text-white text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            <span>{isDeleting ? '正在删除…' : '确认永久删除'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

