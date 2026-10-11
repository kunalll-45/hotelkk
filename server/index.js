import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './db.js';

// Route imports
import authRoutes from './routes/authRoutes.js';
import createStaffRouter from './routes/staffRoutes.js';
import createAttendanceRouter from './routes/attendanceRoutes.js';
import createTableRouter from './routes/tableRoutes.js';
import createMenuRouter from './routes/menuRoutes.js';
import createSessionRouter from './routes/sessionRoutes.js';
import createBillingRouter from './routes/billingRoutes.js';
import createTipRouter from './routes/tipRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import qrRoutes from './routes/qrRoutes.js';
import createBookingRouter from './routes/bookingRoutes.js';
import createLogRouter from './routes/logRoutes.js';
import createOfferRouter from './routes/offerRoutes.js';
import createUploadRouter, { createUploadRetrievalRouter } from './routes/uploadRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const io = new SocketIOServer(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: CORS_ORIGIN }));
const BODY_LIMIT = process.env.BODY_LIMIT || '15mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

// Secure S3 image retrieval with local fallback
app.use('/uploads', createUploadRetrievalRouter());
app.use('/dishes', createUploadRetrievalRouter());

// Initialize Database & Seed Data
await initDatabase();
console.log('Database initialized successfully with SQLite and seed data.');

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/staff', createStaffRouter(io));
app.use('/api/attendance', createAttendanceRouter(io));
app.use('/api/tables', createTableRouter(io));
app.use('/api/menu', createMenuRouter(io));
app.use('/api/sessions', createSessionRouter(io));
app.use('/api/billing', createBillingRouter(io));
app.use('/api/tips', createTipRouter(io));
app.use('/api/reports', reportRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/bookings', createBookingRouter(io));
app.use('/api/logs', createLogRouter(io));
app.use('/api/offers', createOfferRouter(io));
app.use('/api/upload', createUploadRouter());

// Real-time Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);

  // Join table-specific room for live customer updates
  socket.on('join:table', (tableId) => {
    socket.join(`table:${tableId}`);
    console.log(`Socket ${socket.id} joined table:${tableId}`);
  });

  // Join waiter-specific room for assigned table events
  socket.on('join:waiter', (waiterId) => {
    socket.join(`waiter:${waiterId}`);
    console.log(`Socket ${socket.id} joined waiter:${waiterId}`);
  });

  // Join manager room for overall live operations
  socket.on('join:manager', () => {
    socket.join('manager:room');
    console.log(`Socket ${socket.id} joined manager:room`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Serve frontend in production or dev
const clientDist = path.join(__dirname, '..', 'client', 'dist');
import fs from 'fs';
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  // Vite dev middleware or info
  app.get('/', (req, res, next) => {
    if (req.accepts('html')) {
      // In dev mode, redirect to vite dev server if running on 5173 or inform
      return next();
    }
    next();
  });
}

const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_IP = process.env.PUBLIC_IP || '15.252.17.218';
server.listen(PORT, HOST, () => {
  console.log(`=========================================`);
  console.log(`  K K's Food House Server Running        `);
  console.log(`  Host: ${HOST}:${PORT}                   `);
  console.log(`  Public: http://${PUBLIC_IP}:${PORT}     `);
  console.log(`  Environment: ${process.env.NODE_ENV || 'production'} `);
  console.log(`=========================================`);
});
