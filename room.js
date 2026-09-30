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
    sneak: false, // server-granted SNEAK ability (special username only)
    timerEnd: 0, // deadline for the local player's turn clock
  };

  // special username with the SNEAK ability (server re-verifies every request)
  const SNEAK_USER = "saifullahchhajro";

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
      anime({ targets: el, scale: [0.6, 1.12, 1], opacity: [0, 1], duration: 760, easing: "easeOutBack" });
    }
    clearTimeout(announce._t);
    announce._t = setTimeout(() => { el.hidden = true; }, 2400);
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
    face3D(el, opts);
    return el;
  }

  // 3D flip-in (mirrors game.js): .card > .card-flip > (back-face + front-face)
  function face3D(el, opts) {
    opts = opts || {};
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const flip = document.createElement("div");
    flip.className = "card-flip";
    const back = document.createElement("div");
    back.className = "card-face back-face";
    back.appendChild(Object.assign(document.createElement("span"), { className: "bf-val", textContent: "UNO" }));
    const front = document.createElement("div");
    front.className = "card-face front-face";
    while (el.firstChild) front.appendChild(el.firstChild);
    flip.appendChild(back);
    flip.appendChild(front);
    el.appendChild(flip);
    el.classList.add("flip3d");
    if (!opts.still) {
      el.classList.add("face-down");
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("face-down")));
    }
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
      // show WHY it is offline (usually DATABASE_URL is not set yet)
      const list = $("roomsList");
      list.innerHTML = "";
      const row = document.createElement("div");
      row.className = "room-row empty";
      row.textContent = err.message || "Can't reach the database right now.";
      list.appendChild(row);
    }
  }

  async function createRoom() {
    try {
      const data = await api("rooms/create", {
        method: "POST",
        body: {
          ante: Number($("roomAnte").value) || 25,
          maxPlayers: Number($("roomMaxPlayers").value) || 4,
        },
      });
      enterRoom(data.room);
    } catch (err) {
      $("roomsMsg").textContent = err.message;
      showError(err.message);
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

  // ---------- visible errors (no more silent failures) ----------
  function showError(msg) {
    const el = $("roomError");
    if (!el) return;
    el.textContent = "⚠ " + msg;
    el.hidden = false;
    clearTimeout(showError._t);
    showError._t = setTimeout(() => { el.hidden = true; }, 6000);
  }

  function hideError() {
    const el = $("roomError");
    if (el) el.hidden = true;
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
      // query form: Vercel's nested catch-all drops the second path segment
      const data = await api("rooms/state?code=" + encodeURIComponent(R.room.code));
      const prev = R.game;
      R.players = data.players;
      R.game = data.game;
      R.you = data.you;
      R.sneak = !!data.sneak; // server grants SNEAK only to the special username
      hideError();

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
      } else {
        // show every other failure (offline DB, server error, …) on the room screen
        showError(err.message || "Can't reach the room right now");
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
    try {
      renderGameInner(data, prev);
    } catch (err) {
      // never leave a blank "playing" table: show what went wrong
      console.error("renderGame failed:", err);
      showError("Table render problem: " + (err.message || "unknown"));
      const ph = $("mpPlayerHand");
      if (ph) {
        ph.innerHTML = "";
        const fallback = document.createElement("div");
        fallback.className = "draw-hint";
        fallback.textContent = "Something went wrong rendering the table — reloading…";
        ph.appendChild(fallback);
      }
      // last known good state will re-render on the next poll
    }
  }

  function renderGameInner(data, prev) {
    const g = data.game;
    const youSeatIdx = g.players.findIndex((p) => p.username === data.you.username);
    if (youSeatIdx < 0) throw new Error("you are not seated at this table — rejoin the room");

    $("mpYouName").textContent = data.you.username;
    $("mpYouCount").textContent = g.players[youSeatIdx].handCount;
    $("mpDrawCount").textContent = g.deckCount;

    // turn ring + hints
    const myTurn = g.current === youSeatIdx && g.winner == null;
    const iHavePlays = (g.players[youSeatIdx].hand || []).some((c) => playable(c, g));
    $("mpDrawHint").textContent = g.winner != null
      ? "Round over"
      : myTurn
        ? iHavePlays
          ? "Play a card from your hand"
          : "No plays — tap the glowing deck!"
        : "Waiting for " + (g.players[g.current] ? g.players[g.current].username : "…");

    // beacon: no playable card on your turn → the deck glows and bounces
    const mpDrawPileEl = $("mpDrawPile");
    if (mpDrawPileEl) mpDrawPileEl.classList.toggle("hint-glow", myTurn && !iHavePlays);

    // dealer flourish when a round just started
    if (!prev && g && g.winner == null) dealerShow();

    // turn clock: reset the deadline whenever whose turn it is changes
    const turnKey = g.current + ":" + (g.lastAction ? g.lastAction.at : 0);
    if (R.lastTurnKey !== turnKey) {
      R.lastTurnKey = turnKey;
      R.timerEnd = Date.now() + TURN_MS;
    }
    tickTimer(g, youSeatIdx, myTurn);
    setTableRing(g.activeColor);

    // opponents — updated in place (keyed by seat) so the turn glow and
    // sneak hands are not torn down and rebuilt every 1.5s poll
    const oppZone = $("mpOpponents");
    const existing = {};
    [...oppZone.children].forEach((row) => { existing[row.dataset.seat] = row; });
    g.players.forEach((p, seat) => {
      if (seat === youSeatIdx) return;
      let row = existing[seat];
      if (!row) {
        row = document.createElement("div");
        row.dataset.seat = seat;
        row.className = "seat";
        row.innerHTML =
          '<div class="seat-ring"><svg viewBox="0 0 72 72">' +
          '<circle class="ring-track" cx="36" cy="36" r="32" pathLength="100"/>' +
          '<circle class="ring-fill" cx="36" cy="36" r="32" pathLength="100"/></svg>' +
          '<div class="avatar ' + (p.isBot ? "cpu" : "other") + '">' + p.username.slice(0, 3).toUpperCase() + "</div></div>" +
          '<div class="seat-info"><div class="seat-name">' + p.username + "</div>" +
          '<div class="seat-cards"><b>0</b> cards</div></div>';
        oppZone.appendChild(row);
      }
      row.classList.toggle("active-turn", g.current === seat);
      row.querySelector(".seat-cards b").textContent = p.handCount;
      // SNEAK badge: marks the seats you're reading
      let badge = row.querySelector(".sneak-badge");
      if (R.sneak) {
        if (!badge) {
          badge = document.createElement("div");
          badge.className = "sneak-badge";
          badge.textContent = "SNEAK";
          row.appendChild(badge);
        }
      } else if (badge) badge.remove();
      // SNEAK (server-gated): this viewer may see this player's real cards
      const hasSneak = R.sneak && Array.isArray(p.hand) && p.hand.length;
      let mini = row.querySelector(".sneak-hand");
      if (hasSneak) {
        if (!mini) {
          mini = document.createElement("div");
          mini.className = "sneak-hand";
          row.appendChild(mini);
        }
        const key = p.hand.map((c) => c.color + c.value).join(",");
        if (mini.dataset.hand !== key) {
          mini.dataset.hand = key;
          mini.innerHTML = "";
          p.hand.forEach((c) => mini.appendChild(renderCard(c, { still: true })));
        }
      } else if (mini) {
        mini.remove();
      }
    });
    // remove rows for players who left
    [...oppZone.children].forEach((row) => {
      if (!g.players.some((p, s) => s !== youSeatIdx && String(s) === row.dataset.seat)) row.remove();
    });

    // discard + active color ring — only touch the DOM when the top changed;
    // the new top lands with an anime.js settle (scale pop + 3D flip-in)
    const dp = $("mpDiscardPile");
    const dpKey = g.discardTop ? g.discardTop.color + ":" + g.discardTop.value : "";
    if (dp.dataset.top !== dpKey) {
      dp.dataset.top = dpKey;
      const old = dp.querySelector(".card");
      if (old) old.remove();
      if (g.discardTop) {
        const el = renderCard(g.discardTop, { still: true });
        el.style.setProperty("--tilt", "3deg");
        dp.appendChild(el);
        if (window.anime && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          window.anime({
            targets: el,
            scale: [0.55, 1.12, 1],
            rotateY: ["-120deg", "0deg"],
            opacity: [0, 1],
            duration: 620,
            easing: "easeOutBack",
          });
        }
      }
    }
    const mpRing = $("mpColorRing");
    if (mpRing) {
      const ringCls = g.discardTop ? "color-ring show " + g.activeColor : "color-ring";
      if (mpRing.className !== ringCls) mpRing.className = ringCls;
    }

    // flight: when a remote player plays a card, fly a ghost from their seat to the pile
    if (prev && prev.lastAction && g.lastAction &&
        prev.lastAction.at !== g.lastAction.at &&
        g.lastAction.type === "play" && g.lastAction.seat !== youSeatIdx) {
      const row = oppZone.querySelector('[data-seat="' + g.lastAction.seat + '"]');
      if (row && window.Game && window.Game.flyCardToDiscard) {
        if (window.Game.tossDealer) window.Game.tossDealer($("mpDealer")); // dealer tossed it
        window.Game.flyCardToDiscard(row, 3);
      }
    }

    // your hand — updated INCREMENTALLY so the 1.5s poll never resets
    // running animations (flips, glows). Rebuild only when cards were played.
    const ph = $("mpPlayerHand");
    const hand = (g.players[youSeatIdx] && g.players[youSeatIdx].hand) || [];
    const prevHand = (prev && prev.players && prev.players[youSeatIdx] && prev.players[youSeatIdx].hand) || [];
    const grew = hand.length > prevHand.length;

    if (hand.length < ph.children.length || ph.querySelector(".draw-hint")) {
      // a card was played (or a render-error note is present): rebuild face-up,
      // no flips (the flight + FX carry the moment)
      ph.innerHTML = "";
    }
    hand.forEach((card, i) => {
      const can = myTurn && playable(card, g);
      let el = ph.children[i];
      if (!el) {
        const isNew = grew && i === hand.length - 1;
        el = renderCard(card, { playable: false, locked: false, still: !isNew });
        el.style.setProperty("--fan-rot", ((i - (hand.length - 1) / 2) * Math.min(5, 40 / Math.max(hand.length, 1))) + "deg");
        el.style.setProperty("--fan-y", Math.abs(i - (hand.length - 1) / 2) * 4 + "px");
        el.addEventListener("click", () => playCardClick(i, el));
        ph.appendChild(el);
      }
      el.classList.toggle("playable", can);
      el.classList.toggle("locked", myTurn && !can);
    });
    const wasUnoTime = $("mpUnoBtn").disabled === false;
    $("mpUnoBtn").disabled = !(hand && hand.length === 1 && myTurn);
    if (window.Game && window.Game.fitHand) window.Game.fitHand(Math.max(hand.length, 7));
    // UNO! moment: button pops + screen pulse when you're down to one card
    const nowUnoTime = hand && hand.length === 1 && myTurn;
    if (nowUnoTime && !wasUnoTime) {
      if (window.Game && window.Game.unoMoment) window.Game.unoMoment();
      toast("One card left — hit UNO!", "good");
    }

    // announce diffs — messages land at the BOTTOM CENTER with the full card name
    if (prev && prev.lastAction && g.lastAction && prev.lastAction.at !== g.lastAction.at) {
      const a = g.lastAction;
      const name = g.players[a.seat] ? g.players[a.seat].username : "?";
      if (a.type === "play") {
        const c = a.card || {};
        const cardText = colorName(c.color) + " " + valueText(c.value);
        playNote(name + " played " + cardText, a.seat === youSeatIdx ? "good" : "");
        announce(name + " played " + cardText, a.seat === youSeatIdx ? "good" : "");
        if (window.Game && window.Game.playSpecialFX && a.card) {
          const v = a.card.value;
          if (v === "draw2") window.Game.playSpecialFX("d2", name + " plays +2");
          else if (v === "wild4") window.Game.playSpecialFX("w4", name + " plays +4");
          else if (v === "skip" || v === "reverse") window.Game.playSpecialFX("skip", name + " plays " + (v === "skip" ? "Skip" : "Reverse"));
          else if (v === "wild") window.Game.playSpecialFX("wild", name + " plays Wild");
        }
      } else if (a.type === "draw") {
        announce(name + " drew a card", a.seat === youSeatIdx ? "" : "bad");
      } else if (a.type === "pass") {
        announce(name + " passed", "");
      }
      if (a.uno) announce(name + " has UNO!", "bad");
    }
  }

  // dealer deal-in flourish when the round starts
  function dealerShow() {
    const d = $("mpDealer");
    if (!d) return;
    let n = 0;
    const iv = setInterval(() => {
      if (window.Game && window.Game.tossDealer) window.Game.tossDealer(d);
      if (++n >= 4) clearInterval(iv);
    }, 260);
    if (window.Game && window.Game.sound) window.Game.sound.shuffle();
  }

  // running color ring around the whole table (multiplayer)
  function setTableRing(color) {
    const table = $("roomTable");
    if (!table) return;
    const want = color ? "table table-ring " + color : "table";
    if (table.className === want) return; // don't restart the animation every poll
    table.className = want;
  }

  // human card names for the play feed
  function colorName(color) {
    if (color === "wild") return "Wild";
    return color ? color.charAt(0).toUpperCase() + color.slice(1) : "";
  }

  function valueText(value) {
    if (value === "skip") return "Skip";
    if (value === "reverse") return "Reverse";
    if (value === "draw2") return "Draw Two";
    if (value === "wild4") return "Wild Draw Four";
    return value || "card";
  }

  // bottom-center play feed: who played what, right above your name plate
  function playNote(text, kind) {
    const el = $("mpPlayNote");
    if (!el) return;
    el.textContent = text;
    el.className = "play-note show " + (kind || "");
    clearTimeout(playNote._t);
    playNote._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  // REAL turn timer: counts down, lights the seat ring, auto draw+pass on expiry
  const TURN_MS = 30000;
  function tickTimer(g, youSeatIdx, myTurn) {
    const ring = $("mpYouRing");
    const secsEl = $("mpYouSeconds");
    const seat = $("mpYouSeat");
    if (g.winner != null) {
      if (secsEl) secsEl.hidden = true;
      if (seat) seat.classList.remove("racing");
      stopTurnTimer();
      return;
    }
    if (!R.timerEnd) R.timerEnd = Date.now() + TURN_MS;
    const remain = Math.max(0, R.timerEnd - Date.now());
    const frac = remain / TURN_MS;
    if (ring) ring.style.strokeDashoffset = (100 - frac * 100).toFixed(2);
    if (secsEl) {
      secsEl.hidden = !myTurn;
      if (myTurn) secsEl.textContent = Math.ceil(remain / 1000);
    }
    if (seat) seat.classList.toggle("racing", myTurn && remain < 10000);
    if (myTurn && remain <= 0 && !R.busy) {
      R.timerEnd = 0;
      stopTurnTimer();
      toast("Time's up — drawing a card", "bad");
      action("draw", {}); // drawTurn passes the turn if the card isn't playable
    }
  }

  function stopTurnTimer() {
    R.timerEnd = 0;
    const ring = $("mpYouRing");
    if (ring) ring.style.strokeDashoffset = 0;
  }

  function countMyHand() {
    if (!R.game || !R.you) return 0;
    const g = R.game;
    const idx = g.players.findIndex((p) => p.username === R.you.username);
    return idx >= 0 ? ((g.players[idx].hand || []).length) : 0;
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
    if (window.Game && window.Game.tossDealer) window.Game.tossDealer($("mpDealer")); // dealer throws your card
    if (card.color === "wild") {
      pendingWild = { index, el };
      $("colorOverlay").classList.add("show");
      return;
    }
    // optimistic flight: your card visibly leaves your hand toward the pile
    if (window.Game && window.Game.flyFromEl) window.Game.flyFromEl(el, card);
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
    $("startGameBtn").addEventListener("click", async () => {
      try {
        await action("start", {});
      } catch (err) {
        showError("Start failed: " + (err.message || "unknown error"));
      }
    });
    $("mpDrawPile").addEventListener("click", () => {
      const before = countMyHand();
      if (window.Game && window.Game.tossDealer) window.Game.tossDealer($("mpDealer"));
      action("draw", {}).then(() => {
        // 3D flip-in for the newly drawn card (poll brings the new hand)
        const ph = $("mpPlayerHand");
        const last = ph && ph.lastElementChild;
        if (last && countMyHand() > before && window.Game && window.Game.flipCardIn) {
          window.Game.flipCardIn(last);
        }
      });
    });
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
