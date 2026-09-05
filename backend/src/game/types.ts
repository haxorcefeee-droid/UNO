export type CardColor = 'red' | 'green' | 'blue' | 'yellow' | 'wild';
export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2'
  | 'wild' | 'wild_draw4';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export interface Player {
  id: string;       // socket ID
  userId: string;
  username: string;
  hand: Card[];
  isConnected: boolean;
  saidUno: boolean;
}

export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface GameState {
  roomId: string;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  status: GameStatus;
  currentColor: CardColor; // tracks chosen color after wild
  drawStack: number;       // accumulated draw2/draw4 stack
  winner: string | null;   // userId of winner
  turnStartedAt: number;   // timestamp for turn timer
}

export interface Room {
  id: string;
  name: string;
  hostId: string;  // socket ID
  maxPlayers: number;
  password?: string;
  wagerCoins: number;       // coins each player puts in per game
  gameState: GameState | null;
  createdAt: Date;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  cardsLeft: number;
  coinsChange: number;   // positive = won, negative = lost
  isWinner: boolean;
  isBot: boolean;
}

// Socket event payloads
export interface PlayCardPayload {
  cardId: string;
  chosenColor?: CardColor; // required when playing a wild
}

export interface CreateRoomPayload {
  name: string;
  maxPlayers: number;
  password?: string;
  wagerCoins?: number;
}

export interface JoinRoomPayload {
  roomId: string;
  password?: string;
}

export interface ChatMessagePayload {
  roomId: string;
  message: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
}
