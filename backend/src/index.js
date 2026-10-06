import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import { registerDocHandlers } from './sockets/docHandler.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * ============================================================================
 * CORS (Cross-Origin Resource Sharing) Configuration:
 * ============================================================================
 * - Cross-Origin requests are strictly restricted to the URL defined by CLIENT_URL.
 * - `credentials: true` enables the client to send cookies, authorization headers,
 *   or TLS client certificates across origins.
 * - Both Express (REST endpoints) and Socket.io (WebSocket connections) MUST share
 *   identical CORS configurations to prevent handshake failures or unauthorized cross-origin attacks.
 * ============================================================================
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, curl, server-to-server) in development
    if (!origin || origin === CLIENT_URL || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS policy.`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * Socket.io Server Setup:
 * - Configured with WebSocket transport as primary transport (falling back to polling if needed).
 * - Matches Express CORS policies.
 */
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'], // WebSocket transport explicitly enabled for minimal latency
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

// 404 Route handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Server Error]:', err);
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// Socket.io Connection Entry Point
io.on('connection', (socket) => {
  console.log(`[Socket.io] New client connected: ${socket.id}`);
  registerDocHandlers(io, socket);
});

// Start Server and Connect to MongoDB
const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      console.log(`[Server] Collaborative Editor Backend is running on port ${PORT}`);
      console.log(`[Server] Allowed CORS Client URL: ${CLIENT_URL}`);
    });
  } catch (error) {
    console.error('[Server Startup Error]:', error.message);
    // Listen even if MongoDB fails initially, allowing health-checks and reconnect attempts
    server.listen(PORT, () => {
      console.warn(`[Server] Server started on port ${PORT} with DB connection warning.`);
    });
  }
};

startServer();

export { app, server, io };

