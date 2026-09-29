import { db } from '../db.js';

export const AuthService = {
  loginManager(username, password) {
    const manager = db.prepare(`
      SELECT id, username, password, full_name, role_title, is_active
      FROM managers
      WHERE username = ? AND is_active = 1
    `).get(username);

    if (!manager) {
      throw new Error('Invalid manager username or inactive account.');
    }

    if (manager.password !== password) {
      throw new Error('Incorrect manager password.');
    }

    return {
      role: 'Manager',
      id: manager.id,
      username: manager.username,
      fullName: manager.full_name,
      roleTitle: manager.role_title
    };
  },

  getManagers() {
    return db.prepare(`
      SELECT id, username, full_name, role_title, is_active, created_at
      FROM managers
    `).all();
  },

  createManager(username, password, fullName, roleTitle) {
    // ENFORCE RULE: Maximum of THREE active Manager accounts
    const activeCount = db.prepare(`
      SELECT COUNT(*) as count FROM managers WHERE is_active = 1
    `).get().count;

    if (activeCount >= 3) {
      throw new Error('Maximum of THREE active Manager accounts allowed by system policy.');
    }

    const existing = db.prepare('SELECT id FROM managers WHERE username = ?').get(username);
    if (existing) {
      throw new Error('Manager username already exists.');
    }

    const res = db.prepare(`
      INSERT INTO managers (username, password, full_name, role_title, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(username, password, fullName, roleTitle || 'Working Manager');

    return { id: res.lastInsertRowid, username, fullName, roleTitle };
  },

  loginWaiter(username, password) {
    const cred = db.prepare(`
      SELECT wc.id as cred_id, wc.staff_id, wc.username, wc.password, wc.is_active as cred_active,
             s.name, s.role, s.phone, s.joining_date, s.is_active as staff_active
      FROM waiter_credentials wc
      JOIN staff s ON wc.staff_id = s.id
      WHERE wc.username = ? AND wc.is_active = 1 AND s.is_active = 1
    `).get(username);

    if (!cred) {
      throw new Error('Invalid Waiter credentials. Please contact the Manager.');
    }

    if (cred.password !== password) {
      throw new Error('Incorrect Waiter password.');
    }

    // CRITICAL BUSINESS RULE:
    // A Waiter can log in ONLY if the Manager has marked that Waiter PRESENT for the current day.
    const today = new Date().toISOString().split('T')[0];
    const attendance = db.prepare(`
      SELECT status FROM attendance
      WHERE staff_id = ? AND date = ?
    `).get(cred.staff_id, today);

    if (!attendance || attendance.status !== 'PRESENT') {
      const error = new Error('You have not been marked present for today. Please contact the Manager.');
      error.statusCode = 403;
      error.isAttendanceBlocked = true;
      throw error;
    }

    // Fetch assigned tables for today
    const assignedTables = db.prepare(`
      SELECT t.id, t.table_number, t.capacity
      FROM table_assignments ta
      JOIN tables t ON ta.table_id = t.id
      WHERE ta.waiter_id = ? AND ta.date = ?
      ORDER BY t.table_number ASC
    `).all(cred.staff_id, today);

    return {
      role: 'Waiter',
      id: cred.staff_id,
      name: cred.name,
      username: cred.username,
      phone: cred.phone,
      joiningDate: cred.joining_date,
      assignedTables: assignedTables.map(t => t.table_number),
      assignedTableObjs: assignedTables
    };
  }
};
