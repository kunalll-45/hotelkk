import React, { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { formatDate, formatCurrency } from '../../../utils/formatters';

export default function WaiterPerformanceView() {
  const [waitersPerf, setWaitersPerf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWaiter, setSelectedWaiter] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const data = await api.getAllWaitersPerformance(selectedDate);
      setWaitersPerf(data);
      if (data.length > 0 && !selectedWaiter) {
        setSelectedWaiter(data[0]);
      } else if (selectedWaiter) {
        const updated = data.find((d) => d.waiter.id === selectedWaiter.waiter.id);
        setSelectedWaiter(updated || data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [selectedDate]);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 bg-white p-4 rounded-3xl border border-surface-container-high shadow-xs">
        <div>
          <h3 className="text-base font-black text-gray-900 tracking-tight">
            Waiter Attendance & Performance Ledger
          </h3>
          <p className="text-xs text-gray-500">
            Historical records tracked from each Waiter's joining date to selected date
          </p>
        </div>

        <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container-high">
          <span className="text-xs font-bold text-gray-500 uppercase">Audit Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold focus:outline-none"
          />
        </div>
      </div>

      {/* Waiters Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {waitersPerf.map((item) => {
          const isSelected = selectedWaiter?.waiter?.id === item.waiter.id;

          return (
            <button
              key={item.waiter.id}
              onClick={() => setSelectedWaiter(item)}
              className={`p-5 rounded-3xl text-left transition-all border-2 flex flex-col justify-between space-y-4 ${isSelected
                  ? 'border-primary bg-white shadow-lg ring-4 ring-secondary/20'
                  : 'border-transparent bg-white hover:border-gray-200 shadow-xs'
                }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-secondary-container flex items-center justify-center font-black text-sm">
                    {item.waiter.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-gray-900">{item.waiter.name}</h4>
                    <p className="text-[11px] text-gray-400 font-mono">
                      Joined {formatDate(item.joiningDate)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Numbers */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="font-black text-emerald-800 text-sm block">{item.presentDays}</span>
                  <span className="text-[9px] font-bold text-emerald-700 uppercase">Present</span>
                </div>

                <div className="p-2 bg-rose-50 rounded-xl border border-rose-200">
                  <span className="font-black text-rose-800 text-sm block">{item.absentDays}</span>
                  <span className="text-[9px] font-bold text-rose-700 uppercase">Absent</span>
                </div>

                <div className="p-2 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="font-black text-amber-900 text-sm block">{formatCurrency(item.performance.totalTipsEarned || 0)}</span>
                  <span className="text-[9px] font-bold text-amber-800 uppercase">Tips</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Waiter In-Depth History Audit */}
      {selectedWaiter && (
        <div className="bg-white rounded-3xl p-6 border border-surface-container-high shadow-xs space-y-5">
          <div className="flex justify-between items-center pb-4 border-b border-gray-100">
            <div>
              <span className="text-[10px] font-extrabold text-secondary uppercase tracking-widest font-mono">
                LIFETIME PERFORMANCE AUDIT
              </span>
              <h3 className="text-xl font-black text-gray-900 mt-0.5">
                {selectedWaiter.waiter.name}
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                Record Period: {formatDate(selectedWaiter.joiningDate)} ➔ {formatDate(selectedDate)}
              </p>
            </div>

            <span className="px-3.5 py-1.5 bg-surface-container-high font-mono font-bold text-xs rounded-xl text-primary">
              {selectedWaiter.totalMarkedDays} Total Working Records
            </span>
          </div>

          {/* KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-surface-container-low rounded-2xl border border-surface-container-high text-center">
              <span className="text-2xl font-black text-primary block">
                {selectedWaiter.performance.tablesHandled}
              </span>
              <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Tables Handled</span>
            </div>

            <div className="p-4 bg-surface-container-low rounded-2xl border border-surface-container-high text-center">
              <span className="text-2xl font-black text-primary block">
                {selectedWaiter.performance.ordersServed}
              </span>
              <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Orders Served</span>
            </div>

            <div className="p-4 bg-surface-container-low rounded-2xl border border-surface-container-high text-center">
              <span className="text-2xl font-black text-primary block">
                {selectedWaiter.performance.sessionsHandled}
              </span>
              <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Sessions Handled</span>
            </div>

            <div className="p-4 bg-surface-container-low rounded-2xl border border-surface-container-high text-center">
              <span className="text-2xl font-black text-emerald-700 block">
                {formatCurrency(selectedWaiter.performance.totalTipsEarned || 0)}
              </span>
              <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Lifetime Tips Earned</span>
            </div>
          </div>

          {/* Dates Worked Timeline */}
          <div>
            <h4 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2.5">
              Attendance History by Date
            </h4>
            <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-2xl p-2 text-xs font-mono">
              {selectedWaiter.attendanceHistory?.map((h, i) => (
                <div key={i} className="py-2 px-3 flex justify-between items-center">
                  <span className="text-gray-800 font-bold">{h.date}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${h.status === 'PRESENT'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                      }`}
                  >
                    {h.status === 'PRESENT' ? 'WORKED (PRESENT)' : 'ABSENT'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
