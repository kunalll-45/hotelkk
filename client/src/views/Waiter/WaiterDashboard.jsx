import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../utils/api';
import { soundManager } from '../../utils/soundEffects';
import WaiterLogin from './WaiterLogin';
import WaiterOrderFeed from './WaiterOrderFeed';
import WaiterDailyHistory from './WaiterDailyHistory';
import WaiterTipModal from './WaiterTipModal';

export default function WaiterDashboard() {
  const { waiterUser, logoutWaiter } = useAuth();
  const { socket } = useSocket();

  // Strict User Requirement: Waiter can only see Live Tables and History
  const [activeTab, setActiveTab] = useState('tables'); // 'tables' | 'history'
  const [feedData, setFeedData] = useState({ assignedTables: [], orders: [], serviceRequests: [] });
  const [menuItems, setMenuItems] = useState([]);
  const [tipData, setTipData] = useState(null);
  const [showTipModal, setShowTipModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState('');

  const loadFeed = async () => {
    if (!waiterUser?.id) return;
    try {
      setLoading(true);
      const [feedRes, menuRes] = await Promise.all([
        api.getWaiterFeed(waiterUser.id),
        api.getMenu(true)
      ]);
      setFeedData(feedRes);
      setMenuItems(menuRes || []);
    } catch (err) {
      console.error('Failed to load waiter feed:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTips = async () => {
    if (!waiterUser?.id) return;
    try {
      const tips = await api.getWaiterDailyTips(waiterUser.id);
      setTipData(tips);
    } catch (err) {
      console.error('Failed to load waiter tips:', err);
    }
  };

  useEffect(() => {
    if (waiterUser?.id) {
      loadFeed();
      loadTips();
    }
  }, [waiterUser]);

  const [toastMessage, setToastMessage] = useState(null);

  // Real-time socket updates for waiter
  useEffect(() => {
    if (!socket || !waiterUser?.id) return;

    const handleFeedRefresh = () => {
      loadFeed();
    };

    const handleTableActivated = (data) => {
      // Show notification if assigned to this waiter or if waiter has this table
      const isAssigned = feedData?.assignedTables?.some(t => t.table_number === data?.tableNumber);
      if (!data?.waiterId || data?.waiterId === waiterUser.id || isAssigned) {
        soundManager.playSuccess();
        setToastMessage(data?.message || `Table ${data?.tableNumber} has been activated.`);
        setTimeout(() => setToastMessage(null), 6000);
      }
      loadFeed();
    };

    const handleTipRecorded = (data) => {
      if (data?.waiterId === waiterUser.id) {
        soundManager.playPaymentSuccess();
        loadTips();
      }
    };

    socket.on('order:placed', handleFeedRefresh);
    socket.on('order:status_updated', handleFeedRefresh);
    socket.on('order:items_updated', handleFeedRefresh);
    socket.on('kitchen:queue_updated', handleFeedRefresh);
    socket.on('session:updated', handleFeedRefresh);
    socket.on('session:closed', handleFeedRefresh);
    socket.on('waiter:service_request', handleFeedRefresh);
    socket.on('tables:updated', handleFeedRefresh);
    socket.on('table:activated', handleTableActivated);
    socket.on('tip:recorded', handleTipRecorded);

    return () => {
      socket.off('order:placed', handleFeedRefresh);
      socket.off('order:status_updated', handleFeedRefresh);
      socket.off('order:items_updated', handleFeedRefresh);
      socket.off('kitchen:queue_updated', handleFeedRefresh);
      socket.off('session:updated', handleFeedRefresh);
      socket.off('session:closed', handleFeedRefresh);
      socket.off('waiter:service_request', handleFeedRefresh);
      socket.off('tables:updated', handleFeedRefresh);
      socket.off('table:activated', handleTableActivated);
      socket.off('tip:recorded', handleTipRecorded);
    };
  }, [socket, waiterUser, feedData?.assignedTables]);

  if (!waiterUser) {
    return <WaiterLogin />;
  }

  // Update order status (RECEIVED -> READY_TO_COOK -> COOKING -> READY_TO_SERVE -> SERVED)
  const handleUpdateOrderStatus = async (orderId, nextStatus) => {
    try {
      soundManager.playPop();
      setLoadingAction(`order-${orderId}`);
      await api.updateOrderStatus(orderId, nextStatus, waiterUser.name);
      if (nextStatus === 'SERVED') {
        soundManager.playSuccess();
      } else {
        soundManager.playOrderConfirmed();
      }
      await loadFeed();
    } catch (err) {
      soundManager.playError();
      alert(err.message || 'Failed to update order status.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleMarkServed = async (orderId) => {
    return handleUpdateOrderStatus(orderId, 'SERVED');
  };

  const handleResolveService = async (serviceReqId) => {
    try {
      soundManager.playPop();
      setLoadingAction(`service-${serviceReqId}`);
      await api.resolveServiceRequest(serviceReqId);
      soundManager.playSuccess();
      await loadFeed();
    } catch (err) {
      soundManager.playError();
      alert(err.message || 'Failed to resolve service call.');
    } finally {
      setLoadingAction('');
    }
  };

  const pendingCount = feedData?.orders?.filter((o) => o.status === 'PENDING').length || 0;
  const serviceCount = feedData?.serviceRequests?.length || 0;
  const todayTipTotal = tipData?.todayTotal || 0;

  return (
    <div className="min-h-screen bg-surface flex flex-col max-w-lg mx-auto shadow-2xl">
      {/* Top Staff App Bar */}
      <header className="bg-primary text-on-primary px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md border-b border-primary-container">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-black text-sm shadow-md">
            {waiterUser.name.charAt(0)}
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-white tracking-wide leading-tight">
              {waiterUser.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-secondary-container font-bold uppercase tracking-wider">
                Active Waiter
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-[10px] text-emerald-400 font-bold">Present Today</span>
            </div>
          </div>
        </div>

        {/* Right Controls: Money Icon (Tip Collection) + Logout Icon */}
        <div className="flex items-center gap-2">
          {/* Money Icon Button for Today's Tip Collection */}
          <button
            onClick={() => {
              soundManager.playPop();
              setShowTipModal(true);
            }}
            title="Today's Tip Collection"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/30 rounded-xl transition-all shadow-xs group cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px] text-amber-400 group-hover:scale-110 transition-transform">
              payments
            </span>
            <div className="text-left leading-none">
              <span className="text-[8px] uppercase font-black tracking-wider text-amber-400/80 block">
                Tips
              </span>
              <span className="text-xs font-black font-mono text-amber-200">
                ₹{todayTipTotal}
              </span>
            </div>
          </button>

          {/* Logout Icon */}
          <button
            onClick={() => {
              soundManager.playPop();
              logoutWaiter();
            }}
            title="Logout"
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </header>

      {/* Real-time Table Activation Notification Toast */}
      {toastMessage && (
        <div className="mx-3 mt-3 p-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl shadow-lg flex items-center justify-between gap-3 border border-emerald-400/40 animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px] text-white">notifications_active</span>
            </div>
            <div>
              <p className="text-xs font-black leading-tight tracking-wide">{toastMessage}</p>
              <p className="text-[10px] text-emerald-100/90 font-medium">Customer arrived and seated via QR</p>
            </div>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Dismiss"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Navigation Tabs: ONLY Live Tables and History */}
      <div className="flex bg-surface-container-high p-1 m-3 rounded-2xl border border-surface-container-highest shadow-2xs">
        <button
          onClick={() => {
            soundManager.playPop();
            setActiveTab('tables');
          }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all relative ${
            activeTab === 'tables'
              ? 'bg-white text-primary shadow-sm font-extrabold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">table_restaurant</span>
          Live Tables
          {(pendingCount > 0 || serviceCount > 0) && (
            <span className="w-5 h-5 bg-rose-600 text-white rounded-full text-[10px] font-black flex items-center justify-center ml-1 animate-pulse">
              {pendingCount + serviceCount}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            soundManager.playPop();
            setActiveTab('history');
          }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'history'
              ? 'bg-white text-primary shadow-sm font-extrabold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">history</span>
          History
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4">
        {loading ? (
          <div className="py-20 text-center text-gray-400">
            <span className="material-symbols-outlined text-[36px] animate-spin text-secondary-container">
              progress_activity
            </span>
            <p className="text-xs mt-2 font-medium">Syncing live tables and orders...</p>
          </div>
        ) : activeTab === 'tables' ? (
          <WaiterOrderFeed
            feedData={feedData}
            menuItems={menuItems}
            waiterUser={waiterUser}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onMarkServed={handleMarkServed}
            onResolveService={handleResolveService}
            onRefreshFeed={loadFeed}
            loadingAction={loadingAction}
          />
        ) : (
          <WaiterDailyHistory
            waiterId={waiterUser.id}
            onOpenTips={() => setShowTipModal(true)}
          />
        )}
      </div>

      {/* Tip Collection Modal */}
      <WaiterTipModal
        isOpen={showTipModal}
        onClose={() => setShowTipModal(false)}
        tipData={tipData}
        waiterName={waiterUser.name}
      />
    </div>
  );
}
