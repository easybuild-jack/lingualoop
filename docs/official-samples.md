# 官方示例（视频 + 翻译句库）接入说明

官方示例是写死在代码里的内置内容：一集视频放在「听力广场」，配套的翻译句库放在「翻译练习」，两者通过 `translationBookId` 关联。

## 一、机制

| 位置 | 作用 |
|---|---|
| `src/resources/radioData.ts` → `DEFAULT_SAMPLE_RADIO_ITEMS` | 官方视频。`isOfficial: true`，`category` 决定出现在哪个页签（`phrases` 常用短语 / `dialogue` 场景对话 / `radio` 英语电台），`scenario` 固定为 `官方示例` |
| `src/resources/translateData.ts` → `DEFAULT_TRANSLATION_BOOKS` | 官方句库。`isOfficial: true`、`isCustom: false`、`scenario: '官方示例'`，`category` 用 `TranslationBook` 已有取值（如 `daily`） |
| `RadioItem.translationBookId` | 播放页据此显示「去练翻译」，跳转 `/translate?book=<句库 id>` 直接进入练习 |

只要按上表加数据，下列行为自动生效，不需要改业务代码：

- 官方句库不写完成记录，也不会被记成本机或云端的「上次练习」位置（`useTranslateStore` 的 `setSentenceCompleted` 与 `progressBookIdOf`），用户当前的学习书和历史数据不受影响。
- 官方视频不累计播放次数、不能删除，不入数据库（云模式下与数据库里的视频合并显示）。
- 列表与播放页显示 `description`。

翻译练习的热身规则（`selectWarmupWords`，`src/lib/sentenceParser.ts`）：

- **热身只练单个单词。** 短语（`kind: 'phrase'` 或 `word` 含空格）和整句都不是单词，一律不进热身，哪怕是固定习语。
- 句子给了 `keywords` 就以数据为准：过滤后没有单词（包括 `keywords: []`）就跳过热身，直接练整句，不会被自动提取补回。
- 只有完全没提供 `keywords` 字段的句子才自动提取单词。官方句库要显式写出 `keywords`，没有单词时写 `[]`。

约束：

- 视频只用 OSS 远端 URL，**不要把 MP4/MP3 提交到仓库或 `public/`**。
- 不需要改 `supabase/schema.sql`。
- 句库里的练习句可以是视频短语的扩展句（补主语、展开缩写），它不是视频逐字稿；不要给句子标视频时间戳。

## 二、新增一集的步骤

1. 句库追加到 `DEFAULT_TRANSLATION_BOOKS` 末尾（第一项是默认句库，不要插到前面）。
2. 视频追加到 `DEFAULT_SAMPLE_RADIO_ITEMS` 末尾，`translationBookId` 填句库 id。
3. 运行 `node scripts/check-official-samples.mjs`：检查 id 唯一、`totalSentences`、`grammar.tokens` 与练习页切词逐项对齐；用练习页同一套 `selectWarmupWords` 列出每本书的热身单词和直接练整句的句子，并逐字模拟输入每个热身单词；数据里的短语项会列为提示（它们不会进热身）。脚本还自检热身规则：空列表不被补词、只有短语不进热身、真正的单词可练。
4. 用 `ffprobe` 验证远端文件，**必须完整解码一遍**（`ffmpeg -v error -i <url或下载文件> -f null -`），只看 moov 元数据会把截断的文件误判成完整。
5. `npx tsc --noEmit`、`npm run build`。

热身比对规则（`TranslateCard` 的 `normalizeKeyword`）：只忽略大小写和首尾空白，**不做缩写等价**，也不做词形还原。单词写成句中的变形（如 `got`）时，要在 `meaningZh` 里用中文注明词形（如“（过去式）”），不直接写出英文答案。

## 三、已接入

### 3.1 Five More Minutes! · 再睡五分钟

- 视频 id：`official_daily_morning_ep1`（场景对话）
- 句库 id：`radio_daily_morning_ep1`（23 句）

### 3.2 基础短语第1集

- 视频 id：`official_phrases_basic_ep01`（`category: 'phrases'`，常用短语 › 官方示例，时长 `220s`）
- 句库 id：`phrases_basic_ep01`（20 句，`category: 'daily'`，18 个热身单词，6 句 `keywords: []` 直接练整句）
