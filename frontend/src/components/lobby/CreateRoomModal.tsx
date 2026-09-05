import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { getSocket } from '../../services/socket';

interface Props { onClose: () => void; }

export default function CreateRoomModal({ onClose }: Props) {
  const { user } = useAuthStore();
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [password, setPassword] = useState('');
  const [wagerCoins, setWagerCoins] = useState(0);

  const maxWager = user?.coins ?? 0;
  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    getSocket().emit('room:create', {
      name: name.trim(),
      maxPlayers,
      password: password || undefined,
      wagerCoins,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Bottom sheet on mobile, centred modal on desktop */}
      <div className="panel w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6
                      animate-slide-up sm:animate-bounce-in safe-bottom">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white text-lg font-black">🎮 Create Room</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl p-1">✕</button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
              Room Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={30}
              className="input"
              placeholder="My UNO Room 🃏"
              autoFocus
            />
          </div>

          {/* Max players slider */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                Max Players
              </label>
              <span className="text-uno-yellow font-black text-sm">
                👥 {maxPlayers}
              </span>
            </div>
            <input
              type="range" min={2} max={10} value={maxPlayers}
              onChange={e => setMaxPlayers(Number(e.target.value))}
              className="w-full h-2 rounded-full accent-yellow-400 cursor-pointer"
            />
            <div className="flex justify-between text-gray-600 text-xs mt-1">
              <span>2</span><span>10</span>
            </div>
          </div>

          {/* Coin wager */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                Coin Wager
              </label>
              <span className={`font-black text-sm ${wagerCoins > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                {wagerCoins > 0 ? `🪙 ${wagerCoins}` : 'Free game'}
              </span>
            </div>
            <input
              type="range" min={0} max={Math.min(maxWager, 5000)} step={50} value={wagerCoins}
              onChange={e => setWagerCoins(Number(e.target.value))}
              className="w-full h-2 rounded-full accent-yellow-400 cursor-pointer"
            />
            <div className="flex justify-between text-gray-600 text-xs mt-1">
              <span>Free</span>
              <span>You have 🪙 {user?.coins ?? 0}</span>
            </div>
            {wagerCoins > 0 && (
              <p className="text-yellow-600 text-xs mt-1.5 bg-yellow-500/10 rounded-lg px-2 py-1">
                ⚠️ Each player pays {wagerCoins} coins. Winner takes the pot!
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
              Password <span className="normal-case text-gray-600">(optional)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="Leave empty for public room"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleCreate} disabled={!canCreate} className="btn-primary flex-1">
            Create Room 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
