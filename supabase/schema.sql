-- =============================================================================
-- LinguaLoop 云端数据表（Supabase / Postgres）
--
-- 使用方式：Supabase 控制台 → SQL Editor → 粘贴本文件全部内容 → Run。
-- 只存"用户自己的数据"，内置官方词库、离线词库缓存（aiWordCache）与所有设置项
-- 都不入库：它们要么可从 /dicts/*.json 重建，要么必须留在本机。
--
-- 约定：
--   1. 所有时间戳统一 bigint（epoch 毫秒），与前端 TS 类型一一对应，避免时区转换。
--   2. 主键与本地 IndexedDB（Dexie）保持一致，本地模式与云端模式可共用同一套读写代码。
--   3. 单词/句子/段落这类数组用 jsonb 整存，一个词库一行 —— 结构会变，拆表维护成本高。
--   4. 本项目不做账号体系：一份 Supabase 配置 = 一份数据。anon key 谁能拿到谁就能
--      读写全部数据，请务必把项目设为私有，不要把 key 公开到前端仓库。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 自定义词库（只存 isCustom 的词库，内置 5 本官方词库不入库）
-- -----------------------------------------------------------------------------
create table if not exists vocab_books (
  id           text primary key,
  name         text        not null,
  description  text        not null default '',
  category     text        not null default 'custom',
  is_custom    boolean     not null default true,
  unit_size    integer     not null default 20,
  total_words  integer     not null default 0,
  words        jsonb       not null default '[]'::jsonb,  -- WordItem[]
  created_at   bigint      not null,
  updated_at   bigint      not null
);

-- -----------------------------------------------------------------------------
-- 2. 词库的语义单元（自定义词库的单元划分）
-- -----------------------------------------------------------------------------
create table if not exists vocab_units (
  id           text primary key,
  book_id      text    not null references vocab_books(id) on delete cascade,
  order_index  integer not null default 0,
  name         text    not null,
  word_count   integer not null default 0,
  created_at   bigint  not null,
  updated_at   bigint  not null
);
create index if not exists vocab_units_book_idx on vocab_units (book_id, order_index);

-- -----------------------------------------------------------------------------
-- 3. 单词掌握记录 —— 错词本（is_error）/ 生词本（is_starred）/ 掌握度
--    主键与本地一致：一个单词一条记录，跨词库共用。
-- -----------------------------------------------------------------------------
create table if not exists word_records (
  word_id                    text primary key,
  book_id                    text    not null default '',
  word_name                  text,
  word_item                  jsonb,                        -- WordItem，便于错词本离线直接渲染
  is_mastered                boolean not null default false,
  is_starred                 boolean not null default false,
  is_error                   boolean not null default false,
  total_practice_count       integer not null default 0,
  dictation_error_count      integer not null default 0,
  consecutive_correct_count  integer not null default 0,
  last_practiced_at          bigint  not null default 0
);
create index if not exists word_records_error_idx  on word_records (is_error)  where is_error;
create index if not exists word_records_star_idx   on word_records (is_starred) where is_starred;
create index if not exists word_records_book_idx   on word_records (book_id);

-- -----------------------------------------------------------------------------
-- 4. 单元学习进度（每个单元 × 每种模式一条）
-- -----------------------------------------------------------------------------
create table if not exists unit_progress (
  unit_id             text not null,
  mode                text not null check (mode in ('learn', 'dictation', 'phonetic')),
  book_id             text not null,
  status              text not null default 'not_started'
                        check (status in ('not_started', 'in_progress', 'completed')),
  current_word_index  integer not null default 0,
  completed_word_ids  jsonb   not null default '[]'::jsonb,
  retry_word_ids      jsonb   not null default '[]'::jsonb,
  is_retrying         boolean not null default false,
  started_at          bigint,
  last_studied_at     bigint,
  completed_at        bigint,
  primary key (unit_id, mode)
);
create index if not exists unit_progress_book_idx on unit_progress (book_id);

-- -----------------------------------------------------------------------------
-- 5. 用户对单词的手工修改（音节拆分 / 构词法 / 音标 / 释义 / 例句 / 短语）
-- -----------------------------------------------------------------------------
create table if not exists word_overrides (
  word_id         text primary key,
  name            text   not null,
  phonetic_us     text,
  phonetic_uk     text,
  pos_list        jsonb,
  syllables       jsonb,                                   -- string[]
  etymology       jsonb,                                   -- WordEtymology
  silent_indices  jsonb,                                   -- number[]
  examples        jsonb,                                   -- WordExample[]
  phrases         jsonb,                                   -- { en, cn }[]
  updated_at      bigint not null
);

-- -----------------------------------------------------------------------------
-- 6. 翻译模块：自定义句库（内置预置题库不入库）
-- -----------------------------------------------------------------------------
create table if not exists translate_books (
  id               text primary key,
  name             text    not null,
  description      text,
  category         text,
  scenario         text,
  total_sentences  integer not null default 0,
  sentences        jsonb   not null default '[]'::jsonb,   -- TranslationSentenceItem[]
  created_at       bigint  not null,
  updated_at       bigint  not null
);

-- -----------------------------------------------------------------------------
-- 7. 阅读模块：用户上传的文章（纯文本，英文 | 译文）
-- -----------------------------------------------------------------------------
create table if not exists reading_articles (
  id          text primary key,
  title       text   not null,
  paragraphs  jsonb  not null default '[]'::jsonb,         -- ReadingSentence[][]
  is_custom   boolean not null default true,
  created_at  bigint not null,
  updated_at  bigint not null
);

-- -----------------------------------------------------------------------------
-- 7.1 外部工具收词收件箱
--     外部翻译小工具直接 insert 一行（word 必填，word_item 可留空由本应用补全），
--     本应用在云模式下轮询 pulled_at is null 的记录并收进生词本 / 「翻译工具收藏」词库。
--     未配置数据库时不收词，本表也不参与任何本地逻辑。
-- -----------------------------------------------------------------------------
create table if not exists collected_words (
  id          bigserial primary key,
  word        text   not null,
  meaning     text,
  source      text,
  word_item   jsonb,
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  pulled_at   bigint
);
create index if not exists collected_words_pending_idx on collected_words (id) where pulled_at is null;

-- -----------------------------------------------------------------------------
-- 8. 学习位置与累计进度（单行表，原来存在 localStorage 的进度类字段）
--    注意：这里只放"进度"，不放设置（皮肤/音量/快捷键/AI Key 永不入库）。
-- -----------------------------------------------------------------------------
create table if not exists app_state (
  id                integer primary key default 1 check (id = 1),
  current_book_id   text,
  current_unit_index integer not null default 0,
  book_mode_progress jsonb  not null default '{}'::jsonb,  -- 各模式的书内进度快照
  loop_counts       jsonb   not null default '{}'::jsonb,  -- 循环遍数统计
  learned_root_ids  jsonb   not null default '[]'::jsonb,  -- 已学词根
  updated_at        bigint  not null default 0
);
insert into app_state (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 9. 翻译模块的学习位置（单行表）
-- -----------------------------------------------------------------------------
create table if not exists translate_state (
  id                       integer primary key default 1 check (id = 1),
  current_book_id          text,
  completed_sentence_ids   jsonb  not null default '{}'::jsonb,
  updated_at               bigint not null default 0
);
insert into translate_state (id) values (1) on conflict (id) do nothing;

-- =============================================================================
-- 权限：没有账号体系，anon 角色需要能读写以上所有表。
-- 安全边界 = "谁知道配置串谁就能访问"，因此项目必须私有、key 不得外泄。
-- 如果以后要支持多人共用一个项目，再加 owner_key 列 + 按列的 RLS 策略。
-- =============================================================================
alter table vocab_books      enable row level security;
alter table vocab_units      enable row level security;
alter table word_records     enable row level security;
alter table unit_progress    enable row level security;
alter table word_overrides   enable row level security;
alter table translate_books  enable row level security;
alter table reading_articles enable row level security;
alter table collected_words    enable row level security;
alter table app_state        enable row level security;
alter table translate_state  enable row level security;

drop policy if exists anon_all on vocab_books;
create policy anon_all on vocab_books      for all to anon using (true) with check (true);

drop policy if exists anon_all on vocab_units;
create policy anon_all on vocab_units      for all to anon using (true) with check (true);

drop policy if exists anon_all on word_records;
create policy anon_all on word_records     for all to anon using (true) with check (true);

drop policy if exists anon_all on unit_progress;
create policy anon_all on unit_progress    for all to anon using (true) with check (true);

drop policy if exists anon_all on word_overrides;
create policy anon_all on word_overrides   for all to anon using (true) with check (true);

drop policy if exists anon_all on translate_books;
create policy anon_all on translate_books  for all to anon using (true) with check (true);

drop policy if exists anon_all on reading_articles;
create policy anon_all on reading_articles for all to anon using (true) with check (true);

drop policy if exists anon_all on collected_words;
create policy anon_all on collected_words  for all to anon using (true) with check (true);

drop policy if exists anon_all on app_state;
create policy anon_all on app_state        for all to anon using (true) with check (true);

drop policy if exists anon_all on translate_state;
create policy anon_all on translate_state  for all to anon using (true) with check (true);

-- Supabase 默认会给新表授予 anon 权限，这里显式再授一次，避免在自建 Postgres 上漏权限。
grant usage on schema public to anon;
grant select, insert, update, delete on
  vocab_books, vocab_units, word_records, unit_progress, word_overrides,
  translate_books, reading_articles, collected_words, app_state, translate_state
to anon;
