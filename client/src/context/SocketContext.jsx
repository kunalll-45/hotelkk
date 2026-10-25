import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { soundManager } from '../utils/soundEffects';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const { activeRole, waiterUser, selectedTableNumber, setRestaurantSettings } = useAuth();

  useEffect(() => {
    // Connect to current host/origin
    const socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    // Global settings update
    socketInstance.on('restaurant:settings_changed', (settings) => {
      setRestaurantSettings(settings);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Room subscriptions based on current active role
  useEffect(() => {
    if (!socket || !isConnected) return;

    if (activeRole === 'Customer' && selectedTableNumber) {
      socket.emit('join:table', selectedTableNumber);
    } else if (activeRole === 'Waiter' && waiterUser?.id) {
      socket.emit('join:waiter', waiterUser.id);
    } else if (activeRole === 'Manager') {
      socket.emit('join:manager');
    }
  }, [socket, isConnected, activeRole, selectedTableNumber, waiterUser]);

  // Handle incoming real-time notifications
  useEffect(() => {
    if (!socket) return;

    const handleServiceRequest = (data) => {
      soundManager.playBell();
      addNotification({
        id: Date.now(),
        type: 'BELL',
        title: `Service Call: Table ${data.tableNumber}`,
        message: `Table ${data.tableNumber} is calling for service.`,
        tableNumber: data.tableNumber
      });
    };

    const handleOrderPlaced = (data) => {
      soundManager.playOrderConfirmed();
      addNotification({
        id: Date.now(),
        type: 'ORDER',
        title: `New Order: Table ${data.tableNumber}`,
        message: `New order placed by ${data.placedByName || 'Guest'}.`,
        tableNumber: data.tableNumber
      });
    };

    const handleOrderConfirmed = (data) => {
      soundManager.playOrderConfirmed();
    };

    const handleSessionClosed = (data) => {
      soundManager.playPaymentSuccess();
      addNotification({
        id: Date.now(),
        type: 'PAYMENT',
        title: 'Payment Received',
        message: `Session for Table ${data.tableId} closed successfully.`,
        tableNumber: data.tableId
      });
    };

    socket.on('waiter:service_request', handleServiceRequest);
    socket.on('order:placed', handleOrderPlaced);
    socket.on('order:confirmed', handleOrderConfirmed);
    socket.on('session:closed', handleSessionClosed);

    return () => {
      socket.off('waiter:service_request', handleServiceRequest);
      socket.off('order:placed', handleOrderPlaced);
      socket.off('order:confirmed', handleOrderConfirmed);
      socket.off('session:closed', handleSessionClosed);
    };
  }, [socket]);

  const addNotification = (notif) => {
    setNotifications((prev) => [notif, ...prev.slice(0, 4)]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    }, 6000);
  };

  const removeNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, notifications, removeNotification }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
