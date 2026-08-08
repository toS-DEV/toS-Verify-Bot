CREATE TABLE IF NOT EXISTS members (
  discord_id      TEXT PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  username        TEXT,
  joined_at       INTEGER NOT NULL,
  wrong_streak    INTEGER NOT NULL DEFAULT 0,
  cooldown_until  INTEGER NOT NULL DEFAULT 0,
  welcome_message_id TEXT,
  assigned_questions TEXT,
  updated_at      INTEGER NOT NULL
);
