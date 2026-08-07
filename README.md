# Discord 認証Bot（OAuth2ログイン + クイズ + reCAPTCHA）

## 機能

- サーバー参加時に参加時刻をDBへ保存
- Web上でDiscord OAuth2ログイン
- 選択式クイズ（全問正解が必須、出題数は`.env`で調整可）
- 全問正解後にreCAPTCHA(v2チェックボックス)検証 → 成功で認証ロール付与
- 不正解時は1分間のクールタイム（`.env`で調整可）
- 3回連続不正解で非認証ロールを自動付与（`.env`で調整可）
- 参加から24時間以内に認証ロールがつかなければ自動で非認証ロールを付与（5分おきにチェック、`.env`で調整可）
- クイズ突入時に非認証ロールの有無をチェックし、ついていればクイズをブロック。
  再挑戦するにはサーバーを一度抜けて入り直す必要がある
  （Discordはメンバーがサーバーを抜けるとロールを自動的に失うため、再参加時に自動でクイズ挑戦可能な状態にリセットされます）

## 必要な準備

### 1. Discord Developer Portal

1. https://discord.com/developers/applications で新規Applicationを作成
2. **Bot** タブでBotを作成し、TOKENを控える（`DISCORD_TOKEN`）
   - `Privileged Gateway Intents` の **SERVER MEMBERS INTENT** を必ずONにする
3. **OAuth2 → General** で `CLIENT ID` / `CLIENT SECRET` を控える
4. **OAuth2 → Redirects** に、Webサーバーの `/auth/discord/callback` のURLを登録
   （例: `http://localhost:3000/auth/discord/callback` や本番URL）
   `.env` の `DISCORD_REDIRECT_URI` と完全一致させること
5. **OAuth2 → URL Generator** で `bot` スコープ、権限は「メンバーの管理(Manage Roles)」等を選択し、
   生成されたURLでBotをサーバーに招待する
   - Botのロールは、付与したい「認証ロール」「非認証ロール」より **上位** に配置すること

### 2. サーバー側の準備

- 「認証済みロール」「非認証ロール」を作成し、それぞれのロールIDを控える
  （Discordの開発者モードをON→ロール右クリック→IDをコピー）
- 未認証ユーザーがサーバーの主要チャンネルを見えないように、
  `@everyone` のチャンネル閲覧権限をOFFにし、認証ロールに対してのみ閲覧権限を付与する運用を推奨

### 3. reCAPTCHA

- https://www.google.com/recaptcha/admin で「reCAPTCHA v2（チェックボックス）」を登録
- サイトキー・シークレットキーを取得し、Webサーバーを公開するドメイン（`localhost`も可）を登録

### 4. 環境変数

`.env.example` を `.env` にコピーして値を埋めてください。

```bash
cp .env.example .env
```

## インストール・起動

```bash
npm install
npm start
```

起動すると:
- Discord Botがログインします
- `http://localhost:3000`（`.env`の`PORT`）でWebサーバーが起動します

外部公開する場合は、リバースプロキシ（nginx等）やトンネリングサービスを使い、
`BASE_URL` / `DISCORD_REDIRECT_URI` / reCAPTCHAのドメイン設定を実際の公開URLに合わせてください。

## ファイル構成

```
discord-verify-bot/
├── index.js           # エントリーポイント（Bot起動 + Webサーバー起動）
├── discordClient.js    # Discordイベント処理・ロール操作・24h定期チェック
├── server.js           # Express: OAuth2 / クイズ / reCAPTCHA ルーティング
├── db.js                # SQLiteによるデータ永続化
├── quizData.js          # クイズ問題（ここを編集してカスタマイズ）
├── views/                # EJSテンプレート（画面）
├── public/style.css      # 共通スタイル
└── .env.example
```

## クイズ問題のカスタマイズ

`quizData.js` の `QUESTIONS` 配列を編集してください。
`answerIndex` は `choices` 配列内の正解インデックス（0始まり）です。

## 動作ロジックの補足

- 参加者データはSQLite（`data.sqlite`、自動生成）に保存されます。
- ステータスは `pending`（未認証）→ `verified`（認証済み）／`unverified`（非認証）の3種類。
- ユーザーがサーバーを退出すると付与済みロールはDiscord側で自動的に外れます。
  再参加すると `guildMemberAdd` イベントが再度発火し、DBレコードが `pending` にリセットされるため、
  非認証ロールがあってもリセットされ、再度クイズに挑戦できるようになります。
- 24時間の期限チェックは `node-cron` で5分おきに実行しています。常時起動しているプロセスが必要です
  （PM2やsystemd、Dockerなどでの永続稼働を推奨）。
