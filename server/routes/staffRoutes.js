import express from 'express';
import { StaffService } from '../services/staffService.js';
import { ActivityLogger } from '../services/activityLogger.js';

export default function createStaffRouter(io) {
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      const staff = StaffService.getAllStaff();
      res.json(staff);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', (req, res) => {
    try {
      const newStaff = StaffService.createStaff(req.body);

      ActivityLogger.logActivity(
        {
          category: 'STAFF',
          action: 'STAFF_CREATED',
          title: `New Staff Member: ${newStaff.name} (${newStaff.role})`,
          description: `Added ${newStaff.role} to staff registry.${newStaff.waiter_username ? ` Login created: @${newStaff.waiter_username}.` : ''}`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { staffId: newStaff.id, role: newStaff.role, username: newStaff.waiter_username }
        },
        io
      );

      res.status(201).json(newStaff);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const staff = StaffService.getStaffById(req.params.id);
      if (!staff) return res.status(404).json({ error: 'Staff not found.' });
      res.json(staff);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const updated = StaffService.updateStaff(req.params.id, req.body);

      ActivityLogger.logActivity(
        {
          category: 'STAFF',
          action: 'STAFF_UPDATED',
          title: `Staff Profile Updated: ${updated.name}`,
          description: `Updated profile details for ${updated.name} (${updated.role}). Account: ${updated.is_active ? 'Active' : 'Suspended'}.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { staffId: updated.id, role: updated.role, isActive: updated.is_active }
        },
        io
      );

      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const result = StaffService.deleteStaff(req.params.id);

      ActivityLogger.logActivity(
        {
          category: 'STAFF',
          action: 'STAFF_DELETED',
          title: `Staff Member #${req.params.id} Deleted`,
          description: `Staff member and related assignments/credentials removed.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'WARNING',
          metadata: { staffId: req.params.id }
        },
        io
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
