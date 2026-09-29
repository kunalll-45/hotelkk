import express from 'express';
import { MenuService } from '../services/menuService.js';
import { ActivityLogger } from '../services/activityLogger.js';

export default function createMenuRouter(io) {
  const router = express.Router();

  // Get full menu (supports ?available=true for customer view)
  router.get('/', (req, res) => {
    try {
      const onlyAvailable = req.query.available === 'true';
      const items = MenuService.getAllMenuItems(onlyAvailable);
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/categories', (req, res) => {
    try {
      const categories = MenuService.getCategories();
      res.json(categories);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const item = MenuService.getMenuItemById(req.params.id);
      res.json(item);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Create new food item (Manager full menu management)
  router.post('/', (req, res) => {
    try {
      const newItem = MenuService.createMenuItem(req.body);
      io.emit('menu:updated', { type: 'CREATED', item: newItem });

      ActivityLogger.logActivity(
        {
          category: 'MENU',
          action: 'MENU_CREATED',
          title: `New Dish Created: ${newItem.name}`,
          description: `Added "${newItem.name}" (${newItem.category}, ₹${newItem.price}) to restaurant menu.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { id: newItem.id, name: newItem.name, price: newItem.price }
        },
        io
      );

      res.status(201).json(newItem);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Edit food item
  router.put('/:id', (req, res) => {
    try {
      const updated = MenuService.updateMenuItem(req.params.id, req.body);
      io.emit('menu:updated', { type: 'UPDATED', item: updated });

      ActivityLogger.logActivity(
        {
          category: 'MENU',
          action: 'MENU_UPDATED',
          title: `Menu Item Updated: ${updated.name}`,
          description: `Updated details for "${updated.name}" (${updated.category}, ₹${updated.price}).`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { id: updated.id, name: updated.name, price: updated.price }
        },
        io
      );

      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Toggle availability
  router.patch('/:id/toggle-availability', (req, res) => {
    try {
      const updated = MenuService.toggleAvailability(req.params.id);
      io.emit('menu:updated', { type: 'AVAILABILITY_TOGGLED', item: updated });

      ActivityLogger.logActivity(
        {
          category: 'MENU',
          action: 'MENU_AVAILABILITY_TOGGLED',
          title: `Dish Availability: ${updated.name} is ${updated.is_available ? 'AVAILABLE' : 'OUT OF STOCK'}`,
          description: `"${updated.name}" marked as ${updated.is_available ? 'Available for ordering' : '86ed / Unavailable'}.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: updated.is_available ? 'SUCCESS' : 'WARNING',
          metadata: { id: updated.id, isAvailable: updated.is_available }
        },
        io
      );

      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Toggle featured status (Top / Featured dish in hero slider)
  router.patch('/:id/toggle-featured', (req, res) => {
    try {
      const updated = MenuService.toggleFeatured(req.params.id);
      io.emit('menu:updated', { type: 'FEATURED_TOGGLED', item: updated });

      ActivityLogger.logActivity(
        {
          category: 'MENU',
          action: 'MENU_FEATURED_TOGGLED',
          title: `Featured Dish: ${updated.name} is ${updated.is_featured ? 'FEATURED' : 'STANDARD'}`,
          description: `"${updated.name}" ${updated.is_featured ? 'added to Top Dishes Slider' : 'removed from Top Dishes Slider'}.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { id: updated.id, isFeatured: updated.is_featured }
        },
        io
      );

      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Toggle Send to Kitchen status (Requires kitchen prep or not)
  router.patch('/:id/toggle-kitchen', (req, res) => {
    try {
      const updated = MenuService.toggleKitchenPrep(req.params.id);
      io.emit('menu:updated', { type: 'KITCHEN_TOGGLED', item: updated });

      ActivityLogger.logActivity(
        {
          category: 'MENU',
          action: 'MENU_KITCHEN_TOGGLED',
          title: `Kitchen Routing: ${updated.name}`,
          description: `"${updated.name}" kitchen preparation flag set to ${updated.send_to_kitchen ? 'SEND TO KITCHEN (ON)' : 'DO NOT SEND TO KITCHEN (OFF)'}.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { id: updated.id, sendToKitchen: updated.send_to_kitchen }
        },
        io
      );

      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
