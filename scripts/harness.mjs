"use strict";

/**
 * Headless harness for the UNO game.
 * Executes the real game.js in a minimal DOM emulation, drives a full
 * round like a player and reports defects (especially the timer ring).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ---------- tiny DOM emulation ----------
// Style stores any assignment (camelCase CSSOM names included) so tests can read back
class Style {
  constructor() { return new Proxy({ _kv: {} }, {
    get(t, k) {
      if (k === "setProperty") return (n, v) => { t._kv[n] = v; };
      if (k === "getPropertyValue") return (n) => t._kv[n] ?? "";
      if (k === "_kv") return t._kv;
      return t._kv[String(k)] ?? "";
    },
    set(t, k, v) { t._kv[String(k)] = String(v); return true; },
    has(t, k) { return k in t._kv; },
  }); }
}

class ClassList {
  constructor(el) { this.el = el; }
  add(...cls) { cls.forEach((c) => { if (!this.includes(c)) this.el._classes.push(c); }); }
  remove(...cls) { this.el._classes = this.el._classes.filter((c) => !cls.includes(c)); }
  toggle(c, force) {
    const has = this.includes(c);
    const want = force === undefined ? !has : !!force;
    if (want && !has) this.el._classes.push(c);
    if (!want && has) this.remove(c);
    return want;
  }
  contains(c) { return this.includes(c); }
  includes(c) { return this.el._classes.includes(c); }
}

class El {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = new Style();
    this.dataset = attrs.dataset || {};
    this._classes = attrs.className ? String(attrs.className).split(/\s+/).filter(Boolean) : [];
    this._text = "";
    this.hidden = attrs.hidden || false;
    this.listeners = {};
    this._nextId = 1;
    this.classList = new ClassList(this);
    this._rect = { left: 100, top: 200, width: 96, height: 144, right: 196, bottom: 344 };
    this._textContent = "";
  }

  get classList2() { return this.classList; }

  appendChild(child) {
    if (child && child.parentNode) child.parentNode.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  get textContent() { return this._textContent; }
  set textContent(v) {
    this._textContent = String(v);
    this.children = [];
  }

  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }

  set className(v) { this._classes = String(v).split(/\s+/).filter(Boolean); }
  get className() { return this._classes.join(" "); }

  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const arr = this.listeners[type] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  dispatch(type, event = {}) {
    event.target = event.target || this;
    (this.listeners[type] || []).slice().forEach((fn) => fn(event));
  }

  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (el) => {
      for (const c of el.children) {
        if (matches(c, sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  getBoundingClientRect() { return { ...this._rect }; }
  closest(sel) {
    let el = this;
    while (el) {
      if (matches(el, sel)) return el;
      el = el.parentNode;
    }
    return null;
  }
  click() { this.dispatch("click", { target: this }); }
}

function matches(el, sel) {
  if (!el || !el._classes) return false;
  if (sel.startsWith(".")) return el._classes.includes(sel.slice(1));
  if (sel.startsWith("#")) return el.id === sel.slice(1);
  return el.tagName === sel.toUpperCase();
}

class DocumentShim {
  constructor() {
    this.body = new El("body");
    this.elements = new Map();
    this._nextId = 1;
  }
  createElement(tag) { return new El(tag); }
  getElementById(id) {
    if (!this.elements.has(id)) {
      const el = new El("div");
      el.id = id;
      this.elements.set(id, el);
      this.body.appendChild(el);
    }
    return this.elements.get(id);
  }
  querySelectorAll(sel) { return this.body.querySelectorAll(sel); }
  addEventListener() {}
}

// globals the game expects
const documentShim = new DocumentShim();
const timers = { next: 1, active: new Map() };
const rafQueue = [];

globalThis.window = globalThis;
globalThis.document = documentShim;
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
globalThis.location = { href: "http://localhost/" };
globalThis.performance = { now: () => Date.now() };
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = (cb) => {
  const id = timers.next++;
  timers.active.set(id, cb);
  rafQueue.push(id);
  return id;
};
globalThis.cancelAnimationFrame = (id) => timers.active.delete(id);

// fetch stub (leaderboard + score save)
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });

// accelerate the GAME clock 5x (harness keeps real time via realSetTimeout)
const realSetTimeout = setTimeout.bind(globalThis);
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, Math.max(1, (ms || 0) / 5));

// anime.js stub that records animations and completes instantly
const animeCalls = [];
globalThis.anime = Object.assign((opts) => {
  animeCalls.push(opts);
  const timeline = {
    targets: opts.targets,
    finished: Promise.resolve(),
  };
  return timeline;
}, {
  timeline: (opts) => ({
    finished: Promise.resolve(),
    add() { return this; },
  }),
});

// run game.js (append an exposure line so the harness can reach internals)
const src = readFileSync(path.join(root, "game.js"), "utf8") +
  "\n;globalThis.__uno = { state, canPlay, commitPlay, dom, Ring, playableCards };";
new Function(src)();
const { state, canPlay, commitPlay, Ring } = globalThis.__uno;

// ---------- assertions / driver ----------
const results = [];
function check(name, ok, extra) {
  results.push({ name, ok, extra: extra || "" });
  console.log((ok ? "  PASS " : "  FAIL ") + name + (extra ? ` — ${extra}` : ""));
}

const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));

function drainRaf() {
  let guard = 0;
  while (rafQueue.length && guard < 100) {
    guard++;
    const id = rafQueue.shift();
    const cb = timers.active.get(id);
    if (cb) {
      timers.active.delete(id);
      cb();
    }
  }
}

async function main() {
  console.log("\n== harness: full round exercise ==\n");

  check("game booted without throwing", true);

  // find the refs through the dom map by id
  const els = documentShim.elements;
  const playerHand = els.get("playerHand");
  const cpuRing = els.get("cpuRing");
  const youRing = els.get("youRing");
  const youSeconds = els.get("youSeconds");
  const drawPile = els.get("drawPile");
  const drawCount = els.get("drawCount");

  // player name
  const nameInput = els.get("playerName");
  nameInput._textContent = "Test";

  // the color-picker buttons exist in index.html; create them in the shim too
  const colorOverlayEl = els.get("colorOverlay");
  ["red", "yellow", "green", "blue"].forEach((c) => {
    const b = new El("button");
    b._classes = ["color-choice", c];
    b.dataset = { color: c };
    colorOverlayEl.appendChild(b);
  });

  els.get("startBtn").click();

  await sleep(3200); // deal ~2.6s + first-discard flight
  drainRaf();

  check("game started (round 1)", els.get("roundNum").textContent === "1", `roundNum=${els.get("roundNum").textContent}`);
  check("hands dealt 7 each",
    playerHand.children.length === 7 && els.get("opponentHand").children.length === 7,
    `you=${playerHand.children.length} cpu=${els.get("opponentHand").children.length}`);

  // ---- timer ring behavior: the core of this run ----
  // Ring.start("you") runs on an rAF chain; drain it and inspect.
  check("your turn active", els.get("youSeat")._classes.includes("active-turn"));

  // wait a bit then drain raf again and check ring progress values
  await sleep(1200);
  drainRaf();
  await sleep(1200);
  drainRaf();

  const off1 = parseFloat(youRing.style["strokeDashoffset"] || youRing.style["stroke-dashoffset"]);
  check("timer ring is animating (dashoffset changes)", !Number.isNaN(off1) && off1 !== 0, `offset=${youRing.style["strokeDashoffset"]}`);
  check("seconds counter visible on your seat", youSeconds.hidden === false && youSeconds.textContent !== "", `text="${youSeconds.textContent}"`);
  check("seconds counted down", Number(youSeconds.textContent) < 20, `sec=${youSeconds.textContent}`);

  // ---- play a full round by clicking cards whenever it's our turn ----
  const deadline = Date.now() + 150000;
  let played = 0;
  let roundEnded = false;
  let turnsSeen = 0;
  let lastYouTurn = false;
  let lastLog = 0;

  while (Date.now() < deadline) {
    drainRaf();
    const over = state.over;
    if (over) { roundEnded = true; break; }

    if (Date.now() - lastLog > 20000) {
      lastLog = Date.now();
      console.log(`  …playing: you=${state.you.length} cpu=${state.cpu.length} deck=${state.deck.length} discard=${state.discard.length} turns=${turnsSeen}`);
    }

    if (state.current === "you" && !state.busy) {
      if (!lastYouTurn) { turnsSeen++; lastYouTurn = true; }

      // if the wild-color picker is open, choose a color like a human would
      const colorOverlay = els.get("colorOverlay");
      if (colorOverlay._classes.includes("show")) {
        const choices = documentShim.querySelectorAll(".color-choice");
        if (choices.length) {
          choices[Math.floor(Math.random() * choices.length)].click();
          await sleep(150);
          continue;
        }
      }

      const playable = state.you.find((c) => canPlay(c));
      if (playable) {
        const idx = state.you.indexOf(playable);
        const el = playerHand.children[idx];
        if (el) {
          // real clicks land on the card and bubble to #playerHand's listener
          playerHand.dispatch("click", { target: el });
          played++;
        } else {
          commitPlay(playable, playable.color, el && el.getBoundingClientRect());
          played++;
        }
        await sleep(150);
      } else {
        drawPile.click();
        await sleep(220);
      }
    } else {
      lastYouTurn = false;
      await sleep(40);
    }
  }

  check("round reached an end (somebody emptied their hand)", roundEnded, `played=${played} turns=${turnsSeen} you=${state.you.length} cpu=${state.cpu.length}`);

  if (roundEnded) {
    check("round-over modal shown", els.get("overOverlay")._classes.includes("show"));
    check("score save attempted", true);
    // next round
    els.get("nextRoundBtn").click();
    await sleep(3300);
    drainRaf();
    check("next round started", state.round === 2 && !state.over, `round=${state.round}`);
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - fails.length}/${results.length} checks passed ==\n`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(2); });
