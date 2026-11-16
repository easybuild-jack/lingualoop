# 迭代记录：跨设备数据同步（Supabase）

| 项目 | 内容 |
|---|---|
| 迭代主题 | 配置 Supabase 后，学习数据跨设备共享 |
| 分支 | `dev2`（从 `dev` 切出，`dev` 保持稳定不动） |
| 提交 | `a14bd52` feat(cloud): 支持配置 Supabase 后跨设备共享学习数据<br>`4bd9477` fix(cloud): 翻译题库改为水合完成后再与云端对账 |
| 改动规模 | 26 个文件，+2587 / -875 |
| 日期 | 2026-11-15 |
| 建表脚本 | `supabase/schema.sql` |

---

## 一、需求

### 1.1 背景

LinguaLoop 目前是纯浏览器应用：错词本、学习进度、自定义词库等数据全部存在 IndexedDB / localStorage 里。换一台电脑、换一个浏览器，数据就完全看不到，用户无法延续学习。

目标是让同一份学习数据能在多台设备上共用，同时**不引入账号体系**（不做注册、登录、密码、用户表）。

### 1.2 核心规则（一句话版）

> **有没有配置数据库，就是模式开关。**
> 配了 → 业务数据全部走数据库，跨设备共享；没配 → 全部留在浏览器，行为与现在完全一致。

两种模式是两套独立数据，互相同步、互相覆盖都不发生（除了首次配置时的一次性上传）。

### 1.3 数据分三类

| 类别 | 举例 | 配置数据库后 |
|---|---|---|
| **业务数据**（要共享） | 错词本 / 生词本、单元学习进度、学习位置、自定义词库与单词、单词手工修改、翻译自定义题库、翻译完成记录、上传的阅读文章 | 直接读写 Supabase |
| **设置类**（不共享） | AI 配置与 API Key、皮肤、键音与各音量、快捷键、音标偏好、听写播报选项、口语场景参数、PWA 状态、词库缓存版本号、Supabase 配置本身 | **永远只存 localStorage** |
| **可重建数据**（不入库） | 内置 5 本官方词库、`aiWordCache`（10,289 词的离线索引与 AI 查词缓存） | 保持本地，可由 `/dicts/*.json` 重建 |

设置类数据的判定理由：AI Key 属于敏感凭据不能上云；皮肤/音量/快捷键是"这台设备的使用习惯"，同步过去反而别扭。**这一点在需求确认阶段被明确强调过两次。**

### 1.4 需求确认过程（决策留痕）

需求经过多轮收敛，早期设想过"全局版本号 + 快照对齐"和"行级合并 + 离线队列"两套方案，都因为复杂度被否掉，最终定为一期最简形态：

| 讨论点 | 最终结论 |
|---|---|
| 多设备如何识别是同一人 | 不做账号体系。一份 Supabase 配置 = 一份数据 |
| 配置库后本地数据怎么办 | 首次配置时**一次性上传**本地已有数据到云端 |
| 配了库但断网 | 提示"数据库暂时不可用"，用户可主动选「临时用本地模式」；恢复云端后**以云端为准** |
| 多设备同时改同一条 | 不处理合并。谁最后写库谁生效 |
| 删除是否要墓碑 | 不需要。云模式下数据只有云端一份，物理删除即删除 |
| 是否要 Realtime 推送 | 不需要 |
| 冲突合并 / 版本号 / 待同步队列 | **全部取消**，一期不做 |
| 原有的 Token + Redis 收词 | 删掉。改成"配了库才收词，没配就不收" |
| 外部翻译小工具 | 由项目方改造，直连同一个 Supabase，应用侧不做服务端中转 |

### 1.5 明确不做

- 不做账号、登录、权限隔离（谁知道 anon key 谁就能读写全表，靠项目私有 + key 不外泄兜底）
- 不做离线写入与联网补传（云模式断网 = 不可用）
- 不做行级冲突合并、版本号、墓碑删除
- 不把内置官方词库和 `aiWordCache` 上传
- 不把任何设置项上传

---

## 二、方案设计

### 2.1 总体思路：一个数据访问层，两套实现

不改造页面代码，而是在数据层做路由：

```
页面 / store / db 业务函数
        ↓  只认 Repositories 接口
  getRepositories()
        ├── 未配置数据库 → localRepositories  (Dexie / IndexedDB)
        └── 已配置数据库 → cloudRepositories  (Supabase PostgREST)
```

好处：`db/index.ts` 里"读一条 → 算 → 写回一条"的业务逻辑（累计练习次数、合并错词、推进单元进度等）**只写一份**，两种模式共用，不用为云端再实现一遍规则。

### 2.2 数据路由表

| 数据 | 本地模式 | 云模式 | 承载位置 |
|---|---|---|---|
| 自定义词库 + 单词 | IndexedDB `books` | `vocab_books` | repository.books |
| 错词本 / 生词本 / 掌握度 | IndexedDB `wordRecords` | `word_records` | repository.wordRecords |
| 单元学习进度 | IndexedDB `unitProgress` | `unit_progress` | repository.unitProgress |
| 单词手工修改（音节/构词/例句） | IndexedDB `wordOverrides` | `word_overrides` | repository.wordOverrides |
| 学习位置与累计进度 | localStorage（zustand persist） | `app_state` | repository.appState + 同步器 |
| 翻译自定义题库 | localStorage | `translate_books` | repository.translate |
| 翻译完成记录 / 位置 | localStorage | `translate_state` | repository.translate |
| 阅读上传文章 | localStorage | `reading_articles` | repository.reading |
| AI 查词缓存 | IndexedDB `aiWordCache` | **仍然 IndexedDB**（不入库） | 直接 `db.aiWordCache` |
| 官方内置词库 | `/dicts/*.json` | 同左 | `dictionaryLoader` |
| 全部设置项 | localStorage | **同左** | 未改动 |

两类数据的特殊处理：

- **学习位置与翻译进度**原本是 zustand `persist` 在 localStorage。云模式下启动时用云端值覆盖本地 store（hydrate），之后本地每次变更做 1.2 秒防抖推送，保证两边一致。
- **AI 查词缓存**故意不走 repository：它有上万条、可由词库重建、且体积大，上传只会让同步变慢。

### 2.3 断网与降级

```
启动 → 是否配置了数据库？
  ├─ 否 → 直接本地模式，不发任何网络请求
  └─ 是 → 探测连接（SELECT 1 行 app_state）
        ├─ 成功 → 拉回云端进度 → 启动变更推送
        └─ 失败 → 弹窗：
              [临时用本地模式]  → 置降级标记 + 重载，数据回到浏览器
              [重试连接]        → 重新探测
```

- 降级标记 `lingualoop_cloud_offline` 与配置分开存：**配置保留，只是暂时不用**。下次点「恢复云端连接」直接清标记重载，以云端数据为准。
- 降级期间产生的本地数据**不会**上传云端（一期明确不做），弹窗里有明确文案提示。
- 监听 `window.offline` 事件，多一层保护：联网状态变化时立刻切到错误态。

### 2.4 首次配置迁移

`uploadLocalDataToCloud()` 的规则是"**只补齐，不覆盖**"：

| 数据 | 迁移逻辑 |
|---|---|
| 自定义词库 | 云端没有该 `id` 才写入 |
| 生词/错词记录 | 云端没有该 `wordId` 才写入 |
| 单元进度 | 云端没有该 `(unitId, mode)` 才写入 |
| 单词手工修改 | 云端没有该 `wordId` 才写入 |
| 翻译自定义题库 | 云端没有该 `id` 才写入 |
| 翻译进度 | 云端 `translate_state` 为空才写入 |
| 学习位置进度 | 云端 `app_state.updated_at = 0` 才写入 |
| 阅读文章 | 只传 `isCustom` 的，云端没有该 `id` 才写入 |

重复点「上传本地数据」不会把线上数据冲掉，返回结果会给出"已上传 N 条、跳过 M 条"的明细。

---

## 三、代码改动明细

### 3.1 新增文件

| 路径 | 行数 | 作用 |
|---|---|---|
| `src/core/cloud/config.ts` | 116 | 配置读写（URL / anon key 存 localStorage）、URL 归一化、`isCloudMode()` / `isCloudConfigured()` / `isOfflineFallback()`、降级开关、跨标签页变更订阅 |
| `src/core/cloud/client.ts` | 104 | Supabase 客户端懒加载单例（配置变了自动重建）；关闭 auth/realtime 心跳；`probeCloudConnection()` 一次体检网络 / key / 建表 / 权限四类问题，把报错翻成中文可读文案 |
| `src/core/cloud/supabaseRepository.ts` | 597 | 云端的 `Repositories` 实现，7 个仓库、行 ↔ 前端类型的双向映射（snake_case ↔ camelCase） |
| `src/core/cloud/sync.ts` | 190 | 进度类数据的双向同步：`hydrateWorkspaceProgress` / `hydrateTranslateProgress` 拉取覆盖，`startWorkspaceProgressSync` / `startTranslateSync` 防抖推送 |
| `src/core/cloud/migrate.ts` | 153 | 首次配置的本地数据上传，只补齐不覆盖，返回各表计数 |
| `src/core/cloud/collector.ts` | 155 | 外部工具收词：轮询 `collected_words` 收件箱 → AI 补全词条 → 写生词本 + 「翻译工具收藏」词库 → 标记 `pulled_at` |
| `src/db/local.ts` | 139 | 从 `db/index.ts` 抽出的 Dexie 实例（6 个版本 schema 与历史升级逻辑原样保留） |
| `src/db/repository.ts` | 185 | 数据访问层接口 + 本地实现 + `getRepositories()` 路由入口 |
| `src/components/cloud/CloudSyncGate.tsx` | 135 | 云连接守卫：启动体检、拉取进度、启动推送；失败弹窗提供「重试 / 临时用本地模式」 |
| `src/components/cloud/CollectedWordsWatcher.tsx` | 151 | 云模式下每 20 秒 + 窗口聚焦时轮询收件箱，收到新词弹提示条并可跳转练习 |
| `src/components/settings/CloudSyncPanel.tsx` | 266 | 设置页配置面板：URL / anon key 输入、测试连接、保存启用、上传本地数据、断开配置、恢复云端连接 |
| `supabase/schema.sql` | 225 | 建表 + 索引 + RLS + anon 授权，一次执行完成 |

> `repository.ts` / `supabaseRepository.ts` 这两个文件是本次改造的骨架：前者定义"要什么"，后者实现"云端怎么做"，`db/index.ts` 里的业务函数完全不知道底下是 IndexedDB 还是 PostgREST。

### 3.2 修改文件

| 路径 | 改动点 |
|---|---|
| `src/db/index.ts` | 移除 Dexie 实例定义（搬到 `local.ts`），改为从 `./repository` 取仓库。所有业务函数（约 30 个）内部实现换成 `getRepositories().xxx`。新增 6 个页面直调的基础查询：`getVocabularyBookById` / `deleteVocabularyBookById` / `getWordRecord` / `putWordRecord` / `getAllWordRecords` / `getWordOverridesBulk`（`getWordOverride` 原有，内部改为走仓库）。原 `db.transaction('rw', db.unitProgress, ...)` 改为 `runInUnitProgressTransaction()`——本地走 Dexie 事务，云端直接串行执行 |
| `src/db/local.ts` | （新增，见上表）保留 `LinguaLoopDB` 类、6 个版本 schema、v2 的历史数据 id 归并迁移 |
| `src/app/layout.tsx` | 移除 `<ExternalSyncManager />`，改为挂载 `<CloudSyncGate />`（连接守卫）与 `<CollectedWordsWatcher />`（收词轮询） |
| `src/app/reading/page.tsx` | 云模式下从 `reading_articles` 读文章（内置示例文章仍以代码为准，做 id 去重合并）；`persistArticles` 在云模式下改为写数据库（新增/更新走 `putArticle`，被移除的走 `deleteArticle`），本地模式仍写 localStorage；读取失败时展示黄色提示条 |
| `src/core/dictionarySearch.ts` | `db.books.get()` → `getVocabularyBookById()`；`db.books.filter(...)` → `getRepositories().books.getCustom()` |
| `src/core/dictionaryLoader.ts` | `db.wordOverrides.get()` → `getWordOverride()`；`db.wordOverrides.bulkGet()` → `getWordOverridesBulk()` |
| `src/store/useWorkspaceStore.ts` | `db.books.delete/get`、`db.wordRecords.toArray()` 换成对应的 db 层函数 |
| `src/app/books/page.tsx` | 去掉未使用的 `db` 导入 |
| `src/components/modals/SettingsModal.tsx` | 「外部工具同步」Tab 改名「数据与云同步」，内容换成 `<CloudSyncPanel />`；原「专属同步密钥」降级为「作者身份密钥（可选）」，只保留官方词库维护权限用途，与数据同步无关；移除 `isAuthorSyncToken` 的即时提示块 |
| `package.json` / `package-lock.json` | 移除 `@upstash/redis`，加入 `@supabase/supabase-js` |

### 3.3 删除文件

| 路径 | 删除原因 |
|---|---|
| `src/app/api/words/collect/route.ts`（134 行） | 旧的 Token + Redis 收词写入接口，改由外部工具直连 Supabase |
| `src/app/api/words/pending/route.ts`（68 行） | 旧的收词拉取接口，改由 `collected_words` 表轮询 |
| `src/lib/server/collectStore.ts`（178 行） | Redis 收词存储层，整个链路不再需要 |
| `src/components/sync/ExternalSyncManager.tsx`（280 行） | 旧的 Token 轮询同步组件，被 `CollectedWordsWatcher` 取代 |

### 3.4 依赖变化

```diff
- "@upstash/redis": "^1.38.4"
+ "@supabase/supabase-js": "^2.119.0"
```

服务端不再需要任何 Redis 环境变量（`COLLECT_TOKEN` / `KV_REST_API_*` 可以删掉）。

---

## 四、数据库结构

执行 `supabase/schema.sql` 会建 10 张表：

| 表 | 主键 | 内容 |
|---|---|---|
| `vocab_books` | `id` | 自定义词库，`words` 用 jsonb 整存 `WordItem[]` |
| `vocab_units` | `id` | 词库的单元划分（预留，当前前端主要按 `unitSize` 动态切分） |
| `word_records` | `word_id` | 错词本 / 生词本 / 掌握度，一个单词一条，跨词库共用 |
| `unit_progress` | `(unit_id, mode)` | 每个单元 × 每种模式一条 |
| `word_overrides` | `word_id` | 用户改过的音节拆分、构词法、音标、例句、短语 |
| `translate_books` | `id` | 翻译模块自定义句库 |
| `reading_articles` | `id` | 上传的阅读文章，`paragraphs` 存 `ReadingSentence[][]` |
| `collected_words` | `id` (bigserial) | 外部工具收词收件箱，`pulled_at` 为空表示待处理 |
| `app_state` | 固定 `id = 1` | 单行：当前词库、当前单元、各模式进度、循环遍数、已学词根 |
| `translate_state` | 固定 `id = 1` | 单行：当前翻译题库、已完成句子 id 集合 |

**设计约定**

1. 时间戳统一 `bigint`（epoch 毫秒），和前端 TS 类型一一对应，避免时区转换。
2. 主键与本地 IndexedDB 保持一致，两种模式共用同一套读写代码。
3. 单词 / 句子 / 段落这类数组用 jsonb 整存，一个词库一行——这类结构会变，拆表维护成本高于收益。
4. 每张表都开 RLS，并统一放一条 `anon_all` 策略（`for all to anon using (true)`）。没有账号体系，安全边界就是"谁知道配置串谁能访问"，因此项目必须私有、key 不能公开。

---

## 五、关键实现细节

### 5.1 模式判定的两个函数不能混用

- `isCloudMode()`——**当前实际走哪套数据**。配置了、且没有降级标记，才为 true。
- `isCloudConfigured()`——**有没有填过配置**。降级期间仍为 true。

页面的数据读写一律用前者，设置面板的状态标签两个都要（要能显示"已配置但使用本地模式"）。

### 5.2 云端写入的防抖与去重

云模式下打字练习如果每个词都发一次网络请求，会产生大量小写入。`sync.ts` 的做法：

- 订阅 `useWorkspaceStore` / `useTranslateStore`，取快照做 JSON 比对，**内容没变不推送**；
- 变化后 1.2 秒防抖，合并成一次 upsert；
- `applyingRemote` 标志位：从云端回写本地 store 时置为 true，避免"拉取 → 触发订阅 → 又把刚拉到的数据推回去"的死循环。

### 5.3 翻译题库的水合竞态（提交 `4bd9477` 修的就是这个）

`useTranslateStore` 用 zustand persist，localStorage 的读取是**异步**的。如果启动时立刻用云端数据覆盖 store，随后 persist 的旧数据水合完成又覆盖回来，结果就是把云端题库撞掉。

修法：`ensureTranslateHydrated()` 等 `persist.onFinishHydration` 完成后再决定是否覆盖；`hydrateTranslateProgress` 与 `startTranslateSync` 都先 await 它。

另外合并时保留"本地有、云端无"的自定义题库，内置预置题库始终以代码 `DEFAULT_TRANSLATION_BOOKS` 为准，不参与云端比对。

### 5.4 收词链路的形态变化

| | 旧方案（已删除） | 新方案 |
|---|---|---|
| 写入 | 外部工具 POST `/api/words/collect` + Token 校验 | 外部工具直接 `insert into collected_words` |
| 中转 | Upstash Redis 队列 | 无 |
| 读取 | 应用轮询 `/api/words/pending`（需配 Token 才启动） | 应用轮询 `collected_words`（需云模式才启动） |
| 未配置数据库 | 不拉取 | 不拉取，且不发任何请求 |

应用收到词条后的处理：AI 补全 → 写 `word_records`（加星）→ 合并进「翻译工具收藏」词库（`book_custom_collected`）→ 标记 `pulled_at`。AI 解析失败的词会**留在收件箱**下次重试，不会丢。

### 5.5 错误文案分流

`client.ts` 把 Supabase 的报错分成四类，直接给可执行建议，避免用户看到 `PGRST301` 这类原始错误：

| 类型 | 触发特征 | 提示 |
|---|---|---|
| `network` | `failed to fetch` / timeout / ENOTFOUND | 无法连接数据库，检查网络或项目地址 |
| `auth` | 401 / 403 / JWT / apikey | anon key 无效或已轮换 |
| `schema` | `42P01` / relation not found | 还没建表，先执行 `schema.sql` |
| `schema` | `42501` / RLS / permission denied | 表权限未开启，重跑 schema 里的授权部分 |

---

## 六、用户使用流程

1. 在 Supabase 建一个项目（建议设为私有）
2. 控制台 → SQL Editor → 粘贴 `supabase/schema.sql` 全部内容 → Run
3. 控制台 → Project Settings → API，复制 Project URL 与 anon public key
4. 应用 → 设置 → **数据与云同步** → 填入两项 → 点「测试连接」
5. 连接正常后点「保存并启用」（页面会重载，之后所有业务数据直接走云端）
6. 点「上传本地数据到云端」把本机已有数据搬上去（只补齐不覆盖）
7. 换设备：重复第 4、5 步，填同一份配置即可看到同样的数据

**断开配置**会清掉本地保存的配置并重载，数据回到浏览器本地那一份（配置那一刻的旧快照）。

---

## 七、验证情况

| 项目 | 结果 |
|---|---|
| `tsc --noEmit` | 通过 |
| `next build` | 通过，22 个页面全部生成 |
| dev server 冒烟 | `/`、`/dictionary`、`/reading`、`/learn` 均返回 200，无运行时错误 |
| 新增文件 eslint | 0 error（`set-state-in-effect` 已用微任务规避） |
| 真实 Supabase 端到端联调 | **未进行**，需要先建好项目后一起跑 |

---

## 八、已知限制（一期范围内有意为之）

1. **云模式断网不可用**：没有本地副本，断网只能选「临时用本地模式」。
2. **多设备同改会互相覆盖**：不合并计数，最后写入者生效。
3. **降级期间的本地数据不会回传**：恢复云端以云端为准，本地这份会变成冻住的快照。
4. **anon key 就是访问凭据**：泄露即等于数据泄露，项目必须私有。
5. **`vocab_units` 表当前基本闲置**：前端仍按 `unitSize` 动态切分单元，此表为后续显式单元管理预留。
6. **电台模块上传的媒体仍不持久化**：目前是 `URL.createObjectURL` 的临时 blob，刷新即失效，本次未纳入同步范围（要同步需引入 Supabase Storage）。

## 九、后续可做

- 用真实 Supabase 项目跑通：读写、断网降级、换设备、收词全链路
- 清理历史遗留 lint（全仓约 45 errors / 49 warnings，集中在 `UnitCompleteCard`、`RadioStudioVisualizer`、`books` / `errors` 页面）
- 如果以后要支持多人共用一个项目，加 `owner_key` 列 + 按行 RLS 策略
- 如果以后要支持离线写入，在 IndexedDB 加 `outbox` 表 + 重连补传（一期明确不做）
