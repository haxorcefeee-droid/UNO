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
    timerLoop: null, // 200ms UI loop handle for smooth seat rings
    graceUntil: 0, // timestamp until which the countdown is paused
    roomStatus: "", // last seen room status (lobby/playing/finished)
    wins: {}, // username -> wins inside THIS room
    victoryShown: false, // prevent double victory overlay
    chatOpen: false, // chat panel visibility
    chatLastId: 0, // newest seen chat message id
    chatUnread: 0, // unread count while panel is closed
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

  // motion preference helper (center announce was removed — feed is bottom-only)
  function motionOK() {
    return !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // ---------- card rendering (mirrors game.js) ----------
  // special cards get premium glyph identity (rules untouched)
  function cardLabel(card) {
    if (card.value === "skip") return "🚫";
    if (card.value === "reverse") return "🔄";
    if (card.value === "draw2") return "+2";
    if (card.value === "wild") return "🎨";
    if (card.value === "wild4") return "+4";
    return card.value;
  }

  function renderCard(card, opts) {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "card " + card.color;
    if (opts.playable) el.classList.add("playable");
    else if (opts.locked) el.classList.add("locked");
    const special = ["skip", "reverse", "draw2", "wild", "wild4"].includes(card.value);
    if (special) el.classList.add("special");
    if (card.value === "wild4") el.classList.add("wild4"); // distinct from plain wild 🎨
    const inner = document.createElement("div");
    inner.className = "inner";
    const label = card.color === "wild" ? "🎨" : cardLabel(card);
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
    // fresh room → fresh tally (per-room win counts)
    if (!R.room || R.room.code !== room.code) { R.wins = {}; }
    R.room = room;
    R.chatLastId = 0;
    R.chatUnread = 0;
    const log = $("chatLog");
    if (log) log.innerHTML = '<div class="chat-empty">Say hi to your table 👋</div>';
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
    startTimerLoop();
  }

  function stopPolling() {
    if (R.poll) { clearInterval(R.poll); R.poll = null; }
    stopTimerLoop();
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
      R.roomStatus = data.room.status;
      hideError();

      $("roomStatus").textContent = data.room.status;
      $("roomCoins").textContent = data.you.coins;
      $("roomCode").textContent = data.room.code;

      if (data.room.status === "lobby" || (data.room.status === "finished" && !data.game)) {
        show($("waitingPanel"), true);
        show($("mpGame"), false);
        hideVictory();
        renderWaiting(data);
        $("startGameBtn").hidden = data.room.hostId !== data.you.id;
      } else if (data.game) {
        // playing, or finished-with-final-table: keep the table visible so the
        // victory overlay can play over it
        show($("waitingPanel"), false);
        show($("mpGame"), true);
        if (data.room.status === "playing") hideVictory();
        renderGame(data, prev);
      }
      refreshChat();
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
    const maxEl = $("lobbyMax");
    if (maxEl) maxEl.textContent = data.room.maxPlayers;
    for (let i = 0; i < data.room.maxPlayers; i++) {
      const p = data.players.find((x) => x.seat === i);
      const isHost = p && p.id === data.room.hostId;
      const cell = document.createElement("div");
      cell.className = "seat-cell" + (p ? " taken" : "");
      cell.innerHTML = p
        ? '<div class="avatar ' + (p.id === data.you.id ? "you" : "cpu") + '">' +
          (p.id === data.you.id ? "YOU" : p.username.slice(0, 3).toUpperCase()) + "</div>" +
          '<div class="seat-cell-name">' + (isHost ? "👑 " : "") + p.username + "</div>" +
          '<div class="seat-cell-coins">🪙' + p.coins + "</div>" +
          (p.ready ? '<div class="ready-dot">✓</div>' : "")
        : '<div class="avatar empty">—</div><div class="seat-cell-name muted">open seat</div>' +
          '<div class="seat-cell-coins muted">bot fills in</div>';
      grid.appendChild(cell);
    }
    const me = data.players.find((x) => x.id === data.you.id);
    $("readyBtn").textContent = me && me.ready ? "NOT READY" : "READY";
    renderWaitingWins(); // wins tally lives in the lobby between rounds
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

    // turn clock: reset on turn change; grace-pause after any play so the
    // bottom feed can be read before the countdown resumes
    const turnKey = g.current + ":" + (g.lastAction ? g.lastAction.at : 0);
    if (R.lastTurnKey !== turnKey) {
      R.lastTurnKey = turnKey;
      R.timerEnd = g.winner == null ? Date.now() + PLAY_GRACE_MS + TURN_MS : 0;
      R.graceUntil = Date.now() + PLAY_GRACE_MS; // clock holds during the feed
    }
    tickTimer(g, youSeatIdx, myTurn);
    // YOUR TURN banner (multiplayer) — anime.js drop-in, bottom feed carries messages
    const tb = $("mpTurnBanner");
    if (tb) {
      const showBanner = myTurn && g.winner == null;
      const wasShown = !tb.hidden;
      tb.hidden = !showBanner;
      if (showBanner && !wasShown && window.anime && motionOK()) {
        window.anime({ targets: tb, translateY: [-26, 0], opacity: [0, 1], scale: [0.85, 1], duration: 320, easing: "easeOutBack" });
      }
    }
    setTableRing(g.activeColor); // washes the felt with the new color when it changes
    R.activeSeat = g.current;
    R.youSeatIdx = youSeatIdx;

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
      // live timer ring on whoever is playing, radar sweep on their seat
      const isTurn = g.winner == null && g.current === seat;
      const oring = row.querySelector(".ring-fill");
      const oringBox = row.querySelector(".seat-ring");
      if (oring && oringBox) {
        oringBox.classList.toggle("radar", isTurn);
        if (isTurn) {
          oring.style.strokeDashoffset = (100 - turnFrac() * 100).toFixed(2);
          oring.classList.toggle("racing", isTurn && turnFrac() < 1 / 3);
        } else {
          oring.style.strokeDashoffset = "0";
          oring.classList.remove("racing");
        }
      }
      // SNEAK toggle button: on = peek at this player's hand
      let badge = row.querySelector(".sneak-badge");
      if (R.sneak) {
        if (!badge) {
          badge = document.createElement("button");
          badge.className = "sneak-badge";
          badge.type = "button";            badge.textContent = "👁";
          badge.addEventListener("click", (e) => {
            e.stopPropagation();
            row.classList.toggle("peek");
            badge.textContent = row.classList.contains("peek") ? "🙈" : "👁";
          });
          row.appendChild(badge);
        }
      } else if (badge) badge.remove();
      // SNEAK (server-gated): visible only while the seat's peek is on
      const hasSneak = R.sneak && row.classList.contains("peek") && Array.isArray(p.hand) && p.hand.length;
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
      if (g.discardTop) {
        // FLICKER FIX: append the new card BEFORE fading the old one out,
        // so the pile is never empty for even one frame (anime.js crossfade)
        const el = renderCard(g.discardTop, { still: true });
        el.style.setProperty("--tilt", "3deg");
        dp.appendChild(el);
        if (old) {
          if (window.anime && motionOK()) {
            window.anime({ targets: old, opacity: [1, 0], duration: 280, easing: "easeOutQuad", complete: () => old.remove() });
          } else {
            old.remove();
          }
        }
        if (window.anime && motionOK()) {
          window.anime({
            targets: el,
            scale: [0.55, 1.12, 1],
            rotateY: ["-120deg", "0deg"],
            opacity: [0, 1],
            duration: 620,
            easing: "easeOutBack",
          });
        }
      } else if (old) {
        old.remove();
      }
    }
    const mpRing = $("mpColorRing");
    if (mpRing) {
      const ringCls = g.discardTop ? "color-ring show " + g.activeColor : "color-ring";
      if (mpRing.className !== ringCls) {
        const prevColor = (mpRing.className.match(/\b(red|yellow|green|blue)\b/) || [])[1];
        mpRing.className = ringCls;
        // anime.js: the ring pops + spins when the ACTIVE COLOR changes
        if (g.activeColor && prevColor && prevColor !== g.activeColor && window.anime && motionOK()) {
          window.anime({
            targets: mpRing,
            scale: [1, 1.45, 1],
            rotate: ["0deg", "360deg"],
            duration: 700,
            easing: "easeOutBack",
          });
        }
      }
    }

    // flight: ONLY on a genuinely new remote play while the room is really
    // playing — stale lastAction replays (rejoin/poll refresh) must not fly
    if (prev && prev.lastAction && g.lastAction &&
        prev.lastAction.at !== g.lastAction.at &&
        g.lastAction.type === "play" && g.lastAction.seat !== youSeatIdx &&
        R.roomStatus === "playing") {
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

    // ---- victory detection: winner overlay + per-room tally ----
    if (g.winner != null && !R.victoryShown) {
      const wp = g.players[g.winner];
      const winnerName = wp ? wp.username : "?";
      countWin(winnerName);
      showVictory(winnerName, wp && wp.username === data.you.username);
    }

    // announce diffs — messages live ONLY in the bottom feed now
    if (prev && prev.lastAction && g.lastAction && prev.lastAction.at !== g.lastAction.at) {
      const a = g.lastAction;
      const name = g.players[a.seat] ? g.players[a.seat].username : "?";
      if (a.type === "play") {
        const c = a.card || {};
        const cardText = colorName(c.color) + " " + valueText(c.value);
        playNote(name + " played " + cardText, a.seat === youSeatIdx ? "good" : "");
        if (window.Game && window.Game.playSpecialFX && a.card) {
          const v = a.card.value;
          if (v === "draw2") window.Game.playSpecialFX("d2", name + " plays +2");
          else if (v === "wild4") window.Game.playSpecialFX("w4", name + " plays +4");
          else if (v === "skip" || v === "reverse") window.Game.playSpecialFX("skip", name + " plays " + (v === "skip" ? "Skip" : "Reverse"));
          else if (v === "wild") window.Game.playSpecialFX("wild", name + " plays Wild");
        }
      } else if (a.type === "draw") {
        playNote(name + " drew a card", a.seat === youSeatIdx ? "" : "bad");
      } else if (a.type === "pass") {
        playNote(name + " passed", "");
      }
      if (a.uno) playNote(name + " has UNO!", "bad");
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
    // when the class actually changed, pulse the felt with the new color (anime.js)
    if (color && window.Game && window.Game.waveTable && window.anime && motionOK()) {
      window.Game.waveTable(color);
    }
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

  // ---------- room chat ----------
  function chatAppend(msg) {
    const log = $("chatLog");
    if (!log || !msg) return;
    const empty = log.querySelector(".chat-empty");
    if (empty) empty.remove();
    const row = document.createElement("div");
    row.className = "chat-msg" + (msg.username === (R.you && R.you.username) ? " mine" : "");
    const who = document.createElement("span");
    who.className = "chat-who";
    who.textContent = msg.username;
    const body = document.createElement("span");
    body.className = "chat-body";
    body.textContent = msg.body; // textContent: never inject raw HTML
    row.appendChild(who);
    row.appendChild(body);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  async function refreshChat() {
    if (!R.room) return;
    try {
      const data = await api("rooms/chat?code=" + encodeURIComponent(R.room.code));
      const msgs = data.msgs || [];
      const fresh = msgs.filter((m) => m.id > R.chatLastId);
      if (!fresh.length) return;
      fresh.forEach(chatAppend);
      R.chatLastId = fresh[fresh.length - 1].id;
      if (!R.chatOpen) {
        const mine = fresh.every((m) => m.username === (R.you && R.you.username));
        if (!mine) {
          R.chatUnread += fresh.length;
          const badge = $("chatUnread");
          if (badge) {
            badge.textContent = R.chatUnread > 9 ? "9+" : R.chatUnread;
            badge.hidden = false;
          }
        }
      }
    } catch (e) { /* chat is best-effort; the room banner shows real errors */ }
  }

  function setChatOpen(open) {
    R.chatOpen = open;
    const panel = $("chatPanel");
    const badge = $("chatUnread");
    if (panel) {
      panel.hidden = !open;
      if (open) {
        R.chatUnread = 0;
        if (badge) badge.hidden = true;
        refreshChat();
        const input = $("chatInput");
        if (input) input.focus();
      }
    }
  }

  // per-room win tally (resets when you enter a different room)
  function countWin(username) {
    R.wins[username] = (R.wins[username] || 0) + 1;
    renderWaitingWins();
  }

  function renderWaitingWins() {
    const panel = $("mpWinsPanel");
    const list = $("mpWinsList");
    const entries = Object.entries(R.wins).sort((a, b) => b[1] - a[1]);
    if (!panel || !list) return;
    if (!entries.length) { panel.hidden = true; return; }
    panel.hidden = false;
    list.innerHTML = "";
    entries.forEach(([name, n], i) => {
      const row = document.createElement("div");
      row.className = "wins-row" + (i === 0 ? " leader" : "");
      row.innerHTML =
        '<span class="wins-rank">' + (i === 0 ? "👑" : "#" + (i + 1)) + "</span>" +
        '<span class="wins-name">' + name + '</span>' +
        '<span class="wins-count">' + n + " win" + (n > 1 ? "s" : "") + "</span>";
      list.appendChild(row);
    });
  }

  // ---- victory party: fireworks + confetti + winner banner ----
  function burstFireworks(container, n) {
    for (let i = 0; i < n; i++) {
      const fw = document.createElement("div");
      fw.className = "fw";
      fw.style.left = 8 + Math.random() * 84 + "%";
      fw.style.top = 8 + Math.random() * 55 + "%";
      fw.style.setProperty("--fw-hue", Math.floor(Math.random() * 360));
      fw.style.animationDelay = (Math.random() * 1.6).toFixed(2) + "s";
      container.appendChild(fw);
      setTimeout(() => fw.remove(), 3400);
    }
  }

  function confettiRain(container, n) {
    const colors = ["#e33b3b", "#f4c531", "#3aa554", "#2f6fd0", "#ffd84d", "#ffffff"];
    for (let i = 0; i < n; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "%";
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDelay = (Math.random() * 1.2).toFixed(2) + "s";
      c.style.animationDuration = 2.2 + Math.random() * 1.6 + "s";
      c.style.transform = "rotate(" + Math.floor(Math.random() * 360) + "deg)";
      container.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
  }

  function showVictory(winnerName, isMe) {
    const v = $("mpVictory");
    if (!v || R.victoryShown) return;
    R.victoryShown = true;
    v.classList.toggle("lose", !isMe);
    const title = $("mpVictoryTitle");
    title.textContent = isMe ? "🏆 YOU WIN!" : "😖 YOU LOSE";
    if (!isMe) {
      const sub = document.createElement("div");
      sub.className = "victory-sub";
      sub.textContent = winnerName + " takes this one — rematch?";
      title.appendChild(sub);
    }
    const tally = Object.entries(R.wins).sort((a, b) => b[1] - a[1])
      .map(([n, c], i) => (i === 0 ? "👑 " : "") + n + " · " + c + "W")
      .slice(0, 4)
      .join("   ");
    $("mpVictoryWins").innerHTML =
      '<span class="victory-coins">+0</span> 🪙 &nbsp;·&nbsp; ' + (tally || "");
    v.hidden = false;
    if (motionOK()) {
      burstFireworks(v, isMe ? 14 : 4);
      if (isMe) confettiRain(v, 90);
      if (window.anime) {
        anime({ targets: ".victory-title", scale: [0.3, 1.15, 1], opacity: [0, 1], duration: 900, easing: "easeOutBack" });
        // coin reward counter ticks up (visual reward only — coins are server-side)
        const coins = isMe ? 50 : 0;
        const coinObj = { n: 0 };
        anime({
          targets: coinObj,
          n: coins,
          round: 1,
          duration: 1200,
          delay: 400,
          easing: "easeOutQuad",
          update: () => {
            const el = document.querySelector(".victory-coins");
            if (el) el.textContent = "+" + coinObj.n;
          },
        });
      }
    }
    // second volley for the party feel
    if (isMe) setTimeout(() => { if (!v.hidden) { burstFireworks(v, 10); confettiRain(v, 60); } }, 1800);
  }

  function hideVictory() {
    const v = $("mpVictory");
    if (v) v.hidden = true;
    R.victoryShown = false;
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

  // REAL turn timer: counts down around WHOEVER is playing (not just you),
  // radar sweep on the active seat, auto draw+pass on your own expiry.
  // After ANY play, the countdown pauses for a few seconds (grace) so the
  // play feed can be read before the clock resumes.
  const TURN_MS = 30000;
  const PLAY_GRACE_MS = 4000;
  function turnFrac() {
    if (!R.timerEnd) return 1;
    // while the grace pause is active, hold the clock: shift the deadline
    // forward every tick so the remaining time doesn't decrease
    if (R.graceUntil && Date.now() < R.graceUntil) {
      R.timerEnd += 200; // matches the UI loop tick
    }
    return Math.max(0, Math.min(1, (R.timerEnd - Date.now()) / TURN_MS));
  }

  function applyTurnRing(ringEl, secsEl, seatEl, isTurn, isMine) {
    if (!ringEl) return;
    const frac = isTurn ? turnFrac() : 1;
    ringEl.style.strokeDashoffset = (100 - frac * 100).toFixed(2);
    ringEl.classList.toggle("racing", isTurn && frac < 1 / 3); // under ~10s
    const ringBox = ringEl.closest(".seat-ring");
    if (ringBox) ringBox.classList.toggle("radar", isTurn); // radar sweep
    if (isMine) {
      if (secsEl) {
        secsEl.hidden = !isTurn;
        if (isTurn) secsEl.textContent = Math.ceil(turnFrac() * (TURN_MS / 1000));
      }
      if (seatEl) seatEl.classList.toggle("racing", isTurn && frac < 1 / 3);
    }
  }

  function tickTimer(g, youSeatIdx, myTurn) {
    const ring = $("mpYouRing");
    const secsEl = $("mpYouSeconds");
    const seat = $("mpYouSeat");
    if (g.winner != null) {
      applyTurnRing(ring, secsEl, seat, false, true);
      stopTurnTimer();
      return;
    }
    if (!R.timerEnd) R.timerEnd = Date.now() + TURN_MS;
    const frozen = R.graceUntil && Date.now() < R.graceUntil;
    applyTurnRing(ring, secsEl, seat, myTurn, true);
    // expiry can't fire during the grace pause
    if (myTurn && !frozen && R.timerEnd - Date.now() <= 0 && !R.busy) {
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

  // 200ms UI loop: keeps every visible seat ring animating between the
  // 1.5s polls, so the radar/timer feels real-time on ALL seats.
  function startTimerLoop() {
    stopTimerLoop();
    R.timerLoop = setInterval(() => {
      const g = R.game;
      if (!g || g.winner != null || R.roomStatus !== "playing") return;
      const youIdx = R.youSeatIdx;
      // mine
      const isMine = g.current === youIdx;
      applyTurnRing($("mpYouRing"), $("mpYouSeconds"), $("mpYouSeat"), isMine, true);
      // opponents
      const oppZone = $("mpOpponents");
      if (oppZone) {
        [...oppZone.children].forEach((row) => {
          const s = parseInt(row.dataset.seat, 10);
          const ring = row.querySelector(".ring-fill");
          const box = row.querySelector(".seat-ring");
          if (!ring || !box) return;
          const isTurn = g.current === s;
          box.classList.toggle("radar", isTurn);
          if (isTurn) {
            ring.style.strokeDashoffset = (100 - turnFrac() * 100).toFixed(2);
            ring.classList.toggle("racing", turnFrac() < 1 / 3);
          } else {
            ring.style.strokeDashoffset = "0";
            ring.classList.remove("racing");
          }
        });
      }
    }, 200);
  }

  function stopTimerLoop() {
    if (R.timerLoop) { clearInterval(R.timerLoop); R.timerLoop = null; }
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

  function startRadar() {
    // radar sweeps are driven by the 200ms timer loop on every seat
    const ringBox = $("mpYouSeat") && $("mpYouSeat").querySelector(".seat-ring");
    if (ringBox && R.roomStatus === "playing" && R.game && R.game.winner == null) {
      ringBox.classList.add("radar");
    }
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
    // optimistic flight: only on YOUR turn (never on stale replays)
    if (R.roomStatus === "playing" && window.Game && window.Game.flyFromEl) window.Game.flyFromEl(el, card);
    action("play", { index });
  }

  let pendingWild = null;

  function wireOnce() {
    $("createRoomBtn").addEventListener("click", createRoom);
    const inviteBtn = $("inviteBtn");
    if (inviteBtn) {
      inviteBtn.addEventListener("click", async () => {
        const code = R.room ? R.room.code : $("roomCodeShare").textContent;
        const link = location.origin + location.pathname + "?join=" + code;
        try {
          if (navigator.share) await navigator.share({ title: "UNO room", text: "Join my UNO room " + code, url: link });
          else if (navigator.clipboard) { await navigator.clipboard.writeText(link); toast("Invite link copied!", "good"); }
          else toast("Room code: " + code, "good");
        } catch (e) { /* user dismissed share sheet */ }
      });
    }
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
    // chat events
    $("chatFab").addEventListener("click", () => setChatOpen(!R.chatOpen));
    $("chatClose").addEventListener("click", () => setChatOpen(false));
    $("chatForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("chatInput");
      const text = input.value.trim();
      if (!text || !R.room) return;
      input.value = "";
      try {
        await api("rooms/chat", { method: "POST", body: { code: R.room.code, body: text } });
        refreshChat();
      } catch (err) {
        toast(err.message, "bad");
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
        if (window.anime && motionOK()) { // anime.js pop on the chosen swatch
          window.anime({ targets: btn, scale: [1, 0.86, 1.12, 1], duration: 420, easing: "easeOutBack" });
        }
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
    openRooms: () => {
      $("home").classList.remove("active");
      $("rooms").classList.add("active");
      refreshRooms();
    },
  };

  // deep link: ?join=CODE auto-joins after sign-in
  const params = new URLSearchParams(location.search);
  const joinCode = params.get("join");
  if (joinCode) {
    const tryJoin = setInterval(async () => {
      if (!R.token || !R.user) { try { await loadMe(); } catch (e) {} if (!R.user) return; }
      clearInterval(tryJoin);
      try {
        const data = await api("rooms/join", { method: "POST", body: { code: joinCode.toUpperCase() } });
        enterRoom(data.room);
      } catch (e) { toast(e.message, "bad"); }
    }, 700);
    setTimeout(() => clearInterval(tryJoin), 20000);
  }

  document.addEventListener("DOMContentLoaded", wireOnce);
  if (document.readyState !== "loading") wireOnce();
})();
