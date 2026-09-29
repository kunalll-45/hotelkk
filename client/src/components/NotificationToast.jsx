import React from 'react';
import { useSocket } from '../context/SocketContext';

export default function NotificationToast() {
  const { notifications, removeNotification } = useSocket();

  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none no-print">
      {notifications.map((n) => {
        let iconName = 'notifications';
        let bgStyle = 'bg-primary text-white border-l-4 border-secondary-container';

        if (n.type === 'BELL') {
          iconName = 'notifications_active';
          bgStyle = 'bg-amber-900 text-amber-50 border-l-4 border-secondary-container animate-pulse-gold';
        } else if (n.type === 'ORDER') {
          iconName = 'receipt_long';
          bgStyle = 'bg-primary-container text-white border-l-4 border-emerald-400';
        } else if (n.type === 'PAYMENT') {
          iconName = 'check_circle';
          bgStyle = 'bg-emerald-900 text-emerald-50 border-l-4 border-emerald-400';
        }

        return (
          <div
            key={n.id}
            className={`p-3.5 rounded-lg shadow-xl pointer-events-auto flex items-start gap-3 border border-white/10 ${bgStyle} transition-all transform translate-y-0`}
          >
            <span className="material-symbols-outlined text-[24px] text-secondary-container shrink-0 mt-0.5">
              {iconName}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm leading-snug">{n.title}</div>
              <div className="text-xs opacity-90 mt-0.5 leading-relaxed">{n.message}</div>
            </div>
            <button
              onClick={() => removeNotification(n.id)}
              className="text-white/60 hover:text-white shrink-0 p-0.5"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
