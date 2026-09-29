import { db } from '../db.js';

export const AttendanceService = {
  getAttendanceForDate(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const staffList = db.prepare(`
      SELECT s.id, s.name, s.role, s.phone, s.joining_date, s.is_active,
             a.status, a.marked_at, a.marked_by
      FROM staff s
      LEFT JOIN attendance a ON s.id = a.staff_id AND a.date = ?
      WHERE s.is_active = 1
      ORDER BY s.role ASC, s.name ASC
    `).all(targetDate);

    return {
      date: targetDate,
      staff: staffList.map(s => ({
        ...s,
        status: s.status || 'UNMARKED'
      }))
    };
  },

  markAttendance(staffId, date, status, markedBy = 'Manager') {
    const targetDate = date || new Date().toISOString().split('T')[0];
    if (!['PRESENT', 'ABSENT'].includes(status)) {
      throw new Error('Invalid attendance status. Must be PRESENT or ABSENT.');
    }

    const staff = db.prepare('SELECT id, name, role FROM staff WHERE id = ?').get(staffId);
    if (!staff) {
      throw new Error('Staff not found.');
    }

    db.prepare(`
      INSERT INTO attendance (staff_id, date, status, marked_by, marked_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(staff_id, date) DO UPDATE SET
        status = excluded.status,
        marked_by = excluded.marked_by,
        marked_at = CURRENT_TIMESTAMP
    `).run(staffId, targetDate, status, markedBy);

    // If a waiter is marked ABSENT for today, remove their table assignments for today
    if (staff.role === 'Waiter' && status === 'ABSENT') {
      db.prepare(`
        DELETE FROM table_assignments
        WHERE waiter_id = ? AND date = ?
      `).run(staffId, targetDate);
    }

    return { staffId, date: targetDate, status };
  },

  markBulkAttendance(date, records, markedBy = 'Manager') {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const markStmt = db.prepare(`
      INSERT INTO attendance (staff_id, date, status, marked_by, marked_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(staff_id, date) DO UPDATE SET
        status = excluded.status,
        marked_by = excluded.marked_by,
        marked_at = CURRENT_TIMESTAMP
    `);

    const delAssignStmt = db.prepare(`
      DELETE FROM table_assignments WHERE waiter_id = ? AND date = ?
    `);

    const transaction = db.transaction((recs) => {
      for (const rec of recs) {
        markStmt.run(rec.staffId, targetDate, rec.status, markedBy);
        if (rec.status === 'ABSENT') {
          delAssignStmt.run(rec.staffId, targetDate);
        }
      }
    });

    transaction(records);
    return this.getAttendanceForDate(targetDate);
  },

  getStaffAttendanceHistory(staffId) {
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(staffId);
    if (!staff) {
      throw new Error('Staff not found.');
    }

    const history = db.prepare(`
      SELECT date, status, marked_at, marked_by
      FROM attendance
      WHERE staff_id = ?
      ORDER BY date DESC
    `).all(staffId);

    const presentDays = history.filter(h => h.status === 'PRESENT').length;
    const absentDays = history.filter(h => h.status === 'ABSENT').length;

    return {
      staff,
      presentDays,
      absentDays,
      totalMarked: history.length,
      attendanceRate: history.length > 0 ? Math.round((presentDays / history.length) * 100) : 0,
      history
    };
  },

  getMonthlyAttendanceGrid(year, month) {
    // Generate dates for the month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month); // 1-12
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

    const staffList = db.prepare('SELECT id, name, role, joining_date FROM staff WHERE is_active = 1 ORDER BY role, name').all();
    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const records = db.prepare(`
      SELECT staff_id, date, status
      FROM attendance
      WHERE date >= ? AND date <= ?
    `).all(startDate, endDate);

    const recordMap = {};
    for (const r of records) {
      recordMap[`${r.staff_id}_${r.date}`] = r.status;
    }

    const grid = staffList.map(s => {
      const days = {};
      let present = 0;
      let absent = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const st = recordMap[`${s.id}_${dateStr}`] || '-';
        days[d] = st;
        if (st === 'PRESENT') present++;
        if (st === 'ABSENT') absent++;
      }
      return {
        staffId: s.id,
        name: s.name,
        role: s.role,
        joiningDate: s.joining_date,
        presentCount: present,
        absentCount: absent,
        days
      };
    });

    return {
      year: yearNum,
      month: monthNum,
      daysInMonth,
      grid
    };
  }
};
