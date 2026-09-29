import express from 'express';
import { SessionOrderService } from '../services/sessionOrderService.js';
import { TableService } from '../services/tableService.js';
import { ActivityLogger } from '../services/activityLogger.js';
import { OfferService } from '../services/offerService.js';

export default function createSessionRouter(io) {
  const router = express.Router();

  // Get active session for table or start a session
  router.get('/table/:tableId', (req, res) => {
    try {
      const session = SessionOrderService.getOrCreateActiveSession(req.params.tableId);
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const session = SessionOrderService.getSessionDetails(req.params.id);
      res.json(session);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Customer places order (Pending until assigned Waiter confirms)
  router.post('/table/:tableId/order', (req, res) => {
    try {
      const { placedByName, items } = req.body;
      const { session, orderId, orderStatus } = SessionOrderService.placeCustomerOrder(req.params.tableId, placedByName, items);

      // Real-time broadcast to Waiter, Manager, Customer, and Kitchen Display
      io.emit('order:placed', {
        tableId: req.params.tableId,
        tableNumber: session.table_number,
        sessionId: session.id,
        orderId,
        orderStatus,
        session,
        placedByName: placedByName || 'Table Guest'
      });

      io.emit('kitchen:queue_updated', SessionOrderService.getActiveKitchenOrders());
      io.emit('tables:updated', TableService.getAllTables());

      // Log activity in Live Hotel Logs
      ActivityLogger.logActivity(
        {
          category: 'ORDER',
          action: 'ORDER_RECEIVED',
          title: `Order #${orderId} Received - Table #${session.table_number}`,
          description: `Full order received from Table #${session.table_number} (${items?.length || 0} items). Sent to Kitchen Display.`,
          tableNumber: session.table_number,
          actorName: placedByName || 'Table Guest',
          actorRole: 'CUSTOMER',
          severity: 'INFO',
          metadata: { orderId, itemCount: items?.length, sessionId: session.id }
        },
        io
      );

      res.status(201).json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Kitchen Display System (KDS) Active Queue Feed (Requirement 8)
  router.get('/kitchen/queue', (req, res) => {
    try {
      const queue = SessionOrderService.getActiveKitchenOrders();
      res.json(queue);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Waiter order status management:
  // ORDER RECEIVED -> READY TO COOK -> COOKING (clears from KDS) -> READY TO SERVE -> SERVED
  router.patch('/order/:orderId/status', (req, res) => {
    try {
      const { status, staffActor = 'Waiter' } = req.body;
      const result = SessionOrderService.updateOrderStatus(req.params.orderId, status, staffActor);

      io.emit('order:status_updated', {
        orderId: req.params.orderId,
        status,
        session: result.session,
        tableNumber: result.session.table_number,
        staffActor
      });

      // Update KDS queue (when COOKING, order automatically clears from active queue)
      io.emit('kitchen:queue_updated', SessionOrderService.getActiveKitchenOrders());
      io.emit('session:updated', result.session);
      io.emit('tables:updated', TableService.getAllTables());

      let logTitle = `Order #${req.params.orderId} Status: ${status}`;
      let logDesc = `Table #${result.session.table_number} order progressed to ${status}.`;
      let severity = 'INFO';

      if (status === 'READY_TO_COOK') {
        logTitle = `Order #${req.params.orderId} Ready to Cook`;
        logDesc = `Waiter queued Table #${result.session.table_number} order for physical kitchen preparation.`;
      } else if (status === 'COOKING') {
        logTitle = `Order #${req.params.orderId} Cooking in Kitchen`;
        logDesc = `Table #${result.session.table_number} food is actively cooking. Cleared from active waiting KDS queue.`;
      } else if (status === 'READY_TO_SERVE') {
        logTitle = `Food Ready to Serve - Table #${result.session.table_number}`;
        logDesc = `Cook completed physical preparation. Customer & staff notified order #${req.params.orderId} is ready to serve.`;
        severity = 'SUCCESS';
      } else if (status === 'SERVED') {
        logTitle = `Order #${req.params.orderId} Served to Table #${result.session.table_number}`;
        logDesc = `Staff served food to Table #${result.session.table_number}. Stored in permanent history.`;
        severity = 'SUCCESS';
      }

      ActivityLogger.logActivity(
        {
          category: 'ORDER',
          action: `ORDER_${status}`,
          title: logTitle,
          description: logDesc,
          tableNumber: result.session.table_number,
          actorName: staffActor,
          actorRole: 'WAITER',
          severity,
          metadata: { orderId: req.params.orderId, status }
        },
        io
      );

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Order Editing: Add item to active order (Waiter & Manager)
  router.post('/order/:orderId/items', (req, res) => {
    try {
      const { menuItemId, quantity = 1, actorName = 'Staff' } = req.body;
      const session = SessionOrderService.addOrderItemToOrder(req.params.orderId, menuItemId, quantity, actorName);

      io.emit('session:updated', session);
      io.emit('kitchen:queue_updated', SessionOrderService.getActiveKitchenOrders());
      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'ORDER',
          action: 'ORDER_EDITED',
          title: `Item Added to Order #${req.params.orderId} (Table #${session.table_number})`,
          description: `${actorName} added item #${menuItemId} (Qty: ${quantity}) to active order.`,
          tableNumber: session.table_number,
          actorName,
          actorRole: 'WAITER',
          severity: 'INFO',
          metadata: { orderId: req.params.orderId, menuItemId, quantity }
        },
        io
      );

      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Order Editing: Update item quantity in an order (Waiter & Manager)
  router.patch('/order-item/:orderItemId', (req, res) => {
    try {
      const { quantity, actorName = 'Staff' } = req.body;
      const session = SessionOrderService.updateOrderItemQuantity(req.params.orderItemId, quantity, actorName);

      io.emit('session:updated', session);
      io.emit('kitchen:queue_updated', SessionOrderService.getActiveKitchenOrders());
      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'ORDER',
          action: 'ORDER_EDITED',
          title: `Order Item Quantity Modified`,
          description: `${actorName} updated item quantity to ${quantity}.`,
          tableNumber: session.table_number,
          actorName,
          actorRole: 'WAITER',
          severity: 'INFO',
          metadata: { orderItemId: req.params.orderItemId, quantity }
        },
        io
      );

      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Order Editing: Remove item from an order (Waiter & Manager)
  router.delete('/order-item/:orderItemId', (req, res) => {
    try {
      const { actorName = 'Staff' } = req.body || {};
      const session = SessionOrderService.removeOrderItem(req.params.orderItemId, actorName);

      io.emit('session:updated', session);
      io.emit('kitchen:queue_updated', SessionOrderService.getActiveKitchenOrders());
      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'ORDER',
          action: 'ORDER_EDITED',
          title: `Order Item Removed`,
          description: `${actorName} removed an item from Table #${session.table_number}'s order.`,
          tableNumber: session.table_number,
          actorName,
          actorRole: 'WAITER',
          severity: 'WARNING',
          metadata: { orderItemId: req.params.orderItemId }
        },
        io
      );

      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Waiter confirms order (legacy compatibility)
  router.post('/order/:orderId/confirm', (req, res) => {
    try {
      const { waiterId } = req.body;
      const session = SessionOrderService.confirmOrder(req.params.orderId, waiterId);

      io.emit('order:confirmed', {
        orderId: req.params.orderId,
        sessionId: session.id,
        tableId: session.table_id,
        session
      });

      io.emit('kitchen:queue_updated', SessionOrderService.getActiveKitchenOrders());
      io.emit('tables:updated', TableService.getAllTables());

      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Waiter marks order served (legacy compatibility)
  router.post('/order/:orderId/served', (req, res) => {
    try {
      const session = SessionOrderService.markOrderServed(req.params.orderId);

      io.emit('order:served', {
        orderId: req.params.orderId,
        sessionId: session.id,
        tableId: session.table_id,
        session
      });

      io.emit('kitchen:queue_updated', SessionOrderService.getActiveKitchenOrders());
      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'ORDER',
          action: 'ORDER_SERVED',
          title: `Order #${req.params.orderId} Served at Table #${session.table_number}`,
          description: `Kitchen items served to guests at Table #${session.table_number}.`,
          tableNumber: session.table_number,
          actorName: 'Kitchen / Waiter',
          actorRole: 'WAITER',
          severity: 'SUCCESS',
          metadata: { orderId: req.params.orderId }
        },
        io
      );

      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Customer Bell / Service Request with 30s Cooldown
  router.post('/table/:tableId/request-service', (req, res) => {
    try {
      const result = SessionOrderService.requestWaiterService(req.params.tableId);

      // Real-time notification to assigned Waiter: "Table X is calling"
      io.emit('waiter:service_request', {
        serviceRequestId: result.serviceRequestId,
        tableNumber: result.tableNumber,
        tableId: req.params.tableId,
        waiterId: result.waiterId,
        timestamp: new Date().toISOString()
      });

      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'SERVICE',
          action: 'CALL_WAITER',
          title: `Table #${result.tableNumber} Calling Waiter!`,
          description: `Customer rang assistance bell at Table #${result.tableNumber}. Waiter notified.`,
          tableNumber: result.tableNumber,
          actorName: 'Table Customer',
          actorRole: 'CUSTOMER',
          severity: 'URGENT',
          metadata: { serviceRequestId: result.serviceRequestId, waiterId: result.waiterId }
        },
        io
      );

      res.json({
        success: true,
        message: 'Assigned Waiter has been notified.',
        tableNumber: result.tableNumber,
        cooldownRemaining: 60,
        session: result.session
      });
    } catch (err) {
      res.status(400).json({
        error: err.message,
        cooldownRemaining: err.cooldownRemaining || 0
      });
    }
  });

  // Waiter resolves service request
  router.post('/service-request/:id/resolve', (req, res) => {
    try {
      const session = SessionOrderService.resolveServiceRequest(req.params.id);

      io.emit('waiter:service_resolved', {
        serviceRequestId: req.params.id,
        session
      });

      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'SERVICE',
          action: 'CALL_RESOLVED',
          title: `Table #${session.table_number} Assistance Resolved`,
          description: `Staff attended to Table #${session.table_number} and completed request.`,
          tableNumber: session.table_number,
          actorName: 'Waiter',
          actorRole: 'WAITER',
          severity: 'SUCCESS',
          metadata: { serviceRequestId: req.params.id }
        },
        io
      );

      res.json({ success: true, session });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Manager Quick Manual Add Item (by Food Item ID & Quantity)
  router.post('/table/:tableId/manual-item', (req, res) => {
    try {
      const { foodItemId, quantity, managerName } = req.body;
      if (!foodItemId) {
        return res.status(400).json({ error: 'Food Item ID is required.' });
      }
      const session = SessionOrderService.addManualItemByFoodId(
        req.params.tableId,
        foodItemId,
        quantity || 1,
        managerName || 'Manager'
      );

      io.emit('session:updated', session);
      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'ORDER',
          action: 'MANUAL_ITEM_ADDED',
          title: `Manual Item Added to Table #${session.table_number}`,
          description: `${managerName || 'Manager'} manually added item #${foodItemId} (Qty: ${quantity || 1}).`,
          tableNumber: session.table_number,
          actorName: managerName || 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { foodItemId, quantity }
        },
        io
      );

      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Manager Remove Item
  router.delete('/order-item/:orderItemId', (req, res) => {
    try {
      const session = SessionOrderService.removeOrderItem(req.params.orderItemId);

      io.emit('session:updated', session);
      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'ORDER',
          action: 'ITEM_REMOVED',
          title: `Item Removed from Table #${session.table_number}`,
          description: `Order item was removed from Table #${session.table_number} bill.`,
          tableNumber: session.table_number,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'WARNING',
          metadata: { orderItemId: req.params.orderItemId }
        },
        io
      );

      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Manager / Billing Apply Discount or Promotional Offer Code (Requirement 16)
  router.post('/:sessionId/discount', (req, res) => {
    try {
      let { discountType, discountValue, offerCode } = req.body;
      let appliedOffer = null;

      if (offerCode) {
        // Backend is source of truth: revalidate offer validity, time window, and conditions
        const sessionDetails = SessionOrderService.getSessionDetails(req.params.sessionId);
        const orderItems = [];
        for (const o of sessionDetails.orders || []) {
          for (const it of o.items || []) {
            orderItems.push(it);
          }
        }
        const validation = OfferService.validateOfferForBilling(offerCode, {
          subtotal: sessionDetails.subtotal,
          items: orderItems
        });

        appliedOffer = validation.offer;
        discountType = 'FIXED';
        discountValue = validation.discountAmount;
      }

      const session = SessionOrderService.applyDiscount(req.params.sessionId, discountType, discountValue);

      io.emit('session:updated', session);
      io.emit('tables:updated', TableService.getAllTables());

      ActivityLogger.logActivity(
        {
          category: 'BILLING',
          action: 'DISCOUNT_APPLIED',
          title: `Discount Applied to Table #${session.table_number}`,
          description: appliedOffer
            ? `Offer "${appliedOffer.code}" applied. Discount: ₹${discountValue}. New total: ₹${session.final_total}.`
            : `Applied ${discountType === 'PERCENTAGE' ? `${discountValue}%` : `₹${discountValue}`} discount. New total: ₹${session.final_total}.`,
          tableNumber: session.table_number,
          actorName: req.body.managerName || 'Manager',
          actorRole: 'MANAGER',
          severity: 'WARNING',
          metadata: { discountType, discountValue, offerCode, finalTotal: session.final_total }
        },
        io
      );

      res.json({ ...session, appliedOffer });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Waiter active orders and service requests feed
  router.get('/waiter/:waiterId/feed', (req, res) => {
    try {
      const feed = SessionOrderService.getWaiterOrders(req.params.waiterId);
      res.json(feed);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
