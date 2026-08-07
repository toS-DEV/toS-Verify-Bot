FROM node:24.19-slim

# SQLiteのビルドに必要なツールをインストール
RUN apk add --no-stdc++ --no-cache python3 make g++

WORKDIR /app

# 依存関係のインストール（キャッシュ効率化）
COPY package*.json ./
RUN npm ci --only=production

# アプリケーションコードのコピー
COPY . .

# Webサーバーのポート（例: 3000）を開放
EXPOSE 3000

# 起動コマンド
CMD ["node", "index.js"]