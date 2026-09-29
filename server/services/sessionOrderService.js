import { db } from '../db.js';
import { TableService } from './tableService.js';
import { MenuService } from './menuService.js';

export const SessionOrderService = {
  // Get active session or initialize a new one for a table
  getOrCreateActiveSession(tableId, customerName = 'Guest Customer') {
    const table = TableService.getTableById(tableId);

    // If an ACTIVE session exists on this table, return it (Family ordering under ONE session)
    let session = db.prepare(`
      SELECT * FROM table_sessions
      WHERE table_id = ? AND status = 'ACTIVE'
      ORDER BY id DESC LIMIT 1
    `).get(table.id);

    if (!session) {
      const today = new Date().toISOString().split('T')[0];
      const sessionCode = `KK-T${table.table_number}-${Date.now().toString().slice(-4)}`;

      // Find assigned waiter for today
      const assignment = db.prepare(`
        SELECT waiter_id FROM table_assignments
        WHERE table_id = ? AND date = ?
      `).get(table.id, today);

      const waiterId = assignment?.waiter_id || null;

      const res = db.prepare(`
        INSERT INTO table_sessions (table_id, session_code, customer_name, waiter_id, status, subtotal, discount_type, discount_value, final_total)
        VALUES (?, ?, ?, ?, 'ACTIVE', 0.0, 'NONE', 0.0, 0.0)
      `).run(table.id, sessionCode, customerName, waiterId);

      session = db.prepare('SELECT * FROM table_sessions WHERE id = ?').get(res.lastInsertRowid);
    }

    return this.getSessionDetails(session.id);
  },

  getSessionDetails(sessionId) {
    const session = db.prepare(`
      SELECT s.*, t.table_number, st.name as waiter_name, st.phone as waiter_phone
      FROM table_sessions s
      JOIN tables t ON s.table_id = t.id
      LEFT JOIN staff st ON s.waiter_id = st.id
      WHERE s.id = ?
    `).get(sessionId);

    if (!session) {
      throw new Error(`Session #${sessionId} not found.`);
    }

    const orders = db.prepare(`
      SELECT id, session_id, table_id, placed_by_name, waiter_id, status, total_amount, created_at, confirmed_at, cooking_at, ready_at, served_at
      FROM orders
      WHERE session_id = ?
      ORDER BY id ASC
    `).all(sessionId);

    for (const ord of orders) {
      ord.items = db.prepare(`
        SELECT oi.id, oi.order_id, oi.session_id, oi.menu_item_id, oi.item_name, oi.unit_price, oi.quantity, oi.subtotal, oi.is_manual, oi.added_by,
               COALESCE(m.send_to_kitchen, 1) as send_to_kitchen, m.category, m.is_veg
        FROM order_items oi
        LEFT JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.order_id = ?
      `).all(ord.id);
    }

    const activeServiceReq = db.prepare(`
      SELECT id, status, requested_at
      FROM service_requests
      WHERE session_id = ? AND status = 'PENDING'
      ORDER BY id DESC LIMIT 1
    `).get(sessionId);

    // 60-Second Bell Icon Lock Check
    const latestReq = db.prepare(`
      SELECT requested_at FROM service_requests
      WHERE table_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(session.table_id);

    let bellLockSecondsRemaining = 0;
    if (latestReq) {
      const raw = latestReq.requested_at;
      const lastTime = new Date(raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z').getTime();
      const elapsedSeconds = (Date.now() - lastTime) / 1000;
      if (elapsedSeconds >= 0 && elapsedSeconds < 60) {
        bellLockSecondsRemaining = Math.ceil(60 - elapsedSeconds);
      }
    }

    return {
      ...session,
      callingWaiter: !!activeServiceReq,
      activeServiceReq,
      bellLockSecondsRemaining,
      orders
    };
  },

  // Recalculates subtotal and final_total considering discount
  recalculateSessionTotals(sessionId) {
    const session = db.prepare('SELECT * FROM table_sessions WHERE id = ?').get(sessionId);
    if (!session) return;

    // Sum of all order items in this session
    const sumRow = db.prepare(`
      SELECT COALESCE(SUM(subtotal), 0) as subtotal
      FROM order_items
      WHERE session_id = ?
    `).get(sessionId);

    const subtotal = sumRow?.subtotal || 0;
    let discountVal = 0;

    if (session.discount_type === 'PERCENTAGE') {
      discountVal = Math.round((subtotal * session.discount_value) / 100);
    } else if (session.discount_type === 'FIXED') {
      discountVal = Math.min(session.discount_value, subtotal);
    }

    const finalTotal = Math.max(0, subtotal - discountVal);

    db.prepare(`
      UPDATE table_sessions
      SET subtotal = ?, final_total = ?
      WHERE id = ?
    `).run(subtotal, finalTotal, sessionId);
  },

  // Customer places an order: NO waiter confirmation required; starts in 'RECEIVED' status
  placeCustomerOrder(tableId, placedByName, items) {
    // 1. Check if restaurant is open
    const settings = TableService.getRestaurantSettings();
    if (!settings.is_open) {
      throw new Error(`K K's Food House is currently CLOSED (${settings.opening_time} - ${settings.closing_time}). Ordering is not allowed.`);
    }

    if (!items || items.length === 0) {
      throw new Error('Order must contain at least one item.');
    }

    const table = TableService.getTableById(tableId);
    const guestLabel = placedByName && placedByName.trim() ? placedByName.trim() : 'Table Guest';
    const session = this.getOrCreateActiveSession(table.id, guestLabel);

    // Calculate order total
    let orderTotal = 0;
    const validatedItems = [];

    for (const it of items) {
      const menuItem = MenuService.getMenuItemById(it.menuItemId);
      if (!menuItem.is_available) {
        throw new Error(`Item "${menuItem.name}" is currently unavailable.`);
      }
      const qty = parseInt(it.quantity) || 1;
      const sub = menuItem.price * qty;
      orderTotal += sub;
      validatedItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: qty,
        subtotal: sub,
        sendToKitchen: menuItem.send_to_kitchen !== undefined ? menuItem.send_to_kitchen : 1
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const assignment = db.prepare(`
      SELECT waiter_id FROM table_assignments WHERE table_id = ? AND date = ?
    `).get(table.id, today);

    const waiterId = assignment?.waiter_id || session.waiter_id || null;

    // Create Order with status RECEIVED (Immediate registration without waiter block)
    const insertOrder = db.prepare(`
      INSERT INTO orders (session_id, table_id, placed_by_name, waiter_id, status, total_amount)
      VALUES (?, ?, ?, ?, 'RECEIVED', ?)
    `);

    const orderRes = insertOrder.run(session.id, table.id, guestLabel, waiterId, orderTotal);
    const orderId = orderRes.lastInsertRowid;

    // Insert order items
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, session_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_manual, added_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Customer')
    `);

    for (const vIt of validatedItems) {
      insertItem.run(orderId, session.id, vIt.menuItemId, vIt.name, vIt.price, vIt.quantity, vIt.subtotal);
    }

    this.recalculateSessionTotals(session.id);
    return {
      session: this.getSessionDetails(session.id),
      orderId,
      orderStatus: 'RECEIVED'
    };
  },

  // Waiter records physical kitchen progress:
  // ORDER RECEIVED -> READY TO COOK -> COOKING (leaves active KDS) -> READY TO SERVE -> SERVED
  updateOrderStatus(orderId, nextStatus, staffActor = 'Waiter') {
    const validStatuses = ['RECEIVED', 'READY_TO_COOK', 'COOKING', 'READY_TO_SERVE', 'SERVED', 'PENDING', 'CONFIRMED'];
    if (!validStatuses.includes(nextStatus)) {
      throw new Error(`Invalid order status: ${nextStatus}`);
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order not found.');

    let extraSet = '';
    if (nextStatus === 'COOKING') extraSet = ', cooking_at = CURRENT_TIMESTAMP';
    else if (nextStatus === 'READY_TO_SERVE') extraSet = ', ready_at = CURRENT_TIMESTAMP';
    else if (nextStatus === 'SERVED') extraSet = ', served_at = CURRENT_TIMESTAMP';

    db.prepare(`
      UPDATE orders
      SET status = ? ${extraSet}
      WHERE id = ?
    `).run(nextStatus, orderId);

    return {
      orderId,
      status: nextStatus,
      session: this.getSessionDetails(order.session_id)
    };
  },

  // Legacy waiter confirm order support (maps to READY_TO_COOK)
  confirmOrder(orderId, waiterId) {
    return this.updateOrderStatus(orderId, 'READY_TO_COOK', 'Waiter').session;
  },

  // Waiter marks order served
  markOrderServed(orderId) {
    return this.updateOrderStatus(orderId, 'SERVED', 'Waiter').session;
  },

  // Order Editing: Add item to an active order (Waiter & Manager)
  addOrderItemToOrder(orderId, menuItemId, quantity = 1, actorName = 'Staff') {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order not found.');

    const menuItem = MenuService.getMenuItemById(menuItemId);
    const qty = parseInt(quantity, 10) || 1;
    const subtotal = menuItem.price * qty;

    // Check if item already exists in this order
    const existing = db.prepare(`
      SELECT id, quantity, subtotal FROM order_items
      WHERE order_id = ? AND menu_item_id = ?
    `).get(orderId, menuItem.id);

    if (existing) {
      const newQty = existing.quantity + qty;
      const newSub = menuItem.price * newQty;
      db.prepare('UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?').run(newQty, newSub, existing.id);
    } else {
      db.prepare(`
        INSERT INTO order_items (order_id, session_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_manual, added_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(orderId, order.session_id, menuItem.id, menuItem.name, menuItem.price, qty, subtotal, actorName);
    }

    const newTotal = db.prepare('SELECT SUM(subtotal) as total FROM order_items WHERE order_id = ?').get(orderId).total || 0;
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(newTotal, orderId);

    this.recalculateSessionTotals(order.session_id);
    return this.getSessionDetails(order.session_id);
  },

  // Order Editing: Update item quantity in an order (Waiter & Manager)
  updateOrderItemQuantity(orderItemId, quantity, actorName = 'Staff') {
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId);
    if (!item) throw new Error('Order item not found.');

    const qty = parseInt(quantity, 10);
    if (qty <= 0) {
      return this.removeOrderItem(orderItemId);
    }

    const subtotal = item.unit_price * qty;
    db.prepare('UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?').run(qty, subtotal, orderItemId);

    const newTotal = db.prepare('SELECT SUM(subtotal) as total FROM order_items WHERE order_id = ?').get(item.order_id).total || 0;
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(newTotal, item.order_id);

    this.recalculateSessionTotals(item.session_id);
    return this.getSessionDetails(item.session_id);
  },

  // Kitchen Display Queue (KDS Feed)
  // Shows ONLY active orders where items require kitchen prep (send_to_kitchen = 1)
  // And status is 'RECEIVED' or 'READY_TO_COOK'. Once 'COOKING', it clears from active queue!
  getActiveKitchenOrders() {
    const orders = db.prepare(`
      SELECT o.id, o.session_id, o.table_id, o.placed_by_name, o.waiter_id, o.status,
             o.total_amount, o.created_at, o.confirmed_at, o.cooking_at,
             t.table_number, s.session_code, s.customer_name as family_name,
             st.name as waiter_name
      FROM orders o
      JOIN table_sessions s ON o.session_id = s.id
      JOIN tables t ON o.table_id = t.id
      LEFT JOIN staff st ON o.waiter_id = st.id
      WHERE s.status = 'ACTIVE' AND o.status IN ('RECEIVED', 'READY_TO_COOK')
      ORDER BY o.id ASC
    `).all();

    const kitchenOrders = [];

    for (const ord of orders) {
      const kitchenItems = db.prepare(`
        SELECT oi.id, oi.menu_item_id, oi.item_name, oi.unit_price, oi.quantity, oi.subtotal,
               m.category, m.is_veg, COALESCE(m.send_to_kitchen, 1) as send_to_kitchen
        FROM order_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.order_id = ? AND COALESCE(m.send_to_kitchen, 1) = 1
      `).all(ord.id);

      // Only include orders that have items requiring kitchen preparation
      if (kitchenItems.length > 0) {
        kitchenOrders.push({
          ...ord,
          items: kitchenItems,
          kitchenItemsCount: kitchenItems.reduce((acc, it) => acc + it.quantity, 0)
        });
      }
    }

    return kitchenOrders;
  },

  // Customer taps BELL ICON -> Send real-time service request to assigned Waiter with 30s cooldown
  requestWaiterService(tableId) {
    const table = TableService.getTableById(tableId);
    const session = db.prepare('SELECT * FROM table_sessions WHERE table_id = ? AND status = "ACTIVE"').get(table.id);
    if (!session) {
      throw new Error('No active table session found.');
    }

    // Check 60-second Bell Icon Lock
    const latestReq = db.prepare(`
      SELECT requested_at FROM service_requests
      WHERE table_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(table.id);

    if (latestReq) {
      const raw = latestReq.requested_at;
      const lastTime = new Date(raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z').getTime();
      const elapsedSeconds = (Date.now() - lastTime) / 1000;
      if (elapsedSeconds >= 0 && elapsedSeconds < 60) {
        const remaining = Math.ceil(60 - elapsedSeconds);
        const err = new Error(`Please wait ${remaining} seconds before calling the waiter again.`);
        err.cooldownRemaining = remaining;
        throw err;
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const assignment = db.prepare(`
      SELECT waiter_id FROM table_assignments WHERE table_id = ? AND date = ?
    `).get(table.id, today);

    const waiterId = assignment?.waiter_id || session.waiter_id || 1;
    const nowIso = new Date().toISOString();

    const res = db.prepare(`
      INSERT INTO service_requests (session_id, table_id, waiter_id, status, requested_at)
      VALUES (?, ?, ?, 'PENDING', ?)
    `).run(session.id, table.id, waiterId, nowIso);

    return {
      serviceRequestId: res.lastInsertRowid,
      tableNumber: table.table_number,
      waiterId,
      session: this.getSessionDetails(session.id)
    };
  },

  // Waiter resolves service request
  resolveServiceRequest(serviceRequestId) {
    db.prepare(`
      UPDATE service_requests
      SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(serviceRequestId);

    const req = db.prepare('SELECT session_id FROM service_requests WHERE id = ?').get(serviceRequestId);
    return req ? this.getSessionDetails(req.session_id) : null;
  },

  // Manager ONLY: Quick add manual/off-app item by Food Item ID & Quantity
  addManualItemByFoodId(tableId, foodItemId, quantity = 1, managerName = 'Manager') {
    const table = TableService.getTableById(tableId);
    const session = this.getOrCreateActiveSession(table.id, 'Counter Guest');
    const menuItem = MenuService.getMenuItemById(foodItemId);

    const qty = parseInt(quantity) || 1;
    const subtotal = menuItem.price * qty;

    // Find or create a manager manual order within this session
    let manualOrder = db.prepare(`
      SELECT id FROM orders
      WHERE session_id = ? AND placed_by_name = 'Manager (Manual)'
      ORDER BY id DESC LIMIT 1
    `).get(session.id);

    let orderId;
    if (manualOrder) {
      orderId = manualOrder.id;
      db.prepare('UPDATE orders SET total_amount = total_amount + ? WHERE id = ?').run(subtotal, orderId);
    } else {
      const res = db.prepare(`
        INSERT INTO orders (session_id, table_id, placed_by_name, waiter_id, status, total_amount)
        VALUES (?, ?, 'Manager (Manual)', ?, 'CONFIRMED', ?)
      `).run(session.id, table.id, session.waiter_id, subtotal);
      orderId = res.lastInsertRowid;
    }

    db.prepare(`
      INSERT INTO order_items (order_id, session_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_manual, added_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(orderId, session.id, menuItem.id, menuItem.name, menuItem.price, qty, subtotal, managerName);

    this.recalculateSessionTotals(session.id);
    return this.getSessionDetails(session.id);
  },

  // Manager ONLY: Remove item from session
  removeOrderItem(orderItemId) {
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId);
    if (!item) throw new Error('Order item not found.');

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(item.order_id);

    db.prepare('DELETE FROM order_items WHERE id = ?').run(orderItemId);

    // Check if order has any items left
    const remainingItems = db.prepare('SELECT COUNT(*) as count FROM order_items WHERE order_id = ?').get(item.order_id).count;
    if (remainingItems === 0) {
      db.prepare('DELETE FROM orders WHERE id = ?').run(item.order_id);
    } else {
      const newOrderTotal = db.prepare('SELECT SUM(subtotal) as total FROM order_items WHERE order_id = ?').get(item.order_id).total;
      db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(newOrderTotal, item.order_id);
    }

    this.recalculateSessionTotals(item.session_id);
    return this.getSessionDetails(item.session_id);
  },

  // Manager ONLY: Apply discount to table session
  applyDiscount(sessionId, discountType, discountValue) {
    if (!['NONE', 'PERCENTAGE', 'FIXED'].includes(discountType)) {
      throw new Error('Invalid discount type. Must be PERCENTAGE or FIXED or NONE.');
    }

    const session = db.prepare('SELECT * FROM table_sessions WHERE id = ?').get(sessionId);
    if (!session) throw new Error('Session not found.');

    const val = parseFloat(discountValue) || 0;

    if (discountType === 'PERCENTAGE' && (val < 0 || val > 100)) {
      throw new Error('Percentage discount must be between 0% and 100%.');
    }

    if (discountType === 'FIXED' && val > session.subtotal) {
      throw new Error(`Fixed discount (₹${val}) cannot exceed subtotal (₹${session.subtotal}).`);
    }

    db.prepare(`
      UPDATE table_sessions
      SET discount_type = ?, discount_value = ?
      WHERE id = ?
    `).run(discountType, val, sessionId);

    this.recalculateSessionTotals(sessionId);
    return this.getSessionDetails(sessionId);
  },

  // Get orders assigned to a specific waiter for today
  getWaiterOrders(waiterId) {
    const today = new Date().toISOString().split('T')[0];

    // Waiter's assigned table numbers for today with active session status
    const assignedTables = db.prepare(`
      SELECT t.id, t.table_number, t.capacity,
             s.id as active_session_id, s.session_code, s.customer_name as active_customer_name,
             s.subtotal, s.final_total,
             CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END as has_active_session
      FROM table_assignments ta
      JOIN tables t ON ta.table_id = t.id
      LEFT JOIN table_sessions s ON t.id = s.table_id AND s.status = 'ACTIVE'
      WHERE ta.waiter_id = ? AND ta.date = ?
      ORDER BY t.table_number ASC
    `).all(waiterId, today);

    const tableIds = assignedTables.map(t => t.id);
    if (tableIds.length === 0) return { assignedTables, orders: [], serviceRequests: [] };

    const placeholders = tableIds.map(() => '?').join(',');

    const activeOrders = db.prepare(`
      SELECT o.*, t.table_number, s.session_code, s.customer_name as family_name
      FROM orders o
      JOIN table_sessions s ON o.session_id = s.id
      JOIN tables t ON o.table_id = t.id
      WHERE o.table_id IN (${placeholders}) AND s.status = 'ACTIVE'
      ORDER BY CASE
        WHEN o.status = 'READY_TO_SERVE' THEN 1
        WHEN o.status = 'RECEIVED' OR o.status = 'PENDING' THEN 2
        WHEN o.status = 'READY_TO_COOK' THEN 3
        WHEN o.status = 'COOKING' THEN 4
        ELSE 5
      END, o.id DESC
    `).all(...tableIds);

    for (const ord of activeOrders) {
      ord.items = db.prepare(`
        SELECT oi.id, oi.menu_item_id, oi.item_name, oi.unit_price, oi.quantity, oi.subtotal, oi.is_manual,
               COALESCE(mi.send_to_kitchen, 1) as send_to_kitchen
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ?
      `).all(ord.id);
    }

    const serviceRequests = db.prepare(`
      SELECT sr.*, t.table_number
      FROM service_requests sr
      JOIN tables t ON sr.table_id = t.id
      WHERE sr.table_id IN (${placeholders}) AND sr.status = 'PENDING'
      ORDER BY sr.id DESC
    `).all(...tableIds);

    return {
      assignedTables,
      orders: activeOrders,
      serviceRequests
    };
  }
};
