import { db } from '../db.js';

export const StaffService = {
  getAllStaff() {
    const today = new Date().toISOString().split('T')[0];
    const staffMembers = db.prepare(`
      SELECT s.id, s.name, s.role, s.phone, s.joining_date, s.is_active, s.created_at,
             wc.username as waiter_username,
             COALESCE(a.status, 'UNMARKED') as today_status
      FROM staff s
      LEFT JOIN waiter_credentials wc ON s.id = wc.staff_id
      LEFT JOIN attendance a ON s.id = a.staff_id AND a.date = ?
      ORDER BY s.id ASC
    `).all(today);

    return staffMembers;
  },

  createStaff({ name, role, phone, joiningDate, username, password, markPresentToday = true }) {
    if (!['Waiter', 'Cook', 'Helper', 'Other'].includes(role)) {
      throw new Error('Invalid staff role.');
    }

    if (!name || !joiningDate) {
      throw new Error('Staff name and joining date are required.');
    }

    const insertStaff = db.prepare(`
      INSERT INTO staff (name, role, phone, joining_date, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);

    const result = insertStaff.run(name, role, phone || '', joiningDate);
    const staffId = result.lastInsertRowid;

    // RULE: Only Waiters receive application login access created by Manager
    if (role === 'Waiter') {
      if (!username || !password) {
        throw new Error('Waiter login credentials (username and password) are required.');
      }

      const existingCred = db.prepare('SELECT id FROM waiter_credentials WHERE username = ?').get(username);
      if (existingCred) {
        throw new Error('Waiter username already taken.');
      }

      db.prepare(`
        INSERT INTO waiter_credentials (staff_id, username, password, is_active)
        VALUES (?, ?, ?, 1)
      `).run(staffId, username, password);
    }

    // Automatically mark as PRESENT for today if enabled so new waiter is immediately available
    if (markPresentToday) {
      const today = new Date().toISOString().split('T')[0];
      try {
        db.prepare(`
          INSERT INTO attendance (staff_id, date, status, marked_by, marked_at)
          VALUES (?, ?, 'PRESENT', 'Manager', CURRENT_TIMESTAMP)
          ON CONFLICT(staff_id, date) DO UPDATE SET
            status = 'PRESENT',
            marked_by = 'Manager',
            marked_at = CURRENT_TIMESTAMP
        `).run(staffId, today);
      } catch (e) {
        console.warn('Auto-attendance marking error:', e);
      }
    }

    return this.getStaffById(staffId);
  },

  getStaffById(id) {
    const today = new Date().toISOString().split('T')[0];
    return db.prepare(`
      SELECT s.id, s.name, s.role, s.phone, s.joining_date, s.is_active, s.created_at,
             wc.username as waiter_username,
             COALESCE(a.status, 'UNMARKED') as today_status
      FROM staff s
      LEFT JOIN waiter_credentials wc ON s.id = wc.staff_id
      LEFT JOIN attendance a ON s.id = a.staff_id AND a.date = ?
      WHERE s.id = ?
    `).get(today, id);
  },

  updateStaff(id, { name, role, phone, joiningDate, isActive, username, password }) {
    const existing = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Staff member not found.');
    }

    db.prepare(`
      UPDATE staff
      SET name = ?, role = ?, phone = ?, joining_date = ?, is_active = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      role ?? existing.role,
      phone ?? existing.phone,
      joiningDate ?? existing.joining_date,
      isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
      id
    );

    if (role === 'Waiter' || existing.role === 'Waiter') {
      if (username || password) {
        const cred = db.prepare('SELECT id FROM waiter_credentials WHERE staff_id = ?').get(id);
        if (cred) {
          db.prepare(`
            UPDATE waiter_credentials
            SET username = COALESCE(?, username), password = COALESCE(?, password)
            WHERE staff_id = ?
          `).run(username || null, password || null, id);
        } else if (username && password) {
          db.prepare(`
            INSERT INTO waiter_credentials (staff_id, username, password, is_active)
            VALUES (?, ?, ?, 1)
          `).run(id, username, password);
        }
      }
    }

    return this.getStaffById(id);
  },

  deleteStaff(id) {
    const existing = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Staff member not found.');
    }

    db.prepare('DELETE FROM waiter_credentials WHERE staff_id = ?').run(id);
    db.prepare('DELETE FROM attendance WHERE staff_id = ?').run(id);
    db.prepare('DELETE FROM table_assignments WHERE waiter_id = ?').run(id);
    db.prepare('DELETE FROM staff WHERE id = ?').run(id);

    return { success: true, message: 'Staff member deleted successfully.' };
  }
};
