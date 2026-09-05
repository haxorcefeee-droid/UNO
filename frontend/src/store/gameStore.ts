import { create } from 'zustand';
import {
  PublicGameState, RoomState, RoomInfo,
  ChatMessage, CardEffect, LeaderboardEntry, GameOverPayload,
} from '../types';

interface GameStore {
  rooms: RoomInfo[];
  currentRoom: RoomState | null;
  gameState: PublicGameState | null;
  lastEffect: CardEffect | null;
  gameOver: GameOverPayload | null;
  messages: ChatMessage[];
  selectedCardId: string | null;
  showColorPicker: boolean;
  notification: { text: string; emoji: string; id: number } | null;
  lastPlayedCardId: string | null;

  setRooms: (rooms: RoomInfo[]) => void;
  setCurrentRoom: (room: RoomState | null) => void;
  setGameState: (state: PublicGameState) => void;
  setLastEffect: (effect: CardEffect | null) => void;
  setGameOver: (payload: GameOverPayload | null) => void;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  selectCard: (id: string | null) => void;
  setShowColorPicker: (show: boolean) => void;
  setNotification: (text: string | null, emoji?: string) => void;
  setLastPlayedCardId: (id: string | null) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  rooms: [],
  currentRoom: null,
  gameState: null,
  lastEffect: null,
  gameOver: null,
  messages: [],
  selectedCardId: null,
  showColorPicker: false,
  notification: null,
  lastPlayedCardId: null,

  setRooms: (rooms) => set({ rooms }),
  setCurrentRoom: (room) => set({ currentRoom: room }),
  setGameState: (gameState) => set({ gameState }),
  setLastEffect: (lastEffect) => set({ lastEffect }),
  setGameOver: (gameOver) => set({ gameOver }),
  addMessage: (msg) => set(s => ({ messages: [...s.messages.slice(-100), msg] })),
  clearMessages: () => set({ messages: [] }),
  selectCard: (selectedCardId) => set({ selectedCardId }),
  setShowColorPicker: (showColorPicker) => set({ showColorPicker }),
  setNotification: (text, emoji = '💬') =>
    set({ notification: text ? { text, emoji, id: Date.now() } : null }),
  setLastPlayedCardId: (lastPlayedCardId) => set({ lastPlayedCardId }),
  resetGame: () => set({
    gameState: null,
    lastEffect: null,
    gameOver: null,
    messages: [],
    selectedCardId: null,
    showColorPicker: false,
    notification: null,
    lastPlayedCardId: null,
    currentRoom: null,
  }),
}));
