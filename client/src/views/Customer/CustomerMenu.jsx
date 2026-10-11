import React, { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

export default function CustomerMenu({ menuItems, cart = {}, updateCartQty, openCart, isViewOnly = false }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const categories = ['All', ...new Set(menuItems.map((m) => m.category))];

  const filteredItems = menuItems.filter((item) => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
    if (vegOnly && !item.is_veg) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
    }
    return true;
  });

  const cartTotalCount = Object.values(cart).reduce((sum, it) => sum + it.qty, 0);
  const cartSubtotal = Object.values(cart).reduce((sum, it) => sum + it.price * it.qty, 0);

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
            className={`px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors border ${vegOnly
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
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${selectedCategory === cat
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

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-surface-container-high flex gap-3.5 items-center transition-all hover:shadow-md"
              >
                {/* Image */}
                <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-surface-container-high shrink-0 shadow-inner">
                  <img
                    src={item.image_url || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300'}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300'; }}
                  />
                  {/* Food Item ID Badge */}
                  <span className="absolute top-1.5 left-1.5 bg-black/75 text-white font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded backdrop-blur-xs">
                    #{item.id}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={`w-3.5 h-3.5 border-2 rounded-sm flex items-center justify-center p-0.5 ${item.is_veg ? 'border-emerald-600' : 'border-rose-600'
                        }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${item.is_veg ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                    </span>
                    <h3 className="font-bold text-sm text-gray-900 leading-snug truncate">{item.name}</h3>
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
                          onClick={() => updateCartQty(item, 1)}
                          data-sound="pop"
                          className="px-4 py-1.5 bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed text-xs font-extrabold rounded-lg shadow-sm flex items-center gap-1 transition-transform active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>
                          ADD
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 bg-surface-container-high rounded-lg p-1 border border-surface-container-highest">
                          <button
                            onClick={() => updateCartQty(item, inCartQty - 1)}
                            data-sound="remove"
                            className="w-7 h-7 rounded bg-white shadow-xs flex items-center justify-center text-gray-700 font-bold hover:bg-gray-100"
                          >
                            -
                          </button>
                          <span className="text-xs font-black w-4 text-center text-primary">{inCartQty}</span>
                          <button
                            onClick={() => updateCartQty(item, inCartQty + 1)}
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
      {!isViewOnly && cartTotalCount > 0 && openCart && (
        <div className="fixed bottom-4 left-0 right-0 max-w-md mx-auto px-4 z-40">
          <button
            onClick={openCart}
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
    </div>
  );
}
