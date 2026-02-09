const { prisma } = require('../config/database');
// const nodemailer = require('nodemailer'); // Optional email

/**
 * Create and optionally send notification
 */
const createNotification = async ({ userId, message, type = 'INFO', bookingId = null }) => {
  const notification = await prisma.notification.create({
    data: {
      userId,
      message,
      type,
      bookingId,
    },
  });

  // Optional: Send email notification
  // await sendEmailNotification(userId, message);

  return notification;
};

/**
 * Notification triggers for booking status changes
 */
const notifyBookingApproved = async (clientId, bookingId, staffName, date) => {
  return createNotification({
    userId: clientId,
    message: `Your booking with ${staffName} on ${new Date(date).toLocaleDateString()} has been approved!`,
    type: 'SUCCESS',
    bookingId,
  });
};

const notifyBookingRejected = async (clientId, bookingId, date) => {
  return createNotification({
    userId: clientId,
    message: `Your booking request for ${new Date(date).toLocaleDateString()} has been rejected.`,
    type: 'ERROR',
    bookingId,
  });
};

const notifyBookingCancelled = async (clientId, bookingId, date) => {
  return createNotification({
    userId: clientId,
    message: `Your booking for ${new Date(date).toLocaleDateString()} has been cancelled.`,
    type: 'ERROR',
    bookingId,
  });
};

const formatTimeAMPM = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const hour = h || 0;
  const min = m || 0;
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${String(min).padStart(2, '0')} ${period}`;
};

const notifyAdminNewBooking = async (clientName, date, slotTime, bookingId) => {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  });
  const dateStr = new Date(date).toLocaleDateString();
  const timeStr = formatTimeAMPM(slotTime);
  const message = `New booking request from ${clientName} for ${dateStr} at ${timeStr}`;
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        message,
        type: 'INFO',
        bookingId,
      })
    )
  );
};

module.exports = {
  createNotification,
  notifyBookingApproved,
  notifyBookingRejected,
  notifyBookingCancelled,
  notifyAdminNewBooking,
};
