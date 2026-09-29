import express from 'express';
import { AuthService } from '../services/authService.js';

const router = express.Router();

// Manager Login
router.post('/manager/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const sessionData = AuthService.loginManager(username, password);
    res.json(sessionData);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Manager Register / Account Creation (Rule: Max 2 Active Managers)
router.post('/manager/create', (req, res) => {
  try {
    const { username, password, fullName, roleTitle } = req.body;
    if (!username || !password || !fullName) {
      return res.status(400).json({ error: 'Username, password, and full name are required.' });
    }
    const newManager = AuthService.createManager(username, password, fullName, roleTitle);
    res.status(201).json(newManager);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List Managers (to see active manager count)
router.get('/managers', (req, res) => {
  try {
    const managers = AuthService.getManagers();
    res.json(managers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Waiter Login (Strict Rule: Must be marked PRESENT for today)
router.post('/waiter/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const sessionData = AuthService.loginWaiter(username, password);
    res.json(sessionData);
  } catch (err) {
    const status = err.statusCode || 401;
    res.status(status).json({
      error: err.message,
      isAttendanceBlocked: !!err.isAttendanceBlocked
    });
  }
});

export default router;
