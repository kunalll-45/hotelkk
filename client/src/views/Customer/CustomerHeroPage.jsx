import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../utils/api';
import { soundManager } from '../../utils/soundEffects';
import { parseDateTime, formatBookedBetween, formatCurrency } from '../../utils/formatters';
import CustomerMenu from './CustomerMenu';
import TopDishesSlider from '../../components/TopDishesSlider';
import EditorialHeroSection from '../../components/EditorialHeroSection';

const INITIAL_12_TABLES = [
  { tableNumber: 1, capacity: 2, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 2, capacity: 2, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 3, capacity: 4, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 4, capacity: 4, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 5, capacity: 4, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 6, capacity: 4, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 7, capacity: 6, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 8, capacity: 6, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 9, capacity: 2, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 10, capacity: 4, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 11, capacity: 4, isAvailable: true, statusText: 'Select Date & Time' },
  { tableNumber: 12, capacity: 6, isAvailable: true, statusText: 'Select Date & Time' }
];

const getTodayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const getMaxBookingDateISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 6); // 7 days total (next 1 week limit)
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const getNext7BookingDays = () => {
  const list = [];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dayNum = d.getDate();
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const monthLong = d.toLocaleDateString('en-US', { month: 'long' });
    const monthVal = pad(d.getMonth() + 1);
    const yearVal = String(d.getFullYear());

    let label = `${dayNum}`;
    if (i === 0) {
      label = `${dayNum} (Today)`;
    } else if (i === 1) {
      label = `${dayNum} (Tomorrow)`;
    } else {
      label = `${dayNum} (${dayName})`;
    }

    list.push({
      iso,
      day: String(dayNum),
      month: monthVal,
      monthName: monthLong,
      year: yearVal,
      label,
      isToday: i === 0
    });
  }
  return list;
};

const getTomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const MONTHS_LIST = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

const getDaysInMonth = (m, y) => {
  if (!m) return 31;
  const year = y ? parseInt(y, 10) : new Date().getFullYear();
  const month = parseInt(m, 10);
  return new Date(year, month, 0).getDate();
};

const formatFriendlyDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export default function CustomerHeroPage() {
  const { restaurantSettings, managerUser, switchRole } = useAuth();

  // Navigation Views: 'hero' | 'menu'
  const [currentView, setCurrentView] = useState('hero');

  // Menu items for showcase and view-only menu
  const [menuItems, setMenuItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [menuLoading, setMenuLoading] = useState(true);
  const [selectedDishDetail, setSelectedDishDetail] = useState(null);

  const next7Days = getNext7BookingDays();
  const initialLiveDate = new Date();
  const initialLiveMonth = initialLiveDate.toLocaleDateString('en-US', { month: 'long' });
  const initialLiveYear = String(initialLiveDate.getFullYear());

  // Date Selector state (matching reference image: Day dropdown, Live Month & Year auto-filled)
  // Users can only book within the next 1 week (7 days).
  const [selectedDayIso, setSelectedDayIso] = useState('');
  const [displayedMonth, setDisplayedMonth] = useState(initialLiveMonth);
  const [displayedYear, setDisplayedYear] = useState(initialLiveYear);
  const [selectedDate, setSelectedDate] = useState(''); // Do NOT preselect
  const [allowedDates, setAllowedDates] = useState([]);
  const calendarInputRef = useRef(null);
  const timePopupRef = useRef(null);

  const handleDaySelect = (iso) => {
    if (!iso) {
      setSelectedDayIso('');
      setSelectedDate('');
      setSelectedSlot('');
      setSelectedTable(null);
      setDisplayedMonth(initialLiveMonth);
      setDisplayedYear(initialLiveYear);
      return;
    }
    const match = next7Days.find((d) => d.iso === iso);
    if (match) {
      soundManager.playPop();
      setSelectedDayIso(iso);
      setSelectedDate(iso);
      setDisplayedMonth(match.monthName);
      setDisplayedYear(match.year);
      setSelectedSlot('');
      setSelectedTable(null);
      setTimePopupOpen(true);
    }
  };

  const handleCalendarSelect = (e) => {
    const val = e.target.value; // YYYY-MM-DD
    if (!val) return;
    const match = next7Days.find((d) => d.iso === val);
    if (match) {
      handleDaySelect(val);
    } else {
      soundManager.playError();
      alert('Bookings are only available for the next 1 week (7 days). Please choose a date within this week.');
    }
  };

  // Slots for selected date (1-hour slots from 12 PM to 12 AM)
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(''); // Do NOT preselect
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [timePopupOpen, setTimePopupOpen] = useState(false);

  // Close time popup on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (timePopupRef.current && !timePopupRef.current.contains(e.target)) {
        setTimePopupOpen(false);
      }
    };
    if (timePopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [timePopupOpen]);

  // 12 Tables Availability (Visible at all times)
  const [tablesAvailability, setTablesAvailability] = useState(INITIAL_12_TABLES);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [clickedBookedTable, setClickedBookedTable] = useState(null);

  // Guest Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [guestCountMode, setGuestCountMode] = useState('2'); // '1', '2', '3', '4', 'custom'
  const [customGuestCount, setCustomGuestCount] = useState('5');
  const [specialRequests, setSpecialRequests] = useState('');

  // Hold & Payment State
  const [activeHold, setActiveHold] = useState(null);
  const [holdTimer, setHoldTimer] = useState(300); // 5 minutes in seconds
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  // OTP Verification State
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(60);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Confirmed Booking Card
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // MANAGE / REVIEW BOOKINGS MODAL
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [managePhone, setManagePhone] = useState('');
  const [manageStep, setManageStep] = useState('phone'); // 'phone' | 'otp' | 'list' | 'change'
  const [manageOtpCode, setManageOtpCode] = useState('');
  const [manageDevOtp, setManageDevOtp] = useState('');
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState('');
  const [customerBookings, setCustomerBookings] = useState([]);
  const [selectedBookingForChange, setSelectedBookingForChange] = useState(null);

  // Cancellation & Refund Flow
  const { socket } = useSocket();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelUpiId, setCancelUpiId] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState('');

  // Slot/Table Change Sub-Flow (Next 1 week only - matching main booking section structure)
  const [changeDate, setChangeDate] = useState('');
  const [changeDayIso, setChangeDayIso] = useState('');
  const [changeDisplayedMonth, setChangeDisplayedMonth] = useState(initialLiveMonth);
  const [changeDisplayedYear, setChangeDisplayedYear] = useState(initialLiveYear);
  const [changeSlots, setChangeSlots] = useState([]);
  const [changeSlot, setChangeSlot] = useState('');
  const [changeTables, setChangeTables] = useState([]);
  const [changeTable, setChangeTable] = useState(null);
  const [changeHold, setChangeHold] = useState(null);
  const [changeFeeModal, setChangeFeeModal] = useState(false);
  const [changeOtpCode, setChangeOtpCode] = useState('');
  const [changeDevOtp, setChangeDevOtp] = useState('');
  const [changeOtpCountdown, setChangeOtpCountdown] = useState(60);
  const [changeVerifyingOtp, setChangeVerifyingOtp] = useState(false);
  const [changeOtpError, setChangeOtpError] = useState('');
  const [changeHoldTimer, setChangeHoldTimer] = useState(300);
  const [changeTimePopupOpen, setChangeTimePopupOpen] = useState(false);
  const changeTimePopupRef = useRef(null);
  const changeCalendarInputRef = useRef(null);

  // Close change time popup on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (changeTimePopupRef.current && !changeTimePopupRef.current.contains(e.target)) {
        setChangeTimePopupOpen(false);
      }
    };
    if (changeTimePopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [changeTimePopupOpen]);

  // References
  const bookingSectionRef = useRef(null);

  // 1. Load Menu Items
  useEffect(() => {
    let mounted = true;
    api.getMenu(true)
      .then((items) => {
        if (mounted) {
          setMenuItems(items);
          setMenuLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load menu:', err);
        if (mounted) setMenuLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  // 2. Load Allowed Dates (Next 7 days)
  useEffect(() => {
    api.getBookingDates()
      .then((dates) => {
        setAllowedDates(dates);
        // Do NOT pre-select any date: user must explicitly choose.
      })
      .catch((err) => console.error('Failed to load dates:', err));
  }, []);

  // 3. Load Slots when selectedDate changes
  useEffect(() => {
    if (!selectedDate) {
      setAvailableSlots([]);
      setSelectedSlot('');
      return;
    }
    setSlotsLoading(true);
    api.getBookingSlots(selectedDate, 'NEW_BOOKING')
      .then((slots) => {
        setAvailableSlots(slots);
        // Do NOT pre-select any slot: user must explicitly choose.
        setSelectedSlot('');
        setSlotsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load slots:', err);
        setSlotsLoading(false);
      });
  }, [selectedDate]);

  // 4. Load 12 Tables when selectedDate or selectedSlot changes
  useEffect(() => {
    if (!selectedDate || !selectedSlot) {
      setTablesAvailability(INITIAL_12_TABLES);
      setSelectedTable(null);
      return;
    }
    setTablesLoading(true);
    api.getTableAvailability(selectedDate, selectedSlot)
      .then((tables) => {
        setTablesAvailability(tables);
        // If previously selected table is not available, reset
        setSelectedTable((prev) => {
          if (!prev) return null;
          const stillAvail = tables.find((t) => t.tableNumber === prev.tableNumber && t.isAvailable);
          return stillAvail ? prev : null;
        });
        setTablesLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load table availability:', err);
        setTablesLoading(false);
      });
  }, [selectedDate, selectedSlot]);

  // 5. Hold countdown timer
  useEffect(() => {
    let interval;
    if (activeHold && holdTimer > 0) {
      interval = setInterval(() => {
        setHoldTimer((t) => {
          if (t <= 1) {
            // Hold expired
            handleReleaseHold(activeHold.holdToken);
            setActiveHold(null);
            setPaymentModalOpen(false);
            setOtpModalOpen(false);
            soundManager.playError();
            alert('Your temporary table hold has expired. Please select a table again.');
            return 300;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeHold, holdTimer]);

  // 6. OTP countdown timer
  useEffect(() => {
    let interval;
    if (otpModalOpen && otpCountdown > 0) {
      interval = setInterval(() => {
        setOtpCountdown((c) => c - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpModalOpen, otpCountdown]);

  // 7. Change hold countdown timer
  useEffect(() => {
    let interval;
    if (manageStep === 'change_otp' && changeHold && changeHoldTimer > 0) {
      interval = setInterval(() => {
        setChangeHoldTimer((t) => {
          if (t <= 1) {
            clearInterval(interval);
            if (changeHold) {
              api.releaseBookingHold(changeHold.holdToken).catch(() => {});
            }
            setChangeHold(null);
            setManageStep('change');
            soundManager.playError();
            alert('Your temporary table hold has expired. Please select a table again.');
            return 300;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [manageStep, changeHold, changeHoldTimer]);

  // 8. Change OTP countdown timer
  useEffect(() => {
    let interval;
    if (manageStep === 'change_otp' && changeOtpCountdown > 0) {
      interval = setInterval(() => {
        setChangeOtpCountdown((c) => c - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [manageStep, changeOtpCountdown]);

  // 9. Real-time updates for cancellations, refund status, and table slot availability
  useEffect(() => {
    if (!socket) return;

    const handleSync = () => {
      if (managePhone && managePhone.trim().replace(/\D/g, '').length >= 7 && manageStep === 'list') {
        api.getCustomerBookings(managePhone.trim())
          .then((res) => setCustomerBookings(res.bookings || []))
          .catch(() => {});
      }
      if (selectedDate && selectedSlot) {
        api.getTableAvailability(selectedDate, selectedSlot)
          .then((tables) => setTablesAvailability(tables))
          .catch(() => {});
      }
    };

    socket.on('cancellation:updated', handleSync);
    socket.on('cancellation:new', handleSync);
    socket.on('booking:cancelled', handleSync);
    socket.on('booking:status_changed', handleSync);
    socket.on('table:status_changed', handleSync);

    return () => {
      socket.off('cancellation:updated', handleSync);
      socket.off('cancellation:new', handleSync);
      socket.off('booking:cancelled', handleSync);
      socket.off('booking:status_changed', handleSync);
      socket.off('table:status_changed', handleSync);
    };
  }, [socket, managePhone, manageStep, selectedDate, selectedSlot]);

  const scrollToBooking = () => {
    soundManager.playPop();
    setCurrentView('hero');
    setTimeout(() => {
      bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const getGuestsCount = () => {
    return guestCountMode === 'custom'
      ? parseInt(customGuestCount, 10) || 4
      : parseInt(guestCountMode, 10) || 2;
  };

  // Step A: Table Click Handlers
  const handleTableClick = (table) => {
    soundManager.playPop();
    if (!table.isAvailable) {
      setClickedBookedTable(table);
      return;
    }
    setClickedBookedTable(null);
    setSelectedTable(table);
  };

  // Step B: Submit Details & Create Hold
  const handleProceedToPayment = async (e) => {
    e.preventDefault();
    if (!selectedTable) {
      soundManager.playError();
      alert('Please select an available table from the 12 hotel tables.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      soundManager.playError();
      alert('Please enter your Name and Registered Mobile Number.');
      return;
    }

    try {
      soundManager.playPop();
      const hold = await api.createBookingHold({
        tableNumber: selectedTable.tableNumber,
        bookingDate: selectedDate,
        bookingTime: selectedSlot,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        guestsCount: getGuestsCount(),
        purpose: 'NEW_BOOKING'
      });

      setActiveHold(hold);
      setHoldTimer(300); // 5 minutes
      setPaymentModalOpen(true);
    } catch (err) {
      soundManager.playError();
      alert(err.message || 'Failed to hold table. It may have just been taken.');
      // Refresh tables
      api.getTableAvailability(selectedDate, selectedSlot).then(setTablesAvailability);
    }
  };

  // Step C: Payment Execution
  const handlePayGuaranteeFee = async () => {
    if (!activeHold) return;
    try {
      setProcessingPayment(true);
      soundManager.playPop();

      const payResult = await api.verifyBookingPayment({
        holdToken: activeHold.holdToken,
        paymentMethod: 'UPI'
      });

      setDevOtp(payResult.devOtp || '');
      setProcessingPayment(false);
      setPaymentModalOpen(false);
      setOtpModalOpen(true);
      setOtpCountdown(60);
      soundManager.playSuccess();
    } catch (err) {
      setProcessingPayment(false);
      soundManager.playError();
      alert(err.message || 'Payment failed. Please try again.');
    }
  };

  // Step D: OTP Verification & Confirmation
  const handleVerifyOtpAndConfirm = async (e) => {
    e.preventDefault();
    if (!activeHold || !otpCode.trim()) return;

    try {
      setVerifyingOtp(true);
      setOtpError('');
      soundManager.playPop();

      const result = await api.verifyBookingOtpAndConfirm({
        holdToken: activeHold.holdToken,
        otpCode: otpCode.trim()
      });

      soundManager.playSuccess();
      setConfirmedBooking(result.booking);
      setOtpModalOpen(false);
      setActiveHold(null);
      setSelectedTable(null);
      setVerifyingOtp(false);

      // Refresh table grid
      api.getTableAvailability(selectedDate, selectedSlot).then(setTablesAvailability);
    } catch (err) {
      setVerifyingOtp(false);
      soundManager.playError();
      setOtpError(err.message || 'Incorrect OTP code. Please retry.');
    }
  };

  const handleReleaseHold = async (token) => {
    const t = token || activeHold?.holdToken;
    if (t) {
      await api.releaseBookingHold(t).catch(() => {});
    }
    setActiveHold(null);
    setPaymentModalOpen(false);
  };

  // MANAGE BOOKINGS FLOW
  const handleOpenManageModal = () => {
    soundManager.playPop();
    setManageStep('phone');
    setManageError('');
    setManagePhone('');
    setManageOtpCode('');
    setSelectedBookingForChange(null);
    setManageModalOpen(true);
  };

  const handleManageRequestOtp = async (e) => {
    e.preventDefault();
    setManageError('');
    const rawDigits = managePhone.trim().replace(/\D/g, '');
    if (!rawDigits || rawDigits.length < 7) {
      setManageError('Please enter a valid mobile number.');
      return;
    }

    try {
      setManageLoading(true);
      soundManager.playPop();

      const res = await api.requestManageOtp(managePhone.trim());
      setManageDevOtp(res.devOtp || '');
      setManageStep('otp');
      soundManager.playSuccess();
    } catch (err) {
      soundManager.playError();
      // Strict rule: "No booking found for this mobile number."
      setManageError(err.message || 'No booking found for this mobile number.');
    } finally {
      setManageLoading(false);
    }
  };

  const handleManageVerifyOtp = async (e) => {
    e.preventDefault();
    setManageError('');
    if (!manageOtpCode.trim()) return;

    try {
      setManageLoading(true);
      soundManager.playPop();

      const res = await api.verifyManageOtp(managePhone.trim(), manageOtpCode.trim());
      setCustomerBookings(res.bookings || []);
      setManageStep('list');
      soundManager.playSuccess();
    } catch (err) {
      soundManager.playError();
      setManageError(err.message || 'Invalid verification code.');
    } finally {
      setManageLoading(false);
    }
  };

  // Cancellation & Refund Flow Handlers
  const handleStartCancel = (booking) => {
    soundManager.playPop();
    setSelectedBookingForCancel(booking);
    setCancelReason('');
    setCancelUpiId('');
    setCancelError('');
    setCancelSuccessMsg('');
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedBookingForCancel) return;
    const cleanUpi = cancelUpiId.trim();
    if (!cleanUpi || !cleanUpi.includes('@') || cleanUpi.length < 5) {
      soundManager.playError();
      setCancelError('Please enter a valid UPI ID (e.g. yourname@okhdfcbank, mobile@upi) to receive your refund.');
      return;
    }

    try {
      setCancelLoading(true);
      setCancelError('');
      soundManager.playPop();

      const res = await api.requestBookingCancellation({
        reservationId: selectedBookingForCancel.id,
        customerPhone: managePhone,
        customerUpiId: cleanUpi,
        reason: cancelReason.trim()
      });

      soundManager.playSuccess();
      setCancelSuccessMsg(res.message || 'Booking cancelled successfully! Your refund has been automatically processed to your original payment source.');

      const updated = await api.getCustomerBookings(managePhone.trim());
      setCustomerBookings(updated.bookings || []);

      if (selectedDate && selectedSlot) {
        api.getTableAvailability(selectedDate, selectedSlot)
          .then((tables) => setTablesAvailability(tables))
          .catch(() => {});
      }

      setTimeout(() => {
        setCancelModalOpen(false);
        setSelectedBookingForCancel(null);
      }, 2000);
    } catch (err) {
      soundManager.playError();
      setCancelError(err.message || 'Failed to cancel booking.');
    } finally {
      setCancelLoading(false);
    }
  };

  // Derived refund calculation for selectedBookingForCancel
  const cancelRefundInfo = useMemo(() => {
    if (!selectedBookingForCancel) return null;

    // Use backend calculated preview if available
    if (selectedBookingForCancel.cancellationPreview) {
      const prev = selectedBookingForCancel.cancellationPreview;
      return {
        diffHours: prev.remainingHours,
        origAmount: parseFloat(prev.originalAmount || 100).toFixed(2),
        refundPct: prev.refundPercentage,
        refundAmount: parseFloat(prev.refundAmount || 0).toFixed(2),
        tier: prev.tierLabel,
        isOver24h: prev.isMoreThan24h || prev.remainingHours > 24,
        isBetween4and24h: prev.isBetween4and24h || (prev.remainingHours > 4 && prev.remainingHours <= 24),
        isUnder4h: prev.is4hOrLess || prev.remainingHours <= 4
      };
    }

    try {
      const slotDateTime = parseDateTime(
        selectedBookingForCancel.booking_date,
        selectedBookingForCancel.booking_time
      );
      const now = new Date();
      const diffHours = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      let refundPct = 0;
      let tier = '';

      if (diffHours > 24) {
        refundPct = 90;
        tier = 'More than 24 hours (> 24h)';
      } else if (diffHours > 4) {
        refundPct = 50;
        tier = 'Between 4 and 24 hours (4h - 24h)';
      } else {
        refundPct = 0;
        tier = '4 hours or less (≤ 4h)';
      }

      const origAmount =
        selectedBookingForCancel.payment_amount && selectedBookingForCancel.payment_amount > 0
          ? selectedBookingForCancel.payment_amount
          : 100.00;
      const refundAmount = ((origAmount * refundPct) / 100).toFixed(2);

      return {
        diffHours: parseFloat(diffHours.toFixed(1)),
        origAmount: parseFloat(origAmount).toFixed(2),
        refundPct,
        refundAmount,
        tier,
        isOver24h: diffHours > 24,
        isBetween4and24h: diffHours > 4 && diffHours <= 24,
        isUnder4h: diffHours <= 4
      };
    } catch (e) {
      console.warn('Fallback cancel calculation:', e);
      return {
        diffHours: 0,
        origAmount: '100.00',
        refundPct: 0,
        refundAmount: '0.00',
        tier: '4 hours or less (≤ 4h)',
        isOver24h: false,
        isBetween4and24h: false,
        isUnder4h: true
      };
    }
  }, [selectedBookingForCancel]);

  const getRefundBadgeStyle = (status) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-100 text-amber-900 border border-amber-300';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-900 border border-blue-300';
      case 'PROCESSING':
        return 'bg-purple-100 text-purple-900 border border-purple-300';
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
      case 'REJECTED':
        return 'bg-rose-100 text-rose-900 border border-rose-300';
      case 'FAILED':
        return 'bg-red-100 text-red-900 border border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border border-gray-300';
    }
  };

  const getRefundBadgeIcon = (status) => {
    switch (status) {
      case 'PENDING': return 'hourglass_top';
      case 'APPROVED': return 'task_alt';
      case 'PROCESSING': return 'sync';
      case 'COMPLETED': return 'check_circle';
      case 'REJECTED': return 'cancel';
      case 'FAILED': return 'error';
      default: return 'info';
    }
  };

  const getRefundBadgeText = (status) => {
    switch (status) {
      case 'PENDING': return 'Refund Pending';
      case 'APPROVED': return 'Refund Approved';
      case 'PROCESSING': return 'Refund Processing';
      case 'COMPLETED': return 'Refund Completed';
      case 'REJECTED': return 'Refund Rejected';
      case 'FAILED': return 'Refund Failed';
      default: return status || 'Cancelled';
    }
  };

  const formatCustomerDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Slot / Table Change Wizard (Next 1 week only - matching main booking section)
  const handleStartChange = async (booking) => {
    soundManager.playPop();
    setSelectedBookingForChange(booking);

    // Ensure change date is within the allowed next 1 week (7 days)
    const isDateInNext7Days = next7Days.some((d) => d.iso === booking.booking_date);
    const targetDate = isDateInNext7Days ? booking.booking_date : next7Days[0].iso;
    const match = next7Days.find((d) => d.iso === targetDate) || next7Days[0];

    setChangeDayIso(targetDate);
    setChangeDate(targetDate);
    setChangeDisplayedMonth(match.monthName);
    setChangeDisplayedYear(match.year);
    setChangeSlot(booking.booking_time);
    setChangeTable(null);
    setChangeTimePopupOpen(false);
    setManageStep('change');

    // Load allowable slots for change (1h rule)
    try {
      const slots = await api.getBookingSlots(targetDate, 'CHANGE_BOOKING');
      setChangeSlots(slots);

      const preferredSlot = slots.find((s) => s.time === booking.booking_time && s.isAvailable)?.time
        || slots.find((s) => s.isAvailable)?.time
        || (slots[0] ? slots[0].time : booking.booking_time);

      setChangeSlot(preferredSlot);

      // Load tables for change
      const tables = await api.getTableAvailability(targetDate, preferredSlot);
      setChangeTables(tables);
    } catch (err) {
      console.error('Failed to initialize change slots:', err);
    }
  };

  const handleDaySelectForChange = async (iso) => {
    if (!iso) return;
    const match = next7Days.find((d) => d.iso === iso);
    if (!match) return;

    soundManager.playPop();
    setChangeDayIso(iso);
    setChangeDate(iso);
    setChangeDisplayedMonth(match.monthName);
    setChangeDisplayedYear(match.year);
    setChangeTable(null);

    try {
      const slots = await api.getBookingSlots(iso, 'CHANGE_BOOKING');
      setChangeSlots(slots);

      let slotToUse = changeSlot;
      const slotStillAvail = slots.find((s) => s.time === slotToUse && s.isAvailable);
      if (!slotStillAvail) {
        const firstAvail = slots.find((s) => s.isAvailable);
        slotToUse = firstAvail ? firstAvail.time : (slots[0]?.time || '');
      }
      setChangeSlot(slotToUse);

      if (slotToUse) {
        const tables = await api.getTableAvailability(iso, slotToUse);
        setChangeTables(tables);
      }
      setChangeTimePopupOpen(true);
    } catch (err) {
      console.error('Failed to update change slots:', err);
    }
  };

  const handleSlotSelectForChange = async (slotTime) => {
    soundManager.playPop();
    setChangeSlot(slotTime);
    setChangeTimePopupOpen(false);
    setChangeTable(null);
    try {
      const tables = await api.getTableAvailability(changeDate, slotTime);
      setChangeTables(tables);
    } catch (err) {
      console.error('Failed to update tables for slot change:', err);
    }
  };

  const handleCalendarSelectForChange = (e) => {
    const val = e.target.value; // YYYY-MM-DD
    if (!val) return;
    const match = next7Days.find((d) => d.iso === val);
    if (match) {
      handleDaySelectForChange(val);
    } else {
      soundManager.playError();
      alert('Table changes are only permitted within the next 1 week (7 days). Please select a date within this week.');
    }
  };

  const handleExecuteChange = async () => {
    if (!selectedBookingForChange || !changeTable) {
      alert('Please select an available table.');
      return;
    }

    try {
      setManageLoading(true);
      setChangeOtpError('');
      soundManager.playPop();

      // Create hold for change
      const hold = await api.createBookingHold({
        tableNumber: changeTable.tableNumber,
        bookingDate: changeDate,
        bookingTime: changeSlot,
        customerName: selectedBookingForChange.customer_name,
        customerPhone: selectedBookingForChange.customer_phone,
        guestsCount: selectedBookingForChange.guests_count,
        purpose: 'CHANGE_BOOKING',
        originalBookingId: selectedBookingForChange.id
      });

      setChangeHold(hold);
      setManageLoading(false);

      if (hold.feeAmount > 0) {
        // Requires ₹50 penalty fee payment
        setChangeFeeModal(true);
      } else {
        // Free change -> transition to OTP verification page
        setChangeDevOtp(hold.devOtp || '');
        setChangeOtpCode('');
        setChangeOtpCountdown(60);
        setChangeHoldTimer(300);
        setManageStep('change_otp');
        soundManager.playSuccess();
      }
    } catch (err) {
      setManageLoading(false);
      soundManager.playError();
      alert(err.message || 'Failed to change slot/table.');
    }
  };

  const handlePayChangeFee = async () => {
    if (!changeHold) return;
    try {
      setProcessingPayment(true);
      soundManager.playPop();

      const payRes = await api.verifyBookingPayment({
        holdToken: changeHold.holdToken,
        paymentMethod: 'UPI'
      });

      setProcessingPayment(false);
      setChangeFeeModal(false);
      setChangeDevOtp(payRes.devOtp || '');
      setChangeOtpCode('');
      setChangeOtpCountdown(60);
      setChangeHoldTimer(300);
      setManageStep('change_otp');
      soundManager.playSuccess();
    } catch (err) {
      setProcessingPayment(false);
      soundManager.playError();
      alert(err.message || 'Payment failed.');
    }
  };

  const handleVerifyChangeOtp = async (e) => {
    e.preventDefault();
    if (!changeHold || !changeOtpCode.trim()) return;

    try {
      setChangeVerifyingOtp(true);
      setChangeOtpError('');
      soundManager.playPop();

      const confirmRes = await api.verifyBookingOtpAndConfirm({
        holdToken: changeHold.holdToken,
        otpCode: changeOtpCode.trim()
      });

      soundManager.playSuccess();

      // Clean up hold states & switch to list view immediately
      setChangeVerifyingOtp(false);
      setChangeHold(null);
      setChangeTable(null);
      setChangeOtpCode('');
      setChangeDevOtp('');
      setSelectedBookingForChange(null);
      setManageStep('list');

      // Refresh manage list without requiring unverified OTP
      try {
        const refresh = await api.getCustomerBookings(managePhone.trim());
        if (refresh?.bookings) {
          setCustomerBookings(refresh.bookings);
        }
      } catch {
        if (confirmRes?.booking) {
          setCustomerBookings((prev) =>
            prev.map((b) => (b.id === confirmRes.booking.id ? { ...b, ...confirmRes.booking } : b))
          );
        }
      }

      alert('Booking slot and table updated successfully!');
    } catch (err) {
      setChangeVerifyingOtp(false);
      soundManager.playError();
      setChangeOtpError(err.message || 'Incorrect verification code. Please retry.');
    }
  };

  const handleResendChangeOtp = async () => {
    if (!changeHold || changeOtpCountdown > 0) return;
    try {
      soundManager.playPop();
      const res = await api.resendHoldOtp(changeHold.holdToken);
      setChangeDevOtp(res.devOtp || '');
      setChangeOtpCountdown(60);
      setChangeOtpError('');
      soundManager.playSuccess();
    } catch (err) {
      soundManager.playError();
      setChangeOtpError(err.message || 'Failed to resend OTP.');
    }
  };

  const handleCancelChangeHold = async () => {
    if (changeHold) {
      await api.releaseBookingHold(changeHold.holdToken).catch(() => {});
    }
    setChangeHold(null);
    setChangeOtpCode('');
    setChangeDevOtp('');
    setChangeOtpError('');
    setManageStep('change');
  };

  // Format seconds to mm:ss
  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // -------------------------------------------------------------
  // VIEW-ONLY FULL MENU VIEW
  // -------------------------------------------------------------
  if (currentView === 'menu') {
    return (
      <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans selection:bg-secondary-container selection:text-on-secondary-container">
        {/* Top Sticky Bar */}
        <div className="bg-primary text-on-primary px-4 lg:px-12 py-3.5 flex items-center justify-between shadow-md sticky top-0 z-40 border-b border-primary-container">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                soundManager.playPop();
                setCurrentView('hero');
              }}
              className="flex items-center gap-1 text-xs font-bold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Back to Home</span>
            </button>
            <div>
              <h1 className="text-sm lg:text-base font-black text-white leading-tight">
                Royal Dine-In Menu
              </h1>
              <p className="text-[10px] text-amber-200 font-mono">View Only • Table QR Required to Order</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={scrollToBooking}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary-container hover:bg-secondary-fixed text-on-secondary-container text-xs font-black shadow-sm transition-all hover:scale-105 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">calendar_month</span>
              <span>Book Your Table</span>
            </button>
          </div>
        </div>

        {/* View-Only Notice Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center text-xs text-amber-900 font-medium flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-amber-700 text-[18px]">info</span>
          <span>
            You are browsing our complete royal menu in <strong>View-Only Mode</strong>. Dine-in ordering is unlocked after table booking and scanning your table QR code.
          </span>
        </div>

        {/* Render CustomerMenu in View-Only Mode */}
        <div className="max-w-4xl mx-auto w-full flex-1">
          <CustomerMenu menuItems={menuItems} isViewOnly={true} />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // HERO & BOOKING PAGE VIEW
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans selection:bg-secondary-container selection:text-on-secondary-container">
      {/* EDITORIAL HERO SECTION (MERGED WITH BRAND & TOP BAR) */}
      <EditorialHeroSection
        restaurantSettings={restaurantSettings}
        onReserveTable={scrollToBooking}
        onExploreMenu={() => {
          soundManager.playPop();
          setCurrentView('menu');
        }}
        onManageBookings={handleOpenManageModal}
        menuItems={menuItems}
        onSelectDish={(dish) => setSelectedDishDetail(dish)}
      />

      {/* BOOK YOUR TABLE SECTION */}
      <section
        id="reservation"
        ref={bookingSectionRef}
        className="py-16 px-4 lg:px-12 max-w-7xl mx-auto w-full space-y-8"
      >
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/30 border border-secondary-container text-on-secondary-container text-xs font-bold">
            <span className="material-symbols-outlined text-[16px] text-secondary">table_restaurant</span>
            <span>Online Table Reservation</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
            Book Your Table
          </h2>
          <p className="text-xs sm:text-sm text-gray-500">
            Select your preferred dining date, time slot, and choose your favorite table among our 12 royal booths.
          </p>
          <div className="flex items-center justify-center gap-4 text-[11px] text-gray-500 pt-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Booking window: Next 7 days
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Hours: 12:00 PM – 12:00 AM
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Minimum 4 hours advance notice
            </span>
          </div>
        </div>

        {/* CONFIRMED BOOKING PASS (If booked just now) */}
        {confirmedBooking && (
          <div className="max-w-lg mx-auto bg-white rounded-3xl border-2 border-emerald-500 p-6 sm:p-8 shadow-xl text-center space-y-5 animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto border-2 border-emerald-400 shadow-sm">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>

            <div>
              <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-widest bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-full">
                RESERVATION CONFIRMED
              </span>
              <h3 className="text-2xl font-black text-gray-900 mt-2">
                Table #{confirmedBooking.table_number} Reserved!
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                We look forward to hosting you at K K's Food House.
              </p>
            </div>

            <div className="bg-amber-50/50 border border-secondary-container rounded-2xl p-5 text-left text-xs space-y-2 relative">
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-500">Booking Code:</span>
                <span className="font-mono font-black text-primary text-sm">{confirmedBooking.booking_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Guest Name:</span>
                <span className="font-bold text-gray-900">{confirmedBooking.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Mobile Number:</span>
                <span className="font-bold text-gray-900">{confirmedBooking.customer_phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date & Slot:</span>
                <span className="font-bold text-gray-900">{confirmedBooking.booking_date} at {confirmedBooking.booking_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Number of People:</span>
                <span className="font-bold text-gray-900">{confirmedBooking.guests_count} Guests</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="text-gray-500">Guarantee Fee:</span>
                <span className="font-black text-emerald-700">₹{confirmedBooking.payment_amount} (Paid)</span>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmedBooking(null)}
                className="px-5 py-2.5 rounded-xl bg-surface-container text-gray-800 text-xs font-bold border border-gray-300 hover:bg-gray-100 transition-all cursor-pointer"
              >
                Book Another Table
              </button>
              <button
                onClick={handleOpenManageModal}
                className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-md hover:bg-primary-container transition-all cursor-pointer"
              >
                Review / Manage Booking
              </button>
            </div>
          </div>
        )}

        {/* BOOKING WIZARD */}
        {!confirmedBooking && (
          <div className="bg-white rounded-3xl border border-surface-container-high p-6 sm:p-10 shadow-sm space-y-8">
            {/* Step 1: Date & Time Selection (Date on left matching reference image; Time directly beside on right) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-surface-container-high pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container text-xs flex items-center justify-center font-black">1</span>
                  <h3 className="text-sm font-bold text-gray-900">Select Date & Time</h3>
                </div>
                <span className="text-[11px] text-gray-400 font-mono">
                  {selectedDate && selectedSlot
                    ? `${formatFriendlyDate(selectedDate)} at ${selectedSlot}`
                    : selectedDate
                      ? `${formatFriendlyDate(selectedDate)} — Select time`
                      : 'Manual selection required'}
                </span>
              </div>

              {/* Side-by-Side: Date Selector (Left) & Time Selector (Right) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* DATE SELECTOR (Matching reference image: "Select date", [ Day ∨ ] [ Month (Live) ∨ ] [ Year (Live) ∨ ]) */}
                <div className="bg-white rounded-2xl border border-gray-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-gray-900">Select date</label>
                    {selectedDate ? (
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {formatFriendlyDate(selectedDate)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-gray-400">Next 1 week only</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Day Dropdown (Only option user can choose - next 7 days) */}
                    <div className="relative flex-[1.1]">
                      <select
                        value={selectedDayIso}
                        onChange={(e) => handleDaySelect(e.target.value)}
                        className={`w-full appearance-none bg-gray-100 hover:bg-gray-200/70 border ${
                          selectedDayIso
                            ? 'border-primary/40 bg-primary/5 text-gray-900 font-bold'
                            : 'border-transparent text-gray-800 font-semibold'
                        } text-xs sm:text-sm py-3 pl-3 pr-7 rounded-xl cursor-pointer focus:outline-none transition-colors`}
                      >
                        <option value="" disabled>Day</option>
                        {next7Days.map((d) => (
                          <option key={d.iso} value={d.iso}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-gray-500 pointer-events-none">
                        expand_more
                      </span>
                    </div>

                    {/* Month (Auto-filled Live Month - Reference Style) */}
                    <div className="relative flex-[1.4]">
                      <div
                        className="w-full bg-gray-100 border border-transparent text-gray-800 text-xs sm:text-sm font-semibold py-3 pl-3 pr-7 rounded-xl select-none flex items-center justify-between"
                        title="Current Month (Auto-filled)"
                      >
                        <span className="truncate">{displayedMonth}</span>
                        <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">
                          expand_more
                        </span>
                      </div>
                    </div>

                    {/* Year (Auto-filled Live Year - Reference Style) */}
                    <div className="relative flex-1">
                      <div
                        className="w-full bg-gray-100 border border-transparent text-gray-800 text-xs sm:text-sm font-semibold py-3 pl-3 pr-7 rounded-xl select-none flex items-center justify-between"
                        title="Current Year (Auto-filled)"
                      >
                        <span className="truncate">{displayedYear}</span>
                        <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">
                          expand_more
                        </span>
                      </div>
                    </div>

                    {/* Calendar Control Icon (Clamped to next 1 week) */}
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          calendarInputRef.current?.showPicker?.();
                        } catch {
                          calendarInputRef.current?.focus();
                        }
                      }}
                      title="Open calendar picker (Next 1 week only)"
                      className="p-3 bg-gray-100 hover:bg-gray-200/70 text-gray-600 hover:text-primary rounded-xl transition-colors cursor-pointer flex items-center justify-center shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                      <input
                        ref={calendarInputRef}
                        type="date"
                        min={getTodayISO()}
                        max={getMaxBookingDateISO()}
                        value={selectedDate || ''}
                        onChange={handleCalendarSelect}
                        className="sr-only"
                      />
                    </button>
                  </div>
                </div>

                {/* TIME SELECTOR (Directly beside on right, matching style & dimensions) */}
                <div className="bg-white rounded-2xl border border-gray-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-gray-900">Select time</label>
                    {selectedSlot ? (
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        Selected
                      </span>
                    ) : selectedDate ? (
                      <span className="text-[10px] font-mono text-gray-400">1-hr slots (12 PM–12 AM)</span>
                    ) : (
                      <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        Locked
                      </span>
                    )}
                  </div>

                  {!selectedDate ? (
                    /* Locked State */
                    <div className="w-full py-3 px-3.5 rounded-xl bg-gray-100 border border-transparent text-gray-400 font-medium text-xs sm:text-sm flex items-center justify-between cursor-not-allowed select-none">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-gray-400">lock</span>
                        <span>Select date first to choose time</span>
                      </span>
                      <span className="text-[10px] font-mono uppercase bg-gray-200 text-gray-500 px-2 py-0.5 rounded-md font-bold">
                        Locked
                      </span>
                    </div>
                  ) : (
                    /* Unlocked State */
                    <div className="relative" ref={timePopupRef}>
                      <button
                        type="button"
                        onClick={() => {
                          soundManager.playPop();
                          setTimePopupOpen(!timePopupOpen);
                        }}
                        className={`w-full py-3 px-3.5 rounded-xl bg-gray-100 hover:bg-gray-200/70 border ${
                          selectedSlot
                            ? 'border-primary/40 bg-primary/5 text-gray-900 font-bold'
                            : 'border-secondary/40 bg-amber-50 text-amber-950 font-semibold ring-2 ring-secondary/20'
                        } text-xs sm:text-sm cursor-pointer focus:outline-none transition-colors flex items-center justify-between`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                          <span className="truncate">{selectedSlot || 'Choose 1-Hour Time Slot (12:00 PM – 12:00 AM)'}</span>
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-gray-500 shrink-0">
                          {timePopupOpen ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>

                      {/* Popup / Scroll Selector */}
                      {timePopupOpen && (
                        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-gray-200 shadow-xl p-2.5 z-40 space-y-1.5 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100 text-xs font-bold text-gray-700">
                            <span>Available 1-Hour Slots ({formatFriendlyDate(selectedDate)})</span>
                            <button
                              type="button"
                              onClick={() => setTimePopupOpen(false)}
                              className="text-gray-400 hover:text-gray-600 cursor-pointer text-xs font-bold"
                            >
                              ✕ Close
                            </button>
                          </div>

                          {slotsLoading ? (
                            <div className="py-6 text-center text-xs text-gray-400">Loading available time slots...</div>
                          ) : (
                            <div className="max-h-56 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                              {availableSlots.map((slot) => {
                                const isSelected = selectedSlot === slot.time;
                                const isAvail = slot.isAvailable;

                                return (
                                  <button
                                    key={slot.time}
                                    type="button"
                                    disabled={!isAvail}
                                    onClick={() => {
                                      if (isAvail) {
                                        soundManager.playPop();
                                        setSelectedSlot(slot.time);
                                        setTimePopupOpen(false);
                                      }
                                    }}
                                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all border cursor-pointer ${
                                      isSelected
                                        ? 'bg-primary text-white border-primary shadow-xs ring-1 ring-secondary'
                                        : isAvail
                                          ? 'bg-surface-container-low text-gray-800 hover:bg-surface-container border-gray-200 hover:border-gray-300'
                                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-[16px]">
                                        {isSelected ? 'check_circle' : 'schedule'}
                                      </span>
                                      <span className="font-bold">{slot.time}</span>
                                    </div>
                                    {isAvail ? (
                                      <span className={`text-[10px] font-extrabold ${isSelected ? 'text-white' : 'text-emerald-700'}`}>
                                        Available
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-rose-500 font-mono">
                                        {slot.reason?.includes('4 hours') ? '< 4h left' : 'Unavailable'}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2: 12 Tables Interactive Layout (Visible at all times; disabled until Date + Time selected) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-surface-container-high pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container text-xs flex items-center justify-center font-black">2</span>
                  <h3 className="text-sm font-bold text-gray-900">
                    Choose Your Table {selectedDate && selectedSlot ? `(${formatFriendlyDate(selectedDate)} at ${selectedSlot})` : ''}
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-700 font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600"></span>
                    Green = Available
                  </span>
                  <span className="flex items-center gap-1 text-gray-500 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400 border border-gray-500"></span>
                    Grey = Booked
                  </span>
                </div>
              </div>

              {/* Notice when Date + Time are NOT selected */}
              {(!selectedDate || !selectedSlot) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2 text-xs text-amber-900 font-bold">
                  <span className="material-symbols-outlined text-[18px] text-amber-700">lock</span>
                  <span>Tables Locked: Please select both a Date and a Time Slot above to unlock table selection.</span>
                </div>
              )}

              {/* Notice for Clicked Booked Table */}
              {clickedBookedTable && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-shake text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-700">info</span>
                    <span>
                      <strong>Table #{clickedBookedTable.tableNumber}</strong> is currently {clickedBookedTable.statusText}. It will become available after this time.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenManageModal}
                      className="px-3 py-1 bg-amber-900 hover:bg-black text-white font-bold rounded-lg text-xs cursor-pointer transition-all shadow-xs"
                    >
                      Manage / View Booking
                    </button>
                    <button
                      type="button"
                      onClick={() => setClickedBookedTable(null)}
                      className="text-amber-700 hover:text-amber-950 text-xs font-bold underline cursor-pointer ml-1"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* All 12 Tables Grid */}
              {tablesLoading ? (
                <div className="py-8 text-center text-xs text-gray-400">Loading table availability...</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                  {tablesAvailability.map((tbl) => {
                    const isLocked = !selectedDate || !selectedSlot;
                    const isSelected = selectedTable?.tableNumber === tbl.tableNumber;
                    const isAvail = tbl.isAvailable && !isLocked;

                    return (
                      <div
                        key={tbl.tableNumber}
                        onClick={() => {
                          if (isLocked) {
                            soundManager.playError();
                            alert('Please select both a Date and a Time Slot above first to unlock table selection.');
                            return;
                          }
                          handleTableClick(tbl);
                        }}
                        className={`p-3.5 rounded-2xl border-2 transition-all relative text-center space-y-1.5 ${
                          isLocked
                            ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-60 cursor-not-allowed'
                            : isSelected
                              ? 'border-secondary bg-amber-50/80 ring-2 ring-secondary shadow-md scale-105 cursor-pointer'
                              : isAvail
                                ? 'border-emerald-500 bg-emerald-50/40 hover:bg-emerald-100/60 hover:shadow-sm cursor-pointer'
                                : 'border-gray-300 bg-gray-100/80 text-gray-500 hover:border-gray-400 opacity-75 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-black text-gray-400">
                            #{tbl.tableNumber}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase ${
                              isLocked
                                ? 'bg-gray-200 text-gray-500'
                                : isAvail
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {isLocked ? 'LOCKED' : isAvail ? 'AVAILABLE' : 'BOOKED'}
                          </span>
                        </div>

                        <div className="py-1">
                          <span className={`material-symbols-outlined text-[28px] block ${isLocked ? 'text-gray-400' : 'text-gray-700'}`}>
                            table_restaurant
                          </span>
                          <span className={`text-xs font-extrabold block ${isLocked ? 'text-gray-500' : 'text-gray-900'}`}>
                            Table {tbl.tableNumber}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {tbl.capacity} Guests
                          </span>
                        </div>

                        {/* Status Footer */}
                        <div className="pt-1.5 border-t border-gray-200 min-h-[22px] flex items-center justify-center">
                          {isLocked ? (
                            <span className="text-gray-400 text-[10px] font-bold">Locked</span>
                          ) : isAvail ? (
                            <span className="text-emerald-700 text-[10px] font-bold">Select Table</span>
                          ) : (
                            <span
                              className="text-gray-600 block text-[9px] sm:text-[9.5px] leading-tight font-extrabold"
                              title={tbl.statusText}
                            >
                              {tbl.statusText || (tbl.bookedSlot ? formatBookedBetween(tbl.bookedSlot) : 'Booked')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 3: Customer Details & Number of People (Collected after selecting a table) */}
            <div className="pt-4 border-t border-surface-container-high space-y-4">
              <div className="flex items-center justify-between border-b border-surface-container-high pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container text-xs flex items-center justify-center font-black">3</span>
                  <h3 className="text-sm font-bold text-gray-900">Guest Information & Number of People</h3>
                </div>
                {selectedTable && (
                  <span className="text-[11px] text-emerald-700 font-bold">
                    Table #{selectedTable.tableNumber} Selected
                  </span>
                )}
              </div>

              {!selectedTable ? (
                <div className="p-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-center space-y-1">
                  <div className="text-xs font-bold text-gray-600">Guest Details Locked</div>
                  <div className="text-[11px] text-gray-400">Please select an available table above to enter your details and proceed to booking</div>
                </div>
              ) : (
                <form onSubmit={handleProceedToPayment} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        Customer Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Kunal Sharma"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full bg-surface-container-low border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-bold focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        Mobile Number * (For Booking OTP)
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 98765 43210"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full bg-surface-container-low border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-bold focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        Number of People
                      </label>
                      <div className="flex items-center gap-1.5">
                        {['1', '2', '3', '4'].map((count) => (
                          <button
                            key={count}
                            type="button"
                            onClick={() => {
                              soundManager.playPop();
                              setGuestCountMode(count);
                            }}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              guestCountMode === count
                                ? 'bg-primary text-white border-primary shadow-xs'
                                : 'bg-surface-container-low text-gray-700 border-gray-300 hover:bg-gray-100'
                            }`}
                          >
                            {count}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            soundManager.playPop();
                            setGuestCountMode('custom');
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            guestCountMode === 'custom'
                              ? 'bg-primary text-white border-primary shadow-xs'
                              : 'bg-surface-container-low text-gray-700 border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          More
                        </button>
                      </div>

                      {guestCountMode === 'custom' && (
                        <div className="mt-2">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={customGuestCount}
                            onChange={(e) => setCustomGuestCount(e.target.value)}
                            placeholder="Enter number of people"
                            className="w-full bg-surface-container-low border border-gray-300 rounded-xl px-3 py-1.5 text-xs text-gray-900 font-bold"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit / Proceed to Hold & ₹100.00 Payment */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-surface-container-high">
                    <div className="text-xs text-gray-500 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-emerald-600 text-[18px]">verified_user</span>
                      <span>
                        Selected: <strong>{selectedTable ? `Table #${selectedTable.tableNumber}` : 'No table selected'}</strong> on {formatFriendlyDate(selectedDate)} at {selectedSlot}. Advance reservation charge: <strong>₹100.00</strong>.
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={!selectedTable}
                      data-sound="pop"
                      className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-primary hover:bg-primary-container text-white font-black text-xs shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px] text-secondary-container">lock_clock</span>
                      <span>Hold Table & Pay ₹100.00</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </section>

      {/* MODAL 1: TEMPORARY HOLD & ₹100.00 PAYMENT MODAL */}
      {paymentModalOpen && activeHold && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl relative">
            {/* Top Hold Countdown Timer */}
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
                <span className="material-symbols-outlined text-[20px] text-amber-600 animate-spin">
                  hourglass_top
                </span>
                <span>Temporary Table Hold Active</span>
              </div>
              <span className="font-mono font-black text-amber-950 text-sm bg-white px-2.5 py-1 rounded-xl border border-amber-200 shadow-xs">
                {formatTimer(holdTimer)}
              </span>
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-xl font-black text-gray-900">
                Confirm Reservation Guarantee
              </h3>
              <p className="text-xs text-gray-500">
                Table #{activeHold.tableNumber} is temporarily locked for your slot on {activeHold.bookingDate} at {activeHold.bookingTime}.
              </p>
            </div>

            {/* Bill Summary */}
            <div className="bg-surface-container-low rounded-2xl p-4 border border-gray-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Table:</span>
                <span className="font-bold text-gray-900">Table #{activeHold.tableNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Guest:</span>
                <span className="font-bold text-gray-900">{customerName} ({customerPhone})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Party Size:</span>
                <span className="font-bold text-gray-900">{getGuestsCount()} People</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-sm">
                <span className="font-bold text-gray-900">Booking Charge:</span>
                <span className="font-black text-primary text-base">₹{activeHold.feeAmount?.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled={processingPayment}
                onClick={handlePayGuaranteeFee}
                className="w-full py-3.5 bg-primary hover:bg-primary-container text-white text-xs font-black rounded-2xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {processingPayment ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    <span>Verifying Payment...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px] text-secondary-container">payments</span>
                    <span>Pay ₹100.00 & Receive OTP</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleReleaseHold()}
                className="w-full py-2.5 text-xs font-bold text-gray-500 hover:text-gray-900 cursor-pointer"
              >
                Cancel & Release Hold
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: OTP VERIFICATION MODAL (SENT ONLY AFTER PAYMENT) */}
      {otpModalOpen && activeHold && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl relative">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                <span className="material-symbols-outlined text-[24px]">verified</span>
              </div>
              <h3 className="text-xl font-black text-gray-900">
                Payment Verified! Enter OTP
              </h3>
              <p className="text-xs text-gray-500">
                ₹100.00 payment successful. Enter the 6-digit OTP sent to <strong>{customerPhone}</strong> to confirm Table #{activeHold.tableNumber}.
              </p>
            </div>

            {/* Dev helper */}
            {devOtp && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-center">
                <span className="text-[11px] text-amber-900 font-mono font-bold">
                  Dev Sandbox OTP: <span className="text-sm font-black text-amber-950">{devOtp}</span>
                </span>
              </div>
            )}

            {otpError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-bold text-center">
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOtpAndConfirm} className="space-y-4">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="• • • • • •"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-widest font-mono text-xl font-black py-3 bg-surface-container-low border border-gray-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Hold timer: {formatTimer(holdTimer)}</span>
                <button
                  type="button"
                  disabled={otpCountdown > 0}
                  onClick={handlePayGuaranteeFee}
                  className="text-secondary font-bold hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
                >
                  {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend OTP'}
                </button>
              </div>

              <button
                type="submit"
                disabled={verifyingOtp || !otpCode.trim()}
                className="w-full py-3.5 bg-primary hover:bg-primary-container text-white text-xs font-black rounded-2xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {verifyingOtp ? (
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">check</span>
                    <span>Verify & Confirm Booking</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MANAGE / REVIEW YOUR BOOKINGS MODAL */}
      {manageModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 max-w-2xl w-full space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">manage_search</span>
                <h3 className="text-lg font-black text-gray-900">Manage / Review Your Bookings</h3>
              </div>
              <button
                onClick={() => {
                  if (changeHold) {
                    api.releaseBookingHold(changeHold.holdToken).catch(() => {});
                    setChangeHold(null);
                  }
                  setManageModalOpen(false);
                }}
                className="text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {manageError && (
              <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-800 font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{manageError}</span>
              </div>
            )}

            {/* STEP 1: MOBILE NUMBER LOOKUP */}
            {manageStep === 'phone' && (
              <form onSubmit={handleManageRequestOtp} className="space-y-4">
                <p className="text-xs text-gray-500">
                  Enter the registered mobile number used during table booking. An OTP will be sent only if a valid booking exists for that number.
                </p>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Registered Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 98765 43210"
                    value={managePhone}
                    onChange={(e) => setManagePhone(e.target.value)}
                    className="w-full bg-surface-container-low border border-gray-300 rounded-2xl px-4 py-3 text-xs font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={manageLoading}
                  className="w-full py-3.5 bg-primary hover:bg-primary-container text-white text-xs font-black rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {manageLoading ? (
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">sms</span>
                      <span>Verify & Send OTP</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: MANAGE OTP VERIFICATION */}
            {manageStep === 'otp' && (
              <form onSubmit={handleManageVerifyOtp} className="space-y-4">
                <p className="text-xs text-gray-500">
                  Enter the 6-digit OTP code sent to <strong>{managePhone}</strong> to view and manage your reservations.
                </p>

                {manageDevOtp && (
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-center">
                    <span className="text-[11px] text-amber-900 font-mono font-bold">
                      Dev Sandbox OTP: <span className="text-sm font-black text-amber-950">{manageDevOtp}</span>
                    </span>
                  </div>
                )}

                <div>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    autoFocus
                    placeholder="• • • • • •"
                    value={manageOtpCode}
                    onChange={(e) => setManageOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-widest font-mono text-xl font-black py-3 bg-surface-container-low border border-gray-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setManageStep('phone')}
                    className="text-gray-500 underline font-medium cursor-pointer"
                  >
                    Change Number
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={manageLoading || !manageOtpCode.trim()}
                  className="w-full py-3.5 bg-primary hover:bg-primary-container text-white text-xs font-black rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {manageLoading ? (
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                      <span>Access My Bookings</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 3: CUSTOMER BOOKINGS LIST WITH TIME-POLICY PILLS */}
            {manageStep === 'list' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-gray-500 border-b border-gray-200 pb-2">
                  <span>Found {customerBookings.length} booking(s) for {managePhone}</span>
                  <button
                    onClick={() => setManageStep('phone')}
                    className="text-primary font-bold underline cursor-pointer"
                  >
                    Lookup another number
                  </button>
                </div>

                {customerBookings.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400">
                    No bookings found.
                  </div>
                ) : (
                  customerBookings.map((bk) => (
                    <div
                      key={bk.id}
                      className="bg-surface-container-lowest border border-gray-200 rounded-2xl p-5 space-y-3 shadow-xs"
                    >
                      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-primary text-sm">
                            {bk.booking_code}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-secondary-container text-on-secondary-container text-xs font-extrabold">
                            Table #{bk.table_number || bk.table_id}
                          </span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${bk.status === 'CONFIRMED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : bk.status === 'SEATED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                          {bk.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400 block text-[10px]">Guest:</span>
                          <span className="font-bold text-gray-900">{bk.customer_name}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Date & Slot:</span>
                          <span className="font-bold text-gray-900">{bk.booking_date} at {bk.booking_time}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Party Size:</span>
                          <span className="font-bold text-gray-900">{bk.guests_count} People</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Hours Remaining:</span>
                          <span className="font-bold text-gray-900">{bk.remainingHours}h</span>
                        </div>
                      </div>

                      {/* Active Booking: Change and Cancellation Controls */}
                      {(bk.status === 'CONFIRMED' || bk.status === 'SEATED') && (
                        <div className="space-y-2">
                          {/* Policy Rule Box for Changes */}
                          <div className={`p-2.5 rounded-xl text-[11px] font-bold flex items-center justify-between ${
                            bk.canChange
                              ? bk.changeFee === 0
                                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                                : 'bg-amber-50 text-amber-900 border border-amber-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}>
                            <span>{bk.policyMessage}</span>
                            {bk.canChange && (
                              <button
                                onClick={() => handleStartChange(bk)}
                                className="px-3 py-1 bg-primary text-white font-black rounded-lg text-[10px] hover:bg-primary-container cursor-pointer shrink-0 ml-2 transition-all"
                              >
                                Change Slot / Table
                              </button>
                            )}
                          </div>

                          {/* Cancellation Action & Refund Estimation */}
                          <div className="p-3 bg-rose-50/50 border border-rose-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div>
                              <div className="flex items-center gap-1.5 font-black text-rose-900 text-xs">
                                <span className="material-symbols-outlined text-rose-600 text-[16px]">cancel</span>
                                <span>Cancellation & Refund</span>
                              </div>
                              {bk.cancellationPreview && (
                                <p className="text-[11px] text-gray-600 mt-0.5">
                                  Current Refund: <strong className="text-emerald-700 font-bold">{bk.cancellationPreview.refundPercentage}% (₹{bk.cancellationPreview.refundAmount})</strong> • {bk.cancellationPreview.tierLabel}
                                </p>
                              )}
                            </div>

                            <button
                              onClick={() => handleStartCancel(bk)}
                              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-[11px] shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 shrink-0"
                            >
                              <span className="material-symbols-outlined text-[15px]">event_busy</span>
                              Cancel Booking
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Cancelled Booking: Live Refund Tracking Card */}
                      {bk.status === 'CANCELLED' && (
                        <div className="bg-surface-container-low border border-surface-container-high rounded-xl p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between border-b border-surface-container-high pb-2">
                            <div className="flex items-center gap-1.5 text-xs font-black text-gray-800">
                              <span className="material-symbols-outlined text-primary text-[16px]">account_balance_wallet</span>
                              <span>Customer Refund Tracking</span>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 ${getRefundBadgeStyle(bk.cancellationDetails?.status)}`}>
                              <span className="material-symbols-outlined text-[13px]">{getRefundBadgeIcon(bk.cancellationDetails?.status)}</span>
                              {getRefundBadgeText(bk.cancellationDetails?.status)}
                            </span>
                          </div>

                          {bk.cancellationDetails ? (
                            <div className="space-y-2 text-xs">
                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div>
                                  <span className="text-gray-400 block text-[10px]">Refund Calculated:</span>
                                  <span className="font-black text-gray-900 text-xs">
                                    ₹{parseFloat(bk.cancellationDetails.refundAmount || 0).toFixed(2)}
                                    <span className="text-gray-500 font-normal ml-1">({bk.cancellationDetails.refundPercentage}%)</span>
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block text-[10px]">Refund Destination UPI:</span>
                                  <span className="font-mono font-bold text-gray-900 truncate block select-all">
                                    {bk.cancellationDetails.customerUpiId}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block text-[10px]">Cancelled At:</span>
                                  <span className="text-gray-700">{formatCustomerDateTime(bk.cancellationDetails.cancellationDate)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block text-[10px]">Time at Cancellation:</span>
                                  <span className="text-gray-700 font-bold">{bk.cancellationDetails.remainingHours}h remaining</span>
                                </div>
                              </div>

                              {bk.cancellationDetails.reason && (
                                <div className="text-[11px] text-gray-600 bg-white p-2 rounded-lg border border-gray-200">
                                  <span className="text-[10px] text-gray-400 block uppercase font-bold">Cancellation Reason:</span>
                                  "{bk.cancellationDetails.reason}"
                                </div>
                              )}

                              {bk.cancellationDetails.status === 'COMPLETED' && (
                                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="material-symbols-outlined text-emerald-600 text-[16px]">verified</span>
                                      Final Refunded Amount:
                                    </span>
                                    <span className="font-black text-sm text-emerald-800">
                                      ₹{parseFloat(bk.cancellationDetails.refundAmount || 0).toFixed(2)} credited
                                    </span>
                                  </div>
                                  {bk.cancellationDetails.refundTransactionId && (
                                    <div className="text-[10px] text-emerald-700 font-mono">
                                      Payment Gateway Tx: {bk.cancellationDetails.refundTransactionId}
                                    </div>
                                  )}
                                </div>
                              )}

                              {bk.cancellationDetails.status === 'PENDING' && (
                                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-bold flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[15px] text-amber-600">hourglass_top</span>
                                  <span>Refund Processing: Your refund is being automatically processed back to your original payment source.</span>
                                </div>
                              )}

                              {bk.cancellationDetails.status === 'APPROVED' && (
                                <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 font-bold flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[15px] text-blue-600">task_alt</span>
                                  <span>Refund Approved. Payment gateway is processing your automatic refund.</span>
                                </div>
                              )}

                              {bk.cancellationDetails.status === 'PROCESSING' && (
                                <div className="p-2 rounded-lg bg-purple-50 border border-purple-200 text-[11px] text-purple-900 font-bold flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[15px] text-purple-600 animate-spin">sync</span>
                                  <span>Refund Processing: Transfer in progress with the payment gateway.</span>
                                </div>
                              )}

                              {bk.cancellationDetails.status === 'REJECTED' && (
                                <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-900 font-bold flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[15px] text-rose-600">cancel</span>
                                  <span>Refund could not be processed. Please contact the restaurant for assistance.</span>
                                </div>
                              )}

                              {bk.cancellationDetails.status === 'FAILED' && (
                                <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-900 font-bold flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[15px] text-red-600">error</span>
                                  <span>Refund Failed: Payment gateway experienced an issue. The system will automatically retry.</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">Booking cancelled.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* STEP 4: SLOT / TABLE CHANGE SUB-WIZARD */}
            {manageStep === 'change' && selectedBookingForChange && (
              <div className="space-y-5 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <div>
                    <h4 className="font-black text-sm text-gray-900">
                      Modifying Booking #{selectedBookingForChange.booking_code}
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Currently Table #{selectedBookingForChange.table_number} on {selectedBookingForChange.booking_date} at {selectedBookingForChange.booking_time}
                    </p>
                  </div>
                  <button
                    onClick={() => setManageStep('list')}
                    className="text-xs text-gray-500 underline font-bold cursor-pointer"
                  >
                    Back to Bookings
                  </button>
                </div>

                {/* Side-by-Side: Date Selector (Left) & Time Selector (Right) - Matching Current Booking Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* DATE SELECTOR (Matching reference image & main booking section: "Select new date", [ Day ∨ ] [ Month (Live) ∨ ] [ Year (Live) ∨ ]) */}
                  <div className="bg-white rounded-2xl border border-gray-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-gray-900">Select new date</label>
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {formatFriendlyDate(changeDate)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Day Dropdown (Only next 7 days / 1 week) */}
                      <div className="relative flex-[1.1]">
                        <select
                          value={changeDayIso}
                          onChange={(e) => handleDaySelectForChange(e.target.value)}
                          className="w-full appearance-none bg-gray-100 hover:bg-gray-200/70 border border-primary/40 bg-primary/5 text-gray-900 font-bold text-xs sm:text-sm py-3 pl-3 pr-7 rounded-xl cursor-pointer focus:outline-none transition-colors"
                        >
                          {next7Days.map((d) => (
                            <option key={d.iso} value={d.iso}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-gray-500 pointer-events-none">
                          expand_more
                        </span>
                      </div>

                      {/* Month (Auto-filled Live Month - Reference Style) */}
                      <div className="relative flex-[1.4]">
                        <div
                          className="w-full bg-gray-100 border border-transparent text-gray-800 text-xs sm:text-sm font-semibold py-3 pl-3 pr-7 rounded-xl select-none flex items-center justify-between"
                          title="Current Month (Auto-filled)"
                        >
                          <span className="truncate">{changeDisplayedMonth}</span>
                          <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">
                            expand_more
                          </span>
                        </div>
                      </div>

                      {/* Year (Auto-filled Live Year - Reference Style) */}
                      <div className="relative flex-1">
                        <div
                          className="w-full bg-gray-100 border border-transparent text-gray-800 text-xs sm:text-sm font-semibold py-3 pl-3 pr-7 rounded-xl select-none flex items-center justify-between"
                          title="Current Year (Auto-filled)"
                        >
                          <span className="truncate">{changeDisplayedYear}</span>
                          <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">
                            expand_more
                          </span>
                        </div>
                      </div>

                      {/* Calendar Control Icon (Clamped strictly to next 1 week: min=today, max=today+6) */}
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            changeCalendarInputRef.current?.showPicker?.();
                          } catch {
                            changeCalendarInputRef.current?.focus();
                          }
                        }}
                        title="Open calendar picker (Next 1 week only)"
                        className="p-3 bg-gray-100 hover:bg-gray-200/70 text-gray-600 hover:text-primary rounded-xl transition-colors cursor-pointer flex items-center justify-center shrink-0"
                      >
                        <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                        <input
                          ref={changeCalendarInputRef}
                          type="date"
                          min={getTodayISO()}
                          max={getMaxBookingDateISO()}
                          value={changeDate || ''}
                          onChange={handleCalendarSelectForChange}
                          className="sr-only"
                        />
                      </button>
                    </div>
                  </div>

                  {/* TIME SELECTOR (Directly beside on right, matching style & dimensions) */}
                  <div className="bg-white rounded-2xl border border-gray-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-gray-900">Select new time</label>
                      <span className="text-[10px] font-mono text-gray-400">1-hr slots (12 PM–12 AM)</span>
                    </div>

                    <div className="relative" ref={changeTimePopupRef}>
                      <button
                        type="button"
                        onClick={() => {
                          soundManager.playPop();
                          setChangeTimePopupOpen(!changeTimePopupOpen);
                        }}
                        className="w-full py-3 px-3.5 rounded-xl bg-gray-100 hover:bg-gray-200/70 border border-primary/40 bg-primary/5 text-gray-900 font-bold text-xs sm:text-sm cursor-pointer focus:outline-none transition-colors flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                          <span className="truncate">{changeSlot || 'Choose 1-Hour Time Slot (12:00 PM – 12:00 AM)'}</span>
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-gray-500 shrink-0">
                          {changeTimePopupOpen ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>

                      {/* Popup / Scroll Selector */}
                      {changeTimePopupOpen && (
                        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-gray-200 shadow-xl p-2.5 z-40 space-y-1.5 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100 text-xs font-bold text-gray-700">
                            <span>Available Slots ({formatFriendlyDate(changeDate)})</span>
                            <button
                              type="button"
                              onClick={() => setChangeTimePopupOpen(false)}
                              className="text-gray-400 hover:text-gray-600 cursor-pointer text-xs font-bold"
                            >
                              ✕ Close
                            </button>
                          </div>

                          <div className="max-h-56 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                            {changeSlots.map((slot) => {
                              const isSelected = changeSlot === slot.time;
                              const isAvail = slot.isAvailable;

                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  disabled={!isAvail}
                                  onClick={() => handleSlotSelectForChange(slot.time)}
                                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all border cursor-pointer ${
                                    isSelected
                                      ? 'bg-primary text-white border-primary shadow-xs ring-1 ring-secondary'
                                      : isAvail
                                        ? 'bg-surface-container-low text-gray-800 hover:bg-surface-container border-gray-200 hover:border-gray-300'
                                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px]">
                                      {isSelected ? 'check_circle' : 'schedule'}
                                    </span>
                                    <span className="font-bold">{slot.time}</span>
                                  </div>
                                  {isAvail ? (
                                    <span className={`text-[10px] font-extrabold ${isSelected ? 'text-white' : 'text-emerald-700'}`}>
                                      Available
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-rose-500 font-mono">
                                      {slot.reason?.includes('1 hour') ? '< 1h advance' : 'Unavailable'}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 12 Tables Availability for Change */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    Select New Available Table (All 12 Tables Shown):
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {changeTables.map((tbl) => {
                      const isSelected = changeTable?.tableNumber === tbl.tableNumber;
                      const isAvail = tbl.isAvailable;

                      return (
                        <div
                          key={tbl.tableNumber}
                          onClick={() => {
                            if (isAvail) {
                              soundManager.playPop();
                              setChangeTable(tbl);
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${isSelected
                              ? 'border-secondary bg-amber-50 ring-2 ring-secondary font-black'
                              : isAvail
                                ? 'border-emerald-500 bg-emerald-50/50 hover:bg-emerald-100'
                                : 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed text-gray-400'
                            }`}
                        >
                          <span className="block text-xs font-bold">Table #{tbl.tableNumber}</span>
                          <span className="text-[9.5px] text-gray-500 block leading-tight font-medium">
                            {isAvail ? 'Available' : tbl.statusText || tbl.bookedUntil || 'Booked'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Confirm Change Action */}
                <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-gray-500">Change Policy: </span>
                    <strong className={selectedBookingForChange.changeFee === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                      {selectedBookingForChange.changeFee === 0 ? 'Free of charge (≥ 24h)' : '₹50 Change Penalty Fee'}
                    </strong>
                  </div>

                  <button
                    type="button"
                    disabled={manageLoading || !changeTable}
                    onClick={handleExecuteChange}
                    className="px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-black shadow-md hover:bg-primary-container disabled:opacity-50 cursor-pointer"
                  >
                    {manageLoading ? 'Locking New Table...' : 'Confirm Table Switch'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: SLOT / TABLE CHANGE OTP VERIFICATION */}
            {manageStep === 'change_otp' && (
              changeHold && selectedBookingForChange ? (
                <div className="space-y-5 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                    <div>
                      <h4 className="font-black text-sm text-gray-900">
                        Verify Table Switch #{selectedBookingForChange.booking_code}
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Switching from Table #{selectedBookingForChange.table_number} to <strong className="text-gray-800">Table #{changeHold.tableNumber}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelChangeHold}
                      className="text-xs text-gray-500 underline font-bold cursor-pointer"
                    >
                      Back to Selection
                    </button>
                  </div>

                  {/* Switch Summary Details */}
                  <div className="bg-surface-container-low border border-gray-200 rounded-2xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">New Reservation Slot:</span>
                      <strong className="text-gray-900">{changeHold.bookingDate} at {changeHold.bookingTime}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">New Table:</span>
                      <strong className="text-primary font-black">Table #{changeHold.tableNumber}</strong>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                      <span className="text-gray-500">Change Fee:</span>
                      <strong className={changeHold.feeAmount === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                        {changeHold.feeAmount === 0 ? 'Free of charge (≥ 24h)' : '₹50.00 (Paid)'}
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-gray-600">
                      Enter the 6-digit OTP code sent to <strong>{selectedBookingForChange.customer_phone}</strong> to confirm your table switch.
                    </p>
                  </div>

                  {/* Dev Sandbox OTP Helper */}
                  {changeDevOtp && (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-center">
                      <span className="text-[11px] text-amber-900 font-mono font-bold">
                        Dev Sandbox OTP: <span className="text-sm font-black text-amber-950">{changeDevOtp}</span>
                      </span>
                    </div>
                  )}

                  {changeOtpError && (
                    <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-bold text-center">
                      {changeOtpError}
                    </div>
                  )}

                  <form onSubmit={handleVerifyChangeOtp} className="space-y-4">
                    <div>
                      <input
                        type="text"
                        maxLength={6}
                        required
                        autoFocus
                        placeholder="• • • • • •"
                        value={changeOtpCode}
                        onChange={(e) => setChangeOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full text-center tracking-widest font-mono text-xl font-black py-3 bg-surface-container-low border border-gray-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Hold timer: {formatTimer(changeHoldTimer)}</span>
                      <button
                        type="button"
                        disabled={changeOtpCountdown > 0}
                        onClick={handleResendChangeOtp}
                        className="text-secondary font-bold hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
                      >
                        {changeOtpCountdown > 0 ? `Resend in ${changeOtpCountdown}s` : 'Resend OTP'}
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={changeVerifyingOtp || !changeOtpCode.trim()}
                      className="w-full py-3.5 bg-primary hover:bg-primary-container text-white text-xs font-black rounded-2xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer disabled:opacity-50"
                    >
                      {changeVerifyingOtp ? (
                        <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">verified</span>
                          <span>Verify OTP & Confirm Switch</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCancelChangeHold}
                      className="w-full text-xs text-gray-500 underline font-bold cursor-pointer text-center"
                    >
                      Cancel Switch & Select Different Table
                    </button>
                  </form>
                </div>
              ) : (
                <div className="py-8 text-center space-y-4 animate-in fade-in">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[24px]">check_circle</span>
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-gray-900">Table Reservation Updated</h4>
                    <p className="text-xs text-gray-500">Your reservation changes have been successfully processed.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManageStep('list')}
                    className="px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl shadow-xs hover:bg-primary-container cursor-pointer"
                  >
                    View My Bookings
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* CHANGE FEE MODAL (₹50 PENALTY) */}
      {changeFeeModal && changeHold && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </div>
            <h3 className="text-base font-black text-gray-900">
              Slot Change Penalty Fee
            </h3>
            <p className="text-xs text-gray-500">
              Since less than 24 hours remain for your original booking, a <strong>₹50.00</strong> change fee applies to switch to Table #{changeHold.tableNumber}.
            </p>

            <button
              onClick={handlePayChangeFee}
              disabled={processingPayment}
              className="w-full py-3 bg-primary hover:bg-primary-container text-white text-xs font-black rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              {processingPayment ? 'Processing...' : 'Pay ₹50 & Verify with OTP'}
            </button>

            <button
              onClick={() => {
                setChangeFeeModal(false);
                if (changeHold) api.releaseBookingHold(changeHold.holdToken).catch(() => {});
                setChangeHold(null);
              }}
              className="w-full text-xs text-gray-500 underline font-bold cursor-pointer"
            >
              Cancel & Keep Original Booking
            </button>
          </div>
        </div>
      )}

      {/* CANCELLATION & AUTOMATIC REFUND MODAL */}
      {cancelModalOpen && selectedBookingForCancel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-7 max-w-lg w-full space-y-5 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-black">
                  <span className="material-symbols-outlined text-[22px]">event_busy</span>
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900 leading-tight">
                    Cancel Booking & Request Refund
                  </h3>
                  <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                    Ref #{selectedBookingForCancel.booking_code} • Table #{selectedBookingForCancel.table_number || selectedBookingForCancel.table_id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  soundManager.playPop();
                  setCancelModalOpen(false);
                  setSelectedBookingForCancel(null);
                }}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {cancelSuccessMsg ? (
              <div className="py-8 text-center space-y-3 animate-in zoom-in-95">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl">check_circle</span>
                </div>
                <h4 className="font-black text-base text-gray-900">Cancellation & Refund Confirmed</h4>
                <p className="text-xs text-gray-600 px-4">{cancelSuccessMsg}</p>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-bold inline-block">
                  Status: <strong>Refund Processed</strong> (Automatically credited to your original payment source)
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Booking summary pill */}
                <div className="bg-surface-container-low p-3.5 rounded-2xl border border-surface-container-high grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">Slot:</span>
                    <span className="font-bold text-gray-900">{selectedBookingForCancel.booking_date} at {selectedBookingForCancel.booking_time}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">Deposit Paid:</span>
                    <span className="font-bold text-gray-900">₹{cancelRefundInfo?.origAmount}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">Exact Time Remaining:</span>
                    <span className="font-black text-primary text-sm">{cancelRefundInfo?.diffHours} hours</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">Calculated Refund:</span>
                    <span className="font-black text-emerald-700 text-sm">
                      {cancelRefundInfo?.refundPct}% (₹{cancelRefundInfo?.refundAmount})
                    </span>
                  </div>
                </div>

                {/* Explicit Refund Policy Boundaries Table */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase text-gray-500 tracking-wider">
                      Refund Policy Boundaries
                    </label>
                    <span className="text-[10px] text-gray-400">Automatic time-tier rule</span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {/* Tier 1: > 24 Hours -> 90% */}
                    <div className={`p-3 rounded-2xl border transition-all ${
                      cancelRefundInfo?.isOver24h
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold shadow-xs ring-2 ring-emerald-500/20'
                        : 'bg-white border-gray-200 text-gray-400 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-emerald-600">schedule</span>
                          <div>
                            <span className="font-black text-xs block text-gray-900">More than 24 hours</span>
                            <span className="text-[10px] text-gray-500 block">&gt; 24h remaining until slot</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-sm text-emerald-700">90% Refund</span>
                          {cancelRefundInfo?.isOver24h && (
                            <span className="block text-[10px] text-emerald-800 font-extrabold uppercase">
                              ✓ Active (₹{cancelRefundInfo?.refundAmount})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tier 2: > 4 Hours and <= 24 Hours -> 50% */}
                    <div className={`p-3 rounded-2xl border transition-all ${
                      cancelRefundInfo?.isBetween4and24h
                        ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold shadow-xs ring-2 ring-amber-500/20'
                        : 'bg-white border-gray-200 text-gray-400 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-amber-600">hourglass_bottom</span>
                          <div>
                            <span className="font-black text-xs block text-gray-900">More than 4 hours and up to 24 hours</span>
                            <span className="text-[10px] text-gray-500 block">&gt; 4h and ≤ 24h remaining until slot</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-sm text-amber-700">50% Refund</span>
                          {cancelRefundInfo?.isBetween4and24h && (
                            <span className="block text-[10px] text-amber-800 font-extrabold uppercase">
                              ✓ Active (₹{cancelRefundInfo?.refundAmount})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tier 3: <= 4 Hours -> 0% */}
                    <div className={`p-3 rounded-2xl border transition-all ${
                      cancelRefundInfo?.isUnder4h
                        ? 'bg-rose-50 border-rose-400 text-rose-950 font-bold shadow-xs ring-2 ring-rose-500/20'
                        : 'bg-white border-gray-200 text-gray-400 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-rose-600">lock_clock</span>
                          <div>
                            <span className="font-black text-xs block text-gray-900">4 hours or less</span>
                            <span className="text-[10px] text-gray-500 block">≤ 4h remaining until slot</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-sm text-rose-700">0% Refund</span>
                          {cancelRefundInfo?.isUnder4h && (
                            <span className="block text-[10px] text-rose-800 font-extrabold uppercase">
                              ✓ Active (₹0.00)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Refund Destination UPI ID */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-800 flex items-center justify-between">
                    <span>UPI ID for Refund <span className="text-rose-500">*</span></span>
                    <span className="text-[10px] text-gray-400">Direct gateway settlement</span>
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">
                      account_balance_wallet
                    </span>
                    <input
                      type="text"
                      value={cancelUpiId}
                      onChange={(e) => {
                        setCancelUpiId(e.target.value);
                        setCancelError('');
                      }}
                      placeholder="e.g. username@okhdfcbank, 9876543210@paytm"
                      className="w-full pl-9 pr-3 py-2.5 bg-surface-container-low rounded-xl text-xs border border-surface-container-high focus:outline-none focus:border-primary text-gray-900 font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Your calculated refund of <strong>₹{cancelRefundInfo?.refundAmount}</strong> ({cancelRefundInfo?.refundPct}%) will be automatically credited back to your original payment source.
                  </p>
                </div>

                {/* Cancellation Reason (Optional) */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-800 flex items-center justify-between">
                    <span>Reason for Cancellation</span>
                    <span className="text-[10px] text-gray-400 italic">Optional (may leave blank)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Optional: share any feedback or reason (or leave completely blank)..."
                    className="w-full p-2.5 bg-surface-container-low rounded-xl text-xs border border-surface-container-high focus:outline-none focus:border-primary text-gray-900 resize-none"
                  />
                </div>

                {cancelError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    <span>{cancelError}</span>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playPop();
                      setCancelModalOpen(false);
                      setSelectedBookingForCancel(null);
                    }}
                    disabled={cancelLoading}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
                  >
                    Keep Booking
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmCancel}
                    disabled={cancelLoading || !cancelUpiId.trim()}
                    className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {cancelLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Processing Cancellation...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">check</span>
                        <span>Confirm Cancellation & Request Refund</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* READ-ONLY DISH DETAILS MODAL (STRICTLY VIEW-ONLY, NO ORDERING) */}
      {selectedDishDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full rounded-3xl overflow-hidden shadow-2xl border border-surface-container-highest max-h-[90vh] flex flex-col">
            {/* Modal Image */}
            <div className="relative h-56 sm:h-64 bg-surface-container-low overflow-hidden shrink-0">
              <img
                src={selectedDishDetail.image_url || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600'}
                alt={selectedDishDetail.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setSelectedDishDetail(null)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-transform hover:scale-110 cursor-pointer shadow-md"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>

              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md ${selectedDishDetail.is_veg ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-500/40' : 'bg-rose-950/80 text-rose-200 border border-rose-500/40'}`}>
                  <span className={`w-2 h-2 rounded-full ${selectedDishDetail.is_veg ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  {selectedDishDetail.is_veg ? 'Pure Veg' : 'Non-Veg'}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-black/60 text-white backdrop-blur-md border border-white/20">
                  {selectedDishDetail.category}
                </span>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                  {selectedDishDetail.name}
                </h3>
                <span className="text-2xl font-black text-primary font-mono shrink-0">
                  {formatCurrency(selectedDishDetail.price)}
                </span>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed">
                {selectedDishDetail.description || 'Prepared fresh daily with hand-picked spices and heritage royal recipes.'}
              </p>

              {/* View-Only Dine-In Notice (Strictly NO ORDER CTA) */}
              <div className="p-4 rounded-2xl bg-surface-container-low border border-surface-container-high flex items-start gap-3 text-xs text-gray-600">
                <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">info</span>
                <div>
                  <p className="font-bold text-gray-900">Royal Dining Specialty</p>
                  <p className="mt-0.5 text-gray-500">
                    This signature dish is available exclusively for dine-in guests. When seated at your table, scan the table QR code to order.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDishDetail(null)}
                  className="w-full py-3 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer id="hours" className="bg-primary-container text-on-primary py-12 px-4 lg:px-12 border-t border-primary">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-xs text-gray-300">
          <div>
            <span className="font-extrabold text-white text-sm block mb-2">K K's Food House</span>
            <p className="leading-relaxed">
              Experience the pinnacle of royal heritage fine dining, authentic recipes, and digital hospitality.
            </p>
          </div>
          <div>
            <span className="font-extrabold text-white text-sm block mb-2">Operating Hours</span>
            <p className="text-amber-200">Table Booking Slots: 12:00 PM – 12:00 AM</p>
          </div>
          <div>
            <span className="font-extrabold text-white text-sm block mb-2">Contact & Assistance</span>
            <p>Floor Captain: +91 98765 43210</p>
            <p>Front Desk & Table Service Available</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
