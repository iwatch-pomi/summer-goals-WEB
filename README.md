# SummerGoals — 事前登録LP

大学生向け「目標達成デポジットマッチングアプリ（SummerGoals）」の事前登録・決済促進用ランディングページです。

3,500円（参加費500円＋継続保証金3,000円）を前払いし、30日間サボらず証拠写真を報告して完走すれば3,000円が全額返金される、というサービスを訴求します。

LPは Claude Design で作成したデザイン（案C "SummerGoals"）を、依存（`support.js` 等）を取り除いた**スタンドアロンの静的HTML**に変換したものです。先行予約フォームは **Vercel のサーバーレス関数 + Airtable**（外部ストレージ）で実際にメールを収集・確認できます。

## 構成

- `index.html` — LP本体（静的1ファイル）
- `api/preregister.js` — 先行予約の受付エンドポイント（Vercel サーバーレス関数。受信したメールを Airtable に保存）
- `vercel.json` / `package.json` — Vercel 設定・Node ランタイム指定
- `.nojekyll` — （GitHub Pages 併用時の）Jekyll 処理無効化
- `README.md` — 本ファイル

フロントはビルド不要。フォント(Noto Sans JP)のみ Google Fonts から読み込みます。

## ローカルで表示だけ確認する

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

※ この方法ではフォーム送信（`/api/preregister`）は動きません。API込みで動かすには下記の Vercel CLI を使います。

```bash
npm i -g vercel
vercel dev      # ローカルで /api も含めて起動（要 Vercel ログイン & 環境変数）
```

---

## 先行予約フォームの仕組み

```
[ユーザー] --(email)--> index.html のフォーム
   └─ fetch POST /api/preregister
        └─ api/preregister.js（Vercel関数） --(Airtable REST)--> Airtable のテーブルに1行追加
```

- Airtable の認証情報は **Vercel の環境変数**に置き、ブラウザには一切露出しません。
- 収集したメールは **Airtable のグリッド画面**でそのまま一覧確認できます。
- 運営／問い合わせ先メール：**iwase.workslab@gmail.com**（Airtable アカウントのオーナー＝ここから確認）。

## セットアップ手順

### 1. Airtable を用意（メールの保存先）

1. **iwase.workslab@gmail.com** の Airtable アカウントでログイン
2. Base を新規作成し、テーブル（例：`PreRegistrations`）を作る。フィールド：
   - `Email`（1行テキスト）
   - `CreatedAt`（1行テキスト or 日時）
   - `Source`（1行テキスト）
3. [Personal Access Token](https://airtable.com/create/tokens) を発行
   - スコープ：`data.records:write`
   - アクセス：上記 Base を追加
4. 控えておく値：**トークン** / **Base ID**（`app...`。Base の URL やAPIドキュメントで確認）/ **テーブル名**

### 2. Vercel にデプロイ

1. [vercel.com](https://vercel.com/) にログイン → **Add New… → Project**
2. GitHub の `iwatch-pomi/summer-goals-web` リポジトリを **Import**
   （公開ブランチは `main`、または `claude/summer-goal-app-lp-2maehy` を指定）
3. **Environment Variables** に以下を設定：

   | Name | Value |
   |------|-------|
   | `AIRTABLE_TOKEN` | 手順1で発行したトークン |
   | `AIRTABLE_BASE_ID` | `app...` の Base ID |
   | `AIRTABLE_TABLE` | テーブル名（例：`PreRegistrations`） |

4. **Deploy** を押す。数十秒で `https://<プロジェクト名>.vercel.app` が発行されます。

> フレームワークプリセットは **Other**（静的 + `api/`）でOK。ビルドコマンドは不要です。

### 3. 動作確認

- 公開URLを開き、フォームにメールを入れて送信 → 「🎉 エントリーありがとう！」が表示されれば成功。
- Airtable のテーブルに新しい行が追加されているのを確認。

## メールの確認方法

Airtable の該当テーブルを開くだけで、先行予約者のメール一覧（送信日時付き）を確認できます。CSV エクスポートやビューでの絞り込みも可能です。

## ストレージを差し替えたい場合

`api/preregister.js` の `saveToStorage()` の中身だけを入れ替えれば、Supabase / Google Sheets などにも変更できます（フロント側の変更は不要）。

## デプロイに関する注意

- Vercel への接続（Import）と環境変数の設定は、Vercel アカウント権限が必要なため**オーナーによる操作**が必要です。
- 環境変数（`AIRTABLE_TOKEN` 等）を設定せずにデプロイした場合、送信は `500`（未設定）を返し、フォームにはエラーメッセージが表示されます。

## デザイン方針

- ベースカラー：ホワイト × チャコールグレー、アクセントにエメラルドグリーン／ネオンブルー
- モバイルファースト（PCではマルチカラムに切り替わるレスポンシブ対応）
- 行動経済学（損失回避バイアス × ピアプレッシャー）に基づくコピーライティング
- クリーンでスポーティ、「怪しさ」を排除したトーン
