async function testQrTableGateViaApi() {
  const baseUrl = 'http://localhost:3000/api';
  const today = new Date().toISOString().split('T')[0];

  // 1. Create a confirmed booking for Table 3 today via API
  console.log('--- 1. Creating reservation on Table 3 for today via API ---');
  const now = new Date();
  // Set booking time to current hour slot so slot check passes
  let curHour = now.getHours();
  const meridian = curHour >= 12 ? 'PM' : 'AM';
  let displayHour = curHour % 12 || 12;
  const bookingTime = `${String(displayHour).padStart(2, '0')}:00 ${meridian}`;

  const createRes = await fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableNumber: 3,
      bookingDate: today,
      bookingTime: bookingTime,
      customerName: 'Aarav Sharma',
      customerPhone: '9876599999',
      guestsCount: 2
    })
  });
  const created = await createRes.json();
  console.log('Created booking:', created.booking?.booking_code, 'Table:', created.booking?.table_number, 'Time:', created.booking?.booking_time);

  // 2. Customer scans Table 8 (Wrong table)
  console.log('\n--- 2. Scanning Table 8 (Wrong table) with mobile 9876599999 ---');
  const wrongTable = await fetch(`${baseUrl}/tables/8/request-activation-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerPhone: '9876599999' })
  });
  const wrongData = await wrongTable.json();
  console.log('Wrong table status (expect 403):', wrongTable.status, 'Error:', wrongData.error, 'Details:', wrongData.details);

  // 3. Customer scans Table 3 (Correct table)
  console.log('\n--- 3. Scanning Table 3 (Correct table) with mobile 9876599999 ---');
  const correctTable = await fetch(`${baseUrl}/tables/3/request-activation-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerPhone: '9876599999' })
  });
  const correctData = await correctTable.json();
  console.log('Correct table status (expect 200):', correctTable.status, 'Message:', correctData.message, 'OTP:', correctData.devOtp);

  // 4. Verify OTP and Activate Table 3
  console.log('\n--- 4. Verify OTP and Activate Table 3 ---');
  const verifyRes = await fetch(`${baseUrl}/tables/3/verify-activation-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerPhone: '9876599999', otpCode: correctData.devOtp })
  });
  const verifyData = await verifyRes.json();
  console.log('Activation result (expect 200 & session):', verifyRes.status, 'Session Code:', verifyData.session?.session_code, 'Customer:', verifyData.session?.customer_name);
}

testQrTableGateViaApi().catch(console.error);
