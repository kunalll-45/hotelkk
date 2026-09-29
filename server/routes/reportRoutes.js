import express from 'express';
import { ReportService } from '../services/reportService.js';

const router = express.Router();

// Top Summary Area (2 Parts: totals today, top revenue item, top quantity item)
router.get('/top-summary', (req, res) => {
  try {
    const data = ReportService.getTopSummary(req.query.date);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full Historical Reports (Day, Week, Month, Custom, Session-wise, Order-wise, Table-wise)
router.get('/', (req, res) => {
  try {
    const { period, date, startDate, endDate } = req.query;
    const reports = ReportService.getReports({ period, date, startDate, endDate });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Waiter Attendance + Performance History from Joining Date
router.get('/waiter/:waiterId', (req, res) => {
  try {
    const data = ReportService.getWaiterPerformanceHistory(req.params.waiterId, req.query.date);
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// All Waiters Performance list
router.get('/waiters/all', (req, res) => {
  try {
    const data = ReportService.getAllWaitersPerformance(req.query.date);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
