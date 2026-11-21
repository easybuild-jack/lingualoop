<div align="center">

<img src="./public/logo111.png" alt="LinguaLoop Logo" width="72" height="72" />

# LinguaLoop

**オープンソース・ローカルファーストのオールインワン英語学習ループ Web アプリ**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文（香港）](./README.zh-HK.md) · [繁體中文（台灣）](./README.zh-TW.md) · 日本語

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-10B981)](https://dexie.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Optional-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![GitHub Stars](https://img.shields.io/github/stars/easybuild-jack/lingualoop?style=flat&color=f59e0b)](https://github.com/easybuild-jack/lingualoop/stargazers)

[ライブデモ](https://www.lingualoop.com.cn) · [アーキテクチャ (ZH)](./docs/architecture.md) · [開発者ガイド (ZH)](./docs/development.md) · [SEO ガイド (ZH)](./docs/seo.md)

</div>

---

## ✨ プロジェクト概要

**LinguaLoop** は、**Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4** で構築された、**オープンソース・ローカルファースト（Local-First）** のモダン英語学習 Web アプリケーションです。

**国際音声記号（IPA）、音節分解による単語学習、ディクテーション、語根・接辞マップ、ビジュアル英文法、オフライン辞書、対訳リーディング、リスニング広場、英作文トレーニング、AI チューター、AI スピーキング練習** をひとつの学習ループとして統合。バックエンド不要でブラウザ内だけで完結してオフライン利用でき、必要に応じて **BYOK の AI モデル** や **Supabase クラウド同期** も接続できます。

---

## 🚀 ライブデモ

- **公式サイト**：[https://www.lingualoop.com.cn](https://www.lingualoop.com.cn)
- **すぐ使える**：アカウント登録不要。学習進捗やカスタム単語帳はすべてブラウザ内に保存されます（PWA デスクトップインストール対応）。

---

## 🎯 主な機能

- **英語学習の完全ループ**：48 種類の IPA 発音記号、音節分解スペリング、音声/和訳ディクテーション、弱点克服ドリル、語根・接辞マップ、16 時制・構文図解、対訳リーディング、リスニング動画、2 段階英作文トレーニング（キーワード予習 → 全文タイピング → 語ごとの文法解説）を一貫して学習可能。
- **内蔵単語帳とオフライン辞書**：基礎単語・CET-4/6・考研・Essential 4000・IT 英語などの公式単語帳を収録し、CSV/TXT/JSON でのカスタム単語帳インポートにも対応。ローカルキャッシュ検索に加え、AI による音節・例文・フレーズ・語源の段階的補完をサポート。
- **ローカルファースト + オプションの Supabase 同期**：デフォルトは IndexedDB と `localStorage` で完全ローカル動作。複数端末や家族・チームで共有したい場合は、自身の Supabase を接続するだけでアカウント別進捗分離、共有/個人コンテンツ管理、冪等な手動同期が利用可能。
- **BYOK ステートレス AI チューター＆スピーキング**：DeepSeek / Doubao / Qwen / OpenAI 互換 LLM と Doubao / Qwen の TTS・ASR に対応。サーバー API は完全ステートレスなプロキシとして動作し、API Key や音声データを保存・ログ記録しません。
- **快適なデスクトップ級 UX**：CSS 変数による複数ダークテーマ、メカニカルキーボード打鍵音（Howler.js）、カスタマイズ可能なショートカットキー、PWA オフライン対応。
- **AI フレンドリーな開発ドキュメント**：人間の開発者と AI コーディングエージェントの双方に向けた [アーキテクチャ](./docs/architecture.md) と [開発者ガイド](./docs/development.md) を整備しています。

---

## 🛠 技術スタック

| カテゴリ | 採用技術 |
| --- | --- |
| コア | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| UI・アニメーション | Tailwind CSS 4 · Framer Motion · Lucide React |
| 状態管理・ストレージ | Zustand 5 · Dexie.js 4 (IndexedDB) · PWA |
| クラウド同期（任意） | Supabase (`@supabase/supabase-js`) · PostgreSQL RPC |
| 音声・スピーチ | Howler.js · Web Speech Synthesis API · Doubao / Qwen TTS & ASR |

---

## 📦 クイックスタート

### 動作要件

- **Node.js** `>= 20`
- **npm** `>= 10`

### ローカル起動

```bash
# 1. リポジトリをクローン
git clone https://github.com/easybuild-jack/lingualoop.git
cd lingualoop

# 2. 依存パッケージをインストール
npm install

# 3. 開発サーバーを起動（バックエンド・環境変数は不要）
npm run dev
```

ブラウザで `http://localhost:3000` を開くとすぐに学習を始められます。

### よく使うコマンド

```bash
npm run dev       # 開発サーバーを起動
npm run build     # 本番ビルド
npm run start     # 本番サーバーを起動
npm run lint      # ESLint チェック
```

### オプション設定

| 機能 | 設定方法 |
| --- | --- |
| **AI 辞書 / AI チューター / スピーキング** | アプリ右上の「設定 → AI モデル / 音声設定」から自分の API Key を入力（ブラウザ内のみに保存） |
| **マルチデバイス同期（Supabase）** | 自身の Supabase SQL Editor で [`supabase/schema.sql`](./supabase/schema.sql) を実行し、「設定 → クラウド同期」に Project URL と Anon Key を入力 |
| **独自ドメイン（SEO）** | ビルド前に環境変数 `NEXT_PUBLIC_SITE_URL=https://your-domain.com` を指定（任意） |

---

## 📚 ドキュメント

- 📖 **[アーキテクチャ (ZH)](./docs/architecture.md)**：プロジェクト概要、機能一覧、技術スタック、全体構成図と技術方針
- 🛠 **[開発者ガイド (ZH)](./docs/development.md)**：開発者・AI エージェント向けの実装ルール、主要業務フロー、コーディング規約とチェックリスト
- 🔍 **[SEO ガイド (ZH)](./docs/seo.md)**：ブランド表記ルール、ルート別メタデータ一覧、検索エンジン登録手順
- 🎬 **[公式サンプル追加ガイド (ZH)](./docs/official-samples.md)**：内蔵リスニング動画と翻訳フレーズ集の連携仕様と検証手順

---

## 🤝 フィードバック・Issues

**Fork** してのカスタマイズやセルフホスティングを歓迎します。バグ報告や機能提案は [Issues](https://github.com/easybuild-jack/lingualoop/issues) よりお知らせください。

---

## ☕ スポンサー / コーヒーを奢る

**LinguaLoop** が英語学習や開発の役に立ちましたら、ぜひコーヒーを一杯ご支援ください！

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

このプロジェクトが気に入ったら、ぜひ **Star** で応援してください！

[![Star History Chart](https://api.star-history.com/svg?repos=easybuild-jack/lingualoop&type=Date)](https://star-history.com/#easybuild-jack/lingualoop&Date)

