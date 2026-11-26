import { dictionaryLoader } from '@/core/dictionaryLoader'

export type ReadingFontSize = 'sm' | 'md' | 'lg'

export interface ReadingSentence {
  en: string
  ipa: string
  zh: string
}

export interface ReadingArticle {
  id: string
  /** 云模式归属：null = 共享，非空 = 个人 */
  accountId?: string | null
  title: string
  paragraphs: ReadingSentence[][]
  isCustom?: boolean
  createdAt: number
  updatedAt?: number
  /** 云端列表按需加载标记：false 表示当前仅有元数据，进入阅读页时再拉取 paragraphs */
  paragraphsLoaded?: boolean
}

/** 常见高频功能词音标速查表（当离线大词库尚未完成初始化或未收录超短功能词时兜底） */
const COMMON_FUNCTION_WORD_IPA: Record<string, string> = {
  a: 'ə',
  an: 'æn',
  the: 'ðə',
  to: 'tuː',
  of: 'ɒv',
  in: 'ɪn',
  on: 'ɒn',
  at: 'æt',
  for: 'fɔː',
  with: 'wɪð',
  by: 'baɪ',
  from: 'frɒm',
  as: 'æz',
  is: 'ɪz',
  are: 'ɑː',
  was: 'wɒz',
  were: 'wɜː',
  be: 'biː',
  been: 'biːn',
  am: 'æm',
  i: 'aɪ',
  you: 'juː',
  he: 'hiː',
  she: 'ʃiː',
  it: 'ɪt',
  we: 'wiː',
  they: 'ðeɪ',
  my: 'maɪ',
  your: 'jɔː',
  his: 'hɪz',
  her: 'hɜː',
  its: 'ɪts',
  our: 'aʊə',
  their: 'ðeə',
  this: 'ðɪs',
  that: 'ðæt',
  these: 'ðiːz',
  those: 'ðəʊz',
  and: 'ænd',
  or: 'ɔː',
  but: 'bʌt',
  nor: 'nɔː',
  not: 'nɒt',
  no: 'nəʊ',
  do: 'duː',
  does: 'dʌz',
  did: 'dɪd',
  have: 'hæv',
  has: 'hæz',
  had: 'hæd',
  can: 'kæn',
  could: 'kʊd',
  will: 'wɪl',
  would: 'wʊd',
  shall: 'ʃæl',
  should: 'ʃʊd',
  may: 'meɪ',
  might: 'maɪt',
  must: 'mʌst',
  who: 'huː',
  what: 'wɒt',
  where: 'weə',
  when: 'wen',
  why: 'waɪ',
  how: 'haʊ',
  all: 'ɔːl',
  each: 'iːtʃ',
  every: 'ˈevri',
  some: 'sʌm',
  any: 'ˈeni',
  few: 'fjuː',
  more: 'mɔː',
  most: 'məʊst',
  other: 'ˈʌðə',
  into: 'ˈɪntuː',
  through: 'θruː',
  before: 'bɪˈfɔː',
  after: 'ˈɑːftə',
  while: 'waɪl',
  up: 'ʌp',
  down: 'daʊn',
  out: 'aʊt',
  off: 'ɒf',
  over: 'ˈəʊvə',
  under: 'ˈʌndə',
  again: 'əˈɡen',
  own: 'əʊn',
  same: 'seɪm',
  so: 'səʊ',
  than: 'ðæn',
  too: 'tuː',
  very: 'ˈveri',
}

/** 清理单个音标词元两侧的斜杠与多余空白 */
export function cleanIpaToken(raw?: string): string {
  if (!raw) return ''
  return raw.replace(/^\/+|\/+$/g, '').trim()
}

/** 为整句英文自动生成逐词对应的音标字符串（空格分隔） */
export function generateSentenceIpa(sentenceEn: string): string {
  const tokens = sentenceEn.trim().split(/\s+/).filter(Boolean)
  return tokens
    .map((token) => {
      const clean = token.replace(/[^a-zA-Z'-]/g, '').toLowerCase()
      if (!clean) return ''
      const fromDict = dictionaryLoader.getLocalPhoneticSync(clean)
      if (fromDict) return fromDict
      return COMMON_FUNCTION_WORD_IPA[clean] || clean
    })
    .join(' ')
}

/**
 * 按规定格式解析用户输入的文章内容：
 * - 空行分段
 * - 每行一句：`英文 | 音标 | 译文`（三段）或 `英文 | 译文`（两段，自动补全音标）
 */
export function parseReadingArticleContent(raw: string): ReadingSentence[][] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const blocks = trimmed.split(/\r?\n\s*\r?\n/)
  const paragraphs: ReadingSentence[][] = []

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const sentences: ReadingSentence[] = []
    for (const line of lines) {
      const parts = line.split('|').map((s) => s.trim())
      if (parts.length >= 3 && parts[0]) {
        const cleanedIpa = parts[1]
          .split(/\s+/)
          .map((t) => cleanIpaToken(t))
          .filter(Boolean)
          .join(' ')
        sentences.push({
          en: parts[0],
          ipa: cleanedIpa || generateSentenceIpa(parts[0]),
          zh: parts.slice(2).join(' | '),
        })
      } else if (parts.length === 2 && parts[0]) {
        sentences.push({
          en: parts[0],
          ipa: generateSentenceIpa(parts[0]),
          zh: parts[1],
        })
      }
    }

    if (sentences.length > 0) {
      paragraphs.push(sentences)
    }
  }

  return paragraphs
}

/** 统计一篇文章的总句数 */
export function countArticleSentences(article: ReadingArticle): number {
  return article.paragraphs.reduce((sum, p) => sum + p.length, 0)
}

/** 拆分中英双语标题（以 · 分隔） */
export function splitArticleTitle(fullTitle: string): { en: string; zh: string } {
  const idx = fullTitle.indexOf('·')
  if (idx === -1) {
    return { en: fullTitle.trim(), zh: '' }
  }
  return {
    en: fullTitle.slice(0, idx).trim(),
    zh: fullTitle.slice(idx + 1).trim(),
  }
}

export const SAMPLE_UPLOAD_TEMPLATE = `Small daily improvements are the key to staggering long-term results. | smɔːl ˈdeɪli ɪmˈpruːvmənts ɑː ðə kiː tuː ˈstæɡərɪŋ lɒŋ-tɜːm rɪˈzʌlts | 每天微小的进步，是取得惊人长期成果的关键。
Patience is not the ability to wait, but the ability to keep a good attitude while waiting. | ˈpeɪʃns ɪz nɒt ði əˈbɪləti tuː weɪt bʌt ði əˈbɪləti tuː kiːp ə ɡʊd ˈætɪtjuːd waɪl ˈweɪtɪŋ | 耐心不是等待的能力，而是在等待时保持良好心态的能力。

Focus on where you want to go, not on what you fear. | ˈfəʊkəs ɒn weə juː wɒnt tuː ɡəʊ nɒt ɒn wɒt juː fɪə | 专注于你想去的地方，而不是你害怕的事物。`

export const DEFAULT_READING_ARTICLES: ReadingArticle[] = [
  {
    id: 'reading-builtin-1',
    title: 'The Quiet Power of Morning Reading · 晨读的静谧力量',
    createdAt: 1700000000000,
    paragraphs: [
      [
        {
          en: 'The morning hours offer a rare silence before the busy world wakes up.',
          ipa: 'ðə ˈmɔːnɪŋ ˈaʊəz ˈɒfə ə reə ˈsaɪləns bɪˈfɔː ðə ˈbɪzi wɜːld weɪks ʌp',
          zh: '在喧嚣的世界苏醒之前，清晨时光提供了一份难得的静谧。',
        },
        {
          en: 'Reading a few pages with a warm cup of coffee sets a calm tone for the day.',
          ipa: 'ˈriːdɪŋ ə fjuː ˈpeɪdʒɪz wɪð ə wɔːm kʌp ɒv ˈkɒfi sets ə kɑːm təʊn fɔː ðə deɪ',
          zh: '伴着一杯热咖啡读上几页书，能为一整天定下平和的基调。',
        },
      ],
      [
        {
          en: 'You do not need to rush through chapters, nor memorize every single phrase.',
          ipa: 'juː duː nɒt niːd tuː rʌʃ θruː ˈtʃæptəz nɔː ˈmeməraɪz ˈevri ˈsɪŋɡl freɪz',
          zh: '你不必匆忙赶完章节，也不必强记每一个短语。',
        },
        {
          en: 'Consistent small habits always outweigh occasional bursts of effort.',
          ipa: 'kənˈsɪstənt smɔːl ˈhæbɪts ˈɔːlweɪz ˌaʊtˈweɪ əˈkeɪʒənl bɜːsts ɒv ˈefət',
          zh: '持之以恒的微小习惯，总是胜过偶尔的心血来潮。',
        },
      ],
    ],
  },
]

