import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../utils/api';
import RestaurantClosedNotice from './RestaurantClosedNotice';
import TableQRActivationGate from './TableQRActivationGate';
import CustomerMenu from './CustomerMenu';
import CartDrawer from './CartDrawer';
import OrderStatus from './OrderStatus';

export default function CustomerPortal({ onBackToHome }) {
  const { selectedTableNumber, restaurantSettings } = useAuth();
  const { socket } = useSocket();

  const [activeTab, setActiveTab] = useState('menu'); // 'menu' | 'status'
  const [menuItems, setMenuItems] = useState([]);
  const [session, setSession] = useState(null);
  const [cart, setCart] = useState({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPlacing, setIsPlacing] = useState(false);

  // Table QR Activation Gatekeeper state
  const [activationStatus, setActivationStatus] = useState(null);
  const [isTableActivated, setIsTableActivated] = useState(false);

  // Load Menu, Activation Status, and Table Session
  const loadData = async () => {
    try {
      setLoading(true);
      const [menuData, activationData] = await Promise.all([
        api.getMenu(true), // only available dishes
        api.getTableActivationStatus(selectedTableNumber)
      ]);
      setMenuItems(menuData);
      setActivationStatus(activationData);

      const localToken = localStorage.getItem(`kk_activated_table_${selectedTableNumber}`);
      const isReserved = activationData?.isReserved;
      // Already activated if status is SEATED or active session with orders, or verified on this device
      const isAlreadyActive = !!(activationData?.isActivated || localToken);

      if (!isReserved || isAlreadyActive) {
        setIsTableActivated(true);
        const sessionData = await api.getActiveTableSession(selectedTableNumber);
        setSession(sessionData);
      } else {
        setIsTableActivated(false);
      }
    } catch (err) {
      console.error('Failed to load table data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedTableNumber]);

  // Real-time socket events for customer table
  useEffect(() => {
    if (!socket) return;

    const handleSessionUpdate = (updatedSession) => {
      if (
        updatedSession?.table_number === selectedTableNumber ||
        updatedSession?.table_id === session?.table_id
      ) {
        setSession(updatedSession);
      }
    };

    const handleOrderConfirmed = (data) => {
      if (data?.tableId === session?.table_id || data?.session?.table_number === selectedTableNumber) {
        setSession(data.session);
      }
    };

    const handleOrderServed = (data) => {
      if (data?.tableId === session?.table_id || data?.session?.table_number === selectedTableNumber) {
        setSession(data.session);
      }
    };

    const handleSessionClosed = (data) => {
      if (data?.tableId === session?.table_id) {
        // Clear activation token when bill is settled
        localStorage.removeItem(`kk_activated_table_${selectedTableNumber}`);
        loadData();
        setCart({});
      }
    };

    const handleOrderPlaced = (data) => {
      if (data?.tableId === session?.table_id || data?.session?.table_number === selectedTableNumber) {
        setSession(data.session);
      }
    };

    const handleOrderStatusUpdated = (data) => {
      if (data?.tableId === session?.table_id || data?.session?.table_number === selectedTableNumber) {
        setSession(data.session);
      }
    };

    const handleOrderItemsUpdated = (data) => {
      if (data?.tableId === session?.table_id || data?.session?.table_number === selectedTableNumber) {
        setSession(data.session);
      }
    };

    socket.on('session:updated', handleSessionUpdate);
    socket.on('order:placed', handleOrderPlaced);
    socket.on('order:confirmed', handleOrderConfirmed);
    socket.on('order:status_updated', handleOrderStatusUpdated);
    socket.on('order:items_updated', handleOrderItemsUpdated);
    socket.on('order:served', handleOrderServed);
    socket.on('session:closed', handleSessionClosed);

    return () => {
      socket.off('session:updated', handleSessionUpdate);
      socket.off('order:placed', handleOrderPlaced);
      socket.off('order:confirmed', handleOrderConfirmed);
      socket.off('order:status_updated', handleOrderStatusUpdated);
      socket.off('order:items_updated', handleOrderItemsUpdated);
      socket.off('order:served', handleOrderServed);
      socket.off('session:closed', handleSessionClosed);
    };
  }, [socket, selectedTableNumber, session]);

  const updateCartQty = (item, qty) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[item.id];
      } else {
        next[item.id] = {
          id: item.id,
          name: item.name,
          price: item.price,
          qty
        };
      }
      return next;
    });
  };

  const handlePlaceOrder = async (customerName) => {
    try {
      setIsPlacing(true);
      const itemsPayload = Object.values(cart).map((item) => ({
        menuItemId: item.id,
        quantity: item.qty
      }));

      const updatedSession = await api.placeOrder(selectedTableNumber, {
        placedByName: customerName,
        items: itemsPayload
      });

      setSession(updatedSession);
      setCart({});
      setIsCartOpen(false);
      setActiveTab('status'); // Switch to order status timeline
    } catch (err) {
      alert(err.message || 'Failed to place order.');
    } finally {
      setIsPlacing(false);
    }
  };

  // Rule 8: When the restaurant is closed, show clear closed message and timing information
  if (restaurantSettings?.is_open === 0) {
    return <RestaurantClosedNotice settings={restaurantSettings} />;
  }

  // Gatekeeper: If table has a reservation for today and customer hasn't activated it yet
  if (!loading && !isTableActivated && activationStatus?.isReserved) {
    return (
      <TableQRActivationGate
        tableNumber={selectedTableNumber}
        activationInfo={activationStatus}
        onActivated={(activatedSession) => {
          localStorage.setItem(`kk_activated_table_${selectedTableNumber}`, 'true');
          setIsTableActivated(true);
          setSession(activatedSession);
          loadData();
        }}
        onBackToHome={onBackToHome}
      />
    );
  }

  const activeOrdersCount = session?.orders?.length || 0;

  return (
    <div className="min-h-screen bg-surface flex flex-col max-w-md mx-auto relative shadow-2xl">
      {/* Mobile Top App Bar */}
      <header className="bg-primary text-on-primary px-4 py-3 flex flex-col gap-2 shadow-md sticky top-0 z-30 border-b border-primary-container">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center font-black">
              <span className="material-symbols-outlined text-[20px]">restaurant</span>
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-wide text-white leading-none">
                K K's Food House
              </h1>
              <p className="text-[10px] text-gray-300 font-mono mt-0.5">Royal Culinary Experience</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-white/10 px-2.5 py-1 rounded-full text-[11px] font-bold text-secondary-container flex items-center gap-1 border border-white/15">
              <span className="material-symbols-outlined text-[14px]">table_restaurant</span>
              Table #{selectedTableNumber}
            </div>
          </div>
        </div>

        {onBackToHome && (
          <div className="flex items-center justify-between pt-1.5 border-t border-white/10">
            <button
              onClick={onBackToHome}
              className="text-[11px] text-[#fed65b] hover:text-white font-semibold flex items-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              Restaurant Home & Booking
            </button>
            <span className="text-[10px] text-gray-400 font-medium">
              {session?.customer_name ? `Seated: ${session.customer_name}` : 'Dine-In Session'}
            </span>
          </div>
        )}
      </header>

      {/* Tabs Switcher: Menu vs Order Timeline */}
      <div className="flex bg-surface-container-high p-1 m-3 rounded-2xl border border-surface-container-highest">
        <button
          onClick={() => setActiveTab('menu')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'menu'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">menu_book</span>
          Menu & Order
        </button>

        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all relative ${
            activeTab === 'status'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
          Table Status
          {activeOrdersCount > 0 && (
            <span className="w-5 h-5 bg-secondary text-on-secondary rounded-full text-[10px] font-black flex items-center justify-center ml-1 shadow-xs">
              {activeOrdersCount}
            </span>
          )}
        </button>
      </div>

      {/* Main View Area */}
      <div className="flex-1 p-3">
        {loading ? (
          <div className="py-20 text-center text-gray-400">
            <span className="material-symbols-outlined text-[36px] animate-spin text-secondary-container">
              progress_activity
            </span>
            <p className="text-xs mt-2 font-medium">Connecting to Table #{selectedTableNumber}...</p>
          </div>
        ) : activeTab === 'menu' ? (
          <CustomerMenu
            items={menuItems}
            menuItems={menuItems}
            cart={cart}
            updateCartQty={updateCartQty}
            openCart={() => setIsCartOpen(true)}
            onOpenCart={() => setIsCartOpen(true)}
          />
        ) : (
          <OrderStatus session={session} onRefresh={loadData} />
        )}
      </div>

      {/* Floating Cart Bar (Sticky Bottom) */}
      {activeTab === 'menu' && Object.keys(cart).length > 0 && (
        <div className="sticky bottom-3 px-3 z-20">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-primary hover:bg-primary-container text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between transition-transform active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container text-xs font-black flex items-center justify-center font-mono">
                {Object.values(cart).reduce((acc, it) => acc + it.qty, 0)}
              </span>
              <span className="font-extrabold text-xs">View Selected Items</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm font-mono text-secondary-container">
                ₹{Object.values(cart).reduce((acc, it) => acc + it.price * it.qty, 0)}
              </span>
              <span className="material-symbols-outlined text-[18px]">shopping_cart_checkout</span>
            </div>
          </button>
        </div>
      )}

      {/* Cart Review & Order Placement Drawer */}
      {isCartOpen && (
        <CartDrawer
          cart={cart}
          updateCartQty={updateCartQty}
          onClose={() => setIsCartOpen(false)}
          onPlaceOrder={handlePlaceOrder}
          tableNumber={selectedTableNumber}
          isPlacing={isPlacing}
        />
      )}
    </div>
  );
}
