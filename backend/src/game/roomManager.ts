import { v4 as uuidv4 } from 'uuid';
import { Room, Player } from './types';

// In-memory room store
const rooms: Map<string, Room> = new Map();

// roomId -> Set of bot player IDs
const roomBots: Map<string, Set<string>> = new Map();

export const RoomManager = {
  create(name: string, hostSocketId: string, maxPlayers: number, password?: string, wagerCoins = 0): Room {
    const id = uuidv4().slice(0, 6).toUpperCase();
    const room: Room = {
      id,
      name,
      hostId: hostSocketId,
      maxPlayers: Math.min(Math.max(maxPlayers, 2), 10),
      password,
      wagerCoins: Math.max(0, wagerCoins),
      gameState: null,
      createdAt: new Date(),
    };
    rooms.set(id, room);
    return room;
  },

  get(roomId: string): Room | undefined {
    return rooms.get(roomId);
  },

  delete(roomId: string): void {
    rooms.delete(roomId);
    roomBots.delete(roomId);
  },

  list(): Room[] {
    return Array.from(rooms.values()).filter(r => r.gameState?.status !== 'playing');
  },

  getAll(): Room[] {
    return Array.from(rooms.values());
  },

  // ── Players ──────────────────────────────────────────────────────────────

  addPlayer(roomId: string, player: Player): { success: boolean; error?: string } {
    const room = rooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.gameState?.status === 'playing') return { success: false, error: 'Game already in progress' };

    const pending: Player[] = (room as any)._pendingPlayers ?? [];
    if (pending.length >= room.maxPlayers) return { success: false, error: 'Room is full' };
    if (pending.find(p => p.id === player.id)) return { success: false, error: 'Already in room' };

    (room as any)._pendingPlayers = pending;
    pending.push(player);

    return { success: true };
  },

  getPendingPlayers(roomId: string): Player[] {
    const room = rooms.get(roomId) as any;
    return room?._pendingPlayers ?? [];
  },

  removePlayer(roomId: string, playerId: string): void {
    const room = rooms.get(roomId) as any;
    if (!room) return;

    if (room._pendingPlayers) {
      room._pendingPlayers = room._pendingPlayers.filter((p: Player) => p.id !== playerId);
    }

    // Remove from bot registry if applicable
    roomBots.get(roomId)?.delete(playerId);

    if (room.gameState) {
      const player = room.gameState.players.find((p: Player) => p.id === playerId);
      if (player) player.isConnected = false;
    }
  },

  updateGameState(roomId: string, gameState: Room['gameState']): void {
    const room = rooms.get(roomId);
    if (room) room.gameState = gameState;
  },

  // ── Bot helpers ──────────────────────────────────────────────────────────

  addBot(roomId: string, bot: Player): { success: boolean; error?: string } {
    const result = RoomManager.addPlayer(roomId, bot);
    if (result.success) {
      if (!roomBots.has(roomId)) roomBots.set(roomId, new Set());
      roomBots.get(roomId)!.add(bot.id);
    }
    return result;
  },

  getBotIds(roomId: string): string[] {
    return Array.from(roomBots.get(roomId) ?? []);
  },

  isBot(roomId: string, playerId: string): boolean {
    return roomBots.get(roomId)?.has(playerId) ?? false;
  },

  getBotCount(roomId: string): number {
    return roomBots.get(roomId)?.size ?? 0;
  },
};
