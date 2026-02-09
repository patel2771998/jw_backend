const express = require('express');
const { prisma } = require('../config/database');
const { hashPassword, comparePassword, generateToken } = require('../utils/auth');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register new user (Admin, Staff, or Client)
 */
router.post('/register', async (req, res, next) => {
  try {
    const { name, mobile, password, role } = req.body;

    if (!name || !mobile || !password || !role) {
      return res.status(400).json({ error: 'Name, mobile, password, and role are required' });
    }

    const validRoles = ['ADMIN', 'STAFF', 'CLIENT'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (existing) {
      return res.status(409).json({ error: 'Mobile number already registered' });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        name: true,
        mobile: true,
        role: true,
        state: true,
      },
    });

    const token = generateToken(user.id);

    res.status(201).json({
      user,
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res, next) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({ error: 'Mobile number and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { mobile } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        state: user.state,
      },
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Get current user (protected)
 */
router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

module.exports = router;
