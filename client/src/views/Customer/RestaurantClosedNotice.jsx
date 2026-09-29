import React from 'react';

export default function RestaurantClosedNotice({ settings }) {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <div className="w-20 h-20 bg-rose-100 text-rose-700 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-rose-200">
        <span className="material-symbols-outlined text-[44px]">storefront</span>
      </div>

      <span className="px-3 py-1 bg-rose-100 text-rose-800 text-xs font-extrabold uppercase tracking-wider rounded-full border border-rose-200">
        Currently Closed
      </span>

      <h2 className="text-2xl font-black text-gray-900 mt-4 tracking-tight">
        K K's Food House is Closed
      </h2>

      <p className="text-sm text-gray-600 mt-2 leading-relaxed">
        We are not currently accepting orders. Table QR ordering is temporarily unavailable while the restaurant is closed.
      </p>

      {/* Operating Timings Box */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mt-6 w-full text-left space-y-3">
        <div className="flex items-center gap-2.5 text-xs font-bold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-2">
          <span className="material-symbols-outlined text-secondary text-[18px]">schedule</span>
          Operating Hours
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500 font-medium">Daily Service</span>
          <span className="font-bold text-gray-900">
            {settings?.opening_time || '11:00 AM'} - {settings?.closing_time || '11:00 PM'}
          </span>
        </div>

        {settings?.announcement && (
          <div className="p-3 bg-surface-container-low rounded-xl text-xs text-gray-600 mt-2">
            <span className="font-bold text-gray-800">Notice:</span> {settings.announcement}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Please visit us during our operating hours or speak with our manager for inquiries.
      </p>
    </div>
  );
}
