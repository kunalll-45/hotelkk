import React, { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

export default function CartDrawer({ cart, updateCartQty, onClose, onPlaceOrder, tableNumber, isPlacing }) {
  const cartItems = Object.values(cart);
  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (cartItems.length === 0 || isPlacing) return;
    onPlaceOrder();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-surface-container-lowest w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden border border-surface-container-highest">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-primary text-on-primary border-b border-primary-container">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-secondary-container">shopping_bag</span>
            <div>
              <h3 className="font-bold text-base">Your Table Order</h3>
              <p className="text-[11px] text-gray-300">Table #{tableNumber} Session</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Form & Items List */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Cart Item Breakdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Selected Dishes</h4>
            <div className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-200 p-2 shadow-xs">
              {cartItems.map((item) => (
                <div key={item.id} className="py-2.5 px-2 flex items-center justify-between gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 truncate">
                      {item.name}
                      <span className="text-gray-400 font-mono ml-1.5">#{item.id}</span>
                    </div>
                    <div className="text-gray-500 text-[11px]">₹{item.price} each</div>
                  </div>

                  <div className="flex items-center gap-2 bg-surface-container-high rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item, item.qty - 1)}
                      data-sound="remove"
                      className="w-6 h-6 rounded bg-white shadow-xs flex items-center justify-center font-bold text-gray-700"
                    >
                      -
                    </button>
                    <span className="font-bold w-4 text-center">{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(item, item.qty + 1)}
                      data-sound="pop"
                      className="w-6 h-6 rounded bg-primary text-white shadow-xs flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>

                  <div className="w-16 text-right font-extrabold text-primary text-sm">
                    ₹{item.price * item.qty}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Price Summary */}
          <div className="bg-surface-container-lowest p-4 rounded-2xl border border-gray-200 space-y-2 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Items Total ({cartItems.reduce((s, i) => s + i.qty, 0)} items)</span>
              <span>₹{totalAmount}</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-gray-900 border-t border-gray-200 pt-2">
              <span>Total Payable at Counter</span>
              <span className="text-base text-primary">₹{totalAmount}</span>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 bg-surface-container-low border-t border-surface-container-highest flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            data-sound="tab"
            className="flex-1 py-3 text-xs font-bold text-gray-700 hover:bg-surface-container-high rounded-xl transition-colors"
          >
            Add More Dishes
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPlacing || cartItems.length === 0}
            data-sound="success"
            className="flex-1 py-3 bg-secondary-container hover:bg-secondary-fixed text-on-secondary-container font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            {isPlacing ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">send</span>
                <span>Send to Waiter</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
