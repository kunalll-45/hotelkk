import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../utils/api';
import ManagerLogin from './ManagerLogin';
import LiveTablesView from './LiveTables/LiveTablesView';
import StaffManagement from './StaffAttendance/StaffManagement';
import TableAssignmentView from './TableAssignment/TableAssignmentView';
import MenuManagementView from './MenuManagement/MenuManagementView';
import HistoryReportsView from './HistoryReports/HistoryReportsView';

import TableQRCodesView from './QRCodes/TableQRCodesView';
import LiveActivityLogsView from './ActivityLogs/LiveActivityLogsView';
import ReservationsManagementView from './Reservations/ReservationsManagementView';
import CancellationRequestsView from './Reservations/CancellationRequestsView';
import BillPrintModal from '../../components/BillPrintModal';
import QRModal from '../../components/QRModal';
import { soundManager } from '../../utils/soundEffects';

function ManagerDashboardContent() {
  const { managerUser, logoutManager, restaurantSettings, setRestaurantSettings, switchRole } = useAuth();
  const { socket } = useSocket();

  const [activeSection, setActiveSection] = useState('live-tables');
  const [staffList, setStaffList] = useState([]);
  const [billModalSessionId, setBillModalSessionId] = useState(null);
  const [qrModalTableNumber, setQrModalTableNumber] = useState(null);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [latestEvent, setLatestEvent] = useState(null);
  const [pendingCancellationsCount, setPendingCancellationsCount] = useState(0);

  const [isDashboardNavOpen, setIsDashboardNavOpen] = useState(() => {
    try {
      return localStorage.getItem('kk_manager_nav_open') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleDashboardNav = () => {
    try {
      soundManager?.playPop?.();
    } catch {}
    setIsDashboardNavOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('kk_manager_nav_open', String(next));
      } catch {}
      return next;
    });
  };

  const loadInitial = async () => {
    try {
      const [staff, settings, cancelRes] = await Promise.all([
        api.getStaff(),
        api.getRestaurantSettings(),
        api.getCancellationRequests().catch(() => ({ requests: [] }))
      ]);
      setStaffList(staff);
      setRestaurantSettings(settings);
      const pending = (cancelRes?.requests || []).filter((r) => r.status === 'PENDING').length;
      setPendingCancellationsCount(pending);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleActivity = (log) => {
      setLatestEvent(log);
    };
    socket.on('activity:new_log', handleActivity);
    return () => {
      socket.off('activity:new_log', handleActivity);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const handleCancellationChange = () => {
      api.getCancellationRequests()
        .then((res) => {
          const pending = (res.requests || []).filter((r) => r.status === 'PENDING').length;
          setPendingCancellationsCount(pending);
        })
        .catch(() => {});
    };

    socket.on('cancellation:new', handleCancellationChange);
    socket.on('cancellation:updated', handleCancellationChange);
    return () => {
      socket.off('cancellation:new', handleCancellationChange);
      socket.off('cancellation:updated', handleCancellationChange);
    };
  }, [socket]);

  const handleToggleRestaurantOpen = async () => {
    try {
      setTogglingOpen(true);
      const newStatus = restaurantSettings.is_open ? 0 : 1;
      const updated = await api.updateRestaurantSettings({ isOpen: newStatus });
      setRestaurantSettings(updated);
    } catch (err) {
      alert(err.message || 'Failed to update restaurant status');
    } finally {
      setTogglingOpen(false);
    }
  };

  const navItems = [
    { id: 'live-tables', label: 'Live Tables', icon: 'table_restaurant', badge: 'Active' },
    { id: 'logs', label: 'Live Hotel Logs', icon: 'receipt_long', badge: 'LIVE' },

    { id: 'reservations', label: 'Table Reservations', icon: 'event_seat' },
    {
      id: 'cancellations',
      label: 'Cancelled Bookings',
      icon: 'cancel_presentation',
      badge: pendingCancellationsCount > 0 ? `${pendingCancellationsCount} NEW` : null
    },
    { id: 'assignment', label: 'Table Assignment', icon: 'assignment_ind' },
    { id: 'staff', label: 'Staff Management', icon: 'badge' },
    { id: 'menu', label: 'Menu Management', icon: 'menu_book' },
    { id: 'history', label: 'History & Reports', icon: 'analytics' },
    { id: 'qrcodes', label: 'Permanent QR Codes', icon: 'qr_code_2' }
  ];

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-background text-on-surface">
      {/* 1. Collapsible Sidebar Navigation (Stitch Theme Inspired) */}
      <aside
        className={`${
          isDashboardNavOpen ? 'flex' : 'hidden'
        } w-full md:w-64 lg:w-72 bg-primary text-on-primary flex-col shrink-0 shadow-2xl border-r border-primary-container z-40 transition-all duration-300`}
      >
        {/* Brand & Profile Box */}
        <div className="p-5 border-b border-primary-container">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center font-black">
                <span className="material-symbols-outlined text-[22px]">restaurant</span>
              </div>
              <div>
                <h1 className="font-extrabold text-sm tracking-wide text-white leading-none">
                  K K's Food House
                </h1>
                <p className="text-[10px] text-gray-300 font-mono mt-0.5">Manager Operations</p>
              </div>
            </div>

            {/* Quick Close Dashboard Button in Sidebar */}
            <button
              type="button"
              onClick={toggleDashboardNav}
              className="p-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Dashboard Navigation"
            >
              <span className="material-symbols-outlined text-[20px]">left_panel_close</span>
            </button>
          </div>

          <div className="bg-primary-container/80 p-3 rounded-2xl flex items-center gap-3 border border-white/10">
            <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-black text-sm shrink-0">
              {(managerUser?.fullName || managerUser?.full_name || managerUser?.username || 'M').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-xs text-white truncate">
                {managerUser?.fullName || managerUser?.full_name || managerUser?.username || 'Manager'}
              </p>
              <span className="text-[10px] text-secondary-container font-mono block">
                {managerUser?.roleTitle || managerUser?.role_title || 'Working Manager'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all ${isActive
                    ? 'bg-secondary-container text-on-secondary-container shadow-md font-extrabold'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined text-[20px] ${isActive ? 'icon-fill' : ''}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge && !isActive && (
                  <span className="px-2 py-0.5 bg-white/10 text-[10px] rounded-full text-secondary-container font-mono">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-primary-container">
          <button
            type="button"
            onClick={() => {
              try {
                soundManager?.playPop?.();
              } catch {
                // ignore
              }
              logoutManager();
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-300 hover:bg-rose-950/50 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Exit Manager Control</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Operational Status Bar (Requirement 9: Manager Logs next to My Hotel, Restaurant Status & Hours moved left, Logout) */}
        <header className="bg-white px-5 py-3 border-b border-surface-container-high flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
          {/* Left Group: Open/Close Dashboard + Section Title + Restaurant Status & Hours moved toward left */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Open / Close Dashboard Toggle Button */}
            <button
              type="button"
              onClick={toggleDashboardNav}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-2xs border cursor-pointer active:scale-95 ${
                isDashboardNavOpen
                  ? 'bg-surface-container-low hover:bg-surface-container text-gray-800 border-surface-container-high'
                  : 'bg-primary hover:bg-primary/90 text-white border-primary shadow-xs'
              }`}
              title={isDashboardNavOpen ? 'Close Dashboard Navigation (Maximize Screen)' : 'Open Dashboard Navigation'}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isDashboardNavOpen ? 'left_panel_close' : 'left_panel_open'}
              </span>
              <span>{isDashboardNavOpen ? 'Close Dashboard' : 'Open Dashboard'}</span>
            </button>

            <h2 className="text-base font-black text-gray-900 tracking-tight capitalize">
              {navItems.find((n) => n.id === activeSection)?.label || 'Dashboard'}
            </h2>

            {/* Restaurant Status moved left */}
            <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-2xl border border-surface-container-high">
              <span className="text-xs font-bold text-gray-600">Restaurant Status:</span>
              <button
                type="button"
                onClick={handleToggleRestaurantOpen}
                disabled={togglingOpen}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                  restaurantSettings.is_open
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-rose-600 text-white hover:bg-rose-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                {restaurantSettings.is_open ? 'OPEN FOR SERVICE' : 'CLOSED'}
              </button>
            </div>

            {/* Hours moved left */}
            <div className="hidden sm:block text-[11px] text-gray-500 font-mono bg-surface-container-low px-2.5 py-1 rounded-xl border border-surface-container-high">
              Hours: {restaurantSettings.opening_time || '12:00 PM'} - {restaurantSettings.closing_time || '12:00 AM'}
            </div>

            {/* Live Reaction Ticker */}
            {latestEvent && (
              <button
                onClick={() => setActiveSection('logs')}
                className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl text-xs font-bold text-amber-900 transition-all cursor-pointer group"
                title="Click to open Live Hotel Activity Logs"
              >
                <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping"></span>
                <span className="text-[10px] font-black uppercase text-amber-700 font-mono">LIVE:</span>
                <span className="font-extrabold truncate max-w-[180px] text-gray-900 group-hover:text-primary">
                  {latestEvent.title}
                </span>
              </button>
            )}
          </div>

          {/* Right Group: My Hotel + Manager Logs + Logout */}
          <div className="flex items-center gap-2">
            {/* My Hotel: Direct Link to customer-facing front page */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex px-3 py-1.5 bg-surface-container-low hover:bg-surface-container text-primary font-extrabold text-xs rounded-xl border border-surface-container-high shadow-2xs items-center gap-1.5 transition-colors cursor-pointer"
              title="Open Customer Front-facing Hotel Page in new tab"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">storefront</span>
              <span>My Hotel</span>
            </a>

            {/* Manager Logs: Placed in top-right next to My Hotel */}
            <button
              type="button"
              onClick={() => setActiveSection('logs')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSection === 'logs'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-container-low hover:bg-surface-container text-gray-800 border border-surface-container-high'
              }`}
              title="View Live Hotel Logs & Real-Time Event Audit"
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>Manager Logs</span>
            </button>

            {/* Clear Functional Logout Option (Requirement 9) */}
            <button
              type="button"
              onClick={() => {
                try {
                  soundManager?.playPop?.();
                } catch {
                  // ignore audio errors
                }
                logoutManager();
              }}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs rounded-xl border border-rose-200 shadow-2xs flex items-center gap-1 transition-colors cursor-pointer active:scale-95"
              title="Logout of Manager Account"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Section View Router */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {activeSection === 'live-tables' && (
            <LiveTablesView
              onOpenBillModal={(id) => setBillModalSessionId(id)}
              onOpenQRModal={(num) => setQrModalTableNumber(num)}
            />
          )}

          {activeSection === 'logs' && <LiveActivityLogsView />}



          {activeSection === 'reservations' && <ReservationsManagementView />}

          {activeSection === 'cancellations' && <CancellationRequestsView />}

          {activeSection === 'assignment' && <TableAssignmentView />}

          {activeSection === 'staff' && (
            <StaffManagement staffList={staffList} onRefresh={loadInitial} />
          )}

          {activeSection === 'menu' && <MenuManagementView />}

          {activeSection === 'history' && <HistoryReportsView />}

          {activeSection === 'qrcodes' && (
            <TableQRCodesView onOpenQRModal={(num) => setQrModalTableNumber(num)} />
          )}
        </div>
      </main>

      {/* Bill Preview & Print Modal */}
      {billModalSessionId && (
        <BillPrintModal
          sessionId={billModalSessionId}
          onClose={() => setBillModalSessionId(null)}
        />
      )}

      {/* Permanent Table QR Code Modal */}
      {qrModalTableNumber && (
        <QRModal
          tableNumber={qrModalTableNumber}
          onClose={() => setQrModalTableNumber(null)}
        />
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  const { managerUser } = useAuth();

  if (!managerUser) {
    return <ManagerLogin />;
  }

  return <ManagerDashboardContent />;
}
