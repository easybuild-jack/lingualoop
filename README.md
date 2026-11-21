<div align="center">

<img src="./public/logo111.png" alt="LinguaLoop Logo" width="72" height="72" />

# LinguaLoop

**An open-source, local-first, all-in-one English learning loop web app**

English · [简体中文](./README.zh-CN.md) · [繁體中文（香港）](./README.zh-HK.md) · [繁體中文（台灣）](./README.zh-TW.md) · [日本語](./README.ja.md)

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-10B981)](https://dexie.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Optional-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![GitHub Stars](https://img.shields.io/github/stars/easybuild-jack/lingualoop?style=flat&color=f59e0b)](https://github.com/easybuild-jack/lingualoop/stargazers)

[Live Demo](https://www.lingualoop.com.cn) · [Architecture (ZH)](./docs/architecture.md) · [Developer Guide (ZH)](./docs/development.md) · [SEO Guide (ZH)](./docs/seo.md)

</div>

---

## ✨ Introduction

**LinguaLoop** is an **open-source, local-first** modern English learning web application built with **Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4**.

It connects **IPA phonetics, syllable-based vocabulary learning, blind dictation, roots & affixes, visual grammar, offline dictionary, bilingual reading, listening plaza, sentence translation, AI tutor, and AI speaking partner** into a cohesive listening-speaking-reading-writing-translating loop. With zero required backend, all progress stays in your browser by default and works offline—while optionally supporting **BYOK AI models** and **Supabase cloud sync**.

---

## 🚀 Live Demo

- **Website**: [https://www.lingualoop.com.cn](https://www.lingualoop.com.cn)
- **Out of the Box**: No sign-up required. All progress and custom decks are stored locally in your browser (PWA desktop install supported).

---

## 🎯 Key Features

- **Complete English Learning Loop**: Covers 48 IPA phonetics, syllable breakdown, audio/meaning blind dictation, mistake drills, roots & affixes map, 16-tense & syntax diagrams, bilingual reading, listening videos, and two-stage sentence translation (warmup keywords → full-sentence typing → word-by-word grammar breakdown).
- **Built-in Decks & Offline Dictionary**: Ships with curated vocabulary decks (Basic, CET-4/6, Kaoyan, Essential 4000, IT English) plus CSV/TXT/JSON custom deck import. Instant local cache lookup with on-demand AI enrichment for syllables, examples, phrases, and etymology.
- **Local-First + Optional Supabase Cloud Sync**: Runs 100% locally via IndexedDB and `localStorage` out of the box. Connect your own Supabase project anytime for multi-device sync, built-in account progress isolation, shared/personal content visibility, and idempotent manual sync.
- **BYOK Stateless AI Tutor & Speaking Partner**: Plug in your own OpenAI-compatible LLM (DeepSeek, Doubao, Qwen, OpenAI, etc.) and Doubao/Qwen TTS & ASR. Server routes act strictly as stateless proxies—credentials and audio are never persisted or logged.
- **Immersive Desktop-Grade UX**: Multiple dark theme skins via CSS variables, mechanical keyboard switch sounds (Howler.js), customizable global shortcuts, and PWA offline support.
- **AI-Friendly Engineering Setup**: Includes dedicated [Architecture](./docs/architecture.md) and [Developer Guide](./docs/development.md) docs for fast onboarding by both human engineers and AI coding agents.

---

## 🛠 Tech Stack

| Category | Technologies |
| --- | --- |
| Core | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| UI & Motion | Tailwind CSS 4 · Framer Motion · Lucide React |
| State & Storage | Zustand 5 · Dexie.js 4 (IndexedDB) · PWA |
| Optional Cloud | Supabase (`@supabase/supabase-js`) · PostgreSQL RPC |
| Audio & Speech | Howler.js · Web Speech Synthesis API · Doubao / Qwen TTS & ASR |

---

## 📦 Quick Start

### Prerequisites

- **Node.js** `>= 20`
- **npm** `>= 10`

### Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/easybuild-jack/lingualoop.git
cd lingualoop

# 2. Install dependencies
npm install

# 3. Start the development server (zero backend or env vars required)
npm run dev
```

Open `http://localhost:3000` in your browser to start learning.

### Scripts

```bash
npm run dev       # Start local development server
npm run build     # Build production bundle
npm run start     # Start production server
npm run lint      # Run ESLint
```

### Optional Configuration

| Feature | How to Configure |
| --- | --- |
| **AI Dictionary / Tutor / Speaking** | Open **Settings → AI Models / Speech** in the app and enter your own API Key (stored only in your browser) |
| **Multi-Device Sync (Supabase)** | Run [`supabase/schema.sql`](./supabase/schema.sql) in your Supabase SQL Editor, then enter Project URL & Anon Key in **Settings → Cloud Sync** |
| **Custom Domain (SEO)** | Set `NEXT_PUBLIC_SITE_URL=https://your-domain.com` before building (optional) |

---

## 📚 Documentation

- 📖 **[Architecture (ZH)](./docs/architecture.md)**: Project overview, feature map, tech stack, system architecture diagram, and technical roadmap
- 🛠 **[Developer Guide (ZH)](./docs/development.md)**: Technical handbook for developers and AI agents covering architecture rules, core workflows, coding standards, and checklists
- 🔍 **[SEO Guide (ZH)](./docs/seo.md)**: Brand conventions, route metadata catalog, and search engine submission guide
- 🎬 **[Official Samples Guide (ZH)](./docs/official-samples.md)**: How built-in listening videos and translation decks are structured and validated

---

## 🤝 Feedback & Issues

You are welcome to **Fork** and customize LinguaLoop for your own use or self-hosting. For bug reports or feature suggestions, please open an [Issue](https://github.com/easybuild-jack/lingualoop/issues).

---

## ☕ Sponsor / Buy Me a Coffee

If **LinguaLoop** helps your English learning or saves you time, feel free to buy me a cup of coffee!

<table>
  <tr>
    <td align="center">
      <img src="./docs/assets/wechat-pay.jpg" alt="WeChat Pay" height="240" />
      <br />
      <sub><b>WeChat Pay</b></sub>
    </td>
    <td align="center">
      <img src="./docs/assets/fps-pay.jpg" alt="FPS (ZA Bank)" height="240" />
      <br />
      <sub><b>FPS (ZA Bank · ID: 129613600)</b></sub>
    </td>
  </tr>
</table>

---

## ⭐ Star History

If you find this project helpful, please consider giving it a **Star**!

[![Star History Chart](https://api.star-history.com/svg?repos=easybuild-jack/lingualoop&type=Date)](https://star-history.com/#easybuild-jack/lingualoop&Date)
