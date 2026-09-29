import express from 'express';
import { TipService } from '../services/tipService.js';
import { ActivityLogger } from '../services/activityLogger.js';

export default function createTipRouter(io) {
  const router = express.Router();

  // Record Tip (by Manager)
  router.post('/', (req, res) => {
    try {
      const { waiterId, amount, notes, recordedBy } = req.body;
      if (!waiterId || !amount) {
        return res.status(400).json({ error: 'waiterId and amount are required.' });
      }
      const updatedTips = TipService.recordTip(waiterId, amount, notes, recordedBy);

      io.emit('tip:recorded', { waiterId, updatedTips });

      ActivityLogger.logActivity(
        {
          category: 'STAFF',
          action: 'TIP_RECORDED',
          title: `Tip Recorded: ₹${amount}`,
          description: `Tip of ₹${amount} recorded for Waiter #${waiterId}.${notes ? ` Note: ${notes}` : ''}`,
          actorName: recordedBy || 'Manager',
          actorRole: 'MANAGER',
          severity: 'SUCCESS',
          metadata: { waiterId, amount, notes }
        },
        io
      );

      res.status(201).json(updatedTips);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Get daily tips for specific waiter (Today and Previous Day)
  router.get('/waiter/:waiterId', (req, res) => {
    try {
      const tips = TipService.getDailyTipsForWaiter(req.params.waiterId);
      res.json(tips);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Get daily tips for all waiters (Manager summary view)
  router.get('/daily-summary', (req, res) => {
    try {
      const allTips = TipService.getAllWaitersDailyTips();
      res.json(allTips);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
