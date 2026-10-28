import React, { useState, useEffect } from 'react';
import { formatCurrency, getS3ImageUrl } from '../../utils/formatters';

export default function CustomerMenu({
  menuItems,
  items,
  cart = {},
  updateCartQty,
  openCart,
  onOpenCart,
  isViewOnly = false
}) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingPhotoItem, setViewingPhotoItem] = useState(null);

  const effectiveItems = Array.isArray(menuItems) ? menuItems : (Array.isArray(items) ? items : []);
  const handleOpenCart = openCart || onOpenCart;

  // Close photo modal on Escape key press
  useEffect(() => {
    if (!viewingPhotoItem) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setViewingPhotoItem(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingPhotoItem]);

  const categories = ['All', ...new Set(effectiveItems.map((m) => m.category).filter(Boolean))];

  const filteredItems = effectiveItems.filter((item) => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
    if (vegOnly && !item.is_veg) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return item.name?.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
    }
    return true;
  });

  const cartTotalCount = Object.values(cart).reduce((sum, it) => sum + (it?.qty || 0), 0);
  const cartSubtotal = Object.values(cart).reduce((sum, it) => sum + (it?.price || 0) * (it?.qty || 0), 0);

  return (
    <div className="pb-28">
      {/* Category Pills & Filters */}
      <div className="sticky top-0 bg-surface/95 backdrop-blur-md pt-3 pb-2 z-20 border-b border-surface-container-high">
        {/* Search & Veg Toggle Bar */}
        <div className="flex items-center gap-2 px-4 mb-2.5">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-gray-400">search</span>
            <input
              type="text"
              placeholder="Search royal dishes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-surface-container-highest rounded-full focus:outline-none focus:ring-1 focus:ring-secondary text-gray-900 shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}
          </div>

          <button
            onClick={() => setVegOnly(!vegOnly)}
            className={`px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors border ${
              vegOnly
                ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                : 'bg-white border-surface-container-highest text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="w-2.5 h-2.5 border-2 border-emerald-600 rounded-sm flex items-center justify-center p-0.5">
              <span className="w-1 h-1 rounded-full bg-emerald-600"></span>
            </span>
            Veg Only
          </button>
        </div>

        {/* Categories Horizontal Scroll */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 scrollbar-none py-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-primary text-white font-bold shadow-sm'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Item Grid */}
      <div className="p-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <span className="material-symbols-outlined text-[48px] text-gray-300">restaurant_menu</span>
            <p className="text-sm font-medium mt-2">No matching dishes found.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const inCartQty = cart[item.id]?.qty || 0;
            const s3PhotoUrl = getS3ImageUrl(item.image_url);

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-surface-container-high flex gap-3.5 items-center transition-all hover:shadow-md"
              >
                {/* Food Photo from AWS S3 - Original Aspect Ratio, No Square Forcing */}
                {s3PhotoUrl ? (
                  <div
                    onClick={() => setViewingPhotoItem(item)}
                    title="Click to view full photo from AWS S3"
                    className="group/thumb relative h-24 w-28 max-w-[120px] rounded-xl overflow-hidden bg-neutral-900/5 shrink-0 shadow-inner cursor-pointer flex items-center justify-center p-1 border border-surface-container-high"
                  >
                    <img
                      src={s3PhotoUrl}
                      alt={item.name}
                      className="max-h-full max-w-full w-auto h-auto object-contain transition-transform duration-300 group-hover/thumb:scale-105"
                      loading="lazy"
                    />
                    {/* Food Item ID Badge */}
                    <span className="absolute top-1.5 left-1.5 bg-black/75 text-white font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded backdrop-blur-xs z-10">
                      #{item.id}
                    </span>
                    {/* Hover affordance overlay indicating customer can view the full photo */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[0.5px]">
                      <span className="material-symbols-outlined text-[20px]">zoom_in</span>
                      <span className="text-[9px] font-bold tracking-tight">Original Photo</span>
                    </div>
                  </div>
                ) : null}

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={`w-3.5 h-3.5 border-2 rounded-sm flex items-center justify-center p-0.5 ${
                        item.is_veg ? 'border-emerald-600' : 'border-rose-600'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${item.is_veg ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                    </span>
                    <h3
                      onClick={() => setViewingPhotoItem(item)}
                      className="font-bold text-sm text-gray-900 leading-snug truncate cursor-pointer hover:text-primary transition-colors"
                      title="Click to view photo & details"
                    >
                      {item.name}
                    </h3>
                  </div>

                  <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-2">
                    {item.description || 'Prepared fresh with signature royal spices.'}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-primary">₹{item.price}</span>

                    {/* Add / Qty Control - Only in Active Dine-in Mode, NOT in View Only */}
                    {!isViewOnly ? (
                      inCartQty === 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCartQty && updateCartQty(item, 1);
                          }}
                          data-sound="pop"
                          className="px-4 py-1.5 bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed text-xs font-extrabold rounded-lg shadow-sm flex items-center gap-1 transition-transform active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>
                          ADD
                        </button>
                      ) : (
                        <div
                          className="flex items-center gap-2 bg-surface-container-high rounded-lg p-1 border border-surface-container-highest"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateCartQty && updateCartQty(item, inCartQty - 1);
                            }}
                            data-sound="remove"
                            className="w-7 h-7 rounded bg-white shadow-xs flex items-center justify-center text-gray-700 font-bold hover:bg-gray-100"
                          >
                            -
                          </button>
                          <span className="text-xs font-black w-4 text-center text-primary">{inCartQty}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateCartQty && updateCartQty(item, inCartQty + 1);
                            }}
                            data-sound="pop"
                            className="w-7 h-7 rounded bg-primary text-white shadow-xs flex items-center justify-center font-bold hover:bg-primary-container"
                          >
                            +
                          </button>
                        </div>
                      )
                    ) : (
                      <span className="text-[10px] text-gray-400 font-medium italic">
                        Table booking required to order
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating View Cart Bar - Only when NOT View-Only */}
      {!isViewOnly && cartTotalCount > 0 && handleOpenCart && (
        <div className="fixed bottom-4 left-0 right-0 max-w-md mx-auto px-4 z-40">
          <button
            onClick={handleOpenCart}
            className="w-full bg-primary hover:bg-primary-container text-white py-3.5 px-5 rounded-2xl shadow-xl flex items-center justify-between transition-transform active:scale-98 border border-white/10"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container font-black text-xs flex items-center justify-center">
                {cartTotalCount}
              </span>
              <div className="text-left">
                <p className="text-xs text-gray-300 font-medium">Cart Subtotal</p>
                <p className="text-base font-extrabold text-white">₹{cartSubtotal}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 font-bold text-xs bg-secondary-container text-on-secondary-container px-3.5 py-1.5 rounded-xl shadow-xs">
              <span>View Cart & Order</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </button>
        </div>
      )}

      {/* Full Photo Preview Lightbox Modal */}
      {viewingPhotoItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setViewingPhotoItem(null)}
        >
          <div
            className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-white/20 flex flex-col animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-gray-100 bg-white">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span
                  className={`w-3.5 h-3.5 border-2 rounded-sm flex items-center justify-center shrink-0 p-0.5 ${
                    viewingPhotoItem.is_veg ? 'border-emerald-600' : 'border-rose-600'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${viewingPhotoItem.is_veg ? 'bg-emerald-600' : 'bg-rose-600'}`}
                  ></span>
                </span>
                <h3 className="font-bold text-sm sm:text-base text-gray-900 truncate">{viewingPhotoItem.name}</h3>
                <span className="bg-gray-100 text-gray-700 font-mono text-[10px] font-black px-1.5 py-0.5 rounded shrink-0">
                  #{viewingPhotoItem.id}
                </span>
              </div>

              <button
                onClick={() => setViewingPhotoItem(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors shrink-0"
                aria-label="Close photo preview"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Original Aspect Ratio Photo Display (Retrieved directly from AWS S3) */}
            <div className="relative w-full bg-neutral-950 flex items-center justify-center overflow-hidden p-3 min-h-[260px] max-h-[75vh]">
              <img
                src={getS3ImageUrl(viewingPhotoItem.image_url)}
                alt={viewingPhotoItem.name}
                className="max-w-full max-h-[70vh] w-auto h-auto object-contain rounded-lg shadow-2xl transition-all"
              />

              {/* S3 Original Photo Badge */}
              <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1.5 shadow-md border border-white/15">
                <span className="material-symbols-outlined text-[14px] text-amber-400">cloud_done</span>
                <span>AWS S3 • Original Photo</span>
              </div>

              {/* View Original Full Size Link */}
              <a
                href={getS3ImageUrl(viewingPhotoItem.image_url)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open photo in original resolution"
                className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1 shadow transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                <span>Full Size</span>
              </a>

              {/* Category Badge */}
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-amber-400 font-black text-xs">
                {viewingPhotoItem.category}
              </div>
            </div>

            {/* Details & Action Body */}
            <div className="p-4 space-y-3 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {viewingPhotoItem.description || 'Prepared fresh with signature royal ingredients and spices.'}
                  </p>
                </div>
                <span className="text-lg font-black text-primary shrink-0">
                  ₹{viewingPhotoItem.price}
                </span>
              </div>

              {/* Ordering Controls inside Modal */}
              {!isViewOnly ? (
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Add to your order:</span>
                  {(cart[viewingPhotoItem.id]?.qty || 0) === 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateCartQty && updateCartQty(viewingPhotoItem, 1);
                      }}
                      data-sound="pop"
                      className="px-5 py-2 bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed text-xs font-extrabold rounded-xl shadow-sm flex items-center gap-1.5 transition-transform active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      ADD TO CART
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-surface-container-high rounded-xl p-1 border border-surface-container-highest">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCartQty &&
                            updateCartQty(viewingPhotoItem, (cart[viewingPhotoItem.id]?.qty || 0) - 1);
                        }}
                        data-sound="remove"
                        className="w-8 h-8 rounded-lg bg-white shadow-xs flex items-center justify-center text-gray-700 font-bold hover:bg-gray-100"
                      >
                        -
                      </button>
                      <span className="text-xs font-black w-6 text-center text-primary">
                        {cart[viewingPhotoItem.id]?.qty || 0}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCartQty &&
                            updateCartQty(viewingPhotoItem, (cart[viewingPhotoItem.id]?.qty || 0) + 1);
                        }}
                        data-sound="pop"
                        className="w-8 h-8 rounded-lg bg-primary text-white shadow-xs flex items-center justify-center font-bold hover:bg-primary-container"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-800 text-[11px] font-medium flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-amber-600">table_restaurant</span>
                  <span>Table booking required to order dishes for dine-in</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
