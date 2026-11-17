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
  /**
   * 本机视频：文件不入库也不上传，src 是运行时生成的 blob URL，
   * 句柄存在 IndexedDB（见 lib/radio/localVideos.ts）
   */
  isLocal?: boolean
  /** 本机视频来自文件夹扫描时的归属 id（不单独持久化，靠文件夹句柄重新扫描得到） */
  folderId?: string
  /** 本机视频所属文件夹名，列表里作副标题显示 */
  folderName?: string
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
  /** 关联的翻译句库 id，播放页据此显示「去练翻译」入口 */
  translationBookId?: string
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

/** 官方示例视频：只存在于代码中，不入库，播放次数等也不记录 */
export const DEFAULT_SAMPLE_RADIO_ITEMS: RadioItem[] = [
  {
    id: 'official_daily_morning_ep1',
    isOfficial: true,
    category: 'dialogue',
    title: 'Five More Minutes! · 再睡五分钟',
    type: 'video',
    src: 'https://lingualoop.oss-cn-shenzhen.aliyuncs.com/video/lingualoop_morning_ep01.mp4',
    duration: 296,
    scenario: '官方示例',
    description:
      '日常生活 › 早晨起床 › 第1集：Alex 早上赖床不肯起，Emma 和小猫 Mochi 想尽办法把他叫醒。听完视频，来练练剧中的单词和句子吧。',
    createdAt: 1794887876998,
    playCount: 0,
    translationBookId: 'radio_daily_morning_ep1',
  },
]
