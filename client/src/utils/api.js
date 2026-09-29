const API_BASE = '/api';

export async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || response.statusText || 'An error occurred');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  request,
  // Auth
  loginManager: (creds) => request('/auth/manager/login', { method: 'POST', body: creds }),
  createManager: (data) => request('/auth/manager/create', { method: 'POST', body: data }),
  getManagers: () => request('/auth/managers'),
  loginWaiter: (creds) => request('/auth/waiter/login', { method: 'POST', body: creds }),

  // Staff
  getStaff: () => request('/staff'),
  createStaff: (data) => request('/staff', { method: 'POST', body: data }),
  getStaffById: (id) => request(`/staff/${id}`),
  updateStaff: (id, data) => request(`/staff/${id}`, { method: 'PUT', body: data }),
  deleteStaff: (id) => request(`/staff/${id}`, { method: 'DELETE' }),

  // Attendance
  getDailyAttendance: (date) => request(`/attendance/daily${date ? `?date=${date}` : ''}`),
  markAttendance: (data) => request('/attendance/mark', { method: 'POST', body: data }),
  markBulkAttendance: (data) => request('/attendance/bulk', { method: 'POST', body: data }),
  getStaffAttendanceHistory: (staffId) => request(`/attendance/history/${staffId}`),
  getAttendanceMatrix: (year, month) => request(`/attendance/matrix?year=${year}&month=${month}`),

  // Tables & Settings
  getTables: () => request('/tables'),
  getTableById: (id) => request(`/tables/${id}`),
  assignTables: (data) => request('/tables/assign', { method: 'POST', body: data }),
  getRestaurantSettings: () => request('/tables/settings'),
  updateRestaurantSettings: (data) => request('/tables/settings', { method: 'PUT', body: data }),
  getTableActivationStatus: (tableNumber) => request(`/tables/${tableNumber}/activation-status`),
  activateTableQR: (tableNumber, data) => request(`/tables/${tableNumber}/activate-qr`, { method: 'POST', body: data }),

  // Menu
  getMenu: (onlyAvailable = false) => request(`/menu${onlyAvailable ? '?available=true' : ''}`),
  getMenuCategories: () => request('/menu/categories'),
  getMenuItemById: (id) => request(`/menu/${id}`),
  createMenuItem: (data) => request('/menu', { method: 'POST', body: data }),
  updateMenuItem: (id, data) => request(`/menu/${id}`, { method: 'PUT', body: data }),
  toggleMenuAvailability: (id) => request(`/menu/${id}/toggle-availability`, { method: 'PATCH' }),
  toggleMenuFeatured: (id) => request(`/menu/${id}/toggle-featured`, { method: 'PATCH' }),
  toggleKitchenPrep: (id) => request(`/menu/${id}/toggle-kitchen`, { method: 'PATCH' }),

  // Sessions & Orders
  getActiveTableSession: (tableId) => request(`/sessions/table/${tableId}`),
  getSessionDetails: (id) => request(`/sessions/${id}`),
  placeOrder: (tableId, data) => request(`/sessions/table/${tableId}/order`, { method: 'POST', body: data }),
  updateOrderStatus: (orderId, status, staffActor) => request(`/sessions/order/${orderId}/status`, { method: 'PATCH', body: { status, staffActor } }),
  addOrderItemToOrder: (orderId, data) => request(`/sessions/order/${orderId}/items`, { method: 'POST', body: data }),
  updateOrderItemQuantity: (orderItemId, quantity, actorName) => request(`/sessions/order-item/${orderItemId}`, { method: 'PATCH', body: { quantity, actorName } }),
  confirmOrder: (orderId, waiterId) => request(`/sessions/order/${orderId}/confirm`, { method: 'POST', body: { waiterId } }),
  markOrderServed: (orderId) => request(`/sessions/order/${orderId}/served`, { method: 'POST' }),
  getKitchenQueue: () => request('/sessions/kitchen/queue'),
  requestService: (tableId) => request(`/sessions/table/${tableId}/request-service`, { method: 'POST' }),
  resolveServiceRequest: (id) => request(`/sessions/service-request/${id}/resolve`, { method: 'POST' }),
  addManualItem: (tableId, data) => request(`/sessions/table/${tableId}/manual-item`, { method: 'POST', body: data }),
  removeOrderItem: (orderItemId) => request(`/sessions/order-item/${orderItemId}`, { method: 'DELETE' }),
  applyDiscount: (sessionId, data) => request(`/sessions/${sessionId}/discount`, { method: 'POST', body: data }),
  getWaiterFeed: (waiterId) => request(`/sessions/waiter/${waiterId}/feed`),

  // Billing & Cash Ledger
  getBillPreview: (sessionIdOrTableId) => request(`/billing/preview/${sessionIdOrTableId}`),
  confirmPayment: (sessionId, data) => request(`/billing/confirm-payment/${sessionId}`, { method: 'POST', body: data }),
  getPendingCash: () => request('/billing/pending-cash'),
  settleCash: (data) => request('/billing/settle-cash', { method: 'POST', body: data }),

  // Tips
  recordTip: (data) => request('/tips', { method: 'POST', body: data }),
  getWaiterDailyTips: (waiterId) => request(`/tips/waiter/${waiterId}`),
  getAllWaitersDailyTips: () => request('/tips/daily-summary'),

  // Reports
  getTopSummary: (date) => request(`/reports/top-summary${date ? `?date=${date}` : ''}`),
  getReports: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports${query ? `?${query}` : ''}`);
  },
  getWaiterPerformance: (waiterId, date) => request(`/reports/waiter/${waiterId}${date ? `?date=${date}` : ''}`),
  getAllWaitersPerformance: (date) => request(`/reports/waiters/all${date ? `?date=${date}` : ''}`),

  // QR
  getTableQR: (tableNumber) => request(`/qr/table/${tableNumber}`),
  getAllTableQRs: () => request('/qr/all-tables'),

  // Bookings / Table Reservations (New Flow)
  getBookingDates: () => request('/bookings/dates'),
  getBookingSlots: (date, purpose = 'NEW_BOOKING') => request(`/bookings/slots?date=${encodeURIComponent(date)}&purpose=${purpose}`),
  getTableAvailability: (date, time) => request(`/bookings/availability?date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`),
  createBookingHold: (data) => request('/bookings/hold', { method: 'POST', body: data }),
  releaseBookingHold: (holdToken) => request('/bookings/release-hold', { method: 'POST', body: { holdToken } }),
  resendHoldOtp: (holdToken) => request('/bookings/resend-hold-otp', { method: 'POST', body: { holdToken } }),
  verifyBookingPayment: (data) => request('/bookings/verify-payment', { method: 'POST', body: data }),
  verifyBookingOtpAndConfirm: (data) => request('/bookings/verify-otp-and-confirm', { method: 'POST', body: data }),
  requestManageOtp: (phone) => request('/bookings/manage/request-otp', { method: 'POST', body: { phone } }),
  verifyManageOtp: (phone, otpCode) => request('/bookings/manage/verify-otp', { method: 'POST', body: { phone, otpCode } }),
  getCustomerBookings: (phone) => request(`/bookings/manage/bookings/${encodeURIComponent(phone)}`),
  requestBookingCancellation: (data) => request('/bookings/cancel', { method: 'POST', body: data }),
  getCancellationRequests: () => request('/bookings/cancellations'),
  processRefundDecision: (id, data) => request(`/bookings/cancellations/${id}/decision`, { method: 'POST', body: data }),
  getCancellationPreview: (id) => request(`/bookings/cancel-preview/${id}`),

  // Table QR Activation (Arrival Verification Flow)
  requestTableActivationOtp: (tableNumber, customerPhone) =>
    request(`/tables/${tableNumber}/request-activation-otp`, { method: 'POST', body: { customerPhone } }),
  verifyTableActivationOtp: (tableNumber, customerPhone, otpCode) =>
    request(`/tables/${tableNumber}/verify-activation-otp`, { method: 'POST', body: { customerPhone, otpCode } }),

  createBooking: (data) => request('/bookings', { method: 'POST', body: data }),
  lookupBooking: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/bookings/lookup?${query}`);
  },
  getBookings: (date) => request(`/bookings${date ? `?date=${date}` : ''}`),
  updateBookingStatus: (id, status, tableId) => request(`/bookings/${id}/status`, { method: 'PATCH', body: { status, tableId } }),
  cancelBooking: (id) => request(`/bookings/${id}`, { method: 'DELETE' }),

  // Live Activity & Reaction Logs
  getActivityLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/logs${query ? `?${query}` : ''}`);
  },
  getActivityLogSummary: (date) => request(`/logs/summary${date ? `?date=${date}` : ''}`),

  // Offers
  getOffers: (status) => request(`/offers${status ? `?status=${status}` : ''}`),
  getPromotionalOffers: () => request('/offers/promotional'),
  getOfferById: (id) => request(`/offers/${id}`),
  createOffer: (data) => request('/offers', { method: 'POST', body: data }),
  updateOffer: (id, data) => request(`/offers/${id}`, { method: 'PUT', body: data }),
  deleteOffer: (id) => request(`/offers/${id}`, { method: 'DELETE' }),
  toggleOffer: (id) => request(`/offers/${id}/toggle`, { method: 'PATCH' }),
  validateOfferBilling: (data) => request('/offers/validate-billing', { method: 'POST', body: data }),

  // Image Upload
  uploadImage: async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: reader.result, filename: file.name })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Image upload failed');
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }
};

