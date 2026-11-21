<div align="center">

<img src="./public/logo111.png" alt="LinguaLoop Logo" width="72" height="72" />

# LinguaLoop（林瓜鲁普）

**一款开源、本地优先的一站式英语学习闭环应用**

[English](./README.md) · 简体中文 · [繁體中文（香港）](./README.zh-HK.md) · [繁體中文（台灣）](./README.zh-TW.md) · [日本語](./README.ja.md)

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-10B981)](https://dexie.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Optional-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![GitHub Stars](https://img.shields.io/github/stars/easybuild-jack/lingualoop?style=flat&color=f59e0b)](https://github.com/easybuild-jack/lingualoop/stargazers)

[在线体验](https://www.lingualoop.com.cn) · [项目说明文档](./docs/architecture.md) · [开发文档](./docs/development.md) · [SEO 说明](./docs/seo.md)

</div>

---

## ✨ 项目简介

**LinguaLoop（林瓜鲁普）** 是一款**开源、本地优先（Local-First）**的现代化英语学习 Web 应用，基于 **Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4** 构建。

项目将 **国际音标、词汇拼读、默写攻坚、词根词缀、语法图解、离线词典、双语阅读、听力广场、句子翻译、AI 助教与 AI 口语陪练** 串联成完整的「听 · 说 · 读 · 写 · 译」学习闭环。默认零后端依赖、数据存于浏览器本地，打开即可离线学习；同时支持按需接入个人 **AI 模型（BYOK）** 与 **Supabase 云端同步**。

---

## 🚀 在线体验

- **官方网站**：[https://www.lingualoop.com.cn](https://www.lingualoop.com.cn)
- **开箱即用**：无需注册登录，所有学习进度与词库数据默认保存在本机浏览器（支持 PWA 安装到桌面）。

---

## 🎯 核心特性

- **全链路英语学习闭环**：覆盖 48 个国际音标矩阵、音节拆分拼读、听音/看译文盲打默写、生错词攻坚、词根词缀图谱、16 时态与句子语法图解、双语对照阅读、听力广场视频磨耳及「热身词 → 整句拼写 → 语法解析」句子翻译训练。
- **内置词库与离线词典**：内置基础词汇、四六级、考研、核心 4000 与 IT 英语等官方词库，支持 CSV/TXT/JSON 导入自定义词库；查词支持本地缓存与 AI 按需分段补全（音节、例句、短语、词源）。
- **本地优先 + 可选 Supabase 云同步**：默认纯本地运行（IndexedDB + localStorage）；需要跨设备或家庭/团队共用时，可在设置中接入自己的 Supabase 数据库，支持自建系统账号隔离进度、自定义内容按「共享 / 个人」分发以及幂等手动同步。
- **BYOK 无状态 AI 助教与口语陪练**：支持自定义接入 DeepSeek、豆包、千问、OpenAI 等兼容大模型与豆包/千问语音（TTS/ASR）；服务端仅做无状态转发代理，所有 API Key 与学习记录均不落盘、不存库。
- **沉浸式桌面级体验**：内置多套深色主题皮肤（CSS 变量实时切换）、机械键盘轴体击键音效（Howler.js）、全局自定义快捷键与 PWA 离线支持。
- **AI 友好工程规范**：配套完整的 [项目说明文档](./docs/architecture.md) 与面向开发者/AI 助手的 [开发文档](./docs/development.md)，方便快速理解架构与二次开发。

---

## 🛠 技术栈

| 类别 | 技术方案 |
| --- | --- |
| 核心框架 | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| 样式与动效 | Tailwind CSS 4 · Framer Motion · Lucide React |
| 状态与本地存储 | Zustand 5 · Dexie.js 4 (IndexedDB) · PWA |
| 可选云端同步 | Supabase (`@supabase/supabase-js`) · PostgreSQL RPC |
| 音频与语音 | Howler.js · Web Speech Synthesis API · 豆包 / 千问 TTS & ASR |

---

## 📦 快速开始

### 环境要求

- **Node.js** `>= 20`
- **npm** `>= 10`

### 本地运行

```bash
# 1. 克隆仓库
git clone https://github.com/easybuild-jack/lingualoop.git
cd lingualoop

# 2. 安装依赖
npm install

# 3. 启动开发服务器（无需任何后端或环境变量）
npm run dev
```

启动后在浏览器访问 `http://localhost:3000` 即可开始使用。

### 常用命令

```bash
npm run dev       # 启动本地开发服务器
npm run build     # 构建生产版本
npm run start     # 启动生产服务
npm run lint      # ESLint 代码规范检查
```

### 可选能力配置

| 能力 | 配置方式 |
| --- | --- |
| **AI 查词 / AI 助教 / 口语陪练** | 启动后进入右上角「偏好设置 → AI 模型 / 语音设置」填入自己的 API Key（仅存本机浏览器） |
| **多设备云端同步（Supabase）** | 在自己的 Supabase SQL Editor 中执行 [`supabase/schema.sql`](./supabase/schema.sql)，随后在「偏好设置 → 数据同步」填入 Project URL 与 Anon Key |
| **自部署规范域名（SEO）** | 构建前设置环境变量 `NEXT_PUBLIC_SITE_URL=https://your-domain.com`（可选） |

---

## 📚 相关文档

- 📖 **[项目说明文档](./docs/architecture.md)**：项目定位、功能版图、技术栈、总体架构图与核心技术路线
- 🛠 **[开发文档](./docs/development.md)**：面向开发者与 AI 助手的参考手册（架构红线、核心业务流程、编码规范与验证清单）
- 🔍 **[SEO 说明](./docs/seo.md)**：品牌规范、路由元数据清单与搜索引擎提交流程
- 🎬 **[官方示例接入说明](./docs/official-samples.md)**：听力视频与翻译句库联动机制及校验方法

---

## 🤝 反馈与交流

欢迎 **Fork** 本项目按需定制或自部署。如果在使用过程中遇到问题、发现 Bug 或有功能建议，欢迎前往 [Issues](https://github.com/easybuild-jack/lingualoop/issues) 反馈交流。

---

## ☕ 赞赏支持

如果 **LinguaLoop（林瓜鲁普）** 对你的英语学习或项目开发有帮助，欢迎请作者喝杯咖啡！

<table>
  <tr>
    <td align="center">
      <img src="./docs/assets/wechat-pay.jpg" alt="微信支付" height="240" />
      <br />
      <sub><b>微信支付</b></sub>
    </td>
    <td align="center">
      <img src="./docs/assets/fps-pay.jpg" alt="转数快 FPS" height="240" />
      <br />
      <sub><b>转数快 FPS（ZA Bank · ID: 129613600）</b></sub>
    </td>
  </tr>
</table>

---

## ⭐ Star History

如果这个项目对你有帮助，欢迎点一个 **Star** 支持一下！

[![Star History Chart](https://api.star-history.com/svg?repos=easybuild-jack/lingualoop&type=Date)](https://star-history.com/#easybuild-jack/lingualoop&Date)

