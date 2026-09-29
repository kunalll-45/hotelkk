import { db } from '../db.js';

export const TipService = {
  recordTip(waiterId, amount, notes = '', recordedBy = 'Manager') {
    const waiter = db.prepare('SELECT id, name, role FROM staff WHERE id = ?').get(waiterId);
    if (!waiter || waiter.role !== 'Waiter') {
      throw new Error('Invalid Waiter ID.');
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error('Tip amount must be greater than zero.');
    }

    const today = new Date().toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO waiter_tips (waiter_id, date, amount, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(waiterId, today, amt, notes, recordedBy);

    return this.getDailyTipsForWaiter(waiterId);
  },

  getDailyTipsForWaiter(waiterId) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const todayTotalRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM waiter_tips
      WHERE waiter_id = ? AND date = ?
    `).get(waiterId, today);

    const yesterdayTotalRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM waiter_tips
      WHERE waiter_id = ? AND date = ?
    `).get(waiterId, yesterday);

    const todayEntries = db.prepare(`
      SELECT id, amount, notes, recorded_by, created_at
      FROM waiter_tips
      WHERE waiter_id = ? AND date = ?
      ORDER BY id DESC
    `).all(waiterId, today);

    const yesterdayEntries = db.prepare(`
      SELECT id, amount, notes, recorded_by, created_at
      FROM waiter_tips
      WHERE waiter_id = ? AND date = ?
      ORDER BY id DESC
    `).all(waiterId, yesterday);

    return {
      waiterId,
      todayDate: today,
      todayTotal: todayTotalRow?.total || 0,
      todayEntries,
      yesterdayDate: yesterday,
      yesterdayTotal: yesterdayTotalRow?.total || 0,
      yesterdayEntries
    };
  },

  getAllWaitersDailyTips() {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const waiters = db.prepare(`
      SELECT id, name, phone
      FROM staff
      WHERE role = 'Waiter' AND is_active = 1
      ORDER BY name ASC
    `).all();

    return waiters.map(w => {
      const todayTotal = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM waiter_tips
        WHERE waiter_id = ? AND date = ?
      `).get(w.id, today)?.total || 0;

      const yesterdayTotal = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM waiter_tips
        WHERE waiter_id = ? AND date = ?
      `).get(w.id, yesterday)?.total || 0;

      return {
        waiterId: w.id,
        name: w.name,
        phone: w.phone,
        todayTotal,
        yesterdayTotal
      };
    });
  }
};
