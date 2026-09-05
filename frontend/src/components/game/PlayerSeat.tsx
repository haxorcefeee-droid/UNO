import React from 'react';
import { PublicPlayer } from '../../types';
import { CardBack } from './UnoCard';

interface Props {
  player: PublicPlayer;
  isCurrentTurn: boolean;
  isSelf: boolean;
  isBot?: boolean;
  wagerCoins?: number;
  onChallenge?: () => void;
  position?: 'top' | 'left' | 'right' | 'bottom';
}

const MAX_VISIBLE_CARDS = 8;

export default function PlayerSeat({
  player, isCurrentTurn, isSelf, isBot, wagerCoins = 0, onChallenge,
}: Props) {
  const visibleCards = Math.min(player.handCount, MAX_VISIBLE_CARDS);
  const overflow = player.handCount - MAX_VISIBLE_CARDS;

  return (
    <div
      className={[
        'flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all duration-300 min-w-[72px]',
        isCurrentTurn
          ? 'bg-uno-yellow/10 ring-2 ring-uno-yellow animate-pulse-glow scale-105'
          : 'bg-uno-surface/30',
      ].join(' ')}
    >
      {/* Avatar */}
      <div className="relative">
        <div className={[
          'w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-sm transition-all',
          isCurrentTurn
            ? 'bg-uno-yellow text-black ring-2 ring-white/40'
            : isBot
            ? 'bg-indigo-700 text-indigo-200'
            : 'bg-uno-surface text-white',
        ].join(' ')}>
          {isBot ? '🤖' : player.username[0]?.toUpperCase()}
        </div>

        {/* Active turn pulse ring */}
        {isCurrentTurn && (
          <div className="absolute inset-0 rounded-full ring-2 ring-uno-yellow animate-pulse-ring pointer-events-none" />
        )}

        {/* UNO badge */}
        {player.handCount === 1 && (
          <div className="absolute -top-1 -right-1 bg-uno-red text-white text-[9px] font-black
                          px-1 py-0.5 rounded-full leading-none animate-bounce shadow-glow-red">
            UNO
          </div>
        )}

        {/* Disconnected */}
        {!player.isConnected && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full
                          border border-uno-dark text-[7px] flex items-center justify-center">
            ✕
          </div>
        )}
      </div>

      {/* Name */}
      <span className={[
        'text-[10px] sm:text-xs font-semibold max-w-[72px] truncate text-center leading-tight',
        isSelf ? 'text-uno-yellow' : isBot ? 'text-indigo-300' : 'text-gray-300',
      ].join(' ')}>
        {isSelf ? 'You' : player.username}
      </span>

      {/* Card stack */}
      <div className="flex items-end justify-center -space-x-2.5">
        {Array.from({ length: visibleCards }).map((_, i) => (
          <div
            key={i}
            className="transition-all duration-150"
            style={{ zIndex: i, transform: `rotate(${(i - visibleCards / 2) * 3}deg)` }}
          >
            <CardBack size="sm" />
          </div>
        ))}
        {overflow > 0 && (
          <span className="text-gray-400 text-[10px] font-bold ml-1 self-center">
            +{overflow}
          </span>
        )}
      </div>

      {/* Card count pill */}
      <span className={[
        'text-[10px] font-bold px-2 py-0.5 rounded-full',
        player.handCount <= 2
          ? 'bg-red-700/50 text-red-200'
          : 'bg-uno-surface text-gray-400',
      ].join(' ')}>
        {player.handCount} card{player.handCount !== 1 ? 's' : ''}
      </span>

      {/* Turn indicator */}
      {isCurrentTurn && (
        <span className="text-[10px] text-uno-yellow font-bold animate-pulse">
          ▶ Playing...
        </span>
      )}

      {/* Wager coins */}
      {wagerCoins > 0 && (
        <span className="coin-badge text-[9px]">🪙 {wagerCoins}</span>
      )}

      {/* Challenge UNO button */}
      {player.handCount === 1 && !player.saidUno && !isSelf && onChallenge && (
        <button
          onClick={onChallenge}
          className="btn-danger text-[10px] px-2 py-1 animate-bounce-in"
          aria-label={`Challenge ${player.username} for not saying UNO`}
        >
          😤 Catch!
        </button>
      )}
    </div>
  );
}
