/**
 * 校验官方示例（视频 + 句库）的数据结构与可练习性，新增一集官方示例后跑一遍。
 *
 * - 句库：id 唯一、isOfficial、scenario = 官方示例、totalSentences 与句数一致；
 *   grammar.tokens 与练习页的切词结果（parseSentenceIntoWords）逐项对齐。
 * - 热身核心词：按 TranslateCard 的按键规则逐字模拟输入，确认短语（含空格、撇号）都能打通。
 * - 视频：官方视频的 translationBookId 指向存在的官方句库，src 只能是远端 https 地址。
 *
 * 用法：node scripts/check-official-samples.mjs
 */
import { DEFAULT_TRANSLATION_BOOKS } from '../src/resources/translateData.ts'
import { DEFAULT_SAMPLE_RADIO_ITEMS } from '../src/resources/radioData.ts'
import { parseSentenceIntoWords } from '../src/lib/sentenceParser.ts'

const errors = []
const fail = (where, msg) => errors.push(`${where}: ${msg}`)

const normalizeKeyword = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ')

/** 与 TranslateCard 热身阶段的 keydown 处理一致：返回能否在不报错的情况下拼对 */
function canTypeKeyword(word) {
  const target = normalizeKeyword(word)
  let input = ''
  for (const ch of word.trim().replace(/\s+/g, ' ')) {
    if (ch === ' ') {
      if (input.trim().length > 0 && !input.endsWith(' ') && target.startsWith(`${normalizeKeyword(input)} `)) {
        input += ' '
        continue
      }
      return false
    }
    input += ch
    if (normalizeKeyword(input) === target) return true
  }
  return false
}

const officialBooks = DEFAULT_TRANSLATION_BOOKS.filter((b) => b.isOfficial)
const bookIds = new Set()
const sentenceIds = new Set()

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

    const keywords = s.keywords ?? []
    if (keywords.length === 0) fail(where, '没有核心词')
    const kwIds = new Set()
    for (const k of keywords) {
      if (kwIds.has(k.id)) fail(where, `核心词 id ${k.id} 重复`)
      kwIds.add(k.id)
      if (!/^[A-Za-z0-9' -]+$/.test(k.word)) fail(where, `核心词「${k.word}」含键盘难以输入的字符`)
      if (k.word.includes(' ') && k.kind !== 'phrase') fail(where, `核心词「${k.word}」带空格但 kind 不是 phrase`)
      if (!canTypeKeyword(k.word)) fail(where, `核心词「${k.word}」按热身规则无法拼通`)
      if (!k.meaningZh?.trim()) fail(where, `核心词「${k.word}」缺少中文提示`)
    }
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
if (errors.length) {
  console.error(`\n发现 ${errors.length} 个问题：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('全部通过')
