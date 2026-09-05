import React from 'react';
import { CardColor } from '../../types';

interface Props {
  onSelect: (color: CardColor) => void;
  onCancel: () => void;
}

const COLORS: { color: CardColor; bg: string; emoji: string; label: string }[] = [
  { color: 'red',    bg: 'bg-uno-red',    emoji: '🔴', label: 'Red'    },
  { color: 'blue',   bg: 'bg-uno-blue',   emoji: '🔵', label: 'Blue'   },
  { color: 'green',  bg: 'bg-uno-green',  emoji: '🟢', label: 'Green'  },
  { color: 'yellow', bg: 'bg-uno-yellow', emoji: '🟡', label: 'Yellow' },
];

export default function ColorPicker({ onSelect, onCancel }: Props) {
  return (
    <div className="fixed inset-0 glass z-50 flex items-center justify-center p-4">
      <div className="panel p-6 sm:p-8 w-full max-w-xs animate-bounce-in text-center">
        <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Wild Card</p>
        <h2 className="text-white text-xl font-black mb-6">Choose a colour ✨</h2>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {COLORS.map(({ color, bg, emoji, label }) => (
            <button
              key={color}
              onClick={() => onSelect(color)}
              className={`${bg} rounded-2xl py-5 font-black text-base
                         flex flex-col items-center gap-1.5 gap active:scale-95
                         transition-transform hover:scale-105 shadow-card
                         ${color === 'yellow' ? 'text-gray-900' : 'text-white'}`}
            >
              <span className="text-2xl">{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
