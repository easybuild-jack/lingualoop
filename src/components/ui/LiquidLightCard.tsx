'use client'

import React from 'react'

interface LiquidLightCardProps {
  children: React.ReactNode
  className?: string
  /** 3D 微倾角最大角度（度），spotlight=false 时不生效 */
  maxTilt?: number
  /** 是否开启追光光晕 + 局部边框点亮 + 3D 倾角；设为 false 时仅保留纯毛玻璃卡片质感 */
  spotlight?: boolean
}

/** 液态毛玻璃卡片：支持「追光 + 局部边框点亮 + 3D 倾角」或「纯毛玻璃无光晕」两种模式 */
export function LiquidLightCard({
  children,
  className = '',
  maxTilt = 2.4,
  spotlight = true,
}: LiquidLightCardProps) {
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!spotlight) return
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    card.style.setProperty('--mx', `${x}px`)
    card.style.setProperty('--my', `${y}px`)
    if (maxTilt > 0) {
      const rx = (y / rect.height - 0.5) * -maxTilt * 2
      const ry = (x / rect.width - 0.5) * maxTilt * 2
      card.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
    }
  }

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!spotlight || maxTilt <= 0) return
    e.currentTarget.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)'
  }

  return (
    <div
      onPointerMove={spotlight ? handlePointerMove : undefined}
      onPointerLeave={spotlight ? handlePointerLeave : undefined}
      className={`${spotlight ? 'liquid-light-card' : 'liquid-glass-card'} ${className}`}
    >
      {children}
    </div>
  )
}

