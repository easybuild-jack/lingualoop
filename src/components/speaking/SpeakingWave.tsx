'use client'

import React from 'react'

const HEIGHTS = [40, 75, 100, 60, 90, 50, 80, 35, 70, 95, 55, 85]

/** 声波柱：active 时跳动，静止时压成一条细线 */
export function SpeakingWave({ active, bars = 12, className = '' }: { active: boolean; bars?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          style={{
            height: active ? `${HEIGHTS[i % HEIGHTS.length]}%` : '3px',
            animationDelay: `${(i % 6) * 0.11}s`,
          }}
          className={`w-[3px] rounded-full origin-center transition-[height] duration-300 ${
            active ? 'bg-primary animate-[home-wave_1s_ease-in-out_infinite]' : 'bg-muted-foreground/40'
          }`}
        />
      ))}
    </div>
  )
}
