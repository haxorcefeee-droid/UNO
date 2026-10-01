// Friends, presence and notifications. Everything is request/response so it
// runs on Vercel serverless; clients poll /api/social/sync every few seconds.
import { getSql, findUserByUsername, findRoomByCode, roomPlayers, touchUser } from "./db.js";

const MAX_FRIENDS = 100;
const MAX_PENDING_OUT = 30;

const reply = (status, body) => ({ status, body });

async function friendshipBetween(a, b) {
  const sql = getSql();
  const [row] = await sql`
    SELECT * FROM friendships
    WHERE (requester_id = ${a} AND addressee_id = ${b})
       OR (requester_id = ${b} AND addressee_id = ${a})
    LIMIT 1
  `;
  return row || null;
}

async function notify(userId, kind, from, roomCode = null) {
  const sql = getSql();
  await sql`
    INSERT INTO notifications (user_id, kind, from_user_id, from_name, room_code)
    VALUES (${userId}, ${kind}, ${from.id}, ${from.username}, ${roomCode})
  `;
}

export async function listFriends(userId) {
  const sql = getSql();
  return sql`
    SELECT u.id, u.username, u.wins,
           (u.last_seen IS NOT NULL AND u.last_seen > now() - INTERVAL '25 seconds') AS "online",
           (SELECT json_build_object(
                     'code', r.code, 'status', r.status, 'max', r.max_players, 'ante', r.ante,
                     'players', (SELECT COUNT(*)::int FROM room_players x JOIN users xu ON xu.id = x.user_id
                                 WHERE x.room_id = r.id AND NOT starts_with(xu.username, 'BOT_')))
              FROM room_players rp JOIN rooms r ON r.id = rp.room_id
              WHERE rp.user_id = u.id AND r.status IN ('lobby', 'playing')
              ORDER BY r.updated_at DESC LIMIT 1) AS "room"
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END
    WHERE f.status = 'accepted' AND (f.requester_id = ${userId} OR f.addressee_id = ${userId})
    ORDER BY "online" DESC, lower(u.username)
  `;
}

async function incomingRequests(userId) {
  const sql = getSql();
  return sql`
    SELECT f.id, u.username AS "from", u.id AS "fromId"
    FROM friendships f JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ${userId} AND f.status = 'pending'
    ORDER BY f.id DESC
  `;
}

async function outgoingRequests(userId) {
  const sql = getSql();
  return sql`
    SELECT f.id, u.username AS "to"
    FROM friendships f JOIN users u ON u.id = f.addressee_id
    WHERE f.requester_id = ${userId} AND f.status = 'pending'
    ORDER BY f.id DESC
  `;
}

async function unreadNotifications(userId) {
  const sql = getSql();
  return sql`
    SELECT id, kind, from_name AS "from", room_code AS "code",
           (EXTRACT(EPOCH FROM (now() - created_at)))::int AS "ageSec"
    FROM notifications
    WHERE user_id = ${userId} AND is_read = false
      AND created_at > now() - INTERVAL '1 day'
      AND (kind <> 'invite' OR created_at > now() - INTERVAL '10 minutes')
    ORDER BY id ASC
    LIMIT 20
  `;
}

export async function socialSnapshot(userId) {
  const [friends, requests, sent, notifications] = await Promise.all([
    listFriends(userId),
    incomingRequests(userId),
    outgoingRequests(userId),
    unreadNotifications(userId),
  ]);
  return { friends, requests, sent, notifications };
}

export async function handleSocial(user, action, method, body) {
  const sql = getSql();

  if (action === "sync" && method === "GET") {
    await touchUser(user.id);
    const snap = await socialSnapshot(user.id);
    return reply(200, { ...snap, me: { id: user.id, username: user.username, coins: user.coins, wins: user.wins, losses: user.losses } });
  }

  if (action === "request" && method === "POST") {
    const name = String(body.username || "").trim();
    if (!name) return reply(400, { error: "Type your friend's username" });
    const target = await findUserByUsername(name);
    if (!target || /^BOT_/.test(target.username)) return reply(404, { error: "No player with that name" });
    if (target.id === user.id) return reply(400, { error: "That's you!" });

    const existing = await friendshipBetween(user.id, target.id);
    if (existing && existing.status === "accepted") return reply(409, { error: target.username + " is already your friend" });
    if (existing && existing.requester_id === user.id) return reply(409, { error: "Request already sent to " + target.username });
    if (existing) {
      // they already asked us: sending a request back is the same as accepting
      await sql`UPDATE friendships SET status = 'accepted' WHERE id = ${existing.id}`;
      await notify(target.id, "friend_accepted", user);
      return reply(200, { accepted: true, name: target.username });
    }

    const [{ count: out }] = await sql`
      SELECT COUNT(*)::int AS count FROM friendships WHERE requester_id = ${user.id} AND status = 'pending'`;
    if (out >= MAX_PENDING_OUT) return reply(400, { error: "Too many pending requests" });
    const [{ count: total }] = await sql`
      SELECT COUNT(*)::int AS count FROM friendships
      WHERE status = 'accepted' AND (requester_id = ${user.id} OR addressee_id = ${user.id})`;
    if (total >= MAX_FRIENDS) return reply(400, { error: "Friend list is full" });

    await sql`INSERT INTO friendships (requester_id, addressee_id) VALUES (${user.id}, ${target.id})`;
    await notify(target.id, "friend_request", user);
    return reply(201, { sent: true, name: target.username });
  }

  if (action === "respond" && method === "POST") {
    const id = Number(body.id);
    const [row] = await sql`
      SELECT * FROM friendships WHERE id = ${id} AND addressee_id = ${user.id} AND status = 'pending'`;
    if (!row) return reply(404, { error: "That request is gone" });
    if (body.accept) {
      await sql`UPDATE friendships SET status = 'accepted' WHERE id = ${id}`;
      await notify(row.requester_id, "friend_accepted", user);
    } else {
      await sql`DELETE FROM friendships WHERE id = ${id}`;
    }
    await sql`
      UPDATE notifications SET is_read = true
      WHERE user_id = ${user.id} AND kind = 'friend_request' AND from_user_id = ${row.requester_id}`;
    return reply(200, { ok: true });
  }

  if (action === "cancel" && method === "POST") {
    await sql`DELETE FROM friendships WHERE id = ${Number(body.id)} AND requester_id = ${user.id} AND status = 'pending'`;
    return reply(200, { ok: true });
  }

  if (action === "remove" && method === "POST") {
    const friendId = Number(body.friendId);
    await sql`
      DELETE FROM friendships
      WHERE status = 'accepted'
        AND ((requester_id = ${user.id} AND addressee_id = ${friendId})
          OR (requester_id = ${friendId} AND addressee_id = ${user.id}))`;
    return reply(200, { ok: true });
  }

  if (action === "invite" && method === "POST") {
    const friendId = Number(body.friendId);
    const link = await friendshipBetween(user.id, friendId);
    if (!link || link.status !== "accepted") return reply(403, { error: "You can only invite friends" });

    const [friend] = await sql`
      SELECT id, username, (last_seen IS NOT NULL AND last_seen > now() - INTERVAL '25 seconds') AS "online"
      FROM users WHERE id = ${friendId}`;
    if (!friend) return reply(404, { error: "Friend not found" });
    if (!friend.online) return reply(409, { error: friend.username + " is offline right now" });

    const room = await findRoomByCode(String(body.code || "").toUpperCase());
    if (!room || room.status !== "lobby") return reply(404, { error: "That room is not open" });
    const members = await roomPlayers(room.id);
    if (!members.some((m) => m.id === user.id)) return reply(403, { error: "Join the room first" });
    if (members.some((m) => m.id === friendId)) return reply(409, { error: friend.username + " is already in the room" });
    if (members.length >= room.max_players) return reply(400, { error: "Room is full" });

    const [dupe] = await sql`
      SELECT id FROM notifications
      WHERE user_id = ${friendId} AND kind = 'invite' AND room_code = ${room.code}
        AND from_user_id = ${user.id} AND is_read = false AND created_at > now() - INTERVAL '10 minutes'
      LIMIT 1`;
    if (!dupe) await notify(friendId, "invite", user, room.code);
    return reply(200, { ok: true, name: friend.username });
  }

  if (action === "ack" && method === "POST") {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 50);
    if (ids.length) {
      await sql`UPDATE notifications SET is_read = true WHERE user_id = ${user.id} AND id = ANY(string_to_array(${ids.join(",")}, ',')::int[])`;
    }
    return reply(200, { ok: true });
  }

  return reply(404, { error: "Not found" });
}
