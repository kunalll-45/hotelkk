import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../../utils/api';
import { useSocket } from '../../../context/SocketContext';
import { useAuth } from '../../../context/AuthContext';
import { soundManager } from '../../../utils/soundEffects';

export default function CancellationRequestsView() {
  const { socket } = useSocket();
  const { managerUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'PENDING' | 'COMPLETED' | 'REJECTED'
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState(null);

  const managerName = managerUser?.fullName || managerUser?.full_name || managerUser?.username || 'Manager';

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getCancellationRequests();
      setRequests(res.requests || []);
    } catch (err) {
      console.error('Failed to load cancellation requests:', err);
      setError(err.message || 'Failed to load cancellation requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  // Real-time socket events
  useEffect(() => {
    if (!socket) return;

    const handleNewCancellation = (newReq) => {
      try {
        soundManager.playBell();
      } catch (e) {}
      setRequests((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)]);
    };

    const handleUpdatedCancellation = (updatedReq) => {
      setRequests((prev) =>
        prev.map((r) => (r.id === updatedReq.id ? { ...r, ...updatedReq } : r))
      );
    };

    socket.on('cancellation:new', handleNewCancellation);
    socket.on('cancellation:updated', handleUpdatedCancellation);

    return () => {
      socket.off('cancellation:new', handleNewCancellation);
      socket.off('cancellation:updated', handleUpdatedCancellation);
    };
  }, [socket]);

  // Handle Manager Decision (Approve or Reject only)
  const handleDecision = async (cancellationId, decision) => {
    const actionLabel = decision === 'APPROVE' ? 'Approve & Disburse Refund' : 'Reject Refund';
    if (!window.confirm(`Are you sure you want to ${actionLabel} for this cancellation?`)) {
      return;
    }

    try {
      setProcessingId(cancellationId);
      soundManager.playPop();

      const res = await api.processRefundDecision(cancellationId, {
        decision,
        managerName
      });

      if (decision === 'APPROVE') {
        soundManager.playPaymentSuccess();
      } else {
        soundManager.playSuccess();
      }

      // Update in local state
      if (res.cancellationRequest) {
        setRequests((prev) =>
          prev.map((r) => (r.id === cancellationId ? res.cancellationRequest : r))
        );
      } else {
        loadRequests();
      }
    } catch (err) {
      soundManager.playError();
      alert(err.message || `Failed to ${decision.toLowerCase()} refund.`);
    } finally {
      setProcessingId(null);
    }
  };

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const matchesFilter =
        filterStatus === 'ALL' ||
        (filterStatus === 'PENDING' && req.status === 'PENDING') ||
        (filterStatus === 'COMPLETED' && (req.status === 'COMPLETED' || req.status === 'PROCESSING' || req.status === 'APPROVED')) ||
        (filterStatus === 'REJECTED' && (req.status === 'REJECTED' || req.status === 'FAILED'));

      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        req.customer_name?.toLowerCase().includes(q) ||
        req.customer_phone?.includes(q) ||
        req.booking_code?.toLowerCase().includes(q) ||
        req.customer_upi_id?.toLowerCase().includes(q) ||
        String(req.table_number || '').includes(q);

      return matchesFilter && matchesQuery;
    });
  }, [requests, filterStatus, searchQuery]);

  // Quick stats
  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'PENDING').length;
    const completed = requests.filter((r) => r.status === 'COMPLETED').length;
    const rejected = requests.filter((r) => r.status === 'REJECTED').length;
    const totalRefundDisbursed = requests
      .filter((r) => r.status === 'COMPLETED')
      .reduce((sum, r) => sum + (parseFloat(r.refund_amount) || 0), 0);

    return {
      total: requests.length,
      pending,
      completed,
      rejected,
      totalRefundDisbursed: totalRefundDisbursed.toFixed(2)
    };
  }, [requests]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return {
          label: 'Refund Pending',
          bg: 'bg-amber-100 text-amber-900 border-amber-300',
          icon: 'hourglass_top'
        };
      case 'APPROVED':
        return {
          label: 'Refund Approved',
          bg: 'bg-blue-100 text-blue-900 border-blue-300',
          icon: 'task_alt'
        };
      case 'PROCESSING':
        return {
          label: 'Refund Processing',
          bg: 'bg-purple-100 text-purple-900 border-purple-300',
          icon: 'sync'
        };
      case 'COMPLETED':
        return {
          label: 'Refund Completed',
          bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          icon: 'check_circle'
        };
      case 'REJECTED':
        return {
          label: 'Refund Rejected',
          bg: 'bg-rose-100 text-rose-900 border-rose-300',
          icon: 'cancel'
        };
      case 'FAILED':
        return {
          label: 'Refund Failed',
          bg: 'bg-red-100 text-red-900 border-red-300',
          icon: 'error'
        };
      default:
        return {
          label: status,
          bg: 'bg-gray-100 text-gray-800 border-gray-300',
          icon: 'info'
        };
    }
  };

  const formatRemainingHours = (hrs) => {
    if (hrs === undefined || hrs === null) return 'N/A';
    if (hrs > 24) {
      const days = (hrs / 24).toFixed(1);
      return `${hrs}h (${days} days) • >24h`;
    }
    if (hrs > 4) {
      return `${hrs}h • 4h-24h`;
    }
    return `${hrs}h • ≤4h`;
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest p-5 rounded-2xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <h2 className="text-lg font-black text-gray-900 tracking-tight">
              Cancelled Bookings / Cancellation Requests
            </h2>
            <span className="px-2.5 py-0.5 bg-secondary-container text-on-secondary-container font-mono text-[10px] font-black rounded-full uppercase">
              Refunds Desk
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Review customer cancellations, inspect system-calculated refunds based on cancellation time remaining, and approve or reject UPI refunds.
          </p>
        </div>

        <button
          onClick={() => {
            soundManager.playPop();
            loadRequests();
          }}
          className="px-3.5 py-2 bg-surface-container-low hover:bg-surface-container text-gray-700 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-surface-container-high cursor-pointer transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh Requests
        </button>
      </div>

      {/* 2. Key Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-surface-container-high shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-[22px]">hourglass_top</span>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">Pending Action</p>
            <p className="text-xl font-black text-amber-700">{stats.pending}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-surface-container-high shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-[22px]">check_circle</span>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">Refunds Completed</p>
            <p className="text-xl font-black text-emerald-700">{stats.completed}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-surface-container-high shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-[22px]">currency_rupee</span>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">Total Disbursed</p>
            <p className="text-xl font-black text-primary">₹{stats.totalRefundDisbursed}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-surface-container-high shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-[22px]">cancel</span>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">Rejected</p>
            <p className="text-xl font-black text-rose-700">{stats.rejected}</p>
          </div>
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-container-lowest p-3 rounded-2xl border border-surface-container-high">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All Requests', count: stats.total },
            { id: 'PENDING', label: 'Pending Approval', count: stats.pending },
            { id: 'COMPLETED', label: 'Completed', count: stats.completed },
            { id: 'REJECTED', label: 'Rejected', count: stats.rejected }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                soundManager.playPop();
                setFilterStatus(tab.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                filterStatus === tab.id
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-container-low text-gray-600 hover:text-gray-900 border border-surface-container-high'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterStatus === tab.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search name, phone, UPI, booking #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-container-low rounded-xl text-xs border border-surface-container-high focus:outline-none focus:border-primary text-gray-900"
          />
        </div>
      </div>

      {/* 4. Requests List / Table */}
      {loading ? (
        <div className="text-center py-16 bg-surface-container-lowest rounded-2xl border border-surface-container-high">
          <div className="inline-block w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs text-gray-500 font-bold">Loading cancellation requests...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-rose-600">error</span>
          <span>{error}</span>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-16 bg-surface-container-lowest rounded-2xl border border-surface-container-high">
          <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">event_busy</span>
          <p className="text-sm font-bold text-gray-600">No cancellation requests found</p>
          <p className="text-xs text-gray-400 mt-1">
            {filterStatus === 'PENDING'
              ? 'All cancellation requests have been reviewed and processed.'
              : 'Cancelled bookings and refund requests will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((req) => {
            const badge = getStatusBadge(req.status);
            const isProcessing = processingId === req.id;
            const isPending = req.status === 'PENDING';

            return (
              <div
                key={req.id}
                className="bg-surface-container-lowest border border-surface-container-high rounded-2xl p-5 space-y-4 shadow-xs hover:border-gray-300 transition-all"
              >
                {/* Header Row: Booking code, Table, and Status Badge */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-container-high pb-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 bg-primary/10 text-primary font-mono font-black text-sm rounded-lg">
                      {req.booking_code}
                    </span>
                    <span className="px-2.5 py-1 bg-secondary-container text-on-secondary-container font-extrabold text-xs rounded-lg">
                      Table #{req.table_number || 'N/A'}
                    </span>
                    <span className="text-xs text-gray-400">
                      ID: #{req.id} • Res #{req.reservation_id}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 border ${badge.bg}`}>
                      <span className="material-symbols-outlined text-[15px]">{badge.icon}</span>
                      {badge.label}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  {/* Column 1: Customer Details */}
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Customer Details</p>
                    <p className="font-black text-gray-900 text-sm">{req.customer_name}</p>
                    <p className="text-gray-600 font-mono flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">phone</span>
                      {req.customer_phone}
                    </p>
                    {req.customer_email && (
                      <p className="text-gray-500 truncate text-[11px]">{req.customer_email}</p>
                    )}
                  </div>

                  {/* Column 2: Booking & Cancellation Timestamps */}
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Booking Slot</p>
                    <p className="font-bold text-gray-900">{req.booking_date}</p>
                    <p className="text-primary font-bold">{req.booking_time}</p>
                    <div className="pt-1 text-[11px] text-gray-500">
                      <span className="text-gray-400">Cancelled at: </span>
                      <span className="font-mono">{formatDateTime(req.cancellation_date)}</span>
                    </div>
                  </div>

                  {/* Column 3: Time Remaining & Tier */}
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Time Remaining</p>
                    <p className="font-black text-gray-900 text-sm">
                      {formatRemainingHours(req.remaining_hours)}
                    </p>
                    <div className="inline-block px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-surface-container-high text-gray-700">
                      Tier: {req.refund_percentage}% Refund
                    </div>
                    <p className="text-[10px] text-gray-400">
                      Deposit: ₹{req.original_amount ? parseFloat(req.original_amount).toFixed(2) : '100.00'}
                    </p>
                  </div>

                  {/* Column 4: Refund Amount & UPI ID */}
                  <div className="space-y-1 bg-surface-container-low p-3 rounded-xl border border-surface-container-high">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Refund Calculation</p>
                    <p className="font-black text-primary text-base">
                      ₹{parseFloat(req.refund_amount || 0).toFixed(2)}
                      <span className="text-[11px] font-normal text-gray-500 ml-1">
                        ({req.refund_percentage}%)
                      </span>
                    </p>
                    <div className="pt-1">
                      <span className="text-[10px] text-gray-400 block">Customer UPI ID:</span>
                      <span className="font-mono font-bold text-gray-900 text-xs bg-white px-2 py-0.5 rounded border border-gray-200 block truncate select-all">
                        {req.customer_upi_id}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reason & Processed Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-surface-container-lowest p-3 rounded-xl border border-dashed border-surface-container-high">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                      Cancellation Reason:
                    </span>
                    <p className="text-gray-800 italic">
                      {req.reason ? `"${req.reason}"` : <span className="text-gray-400">No reason provided by guest</span>}
                    </p>
                  </div>

                  <div>
                    {req.status === 'COMPLETED' && (
                      <div className="space-y-0.5 text-[11px]">
                        <span className="text-emerald-800 font-bold block flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">verified</span>
                          Disbursed via Integrated Payment Gateway
                        </span>
                        <p className="text-gray-600 font-mono">
                          Tx ID: <span className="font-bold text-gray-900">{req.refund_transaction_id || 'N/A'}</span>
                        </p>
                        <p className="text-gray-500">
                          Approved by: {req.processed_by || 'Manager'} • {formatDateTime(req.processed_at)}
                        </p>
                      </div>
                    )}

                    {req.status === 'REJECTED' && (
                      <div className="space-y-0.5 text-[11px]">
                        <span className="text-rose-800 font-bold block flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">cancel</span>
                          Refund Request Declined
                        </span>
                        <p className="text-gray-500">
                          Reviewed by: {req.processed_by || 'Manager'} • {formatDateTime(req.processed_at)}
                        </p>
                      </div>
                    )}

                    {isPending && (
                      <div className="text-[11px] text-amber-800 font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">info</span>
                        Awaiting Manager Decision. System will disburse automatically upon approval.
                      </div>
                    )}
                  </div>
                </div>

                {/* Manager Action Buttons - ONLY Approve Refund and Reject Refund (No manual amount edit) */}
                {isPending && (
                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-surface-container-high">
                    <button
                      onClick={() => handleDecision(req.id, 'REJECT')}
                      disabled={isProcessing}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      Reject Refund
                    </button>

                    <button
                      onClick={() => handleDecision(req.id, 'APPROVE')}
                      disabled={isProcessing}
                      className="px-5 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Processing Payment Gateway...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                          Approve Refund (₹{parseFloat(req.refund_amount || 0).toFixed(2)})
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
