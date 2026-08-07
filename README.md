# Discord 認証Bot（OAuth2ログイン + クイズ + Turnstile）

## 機能

- サーバー参加時に参加時刻をDBへ保存
- Web上でDiscord OAuth2ログイン
- 選択式クイズ（全問正解が必須、出題数は`.env`で調整可）
- 全問正解後に Cloudflare Turnstile 検証 → 成功で認証ロール付与
- 不正解時は1分間のクールタイム（`.env`で調整可）
- 3回連続不正解で非認証ロールを自動付与（`.env`で調整可）
- 参加から24時間以内に認証ロールがつかなければ自動で非認証ロールを付与（5分おきにチェック、`.env`で調整可）
- クイズ突入時に非認証ロールの有無をチェックし、ついていればクイズをブロック。
  再挑戦するにはサーバーを一度抜けて入り直す必要がある
  （Discordはメンバーがサーバーを抜けるとロールを自動的に失うため、再参加時に自動でクイズ挑戦可能な状態にリセットされます）

---

## 必要な準備

### 1. Discord Developer Portal

1. [Discord Developer Portal](https://discord.com/developers/applications) で新規Applicationを作成
2. **Bot** タブでBotを作成し、TOKENを控える（`DISCORD_TOKEN`）
   - `Privileged Gateway Intents` の **SERVER MEMBERS INTENT** を必ずONにする
3. **OAuth2 → General** で `CLIENT ID` / `CLIENT SECRET` を控える
4. **OAuth2 → Redirects** に、Webサーバーの `/auth/discord/callback` のURLを登録
   （例: `http://localhost:3000/auth/discord/callback` や本番URL）
   `.env` の `DISCORD_REDIRECT_URI` と完全一致させること
5. **OAuth2 → URL Generator** で `bot` スコープ、権限は「メンバーの管理(Manage Roles)」等を選択し、生成されたURLでBotをサーバーに招待する
   - Botのロールは、付与したい「認証ロール」「非認証ロール」より **上位** に配置すること

### 2. サーバー側の準備

- 「認証済みロール」「非認証ロール」を作成し、それぞれのロールIDを控える
  （Discordの開発者モードをON → ロール右クリック → IDをコピー）
- 未認証ユーザーがサーバーの主要チャンネルを見えないように、`@everyone` のチャンネル閲覧権限をOFFにし、認証ロールに対してのみ閲覧権限を付与する運用を推奨

### 3. Cloudflare Turnstile

- Cloudflare ダッシュボードで「Turnstile」を登録
- サイトキー・シークレットキーを取得し、Webサーバーを公開するドメイン（`localhost`も可）を登録

### 4. 環境変数

`.env.example` を `.env` にコピーして値を埋めてください。

```bash
cp .env.example .env