import React, { useEffect, useState } from 'react';
import { api } from '../../../utils/api';

export default function TableQRCodesView({ onOpenQRModal }) {
  const [tableQRs, setTableQRs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadQRs = async () => {
    try {
      setLoading(true);
      const data = await api.getAllTableQRs();
      setTableQRs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQRs();
  }, []);

  const handlePrintAll = () => {
    window.print();
  };

  return (
    <div className="space-y-4 pb-16">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">qr_code_scanner</span>
            <h3 className="text-base font-black text-gray-900 tracking-tight">
              Permanent Table QR Codes Hub
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Table QR codes are permanent and dynamically evaluate restaurant open status and active sessions when scanned.
          </p>
        </div>

        <button
          onClick={handlePrintAll}
          className="px-4 py-2 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-xl shadow flex items-center gap-2 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Print All Table QR Codes
        </button>
      </div>

      {/* Grid of All Table QR Stands */}
      {loading ? (
        <div className="py-20 text-center text-gray-400">
          <span className="material-symbols-outlined text-[36px] animate-spin text-secondary-container">progress_activity</span>
          <p className="text-xs mt-2 font-medium">Generating table QR graphics...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
          {tableQRs.map((item) => (
            <div
              key={item.tableId}
              className="bg-white rounded-3xl p-5 border-2 border-primary/20 shadow-sm flex flex-col items-center text-center space-y-3 hover:border-primary transition-all hover:shadow-md"
            >
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary font-mono">
                  K K's Food House
                </span>
                <h4 className="text-2xl font-black text-black">
                  TABLE #{item.tableNumber}
                </h4>
                <p className="text-[11px] text-gray-500">Scan for Menu & Ordering</p>
              </div>

              {/* QR Image */}
              <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-inner">
                <img
                  src={item.qrDataUrl}
                  alt={`Table ${item.tableNumber} QR`}
                  className="w-40 h-40 object-contain"
                />
              </div>

              <div className="w-full pt-1 space-y-2 no-print">
                <div className="flex gap-2">
                  <button
                    onClick={() => onOpenQRModal(item.tableNumber)}
                    className="flex-1 py-1.5 bg-surface-container-high hover:bg-surface-variant text-gray-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">fullscreen</span>
                    Enlarge
                  </button>

                  <a
                    href={item.qrDataUrl}
                    download={`KK_Table_${item.tableNumber}_QR.png`}
                    className="flex-1 py-1.5 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">download</span>
                    Save
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
