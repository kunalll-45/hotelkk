import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import RoleSwitcherBar from './components/RoleSwitcherBar';
import NotificationToast from './components/NotificationToast';
import CustomerHeroPage from './views/Customer/CustomerHeroPage';
import CustomerPortal from './views/Customer/CustomerPortal';
import WaiterDashboard from './views/Waiter/WaiterDashboard';
import ManagerDashboard from './views/Manager/ManagerDashboard';
import KitchenDisplayView from './views/Kitchen/KitchenDisplayView';

import ErrorBoundary from './components/ErrorBoundary';

function MainApp() {
  const { activeRole, switchRole } = useAuth();

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans selection:bg-secondary-container selection:text-on-secondary-container">
      {/* Universal Top Role Switcher & Table Simulator Bar */}
      <ErrorBoundary>
        <RoleSwitcherBar />
      </ErrorBoundary>

      {/* Real-time Push Notifications & Audio Bells */}
      <ErrorBoundary>
        <NotificationToast />
      </ErrorBoundary>

      {/* Role-Based Interface Router */}
      <div className="flex-1 min-h-0">
        <ErrorBoundary>
          {(activeRole === 'Home' || !activeRole) && (
            <CustomerHeroPage />
          )}
          {activeRole === 'Customer' && (
            <CustomerPortal onBackToHome={() => switchRole('Home')} />
          )}
          {activeRole === 'Waiter' && <WaiterDashboard />}
          {activeRole === 'Manager' && <ManagerDashboard />}
          {activeRole === 'Kitchen' && <KitchenDisplayView />}
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SocketProvider>
          <MainApp />
        </SocketProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
