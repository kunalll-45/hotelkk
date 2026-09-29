import React, { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { formatDate } from '../../../utils/formatters';

export default function AttendanceSpreadsheet() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStaffHistory, setSelectedStaffHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const loadDaily = async (date) => {
    try {
      setLoading(true);
      const data = await api.getDailyAttendance(date);
      setAttendanceData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDaily(selectedDate);
  }, [selectedDate]);

  const handleMarkStatus = async (staffId, status) => {
    try {
      setSavingId(staffId);
      await api.markAttendance({
        staffId,
        date: selectedDate,
        status,
        markedBy: 'Manager'
      });
      // Update local state immediately for spreadsheet feel
      setAttendanceData((prev) => ({
        ...prev,
        staff: prev.staff.map((s) => (s.id === staffId ? { ...s, status } : s))
      }));
    } catch (err) {
      alert(err.message || 'Failed to update attendance');
    } finally {
      setSavingId(null);
    }
  };

  const handleViewHistory = async (staffId) => {
    try {
      setLoadingHistory(true);
      const history = await api.getStaffAttendanceHistory(staffId);
      setSelectedStaffHistory(history);
    } catch (err) {
      alert(err.message || 'Failed to load staff history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const staff = attendanceData?.staff || [];
  const presentCount = staff.filter((s) => s.status === 'PRESENT').length;
  const absentCount = staff.filter((s) => s.status === 'ABSENT').length;
  const unmarkedCount = staff.filter((s) => s.status === 'UNMARKED').length;

  return (
    <div className="space-y-4">
      {/* Top Header & Date Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">calendar_month</span>
            <h3 className="text-base font-black text-gray-900 tracking-tight">
              Daily Staff Attendance Spreadsheet
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Only Waiters marked PRESENT can log into the Waiter app and receive table assignments today.
          </p>
        </div>

        {/* Date Selector & Stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container-high">
            <span className="text-xs font-bold text-gray-500 uppercase">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-bold font-mono">
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
              {presentCount} Present
            </span>
            <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg">
              {absentCount} Absent
            </span>
          </div>
        </div>
      </div>

      {/* Spreadsheet-like Attendance Grid */}
      <div className="bg-white rounded-3xl border border-surface-container-high overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low text-gray-700 font-extrabold uppercase tracking-wider border-b border-surface-container-high">
              <tr>
                <th className="py-3.5 px-4 w-12 text-center">#</th>
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Joining Date</th>
                <th className="py-3.5 px-4 text-center">Attendance for {selectedDate}</th>
                <th className="py-3.5 px-4 text-right">Lifetime History</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    <span className="material-symbols-outlined text-[32px] animate-spin text-secondary-container">progress_activity</span>
                    <p className="mt-2 text-xs">Loading attendance spreadsheet...</p>
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    No active staff members found.
                  </td>
                </tr>
              ) : (
                staff.map((s, idx) => {
                  const isPresent = s.status === 'PRESENT';
                  const isAbsent = s.status === 'ABSENT';
                  const isSaving = savingId === s.id;

                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors ${isPresent
                          ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                          : isAbsent
                            ? 'bg-rose-50/20 hover:bg-rose-50/40'
                            : 'hover:bg-surface-container-low/50'
                        }`}
                    >
                      <td className="py-3.5 px-4 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-surface-container-high text-primary flex items-center justify-center font-bold text-xs">
                            {s.name.charAt(0)}
                          </span>
                          <div>
                            <div>{s.name}</div>
                            {s.role === 'Waiter' && (
                              <span className="text-[10px] text-gray-400 font-mono">App Enabled</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${s.role === 'Waiter'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                          {s.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-gray-600 font-mono">{formatDate(s.joining_date)}</td>

                      {/* PRESENT / ABSENT Spreadsheet Toggle Buttons */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex rounded-xl p-1 bg-surface-container-high border border-surface-container-highest gap-1">
                          <button
                            onClick={() => handleMarkStatus(s.id, 'PRESENT')}
                            disabled={isSaving}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${isPresent
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-gray-600 hover:text-emerald-800 hover:bg-emerald-50'
                              }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">check</span>
                            PRESENT
                          </button>

                          <button
                            onClick={() => handleMarkStatus(s.id, 'ABSENT')}
                            disabled={isSaving}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${isAbsent
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'text-gray-600 hover:text-rose-800 hover:bg-rose-50'
                              }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                            ABSENT
                          </button>
                        </div>
                      </td>

                      {/* Lifetime History Inspection */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleViewHistory(s.id)}
                          className="px-3 py-1.5 text-xs font-bold text-secondary hover:text-on-secondary-container hover:bg-secondary-container/20 rounded-xl transition-colors inline-flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">history</span>
                          View Full Record
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Full Attendance History From Joining Date */}
      {selectedStaffHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-container-lowest max-w-lg w-full rounded-3xl p-6 shadow-2xl border border-surface-container-highest max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-start pb-4 border-b border-gray-100">
              <div>
                <span className="text-[10px] font-bold text-secondary uppercase tracking-widest font-mono">
                  STAFF ATTENDANCE AUDIT
                </span>
                <h3 className="font-black text-xl text-gray-900 mt-0.5">
                  {selectedStaffHistory.staff?.name}
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  Role: {selectedStaffHistory.staff?.role} • Joined {formatDate(selectedStaffHistory.staff?.joining_date)}
                </p>
              </div>

              <button
                onClick={() => setSelectedStaffHistory(null)}
                className="text-gray-400 hover:text-gray-700 p-1"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Attendance Rate Cards */}
            <div className="grid grid-cols-3 gap-2.5 my-4">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-center">
                <span className="text-xl font-black text-emerald-800 block">
                  {selectedStaffHistory.presentDays}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 uppercase">Present Days</span>
              </div>

              <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 text-center">
                <span className="text-xl font-black text-rose-800 block">
                  {selectedStaffHistory.absentDays}
                </span>
                <span className="text-[10px] font-bold text-rose-700 uppercase">Absent Days</span>
              </div>

              <div className="p-3 bg-surface-container-low rounded-2xl border border-gray-200 text-center">
                <span className="text-xl font-black text-primary block">
                  {selectedStaffHistory.attendanceRate}%
                </span>
                <span className="text-[10px] font-bold text-gray-600 uppercase">Attendance Rate</span>
              </div>
            </div>

            {/* History Table List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-2xl p-2 text-xs font-mono">
              {selectedStaffHistory.history?.map((h, i) => (
                <div key={i} className="py-2 px-3 flex justify-between items-center">
                  <span className="text-gray-700 font-bold">{h.date}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black ${h.status === 'PRESENT'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                      }`}
                  >
                    {h.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-4 mt-2 border-t border-gray-100 text-right">
              <button
                onClick={() => setSelectedStaffHistory(null)}
                className="px-5 py-2 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-xl"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
