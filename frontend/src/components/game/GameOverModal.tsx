import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { getSocket } from '../../services/socket';
import { LeaderboardEntry } from '../../types';

const RANK_EMOJI = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function Confetti() {
  const pieces = Array.from({ length: 20 });
  const colors = ['bg-uno-red', 'bg-uno-blue', 'bg-uno-green', 'bg-uno-yellow', 'bg-purple-500'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {pieces.map((_, i) => (
        <div
          key={i}
          className={`absolute w-2 h-2 rounded-sm ${colors[i % colors.length]} animate-confetti-fall opacity-0`}
          style={{
            left: `${Math.random() * 100}%`,
            top: `-${Math.random() * 20}px`,
            animationDelay: `${Math.random() * 1.5}s`,
            animationDuration: `${1.5 + Math.random()}s`,
            animationFillMode: 'both',
          }}
        />
      ))}
    </div>
  );
}

export default function GameOverModal() {
  const navigate = useNavigate();
  const { gameOver, gameState, resetGame } = useGameStore();
  const { user } = useAuthStore();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (gameOver) {
      const t = setTimeout(() => setShow(true), 200);
      return () => clearTimeout(t);
    }
    setShow(false);
  }, [gameOver]);

  if (!gameOver || !show) return null;

  const myEntry = gameOver.leaderboard.find(e => e.userId === user?.id);
  const isWinner = myEntry?.isWinner ?? false;

  const handleBack = () => {
    getSocket().emit('room:leave');
    resetGame();
    navigate('/lobby');
  };

  return (
    <div className="fixed inset-0 glass z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="panel w-full max-w-md relative overflow-hidden animate-bounce-in">
        {isWinner && <Confetti />}

        {/* Header */}
        <div className={`px-6 pt-8 pb-5 text-center ${isWinner ? 'bg-gradient-to-b from-yellow-500/10 to-transparent' : ''}`}>
          <div className="text-6xl mb-3 animate-winner-burst inline-block">
            {isWinner ? '🏆' : '😔'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-1">
            {isWinner ? 'You Win!' : 'Game Over'}
          </h1>
          <p className="text-gray-400 text-sm">
            {isWinner
              ? '🎉 Congratulations, you played all your cards!'
              : `🏅 ${gameOver.winnerName} took the win this round`}
          </p>

          {/* Coin result for this player */}
          {myEntry && gameOver.wagerCoins > 0 && (
            <div className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full font-black text-lg animate-coin-pop
              ${myEntry.coinsChange >= 0
                ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-300'
                : 'bg-red-500/20 border border-red-500/40 text-red-300'}`}>
              <span>🪙</span>
              <span>{myEntry.coinsChange >= 0 ? '+' : ''}{myEntry.coinsChange} coins</span>
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="px-4 pb-4">
          <p className="text-gray-500 text-xs uppercase tracking-widest text-center mb-3">
            Final Standings
          </p>
          <div className="space-y-2">
            {gameOver.leaderboard.map((entry, i) => (
              <LeaderboardRow
                key={entry.userId}
                entry={entry}
                rank={i}
                isMe={entry.userId === user?.id}
                wagerCoins={gameOver.wagerCoins}
              />
            ))}
          </div>
        </div>

        {/* Pot summary */}
        {gameOver.wagerCoins > 0 && (
          <div className="mx-4 mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
            <p className="text-yellow-400 text-xs">
              🪙 Pot: <span className="font-black">
                {gameOver.leaderboard.filter(e => !e.isBot).length * gameOver.wagerCoins}
              </span> coins ·
              Wager: <span className="font-black">{gameOver.wagerCoins}</span> each
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="px-4 pb-6 flex gap-3">
          <button onClick={handleBack} className="btn-primary flex-1 text-center">
            🏠 Back to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({
  entry, rank, isMe, wagerCoins,
}: { entry: LeaderboardEntry; rank: number; isMe: boolean; wagerCoins: number }) {
  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all',
        entry.isWinner
          ? 'bg-yellow-500/15 border border-yellow-500/30'
          : isMe
          ? 'bg-uno-surface border border-uno-border'
          : 'bg-uno-surface/50',
      ].join(' ')}
      style={{ animationDelay: `${rank * 0.08}s` }}
    >
      {/* Rank */}
      <span className="text-lg w-7 text-center flex-shrink-0">
        {RANK_EMOJI[rank] ?? `${rank + 1}.`}
      </span>

      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0
        ${entry.isBot ? 'bg-indigo-700 text-indigo-200' : 'bg-uno-border text-white'}`}>
        {entry.isBot ? '🤖' : entry.username[0]?.toUpperCase()}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${isMe ? 'text-uno-yellow' : 'text-white'}`}>
          {isMe ? `${entry.username} (you)` : entry.username}
        </p>
        <p className="text-gray-500 text-xs">
          {entry.cardsLeft === 0 ? '🎉 No cards left' : `${entry.cardsLeft} card${entry.cardsLeft !== 1 ? 's' : ''} left`}
        </p>
      </div>

      {/* Coin delta */}
      {!entry.isBot && wagerCoins > 0 && (
        <span className={`text-sm font-black flex-shrink-0
          ${entry.coinsChange > 0 ? 'text-yellow-400' : entry.coinsChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
          {entry.coinsChange > 0 ? '+' : ''}{entry.coinsChange}🪙
        </span>
      )}
    </div>
  );
}
