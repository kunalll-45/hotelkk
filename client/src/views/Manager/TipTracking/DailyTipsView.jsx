import React, { useEffect, useState } from 'react';
import { api } from '../../../utils/api';

export default function DailyTipsView() {
  const [waiterTips, setWaiterTips] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedWaiterId, setSelectedWaiterId] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [tipNotes, setTipNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [allTips, staff] = await Promise.all([
        api.getAllWaitersDailyTips(),
        api.getStaff()
      ]);
      setWaiterTips(allTips);
      const waiters = staff.filter((s) => s.role === 'Waiter' && s.is_active);
      setStaffList(waiters);
      if (waiters.length > 0 && !selectedWaiterId) {
        setSelectedWaiterId(waiters[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecordTip = async (e) => {
    e.preventDefault();
    if (!selectedWaiterId || !tipAmount) return;

    try {
      setSaving(true);
      setError('');
      setMessage('');

      await api.recordTip({
        waiterId: parseInt(selectedWaiterId),
        amount: parseFloat(tipAmount),
        notes: tipNotes || 'Counter tip given to Manager',
        recordedBy: 'Manager'
      });

      setMessage('Tip recorded successfully in today\'s ledger!');
      setTipAmount('');
      setTipNotes('');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to record tip');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-16">
      {/* Header Bar */}
      <div className="bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[24px]">payments</span>
          <h3 className="text-base font-black text-gray-900 tracking-tight">
            Daily Waiter Tip Tracking
          </h3>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Record customer tips received at the manager counter. System maintains Today's and Previous Day's totals.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Record Tip Form Card (4 Cols on large screen) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-surface-container-high shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[20px]">add_card</span>
            <h4 className="font-extrabold text-sm text-gray-900">Record Tip for Waiter</h4>
          </div>

          {message && (
            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold">
              {message}
            </div>
          )}

          {error && (
            <div className="p-3 bg-error-container text-error rounded-xl text-xs font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleRecordTip} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-gray-700 uppercase mb-1">Select Waiter *</label>
              <select
                value={selectedWaiterId}
                onChange={(e) => setSelectedWaiterId(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface-container-low border border-gray-300 rounded-xl font-bold text-gray-900 focus:outline-none"
                required
              >
                {staffList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 uppercase mb-1">Tip Amount (₹) *</label>
              <input
                type="number"
                min="10"
                step="10"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="e.g. 100"
                className="w-full px-3 py-2.5 bg-surface-container-low border border-gray-300 rounded-xl font-mono font-bold text-gray-900 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 uppercase mb-1">Customer / Table Notes</label>
              <input
                type="text"
                value={tipNotes}
                onChange={(e) => setTipNotes(e.target.value)}
                placeholder="e.g. Table 4 Gupta Family Tip"
                className="w-full px-3 py-2.5 bg-surface-container-low border border-gray-300 rounded-xl focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-primary hover:bg-primary-container text-white font-extrabold rounded-xl shadow flex items-center justify-center gap-1.5 transition-transform active:scale-98 disabled:opacity-50"
            >
              {saving ? (
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
                  <span>Record Tip</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Daily Tip Totals Grid (8 Cols on large screen) */}
        <div className="lg:col-span-8 bg-white p-5 rounded-3xl border border-surface-container-high shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-extrabold text-sm text-gray-900 uppercase tracking-wider">
              Waiter Daily Totals Ledger
            </h4>
            <span className="text-xs text-gray-400 font-mono">Today vs Previous Day</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-gray-700 font-extrabold uppercase tracking-wider border-b border-surface-container-high">
                <tr>
                  <th className="py-3.5 px-4">Waiter</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4 text-center font-mono">Today's Tip Total</th>
                  <th className="py-3.5 px-4 text-center font-mono">Previous Day Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {waiterTips.map((w) => (
                  <tr key={w.waiterId} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-gray-900 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-primary text-secondary-container flex items-center justify-center font-black text-xs">
                        {w.name.charAt(0)}
                      </span>
                      {w.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-500">{w.phone || '-'}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-900 font-black font-mono rounded-full text-xs">
                        ₹{w.todayTotal}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-3 py-1 bg-surface-container-high text-gray-700 font-black font-mono rounded-full text-xs">
                        ₹{w.yesterdayTotal}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
