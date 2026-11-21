<div align="center">

<img src="./public/logo111.png" alt="LinguaLoop Logo" width="72" height="72" />

# LinguaLoop（林瓜魯普）

**一款開源、本地優先的一站式英語學習閉環應用**

[English](./README.md) · [简体中文](./README.zh-CN.md) · 繁體中文（香港） · [繁體中文（台灣）](./README.zh-TW.md) · [日本語](./README.ja.md)

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-10B981)](https://dexie.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Optional-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![GitHub Stars](https://img.shields.io/github/stars/easybuild-jack/lingualoop?style=flat&color=f59e0b)](https://github.com/easybuild-jack/lingualoop/stargazers)

[網上體驗](https://www.lingualoop.com.cn) · [項目說明文檔](./docs/architecture.md) · [開發文檔](./docs/development.md) · [SEO 說明](./docs/seo.md)

</div>

---

## ✨ 項目簡介

**LinguaLoop（林瓜魯普）** 是一款**開源、本地優先（Local-First）**的現代化英語學習 Web 應用，基於 **Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4** 構建。

項目將 **國際音標、詞彙拼讀、默寫攻堅、詞根詞綴、語法圖解、離線詞典、雙語閱讀、聽力廣場、句子翻譯、AI 助教與 AI 口語陪練** 串聯成完整的「聽 · 說 · 讀 · 寫 · 譯」學習閉環。預設零後端依賴、數據儲存在瀏覽器本地，打開即可離線學習；同時支援按需接入個人 **AI 模型（BYOK）** 與 **Supabase 雲端同步**。

---

## 🚀 網上體驗

- **官方網站**：[https://www.lingualoop.com.cn](https://www.lingualoop.com.cn)
- **開箱即用**：無需註冊登入，所有學習進度與詞庫數據預設保存在本機瀏覽器（支援 PWA 安裝至桌面）。

---

## 🎯 核心特性

- **全鏈路英語學習閉環**：涵蓋 48 個國際音標矩陣、音節拆分拼讀、聽音/看譯文盲打默寫、生錯詞攻堅、詞根詞綴圖譜、16 時態與句子語法圖解、雙語對照閱讀、聽力廣場影片磨耳，以及「熱身詞 → 整句拼寫 → 語法解析」句子翻譯訓練。
- **內置詞庫與離線詞典**：內置基礎詞彙、四六級、考研、核心 4000 與 IT 英語等官方詞庫，支援 CSV/TXT/JSON 匯入自訂詞庫；查詞支援本地緩存與 AI 按需分段補全（音節、例句、短語、詞源）。
- **本地優先 + 可選 Supabase 雲同步**：預設純本地運行（IndexedDB + localStorage）；需要跨裝置或家庭/團隊共用時，可在設定中接入自己的 Supabase 數據庫，支援自建系統賬號隔離進度、自訂內容按「共享 / 個人」分發及冪等手動同步。
- **BYOK 無狀態 AI 助教與口語陪練**：支援自訂接入 DeepSeek、豆包、千問、OpenAI 等兼容大模型及豆包/千問語音（TTS/ASR）；服務端僅作無狀態轉發代理，所有 API Key 與學習記錄均不落盤、不入庫。
- **沉浸式桌面級體驗**：內置多套深色主題皮膚（CSS 變量即時切換）、機械鍵盤軸體按鍵音效（Howler.js）、全局自訂快捷鍵與 PWA 離線支援。
- **AI 友好工程規範**：配套完整的 [項目說明文檔](./docs/architecture.md) 與面向開發者/AI 助手的 [開發文檔](./docs/development.md)，方便快速了解架構及二次開發。

---

## 🛠 技術棧

| 類別 | 技術方案 |
| --- | --- |
| 核心框架 | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| 樣式與動效 | Tailwind CSS 4 · Framer Motion · Lucide React |
| 狀態與本地儲存 | Zustand 5 · Dexie.js 4 (IndexedDB) · PWA |
| 可選雲端同步 | Supabase (`@supabase/supabase-js`) · PostgreSQL RPC |
| 音頻與語音 | Howler.js · Web Speech Synthesis API · 豆包 / 千問 TTS & ASR |

---

## 📦 快速開始

### 環境要求

- **Node.js** `>= 20`
- **npm** `>= 10`

### 本地運行

```bash
# 1. 複製倉庫
git clone https://github.com/easybuild-jack/lingualoop.git
cd lingualoop

# 2. 安裝依賴
npm install

# 3. 啟動開發服務器（無需任何後端或環境變量）
npm run dev
```

啟動後在瀏覽器瀏覽 `http://localhost:3000` 即可開始使用。

### 常用指令

```bash
npm run dev       # 啟動本地開發服務器
npm run build     # 構建生產版本
npm run start     # 啟動生產服務
npm run lint      # ESLint 代碼規範檢查
```

### 可選功能配置

| 功能 | 配置方式 |
| --- | --- |
| **AI 查詞 / AI 助教 / 口語陪練** | 啟動後進入右上角「偏好設定 → AI 模型 / 語音設定」填入自己的 API Key（僅存本機瀏覽器） |
| **多裝置雲端同步（Supabase）** | 在自己的 Supabase SQL Editor 中執行 [`supabase/schema.sql`](./supabase/schema.sql)，再於「偏好設定 → 數據同步」填入 Project URL 與 Anon Key |
| **自部署規範域名（SEO）** | 構建前設定環境變量 `NEXT_PUBLIC_SITE_URL=https://your-domain.com`（可選） |

---

## 📚 相關文檔

- 📖 **[項目說明文檔](./docs/architecture.md)**：項目定位、功能版圖、技術棧、總體架構圖與核心技術路線
- 🛠 **[開發文檔](./docs/development.md)**：面向開發者與 AI 助手的參考手冊（架構紅線、核心業務流程、編碼規範與驗證清單）
- 🔍 **[SEO 說明](./docs/seo.md)**：品牌規範、路由元數據清單與搜索引擎提交流程
- 🎬 **[官方示例接入說明](./docs/official-samples.md)**：聽力影片與翻譯句庫聯動機制及校驗方法

---

## 🤝 反饋與交流

歡迎 **Fork** 本項目按需自訂或自行部署。如在使用過程中遇到問題、發現 Bug 或有功能建議，歡迎前往 [Issues](https://github.com/easybuild-jack/lingualoop/issues) 反饋交流。

---

## ☕ 贊賞支持

如果 **LinguaLoop（林瓜魯普）** 對你的英語學習或項目開發有幫助，歡迎請作者飲杯咖啡！

<table>
  <tr>
    <td align="center">
      <img src="./docs/assets/wechat-pay.jpg" alt="微信支付" height="240" />
      <br />
      <sub><b>微信支付</b></sub>
    </td>
    <td align="center">
      <img src="./docs/assets/fps-pay.jpg" alt="轉數快 FPS" height="240" />
      <br />
      <sub><b>轉數快 FPS（ZA Bank · ID: 129613600）</b></sub>
    </td>
  </tr>
</table>

---

## ⭐ Star History

如果這個項目對你有幫助，歡迎點一個 **Star** 支持一下！

[![Star History Chart](https://api.star-history.com/svg?repos=easybuild-jack/lingualoop&type=Date)](https://star-history.com/#easybuild-jack/lingualoop&Date)

