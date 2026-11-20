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

视频 `official_daily_morning_ep1`（场景对话），句库 `radio_daily_morning_ep1`（23 句）。

### 3.2 基础短语第1集

| 项目 | 内容 |
|---|---|
| 视频 id | `official_phrases_basic_ep01`，`category: 'phrases'`（常用短语 › 官方示例） |
| 视频 URL | `https://lingualoop.oss-cn-shenzhen.aliyuncs.com/video/lingualoop_common_phrases_basic_ep01.mp4` |
| 句库 id | `phrases_basic_ep01`，20 句，`category: 'daily'` |
| 场景映射 | 原始数据 `scenario: '日常生活'`，按官方示例规则改为 `官方示例` |
| 时长 | `duration: 220`，与 timing.json、SRT、远端完整文件实测一致（见 3.3 远端校验） |
| 句库数据 | 开发验收通过的 v6（`v6_word_only_candidate.json`，sha256 `4102242b4de5ab54ce66196130ce5cf215532f39d937fbb2aca7e0ded957324a`），18 个热身单词，6 句 `keywords: []` 直接练整句 |

句库内容的验收流程：制作方生成后交开发逐条验收，不合格的退回返工，验收通过才更新到系统。

- 第一版（初次接入）的热身核心词几乎都是整句短语，属于内容生成问题。
- v5 曾按“真正的固定短语可以作为热身项、允许与整句相同”验收接入。**这条标准是错误的，已撤销**：Jack 明确要求“单词就是单词而不是句子，没有单词可以为空，单词为空就跳过热词直接句子”。
- v6 删除了全部 8 个短语热身项，保留 18 个单词（词形提示不变）；s02、s03、s05、s06、s12、s16 没有值得练的单词，`keywords: []`，直接练整句。句子、译文、语法标注与 v5 相同。

其他标注要点（v5 起沿用）：s13 恢复视频原表达 No worries.，No 标为 `Attr`，worries 是名词短语中心词，省略 `roleCode`（不写 null），用 `roleZh: '名词短语中心词'` 如实标注，句法弹窗中显示为灰色中性样式。

视频短语与练习句的对应（来自 timing.json 的 `practice_en`，只是短语级的对应，**练习句不是视频逐字稿**，应用里也不做时间同步）：

| 视频短语 | 视频时段 | 视频读法 | 句子 | 练习句（与视频不同时列出） | 热身单词 |
|---|---|---|---|---|---|
| p01 | 0:00.6–0:11.4 | Nice to meet you. | `s01` | It is nice to meet you. | nice、meet |
| p02 | 0:11.8–0:21.4 | What's up? | `s02` | What is up? | 无（直接练整句） |
| p03 | 0:21.8–0:31.7 | Come on in. | `s03` | 同视频 | 无（直接练整句） |
| p04 | 0:32.1–0:42.1 | Have a seat. | `s04` | 同视频 | seat |
| p05 | 0:42.5–0:53.1 | Help yourself. | `s05` | 同视频 | 无（直接练整句） |
| p06 | 0:53.5–1:03.3 | Hang on. | `s06` | 同视频 | 无（直接练整句） |
| p07 | 1:03.7–1:14.3 | Take your time. | `s07` | 同视频 | time |
| p08 | 1:14.7–1:25.6 | Let me see. | `s08` | 同视频 | let、see |
| p09 | 1:26.0–1:36.7 | Sounds good. | `s09` | That sounds good. | sounds、good |
| p10 | 1:37.1–1:47.7 | That works. | `s10` | 同视频 | works |
| p11 | 1:48.1–1:57.2 | Got it. | `s11` | I got it. | got |
| p12 | 1:57.6–2:07.6 | Go ahead. | `s12` | 同视频 | 无（直接练整句） |
| p13 | 2:08.0–2:18.4 | No worries. | `s13` | 同视频 | worries |
| p14 | 2:18.8–2:30.0 | I'm on my way. | `s14` | I am on my way. | way |
| p15 | 2:30.4–2:41.3 | Be right back. | `s15` | I will be right back. | back、right |
| p16 | 2:41.7–2:52.2 | Need a hand? | `s16` | Do you need a hand? | 无（直接练整句） |
| p17 | 2:52.6–3:02.4 | Here you go. | `s17` | 同视频 | here |
| p18 | 3:02.8–3:14.2 | I appreciate it. | `s18` | 同视频 | appreciate |
| p19 | 3:14.6–3:24.7 | You're welcome. | `s19` | You are welcome. | welcome |
| p20 | 3:25.1–3:34.5 | See you later. | `s20` | 同视频 | later |

SRT 共 101 条字幕，与 timing.json 的 `speeches` 逐条一致（起止时间与文本无差异），最后一条结束于 3:37.87。字幕已烧录在画面中，播放器不读取 SRT，因此 SRT 与 timing.json 不入库。

### 3.3 远端文件校验记录

2026-11-20 第一次校验时，OSS 上是上传中断的残缺文件（只有 29,360,128 字节，只能播放到约 1:47）。之后用同名重新上传了完整文件，复验结果如下：

| 检查 | 结果 |
|---|---|
| HTTP | `200`，`Content-Type: video/mp4`，支持 Range |
| 文件 | `Content-Length: 59652318`，`Last-Modified: 2026-11-20 03:11:18 GMT`，OSS `Content-MD5` 与下载内容一致 |
| 流信息 | H.264 High 1920×1080、25fps、5500 帧；AAC LC 48kHz 双声道；时长 220.000s |
| 完整解码 | 通过：`ffmpeg -f null` 无报错，读出 5500 个视频包，最后一帧 219.92s |
| 浏览器 | Chrome 中拖到 150s、210s 都能继续播放 |
