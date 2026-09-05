import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { getSocket } from '../../services/socket';
import RoomList from './RoomList';
import CreateRoomModal from './CreateRoomModal';
import JoinRoomModal from './JoinRoomModal';
import NotificationToast from '../game/NotificationToast';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { rooms, notification, setNotification } = useGameStore();
  const [showCreate, setShowCreate] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('room:list');
    const interval = setInterval(() => socket.emit('room:list'), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-uno-dark text-white flex flex-col">
      {/* ── Navbar ───────────────────────────────────────────────── */}
      <nav className="safe-top flex-shrink-0 bg-uno-card border-b border-uno-border
                      px-4 py-3 flex items-center justify-between gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="uno-logo">
            <span className="text-uno-red">U</span>
            <span className="text-uno-blue">N</span>
            <span className="text-uno-yellow">O</span>
          </span>
          <span className="text-gray-600 text-xs hidden sm:block">Online</span>
        </div>

        {/* User info */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="coin-badge text-sm">
            🪙 {user?.coins ?? 0}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-uno-surface border border-uno-border
                            flex items-center justify-center font-black text-sm text-uno-yellow">
              {user?.username[0]?.toUpperCase()}
            </div>
            <span className="text-gray-300 text-sm font-medium hidden sm:block">{user?.username}</span>
          </div>
          <button
            onClick={logout}
            className="text-gray-500 hover:text-red-400 text-xs transition-colors px-2 py-1
                       bg-uno-surface rounded-lg border border-uno-border"
          >
            Sign out
          </button>
        </div>
      </nav>

      <NotificationToast />

      {/* ── Content ───────────────────────────────────────────────── */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-3 sm:px-4 py-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Game Lobby 🎮</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              {rooms.length} open room{rooms.length !== 1 ? 's' : ''} · Tap to join
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-base">＋</span>
            <span className="hidden xs:inline">Create Room</span>
            <span className="xs:hidden">New</span>
          </button>
        </div>

        {/* Coins info banner */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-3 mb-5
                        flex items-center gap-3 animate-fade-in">
          <span className="text-2xl">🪙</span>
          <div>
            <p className="text-yellow-300 text-xs font-semibold">Coin Wager Rooms</p>
            <p className="text-gray-400 text-xs">
              Rooms with 🪙 require a coin buy-in. Winner takes the pot!
            </p>
          </div>
        </div>

        <RoomList rooms={rooms} onJoin={setJoiningRoom} />
      </main>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
      {joiningRoom && (
        <JoinRoomModal roomId={joiningRoom} onClose={() => setJoiningRoom(null)} />
      )}
    </div>
  );
}
