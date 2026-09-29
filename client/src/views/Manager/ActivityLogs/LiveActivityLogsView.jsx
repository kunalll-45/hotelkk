import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../../context/SocketContext';
import { api } from '../../../utils/api';
import { formatTime, formatDate } from '../../../utils/formatters';
import { soundManager } from '../../../utils/soundEffects';

export default function LiveActivityLogsView() {
  const { socket, isConnected } = useSocket();

  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({
    total_events: 0,
    table_calls: 0,
    calls_resolved: 0,
    orders_placed: 0,
    orders_served: 0,
    bookings_count: 0,
    bills_settled: 0,
    urgent_events: 0
  });

  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [tableFilter, setTableFilter] = useState('');

  const [autoScroll, setAutoScroll] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newLogIds, setNewLogIds] = useState(new Set());
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  const logListRef = useRef(null);

  // Smart scroll detection: if user scrolled down > 60px to inspect older logs, don't force-scroll
  const handleScroll = () => {
    if (logListRef.current) {
      setIsUserScrolledUp(logListRef.current.scrollTop > 60);
    }
  };

  // Load initial historical logs and summary
  const loadLogs = async () => {
    try {
      setLoading(true);
      const [logsData, summaryData] = await Promise.all([
        api.getActivityLogs({
          date: selectedDate,
          category: categoryFilter,
          severity: severityFilter,
          search: searchQuery,
          tableNumber: tableFilter,
          limit: 150
        }),
        api.getActivityLogSummary(selectedDate)
      ]);

      setLogs(logsData.logs || []);
      setSummary(summaryData || {});
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [selectedDate, categoryFilter, severityFilter, tableFilter]);

  // Handle Search input debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadLogs();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Real-time socket listener for live hotel activities
  useEffect(() => {
    if (!socket) return;

    const handleNewLog = (newLog) => {
      // Check if the log belongs to the selected date
      const logDate = newLog.created_at ? newLog.created_at.split(' ')[0] : new Date().toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      if (selectedDate === logDate || (selectedDate === today && !newLog.created_at)) {
        setLogs((prev) => [newLog, ...prev]);

        // Highlight new log briefly
        setNewLogIds((prev) => new Set([...prev, newLog.id]));
        setTimeout(() => {
          setNewLogIds((prev) => {
            const next = new Set(prev);
            next.delete(newLog.id);
            return next;
          });
        }, 3000);

        // Update counters
        setSummary((prev) => ({
          ...prev,
          total_events: (prev.total_events || 0) + 1,
          table_calls: newLog.action === 'CALL_WAITER' ? (prev.table_calls || 0) + 1 : prev.table_calls,
          calls_resolved: newLog.action === 'CALL_RESOLVED' ? (prev.calls_resolved || 0) + 1 : prev.calls_resolved,
          orders_placed: newLog.action === 'ORDER_PLACED' ? (prev.orders_placed || 0) + 1 : prev.orders_placed,
          orders_served: newLog.action === 'ORDER_SERVED' ? (prev.orders_served || 0) + 1 : prev.orders_served,
          bookings_count: newLog.category === 'BOOKING' ? (prev.bookings_count || 0) + 1 : prev.bookings_count,
          bills_settled: newLog.action === 'PAYMENT_RECEIVED' ? (prev.bills_settled || 0) + 1 : prev.bills_settled,
          urgent_events: newLog.severity === 'URGENT' ? (prev.urgent_events || 0) + 1 : prev.urgent_events
        }));

        // Audio notification according to event severity & type
        if (soundEnabled) {
          if (newLog.severity === 'URGENT' || newLog.action === 'CALL_WAITER') {
            soundManager.playBell();
          } else if (newLog.action === 'ORDER_PLACED' || newLog.action === 'ORDER_CONFIRMED') {
            soundManager.playOrderConfirmed();
          } else if (newLog.action === 'PAYMENT_RECEIVED') {
            soundManager.playPaymentSuccess();
          } else if (newLog.category === 'BOOKING') {
            soundManager.playSuccess();
          } else {
            soundManager.playPop();
          }
        }

        // Auto-scroll to top only if autoScroll is enabled and user is NOT inspecting older logs
        if (autoScroll && !isUserScrolledUp && logListRef.current) {
          logListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    };

    socket.on('activity:new_log', handleNewLog);

    return () => {
      socket.off('activity:new_log', handleNewLog);
    };
  }, [socket, selectedDate, soundEnabled, autoScroll, isUserScrolledUp]);

  // Relative time helper
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    const now = new Date();
    // Normalize SQLite timestamp format (YYYY-MM-DD HH:MM:SS)
    const normalized = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
    const time = new Date(normalized);
    const diffSeconds = Math.max(0, Math.floor((now - time) / 1000));

    if (diffSeconds < 10) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Category Icon & Color Mapping
  const getCategoryMeta = (category, severity) => {
    switch (category) {
      case 'SERVICE':
        return {
          icon: 'notifications_active',
          color: 'text-rose-600 bg-rose-50 border-rose-200',
          badge: 'bg-rose-100 text-rose-800'
        };
      case 'ORDER':
        return {
          icon: 'shopping_bag',
          color: 'text-amber-600 bg-amber-50 border-amber-200',
          badge: 'bg-amber-100 text-amber-800'
        };
      case 'BOOKING':
        return {
          icon: 'event_seat',
          color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
          badge: 'bg-indigo-100 text-indigo-800'
        };
      case 'BILLING':
        return {
          icon: 'payments',
          color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
          badge: 'bg-emerald-100 text-emerald-800'
        };
      case 'STAFF':
      case 'ATTENDANCE':
        return {
          icon: 'badge',
          color: 'text-sky-600 bg-sky-50 border-sky-200',
          badge: 'bg-sky-100 text-sky-800'
        };
      case 'MENU':
        return {
          icon: 'restaurant_menu',
          color: 'text-purple-600 bg-purple-50 border-purple-200',
          badge: 'bg-purple-100 text-purple-800'
        };
      case 'TABLE':
        return {
          icon: 'table_restaurant',
          color: 'text-teal-600 bg-teal-50 border-teal-200',
          badge: 'bg-teal-100 text-teal-800'
        };
      default:
        return {
          icon: 'info',
          color: 'text-gray-600 bg-gray-50 border-gray-200',
          badge: 'bg-gray-100 text-gray-800'
        };
    }
  };

  // Severity styling
  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'URGENT':
        return 'bg-red-600 text-white animate-pulse';
      case 'SUCCESS':
        return 'bg-emerald-600 text-white';
      case 'WARNING':
        return 'bg-amber-600 text-white';
      case 'INFO':
      default:
        return 'bg-gray-700 text-white';
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    soundManager.playPop();
    if (logs.length === 0) {
      alert('No logs available to export.');
      return;
    }

    const headers = ['ID', 'Timestamp', 'Category', 'Action', 'Severity', 'Table', 'Title', 'Description', 'Actor Name', 'Actor Role'];
    const rows = logs.map((l) => [
      l.id,
      `"${l.created_at}"`,
      `"${l.category}"`,
      `"${l.action}"`,
      `"${l.severity}"`,
      l.table_number || '',
      `"${(l.title || '').replace(/"/g, '""')}"`,
      `"${(l.description || '').replace(/"/g, '""')}"`,
      `"${l.actor_name || ''}"`,
      `"${l.actor_role || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `hotel_activity_logs_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    soundManager.playSuccess();
  };

  // Simulate a test reaction event for testing
  const handleSimulateTestEvent = async () => {
    soundManager.playPop();
    try {
      await api.request('/logs/test', {
        method: 'POST',
        body: {
          category: 'SERVICE',
          action: 'CALL_WAITER',
          title: 'Table #3 Calling Waiter (Live Test)',
          description: 'Assistance request triggered from Manager Live Log Console.',
          tableNumber: 3,
          actorName: 'Guest Tester',
          actorRole: 'CUSTOMER',
          severity: 'URGENT'
        }
      });
    } catch (e) {
      console.error('Test simulation error:', e);
    }
  };

    const knownActivities = [
    { id: 'ALL', label: 'All Activities', icon: 'grid_view' },
    { id: 'SERVICE', label: 'Table Calls', icon: 'notifications_active' },
    { id: 'ORDER', label: 'Order Placed & Serving', icon: 'shopping_bag' },
    { id: 'BOOKING', label: 'All Reservations', icon: 'event_seat' },
    { id: 'BILLING', label: 'Bill Settled & Cash', icon: 'payments' },
    { id: 'TABLE', label: 'Table Setup & QR', icon: 'table_restaurant' },
    { id: 'OFFER', label: 'Promotions & Offers', icon: 'local_offer' },
    { id: 'MENU', label: 'Menu Catalog & Dishes', icon: 'restaurant_menu' },
    { id: 'STAFF', label: 'Staff Roster', icon: 'badge' },
    { id: 'ATTENDANCE', label: 'Staff Attendance', icon: 'how_to_reg' },
    { id: 'TIPS', label: 'Tips & Gratuity', icon: 'volunteer_activism' },
    { id: 'SYSTEM', label: 'System Diagnostics', icon: 'settings' }
  ];

  // Dynamically include any additional categories present in loaded logs
  const dynamicCategories = Array.from(new Set(logs.map((l) => l.category).filter(Boolean)))
    .filter((cat) => !knownActivities.some((k) => k.id === cat))
    .map((cat) => ({
      id: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase(),
      icon: 'category'
    }));

  const allAvailableActivities = [...knownActivities, ...dynamicCategories];
  const currentCategoryMeta = allAvailableActivities.find((a) => a.id === categoryFilter) || {
    id: categoryFilter,
    label: categoryFilter,
    icon: 'filter_list'
  };

  return (
    <div className="space-y-3 -mt-1">
      {/* 1. Header Bar with Real-Time Stream Status & Icon-Only Controls (Requirement 4, 4A-4E) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 md:p-4 rounded-2xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">receipt_long</span>
            <h2 className="text-base md:text-lg font-black text-gray-900 tracking-tight">
              Live Hotel Logs & Reaction Stream
            </h2>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-100 border border-emerald-300 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span>
              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider font-mono">
                {isConnected ? 'LIVE FEED ACTIVE' : 'CONNECTING...'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Real-time hotel events: table QR activations, calls, orders, kitchen serving, payments, bookings, and staff actions.
          </p>
        </div>

        {/* Live Stream Controls (Requirement 4A: Icon-only buttons with tooltips) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 4B. Audio Chimes Toggle - Single click toggles ON/OFF, Icon Only */}
          <button
            type="button"
            onClick={() => {
              soundManager.playPop();
              setSoundEnabled((prev) => !prev);
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-primary text-white shadow-xs ring-2 ring-primary/30'
                : 'bg-surface-container-low text-gray-400 border border-surface-container-high hover:text-gray-600 hover:bg-surface-container'
            }`}
            title={soundEnabled ? 'Audio Chimes: ON (Click to turn OFF)' : 'Audio Chimes: OFF (Click to turn ON)'}
            aria-label={soundEnabled ? 'Audio Chimes: ON' : 'Audio Chimes: OFF'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {soundEnabled ? 'volume_up' : 'volume_off'}
            </span>
          </button>

          {/* 4C. Auto Scroll Toggle - Single click toggles ON/OFF, Icon Only */}
          <button
            type="button"
            onClick={() => {
              soundManager.playPop();
              setAutoScroll((prev) => !prev);
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              autoScroll
                ? 'bg-secondary-container text-on-secondary-container shadow-xs ring-2 ring-secondary/30'
                : 'bg-surface-container-low text-gray-400 border border-surface-container-high hover:text-gray-600 hover:bg-surface-container'
            }`}
            title={autoScroll ? 'Auto Scroll: ON (Click to Pause)' : 'Auto Scroll: PAUSED (Click to Resume)'}
            aria-label={autoScroll ? 'Auto Scroll: ON' : 'Auto Scroll: PAUSED'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {autoScroll ? 'vertical_align_top' : 'pause_circle'}
            </span>
          </button>

          {/* Date Picker (Requirement 4: Data and date information unchanged) */}
          <div className="flex items-center gap-1 bg-surface-container-low px-2.5 py-1 rounded-xl border border-surface-container-high" title="Filter by Date">
            <span className="material-symbols-outlined text-[15px] text-gray-500">calendar_today</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-xs font-mono font-bold focus:outline-none"
              title="Select Log Date"
            />
          </div>

          {/* 4D. Export CSV - Icon Only */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="w-9 h-9 bg-surface-container-high hover:bg-gray-200 text-gray-800 rounded-xl shadow-xs flex items-center justify-center transition-colors cursor-pointer"
            title="Export CSV (Download Logs)"
            aria-label="Export Logs as CSV"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
          </button>

          {/* 4E. Simulate Event - Icon Only */}
          <button
            type="button"
            onClick={handleSimulateTestEvent}
            className="w-9 h-9 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl border border-amber-300 flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
            title="Simulate Event (Trigger Test Reaction)"
            aria-label="Simulate Test Event"
          >
            <span className="material-symbols-outlined text-[18px] text-amber-700">bolt</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Reaction Counters / Category Overview Cards (Requirement 6) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Table Calling Bell */}
        <div
          onClick={() => { soundManager.playPop(); setCategoryFilter(categoryFilter === 'SERVICE' ? 'ALL' : 'SERVICE'); }}
          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            categoryFilter === 'SERVICE'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-300 shadow-xs'
              : 'bg-white border-rose-200 shadow-2xs hover:shadow-xs'
          }`}
          title="Filter by Table Calls"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">
              Table Calls
            </span>
            <span className="w-5 h-5 rounded-md bg-rose-100 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[13px]">notifications_active</span>
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-rose-700 font-mono">
              {summary.table_calls || 0}
            </span>
            <span className="text-[9px] text-gray-500 font-medium">
              ({summary.calls_resolved || 0} Res)
            </span>
          </div>
        </div>

        {/* Orders Placed */}
        <div
          onClick={() => { soundManager.playPop(); setCategoryFilter(categoryFilter === 'ORDER' ? 'ALL' : 'ORDER'); }}
          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            categoryFilter === 'ORDER'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300 shadow-xs'
              : 'bg-white border-amber-200 shadow-2xs hover:shadow-xs'
          }`}
          title="Filter by Orders Placed"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">
              Order Placed
            </span>
            <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[13px]">shopping_bag</span>
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-amber-800 font-mono">
              {summary.orders_placed || 0}
            </span>
            <span className="text-[9px] text-gray-500 font-medium">Today</span>
          </div>
        </div>

        {/* Dishes Served */}
        <div
          onClick={() => { soundManager.playPop(); setCategoryFilter(categoryFilter === 'ORDER' ? 'ALL' : 'ORDER'); }}
          className="p-2.5 rounded-2xl border border-emerald-200 bg-white shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
          title="Dishes Dispatched & Served"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">
              Dishes
            </span>
            <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[13px]">room_service</span>
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-emerald-700 font-mono">
              {summary.orders_served || 0}
            </span>
            <span className="text-[9px] text-gray-500 font-medium">Served</span>
          </div>
        </div>

        {/* Table Bookings */}
        <div
          onClick={() => { soundManager.playPop(); setCategoryFilter(categoryFilter === 'BOOKING' ? 'ALL' : 'BOOKING'); }}
          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            categoryFilter === 'BOOKING'
              ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-300 shadow-xs'
              : 'bg-white border-indigo-200 shadow-2xs hover:shadow-xs'
          }`}
          title="Filter by Table Reservations"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-indigo-800 uppercase tracking-wider">
              All Reservations
            </span>
            <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[13px]">event_seat</span>
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-indigo-800 font-mono">
              {summary.bookings_count || 0}
            </span>
            <span className="text-[9px] text-gray-500 font-medium">Booked</span>
          </div>
        </div>

        {/* Bills Settled */}
        <div
          onClick={() => { soundManager.playPop(); setCategoryFilter(categoryFilter === 'BILLING' ? 'ALL' : 'BILLING'); }}
          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            categoryFilter === 'BILLING'
              ? 'bg-teal-50 border-teal-400 ring-2 ring-teal-300 shadow-xs'
              : 'bg-white border-teal-200 shadow-2xs hover:shadow-xs'
          }`}
          title="Filter by Bills Settled"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-teal-800 uppercase tracking-wider">
              Bill Settled
            </span>
            <span className="w-5 h-5 rounded-md bg-teal-100 text-teal-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[13px]">payments</span>
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-teal-800 font-mono">
              {summary.bills_settled || 0}
            </span>
            <span className="text-[9px] text-gray-500 font-medium">Paid</span>
          </div>
        </div>

        {/* Total Hotel Reactions */}
        <div
          onClick={() => { soundManager.playPop(); setCategoryFilter('ALL'); setSeverityFilter('ALL'); }}
          className={`p-2.5 rounded-2xl shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between ${
            categoryFilter === 'ALL' && severityFilter === 'ALL'
              ? 'bg-primary text-white ring-2 ring-secondary/50'
              : 'bg-primary text-white'
          }`}
          title="Show All Hotel Activity Reactions"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-secondary-container uppercase tracking-wider">
              Total Reactions
            </span>
            <span className="w-5 h-5 rounded-md bg-white/10 text-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[13px]">insights</span>
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-white font-mono">
              {summary.total_events || logs.length}
            </span>
            <span className="text-[9px] text-gray-300 font-medium">Logged</span>
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Controls (Requirement 5: ONE unified Filter control) */}
      <div className="bg-white p-3.5 md:p-4 rounded-2xl border border-surface-container-high shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* ONE Filter Control replacing multiple separate buttons */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                soundManager.playPop();
                setIsFilterDropdownOpen((prev) => !prev);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border ${
                categoryFilter !== 'ALL'
                  ? 'bg-primary text-white border-primary shadow-xs'
                  : 'bg-surface-container-low text-gray-800 border-gray-300 hover:bg-surface-container'
              }`}
              title="Filter by Activity Type"
            >
              <span className="material-symbols-outlined text-[17px]">
                {currentCategoryMeta?.icon || 'filter_list'}
              </span>
              <span>
                {categoryFilter === 'ALL' ? 'All Activities' : currentCategoryMeta?.label || categoryFilter}
              </span>
              <span className="material-symbols-outlined text-[16px] text-gray-400">
                {isFilterDropdownOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {/* Dropdown showing ALL available activity/event types dynamically */}
            {isFilterDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsFilterDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 py-2 max-h-80 overflow-y-auto">
                  <div className="px-3 py-1 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    Select Activity Type ({allAvailableActivities.length})
                  </div>
                  {allAvailableActivities.map((act) => {
                    const isSelected = categoryFilter === act.id;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => {
                          soundManager.playPop();
                          setCategoryFilter(act.id);
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary text-white font-bold'
                            : 'text-gray-700 hover:bg-surface-container-low'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span className={`material-symbols-outlined text-[18px] ${isSelected ? 'text-secondary-container' : 'text-primary'}`}>
                            {act.icon}
                          </span>
                          <span className="truncate">{act.label}</span>
                        </div>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[16px] text-white">check</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-surface-container-high text-[11px] font-bold">
            <button
              onClick={() => { soundManager.playPop(); setSeverityFilter('ALL'); }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${severityFilter === 'ALL' ? 'bg-primary text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              All Severities
            </button>
            <button
              onClick={() => { soundManager.playPop(); setSeverityFilter('URGENT'); }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${severityFilter === 'URGENT' ? 'bg-rose-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Urgent Only
            </button>
            <button
              onClick={() => { soundManager.playPop(); setSeverityFilter('SUCCESS'); }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${severityFilter === 'SUCCESS' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Success
            </button>
          </div>
        </div>

        {/* Search Bar & Table Filter */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-surface-container-high">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by table #, customer name, waiter name, dish, or action..."
              className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-gray-300 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-secondary"
            />
          </div>

          {/* Specific Table Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Filter Table:</span>
            <select
              value={tableFilter}
              onChange={(e) => {
                soundManager.playPop();
                setTableFilter(e.target.value);
              }}
              className="px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:outline-none"
            >
              <option value="">All Tables</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((t) => (
                <option key={t} value={t}>
                  Table #{t}
                </option>
              ))}
            </select>
          </div>

          {(categoryFilter !== 'ALL' || severityFilter !== 'ALL' || searchQuery || tableFilter) && (
            <button
              onClick={() => {
                soundManager.playPop();
                setCategoryFilter('ALL');
                setSeverityFilter('ALL');
                setSearchQuery('');
                setTableFilter('');
              }}
              className="px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* 4. Live Activity Log Stream (with smart user scroll detection) */}
      <div
        ref={logListRef}
        onScroll={handleScroll}
        className="bg-white rounded-2xl border border-surface-container-high shadow-xs p-4 md:p-5 max-h-[620px] overflow-y-auto space-y-2.5"
      >
        {loading ? (
          <div className="py-16 text-center text-gray-400 space-y-3">
            <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
            <p className="text-xs font-bold font-mono">Streaming hotel reactions...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <span className="material-symbols-outlined text-gray-300 text-5xl">receipt_long</span>
            <h4 className="text-sm font-black text-gray-700">No Hotel Reactions Found</h4>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              No reactions matching your selected filters for {selectedDate}. As events occur in the restaurant, they will stream here live.
            </p>
          </div>
        ) : (
          logs.map((log) => {
            const meta = getCategoryMeta(log.category, log.severity);
            const isJustAdded = newLogIds.has(log.id);
            const isUrgent = log.severity === 'URGENT';

            return (
              <div
                key={log.id}
                className={`p-3.5 md:p-4 rounded-2xl border transition-all duration-300 flex items-start justify-between gap-3 ${isJustAdded
                    ? 'bg-amber-50/80 border-amber-400 shadow-md scale-[1.005]'
                    : isUrgent
                      ? 'bg-rose-50/60 border-rose-300 shadow-2xs hover:shadow-xs'
                      : 'bg-white hover:bg-surface-container-lowest border-surface-container-high shadow-2xs hover:shadow-xs'
                  }`}
              >
                {/* Left Icon with category color */}
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${meta.color}`}
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] ${isUrgent ? 'animate-bounce text-rose-700' : ''
                        }`}
                    >
                      {meta.icon}
                    </span>
                  </div>

                  {/* Log Content */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full font-mono ${meta.badge}`}>
                        {log.category}
                      </span>

                      {log.severity !== 'INFO' && (
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full font-mono ${getSeverityBadge(log.severity)}`}>
                          {log.severity}
                        </span>
                      )}

                      <span className="text-[11px] font-bold text-gray-400 font-mono">
                        {getRelativeTime(log.created_at)}
                      </span>

                      <span className="hidden sm:inline text-[10px] text-gray-300 font-mono">
                        • {log.created_at ? log.created_at.split(' ')[1] || log.created_at : ''}
                      </span>
                    </div>

                    <h4 className="text-sm font-black text-gray-900 mt-1 leading-snug">
                      {log.title}
                    </h4>

                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed font-medium">
                      {log.description}
                    </p>

                    {/* Meta Chips */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {log.table_number && (
                        <button
                          onClick={() => {
                            soundManager.playPop();
                            setTableFilter(log.table_number.toString());
                          }}
                          className="px-2 py-0.5 bg-secondary-container/60 hover:bg-secondary-container text-on-secondary-container rounded-lg text-[10px] font-black font-mono flex items-center gap-1 transition-colors"
                          title="Click to filter by this table"
                        >
                          <span className="material-symbols-outlined text-[12px]">table_restaurant</span>
                          <span>Table #{log.table_number}</span>
                        </button>
                      )}

                      {log.actor_name && (
                        <span className="px-2 py-0.5 bg-surface-container-high text-gray-700 rounded-lg text-[10px] font-bold font-mono flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">
                            {log.actor_role === 'CUSTOMER'
                              ? 'person'
                              : log.actor_role === 'WAITER'
                                ? 'room_service'
                                : log.actor_role === 'MANAGER'
                                  ? 'manage_accounts'
                                  : 'settings'}
                          </span>
                          <span>{log.actor_name} ({log.actor_role})</span>
                        </span>
                      )}

                      {log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata).length > 0 && (
                        <span className="text-[10px] text-gray-400 font-mono">
                          {Object.entries(log.metadata)
                            .map(([k, v]) => `${k}: ${v}`)
                            .slice(0, 3)
                            .join(' | ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Action Chip or Quick Badge */}
                <div className="shrink-0 text-right">
                  <span className="text-[10px] text-gray-400 font-mono font-bold block">
                    #{log.id}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
