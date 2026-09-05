import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { getSocket } from '../../services/socket';
import { ChatMessage } from '../../types';

interface Props {
  roomId: string;
  onClose?: () => void;
}

const TIME_FORMAT = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });

function formatTime(ts: number): string {
  return TIME_FORMAT.format(new Date(ts));
}

export default function ChatPanel({ roomId, onClose }: Props) {
  const { messages } = useGameStore();
  const { user } = useAuthStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const msg = input.trim();
    if (!msg || msg.length > 300) return;
    getSocket().emit('chat:message', { roomId, message: msg });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full bg-uno-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-uno-surface flex-shrink-0">
        <span className="text-white font-semibold text-sm">💬 Chat</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none transition-colors"
            aria-label="Close chat"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-gray-600 text-xs text-center mt-8">
            No messages yet. Say hello! 👋
          </p>
        )}

        {messages.map((msg: ChatMessage) => {
          const isSelf = msg.userId === user?.id;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
            >
              {/* Sender name + time */}
              <div className="flex items-center gap-1.5 mb-0.5">
                {!isSelf && (
                  <span className="text-xs font-semibold text-gray-400">{msg.username}</span>
                )}
                <span className="text-xs text-gray-600">{formatTime(msg.timestamp)}</span>
              </div>

              {/* Bubble */}
              <div
                className={[
                  'max-w-[85%] px-3 py-2 rounded-2xl text-sm break-words',
                  isSelf
                    ? 'bg-uno-blue text-white rounded-br-sm'
                    : 'bg-uno-surface text-gray-200 rounded-bl-sm',
                ].join(' ')}
              >
                {msg.message}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3 border-t border-uno-surface">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={300}
            placeholder="Type a message..."
            className="flex-1 bg-uno-surface border border-gray-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-uno-yellow placeholder-gray-600 min-w-0"
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            className="bg-uno-blue text-white px-3 py-2 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Send message"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
