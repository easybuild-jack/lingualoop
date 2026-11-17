export type RadioCategory = 'phrases' | 'dialogue' | 'radio'

export const RADIO_CATEGORY_LABELS: Record<RadioCategory, string> = {
  phrases: '常用短语',
  dialogue: '场景对话',
  radio: '英语电台',
}

export type RadioScenario =
  | '官方示例'
  | '日常生活'
  | '职场商务'
  | '旅游出行'
  | '餐饮美食'
  | '购物消费'
  | string

export const DEFAULT_RADIO_SCENARIOS: RadioScenario[] = [
  '官方示例',
  '日常生活',
  '职场商务',
  '旅游出行',
  '餐饮美食',
  '购物消费',
]

export type RadioMediaType = 'video' | 'audio'

export type PlayMode = 'list-loop' | 'single-loop' | 'sequential' | 'shuffle'

export interface RadioItem {
  id: string
  /** 是否为官方内置示例视频 */
  isOfficial?: boolean
  /** 云模式归属：null = 共享，非空 = 个人；undefined = 仅本次会话（未入库） */
  accountId?: string | null
  category: RadioCategory
  title: string
  type: RadioMediaType
  src: string
  poster?: string
  duration: number // 秒数
  scenario: RadioScenario
  description?: string
  transcript?: string
  translation?: string
  createdAt: number
  playCount: number
}

export const SCENARIO_ICONS: Record<string, string> = {
  全部: '✨',
  官方示例: '🎬',
  日常生活: '☕',
  职场商务: '💼',
  旅游出行: '✈️',
  餐饮美食: '🍽️',
  购物消费: '🛍️',
}

/** 官方示例视频（后续补上示例视频，当前留空并已清理测试视频数据） */
export const DEFAULT_SAMPLE_RADIO_ITEMS: RadioItem[] = []
