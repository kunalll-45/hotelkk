import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { soundManager } from '../utils/soundEffects';

export default function TablePaymentModal({
  isOpen,
  onClose,
  session,
  tableNumber,
  collectorRole = 'WAITER', // 'WAITER' | 'MANAGER'
  collectorUser,
  staffList = [],
  onPaymentSuccess,
  onOpenBillModal
}) {
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState(collectorUser?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [completedData, setCompletedData] = useState(null);

  const yesBtnRef = useRef(null);

  // Determine collector identity
  const currentStaffObj = staffList.find((s) => s.id === parseInt(selectedStaffId)) || collectorUser;
  const collectorId = currentStaffObj?.id || collectorUser?.id || null;
  const collectorName = currentStaffObj?.name || collectorUser?.name || collectorUser?.fullName || 'Staff Member';

  const totalAmount = session?.final_total || session?.subtotal || 0;
  const isCash = paymentMethod === 'Cash';

  const handleModalClose = () => {
    setPaymentCompleted(false);
    setCompletedData(null);
    setError('');
    onClose();
  };

  const handlePrintYes = () => {
    soundManager.playPop();
    const sid = completedData?.sessionId;
    handleModalClose();
    if (onOpenBillModal && sid) {
      onOpenBillModal(sid);
    }
  };

  const handlePrintNo = () => {
    soundManager.playPop();
    handleModalClose();
  };

  // Keyboard shortcut listener after payment is completed: Enter = Yes (Print), Esc = No (Skip)
  useEffect(() => {
    if (!paymentCompleted) return;

    const focusTimer = setTimeout(() => {
      yesBtnRef.current?.focus();
    }, 120);

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handlePrintYes();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handlePrintNo();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [paymentCompleted, completedData]);

  if (!isOpen || !session) return null;

  const handleConfirm = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      soundManager.playPop();

      await api.confirmPayment(session.id, {
        paymentMethod,
        collectorRole,
        collectorId,
        collectorName,
        transactionRef: !isCash ? transactionRef : undefined,
        managerName: collectorRole === 'MANAGER' ? collectorName : undefined
      });

      soundManager.playPaymentSuccess();
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }

      // If onOpenBillModal is available (e.g. Manager), prompt "Yes/No" with Enter shortcut
      if (onOpenBillModal) {
        setCompletedData({
          sessionId: session.id,
          tableNumber: tableNumber || session.table_number,
          finalTotal: totalAmount,
          paymentMethod
        });
        setPaymentCompleted(true);
      } else {
        handleModalClose();
      }
    } catch (err) {
      soundManager.playError();
      setError(err.message || 'Payment confirmation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200 flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
              paymentCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              <span className="material-symbols-outlined text-[24px]">
                {paymentCompleted ? 'check_circle' : 'payments'}
              </span>
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 tracking-tight">
                {paymentCompleted
                  ? `Payment Received • Table #${completedData?.tableNumber || session.table_number}`
                  : `Table #${tableNumber || session.table_number} Bill Settlement`}
              </h3>
              <p className="text-xs text-gray-400 font-mono">
                {paymentCompleted
                  ? `Status: Settled & Released`
                  : `Session Code: ${session.session_code || `#${session.id}`}`}
              </p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
            title="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* POST-PAYMENT PROMPT: PRINT BILL YES / NO */}
        {paymentCompleted && completedData ? (
          <div className="py-2 flex flex-col items-center text-center space-y-4 animate-fade-in">
            {/* Animated Checkmark Circle */}
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[38px]">receipt_long</span>
            </div>

            <div>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                Payment Received Successfully
              </span>
              <h3 className="text-xl font-black text-gray-900 tracking-tight mt-2">
                Table #{completedData.tableNumber} Bill Paid
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Total: <span className="font-mono font-black text-emerald-700">₹{completedData.finalTotal}</span> • Mode: <span className="font-bold text-gray-800">{completedData.paymentMethod}</span>
              </p>
            </div>

            {/* Prompt Question Card */}
            <div className="w-full bg-surface-container-low p-4 rounded-2xl border border-surface-container-high space-y-1 text-center">
              <p className="text-sm font-black text-gray-900">
                Do you want to print the bill?
              </p>
              <p className="text-xs text-gray-500">
                Press <kbd className="px-2 py-0.5 bg-white border border-gray-300 rounded font-mono font-bold text-gray-800 text-[11px] shadow-2xs">Enter ↵</kbd> to print, or <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono font-bold text-gray-800 text-[10px] shadow-2xs">Esc</kbd> to skip.
              </p>
            </div>

            {/* Action Buttons: Yes / No with Keyboard Shortcut Badges */}
            <div className="w-full flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handlePrintNo}
                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs rounded-2xl border border-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <span>No (Skip)</span>
                <kbd className="px-1.5 py-0.5 bg-white text-gray-400 rounded font-mono text-[9px] border border-gray-200">Esc</kbd>
              </button>

              <button
                type="button"
                ref={yesBtnRef}
                onClick={handlePrintYes}
                className="flex-1 py-3.5 px-4 bg-primary hover:bg-primary-container text-white font-black text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 ring-2 ring-primary/40 ring-offset-2 cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                <span>Yes, Print Bill</span>
                <kbd className="px-2 py-0.5 bg-black/20 text-white rounded font-mono text-[10px] font-bold">Enter ↵</kbd>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Error Alert */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-rose-600">error</span>
                <span>{error}</span>
              </div>
            )}

            {/* Bill Summary Card */}
            <div className="bg-surface-container-low p-4 rounded-2xl border border-surface-container-high space-y-1.5">
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Customer / Group</span>
                <span className="font-bold text-gray-800">{session.customer_name || 'Table Guest'}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Subtotal</span>
                <span className="font-mono font-bold">₹{session.subtotal || totalAmount}</span>
              </div>
              {session.discount_value > 0 && (
                <div className="flex justify-between items-center text-xs text-emerald-700 font-bold">
                  <span>Discount</span>
                  <span>-₹{session.discount_amount || session.discount_value}</span>
                </div>
              )}
              <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="font-black text-sm text-gray-900">Final Bill Total</span>
                <span className="text-xl font-black font-mono text-emerald-600">
                  ₹{totalAmount}
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleConfirm} className="space-y-4 text-xs">
              {/* Payment Method Selector */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'UPI', 'Card', 'Net Banking'].map((method) => (
                    <button
                      type="button"
                      key={method}
                      onClick={() => {
                        soundManager.playPop();
                        setPaymentMethod(method);
                      }}
                      className={`py-2.5 px-3 rounded-xl font-bold border transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        paymentMethod === method
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {method === 'Cash'
                          ? 'attach_money'
                          : method === 'UPI'
                          ? 'qr_code_scanner'
                          : method === 'Card'
                          ? 'credit_card'
                          : 'account_balance'}
                      </span>
                      <span className="text-[11px] leading-none">{method}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash vs Digital Explanation Box */}
              {isCash ? (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                    <span>Physical Cash Collection</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    ₹{totalAmount} will be recorded as <strong>Pending Cash</strong> for {collectorName} until settled to the hotel register.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <span className="material-symbols-outlined text-[16px]">verified_user</span>
                    <span>Official Hotel Digital Account</span>
                  </div>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Payment is credited directly to hotel account. Does NOT count as pending cash.
                  </p>
                  <input
                    type="text"
                    placeholder="Transaction / UTR / Auth Reference (Optional)"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full mt-2 px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Collector Attribution (When Manager is viewing, can choose which staff member collected) */}
              {collectorRole === 'MANAGER' && staffList.length > 0 && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 mb-1">
                    Cash / Payment Received By
                  </label>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none"
                  >
                    <option value={collectorUser?.id || ''}>
                      Manager ({collectorUser?.fullName || collectorUser?.name || 'Counter'})
                    </option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        Waiter: {s.name} ({s.staff_role || 'Staff'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action Button: Valid payment required to release table! */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span className="material-symbols-outlined text-[20px] animate-spin">
                      progress_activity
                    </span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">check_circle</span>
                      <span>Confirm Payment & Release Table</span>
                    </>
                  )}
                </button>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                  Closes bill & session • Releases table to Available • Logs to Live Events
                </p>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
