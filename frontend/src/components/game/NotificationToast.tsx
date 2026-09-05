import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';

export default function NotificationToast() {
  const { notification, setNotification } = useGameStore();
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(notification);

  useEffect(() => {
    if (!notification) { setVisible(false); return; }
    setCurrent(notification);
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 2800);
    const clear = setTimeout(() => setNotification(null), 3100);
    return () => { clearTimeout(hide); clearTimeout(clear); };
  }, [notification?.id, setNotification]);

  if (!current) return null;

  return (
    <div
      className={`
        fixed top-safe top-4 left-1/2 z-50 pointer-events-none
        transition-all duration-300
        ${visible ? 'animate-toast-in opacity-100' : 'animate-toast-out opacity-0'}
      `}
      style={{ transform: 'translateX(-50%)' }}
    >
      <div className="glass border border-uno-border rounded-2xl px-4 py-3 shadow-2xl
                      flex items-center gap-3 min-w-[200px] max-w-[90vw] sm:max-w-sm">
        <span className="text-2xl flex-shrink-0 leading-none">{current.emoji}</span>
        <span className="text-white font-semibold text-sm leading-snug">{current.text}</span>
      </div>
    </div>
  );
}
