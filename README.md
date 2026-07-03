# SummerGoals — 事前登録LP

大学生向け「目標達成デポジットマッチングアプリ（SummerGoals）」の事前登録・決済促進用ランディングページです。

3,500円（参加費500円＋継続保証金3,000円）を前払いし、30日間サボらず証拠写真を報告して完走すれば3,000円が全額返金される、というサービスを訴求します。

LPは Claude Design で作成したデザイン（案C "SummerGoals"）を、依存（`support.js` 等）を取り除いた**スタンドアロンの静的HTML**に変換したものです。先行予約フォームは **Vercel のサーバーレス関数 + Supabase**（外部ストレージ）で実際にメールを収集・確認できます。

## 構成

- `index.html` — LP本体（静的1ファイル）
- `api/preregister.js` — 先行予約の受付エンドポイント（Vercel サーバーレス関数。受信したメールを Supabase に保存）
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
        └─ api/preregister.js（Vercel関数） --(Supabase REST)--> Supabase のテーブルに1行追加
```

- Supabase の `service_role` キーは **Vercel の環境変数**に置き、ブラウザには一切露出しません。
- 収集したメールは **Supabase の Table Editor**でそのまま一覧確認できます。
- 運営／問い合わせ先メール：**iwase.workslab@gmail.com**（Supabase アカウントのオーナー＝ここから確認）。

## セットアップ手順

### 1. Supabase を用意（メールの保存先）

1. **iwase.workslab@gmail.com** の Supabase アカウントでログインし、**New project** を作成
2. **SQL Editor** で下記を実行してテーブルを作成：

   ```sql
   create table if not exists preregistrations (
     id          bigint generated always as identity primary key,
     email       text not null,
     source      text,
     created_at  timestamptz not null default now()
   );
   ```

3. **Project Settings → API** で以下を控える：
   - **Project URL**（例：`https://xxxx.supabase.co`）
   - **`service_role` キー**（`Project API keys` の service_role。**秘密鍵**なので取り扱い注意）

   > `service_role` キーは RLS（行レベルセキュリティ）を迂回して書き込めます。**サーバー側（Vercel関数）専用**で、フロントには絶対に置きません。本構成ではこのキーで挿入するため、テーブルの RLS 設定に関わらず動作します。

### 2. Vercel にデプロイ

1. [vercel.com](https://vercel.com/) にログイン → **Add New… → Project**
2. GitHub の `iwatch-pomi/summer-goals-web` リポジトリを **Import**
   （公開ブランチは `main`、または `claude/summer-goal-app-lp-2maehy` を指定）
3. **Environment Variables** に以下を設定：

   | Name | Value |
   |------|-------|
   | `SUPABASE_URL` | Project URL（`https://xxxx.supabase.co`） |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` キー |
   | `SUPABASE_TABLE` | テーブル名（未設定なら `preregistrations`） |

4. **Deploy** を押す。数十秒で `https://<プロジェクト名>.vercel.app` が発行されます。

> フレームワークプリセットは **Other**（静的 + `api/`）でOK。ビルドコマンドは不要です。

### 3. 動作確認

- 公開URLを開き、フォームにメールを入れて送信 → 「🎉 エントリーありがとう！」が表示されれば成功。
- Supabase の **Table Editor → preregistrations** に新しい行が追加されているのを確認。

## メールの確認方法

Supabase の **Table Editor** で該当テーブルを開くだけで、先行予約者のメール一覧（送信日時付き）を確認できます。SQL Editor での絞り込みや CSV エクスポートも可能です。

## ストレージを差し替えたい場合

`api/preregister.js` の `saveToStorage()` の中身だけを入れ替えれば、Airtable / Google Sheets などにも変更できます（フロント側の変更は不要）。

## デプロイに関する注意

- Vercel への接続（Import）と環境変数の設定は、Vercel アカウント権限が必要なため**オーナーによる操作**が必要です。
- 環境変数（`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）を設定せずにデプロイした場合、送信は `500`（未設定）を返し、フォームにはエラーメッセージが表示されます。

## デザイン方針

- ベースカラー：ホワイト × チャコールグレー、アクセントにエメラルドグリーン／ネオンブルー
- モバイルファースト（PCではマルチカラムに切り替わるレスポンシブ対応）
- 行動経済学（損失回避バイアス × ピアプレッシャー）に基づくコピーライティング
- クリーンでスポーティ、「怪しさ」を排除したトーン
