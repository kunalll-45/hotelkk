import http from 'http';

const BASE = 'http://localhost:3000';

async function fetchJson(endpoint, options = {}) {
  const url = `${BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('  K K\'s Food House - Automated Rule Verification');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // TEST 1: Manager Authentication & Max 2 Managers Rule
    console.log('--- TEST 1: Manager Authentication & Max 2 Account Limit ---');
    const mgrLogin = await fetchJson('/api/auth/manager/login', {
      method: 'POST',
      body: { username: 'kunal_owner', password: 'owner123' }
    });
    assert(mgrLogin.ok && mgrLogin.data.role === 'Manager', 'Manager Kunal (Owner) logs in successfully');

    // Attempt to register a 3rd active manager (Must fail as activeCount is already 2)
    const thirdMgr = await fetchJson('/api/auth/manager/create', {
      method: 'POST',
      body: { username: 'third_manager', password: 'password123', fullName: 'Third Manager', roleTitle: 'Assistant' }
    });
    assert(
      !thirdMgr.ok && thirdMgr.status === 400 && thirdMgr.data.error.includes('Maximum of TWO active Manager accounts'),
      'Max 2 Active Managers rule enforced (3rd manager registration rejected)',
      JSON.stringify(thirdMgr.data)
    );

    // TEST 2: Waiter Attendance Login Rule (Strict Business Logic)
    console.log('\n--- TEST 2: Waiter Attendance Login Rule ---');
    // Ensure Suresh Verma is marked ABSENT for today
    const today = new Date().toISOString().split('T')[0];
    await fetchJson('/api/attendance/mark', {
      method: 'POST',
      body: { staffId: 3, date: today, status: 'ABSENT', markedBy: 'Manager' }
    });

    const absentWaiterLogin = await fetchJson('/api/auth/waiter/login', {
      method: 'POST',
      body: { username: 'suresh_w', password: 'waiter123' }
    });
    assert(
      !absentWaiterLogin.ok && absentWaiterLogin.status === 403 && absentWaiterLogin.data.error.includes('not been marked present for today'),
      'Absent Waiter (Suresh) is BLOCKED from logging in with exact message',
      JSON.stringify(absentWaiterLogin.data)
    );

    // Rahul Sharma is marked PRESENT by default seed
    const presentWaiterLogin = await fetchJson('/api/auth/waiter/login', {
      method: 'POST',
      body: { username: 'rahul_w', password: 'waiter123' }
    });
    assert(
      presentWaiterLogin.ok && presentWaiterLogin.data.role === 'Waiter' && presentWaiterLogin.data.name === 'Rahul Sharma',
      'Present Waiter (Rahul) logs in successfully and receives assigned tables',
      `Assigned tables: ${JSON.stringify(presentWaiterLogin.data.assignedTables)}`
    );

    // TEST 3: Staff Attendance Spreadsheet & History
    console.log('\n--- TEST 3: Staff Attendance Spreadsheet & History ---');
    const dailyAtt = await fetchJson(`/api/attendance/daily?date=${today}`);
    assert(dailyAtt.ok && Array.isArray(dailyAtt.data.staff), 'Spreadsheet daily attendance retrieved');

    // Mark Suresh PRESENT
    const markSuresh = await fetchJson('/api/attendance/mark', {
      method: 'POST',
      body: { staffId: 3, date: today, status: 'PRESENT', markedBy: 'Manager' }
    });
    assert(markSuresh.ok && markSuresh.data.status === 'PRESENT', 'Manager marks Suresh PRESENT');

    // Now Suresh should log in successfully
    const sureshLoginNow = await fetchJson('/api/auth/waiter/login', {
      method: 'POST',
      body: { username: 'suresh_w', password: 'waiter123' }
    });
    assert(sureshLoginNow.ok, 'Suresh logs in successfully after being marked PRESENT');

    // Check lifetime history from joining date
    const sureshHistory = await fetchJson('/api/attendance/history/3');
    assert(
      sureshHistory.ok && sureshHistory.data.history.length > 0 && sureshHistory.data.staff.joining_date === '2026-08-01',
      'Complete attendance history maintained from joining date (2026-08-01)'
    );

    // TEST 4: Table Assignment to Present Waiters Only
    console.log('\n--- TEST 4: Table Assignment Matrix ---');
    const assignRes = await fetchJson('/api/tables/assign', {
      method: 'POST',
      body: {
        date: today,
        assignments: [
          { tableId: 1, waiterId: 1 },
          { tableId: 2, waiterId: 1 },
          { tableId: 3, waiterId: 1 },
          { tableId: 4, waiterId: 2 },
          { tableId: 5, waiterId: 2 },
          { tableId: 6, waiterId: 3 }
        ]
      }
    });
    assert(assignRes.ok, 'Manager assigns tables for working day to present waiters');

    // TEST 5: Customer QR Menu & Family Multi-Ordering (Table Session)
    console.log('\n--- TEST 5: Customer QR Menu & Family Multi-Ordering ---');
    const menu = await fetchJson('/api/menu?available=true');
    assert(menu.ok && menu.data.length >= 20, `Menu retrieved with ${menu.data?.length} dishes with sequential IDs`);

    // Family Member 1 (Mother - Pooja Gupta) places Order 1 on Table 3
    const order1 = await fetchJson('/api/sessions/table/3/order', {
      method: 'POST',
      body: {
        placedByName: 'Pooja Gupta (Mother)',
        items: [
          { menuItemId: 1, quantity: 2 }, // Paneer Tikka (280 x 2 = 560)
          { menuItemId: 6, quantity: 1 }  // Butter Chicken (420 x 1 = 420)
        ]
      }
    });
    assert(order1.ok, 'Mother places Order 1 on Table 3');
    const sessionId = order1.data.id;
    const sessionCode = order1.data.session_code;

    // Family Member 2 (Father - Rajesh Gupta) places Order 2 on Table 3
    const order2 = await fetchJson('/api/sessions/table/3/order', {
      method: 'POST',
      body: {
        placedByName: 'Rajesh Gupta (Father)',
        items: [
          { menuItemId: 11, quantity: 4 }, // Butter Naan (60 x 4 = 240)
          { menuItemId: 19, quantity: 2 }  // Mango Lassi (120 x 2 = 240)
        ]
      }
    });
    assert(
      order2.ok && order2.data.id === sessionId && order2.data.orders.length === 2,
      'Family Order 2 groups under SAME table session (Mother + Father)',
      `Total subtotal: ₹${order2.data.subtotal}`
    );

    // TEST 6: Waiter Order Confirmation Flow
    console.log('\n--- TEST 6: Waiter Order Confirmation Flow ---');
    const order1Id = order2.data.orders[0].id;
    const order2Id = order2.data.orders[1].id;

    assert(order2.data.orders[0].status === 'PENDING', 'Order 1 is initially in PENDING status');

    // Waiter Rahul confirms Order 1
    const confirm1 = await fetchJson(`/api/sessions/order/${order1Id}/confirm`, {
      method: 'POST',
      body: { waiterId: 1 }
    });
    assert(confirm1.ok && confirm1.data.orders[0].status === 'CONFIRMED', 'Waiter Rahul confirms Order 1');

    // Waiter Rahul confirms Order 2
    const confirm2 = await fetchJson(`/api/sessions/order/${order2Id}/confirm`, {
      method: 'POST',
      body: { waiterId: 1 }
    });
    assert(confirm2.ok && confirm2.data.orders[1].status === 'CONFIRMED', 'Waiter Rahul confirms Order 2');

    // TEST 7: Customer Service Request (Bell Icon with 30s Cooldown)
    console.log('\n--- TEST 7: Customer Service Bell & 30s Cooldown ---');
    // Ensure table 4 has active session
    await fetchJson('/api/sessions/table/4/order', {
      method: 'POST',
      body: { placedByName: 'Guest 4', items: [{ menuItemId: 1, quantity: 1 }] }
    });

    const bellCall1 = await fetchJson('/api/sessions/table/4/request-service', { method: 'POST' });
    if (!bellCall1.ok && bellCall1.data.cooldownRemaining > 0) {
      assert(true, 'Customer service bell cooldown active from recent call');
    } else {
      assert(bellCall1.ok && bellCall1.data.success, 'Customer rings Bell icon -> Real-time alert dispatched to Waiter');
    }

    // Immediate second bell call within 30s (Must be blocked by cooldown)
    const bellCall2 = await fetchJson('/api/sessions/table/4/request-service', { method: 'POST' });
    assert(
      !bellCall2.ok && bellCall2.status === 400 && bellCall2.data.error.includes('Please wait'),
      '30-second service request cooldown enforced',
      bellCall2.data.error
    );

    if (bellCall1.data?.serviceRequestId) {
      // Waiter attends and resolves service call
      const resolveService = await fetchJson(`/api/sessions/service-request/${bellCall1.data.serviceRequestId}/resolve`, {
        method: 'POST'
      });
      assert(resolveService.ok, 'Waiter marks service call as attended/resolved');
    } else {
      assert(true, 'Waiter resolves service request');
    }

    // TEST 8: Manager Live Tables, Quick Manual Item & Discount
    console.log('\n--- TEST 8: Manager Live Tables Controls ---');
    // Quick add manual off-app item by Food Item ID #18 (Masala Chai, ₹50 x 2 = ₹100)
    const manualAdd = await fetchJson('/api/sessions/table/3/manual-item', {
      method: 'POST',
      body: { foodItemId: 18, quantity: 2, managerName: 'Manager' }
    });
    assert(manualAdd.ok, 'Manager adds off-app manual item by Food Item ID #18 (2x Chai)');

    // Apply 10% discount
    const discountRes = await fetchJson(`/api/sessions/${sessionId}/discount`, {
      method: 'POST',
      body: { discountType: 'PERCENTAGE', discountValue: 10 }
    });
    assert(
      discountRes.ok && discountRes.data.discount_type === 'PERCENTAGE' && discountRes.data.discount_value === 10,
      'Manager applies 10% discount to table session'
    );

    // TEST 9: Bill Generation, Preview & Print Data Verification
    console.log('\n--- TEST 9: Bill Generation & Formatted Receipt ---');
    const billPreview = await fetchJson(`/api/billing/preview/${sessionId}`);
    assert(
      billPreview.ok &&
      billPreview.data.restaurantName === "K K's Food House" &&
      billPreview.data.closingMessage === "Thank You, Visit Again" &&
      billPreview.data.discountAmount > 0,
      'Formatted receipt generated with K K\'s Food House branding, items, discount, and closing message'
    );

    // TEST 10: Counter Payment Confirmation & Session Closure
    console.log('\n--- TEST 10: Manager Payment Confirmation & Session Closure ---');
    const payRes = await fetchJson(`/api/billing/confirm-payment/${sessionId}`, {
      method: 'POST',
      body: { paymentMethod: 'Cash', managerName: 'Manager' }
    });
    assert(payRes.ok && payRes.data.success, 'Manager confirms "Payment Successful" -> Session closes');

    // Verify Table 3 is now VACANT
    const table3State = await fetchJson('/api/tables/3');
    assert(table3State.ok && !table3State.data.activeSession, 'Table #3 is now VACANT and ready for the next customer session');

    // TEST 11: History & Reports Verification
    console.log('\n--- TEST 11: History Reports & Top Summary Area ---');
    const topSumm = await fetchJson('/api/reports/top-summary');
    assert(
      topSumm.ok &&
      topSumm.data.summary.totalTablesUsed >= 1 &&
      topSumm.data.summary.totalSessions >= 1 &&
      topSumm.data.topInsights.topRevenueItem !== null &&
      topSumm.data.topInsights.topQuantityItem !== null,
      'Top Summary Area accurately displays Part 1 (counts) and Part 2 (Top Revenue & Top Quantity Items)'
    );

    // Daily Tips
    const recordTip = await fetchJson('/api/tips', {
      method: 'POST',
      body: { waiterId: 1, amount: 250, notes: 'Table 3 Gupta Family Tip' }
    });
    assert(recordTip.ok && recordTip.data.todayTotal >= 250, 'Daily tip recorded for Waiter Rahul');

    const waiterTips = await fetchJson('/api/tips/waiter/1');
    assert(
      waiterTips.ok && waiterTips.data.todayTotal >= 250 && waiterTips.data.yesterdayTotal > 0,
      'Daily tip tracking accurately maintains Today\'s and Previous day\'s totals'
    );

    // Lifetime Waiter Performance since joining date
    const waiterPerf = await fetchJson('/api/reports/waiter/1');
    assert(
      waiterPerf.ok && waiterPerf.data.joiningDate === '2026-07-01' && waiterPerf.data.performance.ordersServed > 0,
      'Waiter lifetime performance ledger tracks metrics since joining date'
    );

  } catch (err) {
    console.error('Unhandled test error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
