// server/index.js
require('dotenv').config();

const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { sequelize } = require('@suites/database-models');

// Routers
const authLocalRouter        = require('./routes/auth.local');
const authGoogleRouter       = require('./routes/auth.google');
const usersRouter            = require('./routes/users');
const billingRouter          = require('./routes/billing');
const toolsRouter            = require('./routes/tools');
const stripeWebhookRouter    = require('./routes/webhook.stripe'); 

const app = express();

// Trust proxy (if behind reverse proxy)
app.set('trust proxy', 1);

// --- Security & CORS ---
app.use(helmet());

const FE_ORIGIN = (process.env.CLIENT || '').replace(/\/$/, '');
const allowedOrigins = [FE_ORIGIN, 'https://192.168.1.15:3000'].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'accessToken'],
  methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
};
app.use(cors(corsOptions));

// --- Webhooks ---
app.use('/webhook', stripeWebhookRouter);

// --- IMPORTANT: mount webhook BEFORE json parser (uses express.raw inside) ---

// --- Parsers for normal routes ---
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// --- Healthcheck ---
app.get('/api/health', (_req, res) => res.json({ ok: true, t: Date.now() }));

// --- Auth routes ---
app.use('/api/auth', authLocalRouter);
app.use('/api/auth', authGoogleRouter);

// --- User routes ---
app.use('/api/user', usersRouter);

// --- Billing routes ---
app.use('/api/billing', billingRouter);
app.use('/api/tools', toolsRouter);

const errorHandler = require('./middlewares/errorHandler');
app.use(errorHandler);

// --- 404 fallback ---
app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// ---- Start servers ----
const HTTPS_PORT = Number(process.env.PORT || 3001);
const HTTP_REDIRECT_PORT = process.env.HTTP_REDIRECT_PORT ? Number(process.env.HTTP_REDIRECT_PORT) : null;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');

    const keyPath  = process.env.HTTPS_KEY;
    const certPath = process.env.HTTPS_CERT;

    if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const ssl = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      https.createServer(ssl, app).listen(HTTPS_PORT, () => {
        console.log(`🔐 HTTPS API on https://localhost:${HTTPS_PORT}`);
        console.log(`   FE origin: ${FE_ORIGIN || '(none set)'}`);
      });

      // Optional HTTP → HTTPS redirect server
      if (HTTP_REDIRECT_PORT) {
        const redirectApp = express();
        redirectApp.use((req, res) => {
          const host = (req.headers.host || 'localhost').replace(/:\d+$/, '');
          const location = `https://${host}:${HTTPS_PORT}${req.url}`;
          res.redirect(301, location);
        });
        http.createServer(redirectApp).listen(HTTP_REDIRECT_PORT, () => {
          console.log(`↪️  HTTP redirect on http://localhost:${HTTP_REDIRECT_PORT} → https://localhost:${HTTPS_PORT}`);
        });
      }
    } else {
      // Fallback: HTTP only (no cert found)
      http.createServer(app).listen(HTTPS_PORT, () => {
        console.log(`⚠️  Running HTTP (no cert found) on http://localhost:${HTTPS_PORT}`);
        console.log(`    Set HTTPS_KEY and HTTPS_CERT in .env for HTTPS.`);
      });
    }
  } catch (e) {
    console.error('❌ Failed to boot server:', e);
    process.exit(1);
  }
})();
