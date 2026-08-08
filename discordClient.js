const { Client, GatewayIntentBits, Partials } = require('discord.js');
const cron = require('node-cron');
const db = require('./database');

const {
  GUILD_ID,
  VERIFIED_ROLE_ID,
  UNVERIFIED_ROLE_ID,
  WELCOME_CHANNEL_ID,
  BASE_URL,
  JOIN_TIMEOUT_HOURS = '24',
} = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember],
});

client.once('clientReady', () => {
  console.log(`[discord] ログイン完了: ${client.user.tag}`);
  startTimeoutChecker();
});

/**
 * ウェルカムメッセージを削除するヘルパー関数
 */
async function deleteWelcomeMessage(discordId) {
  const member = db.getMember(discordId);
  if (!member || !member.welcome_message_id || !WELCOME_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(member.welcome_message_id).catch(() => null);
      if (msg) {
        await msg.delete().catch(() => {});
        console.log(`[discord] ウェルカムメッセージを削除しました: ${member.welcome_message_id}`);
      }
    }
  } catch (e) {
    console.error('[discord] メッセージ削除エラー:', e.message);
  }
}

// メンバー参加時：ウェルカムチャンネルにのみ通知してメッセージIDをDB保存
client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== GUILD_ID) return;

  const authUrl = `${BASE_URL}/auth/discord`;
  let messageId = null;

  if (WELCOME_CHANNEL_ID) {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (channel) {
      const sentMsg = await channel.send(
        `<@${member.id}> ようこそ！サーバーを利用するには認証が必要です。\n` +
        `以下のリンクからログインし、クイズに回答してください（制限時間: ${JOIN_TIMEOUT_HOURS}時間）。\n` +
        `${authUrl}`
      ).catch(() => null);

      if (sentMsg) messageId = sentMsg.id;
    }
  }
  // DBにメッセージID含めて保存
  db.upsertJoin(member.id, member.guild.id, member.user.tag, messageId);
  console.log(`[join] ${member.user.tag} (${member.id}) が参加しました（MsgID: ${messageId}）`);
});

// メンバー退出時：メッセージを消してDBから削除
client.on('guildMemberRemove', async (member) => {
  if (member.guild.id !== GUILD_ID) return;

  await deleteWelcomeMessage(member.id);
  db.deleteMember(member.id);
  console.log(`[leave] ${member.user.tag} が退出したため、メッセージとDBレコードを削除しました`);
});

/**
 * 認証ロール付与 & メッセージ削除
 */
async function grantVerifiedRole(discordId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(discordId);
  await member.roles.add(VERIFIED_ROLE_ID);
  if (member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
    await member.roles.remove(UNVERIFIED_ROLE_ID).catch(() => {});
  }
  await deleteWelcomeMessage(discordId);
}

/**
 * 指定ユーザーに非認証ロールを付与する
 */
async function grantUnverifiedRole(discordId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(discordId);
  await member.roles.add(UNVERIFIED_ROLE_ID);
  await deleteWelcomeMessage(discordId);
}

/**
 * 指定ユーザーが現在「非認証ロール」を持っているかどうか
 */
async function hasUnverifiedRole(discordId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return false;
  return member.roles.cache.has(UNVERIFIED_ROLE_ID);
}

/**
 * 指定ユーザーが現在「認証ロール」を持っているかどうか
 */
async function hasVerifiedRole(discordId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return false;
  return member.roles.cache.has(VERIFIED_ROLE_ID);
}

/**
 * 参加から一定時間(JOIN_TIMEOUT_HOURS)経過してもまだpending(未認証)なユーザーに
 * 非認証ロールを付与する定期チェック。5分おきに実行。
 */
function startTimeoutChecker() {
  const hours = Number(JOIN_TIMEOUT_HOURS) || 24;

  cron.schedule('*/5 * * * *', async () => {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const targets = db.getPendingOlderThan(cutoff);

    for (const row of targets) {
      try {
        const alreadyVerified = await hasVerifiedRole(row.discord_id);
        if (alreadyVerified) {
          db.deleteMember(row.discord_id);
          continue;
        }
        await grantUnverifiedRole(row.discord_id);
        db.deleteMember(row.discord_id);
        console.log(`[timeout] ${row.discord_id} を24h超過のため非認証化しDBから削除しました`);
      } catch (e) {
        console.error(`[timeout] ${row.discord_id} の処理に失敗:`, e.message);
      }
    }
  });
}

module.exports = {
  client,
  grantVerifiedRole,
  grantUnverifiedRole,
  hasUnverifiedRole,
  hasVerifiedRole,
};
