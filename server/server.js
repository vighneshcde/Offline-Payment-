require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const db = require('./db');
const { router: authRouter } = require('./routes/auth');
const walletRouter = require('./routes/wallet');
const transactionsRouter = require('./routes/transactions');
const cloudRouter = require('./routes/cloud');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// WebSocket client management for real-time events
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'PayOffline WebSocket Live Stream Connected' }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

const broadcastEvent = (data) => {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(payload);
    }
  }
};
app.locals.broadcastEvent = broadcastEvent;

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'PayOffline Unified Server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/cloud', cloudRouter);

// Fallback to PWA SPA index.html for unknown routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize DB and launch server
const startServer = async () => {
  await db.initDB();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 PayOffline Server running on http://localhost:${PORT}`);
    console.log(`📱 Offline PWA Client served from: public/index.html`);
    console.log(`🔌 WebSockets listening on ws://localhost:${PORT}`);
    console.log(`🛡️  Secure Offline Cryptographic Payment System Ready`);
    console.log(`======================================================\n`);
  });
};

startServer().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
