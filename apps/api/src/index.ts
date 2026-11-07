import express from 'express';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables
dotenv.config();

// Production Security Guard
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('dev-secret')) {
    console.error('❌ FATAL: Production deployment requires a secure, non-default JWT_SECRET.');
    process.exit(1);
  }
}

import authRouter from './routes/auth.js';
import meetingsRouter from './routes/meetings.js';
import waitingRouter from './routes/waiting.js';
import agendaRouter from './routes/agenda.js';
import attendanceRouter from './routes/attendance.js';
import pollsRouter from './routes/polls.js';
import announcementsRouter from './routes/announcements.js';
import livekitRouter from './routes/livekit.js';

import { timerService } from './services/timerService.js';
import { setupSocketHandlers } from './socket/index.js';
import { seed } from './db/seed.js';

const app = express();
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || '*';

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST']
  }
});

// Global Middleware
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// General API rate limiter (300 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});
app.use('/api/', apiLimiter);

// API Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/meetings', meetingsRouter);
app.use('/api/v1/waiting', waitingRouter);
app.use('/api/v1/agenda', agendaRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/polls', pollsRouter);
app.use('/api/v1/announcements', announcementsRouter);
app.use('/api/v1/livekit', livekitRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'ClubRoom API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    storagePath: '/media/omkar/Storage/Projects/meeting/database/clubroom.sqlite'
  });
});

// Initialize socket handlers & timer manager
setupSocketHandlers(io);
timerService.initialize(io);

// Auto-seed initial data if needed
seed().catch((err) => console.error('[Startup] Seed error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  🚀 ClubRoom API Server listening on port ${PORT}`);
  console.log(`  📡 WebSocket Server initialized`);
  console.log(`  ⏱️ Server-Authoritative Meeting Timer active`);
  console.log(`  💾 Storage Database: /media/omkar/Storage/Projects/meeting/database/clubroom.sqlite`);
  console.log(`=======================================================`);
});

// Graceful shutdown
function shutdown() {
  console.log('\n[Shutdown] Closing ClubRoom API gracefully...');
  timerService.stop();
  server.close(() => {
    console.log('[Shutdown] Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, server, io };

