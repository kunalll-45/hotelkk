import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useSocket } from '../../context/SocketContext';
import { formatTime } from '../../utils/formatters';
import { soundManager } from '../../utils/soundEffects';

export default function KitchenDisplayView() {
  const { socket } = useSocket();
  const [kitchenOrders, setKitchenOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchKitchenQueue = async () => {
    try {
      const data = await api.getKitchenQueue();
      setKitchenOrders(data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch kitchen queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenQueue();
    const interval = setInterval(fetchKitchenQueue, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleKitchenUpdate = (queue) => {
      if (Array.isArray(queue)) {
        setKitchenOrders(queue);
        setLastUpdated(new Date());
      } else {
        fetchKitchenQueue();
      }
    };

    const handleOrderPlaced = () => {
      soundManager.playNewOrderAlert();
      fetchKitchenQueue();
    };

    socket.on('kitchen:queue_updated', handleKitchenUpdate);
    socket.on('order:placed', handleOrderPlaced);
    socket.on('order:status_updated', fetchKitchenQueue);

    return () => {
      socket.off('kitchen:queue_updated', handleKitchenUpdate);
      socket.off('order:placed', handleOrderPlaced);
      socket.off('order:status_updated', fetchKitchenQueue);
    };
  }, [socket]);

  // Calculate elapsed minutes for an order
  const getElapsedMinutes = (dateStr) => {
    const created = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.floor((now - created) / 60000);
  };

  // Total items requiring preparation across all active tickets
  const totalPrepItems = kitchenOrders.reduce((acc, ord) => {
    return acc + (ord.items?.reduce((sum, it) => sum + (it.quantity || 1), 0) || 0);
  }, 0);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* KDS Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-[28px]">skillet</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-white uppercase">
                Kitchen Display System (KDS)
              </h1>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                LIVE SCREEN
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Food Preparation Queue • Auto-clears when Waiter marks "Cooking"
            </p>
          </div>
        </div>

        {/* Quick KDS Stats */}
        <div className="flex items-center gap-3">
          <div className="bg-neutral-800/80 px-4 py-2 rounded-xl border border-neutral-700 text-center">
            <span className="text-[10px] font-mono uppercase text-neutral-400 block">Active Tickets</span>
            <span className="text-lg font-black font-mono text-amber-400">{kitchenOrders.length}</span>
          </div>

          <div className="bg-neutral-800/80 px-4 py-2 rounded-xl border border-neutral-700 text-center">
            <span className="text-[10px] font-mono uppercase text-neutral-400 block">Prep Dishes</span>
            <span className="text-lg font-black font-mono text-emerald-400">{totalPrepItems}</span>
          </div>

          <button
            onClick={fetchKitchenQueue}
            title="Refresh Queue"
            className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl border border-neutral-700 transition-colors cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
          </button>
        </div>
      </header>

      {/* Main Order Queue Area */}
      <main className="flex-1 p-6">
        {loading ? (
          <div className="py-24 text-center text-neutral-500">
            <span className="material-symbols-outlined text-[44px] animate-spin text-amber-500">
              progress_activity
            </span>
            <p className="text-sm font-medium mt-3">Connecting to kitchen order feed...</p>
          </div>
        ) : kitchenOrders.length === 0 ? (
          <div className="max-w-md mx-auto my-20 bg-neutral-900 border border-dashed border-neutral-800 rounded-3xl p-10 text-center shadow-lg">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-neutral-800/80 flex items-center justify-center text-neutral-600 mb-4">
              <span className="material-symbols-outlined text-[36px]">soup_kitchen</span>
            </div>
            <h3 className="text-lg font-bold text-white tracking-wide">All Kitchen Orders Clear!</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
              Orders requiring food preparation will immediately flash on this display when guests place their order.
            </p>
            <p className="text-[11px] text-neutral-500 font-mono mt-4">
              Non-kitchen items (water bottles, packaged beverages) bypass this screen.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {kitchenOrders.map((ticket, idx) => {
              const elapsed = getElapsedMinutes(ticket.created_at);
              const isUrgent = elapsed >= 10;
              const isModerate = elapsed >= 5 && elapsed < 10;

              return (
                <div
                  key={ticket.id}
                  className={`rounded-3xl border-2 shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
                    isUrgent
                      ? 'bg-neutral-900/95 border-rose-600 ring-2 ring-rose-500/20'
                      : isModerate
                      ? 'bg-neutral-900/95 border-amber-500 ring-2 ring-amber-500/20'
                      : 'bg-neutral-900/95 border-neutral-700'
                  }`}
                >
                  {/* Ticket Header */}
                  <div
                    className={`px-5 py-3.5 flex items-center justify-between border-b ${
                      isUrgent
                        ? 'bg-rose-950/60 border-rose-700/50 text-rose-200'
                        : isModerate
                        ? 'bg-amber-950/60 border-amber-700/50 text-amber-200'
                        : 'bg-neutral-800/80 border-neutral-700 text-neutral-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black font-mono tracking-tight text-white">
                          TABLE #{ticket.table_number}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-neutral-300">
                          #{ticket.id}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 mt-0.5 truncate max-w-[170px]">
                        Guest: {ticket.placed_by_name || 'Table Guest'}
                      </p>
                    </div>

                    {/* Elapsed Timer Pill */}
                    <div
                      className={`px-3 py-1.5 rounded-xl font-mono text-xs font-black flex items-center gap-1.5 shadow-sm ${
                        isUrgent
                          ? 'bg-rose-600 text-white animate-pulse'
                          : isModerate
                          ? 'bg-amber-500 text-black font-extrabold'
                          : 'bg-neutral-700 text-neutral-200'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">timer</span>
                      <span>{elapsed}m</span>
                    </div>
                  </div>

                  {/* Operational Status Info */}
                  <div className="px-5 py-2 bg-neutral-950/60 border-b border-neutral-800/60 flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400 font-mono">
                      Received at {formatTime(ticket.created_at)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold text-[10px]">
                      {ticket.status === 'READY_TO_COOK' ? 'Queued for Prep' : 'New Order'}
                    </span>
                  </div>

                  {/* Kitchen Prep Dishes List */}
                  <div className="p-5 flex-1 space-y-3 divide-y divide-neutral-800">
                    {ticket.items?.map((it, itemIdx) => (
                      <div
                        key={itemIdx}
                        className={`pt-2.5 first:pt-0 flex items-start justify-between gap-3 ${
                          it.quantity > 1 ? 'font-bold' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-8 h-8 rounded-xl bg-amber-500 text-black font-black font-mono flex items-center justify-center text-sm shadow-md shrink-0">
                            {it.quantity}x
                          </span>
                          <div>
                            <span className="text-base font-bold text-white tracking-wide block leading-snug">
                              {it.item_name}
                            </span>
                            {it.is_manual ? (
                              <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                Off-App Special
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Ticket Footer / Operational Protocol Notice */}
                  <div className="p-4 bg-neutral-950 border-t border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-amber-400">info</span>
                      <span className="text-neutral-300 font-medium">
                        Waiter marks "Cooking" to clear
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-neutral-500">
                      {ticket.items?.length || 0} Prep Dishes
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer Info Banner */}
      <footer className="bg-neutral-900 border-t border-neutral-800 px-6 py-2.5 text-center text-[11px] text-neutral-500 font-mono flex items-center justify-between">
        <span>K K's Food House • Commercial Kitchen Terminal</span>
        <span>Last Synced: {lastUpdated.toLocaleTimeString()}</span>
      </footer>
    </div>
  );
}
