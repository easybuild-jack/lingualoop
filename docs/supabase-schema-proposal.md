# Supabase 数据库脚本修订方案（v2 建议稿）

> **⚠ 本文已被取代，仅作历史参考。**
> 作者后来确定了账号模型（`account_id`：进度表必填，内容表可空，NULL 表示共享），并要求直接修改脚本。
> 最终结果以这两份为准：
> - 数据库脚本：`supabase/schema.sql`（schema_version = 2，已包含账号模型和下文的全部库层修复，并支持从 v1 原地升级）
> - 开发计划：`docs/supabase-dev-plan.md`（需求、已定规则、库表改动、后续代码改造、不做的事、验收标准、待确认项）
>
> 下文中凡是与这两份冲突的内容（没有账号字段、`app_state` 保留 `id = 1` 和 `book_mode_progress`、单独的升级 SQL 等），都以新脚本和开发计划为准。

> 基准：`supabase/schema.sql`（v1，dev2 分支现状）、`docs/update.md`、上一轮报告 `docs/supabase-review-report.md`。
> 前提（作者已定）：
> 1. 官方词库（CET4、考研等）不入库，以 JSON 放在 `public/dicts/` 本地；**官方词库的学习进度入库**。
> 2. 权限与安全策略本次不调整，沿用 v1 的模型。外部同步工具直连数据库。
> 3. 先把脚本定下来；本轮不改业务代码，也不改现有 SQL 文件。
>
> 本文所有 SQL 都已在本机 PostgreSQL 16 上实际执行，并以 `anon` 角色跑过功能测试和并发测试（见第 8 节）。

---

## 0. 结论

**现有表结构基本能承载官方词库的进度。** `unit_progress.book_id / unit_id`、`completed_word_ids` 里的 `word_id`、`word_records.word_id` 全都是字符串标识，不依赖库里存词条。所以官方进度入库这件事不需要推翻 v1，但有 5 处必须在库层改，否则会直接产生错误数据：

| # | 必须改的点 | 对应上一轮问题 | v2 做法 |
|---|---|---|---|
| 1 | `app_state` / `translate_state` 预插入空行，客户端把"空行"当成"云端已有数据"，本地进度被覆盖，`loopCounts={}` 还会让默写只需 1 遍 | H1 | 不再预插入；"没有行"即"云端无数据" |
| 2 | 生词本、错词本、整表读取受 PostgREST 1000 行上限静默截断 | H3 | 新增返回标量的 RPC（不受截断），并补部分索引；同步工具用 `server_updated_at` 做 keyset 分页 |
| 3 | 单词记录、单元进度、词库并词都是"客户端读 → 改 → 整行写回"，并发互相覆盖 | H4 | 新增 6 个 RPC，在一条事务里完成读改写，规则与 `src/core/db/index.ts` 逐条对应 |
| 4 | 收件箱只有 `pulled_at` 一个状态，失败行永远堵在队头，重复消耗 AI 额度 | H6、M5 | 增加 `status / attempts / last_error / 租约`，用 `skip locked` 认领；兼容旧的 `pulled_at` 写法 |
| 5 | `unit_progress` 主键 `(unit_id, mode)` 不含 `book_id`，一条进度会被静默改挂到另一本书下 | H5 的库层兜底 | 主键改为 `(book_id, unit_id, mode)`，保留 `(unit_id, mode)` 唯一约束（现有代码的 `onConflict` 不用改），触发器拒绝改挂 |

其余改动（默认值、check 约束、`server_updated_at`、冗余计数由触发器维护、删除自定义词库时级联清理进度、`book_progress` 拆表、schema 版本表）属于"让外部工具直连更安全可靠"的加固，可按第 7 节的选择取舍。

**兼容性**：v2 保持所有现有列名和类型不变，现有代码的每一个 `select('*')`、`upsert(..., { onConflict })`、`update`、`delete` 都能继续工作（第 8 节逐条测过）。RPC 是新增能力，代码可以分批切换。唯一的行为变化是：如果代码试图把一条单元进度改挂到另一本书，会收到错误而不是静默成功（这正是我们想要的）。

---

## 1. 官方 / 自定义进度承载分析

### 1.1 标识体系

| 标识 | 官方词库 | 自定义词库 | 来源 |
|---|---|---|---|
| `book_id` | `book_basewords`、`book_cet4`、`book_kaoyan`、`book_ielts`、`book_coder` | `book_custom_sample`、`book_custom_collected`、`book_custom_<时间戳>` | 官方：`public/dicts/` 配置；自定义：`vocab_books.id` |
| `unit_id` | 有目录时取 `public/dicts/*.units.json` 中的语义单元 id（如 `cet4_time_numbers`、`kaoyan_*`）；无目录时为 `${bookId}_unit_${i}` | `${bookId}_unit_${i}` | 本地 JSON 或按 `unit_size` 切片 |
| `word_id` | `buildWordId(name)` = `word_<slug>` | 同左 | 由拼写派生，与存储位置无关 |

结论：

- **进度和词条完全解耦**。库里只存字符串 id，打开官方词库时由本地 JSON 解析出单元成员，再和库里的 `completed_word_ids` 求交集即可。这一点 v1 已经做对了，v2 保留。
- **官方与自定义共用一套表是合理的**。两者的进度形状完全相同，分表只会让同步工具和代码多一倍分支。v2 增加了生成列 `book_kind`（`official` / `custom`，按 `book_id` 前缀 `book_custom_` 计算），外部工具可以直接按它筛选，不必自己解析前缀。
- **`unit_id` 全局唯一的前提成立**。我核对了 5 本官方词库的 `*.units.json`，语义单元 id 之间没有重复；自定义单元 id 自带 `book_id` 前缀。因此 v2 保留 `unique (unit_id, mode)`，现有代码按 `unit_id` 单独查询仍然正确。
- **单词掌握记录跨词库共享**：`word_records` 以 `word_id` 为主键，同一个词在 CET4 和自定义词库里共用一条记录。这是 v1 的既有语义（生词本、错词本都是跨书的），v2 保留，`book_id` 列只作"首次记录时所在词库"的参考。

### 1.2 不能对 `vocab_books` 建外键

`unit_progress.book_id` 同时承载官方词库 id，而官方词库不在 `vocab_books` 里，所以无法建外键。v2 用 `vocab_books` 的 AFTER DELETE 触发器代替：删除自定义词库时，在库内同一事务里清掉它的 `unit_progress` 和 `book_progress`。这样即使外部工具直接 `delete from vocab_books`，也不会留下孤儿进度。现有代码里的 `deleteByBook` 仍可保留，重复删除没有副作用。

### 1.3 库层解决不了、需要代码或约定配合的风险

| 风险 | 说明 | 建议 |
|---|---|---|
| 官方 JSON 更新后单元成员变化 | 某个词被移出单元后，库里的 `completed_word_ids` 还留着它，单元可能永远达不到"全部完成"，或者新加入的词被误判为已完成 | v2 的 `mark_unit_word_completed` 每次调用都按传入的 `p_unit_word_ids` 剪除失效词（与 TS 版 reconcile 逻辑一致）。另见第 7 节 D9：是否记录官方 JSON 版本号 |
| 自定义词库按下标切片 | 在词库中间插入单词会让后面所有单元整体平移，`${bookId}_unit_${i}` 指向的词集合随之变化 | 同上，靠剪除兜底。根治需要给自定义词库也生成稳定的单元 id，属于代码设计，本方案不改 |
| `book_mode_progress` 按单元下标记录 | 官方目录调整顺序后，下标会指向别的单元 | `book_progress` 表预留了可空的 `unit_id` 列，代码可以同时写下标和 id，读取时优先用 id 定位 |
| 官方词的 `word_item` 快照 | `word_records.word_item` 会存一份完整词条。对官方词来说这是冗余数据，官方 JSON 更新后快照会过期 | 见第 7 节 D4 |

---

## 2. 逐项改动说明与差异

### 2.1 不再预插入空的状态行（H1）

**v1**：脚本末尾执行 `insert into app_state (id) values (1) on conflict do nothing`，`translate_state` 同理，生成 `updated_at = 0`、各 jsonb 为空的行。

**问题**：客户端的 `appState.get()` 只要读到一行就当作"云端已有数据"，用空数据覆盖本地进度。其中 `loop_counts = {}` 会让默写的循环次数退回默认值，默写只需 1 遍就算完成。

**v2**：删除预插入语句。表里没有行就是"云端还没有数据"，`maybeSingle()` 返回 `null`，客户端会走"首次上传本地进度"的分支。升级脚本只删除 `updated_at = 0` 的行，也就是从未被真正写入过的种子行，已写入的数据不会动。

连接体检（`src/core/cloud/client.ts:82`）用的是 `select('id').limit(1)`，空表返回空数组而不是错误，不受影响。

### 2.2 1000 行截断（H3）

PostgREST 的 Max Rows 默认是 1000，`select('*')` 超过 1000 行时会静默截断，不报错。返回**单个标量**（`text[]`、`jsonb`）的 RPC 不受这个限制。

| 场景 | v2 方案 |
|---|---|
| 生词本 id 列表 | `get_starred_word_ids()` 返回 `text[]`，配合部分索引 `word_records_starred_idx` |
| 错词本 / 生词本完整记录 | `get_trouble_word_records()` 返回 `jsonb` 数组，按 `last_practiced_at desc` 排序，配合部分索引 `word_records_trouble_idx` |
| 外部工具增量拉取 | 每张业务表都有 `server_updated_at` 和对应索引，按 `(server_updated_at, 主键)` 做 keyset 分页，见第 4 节 |
| `getAll()` 类整表读取 | 库层无法替代，代码需要改成分页循环或按需查询（第 6 节） |

测试中插入了 1500 个加星词，`get_starred_word_ids()` 以 `anon` 身份一次返回全部 1500 个。

**索引调整**：v1 的 `word_records_error_idx`（只覆盖 `is_error`）没有任何查询能用上，因为代码的错词本查询条件是 `is_error or is_starred`；`word_records_book_idx` 和 `unit_progress_book_idx` 也删掉，后者已经被新主键 `(book_id, ...)` 的前缀覆盖。

### 2.3 读改写并发（H4）

v1 的单词记录、单元进度、词库并词都是"客户端读一行 → 在内存里改 → 整行 upsert 回去"。两次请求交错时，后写的会覆盖先写的结果。比如快速连续答两个题，练习次数只加 1；两个词几乎同时完成，单元的 `completed_word_ids` 只记下一个。

v2 把这些操作放进 RPC，每个 RPC 在一条事务里完成读改写：

| RPC | 替代的 TS 逻辑 | 并发控制 |
|---|---|---|
| `record_word_attempt(word_id, book_id, is_correct, mode, word_item)` | `recordWordAttempt` | `insert ... on conflict do update`，行级锁 |
| `toggle_star_word(word_id, book_id, word_item)` | 加星 / 取消加星 | 同上，返回切换后的 `is_starred` |
| `mark_unit_word_completed(book_id, unit_id, mode, word_id, word_index, unit_word_ids, defer_for_retry)` | `markUnitWordCompleted`（含 reconcile 剪除失效词） | 先确保行存在，再 `select ... for update` |
| `mark_unit_word_for_retry(book_id, unit_id, mode, word_id, word_index)` | `markUnitWordForRetry` | `insert ... on conflict do update` |
| `merge_words_into_book(book_id, words)` | `mergeWordsIntoBook` | `select ... for update` 锁住词库行；返回 `{added, updated, total_words}` |
| `merge_translate_state(current_book_id, completed, updated_at)` | 翻译进度推送 | `completed_sentence_ids` 取并集，`updated_at` 取较大值 |

每个 RPC 的分支规则（`is_error` 何时清除、`is_mastered` 怎么算、`current_word_index` 取较大值、何时进入重试、`completed_at` 何时写入）都按 `src/core/db/index.ts` 的现有实现逐条复刻，并对照测试过。

所有 RPC 都是 `security invoker`（默认），执行权限与直接读写表一致，不改变现有权限模型。

### 2.4 收件箱（H6、M5）

**v1**：`collected_words` 只有 `pulled_at`，客户端 `.is('pulled_at', null).order('id').limit(20)`。AI 解析失败的行既不标记也不出队，永远占着前 20 个位置，后面的词进不来，而且每次拉取都会重新调用 AI。

**v2**：

- 新增 `status`（`pending` / `processing` / `done` / `failed`）、`attempts`、`last_error`、`claimed_at`、`claimed_by`。
- `claim_collected_words(limit, claimer, lease_ms)` 用 `for update skip locked` 认领，多设备同时拉取不会领到同一行。认领超时（默认 5 分钟）的行会被重新认领。
- `complete_collected_words(ids)` 标记完成，同时写 `pulled_at`。
- `fail_collected_word(id, error, retryable, max_attempts)`：可重试且次数未满就退回 `pending`，否则进入 `failed` 终态，不再阻塞队列。
- **外部工具写入方式不变**：只需 `insert (word[, meaning, source, word_item])`，其余列都有默认值。
- **兼容 v1 写法**：触发器检测到有人写入 `pulled_at` 时，自动把 `status` 置为 `done`。现有 `collector.ts` 不改也能正常运行，只是还享受不到重试和认领能力。
- `id` 改为 `generated by default as identity`（全新安装时）；升级时保留原来的 `bigserial`，两者对外行为相同。脚本统一授予序列的 `usage, select` 权限，修复 L3（原生 Postgres 上 insert 报 permission denied for sequence）。

### 2.5 `unit_progress` 主键（H5 的库层兜底）

**v1**：主键 `(unit_id, mode)`。代码 upsert 时 `onConflict: 'unit_id,mode'`，如果因为水合竞态带上了错误的 `book_id`，这条进度会被静默改挂到另一本书下，库里看不出任何异常。

**v2**：

- 主键改为 `(book_id, unit_id, mode)`，与"进度属于某本书的某个单元"的语义一致，`getByBook` 直接走主键前缀。
- 保留 `constraint unit_progress_unit_mode_key unique (unit_id, mode)`。现有代码的 `onConflict: 'unit_id,mode'` 仍然有效，按 `unit_id` 单独查询仍然唯一。
- 触发器 `unit_progress_guard`：`update` 试图修改 `book_id` 时抛出错误（错误码 23514）。`mark_unit_word_completed` 遇到"这个单元已属于别的书"时同样抛出 23514。`mark_unit_word_for_retry` 在同样情况下由唯一约束抛出 23505。客户端可以把这两个错误码当作"书和单元错位"处理。

是否保留 `unique (unit_id, mode)` 见第 7 节 D1。

### 2.6 `book_progress` 新表（拆分 `app_state.book_mode_progress`）

**v1**：每本书在每种模式下"上次学到第几单元"整块存放在 `app_state.book_mode_progress`（jsonb）里，每次推送都整块覆盖。设备 A 学 CET4、设备 B 学考研，后推送的一方会把另一方的位置抹掉。

**v2**：新表 `book_progress`，一行对应一个 `(book_id, mode)`，包含 `unit_index`、可选的 `unit_id`、`updated_at`。触发器 `book_progress_newer_wins`：如果写入的 `updated_at` 比库里旧，就忽略这次更新。所以客户端用普通 upsert 就能获得"新者胜"语义，不需要先读后比。

`app_state.book_mode_progress` 暂时保留为过渡字段，代码切换后再删除。升级脚本会把现有 jsonb 拆成行写入 `book_progress`，非法值（非数字、未知模式）会被跳过。

### 2.7 默认值与时间戳

| 项 | v1 | v2 | 理由 |
|---|---|---|---|
| 业务时间戳（`created_at`、`updated_at`） | 大多没有默认值 | 默认 `now_ms()`（epoch 毫秒，`bigint`） | 外部工具 insert 时可以省略；类型和语义与前端 TS 一致，仍由客户端写入 |
| `server_updated_at` | 无 | 每张业务表都有，由触发器在每次 insert/update 时写入 | 外部工具做增量同步时，不受各设备时钟偏差影响；客户端不需要写它 |
| `word_records.created_at` | 无 | 新增 | 便于统计和排查 |
| 冗余计数 `vocab_books.total_words`、`translate_books.total_sentences` | 客户端写入 | 触发器按数组长度维护 | 外部工具改了 `words` 也不会让计数失真 |

`now_ms()` 基于 `clock_timestamp()`，同一事务内多次调用也会得到真实的递增时间。

### 2.8 check 约束

| 表 | 新增约束 |
|---|---|
| 所有以文本为主键的表 | 主键不能是空字符串 |
| 所有 jsonb 列 | `jsonb_typeof` 必须是 `array` 或 `object`（按列的语义） |
| `word_records` | 3 个计数字段 `>= 0` |
| `unit_progress` | `current_word_index >= 0` |
| `vocab_books` | `unit_size between 1 and 1000`；`is_custom` 必须为 true（见 D12） |
| `collected_words` | `word` 去除空白后不能为空；`status` 取值范围；`attempts >= 0` |
| `app_state` | `current_unit_index >= 0` |

理由：外部工具直连写库，没有经过前端的类型检查。一条形状错误的 jsonb 会同步到所有设备，在渲染时才报错，很难排查。约束让错误在写入时就暴露出来。

升级路径上，这些约束先以 `not valid` 方式添加（不扫描存量数据），第 3 步再统一 `validate`。如果存量数据有问题，会在 `validate` 时报出具体的约束名。

### 2.9 软删除

v2 **没有**引入软删除，所有删除仍是物理删除，与 `update.md` 的"删除即物理删除"约定一致。

需要说明的是，上一轮的 M2（翻译题库跨设备删除后"复活"）本质上是"删除这件事没有被记录下来"，另一台设备无法区分"别人删掉了"和"我这里新建的还没上传"。库层有两种解法：

- **软删除**：每张表加 `deleted_at`，所有查询都要过滤，外部工具也要遵守。改动面大。
- **删除日志表**：新增 `deletions(table_name, row_id, deleted_at)`，由触发器在物理删除时记录。现有查询不用改，需要的客户端或同步工具自己去查。

本方案倾向后者，但它只在代码配合时才有意义，因此作为可选项放在第 7 节 D8，没有写进主脚本。

### 2.10 schema 版本

新增 `schema_meta(key, value)`，写入 `schema_version = '2'`。客户端体检时可以读它，判断用户的库是否已经升级到代码期望的版本，给出"请执行升级脚本"的提示，而不是在某个 RPC 调用时才报"函数不存在"。

### 2.11 `vocab_units`

v1 建了 `vocab_units`，但代码完全没有读写它（`update.md` 也承认了这一点）。官方词库的单元来自本地 JSON，自定义词库的单元按 `unit_size` 动态切片，都不需要这张表。v2 全新安装脚本不再创建它；升级脚本里的删除语句默认注释掉，由作者决定（D3）。

---

## 3. 与 v1 的差异总表

| 对象 | v1 | v2 | 兼容现有代码 |
|---|---|---|---|
| `vocab_books` | — | 加默认值、check、`server_updated_at`；`total_words` 由触发器维护；删除时级联清理进度 | 是 |
| `vocab_units` | 存在但未使用 | 全新安装不建；升级时可选删除 | 是（代码没有用到） |
| `word_records` | 2 个部分索引 + `book_idx` | 新增 `created_at`、`server_updated_at`、check；索引换成与查询匹配的部分索引 | 是 |
| `unit_progress` | 主键 `(unit_id, mode)` | 主键 `(book_id, unit_id, mode)` + `unique (unit_id, mode)`；生成列 `book_kind`；改挂保护 | 是（`onConflict: 'unit_id,mode'` 仍有效） |
| `book_progress` | 无 | 新表，新者胜 | 新增，不影响 |
| `word_overrides` | — | 默认值、jsonb check、`server_updated_at` | 是 |
| `translate_books` | — | 默认值、check、`server_updated_at`；`total_sentences` 由触发器维护 | 是 |
| `reading_articles` | — | 默认值、check、`server_updated_at` | 是 |
| `collected_words` | `bigserial` + `pulled_at` | 状态机 + 租约 + 重试；兼容 `pulled_at` 写法 | 是 |
| `app_state` | 预插入空行 | 不预插入；默认值、check；`book_mode_progress` 标为过渡字段 | 是，且修复 H1 |
| `translate_state` | 预插入空行 | 不预插入；默认值、check | 是，且修复 H1 |
| `schema_meta` | 无 | 新表 | 新增 |
| 函数 | 无 | `now_ms`、6 个读改写 RPC、2 个标量读取 RPC、3 个收件箱 RPC、若干触发器函数 | 新增 |
| 权限 | 每张表 `anon_all` | 不变，扩展到新表；补序列授权；RPC 授予 `anon` 执行 | 是 |

---

## 4. 外部同步工具直连约定

### 4.1 upsert 冲突键清单

| 表 | 冲突键（`on conflict` / `onConflict`） | 备注 |
|---|---|---|
| `vocab_books` | `id` | 只允许自定义词库（`is_custom = true`） |
| `word_records` | `word_id` | 计数类字段建议走 `record_word_attempt`，不要整行覆盖 |
| `unit_progress` | `book_id, unit_id, mode`（推荐）或 `unit_id, mode` | 不能修改已有行的 `book_id` |
| `book_progress` | `book_id, mode` | 自动新者胜，必须带 `updated_at` |
| `word_overrides` | `word_id` | |
| `translate_books` | `id` | |
| `reading_articles` | `id` | |
| `collected_words` | 无，只 insert | 不要 upsert；消费走 RPC |
| `app_state` / `translate_state` | `id`（恒为 1） | 翻译进度建议走 `merge_translate_state` |

### 4.2 增量拉取

```sql
-- 首次 :cursor_ts = 0, :cursor_key = ''
select * from word_records
where (server_updated_at, word_id) > (:cursor_ts, :cursor_key)
order by server_updated_at, word_id
limit 500;
-- 用最后一行的 (server_updated_at, word_id) 作为下一页游标
```

PostgREST 写法：`.or('server_updated_at.gt.X,and(server_updated_at.eq.X,word_id.gt.K)').order('server_updated_at').order('word_id').limit(500)`。每页不超过 1000 行，就不会触发截断。

注意：用物理删除时，增量拉取发现不了被删除的行，需要定期做全量 id 对账，或者采用 D8 的删除日志表。

### 4.3 写入约定

- 业务时间戳 `created_at` / `updated_at` 由写入方负责（epoch 毫秒）。省略时由默认值补上。
- 不要写 `server_updated_at`，写了也会被触发器覆盖。
- 不要写 `total_words` / `total_sentences`，同样会被触发器覆盖。
- `word_id` 必须用与前端 `buildWordId` 相同的规则生成，否则会和官方词库的进度对不上。

---

## 5. 升级路径

已经执行过 v1 脚本的库，按顺序执行附录 B 的 3 段 SQL：

1. **第 1 步（升级前置）**：删除种子行、加列、改默认值、切换主键、删除需要重建的索引、以 `not valid` 方式加 check 约束。
2. **第 2 步**：执行附录 A 的 v2 全量脚本。它全部使用 `if not exists` / `create or replace` / `drop ... if exists`，在已有表上只会补齐触发器、函数、新表、索引和权限。
3. **第 3 步（数据搬迁）**：把 `app_state.book_mode_progress` 拆进 `book_progress`；按新口径重算冗余计数；`validate` 所有约束；可选删除 `vocab_units`。

三段都可以重复执行。全新的库只需要执行附录 A。

---

## 6. 需要的代码配套改动（本轮不做，供排期参考）

| 改动 | 涉及文件 | 解决 | 依赖的库层能力 |
|---|---|---|---|
| 单词记录写入改为调用 `record_word_attempt` / `toggle_star_word` | `src/core/db/index.ts` 与 `src/core/cloud/supabaseRepository.ts` 的 `wordRecords` | H4 | R1、R2 |
| 单元进度写入改为调用 `mark_unit_word_completed` / `mark_unit_word_for_retry` | 同上，`unitProgress` | H4 | R4、R5 |
| `mergeWordsIntoBook` 云模式改为调用 RPC | 同上 | H4 | R6 |
| 生词本 / 错词本改为标量 RPC | `wordRecords` 相关查询 | H3 | R3 |
| 其余 `getAll()` 改为分页 | `supabaseRepository.ts:341,381,451,518` 等 | H3 | `server_updated_at` 索引 |
| 收件箱改为 claim / complete / fail | `src/core/cloud/collector.ts:64-146` | H6、M5 | R8 |
| 书内位置改写 `book_progress`，停止整块写 `book_mode_progress` | `supabaseRepository.ts:497-512`、`src/core/cloud/sync.ts` | 多设备互相覆盖 | `book_progress` 表 |
| 翻译进度推送改为 `merge_translate_state` | `supabaseRepository.ts:551-563` | 多设备互相抹掉已完成句子 | R7 |
| 体检时读取 `schema_meta.schema_version` | `src/core/cloud/client.ts` | 提示用户升级 | `schema_meta` |
| 处理错误码 23514 / 23505（单元归属错位） | `unitProgress.put` 调用方 | H5 | 改挂保护 |

全部切换完之前，v2 与现有代码可以共存，没有先后依赖。

---

## 7. 需要作者拍板的设计选择

| # | 问题 | 选项 | 本方案默认 | 我的建议与理由 |
|---|---|---|---|---|
| D1 | `unit_progress` 主键 | A：`(book_id, unit_id, mode)` + `unique (unit_id, mode)`；B：只保留 `(unit_id, mode)`；C：只用 `(book_id, unit_id, mode)`，去掉唯一约束 | A | A。现有代码不用改，又能防止串写。C 需要代码全部带 `book_id` 查询，且一旦两本书出现同名单元 id 就会有两条进度 |
| D2 | 官方进度是否另建表 | 共用 `unit_progress`；分表 | 共用 | 共用。形状完全相同，用 `book_kind` 区分即可 |
| D3 | `vocab_units` | 删除；保留不用；接入代码 | 全新安装不建，升级时不删 | 删除。单元由 JSON 或切片决定，这张表没有承载任何东西 |
| D4 | 官方词的 `word_records.word_item` 快照 | 继续存完整词条；官方词只存 id，展示时从本地 JSON 取 | 继续存 | 建议官方词不存快照（自定义词和收件箱词仍需要）。可以减少数据量，也避免快照过期 |
| D5 | 书内位置存储 | `book_progress` 表；保留 jsonb 但改用合并 RPC | `book_progress` 表 | 表。外部工具按行读写更直观，新者胜由触发器保证 |
| D6 | `loop_counts` 是否继续入库 | 入库；只存本地 | 入库 | 取决于"默写循环次数"是设备偏好还是学习进度。若是偏好，建议只存本地，这样空值也不会再造成 H1 那样的问题 |
| D7 | `learned_root_ids`、翻译 `completed_sentence_ids` 是否拆表 | 保持 jsonb + 合并 RPC；拆成一行一个 id | jsonb；翻译进度提供合并 RPC | 当前数据量下 jsonb 足够。若外部工具需要按 id 增量同步再拆表 |
| D8 | 删除如何跨设备传播 | 物理删除；软删除 `deleted_at`；物理删除 + 删除日志表 | 物理删除 | 删除日志表。与现有查询兼容，同时能解决 M2 的"删除复活" |
| D9 | 是否记录官方 JSON 版本 | 不记录；在 `unit_progress` 或 `book_progress` 记录 `dict_version` | 不记录 | 如果官方 JSON 会频繁调整，建议记录。版本变化时可以触发一次全量剪除，而不是每次调用时剪除 |
| D10 | 收件箱最大重试次数与租约 | 默认 5 次、5 分钟 | 5 次、5 分钟 | 可以按 AI 调用成本调整，都是 RPC 参数，不需要改脚本 |
| D11 | 业务 `updated_at` 由谁写 | 客户端写（与 TS 一致）；服务端触发器写 | 客户端写，另有 `server_updated_at` | 保持客户端写。`book_progress` 的新者胜依赖它表示"用户操作的时间" |
| D12 | `vocab_books` 的 `check (is_custom)` | 保留；去掉 | 保留 | 保留。把"官方词库不入库"写成约束，防止外部工具误把官方词库导进来 |
| D13 | 交付形式 | 直接替换 `supabase/schema.sql` 为 v2；新增 `supabase/migrations/` 保留 v1 + 升级脚本 | — | 后者。已有用户需要升级路径，新用户只执行最新全量脚本 |

---

## 8. 测试记录

环境：本机 PostgreSQL 16，模拟 Supabase 的 `anon` 角色，所有业务操作都以 `set role anon` 执行。

**全新安装**：执行附录 A 两次，第二次无报错（幂等）。

**功能测试**（全部符合预期）：

- 空库时 `app_state` / `translate_state` 读不到行；现有代码的 upsert 写法可以正常创建行。
- `unit_progress`：按 `onConflict 'unit_id,mode'` 的旧写法 upsert 成功；把已有行改挂到另一本书被拒绝（23514）；`book_kind` 按前缀正确计算。
- 删除自定义词库后，它的 `unit_progress` 和 `book_progress` 被清理，官方词库的进度不受影响。
- `total_words` / `total_sentences` 随 `words` / `sentences` 自动更新，客户端写入的错误值被纠正。
- `record_word_attempt`：学习模式、默写答错、默写连续答对 3 次清除错词标记等完整序列，结果与 TS 实现逐条一致。
- `toggle_star_word`：新建、取消、再加星。
- `mark_unit_word_completed`：正常完成、延后重考、最后一个词后进入重试状态、重考完成后单元完成并写入 `completed_at`、传入新的单元成员时剪除失效词、跨书调用被拒绝（23514）。
- `mark_unit_word_for_retry`：从已完成列表移入重考队列，清除 `completed_at`。
- `merge_words_into_book`：同 id 原位覆盖，新词追加，返回值正确；词库不存在时返回 null。
- `book_progress`：较旧的 `updated_at` 写入被忽略，较新的生效。
- `merge_translate_state`：两台设备的已完成句子取并集，`updated_at` 取较大值。
- 收件箱：认领、完成、失败重试、超过次数进入 `failed`；租约过期后可重新认领；旧式直接写 `pulled_at` 后状态变为 `done`。
- 1500 个加星词：`get_starred_word_ids()` 一次返回 1500 个。
- 各项 check 约束都能拦截非法数据（空主键、负数计数、错误 jsonb 类型、非法状态、空白单词、`is_custom = false`）。

**并发测试**（多个 psql 会话同时执行）：

| 场景 | 预期 | 结果 |
|---|---|---|
| 40 个会话同时对同一个词调用 `record_word_attempt` | 练习次数 40 | 40 |
| 20 个会话同时把同一单元的 20 个不同的词标记完成 | 20 个都记录，单元完成 | 20 / completed |
| 6 个会话同时认领 60 条收件箱记录，每次最多 15 条 | 不重复认领 | 认领 60 条，去重后 60 条 |
| 10 个会话同时向同一词库并入不同的词 | 原有 3 个 + 10 个 = 13 个 | 13 |

**升级测试**：

- 在执行过 v1 脚本、并写入了模拟数据的库上依次执行附录 B 第 1 步、附录 A、附录 B 第 3 步，全部成功；再完整执行一遍，同样成功（幂等）。
- 种子行（`updated_at = 0`）被删除；已写入过的 `app_state` 行被保留。
- 主键切换为 `(book_id, unit_id, mode)`；已有进度的 `book_kind` 正确。
- 已写过 `pulled_at` 的收件箱行变为 `done`，其余为 `pending`。
- `book_mode_progress` 中的合法项拆成 `book_progress` 行，并沿用 `app_state.updated_at`；非数字的值被跳过。
- 存量词库的 `total_words` 被按新口径重算。
- 所有约束 `validate` 通过，没有遗留未校验的约束。

---

## 附录 A：v2 全量脚本（全新安装，可重复执行）

```sql
-- =============================================================================
-- LinguaLoop 云端数据表 v2（建议稿，全新安装用）
-- 使用方式：Supabase 控制台 → SQL Editor → 粘贴全部内容 → Run。可重复执行。
--
-- 约定：
--   1. 业务时间戳统一 bigint（epoch 毫秒），由客户端写入，语义与前端 TS 类型一致。
--   2. 每张业务表额外有 server_updated_at（bigint 毫秒），由触发器在服务端维护，
--      客户端不写；供外部工具按"服务端时间"做增量同步，不受各设备时钟偏差影响。
--   3. 官方词库（/dicts/*.json）与官方翻译题库不入库；它们的学习进度入库，
--      通过 book_id + unit_id + word_id（均为字符串标识）关联本地 JSON。
--   4. 单行"状态表"不再预插入空行：表里没有行 = 云端还没有数据。
--   5. 权限模型沿用 v1：anon 角色可读写全部业务表（本次不调整安全策略）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. 公共函数
-- -----------------------------------------------------------------------------
create or replace function public.now_ms() returns bigint
language sql volatile as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

create or replace function public.tg_touch_server_updated_at() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := public.now_ms();
  return new;
end $$;

-- schema 版本：客户端体检时可读取，判断库是否已升级到期望版本
create table if not exists schema_meta (
  key    text primary key,
  value  text not null
);
insert into schema_meta (key, value) values ('schema_version', '2')
  on conflict (key) do update set value = excluded.value;

-- -----------------------------------------------------------------------------
-- 1. 自定义词库（只存自定义词库；官方词库永不入库）
-- -----------------------------------------------------------------------------
create table if not exists vocab_books (
  id                 text    primary key check (id <> ''),
  name               text    not null,
  description        text    not null default '',
  category           text    not null default 'custom',
  is_custom          boolean not null default true check (is_custom),
  unit_size          integer not null default 20 check (unit_size between 1 and 1000),
  total_words        integer not null default 0,                -- 由触发器按 words 长度维护
  words              jsonb   not null default '[]'::jsonb check (jsonb_typeof(words) = 'array'),
  created_at         bigint  not null default public.now_ms(),
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms()
);

create or replace function public.tg_vocab_books_derive() returns trigger
language plpgsql as $$
begin
  new.total_words := jsonb_array_length(new.words);
  return new;
end $$;

drop trigger if exists vocab_books_derive on vocab_books;
create trigger vocab_books_derive before insert or update on vocab_books
  for each row execute function public.tg_vocab_books_derive();
drop trigger if exists vocab_books_touch on vocab_books;
create trigger vocab_books_touch before insert or update on vocab_books
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 2. 单词掌握记录（错词本 / 生词本 / 掌握度）—— 一个单词一条，跨词库共用
--    word_id = buildWordId(拼写)，官方词库与自定义词库的同一个词共用一条记录。
-- -----------------------------------------------------------------------------
create table if not exists word_records (
  word_id                    text    primary key check (word_id <> ''),
  book_id                    text    not null default '',     -- 首次记录时所在词库（官方或自定义 id），仅作来源参考
  word_name                  text,
  word_item                  jsonb   check (word_item is null or jsonb_typeof(word_item) = 'object'),
  is_mastered                boolean not null default false,
  is_starred                 boolean not null default false,
  is_error                   boolean not null default false,
  total_practice_count       integer not null default 0 check (total_practice_count >= 0),
  dictation_error_count      integer not null default 0 check (dictation_error_count >= 0),
  consecutive_correct_count  integer not null default 0 check (consecutive_correct_count >= 0),
  last_practiced_at          bigint  not null default 0,
  created_at                 bigint  not null default public.now_ms(),
  server_updated_at          bigint  not null default public.now_ms()
);
-- 生词本 / 错词本查询：.eq('is_starred', true) 与 .or('is_error.eq.true,is_starred.eq.true')
create index if not exists word_records_starred_idx on word_records (word_id) where is_starred;
create index if not exists word_records_trouble_idx on word_records (word_id) where is_error or is_starred;
create index if not exists word_records_server_updated_idx on word_records (server_updated_at);

drop trigger if exists word_records_touch on word_records;
create trigger word_records_touch before insert or update on word_records
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 3. 单元学习进度（官方词库与自定义词库共用）
--    官方词库：unit_id 来自 /dicts/*.units.json（如 cet4_time_numbers），
--              无目录时为 `${book_id}_unit_${index}`；
--    自定义词库：unit_id = `${book_id}_unit_${index}`。
--    completed_word_ids / retry_word_ids 存 word_id，与本地 JSON 按拼写派生的 id 对齐。
-- -----------------------------------------------------------------------------
create table if not exists unit_progress (
  book_id             text    not null check (book_id <> ''),
  unit_id             text    not null check (unit_id <> ''),
  mode                text    not null check (mode in ('learn', 'dictation', 'phonetic')),
  book_kind           text    generated always as (
                        case when book_id like 'book\_custom\_%' then 'custom' else 'official' end
                      ) stored,
  status              text    not null default 'not_started'
                        check (status in ('not_started', 'in_progress', 'completed')),
  current_word_index  integer not null default 0 check (current_word_index >= 0),
  completed_word_ids  jsonb   not null default '[]'::jsonb check (jsonb_typeof(completed_word_ids) = 'array'),
  retry_word_ids      jsonb   not null default '[]'::jsonb check (jsonb_typeof(retry_word_ids) = 'array'),
  is_retrying         boolean not null default false,
  started_at          bigint,
  last_studied_at     bigint,
  completed_at        bigint,
  server_updated_at   bigint  not null default public.now_ms(),
  primary key (book_id, unit_id, mode),
  -- unit_id 全局唯一（现有 5 本官方词库的语义单元 id 已核对无重复；自定义单元 id 自带 book_id 前缀）。
  -- 同时让现有代码的 upsert onConflict 'unit_id,mode' 继续可用。
  constraint unit_progress_unit_mode_key unique (unit_id, mode)
);
create index if not exists unit_progress_server_updated_idx on unit_progress (server_updated_at);

-- 同一条进度不允许被改挂到另一本书下（防止"显示 A 书、写进 B 书"的静默串写）
create or replace function public.tg_unit_progress_guard() returns trigger
language plpgsql as $$
begin
  if new.book_id <> old.book_id then
    raise exception 'unit_progress (%, %) belongs to book %, refusing to move it to %',
      old.unit_id, old.mode, old.book_id, new.book_id
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists unit_progress_guard on unit_progress;
create trigger unit_progress_guard before update on unit_progress
  for each row execute function public.tg_unit_progress_guard();
drop trigger if exists unit_progress_touch on unit_progress;
create trigger unit_progress_touch before insert or update on unit_progress
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 4. 每本书在每种模式下"上次学到第几单元"（原 app_state.book_mode_progress 的拆分）
--    一行一个 (book_id, mode)，多设备各学各的书时不会互相整块覆盖。
-- -----------------------------------------------------------------------------
create table if not exists book_progress (
  book_id            text    not null check (book_id <> ''),
  mode               text    not null check (mode in ('learn', 'dictation', 'phonetic')),
  book_kind          text    generated always as (
                       case when book_id like 'book\_custom\_%' then 'custom' else 'official' end
                     ) stored,
  unit_index         integer not null default 0 check (unit_index >= 0),
  unit_id            text,                                     -- 可选：同时记单元 id，官方目录调整顺序后仍可定位
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms(),
  primary key (book_id, mode)
);

-- 较旧的写入（updated_at 更小）直接忽略，普通 upsert 即可获得"新者胜"语义
create or replace function public.tg_newer_wins() returns trigger
language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists book_progress_newer_wins on book_progress;
create trigger book_progress_newer_wins before update on book_progress
  for each row execute function public.tg_newer_wins();
drop trigger if exists book_progress_touch on book_progress;
create trigger book_progress_touch before insert or update on book_progress
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 5. 用户对单词的修改（音节 / 构词 / 音标 / 释义 / 例句 / 短语），官方词与自定义词通用
-- -----------------------------------------------------------------------------
create table if not exists word_overrides (
  word_id            text   primary key check (word_id <> ''),
  name               text   not null,
  phonetic_us        text,
  phonetic_uk        text,
  pos_list           jsonb  check (pos_list is null or jsonb_typeof(pos_list) = 'array'),
  syllables          jsonb  check (syllables is null or jsonb_typeof(syllables) = 'array'),
  etymology          jsonb,
  silent_indices     jsonb  check (silent_indices is null or jsonb_typeof(silent_indices) = 'array'),
  examples           jsonb  check (examples is null or jsonb_typeof(examples) = 'array'),
  phrases            jsonb  check (phrases is null or jsonb_typeof(phrases) = 'array'),
  updated_at         bigint not null default public.now_ms(),
  server_updated_at  bigint not null default public.now_ms()
);
drop trigger if exists word_overrides_touch on word_overrides;
create trigger word_overrides_touch before insert or update on word_overrides
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 6. 翻译模块：自定义句库（内置预置题库不入库）
-- -----------------------------------------------------------------------------
create table if not exists translate_books (
  id                 text    primary key check (id <> ''),
  name               text    not null,
  description        text,
  category           text,
  scenario           text,
  total_sentences    integer not null default 0,              -- 由触发器按 sentences 长度维护
  sentences          jsonb   not null default '[]'::jsonb check (jsonb_typeof(sentences) = 'array'),
  created_at         bigint  not null default public.now_ms(),
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms()
);

create or replace function public.tg_translate_books_derive() returns trigger
language plpgsql as $$
begin
  new.total_sentences := jsonb_array_length(new.sentences);
  return new;
end $$;

drop trigger if exists translate_books_derive on translate_books;
create trigger translate_books_derive before insert or update on translate_books
  for each row execute function public.tg_translate_books_derive();
drop trigger if exists translate_books_touch on translate_books;
create trigger translate_books_touch before insert or update on translate_books
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 7. 阅读模块：用户上传的文章
-- -----------------------------------------------------------------------------
create table if not exists reading_articles (
  id                 text    primary key check (id <> ''),
  title              text    not null,
  paragraphs         jsonb   not null default '[]'::jsonb check (jsonb_typeof(paragraphs) = 'array'),
  is_custom          boolean not null default true,
  created_at         bigint  not null default public.now_ms(),
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms()
);
drop trigger if exists reading_articles_touch on reading_articles;
create trigger reading_articles_touch before insert or update on reading_articles
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 8. 外部工具收词收件箱
--    外部工具只需 insert (word[, meaning, source, word_item])，其余列都有默认值。
--    应用通过 claim/complete/fail 三个 RPC 消费，带租约、重试计数与终态，避免队头阻塞。
--    兼容 v1：外部或旧代码直接写 pulled_at 时，触发器会把 status 置为 done。
-- -----------------------------------------------------------------------------
create table if not exists collected_words (
  id                 bigint generated by default as identity primary key,
  word               text    not null check (btrim(word) <> ''),
  meaning            text,
  source             text,
  word_item          jsonb   check (word_item is null or jsonb_typeof(word_item) = 'object'),
  created_at         bigint  not null default public.now_ms(),
  status             text    not null default 'pending'
                       check (status in ('pending', 'processing', 'done', 'failed')),
  attempts           integer not null default 0 check (attempts >= 0),
  last_error         text,
  claimed_at         bigint,
  claimed_by         text,
  pulled_at          bigint,                                   -- 完成时间（status = done 时写入）
  server_updated_at  bigint  not null default public.now_ms()
);
create index if not exists collected_words_pending_idx on collected_words (id) where status = 'pending';
create index if not exists collected_words_processing_idx on collected_words (claimed_at) where status = 'processing';

create or replace function public.tg_collected_words_status() returns trigger
language plpgsql as $$
begin
  if new.pulled_at is not null and new.status in ('pending', 'processing') then
    new.status := 'done';
  end if;
  return new;
end $$;

drop trigger if exists collected_words_status on collected_words;
create trigger collected_words_status before insert or update on collected_words
  for each row execute function public.tg_collected_words_status();
drop trigger if exists collected_words_touch on collected_words;
create trigger collected_words_touch before insert or update on collected_words
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 9. 全局学习位置（单行表，不预插入）
--    book_mode_progress 为过渡字段：代码切到 book_progress 表后删除。
-- -----------------------------------------------------------------------------
create table if not exists app_state (
  id                  integer primary key default 1 check (id = 1),
  current_book_id     text,
  current_unit_index  integer not null default 0 check (current_unit_index >= 0),
  book_mode_progress  jsonb   not null default '{}'::jsonb check (jsonb_typeof(book_mode_progress) = 'object'),
  loop_counts         jsonb   not null default '{}'::jsonb check (jsonb_typeof(loop_counts) = 'object'),
  learned_root_ids    jsonb   not null default '[]'::jsonb check (jsonb_typeof(learned_root_ids) = 'array'),
  updated_at          bigint  not null default public.now_ms(),
  server_updated_at   bigint  not null default public.now_ms()
);
drop trigger if exists app_state_touch on app_state;
create trigger app_state_touch before insert or update on app_state
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 10. 翻译模块学习位置（单行表，不预插入）
--     completed_sentence_ids 只增不减，建议通过 merge_translate_state() 取并集写入。
-- -----------------------------------------------------------------------------
create table if not exists translate_state (
  id                      integer primary key default 1 check (id = 1),
  current_book_id         text,
  completed_sentence_ids  jsonb  not null default '{}'::jsonb check (jsonb_typeof(completed_sentence_ids) = 'object'),
  updated_at              bigint not null default public.now_ms(),
  server_updated_at       bigint not null default public.now_ms()
);
drop trigger if exists translate_state_touch on translate_state;
create trigger translate_state_touch before insert or update on translate_state
  for each row execute function public.tg_touch_server_updated_at();

-- -----------------------------------------------------------------------------
-- 11. 删除自定义词库时，在库内级联清理它的单元进度与书内位置
--     （unit_progress / book_progress 同时承载官方词库进度，不能对 vocab_books 建外键）
-- -----------------------------------------------------------------------------
create or replace function public.tg_vocab_books_cleanup() returns trigger
language plpgsql as $$
begin
  delete from unit_progress where book_id = old.id;
  delete from book_progress where book_id = old.id;
  return old;
end $$;

drop trigger if exists vocab_books_cleanup on vocab_books;
create trigger vocab_books_cleanup after delete on vocab_books
  for each row execute function public.tg_vocab_books_cleanup();

-- =============================================================================
-- RPC：把"读-改-写"放到一条事务里执行，解决多请求并发互相覆盖
-- 全部为 security invoker（默认），权限与直接读写表一致。
-- =============================================================================

-- R1. 记录一次练习结果（与 db/index.ts recordWordAttempt 的规则逐条对应）
create or replace function public.record_word_attempt(
  p_word_id    text,
  p_book_id    text,
  p_is_correct boolean,
  p_mode       text,
  p_word_item  jsonb default null
) returns word_records
language plpgsql as $$
declare
  v_now      bigint  := public.now_ms();
  v_dict     boolean := p_mode = 'dictation';
  v_dict_err boolean := (not p_is_correct) and p_mode = 'dictation';
  v_row      word_records;
begin
  insert into word_records as r (
    word_id, book_id, word_name, word_item, is_mastered, is_starred, is_error,
    total_practice_count, dictation_error_count, consecutive_correct_count, last_practiced_at
  ) values (
    p_word_id, coalesce(p_book_id, ''), p_word_item ->> 'name', p_word_item,
    p_is_correct and v_dict, false, v_dict_err,
    1, case when v_dict_err then 1 else 0 end,
    case when p_is_correct and v_dict then 1 else 0 end, v_now
  )
  on conflict (word_id) do update set
    word_item = coalesce(p_word_item, r.word_item),
    word_name = coalesce(nullif(p_word_item ->> 'name', ''), r.word_name),
    total_practice_count = r.total_practice_count + 1,
    dictation_error_count = r.dictation_error_count + case when v_dict_err then 1 else 0 end,
    consecutive_correct_count = case when p_is_correct and v_dict then r.consecutive_correct_count + 1 else 0 end,
    is_error = case
      when not v_dict then r.is_error
      when not p_is_correct then true
      when r.consecutive_correct_count + 1 >= 3 then false
      else r.is_error
    end,
    is_mastered = (p_is_correct and v_dict),   -- 等价于 TS 中 consecutive >= 3 || (isCorrect && dictation)
    last_practiced_at = v_now
  returning * into v_row;
  return v_row;
end $$;

-- R2. 切换加星（不存在则创建为已加星）。返回切换后的 is_starred。
create or replace function public.toggle_star_word(
  p_word_id   text,
  p_book_id   text,
  p_word_item jsonb default null
) returns boolean
language plpgsql as $$
declare
  v_starred boolean;
begin
  insert into word_records as r (word_id, book_id, word_name, word_item, is_starred, last_practiced_at)
  values (p_word_id, coalesce(p_book_id, ''), p_word_item ->> 'name', p_word_item, true, public.now_ms())
  on conflict (word_id) do update set
    is_starred = not r.is_starred,
    word_item = coalesce(p_word_item, r.word_item),
    word_name = coalesce(nullif(p_word_item ->> 'name', ''), r.word_name)
  returning is_starred into v_starred;
  return v_starred;
end $$;

-- R3. 生词本 / 错词本：以单个标量返回，不受 PostgREST Max Rows（默认 1000）截断
create or replace function public.get_starred_word_ids() returns text[]
language sql stable as $$
  select coalesce(array_agg(word_id order by word_id), '{}') from word_records where is_starred
$$;

create or replace function public.get_trouble_word_records() returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.last_practiced_at desc), '[]'::jsonb)
  from word_records r
  where r.is_error or r.is_starred
$$;

-- 内部工具：按 p_keep 过滤 jsonb 字符串数组，保持原顺序
create or replace function public.jsonb_text_array_filter(p_arr jsonb, p_keep text[]) returns text[]
language sql immutable as $$
  select coalesce(array_agg(x order by ord), '{}')
  from jsonb_array_elements_text(coalesce(p_arr, '[]'::jsonb)) with ordinality as t(x, ord)
  where x = any(p_keep)
$$;

-- R4. 标记单元内一个词"真正敲完"（与 db/index.ts markUnitWordCompleted 规则对应）
create or replace function public.mark_unit_word_completed(
  p_book_id          text,
  p_unit_id          text,
  p_mode             text,
  p_word_id          text,
  p_word_index       integer,
  p_unit_word_ids    text[],
  p_defer_for_retry  boolean default false
) returns unit_progress
language plpgsql as $$
declare
  v_now        bigint := public.now_ms();
  v_n          integer := coalesce(array_length(p_unit_word_ids, 1), 0);
  v_old        unit_progress;
  v_completed  text[];
  v_retry      text[];
  v_done       boolean;
  v_retrying   boolean;
  v_row        unit_progress;
begin
  if v_n = 0 then
    raise exception 'p_unit_word_ids must not be empty' using errcode = '22023';
  end if;

  -- 先确保行存在再加锁，保证并发调用串行执行
  insert into unit_progress (book_id, unit_id, mode, status, started_at, last_studied_at)
  values (p_book_id, p_unit_id, p_mode, 'in_progress', v_now, v_now)
  on conflict do nothing;

  select * into v_old from unit_progress
   where book_id = p_book_id and unit_id = p_unit_id and mode = p_mode
   for update;
  if not found then
    -- (unit_id, mode) 已挂在其他书下：拒绝串写
    raise exception 'unit % (%) already belongs to another book', p_unit_id, p_mode using errcode = '23514';
  end if;

  v_completed := public.jsonb_text_array_filter(v_old.completed_word_ids, p_unit_word_ids);
  v_retry     := public.jsonb_text_array_filter(v_old.retry_word_ids, p_unit_word_ids);

  if p_defer_for_retry then
    v_completed := array_remove(v_completed, p_word_id);
    if not (p_word_id = any(v_retry)) then v_retry := v_retry || p_word_id; end if;
  else
    if not (p_word_id = any(v_completed)) then v_completed := v_completed || p_word_id; end if;
    v_retry := array_remove(v_retry, p_word_id);
  end if;

  v_done := coalesce(array_length(v_retry, 1), 0) = 0 and p_unit_word_ids <@ v_completed;
  v_retrying := not v_done and (
    coalesce(v_old.is_retrying, false)
    or (p_word_index >= v_n - 1 and coalesce(array_length(v_retry, 1), 0) > 0)
  );

  update unit_progress set
    status = case when v_done then 'completed' else 'in_progress' end,
    current_word_index = greatest(coalesce(v_old.current_word_index, 0), least(p_word_index + 1, v_n - 1)),
    completed_word_ids = to_jsonb(v_completed),
    retry_word_ids = to_jsonb(v_retry),
    is_retrying = v_retrying,
    started_at = coalesce(v_old.started_at, v_now),
    last_studied_at = v_now,
    completed_at = case when v_done then coalesce(v_old.completed_at, v_now) else null end
  where book_id = p_book_id and unit_id = p_unit_id and mode = p_mode
  returning * into v_row;
  return v_row;
end $$;

-- R5. 把默写出错/偷看的词放回本单元重考队列（对应 markUnitWordForRetry）
create or replace function public.mark_unit_word_for_retry(
  p_book_id    text,
  p_unit_id    text,
  p_mode       text,
  p_word_id    text,
  p_word_index integer
) returns unit_progress
language plpgsql as $$
declare
  v_now bigint := public.now_ms();
  v_row unit_progress;
begin
  insert into unit_progress as u (
    book_id, unit_id, mode, status, current_word_index,
    completed_word_ids, retry_word_ids, started_at, last_studied_at
  ) values (
    p_book_id, p_unit_id, p_mode, 'in_progress', greatest(p_word_index, 0),
    '[]'::jsonb, jsonb_build_array(p_word_id), v_now, v_now
  )
  on conflict (book_id, unit_id, mode) do update set
    status = 'in_progress',
    current_word_index = greatest(u.current_word_index, greatest(p_word_index, 0)),
    completed_word_ids = coalesce((
      select jsonb_agg(x order by ord)
      from jsonb_array_elements_text(u.completed_word_ids) with ordinality t(x, ord)
      where x <> p_word_id
    ), '[]'::jsonb),
    retry_word_ids = case
      when u.retry_word_ids ? p_word_id then u.retry_word_ids
      else u.retry_word_ids || jsonb_build_array(p_word_id)
    end,
    completed_at = null,
    last_studied_at = v_now
  returning * into v_row;
  return v_row;
end $$;

-- R6. 把单词并入自定义词库：同 id 原位覆盖，新词追加（对应 mergeWordsIntoBook）
create or replace function public.merge_words_into_book(p_book_id text, p_words jsonb)
returns jsonb
language plpgsql as $$
declare
  v_words   jsonb;
  v_merged  jsonb;
  v_added   integer;
  v_updated integer;
begin
  if jsonb_typeof(p_words) <> 'array' then
    raise exception 'p_words must be a json array' using errcode = '22023';
  end if;

  select words into v_words from vocab_books where id = p_book_id for update;
  if not found then
    return null;
  end if;

  with incoming as (
    select distinct on (e ->> 'id') e, ord
    from jsonb_array_elements(p_words) with ordinality t(e, ord)
    where coalesce(e ->> 'id', '') <> ''
    order by e ->> 'id', ord desc
  ),
  existing as (
    select e, ord from jsonb_array_elements(v_words) with ordinality t(e, ord)
  ),
  replaced as (
    select coalesce(i.e, x.e) as e, x.ord as ord, (i.e is not null) as hit
    from existing x left join incoming i on i.e ->> 'id' = x.e ->> 'id'
  ),
  appended as (
    select i.e, 1000000000 + i.ord as ord
    from incoming i
    where not exists (select 1 from existing x where x.e ->> 'id' = i.e ->> 'id')
  )
  select
    coalesce((select jsonb_agg(e order by ord) from (
      select e, ord from replaced union all select e, ord from appended
    ) all_words), '[]'::jsonb),
    (select count(*) from appended),
    (select count(distinct e ->> 'id') from replaced where hit)
  into v_merged, v_added, v_updated;

  update vocab_books set words = v_merged, updated_at = public.now_ms() where id = p_book_id;
  return jsonb_build_object('added', v_added, 'updated', v_updated, 'total_words', jsonb_array_length(v_merged));
end $$;

-- R7. 翻译进度：completed_sentence_ids 取并集（只增不减），多设备不会互相抹掉
create or replace function public.merge_translate_state(
  p_current_book_id text,
  p_completed       jsonb,
  p_updated_at      bigint default null
) returns translate_state
language plpgsql as $$
declare
  v_row translate_state;
begin
  insert into translate_state as s (id, current_book_id, completed_sentence_ids, updated_at)
  values (1, p_current_book_id, coalesce(p_completed, '{}'::jsonb), coalesce(p_updated_at, public.now_ms()))
  on conflict (id) do update set
    current_book_id = coalesce(excluded.current_book_id, s.current_book_id),
    completed_sentence_ids = s.completed_sentence_ids || excluded.completed_sentence_ids,
    updated_at = greatest(s.updated_at, excluded.updated_at)
  returning * into v_row;
  return v_row;
end $$;

-- R8. 收件箱：认领 / 完成 / 失败
create or replace function public.claim_collected_words(
  p_limit    integer default 20,
  p_claimer  text    default null,
  p_lease_ms bigint  default 300000
) returns setof collected_words
language plpgsql as $$
declare
  v_now bigint := public.now_ms();
begin
  return query
  update collected_words c set
    status = 'processing',
    claimed_at = v_now,
    claimed_by = p_claimer,
    attempts = c.attempts + 1
  where c.id in (
    select id from collected_words
    where status = 'pending'
       or (status = 'processing' and claimed_at < v_now - p_lease_ms)
    order by id
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning c.*;
end $$;

create or replace function public.complete_collected_words(p_ids bigint[]) returns integer
language sql as $$
  with done as (
    update collected_words
       set status = 'done', pulled_at = public.now_ms(), last_error = null
     where id = any(p_ids) and status <> 'done'
    returning 1
  )
  select count(*)::integer from done
$$;

create or replace function public.fail_collected_word(
  p_id           bigint,
  p_error        text,
  p_retryable    boolean default true,
  p_max_attempts integer default 5
) returns collected_words
language plpgsql as $$
declare
  v_row collected_words;
begin
  update collected_words set
    status = case when p_retryable and attempts < p_max_attempts then 'pending' else 'failed' end,
    last_error = left(p_error, 500),
    claimed_at = null,
    claimed_by = null
  where id = p_id
  returning * into v_row;
  return v_row;
end $$;

-- =============================================================================
-- 权限：沿用 v1 的模型（本次不调整安全策略）
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'vocab_books', 'word_records', 'unit_progress', 'book_progress', 'word_overrides',
    'translate_books', 'reading_articles', 'collected_words', 'app_state', 'translate_state'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_all on %I', t);
    execute format('create policy anon_all on %I for all to anon using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon', t);
  end loop;
end $$;

alter table schema_meta enable row level security;
drop policy if exists anon_read on schema_meta;
create policy anon_read on schema_meta for select to anon using (true);
grant select on schema_meta to anon;

grant usage on schema public to anon;
grant usage, select on all sequences in schema public to anon;
grant execute on function
  public.now_ms(),
  public.record_word_attempt(text, text, boolean, text, jsonb),
  public.toggle_star_word(text, text, jsonb),
  public.get_starred_word_ids(),
  public.get_trouble_word_records(),
  public.jsonb_text_array_filter(jsonb, text[]),
  public.mark_unit_word_completed(text, text, text, text, integer, text[], boolean),
  public.mark_unit_word_for_retry(text, text, text, text, integer),
  public.merge_words_into_book(text, jsonb),
  public.merge_translate_state(text, jsonb, bigint),
  public.claim_collected_words(integer, text, bigint),
  public.complete_collected_words(bigint[]),
  public.fail_collected_word(bigint, text, boolean, integer)
to anon;

-- 让 PostgREST 立即识别新表与新函数
notify pgrst, 'reload schema';
```

---

## 附录 B：v1 → v2 升级脚本

按顺序执行：B-1 → 附录 A → B-3。三段都可重复执行。

### B-1 升级前置

```sql
-- =============================================================================
-- v1 → v2 升级：第 1 步（在已执行过 v1 schema.sql 的库上运行）
-- 顺序：本段 → v2 全量脚本 → 第 3 步（数据搬迁）。三段都可重复执行。
-- =============================================================================

create or replace function public.now_ms() returns bigint
language sql volatile as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

-- 1. 删除 v1 预插入、从未被真正写过的空状态行（updated_at = 0）
delete from app_state       where id = 1 and updated_at = 0;
delete from translate_state where id = 1 and updated_at = 0;

-- 2. 新增列
alter table vocab_books      add column if not exists server_updated_at bigint not null default public.now_ms();
alter table word_records     add column if not exists created_at        bigint not null default public.now_ms();
alter table word_records     add column if not exists server_updated_at bigint not null default public.now_ms();
alter table unit_progress    add column if not exists server_updated_at bigint not null default public.now_ms();
alter table unit_progress    add column if not exists book_kind text generated always as (
  case when book_id like 'book\_custom\_%' then 'custom' else 'official' end
) stored;
alter table word_overrides   add column if not exists server_updated_at bigint not null default public.now_ms();
alter table translate_books  add column if not exists server_updated_at bigint not null default public.now_ms();
alter table reading_articles add column if not exists server_updated_at bigint not null default public.now_ms();
alter table app_state        add column if not exists server_updated_at bigint not null default public.now_ms();
alter table translate_state  add column if not exists server_updated_at bigint not null default public.now_ms();
alter table collected_words  add column if not exists status     text    not null default 'pending';
alter table collected_words  add column if not exists attempts   integer not null default 0;
alter table collected_words  add column if not exists last_error text;
alter table collected_words  add column if not exists claimed_at bigint;
alter table collected_words  add column if not exists claimed_by text;
alter table collected_words  add column if not exists server_updated_at bigint not null default public.now_ms();
update collected_words set status = 'done' where pulled_at is not null and status <> 'done';

-- 3. 默认值
alter table vocab_books      alter column created_at set default public.now_ms(),
                             alter column updated_at set default public.now_ms();
alter table translate_books  alter column created_at set default public.now_ms(),
                             alter column updated_at set default public.now_ms();
alter table reading_articles alter column created_at set default public.now_ms(),
                             alter column updated_at set default public.now_ms();
alter table word_overrides   alter column updated_at set default public.now_ms();
alter table app_state        alter column updated_at set default public.now_ms();
alter table translate_state  alter column updated_at set default public.now_ms();
alter table collected_words  alter column created_at set default public.now_ms();

-- 4. unit_progress 主键改为 (book_id, unit_id, mode)，保留 (unit_id, mode) 唯一约束
do $$
begin
  if exists (
    select 1 from pg_constraint c
    where c.conname = 'unit_progress_pkey'
      and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (unit_id, mode)'
  ) then
    alter table unit_progress drop constraint unit_progress_pkey;
    alter table unit_progress add primary key (book_id, unit_id, mode);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'unit_progress_unit_mode_key') then
    alter table unit_progress add constraint unit_progress_unit_mode_key unique (unit_id, mode);
  end if;
end $$;

-- 5. 调整索引（谓词变化的索引必须先删再由 v2 脚本重建）
drop index if exists word_records_error_idx;
drop index if exists word_records_star_idx;
drop index if exists word_records_book_idx;
drop index if exists unit_progress_book_idx;       -- 新主键以 book_id 开头，已覆盖 getByBook
drop index if exists collected_words_pending_idx;

-- 6. 校验约束：对存量数据先 NOT VALID 添加，确认无脏数据后再 VALIDATE
do $$
declare
  c record;
begin
  for c in select * from (values
    ('vocab_books',      'vocab_books_id_check',              'check (id <> '''')'),
    ('vocab_books',      'vocab_books_is_custom_check',       'check (is_custom)'),
    ('vocab_books',      'vocab_books_unit_size_check',       'check (unit_size between 1 and 1000)'),
    ('vocab_books',      'vocab_books_words_check',           'check (jsonb_typeof(words) = ''array'')'),
    ('word_records',     'word_records_word_id_check',        'check (word_id <> '''')'),
    ('word_records',     'word_records_word_item_check',      'check (word_item is null or jsonb_typeof(word_item) = ''object'')'),
    ('word_records',     'word_records_total_practice_count_check',      'check (total_practice_count >= 0)'),
    ('word_records',     'word_records_dictation_error_count_check',     'check (dictation_error_count >= 0)'),
    ('word_records',     'word_records_consecutive_correct_count_check', 'check (consecutive_correct_count >= 0)'),
    ('unit_progress',    'unit_progress_book_id_check',       'check (book_id <> '''')'),
    ('unit_progress',    'unit_progress_unit_id_check',       'check (unit_id <> '''')'),
    ('unit_progress',    'unit_progress_current_word_index_check', 'check (current_word_index >= 0)'),
    ('unit_progress',    'unit_progress_completed_word_ids_check', 'check (jsonb_typeof(completed_word_ids) = ''array'')'),
    ('unit_progress',    'unit_progress_retry_word_ids_check',     'check (jsonb_typeof(retry_word_ids) = ''array'')'),
    ('word_overrides',   'word_overrides_word_id_check',      'check (word_id <> '''')'),
    ('translate_books',  'translate_books_id_check',          'check (id <> '''')'),
    ('translate_books',  'translate_books_sentences_check',   'check (jsonb_typeof(sentences) = ''array'')'),
    ('reading_articles', 'reading_articles_id_check',         'check (id <> '''')'),
    ('reading_articles', 'reading_articles_paragraphs_check', 'check (jsonb_typeof(paragraphs) = ''array'')'),
    ('collected_words',  'collected_words_word_check',        'check (btrim(word) <> '''')'),
    ('collected_words',  'collected_words_status_check',      'check (status in (''pending'', ''processing'', ''done'', ''failed''))'),
    ('collected_words',  'collected_words_attempts_check',    'check (attempts >= 0)'),
    ('app_state',        'app_state_current_unit_index_check',  'check (current_unit_index >= 0)'),
    ('app_state',        'app_state_book_mode_progress_check',  'check (jsonb_typeof(book_mode_progress) = ''object'')'),
    ('app_state',        'app_state_loop_counts_check',         'check (jsonb_typeof(loop_counts) = ''object'')'),
    ('app_state',        'app_state_learned_root_ids_check',    'check (jsonb_typeof(learned_root_ids) = ''array'')'),
    ('translate_state',  'translate_state_completed_sentence_ids_check', 'check (jsonb_typeof(completed_sentence_ids) = ''object'')')
  ) as v(tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table %I add constraint %I %s not valid', c.tbl, c.name, c.def);
    end if;
  end loop;
end $$;
```

### B-3 数据搬迁与校验（在附录 A 之后执行）

```sql
-- =============================================================================
-- v1 → v2 升级：第 3 步（在 v2 全量脚本之后运行）
-- =============================================================================

-- 1. 把 app_state.book_mode_progress 拆到 book_progress（已存在的行不覆盖）
insert into book_progress (book_id, mode, unit_index, updated_at)
select b.key, m.key, m.value::integer, a.updated_at
from app_state a
cross join lateral jsonb_each(a.book_mode_progress) b
cross join lateral jsonb_each_text(case when jsonb_typeof(b.value) = 'object' then b.value else '{}'::jsonb end) m
where m.key in ('learn', 'dictation', 'phonetic')
  and m.value ~ '^\d+$'
  and b.key <> ''
on conflict (book_id, mode) do nothing;

-- 2. 存量行的冗余计数按新触发器口径重算一次
update vocab_books     set total_words     = jsonb_array_length(words)     where total_words     <> jsonb_array_length(words);
update translate_books set total_sentences = jsonb_array_length(sentences) where total_sentences <> jsonb_array_length(sentences);

-- 3. 校验存量数据。任何一条失败都说明有脏数据，先按报错清理再重跑本段。
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where not convalidated and contype = 'c' and connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s validate constraint %I', c.tbl, c.conname);
  end loop;
end $$;

-- 4. 可选：v1 遗留且代码从未使用的 vocab_units（见"需作者拍板"D3）
-- drop table if exists vocab_units;
```
