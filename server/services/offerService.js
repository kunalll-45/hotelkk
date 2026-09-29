import { db } from '../db.js';

export const OfferService = {
  // Helper to parse date string into epoch time
  parseTime(dtStr) {
    if (!dtStr) return 0;
    const clean = dtStr.includes('T') ? dtStr : dtStr.replace(' ', 'T');
    return new Date(clean).getTime();
  },

  // Computes real-time offer status: DRAFT | SCHEDULED | ACTIVE | EXPIRED
  computeOfferStatus(offer) {
    if (!offer.is_active) return 'DRAFT';

    const now = Date.now();
    const start = this.parseTime(offer.start_datetime);
    const end = this.parseTime(offer.end_datetime);

    if (now < start) return 'SCHEDULED';
    if (now > end) return 'EXPIRED';
    return 'ACTIVE';
  },

  // Get all offers (for manager management console)
  getAllOffers() {
    const rows = db.prepare(`
      SELECT o.*,
             m1.name as target_item_name, m1.price as target_item_price, m1.image_url as target_item_image,
             m2.name as free_item_name, m2.price as free_item_price
      FROM offers o
      LEFT JOIN menu_items m1 ON o.target_menu_item_id = m1.id
      LEFT JOIN menu_items m2 ON o.free_menu_item_id = m2.id
      ORDER BY o.id DESC
    `).all();

    return rows.map((r) => ({
      ...r,
      status: this.computeOfferStatus(r),
      // Fallback image logic: uploaded image -> target menu item image -> default fallback
      effective_image:
        r.image_url ||
        r.target_item_image ||
        'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=800&auto=format&fit=crop&q=80'
    }));
  },

  // Get promotional offers for Customer Homepage & Banner Carousel
  // Returns both ACTIVE and SCHEDULED (Upcoming with "Coming Soon")
  getPromotionalOffers() {
    const all = this.getAllOffers();
    return all.filter((o) => o.is_active && (o.status === 'ACTIVE' || o.status === 'SCHEDULED'));
  },

  // Get single offer by ID
  getOfferById(id) {
    const offer = db.prepare(`
      SELECT o.*,
             m1.name as target_item_name, m1.price as target_item_price, m1.image_url as target_item_image,
             m2.name as free_item_name, m2.price as free_item_price
      FROM offers o
      LEFT JOIN menu_items m1 ON o.target_menu_item_id = m1.id
      LEFT JOIN menu_items m2 ON o.free_menu_item_id = m2.id
      WHERE o.id = ?
    `).get(id);

    if (!offer) throw new Error('Offer not found.');

    return {
      ...offer,
      status: this.computeOfferStatus(offer),
      effective_image:
        offer.image_url ||
        offer.target_item_image ||
        'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=800&auto=format&fit=crop&q=80'
    };
  },

  // Create new promotional offer
  createOffer(data, creatorName = 'Manager') {
    const {
      title,
      description = '',
      offerType = 'PERCENTAGE',
      discountValue = 0,
      targetMenuItemId = null,
      freeMenuItemId = null,
      buyQty = 1,
      getQty = 1,
      minOrderAmount = 0,
      startDatetime,
      endDatetime,
      bannerTag = 'Special Offer',
      imageUrl = ''
    } = data;

    if (!title || !title.trim()) {
      throw new Error('Offer title is required.');
    }

    if (!['PERCENTAGE', 'FLAT', 'FREE_ITEM', 'SPECIAL_PRICE', 'BOGO'].includes(offerType)) {
      throw new Error('Invalid offer type.');
    }

    if (!startDatetime || !endDatetime) {
      throw new Error('Start date/time and End date/time are required.');
    }

    const start = this.parseTime(startDatetime);
    const end = this.parseTime(endDatetime);
    if (end <= start) {
      throw new Error('End date/time must be strictly after the start date/time.');
    }

    const res = db.prepare(`
      INSERT INTO offers (
        title, description, offer_type, discount_value, target_menu_item_id,
        free_menu_item_id, buy_qty, get_qty, min_order_amount,
        start_datetime, end_datetime, is_active, banner_tag, image_url, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      title.trim(),
      description.trim(),
      offerType,
      parseFloat(discountValue) || 0,
      targetMenuItemId ? parseInt(targetMenuItemId, 10) : null,
      freeMenuItemId ? parseInt(freeMenuItemId, 10) : null,
      parseInt(buyQty, 10) || 1,
      parseInt(getQty, 10) || 1,
      parseFloat(minOrderAmount) || 0,
      startDatetime,
      endDatetime,
      bannerTag || 'Special Offer',
      imageUrl || '',
      creatorName
    );

    return this.getOfferById(res.lastInsertRowid);
  },

  // Update existing offer
  updateOffer(id, data) {
    const existing = this.getOfferById(id);

    const title = data.title !== undefined ? data.title.trim() : existing.title;
    const description = data.description !== undefined ? data.description.trim() : existing.description;
    const offerType = data.offerType || existing.offer_type;
    const discountValue = data.discountValue !== undefined ? parseFloat(data.discountValue) : existing.discount_value;
    const targetMenuItemId = data.targetMenuItemId !== undefined ? (data.targetMenuItemId ? parseInt(data.targetMenuItemId, 10) : null) : existing.target_menu_item_id;
    const freeMenuItemId = data.freeMenuItemId !== undefined ? (data.freeMenuItemId ? parseInt(data.freeMenuItemId, 10) : null) : existing.free_menu_item_id;
    const buyQty = data.buyQty !== undefined ? parseInt(data.buyQty, 10) : existing.buy_qty;
    const getQty = data.getQty !== undefined ? parseInt(data.getQty, 10) : existing.get_qty;
    const minOrderAmount = data.minOrderAmount !== undefined ? parseFloat(data.minOrderAmount) : existing.min_order_amount;
    const startDatetime = data.startDatetime || existing.start_datetime;
    const endDatetime = data.endDatetime || existing.end_datetime;
    const bannerTag = data.bannerTag !== undefined ? data.bannerTag : existing.banner_tag;
    const imageUrl = data.imageUrl !== undefined ? data.imageUrl : existing.image_url;

    const start = this.parseTime(startDatetime);
    const end = this.parseTime(endDatetime);
    if (end <= start) {
      throw new Error('End date/time must be strictly after the start date/time.');
    }

    db.prepare(`
      UPDATE offers
      SET title = ?, description = ?, offer_type = ?, discount_value = ?,
          target_menu_item_id = ?, free_menu_item_id = ?, buy_qty = ?, get_qty = ?,
          min_order_amount = ?, start_datetime = ?, end_datetime = ?,
          banner_tag = ?, image_url = ?
      WHERE id = ?
    `).run(
      title,
      description,
      offerType,
      discountValue,
      targetMenuItemId,
      freeMenuItemId,
      buyQty,
      getQty,
      minOrderAmount,
      startDatetime,
      endDatetime,
      bannerTag,
      imageUrl,
      id
    );

    return this.getOfferById(id);
  },

  // Toggle active/inactive
  toggleOffer(id) {
    const offer = this.getOfferById(id);
    const nextState = offer.is_active ? 0 : 1;
    db.prepare('UPDATE offers SET is_active = ? WHERE id = ?').run(nextState, id);
    return this.getOfferById(id);
  },

  // Delete offer
  deleteOffer(id) {
    this.getOfferById(id);
    db.prepare('DELETE FROM offers WHERE id = ?').run(id);
    return { success: true, id };
  },

  // Backend Source of Truth: Revalidate offer when confirming/billing order
  validateOfferForBilling(offerId, subtotal = 0, items = []) {
    if (!offerId) return null;

    const offer = this.getOfferById(offerId);
    if (!offer) {
      throw new Error('Offer does not exist.');
    }

    if (!offer.is_active) {
      throw new Error(`The offer "${offer.title}" has been disabled by the restaurant.`);
    }

    const status = this.computeOfferStatus(offer);
    if (status === 'SCHEDULED') {
      throw new Error(`The promotional offer "${offer.title}" is scheduled to start on ${offer.start_datetime} and cannot be used before its activation time.`);
    }

    if (status === 'EXPIRED') {
      throw new Error(`The promotional offer "${offer.title}" has expired.`);
    }

    if (offer.min_order_amount > 0 && subtotal < offer.min_order_amount) {
      throw new Error(`This offer requires a minimum order subtotal of ₹${offer.min_order_amount} (current subtotal: ₹${subtotal}).`);
    }

    let discountAmount = 0;

    if (offer.offer_type === 'PERCENTAGE') {
      discountAmount = Math.round((subtotal * offer.discount_value) / 100);
    } else if (offer.offer_type === 'FLAT') {
      discountAmount = Math.min(offer.discount_value, subtotal);
    } else if (offer.offer_type === 'SPECIAL_PRICE') {
      if (offer.target_menu_item_id) {
        const matchingItem = items.find((i) => (i.menu_item_id || i.menuItemId || i.id) === offer.target_menu_item_id);
        if (!matchingItem) {
          throw new Error(`This special price offer applies only to "${offer.target_item_name || 'selected item'}".`);
        }
        const regularPrice = offer.target_item_price || matchingItem.price || matchingItem.unit_price || 0;
        const perItemDiscount = Math.max(0, regularPrice - offer.discount_value);
        discountAmount = perItemDiscount * (matchingItem.quantity || 1);
      } else {
        discountAmount = Math.min(offer.discount_value, subtotal);
      }
    } else if (offer.offer_type === 'BOGO') {
      if (offer.target_menu_item_id) {
        const matchingItem = items.find((i) => (i.menu_item_id || i.menuItemId || i.id) === offer.target_menu_item_id);
        const qty = matchingItem?.quantity || 0;
        if (qty < offer.buy_qty + offer.get_qty) {
          throw new Error(`Buy ${offer.buy_qty} Get ${offer.get_qty} requires at least ${offer.buy_qty + offer.get_qty} items of "${offer.target_item_name}".`);
        }
        const itemPrice = offer.target_item_price || matchingItem.price || matchingItem.unit_price || 0;
        discountAmount = itemPrice * offer.get_qty;
      }
    } else if (offer.offer_type === 'FREE_ITEM') {
      if (offer.free_menu_item_price) {
        discountAmount = offer.free_menu_item_price;
      }
    }

    return {
      valid: true,
      offerId: offer.id,
      title: offer.title,
      offerType: offer.offer_type,
      discountAmount: Math.min(discountAmount, subtotal)
    };
  }
};
