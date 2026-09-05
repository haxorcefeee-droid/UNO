// In-memory game history store — swap for PostgreSQL later
import { v4 as uuidv4 } from 'uuid';

export interface GameHistoryEntry {
  id: string;
  roomId: string;
  roomName: string;
  playedAt: Date;
  players: {
    userId: string;
    username: string;
    isBot: boolean;
    cardsLeft: number;
    coinsChange: number;
    isWinner: boolean;
  }[];
  wagerCoins: number;
  winnerId: string;
  winnerName: string;
  durationSeconds: number;
}

// userId -> list of game history entries (newest first)
const history: Map<string, GameHistoryEntry[]> = new Map();

// roomId -> game start timestamp
const gameStartTimes: Map<string, number> = new Map();

export const GameHistoryModel = {
  recordStart(roomId: string): void {
    gameStartTimes.set(roomId, Date.now());
  },

  recordFinish(entry: Omit<GameHistoryEntry, 'id' | 'durationSeconds'>): GameHistoryEntry {
    const startedAt = gameStartTimes.get(entry.roomId) ?? Date.now();
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    gameStartTimes.delete(entry.roomId);

    const full: GameHistoryEntry = { ...entry, id: uuidv4(), durationSeconds };

    // Store for each human player
    for (const p of entry.players) {
      if (p.isBot) continue;
      const list = history.get(p.userId) ?? [];
      list.unshift(full); // newest first
      // Keep max 50 games per user
      if (list.length > 50) list.pop();
      history.set(p.userId, list);
    }

    return full;
  },

  getForUser(userId: string, limit = 20): GameHistoryEntry[] {
    return (history.get(userId) ?? []).slice(0, limit);
  },

  getStats(userId: string): {
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    totalCoinsWon: number;
    totalCoinsLost: number;
    netCoins: number;
    avgCardsLeft: number;
    bestStreak: number;
    currentStreak: number;
  } {
    const games = history.get(userId) ?? [];
    if (games.length === 0) {
      return {
        totalGames: 0, wins: 0, losses: 0, winRate: 0,
        totalCoinsWon: 0, totalCoinsLost: 0, netCoins: 0,
        avgCardsLeft: 0, bestStreak: 0, currentStreak: 0,
      };
    }

    let wins = 0, totalCoinsWon = 0, totalCoinsLost = 0;
    let totalCardsLeft = 0, bestStreak = 0, currentStreak = 0;

    // Games are newest-first; iterate oldest-first for streak calc
    const ordered = [...games].reverse();
    for (const g of ordered) {
      const me = g.players.find(p => p.userId === userId);
      if (!me) continue;
      if (me.isWinner) {
        wins++;
        totalCoinsWon += me.coinsChange;
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        totalCoinsLost += Math.abs(me.coinsChange);
        currentStreak = 0;
      }
      totalCardsLeft += me.cardsLeft;
    }

    const totalGames = games.length;
    // currentStreak: count consecutive wins from the most recent game
    let cs = 0;
    for (const g of games) {
      const me = g.players.find(p => p.userId === userId);
      if (me?.isWinner) cs++;
      else break;
    }

    return {
      totalGames,
      wins,
      losses: totalGames - wins,
      winRate: Math.round((wins / totalGames) * 100),
      totalCoinsWon,
      totalCoinsLost,
      netCoins: totalCoinsWon - totalCoinsLost,
      avgCardsLeft: Math.round((totalCardsLeft / totalGames) * 10) / 10,
      bestStreak,
      currentStreak: cs,
    };
  },
};
