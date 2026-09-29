import React from 'react';
import { formatCurrency } from '../../../utils/formatters';

export default function TopSummaryCards({ topSummary }) {
  if (!topSummary) return null;

  const { summary = {}, topInsights = {} } = topSummary;
  const { topRevenueItem, topQuantityItem } = topInsights;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
      {/* PART 1: Operational Counts Today (7 Cols on medium screen) */}
      <div className="md:col-span-7 bg-white p-5 rounded-3xl border border-surface-container-high shadow-xs space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-secondary font-mono">
            DAILY OPERATIONS SUMMARY
          </span>
          <span className="text-xs text-gray-400 font-mono">{topSummary.date}</span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center pt-1">
          <div className="p-3.5 bg-surface-container-low rounded-2xl border border-surface-container-high">
            <span className="text-2xl font-black text-primary block">{summary.totalTablesUsed || 0}</span>
            <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Tables Used</span>
          </div>

          <div className="p-3.5 bg-surface-container-low rounded-2xl border border-surface-container-high">
            <span className="text-2xl font-black text-primary block">{summary.totalSessions || 0}</span>
            <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Sessions Handled</span>
          </div>

          <div className="p-3.5 bg-surface-container-low rounded-2xl border border-surface-container-high">
            <span className="text-2xl font-black text-primary block">{summary.totalOrders || 0}</span>
            <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Orders Placed</span>
          </div>
        </div>
      </div>

      {/* PART 2: TWO Top-Item Insights (5 Cols on medium screen) */}
      <div className="md:col-span-5 bg-gradient-to-br from-primary to-primary-container text-white p-5 rounded-3xl shadow-md border border-white/10 flex flex-col justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-secondary-container font-mono">
          TOP ITEM INSIGHTS TODAY
        </span>

        <div className="grid grid-cols-2 gap-3 mt-2">
          {/* A. Top Revenue Item */}
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
              Top Revenue Item
            </span>
            {topRevenueItem ? (
              <div className="mt-1">
                <p className="font-extrabold text-xs text-white truncate" title={topRevenueItem.name}>
                  {topRevenueItem.name}
                </p>
                <p className="text-base font-black text-secondary-container mt-0.5">
                  ₹{topRevenueItem.amountEarned}
                </p>
                <span className="text-[10px] text-gray-400 font-mono">
                  {topRevenueItem.quantity} portions sold
                </span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-1 italic">No orders yet</p>
            )}
          </div>

          {/* B. Top Quantity Item */}
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
              Top Quantity Item
            </span>
            {topQuantityItem ? (
              <div className="mt-1">
                <p className="font-extrabold text-xs text-white truncate" title={topQuantityItem.name}>
                  {topQuantityItem.name}
                </p>
                <p className="text-base font-black text-secondary-container mt-0.5">
                  {topQuantityItem.quantitySold} Sold
                </p>
                <span className="text-[10px] text-gray-400 font-mono">
                  Earned ₹{topQuantityItem.amountEarned}
                </span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-1 italic">No orders yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
