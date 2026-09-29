import express from 'express';
import { db } from '../db.js';
import { ActivityLogger } from '../services/activityLogger.js';
import { BookingService } from '../services/bookingService.js';

export default function createBookingRouter(io) {
  const router = express.Router();

  // 1. Get 7-Day allowable booking window
  router.get('/dates', (req, res) => {
    try {
      const dates = BookingService.getAllowedDates();
      res.json(dates);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get booking time slots for a date (with 4h advance rule)
  router.get('/slots', (req, res) => {
    try {
      const { date, purpose = 'NEW_BOOKING' } = req.query;
      if (!date) {
        return res.status(400).json({ error: 'Date is required.' });
      }
      const slots = BookingService.getTimeSlots(date, purpose);
      res.json(slots);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get all 12 tables availability for date + time (Green available / Grey booked-until)
  router.get('/availability', (req, res) => {
    try {
      const { date, time } = req.query;
      if (!date || !time) {
        return res.status(400).json({ error: 'Date and Time are required.' });
      }
      const tables = BookingService.getTableAvailability(date, time);
      res.json(tables);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Create temporary table hold (5 minutes hold during checkout)
  router.post('/hold', (req, res) => {
    try {
      const hold = BookingService.createTemporaryHold(req.body);
      res.status(201).json(hold);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Release temporary hold
  router.post('/release-hold', (req, res) => {
    try {
      const { holdToken } = req.body;
      const result = BookingService.releaseHold(holdToken);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5b. Resend temporary hold OTP
  router.post('/resend-hold-otp', (req, res) => {
    try {
      const { holdToken } = req.body;
      if (!holdToken) {
        return res.status(400).json({ error: 'holdToken is required.' });
      }
      const result = BookingService.resendHoldOtp(holdToken);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 6. Verify Payment (₹100 or ₹50 penalty) & send OTP
  router.post('/verify-payment', (req, res) => {
    try {
      const result = BookingService.verifyHoldPayment(req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 7. Verify OTP and Confirm Booking / Atomic Table Swap
  router.post('/verify-otp-and-confirm', (req, res) => {
    try {
      const { holdToken, otpCode } = req.body;
      if (!holdToken || !otpCode) {
        return res.status(400).json({ error: 'holdToken and otpCode are required.' });
      }
      const result = BookingService.verifyOtpAndConfirm({ holdToken, otpCode, io });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 8. Manage Bookings: Request OTP (Strict rule: ONLY if booking exists)
  router.post('/manage/request-otp', (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ error: 'Mobile number is required.' });
      }
      const result = BookingService.requestManageOtp(phone);
      res.json(result);
    } catch (err) {
      res.status(err.statusCode || 400).json({ error: err.message, code: err.code || 'REQUEST_FAILED' });
    }
  });

  // 9. Manage Bookings: Verify OTP and fetch bookings with change rules
  router.post('/manage/verify-otp', (req, res) => {
    try {
      const { phone, otpCode } = req.body;
      if (!phone || !otpCode) {
        return res.status(400).json({ error: 'Phone and OTP code are required.' });
      }
      const result = BookingService.verifyManageOtp(phone, otpCode);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 9b. Manage Bookings: Fetch bookings for phone without needing unverified OTP
  router.get('/manage/bookings/:phone', (req, res) => {
    try {
      const { phone } = req.params;
      const result = BookingService.getCustomerBookings(phone);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 10. Direct booking endpoint (legacy fallback or manager-initiated reservations)
  router.post('/', (req, res) => {
    try {
      const {
        customerName,
        customerPhone,
        customerEmail,
        bookingDate,
        bookingTime,
        guestsCount = 2,
        seatingPreference = 'Indoor Dining',
        specialRequests = ''
      } = req.body;

      if (!customerName || !customerPhone || !bookingDate || !bookingTime) {
        return res.status(400).json({
          error: 'Name, phone number, date, and time are required for booking.'
        });
      }

      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const bookingCode = `KK-B${randomSuffix}`;

      let tableId = null;
      if (req.body.tableId) {
        tableId = req.body.tableId;
      } else if (req.body.tableNumber) {
        const t = db.prepare('SELECT id FROM tables WHERE table_number = ?').get(parseInt(req.body.tableNumber, 10));
        if (t) tableId = t.id;
      }

      if (!tableId) {
        const candidateTables = db.prepare(`
          SELECT t.id, t.table_number
          FROM tables t
          WHERE t.is_active = 1 AND t.capacity >= ?
          ORDER BY t.capacity ASC
        `).all(guestsCount);

        if (candidateTables.length > 0) {
          const assignedTableIds = db.prepare(`
            SELECT table_id FROM reservations
            WHERE booking_date = ?
              AND booking_time = ?
              AND status IN ('CONFIRMED', 'SEATED')
              AND table_id IS NOT NULL
          `).all(bookingDate, bookingTime).map(r => r.table_id);

          const freeTable = candidateTables.find(t => !assignedTableIds.includes(t.id));
          if (freeTable) {
            tableId = freeTable.id;
          }
        }
      }

      const stmt = db.prepare(`
        INSERT INTO reservations (
          booking_code, customer_name, customer_phone, customer_email,
          booking_date, booking_time, guests_count, seating_preference,
          special_requests, table_id, status, payment_status, payment_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'PAID', 100.00, CURRENT_TIMESTAMP)
      `);

      const result = stmt.run(
        bookingCode,
        customerName.trim(),
        customerPhone.trim(),
        customerEmail ? customerEmail.trim() : null,
        bookingDate,
        bookingTime,
        parseInt(guestsCount, 10),
        seatingPreference,
        specialRequests ? specialRequests.trim() : '',
        tableId
      );

      const newBooking = db.prepare(`
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
        WHERE r.id = ?
      `).get(result.lastInsertRowid);

      if (io) {
        io.to('manager:room').emit('booking:new', newBooking);
        io.emit('booking:created', newBooking);
      }

      ActivityLogger.logActivity(
        {
          category: 'BOOKING',
          action: 'BOOKING_CREATED',
          title: `New Reservation: ${newBooking.customer_name}`,
          description: `Booked for ${newBooking.guests_count} guests on ${newBooking.booking_date} at ${newBooking.booking_time} (Code: ${newBooking.booking_code}).`,
          tableNumber: newBooking.table_number || null,
          actorName: newBooking.customer_name,
          actorRole: 'CUSTOMER',
          severity: 'INFO',
          metadata: {
            bookingCode: newBooking.booking_code,
            guestsCount: newBooking.guests_count,
            bookingDate: newBooking.booking_date,
            bookingTime: newBooking.booking_time
          }
        },
        io
      );

      res.status(201).json({
        success: true,
        message: 'Reservation confirmed successfully!',
        booking: newBooking
      });
    } catch (err) {
      console.error('Error creating booking:', err);
      res.status(500).json({ error: err.message || 'Failed to create reservation' });
    }
  });

  // Lookup reservation by booking code or phone number
  router.get('/lookup', (req, res) => {
    try {
      const { code, phone } = req.query;

      if (!code && !phone) {
        return res.status(400).json({ error: 'Please provide booking code or phone number' });
      }

      let bookings = [];
      if (code) {
        const row = db.prepare(`
          SELECT r.*, t.table_number
          FROM reservations r
          LEFT JOIN tables t ON r.table_id = t.id
          WHERE UPPER(r.booking_code) = UPPER(?)
        `).get(code.trim());
        if (row) bookings.push(row);
      } else if (phone) {
        bookings = db.prepare(`
          SELECT r.*, t.table_number
          FROM reservations r
          LEFT JOIN tables t ON r.table_id = t.id
          WHERE r.customer_phone LIKE ?
          ORDER BY r.booking_date DESC, r.created_at DESC
        `).all(`%${phone.trim()}%`);
      }

      res.json(bookings);
    } catch (err) {
      console.error('Error looking up booking:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get all reservations (with optional date filter)
  router.get('/', (req, res) => {
    try {
      const { date } = req.query;
      let query = `
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
      `;
      const params = [];

      if (date) {
        query += ` WHERE r.booking_date = ?`;
        params.push(date);
      }

      query += ` ORDER BY r.booking_date ASC, r.booking_time ASC`;

      const list = db.prepare(query).all(...params);
      res.json(list);
    } catch (err) {
      console.error('Error fetching reservations:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Update reservation status (e.g. SEATED, CANCELLED, COMPLETED, CONFIRMED)
  router.patch('/:id/status', (req, res) => {
    try {
      const { id } = req.params;
      const { status, tableId } = req.body;

      const validStatuses = ['CONFIRMED', 'CANCELLED', 'SEATED', 'COMPLETED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      if (tableId !== undefined) {
        db.prepare('UPDATE reservations SET status = ?, table_id = ? WHERE id = ?').run(status, tableId, id);
      } else {
        db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, id);
      }

      const updated = db.prepare(`
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
        WHERE r.id = ?
      `).get(id);

      if (io) {
        io.to('manager:room').emit('booking:updated', updated);
        io.emit('booking:status_changed', updated);
      }

      ActivityLogger.logActivity(
        {
          category: 'BOOKING',
          action: `BOOKING_${status}`,
          title: `Reservation #${updated.booking_code} ${status}`,
          description: `Booking for ${updated.customer_name} marked as ${status}${updated.table_number ? ` (Table #${updated.table_number})` : ''}.`,
          tableNumber: updated.table_number || null,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: status === 'CANCELLED' ? 'WARNING' : 'INFO',
          metadata: { bookingCode: updated.booking_code, status }
        },
        io
      );

      res.json(updated);
    } catch (err) {
      console.error('Error updating booking status:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Cancel reservation
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const target = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
      db.prepare("UPDATE reservations SET status = 'CANCELLED' WHERE id = ?").run(id);

      const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
      if (io) {
        io.to('manager:room').emit('booking:updated', updated);
        io.emit('booking:status_changed', updated);
      }

      ActivityLogger.logActivity(
        {
          category: 'BOOKING',
          action: 'BOOKING_CANCELLED',
          title: `Reservation #${target?.booking_code || id} Cancelled`,
          description: `Booking for ${target?.customer_name || 'Guest'} was cancelled.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'WARNING',
          metadata: { bookingId: id }
        },
        io
      );

      res.json({ success: true, message: 'Reservation cancelled successfully.' });
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Customer: Cancel booking and request refund
  router.post('/cancel', (req, res) => {
    try {
      const result = BookingService.requestBookingCancellation(req.body, io);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Manager: Get all cancellation & refund requests
  router.get('/cancellations', (req, res) => {
    try {
      const result = BookingService.getCancellationRequests();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manager: Process refund decision (APPROVE / REJECT)
  router.post('/cancellations/:id/decision', async (req, res) => {
    try {
      const result = await BookingService.processRefundDecision(req.params.id, req.body, io);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Preview cancellation refund calculation
  router.get('/cancel-preview/:id', (req, res) => {
    try {
      const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }
      const amount = reservation.payment_amount && reservation.payment_amount > 0 ? reservation.payment_amount : 100.00;
      const preview = BookingService.calculateCancellationRefund(reservation.booking_date, reservation.booking_time, amount);
      res.json({ success: true, preview });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
