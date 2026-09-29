import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/formatters';

export default function OrderStatus({ session, onBackToMenu, onRefresh }) {
  const [callingService, setCallingService] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(() => {
    if (session?.bellLockSecondsRemaining && session.bellLockSecondsRemaining > 0) {
      return session.bellLockSecondsRemaining;
    }
    if (session?.table_id) {
      const saved = localStorage.getItem(`kk_bell_lock_table_${session.table_id}`);
      if (saved) {
        const lockUntil = parseInt(saved, 10);
        const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
        if (remaining > 0) return Math.min(60, remaining);
        localStorage.removeItem(`kk_bell_lock_table_${session.table_id}`);
      }
    }
    return 0;
  });
  const [callSuccessMessage, setCallSuccessMessage] = useState('');
  const [callError, setCallError] = useState('');

  // Sync with server-side lock when session updates
  useEffect(() => {
    if (session?.bellLockSecondsRemaining !== undefined) {
      if (session.bellLockSecondsRemaining > 0) {
        setCooldownRemaining(session.bellLockSecondsRemaining);
        if (session.table_id) {
          localStorage.setItem(
            `kk_bell_lock_table_${session.table_id}`,
            (Date.now() + session.bellLockSecondsRemaining * 1000).toString()
          );
        }
      }
    }
  }, [session?.bellLockSecondsRemaining, session?.table_id]);

  // 60-Second Cooldown Timer
  useEffect(() => {
    let timer;
    if (cooldownRemaining > 0) {
      timer = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) {
            if (session?.table_id) {
              localStorage.removeItem(`kk_bell_lock_table_${session.table_id}`);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldownRemaining, session?.table_id]);

  const handleCallWaiter = async () => {
    if (cooldownRemaining > 0 || callingService) return;

    try {
      setCallingService(true);
      setCallError('');
      setCallSuccessMessage('');

      // Instantly apply 60-second lock client-side
      setCooldownRemaining(60);
      if (session?.table_id) {
        localStorage.setItem(`kk_bell_lock_table_${session.table_id}`, (Date.now() + 60000).toString());
      }

      const res = await api.requestService(session.table_id);
      setCallSuccessMessage('Waiter has been notified to attend your table!');
      setCooldownRemaining(res.cooldownRemaining || 60);
      if (onRefresh) onRefresh();
    } catch (err) {
      setCallError(err.message || 'Could not call waiter at this moment.');
      if (err.cooldownRemaining) {
        setCooldownRemaining(err.cooldownRemaining);
        if (session?.table_id) {
          localStorage.setItem(
            `kk_bell_lock_table_${session.table_id}`,
            (Date.now() + err.cooldownRemaining * 1000).toString()
          );
        }
      }
    } finally {
      setCallingService(false);
    }
  };

  const orders = session?.orders || [];
  const hasConfirmedOrder = orders.some((o) => o.status === 'CONFIRMED' || o.status === 'SERVED');
  const waiterName = session?.waiter_name || 'Assigned Staff';

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-28">
      {/* Table Session Banner */}
      <div className="bg-primary text-on-primary rounded-3xl p-5 shadow-lg border border-primary-container relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary-container font-mono">
              ACTIVE SESSION • {session.session_code}
            </span>
            <h2 className="text-2xl font-black text-white mt-1">Table #{session.table_number}</h2>
            <p className="text-xs text-gray-300 mt-0.5">Family / Group: {session.customer_name || 'Guest'}</p>
          </div>

          <span className="px-3 py-1 bg-secondary-container text-on-secondary-container text-xs font-black rounded-full shadow-xs">
            {session.status}
          </span>
        </div>

        {/* ASSIGNED WAITER + SERVICE BELL SECTION */}
        <div className="mt-5 pt-4 border-t border-white/15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-black text-sm shadow-md">
              <span className="material-symbols-outlined text-[24px]">person</span>
            </div>
            <div>
              <p className="text-[10px] text-gray-300 uppercase tracking-wider font-semibold">Assigned Waiter</p>
              <p className="font-extrabold text-base text-white tracking-wide">{waiterName}</p>
            </div>
          </div>

          {/* BELL ICON FOR SERVICE REQUEST (60-second Bell Icon Lock) */}
          <div className="flex flex-col items-end">
            <button
              type="button"
              onClick={handleCallWaiter}
              disabled={cooldownRemaining > 0 || callingService}
              title={cooldownRemaining > 0 ? `Bell locked (${cooldownRemaining}s remaining)` : "Call Waiter to Table"}
              className={`p-3 min-w-[54px] min-h-[54px] rounded-2xl flex items-center justify-center transition-all shadow-md active:scale-95 select-none ${
                cooldownRemaining > 0
                  ? 'bg-gray-800 text-amber-300 cursor-not-allowed border border-gray-700'
                  : 'bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed animate-pulse-gold cursor-pointer'
              }`}
            >
              {callingService ? (
                <span className="material-symbols-outlined text-[24px] animate-spin">progress_activity</span>
              ) : cooldownRemaining > 0 ? (
                <div className="flex flex-col items-center justify-center leading-none">
                  <span className="material-symbols-outlined text-[18px] text-gray-400">notifications_paused</span>
                  <span className="text-[11px] font-mono font-black text-amber-300 tracking-tight mt-0.5">
                    {cooldownRemaining}s
                  </span>
                </div>
              ) : (
                <span className="material-symbols-outlined text-[26px] animate-bell">
                  notifications_active
                </span>
              )}
            </button>
            {cooldownRemaining > 0 ? (
              <span className="text-[10px] text-secondary-container font-mono font-bold mt-1">
                Wait {cooldownRemaining}s
              </span>
            ) : (
              <span className="text-[10px] text-gray-300 font-bold mt-1">Call Waiter</span>
            )}
          </div>
        </div>

        {/* Feedback alert messages */}
        {callSuccessMessage && (
          <div className="mt-3 p-2.5 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-400">check_circle</span>
            <span>{callSuccessMessage}</span>
          </div>
        )}
        {callError && (
          <div className="mt-3 p-2.5 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-200 text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-rose-400">error</span>
            <span>{callError}</span>
          </div>
        )}
      </div>

      {/* Orders Progress Timeline */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="font-extrabold text-sm text-gray-900 tracking-tight flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[18px]">receipt_long</span>
            Table Orders History ({orders.length})
          </h3>
          <button
            onClick={onBackToMenu}
            className="text-xs font-bold text-secondary hover:text-on-secondary-container flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            Add More Dishes
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-200 shadow-sm">
            <span className="material-symbols-outlined text-[44px] text-gray-300">room_service</span>
            <p className="text-xs text-gray-500 mt-2">No orders placed in this session yet.</p>
            <button
              onClick={onBackToMenu}
              className="mt-3 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl"
            >
              Browse Menu
            </button>
          </div>
        ) : (
          orders.map((order, idx) => {
            const isReceived = order.status === 'RECEIVED' || order.status === 'PENDING';
            const isReadyToCook = order.status === 'READY_TO_COOK';
            const isCooking = order.status === 'COOKING';
            const isReadyToServe = order.status === 'READY_TO_SERVE';
            const isServed = order.status === 'SERVED';

            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl p-4 border shadow-sm transition-all ${
                  isReadyToServe
                    ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-300'
                    : isCooking
                    ? 'border-orange-300 bg-orange-50/20'
                    : isReadyToCook
                    ? 'border-indigo-300 bg-indigo-50/20'
                    : isReceived
                    ? 'border-blue-300 bg-blue-50/20'
                    : 'border-emerald-300 bg-emerald-50/20'
                }`}
              >
                {/* Ready to Serve Notification Banner */}
                {isReadyToServe && (
                  <div className="mb-3 p-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-black rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm animate-pulse">
                    <span className="material-symbols-outlined text-[20px]">room_service</span>
                    <span>Your order is ready to serve! Our waiter is bringing it to your table.</span>
                  </div>
                )}

                {/* Order Card Header */}
                <div className="flex justify-between items-center pb-2.5 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-gray-900">
                        Order #{orders.length - idx} • {order.placed_by_name || 'Table Guest'}
                      </span>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {formatTime(order.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Status Badges */}
                  {isReceived && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                      Order Received
                    </span>
                  )}
                  {isReadyToCook && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                      <span className="material-symbols-outlined text-[14px]">soup_kitchen</span>
                      Ready to Cook
                    </span>
                  )}
                  {isCooking && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                      <span className="material-symbols-outlined text-[14px] animate-spin">skillet</span>
                      Cooking in Kitchen
                    </span>
                  )}
                  {isReadyToServe && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-200 text-amber-950 border border-amber-400 font-black">
                      <span className="material-symbols-outlined text-[14px]">dinner_dining</span>
                      Ready to Serve!
                    </span>
                  )}
                  {isServed && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="material-symbols-outlined text-[14px]">done_all</span>
                      Served to Table
                    </span>
                  )}
                </div>

                {/* Progress Mini Step Tracker */}
                <div className="py-2 px-1">
                  <div className="flex items-center justify-between text-[9px] font-bold text-gray-500 mb-1">
                    <span className={isReceived || isReadyToCook || isCooking || isReadyToServe || isServed ? 'text-primary' : ''}>Received</span>
                    <span className={isReadyToCook || isCooking || isReadyToServe || isServed ? 'text-primary' : ''}>Queued</span>
                    <span className={isCooking || isReadyToServe || isServed ? 'text-orange-600' : ''}>Cooking</span>
                    <span className={isReadyToServe || isServed ? 'text-amber-700' : ''}>Ready</span>
                    <span className={isServed ? 'text-emerald-700' : ''}>Served</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden flex">
                    <div className={`h-full transition-all duration-500 ${
                      isServed
                        ? 'w-full bg-emerald-500'
                        : isReadyToServe
                        ? 'w-4/5 bg-amber-500'
                        : isCooking
                        ? 'w-3/5 bg-orange-500'
                        : isReadyToCook
                        ? 'w-2/5 bg-indigo-500'
                        : 'w-1/5 bg-blue-500'
                    }`} />
                  </div>
                </div>

                {/* Items in this Order */}
                <div className="py-2 space-y-1.5 divide-y divide-gray-50">
                  {order.items?.map((it, itemIdx) => (
                    <div key={itemIdx} className="flex justify-between items-center pt-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-surface-container-high text-gray-700 font-bold flex items-center justify-center text-[10px]">
                          {it.quantity}x
                        </span>
                        <span className="font-medium text-gray-800">{it.item_name}</span>
                        {it.send_to_kitchen === 0 ? (
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono font-medium">
                            Direct Serve
                          </span>
                        ) : null}
                        {it.is_manual ? (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-mono font-bold">
                            Off-App
                          </span>
                        ) : null}
                      </div>
                      <span className="font-bold text-gray-900">₹{it.subtotal}</span>
                    </div>
                  ))}
                </div>

                {/* Subtotal of this order */}
                <div className="pt-2 border-t border-gray-100 flex justify-between items-center text-xs font-bold text-gray-600">
                  <span>Order Total</span>
                  <span className="text-sm font-extrabold text-primary">₹{order.total_amount}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Grand Session Bill Summary */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-2.5">
        <div className="flex justify-between items-center text-xs text-gray-600">
          <span>Table Session Subtotal</span>
          <span className="font-bold">₹{session.subtotal}</span>
        </div>

        {session.discount_type !== 'NONE' && (
          <div className="flex justify-between items-center text-xs text-emerald-700 font-bold">
            <span>
              Discount ({session.discount_type === 'PERCENTAGE' ? `${session.discount_value}%` : `₹${session.discount_value}`})
            </span>
            <span>Applied by Manager</span>
          </div>
        )}

        <div className="flex justify-between items-center text-sm font-extrabold text-gray-900 border-t border-gray-100 pt-2.5">
          <span>Final Table Bill</span>
          <span className="text-lg text-primary">₹{session.final_total}</span>
        </div>

        <p className="text-[11px] text-gray-400 text-center pt-2">
          Note: Payment is accepted at the billing counter. The session remains active until Manager confirms payment.
        </p>
      </div>
    </div>
  );
}
