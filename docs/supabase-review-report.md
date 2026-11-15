# dev2 分支 Supabase 相关代码审查报告

> **后续决定（作者确认）**：安全 / RLS / anon key 暴露本次不处理（外部同步工具会直连数据库），因此 M7、L4 以及疑点中关于 `owner_id` 和匿名登录的建议不再作为待办。账号隔离改用系统自建的 `accounts` 表（账号名 + 密码登录，不使用 Supabase Auth），加上简单的 `account_id` 字段（进度表必填，内容表可空，NULL 表示共享）；数据库只用一个拥有全部权限的连接角色。本报告中能在库层解决的问题（H1、H3、H4、H6、H5 的库层兜底、L3、L9）已经落实到 `supabase/schema.sql`；其余问题的代码改造清单见 `docs/supabase-dev-plan.md`。

| 项目 | 内容 |
|---|---|
| 审查对象 | `dev2` 分支，基线 `67cdcc9` → `572c05e`（提交 `66689fe` / `a14bd52` / `4bd9477` / `572c05e`） |
| 审查基准 | `docs/update.md`（跨设备数据同步迭代说明） |
| 审查范围 | `supabase/schema.sql`、`src/core/cloud/*`、`src/db/{index,local,repository}.ts`、`src/components/cloud/*`、`src/components/settings/CloudSyncPanel.tsx`、`src/app/reading/page.tsx`，以及它们依赖的 `useWorkspaceStore` / `useTranslateStore` / `aiWordCore` 等调用链 |
| 审查方式 | 静态阅读 + 调用链追踪；本地执行 `tsc --noEmit`（通过）、对改动目录执行 `eslint`（0 问题）；核对 `@supabase/postgrest-js@2.119.0` 源码行为。**未连接真实 Supabase 项目做端到端联调**（与 update.md 第七节一致） |
| 说明 | 本报告只给出问题与修复建议，未修改任何业务代码 |

---

## 一、总体结论

本次迭代的**骨架设计是合理的**：用 `Repositories` 接口把"本地 IndexedDB / 云端 PostgREST"做路由、业务函数只写一份，Supabase 客户端只用 anon key、不涉及 service_role，设置类数据（AI Key、皮肤、音量等）确实没有入库，旧的 Redis 收词链路也已完整删除。类型检查与 lint 均通过。

但在**"首次启用 → 迁移 → 跨设备使用 → 断开/降级"这条主流程**上存在多处会造成**数据丢失或数据错位**的问题，且有几处实现与 update.md 的描述不一致，建议在真实联调前修复：

1. **首次启用即丢进度**：`schema.sql` 预插入的 `app_state` / `translate_state` "种子行"会在启动水合时被当成"云端已有数据"，把本机学习位置、翻译完成记录覆盖为空，并经 zustand persist 回写 localStorage；随后的"上传本地数据"已无数据可传，翻译进度更是永远不会被迁移（H1）。
2. **迁移不完整**：官方词库（CET4、考研等）的单元进度完全没有被迁移（H2）；PostgREST 默认 1000 行上限会让 `getAll()` 静默截断，迁移会把云端已有记录**覆盖**掉，违反"只补齐不覆盖"（H3）。
3. **云模式下的并发与竞态**：文档称"云端读改写直接在服务端串行执行"，实际没有任何串行化，错词攻坚中"消灭错词"与"记录练习"会互相覆盖（H4）；云端进度水合晚于页面加载，只改了 `currentBookId` 不重载单词，导致"显示 A 书、进度写进 B 书"（H5）。
4. **收词链路可能永久阻塞**：AI 补全失败的行永不出队，短语、非英文词或未配置 AI Key 都会触发；队头积压 20 条后新词再也收不进来，而且每 20 秒重复消耗 AI 额度（H6）。
5. **安全边界说明不准确**：RLS 实际等于对 anon 全开放（这一点文档有意为之），但文档里的兜底措施"把 Supabase 项目设为私有"并不存在；外部翻译工具还必须持有同一把可读写删全部表的 key，扩大了泄露面（M7）。

问题统计：**高 6 项、中 11 项、低 11 项**，另有 1 项范围外的附带发现。

### 问题汇总表

| 编号 | 严重度 | 标题 | 主要位置 |
|---|---|---|---|
| H1 | 高 | 种子行导致首次启用时本地进度被清空、迁移失效 | `supabase/schema.sql:161,172`；`src/core/cloud/sync.ts:56-73,120-152`；`src/core/cloud/migrate.ts:115-137` |
| H2 | 高 | 迁移遗漏官方词库的单元进度 | `src/core/cloud/migrate.ts:75-87` |
| H3 | 高 | `getAll()` 受 PostgREST 1000 行上限静默截断，导致错词本残缺、迁移覆盖云端 | `src/core/cloud/supabaseRepository.ts:340-353,380-384,450-454` |
| H4 | 高 | 云模式"读-改-写"无串行保护，单词记录并发互相覆盖 | `src/db/index.ts:28-32,109-194`；`src/store/useWorkspaceStore.ts:1402,1420` |
| H5 | 高 | 云端进度水合与页面初始化竞态，书/单元/进度错位 | `src/core/cloud/sync.ts:56-73`；`src/components/cloud/CloudSyncGate.tsx:44-56` |
| H6 | 高 | 收件箱失败行永不出队：队头阻塞 + 重复消耗 AI 额度 | `src/core/cloud/collector.ts:64-106` |
| M1 | 中 | 本地/云端并非"两套独立数据"：进度类 persist 共用 localStorage key | `src/store/useWorkspaceStore.ts:1966`；`src/store/useTranslateStore.ts:270` |
| M2 | 中 | 翻译自定义题库：跨设备删除会"复活"，防抖合并会丢删除 | `src/core/cloud/sync.ts:130-135,163-178` |
| M3 | 中 | 防抖推送不在卸载/重载前落盘，失败不重试 | `src/core/cloud/sync.ts:25-37` |
| M4 | 中 | 云端写失败被静默吞掉，界面无感知 | `src/db/index.ts` 多处；`src/app/reading/page.tsx:88-101` |
| M5 | 中 | 收词：无认领机制、读错误被当作"不存在"、外部 `word_item` 未校验 | `src/core/cloud/collector.ts:85-128,140-146` |
| M6 | 中 | 阅读页云模式先渲染本地文章，加载前的增删会错写/被覆盖 | `src/app/reading/page.tsx:40-41,54-102` |
| M7 | 中 | 安全模型：RLS 全开放、收词工具需持有全权 key、"项目私有"不存在 | `supabase/schema.sql:174-226`；`docs/update.md` 1.5/四/六 |
| M8 | 中 | 每个词 4 次以上网络往返 + 多处全表拉取，与 5.2 的设计意图不符 | `src/db/index.ts`；`src/store/useWorkspaceStore.ts:542,1432` |
| M9 | 中 | `getCustomBooks` 的"冗余测试数据清理"会删除云端「翻译工具收藏」词库 | `src/db/index.ts:304-326` |
| M10 | 中 | 迁移流程的其他缺陷（时序、示例词库、非原子、性能） | `src/core/cloud/migrate.ts`；`src/components/settings/CloudSyncPanel.tsx:78-105` |
| M11 | 中 | 其他标签页切换模式时，本标签页不重载就换了数据源 | `src/core/cloud/config.ts:103-116`；`src/components/cloud/CloudSyncGate.tsx:68` |
| L1 | 低 | 连接体检覆盖不全，且没有超时 | `src/core/cloud/client.ts:72-92` |
| L2 | 低 | 错误分类分支部分不可达，"Invalid API key" 无法识别 | `src/core/cloud/client.ts:50-69` |
| L3 | 低 | 自建 Postgres 缺少序列权限，与脚本注释不符 | `supabase/schema.sql:220-226` |
| L4 | 低 | 没有拦截误填的 service_role / secret key | `src/components/settings/CloudSyncPanel.tsx:78-87` |
| L5 | 低 | 进度订阅初始快照有误，首次任意变更都会推送；每次按键都做序列化 | `src/core/cloud/sync.ts:75-85` |
| L6 | 低 | `ensureTranslateHydrated` 没有超时；文档说"先 await"，实际是 `void` | `src/core/cloud/sync.ts:99-108,154-155` |
| L7 | 低 | 阅读文章 `updated_at` 恒等于 `created_at`；内置文章删除行为与本地模式不一致 | `src/core/cloud/supabaseRepository.ts:318-328` |
| L8 | 低 | `package-lock.json` 仍残留 `@upstash/redis` | `package-lock.json:12,2408` |
| L9 | 低 | 表结构细节：`vocab_units` 闲置、索引未使用、缺 jsonb 约束与版本号 | `supabase/schema.sql` |
| L10 | 低 | 切到内置词库时仍发 DELETE；按 id 读词库吞错误后静默回退 | `src/store/useWorkspaceStore.ts:820-825`；`src/db/index.ts:39-47` |
| L11 | 低 | 降级/断网状态的恢复体验 | `src/components/cloud/CloudSyncGate.tsx:68-75` |
| X1 | 范围外 | 作者身份 token 硬编码在前端，接口报错信息还会回显它 | `src/lib/permissions.ts:2`；`src/app/api/dict/update-word/route.ts:38-44` |

---

## 二、与 update.md 的符合度核对

| update.md 描述 | 实际实现 | 结论 |
|---|---|---|
| 1.2 "两种模式是两套独立数据，互相同步、互相覆盖都不发生" | 学习位置、翻译进度、翻译自定义题库在云模式下也写进同一个 localStorage persist key，断开后本地看到的是云端值（M1） | **不符** |
| 1.3 设置类（含"循环次数"类偏好）永远只存本地 | `loopCounts`（各模式的循环遍数设置，取值 1/2/3/5）被放进 `app_state` 同步，且空对象会把默写的"三连对"变成 1 遍（见 H1） | **偏差** |
| 2.4 "单元进度：云端没有该 (unitId, mode) 才写入" | 只遍历了自定义词库，官方词库的进度没有迁移（H2） | **遗漏** |
| 2.4 "翻译进度：云端 translate_state 为空才写入" | 建表脚本已预插入 id=1，`getState()` 永远不为 null，翻译进度永远不会迁移（H1） | **不符** |
| 2.4 "重复点上传不会把线上数据冲掉" | 云端超过 1000 行时，判重集合被截断，`upsert` 会覆盖云端记录（H3） | **有条件不符** |
| 3.2 "云端直接串行执行"（`runInUnitProgressTransaction`） | 云模式下直接执行 `fn()`，多个调用并行，没有任何串行化（H4） | **不符** |
| 5.2 "防抖合并，避免每个词都发网络请求" | 防抖只作用于 `app_state` / `translate_*`；`word_records` / `unit_progress` 每个词仍有 4 次以上请求（M8） | **部分符合** |
| 5.3 "`hydrateTranslateProgress` 与 `startTranslateSync` 都先 await" | `startTranslateSync` 里是 `void ensureTranslateHydrated()`，没有 await（L6；在当前调用顺序下不致错） | **描述不准** |
| 5.4 "AI 解析失败的词会留在收件箱下次重试，不会丢" | 确实不丢，但会造成队头阻塞和无限重试（H6） | **符合描述，但设计有缺陷** |
| 六 "断开配置后数据回到配置那一刻的旧快照" | IndexedDB 数据是旧快照，localStorage 的进度却是云端最新值，两者错位（M1） | **不符** |
| 六 第 1 步 "Supabase 项目建议设为私有" | Supabase 没有"私有项目"开关，REST 端点始终公网可达，URL + anon key 本身就是访问凭据（M7） | **不可执行** |
| 三 "改动规模 26 个文件，+2587 / -875" | `git diff --stat 67cdcc9 572c05e` 实际为 27 个文件 +3096/-874（含 update.md 自身 308 行），扣除后约 +2788 | 轻微出入 |
| 3.4 移除 `@upstash/redis` | `package.json` 已移除，`package-lock.json` 根依赖仍保留（L8） | **未完全清理** |
| 1.5 不做账号、不做离线写入、不做墓碑、不做 Realtime | 一致 | 符合 |
| 设置项（AI Key、皮肤、音量、快捷键等）不上云 | 一致（`loopCounts` 除外） | 基本符合 |
| 删除旧 Redis 收词接口与组件 | 已删除，`src` 内无残留引用 | 符合 |

---

## 三、问题详述

### H1【高】种子行导致首次启用时本地进度被清空，迁移随之失效

**位置**
- `supabase/schema.sql:161`：`insert into app_state (id) values (1) on conflict (id) do nothing;`
- `supabase/schema.sql:172`：`insert into translate_state (id) values (1) on conflict (id) do nothing;`
- `src/core/cloud/sync.ts:56-73`（`hydrateWorkspaceProgress`）
- `src/core/cloud/sync.ts:120-146`（`hydrateTranslateProgress`）
- `src/core/cloud/migrate.ts:115-123`（翻译进度迁移）、`126-137`（学习位置迁移）
- `src/store/useWorkspaceStore.ts:426-436,1096-1106`（`withLoopCount` / 切换模式时读取 `loopCounts[nextMode]`）

**问题描述**
建表脚本为两个单行表预插入了一条全默认值的行（`updated_at = 0`、`book_mode_progress = {}`、`loop_counts = {}`、`learned_root_ids = []`、`completed_sentence_ids = {}`）。

- `hydrateWorkspaceProgress` 只判断 `if (!remote) return`，而种子行存在，`remote` 永远不为 null，于是会把本地 store 的 `currentUnitIndex` 置 0，`bookModeProgress`、`loopCounts`、`learnedRootIds` 置空。`currentBookId` 因为用了 `??` 回退才得以幸免。
- `hydrateTranslateProgress` 的条件是 `if (books.length || state)`，`state` 总是非 null，于是 `completedSentenceIds` 被置为 `{}`。
- 两个 store 都是 zustand persist，`setState` 会立即回写 localStorage（key 分别为 `lingualoop-workspace-storage`、`lingualoop-translate-storage`），所以**本机原有数据被真正抹掉**，不只是内存里的显示。
- 用户随后按文档第 6 步点"上传本地数据"：
  - 学习位置：`!appState.updatedAt` 成立，但写上去的是已被清空的 store。如果用户先做了任何操作，订阅推送已把 `updated_at` 写成非 0，这一步干脆直接跳过。
  - 翻译进度：`if (!translateState)` 永远为假（种子行存在），**永远不会迁移**。
- 连带后果：`loopCounts` 被置为 `{}` 后，`withLoopCount({}, 'learn', 1)` 只生成 `{ learn: 1 }`，切到默写模式时 `loopCounts.dictation` 为 `undefined`，导致 `loopCountSetting` 与 `currentWordRemainingLoops` 都是 `undefined`，`currentWordRemainingLoops > 1` 恒为假，**默写的"三连对"退化为 1 遍**。之后推送把 `{learn: 1}` 写回云端（`undefined` 字段在 JSON 中被丢弃），其他设备水合后同样受影响，问题会一直延续。

**触发/复现**
1. 本地模式下学习若干单元，切换几次模式，在翻译模块完成几句。
2. 新建 Supabase 项目，执行 `schema.sql`，在设置中填写配置并点"保存并启用"。
3. 页面重载后：词库页"当前单元"回到第 1 单元，翻译完成记录清零，默写模式每个词只需打一遍。
4. 点"上传本地数据"：提示里不会出现学习位置或翻译进度的迁移，因为已经没有可传的数据。

**修复建议**
- 水合时以 `updated_at > 0` 作为"云端有数据"的判据（或者干脆不预插入种子行），`updated_at = 0` 时保留本地值。
- 迁移判断与水合判断使用同一个判据：`translate_state` 也改为 `!state || !state.updatedAt`。
- 更稳妥的做法：在"保存并启用"时、开始任何水合与推送**之前**先执行迁移（参见 M10），或者在水合前把本地进度快照单独备份一份。
- 对云端读回的 `loopCounts` / `bookModeProgress` 做结构校验，与默认值合并，复用 persist `merge` 中 `{...DEFAULT_LOOP_COUNTS, ...remote}` 的逻辑；同时评估 `loopCounts` 是否应归入"设置类"，不应上云（与 update.md 1.3 对齐）。

---

### H2【高】迁移遗漏官方词库的单元进度

**位置**：`src/core/cloud/migrate.ts:75-87`

```ts
for (const book of localBooks) {          // localBooks = localRepositories.books.getCustom()
  const records = await localRepositories.unitProgress.getByBook(book.id)
```

**问题描述**
单元进度的迁移只遍历**自定义词库**。而绝大多数用户的单元进度属于内置官方词库（`book_basewords`、`book_cet4`、`book_kaoyan` 等，`bookId` 也是这些 id），这部分进度完全不会上传。update.md 2.4 写的是"单元进度：云端没有该 (unitId, mode) 才写入"，并没有限定只迁移自定义词库。

**触发/复现**：在 CET4 词库学完若干单元，启用云模式并上传，词库页上这些单元全部显示"未开始"，进入单元会从第 1 个词重新开始。

**修复建议**：直接遍历本地 `unitProgress` 全表（`db.unitProgress.toArray()`，或在 `UnitProgressRepository` 上新增 `getAll()`），批量 `upsert(..., { onConflict: 'unit_id,mode', ignoreDuplicates: true })`。

---

### H3【高】`getAll()` 受 PostgREST 默认 1000 行上限静默截断

**位置**
- `src/core/cloud/supabaseRepository.ts:380-384`（`wordRecords.getAll`）
- `src/core/cloud/supabaseRepository.ts:340-353`（`books.getAll/getCustom`）、`450-454`（`wordOverrides.getAll`）、`517-521`、`568-575`
- 调用方：`src/db/index.ts:219-245`（`getActiveTroubleWords`）、`src/store/useWorkspaceStore.ts:1562-1570`（`syncStarredWordIds`）、`src/core/cloud/migrate.ts:63-73,90-100`

**问题描述**
Supabase 托管的 PostgREST 默认 `Max Rows = 1000`。超过上限时不会报错，只返回前 1000 行，而且这些查询没有 `order`，返回哪 1000 行是不确定的。`word_records` 的增长很快：`recordWordAttempt` 对每个练过的词都会建一条记录，跟学模式也算，所以长期用户很容易超过 1000 条。

后果：
1. 生错词本（`/errors`）、加星状态（`starredWordIds`）随机缺失。
2. **迁移判重集合被截断**：`remoteWordIds` 中缺失的那部分词会被误判为"云端没有"，随后 `put` 走 `upsert`，**把云端已有记录（练习次数、错词状态）覆盖为本地旧值**，直接违反"只补齐不覆盖"。

**修复建议**
- 列表查询按需过滤，不要全表拉取：生错词本用 `.or('is_error.eq.true,is_starred.eq.true')`，加星列表只 `select('word_id').eq('is_starred', true)`。schema 里已有对应的部分索引，正好能用上。
- 确实需要全量时用 `.range()` 分页循环读取，或改用 RPC。
- 迁移改用批量 `upsert(rows, { ignoreDuplicates: true })`（即 `ON CONFLICT DO NOTHING`），由数据库保证"只补齐"，不依赖客户端判重。这样同时能解决截断与 TOCTOU 两个问题。

---

### H4【高】云模式"读-改-写"无串行保护，单词记录并发互相覆盖

**位置**
- `src/db/index.ts:28-32`：`if (isCloudMode()) return fn()`，注释称"云模式下读改写直接在服务端串行执行"
- `src/db/index.ts:109-173`（`recordWordAttempt`：get → 计算 → **整行 put**）
- `src/db/index.ts:178-194`（`eliminateErrorWord`：get → patch）
- `src/store/useWorkspaceStore.ts:1402`（`recordWordAttempt(...)` 未 await）与 `:1420`（紧接着 `eliminateErrorWord(...)`，同样未 await）

**问题描述**
本地模式下 IndexedDB 按事务创建顺序排队执行，上述调用的落库顺序基本是确定的。云模式下每个调用都是两次独立的 HTTP 请求（GET + PUT/PATCH），多个调用之间没有任何串行化，请求到达服务端的顺序也不确定。典型场景：

1. **错词攻坚通关**：最后一遍打完时，`recordWordAttempt`（整行 upsert，携带旧的 `isStarred: true` / `isError`）与 `eliminateErrorWord`（patch `isStarred: false, isError: false, isMastered: true`）并发执行。如果 upsert 后到，**已消灭的词会留在生词本/错词本里**。
2. **默写三遍循环**：每遍打完都 fire-and-forget 一次 `recordWordAttempt`。短词打得快时，两次读改写会重叠，`totalPracticeCount` / `consecutiveCorrectCount` 丢失一次自增，导致"连续 3 次正确自动移出错词本"迟迟无法触发。
3. `markUnitWordForRetry`（`useWorkspaceStore.ts:194` 中 `void` 调用）与后续 `markUnitWordCompleted` 在高延迟网络下也可能重叠。

**修复建议**
- 最小改动：在客户端为云仓库加一个按主键串行的队列（例如 `Map<key, Promise>` 链式执行），让同一 `word_id` / `(unit_id, mode)` 的读改写顺序执行；同时修正 `runInUnitProgressTransaction` 的注释。
- 更彻底的做法：把计数类逻辑下沉到 Postgres RPC（`record_word_attempt(word_id, is_correct, mode, word_item)`），在一条 SQL 中完成 `insert ... on conflict do update set total_practice_count = word_records.total_practice_count + 1 ...`；`eliminateErrorWord` 也改为原子 `update`。
- 上层调用：`eliminateErrorWord` 应在 `recordWordAttempt` 完成之后再执行（await 链式调用）。

---

### H5【高】云端进度水合与页面初始化竞态，书/单元/进度错位

**位置**
- `src/components/cloud/CloudSyncGate.tsx:44-56`：先 `probeCloudConnection()`（网络往返），再 `hydrateWorkspaceProgress()`
- `src/core/cloud/sync.ts:60-67`：只 `setState({ currentBookId, currentUnitIndex, bookModeProgress, loopCounts, learnedRootIds })`
- `src/app/learn/page.tsx:58-80`：页面挂载后 `ensureWorkspaceHydrated()` → `enterMode()` → `loadCurrentUnitWords()`，读的是本地 persist 的值
- `src/store/useWorkspaceStore.ts:169-188`：`persistCompletedWord` 使用 `currentBookId` + `currentUnitMeta.id`

**问题描述**
跨设备正是这次迭代的核心场景：设备 B 最后在学 X 书，设备 A 本地 persist 的是 Y 书。设备 A 打开 `/learn` 时，页面先按本地值加载 Y 书单元，CloudSyncGate 的探测加水合需要若干次网络往返，完成后才把 `currentBookId` 改成 X、`currentUnitIndex` 改成云端值。但：

- `currentBook`、`currentLoadedWords`、`currentUnitMeta`、`cursors`、`loadedUnitKey` 都不会更新，也没有任何地方订阅 `currentBookId` 去触发重载（全局搜索确认）。
- 界面继续显示 Y 书的单词，而 `markUnitWordCompleted` 写入的是 `{ bookId: X, unitId: Y 的单元 id }`。这些 `unit_progress` 行挂在错误的 `book_id` 下：`getByBook(Y)` 查不到，`deleteByBook(X)` 却会误删。
- 用户在探测期间做的切书/切单元操作，会被水合直接覆盖（丢失更新）。

**修复建议**
- 让需要进度的页面等待云端水合完成：例如在 store 中增加 `cloudHydrated` 标志，把 `ensureWorkspaceHydrated()` 扩展为云模式下也等待 CloudSyncGate 完成；或者在 Gate 处于 `checking` 状态时显示加载遮罩。
- 水合完成后，如果 `currentBookId` / `currentUnitIndex` 发生了变化，应调用 `setBookId()` / `loadCurrentUnitWords()` 统一重建派生状态，而不是只改原始字段。

---

### H6【高】收件箱失败行永不出队：队头阻塞 + 重复消耗 AI 额度

**位置**
- `src/core/cloud/collector.ts:64-69`：`.is('pulled_at', null).order('id').limit(20)`
- `src/core/cloud/collector.ts:94-106`：AI 失败或返回 null 时 `continue`，不加入 `consumedIds`
- `src/lib/aiWordCore.ts:59`：`if (!isLikelyEnglishWord(word)) return Promise.resolve(null)`
- `src/lib/aiWordCore.ts:71`：未配置 AI Key 且离线缓存未命中时返回 null
- `src/components/cloud/CollectedWordsWatcher.tsx:19,71-73`：每 20 秒一次，窗口获得焦点时也会触发

**问题描述**
以下几种情况会让一行**永远**停留在 `pulled_at is null`：
- 外部翻译工具收藏了短语（如 `look forward to`）、带空格或标点的词、中文。`isLikelyEnglishWord` 只接受单个英文单词，直接返回 null。
- 用户没有配置 AI Key，且该词不在 10,289 词的离线缓存中。
- AI 判定词条无效（`AiDictionaryLookupError`）。

因为查询总是取 id 最小的 20 条，一旦积压 20 条这样的行，**之后收藏的任何单词都不会再被处理**。同时每 20 秒（每台设备、每个标签页）都会对这些行重新发起 AI 请求，持续消耗用户的 AI 额度。旧方案中 Redis 队列的拉取是出队式的，没有这个问题，这是本次新引入的。

**修复建议**
- 增加 `attempts int default 0`、`last_error text`、`failed_at bigint` 列。失败时递增 `attempts`，超过阈值后标记为失败并移出待处理（例如 `pulled_at = -1` 或单独的 `status` 字段），在设置面板里展示"有 N 条未能收录"。
- 对必然失败的输入（非单词、无 AI Key）直接标记失败，不重试。
- 查询条件排除已失败的行，或者按 `attempts` 升序排序，避免队头阻塞。

---

### M1【中】本地/云端并非"两套独立数据"：进度类 persist 共用 localStorage key

**位置**：`src/store/useWorkspaceStore.ts:1966,2026-2050`（`lingualoop-workspace-storage` 的 partialize 包含 `currentBookId`、`bookModeProgress`、`loopCounts`、`learnedRootIds`）；`src/store/useTranslateStore.ts:270-278`（`lingualoop-translate-storage` 包含 `books`、`completedSentenceIds`）

**问题描述**
云模式下，这些字段依旧由 zustand persist 实时写入 localStorage，并且就是本地模式使用的同一个 key。因此：
- 断开配置或降级到本地模式后，学习位置与翻译数据是**云端的最新值**，而错词本、单元进度、自定义词库（IndexedDB）却是**启用云模式那一刻的旧快照**。两者错位，例如"当前单元"指向一个本地 `unit_progress` 中并不存在的进度。
- "恢复云端连接（以云端为准）"会把降级期间在本地产生的学习位置直接覆盖掉，localStorage 里也不会留下副本。这与 update.md 第八节第 3 条"本地这份会变成冻住的快照"不符。

**修复建议**：二选一并在文档中写明。(a) 云模式下给这两个 store 换一个 persist key（例如加 `:cloud` 后缀），或者在云模式下关闭进度字段的 persist，真正做到两套数据；(b) 接受"进度共享"，并把 update.md 1.2 / 六 / 八 的描述改为实际行为。

---

### M2【中】翻译自定义题库：跨设备删除会"复活"，防抖合并会丢删除

**位置**：`src/core/cloud/sync.ts:130-135`（水合时保留"本地有、云端无"的题库）、`163-178`（推送逻辑）

**问题描述**
1. **删除复活**：设备 A 删除题库 X，云端随之删除。设备 B 的 localStorage 中仍有 X（来自早先的水合与 persist），下次启动时 `localCustom` 会把 X 留在 store 中。之后设备 B 只要新增或删除任意题库，`for (const book of books) putBook(book)` 就会把 X 重新写回云端。这与"删除即物理删除"的约定冲突，也是一种"隐式上传"，违背了"只在首次一次性上传"的规则。
2. **删除被防抖吞掉**：1.2 秒内先删 X、再新增 Z 时，第二次回调计算 `previousIds` 时已经基于删除后的 `lastBooks`，而且 `debounce` 会用第二个任务**替换**第一个任务，因此 X 的 `deleteBook` 永远不会执行。
3. 每次变更都把全部自定义题库重新 upsert 一遍，旧设备上的过期版本可能覆盖其他设备的修改。

**修复建议**：水合时以云端为准，不再合并 `localCustom`（本地独有的题库只通过迁移入口上传）。推送改为记录"待删除 id 集合"并累积到任务执行时一并处理，不要依赖被替换的闭包。只 upsert 发生变化的题库（按 id 对比签名）。

---

### M3【中】防抖推送不在卸载/重载前落盘，失败不重试

**位置**：`src/core/cloud/sync.ts:25-37`；`src/components/settings/CloudSyncPanel.tsx:84-86,107-115`（直接 `location.reload()`）；`src/components/cloud/CloudSyncGate.tsx:30-33`（`stopSync` 不清理 `timers`）

**问题描述**
- 切换词库或单元后 1.2 秒内关闭标签页、刷新页面，或者点了会触发重载的按钮，`app_state` / `translate_state` 的最后一次变更会丢失。换一台设备后，看到的是上一次的位置。
- 推送失败只打 `console.warn`，既不重试，也不在界面上提示。网络恢复后不会补推，下次 `start()` 重新水合时反而用云端的旧值覆盖本地的新值。

**修复建议**：监听 `pagehide` / `visibilitychange`，在这两个时机立即 flush 待推送任务（可以用 `fetch(..., { keepalive: true })` 直接调用 PostgREST）。推送失败时保留"脏标记"，网络恢复或下次成功请求时补推。`stopSync` 时 flush 或清理定时器。

---

### M4【中】云端写失败被静默吞掉，界面无感知

**位置**：`src/db/index.ts` 中几乎所有业务函数（如 `:170-172`、`:191-193`、`:281-284`、`:612-615`、`:757-759`）的 `try/catch` 都只 `console.error`；`src/app/reading/page.tsx:88-101` 在发起写入后立即更新 UI，失败只 `console.warn`。

**问题描述**
本地模式下 IndexedDB 几乎不会失败，这种处理方式问题不大。但在云模式下，网络抖动、key 被轮换、RLS 或权限错误都很常见。用户看到"已加星""已上传文章""已删除"，实际上什么都没写进去；刷新后数据消失，也无从排查。`saveWordOverride` 在云模式下由多次独立请求组成（`index.ts:752-756`），中途失败会留下部分写入的状态（override 已写，词库里的词条未更新）。

**修复建议**：云模式下把写入失败通过统一的事件或 toast 告知用户（例如在 `fail()` 中派发 `lingualoop_cloud_write_failed` 事件，由 Gate 显示提示条）。连续失败时把 Gate 切换到 error 状态。阅读页等乐观更新的地方，失败后回滚 UI。

---

### M5【中】收词：无认领机制、读错误被当作"不存在"、外部 `word_item` 未校验

**位置**：`src/core/cloud/collector.ts:64-69,85-86,94,108-128,135-146`；`src/db/index.ts:56-64`

**问题描述**
1. **多设备/多标签重复处理**：每台设备、每个标签页都会 `select ... pulled_at is null` 后各自处理，处理完再各自标记，没有原子"认领"。结果是 AI 被重复调用，`mergeWordsIntoBook` 会对整个 `words` jsonb 做并发读改写，可能把其他设备刚导入到「翻译工具收藏」词库的词覆盖掉。
2. **读错误被当成"不存在"**：`getWordRecord` 捕获异常后返回 `undefined`。网络抖动时，已存在的记录会被当成新词，走 `putWordRecord(newRecord)` 整行覆盖，**练习次数、错词状态被重置为 0**。
3. **外部数据未校验**：`row.word_item` 原样写入 `word_records` 与词库；`wordId: targetWord.id || canonicalId` 允许外部指定任意 id。如果外部工具传入的 `word_item.id` 是另一个词的 id，就会覆盖那个词的记录。`word_item` 结构不完整时（例如缺少 `syllables` 数组），渲染时可能报错，而且这条坏数据会同步到所有设备。
4. 判重用的是 `canonicalId`，写入用的是 `targetWord.id`，两者不一致时，`updateWordRecord` 会对一个不存在的 id 打补丁，结果什么也没写。

**修复建议**：改用 RPC 原子认领，例如 `update collected_words set claimed_at=... where id in (select id ... for update skip locked limit 20) returning *`。收词流程直接使用仓库方法，让读错误向上抛出，不要吞掉。强制 `wordId = buildWordId(row.word)`，并对 `word_item` 做最小结构校验（`name`、`posList`、`syllables` 等字段）。

---

### M6【中】阅读页云模式先渲染本地文章，加载前的增删会错写/被覆盖

**位置**：`src/app/reading/page.tsx:40-41`（初始值来自 localStorage）、`54-78`（异步加载云端文章后整体替换）、`81-102`（`persistArticles`）

**问题描述**
- 云模式首屏先显示 localStorage 中的**本地文章**，等云端返回后才替换，用户会看到短暂的错误数据。
- 云端返回之前，用户新增或删除文章：`persistArticles` 会把当前列表（本地文章）中所有 `isCustom` 的文章都 upsert 到云端，等于隐式上传；云端结果返回后又用 `setArticles(merged)` 覆盖界面，刚新增的文章可能从列表中消失（虽然已经写入云端）。
- 每次增删都会把**所有**自定义文章重新 upsert 一遍，产生 N 次请求。
- 加载失败时提示"暂时只能看到本地示例文章"，但实际展示的是 localStorage 中的全部本地文章，文案与实际不符。

**修复建议**：云模式下初始值只用 `DEFAULT_READING_ARTICLES`，并显示加载态；云端加载完成前禁用增删。新增只 `putArticle(newArticle)`，删除只 `deleteArticle(id)`，不要做全量 diff。

---

### M7【中】安全模型：RLS 全开放、收词工具需持有全权 key、"项目私有"不存在

**位置**：`supabase/schema.sql:174-226`；`docs/update.md` 1.5、四-4、六-1、八-4

**问题描述**
- 每张表都是 `for all to anon using (true) with check (true)`，再加上 `grant select, insert, update, delete ... to anon`。拿到 URL + anon key 的任何人都可以读取、篡改、**清空**全部学习数据。文档明确接受了这一点，这里不作为"漏配"处理，但需要指出：
  1. 文档给出的兜底措施"把项目设为私有"**在 Supabase 中并不存在**。REST 端点始终公网可达；Supabase 官方把 anon key 定位为"可公开的 key"，安全应由 RLS 保证。因此真正的兜底只有"key 不外泄"这一条。
  2. 外部翻译小工具需要直连同一个项目，就必须持有**同一把**可读写删全部 10 张表的 key。如果这个工具是浏览器扩展、公开网页或分发给他人的程序，key 很容易被提取。收词实际只需要 `collected_words` 表的 `insert` 权限。
  3. anon key 以明文存放在 localStorage，任何 XSS 或恶意浏览器扩展都能读取。
- `collected_words.word` 没有长度或格式约束，持有 key 的人可以大量写入垃圾数据。

**修复建议**（按改动量从小到大）
- 文档改为准确表述："URL + anon key 即全权凭据，请勿分享，泄露后需在控制台轮换 key"，并删除"设为私有"的建议。
- 给外部工具单独开一条最小权限通道：一个 `security definer` 的 RPC `collect_word(p_secret text, p_word text, ...)`，在函数内校验共享密钥后写入；撤销 anon 对 `collected_words` 的直接权限。也可以用 Edge Function 配合独立密钥。
- 为 `collected_words.word` 增加 `check (char_length(word) between 1 and 128)`。
- 中长期方案：启用 Supabase 匿名登录或邮箱登录，加上 `owner_id = auth.uid()` 的行级策略，让 RLS 真正生效（与 update.md 第九节"后续可做"一致）。

---

### M8【中】每个词 4 次以上网络往返 + 多处全表拉取，与 5.2 的设计意图不符

**位置**
- 每打完一个词：`recordWordAttempt`（GET + PUT）+ `markUnitWordCompleted`（GET + PUT）。后者在 `useWorkspaceStore.ts:1432-1437` 中**被 await 之后才切到下一个词**，所以切词会延迟 2 个 RTT。
- `useWorkspaceStore.ts:542`：每次加载单元都调用 `syncStarredWordIds()`，拉取整张 `word_records`（包含每行的 `word_item` jsonb）。
- `src/core/dictionarySearch.ts:158`、`src/db/index.ts:725`：查词或每次 AI 补全（`aiWordCore.ts:94` 中的 `saveWordOverride`）都会 `getCustom()`，拉取全部自定义词库的完整 `words` 数组。

**问题描述**：update.md 5.2 的目标是避免"每个词都发网络请求"，但防抖只覆盖了 `app_state`。在中等延迟网络下，打字节奏会明显变卡，流量也随词库大小线性增长。

**修复建议**：把计数和进度合并为一次 RPC（参见 H4），并且不阻塞切词（先在本地推进，后台写入）。`syncStarredWordIds` 只查 `word_id` 并加 `is_starred` 过滤，加载单元时不必每次都重新拉取。`saveWordOverride` 只更新包含该词的词库：可以用 `words @> '[{"id":"..."}]'` 的 jsonb 查询在服务端筛选，或者在客户端缓存词库列表。

---

### M9【中】`getCustomBooks` 的"冗余测试数据清理"会删除云端「翻译工具收藏」词库

**位置**：`src/db/index.ts:304-326`

**问题描述**
当自定义词库**全部**是「我的自定义生词本」、`book_custom_collected` 或示例词库，且数量大于 1 时，会删除除示例词库外的所有词库及其单元进度。典型场景：新用户只有示例词库，外部工具收词后自动创建了「翻译工具收藏」，于是 `custom = [示例, 收藏]` 满足条件。用户打开词库页或导入弹窗，**收藏词库连同其单元进度就被删除了**。这段逻辑在本次迭代之前就存在，但现在删除会作用到云端，影响所有设备；而且收词功能只在云模式下运行，这个场景的触发概率明显上升。

**修复建议**：从判定条件中去掉 `book_custom_collected`，或者删除这段一次性的历史清理逻辑（它原本只是用来清理开发期的测试数据）。

---

### M10【中】迁移流程的其他缺陷

**位置**：`src/core/cloud/migrate.ts` 全文；`src/components/settings/CloudSyncPanel.tsx:78-87,89-105,223-231`；`src/db/index.ts:315-325`

**问题描述**
1. **时序**：迁移只能在"保存并启用 → 重载 → 进入云模式"之后手动点击。在这段时间里，页面已经开始向云端写数据：练习会写 `word_records`，`getCustomBooks()` 发现云端为空时会写入示例词库。之后再迁移，这些词与示例词库都会被判定为"云端已存在"而跳过，**本地的历史计数、错词状态，以及用户在示例词库中导入的词都不会上传**。
2. **"一次性"没有约束**：任何设备在任何时候都可以点击上传。旧设备上的陈旧数据，例如已在云端删除的词库或记录，会被重新补回去。
3. **非原子且慢**：逐行串行请求。单元进度每条记录还要先 GET 再 PUT，上千条记录需要几千次往返；中途失败时会留下部分迁移的状态。

**修复建议**：在"保存并启用"流程中，探测成功后**先迁移，再重载**，或者在重载后、Gate 开始水合之前执行迁移。迁移改为批量 `upsert(..., { ignoreDuplicates: true })`，每批几百行。在 `app_state` 中记录 `migrated_at` 和来源设备，再次上传时给出明确提示。

---

### M11【中】其他标签页切换模式时，本标签页不重载就换了数据源

**位置**：`src/core/cloud/config.ts:103-116`（监听 `storage` 事件）；`src/components/cloud/CloudSyncGate.tsx:68`；`src/db/repository.ts:183-185`（每次调用都实时读取 `isCloudMode()`）

**问题描述**：标签页 B 选择"临时用本地模式"或"恢复云端"后，标签页 A 收到 `storage` 事件。之后 A 的 `getRepositories()` 立即切换到另一套仓库，但 A 内存中的 store 仍然是原来那套数据，于是出现"内存是云端数据、写入落到本地"或者反过来的交叉写入。配置 URL 被改动时，A 也会在运行中途改写另一个项目。

**修复建议**：A 收到其他标签页的模式或配置变更后，弹出提示并强制重载；或者在页面加载时锁定本次会话的模式，运行期间不再动态切换。

---

### L1【低】连接体检覆盖不全，且没有超时

**位置**：`src/core/cloud/client.ts:72-92`

- 体检只执行 `select id from app_state limit 1`。如果其他表没建，或者 RLS 已开启但没有策略（这时 select 返回空数组且不报错），体检仍然显示"连接正常，数据表已就绪"，随后的写入才报 42501。
- supabase-js 默认没有请求超时。网络挂起时，Gate 会一直停在 `checking`（不显示任何 UI），所有仓库调用也一直挂起，应用看起来像卡死。
- 建议：体检时对 10 张表依次执行 `select(..., { head: true, count: 'exact' })`，或者提供一个 `lingualoop_health()` RPC 返回 schema 版本号；所有请求加上 `.abortSignal(AbortSignal.timeout(8000))`，或在 `global.fetch` 中统一设置超时。

### L2【低】错误分类分支部分不可达，"Invalid API key" 无法识别

**位置**：`src/core/cloud/client.ts:50-69`

- 通过 `{ error }` 返回的 `PostgrestError` 只有 `message/details/hint/code` 四个字段（已核对 postgrest-js 源码），没有 `status`，因此 `status === 401/403` 分支永远不会命中。
- Supabase 网关对无效 key 返回的 message 是 `Invalid API key`（中间有空格），正则 `/apikey/` 匹配不到，最终落到 `unknown`，界面直接显示英文原文。
- 建议：读取响应中的 `status`（`const { error, status } = await ...`），并让正则也能匹配 `api key`。

### L3【低】自建 Postgres 缺少序列权限，与脚本注释不符

**位置**：`supabase/schema.sql:220-226`

脚本注释说"避免在自建 Postgres 上漏权限"，但没有 `grant usage on sequence collected_words_id_seq to anon`。在原生 Postgres 上，外部工具 insert 时会报 permission denied for sequence。Supabase 托管环境有默认权限，不受影响。建议补上这条授权，或者把 `id` 改为 `generated always as identity`，并同样授权。

### L4【低】没有拦截误填的 service_role / secret key

**位置**：`src/components/settings/CloudSyncPanel.tsx:78-87,158-160`

界面只给了文字提示。如果用户误填了 legacy `service_role` JWT，这把 key 会长期明文存放在 localStorage 中，并且绕过 RLS。建议保存前解码 JWT 检查 `role`，同时识别 `sb_secret_` 前缀，命中时拒绝保存。

### L5【低】进度订阅初始快照有误，首次任意变更都会推送；每次按键都做序列化

**位置**：`src/core/cloud/sync.ts:75-85`

`lastSnapshot` 初始值包含 `updatedAt: Date.now()`，而后续比较使用的是 `updatedAt: 0`，所以订阅后的第一次任意 store 变更（哪怕只是按了一个键）都会触发一次推送。另外，订阅会在每次按键时对整个 `bookModeProgress` 做 `JSON.stringify`。建议初始值同样置为 `updatedAt: 0`，并改用 `subscribe(selector, ...)`，只关注进度相关字段。

### L6【低】`ensureTranslateHydrated` 没有超时；文档说"先 await"，实际是 `void`

**位置**：`src/core/cloud/sync.ts:99-108,154-155`

如果 localStorage 中的翻译数据损坏，导致 persist 水合抛错，zustand 不会触发 `onFinishHydration`，这个 Promise 会永远挂起。CloudSyncGate 随之卡住，workspace 的推送也永远不会启动。建议参照 `ensureWorkspaceHydrated` 增加超时兜底，并修正 update.md 5.3 的描述。

### L7【低】阅读文章 `updated_at` 恒等于 `created_at`；内置文章删除行为与本地模式不一致

**位置**：`src/core/cloud/supabaseRepository.ts:318-328`；`src/app/reading/page.tsx:62-65,88-101`

`readingToRow` 把 `updated_at` 写成 `createdAt`，这个字段失去了意义。云模式下删除内置示例文章不会持久化，刷新后文章又会出现；本地模式下删除则会持久化。建议明确内置文章是否允许删除，并保持两种模式行为一致。

### L8【低】`package-lock.json` 仍残留 `@upstash/redis`

**位置**：`package-lock.json:12,2408`

`package.json` 已经移除了这个依赖，但 lock 文件根依赖和 `node_modules/@upstash/redis` 条目仍在。`npm ci --dry-run` 不会报错，但安装时仍会装上它，也容易让人误以为还在使用。建议重新执行 `npm install` 生成 lock 文件。

### L9【低】表结构细节

**位置**：`supabase/schema.sql`

- `vocab_units`（`:35-44`）当前完全没有被读写（文档已承认）。建议要么删除，要么在仓库层接入，避免 schema 与代码长期不一致。
- `word_records` 的部分索引（`:63-64`）没有被任何查询用到，因为客户端总是全表拉取（参见 H3、M8）。
- jsonb 列缺少形状约束，例如 `check (jsonb_typeof(words) = 'array')`。外部工具同样直连数据库，坏数据会扩散到所有设备。
- 没有 schema 版本表，后续字段演进时客户端无法判断数据库是否已经升级。

### L10【低】切到内置词库时仍发 DELETE；按 id 读词库吞错误后静默回退

**位置**：`src/store/useWorkspaceStore.ts:820-825`；`src/db/index.ts:39-47`

- `setBookId` 切到内置词库时，会调用 `deleteVocabularyBookById(bookId)`。这一步原本是为了清理 IndexedDB 中的占位记录，云模式下却变成了一次无意义的 DELETE 请求，而本地占位记录也不再被清理。
- `getVocabularyBookById` 吞掉错误、返回 `undefined`，网络失败时 `setBookId` 会静默回退到 `BUILTIN_BOOKS[0]`，用户会莫名其妙被切到第一本官方词库。

### L11【低】降级/断网状态的恢复体验

**位置**：`src/components/cloud/CloudSyncGate.tsx:68-75`

收到 `offline` 事件后只切换 UI 状态，没有停止推送；网络恢复（`online`）后也不会自动重新探测。降级标记会一直有效，用户容易忘记自己正处于本地模式，数据持续分叉。建议监听 `online` 事件自动重试；降级期间在页头显示常驻标识。

---

### X1【范围外附带发现】作者身份 token 硬编码在前端

**位置**：`src/lib/permissions.ts:2`（`AUTHOR_SYNC_TOKEN = 'myword_jack'`）；`src/app/api/dict/update-word/route.ts:38-44`（403 报错信息中直接回显 token）

这部分与 Supabase 无关，但本次迭代改动了 `SettingsModal` 中这个 token 的文案，所以顺带指出：这个 token 会被打进前端 bundle，任何人都能看到，接口的错误信息还会直接告诉调用者。它保护的是"修改服务器上 `public/dicts/*.json` 官方词库"的写接口。建议改为服务端环境变量，并从错误信息中移除。

---

## 四、需要和作者确认的疑点

1. **外部翻译小工具的形态**：它是浏览器扩展、网页、桌面程序还是脚本？anon key 存放在哪里？会不会分发给其他人？这决定 M7 是否需要升级为"高"，以及是否必须为收词单独开最小权限通道。
2. **`loopCounts` 的归类**：它是"每种模式打几遍"的设置。按 update.md 1.3 的划分应当只存本地，是否确认要跨设备同步？
3. **首次启用时以谁为准**：本机已有进度、云端是新库时，预期是"本地进度自动成为云端初始值"吗？迁移能否改为在"保存并启用"时自动执行，而不是让用户事后手动点击（参见 H1、M10）？
4. **官方词库的单元进度**：确认需要迁移（H2）。目前看来是遗漏，不是有意为之。
5. **断开配置后的预期**：本地的学习位置、翻译进度应该回到启用前的快照，还是保留云端最新值（M1）？两种方案的实现方向不同。
6. **收件箱中无法收录的条目**（短语、非英文、无 AI Key）：应该丢弃、标记失败后展示给用户，还是尝试按短语处理（H6）？
7. **数据规模**：Supabase 项目的 `Max Rows` 是否调整过？预期单用户的 `word_records` 会达到什么量级（H3、M8）？
8. **多设备同时在线的频率**：如果常有两台设备同时开着，收词的重复处理与 jsonb 整行覆盖（M5）就需要优先处理。
9. **阅读模块的内置示例文章**：云模式下是否允许删除并持久化（L7）？
10. **账号体系的计划**：是否考虑用 Supabase 匿名登录（不需要注册）配合 `owner_id = auth.uid()` 的行级策略？这样改动不大，又能让 RLS 真正生效。
11. **需要在真实项目中验证的点**：自定义请求头 `x-lingualoop-client` 能否通过 Supabase REST 的 CORS 预检；`.in('word_id', [...])` 在大单元下的 URL 长度；以上各项都应在 update.md 第九节计划的端到端联调中覆盖。

---

## 五、建议的修复优先级

1. **联调前必须修**：H1、H2、H3、H5（这些会导致数据丢失或错位，而且首次使用必然触发）。
2. **紧随其后**：H4、H6、M2、M9（核心学习流程与收词链路的正确性）。
3. **体验与稳健性**：M3、M4、M5、M6、M8、M10、M11。
4. **安全与文档**：M7（至少先修正文档表述），以及 update.md 中与实现不符的描述（第二节表格）。
5. **低优先级**：L1–L11、X1。
