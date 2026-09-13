import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import authRoutes from './routes/auth';
import { registerSocketHandlers } from './socket/socketHandler';

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*', // Temporarily allow all origins for debugging
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: '*', // Temporarily allow all origins for debugging
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${req.ip}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

app.use(express.json());

// REST Routes
app.use('/api/auth', authRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO
registerSocketHandlers(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO ready`);
});
