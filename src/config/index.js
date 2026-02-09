require('dotenv').config();

// On Vercel, VERCEL_URL is set automatically (e.g. myapp.vercel.app)
const defaultCors = process.env.VERCEL_URL
  ? [`https://${process.env.VERCEL_URL}`, `https://www.${process.env.VERCEL_URL}`]
  : ['http://localhost:3000'];

module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) || defaultCors,
  nodeEnv: process.env.NODE_ENV || 'development',
};
