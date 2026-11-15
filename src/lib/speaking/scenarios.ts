/**
 * 口语陪练的场景定义。
 *
 * 只描述「这是什么场景、AI 扮演谁、开场白说什么」。
 * 对话内容由 AI 模型实时生成（见 chatEngine.ts），这里不再内置演示台词。
 */

export interface SpeakingCorrection {
  original: string
  better: string
  reason: string
}

export interface SpeakingVocab {
  word: string
  meaning: string
}

export interface SpeakingScenario {
  id: string
  group: '日常' | '旅行' | '职场' | '考试'
  title: string
  role: string
  roleName: string
  greeting: string[]
  greetingZh: string
}

export const SPEAKING_SCENARIOS: SpeakingScenario[] = [
  {
    id: 'free',
    group: '日常',
    title: '自由闲聊',
    role: '口语搭子',
    roleName: 'Emma',
    greeting: ['Hi there! I am Emma.', 'How has your day been so far?'],
    greetingZh: '你好！我是 Emma。你今天过得怎么样？',
  },
  {
    id: 'cafe',
    group: '日常',
    title: '咖啡点单',
    role: '咖啡店员',
    roleName: 'Emma',
    greeting: ['Hi! Welcome to Blue Bottle.', 'What can I get for you today?'],
    greetingZh: '你好！欢迎来到 Blue Bottle，今天想喝点什么？',
  },
  {
    id: 'direction',
    group: '日常',
    title: '问路',
    role: '路人',
    roleName: 'Tom',
    greeting: ['Hey, you look a little lost.', 'Can I help you find something?'],
    greetingZh: '嘿，你看起来有点迷路了，需要帮忙找地方吗？',
  },
  {
    id: 'airport',
    group: '旅行',
    title: '机场值机',
    role: '值机柜台',
    roleName: 'Linda',
    greeting: ['Good morning!', 'May I see your passport and ticket, please?'],
    greetingZh: '早上好！请出示您的护照和机票。',
  },
  {
    id: 'hotel',
    group: '旅行',
    title: '酒店入住',
    role: '前台',
    roleName: 'James',
    greeting: ['Welcome to the Grand Hotel.', 'Do you have a reservation with us?'],
    greetingZh: '欢迎光临 Grand Hotel，请问您有预订吗？',
  },
  {
    id: 'restaurant',
    group: '旅行',
    title: '餐厅点餐',
    role: '服务员',
    roleName: 'Sophie',
    greeting: ['Good evening!', 'Are you ready to order, or do you need a few more minutes?'],
    greetingZh: '晚上好！可以点餐了吗，还是需要再看看？',
  },
  {
    id: 'interview',
    group: '职场',
    title: '英文面试',
    role: '面试官',
    roleName: 'Emma',
    greeting: ['Thanks for coming in today.', 'Could you start by telling me a little about yourself?'],
    greetingZh: '感谢你今天过来。可以先简单介绍一下你自己吗？',
  },
  {
    id: 'standup',
    group: '职场',
    title: '项目汇报',
    role: '项目经理',
    roleName: 'Mark',
    greeting: ['Morning, everyone.', 'Could you give us a quick update on your tasks?'],
    greetingZh: '大家早。能简单汇报一下你的任务进展吗？',
  },
  {
    id: 'meeting',
    group: '职场',
    title: '电话会议',
    role: '海外同事',
    roleName: 'Rachel',
    greeting: ['Hi, can you hear me okay?', 'Shall we go through the agenda?'],
    greetingZh: '你好，能听清吗？我们过一下议程好吗？',
  },
  {
    id: 'ielts1',
    group: '考试',
    title: '雅思 Part 1',
    role: '雅思考官',
    roleName: 'Daniel',
    greeting: ['Good afternoon.', 'Let us talk about your hometown. Where are you from?'],
    greetingZh: '下午好。我们聊聊你的家乡，你来自哪里？',
  },
  {
    id: 'ielts2',
    group: '考试',
    title: '雅思 Part 2',
    role: '雅思考官',
    roleName: 'Daniel',
    greeting: ['Here is your topic card.', 'Describe a place you visited that left a deep impression on you.'],
    greetingZh: '这是你的话题卡：描述一个让你印象深刻的地方。',
  },
]

export const SCENARIO_GROUPS = ['日常', '旅行', '职场', '考试'] as const

export const SPEAKING_LEVELS = ['A2', 'B1', 'B2', 'C1'] as const
export type SpeakingLevel = (typeof SPEAKING_LEVELS)[number]

export const SPEAKING_VOICES = [
  { id: 'us-female', label: '美式女声' },
  { id: 'us-male', label: '美式男声' },
  { id: 'uk-female', label: '英式女声' },
  { id: 'uk-male', label: '英式男声' },
] as const
export type SpeakingVoiceId = (typeof SPEAKING_VOICES)[number]['id']

export const CORRECTION_MODES = [
  { id: 'live', label: '实时纠错' },
  { id: 'summary', label: '结束后汇总' },
  { id: 'off', label: '不纠错' },
] as const
export type CorrectionMode = (typeof CORRECTION_MODES)[number]['id']

export function getScenario(id: string): SpeakingScenario {
  return SPEAKING_SCENARIOS.find((s) => s.id === id) ?? SPEAKING_SCENARIOS[0]
}
