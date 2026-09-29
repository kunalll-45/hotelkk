import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../utils/api';

export default function ManagerLogin() {
  const { loginManager } = useAuth();
  const [username, setUsername] = useState('kunal_owner');
  const [password, setPassword] = useState('owner123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [managers, setManagers] = useState([]);

  useEffect(() => {
    api.getManagers().then(setManagers).catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setLoading(true);
      await loginManager(username, password);
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const fillManager = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div className="min-h-[90vh] flex flex-col items-center justify-center p-4">
      <div className="bg-surface-container-lowest max-w-md w-full rounded-3xl p-8 shadow-2xl border border-surface-container-highest">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary text-secondary-container rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg border border-secondary-container/30">
            <span className="material-symbols-outlined text-[36px]">admin_panel_settings</span>
          </div>
          <span className="text-[10px] font-extrabold tracking-widest uppercase text-secondary font-mono">
            EXECUTIVE CONTROL
          </span>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight mt-0.5">
            Manager Portal
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            K K's Food House Restaurant Operations
          </p>
        </div>

        {/* 3 Active Managers Rule Enforcement Badge */}
        <div className="bg-surface-container-low p-3.5 rounded-2xl mb-5 border border-surface-container-high flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-secondary">verified_user</span>
            <div>
              <span className="font-extrabold text-gray-900 block">System Account Policy</span>
              <span className="text-[11px] text-gray-500">Maximum 3 Active Managers</span>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-primary text-secondary-container rounded-lg font-mono font-bold text-xs">
            {managers.filter((m) => m.is_active).length || 3} / 3 Active
          </span>
        </div>

        {error && (
          <div className="p-3.5 bg-error-container text-error rounded-xl mb-4 text-xs font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Manager Username
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-gray-400">badge</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. kunal_owner"
                required
                className="w-full pl-10 pr-3 py-2.5 text-xs bg-surface-container-low border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-gray-900 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Master Password
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-gray-400">lock</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="w-full pl-10 pr-3 py-2.5 text-xs bg-surface-container-low border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-gray-900 font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-primary hover:bg-primary-container text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            ) : (
              <>
                <span>Access Manager Dashboard</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Manager Credentials Switcher (3 Registered Managers) */}
        <div className="mt-6 pt-5 border-t border-surface-container-highest space-y-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide text-center">
            3 Active Manager Accounts
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => fillManager('kunal_owner', 'owner123')}
              className="p-2.5 bg-surface-container-low hover:bg-surface-container rounded-xl text-left border border-gray-200 transition-colors"
            >
              <div className="font-extrabold text-gray-900 truncate">Kunal K.</div>
              <div className="text-[10px] text-secondary font-bold font-mono">Owner</div>
            </button>

            <button
              onClick={() => fillManager('manager_john', 'manager123')}
              className="p-2.5 bg-surface-container-low hover:bg-surface-container rounded-xl text-left border border-gray-200 transition-colors"
            >
              <div className="font-extrabold text-gray-900 truncate">John D.</div>
              <div className="text-[10px] text-gray-500 font-bold font-mono">Operations</div>
            </button>

            <button
              onClick={() => fillManager('manager_rajesh', 'rajesh123')}
              className="p-2.5 bg-surface-container-low hover:bg-surface-container rounded-xl text-left border border-gray-200 transition-colors"
            >
              <div className="font-extrabold text-gray-900 truncate">Rajesh S.</div>
              <div className="text-[10px] text-emerald-700 font-bold font-mono">Floor Mgr</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
