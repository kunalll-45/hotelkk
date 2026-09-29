import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';
import { soundManager } from '../utils/soundEffects';
import { api } from '../utils/api';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=1200&auto=format&fit=crop&q=80';

export default function TopDishesSlider({ items = [], onSelectDish }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [imgErrorMap, setImgErrorMap] = useState({});
  const [promotionalOffers, setPromotionalOffers] = useState({ active: [], upcoming: [] });
  const [offerNotice, setOfferNotice] = useState(null);

  // Load active and upcoming promotional offers (Requirement 13)
  useEffect(() => {
    api.getPromotionalOffers()
      .then((res) => {
        setPromotionalOffers(res || { active: [], upcoming: [] });
      })
      .catch(() => {});
  }, []);

  // Filter top/featured dishes
  const featuredDishes = useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) return [];
    
    // First priority: items marked as is_featured === 1 and is_available === 1
    const featured = items.filter((item) => item.is_featured === 1 && item.is_available === 1);
    if (featured.length >= 3) {
      return featured.slice(0, 6);
    }

    // Fallback: available items with images
    const withImages = items.filter((item) => item.is_available === 1 && item.image_url);
    if (withImages.length > 0) {
      return withImages.slice(0, 5);
    }

    return items.slice(0, 5);
  }, [items]);

  // Combine featured dishes and upcoming pre-offers into slides (Requirement 13)
  const slides = useMemo(() => {
    const list = [];

    // Pre-offers / Upcoming offers first for advertisement
    (promotionalOffers.upcoming || []).forEach((offer) => {
      const targetItem = items.find((it) => it.id === offer.target_item_id);
      const img = offer.image_url || targetItem?.image_url || offer.target_item_image || FALLBACK_IMAGE;

      list.push({
        id: `offer-${offer.id}`,
        isOffer: true,
        isUpcoming: true,
        name: offer.title,
        code: offer.code,
        offerType: offer.offer_type,
        discountValue: offer.discount_value,
        startTime: offer.start_time,
        image_url: img,
        category: 'PRE-OFFER',
        targetItemName: targetItem?.name || offer.target_item_name || null,
        targetPrice: targetItem?.price || offer.target_item_price || null,
        description: offer.description
      });
    });

    // Top featured dishes
    featuredDishes.forEach((dish) => {
      list.push({
        ...dish,
        isOffer: false
      });
    });

    return list;
  }, [promotionalOffers, featuredDishes, items]);

  const total = slides.length;

  // Auto-slide effect every 4.5 seconds
  useEffect(() => {
    if (total <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % total);
    }, 4500);

    return () => clearInterval(timer);
  }, [total, isPaused]);

  useEffect(() => {
    if (total > 0 && currentSlide >= total) {
      setCurrentSlide(0);
    }
  }, [total, currentSlide]);

  const handleNext = (e) => {
    e?.stopPropagation?.();
    soundManager?.playPop?.();
    setCurrentSlide((prev) => (prev + 1) % total);
  };

  const handlePrev = (e) => {
    e?.stopPropagation?.();
    soundManager?.playPop?.();
    setCurrentSlide((prev) => (prev - 1 + total) % total);
  };

  const handleGoTo = (idx, e) => {
    e?.stopPropagation?.();
    soundManager?.playPop?.();
    setCurrentSlide(idx);
  };

  // Touch Swipe Handling for mobile
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const onTouchStart = (e) => {
    setIsPaused(true);
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    setIsPaused(false);
    if (touchStartX.current === null || touchEndX.current === null) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 45) {
      handleNext();
    } else if (distance < -45) {
      handlePrev();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  if (total === 0) {
    return null;
  }

  const activeSlide = slides[currentSlide] || slides[0];
  const slideImage = imgErrorMap[activeSlide.id]
    ? FALLBACK_IMAGE
    : (activeSlide.image_url || FALLBACK_IMAGE);

  const handleSlideClick = () => {
    if (activeSlide.isOffer) {
      soundManager?.playPop?.();
      const startTimeFormatted = activeSlide.startTime
        ? activeSlide.startTime.replace('T', ' at ')
        : 'the scheduled launch date';
      setOfferNotice(`"${activeSlide.name}" is coming soon! Starts on ${startTimeFormatted}. This deal will automatically activate then.`);
      setTimeout(() => setOfferNotice(null), 6000);
    } else if (onSelectDish) {
      onSelectDish(activeSlide);
    }
  };

  return (
    <div
      className="relative max-w-5xl mx-auto w-full px-2 sm:px-4 select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pre-Offer Coming Soon Banner Toast */}
      {offerNotice && (
        <div className="mb-3 p-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-2xl shadow-xl flex items-center justify-between gap-3 border border-amber-400/40 animate-fade-in text-xs font-bold">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-amber-200">campaign</span>
            <span>{offerNotice}</span>
          </div>
          <button onClick={() => setOfferNotice(null)} className="text-white/80 hover:text-white">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Modern JioHotstar-Style Hero Banner Card */}
      <div
        onClick={handleSlideClick}
        className="group relative w-full h-[360px] sm:h-[420px] md:h-[480px] rounded-3xl overflow-hidden shadow-2xl border border-black/10 bg-neutral-900 cursor-pointer transition-all duration-500 hover:shadow-amber-950/20"
      >
        {/* Full-Fit Background Food Photo */}
        <img
          key={activeSlide.id}
          src={slideImage}
          alt={activeSlide.name}
          onError={() => setImgErrorMap((prev) => ({ ...prev, [activeSlide.id]: true }))}
          className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
        />

        {/* Subtle Minimal Vignette: Gentle Bottom & Right Gradients so Photos Stay Bright & Crisp */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-l from-black/50 via-transparent to-transparent pointer-events-none"></div>

        {/* Top-Left Badge: Category & Pre-Offer Status */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20 flex flex-wrap items-center gap-2">
          {activeSlide.isOffer ? (
            <>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-lg flex items-center gap-1.5 font-mono">
                <span className="material-symbols-outlined text-[16px]">campaign</span>
                COMING SOON
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-black/60 text-white backdrop-blur-md border border-white/20 shadow-md font-mono">
                CODE: {activeSlide.code}
              </span>
            </>
          ) : (
            <>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-black/50 text-white backdrop-blur-md border border-white/20 shadow-md">
                {activeSlide.category}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md shadow-md ${
                  activeSlide.is_veg
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${activeSlide.is_veg ? 'bg-emerald-400' : 'bg-rose-400'}`}
                ></span>
                {activeSlide.is_veg ? 'Pure Veg' : 'Non-Veg'}
              </span>
            </>
          )}
        </div>

        {/* Right Side: Dish / Pre-Offer Name & Price with Stylish Typography */}
        <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-10 z-20 text-right flex flex-col items-end max-w-sm sm:max-w-md md:max-w-xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-md">
            <span className="material-symbols-outlined text-[14px]">
              {activeSlide.isOffer ? 'local_offer' : 'stars'}
            </span>
            <span>{activeSlide.isOffer ? 'Upcoming Promotion' : 'Top Featured Dish'}</span>
          </div>

          <h2
            className="text-2xl sm:text-4xl md:text-5xl font-black text-white italic tracking-tight leading-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {activeSlide.name}
          </h2>

          {/* Price / Offer Start Date Box */}
          <div className="pt-1">
            {activeSlide.isOffer ? (
              <div className="inline-flex flex-col items-end gap-1 px-4 py-2 rounded-2xl bg-black/70 backdrop-blur-md border border-amber-400/40 shadow-2xl">
                <span className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider font-mono">
                  Coming Soon • Starts On
                </span>
                <span className="text-sm sm:text-base font-black text-amber-400 font-mono leading-none drop-shadow">
                  {activeSlide.startTime ? activeSlide.startTime.replace('T', ' at ') : 'Upcoming'}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 sm:py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl">
                <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono leading-none drop-shadow">
                  {formatCurrency(activeSlide.price)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modern Hotstar-Style Navigation Chevrons */}
        {total > 1 && (
          <>
            <button
              onClick={handlePrev}
              type="button"
              data-sound="pop"
              aria-label="Previous Slide"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/40 hover:bg-black/75 text-white backdrop-blur-md border border-white/20 shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer opacity-80 hover:opacity-100"
            >
              <span className="material-symbols-outlined text-[26px]">chevron_left</span>
            </button>

            <button
              onClick={handleNext}
              type="button"
              data-sound="pop"
              aria-label="Next Slide"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/40 hover:bg-black/75 text-white backdrop-blur-md border border-white/20 shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer opacity-80 hover:opacity-100"
            >
              <span className="material-symbols-outlined text-[26px]">chevron_right</span>
            </button>
          </>
        )}

        {/* Modern Indicator Bars / Dots */}
        {total > 1 && (
          <div className="absolute bottom-6 left-6 sm:bottom-8 sm:left-8 z-20 flex items-center gap-2 bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 shadow-md">
            {slides.map((slide, idx) => {
              const isActive = idx === currentSlide;
              return (
                <button
                  key={slide.id || idx}
                  onClick={(e) => handleGoTo(idx, e)}
                  type="button"
                  aria-label={`Slide ${idx + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                    isActive
                      ? slide.isOffer ? 'w-7 bg-amber-400 shadow-sm' : 'w-7 bg-amber-400 shadow-sm'
                      : 'w-2 bg-white/40 hover:bg-white/75'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
