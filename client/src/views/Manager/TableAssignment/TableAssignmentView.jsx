import React, { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { soundManager } from '../../../utils/soundEffects';

export default function TableAssignmentView() {
  const [tables, setTables] = useState([]);
  const [allWaiters, setAllWaiters] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filterRoster, setFilterRoster] = useState('ALL'); // 'ALL' | 'PRESENT' | 'PENDING'

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [tablesData, attendanceData, staffList] = await Promise.all([
        api.getTables(),
        api.getDailyAttendance(selectedDate),
        api.getStaff()
      ]);

      setTables(tablesData || []);

      // Build attendance lookup for selectedDate
      const attendanceMap = {};
      (attendanceData?.staff || []).forEach((s) => {
        attendanceMap[s.id] = s.status;
      });

      // Filter all active waiters from staff list
      const activeWaiters = (staffList || [])
        .filter((s) => s.role === 'Waiter' && (s.is_active === 1 || s.is_active === true))
        .map((w) => ({
          ...w,
          status: attendanceMap[w.id] || w.today_status || 'UNMARKED'
        }));

      setAllWaiters(activeWaiters);

      // Populate current table assignments
      const initialMap = {};
      (tablesData || []).forEach((t) => {
        initialMap[t.id] = t.assigned_waiter_id || '';
      });
      setAssignments(initialMap);
    } catch (err) {
      setError(err.message || 'Failed to load assignment data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  // Mark single waiter present for selectedDate
  const handleQuickMarkPresent = async (waiterId) => {
    try {
      setActionLoadingId(waiterId);
      soundManager.playPop();
      await api.markAttendance({
        staffId: waiterId,
        date: selectedDate,
        status: 'PRESENT',
        markedBy: 'Manager'
      });
      soundManager.playSuccess();
      setMessage(`Waiter marked PRESENT for ${selectedDate}.`);
      // Update local waiter status
      setAllWaiters((prev) =>
        prev.map((w) => (w.id === waiterId ? { ...w, status: 'PRESENT' } : w))
      );
    } catch (err) {
      soundManager.playError();
      setError(err.message || 'Failed to mark waiter present');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAssignChange = async (tableId, waiterIdStr) => {
    soundManager.playPop();
    if (!waiterIdStr) {
      setAssignments((prev) => ({
        ...prev,
        [tableId]: ''
      }));
      return;
    }

    const waiterId = parseInt(waiterIdStr, 10);
    const targetWaiter = allWaiters.find((w) => w.id === waiterId);

    // If waiter is not marked PRESENT, auto-mark them PRESENT for convenience
    if (targetWaiter && targetWaiter.status !== 'PRESENT') {
      try {
        await api.markAttendance({
          staffId: waiterId,
          date: selectedDate,
          status: 'PRESENT',
          markedBy: 'Manager'
        });
        setAllWaiters((prev) =>
          prev.map((w) => (w.id === waiterId ? { ...w, status: 'PRESENT' } : w))
        );
        setMessage(`${targetWaiter.name} auto-marked PRESENT for ${selectedDate}.`);
      } catch (err) {
        console.warn('Auto-attendance failed:', err);
      }
    }

    setAssignments((prev) => ({
      ...prev,
      [tableId]: waiterId
    }));
  };

  // Quick Distribute Evenly among present waiters (or all active waiters if none are marked)
  const handleAutoDistribute = async () => {
    soundManager.playPop();
    let eligible = allWaiters.filter((w) => w.status === 'PRESENT');

    if (eligible.length === 0) {
      if (allWaiters.length === 0) {
        soundManager.playError();
        alert('No active Waiters exist in the system. Please add waiters in Staff Management first.');
        return;
      }

      // If no waiters are marked present, auto-mark all active waiters as PRESENT
      const confirmAutoMark = window.confirm(
        'No waiters are marked PRESENT today. Would you like to mark ALL active waiters PRESENT and distribute tables among them?'
      );
      if (!confirmAutoMark) return;

      try {
        setSaving(true);
        await Promise.all(
          allWaiters.map((w) =>
            api.markAttendance({
              staffId: w.id,
              date: selectedDate,
              status: 'PRESENT',
              markedBy: 'Manager'
            })
          )
        );
        soundManager.playSuccess();
        setAllWaiters((prev) => prev.map((w) => ({ ...w, status: 'PRESENT' })));
        eligible = allWaiters;
      } catch (err) {
        soundManager.playError();
        setError('Failed to mark waiters present: ' + err.message);
        setSaving(false);
        return;
      }
    }

    const next = {};
    tables.forEach((t, index) => {
      const assignedWaiter = eligible[index % eligible.length];
      next[t.id] = assignedWaiter.id;
    });
    setAssignments(next);
    soundManager.playSuccess();
    setMessage('Tables distributed evenly among active waiters!');
  };

  const handleSaveAssignments = async () => {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      soundManager.playPop();

      const payload = Object.entries(assignments).map(([tableId, waiterId]) => ({
        tableId: parseInt(tableId, 10),
        waiterId: waiterId ? parseInt(waiterId, 10) : null
      }));

      await api.assignTables({
        date: selectedDate,
        assignments: payload
      });

      soundManager.playSuccess();
      setMessage('Table assignments saved successfully!');
      loadData();
    } catch (err) {
      soundManager.playError();
      setError(err.message || 'Failed to save table assignments');
    } finally {
      setSaving(false);
    }
  };

  const presentWaiters = allWaiters.filter((w) => w.status === 'PRESENT');
  const pendingWaiters = allWaiters.filter((w) => w.status !== 'PRESENT');

  const displayedWaiters = allWaiters.filter((w) => {
    if (filterRoster === 'PRESENT') return w.status === 'PRESENT';
    if (filterRoster === 'PENDING') return w.status !== 'PRESENT';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">assignment_ind</span>
            <h3 className="text-base font-black text-gray-900 tracking-tight">
              Daily Table Assignment Matrix
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Assign tables to your waiters. New waiters can be marked present with 1 click or auto-marked upon assignment.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container-high">
            <span className="text-xs font-bold text-gray-500 uppercase">Working Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold focus:outline-none"
            />
          </div>

          <button
            onClick={handleAutoDistribute}
            disabled={allWaiters.length === 0}
            className="px-3.5 py-2 bg-secondary-container hover:bg-secondary-fixed text-on-secondary-container text-xs font-extrabold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
            Auto Distribute Tables
          </button>
        </div>
      </div>

      {/* Waiters Roster */}
      <div className="bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">
              Waiter Roster ({allWaiters.length} Active Waiters)
            </span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full font-mono">
              {presentWaiters.length} Present
            </span>
            {pendingWaiters.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full font-mono">
                {pendingWaiters.length} Unmarked/Absent
              </span>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-surface-container-high text-[11px] font-bold">
            <button
              onClick={() => { soundManager.playPop(); setFilterRoster('ALL'); }}
              className={`px-2.5 py-1 rounded-lg transition-all ${filterRoster === 'ALL'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              All ({allWaiters.length})
            </button>
            <button
              onClick={() => { soundManager.playPop(); setFilterRoster('PRESENT'); }}
              className={`px-2.5 py-1 rounded-lg transition-all ${filterRoster === 'PRESENT'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Present ({presentWaiters.length})
            </button>
            <button
              onClick={() => { soundManager.playPop(); setFilterRoster('PENDING'); }}
              className={`px-2.5 py-1 rounded-lg transition-all ${filterRoster === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Pending ({pendingWaiters.length})
            </button>
          </div>
        </div>

        {allWaiters.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600 text-[20px]">person_off</span>
              <span>No active Waiters found in the system. Add your waiters in <strong>Staff Management</strong>.</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {displayedWaiters.map((w) => {
              const assignedCount = Object.values(assignments).filter((id) => id === w.id).length;
              const isPresent = w.status === 'PRESENT';
              const isActionLoading = actionLoadingId === w.id;

              return (
                <div
                  key={w.id}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${isPresent
                      ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs'
                      : 'bg-amber-50/50 border-amber-300 shadow-2xs'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center text-xs shrink-0 ${isPresent
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-500 text-white'
                        }`}
                    >
                      {w.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-xs text-gray-900 truncate">
                          {w.name}
                        </span>
                        {w.waiter_username && (
                          <span className="text-[10px] text-gray-500 font-mono">
                            @{w.waiter_username}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded font-mono ${isPresent
                              ? 'bg-emerald-200 text-emerald-800'
                              : 'bg-amber-200 text-amber-900'
                            }`}
                        >
                          {w.status}
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono font-bold">
                          {assignedCount} {assignedCount === 1 ? 'Table' : 'Tables'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 1-Click Mark Present Action if not present */}
                  {!isPresent && (
                    <button
                      onClick={() => handleQuickMarkPresent(w.id)}
                      disabled={isActionLoading}
                      title="Click to mark Present for today"
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-xl shadow-xs shrink-0 flex items-center gap-1 transition-transform active:scale-95 disabled:opacity-50"
                    >
                      {isActionLoading ? (
                        <span className="material-symbols-outlined text-[12px] animate-spin">
                          progress_activity
                        </span>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[12px]">bolt</span>
                          <span>Present</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {message && (
        <div className="p-3.5 bg-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-error-container text-error rounded-2xl text-xs font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Tables Grid Assignment Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tables.map((table) => {
          const currentWaiterId = assignments[table.id] || '';
          const currentWaiter = allWaiters.find((w) => w.id === currentWaiterId);

          return (
            <div
              key={table.id}
              className="bg-white rounded-3xl p-5 border border-surface-container-high shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 font-mono uppercase">
                    RESTAURANT TABLE
                  </span>
                  <h4 className="text-2xl font-black text-gray-900">#{table.table_number}</h4>
                  <p className="text-[11px] text-gray-500 font-mono">
                    Capacity: {table.capacity} Guests
                  </p>
                </div>

                <span
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center ${currentWaiter
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-surface-container-high text-gray-400'
                    }`}
                >
                  <span className="material-symbols-outlined text-[22px]">table_restaurant</span>
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Assigned Waiter</span>
                  {currentWaiter && (
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${currentWaiter.status === 'PRESENT'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                        }`}
                    >
                      {currentWaiter.status}
                    </span>
                  )}
                </label>

                <select
                  value={currentWaiterId}
                  onChange={(e) => handleAssignChange(table.id, e.target.value)}
                  className={`w-full px-3 py-2 bg-surface-container-low border rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-secondary ${currentWaiterId
                      ? 'border-emerald-300 bg-emerald-50/30'
                      : 'border-gray-300'
                    }`}
                >
                  <option value="">-- Unassigned --</option>

                  {presentWaiters.length > 0 && (
                    <optgroup label="Present Waiters (Ready)">
                      {presentWaiters.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} (Present)
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {pendingWaiters.length > 0 && (
                    <optgroup label="Other Waiters (Auto-marks Present upon selection)">
                      {pendingWaiters.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.status} - Click to assign & mark present)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Save Bar */}
      <div className="sticky bottom-4 bg-white p-4 rounded-3xl border border-surface-container-high shadow-xl flex justify-between items-center z-30">
        <div className="text-xs text-gray-500 font-medium">
          Assignments are applied immediately to QR customer orders and Waiter handheld feeds.
        </div>
        <button
          onClick={handleSaveAssignments}
          disabled={saving}
          className="px-6 py-3 bg-primary hover:bg-primary-container text-white font-extrabold text-xs rounded-2xl shadow-md flex items-center gap-2 transition-transform active:scale-98 disabled:opacity-50"
        >
          {saving ? (
            <span className="material-symbols-outlined text-[18px] animate-spin">
              progress_activity
            </span>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">save</span>
              <span>Save Table Assignments</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
