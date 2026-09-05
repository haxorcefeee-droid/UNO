import { v4 as uuidv4 } from 'uuid';
import { Card, CardColor, CardValue } from './types';

const COLORS: CardColor[] = ['red', 'green', 'blue', 'yellow'];
const NUMBER_VALUES: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTION_VALUES: CardValue[] = ['skip', 'reverse', 'draw2'];
const WILD_VALUES: CardValue[] = ['wild', 'wild_draw4'];

function makeCard(color: CardColor, value: CardValue): Card {
  return { id: uuidv4(), color, value };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const color of COLORS) {
    // One 0 per color
    deck.push(makeCard(color, '0'));

    // Two of each 1–9 and action card per color
    for (const value of [...NUMBER_VALUES.slice(1), ...ACTION_VALUES]) {
      deck.push(makeCard(color, value));
      deck.push(makeCard(color, value));
    }
  }

  // 4 wild + 4 wild draw4
  for (const value of WILD_VALUES) {
    for (let i = 0; i < 4; i++) {
      deck.push(makeCard('wild', value));
    }
  }

  return shuffle(deck);
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawCards(deck: Card[], discardPile: Card[], count: number): { drawn: Card[]; deck: Card[]; discardPile: Card[] } {
  let mutableDeck = [...deck];
  let mutableDiscard = [...discardPile];

  // If deck runs out, reshuffle discard pile (keep top card)
  if (mutableDeck.length < count) {
    const topCard = mutableDiscard[mutableDiscard.length - 1];
    const reshuffled = shuffle(mutableDiscard.slice(0, -1));
    mutableDeck = [...mutableDeck, ...reshuffled];
    mutableDiscard = [topCard];
  }

  const drawn = mutableDeck.splice(0, count);
  return { drawn, deck: mutableDeck, discardPile: mutableDiscard };
}
