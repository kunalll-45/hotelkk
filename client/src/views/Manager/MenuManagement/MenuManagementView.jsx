import React, { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { formatCurrency, getS3ImageUrl, isS3ImageUrl } from '../../../utils/formatters';

export default function MenuManagementView() {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Main Course',
    price: '',
    isVeg: 1,
    description: '',
    imageUrl: '',
    isFeatured: 0,
    sendToKitchen: 1
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageProcessStatus, setImageProcessStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const loadMenu = async () => {
    try {
      setLoading(true);
      const data = await api.getMenu();
      setMenuItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMenu();
  }, []);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      category: 'Main Course',
      price: '',
      isVeg: 1,
      description: '',
      imageUrl: '',
      isFeatured: 0,
      sendToKitchen: 1
    });
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      price: item.price,
      isVeg: item.is_veg,
      description: item.description || '',
      imageUrl: item.image_url || '',
      isFeatured: item.is_featured || 0,
      sendToKitchen: item.send_to_kitchen !== undefined ? item.send_to_kitchen : 1
    });
    setError('');
    setShowModal(true);
  };

  const handleToggleKitchen = async (id) => {
    try {
      await api.toggleKitchenPrep(id);
      loadMenu();
    } catch (err) {
      alert(err.message || 'Failed to toggle kitchen routing');
    }
  };

  const handleToggleAvailability = async (id) => {
    try {
      await api.toggleMenuAvailability(id);
      loadMenu();
    } catch (err) {
      alert(err.message || 'Failed to toggle availability');
    }
  };

  const handleToggleFeatured = async (id) => {
    try {
      await api.toggleMenuFeatured(id);
      loadMenu();
    } catch (err) {
      alert(err.message || 'Failed to toggle featured status');
    }
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      setImageProcessStatus('Uploading to S3 (new/)...');
      const res = await api.uploadImage(file, formData.name || 'dish', 'new', 'menu_item', editingItem?.id);
      setFormData((prev) => ({ ...prev, imageUrl: res.url }));

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
          } catch (pollErr) {
            clearInterval(interval);
            setImageProcessStatus('');
          }
        }, 1500);
      }
    } catch (err) {
      alert(err.message || 'Failed to upload dish image.');
      setImageProcessStatus('');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteItem = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will also remove unused S3 photos.`)) return;
    try {
      await api.deleteMenuItem(id);
      loadMenu();
    } catch (err) {
      alert(err.message || 'Failed to delete dish');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setSubmitting(true);
      if (editingItem) {
        await api.updateMenuItem(editingItem.id, formData);
      } else {
        await api.createMenuItem(formData);
      }
      setShowModal(false);
      loadMenu();
    } catch (err) {
      setError(err.message || 'Failed to save menu item');
    } finally {
      setSubmitting(false);
    }
  };

  const categories = ['ALL', ...new Set(menuItems.map((m) => m.category))];

  const filteredItems = menuItems.filter((m) => {
    if (selectedCategory !== 'ALL' && m.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-3xl border border-surface-container-high shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">menu_book</span>
            <h3 className="text-base font-black text-gray-900 tracking-tight">
              Restaurant Menu & Food Item ID System
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Sequential Food IDs start from #1 and are used by Manager for rapid off-app manual billing.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-xl shadow flex items-center gap-1.5 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add New Dish
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all ${selectedCategory === cat
                ? 'bg-primary text-white shadow-xs'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Food Items Table */}
      <div className="bg-white rounded-3xl border border-surface-container-high overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-surface-container-low text-gray-700 font-extrabold uppercase tracking-wider border-b border-surface-container-high">
              <tr>
                <th className="py-3.5 px-4 font-mono">Food ID</th>
                <th className="py-3.5 px-4">Dish Name</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Price</th>
                <th className="py-3.5 px-4">Diet</th>
                <th className="py-3.5 px-4 text-center">Kitchen Prep (KDS)</th>
                <th className="py-3.5 px-4 text-center">Top / Featured</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    <span className="material-symbols-outlined text-[32px] animate-spin text-secondary-container">progress_activity</span>
                    <p className="mt-2 text-xs">Loading menu items...</p>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    No menu items in this category.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isAvail = item.is_available === 1;
                  const isFeatured = item.is_featured === 1;
                  const isKitchen = item.send_to_kitchen !== 0;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-surface-container-low/50 transition-colors ${!isAvail ? 'opacity-60 bg-gray-50' : ''
                        }`}
                    >
                      <td className="py-3 px-4 font-mono font-black text-secondary text-sm">
                        #{item.id}
                      </td>

                      <td className="py-3 px-4 font-bold text-gray-900 flex items-center gap-3">
                        <div className="h-10 w-12 rounded-lg bg-surface-container-high overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                          {isS3ImageUrl(item.image_url) ? (
                            <img
                              src={getS3ImageUrl(item.image_url)}
                              alt={item.name}
                              className="max-h-full max-w-full w-auto h-auto object-contain rounded"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <span className="material-symbols-outlined text-gray-400 text-lg">restaurant</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {isFeatured && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider">
                                Top
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 font-normal truncate max-w-xs">
                            {item.description || 'Prepared fresh daily.'}
                          </p>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-surface-container-high text-gray-700 text-[11px] font-bold">
                          {item.category}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-black text-primary font-mono text-sm">
                        ₹{item.price}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`w-3.5 h-3.5 border-2 rounded-sm inline-flex items-center justify-center p-0.5 ${item.is_veg ? 'border-emerald-600' : 'border-rose-600'
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${item.is_veg ? 'bg-emerald-600' : 'bg-rose-600'
                              }`}
                          ></span>
                        </span>
                      </td>

                      {/* Send to Kitchen Display Toggle */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleKitchen(item.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-black inline-flex items-center gap-1 transition-all cursor-pointer ${isKitchen
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-300 hover:bg-slate-200'
                            }`}
                          title={isKitchen ? 'Sent to Kitchen Queue (Click to bypass kitchen)' : 'Direct Serve / Non-Kitchen (Click to route to kitchen)'}
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            {isKitchen ? 'skillet' : 'inventory_2'}
                          </span>
                          <span>{isKitchen ? 'Kitchen: ON' : 'Direct: OFF'}</span>
                        </button>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleFeatured(item.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-black inline-flex items-center gap-1 transition-all ${isFeatured
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 shadow-2xs'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200'
                            }`}
                          title={isFeatured ? 'Featured in Hero Top Dishes Slider (Click to remove)' : 'Click to feature in Hero Top Dishes Slider'}
                        >
                          <span className={`material-symbols-outlined text-[15px] ${isFeatured ? 'text-amber-600 icon-fill' : 'text-gray-400'}`}>
                            stars
                          </span>
                          {isFeatured ? 'Top Dish' : 'Standard'}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleAvailability(item.id)}
                          className={`px-3 py-1 rounded-full text-[11px] font-black transition-all ${isAvail
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                            }`}
                        >
                          {isAvail ? 'Available' : 'Unavailable'}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="px-3 py-1 bg-surface-container-high hover:bg-surface-variant font-bold text-gray-700 rounded-lg text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 font-bold text-rose-700 border border-rose-200 rounded-lg text-xs transition-colors"
                            title="Delete dish and cleanup photo"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Dish Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-3xl p-4 sm:p-6 shadow-2xl border border-surface-container-highest max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-black text-base text-gray-900">
                {editingItem ? `Edit Dish #${editingItem.id}` : 'Add New Dish to Menu'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {error && (
              <div className="p-3 bg-error-container text-error rounded-xl mt-3 text-xs font-bold">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Dish Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Paneer Tikka Royale"
                  className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-bold focus:outline-none"
                  >
                    <option value="Starters">Starters</option>
                    <option value="Main Course">Main Course</option>
                    <option value="Breads">Breads</option>
                    <option value="Rice & Biryani">Rice & Biryani</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Desserts">Desserts</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="280"
                    className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono font-bold focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Diet Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 font-bold text-emerald-700 cursor-pointer">
                    <input
                      type="radio"
                      name="diet"
                      checked={formData.isVeg === 1}
                      onChange={() => setFormData({ ...formData, isVeg: 1 })}
                    />
                    Vegetarian
                  </label>
                  <label className="flex items-center gap-2 font-bold text-rose-700 cursor-pointer">
                    <input
                      type="radio"
                      name="diet"
                      checked={formData.isVeg === 0}
                      onChange={() => setFormData({ ...formData, isVeg: 0 })}
                    />
                    Non-Vegetarian
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Description</label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ingredients and culinary notes..."
                  className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl focus:outline-none"
                ></textarea>
              </div>

              {/* Image Upload & URL (Requirement 15: Optional image upload field) */}
              <div className="space-y-2">
                <label className="block font-bold text-gray-700 uppercase">
                  Dish Photo (Optional Upload or URL)
                </label>

                {/* File Upload Input */}
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

                {/* Image URL fallback / manual edit */}
                <input
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="Or paste image URL (e.g. /uploads/... or https://...)"
                  className="w-full px-3 py-2 bg-surface-container-low border border-gray-300 rounded-xl font-mono text-[11px] focus:outline-none"
                />

                {/* Image Preview - Original Aspect Ratio */}
                {formData.imageUrl && isS3ImageUrl(formData.imageUrl) && (
                  <div className="flex items-center gap-3 bg-surface-container-low p-2 rounded-xl border border-gray-200">
                    <div className="h-16 w-20 flex items-center justify-center bg-black/5 rounded-lg overflow-hidden p-1 shrink-0">
                      <img
                        src={getS3ImageUrl(formData.imageUrl)}
                        alt="Dish Preview"
                        className="max-h-full max-w-full w-auto h-auto object-contain rounded"
                      />
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 truncate flex-1">{formData.imageUrl}</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, imageUrl: '' })}
                      className="text-rose-600 font-bold hover:underline text-xs"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Send to Kitchen Display Routing Switch */}
              <div className="p-3 rounded-xl bg-surface-container-low border border-gray-200">
                <label className="flex items-center justify-between font-bold text-gray-800 cursor-pointer text-xs">
                  <div>
                    <span className="flex items-center gap-1.5 text-gray-900">
                      <span className="material-symbols-outlined text-emerald-600 text-[16px]">skillet</span>
                      <span>Send to Kitchen Display (KDS)</span>
                    </span>
                    <span className="text-[10px] text-gray-500 font-normal block mt-0.5">
                      Uncheck for direct-serve packaged goods (water bottles, cans, etc.)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.sendToKitchen !== 0}
                    onChange={(e) => setFormData({ ...formData, sendToKitchen: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                  />
                </label>
              </div>

              <div className="p-3 rounded-xl bg-surface-container-low border border-gray-200">
                <label className="flex items-center gap-2.5 font-bold text-gray-800 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={formData.isFeatured === 1}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded text-secondary focus:ring-secondary accent-amber-600"
                  />
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-600 text-[16px]">stars</span>
                    <span>Mark as Top Dish / Featured (Shows in Hero Slider)</span>
                  </span>
                </label>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 bg-surface-container-high hover:bg-surface-variant font-bold text-gray-700 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary-container text-white font-extrabold rounded-xl shadow-sm"
                >
                  {submitting ? 'Saving...' : 'Save Dish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
