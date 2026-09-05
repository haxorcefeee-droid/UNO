import React, { useState } from 'react';
import { getSocket } from '../../services/socket';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';

interface Props { roomId: string; onClose: () => void; }

export default function JoinRoomModal({ roomId, onClose }: Props) {
  const { rooms } = useGameStore();
  const { user } = useAuthStore();
  const room = rooms.find(r => r.id === roomId);
  const [password, setPassword] = useState('');

  const canAfford = !room?.wagerCoins || (user?.coins ?? 0) >= room.wagerCoins;

  const handleJoin = () => {
    getSocket().emit('room:join', { roomId, password: password || undefined });
    onClose();
  };

  return (
    <div className="fixed inset-0 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="panel w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 sm:p-6
                      animate-slide-up sm:animate-bounce-in safe-bottom">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-black">Join Room</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl p-1">✕</button>
        </div>

        {/* Room info */}
        <div className="bg-uno-surface rounded-xl p-3 mb-4 border border-uno-border">
          <p className="text-white font-semibold text-sm">{room?.name ?? roomId}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-gray-400 text-xs">👥 {room?.playerCount}/{room?.maxPlayers}</span>
            {room?.wagerCoins ? (
              <span className="coin-badge">🪙 {room.wagerCoins} wager</span>
            ) : (
              <span className="text-green-400 text-xs font-semibold">🆓 Free</span>
            )}
          </div>
        </div>

        {/* Coin warning */}
        {room?.wagerCoins ? (
          <div className={`rounded-xl p-3 mb-4 border text-xs
            ${canAfford
              ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
            {canAfford
              ? `🪙 ${room.wagerCoins} coins will be deducted when the game starts. You have ${user?.coins}.`
              : `❌ You need ${room.wagerCoins} coins but only have ${user?.coins ?? 0}.`}
          </div>
        ) : null}

        {/* Password */}
        {room?.hasPassword && (
          <div className="mb-4">
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
              🔒 Room Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="Enter password"
              autoFocus
            />
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleJoin}
            disabled={!canAfford}
            className="btn-primary flex-1"
          >
            Join 🎮
          </button>
        </div>
      </div>
    </div>
  );
}
