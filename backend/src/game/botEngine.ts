import { v4 as uuidv4 } from 'uuid';
import { GameState, Card, CardColor, Player } from './types';
import { isValidPlay } from './gameEngine';

// ─── Bot Names ────────────────────────────────────────────────────────────────
const BOT_NAMES = [
  'RoboUno', 'CardBot', 'AutoPlayer', 'BotMaster',
  'UnoBot', 'RoboCard', 'AIPlayer', 'BotKing',
];

let botNameIndex = 0;

export function createBotPlayer(): Player {
  const name = BOT_NAMES[botNameIndex % BOT_NAMES.length];
  botNameIndex++;
  const botId = `bot_${uuidv4().slice(0, 8)}`;
  return {
    id: botId,
    userId: botId,        // userId same as id for bots
    username: `🤖 ${name}`,
    hand: [],
    isConnected: true,
    saidUno: false,
  };
}

export function isBot(playerId: string): boolean {
  return playerId.startsWith('bot_');
}

// ─── Bot Decision Logic ───────────────────────────────────────────────────────

interface BotDecision {
  action: 'play' | 'draw';
  cardId?: string;
  chosenColor?: CardColor;
}

/**
 * Decides what a bot should do on its turn.
 * Strategy (simple but smart):
 *  1. If draw stack is active, only stack same draw card — otherwise draw.
 *  2. Prefer action cards (skip, reverse, draw2) to slow opponents.
 *  3. Prefer matching color over matching value.
 *  4. Play wilds last — choose the color we have most of.
 *  5. If nothing playable, draw.
 */
export function decideBotTurn(state: GameState, botId: string): BotDecision {
  const player = state.players.find(p => p.id === botId);
  if (!player) return { action: 'draw' };

  const topCard = state.discardPile[state.discardPile.length - 1];
  const currentColor = state.currentColor;

  // Filter to only valid plays
  const playableCards = player.hand.filter(card =>
    isValidPlay(card, topCard, currentColor, state.drawStack)
  );

  if (playableCards.length === 0) return { action: 'draw' };

  // Score each card — higher = better to play now
  const scored = playableCards.map(card => ({
    card,
    score: scoreCard(card, player.hand, currentColor),
  }));

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].card;

  // Choose color for wilds — pick color we hold most of
  let chosenColor: CardColor | undefined;
  if (best.color === 'wild') {
    chosenColor = pickBestColor(player.hand);
  }

  return { action: 'play', cardId: best.id, chosenColor };
}

function scoreCard(card: Card, hand: Card[], currentColor: CardColor): number {
  let score = 0;

  // Wilds are powerful but save them — low base score
  if (card.color === 'wild') {
    return card.value === 'wild_draw4' ? 5 : 3;
  }

  // Matching color is good
  if (card.color === currentColor) score += 4;

  // Action cards are valuable
  if (card.value === 'draw2')   score += 6;
  if (card.value === 'skip')    score += 5;
  if (card.value === 'reverse') score += 4;

  // Play high-value number cards to reduce hand points
  const numVal = parseInt(card.value);
  if (!isNaN(numVal)) score += numVal * 0.1;

  return score;
}

function pickBestColor(hand: Card[]): CardColor {
  const counts: Record<CardColor, number> = { red: 0, blue: 0, green: 0, yellow: 0, wild: 0 };
  for (const card of hand) {
    if (card.color !== 'wild') counts[card.color]++;
  }
  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
  return colors.reduce((best, c) => counts[c] > counts[best] ? c : best, 'red');
}
