import { db } from '../db.js';
import { ActivityLogger } from './activityLogger.js';

// Helper to parse date + time string into a Date object
export function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return new Date();
  const trimmed = timeStr.trim();
  
  let hours = 0;
  let minutes = 0;

  // If time string contains "to", extract the start time part (e.g. "12:00 PM" from "12:00 PM to 01:00 PM")
  let startPart = trimmed;
  if (/\s+to\s+/i.test(trimmed)) {
    startPart = trimmed.split(/\s+to\s+/i)[0].trim();
  }

  // Handle simple digit start like "12" or "1" (legacy "12 to 1")
  if (/^\d{1,2}$/.test(startPart)) {
    let startH = parseInt(startPart, 10);
    if (startH >= 1 && startH <= 11) {
      startH += 12; // PM hours
    } else if (startH === 12) {
      startH = 12; // 12 PM (noon)
    }
    hours = startH;
    minutes = 0;
  } else if (startPart.includes(' ')) {
    // 12-hour format e.g. "12:00 PM" or "07:30 PM" or "12:00 AM"
    const [time, meridian] = startPart.split(/\s+/);
    const [hoursStr, minutesStr] = time.split(':');
    hours = parseInt(hoursStr || '0', 10);
    minutes = parseInt(minutesStr || '0', 10);
    const med = (meridian || '').toUpperCase();
    if (med === 'PM' && hours < 12) {
      hours += 12;
    } else if (med === 'AM' && hours === 12) {
      hours = 0;
    }
  } else {
    // 24-hour format e.g. "18:00" or "07:30"
    const [hoursStr, minutesStr] = startPart.split(':');
    hours = parseInt(hoursStr || '0', 10);
    minutes = parseInt(minutesStr || '0', 10);
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

// Format a Date object to "hh:mm A" string
export function formatTimeSlot(dateObj) {
  let hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const meridian = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)} ${meridian}`;
}

// Helper to normalize phone numbers for consistent comparison and search
export function normalizePhoneNumber(phone) {
  if (!phone) return '';
  const digits = phone.toString().trim().replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

// Format time string part e.g. "08:00 PM" -> "8 PM", "08:30 PM" -> "8:30 PM"
export function formatTimePart(timeStr) {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  const m = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m) {
    const hours = parseInt(m[1], 10);
    const mins = m[2] || '00';
    const ampm = m[3].toUpperCase();
    if (mins === '00') {
      return `${hours} ${ampm}`;
    }
    return `${hours}:${mins} ${ampm}`;
  }
  return trimmed;
}

// Format booking slot message e.g. "Booked Between 8 PM and 10 PM" or "Booked Between 8 PM and 9 PM"
export function formatBookedBetween(bookingTime, resDateTime, resEnd) {
  if (!bookingTime) return 'Booked';
  const trimmed = bookingTime.trim();
  if (/\s+to\s+/i.test(trimmed)) {
    const parts = trimmed.split(/\s+to\s+/i);
    const start = formatTimePart(parts[0]);
    const end = formatTimePart(parts[1]);
    return `Booked Between ${start} and ${end}`;
  }
  if (resDateTime && resEnd) {
    return `Booked Between ${formatTimePart(formatTimeSlot(resDateTime))} and ${formatTimePart(formatTimeSlot(resEnd))}`;
  }
  return `Booked at ${formatTimePart(trimmed)}`;
}

export const BookingService = {
  // 1. Get allowable booking dates (Today up to Next 7 Days)
  getAllowedDates() {
    const dates = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const iso = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${dayName}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      dates.push({ date: iso, label, isToday: i === 0 });
    }
    return dates;
  },

  // 2. Generate 1-hour time slots with PM/AM (12:00 PM to 01:00 PM ... 11:00 PM to 12:00 AM)
  getTimeSlots(selectedDate, purpose = 'NEW_BOOKING') {
    const rawSlots = [
      { slot: '12:00 PM to 01:00 PM', startHour: 12 },
      { slot: '01:00 PM to 02:00 PM', startHour: 13 },
      { slot: '02:00 PM to 03:00 PM', startHour: 14 },
      { slot: '03:00 PM to 04:00 PM', startHour: 15 },
      { slot: '04:00 PM to 05:00 PM', startHour: 16 },
      { slot: '05:00 PM to 06:00 PM', startHour: 17 },
      { slot: '06:00 PM to 07:00 PM', startHour: 18 },
      { slot: '07:00 PM to 08:00 PM', startHour: 19 },
      { slot: '08:00 PM to 09:00 PM', startHour: 20 },
      { slot: '09:00 PM to 10:00 PM', startHour: 21 },
      { slot: '10:00 PM to 11:00 PM', startHour: 22 },
      { slot: '11:00 PM to 12:00 AM', startHour: 23 }
    ];

    const now = new Date();
    const minHoursAdvance = purpose === 'CHANGE_BOOKING' ? 1 : 4; // 4h for new booking, 1h for change

    return rawSlots.map(({ slot, startHour }) => {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const slotDateTime = new Date(year, month - 1, day, startHour, 0, 0, 0);
      const diffHours = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Must be at least minHoursAdvance in advance
      const isAvailable = diffHours >= minHoursAdvance;
      let reason = null;

      if (!isAvailable) {
        if (diffHours < 0) {
          reason = 'Time slot has passed';
        } else {
          reason = purpose === 'CHANGE_BOOKING'
            ? 'Must change at least 1 hour in advance'
            : 'Must book at least 4 hours in advance';
        }
      }

      return {
        time: slot,
        isAvailable,
        reason,
        diffHours: parseFloat(diffHours.toFixed(1))
      };
    });
  },

  // 3. Clean up expired temporary table holds
  pruneExpiredHolds() {
    try {
      db.prepare(`
        DELETE FROM temporary_holds
        WHERE expires_at < CURRENT_TIMESTAMP
      `).run();
    } catch (e) {
      console.warn('Prune holds notice:', e.message);
    }
  },

  // 4. Get all 12 tables with availability states for selected date & 1-hour slot
  getTableAvailability(date, time) {
    this.pruneExpiredHolds();

    const selectedDateTime = parseDateTime(date, time);
    const oneHourLater = new Date(selectedDateTime.getTime() + 1 * 60 * 60 * 1000);
    const bookedUntilStr = formatTimeSlot(oneHourLater);

    // Fetch all 12 tables
    const tables = db.prepare(`
      SELECT id, table_number, capacity, is_active
      FROM tables
      ORDER BY table_number ASC
    `).all();

    // Fetch confirmed/seated reservations for this date
    const reservations = db.prepare(`
      SELECT r.id, r.table_id, r.booking_time, r.booking_code, r.customer_name, r.status
      FROM reservations r
      WHERE r.booking_date = ?
        AND r.status IN ('CONFIRMED', 'SEATED')
        AND r.table_id IS NOT NULL
    `).all(date);

    // Fetch active unexpired holds for this date
    const holds = db.prepare(`
      SELECT h.id, h.table_id, h.booking_time, h.hold_token, h.expires_at, h.customer_name
      FROM temporary_holds h
      WHERE h.booking_date = ?
        AND h.expires_at > CURRENT_TIMESTAMP
        AND h.payment_status != 'CANCELLED'
    `).all(date);

    return tables.map((t) => {
      // Check if table has a conflicting confirmed reservation for this 1-hour slot
      let isBooked = false;
      let bookedInfo = null;

      for (const res of reservations) {
        if (res.table_id === t.id) {
          const resDateTime = parseDateTime(date, res.booking_time);
          let resEnd;
          if (/\s+to\s+/i.test(res.booking_time)) {
            const endPart = res.booking_time.split(/\s+to\s+/i)[1].trim();
            resEnd = parseDateTime(date, endPart);
          } else {
            resEnd = new Date(resDateTime.getTime() + 1 * 60 * 60 * 1000);
          }

          // If selected 1-hour slot overlaps with booked slot
          if (
            (selectedDateTime >= resDateTime && selectedDateTime < resEnd) ||
            (resDateTime >= selectedDateTime && resDateTime < oneHourLater)
          ) {
            isBooked = true;
            const bookedMessage = formatBookedBetween(res.booking_time, resDateTime, resEnd);
            bookedInfo = {
              bookedSlot: res.booking_time,
              bookedUntil: formatTimeSlot(resEnd),
              bookingCode: res.booking_code,
              reason: bookedMessage
            };
            break;
          }
        }
      }

      // Check if table is currently held by someone during checkout
      let isHeld = false;
      let holdInfo = null;

      if (!isBooked) {
        for (const hold of holds) {
          if (hold.table_id === t.id) {
            const holdDateTime = parseDateTime(date, hold.booking_time);
            let holdEnd;
            if (/\s+to\s+/i.test(hold.booking_time)) {
              const endPart = hold.booking_time.split(/\s+to\s+/i)[1].trim();
              holdEnd = parseDateTime(date, endPart);
            } else {
              holdEnd = new Date(holdDateTime.getTime() + 1 * 60 * 60 * 1000);
            }

            if (
              (selectedDateTime >= holdDateTime && selectedDateTime < holdEnd) ||
              (holdDateTime >= selectedDateTime && holdDateTime < oneHourLater)
            ) {
              isHeld = true;
              const holdMessage = formatBookedBetween(hold.booking_time, holdDateTime, holdEnd);
              holdInfo = {
                bookedSlot: hold.booking_time,
                bookedUntil: 'Held in checkout',
                reason: `${holdMessage} (In Checkout)`
              };
              break;
            }
          }
        }
      }

      const isAvailable = !isBooked && !isHeld;

      return {
        id: t.id,
        tableNumber: t.table_number,
        capacity: t.capacity,
        isAvailable,
        isBooked,
        isHeld,
        bookedSlot: isBooked ? bookedInfo.bookedSlot : isHeld ? holdInfo.bookedSlot : null,
        bookedUntil: isBooked ? bookedInfo.bookedUntil : isHeld ? 'In Checkout' : null,
        statusText: isBooked
          ? bookedInfo.reason
          : isHeld
          ? holdInfo.reason
          : 'Available for Booking'
      };
    });
  },

  // 5. Create atomic temporary table hold (5 minutes expiration)
  createTemporaryHold({
    tableNumber,
    bookingDate,
    bookingTime,
    customerName,
    customerPhone,
    guestsCount = 2,
    purpose = 'NEW_BOOKING',
    originalBookingId = null
  }) {
    this.pruneExpiredHolds();

    const tableNum = parseInt(tableNumber, 10);
    const table = db.prepare('SELECT id, table_number FROM tables WHERE table_number = ?').get(tableNum);
    if (!table) {
      throw new Error(`Table #${tableNumber} does not exist.`);
    }

    const now = new Date();
    const slotDateTime = parseDateTime(bookingDate, bookingTime);
    const diffHours = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (purpose === 'NEW_BOOKING') {
      if (diffHours < 4) {
        throw new Error('New bookings must be made at least 4 hours in advance.');
      }
    } else if (purpose === 'CHANGE_BOOKING') {
      if (diffHours < 1) {
        throw new Error('Slot changes must be made at least 1 hour before the new selected slot.');
      }
    }

    // Determine fee amount
    let feeAmount = 100.00; // default for new booking (₹100)

    if (purpose === 'CHANGE_BOOKING') {
      if (!originalBookingId) {
        throw new Error('Original booking ID is required for a slot/table change.');
      }
      const orig = db.prepare('SELECT * FROM reservations WHERE id = ?').get(originalBookingId);
      if (!orig) {
        throw new Error('Original booking not found.');
      }

      const origDateTime = parseDateTime(orig.booking_date, orig.booking_time);
      const remainingHours = (origDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (remainingHours <= 4) {
        throw new Error('Booking changes are not permitted within 4 hours of your reserved slot.');
      } else if (remainingHours >= 24) {
        feeAmount = 0.00; // Free change
      } else {
        feeAmount = 50.00; // ₹50 change penalty fee
      }
    }

    // Atomic availability check
    const availability = this.getTableAvailability(bookingDate, bookingTime);
    const targetTable = availability.find((t) => t.tableNumber === tableNum);

    if (!targetTable || !targetTable.isAvailable) {
      throw new Error(`Table #${tableNum} is no longer available for ${bookingTime} on ${bookingDate}. Please select another table.`);
    }

    // Clean up any existing hold by this phone for this slot
    const cleanPhone = customerPhone.trim().replace(/[\s+-]/g, '');
    db.prepare(`
      DELETE FROM temporary_holds
      WHERE customer_phone = ? AND booking_date = ? AND booking_time = ?
    `).run(cleanPhone, bookingDate, bookingTime);

    // Create 5-minute hold
    const holdToken = `HOLD_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO temporary_holds (
        hold_token, table_id, booking_date, booking_time,
        customer_name, customer_phone, guests_count,
        fee_amount, payment_status, purpose, original_booking_id,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
    `).run(
      holdToken,
      table.id,
      bookingDate,
      bookingTime,
      customerName ? customerName.trim() : 'Guest',
      cleanPhone,
      parseInt(guestsCount, 10) || 2,
      feeAmount,
      purpose,
      originalBookingId,
      expiresAt
    );

    let devOtp = null;
    if (feeAmount === 0) {
      db.prepare(`
        UPDATE temporary_holds SET payment_status = 'PAID', payment_id = 'WAIVED_FREE' WHERE hold_token = ?
      `).run(holdToken);

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      db.prepare(`
        INSERT INTO otp_verifications (
          phone, otp_code, purpose, reference_id, attempts_left, is_verified, expires_at
        ) VALUES (?, ?, ?, ?, 4, 0, ?)
      `).run(
        cleanPhone,
        otpCode,
        purpose,
        holdToken,
        expiresAt
      );
      devOtp = otpCode;
    }

    return {
      holdToken,
      tableNumber: table.table_number,
      bookingDate,
      bookingTime,
      feeAmount,
      expiresAt,
      purpose,
      devOtp
    };
  },

  // Resend OTP for a hold (free change or paid booking)
  resendHoldOtp(holdToken) {
    this.pruneExpiredHolds();

    const hold = db.prepare('SELECT * FROM temporary_holds WHERE hold_token = ?').get(holdToken);
    if (!hold) {
      throw new Error('Table hold session expired or invalid. Please select your table again.');
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Invalidate prior OTPs for this reference
    db.prepare(`
      UPDATE otp_verifications SET is_verified = 1
      WHERE reference_id = ?
    `).run(holdToken);

    db.prepare(`
      INSERT INTO otp_verifications (
        phone, otp_code, purpose, reference_id, attempts_left, is_verified, expires_at
      ) VALUES (?, ?, ?, ?, 4, 0, ?)
    `).run(
      hold.customer_phone,
      otpCode,
      hold.purpose,
      holdToken,
      expiresAt
    );

    return {
      success: true,
      holdToken,
      customerPhone: hold.customer_phone,
      devOtp: otpCode,
      message: 'New OTP sent to your registered mobile number.'
    };
  },

  // 6. Verify Payment & issue OTP
  verifyHoldPayment({ holdToken, paymentMethod = 'UPI', transactionRef = null }) {
    this.pruneExpiredHolds();

    const hold = db.prepare('SELECT * FROM temporary_holds WHERE hold_token = ?').get(holdToken);
    if (!hold) {
      throw new Error('Table hold session expired or invalid. Please select your table again.');
    }

    const paymentId = transactionRef || `TXN_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    db.prepare(`
      UPDATE temporary_holds
      SET payment_status = 'PAID', payment_id = ?
      WHERE id = ?
    `).run(paymentId, hold.id);

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Invalidate prior OTPs for this reference
    db.prepare(`
      UPDATE otp_verifications SET is_verified = 1
      WHERE reference_id = ?
    `).run(holdToken);

    db.prepare(`
      INSERT INTO otp_verifications (
        phone, otp_code, purpose, reference_id, attempts_left, is_verified, expires_at
      ) VALUES (?, ?, ?, ?, 4, 0, ?)
    `).run(
      hold.customer_phone,
      otpCode,
      hold.purpose,
      holdToken,
      expiresAt
    );

    return {
      success: true,
      paymentId,
      holdToken,
      customerPhone: hold.customer_phone,
      feeAmount: hold.fee_amount,
      message: 'Payment verified successfully. OTP sent to your registered mobile number.',
      // devOtp exposed for instant sandbox testing
      devOtp: otpCode
    };
  },

  // 7. Verify OTP and Confirm Booking / Atomic Table Swap
  verifyOtpAndConfirm({ holdToken, otpCode, io = null }) {
    this.pruneExpiredHolds();

    const hold = db.prepare(`
      SELECT h.*, t.table_number
      FROM temporary_holds h
      JOIN tables t ON h.table_id = t.id
      WHERE h.hold_token = ?
    `).get(holdToken);

    if (!hold) {
      throw new Error('Hold session has expired. Please select a table again.');
    }

    if (hold.fee_amount > 0 && hold.payment_status !== 'PAID') {
      throw new Error('Payment has not been completed for this reservation.');
    }

    // Verify OTP
    const otpRow = db.prepare(`
      SELECT * FROM otp_verifications
      WHERE reference_id = ? AND is_verified = 0
      ORDER BY id DESC LIMIT 1
    `).get(holdToken);

    if (!otpRow) {
      throw new Error('No active OTP request found. Please request a new OTP.');
    }

    if (new Date(otpRow.expires_at) < new Date()) {
      throw new Error('OTP has expired. Please request a new OTP.');
    }

    if (otpRow.attempts_left <= 0) {
      throw new Error('Too many incorrect OTP attempts. Hold cancelled for security.');
    }

    if (otpRow.otp_code !== otpCode.trim()) {
      const remaining = otpRow.attempts_left - 1;
      db.prepare('UPDATE otp_verifications SET attempts_left = ? WHERE id = ?').run(remaining, otpRow.id);
      throw new Error(`Incorrect verification code. ${remaining} attempt(s) remaining.`);
    }

    // Mark OTP as verified
    db.prepare('UPDATE otp_verifications SET is_verified = 1 WHERE id = ?').run(otpRow.id);

    if (hold.purpose === 'NEW_BOOKING') {
      // Generate booking reference code e.g. KK-B4821
      const bookingCode = `KK-B${Math.floor(1000 + Math.random() * 9000)}`;

      const stmt = db.prepare(`
        INSERT INTO reservations (
          booking_code, customer_name, customer_phone,
          booking_date, booking_time, guests_count,
          seating_preference, table_id, status,
          payment_status, payment_amount, payment_transaction_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'Indoor Dining', ?, 'CONFIRMED', 'PAID', ?, ?, CURRENT_TIMESTAMP)
      `);

      const result = stmt.run(
        bookingCode,
        hold.customer_name,
        hold.customer_phone,
        hold.booking_date,
        hold.booking_time,
        hold.guests_count,
        hold.table_id,
        hold.fee_amount,
        hold.payment_id || `PAY_${Date.now()}`
      );

      // Release hold
      db.prepare('DELETE FROM temporary_holds WHERE id = ?').run(hold.id);

      const confirmedBooking = db.prepare(`
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
        WHERE r.id = ?
      `).get(result.lastInsertRowid);

      // Broadcast and log
      if (io) {
        io.to('manager:room').emit('booking:new', confirmedBooking);
        io.emit('booking:created', confirmedBooking);
      }

      ActivityLogger.logActivity(
        {
          category: 'BOOKING',
          action: 'BOOKING_CREATED',
          title: `Reservation Confirmed: Table #${confirmedBooking.table_number}`,
          description: `Booked by ${confirmedBooking.customer_name} for ${confirmedBooking.guests_count} guests on ${confirmedBooking.booking_date} at ${confirmedBooking.booking_time}. Guarantee Fee: ₹${confirmedBooking.payment_amount}.`,
          tableNumber: confirmedBooking.table_number,
          actorName: confirmedBooking.customer_name,
          actorRole: 'CUSTOMER',
          severity: 'SUCCESS',
          metadata: {
            bookingCode: confirmedBooking.booking_code,
            paymentId: confirmedBooking.payment_transaction_id
          }
        },
        io
      );

      return {
        success: true,
        message: 'Table reservation successfully confirmed!',
        booking: confirmedBooking
      };
    } else if (hold.purpose === 'CHANGE_BOOKING') {
      // Atomic table swap: update existing reservation
      const original = db.prepare(`
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
        WHERE r.id = ?
      `).get(hold.original_booking_id);

      if (!original) {
        throw new Error('Original booking record not found.');
      }

      const changeNote = `Switched from Table #${original.table_number} (${original.booking_date} ${original.booking_time}) to Table #${hold.table_number} (${hold.booking_date} ${hold.booking_time}) on ${new Date().toLocaleString()}. Fee: ₹${hold.fee_amount}.`;

      db.prepare(`
        UPDATE reservations
        SET table_id = ?,
            booking_date = ?,
            booking_time = ?,
            guests_count = ?,
            status = 'CONFIRMED',
            change_history = COALESCE(change_history || ' | ', '') || ?
        WHERE id = ?
      `).run(
        hold.table_id,
        hold.booking_date,
        hold.booking_time,
        hold.guests_count,
        changeNote,
        original.id
      );

      // Release hold
      db.prepare('DELETE FROM temporary_holds WHERE id = ?').run(hold.id);

      const updatedBooking = db.prepare(`
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
        WHERE r.id = ?
      `).get(original.id);

      if (io) {
        io.to('manager:room').emit('booking:updated', updatedBooking);
        io.emit('booking:status_changed', updatedBooking);
      }

      ActivityLogger.logActivity(
        {
          category: 'BOOKING',
          action: 'BOOKING_CHANGED',
          title: `Reservation Updated: Table #${updatedBooking.table_number}`,
          description: `Guest ${updatedBooking.customer_name} changed slot to ${updatedBooking.booking_date} at ${updatedBooking.booking_time} (Table #${updatedBooking.table_number}). Fee: ₹${hold.fee_amount}.`,
          tableNumber: updatedBooking.table_number,
          actorName: updatedBooking.customer_name,
          actorRole: 'CUSTOMER',
          severity: 'INFO',
          metadata: {
            bookingCode: updatedBooking.booking_code,
            oldTable: original.table_number,
            newTable: updatedBooking.table_number
          }
        },
        io
      );

      return {
        success: true,
        message: 'Booking slot & table updated successfully!',
        booking: updatedBooking
      };
    }
  },

  // 8. Release temporary hold if guest cancels checkout
  releaseHold(holdToken) {
    try {
      db.prepare('DELETE FROM temporary_holds WHERE hold_token = ?').run(holdToken);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // 9. Manage Bookings: Request OTP (Strict rule: ONLY if booking exists)
  requestManageOtp(phone) {
    const rawDigits = phone ? phone.toString().trim().replace(/\D/g, '') : '';
    if (!rawDigits || rawDigits.length < 7) {
      throw new Error('Please enter a valid mobile number.');
    }
    const normPhone = normalizePhoneNumber(phone);

    const existing = db.prepare(`
      SELECT id, customer_name, customer_phone, booking_date, booking_time, status
      FROM reservations
      WHERE (
        REPLACE(REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '+', ''), '-', ''), '(', '') LIKE ?
        OR REPLACE(REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '+', ''), '-', ''), '(', '') LIKE ?
      )
      ORDER BY booking_date DESC, booking_time DESC
    `).all(`%${normPhone}%`, `%${rawDigits}%`);

    if (!existing || existing.length === 0) {
      const err = new Error('No booking found for this mobile number.');
      err.statusCode = 404;
      err.code = 'NO_BOOKING_FOUND';
      throw err;
    }

    // Booking found -> generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Clear old unverified manage OTPs for this number
    db.prepare(`
      UPDATE otp_verifications SET is_verified = 1
      WHERE (phone = ? OR phone = ? OR phone = ?) AND purpose = 'MANAGE_BOOKING'
    `).run(normPhone, rawDigits, phone.toString().trim());

    db.prepare(`
      INSERT INTO otp_verifications (
        phone, otp_code, purpose, reference_id, attempts_left, is_verified, expires_at
      ) VALUES (?, ?, 'MANAGE_BOOKING', ?, 4, 0, ?)
    `).run(normPhone, otpCode, `MANAGE_${normPhone}`, expiresAt);

    return {
      success: true,
      message: 'OTP sent to your registered mobile number.',
      bookingCount: existing.length,
      devOtp: otpCode
    };
  },

  // 10. Manage Bookings: Get bookings with rules and cancellation refund tracking for a phone
  getCustomerBookings(phone) {
    const rawDigits = phone ? phone.toString().trim().replace(/\D/g, '') : '';
    const normPhone = normalizePhoneNumber(phone);
    const now = new Date();
    const rows = db.prepare(`
      SELECT r.*, t.table_number,
             cr.id AS cancellation_id,
             cr.status AS cancellation_refund_status,
             cr.refund_percentage AS cr_refund_percentage,
             cr.refund_amount AS cr_refund_amount,
             cr.customer_upi_id AS cr_customer_upi_id,
             cr.reason AS cr_reason,
             cr.cancellation_date AS cr_cancellation_date,
             cr.refund_transaction_id AS cr_refund_transaction_id,
             cr.gateway_response AS cr_gateway_response,
             cr.remaining_hours AS cr_remaining_hours,
             cr.processed_at AS cr_processed_at
      FROM reservations r
      LEFT JOIN tables t ON r.table_id = t.id
      LEFT JOIN cancellation_requests cr ON r.id = cr.reservation_id
      WHERE (
        REPLACE(REPLACE(REPLACE(REPLACE(r.customer_phone, ' ', ''), '+', ''), '-', ''), '(', '') LIKE ?
        OR REPLACE(REPLACE(REPLACE(REPLACE(r.customer_phone, ' ', ''), '+', ''), '-', ''), '(', '') LIKE ?
      )
      ORDER BY r.booking_date DESC, r.booking_time DESC
    `).all(`%${normPhone}%`, `%${rawDigits}%`);

    const bookingsWithRules = rows.map((bk) => {
      const slotDateTime = parseDateTime(bk.booking_date, bk.booking_time);
      const remainingHours = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      let canChange = false;
      let changeFee = null;
      let policyMessage = '';

      if (bk.status !== 'CONFIRMED') {
        canChange = false;
        policyMessage = `Booking is ${bk.status}. No changes permitted.`;
      } else if (remainingHours <= 4) {
        canChange = false;
        policyMessage = 'Booking changes locked (less than 4 hours remaining).';
      } else if (remainingHours >= 24) {
        canChange = true;
        changeFee = 0.00;
        policyMessage = 'Free slot and table changes available (24+ hours remaining).';
      } else {
        canChange = true;
        changeFee = 50.00;
        policyMessage = 'Slot/table change allowed with ₹50 change fee (4 to 24 hours remaining).';
      }

      // Cancellation refund preview (for active bookings)
      const origPaid = bk.payment_amount && bk.payment_amount > 0 ? bk.payment_amount : 100.00;
      const cancellationPreview = this.calculateCancellationRefund(bk.booking_date, bk.booking_time, origPaid);

      // Existing cancellation details (if already cancelled)
      let cancellationDetails = null;
      if (bk.cancellation_id) {
        let parsedGateway = null;
        try {
          if (bk.cr_gateway_response) parsedGateway = JSON.parse(bk.cr_gateway_response);
        } catch (e) {}

        cancellationDetails = {
          id: bk.cancellation_id,
          status: bk.cancellation_refund_status,
          refundPercentage: bk.cr_refund_percentage,
          refundAmount: bk.cr_refund_amount,
          customerUpiId: bk.cr_customer_upi_id,
          reason: bk.cr_reason,
          cancellationDate: bk.cr_cancellation_date,
          refundTransactionId: bk.cr_refund_transaction_id,
          remainingHours: bk.cr_remaining_hours,
          processedAt: bk.cr_processed_at,
          gatewayResponse: parsedGateway
        };
      }

      return {
        ...bk,
        remainingHours: parseFloat(remainingHours.toFixed(1)),
        canChange,
        changeFee,
        policyMessage,
        cancellationPreview,
        cancellationDetails
      };
    });

    return {
      success: true,
      bookings: bookingsWithRules
    };
  },

  // 11. Manage Bookings: Verify OTP & Return Bookings with Change Rules
  verifyManageOtp(phone, otpCode) {
    const rawDigits = phone ? phone.toString().trim().replace(/\D/g, '') : '';
    const normPhone = normalizePhoneNumber(phone);

    const otpRow = db.prepare(`
      SELECT * FROM otp_verifications
      WHERE (phone = ? OR phone = ? OR phone = ?) AND purpose = 'MANAGE_BOOKING' AND is_verified = 0
      ORDER BY id DESC LIMIT 1
    `).get(normPhone, rawDigits, phone.toString().trim());

    if (!otpRow) {
      throw new Error('No active OTP found. Please request a new OTP.');
    }

    if (new Date(otpRow.expires_at) < new Date()) {
      throw new Error('OTP has expired. Please request a new OTP.');
    }

    if (otpRow.attempts_left <= 0) {
      throw new Error('Too many incorrect attempts. Please request a new OTP.');
    }

    if (otpRow.otp_code !== otpCode.trim()) {
      const remaining = otpRow.attempts_left - 1;
      db.prepare('UPDATE otp_verifications SET attempts_left = ? WHERE id = ?').run(remaining, otpRow.id);
      throw new Error(`Incorrect verification code. ${remaining} attempt(s) remaining.`);
    }

    // Mark verified
    db.prepare('UPDATE otp_verifications SET is_verified = 1 WHERE id = ?').run(otpRow.id);

    return this.getCustomerBookings(normPhone || rawDigits || phone);
  },

  // 12. Calculate refund based on time remaining until booked slot
  // Exact boundaries:
  // - More than 24 hours: 90% refund
  // - More than 4 hours and up to 24 hours: 50% refund
  // - 4 hours or less: 0% refund
  calculateCancellationRefund(bookingDate, bookingTime, originalAmount = 100.00) {
    const slotDateTime = parseDateTime(bookingDate, bookingTime);
    const now = new Date();
    const diffHours = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    let refundPercentage = 0;
    let tierLabel = '';

    if (diffHours > 24) {
      refundPercentage = 90;
      tierLabel = 'More than 24 hours remaining (90% refund)';
    } else if (diffHours > 4) {
      refundPercentage = 50;
      tierLabel = 'Between 4 and 24 hours remaining (50% refund)';
    } else {
      refundPercentage = 0;
      tierLabel = '4 hours or less remaining (0% refund)';
    }

    const amt = parseFloat(Number(originalAmount || 100.00).toFixed(2));
    const refundAmount = parseFloat(((amt * refundPercentage) / 100).toFixed(2));

    return {
      remainingHours: parseFloat(diffHours.toFixed(1)),
      originalAmount: amt,
      refundPercentage,
      refundAmount,
      tierLabel,
      isMoreThan24h: diffHours > 24,
      isBetween4and24h: diffHours > 4 && diffHours <= 24,
      is4hOrLess: diffHours <= 4
    };
  },

  // 13. Customer requests cancellation & refund
  requestBookingCancellation({ reservationId, customerPhone, customerUpiId, reason = '' }, io = null) {
    if (!reservationId) {
      throw new Error('Reservation ID is required.');
    }
    const cleanUpi = (customerUpiId || '').trim();
    if (!cleanUpi || !cleanUpi.includes('@') || cleanUpi.length < 5) {
      throw new Error('Please enter a valid UPI ID (e.g. mobile@upi or username@bank).');
    }

    const res = db.prepare(`
      SELECT r.*, t.table_number
      FROM reservations r
      LEFT JOIN tables t ON r.table_id = t.id
      WHERE r.id = ?
    `).get(reservationId);

    if (!res) {
      throw new Error('Booking not found.');
    }

    if (customerPhone) {
      const cleanReqPhone = customerPhone.replace(/[\s+-]/g, '');
      const cleanResPhone = res.customer_phone.replace(/[\s+-]/g, '');
      if (!cleanResPhone.includes(cleanReqPhone) && !cleanReqPhone.includes(cleanResPhone)) {
        throw new Error('Customer phone number does not match this booking.');
      }
    }

    if (res.status === 'CANCELLED') {
      throw new Error('This booking is already cancelled.');
    }

    const existingReq = db.prepare('SELECT * FROM cancellation_requests WHERE reservation_id = ?').get(res.id);
    if (existingReq) {
      throw new Error('A cancellation request is already registered for this booking.');
    }

    const origAmount = res.payment_amount && res.payment_amount > 0 ? res.payment_amount : 100.00;
    const refundCalc = this.calculateCancellationRefund(res.booking_date, res.booking_time, origAmount);

    // Cancel original booking immediately -> releases table slot so another customer can book it!
    db.prepare(`
      UPDATE reservations
      SET status = 'CANCELLED'
      WHERE id = ?
    `).run(res.id);

    const nowIso = new Date().toISOString();

    // === AUTOMATIC REFUND FLOW ===
    // Refund goes back to the original payment source automatically (no manager approval needed).
    // Status progression: directly -> APPROVED -> PROCESSING -> COMPLETED
    const refundTxId = `REF_AUTO_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const gatewayPayload = JSON.stringify({
      gateway: 'AUTO_REFUND_TO_ORIGINAL_SOURCE',
      transactionId: refundTxId,
      amount: refundCalc.refundAmount,
      currency: 'INR',
      destinationUpi: cleanUpi,
      originalPaymentTxId: res.payment_transaction_id || null,
      refundMethod: 'ORIGINAL_PAYMENT_SOURCE',
      status: 'SUCCESS',
      disbursedAt: new Date().toISOString(),
      message: refundCalc.refundAmount > 0
        ? `₹${refundCalc.refundAmount} automatically refunded to original payment source (${cleanUpi})`
        : 'Cancellation recorded. ₹0 refunded as cancellation was within 4 hours.'
    });

    const insertStmt = db.prepare(`
      INSERT INTO cancellation_requests (
        reservation_id, booking_code, customer_name, customer_phone,
        table_number, booking_date, booking_time, cancellation_date,
        remaining_hours, original_amount, refund_percentage, refund_amount,
        customer_upi_id, reason, status, refund_transaction_id, gateway_response,
        processed_at, processed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, 'AUTO_SYSTEM', ?)
    `);

    const result = insertStmt.run(
      res.id,
      res.booking_code,
      res.customer_name,
      res.customer_phone,
      res.table_number,
      res.booking_date,
      res.booking_time,
      nowIso,
      refundCalc.remainingHours,
      refundCalc.originalAmount,
      refundCalc.refundPercentage,
      refundCalc.refundAmount,
      cleanUpi,
      reason ? reason.trim() : null,
      refundTxId,
      gatewayPayload,
      nowIso,
      nowIso
    );

    const cancellationRequest = db.prepare('SELECT * FROM cancellation_requests WHERE id = ?').get(result.lastInsertRowid);

    // Log Activity
    try {
      ActivityLogger.logActivity(
        {
          category: 'BOOKING',
          action: 'BOOKING_CANCELLED',
          title: `Booking Cancelled & Auto-Refunded (${res.booking_code})`,
          description: `${res.customer_name} cancelled Table #${res.table_number}. ₹${refundCalc.refundAmount} (${refundCalc.refundPercentage}%) automatically refunded to original payment source (${cleanUpi}). Tx: ${refundTxId}. Reason: ${reason ? reason.trim() : 'None'}.`,
          tableNumber: res.table_number,
          actorName: res.customer_name,
          actorRole: 'CUSTOMER',
          severity: 'WARNING',
          metadata: {
            reservationId: res.id,
            cancellationRequestId: cancellationRequest.id,
            refundAmount: refundCalc.refundAmount,
            refundPercentage: refundCalc.refundPercentage,
            customerUpiId: cleanUpi,
            refundTxId,
            remainingHours: refundCalc.remainingHours,
            autoRefund: true
          }
        },
        io
      );
    } catch (e) {
      console.warn('ActivityLogger notice:', e.message);
    }

    if (io) {
      io.to('manager:room').emit('cancellation:new', cancellationRequest);
      io.emit('cancellation:new', cancellationRequest);
      io.emit('cancellation:updated', cancellationRequest);
      io.emit('booking:cancelled', { reservationId: res.id, bookingCode: res.booking_code, tableNumber: res.table_number });
      io.emit('booking:status_changed', { id: res.id, status: 'CANCELLED' });
      io.emit('table:status_changed', { tableId: res.table_id, tableNumber: res.table_number });
    }

    return {
      success: true,
      message: refundCalc.refundAmount > 0
        ? `Booking cancelled. ₹${refundCalc.refundAmount} has been automatically refunded to your original payment source.`
        : 'Booking cancelled. No refund applicable (cancellation within 4 hours of booking slot).',
      cancellationRequest
    };
  },

  // 14. Manager: Get all cancellation & refund requests
  getCancellationRequests() {
    const requests = db.prepare(`
      SELECT c.*, r.guests_count, r.customer_email
      FROM cancellation_requests c
      LEFT JOIN reservations r ON c.reservation_id = r.id
      ORDER BY c.cancellation_date DESC, c.id DESC
    `).all();

    return {
      success: true,
      requests
    };
  },

  // 15. Manager: Approve or Reject Refund (No manual amount editing)
  async processRefundDecision(cancellationId, { decision, managerName = 'Manager' }, io = null) {
    if (!cancellationId) throw new Error('Cancellation Request ID is required.');
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw new Error('Decision must be either APPROVE or REJECT.');
    }

    const req = db.prepare('SELECT * FROM cancellation_requests WHERE id = ?').get(cancellationId);
    if (!req) {
      throw new Error('Cancellation request not found.');
    }

    if (req.status !== 'PENDING') {
      throw new Error(`This refund request has already been processed (Status: ${req.status}).`);
    }

    const nowIso = new Date().toISOString();

    if (decision === 'REJECT') {
      const responsePayload = JSON.stringify({
        status: 'REJECTED',
        reason: 'Declined by manager',
        decidedBy: managerName,
        decidedAt: nowIso
      });

      db.prepare(`
        UPDATE cancellation_requests
        SET status = 'REJECTED',
            processed_at = ?,
            processed_by = ?,
            gateway_response = ?
        WHERE id = ?
      `).run(nowIso, managerName, responsePayload, cancellationId);

      const updated = db.prepare('SELECT * FROM cancellation_requests WHERE id = ?').get(cancellationId);

      try {
        ActivityLogger.logActivity(
          {
            category: 'BOOKING',
            action: 'REFUND_REJECTED',
            title: `Refund Declined (${req.booking_code})`,
            description: `${managerName} rejected refund request for booking ${req.booking_code}.`,
            tableNumber: req.table_number,
            actorName: managerName,
            actorRole: 'MANAGER',
            severity: 'WARNING',
            metadata: { cancellationId, bookingCode: req.booking_code, refundAmount: req.refund_amount }
          },
          io
        );
      } catch (e) {
        console.warn('ActivityLogger notice:', e.message);
      }

      if (io) {
        io.emit('cancellation:updated', updated);
        io.to('manager:room').emit('cancellation:updated', updated);
      }

      return {
        success: true,
        status: 'REJECTED',
        message: 'Refund request was rejected.',
        cancellationRequest: updated
      };
    }

    // decision === 'APPROVE'
    // Automatic Payment Gateway Flow:
    // Status progression: PENDING -> APPROVED -> PROCESSING -> COMPLETED (or FAILED)
    
    // Step A: Mark APPROVED
    db.prepare(`
      UPDATE cancellation_requests
      SET status = 'APPROVED',
          processed_at = ?,
          processed_by = ?
      WHERE id = ?
    `).run(nowIso, managerName, cancellationId);

    if (io) {
      io.emit('cancellation:updated', db.prepare('SELECT * FROM cancellation_requests WHERE id = ?').get(cancellationId));
    }

    // Step B: Mark PROCESSING (dispatched to payment gateway)
    db.prepare(`
      UPDATE cancellation_requests
      SET status = 'PROCESSING'
      WHERE id = ?
    `).run(cancellationId);

    if (io) {
      io.emit('cancellation:updated', db.prepare('SELECT * FROM cancellation_requests WHERE id = ?').get(cancellationId));
    }

    // Step C: Integrated Gateway Simulation
    // Deduct approved refund amount and disburse to customer UPI ID
    const refundTxId = `REF_UPI_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const gatewaySuccess = true; // integrated gateway success
    const finalStatus = gatewaySuccess ? 'COMPLETED' : 'FAILED';

    const gatewayPayload = JSON.stringify({
      gateway: 'UPI_DIRECT_SETTLEMENT',
      transactionId: refundTxId,
      amount: req.refund_amount,
      currency: 'INR',
      destinationUpi: req.customer_upi_id,
      status: gatewaySuccess ? 'SUCCESS' : 'FAILED',
      disbursedAt: new Date().toISOString(),
      message: req.refund_amount > 0
        ? `₹${req.refund_amount} successfully credited to UPI ID ${req.customer_upi_id}`
        : 'Cancellation recorded. ₹0 refunded as cancellation was within 4 hours.'
    });

    db.prepare(`
      UPDATE cancellation_requests
      SET status = ?,
          refund_transaction_id = ?,
          gateway_response = ?,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalStatus, refundTxId, gatewayPayload, cancellationId);

    const finalRecord = db.prepare('SELECT * FROM cancellation_requests WHERE id = ?').get(cancellationId);

    try {
      ActivityLogger.logActivity(
        {
          category: 'BOOKING',
          action: 'REFUND_COMPLETED',
          title: `Refund Disbursed (${req.booking_code})`,
          description: `₹${req.refund_amount} (${req.refund_percentage}%) sent to ${req.customer_upi_id} via UPI. Gateway Tx: ${refundTxId}. Approved by ${managerName}.`,
          tableNumber: req.table_number,
          actorName: managerName,
          actorRole: 'MANAGER',
          severity: 'SUCCESS',
          metadata: {
            cancellationId,
            bookingCode: req.booking_code,
            refundAmount: req.refund_amount,
            refundPercentage: req.refund_percentage,
            refundTxId,
            customerUpiId: req.customer_upi_id
          }
        },
        io
      );
    } catch (e) {
      console.warn('ActivityLogger notice:', e.message);
    }

    if (io) {
      io.emit('cancellation:updated', finalRecord);
      io.to('manager:room').emit('cancellation:updated', finalRecord);
    }

    return {
      success: true,
      status: finalStatus,
      message: `Refund of ₹${req.refund_amount} approved and sent to ${req.customer_upi_id}.`,
      cancellationRequest: finalRecord
    };
  }
};
