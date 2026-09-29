import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import { formatDate } from '../../../utils/formatters';
import { soundManager } from '../../../utils/soundEffects';

export default function StaffManagement({ staffList: initialStaffList, onRefresh }) {
  const [staffList, setStaffList] = useState(initialStaffList || []);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'Waiter' | 'Cook' | 'Helper' | 'Other'
  const [searchQuery, setSearchQuery] = useState('');

  // Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormData, setAddFormData] = useState({
    name: '',
    role: 'Waiter',
    phone: '',
    joiningDate: new Date().toISOString().split('T')[0],
    username: '',
    password: '',
    markPresentToday: true
  });
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit Modal State
  const [editingStaff, setEditingStaff] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    role: 'Waiter',
    phone: '',
    joiningDate: '',
    isActive: true,
    username: '',
    password: ''
  });
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Action loading IDs
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadStaff = async () => {
    try {
      setLoading(true);
      const data = await api.getStaff();
      setStaffList(data);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to load staff list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  useEffect(() => {
    if (initialStaffList && initialStaffList.length > 0) {
      setStaffList(initialStaffList);
    }
  }, [initialStaffList]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddError('');

    try {
      setSubmittingAdd(true);
      await api.createStaff(addFormData);
      soundManager.playSuccess();
      setShowAddModal(false);
      setAddFormData({
        name: '',
        role: 'Waiter',
        phone: '',
        joiningDate: new Date().toISOString().split('T')[0],
        username: '',
        password: '',
        markPresentToday: true
      });
      await loadStaff();
    } catch (err) {
      setAddError(err.message || 'Failed to create staff member.');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const openEditModal = (staff) => {
    setEditingStaff(staff);
    setEditFormData({
      name: staff.name,
      role: staff.role,
      phone: staff.phone || '',
      joiningDate: staff.joining_date,
      isActive: staff.is_active === 1,
      username: staff.waiter_username || '',
      password: ''
    });
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingStaff) return;
    setEditError('');

    try {
      setSubmittingEdit(true);
      await api.updateStaff(editingStaff.id, {
        name: editFormData.name.trim(),
        role: editFormData.role,
        phone: editFormData.phone.trim(),
        joiningDate: editFormData.joiningDate,
        isActive: editFormData.isActive,
        username: editFormData.username.trim() || undefined,
        password: editFormData.password.trim() || undefined
      });
      soundManager.playSuccess();
      setEditingStaff(null);
      await loadStaff();
    } catch (err) {
      setEditError(err.message || 'Failed to update staff member.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleToggleActive = async (staff) => {
    try {
      setActionLoadingId(staff.id);
      await api.updateStaff(staff.id, {
        isActive: staff.is_active !== 1
      });
      soundManager.playClick();
      await loadStaff();
    } catch (err) {
      alert(err.message || 'Failed to update status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkAttendance = async (staffId, status) => {
    try {
      setActionLoadingId(staffId);
      const today = new Date().toISOString().split('T')[0];
      await api.markAttendance({
        staffId,
        date: today,
        status,
        markedBy: 'Manager'
      });
      soundManager.playClick();
      await loadStaff();
    } catch (err) {
      alert(err.message || 'Failed to mark attendance.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteStaff = async (staff) => {
    const confirmMsg = `Are you sure you want to delete ${staff.name} (${staff.role})? This will permanently remove their profile, login credentials, and attendance records.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoadingId(staff.id);
      await api.deleteStaff(staff.id);
      soundManager.playRemove();
      await loadStaff();
    } catch (err) {
      alert(err.message || 'Failed to delete staff member.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const matchesRole = roleFilter === 'ALL' || s.role === roleFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.phone && s.phone.includes(q)) ||
      (s.waiter_username && s.waiter_username.toLowerCase().includes(q));
    return matchesRole && matchesSearch;
  });

  const waiterCount = staffList.filter((s) => s.role === 'Waiter').length;
  const activeWaiterCount = staffList.filter((s) => s.role === 'Waiter' && s.is_active === 1).length;

  return (
    <div className="space-y-4">
      {/* Top Header & Statistics Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">badge</span>
            <h3 className="text-base font-black text-gray-900 tracking-tight">
              Staff Management & Waiter Accounts
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage restaurant staff, waiter login credentials, active status, and daily shift availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-2xl border border-surface-container-high text-xs">
            <span className="text-gray-500">Waiters:</span>
            <span className="font-extrabold text-primary">
              {activeWaiterCount} Active / {waiterCount} Total
            </span>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            data-sound="pop"
            className="px-4 py-2 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-all hover:scale-105"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary-container">person_add</span>
            Add Staff / Waiter
          </button>
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 bg-surface-container-low p-1 rounded-2xl border border-surface-container-high">
          {[
            { id: 'ALL', label: 'All Staff' },
            { id: 'Waiter', label: 'Waiters' },
            { id: 'Cook', label: 'Kitchen Cooks' },
            { id: 'Helper', label: 'Helpers' },
            { id: 'Other', label: 'Other' }
          ].map((tab) => (
            <button
              key={tab.id}
              data-sound="filter"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${roleFilter === tab.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <span className="material-symbols-outlined absolute left-3 top-2 text-gray-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search staff, phone, username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-surface-container-high rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-gray-900"
          />
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-3xl border border-surface-container-high overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-20 text-center text-gray-400 text-xs">
            <span className="material-symbols-outlined text-[36px] animate-spin text-secondary">
              progress_activity
            </span>
            <p className="mt-2 font-medium">Loading staff profiles...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-xs">
            <span className="material-symbols-outlined text-[40px] text-gray-300">
              person_off
            </span>
            <p className="mt-2 font-medium">No staff members found matching the criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-gray-700 font-extrabold uppercase tracking-wider border-b border-surface-container-high">
                <tr>
                  <th className="py-3.5 px-4">Staff Member</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4">Login Username</th>
                  <th className="py-3.5 px-4">Today's Shift</th>
                  <th className="py-3.5 px-4">Account Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredStaff.map((staff) => (
                  <tr key={staff.id} className="hover:bg-surface-container-low/50 transition-colors">
                    {/* Staff Name & ID */}
                    <td className="py-3.5 px-4 font-bold text-gray-900 flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-secondary-container/40 text-on-secondary-container flex items-center justify-center font-black text-xs shrink-0">
                        {staff.name.charAt(0)}
                      </span>
                      <div>
                        <div className="font-bold text-gray-900">{staff.name}</div>
                        <span className="text-[10px] text-gray-400 font-mono">
                          ID: #{staff.id} • Joined: {formatDate(staff.joining_date)}
                        </span>
                      </div>
                    </td>

                    {/* Role Badge */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${staff.role === 'Waiter'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : staff.role === 'Cook'
                              ? 'bg-orange-100 text-orange-900 border border-orange-300'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                      >
                        {staff.role}
                      </span>
                    </td>

                    {/* Phone */}
                    <td className="py-3.5 px-4 font-mono text-gray-600">
                      {staff.phone || <span className="text-gray-400 italic">No phone</span>}
                    </td>

                    {/* Login Username */}
                    <td className="py-3.5 px-4">
                      {staff.role === 'Waiter' ? (
                        <div className="flex items-center gap-1 font-mono font-bold text-primary">
                          <span className="material-symbols-outlined text-[15px] text-emerald-600">key</span>
                          <span>{staff.waiter_username || '-'}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-[11px] italic">No App Login</span>
                      )}
                    </td>

                    {/* Today's Shift / Attendance Quick Toggle */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${staff.today_status === 'PRESENT'
                              ? 'bg-emerald-100 text-emerald-800'
                              : staff.today_status === 'ABSENT'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                        >
                          {staff.today_status}
                        </span>

                        {staff.today_status !== 'PRESENT' ? (
                          <button
                            onClick={() => handleMarkAttendance(staff.id, 'PRESENT')}
                            disabled={actionLoadingId === staff.id}
                            data-sound="pop"
                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-all shadow-2xs"
                            title="Mark Present for today so waiter is available for table assignments and login"
                          >
                            Mark Present
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMarkAttendance(staff.id, 'ABSENT')}
                            disabled={actionLoadingId === staff.id}
                            data-sound="remove"
                            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-[10px] font-medium transition-all"
                            title="Mark Absent"
                          >
                            Set Absent
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Account Status */}
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleActive(staff)}
                        disabled={actionLoadingId === staff.id}
                        data-sound="click"
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold transition-all ${staff.is_active === 1
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 border border-gray-300 hover:bg-gray-200'
                          }`}
                        title="Click to toggle Active / Inactive"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${staff.is_active === 1 ? 'bg-emerald-500' : 'bg-gray-400'
                            }`}
                        ></span>
                        {staff.is_active === 1 ? 'Active' : 'Suspended'}
                      </button>
                    </td>

                    {/* Actions: Edit, Credentials, Delete */}
                    <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(staff)}
                        data-sound="click"
                        className="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-gray-700 transition-colors"
                        title="Edit profile & credentials"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>

                      <button
                        onClick={() => handleDeleteStaff(staff)}
                        disabled={actionLoadingId === staff.id}
                        data-sound="remove"
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                        title="Delete staff member"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD STAFF MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-surface-container-highest">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">person_add</span>
                <h3 className="font-extrabold text-base text-gray-900">Add Staff Member</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                data-sound="click"
                className="text-gray-400 hover:text-gray-700"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl mt-3 text-xs font-bold">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Full Name *</label>
                <input
                  type="text"
                  value={addFormData.name}
                  onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })}
                  placeholder="e.g. Ramesh Pawar"
                  className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary text-gray-900 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Role *</label>
                  <select
                    value={addFormData.role}
                    onChange={(e) => setAddFormData({ ...addFormData, role: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-bold text-gray-900 focus:bg-white focus:outline-none"
                  >
                    <option value="Waiter">Waiter (Gets App Login)</option>
                    <option value="Cook">Cook</option>
                    <option value="Helper">Helper</option>
                    <option value="Other">Other Staff</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Joining Date *</label>
                  <input
                    type="date"
                    value={addFormData.joiningDate}
                    onChange={(e) => setAddFormData({ ...addFormData, joiningDate: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono text-gray-900 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={addFormData.phone}
                  onChange={(e) => setAddFormData({ ...addFormData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono text-gray-900 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Waiter Credentials (Mandatory only if Role is Waiter) */}
              {addFormData.role === 'Waiter' && (
                <div className="p-3.5 bg-secondary-container/20 border border-secondary-container rounded-2xl space-y-2.5">
                  <span className="text-[11px] font-extrabold uppercase text-on-secondary-container tracking-wider block">
                    Waiter Application Login Credentials
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Username *</label>
                      <input
                        type="text"
                        value={addFormData.username}
                        onChange={(e) => setAddFormData({ ...addFormData, username: e.target.value })}
                        placeholder="e.g. ramesh_w"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-900"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Password *</label>
                      <input
                        type="password"
                        value={addFormData.password}
                        onChange={(e) => setAddFormData({ ...addFormData, password: e.target.value })}
                        placeholder="Password"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-900"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Auto Mark Present Checkbox */}
              <label className="flex items-center gap-2 p-2.5 bg-surface-container-low rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={addFormData.markPresentToday}
                  onChange={(e) => setAddFormData({ ...addFormData, markPresentToday: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <span className="text-xs text-gray-800 font-bold">
                  Mark as PRESENT for today immediately
                  <span className="block text-[10px] text-gray-500 font-normal">
                    Enables waiter to appear in Table Assignment and log into the Waiter App right away.
                  </span>
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  data-sound="click"
                  className="flex-1 py-2.5 bg-surface-container-low hover:bg-surface-container font-bold text-gray-700 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  data-sound="success"
                  className="flex-1 py-2.5 bg-primary hover:bg-primary-container text-white font-extrabold rounded-xl shadow-sm transition-all"
                >
                  {submittingAdd ? 'Saving...' : 'Save Staff Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STAFF MODAL */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-surface-container-highest">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">edit</span>
                <h3 className="font-extrabold text-base text-gray-900">
                  Edit Staff Profile (#{editingStaff.id})
                </h3>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                data-sound="click"
                className="text-gray-400 hover:text-gray-700"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl mt-3 text-xs font-bold">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary text-gray-900 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Role *</label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-bold text-gray-900 focus:bg-white focus:outline-none"
                  >
                    <option value="Waiter">Waiter</option>
                    <option value="Cook">Cook</option>
                    <option value="Helper">Helper</option>
                    <option value="Other">Other Staff</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Joining Date *</label>
                  <input
                    type="date"
                    value={editFormData.joiningDate}
                    onChange={(e) => setEditFormData({ ...editFormData, joiningDate: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono text-gray-900 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono text-gray-900 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Waiter Credentials */}
              {editFormData.role === 'Waiter' && (
                <div className="p-3.5 bg-secondary-container/20 border border-secondary-container rounded-2xl space-y-2.5">
                  <span className="text-[11px] font-extrabold uppercase text-on-secondary-container tracking-wider block">
                    Waiter Application Credentials
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Username</label>
                      <input
                        type="text"
                        value={editFormData.username}
                        onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                        New Password (Optional)
                      </label>
                      <input
                        type="password"
                        value={editFormData.password}
                        onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                        placeholder="Leave blank to keep"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-900"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Active Toggle */}
              <label className="flex items-center gap-2 p-2.5 bg-surface-container-low rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={editFormData.isActive}
                  onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <span className="text-xs text-gray-800 font-bold">
                  Account is Active
                  <span className="block text-[10px] text-gray-500 font-normal">
                    If unchecked, staff member cannot log in and will be hidden from daily operations.
                  </span>
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  data-sound="click"
                  className="flex-1 py-2.5 bg-surface-container-low hover:bg-surface-container font-bold text-gray-700 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  data-sound="success"
                  className="flex-1 py-2.5 bg-primary hover:bg-primary-container text-white font-extrabold rounded-xl shadow-sm transition-all"
                >
                  {submittingEdit ? 'Saving...' : 'Update Staff Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
