# Deployment Guide

This guide explains how to deploy your UNO game for free using Vercel (frontend) and Railway (backend).

## Architecture

- **Frontend**: React + Vite deployed to Vercel
- **Backend**: Node.js + Express + Socket.IO deployed to Railway
- **Why this approach**: Socket.IO requires persistent WebSocket connections, which Vercel serverless functions don't support. Railway provides proper Socket.IO support with free tier.

## Prerequisites

- GitHub account (for both Vercel and Railway)
- Railway account (free tier)
- Vercel account (free tier)

## Step 1: Deploy Backend to Railway

### 1.1 Push Code to GitHub

Make sure your project is pushed to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/uno-game.git
git push -u origin main
```

### 1.2 Deploy to Railway

1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `uno-game` repository
4. Railway will detect your Node.js project automatically
5. Click "Deploy"

### 1.3 Configure Environment Variables

After deployment, in Railway:
1. Go to your project → "Variables" tab
2. Add the following environment variables:
   ```
   PORT=3001
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   JWT_EXPIRES_IN=7d
   CLIENT_URL=https://your-vercel-frontend-url.vercel.app
   NODE_ENV=production
   ```
3. Save and redeploy

### 1.4 Get Your Railway URL

After deployment, Railway will provide a URL like:
```
https://your-project-name.up.railway.app
```
Copy this URL - you'll need it for the frontend configuration.

## Step 2: Deploy Frontend to Vercel

### 2.1 Configure Environment Variables

In the `frontend` directory, create a `.env` file:
```bash
cd frontend
```

Create `.env` with your Railway URL:
```
VITE_API_URL=https://your-railway-url.railway.app/api
VITE_SOCKET_URL=https://your-railway-url.railway.app
```

### 2.2 Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click "Add New Project" → "Continue with GitHub"
3. Select your `uno-game` repository
4. Vercel will detect the framework. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Click "Deploy"

### 2.3 Add Environment Variables in Vercel

After deployment:
1. Go to your project → "Settings" → "Environment Variables"
2. Add:
   ```
   VITE_API_URL=https://your-railway-url.railway.app/api
   VITE_SOCKET_URL=https://your-railway-url.railway.app
   ```
3. Redeploy your project

### 2.4 Update Railway CLIENT_URL

Go back to Railway and update the `CLIENT_URL` environment variable:
```
CLIENT_URL=https://your-vercel-project-url.vercel.app
```

## Step 3: Verify Deployment

1. Test your frontend URL (e.g., `https://your-project.vercel.app`)
2. Try registering a new user
3. Create a game room and test real-time functionality
4. Verify Socket.IO connections work properly

## File Changes Made

For this deployment setup, the following files were created/modified:

### Frontend
- `frontend/vercel.json` - Vercel configuration
- `frontend/.vercelignore` - Files to ignore during deployment
- `frontend/.env.example` - Environment variable template
- `frontend/src/services/api.ts` - Updated to use environment variable for API URL
- `frontend/src/services/socket.ts` - Updated to use environment variable for Socket URL

### Backend
- `backend/railway.json` - Railway configuration
- `backend/.env.example` - Updated with production environment variables

## Troubleshooting

### Frontend Build Issues
- Ensure all dependencies are installed: `cd frontend && npm install`
- Check for TypeScript errors: `cd frontend && npm run build`

### Backend Build Issues
- Ensure all dependencies are installed: `cd backend && npm install`
- Check TypeScript compilation: `cd backend && npm run build`

### Socket.IO Connection Issues
- Verify Railway URL is correct in frontend environment variables
- Check Railway logs for connection errors
- Ensure CORS is properly configured in backend

### Environment Variable Issues
- Double-check variable names (case-sensitive)
- Ensure `VITE_` prefix for frontend variables
- Redeploy after changing environment variables

## Cost

Both platforms offer generous free tiers:
- **Vercel**: Free for personal projects with unlimited deployments
- **Railway**: $5 free credit/month (more than enough for this project)

## Scaling

If your game grows:
- Railway automatically scales based on usage
- Vercel handles frontend traffic globally
- Consider adding a database (PostgreSQL on Railway) for persistent user data
- Currently using in-memory storage (switch to Railway PostgreSQL for production)

## Alternative Deployment Options

If you prefer other platforms:
- **Render**: Similar to Railway, good free tier
- **Heroku**: Supports Socket.IO but has limited free tier
- **DigitalOcean App Platform**: Good performance, paid only
