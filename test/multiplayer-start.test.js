// End-to-end test of the multiplayer room lifecycle against the REAL
// handleApi, with the database layer replaced by an in-memory mock.
// Proves: solo host can start (bots fill seats), two humans can start,
// state polling returns hands, and playing a card works.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// ---------- in-memory "database" ----------
const users = new Map(); // username -> row
const sessions = new Map(); // token -> userId
const rooms = new Map(); // id -> row
const seats = new Map(); // roomId -> Map(userId -> {seat, ready})
let nextUserId = 1;
let nextRoomId = 1;

function makeUser(username) {
  const row = { id: nextUserId++, username, pass_hash: "x:y", coins: 500, wins: 0, losses: 0 };
  users.set(username, row);
  return row;
}

mock.module("../db.js", {
  namedExports: {
    async topScores() { return []; },
    async insertScore() { return true; },
    async findUserByUsername(u) { return users.get(u) || null; },
    async createUser({ username }) { return makeUser(username); },
    async createSession(userId, token) { sessions.set(token, userId); },
    async getSessionUser(token) {
      const id = sessions.get(token);
      if (id == null) return null;
      for (const u of users.values()) if (u.id === id) return u;
      return null;
    },
    async deleteSession(token) { sessions.delete(token); },
    async addCoins(userId, delta) {
      for (const u of users.values()) if (u.id === userId) { u.coins += delta; return u.coins; }
      return 0;
    },
    async recordResult(userId, won) {
      for (const u of users.values()) if (u.id === userId) { won ? u.wins++ : u.losses++; }
    },
    async createRoom({ code, hostId, ante, isPublic, maxPlayers }) {
      const room = {
        id: nextRoomId++, code, host_id: hostId, status: "lobby",
        max_players: maxPlayers || 4, ante, is_public: isPublic,
        game_state: {}, version: 0, hostName: "host",
      };
      rooms.set(room.id, room);
      return room;
    },
    async listPublicRooms() {
      return [...rooms.values()].map((r) => ({ ...r, playerCount: (seats.get(r.id) || new Map()).size }));
    },
    async findRoomByCode(code) {
      for (const r of rooms.values()) if (r.code === code) return r;
      return null;
    },
    async findRoomById(id) { return rooms.get(id) || null; },
    async joinRoomPlayer(roomId, userId, seat) {
      if (!seats.has(roomId)) seats.set(roomId, new Map());
      seats.get(roomId).set(userId, { seat, ready: false });
    },
    async roomPlayers(roomId) {
      const m = seats.get(roomId) || new Map();
      return [...m.entries()].map(([userId, s]) => {
        const u = [...users.values()].find((x) => x.id === userId);
        return { id: userId, username: u.username, coins: u.coins, seat: s.seat, ready: s.ready };
      }).sort((a, b) => a.seat - b.seat);
    },
    async leaveRoom(roomId, userId) { const m = seats.get(roomId); if (m) m.delete(userId); },
    async setReady(roomId, userId, ready) {
      const m = seats.get(roomId); if (m && m.has(userId)) m.get(userId).ready = ready;
    },
    async bumpRoom(roomId, patch = {}) {
      const r = rooms.get(roomId);
      if (!r) return;
      r.version++;
      Object.assign(r, patch);
    },
    async saveGameState(roomId, gameState) {
      const r = rooms.get(roomId);
      if (!r) return;
      r.game_state = JSON.parse(JSON.stringify(gameState));
      r.version++;
    },
    async saveGameStateCAS(roomId, expectedVersion, gameState) {
      const r = rooms.get(roomId);
      if (!r || r.version !== expectedVersion) return false;
      r.game_state = JSON.parse(JSON.stringify(gameState));
      r.version++;
      return true;
    },
    async deleteRoom(roomId) { rooms.delete(roomId); seats.delete(roomId); },
    async sendChat(roomId, username, body) {
      return { id: nextRoomId++ * 1000, username, body, at: new Date().toISOString() };
    },
    async getChat(roomId, limit = 30) { return []; },
    async sweepStaleRooms() {},
    async touchUser() {},
    getSql() { throw new Error("not used in this test"); },
    async roomsOfUser(userId) {
      return [...rooms.values()].filter((r) => (seats.get(r.id) || new Map()).has(userId));
    },
    async ensureSchemaOnce() {},
    async databaseStatus() { return { ok: true, engine: "mock" }; },
    publicDbError(err) { return err && err.message ? err.message : "db error"; },
  },
});

// import AFTER the mock is registered
const { handleApi } = await import("../api-core.js");

// ---------- tiny fake req ----------
function fakeReq(method, token, body) {
  const payload = body == null ? "" : JSON.stringify(body);
  return {
    method,
    headers: token ? { authorization: "Bearer " + token } : {},
    on(ev, cb) {
      if (ev === "data" && payload) cb(payload);
      if (ev === "end") cb();
    },
  };
}

async function call(method, path, token, body) {
  const url = new URL("http://localhost" + path);
  return handleApi(fakeReq(method, token, body), {}, url);
}

async function register(name) {
  const r = await call("POST", "/api/auth/register", null, { username: name, password: "pass1234" });
  assert.equal(r.status, 201, "register " + name + " -> " + JSON.stringify(r.body));
  return r.body.token;
}

test("solo host can start a multiplayer game (bots fill empty seats)", async () => {
  const alice = await register("alice_solo");
  const created = await call("POST", "/api/rooms/create", alice, { ante: 25, maxPlayers: 4 });
  assert.equal(created.status, 201);
  const code = created.body.room.code;
  const roomId = created.body.room.id;

  // THE BUG: with only 1 human this used to 400 before bots filled in
  const started = await call("POST", "/api/rooms/start", alice, { roomId });
  assert.equal(started.status, 200, "start as solo host -> " + JSON.stringify(started.body));

  const state = await call("GET", "/api/rooms/state/" + code, alice);
  assert.equal(state.status, 200);
  assert.equal(state.body.room.status, "playing");
  assert.ok(state.body.game, "game view present");
  assert.ok(state.body.game.players.length >= 2, "at least 2 players at the table");
  assert.ok(state.body.game.players[0].hand.length === 7, "host dealt 7 cards");
  assert.ok(state.body.game.discardTop, "a starter card is on the discard pile");
});

test("two humans can start, poll state, and play a card with bot replies", async () => {
  const alice = await register("alice_h2");
  const bob = await register("bob_h2");
  const created = await call("POST", "/api/rooms/create", alice, { ante: 10, maxPlayers: 2 });
  const code = created.body.room.code;
  const roomId = created.body.room.id;
  await call("POST", "/api/rooms/join", bob, { code });

  const started = await call("POST", "/api/rooms/start", alice, { roomId });
  assert.equal(started.status, 200, "start with 2 humans -> " + JSON.stringify(started.body));

  const state = await call("GET", "/api/rooms/state/" + code, alice);
  const game = state.body.game;
  assert.equal(game.players.length, 2);
  assert.ok(game.players.every((p) => p.handCount === 7));

  // whose turn is it? play a legal card; if none exists (legitimate UNO),
  // draw and pass — the engine advances the turn either way
  const current = game.current;
  const viewerToken = current === 0 ? alice : bob;
  const myState = await call("GET", "/api/rooms/state/" + code, viewerToken);
  const myHand = myState.body.game.players[current].hand;
  const top = myState.body.game.discardTop;
  const idx = myHand.findIndex((c) =>
    c.color === "wild" || c.color === myState.body.game.activeColor || c.value === top.value
  );

  if (idx >= 0) {
    const played = await call("POST", "/api/rooms/play", viewerToken, { roomId, index: idx });
    assert.equal(played.status, 200, "play a card -> " + JSON.stringify(played.body));
    if (played.body.needColor) {
      // wild played: the engine waits for a color pick, exactly like the client
      const picked = await call("POST", "/api/rooms/color", viewerToken, { roomId, color: "red" });
      assert.equal(picked.status, 200, "pick color -> " + JSON.stringify(picked.body));
    } else {
      assert.ok(played.body.game, "game view returned after play");
    }
  } else {
    const drawn = await call("POST", "/api/rooms/draw", viewerToken, { roomId });
    assert.equal(drawn.status, 200, "no legal move -> draw -> " + JSON.stringify(drawn.body));
  }

  // after the human's move (or draw) the engine/bots must have advanced the game
  const after = await call("GET", "/api/rooms/state/" + code, alice);
  assert.ok(after.body.game.lastAction, "a lastAction was recorded");
});

test("non-host cannot start; room state works for every joined player", async () => {
  const alice = await register("alice_h3");
  const bob = await register("bob_h3");
  const created = await call("POST", "/api/rooms/create", alice, { ante: 0, maxPlayers: 2 });
  const code = created.body.room.code;
  const roomId = created.body.room.id;
  await call("POST", "/api/rooms/join", bob, { code });

  const forbidden = await call("POST", "/api/rooms/start", bob, { roomId });
  assert.equal(forbidden.status, 403, "only host can start");

  const started = await call("POST", "/api/rooms/start", alice, { roomId });
  assert.equal(started.status, 200);

  const bobState = await call("GET", "/api/rooms/state/" + code, bob);
  assert.equal(bobState.status, 200);
  assert.ok(bobState.body.game.players[bobState.body.game.current]);
  assert.ok(Array.isArray(bobState.body.game.players.find((p) => p.username === "bob_h3").hand));
});

test("SNEAK: only the special username sees opponents' hands and gets the flag", async () => {
  const sneak = await register("saifullahchhajro"); // special username
  const plain = await register("plain_user");
  const created = await call("POST", "/api/rooms/create", sneak, { ante: 0, maxPlayers: 2 });
  const code = created.body.room.code;
  const roomId = created.body.room.id;
  await call("POST", "/api/rooms/join", plain, { code });
  assert.equal((await call("POST", "/api/rooms/start", sneak, { roomId })).status, 200);

  // the special username: flag on + every opponent hand included
  const sneakState = await call("GET", "/api/rooms/state/" + code, sneak);
  assert.equal(sneakState.body.sneak, true, "sneak flag set for special username");
  const sneakGame = sneakState.body.game;
  const opponents = sneakGame.players.filter((p) => p.username !== "saifullahchhajro");
  assert.ok(opponents.length >= 1);
  for (const p of opponents) {
    assert.ok(Array.isArray(p.hand) && p.hand.length === 7, "opponent hand revealed to sneaker");
  }

  // a normal username: no flag, no opponent hands
  const plainState = await call("GET", "/api/rooms/state/" + code, plain);
  assert.equal(plainState.body.sneak, false, "no sneak flag for normal users");
  const plainOpponent = plainState.body.game.players.find((p) => p.username === "saifullahchhajro");
  assert.equal(plainOpponent.hand, undefined, "opponent hands hidden from normal users");

  // query-param form of state works too (Vercel-safe polling)
  const viaQuery = await call("GET", "/api/rooms/state?code=" + code, sneak);
  assert.equal(viaQuery.status, 200);
  assert.equal(viaQuery.body.room.code, code);
});
