'use client'

import React, { useEffect, useState } from 'react'
import { useSpeakingStore } from '@/store/useSpeakingStore'

export function formatDuration(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

export function SessionTimer() {
  const startedAt = useSpeakingStore((s) => s.startedAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  return <span className="font-mono tabular-nums">{formatDuration(startedAt ? now - startedAt : 0)}</span>
}
