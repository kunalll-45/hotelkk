import express from 'express';
import { TableService } from '../services/tableService.js';
import { ActivityLogger } from '../services/activityLogger.js';

export default function createTableRouter(io) {
  const router = express.Router();

  // Get all tables with real-time status and active session info
  router.get('/', (req, res) => {
    try {
      const tables = TableService.getAllTables();
      res.json(tables);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/settings', (req, res) => {
    try {
      const settings = TableService.getRestaurantSettings();
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/settings', (req, res) => {
    try {
      const settings = TableService.updateRestaurantSettings(req.body);
      io.emit('restaurant:settings_changed', settings);

      ActivityLogger.logActivity(
        {
          category: 'SYSTEM',
          action: 'SETTINGS_CHANGED',
          title: `Restaurant Status: ${settings.is_open ? 'OPEN' : 'CLOSED'}`,
          description: `Operating status updated to ${settings.is_open ? 'Open for Service' : 'Closed'}. Hours: ${settings.opening_time} - ${settings.closing_time}.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'WARNING',
          metadata: { isOpen: settings.is_open, openingTime: settings.opening_time, closingTime: settings.closing_time }
        },
        io
      );

      res.json(settings);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const table = TableService.getTableById(req.params.id);
      res.json(table);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Assign tables to present waiters for today
  router.post('/assign', (req, res) => {
    try {
      const { assignments, date } = req.body;
      if (!assignments || !Array.isArray(assignments)) {
        return res.status(400).json({ error: 'assignments array is required.' });
      }
      const updatedTables = TableService.assignTablesForToday(assignments, date);
      io.emit('tables:updated', updatedTables);

      ActivityLogger.logActivity(
        {
          category: 'TABLE',
          action: 'TABLES_ASSIGNED',
          title: 'Table Assignments Updated',
          description: `Waiters assigned to ${assignments.length} tables for ${date || new Date().toISOString().split('T')[0]}.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { count: assignments.length, date }
        },
        io
      );

      res.json(updatedTables);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Check QR activation status for table
  router.get('/:tableNumber/activation-status', (req, res) => {
    try {
      const status = TableService.getTableActivationStatus(req.params.tableNumber);
      res.json(status);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // Customer arrives at table and requests OTP with mobile number
  router.post('/:tableNumber/request-activation-otp', (req, res) => {
    try {
      const result = TableService.requestTableActivationOtp(req.params.tableNumber, req.body);
      res.json(result);
    } catch (err) {
      res.status(err.statusCode || 400).json({
        error: err.message,
        code: err.code || 'ACTIVATION_FAILED',
        details: err.details || err.message,
        correctTableNumber: err.correctTableNumber || null
      });
    }
  });

  // Customer enters OTP to activate table QR ordering
  router.post('/:tableNumber/verify-activation-otp', (req, res) => {
    try {
      const result = TableService.verifyTableActivationOtp(req.params.tableNumber, req.body, io);
      res.json(result);
    } catch (err) {
      res.status(err.statusCode || 400).json({
        error: err.message,
        code: err.code || 'OTP_VERIFICATION_FAILED',
        details: err.details || err.message
      });
    }
  });

  // Direct table QR activation (supports legacy or verified activation)
  router.post('/:tableNumber/activate-qr', (req, res) => {
    try {
      const result = TableService.activateTableQR(req.params.tableNumber, req.body, io);
      res.json(result);
    } catch (err) {
      res.status(err.statusCode || 400).json({
        error: err.message,
        code: err.code || 'ACTIVATION_FAILED',
        details: err.details || err.message,
        correctTableNumber: err.correctTableNumber || null
      });
    }
  });

  return router;
}
