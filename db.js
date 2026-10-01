import { neon } from "@neondatabase/serverless";

// Vercel’s Neon integration writes several of these. Read them when a query
// runs so a value added after import (or via .env) is still picked up.
const CONNECTION_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
];

export function normalizeConnectionString(value) {
  if (value == null) return "";
  let s = String(value).replace(/^\uFEFF/, "").trim();
  s = s.replace(/^(?:DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL)\s*=\s*/i, "").trim();
  const unquote = (v) =>
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      ? v.slice(1, -1).trim()
      : v;
  s = unquote(s);
  s = s.replace(/^psql\s+/i, "").trim();
  return unquote(s);
}

export function resolveConnectionString(env = process.env) {
  for (const key of CONNECTION_ENV_KEYS) {
    const url = normalizeConnectionString(env[key]);
    if (url) return { url, source: key };
  }
  return { url: "", source: null };
}

export function publicDbError(err) {
  const raw = String(err?.message || err || "Database error");
  const message = raw.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***");
  if (/not a valid URL/i.test(message) || /should be: postgresql:\/\//i.test(message)) {
    return "DATABASE_URL is set, but it is not a valid Neon connection string. Paste only the postgresql:// URL from the Neon dashboard, without quotes. If the password contains @ # or %, URL-encode it.";
  }
  if (/DATABASE_URL is not set/i.test(message) || /No database connection string/i.test(message)) {
    return "DATABASE_URL is not set on this deployment. In Vercel open Settings → Environment Variables, add DATABASE_URL for Production (the pooled Neon URL), save, then redeploy. A deploy from before the variable was saved will not see it.";
  }
  return message;
}

let sql = null;
let sqlUrl = null;

export function getSql() {
  const { url } = resolveConnectionString();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string in Settings → Environment."
    );
  }
  if (!sql || sqlUrl !== url) {
    sql = neon(url);
    sqlUrl = url;
  }
  return sql;
}

export async function ensureSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS scores (
      id          SERIAL PRIMARY KEY,
      player_name TEXT        NOT NULL,
      score       INTEGER     NOT NULL,
      rounds      INTEGER     NOT NULL DEFAULT 1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS scores_score_idx ON scores (score DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT        NOT NULL UNIQUE,
      pass_hash     TEXT        NOT NULL,
      coins         INTEGER     NOT NULL DEFAULT 500,
      wins          INTEGER     NOT NULL DEFAULT 0,
      losses        INTEGER     NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS rooms (
      id          SERIAL PRIMARY KEY,
      code        TEXT        NOT NULL UNIQUE,
      host_id     INTEGER     NOT NULL REFERENCES users(id),
      status      TEXT        NOT NULL DEFAULT 'lobby',
      max_players INTEGER     NOT NULL DEFAULT 4,
      ante        INTEGER     NOT NULL DEFAULT 25,
      is_public   BOOLEAN     NOT NULL DEFAULT true,
      game_state  JSONB       NOT NULL DEFAULT '{}'::jsonb,
      version     INTEGER     NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS room_players (
      id        SERIAL PRIMARY KEY,
      room_id   INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id),
      seat      INTEGER NOT NULL,
      is_ready  BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (room_id, user_id),
      UNIQUE (room_id, seat)
    )
  `;

  await sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS turn_seconds INTEGER NOT NULL DEFAULT 30`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ`;

  await sql`
    CREATE TABLE IF NOT EXISTS friendships (
      id           SERIAL PRIMARY KEY,
      requester_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT        NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (requester_id, addressee_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind         TEXT        NOT NULL,
      from_user_id INTEGER,
      from_name    TEXT        NOT NULL DEFAULT '',
      room_code    TEXT,
      is_read      BOOLEAN     NOT NULL DEFAULT false,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS room_chat (
      id         SERIAL PRIMARY KEY,
      room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      username   TEXT    NOT NULL,
      body       TEXT    NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

// ---------- room chat ----------
export async function sendChat(roomId, username, body) {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO room_chat (room_id, username, body)
    VALUES (${roomId}, ${username}, ${body})
    RETURNING id, username, body, created_at AS "at"
  `;
  return row;
}

export async function getChat(roomId, limit = 30) {
  const sql = getSql();
  const rows = await sql`
    SELECT id, username, body, created_at AS "at"
    FROM room_chat
    WHERE room_id = ${roomId}
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows.reverse();
}

// run schema setup at most once per serverless instance
let schemaPromise = null;
export function ensureSchemaOnce() {
  if (!schemaPromise) {
    schemaPromise = ensureSchema().catch((err) => {
      schemaPromise = null; // allow retry on next request
      throw err;
    });
  }
  return schemaPromise;
}

export async function databaseStatus() {
  const { url, source } = resolveConnectionString();
  if (!url) {
    return {
      ok: false,
      error: publicDbError(new Error("DATABASE_URL is not set")),
    };
  }
  try {
    await ensureSchemaOnce();
    const sql = getSql();
    await sql`SELECT 1 AS ok`;
    return { ok: true, via: source };
  } catch (err) {
    return { ok: false, via: source, error: publicDbError(err) };
  }
}

// ---------- scores (v1 leaderboard) ----------
export async function topScores(limit = 10) {
  const sql = getSql();
  return sql`
    SELECT id, player_name AS "player", score, rounds,
           to_char(created_at, 'YYYY-MM-DD HH24:MI') AS "playedAt"
    FROM scores
    ORDER BY score DESC, created_at ASC
    LIMIT ${limit}
  `;
}

export async function insertScore({ player, score, rounds }) {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO scores (player_name, score, rounds)
    VALUES (${player}, ${score}, ${rounds})
    RETURNING id, player_name AS "player", score, rounds
  `;
  return row;
}

// ---------- users / sessions ----------
export async function findUserByUsername(username) {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM users WHERE lower(username) = lower(${username})`;
  return row || null;
}

export async function findUserById(id) {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM users WHERE id = ${id}`;
  return row || null;
}

export async function createUser({ username, passHash }) {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO users (username, pass_hash)
    VALUES (${username}, ${passHash})
    RETURNING id, username, coins, wins, losses
  `;
  return row;
}

export async function createSession(userId, token) {
  const sql = getSql();
  await sql`
    INSERT INTO sessions (token, user_id) VALUES (${token}, ${userId})
  `;
}

export async function getSessionUser(token) {
  if (!token) return null;
  const sql = getSql();
  const [row] = await sql`
    SELECT u.id, u.username, u.coins, u.wins, u.losses
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now()
  `;
  return row || null;
}

export async function deleteSession(token) {
  const sql = getSql();
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

export async function addCoins(userId, delta) {
  const sql = getSql();
  const [row] = await sql`
    UPDATE users SET coins = GREATEST(0, coins + ${delta}) WHERE id = ${userId}
    RETURNING coins
  `;
  return row ? row.coins : 0;
}

export async function recordResult(userId, won) {
  const sql = getSql();
  await sql`
    UPDATE users
    SET wins = wins + ${won ? 1 : 0}, losses = losses + ${won ? 0 : 1}
    WHERE id = ${userId}
  `;
}

// ---------- rooms ----------
export async function createRoom({ code, hostId, ante, isPublic, maxPlayers, turnSeconds }) {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO rooms (code, host_id, ante, is_public, max_players, turn_seconds)
    VALUES (${code}, ${hostId}, ${ante}, ${isPublic}, ${maxPlayers || 4}, ${turnSeconds || 30})
    RETURNING *
  `;
  return row;
}

export async function listPublicRooms() {
  const sql = getSql();
  return sql`
    SELECT r.id, r.code, r.status, r.ante, r.max_players AS "maxPlayers",
           r.turn_seconds AS "turnSeconds",
           (SELECT COUNT(*)::int FROM room_players rp
              JOIN users pu ON pu.id = rp.user_id
              WHERE rp.room_id = r.id AND NOT starts_with(pu.username, 'BOT_')) AS "playerCount",
           h.username AS "hostName"
    FROM rooms r
    JOIN users h ON h.id = r.host_id
    WHERE r.is_public = true AND r.status IN ('lobby', 'playing')
    ORDER BY (r.status = 'lobby') DESC, r.created_at DESC
    LIMIT 40
  `;
}

// Rooms nobody is using any more. Runs opportunistically from list/create, so
// no cron is needed. Cascades remove players and chat.
export async function sweepStaleRooms() {
  const sql = getSql();
  await sql`
    DELETE FROM rooms r
    WHERE (r.status = 'lobby' AND r.updated_at < now() - INTERVAL '30 minutes')
       OR (r.status = 'finished' AND r.updated_at < now() - INTERVAL '10 minutes')
       OR (r.status = 'playing' AND r.updated_at < now() - INTERVAL '60 minutes')
       OR (r.created_at < now() - INTERVAL '1 minute' AND NOT EXISTS (
            SELECT 1 FROM room_players rp JOIN users u ON u.id = rp.user_id
            WHERE rp.room_id = r.id AND NOT starts_with(u.username, 'BOT_')))
  `;
}

export async function roomsOfUser(userId) {
  const sql = getSql();
  return sql`
    SELECT r.*, h.username AS "hostName"
    FROM room_players rp
    JOIN rooms r ON r.id = rp.room_id
    JOIN users h ON h.id = r.host_id
    WHERE rp.user_id = ${userId}
  `;
}

export async function touchUser(userId) {
  const sql = getSql();
  await sql`UPDATE users SET last_seen = now() WHERE id = ${userId}`;
}

export async function findRoomByCode(code) {
  const sql = getSql();
  const [row] = await sql`
    SELECT r.*, h.username AS "hostName"
    FROM rooms r JOIN users h ON h.id = r.host_id
    WHERE r.code = ${code}
  `;
  return row || null;
}

export async function findRoomById(id) {
  const sql = getSql();
  const [row] = await sql`
    SELECT r.*, h.username AS "hostName"
    FROM rooms r JOIN users h ON h.id = r.host_id
    WHERE r.id = ${id}
  `;
  return row || null;
}

export async function joinRoomPlayer(roomId, userId, seat) {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO room_players (room_id, user_id, seat)
    VALUES (${roomId}, ${userId}, ${seat})
    RETURNING *
  `;
  return row;
}

export async function roomPlayers(roomId) {
  const sql = getSql();
  return sql`
    SELECT rp.seat, rp.is_ready AS "ready", u.id, u.username, u.coins,
           (u.last_seen IS NOT NULL AND u.last_seen > now() - INTERVAL '25 seconds') AS "online"
    FROM room_players rp JOIN users u ON u.id = rp.user_id
    WHERE rp.room_id = ${roomId}
    ORDER BY rp.seat
  `;
}

export async function leaveRoom(roomId, userId) {
  const sql = getSql();
  await sql`
    DELETE FROM room_players WHERE room_id = ${roomId} AND user_id = ${userId}
  `;
}

export async function setReady(roomId, userId, ready) {
  const sql = getSql();
  await sql`
    UPDATE room_players SET is_ready = ${ready}
    WHERE room_id = ${roomId} AND user_id = ${userId}
  `;
}

const ROOM_PATCH_COLUMNS = new Set(["status", "host_id", "ante", "is_public", "max_players"]);

export async function bumpRoom(roomId, patch = {}) {
  const sql = getSql();
  const keys = Object.keys(patch).filter((k) => ROOM_PATCH_COLUMNS.has(k));
  if (!keys.length) {
    await sql`UPDATE rooms SET version = version + 1, updated_at = now() WHERE id = ${roomId}`;
    return;
  }
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = keys.map((k) => patch[k]);
  await sql.query(
    `UPDATE rooms SET version = version + 1, updated_at = now(), ${sets} WHERE id = $1`,
    [roomId, ...values]
  );
}

export async function saveGameState(roomId, gameState) {
  const sql = getSql();
  await sql`
    UPDATE rooms
    SET game_state = ${JSON.stringify(gameState)}::jsonb,
        version = version + 1,
        updated_at = now()
    WHERE id = ${roomId}
  `;
}

// optimistic lock: only saves if nobody else changed the room first.
// returns true when the save landed, false on a concurrent-edit conflict.
export async function saveGameStateCAS(roomId, expectedVersion, gameState) {
  const sql = getSql();
  const rows = await sql`
    UPDATE rooms
    SET game_state = ${JSON.stringify(gameState)}::jsonb,
        version = version + 1,
        updated_at = now()
    WHERE id = ${roomId} AND version = ${expectedVersion}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteRoom(roomId) {
  const sql = getSql();
  await sql`DELETE FROM rooms WHERE id = ${roomId}`;
}
