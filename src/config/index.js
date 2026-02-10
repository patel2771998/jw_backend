require('dotenv').config();

// CORS: use CORS_ORIGIN (comma-separated) or fallback.
// For separate frontend/backend deploy, set CORS_ORIGIN to your frontend URL (e.g. https://jw-frontend-kappa.vercel.app).
const defaultCors = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:3000'];

module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean) : defaultCors,
  nodeEnv: process.env.NODE_ENV || 'development',
};
