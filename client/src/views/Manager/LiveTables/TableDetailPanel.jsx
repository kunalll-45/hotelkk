import React, { useState } from 'react';
import { api } from '../../../utils/api';
import { formatCurrency, formatTime } from '../../../utils/formatters';
import OrderEditModal from '../../../components/OrderEditModal';
import TablePaymentModal from '../../../components/TablePaymentModal';

export default function TableDetailPanel({
  selectedTable,
  menuItems,
  staffList = [],
  onRefresh,
  onOpenBillModal,
  onOpenQRModal
}) {
  const [foodIdInput, setFoodIdInput] = useState('');
  const [foodQtyInput, setFoodQtyInput] = useState(1);
  const [selectedFoodPreview, setSelectedFoodPreview] = useState(null);
  const [addingItem, setAddingItem] = useState(false);

  const [discountType, setDiscountType] = useState('NONE');
  const [discountValue, setDiscountValue] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  const [editingOrder, setEditingOrder] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [actionError, setActionError] = useState('');

  if (!selectedTable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
        <span className="material-symbols-outlined text-[48px] text-gray-300">touch_app</span>
        <h4 className="font-extrabold text-base text-gray-700 mt-3">Select a Table</h4>
        <p className="text-xs text-gray-400 mt-1">Click on any table number on the right to view complete live details and billing controls.</p>
      </div>
    );
  }

  const session = selectedTable.activeSession;
  const isOccupied = !!session;

  // Handle Food ID typing preview
  const handleFoodIdChange = (val) => {
    setFoodIdInput(val);
    setActionError('');
    const idNum = parseInt(val);
    if (!isNaN(idNum)) {
      const found = menuItems.find((m) => m.id === idNum);
      setSelectedFoodPreview(found || null);
    } else {
      setSelectedFoodPreview(null);
    }
  };

  // Quick Manual Item Add
  const handleAddManualItem = async (e) => {
    e.preventDefault();
    if (!foodIdInput) return;

    try {
      setAddingItem(true);
      setActionError('');
      await api.addManualItem(selectedTable.id, {
        foodItemId: parseInt(foodIdInput),
        quantity: parseInt(foodQtyInput) || 1,
        managerName: 'Manager'
      });
      setFoodIdInput('');
      setFoodQtyInput(1);
      setSelectedFoodPreview(null);
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to add manual item');
    } finally {
      setAddingItem(false);
    }
  };

  // Remove Item
  const handleRemoveItem = async (orderItemId) => {
    if (!window.confirm('Remove this item from the active table session?')) return;
    try {
      setActionError('');
      await api.removeOrderItem(orderItemId);
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to remove item');
    }
  };

  // Apply Discount / Offer Code (Backend validated)
  const handleApplyDiscount = async (e) => {
    e.preventDefault();
    if (!session) return;

    try {
      setApplyingDiscount(true);
      setActionError('');
      if (discountType === 'PROMO_CODE') {
        await api.applyDiscount(session.id, {
          offerCode: promoCodeInput.trim()
        });
      } else {
        await api.applyDiscount(session.id, {
          discountType,
          discountValue: parseFloat(discountValue) || 0
        });
      }
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to apply discount/offer');
    } finally {
      setApplyingDiscount(false);
    }
  };

  // Update Order Status (RECEIVED -> READY_TO_COOK -> COOKING -> READY_TO_SERVE -> SERVED)
  const handleStatusTransition = async (orderId, nextStatus) => {
    try {
      setStatusUpdatingId(orderId);
      setActionError('');
      await api.updateOrderStatus(orderId, nextStatus, 'Manager');
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to update order status');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 md:p-6 space-y-5 bg-white rounded-3xl border border-surface-container-high shadow-sm">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              Table #{selectedTable.table_number}
            </h2>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${selectedTable.computedStatus === 'CALLING_WAITER'
                  ? 'bg-amber-500 text-black animate-pulse'
                  : selectedTable.computedStatus === 'PENDING_ORDER'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : isOccupied
                      ? 'bg-blue-100 text-blue-900 border border-blue-300'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}
            >
              {selectedTable.computedStatus === 'CALLING_WAITER'
                ? 'Calling Waiter'
                : selectedTable.computedStatus === 'PENDING_ORDER'
                  ? 'Pending Order'
                  : isOccupied
                    ? 'Active Session'
                    : 'Vacant Table'}
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-1">
            Capacity: {selectedTable.capacity} Guests • Assigned Waiter:{' '}
            <span className="font-bold text-gray-900">
              {selectedTable.assigned_waiter_name || 'None Assigned'}
            </span>
          </p>
        </div>

        {/* QR Code Action Button */}
        <button
          onClick={() => onOpenQRModal(selectedTable.table_number)}
          className="px-3.5 py-2 bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-extrabold rounded-xl border border-surface-container-highest flex items-center gap-1.5 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
          View Permanent QR
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-error-container text-error rounded-xl text-xs font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{actionError}</span>
        </div>
      )}

      {/* If Table is VACANT */}
      {!isOccupied ? (
        <div className="bg-surface-container-low rounded-2xl p-8 text-center border border-surface-container-high space-y-3">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm text-emerald-600">
            <span className="material-symbols-outlined text-[32px]">table_restaurant</span>
          </div>
          <h4 className="font-extrabold text-base text-gray-800">Table #{selectedTable.table_number} is Vacant</h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
            Ready for new guests. When a customer sits and scans the permanent QR code, a new session will open automatically.
          </p>
          <div className="pt-2">
            <button
              onClick={() => onOpenQRModal(selectedTable.table_number)}
              className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-xs"
            >
              Show Table QR Code
            </button>
          </div>
        </div>
      ) : (
        /* If Table is OCCUPIED / ACTIVE SESSION */
        <div className="space-y-5">
          {/* Active Session Info Box */}
          <div className="bg-primary text-white p-4 rounded-2xl shadow-sm space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-secondary-container font-mono font-bold">
                SESSION {session.session_code}
              </span>
              <span className="text-gray-300 font-mono">
                Started {formatTime(session.opened_at)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] text-gray-300 uppercase tracking-wider">Customer / Family</p>
                <p className="text-base font-black text-white">{session.customer_name || 'Guest'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-300 uppercase tracking-wider">Current Bill</p>
                <p className="text-xl font-black text-secondary-container">₹{session.final_total}</p>
              </div>
            </div>
          </div>

          {/* Section: Active Orders Breakdown */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">dinner_dining</span>
              Active Orders in Session ({session.orders?.length || 0})
            </h4>

            {session.orders?.map((ord) => {
              const isReceived = ord.status === 'RECEIVED' || ord.status === 'PENDING';
              const isReadyToCook = ord.status === 'READY_TO_COOK';
              const isCooking = ord.status === 'COOKING';
              const isReadyToServe = ord.status === 'READY_TO_SERVE';
              const isServed = ord.status === 'SERVED';

              return (
                <div key={ord.id} className="bg-surface-container-low rounded-2xl p-3.5 border border-surface-container-high space-y-2">
                  <div className="flex justify-between items-center text-xs pb-2 border-b border-gray-200">
                    <div>
                      <span className="font-bold text-gray-900">
                        Order #{ord.id} • Placed by: <span className="text-secondary">{ord.placed_by_name || 'Guest'}</span>
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono block">
                        {formatTime(ord.created_at)}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isReadyToServe
                          ? 'bg-amber-300 text-amber-950 font-black animate-pulse'
                          : isCooking
                          ? 'bg-orange-200 text-orange-950'
                          : isReadyToCook
                          ? 'bg-indigo-200 text-indigo-900'
                          : isReceived
                          ? 'bg-blue-200 text-blue-900'
                          : 'bg-emerald-200 text-emerald-900'
                      }`}
                    >
                      {ord.status}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="space-y-1.5 text-xs">
                    {ord.items?.map((it) => (
                      <div key={it.id} className="flex justify-between items-center py-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-white shadow-xs font-bold text-gray-800 flex items-center justify-center text-[10px]">
                            {it.quantity}x
                          </span>
                          <span className="font-semibold text-gray-900">{it.item_name}</span>
                          {it.send_to_kitchen === 0 && (
                            <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[9px] font-mono rounded">
                              Direct Serve
                            </span>
                          )}
                          {it.is_manual ? (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                              Off-App Manual
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gray-900">₹{it.subtotal}</span>
                          {/* Manager Remove Item */}
                          <button
                            onClick={() => handleRemoveItem(it.id)}
                            title="Remove item"
                            className="text-gray-400 hover:text-error p-0.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Status Progression & Edit Controls */}
                  <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {isReceived && (
                        <button
                          onClick={() => handleStatusTransition(ord.id, 'READY_TO_COOK')}
                          disabled={statusUpdatingId === ord.id}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                        >
                          Queue Kitchen
                        </button>
                      )}
                      {(isReceived || isReadyToCook) && (
                        <button
                          onClick={() => handleStatusTransition(ord.id, 'COOKING')}
                          disabled={statusUpdatingId === ord.id}
                          className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                        >
                          Mark Cooking
                        </button>
                      )}
                      {isCooking && (
                        <button
                          onClick={() => handleStatusTransition(ord.id, 'READY_TO_SERVE')}
                          disabled={statusUpdatingId === ord.id}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                        >
                          Mark Ready to Serve
                        </button>
                      )}
                      {isReadyToServe && (
                        <button
                          onClick={() => handleStatusTransition(ord.id, 'SERVED')}
                          disabled={statusUpdatingId === ord.id}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                        >
                          Mark Served
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => setEditingOrder(ord)}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                      <span>Edit Order</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section: Quick Add Manual / Off-App Item by Food Item ID (Rules 15 & 16) */}
          <div className="bg-surface-container-lowest p-4 rounded-2xl border-2 border-dashed border-gray-300 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[18px]">add_shopping_cart</span>
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider">
                Quick Add Off-App / Manual Item
              </h4>
            </div>

            <form onSubmit={handleAddManualItem} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-1/2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Food Item ID
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 12"
                    value={foodIdInput}
                    onChange={(e) => handleFoodIdChange(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-secondary focus:outline-none"
                    required
                  />
                </div>

                <div className="w-1/4">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={foodQtyInput}
                    onChange={(e) => setFoodQtyInput(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-secondary focus:outline-none"
                    required
                  />
                </div>

                <div className="w-1/4 pt-4">
                  <button
                    type="submit"
                    disabled={!selectedFoodPreview || addingItem}
                    className="w-full py-2 bg-secondary-container hover:bg-secondary-fixed text-on-secondary-container font-extrabold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1 transition-all disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Food Item Match Preview */}
              {selectedFoodPreview && (
                <div className="p-2.5 bg-secondary-container/20 border border-secondary-container/50 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                    <span className="font-bold text-gray-900">
                      #{selectedFoodPreview.id} {selectedFoodPreview.name}
                    </span>
                  </div>
                  <span className="font-extrabold text-primary">₹{selectedFoodPreview.price}</span>
                </div>
              )}
            </form>
          </div>

          {/* Section: Discount System (Rule 21: % or Fixed Amount) */}
          <div className="bg-surface-container-low p-4 rounded-2xl border border-surface-container-high space-y-3">
            <h4 className="font-extrabold text-xs text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-secondary">percent</span>
              Apply Discount
            </h4>

            <form onSubmit={handleApplyDiscount} className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="bg-white border border-gray-300 rounded-xl px-3 py-2 font-bold focus:outline-none"
              >
                <option value="NONE">No Discount</option>
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹)</option>
                <option value="PROMO_CODE">Promo Offer Code</option>
              </select>

              {discountType === 'PROMO_CODE' ? (
                <input
                  type="text"
                  placeholder="e.g. FLAT100"
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                  className="w-28 px-3 py-2 bg-white border border-gray-300 rounded-xl font-mono font-bold focus:outline-none uppercase"
                  required
                />
              ) : discountType !== 'NONE' ? (
                <input
                  type="number"
                  placeholder={discountType === 'PERCENTAGE' ? 'e.g. 10' : 'e.g. 50'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-24 px-3 py-2 bg-white border border-gray-300 rounded-xl font-mono font-bold focus:outline-none"
                  required
                />
              ) : null}

              <button
                type="submit"
                disabled={applyingDiscount}
                className="px-4 py-2 bg-primary hover:bg-primary-container text-white font-bold rounded-xl cursor-pointer"
              >
                Apply
              </button>
            </form>
          </div>

          {/* Section: Billing & Payment Actions (Rules 20, 22, 23) */}
          <div className="pt-2 space-y-3 border-t border-gray-200">
            <div className="flex gap-2">
              <button
                onClick={() => onOpenBillModal(session.id)}
                className="flex-1 py-3 bg-surface-container-highest hover:bg-surface-variant text-on-surface font-extrabold text-xs rounded-2xl border border-surface-container-high flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span>
                Preview & Print Bill
              </button>
            </div>

            {/* Payment Settlement Action -> Opens TablePaymentModal with Cash vs Digital and Collector Selection */}
            <button
              onClick={() => setShowPaymentModal(true)}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">payments</span>
              <span>Confirm Payment & Release Table</span>
            </button>
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
          staffName="Manager"
          onUpdated={() => {
            onRefresh();
            setEditingOrder(null);
          }}
        />
      )}

      {/* Payment Confirmation Modal */}
      {showPaymentModal && session && (
        <TablePaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          session={session}
          tableNumber={selectedTable.table_number}
          collectorRole="MANAGER"
          collectorUser={{ name: 'Manager', id: 1 }}
          staffList={staffList}
          onPaymentSuccess={() => {
            onRefresh();
          }}
          onOpenBillModal={onOpenBillModal}
        />
      )}
    </div>
  );
}
