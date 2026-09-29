import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../utils/api';
import { formatCurrency, formatDate, formatTime, formatDateTime } from '../../utils/formatters';
import { soundManager } from '../../utils/soundEffects';

export default function WaiterDailyHistory({ waiterId, onOpenTips }) {
  const [perfData, setPerfData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeScope, setTimeScope] = useState('today'); // 'today' | 'all'
  const [activeHistoryTab, setActiveHistoryTab] = useState('orders'); // 'orders' | 'sessions' | 'tips' | 'attendance'
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const perf = await api.getWaiterPerformance(waiterId);
      setPerfData(perf);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (waiterId) loadData();
  }, [waiterId]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  if (loading) {
    return (
      <div className="py-24 text-center text-gray-400 space-y-3">
        <span className="material-symbols-outlined text-[40px] animate-spin text-secondary-container">
          progress_activity
        </span>
        <p className="text-xs font-semibold tracking-wide text-gray-500">
          Loading your service ledger & shift history...
        </p>
      </div>
    );
  }

  const {
    waiter = {},
    joiningDate = '',
    presentDays = 0,
    absentDays = 0,
    attendanceHistory = [],
    todayPerformance = {},
    overallPerformance = {},
    servedOrders = [],
    completedSessions = [],
    tipEntries = []
  } = perfData || {};

  const currentStats = timeScope === 'today' ? todayPerformance : overallPerformance;
  const totalDays = presentDays + absentDays;
  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

  // Filtered orders according to timeScope and searchQuery
  const filteredOrders = servedOrders.filter((ord) => {
    const isToday = ord.created_at?.startsWith(todayStr);
    if (timeScope === 'today' && !isToday) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchTable = `table ${ord.table_number}`.toLowerCase().includes(q) || String(ord.table_number).includes(q);
    const matchId = `order #${ord.id}`.toLowerCase().includes(q) || String(ord.id).includes(q);
    const matchItem = ord.items?.some((it) => it.item_name.toLowerCase().includes(q));
    const matchCustomer = ord.placed_by_name?.toLowerCase().includes(q) || ord.family_name?.toLowerCase().includes(q);
    return matchTable || matchId || matchItem || matchCustomer;
  });

  // Filtered sessions according to timeScope
  const filteredSessions = completedSessions.filter((sess) => {
    const isToday = sess.opened_at?.startsWith(todayStr) || sess.closed_at?.startsWith(todayStr);
    if (timeScope === 'today' && !isToday) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchTable = `table ${sess.table_number}`.toLowerCase().includes(q) || String(sess.table_number).includes(q);
    const matchCode = sess.session_code?.toLowerCase().includes(q);
    const matchName = sess.customer_name?.toLowerCase().includes(q);
    return matchTable || matchCode || matchName;
  });

  // Filtered tips according to timeScope
  const filteredTips = tipEntries.filter((tip) => {
    const isToday = tip.date === todayStr;
    if (timeScope === 'today' && !isToday) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return tip.notes?.toLowerCase().includes(q) || tip.recorded_by?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 pb-20">
      {/* 1. Header & Scope Selector (Today vs All-Time) */}
      <div className="bg-white rounded-3xl p-5 border border-surface-container-high shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                Staff Service Ledger
              </span>
              <span className="text-[11px] font-mono text-gray-400">
                Joined: {formatDate(joiningDate)}
              </span>
            </div>
            <h2 className="text-lg font-black text-gray-900 tracking-tight mt-1">
              {timeScope === 'today' ? "Today's Shift Performance" : 'Career Service Summary'}
            </h2>
          </div>

          {/* Time Scope Toggle */}
          <div className="flex bg-surface-container-low p-1 rounded-2xl border border-surface-container-high shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                soundManager?.playPop?.();
                setTimeScope('today');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                timeScope === 'today'
                  ? 'bg-white text-primary shadow-xs font-black'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Today's Shift
            </button>
            <button
              type="button"
              onClick={() => {
                soundManager?.playPop?.();
                setTimeScope('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                timeScope === 'all'
                  ? 'bg-white text-primary shadow-xs font-black'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All-Time Record
            </button>
          </div>
        </div>

        {/* Dynamic Metric Stat Boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 bg-surface-container-low rounded-2xl border border-surface-container-high text-center">
            <span className="text-2xl font-black text-emerald-700 font-mono block">
              {currentStats.ordersServed || 0}
            </span>
            <span className="text-[10px] font-bold text-gray-500 uppercase mt-0.5 block flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-emerald-600">dinner_dining</span>
              Orders Served
            </span>
          </div>

          <div className="p-3 bg-surface-container-low rounded-2xl border border-surface-container-high text-center">
            <span className="text-2xl font-black text-primary font-mono block">
              {currentStats.tablesHandled || 0}
            </span>
            <span className="text-[10px] font-bold text-gray-500 uppercase mt-0.5 block flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-primary">table_restaurant</span>
              Tables Handled
            </span>
          </div>

          <div className="p-3 bg-surface-container-low rounded-2xl border border-surface-container-high text-center">
            <span className="text-2xl font-black text-primary font-mono block">
              {currentStats.sessionsHandled || 0}
            </span>
            <span className="text-[10px] font-bold text-gray-500 uppercase mt-0.5 block flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-indigo-600">task_alt</span>
              Sessions Closed
            </span>
          </div>

          <div className="p-3 bg-surface-container-low rounded-2xl border border-surface-container-high text-center">
            <span className="text-2xl font-black text-amber-700 font-mono block">
              {formatCurrency(currentStats.totalTipsEarned || 0)}
            </span>
            <span className="text-[10px] font-bold text-gray-500 uppercase mt-0.5 block flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-amber-600">payments</span>
              Tips Earned
            </span>
          </div>
        </div>

        {/* Tip Reminder Callout */}
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center font-black shrink-0">
              <span className="material-symbols-outlined text-[18px]">payments</span>
            </span>
            <div>
              <div className="text-xs font-black text-amber-950">
                {timeScope === 'today' ? "Today's Tips" : 'Lifetime Tips'}:{' '}
                <span className="font-mono text-amber-900 font-black">
                  {formatCurrency(currentStats.totalTipsEarned || 0)}
                </span>
              </div>
              <p className="text-[11px] text-amber-800">
                Recorded by Manager upon checkout settlement.
              </p>
            </div>
          </div>

          {onOpenTips && (
            <button
              onClick={() => {
                soundManager?.playPop?.();
                onOpenTips();
              }}
              type="button"
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-amber-950 font-black text-xs rounded-xl shadow-xs shrink-0 transition-transform flex items-center gap-1 cursor-pointer"
            >
              <span>View Log</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Detailed History Navigation Sub-Tabs */}
      <div className="bg-white rounded-3xl p-4 border border-surface-container-high shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-surface-container-high pb-3 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            <button
              type="button"
              onClick={() => {
                soundManager?.playPop?.();
                setActiveHistoryTab('orders');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeHistoryTab === 'orders'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-gray-600 hover:bg-surface-container-low'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">dinner_dining</span>
              <span>Served Orders</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeHistoryTab === 'orders' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {filteredOrders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundManager?.playPop?.();
                setActiveHistoryTab('sessions');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeHistoryTab === 'sessions'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-gray-600 hover:bg-surface-container-low'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>Closed Tables</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeHistoryTab === 'sessions' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {filteredSessions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundManager?.playPop?.();
                setActiveHistoryTab('tips');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeHistoryTab === 'tips'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-gray-600 hover:bg-surface-container-low'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              <span>Tips Ledger</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeHistoryTab === 'tips' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {filteredTips.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundManager?.playPop?.();
                setActiveHistoryTab('attendance');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeHistoryTab === 'attendance'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-gray-600 hover:bg-surface-container-low'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">calendar_month</span>
              <span>Attendance</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeHistoryTab === 'attendance' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {presentDays}d
              </span>
            </button>
          </div>
        </div>

        {/* Search Bar for Orders & Sessions */}
        {activeHistoryTab !== 'attendance' && (
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeHistoryTab} by table, order #, dish name...`}
              className="w-full bg-surface-container-low border border-surface-container-high rounded-xl pl-9 pr-8 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* TAB 1: SERVED ORDERS LIST */}
        {activeHistoryTab === 'orders' && (
          <div className="space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-2xl p-6 space-y-2">
                <div className="w-12 h-12 rounded-full bg-surface-container text-gray-400 mx-auto flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">dinner_dining</span>
                </div>
                <h4 className="text-xs font-bold text-gray-700">No Served Orders Found</h4>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                  {timeScope === 'today'
                    ? 'Orders marked as served during today’s shift will appear here automatically.'
                    : 'No past served orders match your search criteria.'}
                </p>
              </div>
            ) : (
              filteredOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-surface-container-low rounded-2xl p-4 border border-surface-container-high space-y-3 hover:border-gray-300 transition-colors"
                >
                  {/* Order Top Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-primary text-white font-mono">
                        Table {ord.table_number || '?'}
                      </span>
                      <span className="text-xs font-bold text-gray-900">
                        Order #{ord.id}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">• {ord.placed_by_name || 'Guest'}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                        {ord.status}
                      </span>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {formatTime(ord.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  {ord.items?.length > 0 && (
                    <div className="bg-white rounded-xl p-2.5 border border-surface-container divide-y divide-gray-100">
                      {ord.items.map((it) => (
                        <div
                          key={it.id}
                          className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-secondary-container text-on-secondary-container font-black text-[10px] flex items-center justify-center shrink-0">
                              {it.quantity}x
                            </span>
                            <span className="font-semibold text-gray-800 truncate">
                              {it.item_name}
                            </span>
                            {it.is_manual === 1 && (
                              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                Manual
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-bold text-gray-700 shrink-0 ml-2">
                            {formatCurrency(it.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Order Total Footer */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-surface-container">
                    <span className="text-[11px] text-gray-400 font-mono">
                      {formatDate(ord.created_at)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-500 font-medium">Order Total:</span>
                      <span className="text-sm font-black font-mono text-gray-900">
                        {formatCurrency(ord.total_amount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: CLOSED SESSIONS / TABLES */}
        {activeHistoryTab === 'sessions' && (
          <div className="space-y-3">
            {filteredSessions.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-2xl p-6 space-y-2">
                <div className="w-12 h-12 rounded-full bg-surface-container text-gray-400 mx-auto flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">receipt_long</span>
                </div>
                <h4 className="text-xs font-bold text-gray-700">No Closed Sessions Found</h4>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                  Completed table dining sessions assigned to you will show here with settlement details.
                </p>
              </div>
            ) : (
              filteredSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="bg-surface-container-low rounded-2xl p-4 border border-surface-container-high space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-indigo-900 text-white font-mono">
                        Table {sess.table_number || '?'}
                      </span>
                      <div>
                        <div className="text-xs font-black text-gray-900">
                          {sess.customer_name || 'Guest Dining Session'}
                        </div>
                        <span className="text-[10px] font-mono text-gray-400">
                          {sess.session_code}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-200 text-gray-800">
                        {sess.status}
                      </span>
                      <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                        {formatTime(sess.closed_at || sess.opened_at)}
                      </div>
                    </div>
                  </div>

                  {/* Financial Settlement Breakdown */}
                  <div className="bg-white rounded-xl p-3 border border-surface-container flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold block">
                        Subtotal: {formatCurrency(sess.subtotal)}
                      </span>
                      {sess.discount_value > 0 && (
                        <span className="text-[10px] text-emerald-600 font-bold block">
                          Discount: -
                          {sess.discount_type === 'PERCENTAGE'
                            ? `${sess.discount_value}%`
                            : formatCurrency(sess.discount_value)}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">
                        Settled Bill
                      </span>
                      <span className="text-base font-black font-mono text-gray-900">
                        {formatCurrency(sess.final_total)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: TIPS LEDGER */}
        {activeHistoryTab === 'tips' && (
          <div className="space-y-3">
            {filteredTips.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-2xl p-6 space-y-2">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 mx-auto flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">payments</span>
                </div>
                <h4 className="text-xs font-bold text-gray-700">No Tips Recorded</h4>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                  Tips recorded by the manager at the register for your tables will appear here in chronological order.
                </p>
              </div>
            ) : (
              filteredTips.map((tip) => (
                <div
                  key={tip.id}
                  className="bg-surface-container-low rounded-2xl p-3.5 border border-surface-container-high flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
                      <span className="material-symbols-outlined text-[20px]">attach_money</span>
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-gray-900 truncate">
                        {tip.notes || 'Table Tip from Guest'}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono mt-0.5">
                        <span>{formatDate(tip.date)}</span>
                        <span>•</span>
                        <span>Recorded by {tip.recorded_by || 'Manager'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-base font-black font-mono text-amber-700 block">
                      +{formatCurrency(tip.amount)}
                    </span>
                    <span className="text-[9px] uppercase font-bold text-emerald-600">
                      Credited
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: OVERALL ATTENDANCE LOG */}
        {activeHistoryTab === 'attendance' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
                <span className="text-2xl font-black text-emerald-800 font-mono block">
                  {presentDays}
                </span>
                <span className="text-[10px] font-extrabold text-emerald-700 uppercase mt-0.5 block">
                  Present Days
                </span>
              </div>

              <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200">
                <span className="text-2xl font-black text-rose-800 font-mono block">
                  {absentDays}
                </span>
                <span className="text-[10px] font-extrabold text-rose-700 uppercase mt-0.5 block">
                  Absent Days
                </span>
              </div>

              <div className="p-3.5 bg-sky-50 rounded-2xl border border-sky-200">
                <span className="text-2xl font-black text-sky-800 font-mono block">
                  {attendanceRate}%
                </span>
                <span className="text-[10px] font-extrabold text-sky-700 uppercase mt-0.5 block">
                  Attendance Rate
                </span>
              </div>
            </div>

            {attendanceHistory?.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-surface-container-high">
                <span className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider block">
                  Shift Attendance Log (Recent)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {attendanceHistory.slice(0, 18).map((rec, i) => (
                    <div
                      key={i}
                      className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-between ${
                        rec.status === 'PRESENT'
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50/70 border-rose-200 text-rose-800'
                      }`}
                    >
                      <span>{formatDate(rec.date)}</span>
                      <span className="text-[10px] uppercase font-black">{rec.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
