import React from 'react';
import { formatTime } from '../../utils/formatters';
import { soundManager } from '../../utils/soundEffects';

export default function WaiterTipModal({ isOpen, onClose, tipData, waiterName }) {
  if (!isOpen) return null;

  const todayTotal = tipData?.todayTotal || 0;
  const yesterdayTotal = tipData?.yesterdayTotal || 0;
  const todayEntries = tipData?.todayEntries || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-surface-container-high flex flex-col max-h-[90vh] animate-scale-up">
        {/* Modal Top Banner */}
        <div className="bg-gradient-to-br from-primary to-primary-container text-white p-5 relative">
          <button
            onClick={() => {
              soundManager.playPop();
              onClose();
            }}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>

          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-secondary-container text-on-secondary-container flex items-center justify-center font-black shadow-md">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white leading-tight">
                Today's Tip Collection
              </h3>
              <p className="text-xs text-secondary-container font-medium">
                {waiterName || 'Staff'} Shift Earnings
              </p>
            </div>
          </div>

          {/* Today's Big Total Display */}
          <div className="mt-4 bg-white/10 backdrop-blur-xs p-4 rounded-2xl border border-white/15 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-secondary-container block">
                Total Tips Collected Today
              </span>
              <div className="text-3xl font-black text-white font-mono mt-0.5">
                ₹{todayTotal}
              </div>
              <span className="text-[11px] text-gray-300 font-medium">
                {todayEntries.length} {todayEntries.length === 1 ? 'transaction' : 'transactions'} today
              </span>
            </div>

            {/* Yesterday Comparison Chip */}
            <div className="text-right bg-black/20 p-2.5 rounded-xl border border-white/10">
              <span className="text-[10px] text-gray-300 font-medium block">Yesterday</span>
              <span className="text-base font-black text-gray-200 font-mono">
                ₹{yesterdayTotal}
              </span>
            </div>
          </div>
        </div>

        {/* Entries List Area */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary">receipt</span>
              Today's Tip Log
            </h4>
            <span className="text-[10px] text-gray-400 font-mono">
              Recorded by Manager
            </span>
          </div>

          {todayEntries.length === 0 ? (
            <div className="py-10 text-center space-y-2 border-2 border-dashed border-gray-200 rounded-2xl p-6">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">savings</span>
              </div>
              <p className="text-xs font-extrabold text-gray-700">No Tips Recorded Yet Today</p>
              <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                Any tips added by customers or recorded by the Manager at the counter will appear here immediately in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 bg-surface-container-low rounded-2xl border border-surface-container-high flex items-center justify-between gap-3 hover:bg-surface-container transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
                      <span className="material-symbols-outlined text-[18px]">attach_money</span>
                    </span>
                    <div className="min-w-0">
                      <div className="font-extrabold text-xs text-gray-900 truncate">
                        {entry.notes || 'Table Tip from Guest'}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {entry.created_at ? formatTime(entry.created_at) : 'Today'} • By {entry.recorded_by || 'Manager'}
                      </div>
                    </div>
                  </div>

                  <span className="text-sm font-black text-primary font-mono shrink-0">
                    +₹{entry.amount}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Info banner */}
          <div className="p-3 bg-surface-container-lowest rounded-xl border border-surface-container-high text-[11px] text-gray-500 flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">info</span>
            <span>
              All tips are securely tracked by the manager's desk and distributed during end-of-day shift settlement.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-surface-container-high bg-surface-container-low flex justify-end">
          <button
            onClick={() => {
              soundManager.playPop();
              onClose();
            }}
            className="w-full py-2.5 bg-primary hover:bg-primary-container text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
