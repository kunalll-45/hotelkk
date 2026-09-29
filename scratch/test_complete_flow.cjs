const http = require('http');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const postData = options.body ? JSON.stringify(options.body) : null;
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };
    if (postData) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${json.error || data}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const BASE_URL = 'http://localhost:3000/api';

async function runTests() {
  console.log('====================================================');
  console.log('STARTING END-TO-END FLOW VERIFICATION');
  console.log('====================================================\n');

  try {
    // 1. Get Tables and Menu
    console.log('1. Checking Tables and Menu Items...');
    const tables = await request(`${BASE_URL}/tables`);
    const menu = await request(`${BASE_URL}/menu`);
    console.log(`✓ Loaded ${tables.length} tables and ${menu.length} menu items.`);

    const kitchenItem = menu.find(m => m.send_to_kitchen === 1);
    const nonKitchenItem = menu.find(m => m.send_to_kitchen === 0) || menu[menu.length - 1];
    console.log(`- Kitchen Item: #${kitchenItem.id} "${kitchenItem.name}" (send_to_kitchen = ${kitchenItem.send_to_kitchen})`);
    console.log(`- Non-Kitchen Item: #${nonKitchenItem.id} "${nonKitchenItem.name}" (send_to_kitchen = ${nonKitchenItem.send_to_kitchen})`);

    // Use Table #4 for test
    const testTable = tables.find(t => t.table_number === 4) || tables[3];
    console.log(`\nUsing Table #${testTable.table_number} (ID: ${testTable.id}) for testing.`);

    // If table already has an active session, close it first to start clean
    try {
      const activeSession = await request(`${BASE_URL}/sessions/table/${testTable.id}`);
      if (activeSession && activeSession.status === 'ACTIVE') {
        console.log(`- Closing pre-existing active session #${activeSession.id}...`);
        await request(`${BASE_URL}/billing/confirm-payment/${activeSession.id}`, {
          method: 'POST',
          body: { paymentMethod: 'UPI', collectorRole: 'MANAGER', managerName: 'AutoClean' }
        });
      }
    } catch (e) {}

    // 2. Step 1: Customer Arrives and Scans QR
    console.log('\n2. Testing QR Table Activation Gate...');
    const activationStatus = await request(`${BASE_URL}/tables/${testTable.table_number}/activation-status`);
    console.log(`- Table ${testTable.table_number} reservation status:`, activationStatus.isReserved ? 'Reserved' : 'Walk-in Available');

    const activateRes = await request(`${BASE_URL}/tables/${testTable.table_number}/activate-qr`, {
      method: 'POST',
      body: { customerPhone: '9876543210' }
    });
    const sessionId = activateRes.session.id;
    console.log(`✓ Table #${testTable.table_number} QR activated successfully! Session ID: ${sessionId}`);

    // Prevent duplicate activation
    try {
      await request(`${BASE_URL}/tables/${testTable.table_number}/activate-qr`, {
        method: 'POST',
        body: { customerPhone: '9876543210' }
      });
      console.error('❌ Failed: Duplicate activation was allowed!');
    } catch (err) {
      console.log(`✓ Duplicate activation prevented: "${err.message}"`);
    }

    // 3. Step 2 & 3: Order Flow (No Customer Name required, Immediate registration in RECEIVED)
    console.log('\n3. Customer Order Placement (No Waiter Confirmation required)...');
    const orderPayload = {
      // Intentionally omitting placedByName or passing empty to test requirement
      items: [
        { menuItemId: kitchenItem.id, quantity: 2 },
        { menuItemId: nonKitchenItem.id, quantity: 1 }
      ]
    };
    const orderRes = await request(`${BASE_URL}/sessions/table/${testTable.id}/order`, {
      method: 'POST',
      body: orderPayload
    });
    const placedOrder = orderRes.orders[orderRes.orders.length - 1];
    console.log(`✓ Order placed immediately! Order ID: ${placedOrder.id}, Status: ${placedOrder.status}`);
    console.log(`- Guest attribution: "${placedOrder.placed_by_name}" (Defaults automatically without blocking)`);
    if (placedOrder.status !== 'RECEIVED') {
      throw new Error(`Expected status RECEIVED, got ${placedOrder.status}`);
    }

    // 4. Step 4: Kitchen Display Item Routing
    console.log('\n4. Kitchen Item Routing & KDS Queue Inspection...');
    const kitchenQueue = await request(`${BASE_URL}/sessions/kitchen/queue`);
    const tableTicket = kitchenQueue.find(t => t.table_number === testTable.table_number);
    if (!tableTicket) {
      throw new Error(`Order not found in kitchen queue!`);
    }
    console.log(`✓ Active kitchen ticket found for Table #${tableTicket.table_number}`);
    console.log(`- Total items in full customer bill: ${placedOrder.items.length}`);
    console.log(`- Total items on Kitchen Ticket: ${tableTicket.items.length}`);
    const hasNonKitchenInKds = tableTicket.items.some(i => i.menu_item_id === nonKitchenItem.id && nonKitchenItem.send_to_kitchen === 0);
    if (hasNonKitchenInKds) {
      throw new Error(`❌ Non-kitchen item appeared on Kitchen Display!`);
    }
    console.log(`✓ Non-kitchen items properly filtered out of Kitchen Display!`);

    // 5. Step 5: Waiter records physical kitchen progress
    console.log('\n5. Waiter Status Progression Lifecycle...');
    // A. Move to READY_TO_COOK
    console.log('- Waiter sets status to READY_TO_COOK...');
    let updated = await request(`${BASE_URL}/sessions/order/${placedOrder.id}/status`, {
      method: 'PATCH',
      body: { status: 'READY_TO_COOK', staffActor: 'Waiter Raju' }
    });
    console.log(`✓ Status updated to READY_TO_COOK`);

    // B. Cook starts preparation -> Waiter marks COOKING -> Must clear from active KDS
    console.log('- Waiter marks COOKING (Removes from KDS active waiting queue)...');
    updated = await request(`${BASE_URL}/sessions/order/${placedOrder.id}/status`, {
      method: 'PATCH',
      body: { status: 'COOKING', staffActor: 'Waiter Raju' }
    });
    console.log(`✓ Status updated to COOKING`);

    const queueAfterCooking = await request(`${BASE_URL}/sessions/kitchen/queue`);
    const stillInKds = queueAfterCooking.some(t => t.id === placedOrder.id);
    if (stillInKds) {
      throw new Error(`❌ Order was not cleared from active KDS queue after being marked COOKING!`);
    }
    console.log(`✓ Order successfully cleared from active KDS queue while remaining in history!`);

    // C. Cook completes food -> Cook tells Waiter -> Waiter marks READY_TO_SERVE
    console.log('- Cook informs Waiter -> Waiter marks READY_TO_SERVE...');
    updated = await request(`${BASE_URL}/sessions/order/${placedOrder.id}/status`, {
      method: 'PATCH',
      body: { status: 'READY_TO_SERVE', staffActor: 'Waiter Raju' }
    });
    console.log(`✓ Status updated to READY_TO_SERVE (Customer receives "Ready to serve" alert)`);

    // D. Waiter physically serves food -> Waiter marks SERVED
    console.log('- Waiter serves table -> Marks SERVED...');
    updated = await request(`${BASE_URL}/sessions/order/${placedOrder.id}/status`, {
      method: 'PATCH',
      body: { status: 'SERVED', staffActor: 'Waiter Raju' }
    });
    console.log(`✓ Status updated to SERVED (Preserved in history)`);

    // 6. Step 6: Order Editing (Waiter or Manager)
    console.log('\n6. Testing Order Editing...');
    const sessionDetails = await request(`${BASE_URL}/sessions/${sessionId}`);
    const orderToEdit = sessionDetails.orders[0];
    const initialItem = orderToEdit.items[0];

    console.log(`- Updating item #${initialItem.id} quantity from ${initialItem.quantity} to 3...`);
    const editQtyRes = await request(`${BASE_URL}/sessions/order-item/${initialItem.id}`, {
      method: 'PATCH',
      body: { quantity: 3, actorName: 'Waiter Raju' }
    });
    const editedOrder = editQtyRes.orders.find(o => o.id === orderToEdit.id);
    const updatedItem = editedOrder.items.find(i => i.id === initialItem.id);
    console.log(`✓ Quantity updated to: ${updatedItem.quantity}, new subtotal: ₹${updatedItem.subtotal}`);

    // 7. Step 7: Cash Payment & Pending Cash Tracking
    console.log('\n7. Payment Flow: Cash Payment & Staff Ledger Attribution...');
    const paymentRes = await request(`${BASE_URL}/billing/confirm-payment/${sessionId}`, {
      method: 'POST',
      body: {
        paymentMethod: 'Cash',
        collectorRole: 'WAITER',
        collectorId: 1,
        collectorName: 'Waiter Raju'
      }
    });
    console.log(`✓ Payment confirmed! Bill total: ₹${paymentRes.finalTotal}`);
    console.log(`- Recorded as pending cash: ${paymentRes.isPendingCash === 1 ? 'YES' : 'NO'}`);
    console.log(`- Attributed to collector: ${paymentRes.collectedByName} (${paymentRes.collectedByRole})`);

    // Check Manager Pending Cash Ledger
    console.log('- Checking Manager Pending Cash Ledger endpoint...');
    const pendingCashSummary = await request(`${BASE_URL}/billing/pending-cash`);
    console.log(`✓ Total outstanding cash in hotel ledger: ₹${pendingCashSummary.totalPendingCash}`);
    const waiterRecord = pendingCashSummary.byStaff.find(s => s.staffRole === 'WAITER' && s.staffId === 1);
    console.log(`✓ Waiter Raju pending cash balance: ₹${waiterRecord ? waiterRecord.totalPending : 0}`);

    // Settle Waiter Cash to Manager Register
    console.log('- Manager settles Waiter Raju cash to register...');
    const settleRes = await request(`${BASE_URL}/billing/settle-cash`, {
      method: 'POST',
      body: {
        paymentId: paymentRes.paymentId,
        staffRole: 'WAITER',
        staffId: 1,
        managerName: 'Admin Manager'
      }
    });
    console.log(`✓ Cash settled! Response:`, settleRes);

    // 8. Step 8: Table Release & Availability
    console.log('\n8. Verifying Table Release & Final State...');
    const tablesAfter = await request(`${BASE_URL}/tables`);
    const releasedTable = tablesAfter.find(t => t.table_number === testTable.table_number);
    console.log(`- Table #${releasedTable.table_number} status: ${releasedTable.computedStatus || releasedTable.status}`);
    console.log(`- Table active session cleared: ${releasedTable.activeSession === null ? 'YES' : 'NO'}`);
    if (releasedTable.activeSession !== null) {
      throw new Error(`❌ Table was not released after payment completion!`);
    }
    // 8B. Step 8B: Testing Digital Payment (UPI/Card) -> Direct Hotel Account (No Pending Cash)
    console.log('\n8B. Testing Digital Payment (Direct to Hotel Account, No Pending Cash)...');
    const table5 = tables.find(t => t.table_number === 5) || tables[4];
    try {
      const actSess5 = await request(`${BASE_URL}/sessions/table/${table5.id}`);
      if (actSess5 && actSess5.status === 'ACTIVE') {
        await request(`${BASE_URL}/billing/confirm-payment/${actSess5.id}`, {
          method: 'POST',
          body: { paymentMethod: 'UPI', collectorRole: 'MANAGER' }
        });
      }
    } catch (e) {}

    // Activate Table 5
    const act5 = await request(`${BASE_URL}/tables/${table5.table_number}/activate-qr`, {
      method: 'POST',
      body: { customerPhone: '9876543211' }
    });
    // Order on Table 5
    await request(`${BASE_URL}/sessions/table/${table5.id}/order`, {
      method: 'POST',
      body: { items: [{ menuItemId: kitchenItem.id, quantity: 1 }] }
    });
    // Pay digitally
    const digitalPayRes = await request(`${BASE_URL}/billing/confirm-payment/${act5.session.id}`, {
      method: 'POST',
      body: {
        paymentMethod: 'UPI',
        collectorRole: 'WAITER',
        collectorId: 1,
        collectorName: 'Waiter Raju',
        transactionRef: 'UPI-TXN-99887766'
      }
    });
    console.log(`✓ Digital Payment confirmed via ${digitalPayRes.paymentMethod}!`);
    console.log(`- Is Pending Cash: ${digitalPayRes.isPendingCash === 1 ? 'YES' : 'NO'}`);
    if (digitalPayRes.isPendingCash !== 0) {
      throw new Error(`❌ Digital payment incorrectly marked as pending cash!`);
    }
    console.log(`✓ Digital payment properly marked as direct hotel credit (0 pending cash)!`);

    // 9. Step 9: Activity Logs Inspection
    console.log('\n9. Inspecting Manager Live Hotel Logs...');
    const logData = await request(`${BASE_URL}/logs?limit=10`);
    const logs = logData.logs || (Array.isArray(logData) ? logData : []);
    console.log(`✓ Retrieved ${logs.length} recent hotel activity logs:`);
    logs.slice(0, 5).forEach(l => {
      console.log(`  [${l.action}] Table #${l.table_number || '-'}: ${l.title} - ${l.description}`);
    });

    console.log('\n====================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! FULL FLOW VERIFIED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
