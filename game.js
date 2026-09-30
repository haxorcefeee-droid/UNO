"use strict";

/* ============================================================
   UNO — real-table game engine (vanilla JS + anime.js)
   v3: physical card movement choreographed with anime.js
   ============================================================ */

// ---------- constants ----------
const COLORS = ["red", "yellow", "green", "blue"];
const LS_KEY = "uno-table-player";
const TURN_SECONDS = 20;
const WIN_TARGET = 200;
const FLIGHT_MS = 480;
const DEAL_MS = 160;

// ---------- state ----------
const state = {
  name: "",
  deck: [],
  discard: [],
  you: [],
  cpu: [],
  current: "you",
  activeColor: "red",
  totalScores: { you: 0, cpu: 0 },
  round: 1,
  awaitingUno: false,
  over: false,
  pendingCard: null,
  pendingRect: null,
  busy: false,
};

// ---------- dom ----------
const $ = (id) => document.getElementById(id);
const dom = {
  home: $("home"),
  game: $("game"),
  playerName: $("playerName"),
  homeLeaderboard: $("homeLeaderboard"),
  dbPillHome: $("dbPillHome"),
  quitBtn: $("quitBtn"),
  rulesBtn: $("rulesBtn"),
  closeRulesBtn: $("closeRulesBtn"),
  rulesOverlay: $("rulesOverlay"),
  roundNum: $("roundNum"),
  matchScore: $("matchScore"),
  cpuCount: $("cpuCount"),
  youCount: $("youCount"),
  cpuTotal: $("cpuTotal"),
  youTotal: $("youTotal"),
  youName: $("youName"),
  cpuSeat: $("cpuSeat"),
  youSeat: $("youSeat"),
  opponentHand: $("opponentHand"),
  drawPile: $("drawPile"),
  drawCount: $("drawCount"),
  drawHint: $("drawHint"),
  discardPile: $("discardPile"),
  playerHand: $("playerHand"),
  unoBtn: $("unoBtn"),
  cpuRing: $("cpuRing"),
  youRing: $("youRing"),
  cpuSeconds: $("cpuSeconds"),
  youSeconds: $("youSeconds"),
  colorOverlay: $("colorOverlay"),
  overOverlay: $("overOverlay"),
  overTitle: $("overTitle"),
  overSub: $("overSub"),
  overPoints: $("overPoints"),
  nextRoundBtn: $("nextRoundBtn"),
  overHomeBtn: $("homeBtn"),
  saveNote: $("saveNote"),
  toastStack: $("toastStack"),
  cpuBubble: $("cpuBubble"),
  announce: $("announce"),
};

// ---------- anime.js guard (v3 global) ----------
const hasAnime = typeof anime !== "undefined";
const A = (opts) => (hasAnime ? anime(opts) : { finished: Promise.resolve() });
const A_DONE = (a) => Promise.resolve((a && a.finished) || Promise.resolve());

// ---------- auth/wallet ----------
async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch {
    const flat = text.replace(/\s+/g, " ").trim();
    return { error: flat.slice(0, 180) || ("HTTP " + res.status) };
  }
}

const Auth = {
  token: localStorage.getItem("uno-table-token") || "",
  user: null,
  async refresh() {
    if (!this.token) { this.user = null; return null; }
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + this.token } });
      if (!res.ok) throw new Error("expired");
      const data = await readJson(res);
      this.user = data.user;
      return this.user;
    } catch {
      this.token = "";
      localStorage.removeItem("uno-table-token");
      this.user = null;
      return null;
    }
  },
  async login(username, password) {
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Login failed");
    this.token = data.token;
    localStorage.setItem("uno-table-token", this.token);
    this.user = data.user;
    return data.user;
  },
  async register(username, password) {
    const res = await fetch("/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Register failed");
    this.token = data.token;
    localStorage.setItem("uno-table-token", this.token);
    this.user = data.user;
    return data.user;
  },
  async logout() {
    try { await fetch("/api/auth/logout?token=" + this.token, { method: "POST" }); } catch (e) {}
    this.token = "";
    localStorage.removeItem("uno-table-token");
    this.user = null;
  },
  async addCoins(delta) {
    if (!this.token) return null;
    try {
      const res = await fetch("/api/coins", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.token },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.coins != null) this.user = { ...this.user, coins: data.coins };
      return data.coins;
    } catch { return null; }
  },
};

function renderAuthUI() {
  const authArea = document.getElementById("authArea");
  const userArea = document.getElementById("userArea");
  if (Auth.user) {
    authArea.hidden = true;
    userArea.hidden = false;
    document.getElementById("userName").textContent = Auth.user.username;
    document.getElementById("userCoins").textContent = Auth.user.coins;
    document.getElementById("userWins").textContent = Auth.user.wins;
    document.getElementById("userLosses").textContent = Auth.user.losses;
    document.getElementById("gameCoins").textContent = Auth.user.coins;
  } else {
    authArea.hidden = false;
    userArea.hidden = true;
  }
}

function coinFloat(elFrom, text) {
  const chip = document.getElementById("gameCoins");
  const target = elFrom || chip;
  if (!target) return;
  const r = target.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "coin-float";
  el.textContent = text;
  el.style.left = r.left + r.width / 2 - 20 + "px";
  el.style.top = r.top - 10 + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// ---------- tiny sound kit (WebAudio, no assets) ----------
const Sound = {
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  blip(freq, dur, type, vol) {
    const ctx = this.ensure();
    if (!ctx) return;
    freq = freq || 600; dur = dur || 0.08; type = type || "triangle";
    vol = vol == null ? 0.12 : vol;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  },
  play() {
    this.blip(520, 0.07);
    setTimeout(() => this.blip(700, 0.06), 40);
  },
  draw() { this.blip(300, 0.06, "sine", 0.08); },
  deal() { this.blip(360 + Math.random() * 120, 0.04, "sine", 0.06); },
  shuffle() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.blip(200 + Math.random() * 260, 0.03, "sawtooth", 0.05), i * 55);
    }
  },
  turn() { this.blip(880, 0.1, "sine", 0.1); },
  tick() { this.blip(1000, 0.03, "square", 0.05); },
  uno() {
    this.blip(988, 0.12, "triangle", 0.12);
    setTimeout(() => this.blip(1319, 0.14, "triangle", 0.12), 120);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.blip(f, 0.16, "triangle", 0.12), i * 130));
  },
  lose() {
    [392, 330, 262].forEach((f, i) =>
      setTimeout(() => this.blip(f, 0.2, "triangle", 0.1), i * 180));
  },
};

// ---------- helpers ----------
function reducedMotion() {
  try {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (err) { return false; }
}

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, value: "0" });
    for (let i = 0; i < 2; i++) {
      for (const v of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"]) {
        deck.push({ color, value: v });
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "wild4" });
  }
  return shuffle(deck);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function cardLabel(card) {
  if (card.value === "skip") return "⊘";
  if (card.value === "reverse") return "⇄";
  if (card.value === "draw2") return "+2";
  if (card.value === "wild") return "WILD";
  if (card.value === "wild4") return "W+4";
  return card.value;
}

function cardPoints(card) {
  if (/^\d$/.test(card.value)) return Number(card.value);
  if (card.value === "draw2" || card.value === "reverse" || card.value === "skip") return 20;
  return 50;
}

// ---------- rules ----------
function canPlay(card) {
  const top = state.discard[state.discard.length - 1];
  if (!top) return false;
  if (card.color === "wild") return true;
  if (card.color === state.activeColor) return true;
  if (card.value === top.value) return true;
  return false;
}

function playableCards() {
  return state.you.filter((c) => canPlay(c));
}

// ---------- rendering ----------
function cardFaceLabel(card) {
  return card.color === "wild" ? "★" : cardLabel(card);
}

function renderCard(card, opts) {
  opts = opts || {};
  const el = document.createElement("div");
  el.className = "card " + card.color;
  if (opts.playable) el.classList.add("playable");
  else if (opts.locked) el.classList.add("locked");

  const inner = document.createElement("div");
  inner.className = "inner";

  const label = cardFaceLabel(card);

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

function topTilt() {
  const n = state.discard.length;
  return (n % 2 ? 1 : -1) * (3 + (n % 3) * 2);
}

function syncDiscard() {
  dom.discardPile.innerHTML = "";
  const top6 = state.discard.slice(-6);
  top6.forEach((card, i) => {
    const el = renderCard(card);
    const isTop = i === top6.length - 1;
    el.style.setProperty("--tilt", (isTop ? topTilt() : (i % 2 ? 1 : -1) * (2 + i)) + "deg");
    dom.discardPile.appendChild(el);
  });
}

function renderAll(opts) {
  opts = opts || {};
  dom.cpuCount.textContent = state.cpu.length;
  dom.youCount.textContent = state.you.length;
  dom.cpuTotal.textContent = state.totalScores.cpu + " pts";
  dom.youTotal.textContent = state.totalScores.you + " pts";
  dom.roundNum.textContent = state.round;
  dom.matchScore.textContent = state.totalScores.you + " : " + state.totalScores.cpu;
  dom.drawCount.textContent = state.deck.length;
  dom.youName.textContent = (state.name || "PLAYER").toUpperCase();

  dom.cpuSeat.classList.toggle("active-turn", state.current === "cpu" && !state.over);
  dom.youSeat.classList.toggle("active-turn", state.current === "you" && !state.over);

  dom.opponentHand.innerHTML = "";
  state.cpu.forEach((_, i) => {
    const back = cardBack();
    if (opts.cpuDrew && i === state.cpu.length - 1) back.classList.add("card-new");
    dom.opponentHand.appendChild(back);
  });

  syncDiscard();

  dom.playerHand.innerHTML = "";
  const myTurn = state.current === "you" && !state.over;
  const anyPlayable = playableCards().length > 0;
  state.you.forEach((card, i) => {
    const can = myTurn && canPlay(card);
    const el = renderCard(card, { playable: can, locked: myTurn && !can && anyPlayable });
    if (opts.youDrew && i === state.you.length - 1) el.classList.add("card-new");
    dom.playerHand.appendChild(el);
  });
  applyFan();

  dom.unoBtn.disabled = !(state.you.length === 1 && !state.over);
  dom.drawHint.textContent = state.over
    ? "Round finished"
    : myTurn
      ? anyPlayable ? "Play a card from your hand" : "No plays — tap the draw pile"
      : "Opponent is thinking…";
}

// fan via CSS vars so hover lifts still work
function applyFan() {
  const cards = Array.prototype.slice.call(dom.playerHand.children);
  const n = cards.length;
  if (!n) return;
  const mid = (n - 1) / 2;
  const spread = Math.min(5, 40 / n);
  cards.forEach((el, i) => {
    const off = i - mid;
    el.style.setProperty("--fan-rot", (off * spread).toFixed(2) + "deg");
    el.style.setProperty("--fan-y", (Math.abs(off) * 4).toFixed(1) + "px");
    el.style.zIndex = i + 1;
  });
}

function fanAngleFor(n, i) {
  const mid = (n - 1) / 2;
  const spread = Math.min(5, 40 / n);
  return (i - mid) * spread;
}

// ---------- toasts / bubble / announce ----------
function toast(msg, kind) {
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = msg;
  dom.toastStack.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function showBubble(text) {
  dom.cpuBubble.textContent = text;
  dom.cpuBubble.hidden = false;
  clearTimeout(showBubble._t);
  showBubble._t = setTimeout(() => { dom.cpuBubble.hidden = true; }, 1800);
  Sound.blip(660, 0.1, "sine", 0.1);
}

// big center-table announcement so every action is readable
function announce(text, kind) {
  if (!dom.announce) return;
  dom.announce.textContent = text;
  dom.announce.className = "announce " + (kind || "");
  dom.announce.hidden = false;
  if (hasAnime && !reducedMotion()) {
    A({
      targets: dom.announce,
      scale: [0.6, 1.12, 1],
      opacity: [0, 1],
      duration: 420,
      easing: "easeOutBack",
    });
  }
  clearTimeout(announce._t);
  announce._t = setTimeout(() => { dom.announce.hidden = true; }, 1500);
}

// ---------- rect helpers ----------
function rectOf(el) { return el.getBoundingClientRect(); }
function centerOf(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// ---------- ghost cards + flights (anime.js) ----------
function ghostEl(card, w, h, faceUp) {
  const el = faceUp ? renderCard(card) : cardBack();
  el.classList.add("ghost");
  el.style.width = w + "px";
  el.style.height = h + "px";
  el.style.position = "fixed";
  el.style.left = "0px";
  el.style.top = "0px";
  el.style.margin = "0";
  el.style.zIndex = "300";
  document.body.appendChild(el);
  return el;
}

// fly a ghost from point A to point B; optional mid-air flip (scaleY squash)
function flyGhost(el, from, to, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const ms = opts.ms || FLIGHT_MS;
    const rot = opts.rot || 0;

    if (reducedMotion() || !hasAnime) {
      el.remove();
      resolve();
      return;
    }

    el.style.left = from.x + "px";
    el.style.top = from.y + "px";

    const frames = {
      targets: el,
      translateX: [0, to.x - from.x],
      translateY: [0, to.y - from.y],
      rotate: [0, rot],
      scale: [from.s || 1, to.s || 1],
      duration: ms,
      easing: opts.ease || "easeOutCubic",
    };

    if (opts.flip) {
      A({
        targets: el,
        scaleY: [
          { value: 1, duration: 0 },
          { value: 0.06, duration: ms * 0.45, easing: "easeInQuad" },
          { value: 1, duration: ms * 0.55, easing: "easeOutQuad" },
        ],
      });
    }

    const anim = A(frames);
    A_DONE(anim).then(() => {
      el.remove();
      resolve();
    });
  });
}

// ---------- seat turn timer (radar rings around each avatar) ----------
const Ring = {
  running: false,
  endAt: 0,
  handle: null,
  lastShown: -1,
  ringEl: null,
  secondsEl: null,
  radarEl: null,
  expired: false,

  start(who) {
    this.stop(); // stop() is an alias of hide() below
    this.running = true;
    this.expired = false;
    this.ringEl = who === "you" ? dom.youRing : dom.cpuRing;
    this.secondsEl = who === "you" ? dom.youSeconds : dom.cpuSeconds;
    this.endAt = performance.now() + TURN_SECONDS * 1000;
    this.lastShown = -1;
    if (this.secondsEl) this.secondsEl.hidden = false;
    this.loop();
  },

  loop() {
    if (!this.running) return;
    const remainMs = Math.max(0, this.endAt - performance.now());
    const sec = Math.ceil(remainMs / 1000);

    if (sec !== this.lastShown) {
      this.lastShown = sec;
      if (this.secondsEl) this.secondsEl.textContent = sec;
      const frac = remainMs / (TURN_SECONDS * 1000);
      if (this.ringEl) {
        this.ringEl.style.strokeDashoffset = (100 - frac * 100).toFixed(2);
        this.ringEl.classList.toggle("racing", sec <= 5);
      }
      if (sec <= 5 && sec > 0) Sound.tick();
    }

    if (remainMs <= 0) {
      this.running = false;
      if (!this.expired) {
        this.expired = true;
        this.onExpire();
      }
      return;
    }
    this.handle = requestAnimationFrame(() => this.loop());
  },

  onExpire() {
    this.stop();
    state.busy = false;
    toast("Time's up — you draw a card", "bad");
    announce("TIME'S UP!", "bad");
    drawCards("you", 1);
    Sound.draw();
    state.current = "cpu";
    renderAll();
    cpuGoLater();
  },

  hide() {
    this.running = false;
    if (this.handle) { cancelAnimationFrame(this.handle); this.handle = null; }
    if (dom.youSeconds) dom.youSeconds.hidden = true;
    if (dom.cpuSeconds) dom.cpuSeconds.hidden = true;
    if (dom.youRing) { dom.youRing.style.strokeDashoffset = 0; dom.youRing.classList.remove("racing"); }
    if (dom.cpuRing) { dom.cpuRing.style.strokeDashoffset = 0; dom.cpuRing.classList.remove("racing"); }
  },

  stop() { this.hide(); }, // kept for readability: start() calls stop()
  reset() { this.hide(); },
};

// ---------- dealing ----------
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function dealCards() {
  const deckC = centerOf(rectOf(dom.drawPile));
  const handEls = Array.from(dom.playerHand.children);
  const oppEls = Array.from(dom.opponentHand.children);

  // hide real cards; they appear exactly when their ghost lands
  handEls.forEach((el) => { el.style.opacity = "0"; });
  oppEls.forEach((el) => { el.style.opacity = "0"; });

  Sound.shuffle();

  for (let i = 0; i < 7; i++) {
    // your card
    const youRect = rectOf(handEls[i]);
    const youGhost = ghostEl(state.you[i], youRect.width, youRect.height, true);
    const from = {
      x: deckC.x - youRect.width / 2,
      y: deckC.y - youRect.height / 2,
      s: 1,
    };
    const to = {
      x: youRect.left,
      y: youRect.top,
      s: 1,
      rot: fanAngleFor(7, i),
    };
    Sound.deal();
    flyGhost(youGhost, from, to, {
      rot: fanAngleFor(7, i),
      ms: FLIGHT_MS,
      ease: "easeOutQuad",
    }).then(() => { handEls[i].style.opacity = "1"; });

    await wait(DEAL_MS);

    // opponent card (face-down, shrinks to mini size, slight rotation)
    const oppRect = rectOf(oppEls[i]);
    const oppGhost = ghostEl(state.cpu[i], oppRect.width, oppRect.height, false);
    const fromC = {
      x: deckC.x - oppRect.width / 2,
      y: deckC.y - oppRect.height / 2,
      s: 1,
    };
    const toC = { x: oppRect.left, y: oppRect.top, s: 1, rot: -6 };
    Sound.deal();
    flyGhost(oppGhost, fromC, toC, {
      rot: -6,
      ms: FLIGHT_MS,
      ease: "easeOutQuad",
    }).then(() => { oppEls[i].style.opacity = "1"; });

    await wait(DEAL_MS);
  }

  await wait(FLIGHT_MS + 80);
}

// ---------- turn engine ----------
async function startRound() {
  state.deck = buildDeck();
  state.discard = [];
  state.you = [];
  state.cpu = [];
  state.awaitingUno = false;
  state.over = false;
  state.pendingCard = null;
  state.pendingRect = null;
  state.busy = true;
  Ring.reset();

  for (let i = 0; i < 7; i++) {
    state.you.push(state.deck.pop());
    state.cpu.push(state.deck.pop());
  }

  // first discard must be a plain number card
  let first = state.deck.pop();
  while (first.color === "wild" || isNaN(Number(first.value))) {
    state.deck.unshift(first);
    first = state.deck.pop();
  }
  state.discard.push(first);
  state.activeColor = first.color;
  state.current = "you";

  renderAll();

  await dealCards();
  if (state.over) return;

  await flyGhost(
    ghostEl(first, 96, 144, true),
    { x: centerOf(rectOf(dom.drawPile)).x - 48, y: centerOf(rectOf(dom.drawPile)).y - 72, s: 1 },
    (() => {
      const r = rectOf(dom.discardPile);
      return { x: r.left, y: r.top, s: 1 };
    })(),
    { rot: topTilt(), ms: 420, ease: "easeOutCubic" }
  );
  syncDiscard();

  state.busy = false;
  announce("Round " + state.round + " — your move", "good");
  Ring.start("you");
  Sound.turn();
}

function cpuGoLater() {
  setTimeout(cpuTurn, 900);
}

function nextTurn() {
  state.current = state.current === "you" ? "cpu" : "you";
  renderAll();

  if (state.current === "cpu") {
    cpuGoLater();
    return;
  }

  // fair UNO rule: penalty lands the moment your next turn begins
  if (state.awaitingUno && state.you.length === 1) {
    state.awaitingUno = false;
    drawCards("you", 2);
    toast("You forgot to call UNO — draw 2!", "bad");
    announce("UNO PENALTY!", "bad");
  }
  Ring.start("you");
  Sound.turn();
}

// returns true if the same player keeps the turn (skip / reverse in 1v1)
function applySpecial(who, card) {
  if (card.value === "skip" || card.value === "reverse") {
    const youSkipped = who === "you";
    announce(youSkipped ? "OPPONENT SKIPPED!" : "YOU WERE SKIPPED!", youSkipped ? "good" : "bad");
    return true;
  }
  if (card.value === "draw2") {
    const victim = who === "you" ? "cpu" : "you";
    drawCardsAnimated(victim, 2);
    announce(victim === "you" ? "YOU DRAW 2!" : "OPPONENT DRAWS 2!", victim === "you" ? "bad" : "good");
    return false;
  }
  if (card.value === "wild4") {
    const victim = who === "you" ? "cpu" : "you";
    drawCardsAnimated(victim, 4);
    announce(victim === "you" ? "YOU DRAW 4!" : "OPPONENT DRAWS 4!", victim === "you" ? "bad" : "good");
    return false;
  }
  return false;
}

async function playCard(who, card, chosenColor, fromRect) {
  const hand = who === "you" ? state.you : state.cpu;
  const idx = hand.indexOf(card);
  if (idx === -1) return;
  hand.splice(idx, 1);

  state.discard.push(card);
  state.activeColor = chosenColor ||
    (card.color === "wild" ? state.activeColor : card.color);

  const keepsTurn = applySpecial(who, card);
  renderAll();

  // physical flight: from the seat (you) or the opponent hand (cpu) to the discard
  const to = (() => {
    const r = rectOf(dom.discardPile);
    return { x: r.left, y: r.top, s: 1 };
  })();
  const from = (() => {
    if (fromRect) {
      return { x: fromRect.left, y: fromRect.top, s: fromRect.width / 96 };
    }
    const r = rectOf(who === "you" ? dom.playerHand : dom.opponentHand);
    return { x: r.left + r.width / 2, y: r.top, s: 1 };
  })();

  await flyGhost(
    ghostEl(card, 96, 144, true),
    from,
    to,
    { rot: topTilt(), ms: FLIGHT_MS, ease: "easeOutCubic", flip: who === "cpu" }
  );
  settleTopCard();
  // crunch: shake the victim's hand when they draw, pop the pile on slams
  if (who === "cpu" && (card.value === "draw2" || card.value === "wild4")) {
    dom.opponentHand.classList.add("opp-shake");
    setTimeout(() => dom.opponentHand.classList.remove("opp-shake"), 420);
  }
  if (who === "you" && (card.value === "draw2" || card.value === "wild4")) {
    dom.playerHand.classList.add("shake");
    setTimeout(() => dom.playerHand.classList.remove("shake"), 420);
  }
  state.busy = false;

  if (state.over) return;
  Sound.play();
  if (checkWin(who)) return;

  if (keepsTurn) {
    if (who === "you") { Ring.start("you"); Sound.turn(); }
    else cpuGoLater();
  } else {
    nextTurn();
  }
}

function settleTopCard() {
  const top = dom.discardPile.lastElementChild;
  if (!top) return;
  if (hasAnime && !reducedMotion()) {
    A({
      targets: top.querySelector(".inner"),
      scale: [1.12, 1],
      duration: 260,
      easing: "easeOutQuad",
    });
  }
}

// animated draw: ghost flies from the deck to the seat
async function drawCardsAnimated(who, n) {
  const deckC = centerOf(rectOf(dom.drawPile));
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) reshuffle();
    if (state.deck.length === 0) break;
    const card = state.deck.pop();

    const seatEl = who === "you" ? dom.youSeat : dom.cpuSeat;
    const seatR = rectOf(seatEl);
    const ghostW = who === "you" ? 96 : 40;
    const ghostH = who === "you" ? 144 : 60;

    const g = ghostEl(card, ghostW, ghostH, who === "you");
    const from = { x: deckC.x - ghostW / 2, y: deckC.y - ghostH / 2, s: 1 };
    const to = {
      x: seatR.left + seatR.width / 2 - ghostW / 2,
      y: seatR.top + seatR.height / 2 - ghostH / 2,
      s: who === "cpu" ? 0.6 : 0.5,
    };
    Sound.draw();
    flyGhost(g, from, to, { rot: who === "cpu" ? -8 : 8, ms: 320, ease: "easeOutQuad" });
    await wait(120);

    if (who === "you") state.you.push(card);
    else state.cpu.push(card);
  }
  renderAll({ youDrew: who === "you", cpuDrew: who === "cpu" });
}

function drawCards(who, n) {
  const hand = who === "you" ? state.you : state.cpu;
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) reshuffle();
    if (state.deck.length === 0) break;
    hand.push(state.deck.pop());
  }
  renderAll({ youDrew: who === "you", cpuDrew: who === "cpu" });
}

function reshuffle() {
  if (state.discard.length <= 1) return;
  const top = state.discard.pop();
  state.deck = shuffle(state.discard);
  state.discard = [top];
  toast("Deck exhausted — discard pile reshuffled");
  announce("RESHUFFLING…", "");
  Sound.shuffle();
}

// ---------- win check ----------
function checkWin(who) {
  if (state[who].length !== 0) return false;
  endRound(who);
  return true;
}

// ---------- player actions ----------
function onCardClick(card, el) {
  if (state.over || state.busy || state.current !== "you") return;
  if (!canPlay(card)) {
    toast("That card doesn't match", "bad");
    Sound.blip(220, 0.1, "square", 0.08);
    return;
  }
  if (card.color === "wild") {
    state.pendingCard = card;
    state.pendingRect = rectOf(el);
    Ring.hide(); // don't let the clock run while picking a color
    dom.colorOverlay.classList.add("show");
    return;
  }
  commitPlay(card, card.color, rectOf(el));
}

function commitPlay(card, chosenColor, fromRect) {
  if (state.busy || state.over) return;
  state.busy = true;
  Ring.hide();
  const willBeOne = state.you.length - 1 === 1;
  playCard("you", card, chosenColor, fromRect);
  if (willBeOne && !state.over) {
    state.awaitingUno = true;
    toast("One card left — press UNO!", "good");
  }
}

dom.playerHand.addEventListener("click", (e) => {
  const el = e.target.closest(".card");
  if (!el) return;
  const idx = Array.prototype.indexOf.call(dom.playerHand.children, el);
  const card = state.you[idx];
  if (card) onCardClick(card, el);
});

dom.drawPile.addEventListener("click", async () => {
  if (state.over || state.busy || state.current !== "you") return;
  if (playableCards().length > 0) {
    toast("You still have a playable card!", "bad");
    return;
  }
  state.busy = true;
  Ring.hide();
  await drawCardsAnimated("you", 1);
  state.busy = false;
  if (state.over) return;
  const drawn = state.you[state.you.length - 1];
  if (drawn && canPlay(drawn)) {
    toast("Playable! Play it now.", "good");
    Ring.start("you");
  } else {
    announce("NO PLAY — TURN PASSES", "bad");
    state.current = "cpu";
    renderAll();
    cpuGoLater();
  }
});

dom.unoBtn.addEventListener("click", () => {
  if (state.awaitingUno && state.you.length === 1) {
    state.awaitingUno = false;
    toast("UNO!", "good");
    announce("UNO!", "good");
    Sound.uno();
  }
});

// ---------- cpu ----------
function cpuTurn() {
  if (state.over || state.current !== "cpu") return;
  const playable = state.cpu.filter((c) => canPlay(c));

  if (playable.length === 0) {
    drawCardsAnimated("cpu", 1).then(() => {
      if (state.over) return;
      const drawn = state.cpu[state.cpu.length - 1];
      if (drawn && canPlay(drawn)) {
        setTimeout(() => { if (!state.over) playCpuCard(drawn); }, 500);
      } else {
        nextTurn();
      }
    });
    return;
  }

  // spend high-point cards first, hoard wilds
  const nonWild = playable.filter((c) => c.color !== "wild");
  const pool = nonWild.length ? nonWild : playable;
  pool.sort((a, b) => cardPoints(b) - cardPoints(a));
  setTimeout(() => { if (!state.over) playCpuCard(pool[0]); }, 500);
}

function playCpuCard(card) {
  if (state.over) return;
  state.busy = true;
  const chosen = card.color === "wild"
    ? COLORS[Math.floor(Math.random() * 4)]
    : card.color;
  const oppRect = rectOf(dom.opponentHand);
  playCard("cpu", card, chosen, {
    left: oppRect.left + oppRect.width / 2 - 48,
    top: oppRect.top,
    width: 96,
    height: 144,
  }).then(() => {
    if (state.over) return;
    if (state.cpu.length === 1) showBubble("CPU: UNO!");
  });
}

// ---------- round end ----------
async function endRound(winner) {
  state.over = true;
  state.busy = false;
  Ring.hide();
  const loser = winner === "you" ? "cpu" : "you";
  const points = state[loser].reduce((s, c) => s + cardPoints(c), 0);
  state.totalScores[winner] += points;
  const matchOver = state.totalScores[winner] >= WIN_TARGET;

  dom.overTitle.textContent = matchOver
    ? (winner === "you" ? "🏆 You win the match!" : "House bot wins the match")
    : (winner === "you" ? "You win the round!" : "House bot wins");
  dom.overTitle.className = "over-title " + (winner === "you" ? "win" : "lose");
  dom.overSub.textContent = matchOver
    ? WIN_TARGET + " points reached"
    : "Round " + state.round + " complete";
  dom.overPoints.textContent = "+" + points + " pts → " + (winner === "you" ? "you" : "CPU") +
    " · Match " + state.totalScores.you + " : " + state.totalScores.cpu;
  dom.nextRoundBtn.hidden = matchOver;

  dom.saveNote.hidden = false;
  dom.saveNote.textContent = "Saving result…";
  dom.saveNote.className = "save-note";

  renderAll();
  dom.overOverlay.classList.add("show");
  if (winner === "you") Sound.win(); else Sound.lose();

  // coin economy for signed-in players (vs-bot: ±25 ante)
  const coinEl = document.getElementById("coinResult");
  if (Auth.user) {
    const coins = await settleBotRoundCoins(winner);
    coinEl.hidden = false;
    coinEl.textContent = winner === "you" ? "You won 🪙 +25" : "You lost 🪙 −25";
    coinEl.className = "coin-result " + (winner === "you" ? "pos" : "");
  } else {
    coinEl.hidden = true;
  }

  saveScore().then((result) => {
    dom.saveNote.hidden = false;
    dom.saveNote.textContent = result.ok
      ? "✓ Result saved to Neon database"
      : "⚠ " + (result.error || "Database offline — score not saved");
    dom.saveNote.className = "save-note " + (result.ok ? "ok" : "err");
  });
}

async function saveScore() {
  try {
    const res = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player: (Auth.user && Auth.user.username) || state.name || "PLAYER",
        score: state.totalScores.you,
        rounds: state.round,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    return { ok: true };
  } catch (err) {
    console.error("Save failed:", err);
    return { ok: false, error: err.message };
  }
}

// coins: winner of a vs-bot round banks the pot (ante 25) from the house bank
async function settleBotRoundCoins(winner) {
  if (!Auth.user) return null;
  const delta = winner === "you" ? 25 : -25;
  const coins = await Auth.addCoins(delta);
  if (coins != null) {
    document.getElementById("gameCoins").textContent = coins;
    coinFloat(document.getElementById("gameCoins"), (delta > 0 ? "+" : "") + delta + " 🪙");
  }
  return coins;
}

dom.nextRoundBtn.addEventListener("click", () => {
  dom.overOverlay.classList.remove("show");
  state.round += 1;
  startRound();
});

dom.overHomeBtn.addEventListener("click", () => {
  dom.overOverlay.classList.remove("show");
  showHome();
});

// ---------- wild color picker ----------
Array.prototype.forEach.call(document.querySelectorAll(".color-choice"), (btn) => {
  btn.addEventListener("click", () => {
    const color = btn.dataset.color;
    dom.colorOverlay.classList.remove("show");
    if (state.pendingCard) {
      const card = state.pendingCard;
      const rect = state.pendingRect;
      state.pendingCard = null;
      state.pendingRect = null;
      commitPlay(card, color, rect);
    }
  });
});

// ---------- navigation ----------
function showGame() {
  dom.home.classList.remove("active");
  dom.game.classList.add("active");
  if (Auth.user) state.name = Auth.user.username;
  startRound();
}

function showHome() {
  Ring.hide();
  state.over = true;
  state.busy = false;
  dom.game.classList.remove("active");
  dom.home.classList.add("active");
  loadLeaderboard();
  renderAuthUI();
}

// ---------- auth + home wiring (elements exist in index.html) ----------
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");
const playCpuBtn = document.getElementById("playCpuBtn");
const openRoomsBtn = document.getElementById("openRoomsBtn");
const authMsg = document.getElementById("authMsg");
const playerNameInput = document.getElementById("playerName");
const playerPassInput = document.getElementById("playerPass");

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      await Auth.login(playerNameInput.value.trim(), playerPassInput.value);
      authMsg.textContent = "Welcome back, " + Auth.user.username + "!";
      renderAuthUI();
    } catch (err) {
      authMsg.textContent = err.message;
    }
  });
}

if (registerBtn) {
  registerBtn.addEventListener("click", async () => {
    try {
      await Auth.register(playerNameInput.value.trim(), playerPassInput.value);
      authMsg.textContent = "Account created — you start with 500 coins!";
      renderAuthUI();
    } catch (err) {
      authMsg.textContent = err.message;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await Auth.logout();
    authMsg.textContent = "Signed out.";
    renderAuthUI();
  });
}

if (playCpuBtn) {
  playCpuBtn.addEventListener("click", () => {
    Sound.ensure();
    showGame();
  });
}

if (openRoomsBtn) {
  openRoomsBtn.addEventListener("click", () => {
    dom.home.classList.remove("active");
    document.getElementById("rooms").classList.add("active");
    if (window.Rooms) window.Rooms.refreshRooms();
  });
}

if (dom.quitBtn) dom.quitBtn.addEventListener("click", showHome);
if (dom.rulesBtn && dom.rulesOverlay) {
  dom.rulesBtn.addEventListener("click", () => dom.rulesOverlay.classList.add("show"));
}
if (dom.closeRulesBtn && dom.rulesOverlay) {
  dom.closeRulesBtn.addEventListener("click", () => dom.rulesOverlay.classList.remove("show"));
  dom.rulesOverlay.addEventListener("click", (e) => {
    if (e.target === dom.rulesOverlay) dom.rulesOverlay.classList.remove("show");
  });
}

// ---------- leaderboard ----------
async function loadLeaderboard() {
  setPill("connecting", "");
  try {
    const res = await fetch("/api/scores?limit=8");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    renderLeaderboard(data.scores || []);
    setPill("neon live", "ok");
  } catch (err) {
    console.error(err);
    dom.homeLeaderboard.innerHTML = "";
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = err.message || "Leaderboard unavailable — database offline";
    dom.homeLeaderboard.appendChild(li);
    setPill("offline", "err");
  }
}

function renderLeaderboard(scores) {
  dom.homeLeaderboard.innerHTML = "";
  if (!scores.length) {
    dom.homeLeaderboard.innerHTML = '<li class="empty">No scores yet — be the first!</li>';
    return;
  }
  scores.forEach((s, i) => {
    const li = document.createElement("li");

    const rank = document.createElement("span");
    rank.className = "lb-rank";
    rank.textContent = "#" + (i + 1);

    const name = document.createElement("span");
    name.className = "lb-name";
    name.textContent = s.player;

    const score = document.createElement("span");
    score.className = "lb-score";
    score.textContent = s.score + " pts";

    const meta = document.createElement("span");
    meta.className = "lb-rounds";
    meta.textContent = "rd " + s.rounds;

    li.appendChild(rank);
    li.appendChild(name);
    li.appendChild(score);
    li.appendChild(meta);
    dom.homeLeaderboard.appendChild(li);
  });
}

function setPill(text, cls) {
  dom.dbPillHome.textContent = "● " + text;
  dom.dbPillHome.className = "db-pill " + (cls || "");
}

// ---------- boot ----------
(async function boot() {
  await Auth.refresh();
  renderAuthUI();
  loadLeaderboard();
})();
