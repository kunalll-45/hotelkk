import { db } from '../db.js';
import { ActivityLogger } from './activityLogger.js';
import { parseDateTime } from './bookingService.js';

export const TableService = {
  getAllTables() {
    const today = new Date().toISOString().split('T')[0];

    const tables = db.prepare(`
      SELECT t.id, t.table_number, t.capacity, t.is_active,
             ta.waiter_id as assigned_waiter_id,
             s.name as assigned_waiter_name
      FROM tables t
      LEFT JOIN table_assignments ta ON t.id = ta.table_id AND ta.date = ?
      LEFT JOIN staff s ON ta.waiter_id = s.id
      ORDER BY t.table_number ASC
    `).all(today);

    // Attach active session and today's reservation details for each table
    return tables.map((table) => {
      const activeSession = db.prepare(`
        SELECT id, session_code, customer_name, waiter_id, status, subtotal,
               discount_type, discount_value, final_total, opened_at
        FROM table_sessions
        WHERE table_id = ? AND status = 'ACTIVE'
        ORDER BY id DESC LIMIT 1
      `).get(table.id);

      let pendingOrdersCount = 0;
      let confirmedOrdersCount = 0;
      let servedOrdersCount = 0;
      let callingWaiter = false;
      let activeOrders = [];

      if (activeSession) {
        activeOrders = db.prepare(`
          SELECT id, placed_by_name, waiter_id, status, total_amount, created_at, confirmed_at, served_at
          FROM orders
          WHERE session_id = ?
          ORDER BY id ASC
        `).all(activeSession.id);

        for (const ord of activeOrders) {
          if (ord.status === 'PENDING') pendingOrdersCount++;
          if (ord.status === 'CONFIRMED') confirmedOrdersCount++;
          if (ord.status === 'SERVED') servedOrdersCount++;

          ord.items = db.prepare(`
            SELECT id, menu_item_id, item_name, unit_price, quantity, subtotal, is_manual, added_by
            FROM order_items
            WHERE order_id = ?
          `).all(ord.id);
        }

        const activeServiceReq = db.prepare(`
          SELECT id, status, requested_at
          FROM service_requests
          WHERE session_id = ? AND status = 'PENDING'
          ORDER BY id DESC LIMIT 1
        `).get(activeSession.id);

        if (activeServiceReq) {
          callingWaiter = true;
        }
      }

      // Check if table has a reservation today
      const todayReservation = db.prepare(`
        SELECT r.id, r.booking_code, r.customer_name, r.customer_phone, r.booking_time, r.guests_count, r.status
        FROM reservations r
        WHERE r.table_id = ? AND r.booking_date = ? AND r.status IN ('CONFIRMED', 'SEATED')
        ORDER BY r.booking_time ASC LIMIT 1
      `).get(table.id, today);

      // Determine Table Status Pill
      let computedStatus = 'VACANT'; // Green
      if (callingWaiter) {
        computedStatus = 'CALLING_WAITER'; // Red / Pulsing Gold
      } else if (pendingOrdersCount > 0) {
        computedStatus = 'PENDING_ORDER'; // Amber
      } else if (activeSession && activeOrders.length > 0) {
        computedStatus = 'OCCUPIED'; // Blue / Active
      } else if (todayReservation && todayReservation.status === 'CONFIRMED') {
        computedStatus = 'RESERVED'; // Amber / Awaiting customer arrival
      } else if (activeSession) {
        computedStatus = 'OCCUPIED';
      }

      return {
        ...table,
        computedStatus,
        todayReservation: todayReservation || null,
        activeSession: activeSession
          ? {
              ...activeSession,
              pendingOrdersCount,
              confirmedOrdersCount,
              servedOrdersCount,
              callingWaiter,
              orders: activeOrders
            }
          : null
      };
    });
  },

  getTableById(tableId) {
    const today = new Date().toISOString().split('T')[0];

    const table = db.prepare(`
      SELECT t.id, t.table_number, t.capacity, t.is_active,
             ta.waiter_id as assigned_waiter_id,
             s.name as assigned_waiter_name
      FROM tables t
      LEFT JOIN table_assignments ta ON t.id = ta.table_id AND ta.date = ?
      LEFT JOIN staff s ON ta.waiter_id = s.id
      WHERE t.id = ? OR t.table_number = ?
    `).get(today, tableId, tableId);

    if (!table) {
      throw new Error(`Table ${tableId} not found.`);
    }

    const activeSession = db.prepare(`
      SELECT id, session_code, customer_name, waiter_id, status, subtotal,
             discount_type, discount_value, final_total, opened_at
      FROM table_sessions
      WHERE table_id = ? AND status = 'ACTIVE'
      ORDER BY id DESC LIMIT 1
    `).get(table.id);

    let activeOrders = [];
    let callingWaiter = false;

    if (activeSession) {
      activeOrders = db.prepare(`
        SELECT id, placed_by_name, waiter_id, status, total_amount, created_at, confirmed_at, served_at
        FROM orders
        WHERE session_id = ?
        ORDER BY id ASC
      `).all(activeSession.id);

      for (const ord of activeOrders) {
        ord.items = db.prepare(`
          SELECT id, menu_item_id, item_name, unit_price, quantity, subtotal, is_manual, added_by
          FROM order_items
          WHERE order_id = ?
        `).all(ord.id);
      }

      const activeServiceReq = db.prepare(`
        SELECT id, status, requested_at
        FROM service_requests
        WHERE session_id = ? AND status = 'PENDING'
        ORDER BY id DESC LIMIT 1
      `).get(activeSession.id);

      if (activeServiceReq) {
        callingWaiter = true;
      }
    }

    return {
      ...table,
      activeSession: activeSession
        ? {
            ...activeSession,
            callingWaiter,
            orders: activeOrders
          }
        : null
    };
  },

  getTableActivationStatus(tableNumber) {
    const today = new Date().toISOString().split('T')[0];
    const table = this.getTableById(tableNumber);

    // Check existing active session
    const activeSession = db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM orders o WHERE o.session_id = s.id) as orders_count
      FROM table_sessions s
      WHERE s.table_id = ? AND s.status = 'ACTIVE'
      ORDER BY s.id DESC LIMIT 1
    `).get(table.id);

    // Check if table has a reservation for today
    const reservation = db.prepare(`
      SELECT r.*, t.table_number
      FROM reservations r
      LEFT JOIN tables t ON r.table_id = t.id
      WHERE r.table_id = ? AND r.booking_date = ? AND r.status IN ('CONFIRMED', 'SEATED')
      ORDER BY r.booking_time ASC LIMIT 1
    `).get(table.id, today);

    const isReserved = !!reservation;
    // Considered already activated if marked SEATED or if orders already placed in session
    const isActivated = !!(activeSession && (activeSession.orders_count > 0 || reservation?.status === 'SEATED'));

    return {
      tableNumber: table.table_number,
      tableId: table.id,
      capacity: table.capacity,
      isReserved,
      isActivated,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            sessionCode: activeSession.session_code,
            customerName: activeSession.customer_name,
            ordersCount: activeSession.orders_count
          }
        : null,
      reservation: reservation
        ? {
            id: reservation.id,
            bookingCode: reservation.booking_code,
            customerName: reservation.customer_name,
            customerPhoneLast4: reservation.customer_phone ? reservation.customer_phone.slice(-4) : '',
            bookingDate: reservation.booking_date,
            bookingTime: reservation.booking_time,
            guestsCount: reservation.guests_count,
            status: reservation.status
          }
        : null
    };
  },

  // Request OTP for Table QR Activation after strict 4-point backend validation
  requestTableActivationOtp(tableNumber, { customerPhone }) {
    const today = new Date().toISOString().split('T')[0];
    const table = this.getTableById(tableNumber);
    const phone = customerPhone ? customerPhone.trim().replace(/[\s+-]/g, '') : null;

    if (!phone) {
      const err = new Error('Please enter your Registered Mobile Number.');
      err.statusCode = 400;
      throw err;
    }

    // 1. Validate restaurant is currently open
    const settings = this.getRestaurantSettings();
    if (!settings.is_open) {
      const err = new Error(`K K's Food House is currently CLOSED (${settings.opening_time || '12:00 PM'} - ${settings.closing_time || '12:00 AM'}). Table QR activation is not available.`);
      err.code = 'RESTAURANT_CLOSED';
      err.statusCode = 403;
      throw err;
    }

    // 2. Validate table exists and is active
    if (!table || !table.is_active) {
      const err = new Error(`Table #${tableNumber} is invalid or inactive.`);
      err.code = 'INVALID_TABLE';
      err.statusCode = 404;
      throw err;
    }

    // 3. Validate table has NO active session (Table must be free)
    const activeSession = db.prepare(`
      SELECT * FROM table_sessions
      WHERE table_id = ? AND status = 'ACTIVE'
      ORDER BY id DESC LIMIT 1
    `).get(table.id);

    if (activeSession) {
      const err = new Error(`Table #${table.table_number} currently has an active dining session. Please contact staff or verify your table number.`);
      err.code = 'TABLE_ALREADY_OCCUPIED';
      err.details = `Table #${table.table_number} is currently occupied by another dining party.`;
      err.statusCode = 409;
      throw err;
    }

    // 4. Check customer reservation today
    const reservationsToday = db.prepare(`
      SELECT r.*, t.table_number
      FROM reservations r
      LEFT JOIN tables t ON r.table_id = t.id
      WHERE REPLACE(REPLACE(REPLACE(r.customer_phone, ' ', ''), '+', ''), '-', '') LIKE ?
        AND r.booking_date = ?
        AND r.status IN ('CONFIRMED', 'SEATED')
      ORDER BY r.booking_time ASC
    `).all(`%${phone}%`, today);

    if (!reservationsToday || reservationsToday.length === 0) {
      const err = new Error('The table is not yours');
      err.code = 'NOT_YOUR_TABLE';
      err.details = `No confirmed reservation found for mobile number ${customerPhone} today at K K's Food House.`;
      err.statusCode = 403;
      throw err;
    }

    // Check if reservation matches THIS specific table
    const matchingForThisTable = reservationsToday.find(
      (r) => r.table_id === table.id || r.table_number === table.table_number
    );

    if (!matchingForThisTable) {
      // Reserved for another table!
      const otherReservation = reservationsToday[0];
      const targetTableNumber = otherReservation.table_number || otherReservation.table_id;
      const err = new Error('The table is not yours');
      err.code = 'NOT_YOUR_TABLE';
      err.details = `Your reservation (${otherReservation.booking_code}) is for Table #${targetTableNumber}, not Table #${table.table_number}. Please proceed to Table #${targetTableNumber}.`;
      err.correctTableNumber = targetTableNumber;
      err.statusCode = 403;
      throw err;
    }

    // 3. Check time slot window
    // Parse booking time
    try {
      const slotDate = parseDateTime(today, matchingForThisTable.booking_time);
      const diffMinutes = (Date.now() - slotDate.getTime()) / (1000 * 60);

      // Allow activation starting 60 minutes before slot up to 3 hours after slot
      if (diffMinutes < -60) {
        const err = new Error('The table is not yours');
        err.code = 'SLOT_NOT_ACTIVE';
        err.details = `Your booking is scheduled for ${matchingForThisTable.booking_time}. Table activation opens 1 hour prior to your booking.`;
        err.statusCode = 403;
        throw err;
      }
    } catch (e) {
      if (e.statusCode) throw e;
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const refId = `QR_${table.table_number}_${phone}`;

    db.prepare(`
      UPDATE otp_verifications SET is_verified = 1
      WHERE reference_id = ? AND purpose = 'TABLE_ACTIVATION'
    `).run(refId);

    db.prepare(`
      INSERT INTO otp_verifications (
        phone, otp_code, purpose, reference_id, attempts_left, is_verified, expires_at
      ) VALUES (?, ?, 'TABLE_ACTIVATION', ?, 4, 0, ?)
    `).run(phone, otpCode, refId, expiresAt);

    return {
      success: true,
      tableNumber: table.table_number,
      customerName: matchingForThisTable.customer_name,
      bookingCode: matchingForThisTable.booking_code,
      message: 'OTP sent to your registered mobile number.',
      devOtp: otpCode
    };
  },

  // Verify OTP for Table Activation
  verifyTableActivationOtp(tableNumber, { customerPhone, otpCode }, io = null) {
    const table = this.getTableById(tableNumber);
    const phone = customerPhone ? customerPhone.trim().replace(/[\s+-]/g, '') : null;
    const refId = `QR_${table.table_number}_${phone}`;

    const otpRow = db.prepare(`
      SELECT * FROM otp_verifications
      WHERE reference_id = ? AND purpose = 'TABLE_ACTIVATION' AND is_verified = 0
      ORDER BY id DESC LIMIT 1
    `).get(refId);

    if (!otpRow) {
      throw new Error('No active OTP found. Please request a new OTP.');
    }

    if (new Date(otpRow.expires_at) < new Date()) {
      throw new Error('OTP has expired. Please request a new OTP.');
    }

    if (otpRow.attempts_left <= 0) {
      throw new Error('Too many incorrect OTP attempts. Please request a new OTP.');
    }

    if (otpRow.otp_code !== otpCode.trim()) {
      const remaining = otpRow.attempts_left - 1;
      db.prepare('UPDATE otp_verifications SET attempts_left = ? WHERE id = ?').run(remaining, otpRow.id);
      throw new Error(`Incorrect verification code. ${remaining} attempt(s) remaining.`);
    }

    // Mark verified
    db.prepare('UPDATE otp_verifications SET is_verified = 1 WHERE id = ?').run(otpRow.id);

    // Call underlying activation
    return this.activateTableQR(tableNumber, { customerPhone }, io);
  },

  activateTableQR(tableNumber, { bookingCode, customerPhone } = {}, io = null) {
    const today = new Date().toISOString().split('T')[0];
    const table = this.getTableById(tableNumber);

    const code = bookingCode ? bookingCode.trim().toUpperCase() : null;
    const phone = customerPhone ? customerPhone.trim().replace(/[\s+-]/g, '') : null;

    if (!code && !phone) {
      const err = new Error('Please enter your Booking Code or Registered Phone Number.');
      err.statusCode = 400;
      throw err;
    }

    // 1. Validate restaurant is currently open
    const settings = this.getRestaurantSettings();
    if (!settings.is_open) {
      const err = new Error(`K K's Food House is currently CLOSED (${settings.opening_time || '12:00 PM'} - ${settings.closing_time || '12:00 AM'}). Table QR activation is not available.`);
      err.code = 'RESTAURANT_CLOSED';
      err.statusCode = 403;
      throw err;
    }

    // 2. Validate table exists and is active
    if (!table || !table.is_active) {
      const err = new Error(`Table #${tableNumber} is invalid or inactive.`);
      err.code = 'INVALID_TABLE';
      err.statusCode = 404;
      throw err;
    }

    // 3. Validate table has NO active session (Table must be free)
    const existingActiveSession = db.prepare(`
      SELECT * FROM table_sessions
      WHERE table_id = ? AND status = 'ACTIVE'
      ORDER BY id DESC LIMIT 1
    `).get(table.id);

    if (existingActiveSession) {
      const err = new Error(`Table #${table.table_number} currently has an active dining session. Please contact staff or verify your table number.`);
      err.code = 'TABLE_ALREADY_OCCUPIED';
      err.details = `Table #${table.table_number} is currently occupied by another dining party.`;
      err.statusCode = 409;
      throw err;
    }

    // Check if THIS specific table is reserved for someone today
    const tableReservationToday = db.prepare(`
      SELECT r.*, t.table_number
      FROM reservations r
      JOIN tables t ON r.table_id = t.id
      WHERE r.table_id = ? AND r.booking_date = ? AND r.status IN ('CONFIRMED', 'SEATED')
    `).get(table.id, today);

    // Look for customer reservation matching code and/or phone if provided
    let matchingReservation = null;
    if (code && phone) {
      matchingReservation = db.prepare(`
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
        WHERE UPPER(r.booking_code) = UPPER(?)
          AND REPLACE(REPLACE(REPLACE(r.customer_phone, ' ', ''), '+', ''), '-', '') LIKE ?
          AND r.booking_date = ?
          AND r.status IN ('CONFIRMED', 'SEATED')
      `).get(code, `%${phone}%`, today);
    } else if (code) {
      matchingReservation = db.prepare(`
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
        WHERE UPPER(r.booking_code) = UPPER(?) AND r.booking_date = ? AND r.status IN ('CONFIRMED', 'SEATED')
      `).get(code, today);
    } else if (phone) {
      matchingReservation = db.prepare(`
        SELECT r.*, t.table_number
        FROM reservations r
        LEFT JOIN tables t ON r.table_id = t.id
        WHERE REPLACE(REPLACE(REPLACE(r.customer_phone, ' ', ''), '+', ''), '-', '') LIKE ?
          AND r.booking_date = ?
          AND r.status IN ('CONFIRMED', 'SEATED')
      `).get(`%${phone}%`, today);
    }

    let customerName = 'Table Guest';

    // If this table is reserved today, caller MUST match this table's reservation!
    if (tableReservationToday) {
      if (!matchingReservation || matchingReservation.id !== tableReservationToday.id) {
        const err = new Error('The table is not yours');
        err.code = 'NOT_YOUR_TABLE';
        err.details = `Table #${table.table_number} is reserved for another party today.`;
        err.statusCode = 403;
        throw err;
      }

      // Check time slot window
      try {
        const slotDate = parseDateTime(today, matchingReservation.booking_time);
        const diffMinutes = (Date.now() - slotDate.getTime()) / (1000 * 60);
        if (diffMinutes < -60) {
          const err = new Error('The table is not yours');
          err.code = 'SLOT_NOT_ACTIVE';
          err.details = `Your booking is scheduled for ${matchingReservation.booking_time}. Table activation opens 1 hour prior to your booking.`;
          err.statusCode = 403;
          throw err;
        }
      } catch (e) {
        if (e.statusCode) throw e;
      }

      db.prepare("UPDATE reservations SET status = 'SEATED', table_id = ? WHERE id = ?").run(
        table.id,
        matchingReservation.id
      );
      customerName = matchingReservation.customer_name;
    } else {
      // Table is NOT reserved today (free for walk-ins)
      if (matchingReservation) {
        // If customer has a reservation assigned to a DIFFERENT table
        if (matchingReservation.table_id && matchingReservation.table_id !== table.id) {
          const targetTableNumber = matchingReservation.table_number || matchingReservation.table_id;
          const err = new Error('The table is not yours');
          err.code = 'NOT_YOUR_TABLE';
          err.details = `Your booking is reserved for Table #${targetTableNumber}, not Table #${table.table_number}. Please proceed to Table #${targetTableNumber}.`;
          err.correctTableNumber = targetTableNumber;
          err.statusCode = 403;
          throw err;
        }

        // Link unassigned reservation to this table
        db.prepare("UPDATE reservations SET status = 'SEATED', table_id = ? WHERE id = ?").run(
          table.id,
          matchingReservation.id
        );
        customerName = matchingReservation.customer_name;
      }
    }

    // 6. Initialize or activate session under the customer's name
    let session = db.prepare(`
      SELECT * FROM table_sessions
      WHERE table_id = ? AND status = 'ACTIVE'
      ORDER BY id DESC LIMIT 1
    `).get(table.id);

    if (!session) {
      const sessionCode = `KK-T${table.table_number}-${Date.now().toString().slice(-4)}`;
      const assignment = db.prepare(`
        SELECT waiter_id FROM table_assignments WHERE table_id = ? AND date = ?
      `).get(table.id, today);
      const waiterId = assignment?.waiter_id || null;

      const res = db.prepare(`
        INSERT INTO table_sessions (table_id, session_code, customer_name, waiter_id, status, subtotal, discount_type, discount_value, final_total)
        VALUES (?, ?, ?, ?, 'ACTIVE', 0.0, 'NONE', 0.0, 0.0)
      `).run(table.id, sessionCode, customerName, waiterId);

      session = db.prepare('SELECT * FROM table_sessions WHERE id = ?').get(res.lastInsertRowid);
    } else {
      db.prepare('UPDATE table_sessions SET customer_name = ? WHERE id = ?').run(
        customerName,
        session.id
      );
      session.customer_name = customerName;
    }

    // 7. Log Activity
    ActivityLogger.logActivity(
      {
        category: 'TABLE',
        action: 'QR_ACTIVATED',
        title: `Table #${table.table_number} Activated by ${customerName}`,
        description: `Customer arrived and activated QR code. Table #${table.table_number} is now seated.`,
        tableNumber: table.table_number,
        actorName: customerName,
        actorRole: 'CUSTOMER',
        severity: 'SUCCESS',
        metadata: {
          bookingCode: matchingReservation?.booking_code || 'WALK_IN',
          guestsCount: matchingReservation?.guests_count || table.capacity,
          sessionId: session.id
        }
      },
      io
    );

    if (io) {
      const updatedTables = this.getAllTables();
      io.emit('tables:updated', updatedTables);
      if (matchingReservation) {
        io.emit('booking:updated', matchingReservation);
      }
      io.emit('session:updated', session);
      io.emit('table:activated', {
        tableNumber: table.table_number,
        tableId: table.id,
        waiterId: session.waiter_id,
        customerName: customerName,
        sessionId: session.id,
        sessionCode: session.session_code,
        message: `Table ${table.table_number} has been activated.`
      });
    }

    return {
      success: true,
      message: `Table #${table.table_number} activated successfully! Welcome, ${customerName}.`,
      tableNumber: table.table_number,
      booking: matchingReservation,
      session: {
        id: session.id,
        sessionCode: session.session_code,
        customerName: session.customer_name,
        waiterId: session.waiter_id,
        status: session.status
      }
    };
  },

  // Assign tables for today
  assignTablesForToday(assignments, date) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const deleteOld = db.prepare('DELETE FROM table_assignments WHERE date = ?');
    const insertNew = db.prepare(`
      INSERT INTO table_assignments (date, table_id, waiter_id)
      VALUES (?, ?, ?)
    `);

    deleteOld.run(targetDate);
    for (const a of assignments) {
      if (a.waiterId) {
        insertNew.run(targetDate, a.tableId, a.waiterId);
      }
    }

    return this.getAllTables();
  },

  getRestaurantSettings() {
    return (
      db.prepare('SELECT * FROM restaurant_settings WHERE id = 1').get() || {
        is_open: 1,
        opening_time: '12:00 PM',
        closing_time: '12:00 AM',
        announcement: "Welcome to K K's Food House"
      }
    );
  },

  updateRestaurantSettings({ isOpen, openingTime, closingTime, announcement }) {
    const current = this.getRestaurantSettings();
    db.prepare(`
      UPDATE restaurant_settings
      SET is_open = ?, opening_time = ?, closing_time = ?, announcement = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      isOpen !== undefined ? (isOpen ? 1 : 0) : current.is_open,
      openingTime || current.opening_time,
      closingTime || current.closing_time,
      announcement !== undefined ? announcement : current.announcement
    );

    return this.getRestaurantSettings();
  }
};
