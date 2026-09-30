// Shared API core used by both server.js (dev/Freebuff) and api/index.js (Vercel).
import crypto from "node:crypto";
import {
  topScores, insertScore,
  findUserByUsername, createUser, createSession,
  getSessionUser, deleteSession, addCoins, recordResult,
  createRoom, listPublicRooms, findRoomByCode, findRoomById,
  joinRoomPlayer, roomPlayers, leaveRoom, setReady, bumpRoom,
  saveGameState, saveGameStateCAS, deleteRoom,
} from "./db.js";
import {
  newGame, playCard, pickColor, drawTurn, passTurn,
  botMove, legalMoves,
} from "./uno-engine.js";

// ---------- helpers ----------
export function json(status, body) {
  return { status, body };
}

export function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 20_000) { resolve({}); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
  } catch { return false; }
}

export function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function tokenFromReq(req, url) {
  let token = url.searchParams.get("token");
  const header = req.headers.authorization;
  if (!token && header && header.startsWith("Bearer ")) token = header.slice(7);
  if (!token) {
    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)uno_token=([a-f0-9]+)/);
    if (m) token = m[1];
  }
  return token;
}

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export function publicGameView(game, viewerId) {
  if (!game) return null;
  return {
    current: game.current,
    dir: game.dir,
    activeColor: game.activeColor,
    awaitingColor: game.awaitingColor,
    winner: game.winner,
    deckCount: game.deck.length,
    discardTop: game.discard[game.discard.length - 1] || null,
    discardCount: game.discard.length,
    lastAction: game.lastAction,
    payout: game.payout || null,
    players: game.players.map((p) => ({
      username: p.username,
      isBot: p.isBot,
      handCount: p.hand.length,
      hand: p.userId === viewerId ? p.hand : undefined,
    })),
  };
}

// ---------- bots ----------
const botCache = new Map();
export async function findOrCreateBot() {
  const name = "BOT_" + Math.random().toString(36).slice(2, 7).toUpperCase();
  if (botCache.has(name)) return botCache.get(name);
  let bot = await findUserByUsername(name);
  if (!bot) {
    bot = await createUser({ username: name, passHash: hashPassword(crypto.randomBytes(8).toString("hex")) });
    await addCoins(bot.id, 1000);
  }
  botCache.set(name, bot);
  return bot;
}

// ---------- room game loop ----------
async function settleRound(room, game) {
  const winner = game.winner;
  if (winner == null) return;
  const players = await roomPlayers(room.id);
  const pot = room.ante * players.length;
  const rake = Math.floor(pot * 0.1);
  const payout = pot - rake;
  const winnerPlayer = game.players[winner];
  if (winnerPlayer && !winnerPlayer.isBot) {
    await addCoins(winnerPlayer.userId, payout);
    await recordResult(winnerPlayer.userId, true);
  }
  for (const p of game.players) {
    if (p.isBot || (winnerPlayer && p.userId === winnerPlayer.userId)) continue;
    await addCoins(p.userId, -room.ante);
    await recordResult(p.userId, false);
  }
  game.payout = { winnerSeat: winner, payout };
}

export async function runBotsAndSettle(room) {
  const game = room.game_state && room.game_state.deck ? room.game_state : null;
  if (!game || game.winner !== null) return;
  let acted = false;
  let guard = 0;
  while (guard++ < 50) {
    const p = game.players[game.current];
    if (!p || !p.isBot) break;
    if (game.awaitingColor === game.current) {
      const mv = botMove(game, game.current);
      pickColor(game, game.current, mv.color);
      acted = true;
      continue;
    }
    if (game.awaitingColor !== null) break; // a human must pick a color

    const mv = botMove(game, game.current);
    if (mv.type === "play") {
      playCard(game, game.current, mv.index, null);
      acted = true;
      continue; // may open awaitingColor for the bot itself
    }
    if (mv.type === "draw") {
      drawTurn(game, game.current);
      acted = true;
      const seat = game.current;
      const playable = legalMoves(game, seat);
      if (playable.length) {
        const idx = game.players[seat].hand.indexOf(playable[0]);
        playCard(game, seat, idx, null);
      } else if (game.current === seat) {
        passTurn(game, seat);
      }
      continue;
    }
    break;
  }
  if (acted) {
    if (game.winner !== null) await settleRound(room, game);
    await saveGameState(room.id, game);
  }
}

// ---------- main API handler (framework-agnostic) ----------
export async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const body = req.method === "POST" || req.method === "PUT" ? await readBody(req) : {};

  try {
    // ----- health -----
    if (url.pathname === "/api/health") return json(200, { ok: true });

    // ----- auth (public) -----
    if (parts[1] === "auth") {
      if (parts[2] === "register" && req.method === "POST") {
        const username = String(body.username || "").trim();
        const password = String(body.password || "");
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) return json(400, { error: "Name must be 3–16 letters, numbers or _" });
        if (password.length < 4) return json(400, { error: "Password must be 4+ characters" });
        if (await findUserByUsername(username)) return json(409, { error: "That name is taken" });
        const user = await createUser({ username, passHash: hashPassword(password) });
        const token = newToken();
        await createSession(user.id, token);
        return json(201, { token, user });
      }
      if (parts[2] === "login" && req.method === "POST") {
        const username = String(body.username || "").trim();
        const password = String(body.password || "");
        const row = await findUserByUsername(username);
        if (!row || !verifyPassword(password, row.pass_hash)) return json(401, { error: "Wrong name or password" });
        const token = newToken();
        await createSession(row.id, token);
        return json(200, { token, user: { id: row.id, username: row.username, coins: row.coins, wins: row.wins, losses: row.losses } });
      }
      if (parts[2] === "me" && req.method === "GET") {
        const user = await getSessionUser(tokenFromReq(req, url));
        if (!user) return json(401, { error: "Not signed in" });
        return json(200, { user });
      }
      if (parts[2] === "logout" && req.method === "POST") {
        const token = tokenFromReq(req, url);
        if (token) await deleteSession(token);
        return json(200, { ok: true });
      }
    }

    // ----- scores (public) -----
    if (parts[1] === "scores") {
      if (req.method === "GET") {
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1), 50);
        return json(200, { scores: await topScores(limit) });
      }
      if (req.method === "POST") {
        const player = String(body.player || "Player").trim().slice(0, 24) || "Player";
        const score = Math.max(0, Math.min(Number(body.score) || 0, 999_999));
        const rounds = Math.max(1, Math.min(Number(body.rounds) || 1, 100));
        return json(201, { saved: await insertScore({ player, score, rounds }) });
      }
    }

    // ----- everything below needs auth -----
    const user = await getSessionUser(tokenFromReq(req, url));
    if (!user) return json(401, { error: "Sign in required" });

    // ----- coins -----
    if (parts[1] === "coins" && req.method === "POST") {
      const delta = Math.max(-500, Math.min(Number(body.delta) || 0, 500));
      const coins = await addCoins(user.id, delta);
      return json(200, { coins });
    }

    // ----- rooms -----
    if (parts[1] === "rooms") {
      if (parts[2] === "list" && req.method === "GET") {
        return json(200, { rooms: await listPublicRooms() });
      }

      if (parts[2] === "create" && req.method === "POST") {
        const ante = Math.max(0, Math.min(Number(body.ante) || 25, 500));
        const isPublic = body.isPublic !== false;
        const maxPlayers = Math.max(2, Math.min(Number(body.maxPlayers) || 4, 4));
        if (user.coins < ante) return json(400, { error: "Not enough coins for that ante" });
        let code = roomCode();
        for (let i = 0; i < 5; i++) {
          if (!(await findRoomByCode(code))) break;
          code = roomCode();
        }
        const room = await createRoom({ code, hostId: user.id, ante, isPublic });
        await joinRoomPlayer(room.id, user.id, 0);
        return json(201, { room: { ...room, hostName: user.username } });
      }

      if (parts[2] === "join" && req.method === "POST") {
        const room = await findRoomByCode(String(body.code || parts[3] || "").toUpperCase());
        if (!room) return json(404, { error: "Room not found" });
        if (room.status === "finished") return json(400, { error: "Room already finished" });
        const players = await roomPlayers(room.id);
        const already = players.find((p) => p.id === user.id);
        if (already) return json(200, { room, seat: already.seat });
        if (players.length >= room.max_players) return json(400, { error: "Room is full" });
        if (room.status === "playing") return json(400, { error: "Game already in progress" });
        if (user.coins < room.ante) return json(400, { error: "Not enough coins for that ante" });
        const used = players.map((p) => p.seat);
        let seat = 0;
        while (used.includes(seat)) seat++;
        await joinRoomPlayer(room.id, user.id, seat);
        await bumpRoom(room.id);
        return json(200, { room, seat });
      }

      if (parts[2] === "leave" && req.method === "POST") {
        const room = await findRoomById(Number(body.roomId || parts[3]));
        if (!room) return json(404, { error: "Room not found" });
        await leaveRoom(room.id, user.id);
        const players = await roomPlayers(room.id);
        if (players.length === 0) {
          await deleteRoom(room.id);
        } else if (room.host_id === user.id && room.status !== "playing") {
          await bumpRoom(room.id, { host_id: players[0].id });
        }
        return json(200, { ok: true });
      }

      if (parts[2] === "ready" && req.method === "POST") {
        const room = await findRoomById(Number(body.roomId || parts[3]));
        if (!room) return json(404, { error: "Room not found" });
        await setReady(room.id, user.id, !!body.ready);
        await bumpRoom(room.id);
        return json(200, { ok: true });
      }

      if (parts[2] === "state" && req.method === "GET") {
        const room = await findRoomByCode(String(parts[3] || "").toUpperCase());
        if (!room) return json(404, { error: "Room not found" });
        const players = await roomPlayers(room.id);
        const seat = players.find((p) => p.id === user.id)?.seat ?? -1;
        const game = room.game_state && room.game_state.deck ? room.game_state : null;
        return json(200, {
          room: {
            id: room.id, code: room.code, status: room.status, ante: room.ante,
            maxPlayers: room.max_players, hostName: room.hostName,
            hostId: room.host_id, version: room.version,
          },
          players,
          you: { id: user.id, seat, username: user.username, coins: user.coins },
          game: publicGameView(game, user.id),
        });
      }

      if (parts[2] === "start" && req.method === "POST") {
        const room = await findRoomById(Number(body.roomId || parts[3]));
        if (!room) return json(404, { error: "Room not found" });
        if (room.host_id !== user.id) return json(403, { error: "Only the host can start" });
        if (room.status === "playing") return json(400, { error: "Already playing" });
        let players = await roomPlayers(room.id);
        if (players.length < 2) return json(400, { error: "Need at least 2 players (friends or bots)" });

        // fill empty seats with bots
        while (players.length < room.max_players) {
          const used = players.map((p) => p.seat);
          let seat = 0;
          while (used.includes(seat)) seat++;
          const bot = await findOrCreateBot();
          await joinRoomPlayer(room.id, bot.id, seat);
          players = await roomPlayers(room.id);
        }

        const gamePlayers = players.map((p) => ({
          userId: p.id,
          username: p.username,
          isBot: p.username.startsWith("BOT_"),
        }));
        const game = newGame(gamePlayers, 0);
        await saveGameState(room.id, game);
        await bumpRoom(room.id, { status: "playing" });
        await runBotsAndSettle(await findRoomById(room.id));
        return json(200, { ok: true });
      }

      // ----- game actions (play/draw/pass/color) -----
      if (["play", "draw", "pass", "color"].includes(parts[2]) && req.method === "POST") {
        const room = await findRoomById(Number(body.roomId || parts[3]));
        if (!room) return json(404, { error: "Room not found" });
        const game = room.game_state && room.game_state.deck ? room.game_state : null;
        if (!game) return json(400, { error: "No game running" });
        const players = await roomPlayers(room.id);
        const seat = players.find((p) => p.id === user.id)?.seat ?? -1;
        if (seat < 0) return json(403, { error: "Not in this room" });
        const status = room.status === "playing" ? room.status : null;

        let result = { ok: false, error: "unknown action" };
        if (parts[2] === "play") {
          result = playCard(game, seat, Number(body.index), body.color || null);
          if (result.ok && result.needColor) {
            await saveGameState(room.id, game);
            return json(200, { ...result, needColor: true });
          }
        } else if (parts[2] === "color") {
          result = pickColor(game, seat, body.color);
        } else if (parts[2] === "draw") {
          result = drawTurn(game, seat);
        } else if (parts[2] === "pass") {
          result = passTurn(game, seat);
        }
        if (!result.ok) return json(400, { error: result.error });

        // CAS save: refuse if a friend acted first (client will refresh)
        const saved = await saveGameStateCAS(room.id, room.version, game);
        if (!saved) return json(409, { error: "Room changed — refreshing" });

        if (game.winner !== null) {
          await settleRound(room, game);
          await bumpRoom(room.id, { status: "finished" });
        } else {
          await runBotsAndSettle(await findRoomById(room.id));
        }
        const fresh = await findRoomById(room.id);
        return json(200, { ok: true, game: publicGameView(fresh.game_state, user.id) });
      }
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    console.error("API error:", err);
    return json(500, { error: err.message || "Internal server error" });
  }
}
