import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { formatTime, formatDateTime } from '../utils/formatters';
import { soundManager } from '../utils/soundEffects';

export default function PendingCashLedgerModal({ isOpen, onClose, managerName = 'Manager' }) {
  const [cashSummary, setCashSummary] = useState({ totalPendingCash: 0, byStaff: [], records: [] });
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadPendingCash = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getPendingCash();
      setCashSummary(data);
    } catch (err) {
      setError(err.message || 'Failed to load cash ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPendingCash();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSettleRecord = async (record) => {
    if (!window.confirm(`Settle ₹${record.amount} collected by ${record.collected_by_name || 'Staff'} to the central hotel register?`)) {
      return;
    }
    try {
      soundManager.playPop();
      setSettlingId(`rec-${record.id}`);
      setError('');
      setSuccessMsg('');
      await api.settleCash({
        paymentId: record.id,
        staffRole: record.collected_by_role,
        staffId: record.collected_by_id,
        managerName
      });
      soundManager.playPaymentSuccess();
      setSuccessMsg(`₹${record.amount} settled to register successfully.`);
      await loadPendingCash();
    } catch (err) {
      setError(err.message || 'Failed to settle cash.');
    } finally {
      setSettlingId(null);
    }
  };

  const handleSettleAllForStaff = async (staffGroup) => {
    if (!window.confirm(`Settle all pending cash (₹${staffGroup.totalPending}) for ${staffGroup.staffName}?`)) {
      return;
    }
    try {
      soundManager.playPop();
      setSettlingId(`staff-${staffGroup.staffId}`);
      setError('');
      setSuccessMsg('');
      await api.settleCash({
        staffRole: staffGroup.staffRole,
        staffId: staffGroup.staffId,
        managerName
      });
      soundManager.playPaymentSuccess();
      setSuccessMsg(`All pending cash for ${staffGroup.staffName} settled.`);
      await loadPendingCash();
    } catch (err) {
      setError(err.message || 'Failed to settle staff cash.');
    } finally {
      setSettlingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-black">
              <span className="material-symbols-outlined text-[28px]">payments</span>
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-gray-900 tracking-tight">
                Staff Pending Cash Ledger
              </h3>
              <p className="text-xs text-gray-500">
                Track and settle physical cash received by Waiters & Managers
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Total Outstanding Banner */}
        <div className="mt-4 p-4 bg-gradient-to-r from-amber-500 to-amber-600 text-black rounded-2xl flex items-center justify-between shadow-md shrink-0">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-black/70">
              Total Outstanding Staff Cash
            </span>
            <h2 className="text-2xl font-black font-mono mt-0.5">
              ₹{cashSummary.totalPendingCash || 0}
            </h2>
          </div>
          <button
            onClick={loadPendingCash}
            className="p-2 bg-black/15 hover:bg-black/25 text-black rounded-xl transition-colors cursor-pointer"
            title="Refresh Ledger"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[18px] text-rose-600">error</span>
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Tabs / Lists */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {loading ? (
            <div className="py-12 text-center text-gray-400">
              <span className="material-symbols-outlined text-[32px] animate-spin text-amber-500">
                progress_activity
              </span>
              <p className="text-xs font-medium mt-2">Loading cash records...</p>
            </div>
          ) : (
            <>
              {/* Summary By Staff Member */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
                  Outstanding Cash by Staff Member ({cashSummary.byStaff?.length || 0})
                </h4>

                {cashSummary.byStaff?.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-2xl text-center text-xs text-gray-400">
                    No pending cash held by any staff member right now.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {cashSummary.byStaff.map((st) => (
                      <div
                        key={`${st.staffRole}-${st.staffId}`}
                        className="p-3 bg-surface-container-low border border-surface-container-high rounded-2xl flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900">
                              {st.staffName}
                            </span>
                            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-[10px] font-mono font-bold rounded">
                              {st.staffRole}
                            </span>
                          </div>
                          <p className="text-xs font-mono font-black text-amber-700 mt-1">
                            Pending: ₹{st.totalPending} ({st.unsettledCount} bills)
                          </p>
                        </div>

                        <button
                          onClick={() => handleSettleAllForStaff(st)}
                          disabled={settlingId === `staff-${st.staffId}`}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                        >
                          {settlingId === `staff-${st.staffId}` ? 'Settling...' : 'Settle All'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detailed Individual Cash Collection Logs */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
                  Cash Collection Records & Audit History ({cashSummary.records?.length || 0})
                </h4>

                {cashSummary.records?.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-2xl text-center text-xs text-gray-400">
                    No cash payment transactions recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cashSummary.records.map((rec) => {
                      const isPending = rec.is_pending_cash === 1;

                      return (
                        <div
                          key={rec.id}
                          className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-3 transition-colors ${
                            isPending
                              ? 'bg-amber-50/70 border-amber-300'
                              : 'bg-white border-gray-200 opacity-80'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-gray-900 font-mono">
                                Table #{rec.table_number || rec.table_id}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="font-semibold text-gray-800 truncate">
                                Collected by: {rec.collected_by_name || 'Staff'} ({rec.collected_by_role})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 font-mono">
                              <span>Bill #{rec.session_id}</span>
                              <span>•</span>
                              <span>{formatDateTime(rec.payment_time)}</span>
                              {rec.cash_settled_at && (
                                <span className="text-emerald-700 font-bold">
                                  • Settled at {formatTime(rec.cash_settled_at)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex items-center gap-3">
                            <div>
                              <span className="font-black text-sm font-mono text-gray-900 block">
                                ₹{rec.amount}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                                  isPending
                                    ? 'bg-amber-200 text-amber-900'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isPending ? 'Pending Handover' : 'Settled to Register'}
                              </span>
                            </div>

                            {isPending && (
                              <button
                                onClick={() => handleSettleRecord(rec)}
                                disabled={settlingId === `rec-${rec.id}`}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                              >
                                {settlingId === `rec-${rec.id}` ? '...' : 'Settle'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-gray-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 text-white font-bold text-xs rounded-xl hover:bg-black transition-colors cursor-pointer"
          >
            Close Ledger
          </button>
        </div>
      </div>
    </div>
  );
}
