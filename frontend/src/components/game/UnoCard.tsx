import React, { useEffect, useState } from 'react';
import { Card, CardColor } from '../../types';

interface Props {
  card: Card;
  onClick?: () => void;
  selected?: boolean;
  playable?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'responsive';
  dealDelay?: number; // ms stagger for deal animation
  justPlayed?: boolean;
}

const COLOR_BG: Record<CardColor, string> = {
  red:    'bg-uno-red',
  blue:   'bg-uno-blue',
  green:  'bg-uno-green',
  yellow: 'bg-uno-yellow',
  wild:   'bg-gradient-to-br from-red-500 via-purple-600 to-blue-500',
};

const COLOR_SHADOW: Record<CardColor, string> = {
  red:    'shadow-glow-red',
  blue:   'shadow-glow-blue',
  green:  'shadow-glow-green',
  yellow: 'shadow-glow-yell',
  wild:   'shadow-[0_0_20px_rgba(168,85,247,0.6)]',
};

const VALUE_SYMBOL: Record<string, string> = {
  skip:       '⊘',
  reverse:    '↺',
  draw2:      '+2',
  wild:       '✦',
  wild_draw4: '+4',
};

const SIZE_CLASSES = {
  sm:         'uno-card-sm',
  md:         'uno-card-md',
  lg:         'uno-card-lg',
  responsive: 'uno-card-responsive',
};

function getSymbol(value: string) {
  return VALUE_SYMBOL[value] ?? value;
}

export default function UnoCard({
  card, onClick, selected, playable, size = 'responsive', dealDelay = 0, justPlayed = false,
}: Props) {
  const [dealt, setDealt] = useState(dealDelay === 0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (dealDelay > 0) {
      const t = setTimeout(() => setDealt(true), dealDelay);
      return () => clearTimeout(t);
    }
  }, [dealDelay]);

  useEffect(() => {
    if (justPlayed) {
      setPlaying(true);
      const t = setTimeout(() => setPlaying(false), 400);
      return () => clearTimeout(t);
    }
  }, [justPlayed]);

  const symbol = getSymbol(card.value);
  const textColor = card.color === 'yellow' ? 'text-gray-900' : 'text-white';
  const isInteractive = !!onClick;

  return (
    <button
      onClick={onClick}
      disabled={!isInteractive}
      aria-label={`${card.color} ${card.value}`}
      aria-pressed={selected}
      className={[
        'uno-card-base',
        SIZE_CLASSES[size],
        COLOR_BG[card.color],
        textColor,
        /* Animation states */
        !dealt ? 'opacity-0' : 'animate-card-deal',
        playing ? 'animate-card-play' : '',
        /* Interactive states */
        isInteractive && playable && !selected
          ? 'uno-card-playable'
          : '',
        selected
          ? `uno-card-selected ${COLOR_SHADOW[card.color]}`
          : '',
        isInteractive && !playable && !selected
          ? 'uno-card-disabled'
          : '',
        !isInteractive ? 'cursor-default' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Shine overlay */}
      <div className="absolute inset-0 bg-card-shine pointer-events-none rounded-xl" />

      {/* Top-left label */}
      <span className="self-start leading-none font-black z-10 px-0.5">{symbol}</span>

      {/* Center big symbol */}
      <span className={`z-10 leading-none font-black drop-shadow-lg
        ${size === 'sm' ? 'text-base' : size === 'md' ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
        {symbol}
      </span>

      {/* Bottom-right label rotated */}
      <span className="self-end rotate-180 leading-none font-black z-10 px-0.5">{symbol}</span>
    </button>
  );
}

/* ─── Card Back ──────────────────────────────────────────────────────────── */
export function CardBack({ size = 'responsive' }: { size?: 'sm' | 'md' | 'lg' | 'responsive' }) {
  const sizeClass = SIZE_CLASSES[size];
  return (
    <div className={`uno-card-base ${sizeClass} bg-uno-red cursor-default`}>
      <div className="absolute inset-0 bg-card-shine pointer-events-none rounded-xl" />
      <div className="absolute inset-1.5 border border-white/20 rounded-lg flex items-center justify-center">
        <span className={`text-white font-black opacity-60
          ${size === 'sm' ? 'text-xs' : 'text-lg'}`}>
          UNO
        </span>
      </div>
    </div>
  );
}
