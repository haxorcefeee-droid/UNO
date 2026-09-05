import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { getSocket } from '../../services/socket';
import { CardColor, Card } from '../../types';
import UnoCard, { CardBack } from './UnoCard';
import ColorPicker from './ColorPicker';
import PlayerSeat from './PlayerSeat';
import GameOverModal from './GameOverModal';
import TurnTimer from './TurnTimer';
import NotificationToast from './NotificationToast';
import ChatPanel from '../chat/ChatPanel';

interface Props { roomId: string; }

const COLOR_DOT: Record<CardColor, string> = {
  red:    'bg-uno-red shadow-glow-red',
  blue:   'bg-uno-blue shadow-glow-blue',
  green:  'bg-uno-green shadow-glow-green',
  yellow: 'bg-uno-yellow shadow-glow-yell',
  wild:   'bg-gradient-to-br from-red-500 via-purple-500 to-blue-500',
};

const COLOR_LABEL: Record<CardColor, string> = {
  red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow', wild: 'Wild',
};

export default function GameBoard({ roomId }: Props) {
  const navigate = useNavigate();
  const {
    gameState, selectedCardId, showColorPicker, gameOver,
    currentRoom, selectCard, setShowColorPicker,
  } = useGameStore();
  const { user } = useAuthStore();
  const [chatOpen, setChatOpen] = useState(false);

  if (!gameState || !user) {
    return (
      <div className="min-h-screen bg-felt flex items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="uno-logo text-4xl mb-2">
            <span className="text-uno-red">U</span>
            <span className="text-uno-blue">N</span>
            <span className="text-uno-yellow">O</span>
          </div>
          <p className="text-gray-400 text-sm">Loading game...</p>
        </div>
      </div>
    );
  }

  const socket = getSocket();
  const myPlayer = gameState.players.find(p => p.userId === user.id);
  const myHand = myPlayer?.hand ?? [];
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer?.userId === user.id;
  const topCard = gameState.discardPile[gameState.discardPile.length - 1];
  const otherPlayers = gameState.players.filter(p => p.userId !== user.id);
  const wager = currentRoom?.wagerCoins ?? 0;
  const totalPot = wager * gameState.players.filter(p => !p.username.startsWith('🤖')).length;

  const isPlayable = (card: Card): boolean => {
    if (!isMyTurn) return false;
    if (gameState.drawStack > 0) return card.value === topCard?.value;
    return card.color === 'wild' || card.color === gameState.currentColor || card.value === topCard?.value;
  };

  const handleCardClick = (cardId: string) => {
    if (!isMyTurn) return;
    const card = myHand.find(c => c.id === cardId);
    if (!card || !isPlayable(card)) return;
    if (card.color === 'wild') { selectCard(cardId); setShowColorPicker(true); }
    else socket.emit('game:play_card', { cardId });
  };

  const handleColorChosen = (color: CardColor) => {
    if (selectedCardId) socket.emit('game:play_card', { cardId: selectedCardId, chosenColor: color });
    setShowColorPicker(false);
    selectCard(null);
  };

  const handleDraw = () => { if (isMyTurn) socket.emit('game:draw_card'); };
  const handleSayUno = () => socket.emit('game:say_uno');
  const handleChallenge = (targetId: string) => socket.emit('game:challenge_uno', targetId);

  return (
    <div className="min-h-screen bg-felt flex flex-col overflow-hidden select-none">
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header className="safe-top flex-shrink-0 bg-uno-card/80 backdrop-blur border-b border-uno-border
                         px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="uno-logo text-xl">
            <span className="text-uno-red">U</span>
            <span className="text-uno-blue">N</span>
            <span className="text-uno-yellow">O</span>
          </span>
          <span className="text-gray-600 text-xs hidden sm:block">· {roomId}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Pot display */}
          {wager > 0 && (
            <div className="coin-badge">
              🏆 {totalPot} pot
            </div>
          )}
          {/* User coins */}
          <div className="coin-badge">
            🪙 {user.coins ?? 0}
          </div>
          {/* Draw stack warning */}
          {gameState.drawStack > 0 && (
            <div className="bg-red-700 text-white text-xs font-black px-2 py-1 rounded-lg animate-pulse">
              +{gameState.drawStack}
            </div>
          )}
          {/* Direction */}
          <span className="text-gray-400 text-base" title="Play direction">
            {gameState.direction === 1 ? '↻' : '↺'}
          </span>
          {/* Chat toggle */}
          <button
            onClick={() => setChatOpen(o => !o)}
            className="relative bg-uno-surface px-2.5 py-1.5 rounded-lg text-sm text-gray-300
                       hover:text-white active:scale-95 transition-all"
            aria-label="Toggle chat"
          >
            💬
          </button>
        </div>
      </header>

      {/* ── Toast ────────────────────────────────────────────────── */}
      <NotificationToast />

      <div className="flex flex-1 min-h-0">
        {/* ── Main game area ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Other players row */}
          <div className="flex-shrink-0 p-2 sm:p-3">
            <div className="flex flex-wrap gap-2 justify-center">
              {otherPlayers.map(player => (
                <PlayerSeat
                  key={player.id}
                  player={player}
                  isCurrentTurn={currentPlayer?.id === player.id}
                  isSelf={false}
                  isBot={player.username.startsWith('🤖')}
                  wagerCoins={wager}
                  onChallenge={() => handleChallenge(player.id)}
                />
              ))}
            </div>
          </div>

          {/* ── Centre play area ──────────────────────────────────── */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 sm:gap-5 py-2 px-3">

            {/* Turn banner */}
            <div className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-black
                            transition-all duration-300 animate-slide-down
                            ${isMyTurn
                              ? 'bg-uno-yellow text-black animate-pulse-glow'
                              : 'bg-uno-surface text-gray-300'}`}>
              {isMyTurn
                ? '🎯 Your turn — play or draw!'
                : `⏳ ${currentPlayer?.username}'s turn`}
            </div>

            {/* Turn timer */}
            <div className="w-full max-w-[280px]">
              <TurnTimer
                turnStartedAt={gameState.turnStartedAt}
                isMyTurn={isMyTurn}
              />
            </div>

            {/* Draw stack warning */}
            {gameState.drawStack > 0 && (
              <div className="bg-red-900/60 border border-red-500/50 text-red-200 text-xs
                              font-semibold px-4 py-2 rounded-xl animate-shake text-center">
                ⚠️ Stack a matching card or draw <span className="font-black text-red-100">+{gameState.drawStack}</span>!
              </div>
            )}

            {/* Current colour + discard + draw pile row */}
            <div className="flex items-center justify-center gap-4 sm:gap-8">
              {/* Current colour indicator */}
              <div className="flex flex-col items-center gap-1">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${COLOR_DOT[gameState.currentColor]}
                                border-2 border-white/20 transition-all duration-500`} />
                <span className="text-[10px] text-gray-400 font-medium">{COLOR_LABEL[gameState.currentColor]}</span>
              </div>

              {/* Discard pile */}
              <div className="flex flex-col items-center gap-1">
                <div className="relative">
                  {topCard && (
                    <UnoCard card={topCard} size="responsive" />
                  )}
                </div>
                <span className="text-[10px] text-gray-500">Discard</span>
              </div>

              {/* Draw pile */}
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={handleDraw}
                  disabled={!isMyTurn}
                  aria-label="Draw a card"
                  className={`transition-transform active:scale-95
                    ${isMyTurn ? 'hover:scale-105 cursor-pointer' : 'opacity-50 cursor-default'}`}
                >
                  <CardBack size="responsive" />
                </button>
                <span className="text-[10px] text-gray-500">{gameState.deck} left</span>
              </div>
            </div>
          </div>

          {/* ── My hand ────────────────────────────────────────────── */}
          <div className="flex-shrink-0 bg-uno-card/70 border-t border-uno-border safe-bottom">
            {/* UNO button — show when 2 or fewer cards */}
            {myHand.length > 0 && myHand.length <= 2 && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleSayUno}
                  className="bg-uno-red text-white font-black text-sm sm:text-base
                             px-6 py-2 rounded-full hover:bg-red-500 active:scale-95
                             transition-all shadow-glow-red animate-pulse-glow"
                  aria-label="Say UNO!"
                >
                  🎯 UNO!
                </button>
              </div>
            )}

            {/* Cards */}
            <div className="flex flex-wrap justify-center items-end gap-1.5 sm:gap-2
                            p-2 sm:p-3 max-h-44 sm:max-h-52 overflow-y-auto no-bounce">
              {myHand.map((card, i) => (
                <UnoCard
                  key={card.id}
                  card={card}
                  size="responsive"
                  selected={selectedCardId === card.id}
                  playable={isPlayable(card)}
                  dealDelay={i * 40}
                  onClick={() => handleCardClick(card.id)}
                />
              ))}
            </div>

            {/* Hand meta row */}
            <div className="flex items-center justify-between px-3 pb-2 text-[10px] text-gray-600">
              <span>{myHand.length} card{myHand.length !== 1 ? 's' : ''} in hand</span>
              {!isMyTurn && <span>Waiting for {currentPlayer?.username}...</span>}
              {isMyTurn && gameState.drawStack === 0 && (
                <span className="text-uno-yellow font-semibold">Tap a highlighted card to play</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Chat panel ─────────────────────────────────────────── */}
        {chatOpen && (
          <div className="w-64 sm:w-72 flex-shrink-0 border-l border-uno-border flex flex-col">
            <ChatPanel roomId={roomId} onClose={() => setChatOpen(false)} />
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {showColorPicker && (
        <ColorPicker
          onSelect={handleColorChosen}
          onCancel={() => { setShowColorPicker(false); selectCard(null); }}
        />
      )}
      <GameOverModal />
    </div>
  );
}
