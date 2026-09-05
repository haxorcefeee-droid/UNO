import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { getSocket } from '../../services/socket';
import GameBoard from '../game/GameBoard';
import NotificationToast from '../game/NotificationToast';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { currentRoom, gameState } = useGameStore();
  const { user } = useAuthStore();

  useEffect(() => { if (!roomId) navigate('/lobby'); }, [roomId, navigate]);

  const socket = getSocket();
  const isHost      = currentRoom?.hostId === socket.id;
  const isPlaying   = gameState?.status === 'playing';
  const playerCount = currentRoom?.players.length ?? 0;
  const maxPlayers  = currentRoom?.maxPlayers ?? 0;
  const botCount    = currentRoom?.players.filter(p => p.isBot).length ?? 0;
  const canAddBot   = isHost && playerCount < maxPlayers && botCount < maxPlayers - 1;
  const canStart    = playerCount >= 2;
  const wager       = currentRoom?.wagerCoins ?? 0;

  if (isPlaying && gameState) return <GameBoard roomId={roomId!} />;

  return (
    <div className="min-h-screen bg-uno-dark text-white flex flex-col">
      {/* Navbar */}
      <nav className="safe-top flex-shrink-0 bg-uno-card border-b border-uno-border px-4 py-3
                      flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="uno-logo text-xl">
            <span className="text-uno-red">U</span>
            <span className="text-uno-blue">N</span>
            <span className="text-uno-yellow">O</span>
          </span>
        </div>
        <button
          onClick={() => { socket.emit('room:leave'); navigate('/lobby'); }}
          className="text-gray-500 hover:text-red-400 text-xs transition-colors
                     flex items-center gap-1 bg-uno-surface border border-uno-border
                     px-3 py-1.5 rounded-lg"
        >
          ← Leave
        </button>
      </nav>

      <NotificationToast />

      <main className="flex-1 max-w-xl w-full mx-auto px-3 sm:px-4 py-6">
        <div className="panel p-4 sm:p-6">
          {/* Room header */}
          <div className="mb-5">
            <h1 className="text-lg sm:text-xl font-black text-white">
              {currentRoom?.name ?? 'Loading...'}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-gray-500 text-xs">
                Code: <span className="text-uno-yellow font-mono font-black">{roomId}</span>
              </span>
              {wager > 0 ? (
                <span className="coin-badge">🪙 {wager} wager · 🏆 {wager * playerCount} pot</span>
              ) : (
                <span className="text-green-400 text-xs">🆓 Free game</span>
              )}
            </div>
          </div>

          {/* Player list header */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
              Players ({playerCount}/{maxPlayers})
            </p>
            {isHost && (
              <button
                onClick={() => socket.emit('room:add_bot')}
                disabled={!canAddBot}
                title={canAddBot ? 'Add a robot player' : 'Room full or max bots reached'}
                className="flex items-center gap-1.5 text-xs bg-indigo-900/50 hover:bg-indigo-800/50
                           border border-indigo-700/50 text-indigo-300 font-semibold
                           px-3 py-1.5 rounded-lg transition-all active:scale-95
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🤖 Add Bot
              </button>
            )}
          </div>

          {/* Player list */}
          <div className="space-y-2 mb-5">
            {currentRoom?.players.map(p => {
              const isSelf  = p.userId === user?.id;
              const isHostP = p.id === currentRoom.hostId;
              const isBot   = !!p.isBot;

              return (
                <div key={p.id}
                  className="bg-uno-surface border border-uno-border rounded-xl px-3 py-2.5
                             flex items-center gap-3 animate-slide-up">
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
                                   font-black text-sm
                                   ${isBot
                                    ? 'bg-indigo-800 text-indigo-200'
                                    : 'bg-uno-card text-uno-yellow'}`}>
                    {isBot ? '🤖' : p.username[0]?.toUpperCase()}
                  </div>

                  {/* Name */}
                  <span className={`flex-1 font-medium text-sm truncate
                    ${isBot ? 'text-indigo-300' : isSelf ? 'text-uno-yellow' : 'text-white'}`}>
                    {p.username}
                    {isSelf && <span className="text-gray-500 text-xs ml-1">(you)</span>}
                  </span>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isHostP && !isBot && (
                      <span className="text-[10px] bg-uno-yellow text-black px-1.5 py-0.5
                                       rounded font-black">HOST</span>
                    )}
                    {isBot && (
                      <span className="text-[10px] bg-indigo-700/60 text-indigo-300 px-1.5 py-0.5
                                       rounded border border-indigo-700">BOT</span>
                    )}
                    {isHost && isBot && (
                      <button
                        onClick={() => socket.emit('room:remove_bot', p.id)}
                        className="text-gray-600 hover:text-red-400 text-sm transition-colors p-0.5"
                        aria-label={`Remove ${p.username}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, maxPlayers - playerCount) }).map((_, i) => (
              <div key={i}
                className="border border-dashed border-gray-800 rounded-xl px-3 py-2.5
                           flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-900 border border-dashed border-gray-700 flex-shrink-0" />
                <span className="text-gray-700 text-xs">
                  {isHost ? '💡 Add a bot or wait for a player' : 'Waiting for player...'}
                </span>
              </div>
            ))}
          </div>

          {/* Bot summary */}
          {botCount > 0 && (
            <p className="text-indigo-400 text-xs text-center mb-4">
              🤖 {botCount} robot{botCount > 1 ? 's' : ''} will play automatically
            </p>
          )}

          {/* Wager note */}
          {wager > 0 && canStart && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2.5
                            text-yellow-400 text-xs text-center mb-4">
              🪙 {wager} coins will be deducted from each player when the game starts
            </div>
          )}

          {/* Actions */}
          {isHost ? (
            <button
              onClick={() => socket.emit('game:start')}
              disabled={!canStart}
              className="btn-primary w-full text-base py-4"
            >
              {!canStart ? '👥 Need 2+ players' : '▶ Start Game!'}
            </button>
          ) : (
            <div className="bg-uno-surface border border-uno-border rounded-xl py-4
                            text-center text-gray-500 text-sm">
              ⏳ Waiting for host to start...
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
