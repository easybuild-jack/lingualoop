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

约束：

- 视频只用 OSS 远端 URL，**不要把 MP4/MP3 提交到仓库或 `public/`**。
- 不需要改 `supabase/schema.sql`。
- 句库里的练习句可以是视频短语的扩展句（补主语、展开缩写），它不是视频逐字稿；不要给句子标视频时间戳。

## 二、新增一集的步骤

1. 句库追加到 `DEFAULT_TRANSLATION_BOOKS` 末尾（第一项是默认句库，不要插到前面）。
2. 视频追加到 `DEFAULT_SAMPLE_RADIO_ITEMS` 末尾，`translationBookId` 填句库 id。
3. 运行 `node scripts/check-official-samples.mjs`：检查 id 唯一、`totalSentences`、`grammar.tokens` 与练习页切词逐项对齐，并按热身页的按键规则逐字模拟输入每个核心词（含空格短语、撇号）。
4. 用 `ffprobe` 验证远端文件，**必须完整解码一遍**（`ffmpeg -v error -i <url或下载文件> -f null -`），只看 moov 元数据会把截断的文件误判成完整。
5. `npx tsc --noEmit`、`npm run build`。

热身比对规则（`TranslateCard` 的 `normalizeKeyword`）：只忽略大小写、首尾空白和连续空白，**不做缩写等价**。核心词写成 `What's up`，用户就必须输入撇号；数据说明里不要写「What's 与 What is 视为同一形式」。

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
| 时长 | `duration: 220`，与 timing.json、SRT、MP4 moov 声明一致（见 3.3 远端校验） |

相对原始 `phrases_basic_ep01.json` 的修正：

- s02 / s14 / s19 的 `grammar.summary` 原写「匹配时 What's 与 What is（I'm / I am、You're / You are）视为同一形式」，与实际比对规则不符，改为「热身短语按视频形式收录，输入时要带撇号」。核心词本身保持视频形式不变。

视频短语与练习句的对应（来自 timing.json 的 `practice_en`，只是短语级的对应，**练习句不是视频逐字稿**，应用里也不做时间同步）：

| 视频短语 | 视频时段 | 视频读法 | 句子 | 练习句（与视频不同时列出） | 热身核心词 |
|---|---|---|---|---|---|
| p01 | 0:00.6–0:11.4 | Nice to meet you. | `s01` | It is nice to meet you. | Nice to meet you |
| p02 | 0:11.8–0:21.4 | What's up? | `s02` | What is up? | What's up |
| p03 | 0:21.8–0:31.7 | Come on in. | `s03` | 同视频 | Come on in |
| p04 | 0:32.1–0:42.1 | Have a seat. | `s04` | 同视频 | Have a seat |
| p05 | 0:42.5–0:53.1 | Help yourself. | `s05` | 同视频 | Help yourself |
| p06 | 0:53.5–1:03.3 | Hang on. | `s06` | 同视频 | Hang on |
| p07 | 1:03.7–1:14.3 | Take your time. | `s07` | 同视频 | Take your time |
| p08 | 1:14.7–1:25.6 | Let me see. | `s08` | 同视频 | Let me see |
| p09 | 1:26.0–1:36.7 | Sounds good. | `s09` | That sounds good. | Sounds good |
| p10 | 1:37.1–1:47.7 | That works. | `s10` | 同视频 | That works |
| p11 | 1:48.1–1:57.2 | Got it. | `s11` | I got it. | Got it |
| p12 | 1:57.6–2:07.6 | Go ahead. | `s12` | 同视频 | Go ahead |
| p13 | 2:08.0–2:18.4 | No worries. | `s13` | 同视频 | No worries |
| p14 | 2:18.8–2:30.0 | I'm on my way. | `s14` | I am on my way. | I'm on my way |
| p15 | 2:30.4–2:41.3 | Be right back. | `s15` | I will be right back. | be right back |
| p16 | 2:41.7–2:52.2 | Need a hand? | `s16` | Do you need a hand? | need a hand |
| p17 | 2:52.6–3:02.4 | Here you go. | `s17` | 同视频 | Here you go |
| p18 | 3:02.8–3:14.2 | I appreciate it. | `s18` | 同视频 | I appreciate it |
| p19 | 3:14.6–3:24.7 | You're welcome. | `s19` | You are welcome. | You're welcome |
| p20 | 3:25.1–3:34.5 | See you later. | `s20` | 同视频 | See you later |

SRT 共 101 条字幕，与 timing.json 的 `speeches` 逐条一致（起止时间与文本无差异），最后一条结束于 3:37.87。字幕已烧录在画面中，播放器不读取 SRT，因此 SRT 与 timing.json 不入库。

### 3.3 远端文件校验记录（2026-11-20）

| 检查 | 结果 |
|---|---|
| HTTP | `200`，`Content-Type: video/mp4`，`Accept-Ranges: bytes`，Range 请求返回 `206` |
| moov 声明 | H.264 High 1920×1080、25fps、5500 帧；AAC LC 48kHz 双声道；时长 220.000s；moov 在文件头（可边下边播） |
| 文件大小 | `Content-Length: 29360128`（正好 28 MiB），OSS `Content-MD5` 与下载内容一致 |
| 完整解码 | **失败**：mdat 声明 59,483,281 字节，完整文件应为 59,652,318 字节，实际只有 29,360,128 字节；解码到第 2684 帧报 `partial file`，最后一个完整视频包 107.48s、音频包 107.26s |

结论：OSS 上的文件是**上传中断的残缺文件**，只能播放到约 1:47（p10 That works 结束），p11–p20 与片尾缺失。代码里的 URL 与 `duration` 按完整版填写，需要用同名重新上传完整文件（约 59.7 MB）后复验第 4 步，播放才会完整。
