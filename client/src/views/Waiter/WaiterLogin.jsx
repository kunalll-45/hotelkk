import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function WaiterLogin() {
  const { loginWaiter } = useAuth();
  const [username, setUsername] = useState('rahul_w');
  const [password, setPassword] = useState('waiter123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAttendanceBlocked, setIsAttendanceBlocked] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsAttendanceBlocked(false);

    try {
      setLoading(true);
      await loginWaiter(username, password);
    } catch (err) {
      setError(err.message || 'Login failed.');
      if (err.data?.isAttendanceBlocked || err.message?.includes('marked present')) {
        setIsAttendanceBlocked(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
    setIsAttendanceBlocked(false);
  };

  return (
    <div className="min-h-[90vh] flex flex-col items-center justify-center p-4">
      <div className="bg-surface-container-lowest max-w-sm w-full rounded-3xl p-7 shadow-xl border border-surface-container-highest">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <span className="material-symbols-outlined text-[32px] text-secondary-container">room_service</span>
          </div>
          <span className="text-[10px] font-extrabold tracking-widest uppercase text-secondary font-mono">
            STAFF OPERATIONS
          </span>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mt-0.5">
            Waiter Access Portal
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            K K's Food House Table Service
          </p>
        </div>

        {/* Error Alert / Attendance Restriction Banner */}
        {error && (
          <div className={`p-4 rounded-2xl mb-5 text-xs border ${
            isAttendanceBlocked
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-error-container text-error border-error/20'
          }`}>
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0 mt-0.5">
                {isAttendanceBlocked ? 'person_off' : 'warning'}
              </span>
              <div>
                <p className="font-extrabold">{isAttendanceBlocked ? 'Attendance Required' : 'Authentication Error'}</p>
                <p className="mt-0.5 leading-relaxed font-medium">{error}</p>
                {isAttendanceBlocked && (
                  <p className="mt-2 text-[11px] text-rose-700 bg-rose-100 p-2 rounded-lg font-semibold">
                    Managers mark staff attendance daily. Once marked PRESENT in Manager Dashboard, you can log in.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Waiter Username
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-gray-400">person</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. rahul_w"
                required
                className="w-full pl-10 pr-3 py-2.5 text-xs bg-surface-container-low border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-gray-900 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Password
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
            className="w-full py-3 bg-primary hover:bg-primary-container text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            ) : (
              <>
                <span>Enter Waiter Workspace</span>
                <span className="material-symbols-outlined text-[18px]">login</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Quick Credentials Helper */}
        <div className="mt-6 pt-5 border-t border-surface-container-highest space-y-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide text-center">
            Demo Waiter Credentials
          </p>
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <button
              onClick={() => fillCredentials('rahul_w', 'waiter123')}
              className="p-2 bg-surface-container-low hover:bg-surface-container rounded-lg font-mono text-center border border-gray-200"
            >
              <div className="font-bold text-gray-900">Rahul S.</div>
              <div className="text-emerald-600 font-bold text-[9px]">PRESENT</div>
            </button>

            <button
              onClick={() => fillCredentials('amit_w', 'waiter123')}
              className="p-2 bg-surface-container-low hover:bg-surface-container rounded-lg font-mono text-center border border-gray-200"
            >
              <div className="font-bold text-gray-900">Amit P.</div>
              <div className="text-emerald-600 font-bold text-[9px]">PRESENT</div>
            </button>

            <button
              onClick={() => fillCredentials('suresh_w', 'waiter123')}
              className="p-2 bg-surface-container-low hover:bg-surface-container rounded-lg font-mono text-center border border-gray-200"
            >
              <div className="font-bold text-gray-900">Suresh V.</div>
              <div className="text-rose-600 font-bold text-[9px]">ABSENT (Block)</div>
            </button>
          </div>

          <p className="text-[10px] text-gray-400 text-center mt-3">
            Note: Waiters cannot register themselves. Only Managers create staff logins.
          </p>
        </div>
      </div>
    </div>
  );
}
