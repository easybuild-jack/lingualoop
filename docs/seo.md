# SEO 说明

面向百度与 Google，规范域名 `https://www.lingualoop.com.cn`。`https://lingualoop.com.cn` 已在服务端 308 跳转到 www，保持即可；canonical、sitemap、OG 只写 www 域名。

## 品牌约定

| 用途 | 写法 |
| --- | --- |
| 英文品牌 | LinguaLoop |
| 正式中文名（唯一） | 林瓜鲁普 |
| 标题中的品牌 | `林瓜鲁普 LinguaLoop` |
| 检索别名 | 灵瓜鲁普、林瓜路普、林瓜卢普、Lingua Loop |

- 别名只出现在 `keywords` 和 JSON-LD 的 `alternateName`，不进标题、描述和页面正文。
- 页面里需要中文名时只用「林瓜鲁普」，首次出现写作「林瓜鲁普（LinguaLoop）」。
- 关键词保持精简，不要堆砌。

## 标题清单

首页使用完整标题，不套模板；其余页面套用模板 `{页面名} | 林瓜鲁普 LinguaLoop`。

| 路由 | 页面名 / 标题 | 收录 |
| --- | --- | --- |
| `/` | 林瓜鲁普 LinguaLoop — 您的私人专属英语学习搭子 | 是 |
| `/phonetics/learn` | 音标学习 | 是 |
| `/phonetics` | 音标与发音 | 是 |
| `/books` | 英语词库 | 是 |
| `/learn` | 单词学习 | 是 |
| `/dictation` | 默写练习 | 是 |
| `/roots` | 词根词缀 | 是 |
| `/grammar` | 英语语法 | 是 |
| `/dictionary` | 英语词典 | 是 |
| `/reading` | 双语阅读 | 是 |
| `/radio` | 听力广场 | 是 |
| `/translate` | 句子翻译 | 是 |
| `/login` | 登录 | 否（noindex） |
| `/errors` | 生错词本 | 否（noindex） |

AI 口语陪练是全局悬浮窗，没有独立路由，因此不单独建页面。各页描述见 `src/lib/seo.ts` 的 `SEO_ROUTES`。

## 技术要点

- **集中配置**：`src/lib/seo.ts` 定义域名、品牌、首页标题/描述、关键词、各路由元数据、sitemap 条目和 JSON-LD。新增页面时在 `SEO_ROUTES` 里加一项，并在该路由加 `layout.tsx` 调用 `buildPageMetadata('/路由')`。
- **域名**：`NEXT_PUBLIC_SITE_URL` 覆盖规范域名，默认 `https://www.lingualoop.com.cn`。这是构建期变量，修改后需重新构建。
- **根 layout**（`src/app/layout.tsx`）：`metadataBase`、`title.default` + `title.template`、`description`、`keywords`、`canonical`、Open Graph（`zh_CN`）、Twitter `summary`、`robots`，保留原有 PWA manifest 与图标。
- **模块页**：学习模块多是 client 组件，元数据写在各路由的 `layout.tsx`（只透传 children），页面本身不改。子级的 `openGraph` / `twitter` 会整体覆盖父级，`canonical` 会被继承，所以 `buildPageMetadata` 每页都给出完整的 canonical、OG 和 Twitter 字段。
- **OG 图**：暂不提供自定义 OG / Twitter 分享图，元数据中不含 `images` 字段。
- **结构化数据**：首页输出 `WebSite` + `SoftwareApplication`（`@graph`），`alternateName` 包含林瓜鲁普及别名。
- **robots.txt**（`src/app/robots.ts`）：对所有爬虫（含 Baiduspider）`Allow: /`，只禁止 `/api/`、`/login`、`/errors`，并声明 sitemap。
- **sitemap.xml**（`src/app/sitemap.ts`）：首页与全部可收录的模块页，不含 noindex 页面。
- **manifest**：`public/manifest.json` 的名称与描述已同步新文案。

## 提交 sitemap

上线后先确认 `https://www.lingualoop.com.cn/robots.txt` 与 `https://www.lingualoop.com.cn/sitemap.xml` 可以访问。

### 百度搜索资源平台

1. 登录 [百度搜索资源平台](https://ziyuan.baidu.com/)，「用户中心 › 站点管理 › 添加网站」，填写 `https://www.lingualoop.com.cn`。
2. 按平台提示完成站点验证（文件验证、HTML 标签或 CNAME 任选其一），验证码以平台实际给出的为准。
   - 选 HTML 标签验证时，把平台给的 `content` 填到根 layout `metadata.verification.other['baidu-site-verification']`。
   - 选文件验证时，把平台给的文件放进 `public/`。
3. 「普通收录 › 资源提交 › sitemap」提交 `https://www.lingualoop.com.cn/sitemap.xml`。
4. 可选：在「普通收录 › API 提交」获取推送接口，新页面上线后主动推送。

### Google Search Console

1. 登录 [Google Search Console](https://search.google.com/search-console)，添加资源。推荐用「网域」类型并按提示添加 DNS TXT 记录；也可用「网址前缀」`https://www.lingualoop.com.cn/`。
2. 选 HTML 标签验证时，把 Google 给的值填到根 layout 的 `metadata.verification.google`。
3. 「站点地图」中提交 `sitemap.xml`。
4. 用「网址检查」抽查首页与几个模块页的 canonical 是否为 www 域名。

验证码均以平台实际给出的为准，不要提前写入占位值。

## 备案

目前没有 ICP 备案号，页脚不展示备案信息。拿到备案号后，再在首页页脚加上备案号，并链接到 `https://beian.miit.gov.cn/`。
