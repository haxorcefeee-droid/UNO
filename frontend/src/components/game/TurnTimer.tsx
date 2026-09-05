import React, { useEffect, useState } from 'react';

interface Props {
  turnStartedAt: number;
  limitSeconds?: number;
  isMyTurn: boolean;
}

export default function TurnTimer({ turnStartedAt, limitSeconds = 30, isMyTurn }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const iv = setInterval(() => {
      const s = (Date.now() - turnStartedAt) / 1000;
      setElapsed(Math.min(s, limitSeconds));
    }, 250);
    return () => clearInterval(iv);
  }, [turnStartedAt, limitSeconds]);

  const pct = Math.max(0, 100 - (elapsed / limitSeconds) * 100);
  const urgent = pct < 30;
  const barColor = urgent
    ? 'bg-red-500'
    : pct < 60
    ? 'bg-uno-yellow'
    : 'bg-uno-green';

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className={`text-[10px] font-bold ${urgent ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
          {isMyTurn ? '⏱ Your turn' : '⏱ Turn'}
        </span>
        <span className={`text-[10px] font-mono font-bold tabular-nums ${urgent ? 'text-red-400' : 'text-gray-500'}`}>
          {Math.max(0, Math.ceil(limitSeconds - elapsed))}s
        </span>
      </div>
      <div className="h-1.5 w-full bg-uno-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-250 ${barColor} ${urgent ? 'animate-pulse' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
