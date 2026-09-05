/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        uno: {
          red:     '#E8132A',
          blue:    '#0058A8',
          green:   '#009B3A',
          yellow:  '#FFD800',
          dark:    '#0d0d1a',
          card:    '#13132b',
          surface: '#1a1a3e',
          border:  '#2a2a5a',
        },
      },
      fontFamily: {
        game: ['system-ui', '-apple-system', 'sans-serif'],
      },
      screens: {
        xs: '375px',
      },
      animation: {
        /* Cards */
        'card-deal':      'cardDeal 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        'card-play':      'cardPlay 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        'card-hover':     'cardHover 0.2s ease-out both',
        'card-flip':      'cardFlip 0.45s ease-in-out both',
        /* UI feedback */
        'pulse-glow':     'pulseGlow 2s ease-in-out infinite',
        'pulse-ring':     'pulseRing 1.5s ease-out infinite',
        'bounce-in':      'bounceIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
        'slide-up':       'slideUp 0.3s ease-out both',
        'slide-down':     'slideDown 0.3s ease-out both',
        'fade-in':        'fadeIn 0.25s ease-out both',
        'fade-out':       'fadeOut 0.25s ease-in both',
        'shake':          'shake 0.4s ease-in-out both',
        'spin-slow':      'spin 3s linear infinite',
        /* Turn timer */
        'timer-drain':    'timerDrain linear both',
        /* Coins */
        'coin-pop':       'coinPop 0.6s cubic-bezier(0.34,1.56,0.64,1) both',
        'float-up':       'floatUp 1.2s ease-out both',
        /* Notification */
        'toast-in':       'toastIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        'toast-out':      'toastOut 0.3s ease-in both',
        /* Winner */
        'winner-burst':   'winnerBurst 0.6s cubic-bezier(0.34,1.56,0.64,1) both',
        'confetti-fall':  'confettiFall 2s ease-in both',
      },
      keyframes: {
        cardDeal: {
          '0%':   { transform: 'translateY(-60px) rotate(-8deg) scale(0.8)', opacity: '0' },
          '100%': { transform: 'translateY(0) rotate(0deg) scale(1)',        opacity: '1' },
        },
        cardPlay: {
          '0%':   { transform: 'scale(1) translateY(0)',    opacity: '1' },
          '50%':  { transform: 'scale(1.15) translateY(-12px)', opacity: '1' },
          '100%': { transform: 'scale(0.9) translateY(4px)', opacity: '0.8' },
        },
        cardHover: {
          '0%':   { transform: 'translateY(0) scale(1)' },
          '100%': { transform: 'translateY(-8px) scale(1.05)' },
        },
        cardFlip: {
          '0%':   { transform: 'rotateY(0deg)' },
          '50%':  { transform: 'rotateY(90deg)' },
          '100%': { transform: 'rotateY(0deg)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 6px 1px rgba(255,216,0,0.3)' },
          '50%':     { boxShadow: '0 0 20px 4px rgba(255,216,0,0.8)' },
        },
        pulseRing: {
          '0%':   { transform: 'scale(1)',   opacity: '0.8' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        bounceIn: {
          '0%':   { transform: 'scale(0.3)', opacity: '0' },
          '60%':  { transform: 'scale(1.1)', opacity: '1' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        slideDown: {
          '0%':   { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',      opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%':   { opacity: '1' },
          '100%': { opacity: '0' },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%':     { transform: 'translateX(-6px)' },
          '40%':     { transform: 'translateX(6px)' },
          '60%':     { transform: 'translateX(-4px)' },
          '80%':     { transform: 'translateX(4px)' },
        },
        timerDrain: {
          '0%':   { width: '100%' },
          '100%': { width: '0%' },
        },
        coinPop: {
          '0%':   { transform: 'scale(0) rotate(-20deg)', opacity: '0' },
          '60%':  { transform: 'scale(1.2) rotate(5deg)',  opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)',    opacity: '1' },
        },
        floatUp: {
          '0%':   { transform: 'translateY(0)',   opacity: '1' },
          '100%': { transform: 'translateY(-50px)', opacity: '0' },
        },
        toastIn: {
          '0%':   { transform: 'translateY(-100%) scale(0.9)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)',        opacity: '1' },
        },
        toastOut: {
          '0%':   { transform: 'translateY(0) scale(1)',        opacity: '1' },
          '100%': { transform: 'translateY(-100%) scale(0.9)', opacity: '0' },
        },
        winnerBurst: {
          '0%':   { transform: 'scale(0.5) rotate(-10deg)', opacity: '0' },
          '70%':  { transform: 'scale(1.2) rotate(3deg)',   opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)',     opacity: '1' },
        },
        confettiFall: {
          '0%':   { transform: 'translateY(-20px) rotate(0deg)',   opacity: '1' },
          '100%': { transform: 'translateY(100vh) rotate(720deg)', opacity: '0' },
        },
      },
      backgroundImage: {
        'card-shine': 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(255,255,255,0.05) 100%)',
        'table-felt': 'radial-gradient(ellipse at center, #1a3a2a 0%, #0d1f16 100%)',
      },
      boxShadow: {
        'card':      '0 4px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
        'card-glow': '0 0 20px rgba(255,216,0,0.6), 0 4px 12px rgba(0,0,0,0.5)',
        'inset-top': 'inset 0 2px 8px rgba(0,0,0,0.4)',
        'glow-red':  '0 0 16px rgba(232,19,42,0.6)',
        'glow-blue': '0 0 16px rgba(0,88,168,0.6)',
        'glow-green':'0 0 16px rgba(0,155,58,0.6)',
        'glow-yell': '0 0 16px rgba(255,216,0,0.6)',
      },
    },
  },
  plugins: [],
};
