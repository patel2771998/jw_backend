const express = require('express');
const { prisma } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('STAFF'));

/**
 * GET /api/staff/bookings
 * View assigned bookings
 */
router.get('/bookings', async (req, res, next) => {
  try {
    const { status, startDate, endDate } = req.query;

    const where = { staffId: req.user.id };
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, mobile: true } },
      },
      orderBy: [{ date: 'asc' }, { slotTime: 'asc' }],
    });

    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/staff/schedule
 * View schedule (availability + bookings)
 */
router.get('/schedule', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(start);
    end.setDate(end.getDate() + 14);

    const [availability, bookings] = await Promise.all([
      prisma.staffAvailability.findMany({
        where: {
          staffId: req.user.id,
          date: { gte: start, lte: end },
        },
        orderBy: { date: 'asc' },
      }),
      prisma.booking.findMany({
        where: {
          staffId: req.user.id,
          status: 'APPROVED',
          date: { gte: start, lte: end },
        },
        include: {
          client: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { slotTime: 'asc' }],
      }),
    ]);

    res.json({ availability, bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/staff/profile
 * Get staff profile
 */
router.get('/profile', (req, res) => {
  res.json(req.user);
});

module.exports = router;
