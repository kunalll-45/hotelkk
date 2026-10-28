import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { soundManager } from '../utils/soundEffects';

export default function RoleSwitcherBar() {
  const { activeRole, switchRole, selectedTableNumber, changeCustomerTable, restaurantSettings, managerUser, waiterUser } = useAuth();
  const { isConnected } = useSocket();
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return Boolean(soundManager?.isMuted);
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (soundManager && typeof soundManager.subscribe === 'function') {
        return soundManager.subscribe((muted) => setIsMuted(Boolean(muted)));
      }
    } catch (err) {
      console.warn('soundManager subscribe error:', err);
    }
    return () => {};
  }, []);

  return (
    <div className="bg-primary-container text-on-primary-container text-xs px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-surface-container-high no-print z-50">

      {/* Role Switcher Tabs */}
      <div className="max-w-full overflow-x-auto no-scrollbar whitespace-nowrap flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/10">
        <button
          onClick={() => switchRole('Home')}
          data-sound="tab"
          className={`shrink-0 whitespace-nowrap px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${activeRole === 'Home'
            ? 'bg-secondary-container text-on-secondary-container shadow-sm font-bold'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
        >
          <span className="material-symbols-outlined text-[15px]">event_seat</span>
          Home & Booking
        </button>

        <button
          onClick={() => switchRole('Customer')}
          data-sound="tab"
          className={`shrink-0 whitespace-nowrap px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${activeRole === 'Customer'
            ? 'bg-secondary-container text-on-secondary-container shadow-sm font-bold'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
        >
          <span className="material-symbols-outlined text-[15px]">qr_code_scanner</span>
          Dine-In QR
        </button>

        <button
          onClick={() => switchRole('Waiter')}
          data-sound="tab"
          className={`shrink-0 whitespace-nowrap px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${activeRole === 'Waiter'
            ? 'bg-secondary-container text-on-secondary-container shadow-sm font-bold'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
        >
          <span className="material-symbols-outlined text-[15px]">room_service</span>
          Waiter App {waiterUser ? `(${waiterUser.name})` : ''}
        </button>

        <button
          onClick={() => switchRole('Manager')}
          data-sound="tab"
          className={`shrink-0 whitespace-nowrap px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${activeRole === 'Manager'
            ? 'bg-secondary-container text-on-secondary-container shadow-sm font-bold'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
        >
          <span className="material-symbols-outlined text-[15px]">admin_panel_settings</span>
          Manager Control {managerUser ? `(${managerUser?.fullName || managerUser?.full_name || managerUser?.username || 'Active'})` : ''}
        </button>

        <button
          onClick={() => switchRole('Kitchen')}
          data-sound="tab"
          className={`shrink-0 whitespace-nowrap px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${activeRole === 'Kitchen'
            ? 'bg-amber-500 text-black shadow-sm font-black'
            : 'text-amber-300/80 hover:text-amber-200 hover:bg-white/10'
            }`}
        >
          <span className="material-symbols-outlined text-[15px]">skillet</span>
          Kitchen Display (KDS)
        </button>
      </div>

      {/* Table Selector for Customer View */}
      {activeRole === 'Customer' && (
        <div className="flex items-center gap-2 bg-black/30 px-2.5 py-1 rounded border border-white/10">
          <span className="text-gray-400 font-medium">Scanned Table:</span>
          <select
            value={selectedTableNumber}
            onChange={(e) => changeCustomerTable(e.target.value)}
            className="bg-primary text-white text-xs font-bold py-0.5 px-2 rounded border border-secondary-container/40 focus:outline-none focus:ring-1 focus:ring-secondary-container"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
              <option key={num} value={num}>
                Table #{num}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Right Controls: Sound Toggle & Socket Status */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            try {
              if (soundManager && typeof soundManager.toggleMute === 'function') {
                const res = soundManager.toggleMute();
                setIsMuted(Boolean(res));
              }
            } catch (e) {
              console.warn(e);
            }
          }}
          data-sound="none"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${isMuted
            ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
            : 'bg-white/10 text-[#fed65b] hover:bg-white/20 border border-white/10'
            }`}
          title={isMuted ? 'Sound is muted (Click to unmute)' : 'Sound is active (Click to mute)'}
        >
          <span className="material-symbols-outlined text-[14px]">
            {isMuted ? 'volume_off' : 'volume_up'}
          </span>
          <span className="hidden md:inline">{isMuted ? 'Muted' : 'Sound ON'}</span>
        </button>

        {/* Socket Status Indicator (Silent/Dot only or removed) */}
        <div className="hidden lg:flex items-center gap-1.5" title={isConnected ? 'Connected' : 'Connecting...'}>
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400/80' : 'bg-rose-400/80'}`}></span>
        </div>
      </div>
    </div>
  );
}
