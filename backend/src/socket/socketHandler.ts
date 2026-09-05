import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken } from '../auth/jwt';
import { RoomManager } from '../game/roomManager';
import { UserModel } from '../models/User';
import { GameHistoryModel } from '../models/GameHistory';
import { initGame, playCard, drawCard, getPublicState } from '../game/gameEngine';
import { createBotPlayer, decideBotTurn } from '../game/botEngine';
import {
  Player,
  LeaderboardEntry,
  CreateRoomPayload,
  JoinRoomPayload,
  PlayCardPayload,
  ChatMessagePayload,
  ChatMessage,
} from '../game/types';

const socketRoomMap: Map<string, string> = new Map();
// roomId -> { userId -> coinsAtStart }
const roomWagerMap: Map<string, Map<string, number>> = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function broadcastRoomState(io: Server, roomId: string): void {
  const room = RoomManager.get(roomId);
  if (!room) return;

  if (room.gameState) {
    room.gameState.players.forEach(player => {
      if (!RoomManager.isBot(roomId, player.id)) {
        const publicState = getPublicState(room.gameState!, player.id);
        io.to(player.id).emit('game:state', publicState);
      }
    });
  }

  const pendingPlayers = RoomManager.getPendingPlayers(roomId);
  io.to(roomId).emit('room:state', {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    wagerCoins: room.wagerCoins,
    players: pendingPlayers.map(p => ({
      id: p.id,
      userId: p.userId,
      username: p.username,
      isBot: RoomManager.isBot(roomId, p.id),
    })),
    gameStatus: room.gameState?.status ?? 'waiting',
  });
}

function buildLeaderboard(io: Server, roomId: string, winnerUserId: string): LeaderboardEntry[] {
  const room = RoomManager.get(roomId);
  if (!room?.gameState) return [];

  const wager = room.wagerCoins;
  const players = room.gameState.players;
  const humanPlayers = players.filter(p => !RoomManager.isBot(roomId, p.id));
  const totalPot = humanPlayers.length * wager;

  return players.map(p => {
    const isWinner = p.userId === winnerUserId;
    const isBot = RoomManager.isBot(roomId, p.id);

    let coinsChange = 0;
    if (!isBot && wager > 0) {
      if (isWinner) {
        coinsChange = totalPot - wager; // net gain = pot minus own entry
      } else {
        coinsChange = -wager;
      }
      UserModel.adjustCoins(p.userId, coinsChange);
    }

    return {
      userId: p.userId,
      username: p.username,
      cardsLeft: p.hand.length,
      coinsChange,
      isWinner,
      isBot,
    };
  }).sort((a, b) => a.cardsLeft - b.cardsLeft);
}

function scheduleBotTurns(io: Server, roomId: string, delayMs = 1200): void {
  const room = RoomManager.get(roomId);
  if (!room?.gameState || room.gameState.status !== 'playing') return;

  const current = room.gameState.players[room.gameState.currentPlayerIndex];
  if (!current || !RoomManager.isBot(roomId, current.id)) return;

  setTimeout(() => {
    const fresh = RoomManager.get(roomId);
    if (!fresh?.gameState || fresh.gameState.status !== 'playing') return;

    const cur = fresh.gameState.players[fresh.gameState.currentPlayerIndex];
    if (!cur || !RoomManager.isBot(roomId, cur.id)) return;

    const decision = decideBotTurn(fresh.gameState, cur.id);

    if (decision.action === 'play' && decision.cardId) {
      if (cur.hand.length === 2) {
        cur.saidUno = true;
        io.to(roomId).emit('game:uno_called', { playerId: cur.id, username: cur.username });
      }

      const result = playCard(fresh.gameState, cur.id, {
        cardId: decision.cardId,
        chosenColor: decision.chosenColor,
      });

      if (result.success && result.newState) {
        RoomManager.updateGameState(roomId, result.newState);
        broadcastRoomState(io, roomId);
        io.to(roomId).emit('game:card_played', {
          playerId: cur.id,
          username: cur.username,
          effect: result.effect,
        });

        if (result.newState.status === 'finished') {
          const leaderboard = buildLeaderboard(io, roomId, result.newState.winner!);
          io.to(roomId).emit('game:over', {
            winner: result.newState.winner,
            winnerName: cur.username,
            leaderboard,
            wagerCoins: RoomManager.get(roomId)?.wagerCoins ?? 0,
          });
          return;
        }
        scheduleBotTurns(io, roomId, delayMs);
      }
    } else {
      const result = drawCard(fresh.gameState, cur.id);
      if (result.success && result.newState) {
        RoomManager.updateGameState(roomId, result.newState);
        broadcastRoomState(io, roomId);
        io.to(roomId).emit('game:card_drawn', {
          playerId: cur.id,
          username: cur.username,
          count: result.drawnCards?.length ?? 1,
        });
        scheduleBotTurns(io, roomId, delayMs);
      }
    }
  }, delayMs);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function registerSocketHandlers(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyToken(token);
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as { userId: string; username: string };
    console.log(`✅ Connected: ${user.username} (${socket.id})`);

    socket.on('room:list', () => {
      socket.emit('room:list', RoomManager.list().map(r => ({
        id: r.id,
        name: r.name,
        maxPlayers: r.maxPlayers,
        playerCount: RoomManager.getPendingPlayers(r.id).length,
        hasPassword: !!r.password,
        wagerCoins: r.wagerCoins,
        gameStatus: r.gameState?.status ?? 'waiting',
      })));
    });

    socket.on('room:create', (payload: CreateRoomPayload) => {
      const wager = Math.min(Math.max(payload.wagerCoins ?? 0, 0), 5000);
      const room = RoomManager.create(payload.name, socket.id, payload.maxPlayers, payload.password, wager);

      const player: Player = {
        id: socket.id, userId: user.userId, username: user.username,
        hand: [], isConnected: true, saidUno: false,
      };
      RoomManager.addPlayer(room.id, player);
      socket.join(room.id);
      socketRoomMap.set(socket.id, room.id);
      socket.emit('room:created', { roomId: room.id });
      broadcastRoomState(io, room.id);
    });

    socket.on('room:join', (payload: JoinRoomPayload) => {
      const room = RoomManager.get(payload.roomId);
      if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
      if (room.password && room.password !== payload.password) {
        socket.emit('error', { message: 'Wrong password' }); return;
      }

      // Check player has enough coins for wager
      const userData = UserModel.findById(user.userId);
      if (userData && room.wagerCoins > 0 && userData.coins < room.wagerCoins) {
        socket.emit('error', { message: `Need ${room.wagerCoins} 🪙 to join this room` }); return;
      }

      const player: Player = {
        id: socket.id, userId: user.userId, username: user.username,
        hand: [], isConnected: true, saidUno: false,
      };
      const result = RoomManager.addPlayer(room.id, player);
      if (!result.success) { socket.emit('error', { message: result.error }); return; }

      socket.join(room.id);
      socketRoomMap.set(socket.id, room.id);
      socket.emit('room:joined', { roomId: room.id });
      broadcastRoomState(io, room.id);
    });

    socket.on('room:leave', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;
      RoomManager.removePlayer(roomId, socket.id);
      socket.leave(roomId);
      socketRoomMap.delete(socket.id);
      broadcastRoomState(io, roomId);
    });

    socket.on('room:add_bot', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) { socket.emit('error', { message: 'Not in a room' }); return; }
      const room = RoomManager.get(roomId);
      if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
      if (room.hostId !== socket.id) { socket.emit('error', { message: 'Only the host can add bots' }); return; }
      if (room.gameState?.status === 'playing') { socket.emit('error', { message: 'Cannot add bots mid-game' }); return; }
      if (RoomManager.getBotCount(roomId) >= room.maxPlayers - 1) {
        socket.emit('error', { message: 'Too many bots' }); return;
      }
      const bot = createBotPlayer();
      const result = RoomManager.addBot(roomId, bot);
      if (!result.success) { socket.emit('error', { message: result.error }); return; }
      broadcastRoomState(io, roomId);
    });

    socket.on('room:remove_bot', (botId: string) => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;
      const room = RoomManager.get(roomId);
      if (!room || room.hostId !== socket.id) return;
      if (!RoomManager.isBot(roomId, botId)) return;
      RoomManager.removePlayer(roomId, botId);
      broadcastRoomState(io, roomId);
    });

    socket.on('game:start', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) { socket.emit('error', { message: 'Not in a room' }); return; }
      const room = RoomManager.get(roomId);
      if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
      if (room.hostId !== socket.id) { socket.emit('error', { message: 'Only the host can start' }); return; }

      const pendingPlayers = RoomManager.getPendingPlayers(roomId);
      if (pendingPlayers.length < 2) { socket.emit('error', { message: 'Need at least 2 players' }); return; }

      // Deduct wager from human players up front
      if (room.wagerCoins > 0) {
        const wagerMap = new Map<string, number>();
        for (const p of pendingPlayers) {
          if (!RoomManager.isBot(roomId, p.id)) {
            const userData = UserModel.findById(p.userId);
            if (userData) {
              wagerMap.set(p.userId, userData.coins);
              UserModel.adjustCoins(p.userId, -room.wagerCoins);
            }
          }
        }
        roomWagerMap.set(roomId, wagerMap);
      }

      const gameState = initGame(pendingPlayers.map(p => ({
        id: p.id, userId: p.userId, username: p.username, isConnected: p.isConnected,
      })));
      gameState.roomId = roomId;
      RoomManager.updateGameState(roomId, gameState);

      io.to(roomId).emit('game:started', { wagerCoins: room.wagerCoins });
      broadcastRoomState(io, roomId);
      scheduleBotTurns(io, roomId);
    });

    socket.on('game:play_card', (payload: PlayCardPayload) => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) { socket.emit('error', { message: 'Not in a room' }); return; }
      const room = RoomManager.get(roomId);
      if (!room?.gameState) { socket.emit('error', { message: 'Game not started' }); return; }

      const result = playCard(room.gameState, socket.id, payload);
      if (!result.success) { socket.emit('error', { message: result.error }); return; }

      RoomManager.updateGameState(roomId, result.newState!);
      broadcastRoomState(io, roomId);
      io.to(roomId).emit('game:card_played', {
        playerId: socket.id, username: user.username, effect: result.effect,
      });

      if (result.newState!.status === 'finished') {
        const leaderboard = buildLeaderboard(io, roomId, result.newState!.winner!);
        // Send updated coins to each winner/loser
        leaderboard.forEach(entry => {
          if (!entry.isBot) {
            const userData = UserModel.findById(entry.userId);
            if (userData) {
              io.to(socket.id).emit('user:coins_updated', { coins: userData.coins });
            }
          }
        });
        io.to(roomId).emit('game:over', {
          winner: result.newState!.winner,
          winnerName: user.username,
          leaderboard,
          wagerCoins: room.wagerCoins,
        });
        return;
      }
      scheduleBotTurns(io, roomId);
    });

    socket.on('game:draw_card', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) { socket.emit('error', { message: 'Not in a room' }); return; }
      const room = RoomManager.get(roomId);
      if (!room?.gameState) { socket.emit('error', { message: 'Game not started' }); return; }

      const result = drawCard(room.gameState, socket.id);
      if (!result.success) { socket.emit('error', { message: result.error }); return; }

      RoomManager.updateGameState(roomId, result.newState!);
      broadcastRoomState(io, roomId);
      io.to(roomId).emit('game:card_drawn', {
        playerId: socket.id, username: user.username, count: result.drawnCards?.length,
      });
      scheduleBotTurns(io, roomId);
    });

    socket.on('game:say_uno', () => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;
      const room = RoomManager.get(roomId);
      if (!room?.gameState) return;
      const player = room.gameState.players.find(p => p.id === socket.id);
      if (player) {
        player.saidUno = true;
        RoomManager.updateGameState(roomId, room.gameState);
        io.to(roomId).emit('game:uno_called', { playerId: socket.id, username: user.username });
      }
    });

    socket.on('game:challenge_uno', (targetId: string) => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId) return;
      const room = RoomManager.get(roomId);
      if (!room?.gameState) return;
      const target = room.gameState.players.find(p => p.id === targetId);
      if (!target || target.hand.length !== 1 || target.saidUno) return;
      const { drawCards } = require('../game/deck');
      const { drawn, deck, discardPile } = drawCards(room.gameState.deck, room.gameState.discardPile, 2);
      target.hand.push(...drawn);
      room.gameState.deck = deck;
      room.gameState.discardPile = discardPile;
      RoomManager.updateGameState(roomId, room.gameState);
      broadcastRoomState(io, roomId);
      io.to(roomId).emit('game:uno_challenged', {
        challengerId: socket.id, targetId, targetName: target.username,
      });
    });

    socket.on('chat:message', (payload: ChatMessagePayload) => {
      const roomId = socketRoomMap.get(socket.id);
      if (!roomId || roomId !== payload.roomId) return;
      const message = payload.message.trim();
      if (!message || message.length > 300) return;
      const chatMsg: ChatMessage = {
        id: uuidv4(), userId: user.userId, username: user.username,
        message, timestamp: Date.now(),
      };
      io.to(roomId).emit('chat:message', chatMsg);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Disconnected: ${user.username} (${socket.id})`);
      const roomId = socketRoomMap.get(socket.id);
      if (roomId) {
        RoomManager.removePlayer(roomId, socket.id);
        socketRoomMap.delete(socket.id);
        broadcastRoomState(io, roomId);
        io.to(roomId).emit('room:player_left', { socketId: socket.id, username: user.username });
      }
    });
  });
}
