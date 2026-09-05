import React from 'react';
import { RoomInfo } from '../../types';

interface Props {
  rooms: RoomInfo[];
  onJoin: (roomId: string) => void;
}

const STATUS_STYLE: Record<string, string> = {
  waiting:  'text-green-400',
  playing:  'text-yellow-400',
  finished: 'text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  waiting:  '● Open',
  playing:  '● In Progress',
  finished: '● Finished',
};
const STATUS_EMOJI: Record<string, string> = {
  waiting:  '🟢',
  playing:  '🟡',
  finished: '⚫',
};

export default function RoomList({ rooms, onJoin }: Props) {
  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-600 animate-fade-in">
        <span className="text-5xl mb-4">🃏</span>
        <p className="font-semibold text-base text-gray-400">No rooms yet</p>
        <p className="text-sm mt-1">Create one and invite your friends!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rooms.map((room, i) => {
        const full = room.playerCount >= room.maxPlayers;
        const inProgress = room.gameStatus === 'playing';
        const disabled = full || inProgress;

        return (
          <div
            key={room.id}
            className="panel p-3 sm:p-4 flex items-center gap-3 hover:border-gray-600
                       transition-all duration-200 animate-slide-up"
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            {/* Room code badge */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-uno-surface rounded-xl flex-shrink-0
                            flex items-center justify-center font-black text-xs sm:text-sm
                            text-uno-yellow border border-uno-border">
              {room.id}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-white font-semibold text-sm truncate">{room.name}</span>
                {room.hasPassword && (
                  <span className="text-[10px] text-gray-500" title="Password protected">🔒</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-500">
                  👥 {room.playerCount}/{room.maxPlayers}
                </span>
                <span className={`text-xs font-medium ${STATUS_STYLE[room.gameStatus]}`}>
                  {STATUS_LABEL[room.gameStatus]}
                </span>
                {room.wagerCoins > 0 && (
                  <span className="coin-badge">🪙 {room.wagerCoins}</span>
                )}
              </div>
            </div>

            {/* Join button */}
            <button
              onClick={() => onJoin(room.id)}
              disabled={disabled}
              className={`flex-shrink-0 text-sm font-bold px-3 py-2 rounded-xl
                         transition-all active:scale-95
                         ${disabled
                           ? 'bg-uno-surface text-gray-600 cursor-not-allowed'
                           : 'bg-uno-blue text-white hover:bg-blue-500'}`}
            >
              {inProgress ? 'Playing' : full ? 'Full' : 'Join →'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
