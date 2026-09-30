# UNO — Real Card Table

A full UNO card game with a realistic table experience: physical card flights (anime.js),
radar turn timer, accounts, coin economy, and multiplayer rooms you can play with friends
(or bots). All state lives in a Neon serverless Postgres database.

## Features

- 🃏 Classic UNO vs the House Bot (full rules: Skip, Reverse, +2, Wild, Wild +4, UNO calls)
- 🎬 anime.js choreography — cards fly from the deck to hands, arc onto the discard pile,
  CPU cards flip face-up mid-air, hands shake when hit with draw penalties
- ⏱️ 20s radar turn timer on each player's avatar
- 👤 Accounts (scrypt-hashed passwords, session tokens)
- 🚪 Multiplayer rooms — share a 5-letter code with friends, fill empty seats with bots,
  authoritative server-side engine with optimistic locking
- 🪙 Coin economy — room antes, winner takes the pot (10% house rake), ±25 vs-bot rounds
- 🏆 Global leaderboard

## Architecture

```
├─ index.html / style.css / game.js / room.js   vanilla JS frontend (no framework)
├─ vendor/anime.min.js                          anime.js v3.2.2 (vendored, no CDN)
├─ server.js                                    dev/preview server (static + API)
├─ api-core.js                                  shared API logic (used by both targets)
├─ uno-engine.js                                authoritative UNO engine (server-side)
├─ db.js                                        Neon Postgres layer (serverless HTTP driver)
├─ api/index.js                                 Vercel serverless catch-all for /api/*
├─ scripts/build.mjs                            copies static files to dist/
└─ vercel.json                                  Vercel config (static + function)
```

The game state for room play is stored in `rooms.game_state` (JSONB) and advanced by the
shared engine, so the same rules run locally and on Vercel.

## Run locally / on Freebuff

```bash
npm install
npm run dev          # serves the game + API on :3000
```

Set `DATABASE_URL` (Neon connection string) for accounts/rooms/coins/leaderboard — without
it the game still works in vs-bot mode with a local name. Put it in a `.env` file in the
project root (`DATABASE_URL=postgresql://...`) or export it before `npm run dev`.

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel (framework preset: **Other**).
2. Add the environment variable **`DATABASE_URL`** (that exact name) with your Neon
   connection string. Use the **pooled** URL from the Neon Connect dialog, and enable it
   for **Production**. Saving the variable does not update a deployment that already
   finished — redeploy after it is saved.
3. Deploy. Vercel serves the static game and runs the files in `api/` for every `/api/*` call.
   `GET /api/health` reports whether the database connection succeeded.

No other configuration needed — `vercel.json` already wires the build, output directory,
API rewrites and caching.
