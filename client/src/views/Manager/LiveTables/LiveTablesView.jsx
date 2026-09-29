import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../../../utils/api';
import { useSocket } from '../../../context/SocketContext';
import TableDetailPanel from './TableDetailPanel';
import PendingCashLedgerModal from '../../../components/PendingCashLedgerModal';

export default function LiveTablesView({ onOpenBillModal, onOpenQRModal }) {
  const { socket } = useSocket();
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [pendingCashSummary, setPendingCashSummary] = useState({ totalPendingCash: 0, byStaff: [], records: [] });
  const [showPendingCashModal, setShowPendingCashModal] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  const selectedTableIdRef = useRef(selectedTableId);
  useEffect(() => {
    selectedTableIdRef.current = selectedTableId;
  }, [selectedTableId]);

  const loadLiveTables = useCallback(async () => {
    try {
      const [tableList, menuList, staffRes, cashRes] = await Promise.all([
        api.getTables(),
        api.getMenu(),
        api.getStaff().catch(() => []),
        api.getPendingCash().catch(() => ({ totalPendingCash: 0, byStaff: [], records: [] }))
      ]);
      setTables(tableList || []);
      setMenuItems(menuList || []);
      setStaffList(staffRes || []);
      setPendingCashSummary(cashRes || { totalPendingCash: 0, byStaff: [], records: [] });

      // Keep user's selected table stable across background refreshes and socket events
      setSelectedTableId((prevSelectedId) => {
        if (
          prevSelectedId != null &&
          Array.isArray(tableList) &&
          tableList.some((t) => String(t.id) === String(prevSelectedId))
        ) {
          return prevSelectedId;
        }
        return tableList && tableList.length > 0 ? tableList[0].id : null;
      });
    } catch (err) {
      console.error('Failed to load live tables:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveTables();
    const interval = setInterval(() => {
      loadLiveTables();
    }, 8000);
    return () => clearInterval(interval);
  }, [loadLiveTables]);

  // Real-time socket synchronization for table activation & status
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      loadLiveTables();
    };

    socket.on('table:activated', handleUpdate);
    socket.on('tables:updated', handleUpdate);
    socket.on('session:updated', handleUpdate);
    socket.on('session:closed', handleUpdate);
    socket.on('order:placed', handleUpdate);
    socket.on('order:status_updated', handleUpdate);
    socket.on('order:items_updated', handleUpdate);
    socket.on('booking:updated', handleUpdate);

    return () => {
      socket.off('table:activated', handleUpdate);
      socket.off('tables:updated', handleUpdate);
      socket.off('session:updated', handleUpdate);
      socket.off('session:closed', handleUpdate);
      socket.off('order:placed', handleUpdate);
      socket.off('order:status_updated', handleUpdate);
      socket.off('order:items_updated', handleUpdate);
      socket.off('booking:updated', handleUpdate);
    };
  }, [socket, loadLiveTables]);

  const selectedTable =
    tables.find((t) => String(t.id) === String(selectedTableId)) ||
    tables.find((t) => t.id === selectedTableId) ||
    tables[0] ||
    null;

  const filteredTables = tables.filter((t) => {
    if (filterStatus === 'ACTIVE') return !!t.activeSession;
    if (filterStatus === 'VACANT') return !t.activeSession;
    if (filterStatus === 'CALLING') return t.computedStatus === 'CALLING_WAITER';
    return true;
  });

  const occupiedCount = tables.filter((t) => !!t.activeSession).length;
  const vacantCount = tables.length - occupiedCount;
  const callingCount = tables.filter((t) => t.computedStatus === 'CALLING_WAITER').length;

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Top Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-primary">table_restaurant</span>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">LIVE TABLES</h2>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Real-time table monitoring, manual ordering & counter billing</p>
        </div>

        {/* Quick Table Counts & Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${filterStatus === 'ALL'
                ? 'bg-primary text-white'
                : 'bg-surface-container-low text-gray-700 hover:bg-surface-container'
              }`}
          >
            All ({tables.length})
          </button>

          <button
            onClick={() => setFilterStatus('ACTIVE')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${filterStatus === 'ACTIVE'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
          >
            Active ({occupiedCount})
          </button>

          <button
            onClick={() => setFilterStatus('VACANT')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${filterStatus === 'VACANT'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
          >
            Vacant ({vacantCount})
          </button>

          {callingCount > 0 && (
            <button
              onClick={() => setFilterStatus('CALLING')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors animate-pulse ${filterStatus === 'CALLING'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
            >
              Calling ({callingCount})
            </button>
          )}

          <button
            onClick={() => setShowPendingCashModal(true)}
            className="px-3.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-extrabold rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            title="View & Settle Staff Pending Cash"
          >
            <span className="material-symbols-outlined text-[16px] text-amber-700">payments</span>
            <span>Pending Cash: ₹{pendingCashSummary.totalPendingCash || 0}</span>
          </button>

          <button
            onClick={loadLiveTables}
            title="Refresh Live Data"
            className="p-2 text-gray-500 hover:text-primary rounded-xl hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
          </button>
        </div>
      </div>

      {/* TWO HALVES STRUCTURE (Strict Rule 18):
          LEFT HALF: SELECTED TABLE COMPLETE DETAILS & BILLING
          RIGHT HALF: ALL RESTAURANT TABLE NUMBERS GRID
      */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 overflow-hidden">
        {/* LEFT HALF (5 Cols on large screen): Selected Table Details & Controls */}
        <div className="lg:col-span-6 xl:col-span-5 h-[calc(100vh-210px)] min-h-[500px]">
          <TableDetailPanel
            selectedTable={selectedTable}
            menuItems={menuItems}
            staffList={staffList}
            onRefresh={loadLiveTables}
            onOpenBillModal={onOpenBillModal}
            onOpenQRModal={onOpenQRModal}
          />
        </div>

        {/* RIGHT HALF (7 Cols on large screen): All Restaurant Table Numbers */}
        <div className="lg:col-span-6 xl:col-span-7 h-[calc(100vh-210px)] min-h-[500px] overflow-y-auto bg-surface-container-low p-4 md:p-6 rounded-3xl border border-surface-container-high shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider">
              Restaurant Tables Grid
            </h3>
            <span className="text-xs text-gray-500 font-mono">
              Click any table to manage on the left
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredTables.map((table) => {
              const isSelected = selectedTable?.id === table.id;
              const hasSession = !!table.activeSession;
              const isCalling = table.computedStatus === 'CALLING_WAITER';
              const hasPendingOrder = table.computedStatus === 'PENDING_ORDER';

              return (
                <button
                  key={table.id}
                  onClick={() => setSelectedTableId(table.id)}
                  className={`p-4 rounded-2xl text-left transition-all relative flex flex-col justify-between min-h-[140px] border-2 ${isSelected
                      ? 'ring-4 ring-secondary/30 border-primary bg-white shadow-lg scale-102'
                      : isCalling
                        ? 'border-amber-500 bg-amber-50/90 shadow-md animate-pulse-gold'
                        : hasSession
                          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-emerald-50/90 to-emerald-100/60 text-emerald-950 shadow-xs ring-1 ring-emerald-400/30'
                          : 'border-transparent bg-white/70 hover:bg-white hover:border-gray-300'
                    }`}
                >
                  {/* Card Header: Table Number & Status Pill */}
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase font-mono block">
                        TABLE
                      </span>
                      <h4 className="text-2xl font-black text-gray-900 leading-none">
                        #{table.table_number}
                      </h4>
                    </div>

                    <span
                      className={`w-3 h-3 rounded-full ${isCalling
                          ? 'bg-amber-500 ring-4 ring-amber-300 animate-ping'
                          : hasPendingOrder
                            ? 'bg-amber-400 ring-2 ring-amber-200'
                            : hasSession
                              ? 'bg-emerald-500 ring-2 ring-emerald-300'
                              : 'bg-gray-300'
                        }`}
                      title={hasSession ? 'QR Activated / Table Active' : table.computedStatus}
                    ></span>
                  </div>

                  {/* Card Middle: Customer Name & Active Status */}
                  <div className="my-2">
                    {hasSession ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          QR Activated
                        </span>
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {table.activeSession.customer_name || 'Active Guest'}
                        </p>
                        <p className="text-[11px] font-extrabold text-emerald-700 font-mono">
                          ₹{table.activeSession.final_total || 0}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs font-semibold text-gray-500">Vacant</p>
                    )}
                  </div>

                  {/* Card Footer: Assigned Waiter */}
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                    <span className="truncate">
                      {table.assigned_waiter_name ? `W: ${table.assigned_waiter_name.split(' ')[0]}` : 'Unassigned'}
                    </span>
                    <span className="font-mono text-[10px]">{table.capacity}P</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Staff Pending Cash Ledger Modal */}
      <PendingCashLedgerModal
        isOpen={showPendingCashModal}
        onClose={() => {
          setShowPendingCashModal(false);
          loadLiveTables();
        }}
        managerName="Manager"
      />
    </div>
  );
}
