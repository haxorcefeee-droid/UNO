# UNO Online — Multiplayer Card Game

A full-stack real-time multiplayer UNO game built with React, Node.js, Socket.IO, and TypeScript.

## Project Structure

```
UNO/
├── backend/          # Node.js + Express + Socket.IO server
│   └── src/
│       ├── auth/         JWT helpers
│       ├── game/         UNO engine, deck, room manager, types
│       ├── middleware/   Auth middleware
│       ├── models/       User model (in-memory)
│       ├── routes/       REST API routes
│       └── socket/       Socket.IO event handlers
└── frontend/         # React + TypeScript + Tailwind + Vite
    └── src/
        ├── components/
        │   ├── auth/     Login, Register, ProtectedRoute
        │   ├── chat/     ChatPanel
        │   ├── game/     GameBoard, UnoCard, ColorPicker, PlayerSeat, GameOverModal
        │   └── lobby/    LobbyPage, RoomPage, RoomList, modals
        ├── hooks/        useSocket (Socket.IO event wiring)
        ├── services/     api.ts (Axios), socket.ts (Socket.IO client)
        ├── store/        authStore, gameStore (Zustand)
        └── types/        Shared TypeScript types
```

## Quick Start

### 1. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

The backend `.env` is pre-configured for local development. Change `JWT_SECRET` before going to production.

### 3. Run in development

Open two terminals:

```bash
# Terminal 1 — Backend (http://localhost:3001)
cd backend
npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

## Game Features (Phase 1)

- ✅ User registration & login with JWT
- ✅ Create / join rooms with optional passwords
- ✅ Full UNO rules: Skip, Reverse, Draw 2, Wild, Wild Draw 4
- ✅ Draw card stacking (chain Draw 2s and Draw 4s)
- ✅ UNO declaration + challenge system
- ✅ Real-time multiplayer via Socket.IO (2–10 players)
- ✅ In-game text chat

## Roadmap

- **Phase 2** — Friends system, voice chat (Agora/LiveKit)
- **Phase 3** — Wallet system, virtual coins → real money (Stripe)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | Zustand |
| Routing | React Router v6 |
| Real-time | Socket.IO client |
| HTTP | Axios |
| Backend | Node.js, Express, TypeScript |
| Real-time | Socket.IO server |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Database | In-memory (swap for PostgreSQL) |
