import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { PublicGameState, RoomState, RoomInfo, ChatMessage, CardEffect, GameOverPayload } from '../types';

export function useSocketEvents() {
  const navigate = useNavigate();
  const {
    setRooms, setCurrentRoom, setGameState,
    addMessage, setNotification, setLastEffect,
    setGameOver, setLastPlayedCardId, resetGame,
  } = useGameStore();
  const { updateCoins } = useAuthStore();

  useEffect(() => {
    const socket = getSocket();

    socket.on('room:list', (rooms: RoomInfo[]) => setRooms(rooms));
    socket.on('room:state', (room: RoomState) => setCurrentRoom(room));
    socket.on('room:created', ({ roomId }: { roomId: string }) => navigate(`/room/${roomId}`));
    socket.on('room:joined',  ({ roomId }: { roomId: string }) => navigate(`/room/${roomId}`));
    socket.on('room:player_left', ({ username }: { username: string }) =>
      setNotification(`${username} left the room`, '👋'));

    socket.on('game:started', () => setNotification('Game started! Good luck!', '🎮'));
    socket.on('game:state',   (state: PublicGameState) => setGameState(state));

    socket.on('game:card_played', ({ username, effect }: { username: string; effect: CardEffect }) => {
      setLastEffect(effect);
      const msgs: Record<string, [string, string]> = {
        uno:       [`${username} says UNO!`,                    '🎉'],
        draw2:     [`${username} played +2!`,                   '😱'],
        wild_draw4:[`${username} played Wild +4!`,              '💀'],
        skip:      [`${username} skipped the next player!`,     '⏭️'],
        reverse:   [`${username} reversed the direction!`,      '🔄'],
        win:       [`${username} is out of cards!`,             '🏆'],
      };
      const entry = msgs[effect.type];
      if (entry) setNotification(entry[0], entry[1]);
    });

    socket.on('game:card_drawn', ({ username, count }: { username: string; count: number }) =>
      setNotification(`${username} drew ${count} card${count > 1 ? 's' : ''}`, '🃏'));

    socket.on('game:uno_called', ({ username }: { username: string }) =>
      setNotification(`🎉 ${username} says UNO!`, '🎉'));

    socket.on('game:uno_challenged', ({ targetName }: { targetName: string }) =>
      setNotification(`${targetName} forgot UNO! +2 penalty cards`, '😬'));

    socket.on('game:over', (payload: GameOverPayload) => {
      setGameOver(payload);
      setNotification(`${payload.winnerName} wins!`, '🏆');
    });

    socket.on('user:coins_updated', ({ coins }: { coins: number }) => updateCoins(coins));

    socket.on('chat:message', (msg: ChatMessage) => addMessage(msg));

    socket.on('error', ({ message }: { message: string }) =>
      setNotification(message, '❌'));

    socket.on('disconnect', () =>
      setNotification('Disconnected from server. Reconnecting...', '🔌'));

    return () => {
      socket.off('room:list');
      socket.off('room:state');
      socket.off('room:created');
      socket.off('room:joined');
      socket.off('room:player_left');
      socket.off('game:started');
      socket.off('game:state');
      socket.off('game:card_played');
      socket.off('game:card_drawn');
      socket.off('game:uno_called');
      socket.off('game:uno_challenged');
      socket.off('game:over');
      socket.off('user:coins_updated');
      socket.off('chat:message');
      socket.off('error');
      socket.off('disconnect');
    };
  }, [navigate, setRooms, setCurrentRoom, setGameState, addMessage,
      setNotification, setLastEffect, setGameOver, setLastPlayedCardId,
      resetGame, updateCoins]);
}
