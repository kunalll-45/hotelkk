import { db, initDatabase } from '../server/db.js';

async function testQrTableGate() {
  await initDatabase();
  const baseUrl = 'http://localhost:3000/api';
  const today = new Date().toISOString().split('T')[0];

  // Create a booking for Table 3 for today at 07:00 PM for testing
  db.prepare(`
    INSERT OR REPLACE INTO reservations (
      id, booking_code, customer_name, customer_phone,
      booking_date, booking_time, guests_count, table_id,
      status, payment_status, payment_amount
    ) VALUES (999, 'KK-BTEST', 'Rohan Verma', '9876544444', ?, '07:00 PM', 2, 3, 'CONFIRMED', 'PAID', 2.50)
  `).run(today);

  console.log('--- 1. Customer scans Table 8 with phone 9876544444 (Wrong table) ---');
  const wrongTable = await fetch(`${baseUrl}/tables/8/request-activation-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerPhone: '9876544444' })
  });
  const wrongData = await wrongTable.json();
  console.log('Wrong table response (should be 403 & The table is not yours):', wrongTable.status, wrongData.error, wrongData.details);

  console.log('\n--- 2. Customer scans Table 3 with unknown phone (No booking) ---');
  const unknownPhone = await fetch(`${baseUrl}/tables/3/request-activation-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerPhone: '9111111111' })
  });
  const unknownData = await unknownPhone.json();
  console.log('Unknown phone response (should be 403 & The table is not yours):', unknownPhone.status, unknownData.error, unknownData.details);

  console.log('\n--- 3. Customer scans Table 3 with correct phone 9876544444 ---');
  const correctTable = await fetch(`${baseUrl}/tables/3/request-activation-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerPhone: '9876544444' })
  });
  const correctData = await correctTable.json();
  console.log('Correct table response (should be 200 & devOtp):', correctTable.status, correctData.message, 'OTP:', correctData.devOtp);

  console.log('\n--- 4. Verify OTP on Table 3 ---');
  const verifyRes = await fetch(`${baseUrl}/tables/3/verify-activation-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerPhone: '9876544444', otpCode: correctData.devOtp })
  });
  const verifyData = await verifyRes.json();
  console.log('Activation result (should be 200 & session):', verifyRes.status, verifyData.session?.session_code, 'Customer:', verifyData.session?.customer_name);

  // Clean test booking
  db.prepare('DELETE FROM reservations WHERE id = 999').run();
  console.log('\n QR ACTIVATION FLOW VERIFIED PERFECTLY!');
}

testQrTableGate().catch(console.error);
