require('dotenv').config();
const { client, grantVerifiedRole, grantUnverifiedRole, hasUnverifiedRole, hasVerifiedRole } = require('./discordClient');
const createServer = require('./server');

const PORT = process.env.PORT || 3000;

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error('[discord] ログインに失敗しました。DISCORD_TOKENを確認してください。', e);
  process.exit(1);
});

const app = createServer({
  grantVerifiedRole,
  grantUnverifiedRole,
  hasUnverifiedRole,
  hasVerifiedRole,
});

app.listen(PORT, () => {
  console.log(`[web] http://localhost:${PORT} で起動しました`);
});
