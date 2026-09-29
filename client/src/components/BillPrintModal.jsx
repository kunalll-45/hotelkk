import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export default function BillPrintModal({ sessionId, tableId, onClose }) {
  const [billData, setBillData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadBill() {
      try {
        setLoading(true);
        const data = await api.getBillPreview(sessionId || tableId);
        setBillData(data);
      } catch (err) {
        setError(err.message || 'Failed to load bill preview');
      } finally {
        setLoading(false);
      }
    }
    loadBill();
  }, [sessionId, tableId]);

  const handlePrint = () => {
    window.print();
  };

  // Keyboard shortcut: Enter = Print Bill, Esc = Close Modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !loading && billData) {
        e.preventDefault();
        handlePrint();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, billData, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden border border-surface-container-highest">
        {/* Header (Hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 bg-primary text-on-primary border-b border-primary-container no-print">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-container">receipt_long</span>
            <h3 className="font-bold text-base">Bill Preview & Print</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Modal Body / Printable Receipt Area */}
        <div className="p-6 overflow-y-auto flex-1 bg-surface font-mono text-sm">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <span className="material-symbols-outlined text-[36px] animate-spin text-secondary-container">progress_activity</span>
              <p className="mt-3 text-xs">Generating bill data...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-error-container text-error rounded-xl text-center">
              <p className="font-bold">{error}</p>
            </div>
          ) : billData ? (
            <div id="printable-bill" className="bg-white p-6 rounded-xl border border-dashed border-gray-300 shadow-sm text-gray-900">
              {/* Receipt Header */}
              <div className="text-center pb-4 border-b border-dashed border-gray-300">
                <h1 className="font-sans text-xl font-extrabold tracking-tight uppercase text-black">
                  {billData.restaurantName}
                </h1>
                <p className="text-xs text-gray-600 font-sans tracking-wide mt-0.5">{billData.tagline}</p>
                <div className="mt-2 text-[11px] text-gray-500 space-y-0.5 font-mono">
                  <p>Bill No: {billData.billNumber}</p>
                  <p>Date: {billData.date} | Time: {billData.time}</p>
                </div>
              </div>

              {/* Table & Guest Meta */}
              <div className="py-3 border-b border-dashed border-gray-300 text-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>TABLE #{billData.tableNumber}</span>
                  <span>Session: {billData.sessionCode}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Guest: {billData.customerName || 'Guest'}</span>
                  <span>Waiter: {billData.waiterName || 'Staff'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="py-3 border-b border-dashed border-gray-300">
                <div className="flex justify-between text-xs font-bold text-gray-700 pb-1.5 border-b border-gray-200">
                  <span className="w-1/2">ITEM</span>
                  <span className="w-1/6 text-center">QTY</span>
                  <span className="w-1/6 text-right">RATE</span>
                  <span className="w-1/6 text-right">AMOUNT</span>
                </div>

                <div className="divide-y divide-gray-100 py-1">
                  {billData.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1.5 text-xs">
                      <span className="w-1/2 font-sans font-medium text-gray-900 pr-1 truncate">
                        {item.name}
                        {item.isManual ? <span className="ml-1 text-[10px] text-amber-700 font-bold font-mono">(Manual)</span> : null}
                      </span>
                      <span className="w-1/6 text-center">{item.quantity}</span>
                      <span className="w-1/6 text-right text-gray-600">₹{item.unitPrice}</span>
                      <span className="w-1/6 text-right font-bold">₹{item.subtotal}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill Totals & Discounts */}
              <div className="py-3 border-b border-dashed border-gray-300 space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal ({billData.totalItemsCount} items)</span>
                  <span>₹{billData.subtotal}</span>
                </div>

                {billData.discountType !== 'NONE' && billData.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>
                      Discount {billData.discountType === 'PERCENTAGE' ? `(${billData.discountValue}%)` : `(Fixed ₹${billData.discountValue})`}
                    </span>
                    <span>- ₹{billData.discountAmount}</span>
                  </div>
                )}

                <div className="flex justify-between text-base font-extrabold text-black pt-1.5 border-t border-gray-300">
                  <span>GRAND TOTAL</span>
                  <span className="text-lg text-primary">₹{billData.finalTotal}</span>
                </div>
              </div>

              {/* Payment Information */}
              <div className="py-3 border-b border-dashed border-gray-300 text-xs text-center space-y-0.5">
                <p className="text-gray-500">Payment Status: <span className="font-bold text-gray-800">{billData.status === 'CLOSED' ? 'PAID' : 'PENDING COUNTER PAYMENT'}</span></p>
                <p className="text-gray-500">Mode: {billData.paymentMethod}</p>
              </div>

              {/* Receipt Footer Message */}
              <div className="text-center pt-4">
                <p className="font-sans font-bold text-sm tracking-wide text-gray-900 uppercase">
                  {billData.closingMessage}
                </p>
                <p className="text-[11px] text-gray-500 font-sans mt-0.5">We look forward to serving you again!</p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Actions (Hidden when printing) */}
        <div className="px-6 py-4 bg-surface-container-low border-t border-surface-container-highest flex items-center justify-between no-print">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-surface-container-high rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Close</span>
            <kbd className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-mono text-[10px]">Esc</kbd>
          </button>
          <button
            onClick={handlePrint}
            disabled={!billData}
            className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary-container text-white rounded-xl shadow flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Print Bill</span>
            <kbd className="px-1.5 py-0.5 bg-white/20 text-white rounded font-mono text-[10px] font-bold">Enter ↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
