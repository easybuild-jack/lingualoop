'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { useAiAssistantStore } from '@/store/useAiAssistantStore'
import { isChromelessRoute } from '@/lib/chromelessRoutes'

export function AiFloatingTrigger() {
  const { isOpen, toggleDrawer } = useAiAssistantStore()
  const pathname = usePathname()
  const [isHovered, setIsHovered] = useState(false)

  // 登录页等独立页面不展示 AI 悬浮入口
  if (isChromelessRoute(pathname)) return null

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 pointer-events-none">
      <AnimatePresence initial={false}>
        {!isOpen && (
          <motion.button
            key="ai-floating-trigger"
            type="button"
            onClick={() => {
              setIsHovered(false)
              toggleDrawer()
            }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
            initial={{ x: '100%', opacity: 0, scale: 1 }}
            animate={{
              x: 0,
              opacity: 1,
              scale: isHovered ? 1.06 : 1,
              transition: {
                type: 'spring',
                stiffness: 420,
                damping: 30,
                mass: 0.72,
              },
            }}
            exit={{
              x: '100%',
              opacity: 0,
              transition: {
                duration: 0.18,
                ease: [0.32, 0.72, 0, 1],
              },
            }}
            whileTap={{ scale: 0.96 }}
            className={`pointer-events-auto origin-right flex items-center justify-center h-12 min-w-12 rounded-l-xl backdrop-blur-md border border-r-0 p-1.5 transition-[background-color,border-color,box-shadow] duration-200 cursor-pointer ${
              isHovered
                ? 'bg-card border-primary/45 shadow-[0_10px_28px_-6px_rgb(var(--primary-rgb)/0.28)]'
                : 'bg-card/95 border-border shadow-[0_8px_24px_-6px_rgba(0,0,0,0.28)]'
            }`}
            aria-label="打开 LinguaLoop Copilot"
          >
            <motion.img
              src="/logo222.png"
              alt="LinguaLoop Copilot"
              animate={{
                y: isHovered ? -1.5 : 0,
                scale: isHovered ? 1.06 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 460,
                damping: 26,
              }}
              className="size-9 shrink-0 object-contain"
            />
            <motion.span
              initial={false}
              animate={{
                width: isHovered ? 'auto' : 0,
                opacity: isHovered ? 1 : 0,
                marginLeft: isHovered ? 6 : 0,
                marginRight: isHovered ? 6 : 0,
              }}
              transition={{
                type: 'spring',
                stiffness: 420,
                damping: 32,
                mass: 0.7,
              }}
              className="overflow-hidden whitespace-nowrap text-xs font-medium text-foreground select-none"
            >
              AI 助教
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
