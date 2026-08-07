const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DBファイルのパスを指定
const dbPath = path.join(__dirname, 'db', 'data.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// schema.sql からテーブル定義を読み込んで実行
const schemaPath = path.join(__dirname, 'db', 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

/**
 * 参加時（再参加含む）に呼ぶ。既存レコードがあってもリセットする。
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

function deleteMember(discordId) {
  db.prepare(`DELETE FROM members WHERE discord_id = ?`).run(discordId);
}

module.exports = {
  upsertJoin,
  getMember,
  setStatus,
  incrementWrongStreak,
  resetWrongStreak,
  setCooldown,
  getPendingOlderThan,
  deleteMember,
};
