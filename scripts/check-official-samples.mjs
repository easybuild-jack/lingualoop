/**
 * 校验官方示例（视频 + 句库）的数据结构与可练习性，新增一集官方示例后跑一遍。
 *
 * - 句库：id 唯一、isOfficial、scenario = 官方示例、totalSentences 与句数一致；
 *   grammar.tokens 与练习页的切词结果（parseSentenceIntoWords）逐项对齐。
 * - 热身：只练单个单词（selectWarmupWords，与练习页同一实现）。keywords: [] 表示本句没有单词、直接练整句；
 *   短语项不会进热身，只提示不报错。热身单词按练习页的按键规则逐字模拟输入，确认都能打通。
 * - 规则自检：空列表不被自动提取补回、只有短语时不进热身、真正的单词可练。
 * - 视频：官方视频的 translationBookId 指向存在的官方句库，src 只能是远端 https 地址。
 *
 * 用法：node scripts/check-official-samples.mjs
 */
import { DEFAULT_TRANSLATION_BOOKS } from '../src/resources/translateData.ts'
import { DEFAULT_SAMPLE_RADIO_ITEMS } from '../src/resources/radioData.ts'
import { parseSentenceIntoWords, selectWarmupWords } from '../src/lib/sentenceParser.ts'

const errors = []
const warnings = []
const fail = (where, msg) => errors.push(`${where}: ${msg}`)
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

const normalizeKeyword = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ')

/** 与 TranslateCard 热身阶段的 keydown 处理一致：逐字输入后能否自动判对 */
function canTypeWord(word) {
  const target = normalizeKeyword(word)
  let input = ''
  for (const ch of word.trim()) {
    input += ch
    if (normalizeKeyword(input) === target) return true
  }
  return false
}

const warmupIds = (sentence) => selectWarmupWords(sentence).map((k) => k.word).join('|')
const ruleCase = (name, sentence, expected) => {
  const actual = warmupIds(sentence)
  if (actual !== expected) fail('规则自检', `${name}：期望热身 [${expected}]，实际 [${actual}]`)
}
const base = { id: 'rule', sentenceEn: 'Go ahead and take your time.', sentenceZh: '请继续，慢慢来。' }
ruleCase('keywords: [] 不自动补词', { ...base, keywords: [] }, '')
ruleCase('只有短语不进热身', { ...base, keywords: [{ id: 'k1', word: 'go ahead', meaningZh: '请继续', kind: 'phrase' }] }, '')
ruleCase('含空格未标 kind 也算短语', { ...base, keywords: [{ id: 'k1', word: 'take your time', meaningZh: '慢慢来' }] }, '')
ruleCase(
  '短语与单词混合只留单词',
  { ...base, keywords: [{ id: 'k1', word: 'go ahead', meaningZh: '请继续', kind: 'phrase' }, { id: 'k2', word: 'time', meaningZh: '时间', kind: 'word' }] },
  'time'
)
ruleCase('未标 kind 的单个词可练', { ...base, keywords: [{ id: 'k1', word: 'ahead', meaningZh: '向前' }] }, 'ahead')
if (selectWarmupWords(base).some((k) => /\s/.test(k.word.trim()))) fail('规则自检', '未提供 keywords 时自动提取出了短语')

const officialBooks = DEFAULT_TRANSLATION_BOOKS.filter((b) => b.isOfficial)
const bookIds = new Set()
const sentenceIds = new Set()
const warmupSummary = []

for (const book of DEFAULT_TRANSLATION_BOOKS) {
  if (bookIds.has(book.id)) fail(book.id, '句库 id 重复')
  bookIds.add(book.id)
  if (!book.isOfficial) continue
  if (book.isCustom) fail(book.id, '官方句库不能标 isCustom（会被当成自定义句库持久化）')
  if (book.scenario !== '官方示例') fail(book.id, `scenario 应为「官方示例」，实际 ${book.scenario}`)
  if (book.totalSentences !== book.sentences.length)
    fail(book.id, `totalSentences=${book.totalSentences}，实际 ${book.sentences.length} 句`)

  for (const s of book.sentences) {
    const where = s.id
    if (sentenceIds.has(s.id)) fail(where, '句子 id 重复')
    sentenceIds.add(s.id)
    if (!s.sentenceEn?.trim() || !s.sentenceZh?.trim()) fail(where, '缺少英文或中文')
    if (s.pronunciation !== undefined && s.pronunciation !== null && typeof s.pronunciation !== 'object')
      fail(where, 'pronunciation 只能是对象或 null')

    const words = parseSentenceIntoWords(s.sentenceEn, s.grammar?.tokens)
    const tokens = s.grammar?.tokens ?? []
    if (tokens.length !== words.length) fail(where, `tokens ${tokens.length} 个，切词 ${words.length} 个`)
    words.forEach((w, i) => {
      const t = tokens[i]
      if (!t) return
      if (t.text !== w.rawText) fail(where, `tokens[${i}].text="${t.text}"，原句为 "${w.rawText}"`)
      if (t.cleanText !== w.cleanWord) fail(where, `tokens[${i}].cleanText="${t.cleanText}"，切词为 "${w.cleanWord}"`)
      if (w.grammar !== t) fail(where, `第 ${i} 个词没有按位置匹配到自己的 token`)
    })

    if (!Array.isArray(s.keywords)) fail(where, '官方句子要显式给出 keywords（没有单词时写 []），不依赖自动提取')
    const keywords = s.keywords ?? []
    const kwIds = new Set()
    for (const k of keywords) {
      if (kwIds.has(k.id)) fail(where, `核心词 id ${k.id} 重复`)
      kwIds.add(k.id)
    }
    const warmup = selectWarmupWords(s)
    for (const k of keywords.filter((k) => !warmup.includes(k)))
      warn(where, `「${k.word}」是短语，不会进入单词热身`)
    for (const k of warmup) {
      if (k.kind !== 'word') fail(where, `单词「${k.word}」要标 kind: 'word'`)
      if (!/^[A-Za-z0-9'-]+$/.test(k.word)) fail(where, `单词「${k.word}」含键盘难以输入的字符`)
      if (!canTypeWord(k.word)) fail(where, `单词「${k.word}」按热身规则无法拼通`)
      if (!k.meaningZh?.trim()) fail(where, `单词「${k.word}」缺少中文提示`)
    }
    warmupSummary.push({ book: book.id, id: s.id, words: warmup.length })
  }
}

const officialBookIds = new Set(officialBooks.map((b) => b.id))
const radioIds = new Set()
for (const item of DEFAULT_SAMPLE_RADIO_ITEMS) {
  if (radioIds.has(item.id)) fail(item.id, '视频 id 重复')
  radioIds.add(item.id)
  if (!item.isOfficial) continue
  if (!/^https:\/\//.test(item.src)) fail(item.id, `官方视频只能用远端 https 地址，实际 ${item.src}`)
  if (item.translationBookId && !officialBookIds.has(item.translationBookId))
    fail(item.id, `translationBookId ${item.translationBookId} 不是已有的官方句库`)
}

console.log(
  `官方句库 ${officialBooks.length} 个 / ${sentenceIds.size} 句，官方视频 ${DEFAULT_SAMPLE_RADIO_ITEMS.filter((i) => i.isOfficial).length} 个`
)
for (const item of DEFAULT_SAMPLE_RADIO_ITEMS.filter((i) => i.isOfficial)) {
  const book = officialBooks.find((b) => b.id === item.translationBookId)
  console.log(`  ${item.id} [${item.category}] → ${book ? `${book.id}（${book.sentences.length} 句）` : '未关联句库'}`)
}
for (const book of officialBooks) {
  const rows = warmupSummary.filter((r) => r.book === book.id)
  const direct = rows.filter((r) => r.words === 0).map((r) => r.id.split('_').pop())
  console.log(
    `  ${book.id}：热身单词 ${rows.reduce((n, r) => n + r.words, 0)} 个；直接练整句 ${direct.length} 句${direct.length ? `（${direct.join(', ')}）` : ''}`
  )
}
if (warnings.length) {
  console.log(`\n提示 ${warnings.length} 条（不影响通过）：`)
  for (const w of warnings) console.log(`  - ${w}`)
}
if (errors.length) {
  console.error(`\n发现 ${errors.length} 个问题：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('全部通过')
