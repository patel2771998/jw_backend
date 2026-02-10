const express = require('express');
const cors = require('cors');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const staffRoutes = require('./routes/staff');
const notificationRoutes = require('./routes/notifications');

const app = express();

const allowedOrigins = config.corsOrigin;

// Allow origin if in list, or on Vercel when CORS_ORIGIN not set (allow *.vercel.app)
function isOriginAllowed(origin) {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.VERCEL && (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.trim() === '') && origin.endsWith('.vercel.app')) return true;
  return false;
}

// Set CORS headers on every response so preflight and errors always get them
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(cors({
  origin: (o, cb) => (!o || isOriginAllowed(o) ? cb(null, true) : cb(null, false)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: "Welcome to the Jollly Appllication" });
});
app.use(errorHandler);

module.exports = app;
