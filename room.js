"use strict";

/* ============================================================
   UNO — multiplayer rooms client (polling-based, syncs via Neon)
   Exposes window.Rooms for game.js to integrate.
   ============================================================ */

(function () {
  const $ = (id) => document.getElementById(id);

  const R = {
    token: localStorage.getItem("uno-table-token") || "",
    user: null,
    room: null,
    players: [],
    game: null,
    poll: null,
    lastVersion: -1,
    lastTurnSeat: -1,
    busy: false,
  };

  // ---------- api ----------
  async function readJson(res) {
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch {
      const flat = text.replace(/\s+/g, " ").trim();
      return { error: flat.slice(0, 180) || ("HTTP " + res.status) };
    }
  }

  async function api(path, opts = {}) {
    const res = await fetch("/api/" + path, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(R.token ? { Authorization: "Bearer " + R.token } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    return data;
  }

  // ---------- ui helpers ----------
  function show(el, on) { el.hidden = !on; }

  function toast(msg, kind) {
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    $("mpToastStack").appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function announce(text, kind) {
    const el = $("mpAnnounce");
    el.textContent = text;
    el.className = "announce " + (kind || "");
    el.hidden = false;
    if (window.anime) {
      anime({ targets: el, scale: [0.6, 1.12, 1], opacity: [0, 1], duration: 420, easing: "easeOutBack" });
    }
    clearTimeout(announce._t);
    announce._t = setTimeout(() => { el.hidden = true; }, 1500);
  }

  // ---------- card rendering (mirrors game.js) ----------
  function cardLabel(card) {
    if (card.value === "skip") return "⊘";
    if (card.value === "reverse") return "⇄";
    if (card.value === "draw2") return "+2";
    if (card.value === "wild") return "WILD";
    if (card.value === "wild4") return "W+4";
    return card.value;
  }

  function renderCard(card, opts) {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "card " + card.color;
    if (opts.playable) el.classList.add("playable");
    else if (opts.locked) el.classList.add("locked");
    const inner = document.createElement("div");
    inner.className = "inner";
    const label = card.color === "wild" ? "★" : cardLabel(card);
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = label;
    const tl = document.createElement("span");
    tl.className = "corner tl";
    tl.textContent = label;
    const br = document.createElement("span");
    br.className = "corner br";
    br.textContent = label;
    inner.appendChild(val);
    el.appendChild(inner);
    el.appendChild(tl);
    el.appendChild(br);
    return el;
  }

  function cardBack() {
    const el = document.createElement("div");
    el.className = "card back";
    const inner = document.createElement("div");
    inner.className = "inner";
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = "UNO";
    inner.appendChild(val);
    el.appendChild(inner);
    return el;
  }

  // ---------- lobby ----------
  async function refreshRooms() {
    try {
      const data = await api("rooms/list");
      const list = $("roomsList");
      list.innerHTML = "";
      if (!data.rooms.length) {
        list.innerHTML = '<div class="room-row empty">No public rooms yet — create one!</div>';
      }
      data.rooms.forEach((r) => {
        const row = document.createElement("div");
        row.className = "room-row";
        row.innerHTML =
          '<div class="room-code">' + r.code + "</div>" +
          '<div class="room-host">host ' + r.hostName + "</div>" +
          '<div class="room-meta">' + r.playerCount + "/" + r.maxPlayers + " · 🪙" + r.ante + " · " + r.status + "</div>";
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.textContent = "JOIN";
        btn.addEventListener("click", () => joinRoom(r.code));
        row.appendChild(btn);
        list.appendChild(row);
      });
      $("roomsPill").textContent = "● live";
      $("roomsPill").className = "db-pill ok";
    } catch (err) {
      $("roomsPill").textContent = "● offline";
      $("roomsPill").className = "db-pill err";
    }
  }

  async function createRoom() {
    try {
      const data = await api("rooms/create", { method: "POST", body: { ante: Number($("roomAnte").value) || 25 } });
      enterRoom(data.room);
    } catch (err) {
      $("roomsMsg").textContent = err.message;
    }
  }

  async function joinRoom(code) {
    try {
      const data = await api("rooms/join", { method: "POST", body: { code } });
      enterRoom(data.room);
    } catch (err) {
      $("roomsMsg").textContent = err.message;
    }
  }

  function enterRoom(room) {
    R.room = room;
    $("home").classList.remove("active");
    $("rooms").classList.remove("active");
    $("roomScreen").classList.add("active");
    $("roomCode").textContent = room.code;
    $("roomCodeShare").textContent = room.code;
    startPolling();
  }

  // ---------- room polling ----------
  function startPolling() {
    stopPolling();
    pollOnce();
    R.poll = setInterval(pollOnce, 1500);
  }

  function stopPolling() {
    if (R.poll) { clearInterval(R.poll); R.poll = null; }
  }

  async function pollOnce() {
    if (!R.room) return;
    try {
      const data = await api("rooms/state/" + R.room.code);
      const prev = R.game;
      R.players = data.players;
      R.game = data.game;
      R.you = data.you;

      $("roomStatus").textContent = data.room.status;
      $("roomCoins").textContent = data.you.coins;
      $("roomCode").textContent = data.room.code;

      if (data.room.status === "lobby" || data.room.status === "finished") {
        show($("waitingPanel"), true);
        show($("mpGame"), false);
        renderWaiting(data);
        $("startGameBtn").hidden = data.room.hostId !== data.you.id;
        if (data.room.status === "finished" && data.game && data.game.winner != null) {
          const w = data.game.players[data.game.winner];
          announce((w ? w.username : "?") + " wins the round!", "good");
        }
      } else if (data.room.status === "playing" && data.game) {
        show($("waitingPanel"), false);
        show($("mpGame"), true);
        renderGame(data, prev);
      }
    } catch (err) {
      // room may have been deleted
      if (String(err.message).includes("not found")) {
        stopPolling();
        R.room = null;
        leaveRoomScreen();
      }
    }
  }

  function renderWaiting(data) {
    const grid = $("seatGrid");
    grid.innerHTML = "";
    for (let i = 0; i < data.room.maxPlayers; i++) {
      const p = data.players.find((x) => x.seat === i);
      const cell = document.createElement("div");
      cell.className = "seat-cell" + (p ? " taken" : "");
      cell.innerHTML = p
        ? '<div class="avatar ' + (p.id === data.you.id ? "you" : "cpu") + '">' +
          (p.id === data.you.id ? "YOU" : p.username.slice(0, 3).toUpperCase()) + "</div>" +
          '<div class="seat-cell-name">' + p.username + "</div>" +
          '<div class="seat-cell-coins">🪙' + p.coins + "</div>" +
          (p.ready ? '<div class="ready-dot">✓</div>' : "")
        : '<div class="avatar empty">—</div><div class="seat-cell-name muted">open seat</div>' +
          '<div class="seat-cell-coins muted">bot fills in</div>';
      grid.appendChild(cell);
    }
    const me = data.players.find((x) => x.id === data.you.id);
    $("readyBtn").textContent = me && me.ready ? "NOT READY" : "READY";
  }

  // ---------- live game rendering ----------
  function renderGame(data, prev) {
    const g = data.game;
    const youSeatIdx = g.players.findIndex((p) => p.username === data.you.username);

    $("mpYouName").textContent = data.you.username;
    $("mpYouCount").textContent = g.players[youSeatIdx].handCount;
    $("mpDrawCount").textContent = g.deckCount;

    // turn ring + hints
    const myTurn = g.current === youSeatIdx && g.winner == null;
    $("mpDrawHint").textContent = g.winner != null
      ? "Round over"
      : myTurn
        ? (g.players[youSeatIdx].hand || []).some((c) => playable(c, g))
          ? "Play a card from your hand"
          : "No plays — tap the draw pile"
        : "Waiting for " + (g.players[g.current] ? g.players[g.current].username : "…");

    startRadar(myTurn);

    // opponents (everyone except you)
    const oppZone = $("mpOpponents");
    oppZone.innerHTML = "";
    g.players.forEach((p, seat) => {
      if (seat === youSeatIdx) return;
      const row = document.createElement("div");
      row.className = "seat" + (g.current === seat ? " active-turn" : "");
      row.innerHTML =
        '<div class="seat-ring"><svg viewBox="0 0 72 72">' +
        '<circle class="ring-track" cx="36" cy="36" r="32" pathLength="100"/>' +
        '<circle class="ring-fill" cx="36" cy="36" r="32" pathLength="100"' +
        (g.current === seat ? ' style="stroke-dashoffset:100"' : "") + "/></svg>" +
        '<div class="avatar ' + (p.isBot ? "cpu" : "other") + '">' + p.username.slice(0, 3).toUpperCase() + "</div></div>" +
        '<div class="seat-info"><div class="seat-name">' + p.username + "</div>" +
        '<div class="seat-cards"><b>' + p.handCount + "</b> cards</div></div>";
      oppZone.appendChild(row);
    });

    // discard
    const dp = $("mpDiscardPile");
    dp.innerHTML = "";
    if (g.discardTop) {
      const el = renderCard(g.discardTop);
      el.style.setProperty("--tilt", "3deg");
      dp.appendChild(el);
    }

    // your hand
    const ph = $("mpPlayerHand");
    ph.innerHTML = "";
    const hand = g.players[youSeatIdx].hand || [];
    hand.forEach((card, i) => {
      const can = myTurn && playable(card, g);
      const el = renderCard(card, { playable: can, locked: myTurn && !can });
      el.style.setProperty("--fan-rot", ((i - (hand.length - 1) / 2) * Math.min(5, 40 / Math.max(hand.length, 1))) + "deg");
      el.style.setProperty("--fan-y", Math.abs(i - (hand.length - 1) / 2) * 4 + "px");
      if (can) {
        el.addEventListener("click", () => playCardClick(i, el));
      }
      ph.appendChild(el);
    });
    $("mpUnoBtn").disabled = !(hand.length === 1 && myTurn);

    // announce diffs
    if (prev && prev.lastAction && g.lastAction && prev.lastAction.at !== g.lastAction.at) {
      const a = g.lastAction;
      const name = g.players[a.seat] ? g.players[a.seat].username : "?";
      if (a.type === "play") {
        announce(name + " played " + (a.card ? a.card.value : "a card"), a.seat === youSeatIdx ? "good" : "");
      } else if (a.type === "draw") {
        announce(name + " drew a card", a.seat === youSeatIdx ? "" : "bad");
      } else if (a.type === "pass") {
        announce(name + " passed", "");
      }
      if (a.uno) announce(name + " has UNO!", "bad");
    }
  }

  function playable(card, g) {
    if (card.color === "wild") return true;
    if (card.color === g.activeColor) return true;
    return g.discardTop && card.value === g.discardTop.value;
  }

  function startRadar(myTurn) {
    // simple CSS-based radar sweep for the local player
    const ring = $("mpYouRing");
    if (!ring) return;
    ring.classList.toggle("racing", myTurn);
  }

  // ---------- actions ----------
  async function action(kind, body) {
    if (R.busy) return;
    R.busy = true;
    try {
      await api("rooms/" + kind, { method: "POST", body: { roomId: R.room.id, ...body } });
      await pollOnce();
    } catch (err) {
      toast(err.message, "bad");
    } finally {
      R.busy = false;
    }
  }

  function playCardClick(index, el) {
    const g = R.game;
    const youSeatIdx = g.players.findIndex((p) => p.username === R.you.username);
    const hand = g.players[youSeatIdx].hand || [];
    const card = hand[index];
    if (!card) return;
    if (card.color === "wild") {
      pendingWild = { index, el };
      $("colorOverlay").classList.add("show");
      return;
    }
    action("play", { index });
  }

  let pendingWild = null;

  function wireOnce() {
    $("createRoomBtn").addEventListener("click", createRoom);
    $("joinRoomBtn").addEventListener("click", () => joinRoom($("joinCode").value.trim().toUpperCase()));
    $("roomsBackBtn").addEventListener("click", leaveRoomScreen);
    $("leaveRoomBtn").addEventListener("click", leaveRoom);
    $("readyBtn").addEventListener("click", async () => {
      const me = R.players.find((x) => x.id === R.you.id);
      await action("ready", { ready: !(me && me.ready) });
    });
    $("startGameBtn").addEventListener("click", () => action("start", {}));
    $("mpDrawPile").addEventListener("click", () => action("draw", {}));
    $("mpUnoBtn").addEventListener("click", () => toast("UNO!", "good"));

    document.querySelectorAll(".color-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("colorOverlay").classList.remove("show");
        if (pendingWild) {
          action("play", { index: pendingWild.index, color: btn.dataset.color });
          pendingWild = null;
        }
      });
    });
  }

  async function leaveRoom() {
    try { await api("rooms/leave", { method: "POST", body: { roomId: R.room.id } }); } catch (e) {}
    R.room = null;
    stopPolling();
    leaveRoomScreen();
  }

  function leaveRoomScreen() {
    $("roomScreen").classList.remove("active");
    $("home").classList.add("active");
    if (window.Game && window.Game.onAuthRefresh) window.Game.onAuthRefresh();
  }

  // ---------- auth helpers shared with game.js ----------
  async function loadMe() {
    if (!R.token) return null;
    try {
      const data = await api("auth/me");
      R.user = data.user;
      return data.user;
    } catch {
      R.token = "";
      localStorage.removeItem("uno-table-token");
      return null;
    }
  }

  window.Rooms = {
    get token() { return R.token; },
    set token(t) { R.token = t; localStorage.setItem("uno-table-token", t || ""); },
    get user() { return R.user; },
    loadMe,
    api,
    refreshRooms,
    leaveRoomScreen,
    toast,
  };

  document.addEventListener("DOMContentLoaded", wireOnce);
  if (document.readyState !== "loading") wireOnce();
})();
