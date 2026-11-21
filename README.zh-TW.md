<div align="center">

<img src="./public/logo111.png" alt="LinguaLoop Logo" width="72" height="72" />

# LinguaLoop（林瓜魯普）

**一款開源、本地優先的一站式英語學習閉環應用**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文（香港）](./README.zh-HK.md) · 繁體中文（台灣） · [日本語](./README.ja.md)

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-10B981)](https://dexie.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Optional-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![GitHub Stars](https://img.shields.io/github/stars/easybuild-jack/lingualoop?style=flat&color=f59e0b)](https://github.com/easybuild-jack/lingualoop/stargazers)

[線上體驗](https://www.lingualoop.com.cn) · [專案說明文件](./docs/architecture.md) · [開發文件](./docs/development.md) · [SEO 說明](./docs/seo.md)

</div>

---

## ✨ 專案簡介

**LinguaLoop（林瓜魯普）** 是一款**開源、本地優先（Local-First）**的現代化英語學習 Web 應用，基於 **Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4** 建置。

專案將 **國際音標、詞彙拼讀、默寫複習、字根字首、文法圖解、離線字典、雙語閱讀、聽力廣場、句子翻譯、AI 助教與 AI 口說陪練** 串聯成完整的「聽 · 說 · 讀 · 寫 · 譯」學習閉環。預設零後端相依、資料儲存在瀏覽器本機，開啟即可離線學習；同時支援按需串接個人 **AI 模型（BYOK）** 與 **Supabase 雲端同步**。

---

## 🚀 線上體驗

- **官方網站**：[https://www.lingualoop.com.cn](https://www.lingualoop.com.cn)
- **開箱即用**：無需註冊登入，所有學習進度與字庫資料預設保存在本機瀏覽器（支援 PWA 安裝至桌面）。

---

## 🎯 核心特色

- **全鏈路英語學習閉環**：涵蓋 48 個國際音標矩陣、音節拆分拼讀、聽音/看釋義盲打默寫、生錯字複習、字根字首圖譜、16 時態與句型文法圖解、雙語對照閱讀、聽力廣場影片練習，以及「熱身單字 → 整句拼寫 → 文法解析」句子翻譯訓練。
- **內建字庫與離線字典**：內建基礎詞彙、四六級、考研、核心 4000 與 IT 英語等官方字庫，支援 CSV/TXT/JSON 匯入自訂字庫；查字支援本機快取與 AI 按需分段補全（音節、例句、片語、詞源）。
- **本地優先 + 可選 Supabase 雲端同步**：預設純本機運行（IndexedDB + localStorage）；需要跨裝置或家庭/團隊共用時，可在設定中串接自己的 Supabase 資料庫，支援自建系統帳號隔離進度、自訂內容按「共享 / 個人」控管以及冪等手動同步。
- **BYOK 無狀態 AI 助教與口說陪練**：支援自訂串接 DeepSeek、豆包、千問、OpenAI 等相容大型語言模型與豆包/千問語音（TTS/ASR）；伺服器端僅做無狀態轉發代理，所有 API Key 與學習紀錄皆不落地、不入庫。
- **沉浸式桌面級體驗**：內建多套深色主題面板（CSS 變數即時切換）、機械鍵盤軸體按鍵音效（Howler.js）、全域自訂快捷鍵與 PWA 離線支援。
- **AI 友善工程規範**：隨附完整的 [專案說明文件](./docs/architecture.md) 與面向開發者/AI 助手的 [開發文件](./docs/development.md)，便於快速理解架構與二次開發。

---

## 🛠 技術棧

| 類別 | 技術方案 |
| --- | --- |
| 核心框架 | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| 樣式與動效 | Tailwind CSS 4 · Framer Motion · Lucide React |
| 狀態與本機儲存 | Zustand 5 · Dexie.js 4 (IndexedDB) · PWA |
| 可選雲端同步 | Supabase (`@supabase/supabase-js`) · PostgreSQL RPC |
| 音訊與語音 | Howler.js · Web Speech Synthesis API · 豆包 / 千問 TTS & ASR |

---

## 📦 快速開始

### 環境需求

- **Node.js** `>= 20`
- **npm** `>= 10`

### 本機執行

```bash
# 1. 複製儲存庫
git clone https://github.com/easybuild-jack/lingualoop.git
cd lingualoop

# 2. 安裝相依套件
npm install

# 3. 啟動開發伺服器（無需任何後端或環境變數）
npm run dev
```

啟動後於瀏覽器開啟 `http://localhost:3000` 即可開始使用。

### 常用指令

```bash
npm run dev       # 啟動本機開發伺服器
npm run build     # 建置正式版本
npm run start     # 啟動正式環境服務
npm run lint      # ESLint 程式碼規範檢查
```

### 選用功能設定

| 功能 | 設定方式 |
| --- | --- |
| **AI 查字 / AI 助教 / 口說陪練** | 啟動後進入右上角「偏好設定 → AI 模型 / 語音設定」填入自己的 API Key（僅存本機瀏覽器） |
| **多裝置雲端同步（Supabase）** | 在自己的 Supabase SQL Editor 中執行 [`supabase/schema.sql`](./supabase/schema.sql)，再於「偏好設定 → 資料同步」填入 Project URL 與 Anon Key |
| **自部署規範網域（SEO）** | 建置前設定環境變數 `NEXT_PUBLIC_SITE_URL=https://your-domain.com`（選填） |

---

## 📚 相關文件

- 📖 **[專案說明文件](./docs/architecture.md)**：專案定位、功能版圖、技術棧、總體架構圖與核心技術路線
- 🛠 **[開發文件](./docs/development.md)**：面向開發者與 AI 助手的參考手冊（架構紅線、核心業務流程、編碼規範與驗證清單）
- 🔍 **[SEO 說明](./docs/seo.md)**：品牌規範、路由中繼資料清單與搜尋引擎提交流程
- 🎬 **[官方範例接入說明](./docs/official-samples.md)**：聽力影片與翻譯句庫聯動機制及驗證方式

---

## 🤝 回饋與交流

歡迎 **Fork** 本專案按需客製或自行部署。若在使用過程中遇到問題、發現 Bug 或有功能建議，歡迎前往 [Issues](https://github.com/easybuild-jack/lingualoop/issues) 回報交流。

---

## ☕ 贊助支持

如果 **LinguaLoop（林瓜魯普）** 對你的英語學習或專案開發有所幫助，歡迎請作者喝杯咖啡！

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

如果這個專案對你有幫助，歡迎點一顆 **Star** 支持一下！

[![Star History Chart](https://api.star-history.com/svg?repos=easybuild-jack/lingualoop&type=Date)](https://star-history.com/#easybuild-jack/lingualoop&Date)

