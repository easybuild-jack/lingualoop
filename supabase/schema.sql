-- =============================================================================
-- LinguaLoop 云端数据表（Supabase / Postgres）  schema_version = 2
--
-- 使用方式：Supabase 控制台 → SQL Editor → 粘贴本文件全部内容 → Run。可重复执行。
-- 只存"用户自己的数据"，内置官方词库、离线词库缓存（aiWordCache）与所有设置项
-- 都不入库：它们要么可从 /dicts/*.json 重建，要么必须留在本机。
--
-- 约定：
--   1. 业务时间戳统一 bigint（epoch 毫秒），与前端 TS 类型一一对应，由客户端写入；
--      另有 server_updated_at 由触发器在服务端维护，供外部工具按它增量拉取。
--   2. 账号：配置了数据库就需要登录（Supabase Auth），账号字段统一叫 account_id，
--      类型 uuid，对应登录账号的用户 id（JWT 的 sub）。
--      - 学习记录 / 进度表：account_id 不允许为空，进度完全属于当前登录账号；
--        客户端写入时可以不传 account_id，默认取当前登录账号。
--      - 自定义内容表（词库 / 句库 / 文章 / 视频 / 收件箱）：account_id 可以为空。
--        NULL = 共享，所有账号可见、可改、可删；非空 = 个人，只有该账号可见。
--      - 查询规则：内容表  where account_id is null or account_id = 当前账号
--                  进度表  where account_id = 当前账号
--   3. 官方词库（/dicts/*.json）与官方翻译题库不入库；它们的学习进度入库，
--      通过 book_id + unit_id + word_id（均为字符串标识）关联本地 JSON。
--   4. 单行状态表（app_state / translate_state）不预插入：没有行 = 该账号云端还没有数据。
--   5. 单词/句子/段落这类数组用 jsonb 整存，一个词库一行。
--   6. 已执行过旧版（v1，无账号）脚本的库，直接再执行本文件即可升级：
--      旧表会被改名为 legacy_v1_*（数据保留不删），自定义内容按"共享"导入，
--      旧的单人进度导入到第一个账号（见文件末尾"从 v1 导入"一节）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. 公共函数
-- -----------------------------------------------------------------------------
create or replace function public.now_ms() returns bigint
language sql volatile as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

-- 当前登录账号：PostgREST 会把 JWT 放进 request.jwt.claims，sub 即 Supabase Auth 用户 id。
-- 未登录（只带 anon key）或外部工具直连时返回 NULL。
create or replace function public.current_account_id() returns uuid
language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    current_setting('request.jwt.claim.sub', true)
  ), '')::uuid
$$;

create or replace function public.require_account_id() returns uuid
language plpgsql stable as $$
declare
  v uuid := public.current_account_id();
begin
  if v is null then
    raise exception 'not signed in: this operation needs a logged-in account' using errcode = 'P0001';
  end if;
  return v;
end $$;

create or replace function public.tg_touch_server_updated_at() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := public.now_ms();
  return new;
end $$;

-- 个人内容只属于它的账号：另一个已登录账号按同一个 id 改写或删除它时报错，
-- 防止固定 id（如收藏词库）或盲目 upsert 把别人的个人内容覆盖掉。
-- 共享内容（account_id 为 NULL）不受限制，任何已登录账号都可以改、可以删。
create or replace function public.tg_personal_content_guard() returns trigger
language plpgsql as $$
declare
  v_me uuid := public.current_account_id();
begin
  if old.account_id is not null and v_me is not null and old.account_id <> v_me then
    raise exception '% % belongs to another account', tg_table_name, old.id using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- 进度不能被改挂到另一个账号
create or replace function public.tg_progress_account_guard() returns trigger
language plpgsql as $$
begin
  if new.account_id <> old.account_id then
    raise exception '% row belongs to account %, refusing to move it', tg_table_name, old.account_id
      using errcode = '23514';
  end if;
  return new;
end $$;

-- 较旧的写入（updated_at 更小）直接忽略，普通 upsert 即可获得"新者胜"语义
create or replace function public.tg_newer_wins() returns trigger
language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 0.1 从 v1 升级：检测到旧版无账号的表时，先把它们连同索引、序列改名为 legacy_v1_*
-- -----------------------------------------------------------------------------
do $$
declare
  t   text;
  idx record;
begin
  if to_regclass('public.app_state') is null
     or exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'app_state' and column_name = 'account_id') then
    return;
  end if;

  foreach t in array array[
    'vocab_units', 'vocab_books', 'word_records', 'unit_progress', 'word_overrides',
    'translate_books', 'reading_articles', 'collected_words', 'app_state', 'translate_state'
  ] loop
    if to_regclass('public.' || t) is not null and to_regclass('public.legacy_v1_' || t) is null then
      for idx in
        select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
        where i.indrelid = ('public.' || t)::regclass
      loop
        execute format('alter index public.%I rename to %I', idx.relname, 'legacy_v1_' || idx.relname);
      end loop;
      execute format('alter table public.%I rename to %I', t, 'legacy_v1_' || t);
    end if;
  end loop;

  if to_regclass('public.collected_words_id_seq') is not null then
    alter sequence public.collected_words_id_seq rename to legacy_v1_collected_words_id_seq;
  end if;
end $$;

-- schema 版本：客户端体检时可读取，判断库是否已升级到期望版本
create table if not exists schema_meta (
  key    text primary key,
  value  text not null
);
insert into schema_meta (key, value) values ('schema_version', '2')
  on conflict (key) do update set value = excluded.value;

-- =============================================================================
-- 一、自定义内容表（account_id 可为空：NULL = 共享，非空 = 个人）
--    主键仍是客户端生成的全局 id（book_custom_<时间戳> 等），account_id 只决定谁能看见。
--    进度表里的 book_id 因此始终指向唯一的一本书。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 自定义词库（只存自定义词库；官方词库永不入库）
-- -----------------------------------------------------------------------------
create table if not exists vocab_books (
  id                 text    primary key check (id <> ''),
  account_id         uuid,                                      -- NULL = 共享；非空 = 个人
  name               text    not null,
  description        text    not null default '',
  category           text    not null default 'custom',
  is_custom          boolean not null default true check (is_custom),
  unit_size          integer not null default 20 check (unit_size between 1 and 1000),
  total_words        integer not null default 0,                -- 由触发器按 words 长度维护
  words              jsonb   not null default '[]'::jsonb check (jsonb_typeof(words) = 'array'),  -- WordItem[]
  created_at         bigint  not null default public.now_ms(),
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms()
);
create index if not exists vocab_books_account_idx on vocab_books (account_id);

create or replace function public.tg_vocab_books_derive() returns trigger
language plpgsql as $$
begin
  if jsonb_typeof(new.words) = 'array' then
    new.total_words := jsonb_array_length(new.words);
  end if;
  return new;
end $$;

drop trigger if exists vocab_books_derive on vocab_books;
create trigger vocab_books_derive before insert or update on vocab_books
  for each row execute function public.tg_vocab_books_derive();

-- -----------------------------------------------------------------------------
-- 2. 词库的语义单元（v1 遗留，代码从未读写；是否删除待作者确认，暂按 v1 原样保留）
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
-- 3. 翻译模块：自定义句库（内置预置题库不入库）
-- -----------------------------------------------------------------------------
create table if not exists translate_books (
  id                 text    primary key check (id <> ''),
  account_id         uuid,
  name               text    not null,
  description        text,
  category           text,
  scenario           text,
  total_sentences    integer not null default 0,              -- 由触发器按 sentences 长度维护
  sentences          jsonb   not null default '[]'::jsonb check (jsonb_typeof(sentences) = 'array'),  -- TranslationSentenceItem[]
  created_at         bigint  not null default public.now_ms(),
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms()
);
create index if not exists translate_books_account_idx on translate_books (account_id);

create or replace function public.tg_translate_books_derive() returns trigger
language plpgsql as $$
begin
  if jsonb_typeof(new.sentences) = 'array' then
    new.total_sentences := jsonb_array_length(new.sentences);
  end if;
  return new;
end $$;

drop trigger if exists translate_books_derive on translate_books;
create trigger translate_books_derive before insert or update on translate_books
  for each row execute function public.tg_translate_books_derive();

-- -----------------------------------------------------------------------------
-- 4. 阅读模块：用户上传的文章（纯文本，英文 | 译文）
-- -----------------------------------------------------------------------------
create table if not exists reading_articles (
  id                 text    primary key check (id <> ''),
  account_id         uuid,
  title              text    not null,
  paragraphs         jsonb   not null default '[]'::jsonb check (jsonb_typeof(paragraphs) = 'array'),  -- ReadingSentence[][]
  is_custom          boolean not null default true,
  created_at         bigint  not null default public.now_ms(),
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms()
);
create index if not exists reading_articles_account_idx on reading_articles (account_id);

-- -----------------------------------------------------------------------------
-- 5. 影音模块：用户上传的视频 / 音频（只存元数据；文件本体放对象存储，src 存其地址）
-- -----------------------------------------------------------------------------
create table if not exists radio_items (
  id                 text    primary key check (id <> ''),
  account_id         uuid,
  category           text    not null check (category in ('phrases', 'dialogue', 'radio')),
  title              text    not null check (btrim(title) <> ''),
  media_type         text    not null default 'video' check (media_type in ('video', 'audio')),
  src                text    not null,
  poster             text,
  duration           integer not null default 0 check (duration >= 0),   -- 秒
  scenario           text    not null default '',
  description        text,
  transcript         text,
  translation        text,
  created_at         bigint  not null default public.now_ms(),
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms()
);
create index if not exists radio_items_account_idx on radio_items (account_id);

-- -----------------------------------------------------------------------------
-- 6. 外部工具收词收件箱
--    外部工具只需 insert (word[, meaning, source, word_item, account_id])，其余列都有默认值。
--    account_id 为 NULL：任意已登录账号都可以认领；非空：只有该账号会认领。
--    应用通过 claim / complete / fail 三个函数消费，带认领超时、重试计数与终态，避免队头阻塞。
--    兼容旧写法：直接写 pulled_at 时，触发器会把 status 置为 done。
-- -----------------------------------------------------------------------------
create table if not exists collected_words (
  id                 bigint generated by default as identity primary key,
  account_id         uuid,
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

-- 共享内容默认允许重名（现有导入流程的默认名都相同）。如果要禁止重名，执行下面两句：
-- NULLS NOT DISTINCT 让 NULL 也参与比较，于是"共享内容之间不重名、同一账号的个人内容之间不重名"
-- 由一条约束同时保证；普通 UNIQUE 会把多个 NULL 视为互不相同，共享内容就拦不住重名。
-- alter table vocab_books     add constraint vocab_books_account_name_key     unique nulls not distinct (account_id, name);
-- alter table translate_books add constraint translate_books_account_name_key unique nulls not distinct (account_id, name);

-- =============================================================================
-- 二、学习记录 / 进度表（account_id 不允许为空，默认取当前登录账号）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7. 单词掌握记录 —— 错词本（is_error）/ 生词本（is_starred）/ 掌握度
--    同一账号下一个单词一条，跨词库共用；word_id = buildWordId(拼写)。
-- -----------------------------------------------------------------------------
create table if not exists word_records (
  account_id                 uuid    not null default public.current_account_id(),
  word_id                    text    not null check (word_id <> ''),
  book_id                    text    not null default '',     -- 首次记录时所在词库，仅作来源参考
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
  server_updated_at          bigint  not null default public.now_ms(),
  primary key (account_id, word_id)
);
create index if not exists word_records_starred_idx on word_records (account_id, word_id) where is_starred;
create index if not exists word_records_trouble_idx on word_records (account_id, last_practiced_at desc) where is_error or is_starred;

-- -----------------------------------------------------------------------------
-- 8. 单元学习进度（官方词库与自定义词库共用）
--    官方词库：unit_id 来自 /dicts/*.units.json（如 cet4_time_numbers），无目录时为 `${book_id}_unit_${index}`；
--    自定义词库：unit_id = `${book_id}_unit_${index}`。
--    completed_word_ids / retry_word_ids 存 word_id，与本地 JSON 按拼写派生的 id 对齐。
-- -----------------------------------------------------------------------------
create table if not exists unit_progress (
  account_id          uuid    not null default public.current_account_id(),
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
  primary key (account_id, book_id, unit_id, mode),
  -- unit_id 全局唯一（官方语义单元 id 已核对无重复；切片单元 id 自带 book_id 前缀），
  -- 所以同一账号下按 (unit_id, mode) 也唯一，现有代码的 upsert 只需在 onConflict 前加上 account_id。
  constraint unit_progress_account_unit_mode_key unique (account_id, unit_id, mode)
);

-- 同一条进度不允许被改挂到另一本书或另一个账号下（防止"显示 A 书、写进 B 书"的静默串写）
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

-- -----------------------------------------------------------------------------
-- 9. 每本书在每种模式下"上次学到第几单元"（原 app_state.book_mode_progress 拆出）
--    一行一个 (account_id, book_id, mode)，多设备、多账号互不覆盖；较旧的写入自动忽略。
-- -----------------------------------------------------------------------------
create table if not exists book_progress (
  account_id         uuid    not null default public.current_account_id(),
  book_id            text    not null check (book_id <> ''),
  mode               text    not null check (mode in ('learn', 'dictation', 'phonetic')),
  book_kind          text    generated always as (
                       case when book_id like 'book\_custom\_%' then 'custom' else 'official' end
                     ) stored,
  unit_index         integer not null default 0 check (unit_index >= 0),
  unit_id            text,                                     -- 可选：同时记单元 id，官方目录调整顺序后仍可定位
  updated_at         bigint  not null default public.now_ms(),
  server_updated_at  bigint  not null default public.now_ms(),
  primary key (account_id, book_id, mode)
);

drop trigger if exists book_progress_newer_wins on book_progress;
create trigger book_progress_newer_wins before update on book_progress
  for each row execute function public.tg_newer_wins();

-- -----------------------------------------------------------------------------
-- 10. 用户对单词的手工修改（音节拆分 / 构词法 / 音标 / 释义 / 例句 / 短语），按账号各自保存
-- -----------------------------------------------------------------------------
create table if not exists word_overrides (
  account_id         uuid   not null default public.current_account_id(),
  word_id            text   not null check (word_id <> ''),
  name               text   not null,
  phonetic_us        text,
  phonetic_uk        text,
  pos_list           jsonb  check (pos_list is null or jsonb_typeof(pos_list) = 'array'),
  syllables          jsonb  check (syllables is null or jsonb_typeof(syllables) = 'array'),             -- string[]
  etymology          jsonb,                                                                            -- WordEtymology
  silent_indices     jsonb  check (silent_indices is null or jsonb_typeof(silent_indices) = 'array'),   -- number[]
  examples           jsonb  check (examples is null or jsonb_typeof(examples) = 'array'),               -- WordExample[]
  phrases            jsonb  check (phrases is null or jsonb_typeof(phrases) = 'array'),                 -- { en, cn }[]
  updated_at         bigint not null default public.now_ms(),
  server_updated_at  bigint not null default public.now_ms(),
  primary key (account_id, word_id)
);

-- -----------------------------------------------------------------------------
-- 11. 学习位置与累计进度（每个账号一行，不预插入）
--     注意：这里只放"进度"，不放设置（皮肤/音量/快捷键/AI Key 永不入库）。
--     书内单元位置已拆到 book_progress。
-- -----------------------------------------------------------------------------
create table if not exists app_state (
  account_id          uuid    primary key default public.current_account_id(),
  current_book_id     text,
  current_unit_index  integer not null default 0 check (current_unit_index >= 0),
  loop_counts         jsonb   not null default '{}'::jsonb check (jsonb_typeof(loop_counts) = 'object'),     -- 循环遍数（是否入库待确认）
  learned_root_ids    jsonb   not null default '[]'::jsonb check (jsonb_typeof(learned_root_ids) = 'array'), -- 已学词根
  updated_at          bigint  not null default public.now_ms(),
  server_updated_at   bigint  not null default public.now_ms()
);

-- -----------------------------------------------------------------------------
-- 12. 翻译模块的学习位置（每个账号一行，不预插入）
--     completed_sentence_ids 只增不减，建议通过 merge_translate_state() 取并集写入。
-- -----------------------------------------------------------------------------
create table if not exists translate_state (
  account_id              uuid   primary key default public.current_account_id(),
  current_book_id         text,
  completed_sentence_ids  jsonb  not null default '{}'::jsonb check (jsonb_typeof(completed_sentence_ids) = 'object'),
  updated_at              bigint not null default public.now_ms(),
  server_updated_at       bigint not null default public.now_ms()
);

-- -----------------------------------------------------------------------------
-- 13. 通用触发器与索引挂载
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- server_updated_at：每张业务表都由服务端维护，并建索引供外部工具按它分页增量拉取
  foreach t in array array[
    'vocab_books', 'translate_books', 'reading_articles', 'radio_items', 'collected_words',
    'word_records', 'unit_progress', 'book_progress', 'word_overrides', 'app_state', 'translate_state'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before insert or update on %I for each row execute function public.tg_touch_server_updated_at()', t || '_touch', t);
    execute format('create index if not exists %I on %I (server_updated_at)', t || '_server_updated_idx', t);
  end loop;

  foreach t in array array['vocab_books', 'translate_books', 'reading_articles', 'radio_items', 'collected_words'] loop
    execute format('drop trigger if exists %I on %I', t || '_personal_guard', t);
    execute format('create trigger %I before update or delete on %I for each row execute function public.tg_personal_content_guard()', t || '_personal_guard', t);
  end loop;

  foreach t in array array['word_records', 'unit_progress', 'book_progress', 'word_overrides', 'app_state', 'translate_state'] loop
    execute format('drop trigger if exists %I on %I', t || '_account_guard', t);
    execute format('create trigger %I before update on %I for each row execute function public.tg_progress_account_guard()', t || '_account_guard', t);
  end loop;
end $$;

-- 删除自定义词库时，在库内级联清理它在所有账号下的单元进度与书内位置
-- （进度表同时承载官方词库进度，不能对 vocab_books 建外键）
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
-- 三、数据库函数：把"读-改-写"放进一条事务，全部按当前登录账号执行
--     均为 security invoker（默认），权限与直接读写表一致。未登录调用会报错。
-- =============================================================================

-- R1. 记录一次练习结果（与 src/db/index.ts recordWordAttempt 的规则逐条对应）
create or replace function public.record_word_attempt(
  p_word_id    text,
  p_book_id    text,
  p_is_correct boolean,
  p_mode       text,
  p_word_item  jsonb default null
) returns word_records
language plpgsql as $$
declare
  v_acc      uuid    := public.require_account_id();
  v_now      bigint  := public.now_ms();
  v_dict     boolean := p_mode = 'dictation';
  v_dict_err boolean := (not p_is_correct) and p_mode = 'dictation';
  v_row      word_records;
begin
  insert into word_records as r (
    account_id, word_id, book_id, word_name, word_item, is_mastered, is_starred, is_error,
    total_practice_count, dictation_error_count, consecutive_correct_count, last_practiced_at
  ) values (
    v_acc, p_word_id, coalesce(p_book_id, ''), p_word_item ->> 'name', p_word_item,
    p_is_correct and v_dict, false, v_dict_err,
    1, case when v_dict_err then 1 else 0 end,
    case when p_is_correct and v_dict then 1 else 0 end, v_now
  )
  on conflict (account_id, word_id) do update set
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
  v_acc     uuid := public.require_account_id();
  v_starred boolean;
begin
  insert into word_records as r (account_id, word_id, book_id, word_name, word_item, is_starred, last_practiced_at)
  values (v_acc, p_word_id, coalesce(p_book_id, ''), p_word_item ->> 'name', p_word_item, true, public.now_ms())
  on conflict (account_id, word_id) do update set
    is_starred = not r.is_starred,
    word_item = coalesce(p_word_item, r.word_item),
    word_name = coalesce(nullif(p_word_item ->> 'name', ''), r.word_name)
  returning is_starred into v_starred;
  return v_starred;
end $$;

-- R3. 生词本 / 错词本：以单个标量返回，不受 PostgREST Max Rows（默认 1000）截断
create or replace function public.get_starred_word_ids() returns text[]
language sql stable as $$
  select coalesce(array_agg(word_id order by word_id), '{}')
  from word_records
  where account_id = public.require_account_id() and is_starred
$$;

create or replace function public.get_trouble_word_records() returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.last_practiced_at desc), '[]'::jsonb)
  from word_records r
  where r.account_id = public.require_account_id() and (r.is_error or r.is_starred)
$$;

-- 内部工具：按 p_keep 过滤 jsonb 字符串数组，保持原顺序
create or replace function public.jsonb_text_array_filter(p_arr jsonb, p_keep text[]) returns text[]
language sql immutable as $$
  select coalesce(array_agg(x order by ord), '{}')
  from jsonb_array_elements_text(coalesce(p_arr, '[]'::jsonb)) with ordinality as t(x, ord)
  where x = any(p_keep)
$$;

-- 内部工具：确保当前账号下这条单元进度存在并加锁；(unit_id, mode) 已挂在别的书下时报错
create or replace function public.lock_unit_progress(
  p_acc uuid, p_book_id text, p_unit_id text, p_mode text
) returns unit_progress
language plpgsql as $$
declare
  v_now bigint := public.now_ms();
  v_row unit_progress;
begin
  insert into unit_progress (account_id, book_id, unit_id, mode, status, started_at, last_studied_at)
  values (p_acc, p_book_id, p_unit_id, p_mode, 'in_progress', v_now, v_now)
  on conflict do nothing;

  select * into v_row from unit_progress
   where account_id = p_acc and book_id = p_book_id and unit_id = p_unit_id and mode = p_mode
   for update;
  if not found then
    raise exception 'unit % (%) already belongs to another book', p_unit_id, p_mode using errcode = '23514';
  end if;
  return v_row;
end $$;

-- R4. 标记单元内一个词"真正敲完"（对应 markUnitWordCompleted，含按当前单元成员剪除失效词）
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
  v_acc        uuid    := public.require_account_id();
  v_now        bigint  := public.now_ms();
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

  v_old := public.lock_unit_progress(v_acc, p_book_id, p_unit_id, p_mode);

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
  where account_id = v_acc and book_id = p_book_id and unit_id = p_unit_id and mode = p_mode
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
  v_acc uuid := public.require_account_id();
  v_old unit_progress;
  v_row unit_progress;
begin
  v_old := public.lock_unit_progress(v_acc, p_book_id, p_unit_id, p_mode);

  update unit_progress set
    status = 'in_progress',
    current_word_index = greatest(v_old.current_word_index, greatest(p_word_index, 0)),
    completed_word_ids = coalesce((
      select jsonb_agg(x order by ord)
      from jsonb_array_elements_text(v_old.completed_word_ids) with ordinality t(x, ord)
      where x <> p_word_id
    ), '[]'::jsonb),
    retry_word_ids = case
      when v_old.retry_word_ids ? p_word_id then v_old.retry_word_ids
      else v_old.retry_word_ids || jsonb_build_array(p_word_id)
    end,
    completed_at = null,
    last_studied_at = public.now_ms()
  where account_id = v_acc and book_id = p_book_id and unit_id = p_unit_id and mode = p_mode
  returning * into v_row;
  return v_row;
end $$;

-- R6. 把单词并入当前账号可见的自定义词库：同 id 原位覆盖，新词追加（对应 mergeWordsIntoBook）
--     词库不存在或是别人的个人词库时返回 NULL。
create or replace function public.merge_words_into_book(p_book_id text, p_words jsonb)
returns jsonb
language plpgsql as $$
declare
  v_acc     uuid := public.require_account_id();
  v_words   jsonb;
  v_merged  jsonb;
  v_added   integer;
  v_updated integer;
begin
  if jsonb_typeof(p_words) <> 'array' then
    raise exception 'p_words must be a json array' using errcode = '22023';
  end if;

  select words into v_words from vocab_books
   where id = p_book_id and (account_id is null or account_id = v_acc)
   for update;
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
  v_acc uuid := public.require_account_id();
  v_row translate_state;
begin
  insert into translate_state as s (account_id, current_book_id, completed_sentence_ids, updated_at)
  values (v_acc, p_current_book_id, coalesce(p_completed, '{}'::jsonb), coalesce(p_updated_at, public.now_ms()))
  on conflict (account_id) do update set
    current_book_id = coalesce(excluded.current_book_id, s.current_book_id),
    completed_sentence_ids = s.completed_sentence_ids || excluded.completed_sentence_ids,
    updated_at = greatest(s.updated_at, excluded.updated_at)
  returning * into v_row;
  return v_row;
end $$;

-- R8. 收件箱：认领 / 完成 / 失败（只处理共享条目和当前账号的条目）
create or replace function public.claim_collected_words(
  p_limit    integer default 20,
  p_claimer  text    default null,
  p_lease_ms bigint  default 300000
) returns setof collected_words
language plpgsql as $$
declare
  v_acc uuid   := public.require_account_id();
  v_now bigint := public.now_ms();
begin
  return query
  update collected_words c set
    status = 'processing',
    claimed_at = v_now,
    claimed_by = coalesce(p_claimer, v_acc::text),
    attempts = c.attempts + 1
  where c.id in (
    select id from collected_words
    where (account_id is null or account_id = v_acc)
      and (status = 'pending' or (status = 'processing' and claimed_at < v_now - p_lease_ms))
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
       and (account_id is null or account_id = public.require_account_id())
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
  v_acc uuid := public.require_account_id();
  v_row collected_words;
begin
  update collected_words set
    status = case when p_retryable and attempts < p_max_attempts then 'pending' else 'failed' end,
    last_error = left(p_error, 500),
    claimed_at = null,
    claimed_by = null
  where id = p_id and (account_id is null or account_id = v_acc)
  returning * into v_row;
  return v_row;
end $$;

-- =============================================================================
-- 四、从 v1 导入（只在 0.1 节把旧表改名为 legacy_v1_* 之后才会执行；各部分只导入一次）
--     - 自定义词库 / 句库 / 文章 / 收件箱 / vocab_units：按"共享"（account_id = NULL）导入；
--     - 学习记录 / 进度：导入到"第一个账号"。账号来源优先级：
--         1) 执行前设置：select set_config('lingualoop.legacy_account_id', '<uuid>', false);
--         2) Supabase Auth 中最早注册的用户（auth.users）。
--       两者都没有时跳过进度导入并给出提示；注册第一个账号后再执行一次本文件即可。
--     旧表保留不删，确认无误后可手动 drop table legacy_v1_* 。
-- =============================================================================
do $$
declare
  v_acc uuid;
begin
  if to_regclass('public.legacy_v1_app_state') is null then
    return;
  end if;

  if not exists (select 1 from schema_meta where key = 'legacy_v1_content_imported') then
    if to_regclass('public.legacy_v1_vocab_books') is not null then
      execute $q$
        insert into vocab_books (id, account_id, name, description, category, is_custom, unit_size, words, created_at, updated_at)
        select id, null, name, coalesce(description, ''), coalesce(category, 'custom'), true,
               least(greatest(coalesce(unit_size, 20), 1), 1000),
               case when jsonb_typeof(words) = 'array' then words else '[]'::jsonb end,
               created_at, updated_at
        from legacy_v1_vocab_books where coalesce(is_custom, true) and id <> ''
        on conflict (id) do nothing $q$;
    end if;
    if to_regclass('public.legacy_v1_vocab_units') is not null then
      execute $q$
        insert into vocab_units select u.* from legacy_v1_vocab_units u
        where exists (select 1 from vocab_books b where b.id = u.book_id)
        on conflict (id) do nothing $q$;
    end if;
    if to_regclass('public.legacy_v1_translate_books') is not null then
      execute $q$
        insert into translate_books (id, account_id, name, description, category, scenario, sentences, created_at, updated_at)
        select id, null, name, description, category, scenario,
               case when jsonb_typeof(sentences) = 'array' then sentences else '[]'::jsonb end,
               created_at, updated_at
        from legacy_v1_translate_books where id <> ''
        on conflict (id) do nothing $q$;
    end if;
    if to_regclass('public.legacy_v1_reading_articles') is not null then
      execute $q$
        insert into reading_articles (id, account_id, title, paragraphs, is_custom, created_at, updated_at)
        select id, null, title,
               case when jsonb_typeof(paragraphs) = 'array' then paragraphs else '[]'::jsonb end,
               is_custom, created_at, updated_at
        from legacy_v1_reading_articles where id <> ''
        on conflict (id) do nothing $q$;
    end if;
    if to_regclass('public.legacy_v1_collected_words') is not null then
      execute $q$
        insert into collected_words (id, account_id, word, meaning, source, word_item, created_at, status, pulled_at)
        select id, null, word, meaning, source,
               case when jsonb_typeof(word_item) = 'object' then word_item end,
               created_at, case when pulled_at is null then 'pending' else 'done' end, pulled_at
        from legacy_v1_collected_words where btrim(coalesce(word, '')) <> ''
        on conflict (id) do nothing $q$;
      perform setval(pg_get_serial_sequence('public.collected_words', 'id'),
                     greatest((select coalesce(max(id), 0) from collected_words), 1));
    end if;
    insert into schema_meta (key, value) values ('legacy_v1_content_imported', public.now_ms()::text);
  end if;

  if exists (select 1 from schema_meta where key = 'legacy_v1_progress_imported') then
    return;
  end if;

  v_acc := nullif(current_setting('lingualoop.legacy_account_id', true), '')::uuid;
  if v_acc is null and to_regclass('auth.users') is not null then
    execute 'select id from auth.users order by created_at limit 1' into v_acc;
  end if;
  if v_acc is null then
    raise notice 'v1 进度尚未导入：还没有可用的账号。请先注册第一个账号（或 set_config lingualoop.legacy_account_id），再执行一次本文件。';
    return;
  end if;

  execute format($q$
    insert into word_records (account_id, word_id, book_id, word_name, word_item, is_mastered, is_starred, is_error,
                              total_practice_count, dictation_error_count, consecutive_correct_count, last_practiced_at)
    select %1$L::uuid, word_id, coalesce(book_id, ''), word_name,
           case when jsonb_typeof(word_item) = 'object' then word_item end,
           is_mastered, is_starred, is_error,
           greatest(total_practice_count, 0), greatest(dictation_error_count, 0), greatest(consecutive_correct_count, 0),
           last_practiced_at
    from legacy_v1_word_records where word_id <> ''
    on conflict do nothing $q$, v_acc);

  execute format($q$
    insert into unit_progress (account_id, book_id, unit_id, mode, status, current_word_index, completed_word_ids,
                               retry_word_ids, is_retrying, started_at, last_studied_at, completed_at)
    select %1$L::uuid, book_id, unit_id, mode, status, greatest(current_word_index, 0),
           case when jsonb_typeof(completed_word_ids) = 'array' then completed_word_ids else '[]'::jsonb end,
           case when jsonb_typeof(retry_word_ids) = 'array' then retry_word_ids else '[]'::jsonb end,
           is_retrying, started_at, last_studied_at, completed_at
    from legacy_v1_unit_progress where book_id <> '' and unit_id <> ''
    on conflict do nothing $q$, v_acc);

  execute format($q$
    insert into word_overrides (account_id, word_id, name, phonetic_us, phonetic_uk, pos_list, syllables, etymology,
                                silent_indices, examples, phrases, updated_at)
    select %1$L::uuid, word_id, name, phonetic_us, phonetic_uk,
           case when jsonb_typeof(pos_list) = 'array' then pos_list end,
           case when jsonb_typeof(syllables) = 'array' then syllables end,
           etymology,
           case when jsonb_typeof(silent_indices) = 'array' then silent_indices end,
           case when jsonb_typeof(examples) = 'array' then examples end,
           case when jsonb_typeof(phrases) = 'array' then phrases end,
           updated_at
    from legacy_v1_word_overrides where word_id <> ''
    on conflict do nothing $q$, v_acc);

  -- 预插入的空种子行（updated_at = 0）不导入
  execute format($q$
    insert into app_state (account_id, current_book_id, current_unit_index, loop_counts, learned_root_ids, updated_at)
    select %1$L::uuid, current_book_id, greatest(current_unit_index, 0),
           case when jsonb_typeof(loop_counts) = 'object' then loop_counts else '{}'::jsonb end,
           case when jsonb_typeof(learned_root_ids) = 'array' then learned_root_ids else '[]'::jsonb end,
           updated_at
    from legacy_v1_app_state where updated_at > 0
    on conflict do nothing $q$, v_acc);

  execute format($q$
    insert into book_progress (account_id, book_id, mode, unit_index, updated_at)
    select %1$L::uuid, b.key, m.key, m.value::integer, a.updated_at
    from legacy_v1_app_state a
    cross join lateral jsonb_each(case when jsonb_typeof(a.book_mode_progress) = 'object' then a.book_mode_progress else '{}'::jsonb end) b
    cross join lateral jsonb_each_text(case when jsonb_typeof(b.value) = 'object' then b.value else '{}'::jsonb end) m
    where a.updated_at > 0 and b.key <> '' and m.key in ('learn', 'dictation', 'phonetic') and m.value ~ '^\d+$'
    on conflict do nothing $q$, v_acc);

  if to_regclass('public.legacy_v1_translate_state') is not null then
    execute format($q$
      insert into translate_state (account_id, current_book_id, completed_sentence_ids, updated_at)
      select %1$L::uuid, current_book_id,
             case when jsonb_typeof(completed_sentence_ids) = 'object' then completed_sentence_ids else '{}'::jsonb end,
             updated_at
      from legacy_v1_translate_state where updated_at > 0
      on conflict do nothing $q$, v_acc);
  end if;

  insert into schema_meta (key, value) values ('legacy_v1_progress_imported', v_acc::text);
end $$;

-- =============================================================================
-- 权限：沿用 v1 的模型（本次不调整安全策略），只是把已登录请求使用的 authenticated
-- 角色也加进来——登录后 PostgREST 以 authenticated 身份访问，只授予 anon 会读不到任何数据。
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'vocab_books', 'vocab_units', 'translate_books', 'reading_articles', 'radio_items', 'collected_words',
    'word_records', 'unit_progress', 'book_progress', 'word_overrides', 'app_state', 'translate_state'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_all on %I', t);
    execute format('drop policy if exists app_all on %I', t);
    execute format('create policy app_all on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;

alter table schema_meta enable row level security;
drop policy if exists app_read on schema_meta;
create policy app_read on schema_meta for select to anon, authenticated using (true);
grant select on schema_meta to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on function
  public.now_ms(),
  public.current_account_id(),
  public.require_account_id(),
  public.record_word_attempt(text, text, boolean, text, jsonb),
  public.toggle_star_word(text, text, jsonb),
  public.get_starred_word_ids(),
  public.get_trouble_word_records(),
  public.jsonb_text_array_filter(jsonb, text[]),
  public.lock_unit_progress(uuid, text, text, text),
  public.mark_unit_word_completed(text, text, text, text, integer, text[], boolean),
  public.mark_unit_word_for_retry(text, text, text, text, integer),
  public.merge_words_into_book(text, jsonb),
  public.merge_translate_state(text, jsonb, bigint),
  public.claim_collected_words(integer, text, bigint),
  public.complete_collected_words(bigint[]),
  public.fail_collected_word(bigint, text, boolean, integer)
to anon, authenticated;

-- 让 PostgREST 立即识别新表与新函数
notify pgrst, 'reload schema';
