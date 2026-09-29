import { db } from '../db.js';
import { SessionOrderService } from './sessionOrderService.js';

export const BillingService = {
  // Generate Bill details for a session or table
  generateBillData(sessionIdOrTableId) {
    let session;
    if (typeof sessionIdOrTableId === 'object' || sessionIdOrTableId > 100) {
      session = SessionOrderService.getSessionDetails(sessionIdOrTableId);
    } else {
      // Find active session for table
      const activeSession = db.prepare(`
        SELECT id FROM table_sessions
        WHERE (table_id = ? OR id = ?) AND status = 'ACTIVE'
        ORDER BY id DESC LIMIT 1
      `).get(sessionIdOrTableId, sessionIdOrTableId);

      if (!activeSession) {
        // Check if there's any recent session
        const lastSession = db.prepare(`
          SELECT id FROM table_sessions
          WHERE table_id = ? OR id = ?
          ORDER BY id DESC LIMIT 1
        `).get(sessionIdOrTableId, sessionIdOrTableId);

        if (!lastSession) throw new Error('No session found for billing.');
        session = SessionOrderService.getSessionDetails(lastSession.id);
      } else {
        session = SessionOrderService.getSessionDetails(activeSession.id);
      }
    }

    // Consolidate all order items across all orders in this session
    const itemMap = new Map();
    let totalItemsCount = 0;

    for (const ord of session.orders) {
      for (const it of ord.items) {
        totalItemsCount += it.quantity;
        const key = `${it.menu_item_id}_${it.unit_price}_${it.item_name}`;
        if (itemMap.has(key)) {
          const existing = itemMap.get(key);
          existing.quantity += it.quantity;
          existing.subtotal += it.subtotal;
        } else {
          itemMap.set(key, {
            menuItemId: it.menu_item_id,
            name: it.item_name,
            unitPrice: it.unit_price,
            quantity: it.quantity,
            subtotal: it.subtotal,
            isManual: it.is_manual
          });
        }
      }
    }

    const consolidatedItems = Array.from(itemMap.values());

    let discountAmount = 0;
    if (session.discount_type === 'PERCENTAGE') {
      discountAmount = Math.round((session.subtotal * session.discount_value) / 100);
    } else if (session.discount_type === 'FIXED') {
      discountAmount = Math.min(session.discount_value, session.subtotal);
    }

    const finalTotal = Math.max(0, session.subtotal - discountAmount);

    return {
      restaurantName: "K K's Food House",
      tagline: "Royal Flavors & Premium Hospitality",
      billNumber: `BILL-${session.session_code}`,
      sessionId: session.id,
      sessionCode: session.session_code,
      tableNumber: session.table_number,
      customerName: session.customer_name,
      waiterName: session.waiter_name || 'Assigned Waiter',
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      openedAt: session.opened_at,
      status: session.status,
      items: consolidatedItems,
      totalItemsCount,
      subtotal: session.subtotal,
      discountType: session.discount_type,
      discountValue: session.discount_value,
      discountAmount,
      finalTotal,
      paymentMethod: session.payment_method || 'Cash / Card / UPI',
      closingMessage: "Thank You, Visit Again"
    };
  },

  // Payment confirmation: Either Waiter or Manager can collect payment (Cash vs Digital)
  confirmPayment(sessionId, {
    paymentMethod = 'Cash',
    collectorRole = 'MANAGER',
    collectorId = null,
    collectorName = 'Manager',
    transactionRef = ''
  } = {}) {
    const session = db.prepare('SELECT * FROM table_sessions WHERE id = ?').get(sessionId);
    if (!session) throw new Error('Session not found.');

    if (session.status === 'CLOSED') {
      throw new Error('This session has already been closed.');
    }

    // Ensure subtotal and final total are completely fresh
    SessionOrderService.recalculateSessionTotals(sessionId);
    const updatedSession = db.prepare('SELECT * FROM table_sessions WHERE id = ?').get(sessionId);

    const isCash = paymentMethod === 'Cash';
    const isPendingCash = isCash ? 1 : 0;
    const paymentStatus = isCash ? 'PENDING_CASH' : 'COMPLETED';
    const cleanRole = (collectorRole || 'MANAGER').toUpperCase();
    const cleanName = collectorName || (cleanRole === 'WAITER' ? 'Waiter' : 'Manager');

    // 1. Insert into payments table for audit & cash ledger tracking
    const paymentRes = db.prepare(`
      INSERT INTO payments (
        session_id, table_id, amount, payment_method, payment_status,
        collected_by_role, collected_by_id, collected_by_name,
        is_pending_cash, transaction_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      session.table_id,
      updatedSession.final_total,
      paymentMethod,
      paymentStatus,
      cleanRole,
      collectorId || null,
      cleanName,
      isPendingCash,
      transactionRef || null
    );

    // 2. Close session: status = 'CLOSED'
    db.prepare(`
      UPDATE table_sessions
      SET status = 'CLOSED',
          paid_at = CURRENT_TIMESTAMP,
          closed_at = CURRENT_TIMESTAMP,
          payment_method = ?
      WHERE id = ?
    `).run(paymentMethod, sessionId);

    // 3. Mark all associated orders as SERVED if not already
    db.prepare(`
      UPDATE orders
      SET status = 'SERVED', served_at = COALESCE(served_at, CURRENT_TIMESTAMP)
      WHERE session_id = ? AND status != 'SERVED'
    `).run(sessionId);

    // 4. Resolve any remaining service requests
    db.prepare(`
      UPDATE service_requests
      SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND status = 'PENDING'
    `).run(sessionId);

    return {
      success: true,
      paymentId: paymentRes.lastInsertRowid,
      sessionId,
      tableId: session.table_id,
      finalTotal: updatedSession.final_total,
      paymentMethod,
      isPendingCash,
      collectedByName: cleanName,
      collectedByRole: cleanRole,
      transactionRef,
      closedAt: new Date().toISOString()
    };
  },

  // Get Pending Cash Ledger Summary (Manager view of un-remitted physical cash held by staff)
  getPendingCashSummary() {
    const rows = db.prepare(`
      SELECT p.*, t.table_number, s.session_code, s.customer_name
      FROM payments p
      JOIN tables t ON p.table_id = t.id
      JOIN table_sessions s ON p.session_id = s.id
      WHERE p.is_pending_cash = 1
      ORDER BY p.id DESC
    `).all();

    const totalPending = rows.reduce((sum, r) => sum + r.amount, 0);

    // Group by staff member who collected the cash
    const byStaff = {};
    for (const r of rows) {
      const key = `${r.collected_by_role}_${r.collected_by_id || r.collected_by_name}`;
      if (!byStaff[key]) {
        byStaff[key] = {
          role: r.collected_by_role,
          id: r.collected_by_id,
          name: r.collected_by_name,
          totalAmount: 0,
          count: 0,
          payments: []
        };
      }
      byStaff[key].totalAmount += r.amount;
      byStaff[key].count += 1;
      byStaff[key].payments.push(r);
    }

    const normalizedStaff = Object.values(byStaff).map(s => ({
      staffRole: s.role,
      staffId: s.id,
      staffName: s.name,
      totalPending: s.totalAmount,
      unsettledCount: s.count,
      payments: s.payments
    }));

    return {
      totalPendingCash: totalPending,
      pendingCount: rows.length,
      byStaff: normalizedStaff,
      staffSummary: normalizedStaff,
      records: rows
    };
  },

  // Manager settles pending cash collected by staff to the hotel cash register
  settleStaffCash({ paymentId, staffRole, staffId, managerName = 'Manager' } = {}) {
    if (paymentId) {
      db.prepare(`
        UPDATE payments
        SET is_pending_cash = 0, payment_status = 'COMPLETED', cash_settled_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(paymentId);
    } else if (staffRole && staffId !== undefined) {
      db.prepare(`
        UPDATE payments
        SET is_pending_cash = 0, payment_status = 'COMPLETED', cash_settled_at = CURRENT_TIMESTAMP
        WHERE is_pending_cash = 1 AND collected_by_role = ? AND (collected_by_id = ? OR (? IS NULL AND collected_by_id IS NULL))
      `).run(staffRole.toUpperCase(), staffId, staffId);
    } else {
      // Settle all pending cash
      db.prepare(`
        UPDATE payments
        SET is_pending_cash = 0, payment_status = 'COMPLETED', cash_settled_at = CURRENT_TIMESTAMP
        WHERE is_pending_cash = 1
      `).run();
    }

    return this.getPendingCashSummary();
  }
};
