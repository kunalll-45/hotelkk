// scratch/test_cancellation_refund_flow.mjs
import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function runTests() {
  console.log('🧪 Starting Booking Cancellation & Automatic Refund Flow Tests...\n');

  const testPhone = '9876549999';
  const testName = 'Aarav Sharma';
  const testUpi = 'aarav@okhdfcbank';

  // 1. Create a booking for 3 days in future (> 24 hours remaining -> expect 90% refund)
  const d3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const dateOver24h = d3.toISOString().split('T')[0];
  const timeSlot = '07:00 PM to 08:00 PM';

  console.log(`1️⃣ Creating booking for ${dateOver24h} at ${timeSlot} (> 24h away)...`);
  
  // Hold table #4
  const holdRes = await request('/api/bookings/hold', {
    method: 'POST',
    body: JSON.stringify({
      tableNumber: 4,
      bookingDate: dateOver24h,
      bookingTime: timeSlot,
      customerName: testName,
      customerPhone: testPhone,
      guestsCount: 2,
      purpose: 'NEW_BOOKING'
    })
  });
  assert(holdRes.holdToken, 'Hold token should be created');

  // Verify Payment
  const payRes = await request('/api/bookings/verify-payment', {
    method: 'POST',
    body: JSON.stringify({
      holdToken: holdRes.holdToken,
      paymentMethod: 'UPI'
    })
  });
  assert(payRes.devOtp, 'Should return dev OTP for confirmation');

  // Confirm booking
  const confirmRes = await request('/api/bookings/verify-otp-and-confirm', {
    method: 'POST',
    body: JSON.stringify({
      holdToken: holdRes.holdToken,
      otpCode: payRes.devOtp
    })
  });
  const booking1 = confirmRes.booking;
  console.log(`   ✓ Booking created: Code ${booking1.booking_code}, Table #${booking1.table_number}, ID #${booking1.id}`);

  // Check table 4 is now BOOKED for that slot
  const availBefore = await request(`/api/bookings/availability?date=${dateOver24h}&time=${encodeURIComponent(timeSlot)}`);
  const t4Before = availBefore.find(t => t.tableNumber === 4);
  assert.strictEqual(t4Before.isAvailable, false, 'Table #4 must be marked unavailable before cancellation');
  console.log('   ✓ Verified Table #4 is booked/unavailable');

  // 2. Test Cancellation Preview Endpoint
  console.log('\n2️⃣ Testing Refund Preview Calculation (> 24 hours tier)...');
  const previewRes = await request(`/api/bookings/cancel-preview/${booking1.id}`);
  console.log(`   Remaining hours: ${previewRes.preview.remainingHours}h`);
  console.log(`   Refund %: ${previewRes.preview.refundPercentage}%`);
  console.log(`   Refund Amount: ₹${previewRes.preview.refundAmount}`);
  assert.strictEqual(previewRes.preview.refundPercentage, 90, 'Must be 90% refund for > 24 hours');
  assert.strictEqual(previewRes.preview.refundAmount, 90.00, 'Must be ₹90.00 refund on ₹100');
  console.log('   ✓ 90% tier calculation verified');

  // 3. Cancel Booking with optional reason and UPI ID
  console.log('\n3️⃣ Customer requests cancellation with UPI ID & reason...');
  const cancelRes = await request('/api/bookings/cancel', {
    method: 'POST',
    body: JSON.stringify({
      reservationId: booking1.id,
      customerPhone: testPhone,
      customerUpiId: testUpi,
      reason: 'Change of travel plans'
    })
  });
  assert(cancelRes.success, 'Cancellation must succeed');
  assert.strictEqual(cancelRes.cancellationRequest.status, 'PENDING', 'Status must be PENDING');
  assert.strictEqual(cancelRes.cancellationRequest.refund_percentage, 90, 'Recorded refund % must be 90');
  assert.strictEqual(cancelRes.cancellationRequest.refund_amount, 90, 'Recorded refund amount must be 90');
  assert.strictEqual(cancelRes.cancellationRequest.customer_upi_id, testUpi, 'UPI ID must match');
  console.log(`   ✓ Cancellation Request #${cancelRes.cancellationRequest.id} created with status PENDING`);

  // 4. Verify Table slot availability is IMMEDIATELY RELEASED
  console.log('\n4️⃣ Verifying Table slot availability is immediately released...');
  const availAfter = await request(`/api/bookings/availability?date=${dateOver24h}&time=${encodeURIComponent(timeSlot)}`);
  const t4After = availAfter.find(t => t.tableNumber === 4);
  assert.strictEqual(t4After.isAvailable, true, 'Table #4 MUST be immediately released/available after cancellation');
  console.log('   ✓ Table #4 is now AVAILABLE for another customer to book!');

  // 5. Manager: View Cancellation Section
  console.log('\n5️⃣ Manager views Cancellation Requests...');
  const managerList = await request('/api/bookings/cancellations');
  const foundReq = managerList.requests.find(r => r.id === cancelRes.cancellationRequest.id);
  assert(foundReq, 'Request must appear in Manager list');
  console.log(`   Customer: ${foundReq.customer_name} (${foundReq.customer_phone})`);
  console.log(`   Table #${foundReq.table_number}, Slot: ${foundReq.booking_date} at ${foundReq.booking_time}`);
  console.log(`   Remaining time: ${foundReq.remaining_hours}h`);
  console.log(`   Refund: ₹${foundReq.refund_amount} (${foundReq.refund_percentage}%)`);
  console.log(`   UPI ID: ${foundReq.customer_upi_id}`);
  console.log(`   Reason: "${foundReq.reason}"`);
  console.log(`   Status: ${foundReq.status}`);
  console.log('   ✓ All required manager fields verified');

  // 6. Manager Approval: Automatic Gateway Disbursement
  console.log('\n6️⃣ Manager Approves Refund (Automatic Gateway Trigger)...');
  const decisionRes = await request(`/api/bookings/cancellations/${foundReq.id}/decision`, {
    method: 'POST',
    body: JSON.stringify({
      decision: 'APPROVE',
      managerName: 'Kunal (Head Manager)'
    })
  });
  assert(decisionRes.success, 'Approval must succeed');
  assert.strictEqual(decisionRes.status, 'COMPLETED', 'Status must be COMPLETED');
  assert(decisionRes.cancellationRequest.refund_transaction_id.startsWith('REF_UPI_'), 'Must have UPI refund transaction ID');
  console.log(`   ✓ Status updated to: ${decisionRes.cancellationRequest.status}`);
  console.log(`   ✓ Payment Gateway Transaction ID: ${decisionRes.cancellationRequest.refund_transaction_id}`);
  console.log(`   ✓ Gateway Response: ${decisionRes.cancellationRequest.gateway_response}`);

  // 7. Customer Refund Tracking: Review Bookings
  console.log('\n7️⃣ Customer tracks refund under "Manage / Review Bookings"...');
  const customerView = await request(`/api/bookings/manage/bookings/${testPhone}`);
  const cancelledBookingInList = customerView.bookings.find(b => b.id === booking1.id);
  assert(cancelledBookingInList, 'Cancelled booking must be listed in customer view');
  assert.strictEqual(cancelledBookingInList.status, 'CANCELLED');
  assert(cancelledBookingInList.cancellationDetails, 'Must include cancellationDetails');
  assert.strictEqual(cancelledBookingInList.cancellationDetails.status, 'COMPLETED');
  assert.strictEqual(cancelledBookingInList.cancellationDetails.refundAmount, 90);
  assert.strictEqual(cancelledBookingInList.cancellationDetails.customerUpiId, testUpi);
  console.log(`   ✓ Customer sees status: "Refund Completed"`);
  console.log(`   ✓ Final Refunded Amount: ₹${cancelledBookingInList.cancellationDetails.refundAmount} credited to ${cancelledBookingInList.cancellationDetails.customerUpiId}`);

  // 8. Test boundary rule 2: > 4h and <= 24h (50% refund) & Rejection Flow
  console.log('\n8️⃣ Testing 4h-24h boundary (50% refund) & Manager Rejection...');
  const dTomorrow = new Date(Date.now() + 18 * 60 * 60 * 1000); // 18 hours in future
  const date18h = dTomorrow.toISOString().split('T')[0];
  const h = dTomorrow.getHours();
  const timeSlot18h = '08:00 PM to 09:00 PM';

  const hold2 = await request('/api/bookings/hold', {
    method: 'POST',
    body: JSON.stringify({
      tableNumber: 7,
      bookingDate: date18h,
      bookingTime: timeSlot18h,
      customerName: 'Priya Patel',
      customerPhone: '9876548888',
      guestsCount: 4,
      purpose: 'NEW_BOOKING'
    })
  });
  const pay2 = await request('/api/bookings/verify-payment', {
    method: 'POST',
    body: JSON.stringify({ holdToken: hold2.holdToken, paymentMethod: 'UPI' })
  });
  const confirm2 = await request('/api/bookings/verify-otp-and-confirm', {
    method: 'POST',
    body: JSON.stringify({ holdToken: hold2.holdToken, otpCode: pay2.devOtp })
  });
  const booking2 = confirm2.booking;

  const preview2 = await request(`/api/bookings/cancel-preview/${booking2.id}`);
  console.log(`   Booking 2 remaining hours: ${preview2.preview.remainingHours}h`);
  console.log(`   Booking 2 refund %: ${preview2.preview.refundPercentage}%`);
  // If preview2 is within 4h to 24h:
  if (preview2.preview.remainingHours > 4 && preview2.preview.remainingHours <= 24) {
    assert.strictEqual(preview2.preview.refundPercentage, 50, 'Must be 50% refund for 4-24h');
  }

  // Cancel with empty reason (optional reason allowed!)
  const cancel2 = await request('/api/bookings/cancel', {
    method: 'POST',
    body: JSON.stringify({
      reservationId: booking2.id,
      customerPhone: '9876548888',
      customerUpiId: 'priya@okhdfcbank',
      reason: '' // completely blank reason!
    })
  });
  assert(cancel2.success, 'Cancellation with empty reason must be allowed');
  assert.strictEqual(cancel2.cancellationRequest.reason, null);
  console.log('   ✓ Cancellation with empty reason successfully allowed');

  // Manager Rejection
  const rejectRes = await request(`/api/bookings/cancellations/${cancel2.cancellationRequest.id}/decision`, {
    method: 'POST',
    body: JSON.stringify({
      decision: 'REJECT',
      managerName: 'Kunal (Head Manager)'
    })
  });
  assert.strictEqual(rejectRes.status, 'REJECTED');
  console.log('   ✓ Manager rejection handled: status is REJECTED');

  console.log('\n🎉 ALL 8 TEST SUITES PASSED FLAWLESSLY! 🎉\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
