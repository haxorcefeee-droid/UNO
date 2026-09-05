import { v4 as uuidv4 } from 'uuid';
import { GameState, Player, Card, CardColor, CardValue, PlayCardPayload } from './types';
import { createDeck, drawCards } from './deck';

const HAND_SIZE = 7;

// ─── Game Initialization ────────────────────────────────────────────────────

export function initGame(players: Omit<Player, 'hand' | 'saidUno'>[]): GameState {
  let deck = createDeck();
  const hands: Card[][] = players.map(() => []);

  // Deal 7 cards to each player
  for (let i = 0; i < HAND_SIZE; i++) {
    for (let p = 0; p < players.length; p++) {
      hands[p].push(deck.shift()!);
    }
  }

  // First discard card — must not be a wild
  let firstCard = deck.shift()!;
  while (firstCard.value === 'wild' || firstCard.value === 'wild_draw4') {
    deck.push(firstCard);
    firstCard = deck.shift()!;
  }

  const gamePlayers: Player[] = players.map((p, i) => ({
    ...p,
    hand: hands[i],
    saidUno: false,
  }));

  return {
    roomId: '',
    players: gamePlayers,
    deck,
    discardPile: [firstCard],
    currentPlayerIndex: 0,
    direction: 1,
    status: 'playing',
    currentColor: firstCard.color,
    drawStack: 0,
    winner: null,
    turnStartedAt: Date.now(),
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function isValidPlay(card: Card, topCard: Card, currentColor: CardColor, drawStack: number): boolean {
  // If there's a draw stack active, only draw cards of same type can stack
  if (drawStack > 0) {
    if (topCard.value === 'draw2') return card.value === 'draw2';
    if (topCard.value === 'wild_draw4') return card.value === 'wild_draw4';
  }

  // Wilds are always playable
  if (card.color === 'wild') return true;

  // Match color or value
  return card.color === currentColor || card.value === topCard.value;
}

// ─── Play a Card ─────────────────────────────────────────────────────────────

export interface PlayResult {
  success: boolean;
  error?: string;
  newState?: GameState;
  effect?: CardEffect;
}

export interface CardEffect {
  type: 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild_draw4' | 'normal' | 'uno' | 'win';
  affectedPlayerId?: string;
  drawCount?: number;
}

export function playCard(state: GameState, playerId: string, payload: PlayCardPayload): PlayResult {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { success: false, error: 'Player not in game' };
  if (playerIndex !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };

  const player = state.players[playerIndex];
  const cardIndex = player.hand.findIndex(c => c.id === payload.cardId);
  if (cardIndex === -1) return { success: false, error: 'Card not in hand' };

  const card = player.hand[cardIndex];
  const topCard = state.discardPile[state.discardPile.length - 1];

  if (!isValidPlay(card, topCard, state.currentColor, state.drawStack)) {
    return { success: false, error: 'Invalid card play' };
  }

  if ((card.value === 'wild' || card.value === 'wild_draw4') && !payload.chosenColor) {
    return { success: false, error: 'Must choose a color for wild card' };
  }

  // Clone state for immutability
  const newState: GameState = JSON.parse(JSON.stringify(state));
  const newPlayer = newState.players[playerIndex];

  // Remove card from hand
  newPlayer.hand.splice(cardIndex, 1);
  newState.discardPile.push(card);

  // Update current color
  newState.currentColor = payload.chosenColor ?? card.color;

  let effect: CardEffect = { type: 'normal' };

  // Apply card effect
  switch (card.value) {
    case 'skip': {
      effect = { type: 'skip' };
      advanceTurn(newState, 2); // skip next player
      break;
    }
    case 'reverse': {
      effect = { type: 'reverse' };
      newState.direction = newState.direction === 1 ? -1 : 1;
      if (newState.players.length === 2) {
        advanceTurn(newState, 2); // in 2-player, reverse acts as skip
      } else {
        advanceTurn(newState, 1);
      }
      break;
    }
    case 'draw2': {
      newState.drawStack += 2;
      effect = { type: 'draw2', drawCount: newState.drawStack };
      advanceTurn(newState, 1);
      break;
    }
    case 'wild_draw4': {
      newState.drawStack += 4;
      effect = { type: 'wild_draw4', drawCount: newState.drawStack };
      advanceTurn(newState, 1);
      break;
    }
    case 'wild': {
      effect = { type: 'wild' };
      advanceTurn(newState, 1);
      break;
    }
    default: {
      advanceTurn(newState, 1);
      break;
    }
  }

  // Check for win
  if (newPlayer.hand.length === 0) {
    newState.status = 'finished';
    newState.winner = newPlayer.userId;
    effect = { type: 'win' };
  }

  // Check UNO (1 card left)
  if (newPlayer.hand.length === 1) {
    effect = { type: 'uno' };
  }

  newState.turnStartedAt = Date.now();

  return { success: true, newState, effect };
}

// ─── Draw a Card ─────────────────────────────────────────────────────────────

export function drawCard(state: GameState, playerId: string): { success: boolean; error?: string; newState?: GameState; drawnCards?: Card[] } {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { success: false, error: 'Player not in game' };
  if (playerIndex !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };

  const newState: GameState = JSON.parse(JSON.stringify(state));
  const drawCount = newState.drawStack > 0 ? newState.drawStack : 1;

  const { drawn, deck, discardPile } = drawCards(newState.deck, newState.discardPile, drawCount);
  newState.deck = deck;
  newState.discardPile = discardPile;
  newState.players[playerIndex].hand.push(...drawn);
  newState.drawStack = 0;

  advanceTurn(newState, 1);
  newState.turnStartedAt = Date.now();

  return { success: true, newState, drawnCards: drawn };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function advanceTurn(state: GameState, steps: number): void {
  const count = state.players.length;
  state.currentPlayerIndex = ((state.currentPlayerIndex + state.direction * steps) % count + count) % count;
}

export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

export function getPublicState(state: GameState, forPlayerId: string) {
  return {
    ...state,
    deck: state.deck.length, // hide deck contents, expose count
    players: state.players.map(p => ({
      id: p.id,
      userId: p.userId,
      username: p.username,
      handCount: p.hand.length,
      isConnected: p.isConnected,
      saidUno: p.saidUno,
      // only show the requesting player's own hand
      hand: p.id === forPlayerId ? p.hand : undefined,
    })),
  };
}
