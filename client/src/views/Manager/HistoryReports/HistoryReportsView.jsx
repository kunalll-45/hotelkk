import React, { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import TopSummaryCards from './TopSummaryCards';
import WaiterPerformanceView from './WaiterPerformanceView';

export default function HistoryReportsView() {
  const [period, setPeriod] = useState('day'); // 'day' | 'week' | 'month'
  const [reportData, setReportData] = useState(null);
  const [topSummary, setTopSummary] = useState(null);
  const [activeReportTab, setActiveReportTab] = useState('sessions'); // 'sessions' | 'orders' | 'tables' | 'waiters'
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    try {
      setLoading(true);
      const [topSum, rep] = await Promise.all([
        api.getTopSummary(),
        api.getReports({ period })
      ]);
      setTopSummary(topSum);
      setReportData(rep);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [period]);

  const { sessions = [], orders = [], tableStats = [], summary = {} } = reportData || {};

  return (
    <div className="space-y-5 pb-16">
      {/* 1. TOP SUMMARY AREA (Divided into TWO parts) */}
      <TopSummaryCards topSummary={topSummary} />

      {/* 2. Reports Navigation & Period Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs">
        {/* Report Section Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-surface-container-low p-1 rounded-2xl border border-surface-container-high">
          <button
            onClick={() => setActiveReportTab('sessions')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeReportTab === 'sessions'
                ? 'bg-primary text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Session History
          </button>

          <button
            onClick={() => setActiveReportTab('orders')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeReportTab === 'orders'
                ? 'bg-primary text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Order History
          </button>

          <button
            onClick={() => setActiveReportTab('tables')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeReportTab === 'tables'
                ? 'bg-primary text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Table History
          </button>

          <button
            onClick={() => setActiveReportTab('waiters')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeReportTab === 'waiters'
                ? 'bg-primary text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Waiter Performance Ledger
          </button>
        </div>

        {/* Period Filter (Day, Week, Month) */}
        <div className="flex items-center gap-1 bg-surface-container-high p-1 rounded-2xl border border-surface-container-highest">
          <button
            onClick={() => setPeriod('day')}
            className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-colors ${period === 'day' ? 'bg-white text-primary shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Day-wise
          </button>

          <button
            onClick={() => setPeriod('week')}
            className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-colors ${period === 'week' ? 'bg-white text-primary shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Week-wise
          </button>

          <button
            onClick={() => setPeriod('month')}
            className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-colors ${period === 'month' ? 'bg-white text-primary shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Month-wise
          </button>
        </div>
      </div>

      {/* Period Overall Revenue Bar */}
      <div className="bg-surface-container-low p-4 rounded-3xl border border-surface-container-high flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div>
          <span className="text-gray-500 font-bold uppercase tracking-wider block">Period Revenue:</span>
          <span className="text-xl font-black text-primary font-sans">₹{summary.totalRevenue || 0}</span>
        </div>

        <div>
          <span className="text-gray-500 font-bold uppercase tracking-wider block">Total Sessions:</span>
          <span className="text-lg font-black text-gray-800 font-sans">{summary.totalSessions || 0}</span>
        </div>

        <div>
          <span className="text-gray-500 font-bold uppercase tracking-wider block">Total Orders:</span>
          <span className="text-lg font-black text-gray-800 font-sans">{summary.totalOrders || 0}</span>
        </div>

        <div>
          <span className="text-gray-500 font-bold uppercase tracking-wider block">Discounts Given:</span>
          <span className="text-lg font-black text-emerald-700 font-sans">₹{summary.totalDiscount || 0}</span>
        </div>
      </div>

      {/* Tab Content Display */}
      {loading ? (
        <div className="py-20 text-center text-gray-400">
          <span className="material-symbols-outlined text-[36px] animate-spin text-secondary-container">progress_activity</span>
          <p className="text-xs mt-2 font-medium">Computing historical analytics...</p>
        </div>
      ) : activeReportTab === 'sessions' ? (
        /* SESSION-WISE HISTORY */
        <div className="bg-white rounded-3xl border border-surface-container-high overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-gray-700 font-extrabold uppercase tracking-wider border-b border-surface-container-high">
                <tr>
                  <th className="py-3.5 px-4 font-mono">Session Code</th>
                  <th className="py-3.5 px-4">Table</th>
                  <th className="py-3.5 px-4">Customer / Family</th>
                  <th className="py-3.5 px-4">Assigned Waiter</th>
                  <th className="py-3.5 px-4">Orders Placed</th>
                  <th className="py-3.5 px-4">Subtotal</th>
                  <th className="py-3.5 px-4">Discount</th>
                  <th className="py-3.5 px-4 font-black">Final Amount</th>
                  <th className="py-3.5 px-4 text-right">Closed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-400">No sessions recorded in this period.</td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-secondary">{s.session_code}</td>
                      <td className="py-3 px-4 font-bold text-gray-900">Table #{s.table_number}</td>
                      <td className="py-3 px-4 font-semibold text-gray-900">{s.customer_name || 'Guest'}</td>
                      <td className="py-3 px-4 text-gray-600">{s.waiter_name || 'Unassigned'}</td>
                      <td className="py-3 px-4 font-mono">{s.orders_count || 0} Orders</td>
                      <td className="py-3 px-4 font-mono">₹{s.subtotal}</td>
                      <td className="py-3 px-4 font-mono text-emerald-700">
                        {s.discount_type !== 'NONE'
                          ? `${s.discount_type === 'PERCENTAGE' ? `${s.discount_value}%` : `₹${s.discount_value}`}`
                          : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono font-black text-primary text-sm">₹{s.final_total}</td>
                      <td className="py-3 px-4 text-right font-mono text-gray-500">{formatDateTime(s.closed_at || s.opened_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeReportTab === 'orders' ? (
        /* ORDER-WISE HISTORY */
        <div className="bg-white rounded-3xl border border-surface-container-high overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-gray-700 font-extrabold uppercase tracking-wider border-b border-surface-container-high">
                <tr>
                  <th className="py-3.5 px-4 font-mono">Order ID</th>
                  <th className="py-3.5 px-4">Table</th>
                  <th className="py-3.5 px-4">Placed By</th>
                  <th className="py-3.5 px-4">Ordered Items & Quantities</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 font-black">Order Total</th>
                  <th className="py-3.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">No orders recorded in this period.</td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-secondary">#{o.id}</td>
                      <td className="py-3 px-4 font-bold text-gray-900">Table #{o.table_number}</td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-gray-900">{o.placed_by_name}</span>
                        <span className="text-[10px] text-gray-400 block font-mono">Session: {o.session_code}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5 max-w-sm">
                          {o.items?.map((it, idx) => (
                            <span key={idx} className="inline-block bg-surface-container-low px-2 py-0.5 rounded mr-1 mb-1 font-mono text-[11px]">
                              {it.quantity}x {it.item_name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-black text-primary text-sm">₹{o.total_amount}</td>
                      <td className="py-3 px-4 text-right font-mono text-gray-500">{formatDateTime(o.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeReportTab === 'tables' ? (
        /* TABLE-WISE HISTORY */
        <div className="bg-white rounded-3xl border border-surface-container-high overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-gray-700 font-extrabold uppercase tracking-wider border-b border-surface-container-high">
                <tr>
                  <th className="py-3.5 px-4">Table Number</th>
                  <th className="py-3.5 px-4">Capacity</th>
                  <th className="py-3.5 px-4">Sessions Handled</th>
                  <th className="py-3.5 px-4">Orders Handled</th>
                  <th className="py-3.5 px-4 font-black">Total Revenue Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {tableStats.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3.5 px-4 font-black text-gray-900 text-sm">Table #{t.table_number}</td>
                    <td className="py-3.5 px-4 font-mono text-gray-600">{t.capacity} Guests</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900">{t.sessions_handled} Sessions</td>
                    <td className="py-3.5 px-4 font-mono text-gray-700">{t.orders_handled} Orders</td>
                    <td className="py-3.5 px-4 font-mono font-black text-primary text-sm">₹{t.total_generated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* WAITER ATTENDANCE + PERFORMANCE HISTORY */
        <WaiterPerformanceView />
      )}
    </div>
  );
}
