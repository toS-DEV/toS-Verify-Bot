const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS members (
  discord_id      TEXT PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  username        TEXT,
  joined_at       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | verified | unverified
  wrong_streak    INTEGER NOT NULL DEFAULT 0,
  cooldown_until  INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);
`);

/**
 * 参加時（再参加含む）に呼ぶ。既存レコードがあってもリセットする。
 * これにより「非認証ロールがついた状態で再挑戦したい場合はサーバーに入り直す」
 * という仕様を、Discordがロールを自動で外してくれる仕様と組み合わせて実現する。
 */
function upsertJoin(discordId, guildId, username) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO members (discord_id, guild_id, username, joined_at, status, wrong_streak, cooldown_until, updated_at)
    VALUES (@discordId, @guildId, @username, @now, 'pending', 0, 0, @now)
    ON CONFLICT(discord_id) DO UPDATE SET
      guild_id = @guildId,
      username = @username,
      joined_at = @now,
      status = 'pending',
      wrong_streak = 0,
      cooldown_until = 0,
      updated_at = @now
  `).run({ discordId, guildId, username, now });
}

function getMember(discordId) {
  return db.prepare(`SELECT * FROM members WHERE discord_id = ?`).get(discordId);
}

function setStatus(discordId, status) {
  db.prepare(`UPDATE members SET status = ?, updated_at = ? WHERE discord_id = ?`)
    .run(status, Date.now(), discordId);
}

function incrementWrongStreak(discordId) {
  db.prepare(`UPDATE members SET wrong_streak = wrong_streak + 1, updated_at = ? WHERE discord_id = ?`)
    .run(Date.now(), discordId);
  return getMember(discordId).wrong_streak;
}

function resetWrongStreak(discordId) {
  db.prepare(`UPDATE members SET wrong_streak = 0, updated_at = ? WHERE discord_id = ?`)
    .run(Date.now(), discordId);
}

function setCooldown(discordId, untilTimestampMs) {
  db.prepare(`UPDATE members SET cooldown_until = ?, updated_at = ? WHERE discord_id = ?`)
    .run(untilTimestampMs, Date.now(), discordId);
}

function getPendingOlderThan(cutoffTimestampMs) {
  return db.prepare(`SELECT * FROM members WHERE status = 'pending' AND joined_at < ?`)
    .all(cutoffTimestampMs);
}

module.exports = {
  upsertJoin,
  getMember,
  setStatus,
  incrementWrongStreak,
  resetWrongStreak,
  setCooldown,
  getPendingOlderThan,
};
