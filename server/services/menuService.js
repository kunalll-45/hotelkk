import { db } from '../db.js';
import { deleteImageFromS3 } from './s3Service.js';

export const MenuService = {
  getAllMenuItems(onlyAvailable = false) {
    let query = 'SELECT * FROM menu_items';
    if (onlyAvailable) {
      query += ' WHERE is_available = 1';
    }
    query += ' ORDER BY category ASC, id ASC';

    return db.prepare(query).all();
  },

  getMenuItemById(id) {
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    if (!item) {
      throw new Error(`Food Item with ID #${id} not found.`);
    }
    return item;
  },

  getCategories() {
    const rows = db.prepare('SELECT DISTINCT category FROM menu_items ORDER BY category ASC').all();
    return rows.map(r => r.category);
  },

  createMenuItem({ name, category, price, isVeg = 1, description = '', imageUrl = '', isFeatured = 0, sendToKitchen = 1 }) {
    if (!name || !category || price === undefined) {
      throw new Error('Name, category, and price are required.');
    }

    // Auto sequential Food Item ID
    const maxIdRow = db.prepare('SELECT MAX(id) as maxId FROM menu_items').get();
    const nextId = (maxIdRow?.maxId || 0) + 1;

    db.prepare(`
      INSERT INTO menu_items (id, name, category, price, is_available, is_veg, description, image_url, is_featured, send_to_kitchen)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      nextId,
      name,
      category,
      parseFloat(price),
      isVeg ? 1 : 0,
      description,
      imageUrl,
      isFeatured ? 1 : 0,
      sendToKitchen !== undefined ? (sendToKitchen ? 1 : 0) : 1
    );

    return this.getMenuItemById(nextId);
  },

  updateMenuItem(id, { name, category, price, isAvailable, isVeg, description, imageUrl, isFeatured, sendToKitchen }) {
    const existing = this.getMenuItemById(id);

    db.prepare(`
      UPDATE menu_items
      SET name = ?, category = ?, price = ?, is_available = ?, is_veg = ?, description = ?, image_url = ?, is_featured = ?, send_to_kitchen = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      category ?? existing.category,
      price !== undefined ? parseFloat(price) : existing.price,
      isAvailable !== undefined ? (isAvailable ? 1 : 0) : existing.is_available,
      isVeg !== undefined ? (isVeg ? 1 : 0) : existing.is_veg,
      description ?? existing.description,
      imageUrl ?? existing.image_url,
      isFeatured !== undefined ? (isFeatured ? 1 : 0) : (existing.is_featured || 0),
      sendToKitchen !== undefined ? (sendToKitchen ? 1 : 0) : (existing.send_to_kitchen ?? 1),
      id
    );

    // Safely cleanup old S3 image if replaced with a new one and not referenced elsewhere
    if (imageUrl && existing.image_url && existing.image_url !== imageUrl) {
      try {
        const otherCount = db.prepare('SELECT COUNT(*) as cnt FROM menu_items WHERE image_url = ? AND id != ?').get(existing.image_url, id)?.cnt || 0;
        let offerCount = 0;
        try {
          offerCount = db.prepare('SELECT COUNT(*) as cnt FROM offers WHERE image_url = ?').get(existing.image_url)?.cnt || 0;
        } catch (e) { /* ignore if offers table is absent */ }

        if (otherCount === 0 && offerCount === 0) {
          deleteImageFromS3(existing.image_url).catch(err => {
            console.warn(`Old S3 image cleanup notice for '${existing.image_url}':`, err.message);
          });
        }
      } catch (checkErr) {
        console.warn('Error during image reference check:', checkErr.message);
      }
    }

    return this.getMenuItemById(id);
  },

  deleteMenuItem(id) {
    const existing = this.getMenuItemById(id);

    db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);

    // Safely delete S3 image if not referenced by any other item or offer
    if (existing.image_url) {
      try {
        const otherCount = db.prepare('SELECT COUNT(*) as cnt FROM menu_items WHERE image_url = ?').get(existing.image_url)?.cnt || 0;
        let offerCount = 0;
        try {
          offerCount = db.prepare('SELECT COUNT(*) as cnt FROM offers WHERE image_url = ?').get(existing.image_url)?.cnt || 0;
        } catch (e) { /* ignore */ }

        if (otherCount === 0 && offerCount === 0) {
          deleteImageFromS3(existing.image_url).catch(err => {
            console.warn(`S3 image delete notice for '${existing.image_url}':`, err.message);
          });
        }
      } catch (checkErr) {
        console.warn('Error during image reference check on delete:', checkErr.message);
      }
    }

    return existing;
  },

  toggleAvailability(id) {
    const item = this.getMenuItemById(id);
    const newStatus = item.is_available ? 0 : 1;

    db.prepare('UPDATE menu_items SET is_available = ? WHERE id = ?').run(newStatus, id);
    return { ...item, is_available: newStatus };
  },

  toggleFeatured(id) {
    const item = this.getMenuItemById(id);
    const newStatus = item.is_featured ? 0 : 1;

    db.prepare('UPDATE menu_items SET is_featured = ? WHERE id = ?').run(newStatus, id);
    return { ...item, is_featured: newStatus };
  },

  toggleKitchenPrep(id) {
    const item = this.getMenuItemById(id);
    const current = item.send_to_kitchen !== undefined ? item.send_to_kitchen : 1;
    const newStatus = current ? 0 : 1;

    db.prepare('UPDATE menu_items SET send_to_kitchen = ? WHERE id = ?').run(newStatus, id);
    return { ...item, send_to_kitchen: newStatus };
  }
};
