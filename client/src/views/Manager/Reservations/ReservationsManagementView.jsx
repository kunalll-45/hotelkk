import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../../utils/api';
import { useSocket } from '../../../context/SocketContext';
import { soundManager } from '../../../utils/soundEffects';

export default function ReservationsManagementView() {
  const { socket } = useSocket();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgressId, setActionInProgressId] = useState(null);

  const loadReservations = async (date) => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getBookings(date || selectedDate);
      setReservations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load reservations:', err);
      setError(err.message || 'Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations(selectedDate);
  }, [selectedDate]);

  // Real-time socket updates for incoming reservations
  useEffect(() => {
    if (!socket) return;
    const handleNewBooking = () => {
      try {
        soundManager.playBell();
      } catch (e) {}
      loadReservations(selectedDate);
    };

    const handleUpdateBooking = () => {
      loadReservations(selectedDate);
    };

    socket.on('booking:new', handleNewBooking);
    socket.on('booking:created', handleNewBooking);
    socket.on('booking:updated', handleUpdateBooking);
    socket.on('booking:status_changed', handleUpdateBooking);

    return () => {
      socket.off('booking:new', handleNewBooking);
      socket.off('booking:created', handleNewBooking);
      socket.off('booking:updated', handleUpdateBooking);
      socket.off('booking:status_changed', handleUpdateBooking);
    };
  }, [socket, selectedDate]);

  // Status Change (SEATED, CANCELLED, COMPLETED)
  const handleUpdateStatus = async (id, newStatus) => {
    try {
      soundManager.playPop();
      setActionInProgressId(id);
      await api.updateBookingStatus(id, newStatus);
      soundManager.playSuccess();
      await loadReservations(selectedDate);
    } catch (err) {
      soundManager.playError();
      alert(err.message || `Failed to mark reservation as ${newStatus}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this reservation?')) return;
    try {
      soundManager.playPop();
      setActionInProgressId(id);
      await api.cancelBooking(id);
      soundManager.playSuccess();
      await loadReservations(selectedDate);
    } catch (err) {
      soundManager.playError();
      alert(err.message || 'Failed to cancel reservation');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        r.customer_name?.toLowerCase().includes(q) ||
        r.customer_phone?.includes(q) ||
        r.booking_code?.toLowerCase().includes(q) ||
        String(r.table_number || '').includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [reservations, statusFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = reservations.length;
    const confirmed = reservations.filter((r) => r.status === 'CONFIRMED').length;
    const seated = reservations.filter((r) => r.status === 'SEATED').length;
    const cancelled = reservations.filter((r) => r.status === 'CANCELLED').length;
    const guaranteeRevenue = (total - cancelled) * 2.5;
    return { total, confirmed, seated, cancelled, guaranteeRevenue };
  }, [reservations]);

  return (
    <div className="space-y-4">
      {/* 1. Header & Date Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-[26px]">event_seat</span>
            <h2 className="text-lg font-black text-gray-900 tracking-tight">
              Table Reservations & Guest Bookings
            </h2>
            <span className="px-2.5 py-0.5 bg-secondary-container text-on-secondary-container font-mono text-[10px] font-black rounded-full uppercase">
              Operational
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Monitor customer table bookings, seat arriving parties, verify arrival OTPs, and track guarantee deposits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Today / Tomorrow Buttons */}
          <button
            onClick={() => {
              soundManager.playPop();
              const todayIso = new Date().toISOString().split('T')[0];
              setSelectedDate(todayIso);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedDate === new Date().toISOString().split('T')[0]
                ? 'bg-primary text-white shadow-xs'
                : 'bg-surface-container-low text-gray-600 hover:text-gray-900 border border-surface-container-high'
            }`}
          >
            Today
          </button>

          <button
            onClick={() => {
              soundManager.playPop();
              const d = new Date();
              d.setDate(d.getDate() + 1);
              setSelectedDate(d.toISOString().split('T')[0]);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedDate === new Date(Date.now() + 86400000).toISOString().split('T')[0]
                ? 'bg-primary text-white shadow-xs'
                : 'bg-surface-container-low text-gray-600 hover:text-gray-900 border border-surface-container-high'
            }`}
          >
            Tomorrow
          </button>

          {/* Date Picker */}
          <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container-high">
            <span className="text-[11px] font-bold text-gray-500 uppercase">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                soundManager.playPop();
                setSelectedDate(e.target.value);
              }}
              className="bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-xs font-mono font-bold focus:outline-none"
            />
          </div>

          <button
            onClick={() => {
              soundManager.playPop();
              loadReservations(selectedDate);
            }}
            className="px-3.5 py-2 bg-surface-container-high hover:bg-gray-200 text-gray-800 text-xs font-extrabold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh bookings"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-indigo-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-indigo-800 uppercase tracking-wider">
              Total Bookings
            </span>
            <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-indigo-900 font-mono">{metrics.total}</span>
            <span className="text-[10px] text-gray-500 font-medium">Slots</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider">
              Confirmed
            </span>
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-700 font-mono">{metrics.confirmed}</span>
            <span className="text-[10px] text-emerald-600 font-medium">Guaranteed</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-amber-800 uppercase tracking-wider">
              Arrived & Seated
            </span>
            <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px]">table_restaurant</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-800 font-mono">{metrics.seated}</span>
            <span className="text-[10px] text-gray-500 font-medium">Dining Now</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-rose-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-rose-800 uppercase tracking-wider">
              Cancelled
            </span>
            <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px]">cancel</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-700 font-mono">{metrics.cancelled}</span>
            <span className="text-[10px] text-gray-500 font-medium">Released</span>
          </div>
        </div>

        <div className="bg-primary text-white p-3.5 rounded-2xl shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-secondary-container uppercase tracking-wider">
              Deposit Total
            </span>
            <span className="w-6 h-6 rounded-lg bg-white/10 text-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px]">payments</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white font-mono">
              ₹{metrics.guaranteeRevenue.toFixed(2)}
            </span>
            <span className="text-[10px] text-gray-300 font-medium">(₹2.50/seat)</span>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-surface-container-high shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-surface-container-low p-1 rounded-2xl border border-surface-container-high">
          {['ALL', 'CONFIRMED', 'SEATED', 'CANCELLED'].map((st) => {
            const isActive = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => {
                  soundManager.playPop();
                  setStatusFilter(st);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-primary text-white shadow-xs font-extrabold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {st === 'ALL' ? 'All Bookings' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guest, phone, table #, or KK-B code..."
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-gray-300 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </div>
      </div>

      {/* 4. Reservations Table */}
      <div className="bg-white rounded-3xl border border-surface-container-high shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 space-y-3">
            <span className="material-symbols-outlined text-4xl animate-spin text-secondary">
              progress_activity
            </span>
            <p className="text-xs font-bold font-mono">Loading reservations for {selectedDate}...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-rose-600 space-y-2">
            <span className="material-symbols-outlined text-4xl">error</span>
            <p className="text-sm font-bold">{error}</p>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <span className="material-symbols-outlined text-gray-300 text-5xl">event_seat</span>
            <h4 className="text-sm font-black text-gray-700">No Reservations Found</h4>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              No table bookings match your selected criteria on {selectedDate}. As customers book tables through the website, they will appear here live.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-gray-600 font-extrabold border-b border-surface-container-high uppercase tracking-wider text-[10px] font-mono">
                <tr>
                  <th className="py-3.5 px-4">Booking Code</th>
                  <th className="py-3.5 px-4">Time Slot</th>
                  <th className="py-3.5 px-4">Table</th>
                  <th className="py-3.5 px-4">Customer Details</th>
                  <th className="py-3.5 px-4 text-center">Party</th>
                  <th className="py-3.5 px-4">Guarantee Deposit</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high">
                {filteredReservations.map((booking) => {
                  const isBusy = actionInProgressId === booking.id;
                  const isConfirmed = booking.status === 'CONFIRMED';
                  const isSeated = booking.status === 'SEATED';
                  const isCancelled = booking.status === 'CANCELLED';

                  return (
                    <tr
                      key={booking.id}
                      className="hover:bg-surface-container-lowest transition-colors font-medium text-gray-900"
                    >
                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-black text-primary">
                        {booking.booking_code}
                      </td>

                      {/* Time Slot */}
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-800">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-secondary">
                            schedule
                          </span>
                          <span>{booking.booking_time}</span>
                        </div>
                      </td>

                      {/* Table */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-900 rounded-lg font-mono font-extrabold border border-amber-200">
                          <span className="material-symbols-outlined text-[14px]">table_restaurant</span>
                          Table #{booking.table_number || 'TBD'}
                        </span>
                      </td>

                      {/* Customer Info */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900">{booking.customer_name}</div>
                        <div className="text-[11px] text-gray-500 font-mono mt-0.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">phone</span>
                          <a
                            href={`tel:${booking.customer_phone}`}
                            className="hover:underline hover:text-primary"
                          >
                            {booking.customer_phone}
                          </a>
                        </div>
                      </td>

                      {/* Party */}
                      <td className="py-3.5 px-4 text-center font-bold">
                        <span className="px-2 py-0.5 bg-surface-container-high rounded-md text-[11px] font-mono">
                          {booking.guests_count} Guests
                        </span>
                      </td>

                      {/* Guarantee */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-800 rounded-full font-mono text-[10px] font-bold border border-emerald-200">
                          <span className="material-symbols-outlined text-[12px] text-emerald-600">
                            verified
                          </span>
                          ₹2.50 Paid (Online)
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isConfirmed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            CONFIRMED
                          </span>
                        )}
                        {isSeated && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-100 text-amber-800 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            SEATED
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-rose-100 text-rose-800 border border-rose-300">
                            CANCELLED
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isConfirmed && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(booking.id, 'SEATED')}
                                disabled={isBusy}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                                title="Customer arrived at restaurant"
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  room_service
                                </span>
                                Seat Guest
                              </button>

                              <button
                                onClick={() => handleCancel(booking.id)}
                                disabled={isBusy}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Cancel booking"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {isSeated && (
                            <button
                              onClick={() => handleUpdateStatus(booking.id, 'COMPLETED')}
                              disabled={isBusy}
                              className="px-2.5 py-1 bg-surface-container-high hover:bg-gray-200 text-gray-800 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              Complete
                            </button>
                          )}

                          {isCancelled && (
                            <span className="text-[10px] text-gray-400 font-mono">No actions</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
