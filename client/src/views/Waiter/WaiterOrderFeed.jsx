import React, { useState } from 'react';
import { formatTime } from '../../utils/formatters';
import { soundManager } from '../../utils/soundEffects';
import OrderEditModal from '../../components/OrderEditModal';
import TablePaymentModal from '../../components/TablePaymentModal';

export default function WaiterOrderFeed({
  feedData,
  menuItems = [],
  waiterUser,
  onUpdateOrderStatus,
  onMarkServed,
  onResolveService,
  onRefreshFeed,
  loadingAction
}) {
  const { assignedTables = [], orders = [], serviceRequests = [] } = feedData || {};
  const [selectedTableFilter, setSelectedTableFilter] = useState(null);

  // Modals state
  const [editingOrder, setEditingOrder] = useState(null);
  const [payingSession, setPayingSession] = useState(null);
  const [payingTableNumber, setPayingTableNumber] = useState(null);

  const filteredOrders = selectedTableFilter
    ? orders.filter((o) => o.table_number === selectedTableFilter)
    : orders;

  // Active in-progress orders vs served history
  const activeOrders = filteredOrders.filter(
    (o) => o.status === 'RECEIVED' || o.status === 'PENDING' || o.status === 'READY_TO_COOK' || o.status === 'COOKING' || o.status === 'READY_TO_SERVE'
  );
  const servedOrders = filteredOrders.filter((o) => o.status === 'SERVED');

  // Selected table info if filtering
  const selectedTableObj = assignedTables.find((t) => t.table_number === selectedTableFilter);

  return (
    <div className="space-y-5 pb-20">
      {/* 1. Real-Time Customer Calling Alerts (Highest Urgency) */}
      {serviceRequests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-700 px-1">
            <span className="material-symbols-outlined text-[20px] animate-bell text-rose-600">
              notifications_active
            </span>
            Customer Service Calls ({serviceRequests.length})
          </div>

          <div className="space-y-2">
            {serviceRequests.map((req) => (
              <div
                key={req.id}
                className="bg-amber-500 text-black p-4 rounded-2xl shadow-lg flex items-center justify-between gap-3 border-2 border-amber-600 animate-pulse-gold"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-black text-secondary-container flex items-center justify-center font-black">
                    <span className="material-symbols-outlined text-[22px]">notifications_active</span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base leading-tight">
                      Table #{req.table_number} is calling!
                    </h4>
                    <p className="text-xs font-medium text-black/80">
                      Called at {formatTime(req.requested_at)} • Needs table assistance
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onResolveService(req.id)}
                  disabled={loadingAction === `service-${req.id}`}
                  className="px-4 py-2 bg-black hover:bg-black/90 text-white font-extrabold text-xs rounded-xl shadow transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  Attended
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Live Assigned Tables Overview */}
      <div className="bg-white p-4 rounded-3xl border border-surface-container-high shadow-xs space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider font-mono">
              DAILY MATRIX
            </span>
            <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
              Your Live Assigned Tables ({assignedTables.length})
            </h3>
          </div>

          {selectedTableFilter && (
            <button
              onClick={() => {
                soundManager.playPop();
                setSelectedTableFilter(null);
              }}
              className="text-[11px] text-primary font-bold hover:underline flex items-center gap-1"
            >
              <span>Show All Tables</span>
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          )}
        </div>

        {assignedTables.length === 0 ? (
          <div className="p-4 bg-surface-container-low rounded-2xl text-center text-xs text-gray-500 font-medium border border-dashed border-gray-300">
            No tables are assigned to you today. Manager will assign tables from the Manager Portal.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {assignedTables.map((t) => {
              const isCalling = serviceRequests.some((sr) => sr.table_number === t.table_number);
              const tableOrders = orders.filter((o) => o.table_number === t.table_number);
              const isSelected = selectedTableFilter === t.table_number;
              const isActive = !!(t.has_active_session || t.active_session_id || tableOrders.length > 0);

              return (
                <button
                  key={t.id}
                  onClick={() => {
                    soundManager.playPop();
                    setSelectedTableFilter(isSelected ? null : t.table_number);
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : isCalling
                      ? 'bg-rose-50 border-rose-400 text-rose-950 animate-pulse-gold'
                      : isActive
                      ? 'bg-gradient-to-br from-emerald-50 via-emerald-50/90 to-emerald-100/60 border-emerald-300 text-emerald-950 shadow-xs ring-1 ring-emerald-400/30'
                      : 'bg-surface-container-low border-surface-container-high text-gray-800 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-black font-mono ${
                        isSelected
                          ? 'text-secondary-container'
                          : isActive
                          ? 'text-emerald-800'
                          : 'text-primary'
                      }`}
                    >
                      #{t.table_number}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${
                        isSelected
                          ? 'text-gray-300'
                          : isActive
                          ? 'text-emerald-700/80'
                          : 'text-gray-400'
                      }`}
                    >
                      {t.capacity} Guests
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    {isCalling ? (
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
                        Calling!
                      </span>
                    ) : isActive ? (
                      <div className="flex flex-col">
                        <span
                          className={`text-[10px] font-bold ${
                            isSelected ? 'text-gray-200' : 'text-emerald-700'
                          } flex items-center gap-1`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          {tableOrders.length > 0 ? `${tableOrders.length} Orders` : 'Table Active'}
                        </span>
                        {t.active_customer_name && (
                          <span className="text-[9px] font-medium text-emerald-600 truncate max-w-[90px]">
                            {t.active_customer_name}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className={`text-[10px] ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                        Free
                      </span>
                    )}

                    <span
                      className={`material-symbols-outlined text-[16px] ${
                        isActive && !isSelected ? 'text-emerald-600' : 'opacity-60'
                      }`}
                    >
                      table_restaurant
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Action Bar for Filtered Table with Active Session */}
        {selectedTableObj && selectedTableObj.has_active_session && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex flex-wrap items-center justify-between gap-2 animate-fade-in">
            <div className="text-xs">
              <span className="font-extrabold text-emerald-950">
                Table #{selectedTableObj.table_number} Bill:
              </span>{' '}
              <span className="font-black font-mono text-emerald-700 text-sm">
                ₹{selectedTableObj.final_total || selectedTableObj.subtotal || 0}
              </span>
              <span className="text-gray-500 ml-1">
                ({selectedTableObj.active_customer_name || 'Guest'})
              </span>
            </div>

            <button
              onClick={() => {
                soundManager.playPop();
                setPayingSession({
                  id: selectedTableObj.active_session_id,
                  session_code: selectedTableObj.session_code,
                  table_number: selectedTableObj.table_number,
                  customer_name: selectedTableObj.active_customer_name,
                  final_total: selectedTableObj.final_total || selectedTableObj.subtotal || 0,
                  subtotal: selectedTableObj.subtotal || 0
                });
                setPayingTableNumber(selectedTableObj.table_number);
              }}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              <span>Collect Payment & Release</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Active Orders Section (No confirmation gate, direct kitchen progress) */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              Active Orders ({activeOrders.length})
            </h3>
            {selectedTableFilter && (
              <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold">
                Table #{selectedTableFilter}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400 font-medium">Digital Kitchen Bridge</span>
        </div>

        {activeOrders.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-gray-300 text-gray-400 text-xs">
            {selectedTableFilter
              ? `No active preparation orders for Table #${selectedTableFilter}.`
              : 'No active orders in progress right now.'}
          </div>
        ) : (
          activeOrders.map((order) => {
            const isReceived = order.status === 'RECEIVED' || order.status === 'PENDING';
            const isReadyToCook = order.status === 'READY_TO_COOK';
            const isCooking = order.status === 'COOKING';
            const isReadyToServe = order.status === 'READY_TO_SERVE';

            return (
              <div
                key={order.id}
                className={`bg-white rounded-3xl p-4 border-2 shadow-md space-y-3 transition-all ${
                  isReadyToServe
                    ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-300'
                    : isCooking
                    ? 'border-orange-400 bg-orange-50/20'
                    : isReadyToCook
                    ? 'border-indigo-300 bg-indigo-50/20'
                    : 'border-blue-300 bg-blue-50/20'
                }`}
              >
                {/* Order Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-primary text-secondary-container font-extrabold text-xs rounded-lg font-mono">
                        TABLE #{order.table_number}
                      </span>
                      <span className="font-bold text-xs text-gray-900">
                        {order.placed_by_name || 'Guest'}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        Order #{order.id}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                      Placed at {formatTime(order.created_at)} • Session {order.session_code}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-extrabold text-primary font-mono block">
                      ₹{order.total_amount}
                    </span>
                    {/* Status Badge */}
                    {isReceived && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        Order Received
                      </span>
                    )}
                    {isReadyToCook && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        In Kitchen Queue
                      </span>
                    )}
                    {isCooking && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                        Cooking in Kitchen
                      </span>
                    )}
                    {isReadyToServe && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-300 text-amber-950 border border-amber-400 animate-pulse">
                        Ready to Serve!
                      </span>
                    )}
                  </div>
                </div>

                {/* Items List */}
                <div className="bg-surface-container-low p-3 rounded-2xl space-y-1.5 text-xs divide-y divide-gray-100">
                  {order.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center pt-1 first:pt-0">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-white shadow-xs font-bold flex items-center justify-center text-[10px] text-gray-800 font-mono">
                          {it.quantity}x
                        </span>
                        <span className="font-semibold text-gray-900">{it.item_name}</span>
                        {it.send_to_kitchen === 0 ? (
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-medium">
                            Direct Serve
                          </span>
                        ) : null}
                        {it.is_manual ? (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-mono font-bold">
                            Off-App
                          </span>
                        ) : null}
                      </div>
                      <span className="font-mono text-gray-600">₹{it.subtotal}</span>
                    </div>
                  ))}
                </div>

                {/* Order Action Controls: Waiter Records Physical Kitchen Progress */}
                <div className="pt-1 flex flex-col gap-2">
                  {/* Status Progress Button */}
                  {isReceived && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'READY_TO_COOK')}
                        disabled={loadingAction === `order-${order.id}`}
                        className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">soup_kitchen</span>
                        <span>Queue for Kitchen</span>
                      </button>

                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'COOKING')}
                        disabled={loadingAction === `order-${order.id}`}
                        className="py-2.5 px-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">skillet</span>
                        <span>Start Cooking</span>
                      </button>
                    </div>
                  )}

                  {isReadyToCook && (
                    <button
                      onClick={() => onUpdateOrderStatus(order.id, 'COOKING')}
                      disabled={loadingAction === `order-${order.id}`}
                      className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-98 disabled:opacity-50 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">skillet</span>
                      <span>Mark Cooking in Kitchen (Removes from KDS)</span>
                    </button>
                  )}

                  {isCooking && (
                    <button
                      onClick={() => onUpdateOrderStatus(order.id, 'READY_TO_SERVE')}
                      disabled={loadingAction === `order-${order.id}`}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-black text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-98 disabled:opacity-50 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">dinner_dining</span>
                      <span>Cook Informed: Mark "Ready to Serve"</span>
                    </button>
                  )}

                  {isReadyToServe && (
                    <button
                      onClick={() => onMarkServed(order.id)}
                      disabled={loadingAction === `order-${order.id}`}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow flex items-center justify-center gap-2 transition-transform active:scale-98 disabled:opacity-50 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">room_service</span>
                      <span>Food Delivered: Mark as Served to Table</span>
                    </button>
                  )}

                  {/* Edit Order & Settle Table Secondary Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setEditingOrder(order)}
                      className="px-3 py-1.5 text-gray-600 hover:text-gray-900 font-bold text-[11px] rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">edit</span>
                      <span>Edit Order / Add Dishes</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playPop();
                        const tableSession = assignedTables.find((t) => t.table_number === order.table_number);
                        setPayingSession({
                          id: order.session_id,
                          session_code: order.session_code,
                          table_number: order.table_number,
                          customer_name: order.placed_by_name,
                          final_total: tableSession?.final_total || tableSession?.subtotal || order.total_amount,
                          subtotal: tableSession?.subtotal || order.total_amount
                        });
                        setPayingTableNumber(order.table_number);
                      }}
                      className="px-3 py-1.5 text-emerald-700 hover:text-emerald-900 font-bold text-[11px] rounded-lg hover:bg-emerald-50 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">payments</span>
                      <span>Collect Bill</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Recently Served Orders (Permanent History) */}
      {servedOrders.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-extrabold text-sm text-gray-500 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              Served Orders ({servedOrders.length})
            </h3>
            <span className="text-xs text-gray-400 font-medium">Delivered to Table</span>
          </div>

          <div className="space-y-2">
            {servedOrders.map((order) => (
              <div
                key={order.id}
                className="bg-surface-container-low rounded-2xl p-3.5 border border-surface-container-high flex justify-between items-center text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold text-[11px] rounded-md font-mono">
                    #{order.table_number}
                  </span>
                  <div>
                    <span className="font-bold text-gray-800">
                      {order.placed_by_name || 'Guest'} ({order.items?.length || 0} items)
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono block">
                      Served at {formatTime(order.served_at || order.created_at)}
                    </span>
                  </div>
                </div>
                <span className="font-mono font-bold text-gray-700">₹{order.total_amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Editing Modal */}
      {editingOrder && (
        <OrderEditModal
          isOpen={!!editingOrder}
          onClose={() => setEditingOrder(null)}
          order={editingOrder}
          menuItems={menuItems}
          staffName={waiterUser?.name || 'Waiter'}
          onUpdated={() => {
            if (onRefreshFeed) onRefreshFeed();
            setEditingOrder(null);
          }}
        />
      )}

      {/* Waiter Table Payment Modal */}
      {payingSession && (
        <TablePaymentModal
          isOpen={!!payingSession}
          onClose={() => {
            setPayingSession(null);
            setPayingTableNumber(null);
          }}
          session={payingSession}
          tableNumber={payingTableNumber}
          collectorRole="WAITER"
          collectorUser={waiterUser}
          onPaymentSuccess={() => {
            if (onRefreshFeed) onRefreshFeed();
            setSelectedTableFilter(null);
          }}
        />
      )}
    </div>
  );
}
