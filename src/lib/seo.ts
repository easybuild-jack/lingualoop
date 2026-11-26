import type { Metadata, MetadataRoute } from 'next'

/** 规范域名：部署时可用 NEXT_PUBLIC_SITE_URL 覆盖，不带结尾斜杠 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lingualoop.com.cn').replace(/\/+$/, '')

export const SITE_NAME = 'LinguaLoop'
/** 唯一的正式中文名；别名只用于 keywords 与 JSON-LD alternateName，不进标题 */
export const SITE_NAME_ZH = '林瓜鲁普'
export const SITE_BRAND = `${SITE_NAME_ZH} ${SITE_NAME}`
export const SITE_SEARCH_ALIASES = ['灵瓜鲁普', '林瓜路普', '林瓜卢普', 'Lingua Loop']
export const GITHUB_REPO_URL = 'https://github.com/easybuild-jack/lingualoop'

export const HOME_TITLE = `${SITE_BRAND} — 您的私人专属英语学习搭子`
export const HOME_DESCRIPTION =
  '林瓜鲁普（LinguaLoop）是源码公开、本地优先的英语学习网站，把音标、词汇、语法、听力、阅读、写作和 AI 口语连成一个闭环，听说读写译一站式完成。'

export const SITE_KEYWORDS = [
  SITE_NAME,
  SITE_NAME_ZH,
  ...SITE_SEARCH_ALIASES,
  '源码公开英语学习',
  '本地优先',
  '英语学习闭环',
  '音标',
  '背单词',
  '词根词缀',
  '英语语法',
  '英语听力',
  '句子翻译',
  '双语阅读',
  'AI口语陪练',
]

interface SeoRoute {
  /** 标题中的页面名，标题为 `{name} | 林瓜鲁普 LinguaLoop` */
  name: string
  description: string
  /** false：noindex，且不进 sitemap */
  index: boolean
  priority?: number
}

/** 有独立路由的页面；口语陪练是全局悬浮窗，没有页面 */
export const SEO_ROUTES: Record<string, SeoRoute> = {
  '/phonetics/learn': {
    name: '音标学习',
    description: '系统学习 48 个国际音标，逐个听辨元音与辅音的发音口型，配合例词掌握英语发音规则。',
    index: true,
    priority: 0.8,
  },
  '/phonetics': {
    name: '音标与发音',
    description: '音标与发音练习：听音辨音、看词写音标，在键盘上反复敲击巩固国际音标与英语自然拼读。',
    index: true,
    priority: 0.8,
  },
  '/books': {
    name: '英语词库',
    description: '内置基础词汇、四六级、考研等常用英语词库，也可导入自定义词表，按单元规划背单词进度。',
    index: true,
    priority: 0.7,
  },
  '/learn': {
    name: '单词学习',
    description: '按音节拆分拼读、结合词根词缀与例句背单词，边听发音边敲拼写，把单词真正记进肌肉记忆。',
    index: true,
    priority: 0.9,
  },
  '/dictation': {
    name: '默写练习',
    description: '英语单词默写练习：听音或看释义写出拼写，错词自动进入复习，闭环巩固背过的单词。',
    index: true,
    priority: 0.8,
  },
  '/roots': {
    name: '词根词缀',
    description: '常用拉丁、希腊词根与前缀后缀图谱，拆解单词构词法，用词根词缀成串记忆英语词汇。',
    index: true,
    priority: 0.7,
  },
  '/grammar': {
    name: '英语语法',
    description: '从词性、句子成分到时态与从句，图解基础英语语法，配合例句理解主谓宾等句子结构。',
    index: true,
    priority: 0.7,
  },
  '/dictionary': {
    name: '英语词典',
    description: '离线英语词典：查询单词音标、真人发音、中文释义、例句与常用短语，查过的词可一键加入生词本。',
    index: true,
    priority: 0.7,
  },
  '/reading': {
    name: '双语阅读',
    description: '中英双语对照阅读英语文章，点词即查、逐句精读，在真实语境中积累词汇与语感。',
    index: true,
    priority: 0.7,
  },
  '/radio': {
    name: '听力广场',
    description: '英语听力广场：常用短语、场景对话与英语电台视频，支持倍速与循环播放，随身磨耳朵。',
    index: true,
    priority: 0.7,
  },
  '/translate': {
    name: '句子翻译',
    description: '中译英句子翻译练习：先热身核心词汇，再整句拼写，完成后查看逐词语法解析。',
    index: true,
    priority: 0.7,
  },
  '/login': {
    name: '登录',
    description: '登录林瓜鲁普（LinguaLoop）账号，在多台设备之间同步英语学习进度。',
    index: false,
  },
  '/errors': {
    name: '生错词本',
    description: '生词本与错词本：集中复习收藏的生词和默写出错的单词。',
    index: false,
  },
}

export function absoluteUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`
}

/** 各路由 layout 用：子级的 openGraph / twitter 会整体覆盖父级，所以这里给出完整字段 */
export function buildPageMetadata(path: keyof typeof SEO_ROUTES): Metadata {
  const route = SEO_ROUTES[path]
  const fullTitle = `${route.name} | ${SITE_BRAND}`
  return {
    // 嵌套路由（如 /phonetics/learn）拿不到根 layout 的 template，统一写完整标题
    title: { absolute: fullTitle },
    description: route.description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: SITE_BRAND,
      url: path,
      title: fullTitle,
      description: route.description,
    },
    twitter: {
      card: 'summary',
      title: fullTitle,
      description: route.description,
    },
    ...(route.index ? {} : { robots: { index: false, follow: false } }),
  }
}

export function sitemapEntries(lastModified: Date): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), lastModified, changeFrequency: 'weekly', priority: 1 },
    ...Object.entries(SEO_ROUTES)
      .filter(([, route]) => route.index)
      .map(([path, route]) => ({
        url: absoluteUrl(path),
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: route.priority ?? 0.7,
      })),
  ]
}

/** 首页结构化数据：WebSite + SoftwareApplication */
export function homeJsonLd() {
  const alternateName = [SITE_NAME_ZH, ...SITE_SEARCH_ALIASES]
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        alternateName,
        description: HOME_DESCRIPTION,
        inLanguage: 'zh-CN',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#app`,
        name: SITE_NAME,
        alternateName,
        url: `${SITE_URL}/`,
        description: HOME_DESCRIPTION,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        inLanguage: 'zh-CN',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
        sameAs: [GITHUB_REPO_URL],
        featureList: ['音标练习', '背单词', '默写练习', '词根词缀', '英语语法', '英语听力', '句子翻译', '双语阅读', 'AI 口语陪练'],
      },
    ],
  }
}
