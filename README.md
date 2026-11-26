<div align="center">

<img src="./public/logo111.png" alt="LinguaLoop Logo" width="72" height="72" />

# LinguaLoop

**From your first phonetic symbol to your first real English conversation.**

*A source-available, highly flexible personal English learning assistant — supporting offline local use, cross-device sync, and family sharing. Free for personal, noncommercial use.*

English · [简体中文](./README.zh-CN.md) · [繁體中文（香港）](./README.zh-HK.md) · [繁體中文（台灣）](./README.zh-TW.md) · [日本語](./README.ja.md)

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Optional-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![GitHub Stars](https://img.shields.io/github/stars/easybuild-jack/lingualoop?style=flat&color=f59e0b)](https://github.com/easybuild-jack/lingualoop/stargazers)

[Live Demo](https://www.lingualoop.com.cn) · [Architecture (ZH)](./docs/architecture.md) · [Developer Guide (ZH)](./docs/development.md) · [SEO Guide (ZH)](./docs/seo.md)

</div>

---

## ✨ Why LinguaLoop?

Most English apps split learning into disconnected fragments — one app for flashcards, another for listening, another for grammar, and yet another for speaking.

**LinguaLoop** connects all **5 core skills (Listening · Speaking · Reading · Writing · Translation)** across **12 integrated modules** into **one continuous learning loop**:

> **Build the Foundation → Immerse in Input → Activate Output** — so you can truly **understand, speak, read, and write**.

| 5 Core Skills | 12 Learning Modules | 50,000+ Offline Entries | Source Available |
| :---: | :---: | :---: | :---: |
| Listening · Speaking · Reading · Writing · Translation | End-to-end connected loop | Built-in local dictionary | Free for personal use & self-hosting |

---

## 🚀 Live Demo

- **Official Site**: [https://www.lingualoop.com.cn](https://www.lingualoop.com.cn)
- **Zero Friction**: No sign-up required — open the page and start practicing immediately (PWA desktop install supported).

---

## 🗺️ Complete Learning Loop (12 Modules)

| Stage | Modules & Highlights |
| --- | --- |
| **1. Foundation · Sound & Vocab** | **IPA Learning** (48 phonetic symbols + 42 phonics combos, tap to hear) · **IPA Practice** (built-in IPA keyboard drills) · **Word Learning** (syllable breakdown & etymology typing) · **Roots & Affixes** (cognate word family map) |
| **2. Retention & Tools** | **Mistake & Starred Book** (**3-in-a-row streak** anti-illusion mastery) · **Offline Dictionary** (50,000+ entries instant lookup + AI enrichment) · **Deck Manager** (CET-4/6, Kaoyan, Essential 4000, IT English + CSV/TXT/JSON custom import) |
| **3. Input · Listen & Read** | **Listening Plaza** (phrases, dialogues & English radio with speed control & bilingual subtitles) · **Bilingual Reading** (**IPA / English / Chinese 3-line view**, click any word to look up & pronounce) · **Visual Grammar** (parts of speech, 16 tenses & syntax derivation) |
| **4. Output · Write & Speak** | **Blind Dictation** (listen & spell from memory) · **Sentence Translation** (keyword warmup → full-sentence typing → word-by-word grammar analysis) · **AI Speaking Partner** (coffee shop, travel, tech interview & IELTS role-play with instant grammar & pronunciation feedback) |

---

## 🔥 Crafted Details That Make Learning Addictive

- 🎯 **Anti-Illusion "3-in-a-Row" Mastery**: Any typo or hint peek automatically sends the word to your mistake book — it only clears after **3 consecutive blind-typing hits**.
- 🎹 **13 Real Mechanical Keyboard Switch Sounds**: Sampled Cherry MX Blues/Browns, Topre, Alpacas, NovelKeys Creams, IBM Buckling Spring and more (via Howler.js) — turning dictation into a satisfying typing experience.
- 🎨 **7 Eye-Friendly Themes (Dark & Light)**: Calm dark modes for deep focus and warm paper-ink light modes — instant full-page switching via CSS variables.
- 🗣️ **AI Speaking Partner (The Final Link)**: Role-play real-life scenarios anytime, get instant grammar corrections, and turn unknown words from conversations directly into your vocabulary deck.

---

## 🌐 Flexible by Design

| Mode | What You Get |
| --- | --- |
| 📴 **Offline Ready** | 50,000+ dictionary entries & built-in decks load locally; install as a PWA and study without internet. |
| 🔄 **Cross-Device Sync** | Connect your own Supabase database to sync decks, mistake books, and progress across devices. |
| 👥 **Team & Family Sharing** | Per-account progress isolation with flexible **Shared / Personal** visibility for decks, sentences, articles, and videos — learn and curate together. |
| ✨ **Fully Personalized (BYOK)** | Import your own study materials, switch themes & shortcuts, and plug in your own LLM / TTS / ASR keys (stateless proxy, zero server storage). |

---

## 🛠 Tech Stack

| Category | Technologies |
| --- | --- |
| Core | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| UI & Motion | Tailwind CSS 4 · Framer Motion · Lucide React |
| State & Storage | Zustand 5 · Dexie.js 4 (IndexedDB) · PWA |
| Cloud Sync (Optional) | Supabase (`@supabase/supabase-js`) · PostgreSQL RPC |
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
| **Cross-Device & Team Sync (Supabase)** | Run [`supabase/schema.sql`](./supabase/schema.sql) in your Supabase SQL Editor, then enter Project URL & Anon Key in **Settings → Cloud Sync** |
| **Custom Domain (SEO)** | Set `NEXT_PUBLIC_SITE_URL=https://your-domain.com` before building (optional) |

---

## 📚 Documentation

- 📖 **[Architecture (ZH)](./docs/architecture.md)**: System architecture, tech roadmap, data routing, and directory layout
- 🛠 **[Developer Guide (ZH)](./docs/development.md)**: Technical handbook for developers and AI coding agents (rules, workflows, conventions & checklists)
- 🔍 **[SEO Guide (ZH)](./docs/seo.md)**: Brand conventions, route metadata catalog, and search engine submission
- 🎬 **[Official Samples Guide (ZH)](./docs/official-samples.md)**: Built-in listening videos & translation decks guide

---

## 🤝 Feedback & Issues

You are welcome to **Fork**, customize, and self-host LinguaLoop for personal or family use under the [license](#-license). For bug reports or feature suggestions, please open an [Issue](https://github.com/easybuild-jack/lingualoop/issues).

---

## 📄 License

LinguaLoop is **source-available, not open source** in the OSI sense. The source code is publicly available under the [PolyForm Noncommercial License 1.0.0](./LICENSE) (SPDX: `PolyForm-Noncommercial-1.0.0`).

- ✅ **Allowed**: personal learning, and self-hosted use by yourself or your family, with no commercial purpose.
- 💼 **Requires prior written authorization from the author**: use by companies, commercial training institutions, use in paid products or services, resale, or offering LinguaLoop as a hosted or paid service.
- 📜 The full terms are in the [LICENSE](./LICENSE) file; if this summary and the LICENSE ever differ, the LICENSE prevails.
- 📮 **Commercial licensing**: please open an [Issue](https://github.com/easybuild-jack/lingualoop/issues) titled "Commercial License Inquiry" to contact the author.

---

## ☕ Sponsor / Buy Me a Coffee

If **LinguaLoop** helps your English learning or inspires your project, feel free to buy me a cup of coffee!

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
