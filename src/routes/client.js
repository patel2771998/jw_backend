const express = require('express');
const { prisma } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyAdminNewBooking } = require('../services/notificationService');

const router = express.Router();

/**
 * GET /api/client/staff-available
 * View available staff by date (slots 11am-9:30pm)
 */
router.get('/staff-available', authenticate, async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const dateObj = new Date(date + 'T12:00:00.000Z');

    const availability = await prisma.staffAvailability.findMany({
      where: {
        date: dateObj,
        slots: { isEmpty: false },
      },
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            state: true,
          },
        },
      },
    });

    // Get already booked slots for this date (APPROVED = disabled)
    const bookings = await prisma.booking.findMany({
      where: {
        date: dateObj,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    const INTERVAL = 15;
    const generate15MinSlots = () => {
      const list = [];
      for (let h = 11; h <= 20; h++) {
        for (let m = 0; m < 60; m += INTERVAL) {
          if (h === 20 && m > 45) break;
          list.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
      }
      return list;
    };

    const timeToMinutes = (t) => {
      const [h, m] = (t || '').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const isInStaffSlots = (time, hourlySlots) => {
      const [h] = time.split(':').map(Number);
      const hourSlot = `${String(h).padStart(2, '0')}:00`;
      return hourlySlots.includes(hourSlot);
    };

    const overlaps = (startMin, endMin, bookedRanges) => {
      return bookedRanges.some((r) => startMin < r.end && endMin > r.start);
    };

    const staffBookedRanges = (staffId) => {
      return bookings
        .filter((b) => b.staffId === staffId)
        .map((b) => {
          const start = timeToMinutes(b.slotTime);
          return { start, end: start + (b.duration || 60) };
        });
    };

    const ALL_15MIN = generate15MinSlots();

    const result = availability.map((av) => {
      const slots = av.slots || [];
      const ranges = staffBookedRanges(av.staffId);
      const availableSlots = slots.filter((s) => {
        const start = timeToMinutes(s);
        const end = start + 60;
        return !overlaps(start, end, ranges);
      });

      const timeSlots = ALL_15MIN.map((time) => {
        const startMin = timeToMinutes(time);
        const inSlots = isInStaffSlots(time, slots);
        const busy = inSlots && overlaps(startMin, startMin + 60, ranges);
        const available = inSlots && !busy;
        return { time, available, busy };
      });

      return {
        staff: av.staff,
        availableSlots,
        allSlots: slots,
        timeSlots,
        bookedRanges: ranges,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/client/bookings
 * Submit booking request
 */
function timeToMinutes(t) {
  const [h, m] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function overlaps(startMin, endMin, ranges) {
  return ranges.some((r) => startMin < r.end && endMin > r.start);
}

router.post('/bookings', authenticate, authorize('CLIENT'), async (req, res, next) => {
  try {
    const { staffId, date, slotTime, duration, message } = req.body;
    const clientId = req.user.id;

    if (!staffId || !date || !slotTime) {
      return res.status(400).json({ error: 'staffId, date, and slotTime are required' });
    }

    const validDuration = [60, 90, 120].includes(Number(duration)) ? Number(duration) : 60;

    const dateObj = new Date(date + 'T12:00:00.000Z');

    // Verify staff availability
    const availability = await prisma.staffAvailability.findFirst({
      where: {
        staffId,
        date: dateObj,
      },
    });

    if (!availability) {
      return res.status(400).json({ error: 'Staff not available on this date' });
    }

    const validSlots = availability.slots || [];
    const [h, m] = slotTime.split(':').map(Number);
    if ([0, 15, 30, 45].indexOf(m) === -1) {
      return res.status(400).json({ error: 'Time must be in 15-min intervals (e.g. 11:00, 11:15, 12:30)' });
    }
    const hourSlot = `${String(h).padStart(2, '0')}:00`;
    if (!validSlots.includes(hourSlot)) {
      return res.status(400).json({ error: 'Invalid time slot' });
    }

    const newStart = timeToMinutes(slotTime);
    const newEnd = newStart + validDuration;
    const existingRanges = (await prisma.booking.findMany({
      where: {
        staffId,
        date: dateObj,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    })).map((b) => ({
      start: timeToMinutes(b.slotTime),
      end: timeToMinutes(b.slotTime) + (b.duration || 60),
    }));

    if (overlaps(newStart, newEnd, existingRanges)) {
      return res.status(409).json({ error: 'This time slot overlaps with an existing booking' });
    }

    const booking = await prisma.booking.create({
      data: {
        clientId,
        staffId,
        date: dateObj,
        slotTime,
        duration: validDuration,
        message: message || null,
      },
      include: {
        staff: { select: { id: true, name: true, state: true } },
      },
    });

    await notifyAdminNewBooking(
      req.user.name || 'Client',
      dateObj,
      slotTime,
      booking.id
    );

    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/client/bookings
 * View client's booking requests
 */
router.get('/bookings', authenticate, authorize('CLIENT'), async (req, res, next) => {
  try {
    const { status } = req.query;

    const where = { clientId: req.user.id };
    if (status) where.status = status;

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, state: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
    });

    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
