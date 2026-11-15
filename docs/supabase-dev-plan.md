# Supabase 云端同步 · 账号隔离与库层修复 开发计划

> 仓库：easybuild-jack/lingualoop，工作分支 `dev2`
> 数据库脚本：`supabase/schema.sql`（本轮已直接修改，`schema_version = 2`）
> 相关文档：`docs/update.md`（原需求与实现记录）、`docs/supabase-review-report.md`（审查报告，问题编号 H1–H6、M1–M11、L1–L11）
>
> 执行顺序：**作者先审 `supabase/schema.sql` → 确认后再按第 5 节改业务代码**。脚本确认前不要动业务代码。

---

## 1. 背景与目标

dev2 已经实现"配置 Supabase 后跨设备共享学习数据"，但 v1 脚本是"一份数据库 = 一个人"：没有账号概念，并且审查发现了若干库层正确性问题（种子行覆盖本地进度、1000 行截断、读改写并发互相覆盖、收件箱堵塞等）。

典型使用场景：**一个家庭或小团队共用一个数据库**，父母和孩子各自登录，学习进度互不影响；词库、句库、视频等自定义内容可以选择全家共享，也可以只给自己用。

本计划的目标：

1. 在数据库里引入**最简单的账号模型**：一个 `account_id` 字段，不加角色、管理员、scope 列、owner_id 等任何额外层。
2. 把审查中已确定、能在库层解决的正确性修复落进脚本。
3. 列清楚后续改代码要做的事、明确不做的事、验收标准，作者可以直接按它执行。

---

## 2. 范围

### 2.1 本次做

| 项 | 说明 |
|---|---|
| 账号隔离 | 只在**配置了数据库**时生效：需要登录，按登录账号区分数据 |
| 数据库脚本 | 修改 `supabase/schema.sql`：账号字段、约束、索引、触发器、事务函数、v1 原地升级 |
| 后续代码改造 | 本计划第 5 节列出清单，**脚本确认后**再做 |

### 2.2 明确不做

| 项 | 说明 |
|---|---|
| 纯本地模式 | 不配置数据库时完全不涉及登录和账号，保持现状，不做任何改动 |
| 安全 / RLS / anon key 暴露 | **本次不做**。外部同步工具会直连数据库。脚本沿用 v1 的"全开放"策略，只是把登录后使用的 `authenticated` 角色也加进来（否则登录后读不到数据，这是功能需要，不是安全改造） |
| 角色 / 管理员 / scope 列 / owner_id | 作者已否定，不加 |
| 共享内容的修改、删除权限控制 | 不做。任何已登录账号都可以改、可以删共享内容，不加创建者限制 |
| 官方词库入库 | 不做。官方词库仍是本地 JSON（`public/dicts/`），库里只存各账号的官方词库进度 |
| 视频文件本体的存储 | 本次只建视频的元数据表（`radio_items`），文件上传到对象存储的方案另行设计 |
| 删除日志、官方 JSON 版本号等 | 列为待确认（第 7 节），不阻塞本次脚本 |

---

## 3. 已定规则

### 3.1 账号字段

- **字段名**：`account_id`，类型 `uuid`。
- **为什么用这个名字**：现有登录/注册页（`src/components/auth/LoginView.tsx`、`EmailAuthForm.tsx`、`WechatQrPanel.tsx`）目前只是静态界面，提交和发送验证码都是 `TODO`，没有调用任何认证接口。代码里也没有用户主键的命名或类型约定：`src/core/cloud/client.ts` 甚至设置了 `persistSession: false`。按作者的规则，没有现成约定就用 `account_id`（uuid）。它对应 Supabase Auth 登录账号的用户 id，也就是 JWT 里的 `sub`。
- **数据库如何知道"当前账号"**：新增函数 `current_account_id()`，从 PostgREST 放入的 `request.jwt.claims` 中读取 `sub`。未登录（只带 anon key）时返回 NULL。

### 3.2 两类表

| 类别 | 表 | `account_id` | 含义 |
|---|---|---|---|
| 学习记录 / 进度 | `word_records`、`unit_progress`、`book_progress`、`word_overrides`、`app_state`、`translate_state` | **NOT NULL**，默认 `current_account_id()` | 登录哪个账号，进度就完全属于谁。客户端写入时可以不传 `account_id`，数据库自动填当前账号；未登录写入会因 NOT NULL 被拒绝 |
| 自定义内容 | `vocab_books`、`translate_books`、`reading_articles`、`radio_items`（视频）、`collected_words`（收件箱） | **可为 NULL**，默认 NULL | NULL = 共享，全家可见、可用、可改、可删；非空 = 个人，只有该账号可见 |

- 内容表**不加 scope 列**，是否共享只看 `account_id` 是否为 NULL。
- 内容表默认值是 NULL（共享），和 v1"所有内容大家都能用"的行为一致；上传或创建时由界面选项决定写 NULL 还是当前账号。
- `word_overrides`（用户对单词音节、音标、释义等的手工修改）归为"学习记录"类，按账号各自保存。如果希望全家共享这类修改，告诉我改成内容类即可（见第 7 节）。
- `collected_words` 收件箱归为内容类：外部工具插入时不填 `account_id` 就是"任意已登录账号都可以收"，填了就只有该账号会收。

### 3.3 查询规则

```sql
-- 内容表
where account_id is null or account_id = current_account_id()
-- 进度表
where account_id = current_account_id()
```

PostgREST 写法：内容表用 `.or('account_id.is.null,account_id.eq.<当前账号>')`，进度表用 `.eq('account_id', <当前账号>)`。数据库函数内部已经按这个规则过滤。

### 3.4 主键与唯一约束

| 表 | 主键 / 唯一约束 | 说明 |
|---|---|---|
| `word_records` | PK `(account_id, word_id)` | 同一账号一个词一条，跨词库共用 |
| `unit_progress` | PK `(account_id, book_id, unit_id, mode)` + UNIQUE `(account_id, unit_id, mode)` | 不同账号对同一本书各有一份进度。保留第二个唯一约束，现有 upsert 只需把 `onConflict: 'unit_id,mode'` 改成 `'account_id,unit_id,mode'` |
| `book_progress` | PK `(account_id, book_id, mode)` | |
| `word_overrides` | PK `(account_id, word_id)` | |
| `app_state` / `translate_state` | PK `account_id` | 每个账号一行；去掉 v1 的 `id = 1` 单行设计 |
| 内容表 | PK `id`（客户端生成的全局 id） | `account_id` 可为空，不能进主键。id 本身全局唯一（如 `book_custom_<时间戳>`），进度表里的 `book_id` 始终指向唯一的一本书 |

**共享内容的重名问题**：PostgreSQL 的普通 `UNIQUE (account_id, name)` 会把多个 NULL 视为互不相同，所以拦不住共享内容之间重名。现有导入流程的默认名都一样（如"自定义生词本"），所以脚本**默认不限制重名**。如果要禁止重名，执行脚本里注释掉的两句即可：

```sql
alter table vocab_books add constraint vocab_books_account_name_key unique nulls not distinct (account_id, name);
```

`NULLS NOT DISTINCT`（PostgreSQL 15 起支持，Supabase 满足）让 NULL 也参与比较。这一条约束同时保证两件事：共享内容之间不重名，同一账号的个人内容之间不重名。个人内容和共享内容同名仍然允许。

### 3.5 官方词库

- 官方词库不入库，`vocab_books` 上有 `check (is_custom)` 兜底。
- 官方词库进度和自定义词库进度共用 `unit_progress` / `book_progress`，生成列 `book_kind` 按 `book_id` 前缀自动计算：以 `book_custom_` 开头的是 `custom`，其余是 `official`。
- 进度只存 `book_id`、`unit_id`、`word_id` 这些字符串标识，打开词库时与本地 JSON 对齐。官方语义单元 id 来自 `public/dicts/*.units.json`，已核对 5 本官方词库之间没有重复；切片单元 id 为 `${bookId}_unit_${i}`。
- `mark_unit_word_completed` 每次调用都会按传入的当前单元成员，剪除库里已经失效的词。

### 3.6 共享内容的修改与删除

- 共享内容：任何已登录账号都可以改、可以删，数据库不做限制。
- 个人内容：只有所属账号能看到。另外，触发器会拒绝**另一个已登录账号**按同一个 id 改写或删除它。这不是权限设计，而是为了防止固定 id（例如 `book_custom_collected`）或者盲目 upsert 把别人的个人内容静默覆盖掉。外部工具不带登录身份直连时，不受这个触发器影响。

---

## 4. 库表改动（`supabase/schema.sql`）

### 4.1 账号模型

| 改动 | 说明 |
|---|---|
| `current_account_id()` / `require_account_id()` | 读取当前登录账号；后者在未登录时报错，供事务函数使用 |
| 进度表加 `account_id uuid not null default current_account_id()` | 主键全部纳入 `account_id`（见 3.4） |
| 内容表加 `account_id uuid`（可空） | 加 `account_id` 索引 |
| 新表 `radio_items` | 视频 / 音频元数据，字段对应 `src/resources/radioData.ts` 的 `RadioItem`。不存 `playCount`（播放次数属于个人统计，暂不入库） |
| 进度不可改挂账号 | 触发器拒绝修改已有进度行的 `account_id` |
| 个人内容防覆盖 | 见 3.6 |
| 权限 | 策略和授权从 `anon` 扩展到 `anon, authenticated`，模型本身不变 |

### 4.2 此前审查已确定的库层修复（全部叠加了账号字段）

| # | 修复 | 对应问题 | 脚本中的做法 |
|---|---|---|---|
| 1 | 不预插入空的 `app_state` / `translate_state` 行 | H1 | 删除预插入语句。某账号没有行，就代表该账号云端还没有数据 |
| 2 | 绕过 1000 行截断 | H3 | `get_starred_word_ids()` 返回 `text[]`，`get_trouble_word_records()` 返回 `jsonb`，都只返回当前账号的数据。配套部分索引 `(account_id, word_id) where is_starred`、`(account_id, last_practiced_at desc) where is_error or is_starred` |
| 3 | 增量同步 | H3、外部工具 | 每张业务表都有 `server_updated_at`，由触发器维护，并且都建了索引 |
| 4 | 读改写事务函数 | H4 | `record_word_attempt`、`toggle_star_word`、`mark_unit_word_completed`、`mark_unit_word_for_retry`、`merge_words_into_book`、`merge_translate_state`。规则与 `src/db/index.ts` 逐条对应，全部按当前账号执行 |
| 5 | 收件箱状态机 | H6、M5 | `status`（`pending` / `processing` / `done` / `failed`）、`attempts`、`last_error`、`claimed_at`、`claimed_by`。`claim_collected_words` 用 `skip locked` 认领，只处理共享条目和当前账号的条目；`complete_collected_words`、`fail_collected_word`。外部工具仍然只需 insert；直接写 `pulled_at` 的旧写法会被触发器自动转成 `done` |
| 6 | `unit_progress` 主键 | H5 库层兜底 | 主键见 3.4。触发器拒绝把进度改挂到别的书；事务函数遇到"这个单元已属于别的书"时报 23514 |
| 7 | 官方 / 自定义进度共用 | — | 生成列 `book_kind` |
| 8 | `book_progress` 表 | 多设备 / 多账号覆盖 | 从 `app_state.book_mode_progress` 拆出，每行对应一个 `(account_id, book_id, mode)`。较旧的 `updated_at` 写入自动忽略（新者胜）。`app_state` 不再有 `book_mode_progress` 列 |
| 9 | 默认值与形状检查 | L9 | 时间戳默认 `now_ms()`，jsonb 列检查 array / object，计数字段 `>= 0`，主键不能为空串 |
| 10 | 自动维护计数 | — | `vocab_books.total_words`、`translate_books.total_sentences` 由触发器按数组长度维护 |
| 11 | 删除自定义词库自动清理进度 | — | 删除个人词库只影响该库（它上面只有该账号的进度）；删除共享词库会清理**所有账号**在该库上的单元进度和书内位置；官方词库进度不受影响 |
| 12 | schema 版本表 | L9 | `schema_meta`，写入 `schema_version = 2`；同时记录 v1 导入状态 |
| 13 | 序列授权 | L3 | `grant usage, select on all sequences` |

### 4.3 v1 → v2 原地升级（同一个脚本）

在已经执行过 v1 脚本的库上，**直接再执行一次 `supabase/schema.sql`** 即可：

1. 脚本检测到旧版表（`app_state` 没有 `account_id` 列），先把 10 张旧表连同索引、序列改名为 `legacy_v1_*`。数据保留，不删除。
2. 按新结构建表。
3. 自定义词库、句库、文章、收件箱、`vocab_units` 按**共享**（`account_id = NULL`）导入，和 v1"大家都能用"保持一致。收件箱已写过 `pulled_at` 的行导入为 `done`。
4. 学习记录 / 进度导入到**第一个账号**：
   - 优先使用执行前手动指定的账号：`select set_config('lingualoop.legacy_account_id', '<uuid>', false);`
   - 否则使用 Supabase Auth 中最早注册的用户（`auth.users`）。
   - 两者都没有时跳过进度导入并提示。注册第一个账号后再执行一次脚本即可补上。
5. v1 预插入、从未写过的空种子行（`updated_at = 0`）不导入；`book_mode_progress` 拆成 `book_progress` 行；形状不合法的 jsonb 会被替换成空值，不会让脚本中断。
6. 内容和进度各自只导入一次（记录在 `schema_meta`）。之后再执行脚本，不会把已删除的数据"复活"，也不会重复导入。
7. 确认无误后，可手动执行 `drop table legacy_v1_*`。

建议的过渡步骤：先在 Supabase 中注册家长账号（作为第一个账号），再执行脚本；其他家庭成员之后各自注册，从空进度开始。

---

## 5. 后续改代码时要做的事（脚本确认后执行）

### 5.1 登录与会话（前置）

| 任务 | 涉及文件 |
|---|---|
| 接入 Supabase Auth 邮箱登录 / 注册（邮箱 + 验证码 + 密码），替换 `TODO` | `src/components/auth/EmailAuthForm.tsx`、`src/components/auth/LoginView.tsx` |
| 开启会话持久化与自动刷新：`persistSession: true, autoRefreshToken: true` | `src/core/cloud/client.ts` |
| 配置了数据库但未登录时跳转登录页；纯本地模式保持"跳过，继续本地使用" | `src/components/cloud/CloudSyncGate.tsx`、`src/app/login/page.tsx` |
| 切换账号或退出登录时清空内存与 localStorage 中的进度缓存，避免上一个账号的进度被推到下一个账号 | `src/core/cloud/sync.ts`、相关 zustand store |
| 微信扫码登录：Supabase Auth 不内置微信，需要自建或暂时隐藏 | `src/components/auth/WechatQrPanel.tsx`（作者决定，见第 7 节） |
| 体检时读取 `schema_meta.schema_version`，版本低于 2 时提示执行脚本 | `src/core/cloud/client.ts` |

### 5.2 仓储层（`src/core/cloud/supabaseRepository.ts`）

| 任务 | 说明 |
|---|---|
| 进度表读取加 `.eq('account_id', 当前账号)` | `word_records`、`unit_progress`、`book_progress`、`word_overrides`、`app_state`、`translate_state` |
| 进度表 upsert 的冲突键加上 `account_id` | `onConflict: 'account_id,word_id'`、`'account_id,unit_id,mode'`、`'account_id'`（app_state / translate_state）。写入时可以不传 `account_id`，由数据库默认填入 |
| `app_state` / `translate_state` 去掉 `id: 1` 和 `.eq('id', 1)` | 改为按账号读写 |
| 停止写 `book_mode_progress`，改写 `book_progress` 表 | 每次只 upsert 发生变化的 `(book_id, mode)`，带 `updated_at` |
| 内容表读取加 `.or('account_id.is.null,account_id.eq.<当前账号>')` | `vocab_books`、`translate_books`、`reading_articles`、`radio_items` |
| 内容表写入显式传 `account_id`（NULL 或当前账号） | 更新时不要改动 `account_id`，除非用户主动切换共享 / 个人 |
| `getAll()` 改为分页（每页不超过 1000 行）或改用标量函数 | H3 |

### 5.3 业务逻辑改用数据库函数（`src/db/index.ts` 云模式分支）

| TS 函数 | 改为调用 |
|---|---|
| `recordWordAttempt` | `rpc('record_word_attempt', …)` |
| `toggleStarWord` | `rpc('toggle_star_word', …)` |
| `eliminateErrorWord` / `removeErrorWord` | 保留按列 `update`，不要整行 upsert，并加 `account_id` 条件 |
| 生词本 / 错词本列表 | `rpc('get_starred_word_ids')`、`rpc('get_trouble_word_records')` |
| `markUnitWordCompleted` | `rpc('mark_unit_word_completed', …)`，传入当前单元全部 `word_id` |
| `markUnitWordForRetry` | `rpc('mark_unit_word_for_retry', …)` |
| `mergeWordsIntoBook` | `rpc('merge_words_into_book', …)` |
| 翻译进度推送 | `rpc('merge_translate_state', …)` |
| 错误码 23514 | 表示"单元已属于别的书 / 进度不能改挂 / 不能改别人的个人内容"，前端应当重新加载当前词库，不要静默吞掉 |

### 5.4 共享 / 个人选项（创建或上传时）

| 入口 | 涉及文件 |
|---|---|
| 导入自定义词库 | `src/components/modals/ImportModal.tsx`、`src/db/index.ts` 的 `saveCustomVocabularyBook` |
| 自定义翻译句库 | 翻译模块导入入口、`src/core/cloud/sync.ts` |
| 上传阅读文章 | `src/app/reading/page.tsx` |
| 上传视频 | `src/components/radio/RadioUploadModal.tsx`、`src/app/radio/page.tsx`（目前视频只存在页面内存里，需要先接入持久化） |

界面上提供"共享（全家可用）/ 个人（仅自己可见）"两个选项。选共享时写 `account_id = NULL`，选个人时写当前账号。纯本地模式不显示这个选项。

### 5.5 固定 id 的处理

| 固定 id | 问题 | 建议 |
|---|---|---|
| `book_custom_collected`（翻译工具收藏词库，`src/core/cloud/collector.ts`） | 收件箱收到的词会进入个人生词本，收藏词库也应属于个人；但 id 固定，两个账号会撞上同一行 | 改为按账号生成，例如 `book_custom_collected_<account_id>`，并写入 `account_id` |
| `book_custom_sample`（示例词库，`src/resources/books.ts`、`src/db/index.ts` 的 `getCustomBooks`） | 作为共享内容即可 | 以 `account_id = NULL` 写入；`getCustomBooks` 里"冗余测试数据清理"的删除逻辑要限定在当前账号可见范围内（M9） |

### 5.6 收件箱与迁移

| 任务 | 涉及文件 |
|---|---|
| 改为 `claim_collected_words` → 处理 → `complete_collected_words` / `fail_collected_word`；AI 解析失败时调用 `fail`，不再留在队头 | `src/core/cloud/collector.ts` |
| 本地数据首次上传到云端：进度写到当前登录账号；内容在上传时询问共享 / 个人，或者默认个人 | `src/core/cloud/migrate.ts` |
| 补上官方词库单元进度的迁移 | `src/core/cloud/migrate.ts`（H2） |

### 5.7 外部同步工具约定

- 写入：内容表按需填 `account_id`（NULL = 共享）。进度表必须填 `account_id`（外部工具没有登录身份，数据库无法自动填）。不要写 `server_updated_at`、`total_words`、`total_sentences`，写了也会被触发器覆盖。
- 增量拉取：`where (server_updated_at, 主键) > (游标) order by server_updated_at, 主键 limit 500`。
- 收件箱：只需 insert `word`，其余列都有默认值。

---

## 6. 验收标准

### 6.1 数据库脚本（本轮，已在本机 PostgreSQL 16 上验证）

| # | 标准 | 结果 |
|---|---|---|
| 1 | 全新库执行脚本成功，再执行一次仍然成功（幂等） | 通过 |
| 2 | 两个账号对同一本共享词库各写进度，互不覆盖：直接 upsert 和事务函数两种写法都验证；官方词库同样验证 | 通过 |
| 3 | 个人词库：另一个账号按查询规则查不到；按 id 修改、删除、upsert 覆盖、并入单词都会被拒绝 | 通过 |
| 4 | 共享词库：两个账号都能查到、都能改，也能看到对方的修改；任何一方都能删除；删除后所有账号在该库上的进度被清理，官方词库进度不受影响 | 通过 |
| 5 | 删除个人词库只清理该库的进度 | 通过 |
| 6 | 生词本 / 错词本函数只返回当前账号的数据；状态表、书内位置、翻译进度按账号各一行，互不覆盖；书内位置较旧的写入被忽略 | 通过 |
| 7 | 进度不能改挂到别的书或别的账号 | 通过 |
| 8 | 收件箱：共享条目任何账号都能认领，个人条目只有对应账号会认领；不会重复认领；旧的 `pulled_at` 写法仍然有效 | 通过 |
| 9 | 未登录时，事务函数和进度写入都会报错 | 通过 |
| 10 | 视频、文章按共享 / 个人区分可见性 | 通过 |
| 11 | 事务函数规则与 `src/db/index.ts` 一致：默写连续 3 次答对清除错词标记、重考队列、最后一个词后进入重试、全部完成后写入 `completed_at`、剪除失效词 | 通过 |
| 12 | 并发：两个账号各 30 次并发调用 `record_word_attempt`，各自计数都是 30；各 15 个词并发标记完成，各自都记录 15 个且单元完成 | 通过 |
| 13 | v1 升级：没有账号时只导入内容并提示；有 `auth.users` 时导入到最早注册的账号；手动指定账号的写法有效；种子行不导入；`book_mode_progress` 正确拆分；非法 jsonb 不会让脚本中断；再次执行不复活已删除的数据、不重复导入；收件箱 id 序列接续 | 通过 |
| 14 | 形状检查：`words` 必须是数组；官方词库不能入库 | 通过 |

### 6.2 代码改造（后续）

| # | 标准 |
|---|---|
| 1 | 不配置数据库时，登录页可以跳过，所有功能与改造前一致 |
| 2 | 配置数据库后必须登录；家长和孩子分别登录后，同一本官方词库或共享词库的进度互不影响 |
| 3 | 导入词库、句库、文章、视频时可以选择共享或个人；个人内容在另一个账号下看不到；共享内容两个账号都能看到、修改、删除 |
| 4 | 切换账号后界面上不残留上一个账号的进度，也不会把上一个账号的进度推送到新账号 |
| 5 | 生词本超过 1000 个词时显示完整 |
| 6 | 错词攻坚快速连续答题，计数和错词标记不丢失 |
| 7 | 收件箱中 AI 解析失败的词不会阻塞后面的词，超过重试次数后进入失败状态 |
| 8 | `tsc --noEmit` 与 eslint 通过 |

---

## 7. 待确认（不阻塞脚本）

| # | 问题 | 脚本当前处理 | 我的建议 |
|---|---|---|---|
| 1 | `vocab_units` 是否删除 | **保留**，表结构与 v1 相同，升级时数据原样导入，不做任何不可逆删除 | 代码从未读写这张表，确认后可以删除 |
| 2 | 默写循环次数（`loop_counts`）算设备偏好还是学习进度 | 保留在 `app_state`，按账号存 | 如果是偏好，改为只存本地，删除这一列 |
| 3 | 是否需要删除日志表来同步删除（包括翻译题库删了又复活，M2） | 未加，删除仍是物理删除 | 需要时新增 `deletions(table_name, row_id, account_id, deleted_at)`，由触发器记录 |
| 4 | 是否记录官方 JSON 的版本号 | 未记录，靠每次调用时剪除失效词 | 如果官方 JSON 会频繁调整，建议在 `book_progress` 上加 `dict_version` |
| 5 | 共享内容是否禁止重名 | 不限制 | 需要时执行脚本里注释掉的 `unique nulls not distinct` 两句 |
| 6 | `word_overrides`（单词手工修改）按账号还是全家共享 | 按账号 | 按账号更简单；如需共享，可以改为内容类（可空） |
| 7 | 微信扫码登录 | 与脚本无关 | Supabase Auth 不内置微信登录。建议先只上线邮箱登录，暂时隐藏微信入口 |
