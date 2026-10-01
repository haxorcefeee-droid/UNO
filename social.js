"use strict";

/* ============================================================
   UNO — friends, presence, invites and the join-by-code prompt.
   Polling client for /api/social/*; works on Vercel serverless.
   Depends on window.Rooms (room.js).
   ============================================================ */

(function () {
  const $ = (id) => document.getElementById(id);
  const SEEN_KEY = "uno-social-seen";
  const PREFS_KEY = "uno-room-prefs";

  const S = {
    friends: [],
    requests: [],
    sent: [],
    me: null,
    open: false,
    invite: false,
    timer: null,
    inFlight: false,
    primed: false,
    shown: new Set(),
    busy: new Set(),
  };

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const token = () => localStorage.getItem("uno-table-token") || "";
  const rooms = () => window.Rooms;
  const api = (path, method, body) => rooms().api(path, { method: method || "GET", body });
  const motionOK = () => !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function say(msg, kind) {
    const r = rooms();
    if (r && r.toast) r.toast(msg, kind);
  }

  // ---------- sound + phone alerts ----------
  let audio = null;
  function unlockAudio() {
    if (audio) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audio = new AC();
    } catch (e) { /* no audio */ }
  }
  document.addEventListener("pointerdown", unlockAudio, { once: true });

  function ping() {
    if (!audio || audio.state === "suspended") { try { audio && audio.resume(); } catch (e) {} }
    if (!audio) return;
    try {
      const t = audio.currentTime;
      [660, 880].forEach((hz, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = "sine";
        o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.16, t + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.22);
        o.connect(g).connect(audio.destination);
        o.start(t + i * 0.12);
        o.stop(t + i * 0.12 + 0.25);
      });
    } catch (e) { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  }

  function systemAlert(title, body) {
    if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
    try { new Notification(title, { body, tag: "uno-social" }); } catch (e) { /* ignore */ }
  }

  function loadSeen() {
    try { JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]").forEach((id) => S.shown.add(id)); } catch (e) {}
  }
  function saveSeen() {
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...S.shown].slice(-80))); } catch (e) {}
  }

  // ---------- notification banners ----------
  function ack(ids) {
    if (!ids.length) return;
    api("social/ack", "POST", { ids }).catch(() => {});
  }

  function banner({ id, icon, title, text, actions, ttl }) {
    const stack = $("notifStack");
    const el = document.createElement("div");
    el.className = "notif";
    el.setAttribute("role", "status");
    el.innerHTML =
      '<span class="notif-icon" aria-hidden="true">' + icon + "</span>" +
      '<div class="notif-body"><b>' + esc(title) + "</b><span>" + esc(text) + "</span></div>";
    const bar = document.createElement("div");
    bar.className = "notif-actions";
    const close = () => {
      if (!el.isConnected) return;
      el.classList.add("out");
      setTimeout(() => el.remove(), 260);
    };
    (actions || []).forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn mini-btn " + (a.kind || "btn-ghost");
      b.textContent = a.label;
      b.addEventListener("click", async () => {
        b.disabled = true;
        try { await a.run(); } catch (err) { say(err.message, "bad"); }
        close();
        ack([id]);
      });
      bar.appendChild(b);
    });
    if (bar.children.length) el.appendChild(bar);
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstChild.remove();
    if (ttl) setTimeout(close, ttl);
    return el;
  }

  function reqIdFor(name) {
    const r = S.requests.find((x) => x.from.toLowerCase() === name.toLowerCase());
    return r ? r.id : null;
  }

  async function respond(id, accept) {
    await api("social/respond", "POST", { id, accept });
    say(accept ? "Friend added!" : "Request declined", accept ? "good" : "");
    await sync(true);
  }

  async function joinFromInvite(code) {
    const r = rooms();
    if (r.room && r.roomStatus === "playing") throw new Error("Finish your current game first");
    await r.joinRoom(code);
    closePanel();
  }

  function handleNotification(n) {
    if (n.kind === "friend_request") {
      const rid = reqIdFor(n.from);
      banner({
        id: n.id, icon: "👋", title: n.from, text: "wants to be your friend",
        actions: rid ? [
          { label: "Accept", kind: "btn-join", run: () => respond(rid, true) },
          { label: "Decline", run: () => respond(rid, false) },
        ] : [{ label: "OK", run: async () => {} }],
      });
      systemAlert("Friend request", n.from + " wants to be your friend");
    } else if (n.kind === "friend_accepted") {
      banner({ id: n.id, icon: "🎉", title: n.from, text: "is now your friend", ttl: 6000 });
      ack([n.id]);
      systemAlert("Friend added", n.from + " accepted your request");
    } else if (n.kind === "invite") {
      banner({
        id: n.id, icon: "🎮", title: n.from, text: "invited you to play (" + n.code + ")",
        actions: [
          { label: "Join", kind: "btn-join", run: () => joinFromInvite(n.code) },
          { label: "Later", run: async () => {} },
        ],
        ttl: 90000,
      });
      systemAlert("UNO invite", n.from + " invited you to play");
    } else {
      ack([n.id]);
      return;
    }
    ping();
  }

  // ---------- sync loop ----------
  function schedule() {
    clearTimeout(S.timer);
    if (!token()) return;
    const delay = document.hidden ? 15000 : S.open ? 2500 : 4000;
    S.timer = setTimeout(() => sync(), delay);
  }

  async function sync(force) {
    if (!token() || !rooms()) return;
    if (S.inFlight && !force) return;
    S.inFlight = true;
    try {
      const data = await api("social/sync");
      S.friends = data.friends || [];
      S.requests = data.requests || [];
      S.sent = data.sent || [];
      S.me = data.me || S.me;
      if (S.me) {
        const u = rooms().user;
        if (u) u.coins = S.me.coins;
        const coins = $("userCoins");
        if (coins && S.me.coins != null) coins.textContent = S.me.coins;
        const rc = $("roomsCoins");
        if (rc && S.me.coins != null) rc.textContent = S.me.coins;
      }
      updateBadge();
      if (S.open) render();
      (data.notifications || []).forEach((n) => {
        if (S.shown.has(n.id)) return;
        S.shown.add(n.id);
        handleNotification(n);
      });
      saveSeen();
      S.primed = true;
    } catch (e) {
      /* offline or no database: stay quiet, the next tick retries */
    } finally {
      S.inFlight = false;
      schedule();
    }
  }

  function updateBadge() {
    const b = $("friendsBadge");
    if (!b) return;
    const n = S.requests.length;
    b.hidden = n === 0;
    b.textContent = n > 9 ? "9+" : n;
  }

  // ---------- friends panel ----------
  function myLobby() {
    const r = rooms();
    return r.room && r.roomStatus !== "playing" && r.roomStatus !== "finished" ? r.room : null;
  }

  function prefs() {
    try { return { ante: 25, players: 2, turn: 30, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; }
    catch (e) { return { ante: 25, players: 2, turn: 30 }; }
  }

  function statusLine(f) {
    if (!f.online) return "Offline";
    if (f.room) {
      if (f.room.status === "playing") return "In a game";
      return "In lobby · " + f.room.players + "/" + f.room.max;
    }
    return "Online";
  }

  function btn(label, cls, onClick, disabled) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn mini-btn " + cls;
    b.textContent = label;
    b.disabled = !!disabled;
    b.addEventListener("click", onClick);
    return b;
  }

  function friendRow(f) {
    const li = document.createElement("li");
    li.className = "f-row" + (f.online ? " online" : "");
    const lobby = myLobby();
    const playing = rooms().room && rooms().roomStatus === "playing";
    li.innerHTML =
      '<span class="f-avatar">' + esc(f.username.slice(0, 2).toUpperCase()) + '<i class="f-dot"></i></span>' +
      '<span class="f-info"><b>' + esc(f.username) + "</b><small>" + esc(statusLine(f)) + "</small></span>";
    const actions = document.createElement("span");
    actions.className = "f-actions";
    const joinable = f.online && f.room && f.room.status === "lobby" && f.room.players < f.room.max && !(lobby && lobby.code === f.room.code);
    if (joinable) {
      actions.appendChild(btn("Join", "btn-join", () => run(joinFromInvite(f.room.code))));
    }
    if (lobby) {
      actions.appendChild(btn("Invite", "btn-secondary", () => invite(f), !f.online || playing));
    } else if (!joinable) {
      actions.appendChild(btn("Play", "btn-secondary", () => playWith(f), !f.online || playing || (f.room && f.room.status === "playing")));
    }
    const rm = btn("✕", "btn-ghost f-remove", async () => {
      if (!confirm("Remove " + f.username + " from friends?")) return;
      await api("social/remove", "POST", { friendId: f.id });
      sync(true);
    });
    rm.setAttribute("aria-label", "Remove " + f.username);
    actions.appendChild(rm);
    li.appendChild(actions);
    return li;
  }

  function run(promise) {
    return Promise.resolve(promise).catch((err) => say(err.message, "bad"));
  }

  function render() {
    const msg = $("friendMsg");
    const list = $("friendList");
    list.innerHTML = "";
    S.friends.forEach((f) => list.appendChild(friendRow(f)));
    const online = S.friends.filter((f) => f.online).length;
    $("friendCount").textContent = online + "/" + S.friends.length + " online";
    $("friendEmpty").hidden = S.friends.length > 0;

    const reqList = $("friendReqList");
    reqList.innerHTML = "";
    S.requests.forEach((r) => {
      const li = document.createElement("li");
      li.className = "f-row online";
      li.innerHTML = '<span class="f-avatar">' + esc(r.from.slice(0, 2).toUpperCase()) + "</span>" +
        '<span class="f-info"><b>' + esc(r.from) + "</b><small>wants to be friends</small></span>";
      const a = document.createElement("span");
      a.className = "f-actions";
      a.appendChild(btn("Accept", "btn-join", () => run(respond(r.id, true))));
      a.appendChild(btn("Decline", "btn-ghost", () => run(respond(r.id, false))));
      li.appendChild(a);
      reqList.appendChild(li);
    });
    $("friendReqSec").hidden = S.requests.length === 0;

    const sentList = $("friendSentList");
    sentList.innerHTML = "";
    S.sent.forEach((r) => {
      const li = document.createElement("li");
      li.className = "f-row";
      li.innerHTML = '<span class="f-avatar">' + esc(r.to.slice(0, 2).toUpperCase()) + "</span>" +
        '<span class="f-info"><b>' + esc(r.to) + "</b><small>waiting for reply</small></span>";
      const a = document.createElement("span");
      a.className = "f-actions";
      a.appendChild(btn("Cancel", "btn-ghost", async () => {
        await api("social/cancel", "POST", { id: r.id });
        sync(true);
      }));
      li.appendChild(a);
      sentList.appendChild(li);
    });
    $("friendSentSec").hidden = S.sent.length === 0;

    const lobby = myLobby();
    const ib = $("inviteBanner");
    ib.hidden = !lobby;
    if (lobby) ib.textContent = "Inviting to room " + lobby.code + " — tap Invite on an online friend.";
    if (msg && !msg.dataset.keep) msg.textContent = "";

    const alerts = $("alertsBtn");
    if (alerts) alerts.hidden = !("Notification" in window) || Notification.permission !== "default";
  }

  async function invite(f, silent) {
    const lobby = myLobby();
    if (!lobby) throw new Error("Create or join a room first");
    await api("social/invite", "POST", { friendId: f.id, code: lobby.code });
    if (!silent) say("Invite sent to " + f.username, "good");
  }

  async function playWith(f) {
    const r = rooms();
    const p = prefs();
    const coins = (S.me && S.me.coins) != null ? S.me.coins : ((r.user && r.user.coins) || 0);
    const ante = Math.min(p.ante, coins);
    try {
      const data = await r.api("rooms/create", {
        method: "POST",
        body: { ante, maxPlayers: p.players, turnSeconds: p.turn, isPublic: false },
      });
      r.enterRoom(data.room);
      await invite(f, true);
      say("Invite sent to " + f.username + " — waiting for them", "good");
      closePanel();
    } catch (err) {
      say(err.message, "bad");
    }
  }

  function setMsg(text, kind) {
    const el = $("friendMsg");
    el.textContent = text;
    el.className = "hint friend-msg " + (kind || "");
    el.dataset.keep = "1";
    clearTimeout(setMsg._t);
    setMsg._t = setTimeout(() => { delete el.dataset.keep; if (!S.open) return; el.textContent = ""; }, 4000);
  }

  async function addFriend(e) {
    e.preventDefault();
    const input = $("friendName");
    const name = input.value.trim();
    if (!name) return setMsg("Type your friend's username", "bad");
    $("friendAddBtn").disabled = true;
    try {
      const res = await api("social/request", "POST", { username: name });
      input.value = "";
      setMsg(res.accepted ? name + " is now your friend!" : "Request sent to " + res.name, "good");
      await sync(true);
    } catch (err) {
      setMsg(err.message, "bad");
    } finally {
      $("friendAddBtn").disabled = false;
    }
  }

  function openPanel(opts) {
    if (!token() || !rooms()) {
      const authMsg = $("authMsg");
      const text = "Sign in or create an account to use friends.";
      if (authMsg) authMsg.textContent = text;
      say(text, "bad");
      return;
    }
    S.open = true;
    S.invite = !!(opts && opts.invite);
    const ov = $("friendsOverlay");
    ov.classList.add("show");
    render();
    sync(true);
    if (window.anime && motionOK()) {
      window.anime({ targets: ov.querySelector(".modal"), scale: [0.9, 1], opacity: [0, 1], duration: 260, easing: "easeOutBack" });
    }
  }

  function closePanel() {
    S.open = false;
    $("friendsOverlay").classList.remove("show");
  }

  // ---------- join with code ----------
  function openCode() {
    const ov = $("codeOverlay");
    ov.classList.add("show");
    $("codeMsg").textContent = "";
    $("codeInput").value = "";
    setTimeout(() => $("codeInput").focus(), 80);
  }
  function closeCode() { $("codeOverlay").classList.remove("show"); }

  async function submitCode(e) {
    e.preventDefault();
    const code = $("codeInput").value.trim().toUpperCase();
    if (code.length < 5) { $("codeMsg").textContent = "Room codes have 5 characters"; return; }
    $("codeGo").disabled = true;
    try {
      await rooms().joinRoom(code);
      closeCode();
    } catch (err) {
      $("codeMsg").textContent = err.message;
    } finally {
      $("codeGo").disabled = false;
    }
  }

  // ---------- wiring ----------
  function wire() {
    loadSeen();
    $("friendsBtn").addEventListener("click", () => openPanel());
    const homeFriends = $("homeFriendsBtn");
    if (homeFriends) homeFriends.addEventListener("click", () => openPanel());
    $("friendsClose").addEventListener("click", closePanel);
    $("friendsOverlay").addEventListener("click", (e) => { if (e.target === $("friendsOverlay")) closePanel(); });
    $("friendAddForm").addEventListener("submit", addFriend);
    $("alertsBtn").addEventListener("click", async () => {
      try { await Notification.requestPermission(); } catch (e) {}
      render();
    });
    $("codeForm").addEventListener("submit", submitCode);
    $("codeCancel").addEventListener("click", closeCode);
    $("codeOverlay").addEventListener("click", (e) => { if (e.target === $("codeOverlay")) closeCode(); });
    $("codeBrowse").addEventListener("click", () => { closeCode(); rooms().openRooms("browse"); });
    $("codeInput").addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      closePanel();
      closeCode();
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(true); });
    document.addEventListener("uno-auth", (e) => {
      if (!e.detail) {
        S.friends = []; S.requests = []; S.sent = []; S.me = null; S.shown.clear();
        clearTimeout(S.timer);
        updateBadge();
        closePanel();
        return;
      }
      sync(true);
    });
    // remember how you like to play, so "Play" with a friend is one tap
    const createBtn = $("createRoomBtn");
    if (createBtn) createBtn.addEventListener("click", () => {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({
          ante: Math.max(0, Math.min(500, parseInt($("roomAnte").value, 10) || 0)),
          players: Number($("roomMaxPlayers").value) || 2,
          turn: Number($("roomTurn").value) || 30,
        }));
      } catch (e) {}
    }, true);
    if (token()) setTimeout(() => sync(), 600);
  }

  window.Social = { open: openPanel, close: closePanel, openCode, sync, get friends() { return S.friends; } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
