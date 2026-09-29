import express from 'express';
import { BillingService } from '../services/billingService.js';
import { TableService } from '../services/tableService.js';
import { ActivityLogger } from '../services/activityLogger.js';

export default function createBillingRouter(io) {
  const router = express.Router();

  // Generate / Preview Bill
  router.get('/preview/:sessionIdOrTableId', (req, res) => {
    try {
      const billData = BillingService.generateBillData(req.params.sessionIdOrTableId);
      res.json(billData);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Confirm "Payment Successful" (Waiter OR Manager) -> Sole trigger that CLOSES the session & RELEASES table
  router.post('/confirm-payment/:sessionId', (req, res) => {
    try {
      const {
        paymentMethod = 'Cash',
        collectorRole = 'MANAGER',
        collectorId = null,
        collectorName = 'Manager',
        transactionRef = ''
      } = req.body;

      const result = BillingService.confirmPayment(req.params.sessionId, {
        paymentMethod,
        collectorRole,
        collectorId,
        collectorName,
        transactionRef
      });

      // Broadcast session closed and tables updated in real-time
      io.emit('session:closed', {
        sessionId: req.params.sessionId,
        tableId: result.tableId,
        payment: result
      });

      io.emit('tables:updated', TableService.getAllTables());
      io.emit('cash:pending_updated', BillingService.getPendingCashSummary());

      // Distinct activity log messages based on Cash vs Digital
      const isCash = paymentMethod === 'Cash';
      const logTitle = isCash
        ? `Cash Collected (Pending Remittance): ₹${result.finalTotal || 0}`
        : `Digital Payment Confirmed: ₹${result.finalTotal || 0} (${paymentMethod})`;

      const logDesc = isCash
        ? `${result.collectedByName} (${result.collectedByRole}) received ₹${result.finalTotal} physical cash for Table #${result.tableId}. Recorded as Pending Cash.`
        : `Payment of ₹${result.finalTotal} received via ${paymentMethod} (Ref: ${transactionRef || 'Direct'}). Credited directly to hotel account. Table #${result.tableId} released.`;

      ActivityLogger.logActivity(
        {
          category: 'BILLING',
          action: isCash ? 'CASH_PENDING' : 'PAYMENT_RECEIVED',
          title: logTitle,
          description: logDesc,
          tableNumber: result.tableId,
          actorName: result.collectedByName,
          actorRole: result.collectedByRole === 'WAITER' ? 'WAITER' : 'MANAGER',
          severity: 'SUCCESS',
          metadata: {
            sessionId: req.params.sessionId,
            tableId: result.tableId,
            finalTotal: result.finalTotal,
            paymentMethod,
            isPendingCash: result.isPendingCash,
            collectorName: result.collectedByName,
            collectorRole: result.collectedByRole
          }
        },
        io
      );

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Get Pending Cash Ledger Summary (Manager view)
  router.get('/pending-cash', (req, res) => {
    try {
      const summary = BillingService.getPendingCashSummary();
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manager settles pending cash collected by staff to the hotel cash register
  router.post('/settle-cash', (req, res) => {
    try {
      const { paymentId, staffRole, staffId, managerName } = req.body;
      const updated = BillingService.settleStaffCash({
        paymentId,
        staffRole,
        staffId,
        managerName: managerName || 'Manager'
      });

      io.emit('cash:pending_updated', updated);

      ActivityLogger.logActivity(
        {
          category: 'BILLING',
          action: 'CASH_SETTLED',
          title: `Staff Cash Remitted to Hotel Register`,
          description: `${managerName || 'Manager'} verified and settled physical cash collections to the central cash register.`,
          actorName: managerName || 'Manager',
          actorRole: 'MANAGER',
          severity: 'SUCCESS',
          metadata: { paymentId, staffRole, staffId }
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
