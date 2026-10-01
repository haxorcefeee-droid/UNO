import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";

// Runs against in-memory Postgres: `npm test` preloads scripts/dev-db/register.mjs.
process.env.DATABASE_URL ||= "postgresql://local:local@localhost/uno";
const { handleApi } = await import("../api-core.js");
const { getSql } = await import("../db.js");

async function call(method, path, body, token) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.method = method;
  req.headers = token ? { authorization: "Bearer " + token } : {};
  const res = await handleApi(req, {}, new URL(path, "http://localhost"));
  return res;
}

const suffix = Math.random().toString(36).slice(2, 6);
async function signUp(name) {
  const r = await call("POST", "/api/auth/register", { username: `${name}_${suffix}`, password: "pass1234" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { token: r.body.token, id: r.body.user.id, name: r.body.user.username };
}

test("friend requests, acceptance, presence and notifications", async () => {
  const a = await signUp("alice");
  const b = await signUp("bobby");
  const c = await signUp("carol");

  let r = await call("POST", "/api/social/request", { username: "nobody_here" }, a.token);
  assert.equal(r.status, 404);
  r = await call("POST", "/api/social/request", { username: a.name }, a.token);
  assert.equal(r.status, 400);

  r = await call("POST", "/api/social/request", { username: b.name.toUpperCase() }, a.token);
  assert.equal(r.status, 201);
  r = await call("POST", "/api/social/request", { username: b.name }, a.token);
  assert.equal(r.status, 409);

  let sync = await call("GET", "/api/social/sync", null, b.token);
  assert.equal(sync.body.requests.length, 1);
  assert.equal(sync.body.requests[0].from, a.name);
  assert.ok(sync.body.notifications.some((n) => n.kind === "friend_request" && n.from === a.name));

  r = await call("POST", "/api/social/respond", { id: sync.body.requests[0].id, accept: true }, b.token);
  assert.equal(r.status, 200);

  sync = await call("GET", "/api/social/sync", null, a.token);
  assert.ok(sync.body.notifications.some((n) => n.kind === "friend_accepted" && n.from === b.name));
  const bob = sync.body.friends.find((f) => f.id === b.id);
  assert.ok(bob, "bob appears in alice's friends");
  assert.equal(bob.online, true, "bob synced a moment ago so he is online");

  await call("POST", "/api/social/request", { username: c.name }, a.token);
  const csync = await call("GET", "/api/social/sync", null, c.token);
  await call("POST", "/api/social/respond", { id: csync.body.requests[0].id, accept: true }, c.token);
  await getSql()`UPDATE users SET last_seen = now() - INTERVAL '5 minutes' WHERE id = ${c.id}`;
  sync = await call("GET", "/api/social/sync", null, a.token);
  assert.equal(sync.body.friends.find((f) => f.id === c.id).online, false);

  r = await call("POST", "/api/rooms/create", { ante: 0, maxPlayers: 2, turnSeconds: 45 }, a.token);
  assert.equal(r.status, 201);
  assert.equal(r.body.room.ante, 0, "zero bet is allowed");
  assert.equal(r.body.room.turnSeconds, 45);
  const code = r.body.room.code;

  r = await call("POST", "/api/social/invite", { friendId: c.id, code }, a.token);
  assert.equal(r.status, 409, "offline friends cannot be invited");
  r = await call("POST", "/api/social/invite", { friendId: b.id, code }, a.token);
  assert.equal(r.status, 200);

  sync = await call("GET", "/api/social/sync", null, b.token);
  const invite = sync.body.notifications.find((n) => n.kind === "invite");
  assert.equal(invite.code, code);
  await call("POST", "/api/social/ack", { ids: [invite.id] }, b.token);
  sync = await call("GET", "/api/social/sync", null, b.token);
  assert.ok(!sync.body.notifications.some((n) => n.kind === "invite"));

  r = await call("POST", "/api/rooms/join", { code }, b.token);
  assert.equal(r.status, 200);

  r = await call("POST", "/api/social/remove", { friendId: b.id }, a.token);
  sync = await call("GET", "/api/social/sync", null, a.token);
  assert.ok(!sync.body.friends.some((f) => f.id === b.id));
});

test("creating a room clears your previous rooms and stale rooms disappear", async () => {
  const a = await signUp("host");
  let r = await call("POST", "/api/rooms/create", { ante: 10, maxPlayers: 3, turnSeconds: 15 }, a.token);
  const first = r.body.room.code;
  r = await call("POST", "/api/rooms/create", { ante: 10, maxPlayers: 3, turnSeconds: 999 }, a.token);
  assert.equal(r.body.room.turnSeconds, 30, "unknown turn time falls back to 30s");
  const second = r.body.room.code;

  r = await call("GET", "/api/rooms/state?code=" + first, null, a.token);
  assert.equal(r.status, 404, "previous room was removed");

  r = await call("GET", "/api/rooms/list", null, a.token);
  const mine = r.body.rooms.find((x) => x.code === second);
  assert.ok(mine);
  assert.equal(mine.turnSeconds, 30);
  assert.equal(mine.playerCount, 1);

  await getSql()`UPDATE rooms SET updated_at = now() - INTERVAL '2 hours' WHERE code = ${second}`;
  r = await call("GET", "/api/rooms/list", null, a.token);
  assert.ok(!r.body.rooms.some((x) => x.code === second), "stale lobby swept");
});

test("an idle player's turn is played by the server when the clock runs out", async () => {
  const a = await signUp("idle");
  let r = await call("POST", "/api/rooms/create", { ante: 0, maxPlayers: 2, turnSeconds: 15 }, a.token);
  const code = r.body.room.code;
  r = await call("POST", "/api/rooms/start", { roomId: r.body.room.id }, a.token);
  assert.equal(r.status, 200);

  r = await call("GET", "/api/rooms/state?code=" + code, null, a.token);
  const before = r.body.game;
  if (before.players[before.current].username !== a.name) return; // bot opened with an action card
  const myCountBefore = before.players[before.current].handCount;

  await getSql()`
    UPDATE rooms SET game_state = jsonb_set(game_state, '{lastAction}',
      COALESCE(game_state->'lastAction', '{}'::jsonb) || jsonb_build_object('at', 1000))
    WHERE code = ${code}`;
  r = await call("GET", "/api/rooms/state?code=" + code, null, a.token);
  const after = r.body.game;
  const me = after.players.find((p) => p.username === a.name);
  assert.ok(me.handCount >= myCountBefore || after.current !== before.current, "server acted for the idle player");
});
