import { neon } from "@neondatabase/serverless";

const { DATABASE_URL } = process.env;
let sql = null;

export function getSql() {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string in Settings → Environment."
    );
  }
  if (!sql) sql = neon(DATABASE_URL);
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
      status      TEXT        NOT NULL DEFAULT 'lobby',  -- lobby | playing | finished
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
export async function createRoom({ code, hostId, ante, isPublic }) {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO rooms (code, host_id, ante, is_public)
    VALUES (${code}, ${hostId}, ${ante}, ${isPublic})
    RETURNING *
  `;
  return row;
}

export async function listPublicRooms() {
  const sql = getSql();
  return sql`
    SELECT r.id, r.code, r.status, r.ante, r.max_players AS "maxPlayers",
           (SELECT COUNT(*)::int FROM room_players rp WHERE rp.room_id = r.id) AS "playerCount",
           h.username AS "hostName"
    FROM rooms r
    JOIN users h ON h.id = r.host_id
    WHERE r.is_public = true AND r.status IN ('lobby', 'playing')
    ORDER BY r.created_at DESC
    LIMIT 30
  `;
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
    SELECT rp.seat, rp.is_ready AS "ready", u.id, u.username, u.coins
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

export async function bumpRoom(roomId, patch) {
  const sql = getSql();
  const keys = Object.keys(patch);
  if (!keys.length) {
    await sql`UPDATE rooms SET version = version + 1, updated_at = now() WHERE id = ${roomId}`;
    return;
  }
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = keys.map((k) => patch[k]);
  await getSql()(
    `UPDATE rooms SET version = version + 1, updated_at = now(), ${sets} WHERE id = $1`,
    values.length ? [roomId, ...values] : [roomId]
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
