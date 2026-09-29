import express from 'express';
import { AttendanceService } from '../services/attendanceService.js';
import { ActivityLogger } from '../services/activityLogger.js';

export default function createAttendanceRouter(io) {
  const router = express.Router();

  // Get daily attendance (spreadsheet view)
  router.get('/daily', (req, res) => {
    try {
      const { date } = req.query;
      const data = AttendanceService.getAttendanceForDate(date);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mark single staff attendance
  router.post('/mark', (req, res) => {
    try {
      const { staffId, date, status, markedBy } = req.body;
      if (!staffId || !status) {
        return res.status(400).json({ error: 'staffId and status are required.' });
      }
      const record = AttendanceService.markAttendance(staffId, date, status, markedBy);

      // Broadcast real-time attendance update so Waiter login/permissions and Live Tables react
      io.emit('attendance:updated', { staffId, date, status });

      ActivityLogger.logActivity(
        {
          category: 'ATTENDANCE',
          action: 'ATTENDANCE_MARKED',
          title: `Staff Attendance Marked ${status}`,
          description: `Staff #${staffId} marked ${status} for ${record.date} by ${markedBy || 'Manager'}.`,
          actorName: markedBy || 'Manager',
          actorRole: 'MANAGER',
          severity: status === 'PRESENT' ? 'SUCCESS' : 'WARNING',
          metadata: { staffId, status, date: record.date }
        },
        io
      );

      res.json(record);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Bulk mark attendance for the day
  router.post('/bulk', (req, res) => {
    try {
      const { date, records, markedBy } = req.body;
      if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: 'records array is required.' });
      }
      const data = AttendanceService.markBulkAttendance(date, records, markedBy);

      io.emit('attendance:updated', { date, bulk: true });

      ActivityLogger.logActivity(
        {
          category: 'ATTENDANCE',
          action: 'BULK_ATTENDANCE',
          title: `Bulk Attendance Updated (${records.length} Staff)`,
          description: `Daily attendance batch marked for date ${date}.`,
          actorName: markedBy || 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { count: records.length, date }
        },
        io
      );

      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Complete attendance history for a staff member from joining date
  router.get('/history/:staffId', (req, res) => {
    try {
      const history = AttendanceService.getStaffAttendanceHistory(req.params.staffId);
      res.json(history);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Monthly Matrix View
  router.get('/matrix', (req, res) => {
    try {
      const { year, month } = req.query;
      const now = new Date();
      const targetYear = year ? parseInt(year) : now.getFullYear();
      const targetMonth = month ? parseInt(month) : now.getMonth() + 1;

      const matrix = AttendanceService.getMonthlyAttendanceMatrix(targetYear, targetMonth);
      res.json(matrix);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
