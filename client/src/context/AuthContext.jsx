import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Current active role in view: 'Home' | 'Customer' | 'Waiter' | 'Manager'
  const [activeRole, setActiveRole] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('table')) return 'Customer';
    return localStorage.getItem('kk_active_role') || 'Home';
  });

  // Current table for Customer view (e.g. Table 1 to 12)
  const [selectedTableNumber, setSelectedTableNumber] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableFromUrl = urlParams.get('table');
    return tableFromUrl ? parseInt(tableFromUrl) : (parseInt(localStorage.getItem('kk_table_number')) || 1);
  });

  // Authenticated User Profiles
  const [managerUser, setManagerUser] = useState(() => {
    try {
      const saved = localStorage.getItem('kk_manager_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [waiterUser, setWaiterUser] = useState(() => {
    try {
      const saved = localStorage.getItem('kk_waiter_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Restaurant Open/Closed state
  const [restaurantSettings, setRestaurantSettings] = useState({
    is_open: 1,
    opening_time: '12:00 PM',
    closing_time: '12:00 AM',
    announcement: "Welcome to K K's Food House"
  });

  useEffect(() => {
    localStorage.setItem('kk_active_role', activeRole);
  }, [activeRole]);

  useEffect(() => {
    localStorage.setItem('kk_table_number', selectedTableNumber);
  }, [selectedTableNumber]);

  useEffect(() => {
    if (managerUser) {
      localStorage.setItem('kk_manager_user', JSON.stringify(managerUser));
    } else {
      localStorage.removeItem('kk_manager_user');
    }
  }, [managerUser]);

  useEffect(() => {
    if (waiterUser) {
      localStorage.setItem('kk_waiter_user', JSON.stringify(waiterUser));
    } else {
      localStorage.removeItem('kk_waiter_user');
    }
  }, [waiterUser]);

  useEffect(() => {
    // Fetch initial restaurant settings
    api.getRestaurantSettings()
      .then(setRestaurantSettings)
      .catch(console.error);
  }, []);

  const loginManager = async (username, password) => {
    const data = await api.loginManager({ username, password });
    setManagerUser(data);
    setActiveRole('Manager');
    return data;
  };

  const logoutManager = () => {
    try {
      localStorage.removeItem('kk_manager_user');
    } catch {}
    setManagerUser(null);
  };

  const loginWaiter = async (username, password) => {
    const data = await api.loginWaiter({ username, password });
    setWaiterUser(data);
    setActiveRole('Waiter');
    return data;
  };

  const logoutWaiter = () => {
    setWaiterUser(null);
  };

  const switchRole = (role) => {
    setActiveRole(role);
  };

  const changeCustomerTable = (tableNumber) => {
    const num = parseInt(tableNumber);
    setSelectedTableNumber(num);
    const url = new URL(window.location);
    url.searchParams.set('table', num);
    window.history.replaceState({}, '', url);
  };

  return (
    <AuthContext.Provider
      value={{
        activeRole,
        switchRole,
        selectedTableNumber,
        changeCustomerTable,
        managerUser,
        loginManager,
        logoutManager,
        waiterUser,
        setWaiterUser,
        loginWaiter,
        logoutWaiter,
        restaurantSettings,
        setRestaurantSettings
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
