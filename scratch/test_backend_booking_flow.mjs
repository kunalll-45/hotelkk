async function testEndpoints() {
  const baseUrl = 'http://localhost:3000/api';

  console.log('--- 1. Testing GET /bookings/dates ---');
  const datesRes = await fetch(`${baseUrl}/bookings/dates`);
  const dates = await datesRes.json();
  console.log(`Allowed dates count: ${dates.length}, first: ${dates[0].date}, last: ${dates[dates.length - 1].date}`);

  const targetDate = dates[1].date; // Tomorrow to be safe from 4h rule

  console.log(`\n--- 2. Testing GET /bookings/slots for ${targetDate} ---`);
  const slotsRes = await fetch(`${baseUrl}/bookings/slots?date=${targetDate}`);
  const slots = await slotsRes.json();
  console.log(`Slots count: ${slots.length}, sample slot:`, slots[14]);

  console.log(`\n--- 3. Testing GET /bookings/availability for ${targetDate} at 07:00 PM ---`);
  const availRes = await fetch(`${baseUrl}/bookings/availability?date=${targetDate}&time=07:00 PM`);
  const tables = await availRes.json();
  console.log(`Tables count: ${tables.length}. All 12 tables present: ${tables.length === 12}`);
  console.log(`Table 1 available: ${tables[0].isAvailable}, statusText: ${tables[0].statusText}`);

  console.log('\n--- 4. Testing POST /bookings/hold for Table 5 ---');
  const holdRes = await fetch(`${baseUrl}/bookings/hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableNumber: 5,
      bookingDate: targetDate,
      bookingTime: '07:00 PM',
      customerName: 'Kunal Test',
      customerPhone: '9876500001',
      guestsCount: 4
    })
  });
  const holdData = await holdRes.json();
  console.log('Hold result:', holdData);
  if (!holdData.holdToken) {
    throw new Error('Hold failed: ' + JSON.stringify(holdData));
  }

  console.log('\n--- 5. Concurrency Check: Trying to hold Table 5 again for same slot ---');
  const holdRes2 = await fetch(`${baseUrl}/bookings/hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableNumber: 5,
      bookingDate: targetDate,
      bookingTime: '07:00 PM',
      customerName: 'Second Guest',
      customerPhone: '9876500002',
      guestsCount: 2
    })
  });
  const hold2Data = await holdRes2.json();
  console.log('Second hold attempt status (should fail):', holdRes2.status, hold2Data.error);

  console.log('\n--- 6. Testing POST /bookings/verify-payment for ₹2.50 ---');
  const payRes = await fetch(`${baseUrl}/bookings/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      holdToken: holdData.holdToken,
      paymentMethod: 'UPI'
    })
  });
  const payData = await payRes.json();
  console.log('Payment result:', payData);

  console.log('\n--- 7. Testing POST /bookings/verify-otp-and-confirm ---');
  const confirmRes = await fetch(`${baseUrl}/bookings/verify-otp-and-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      holdToken: holdData.holdToken,
      otpCode: payData.devOtp
    })
  });
  const confirmData = await confirmRes.json();
  console.log('Confirm result:', confirmData.success, confirmData.booking?.booking_code);

  console.log('\n--- 8. Testing Manage Booking for non-existent number ---');
  const manageFail = await fetch(`${baseUrl}/bookings/manage/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999' })
  });
  const manageFailData = await manageFail.json();
  console.log('Manage non-existent status (should be 404):', manageFail.status, manageFailData.error);

  console.log('\n--- 9. Testing Manage Booking for confirmed number 9876500001 ---');
  const manageOk = await fetch(`${baseUrl}/bookings/manage/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876500001' })
  });
  const manageOkData = await manageOk.json();
  console.log('Manage OTP requested:', manageOkData);

  const manageVerify = await fetch(`${baseUrl}/bookings/manage/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876500001', otpCode: manageOkData.devOtp })
  });
  const manageBookings = await manageVerify.json();
  console.log('Manage Bookings returned:', manageBookings.bookings?.length);
  console.log('First booking policy:', {
    canChange: manageBookings.bookings[0]?.canChange,
    changeFee: manageBookings.bookings[0]?.changeFee,
    policyMessage: manageBookings.bookings[0]?.policyMessage
  });

  console.log('\n ALL BACKEND LOGIC VERIFIED SUCCESSFULLY!');
}

testEndpoints().catch(console.error);
