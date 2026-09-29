import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';

export default function QRModal({ tableNumber, onClose }) {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadQR() {
      try {
        setLoading(true);
        const data = await api.getTableQR(tableNumber);
        setQrData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadQR();
  }, [tableNumber]);

  const handleDownload = () => {
    if (!qrData?.qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `KK_Table_${tableNumber}_QR.png`;
    link.href = qrData.qrDataUrl;
    link.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-surface-container-highest">
        <div className="flex items-center justify-between px-6 py-4 bg-primary text-on-primary no-print">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-container">qr_code_2</span>
            <h3 className="font-bold text-base">Table #{tableNumber} Permanent QR</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 text-center bg-surface">
          {loading ? (
            <div className="py-12">
              <span className="material-symbols-outlined text-[36px] animate-spin text-secondary-container">progress_activity</span>
            </div>
          ) : qrData ? (
            <div className="bg-white p-6 rounded-2xl border-2 border-primary shadow-sm flex flex-col items-center">
              <div className="mb-2">
                <span className="text-xs font-bold uppercase tracking-widest text-secondary font-mono">K K's Food House</span>
                <h4 className="text-2xl font-black text-black">TABLE {tableNumber}</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Scan to Browse Menu & Order</p>
              </div>

              <div className="p-3 bg-white border border-gray-200 rounded-xl my-3 shadow-inner">
                <img src={qrData.qrDataUrl} alt={`Table ${tableNumber} QR`} className="w-52 h-52 object-contain" />
              </div>

              <p className="text-[10px] text-gray-400 font-mono break-all max-w-xs">{qrData.targetUrl}</p>
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 bg-surface-container-low border-t border-surface-container-highest flex items-center justify-between no-print">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-surface-container-high rounded-xl"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="px-3.5 py-2 text-xs font-bold bg-surface-container-highest text-on-surface hover:bg-surface-variant rounded-xl flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Download
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-xs font-bold bg-primary text-white hover:bg-primary-container rounded-xl flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
