import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import { formatTime, formatDate } from '../../../utils/formatters';
import { soundManager } from '../../../utils/soundEffects';

export default function OffersManagementView() {
  const [offers, setOffers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageProcessStatus, setImageProcessStatus] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    code: '',
    description: '',
    offerType: 'PERCENTAGE',
    discountValue: '',
    minOrderAmount: '',
    targetItemId: '',
    buyQty: 1,
    getQty: 1,
    startDate: '',
    startTime: '12:00',
    endDate: '',
    endTime: '23:59',
    imageUrl: '',
    status: 'ACTIVE'
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [offersData, menuData] = await Promise.all([
        api.getOffers(),
        api.getMenu()
      ]);
      setOffers(offersData);
      setMenuItems(menuData);
    } catch (err) {
      console.error('Failed to load offers or menu:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    soundManager.playPop();
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    setEditingOffer(null);
    setFormData({
      title: '',
      code: '',
      description: '',
      offerType: 'PERCENTAGE',
      discountValue: '20',
      minOrderAmount: '300',
      targetItemId: '',
      buyQty: 1,
      getQty: 1,
      startDate: today,
      startTime: '12:00',
      endDate: nextWeek,
      endTime: '23:59',
      imageUrl: '',
      status: 'ACTIVE'
    });
    setShowModal(true);
  };

  const openEditModal = (offer) => {
    soundManager.playPop();
    setEditingOffer(offer);

    let sDate = '';
    let sTime = '12:00';
    let eDate = '';
    let eTime = '23:59';

    if (offer.start_time) {
      const parts = offer.start_time.split('T');
      sDate = parts[0];
      if (parts[1]) sTime = parts[1].slice(0, 5);
    }
    if (offer.end_time) {
      const parts = offer.end_time.split('T');
      eDate = parts[0];
      if (parts[1]) eTime = parts[1].slice(0, 5);
    }

    setFormData({
      title: offer.title || '',
      code: offer.code || '',
      description: offer.description || '',
      offerType: offer.offer_type || 'PERCENTAGE',
      discountValue: offer.discount_value || '',
      minOrderAmount: offer.min_order_amount || '',
      targetItemId: offer.target_item_id || '',
      buyQty: offer.buy_qty || 1,
      getQty: offer.get_qty || 1,
      startDate: sDate,
      startTime: sTime,
      endDate: eDate,
      endTime: eTime,
      imageUrl: offer.image_url || '',
      status: offer.status || 'ACTIVE'
    });
    setShowModal(true);
  };

  // Quick Preset Handlers
  const applyPreset = (presetType) => {
    soundManager.playPop();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const pad = (n) => String(n).padStart(2, '0');
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if (presetType === '2_HOURS') {
      const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setFormData((prev) => ({
        ...prev,
        startDate: today,
        startTime: currentTime,
        endDate: end.toISOString().split('T')[0],
        endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`
      }));
    } else if (presetType === '1_DAY') {
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      setFormData((prev) => ({
        ...prev,
        startDate: today,
        startTime: currentTime,
        endDate: end.toISOString().split('T')[0],
        endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`
      }));
    } else if (presetType === '7_DAYS') {
      const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      setFormData((prev) => ({
        ...prev,
        startDate: today,
        startTime: currentTime,
        endDate: end.toISOString().split('T')[0],
        endTime: '23:59'
      }));
    } else if (presetType === 'FUTURE_7_DAYS') {
      // Future scheduled start in 7 days for 3 days duration
      const futureStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const futureEnd = new Date(futureStart.getTime() + 3 * 24 * 60 * 60 * 1000);
      setFormData((prev) => ({
        ...prev,
        startDate: futureStart.toISOString().split('T')[0],
        startTime: '12:00',
        endDate: futureEnd.toISOString().split('T')[0],
        endTime: '23:59'
      }));
    }
  };

  // Handle Image File Upload (Requirement 14)
  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      setImageProcessStatus('Uploading to S3 (new/)...');
      const res = await api.uploadImage(file, formData.title || 'offer', 'new', 'offer', editingOffer?.id);
      setFormData((prev) => ({ ...prev, imageUrl: res.url }));
      soundManager.playSuccess();

      if (res.status === 'PENDING' && res.imageId) {
        setImageProcessStatus('Waiting for 1:1 square compression...');
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await api.getImageStatus(res.imageId);
            if (statusRes.isReady || statusRes.status === 'COMPLETED') {
              clearInterval(interval);
              setImageProcessStatus('1:1 square compressed image ready');
              setTimeout(() => setImageProcessStatus(''), 2500);
            } else if (attempts >= 6) {
              clearInterval(interval);
              setImageProcessStatus('Lambda processing queued');
              setTimeout(() => setImageProcessStatus(''), 2500);
            }
          } catch (e) {
            clearInterval(interval);
            setImageProcessStatus('');
          }
        }, 1500);
      }
    } catch (err) {
      alert(err.message || 'Image upload failed.');
      soundManager.playError();
      setImageProcessStatus('');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      soundManager.playPop();

      // Format ISO datetime
      const startDateTime = formData.startDate
        ? `${formData.startDate}T${formData.startTime || '00:00'}:00`
        : null;
      const endDateTime = formData.endDate
        ? `${formData.endDate}T${formData.endTime || '23:59'}:00`
        : null;

      const payload = {
        title: formData.title.trim(),
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim(),
        offerType: formData.offerType,
        discountValue: parseFloat(formData.discountValue) || 0,
        minOrderAmount: parseFloat(formData.minOrderAmount) || 0,
        targetItemId: formData.targetItemId ? parseInt(formData.targetItemId, 10) : null,
        buyQty: parseInt(formData.buyQty, 10) || 1,
        getQty: parseInt(formData.getQty, 10) || 1,
        startTime: startDateTime,
        endTime: endDateTime,
        imageUrl: formData.imageUrl ? formData.imageUrl.trim() : null,
        status: formData.status
      };

      if (editingOffer) {
        await api.updateOffer(editingOffer.id, payload);
      } else {
        await api.createOffer(payload);
      }

      soundManager.playSuccess();
      setShowModal(false);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to save offer.');
      soundManager.playError();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete offer "${title}"?`)) return;
    try {
      soundManager.playPop();
      await api.deleteOffer(id);
      soundManager.playSuccess();
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete offer.');
    }
  };

  const handleToggle = async (id) => {
    try {
      soundManager.playPop();
      await api.toggleOffer(id);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to toggle offer.');
    }
  };

  const filteredOffers = offers.filter((o) => {
    if (statusFilter === 'ALL') return true;
    return o.status === statusFilter;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return {
          label: 'Active',
          cls: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          dot: 'bg-emerald-500 animate-pulse'
        };
      case 'SCHEDULED':
        return {
          label: 'Upcoming / Scheduled',
          cls: 'bg-amber-100 text-amber-800 border-amber-300',
          dot: 'bg-amber-500'
        };
      case 'EXPIRED':
        return {
          label: 'Expired',
          cls: 'bg-gray-100 text-gray-600 border-gray-300',
          dot: 'bg-gray-400'
        };
      case 'DRAFT':
      default:
        return {
          label: 'Draft',
          cls: 'bg-slate-100 text-slate-700 border-slate-300',
          dot: 'bg-slate-400'
        };
    }
  };

  const getOfferTypeLabel = (type) => {
    switch (type) {
      case 'PERCENTAGE': return '% Discount';
      case 'FLAT': return '₹ Flat Discount';
      case 'FREE_ITEM': return 'Free Item';
      case 'SPECIAL_PRICE': return 'Special Price';
      case 'BOGO': return 'Buy X Get Y';
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[26px]">local_offer</span>
            <h2 className="text-lg font-black text-gray-900 tracking-tight">MANAGE OFFERS & PROMOTIONS</h2>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Create promotional deals, percentage/flat discounts, BOGO specials, and schedule future pre-offers for the homepage slider.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-surface-container-high text-xs font-bold">
            {['ALL', 'ACTIVE', 'SCHEDULED', 'EXPIRED', 'DRAFT'].map((st) => (
              <button
                key={st}
                onClick={() => { soundManager.playPop(); setStatusFilter(st); }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === st ? 'bg-primary text-white shadow-xs font-extrabold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {st === 'ALL' ? 'All Offers' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-primary hover:bg-primary-container text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Create New Offer
          </button>
        </div>
      </div>

      {/* Offers Grid */}
      {loading ? (
        <div className="py-20 text-center text-gray-400">
          <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
          <p className="text-xs font-bold mt-2">Loading promotional offers...</p>
        </div>
      ) : filteredOffers.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-gray-300 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl">local_offer</span>
          </div>
          <h3 className="text-sm font-black text-gray-800">No Offers Found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Create promotional offers such as 20% off pizzas, Flat ₹100 discounts, or scheduled upcoming deals.
          </p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow cursor-pointer"
          >
            Create First Offer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOffers.map((offer) => {
            const badge = getStatusBadge(offer.status);
            // Fallback image resolution: uploaded offer image -> target menu item image -> placeholder
            const targetItem = menuItems.find((m) => m.id === offer.target_item_id);
            const displayImage = offer.image_url || targetItem?.image_url || null;

            return (
              <div
                key={offer.id}
                className="bg-white rounded-3xl border border-surface-container-high shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between"
              >
                {/* Image Banner & Badge */}
                <div className="relative h-40 bg-surface-container-high overflow-hidden">
                  {displayImage ? (
                    <img
                      src={displayImage}
                      alt={offer.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-linear-to-br from-amber-50 to-orange-100">
                      <span className="material-symbols-outlined text-4xl text-amber-600">redeem</span>
                      <span className="text-[11px] font-bold mt-1 text-amber-800 font-mono">{offer.code}</span>
                    </div>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black/80 backdrop-blur-md text-amber-300 font-black text-[11px] rounded-xl font-mono shadow">
                      {offer.code}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border backdrop-blur-md shadow-xs ${badge.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                      {badge.label}
                    </span>
                  </div>

                  {/* Offer Value Pill */}
                  <div className="absolute bottom-3 left-3">
                    <span className="px-3 py-1 bg-primary text-white font-black text-xs rounded-xl shadow-md font-mono">
                      {offer.offer_type === 'PERCENTAGE' && `${offer.discount_value}% OFF`}
                      {offer.offer_type === 'FLAT' && `₹${offer.discount_value} OFF`}
                      {offer.offer_type === 'SPECIAL_PRICE' && `Special @ ₹${offer.discount_value}`}
                      {offer.offer_type === 'FREE_ITEM' && 'FREE ITEM'}
                      {offer.offer_type === 'BOGO' && `BUY ${offer.buy_qty} GET ${offer.get_qty} FREE`}
                    </span>
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-black text-gray-900 leading-tight">
                        {offer.title}
                      </h3>
                      <span className="text-[10px] font-bold text-gray-500 bg-surface-container-low px-2 py-0.5 rounded-lg shrink-0">
                        {getOfferTypeLabel(offer.offer_type)}
                      </span>
                    </div>

                    {offer.description && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {offer.description}
                      </p>
                    )}

                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-[11px] text-gray-600">
                      {targetItem && (
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <span className="material-symbols-outlined text-[15px] text-amber-600">restaurant</span>
                          <span>Applies to: <strong>{targetItem.name}</strong></span>
                        </div>
                      )}

                      {offer.min_order_amount > 0 && (
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <span className="material-symbols-outlined text-[15px] text-emerald-600">shopping_cart</span>
                          <span>Min order: ₹{offer.min_order_amount}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 text-gray-500 font-mono text-[10px]">
                        <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                        <span>
                          {offer.start_time ? offer.start_time.replace('T', ' ') : 'Now'} → {offer.end_time ? offer.end_time.replace('T', ' ') : 'Ongoing'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleToggle(offer.id)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                        offer.is_active
                          ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={offer.is_active ? 'Offer is Enabled (Click to Disable)' : 'Offer is Disabled (Click to Enable)'}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {offer.is_active ? 'toggle_on' : 'toggle_off'}
                      </span>
                      <span>{offer.is_active ? 'Enabled' : 'Disabled'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(offer)}
                        className="p-1.5 text-gray-600 hover:text-primary rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
                        title="Edit Offer"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(offer.id, offer.title)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete Offer"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Offer Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-black text-gray-900">
                  {editingOffer ? 'Edit Promotional Offer' : 'Create New Promotional Offer'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure discount formula, scheduling validity, dish association & banner image.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              {/* Title & Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Offer Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 20% OFF on Pizza"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Promo Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PIZZA20"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono font-bold focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
              </div>

              {/* Offer Type & Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Offer Format / Type
                  </label>
                  <select
                    value={formData.offerType}
                    onChange={(e) => setFormData({ ...formData, offerType: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-bold focus:outline-none"
                  >
                    <option value="PERCENTAGE">Percentage Discount (%)</option>
                    <option value="FLAT">Flat Discount (₹ Amount)</option>
                    <option value="SPECIAL_PRICE">Special Fixed Price (₹)</option>
                    <option value="FREE_ITEM">Free Item on Order</option>
                    <option value="BOGO">Buy X Get Y Free</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase tracking-wider mb-1">
                    {formData.offerType === 'PERCENTAGE' && 'Discount Percentage (%) *'}
                    {formData.offerType === 'FLAT' && 'Flat Discount (₹) *'}
                    {formData.offerType === 'SPECIAL_PRICE' && 'Special Deal Price (₹) *'}
                    {formData.offerType === 'FREE_ITEM' && 'Item Value (₹)'}
                    {formData.offerType === 'BOGO' && 'BOGO Configuration'}
                  </label>
                  {formData.offerType === 'BOGO' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="Buy Qty"
                        value={formData.buyQty}
                        onChange={(e) => setFormData({ ...formData, buyQty: e.target.value })}
                        className="w-1/2 px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono font-bold focus:outline-none"
                      />
                      <span className="font-bold text-gray-500">for</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="Get Qty"
                        value={formData.getQty}
                        onChange={(e) => setFormData({ ...formData, getQty: e.target.value })}
                        className="w-1/2 px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono font-bold focus:outline-none"
                      />
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 20 or 100"
                      value={formData.discountValue}
                      onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono font-bold focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  )}
                </div>
              </div>

              {/* Target Menu Item & Min Order */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Specific Menu Item (Optional)
                  </label>
                  <select
                    value={formData.targetItemId}
                    onChange={(e) => setFormData({ ...formData, targetItemId: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-medium focus:outline-none"
                  >
                    <option value="">All Menu Items (Entire Order)</option>
                    {menuItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (₹{item.price})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Minimum Order Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 for no minimum"
                    value={formData.minOrderAmount}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono font-bold focus:outline-none"
                  />
                </div>
              </div>

              {/* Scheduling & Validity (Requirement 12) */}
              <div className="p-3.5 bg-surface-container-low rounded-2xl border border-surface-container-high space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-gray-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
                    Offer Validity & Scheduling
                  </span>

                  {/* Presets */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-400 font-bold">Presets:</span>
                    <button
                      type="button"
                      onClick={() => applyPreset('2_HOURS')}
                      className="px-2 py-0.5 bg-white hover:bg-gray-100 rounded text-[10px] font-bold border border-gray-200 cursor-pointer"
                    >
                      2h
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('1_DAY')}
                      className="px-2 py-0.5 bg-white hover:bg-gray-100 rounded text-[10px] font-bold border border-gray-200 cursor-pointer"
                    >
                      1 Day
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('7_DAYS')}
                      className="px-2 py-0.5 bg-white hover:bg-gray-100 rounded text-[10px] font-bold border border-gray-200 cursor-pointer"
                    >
                      7 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('FUTURE_7_DAYS')}
                      className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[10px] font-bold border border-amber-300 cursor-pointer"
                      title="Schedule to start in 7 days"
                    >
                      Future Promo (+7d)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">
                      Start Date & Time (Opens)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        required
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        className="w-2/3 px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-mono text-xs focus:outline-none"
                      />
                      <input
                        type="time"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                        className="w-1/3 px-2 py-1.5 bg-white border border-gray-300 rounded-xl font-mono text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">
                      End Date & Time (Expires)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        required
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="w-2/3 px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-mono text-xs focus:outline-none"
                      />
                      <input
                        type="time"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                        className="w-1/3 px-2 py-1.5 bg-white border border-gray-300 rounded-xl font-mono text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Promotional Image Upload (Requirement 14: Optional file upload with fallback) */}
              <div className="space-y-1.5">
                <label className="block font-bold text-gray-700 uppercase tracking-wider">
                  Promotional Image (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary file:text-white hover:file:bg-primary-container cursor-pointer"
                  />
                  {uploadingImage && (
                    <span className="text-[11px] text-primary font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      {imageProcessStatus || 'Uploading...'}
                    </span>
                  )}
                  {!uploadingImage && imageProcessStatus && (
                    <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      {imageProcessStatus}
                    </span>
                  )}
                </div>

                {formData.imageUrl && (
                  <div className="mt-2 flex items-center gap-3 bg-surface-container-low p-2 rounded-xl border border-gray-200">
                    <img src={formData.imageUrl} alt="Preview" className="w-12 h-12 object-cover rounded-lg" />
                    <span className="text-[10px] font-mono text-gray-500 truncate flex-1">{formData.imageUrl}</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, imageUrl: '' })}
                      className="text-rose-600 font-bold hover:underline text-xs"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-gray-500">
                  If left empty, will automatically fall back to the associated menu item's image.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Terms / Description
                </label>
                <textarea
                  rows="2"
                  placeholder="Terms and conditions for this promotional deal..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-secondary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="px-5 py-2 bg-primary hover:bg-primary-container text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingOffer ? 'Update Offer' : 'Publish Offer'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
