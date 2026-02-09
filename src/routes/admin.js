const express = require('express');
const { prisma } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { hashPassword } = require('../utils/auth');
const { notifyBookingApproved, notifyBookingRejected, notifyBookingCancelled } = require('../services/notificationService');

const router = express.Router();

// All admin routes require ADMIN role
router.use(authenticate, authorize('ADMIN'));

/**
 * GET /api/admin/staff
 * List all staff
 */
router.get('/staff', async (req, res, next) => {
  try {
    const staff = await prisma.user.findMany({
      where: { role: 'STAFF' },
      select: {
        id: true,
        name: true,
        state: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(staff);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/staff
 * Add new staff (name + state only; mobile auto-generated for login)
 */
router.post('/staff', async (req, res, next) => {
  try {
    const { name, state } = req.body;

    if (!name || !state) {
      return res.status(400).json({ error: 'Name and state are required' });
    }

    const hashedPassword = await hashPassword('password123');
    const mobile = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const staff = await prisma.user.create({
      data: {
        name,
        state,
        mobile,
        password: hashedPassword,
        role: 'STAFF',
      },
      select: {
        id: true,
        name: true,
        state: true,
        mobile: true,
      },
    });

    res.status(201).json(staff);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/staff/:id
 * Edit staff
 */
router.put('/staff/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, state } = req.body;

    const staff = await prisma.user.findFirst({
      where: { id, role: 'STAFF' },
    });

    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { name, state },
      select: {
        id: true,
        name: true,
        state: true,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/staff/:id
 */
router.delete('/staff/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const staff = await prisma.user.findFirst({
      where: { id, role: 'STAFF' },
    });

    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/availability
 * Set staff availability for a date
 */
const DEFAULT_SLOTS = [
  '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
  '17:00', '18:00', '19:00', '20:00', '21:00',
];

router.post('/availability', async (req, res, next) => {
  try {
    const { staffId, date, slots } = req.body;

    if (!staffId || !date) {
      return res.status(400).json({ error: 'staffId and date are required' });
    }

    const staff = await prisma.user.findFirst({
      where: { id: staffId, role: 'STAFF' },
    });

    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const dateObj = new Date(date + 'T12:00:00.000Z');

    const slotsToSave = Array.isArray(slots) ? slots : DEFAULT_SLOTS;

    const availability = await prisma.staffAvailability.upsert({
      where: {
        staffId_date: { staffId, date: dateObj },
      },
      create: {
        staffId,
        date: dateObj,
        slots: slotsToSave,
      },
      update: {
        slots: slotsToSave,
      },
      include: { staff: { select: { name: true } } },
    });

    res.json(availability);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/availability
 * Get availability (optionally by staffId, date range)
 */
router.get('/availability', async (req, res, next) => {
  try {
    const { staffId, startDate, endDate } = req.query;

    const where = {};
    if (staffId) where.staffId = staffId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate) where.date.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const availability = await prisma.staffAvailability.findMany({
      where,
      include: { staff: { select: { id: true, name: true, state: true } } },
      orderBy: { date: 'asc' },
    });

    res.json(availability);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/bookings
 * View all booking requests
 */
router.get('/bookings', async (req, res, next) => {
  try {
    const { status, startDate, endDate } = req.query;

    const where = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate) where.date.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, mobile: true } },
        staff: { select: { id: true, name: true, state: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
    });

    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/bookings/:id/approve
 * Approve booking and assign staff
 */
router.patch('/bookings/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { staffId, slotTime } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { client: true, staff: true },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'PENDING') {
      return res.status(400).json({ error: 'Booking is not pending' });
    }

    const assignStaffId = staffId || booking.staffId;
    const bookingSlotTime = slotTime || booking.slotTime;

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'APPROVED',
        staffId: assignStaffId,
        slotTime: bookingSlotTime,
      },
      include: {
        client: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
    });

    const staff = await prisma.user.findUnique({
      where: { id: assignStaffId },
      select: { name: true },
    });

    await notifyBookingApproved(
      booking.clientId,
      id,
      staff?.name || updated.staff.name,
      booking.date
    );

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/bookings/:id/reject
 */
router.patch('/bookings/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'PENDING') {
      return res.status(400).json({ error: 'Booking is not pending' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'REJECTED' },
      include: {
        client: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
    });

    await notifyBookingRejected(booking.clientId, id, booking.date);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/bookings/:id
 * Update booking (staff, slotTime, duration)
 */
router.patch('/bookings/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { staffId, slotTime, duration } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { staff: true, client: true },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!['PENDING', 'APPROVED'].includes(booking.status)) {
      return res.status(400).json({ error: 'Cannot edit a rejected booking' });
    }

    const data = {};
    if (staffId) data.staffId = staffId;
    if (slotTime) data.slotTime = slotTime;
    if (duration && [60, 90, 120].includes(Number(duration))) data.duration = Number(duration);

    const updated = await prisma.booking.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true, mobile: true } },
        staff: { select: { id: true, name: true, state: true } },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/bookings/:id/cancel
 * Cancel a booking (works for PENDING or APPROVED)
 */
router.patch('/bookings/:id/cancel', async (req, res, next) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status === 'REJECTED') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'REJECTED' },
      include: {
        client: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
    });

    await notifyBookingCancelled(booking.clientId, id, booking.date);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
