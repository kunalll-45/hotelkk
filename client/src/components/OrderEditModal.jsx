import React, { useState } from 'react';
import { api } from '../utils/api';
import { soundManager } from '../utils/soundEffects';

export default function OrderEditModal({
  isOpen,
  onClose,
  order,
  menuItems = [],
  staffName = 'Staff',
  onUpdated
}) {
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [addQuantity, setAddQuantity] = useState(1);
  const [loadingAction, setLoadingAction] = useState('');
  const [error, setError] = useState('');

  if (!isOpen || !order) return null;

  const handleUpdateQty = async (orderItemId, currentQty, delta) => {
    const newQty = currentQty + delta;
    try {
      soundManager.playPop();
      setLoadingAction(`qty-${orderItemId}`);
      setError('');
      if (newQty <= 0) {
        if (!window.confirm('Remove this item from the order?')) return;
        await api.removeOrderItem(orderItemId, staffName);
      } else {
        await api.updateOrderItemQuantity(orderItemId, newQty, staffName);
      }
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update item quantity.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleRemoveItem = async (orderItemId) => {
    if (!window.confirm('Remove this item from the order?')) return;
    try {
      soundManager.playPop();
      setLoadingAction(`remove-${orderItemId}`);
      setError('');
      await api.removeOrderItem(orderItemId, staffName);
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to remove item.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!selectedMenuItemId) return;

    try {
      soundManager.playPop();
      setLoadingAction('add-item');
      setError('');
      await api.addOrderItemToOrder(order.id, {
        menuItemId: parseInt(selectedMenuItemId),
        quantity: parseInt(addQuantity) || 1,
        actorName: staffName
      });
      setSelectedMenuItemId('');
      setAddQuantity(1);
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to add item to order.');
    } finally {
      setLoadingAction('');
    }
  };

  const selectedItemObj = menuItems.find((m) => m.id === parseInt(selectedMenuItemId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <span className="material-symbols-outlined text-[22px]">edit_note</span>
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 tracking-tight">
                Edit Order #{order.id} • Table #{order.table_number}
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                Status: {order.status} • Guest: {order.placed_by_name || 'Guest'}
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

        {/* Error Alert */}
        {error && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[18px] text-rose-600">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {/* Current Order Items */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
              Current Items in Order ({order.items?.length || 0})
            </h4>

            {order.items?.length === 0 ? (
              <div className="p-4 bg-gray-50 rounded-2xl text-center text-xs text-gray-400">
                No items remaining in this order. Add items below.
              </div>
            ) : (
              <div className="space-y-2">
                {order.items?.map((it) => (
                  <div
                    key={it.id}
                    className="p-3 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900 truncate">
                          {it.item_name}
                        </span>
                        {it.send_to_kitchen === 0 && (
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                            Direct Serve
                          </span>
                        )}
                        {it.is_manual ? (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono font-bold">
                            Off-App
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs font-bold text-primary font-mono">
                        ₹{it.subtotal} (₹{it.unit_price} each)
                      </span>
                    </div>

                    {/* Quantity Stepper & Remove */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(it.id, it.quantity, -1)}
                        disabled={loadingAction === `qty-${it.id}`}
                        className="w-8 h-8 rounded-xl bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-black text-sm flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        -
                      </button>

                      <span className="w-8 text-center font-black font-mono text-sm text-gray-900">
                        {it.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleUpdateQty(it.id, it.quantity, 1)}
                        disabled={loadingAction === `qty-${it.id}`}
                        className="w-8 h-8 rounded-xl bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-black text-sm flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        +
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        disabled={loadingAction === `remove-${it.id}`}
                        title="Delete item"
                        className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 flex items-center justify-center ml-1 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Dish to Order Form */}
          <div className="p-4 bg-surface-container-low rounded-2xl border border-surface-container-high space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">add_circle</span>
              Add Item to This Order
            </h4>

            <form onSubmit={handleAddItem} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Select Menu Dish
                </label>
                <select
                  value={selectedMenuItemId}
                  onChange={(e) => setSelectedMenuItemId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-primary focus:outline-none"
                  required
                >
                  <option value="">-- Choose a dish to add --</option>
                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - ₹{item.price} {item.send_to_kitchen === 0 ? '(Non-Kitchen / Direct)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-1/3">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={addQuantity}
                    onChange={(e) => setAddQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>

                <div className="w-2/3 pt-4">
                  <button
                    type="submit"
                    disabled={!selectedMenuItemId || loadingAction === 'add-item'}
                    className="w-full py-2.5 bg-primary hover:bg-primary-container text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
                  >
                    {loadingAction === 'add-item' ? (
                      <span className="material-symbols-outlined text-[16px] animate-spin">
                        progress_activity
                      </span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        <span>Add Dish (₹{(selectedItemObj?.price || 0) * (parseInt(addQuantity) || 1)})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-500 font-mono">
            Kitchen & Customer view updates automatically
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 text-white font-bold text-xs rounded-xl hover:bg-black transition-colors cursor-pointer"
          >
            Done Editing
          </button>
        </div>
      </div>
    </div>
  );
}
