// Authoritative UNO engine used by the server for room games (and bots).
// 2–4 players, seats 0..3. State is plain JSON stored in rooms.game_state.

const COLORS = ["red", "yellow", "green", "blue"];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function buildDeck() {
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

export function cardPoints(card) {
  if (/^\d$/.test(card.value)) return Number(card.value);
  if (card.value === "draw2" || card.value === "reverse" || card.value === "skip") return 20;
  return 50;
}

// game: { deck, discard, players:[{userId, username, hand, isBot}], current, dir, activeColor, awaitingColor, winner }
export function newGame(players, startingSeat) {
  const deck = buildDeck();
  const game = {
    deck,
    discard: [],
    players: players.map((p, seat) => ({
      userId: p.userId,
      username: p.username,
      isBot: !!p.isBot,
      hand: [],
    })),
    current: startingSeat,
    dir: 1,
    activeColor: "red",
    winner: null,
    awaitingColor: null, // seat that must pick a color after a wild
    lastAction: null,
    version: 0,
  };
  for (let i = 0; i < 7; i++) {
    for (const p of game.players) p.hand.push(deck.pop());
  }
  let first = deck.pop();
  while (first.color === "wild" || isNaN(Number(first.value))) {
    deck.unshift(first);
    first = deck.pop();
  }
  game.discard.push(first);
  game.activeColor = first.color;
  return game;
}

export function canPlay(game, seat, card) {
  const top = game.discard[game.discard.length - 1];
  if (!top) return false;
  if (card.color === "wild") return true;
  if (card.color === game.activeColor) return true;
  if (card.value === top.value) return true;
  return false;
}

export function legalMoves(game, seat) {
  return game.players[seat].hand.filter((c) => canPlay(game, seat, c));
}

function drawCards(game, seat, n) {
  for (let i = 0; i < n; i++) {
    if (game.deck.length === 0) {
      if (game.discard.length <= 1) break;
      const top = game.discard.pop();
      game.deck = shuffle(game.discard);
      game.discard = [top];
    }
    const c = game.deck.pop();
    if (c) game.players[seat].hand.push(c);
  }
}

function nextSeat(game, from) {
  return (from + game.dir + game.players.length) % game.players.length;
}

export function playCard(game, seat, cardIndex, chosenColor) {
  const player = game.players[seat];
  const card = player.hand[cardIndex];
  if (!card) return { ok: false, error: "no such card" };
  if (game.winner !== null) return { ok: false, error: "game over" };
  if (seat !== game.current) return { ok: false, error: "not your turn" };
  if (game.awaitingColor !== null && game.awaitingColor !== seat) {
    return { ok: false, error: "waiting for color choice" };
  }
  if (!canPlay(game, seat, card)) return { ok: false, error: "card doesn't match" };

  player.hand.splice(cardIndex, 1);
  game.discard.push(card);
  game.lastAction = {
    type: "play",
    seat,
    card,
    chosenColor: card.color === "wild" ? chosenColor : null,
    at: Date.now(),
  };

  if (card.color === "wild") {
    if (!chosenColor || !COLORS.includes(chosenColor)) {
      game.awaitingColor = seat;
      return { ok: true, needColor: true };
    }
    game.activeColor = chosenColor;
    game.awaitingColor = null;
  } else {
    game.activeColor = card.color;
    game.awaitingColor = null;
  }

  const effects = [];

  if (card.value === "skip") {
    const skipped = nextSeat(game, seat);
    effects.push({ type: "skip", seat: skipped });
    game.current = nextSeat(game, skipped);
  } else if (card.value === "reverse") {
    if (game.players.length === 2) {
      // in 1v1 reverse acts as skip
      const skipped = nextSeat(game, seat);
      effects.push({ type: "skip", seat: skipped });
      game.current = nextSeat(game, skipped);
    } else {
      game.dir *= -1;
      game.current = nextSeat(game, seat);
      effects.push({ type: "reverse" });
    }
  } else if (card.value === "draw2") {
    const victim = nextSeat(game, seat);
    drawCards(game, victim, 2);
    effects.push({ type: "draw", seat: victim, n: 2 });
    game.current = nextSeat(game, victim);
  } else if (card.value === "wild4") {
    const victim = nextSeat(game, seat);
    drawCards(game, victim, 4);
    effects.push({ type: "draw", seat: victim, n: 4 });
    game.current = nextSeat(game, victim);
  } else {
    game.current = nextSeat(game, seat);
  }

  if (player.hand.length === 0) {
    game.winner = seat;
    game.lastAction.win = true;
  } else if (player.hand.length === 1) {
    game.lastAction.uno = true;
  }

  game.version++;
  return { ok: true, effects };
}

export function pickColor(game, seat, color) {
  if (game.awaitingColor !== seat) return { ok: false, error: "not waiting for your color" };
  if (!COLORS.includes(color)) return { ok: false, error: "bad color" };
  game.activeColor = color;
  game.awaitingColor = null;

  // the wild card that triggered this is on top; apply its advance now
  const card = game.discard[game.discard.length - 1];
  const effects = [];
  if (card.value === "wild4") {
    const victim = nextSeat(game, seat);
    drawCards(game, victim, 4);
    effects.push({ type: "draw", seat: victim, n: 4 });
    game.current = nextSeat(game, victim);
  } else {
    game.current = nextSeat(game, seat);
  }
  game.version++;
  return { ok: true, effects };
}

export function drawTurn(game, seat) {
  if (game.winner !== null) return { ok: false, error: "game over" };
  if (seat !== game.current) return { ok: false, error: "not your turn" };
  if (game.awaitingColor !== null) return { ok: false, error: "pick a color first" };

  drawCards(game, seat, 1);
  const drawn = game.players[seat].hand[game.players[seat].hand.length - 1];
  game.lastAction = { type: "draw", seat, at: Date.now() };

  let playable = false;
  if (drawn && canPlay(game, seat, drawn)) {
    playable = true;
  } else {
    game.current = nextSeat(game, seat);
  }
  game.version++;
  return { ok: true, playable };
}

// pass after drawing a playable card (or when stuck)
export function passTurn(game, seat) {
  if (seat !== game.current) return { ok: false, error: "not your turn" };
  if (game.awaitingColor !== null) return { ok: false, error: "pick a color first" };
  game.current = nextSeat(game, seat);
  game.lastAction = { type: "pass", seat, at: Date.now() };
  game.version++;
  return { ok: true };
}

export function handScore(hand) {
  return hand.reduce((s, c) => s + cardPoints(c), 0);
}

// ---------- bot brain (server-side, simple but decent) ----------
export function botMove(game, seat) {
  const moves = legalMoves(game, seat);
  const hand = game.players[seat].hand;

  if (game.awaitingColor === seat) {
    // pick color they hold most
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const c of hand) if (c.color !== "wild") counts[c.color]++;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { type: "color", color: best[1] > 0 ? best[0] : COLORS[Math.floor(Math.random() * 4)] };
  }

  if (moves.length === 0) return { type: "draw" };

  const nonWild = moves.filter((c) => c.color !== "wild");
  const pool = nonWild.length ? nonWild : moves;
  pool.sort((a, b) => cardPoints(b) - cardPoints(a));

  // if an opponent is about to win, dump a wild4/draw2 at them
  const threats = game.players.filter(
    (p, i) => i !== seat && p.hand.length <= 2
  ).length;
  if (threats > 0) {
    const aggressive = moves.find(
      (c) => c.value === "wild4" || c.value === "draw2"
    );
    if (aggressive) return { type: "play", index: game.players[seat].hand.indexOf(aggressive) };
  }

  return { type: "play", index: game.players[seat].hand.indexOf(pool[0]) };
}
