import express from 'express';
import { ActivityLogger } from '../services/activityLogger.js';

export default function createLogRouter(io) {
  const router = express.Router();

  // Get activity logs with filters & pagination
  router.get('/', (req, res) => {
    try {
      const { category, tableNumber, severity, search, date, limit, offset } = req.query;
      const result = ActivityLogger.getActivityLogs({
        category,
        tableNumber,
        severity,
        search,
        date,
        limit,
        offset
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get activity summary stats for today / date
  router.get('/summary', (req, res) => {
    try {
      const { date } = req.query;
      const summary = ActivityLogger.getActivitySummary(date);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Test simulation endpoint to log and emit an activity
  router.post('/test', (req, res) => {
    try {
      const { category, action, title, description, tableNumber, actorName, actorRole, severity, metadata } = req.body;
      const log = ActivityLogger.logActivity(
        {
          category: category || 'SYSTEM',
          action: action || 'TEST_LOG',
          title: title || 'Test Hotel Event',
          description: description || 'This is a test hotel reaction event.',
          tableNumber: tableNumber || null,
          actorName: actorName || 'Manager',
          actorRole: actorRole || 'MANAGER',
          severity: severity || 'INFO',
          metadata: metadata || null
        },
        io
      );
      res.status(201).json(log);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
