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

export interface PublicPlayer {
  id: string;
  userId: string;
  username: string;
  handCount: number;
  isConnected: boolean;
  saidUno: boolean;
  hand?: Card[];
}

export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface PublicGameState {
  roomId: string;
  players: PublicPlayer[];
  deck: number;
  discardPile: Card[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  status: GameStatus;
  currentColor: CardColor;
  drawStack: number;
  winner: string | null;
  turnStartedAt: number;
}

export interface RoomInfo {
  id: string;
  name: string;
  maxPlayers: number;
  playerCount: number;
  hasPassword: boolean;
  wagerCoins: number;
  gameStatus: GameStatus;
}

export interface RoomState {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  wagerCoins: number;
  players: { id: string; userId: string; username: string; isBot?: boolean }[];
  gameStatus: GameStatus;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  cardsLeft: number;
  coinsChange: number;
  isWinner: boolean;
  isBot: boolean;
}

export interface GameOverPayload {
  winner: string;
  winnerName: string;
  leaderboard: LeaderboardEntry[];
  wagerCoins: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  coins: number;
  friends: string[];
  createdAt: string;
}

export interface CardEffect {
  type: 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild_draw4' | 'normal' | 'uno' | 'win';
  affectedPlayerId?: string;
  drawCount?: number;
}
