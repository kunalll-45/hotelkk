import { db } from '../db.js';

export const ReportService = {
  // 1. Top Summary Area (Divided into 2 parts as strictly specified)
  getTopSummary(targetDate) {
    const date = targetDate || new Date().toISOString().split('T')[0];

    // Part 1: Tables used today, sessions handled today, orders handled today
    const tablesUsedRow = db.prepare(`
      SELECT COUNT(DISTINCT table_id) as count
      FROM table_sessions
      WHERE date(opened_at) = ?
    `).get(date);

    const sessionsRow = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(final_total), 0) as totalRevenue
      FROM table_sessions
      WHERE date(opened_at) = ?
    `).get(date);

    const ordersRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE date(created_at) = ?
    `).get(date);

    // Part 2: Top Item Insights
    // A. TOP REVENUE ITEM
    const topRevenueRow = db.prepare(`
      SELECT oi.menu_item_id, oi.item_name, SUM(oi.subtotal) as totalEarned, SUM(oi.quantity) as totalQty
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) = ?
      GROUP BY oi.menu_item_id, oi.item_name
      ORDER BY totalEarned DESC
      LIMIT 1
    `).get(date);

    // B. TOP QUANTITY ITEM
    const topQuantityRow = db.prepare(`
      SELECT oi.menu_item_id, oi.item_name, SUM(oi.quantity) as totalQtySold, SUM(oi.subtotal) as totalEarned
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) = ?
      GROUP BY oi.menu_item_id, oi.item_name
      ORDER BY totalQtySold DESC
      LIMIT 1
    `).get(date);

    return {
      date,
      summary: {
        totalTablesUsed: tablesUsedRow?.count || 0,
        totalSessions: sessionsRow?.count || 0,
        totalOrders: ordersRow?.count || 0,
        totalRevenue: sessionsRow?.totalRevenue || 0
      },
      topInsights: {
        topRevenueItem: topRevenueRow ? {
          name: topRevenueRow.item_name,
          amountEarned: topRevenueRow.totalEarned,
          quantity: topRevenueRow.totalQty
        } : null,
        topQuantityItem: topQuantityRow ? {
          name: topQuantityRow.item_name,
          quantitySold: topQuantityRow.totalQtySold,
          amountEarned: topQuantityRow.totalEarned
        } : null
      }
    };
  },

  // 2. Comprehensive Historical Reports with Day / Week / Month / Custom filters
  getReports({ period = 'day', date, startDate, endDate } = {}) {
    const today = new Date().toISOString().split('T')[0];
    let start = date || today;
    let end = date || today;

    if (period === 'week') {
      const d = new Date(start);
      d.setDate(d.getDate() - 6);
      start = d.toISOString().split('T')[0];
    } else if (period === 'month') {
      const d = new Date(start);
      d.setDate(d.getDate() - 29);
      start = d.toISOString().split('T')[0];
    } else if (period === 'custom' && startDate && endDate) {
      start = startDate;
      end = endDate;
    }

    // Top summary for the selected period range
    const periodSummary = db.prepare(`
      SELECT
        COUNT(DISTINCT s.table_id) as tablesUsed,
        COUNT(DISTINCT s.id) as totalSessions,
        COUNT(DISTINCT o.id) as totalOrders,
        COALESCE(SUM(s.final_total), 0) as totalRevenue,
        COALESCE(SUM(s.subtotal), 0) as totalSubtotal,
        COALESCE(SUM(CASE WHEN s.discount_type = 'PERCENTAGE' THEN (s.subtotal * s.discount_value / 100) WHEN s.discount_type = 'FIXED' THEN s.discount_value ELSE 0 END), 0) as totalDiscount
      FROM table_sessions s
      LEFT JOIN orders o ON s.id = o.session_id
      WHERE date(s.opened_at) >= ? AND date(s.opened_at) <= ?
    `).get(start, end);

    // Top Revenue & Quantity for the period
    const topRevenuePeriod = db.prepare(`
      SELECT oi.item_name, SUM(oi.subtotal) as totalEarned, SUM(oi.quantity) as totalQty
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) >= ? AND date(o.created_at) <= ?
      GROUP BY oi.menu_item_id, oi.item_name
      ORDER BY totalEarned DESC LIMIT 1
    `).get(start, end);

    const topQuantityPeriod = db.prepare(`
      SELECT oi.item_name, SUM(oi.quantity) as totalQtySold, SUM(oi.subtotal) as totalEarned
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) >= ? AND date(o.created_at) <= ?
      GROUP BY oi.menu_item_id, oi.item_name
      ORDER BY totalQtySold DESC LIMIT 1
    `).get(start, end);

    // A. SESSION-WISE HISTORY
    const sessions = db.prepare(`
      SELECT s.*, t.table_number, st.name as waiter_name,
             (SELECT COUNT(*) FROM orders WHERE session_id = s.id) as orders_count,
             (SELECT COUNT(*) FROM order_items WHERE session_id = s.id) as items_count
      FROM table_sessions s
      JOIN tables t ON s.table_id = t.id
      LEFT JOIN staff st ON s.waiter_id = st.id
      WHERE date(s.opened_at) >= ? AND date(s.opened_at) <= ?
      ORDER BY s.opened_at DESC
    `).all(start, end);

    // B. ORDER-WISE HISTORY
    const orders = db.prepare(`
      SELECT o.*, t.table_number, s.session_code, s.customer_name as family_name, st.name as waiter_name
      FROM orders o
      JOIN table_sessions s ON o.session_id = s.id
      JOIN tables t ON o.table_id = t.id
      LEFT JOIN staff st ON o.waiter_id = st.id
      WHERE date(o.created_at) >= ? AND date(o.created_at) <= ?
      ORDER BY o.created_at DESC
    `).all(start, end);

    for (const ord of orders) {
      ord.items = db.prepare(`
        SELECT id, menu_item_id, item_name, unit_price, quantity, subtotal, is_manual
        FROM order_items
        WHERE order_id = ?
      `).all(ord.id);
    }

    // C. TABLE-WISE HISTORY
    const tableStats = db.prepare(`
      SELECT t.id, t.table_number, t.capacity,
             COUNT(DISTINCT s.id) as sessions_handled,
             COUNT(DISTINCT o.id) as orders_handled,
             COALESCE(SUM(s.final_total), 0) as total_generated
      FROM tables t
      LEFT JOIN table_sessions s ON t.id = s.table_id AND date(s.opened_at) >= ? AND date(s.opened_at) <= ?
      LEFT JOIN orders o ON s.id = o.session_id
      GROUP BY t.id, t.table_number, t.capacity
      ORDER BY t.table_number ASC
    `).all(start, end);

    return {
      period,
      startDate: start,
      endDate: end,
      summary: {
        tablesUsed: periodSummary?.tablesUsed || 0,
        totalSessions: periodSummary?.totalSessions || 0,
        totalOrders: periodSummary?.totalOrders || 0,
        totalRevenue: periodSummary?.totalRevenue || 0,
        totalDiscount: periodSummary?.totalDiscount || 0
      },
      topInsights: {
        topRevenueItem: topRevenuePeriod ? {
          name: topRevenuePeriod.item_name,
          amountEarned: topRevenuePeriod.totalEarned,
          quantity: topRevenuePeriod.totalQty
        } : null,
        topQuantityItem: topQuantityPeriod ? {
          name: topQuantityPeriod.item_name,
          quantitySold: topQuantityPeriod.totalQtySold,
          amountEarned: topQuantityPeriod.totalEarned
        } : null
      },
      sessions,
      orders,
      tableStats
    };
  },

  // 3. WAITER ATTENDANCE + PERFORMANCE HISTORY from joining date
  getWaiterPerformanceHistory(waiterId, targetDate) {
    const today = targetDate || new Date().toISOString().split('T')[0];

    const waiter = db.prepare('SELECT id, name, phone, joining_date FROM staff WHERE id = ? AND role = "Waiter"').get(waiterId);
    if (!waiter) throw new Error('Waiter not found.');

    // Attendance stats from joining date
    const attendanceRecords = db.prepare(`
      SELECT date, status
      FROM attendance
      WHERE staff_id = ? AND date <= ?
      ORDER BY date DESC
    `).all(waiterId, today);

    const presentDays = attendanceRecords.filter(r => r.status === 'PRESENT').length;
    const absentDays = attendanceRecords.filter(r => r.status === 'ABSENT').length;
    const workedDates = attendanceRecords.filter(r => r.status === 'PRESENT').map(r => r.date);

    // Today's specific performance (date = today)
    const todaySessionCount = db.prepare(`
      SELECT COUNT(DISTINCT id) as count, COALESCE(SUM(final_total), 0) as revenue
      FROM table_sessions
      WHERE waiter_id = ? AND date(opened_at) = ?
    `).get(waiterId, today);

    const todayOrderCount = db.prepare(`
      SELECT COUNT(DISTINCT o.id) as count
      FROM orders o
      JOIN table_sessions s ON o.session_id = s.id
      WHERE (o.waiter_id = ? OR s.waiter_id = ?) AND o.status = 'SERVED' AND date(o.created_at) = ?
    `).get(waiterId, waiterId, today);

    const todayTablesCount = db.prepare(`
      SELECT COUNT(DISTINCT table_id) as count
      FROM table_assignments
      WHERE waiter_id = ? AND date = ?
    `).get(waiterId, today);

    const todayTipsRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM waiter_tips
      WHERE waiter_id = ? AND date = ?
    `).get(waiterId, today);

    // All-time performance metrics (tables handled, orders served, sessions handled, tips)
    const sessionCount = db.prepare(`
      SELECT COUNT(DISTINCT id) as count, COALESCE(SUM(final_total), 0) as revenue
      FROM table_sessions
      WHERE waiter_id = ? AND date(opened_at) <= ?
    `).get(waiterId, today);

    const orderCount = db.prepare(`
      SELECT COUNT(DISTINCT o.id) as count
      FROM orders o
      JOIN table_sessions s ON o.session_id = s.id
      WHERE (o.waiter_id = ? OR s.waiter_id = ?) AND o.status = 'SERVED' AND date(o.created_at) <= ?
    `).get(waiterId, waiterId, today);

    const tablesHandledCount = db.prepare(`
      SELECT COUNT(DISTINCT table_id) as count
      FROM table_assignments
      WHERE waiter_id = ? AND date <= ?
    `).get(waiterId, today);

    const tipTotalRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM waiter_tips
      WHERE waiter_id = ? AND date <= ?
    `).get(waiterId, today);

    // List of recent served orders with item details
    const servedOrders = db.prepare(`
      SELECT o.id, o.session_id, o.table_id, o.placed_by_name, o.waiter_id, o.status,
             o.total_amount, o.created_at, t.table_number, s.session_code, s.customer_name as family_name
      FROM orders o
      JOIN table_sessions s ON o.session_id = s.id
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE (o.waiter_id = ? OR s.waiter_id = ?)
      ORDER BY o.id DESC
      LIMIT 100
    `).all(waiterId, waiterId);

    for (const ord of servedOrders) {
      ord.items = db.prepare(`
        SELECT id, menu_item_id, item_name, unit_price, quantity, subtotal, is_manual
        FROM order_items
        WHERE order_id = ?
      `).all(ord.id);
    }

    // List of completed table sessions
    const completedSessions = db.prepare(`
      SELECT s.id, s.session_code, s.table_id, s.customer_name, s.subtotal, s.discount_type, s.discount_value,
             s.final_total, s.opened_at, s.closed_at, s.status, t.table_number
      FROM table_sessions s
      LEFT JOIN tables t ON s.table_id = t.id
      WHERE s.waiter_id = ?
      ORDER BY s.id DESC
      LIMIT 50
    `).all(waiterId);

    // List of recent tips recorded
    const tipEntries = db.prepare(`
      SELECT id, date, amount, notes, recorded_by, created_at
      FROM waiter_tips
      WHERE waiter_id = ?
      ORDER BY id DESC
      LIMIT 50
    `).all(waiterId);

    const cleanNum = (val) => {
      const n = Number(val);
      return Number.isFinite(n) ? n : 0;
    };

    return {
      waiter,
      joiningDate: waiter.joining_date,
      presentDays,
      absentDays,
      totalMarkedDays: attendanceRecords.length,
      workedDates,
      todayPerformance: {
        tablesHandled: cleanNum(todayTablesCount?.count),
        ordersServed: cleanNum(todayOrderCount?.count),
        sessionsHandled: cleanNum(todaySessionCount?.count),
        revenueFacilitated: cleanNum(todaySessionCount?.revenue),
        totalTipsEarned: cleanNum(todayTipsRow?.total)
      },
      overallPerformance: {
        tablesHandled: cleanNum(tablesHandledCount?.count),
        ordersServed: cleanNum(orderCount?.count),
        sessionsHandled: cleanNum(sessionCount?.count),
        revenueFacilitated: cleanNum(sessionCount?.revenue),
        totalTipsEarned: cleanNum(tipTotalRow?.total)
      },
      performance: {
        tablesHandled: cleanNum(tablesHandledCount?.count),
        ordersServed: cleanNum(orderCount?.count),
        sessionsHandled: cleanNum(sessionCount?.count),
        revenueFacilitated: cleanNum(sessionCount?.revenue),
        totalTipsEarned: cleanNum(tipTotalRow?.total)
      },
      attendanceHistory: attendanceRecords,
      servedOrders,
      completedSessions,
      tipEntries
    };
  },

  getAllWaitersPerformance(targetDate) {
    const today = targetDate || new Date().toISOString().split('T')[0];
    const waiters = db.prepare('SELECT id FROM staff WHERE role = "Waiter" AND is_active = 1').all();

    return waiters.map(w => this.getWaiterPerformanceHistory(w.id, today));
  }
};
