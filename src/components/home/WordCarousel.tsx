'use client'

import React from 'react'
import { Volume2 } from 'lucide-react'
import { audioEngine } from '@/core/audioEngine'

const ITEMS = [
  { text: 'serendipity', sub: '/ˌserənˈdɪpəti/', zh: '意外发现的美好', kind: 'WORD' },
  { text: 'How’s it going?', sub: 'greeting', zh: '最近怎么样？', kind: 'PHRASE' },
  { text: 'eloquent', sub: '/ˈeləkwənt/', zh: '雄辩的；有说服力的', kind: 'WORD' },
  { text: 'I’m on my way.', sub: 'daily', zh: '我在路上了。', kind: 'PHRASE' },
  { text: 'resilient', sub: '/rɪˈzɪliənt/', zh: '有韧性的', kind: 'WORD' },
  { text: 'Let’s call it a day.', sub: 'work', zh: '今天就到这吧。', kind: 'PHRASE' },
  { text: 'meticulous', sub: '/məˈtɪkjələs/', zh: '一丝不苟的', kind: 'WORD' },
  { text: 'It’s up to you.', sub: 'daily', zh: '你来决定。', kind: 'PHRASE' },
  { text: 'ubiquitous', sub: '/juːˈbɪkwɪtəs/', zh: '无处不在的', kind: 'WORD' },
  { text: 'Long time no see!', sub: 'greeting', zh: '好久不见！', kind: 'PHRASE' },
  { text: 'illuminate', sub: '/ɪˈluːmɪneɪt/', zh: '照亮；阐明', kind: 'WORD' },
  { text: 'Break a leg!', sub: 'idiom', zh: '祝你好运！', kind: 'PHRASE' },
]

const CARD_W = 220
const RADIUS = 440
const STEP_DEG = 360 / ITEMS.length

/** 3D 圆柱旋转卡片环：卡片沿圆柱排布，整体绕 Y 轴匀速旋转，悬停暂停 */
export function WordCarousel() {
  return (
    <div className="relative h-[220px] sm:h-[280px] lg:h-[340px] overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center [perspective:1400px] scale-[0.55] sm:scale-75 lg:scale-100">
        {/* 先上移再俯视倾斜：抵消 rotateX 让前排卡片下沉的位移 */}
        <div className="[transform-style:preserve-3d] [transform:translateY(-76px)_rotateX(-10deg)]">
          <div
            className="relative [transform-style:preserve-3d] animate-[home-carousel_40s_linear_infinite] hover:[animation-play-state:paused]"
            style={{ width: CARD_W, height: 150 }}
          >
            {ITEMS.map((item, i) => (
              <button
                key={item.text}
                type="button"
                onClick={() => audioEngine.playPronunciation(item.text, 'us')}
                style={{ width: CARD_W, transform: `rotateY(${i * STEP_DEG}deg) translateZ(${RADIUS}px)` }}
                className="group absolute inset-0 rounded-2xl border border-border bg-sidebar p-4 text-left cursor-pointer [backface-visibility:hidden] hover:border-primary/60 transition-colors flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-mono tracking-widest px-1.5 py-0.5 rounded ${
                      item.kind === 'WORD' ? 'bg-primary/12 text-primary' : 'bg-accent/12 text-accent'
                    }`}
                  >
                    {item.kind}
                  </span>
                  <Volume2 className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <div className="font-serif text-2xl leading-tight text-foreground group-hover:text-primary transition-colors truncate">
                    {item.text}
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground truncate">{item.sub}</div>
                </div>
                <div className="text-sm text-foreground/80 truncate">{item.zh}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
