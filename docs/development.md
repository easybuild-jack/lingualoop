# LinguaLoop 开发者与 AI 协作开发指南

> 本文档面向参与本仓库开发的人类开发者及 AI 编程助手，用于快速对齐**架构红线、核心业务流程、代码规范与日常开发验证流程**。总体技术路线与系统架构请先阅读 [architecture.md](./architecture.md)。

---

## 1. 架构红线（修改代码前必读）

无论是人工开发还是 AI 辅助改动，必须遵守以下底线，避免引入数据错位、隐私泄露或双模式割裂：

1. **所有业务数据读写必须经过 Repository / `src/db/index.ts`**
   - 禁止在页面或组件中直接实例化 Supabase 客户端或绕过 `getRepositories()` 读写业务表。
   - 唯一例外：`aiWordCache`（本地离线词表与 AI 查词缓存）永远只存本机 IndexedDB，可直接访问 `db.aiWordCache`。
2. **严禁将设置项与敏感凭据写入云端数据库或提交到仓库**
   - AI API Key、TTS/ASR 凭据、Supabase URL/Key、主题皮肤、键音音量、快捷键等**永远只存本机 `localStorage`**。
   - `src/app/api/*` 必须保持**完全无状态**：仅在请求内存中转发凭证，不落盘、不写库、不打印敏感日志。
3. **官方内置内容只读且不入云库**
   - 官方词库（`public/dicts/*.json`）、官方示例翻译句库（`isOfficial: true`）、官方示例听力视频（`isOfficial: true`）不写入 Supabase；其中官方词库进度通过 `book_id + unit_id + word_id` 关联，官方示例句库与视频**不写完成记录、不计入上次学习位置**。
4. **必须同时兼容「本地模式」与「云模式」**
   - 任何新增的持久化业务数据，都需要明确：本地存哪里、云端存哪张表、属于「进度类（`account_id NOT NULL`）」还是「内容类（`account_id` 可空：共享/个人）」，以及是否需要纳入 `manualSync.ts`。
   - 禁止假设一定存在 Supabase 连接——未配置数据库时必须 100% 离线可用、不弹出登录拦截。
5. **切换账号或模式时禁止跨账号串写**
   - 云模式下的进度与缓存按当前 `account_id` 隔离（`scopedStorage.ts`）；退出登录或切换账号前须注意清理/重载状态，防止上一账号内存状态写入新账号。
6. **不引入不必要的服务端状态与重型依赖**
   - 保持前端交互流畅与构建轻量；新增 npm 依赖前先确认现有库（Tailwind、Lucide、Framer Motion、Zustand、Dexie）是否已可满足。

---

## 2. 核心业务流程与代码入口

### 2.1 单词学习 / 默写 / 音标练习闭环

- **入口页面**：`src/app/learn/page.tsx`、`src/app/dictation/page.tsx`、`src/app/phonetics/page.tsx`、`src/app/errors/page.tsx`
- **核心状态**：`src/store/useWorkspaceStore.ts`
- **核心流转**：
  1. 选择词库与模式（`learn` / `dictation` / `phonetic`）→ `loadCurrentUnitWords()` 经 `dictionaryLoader` 加载官方 JSON 或从 Repository 读取自定义词库。
  2. 每个单词通过 `buildWordId(name)`（`src/lib/wordId.ts`）生成确定性 ID（`word_<slug>`）。
  3. 键盘输入由 `src/hooks/useTypingKeyboard.ts` 与各 Stage/Card 组件处理；按键音效与发音通过 `src/core/audioEngine.ts` 播放。
  4. 单词校验通过或出错时，调用 `src/db/index.ts` 更新 `wordRecords`（掌握度、生词/错词状态、连续正确次数）与 `unitProgress`（`completedWordIds`、`retryWordIds`、`status`）。
  5. 默写出错的词自动进入错词本，并在单元末尾触发错词重考；在 `/errors` 错词攻坚中连续答对达标后自动移出错词本。

### 2.2 词典查词、导入补全与 AI 分段生成

- **入口**：`src/app/dictionary/page.tsx`、`src/components/dictionary/WordLookupModal.tsx`、`src/components/modals/ImportModal.tsx`
- **核心模块**：`src/core/dictionarySearch.ts`、`src/lib/aiWordCore.ts`、`src/hooks/useEnsureAiWordSections.ts`
- **核心流转**：
  1. 主动查词或导入单词时，优先查本地 IndexedDB `aiWordCache`；未命中且已配置 AI Key 时调用 `queryAiWordCore()` 获取基础释义与音标并永久缓存。
  2. 词条卡片渲染时，`useEnsureAiWordSections` 检查 `aiSections` 状态，按需异步补全音节、例句、短语与词源拆解并写回缓存。
  3. 搜索框下拉联想（`searchWordSuggestions`）仅检索 `aiWordCache` 前缀匹配，避免扫描全量词库带来性能开销。

### 2.3 听力广场与句子翻译联动流程

- **入口**：`src/app/radio/page.tsx`、`src/app/translate/page.tsx`
- **核心模块**：`src/store/useTranslateStore.ts`、`src/lib/sentenceParser.ts`、`src/resources/radioData.ts`、`src/resources/translateData.ts`
- **核心流转**：
  1. 听力广场视频若配置了 `translationBookId`，播放页展示「去练翻译」，跳转 `/translate?book=<id>`。
  2. 翻译卡片（`TranslateCard.tsx`）分两阶段：
     - **核心词热身阶段**：由 `selectWarmupWords()` 筛选，**仅包含单个单词**（短语或整句一律跳过；若句子的 `keywords` 过滤后为空则直接进入整句阶段）。
     - **整句拼写阶段**：按 `parseSentenceIntoWords()` 拆分为下划线输入槽位（`SentenceUnderlineSlots.tsx`），完成后可查看逐词语法解析弹窗（`SentenceGrammarModal.tsx`）。
  3. 新增官方示例视频/句库的详细步骤与校验脚本见 [official-samples.md](./official-samples.md)。

### 2.4 AI 助教与 AI 口语陪练链路

- **AI 助教**：`src/store/useAiAssistantStore.ts` → `src/lib/aiClient.ts` → `POST /api/ai/chat`（支持 SSE 流式输出、多会话管理与 60s 心跳超时中断）。
- **AI 口语陪练**：`src/store/useSpeakingStore.ts` + `src/components/speaking/*`
  - 对话引擎：`src/lib/speaking/chatEngine.ts`（拼装角色扮演与 CEFR 等级提示词，解析「英文正文 + `###FEEDBACK###` + JSON（译文/纠错/生词）」）。
  - 语音合成：`src/lib/speaking/speechPlayer.ts` + `ttsConfig.ts` → `/api/tts/doubao` 或 `/api/tts/qwen`（支持逐句合成播放与浏览器语音兜底）。
  - 语音识别：`src/lib/speaking/recorder.ts` + `speechRecognition.ts` + `asrConfig.ts` → 浏览器 Web Speech 或录制 WAV 经 `/api/asr/doubao` 转写。

### 2.5 云模式连接、登录与手动同步流程

- **核心模块**：`src/core/cloud/{config,client,account,readiness,scopedStorage,supabaseRepository,manualSync,collector,visibility}.ts`、`src/components/cloud/CloudSyncGate.tsx`
- **核心流转**：
  1. 应用启动时 `CloudSyncGate` 检查 `getCloudConfig()`；若已配置 Supabase，执行连通性与 Schema 版本体检，并校验本地会话（`getCloudSession()`）。
  2. 未登录时引导跳转 `/login`（调用 `register_account` / `login_account` RPC）；若云端不可达，允许用户选择「临时降级到本地模式」。
  3. 本地与云端之间无后台自动同步：用户在「设置 → 数据同步」（`CloudSyncPanel.tsx`）手动触发 `syncLocalContentToCloud()` 或 `syncLocalProgressToCloud()`，均为幂等加法合并。
  4. 云模式下 `CollectedWordsWatcher` 定时轮询 `collected_words` 收件箱表，认领外部工具写入的生词并归入收藏词库。

---

## 3. 代码分层与开发规范

### 3.1 目录职责边界

| 目录 | 职责 | 注意事项 |
| --- | --- | --- |
| `src/app/` | 路由页面、路由级 `layout.tsx`（SEO 元数据）与 API 路由 | 页面尽量保持轻量，复杂 UI 拆到 `src/components/` |
| `src/components/` | 按业务域组织的 React 组件 | 展示组件尽量通过 Props 驱动；全局弹窗/抽屉挂在根 `layout.tsx` |
| `src/store/` | Zustand 全局状态 | 使用细粒度 selector（`useStore((s) => s.xxx)`）减少无关重渲染 |
| `src/db/` | IndexedDB Schema、Repository 接口与数据业务函数 | 业务写操作集中在此层，不散落到组件中 |
| `src/core/` | 有状态/副作用基础设施（音频、词库加载、云端连接） | 与 React 解耦，可在 Store 或脚本中复用 |
| `src/lib/` | 纯函数与无状态工具（切分、校验、解析、API 封装、SEO、皮肤） | 保持纯函数与可测试性，不直接操作 UI |
| `src/resources/` | 内置静态数据源（词根、语法、音标、官方示例） | 纯静态数据，避免引入大体积媒体文件 |
| `src/types/` | 跨模块共享的 TypeScript 类型定义 | 模块内部私有类型就近定义，跨模块类型放 `src/types/index.ts` |

### 3.2 TypeScript 与 React 编码规范

- **严格类型**：遵循 `tsconfig.json` 的 `strict: true`，避免新增 `any`（用 `unknown` + 类型收窄替代），函数导出应有明确入参与返回值类型。
- **零冗余代码**：及时清理未使用的 import、变量、Props、废弃组件与 dead code；`catch` 块不需要错误对象时直接写 `catch { ... }`。
- **Client / Server 边界**：交互页面与使用 Hooks/浏览器 API 的组件在文件首行显式声明 `'use client'`；路由级 `layout.tsx` 保持为 Server Component 以导出静态 `metadata`。
- **Effect 规范**：避免在 `useEffect` 体内同步调用 `setState` 触发级联渲染；优先用派生状态（`useMemo` / 渲染期计算）或事件处理器更新状态。
- **样式与皮肤规范**：统一使用 Tailwind CSS v4 与皮肤语义变量（如 `bg-background`、`bg-card`、`text-foreground`、`text-muted-foreground`、`border-border`、`text-primary`），避免硬编码破坏多皮肤一致性。

### 3.3 数据库与 Schema 变更规范

- **IndexedDB（`src/db/local.ts`）**：
  - IndexedDB **不支持原地修改主键**；变更表结构或主键必须递增 `this.version(N)` 并编写安全的 `upgrade()` 迁移逻辑。
- **Supabase / PostgreSQL（`supabase/schema.sql`）**：
  - 脚本必须保持**幂等可重复执行**（`create table if not exists`、`create or replace function`、`drop trigger if exists`）。
  - 所有业务时间戳统一使用 `bigint`（epoch 毫秒），与前端 `Date.now()` 一致。
  - 新增进度类表须加 `account_id uuid not null references public.accounts(id) on delete cascade` 并挂 `tg_progress_account_guard`；新增内容类表须挂 `tg_personal_content_guard`。

### 3.4 新增页面 / 模块检查清单

新增独立路由页面时，按顺序确认以下位置：
1. 在 `src/app/<route>/page.tsx` 实现页面，在 `src/app/<route>/layout.tsx` 调用 `buildPageMetadata('/<route>')` 导出元数据。
2. 在 `src/lib/seo.ts` 的 `SEO_ROUTES` 中登记路由标题、描述与 `index` 开关（决定是否进入 `sitemap.xml`）。
3. 如需在侧边栏展示，更新 `src/components/layout/AppSidebar.tsx`；如为无侧边栏页面，登记到 `src/lib/chromelessRoutes.ts`。
4. 如涉及数据持久化，按第 1 节与第 3.3 节同步适配本地与云端 Repository。

---

## 4. 日常开发与验证流程

### 4.1 常用命令

```bash
# 1. 启动开发服务器
npm run dev

# 2. 重新生成 Next.js 路由类型 + 全量 TypeScript 类型检查
npx next typegen && npx tsc --noEmit

# 3. 代码规范检查（或仅针对改动文件执行 npx eslint <files>）
npm run lint

# 4. 生产构建验证
npm run build

# 5. 校验官方示例（听力视频 + 翻译句库与热身单词规则）
node scripts/check-official-samples.mjs
```

> **云端 E2E 验证脚本**：`scripts/cloud-e2e/` 包含 `t1-cloud.ts`、`t2-flows.ts`、`t3-progress.ts`，用于连接测试用 Supabase 实例验证账号隔离、核心业务流与进度合并逻辑（改动 `src/core/cloud/*` 或 `supabase/schema.sql` 时建议运行）。

### 4.2 提交前自检清单

- [ ] **类型与构建**：`npx next typegen`、`npx tsc --noEmit` 通过（0 错误），改动涉及路由或构建配置时已验证 `npm run build`。
- [ ] **Lint 检查**：改动文件无新增 ESLint 错误与 `@typescript-eslint/no-unused-vars` 警告。
- [ ] **双模式兼容**：未配置 Supabase 的纯本地模式正常可用；若涉及数据层改动，已核对云模式账号隔离与 `manualSync.ts`。
- [ ] **安全与隐私**：未提交任何真实 API Key、Supabase 凭据、个人音频/视频大文件或硬编码内部 Token。
- [ ] **文档同步**：若改动了路由、环境变量、官方示例或数据库结构，已同步更新对应文档。

---

## 5. 相关文档索引

- [architecture.md](./architecture.md) — 项目定位、技术栈、总体架构与核心技术路线
- [seo.md](./seo.md) — 品牌规范、路由 SEO 元数据清单与搜索引擎提交流程
- [official-samples.md](./official-samples.md) — 官方示例视频与翻译句库接入规范
- [supabase/schema.sql](../supabase/schema.sql) — 云端数据库完整建表、触发器与 RPC 事务脚本

