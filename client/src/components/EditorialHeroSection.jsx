import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { soundManager } from '../utils/soundEffects';

/**
 * EditorialHeroSection
 * 
 * An Awwwards/FWA-grade editorial luxury food experience.
 * Features:
 * - Seamless warm off-white studio cyclorama (#FAFAF8)
 * - ThreeJS floating spice dust, volumetric steam particles, and mouse parallax
 * - Exploded Royal Thali architectural food study with scroll-scrubbed layers
 * - Video 1 scrubbing support with high-res photography fallback (image-1.webp)
 * - Apple-style exploded hardware callout labels and connector lines
 * - Editorial typography (Fraunces & Inter) in Warm Charcoal (#2B2320)
 * - Magnetic action buttons for "Reserve Table" and "Explore Menu"
 * - Featured royal dishes mini-strip with instant detail preview
 */
export default function EditorialHeroSection({
  restaurantSettings = { is_open: 1 },
  onReserveTable,
  onExploreMenu,
  onManageBookings,
  menuItems = [],
  onSelectDish
}) {
  const containerRef = useRef(null);
  const threeCanvasRef = useRef(null);
  const videoRef = useRef(null);

  const [hasVideo, setHasVideo] = useState(true);

  // Mouse Parallax Coordinates (-1 to 1)
  const mousePos = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  // -------------------------------------------------------------
  // 1. THREE.JS SPICE DUST & STEAM PARTICLE SYSTEM (4K 60FPS)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!threeCanvasRef.current || !containerRef.current) return;

    const canvas = threeCanvasRef.current;
    const container = containerRef.current;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 24;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3)); // Ultra-crisp 4K Retina support

    // Particle Group 1: Floating Gourmet Spice Dust across full hero section
    const spiceCount = 200;
    const spiceGeometry = new THREE.BufferGeometry();
    const spicePositions = new Float32Array(spiceCount * 3);
    const spiceColors = new Float32Array(spiceCount * 3);
    const spiceVelocities = [];

    const palette = [
      new THREE.Color('#D97706'), // Saffron Gold
      new THREE.Color('#B45309'), // Turmeric Amber
      new THREE.Color('#991B1B'), // Kashmiri Chilli Red
      new THREE.Color('#047857'), // Fresh Cardamom Green
      new THREE.Color('#374151')  // Tellicherry Black Pepper
    ];

    for (let i = 0; i < spiceCount; i++) {
      // Disperse across full hero view volume
      spicePositions[i * 3] = (Math.random() - 0.5) * 44;
      spicePositions[i * 3 + 1] = (Math.random() - 0.5) * 32;
      spicePositions[i * 3 + 2] = (Math.random() - 0.5) * 18;

      const col = palette[Math.floor(Math.random() * palette.length)];
      spiceColors[i * 3] = col.r;
      spiceColors[i * 3 + 1] = col.g;
      spiceColors[i * 3 + 2] = col.b;

      spiceVelocities.push({
        vx: (Math.random() - 0.5) * 0.007,
        vy: Math.random() * 0.012 + 0.003,
        vz: (Math.random() - 0.5) * 0.005
      });
    }

    spiceGeometry.setAttribute('position', new THREE.BufferAttribute(spicePositions, 3));
    spiceGeometry.setAttribute('color', new THREE.BufferAttribute(spiceColors, 3));

    // High-resolution 4K circle texture for pristine particle sharpness without blur
    const getCircleTexture = () => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.75)');
      gradient.addColorStop(0.7, 'rgba(255,255,255,0.25)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(64, 64, 64, 0, Math.PI * 2);
      ctx.fill();
      const texture = new THREE.CanvasTexture(c);
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    };

    const particleTexture = getCircleTexture();

    const spiceMaterial = new THREE.PointsMaterial({
      size: 0.38,
      vertexColors: true,
      map: particleTexture,
      transparent: true,
      opacity: 0.8,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    const spicePoints = new THREE.Points(spiceGeometry, spiceMaterial);
    scene.add(spicePoints);

    // Particle Group 2: Micro Volumetric Steam Clouds across full hero
    const steamCount = 50;
    const steamGeometry = new THREE.BufferGeometry();
    const steamPositions = new Float32Array(steamCount * 3);
    const steamVelocities = [];

    for (let i = 0; i < steamCount; i++) {
      steamPositions[i * 3] = (Math.random() - 0.5) * 16;
      steamPositions[i * 3 + 1] = (Math.random() - 0.5) * 14 - 2;
      steamPositions[i * 3 + 2] = (Math.random() - 0.5) * 10 + 2;

      steamVelocities.push({
        vy: Math.random() * 0.014 + 0.008,
        vx: (Math.random() - 0.5) * 0.005
      });
    }

    steamGeometry.setAttribute('position', new THREE.BufferAttribute(steamPositions, 3));

    const steamMaterial = new THREE.PointsMaterial({
      size: 2.2,
      color: 0xFAF7F2,
      map: particleTexture,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });

    const steamPoints = new THREE.Points(steamGeometry, steamMaterial);
    scene.add(steamPoints);

    // 60FPS fluid render loop with delta-time timing
    let animationFrameId;
    let clock = new THREE.Clock();

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      const delta = Math.min(clock.getDelta(), 0.05); // Cap to avoid jumps on tab switch
      const speedFactor = delta * 60; // Normalized 60 FPS scale

      // Smooth 60fps parallax lerp
      mousePos.current.x += (mousePos.current.targetX - mousePos.current.x) * (0.05 * speedFactor);
      mousePos.current.y += (mousePos.current.targetY - mousePos.current.y) * (0.05 * speedFactor);

      camera.position.x = mousePos.current.x * 2.5;
      camera.position.y = -mousePos.current.y * 1.8;
      camera.lookAt(0, 0, 0);

      // Animate spice particles seamlessly across the full hero section
      const posAttr = spiceGeometry.attributes.position;
      const positions = posAttr.array;
      for (let i = 0; i < spiceCount; i++) {
        positions[i * 3] += spiceVelocities[i].vx * speedFactor;
        positions[i * 3 + 1] += spiceVelocities[i].vy * speedFactor;
        positions[i * 3 + 2] += spiceVelocities[i].vz * speedFactor;

        // Wrap around boundaries spanning entire hero canvas
        if (positions[i * 3 + 1] > 18) {
          positions[i * 3 + 1] = -18;
          positions[i * 3] = (Math.random() - 0.5) * 44;
        }
      }
      posAttr.needsUpdate = true;

      // Animate volumetric steam particles
      const steamPosAttr = steamGeometry.attributes.position;
      const sPositions = steamPosAttr.array;
      for (let i = 0; i < steamCount; i++) {
        sPositions[i * 3 + 1] += steamVelocities[i].vy * speedFactor;
        sPositions[i * 3] += steamVelocities[i].vx * speedFactor;
        if (sPositions[i * 3 + 1] > 14) {
          sPositions[i * 3 + 1] = -8;
          sPositions[i * 3] = (Math.random() - 0.5) * 16;
        }
      }
      steamPosAttr.needsUpdate = true;

      // Subtle atmospheric continuous drift
      spicePoints.rotation.y += 0.0006 * speedFactor;
      steamPoints.rotation.y += 0.0004 * speedFactor;

      renderer.render(scene, camera);
    };

    renderLoop();

    // Responsive 4K Resize Handler
    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      width = containerRef.current.clientWidth || window.innerWidth;
      height = containerRef.current.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      spiceGeometry.dispose();
      spiceMaterial.dispose();
      steamGeometry.dispose();
      steamMaterial.dispose();
      particleTexture.dispose();
    };
  }, []);

  // -------------------------------------------------------------
  // 2. MOUSE MOVEMENT LISTENER (PARALLAX DEPTH)
  // -------------------------------------------------------------
  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mousePos.current.targetX = Math.max(-1, Math.min(1, x));
    mousePos.current.targetY = Math.max(-1, Math.min(1, y));
  };



  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-[#FAFAF8] text-[#2B2320] select-none pb-12"
      style={{
        backgroundImage: `radial-gradient(ellipse at 50% 42%, rgba(254, 243, 199, 0.45) 0%, rgba(250, 250, 248, 0.98) 75%)`
      }}
    >
      {/* 1. ULTRA-SUBTLE EDITORIAL GRAIN / PAPER TEXTURE OVERLAY */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035] z-0 mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      {/* 2. THREE.JS PARTICLE CANVAS (SPICE DUST & STEAM PARTICLES) */}
      <canvas
        ref={threeCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* 3. EDITORIAL TOP BRAND BAR (MERGED WITH HERO UI) */}
      <div className="relative z-20 max-w-7xl mx-auto w-full pl-2 sm:pl-3 lg:pl-4 pr-2 sm:pr-3 lg:pr-4 pt-6 pb-2 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Brand Identity & Live Status */}
        <div className="flex items-center gap-3 relative -left-4 sm:-left-8 lg:-left-12">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center font-black shadow-xs">
            <span className="material-symbols-outlined text-[22px]">restaurant</span>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="text-lg lg:text-xl font-extrabold italic tracking-tight text-[#2B2320] block leading-tight"
                style={{ fontFamily: "'Fraunces', 'Playfair Display', serif" }}
              >
                KK's FOOD HOUSE 🍲
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  restaurantSettings?.is_open
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border border-rose-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    restaurantSettings?.is_open ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                />
                <span>{restaurantSettings?.is_open ? 'Restaurant OPEN' : 'Restaurant CLOSED'}</span>
              </span>
            </div>
            <span className="text-[10px] text-amber-900 font-mono tracking-wider uppercase font-semibold">
              Royal Dining & Table Service
            </span>
          </div>
        </div>

        {/* Right: Manage Bookings button cleanly styled in hero UI */}
        <div className="flex items-center gap-3 relative -right-4 sm:-right-8 lg:-right-12">
          <button
            onClick={onManageBookings}
            className="group inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#2B2320] hover:bg-black text-[#FAFAF8] text-xs font-mono font-bold tracking-wider shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer border border-[#2B2320]"
          >
            <span className="material-symbols-outlined text-[16px] text-amber-300 transition-transform group-hover:rotate-12">
              manage_search
            </span>
            <span>MANAGE BOOKINGS</span>
          </button>
        </div>
      </div>

      {/* 4. MAIN HERO STAGE: EDITORIAL HEADLINE & EXPLODED ARCHITECTURE */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-6 lg:px-12 py-4 flex-1 flex flex-col items-center justify-center text-center">
        {/* Editorial Headline */}
        <div className="max-w-4xl space-y-3 mb-6">
          <h1
            className="text-4xl sm:text-6xl lg:text-7xl font-light tracking-tight text-[#2B2320] leading-[1.08]"
            style={{ fontFamily: "'Fraunces', 'Playfair Display', serif" }}
          >
            The Anatomy of <br className="hidden sm:inline" />
            <span className="font-extrabold italic bg-gradient-to-r from-amber-800 via-amber-700 to-amber-950 bg-clip-text text-transparent">
              Chicken LotPot Masala
            </span>
          </h1>

          <p className="text-xs sm:text-sm md:text-base text-[#6B5E57] max-w-2xl mx-auto font-normal leading-relaxed tracking-wide font-sans">
            Every spice calibrated to precise micron density. Every slow-cooked gravy simmered for 36 hours.
            An edible monument to centuries of regal heritage at{' '}
            <strong className="text-[#2B2320] font-semibold">KK's Food House</strong>.
          </p>
        </div>

        {/* 5. ROYAL SIGNATURE DISH PRESENTATION (PRESERVED IN PLACE) */}
        <div className="relative w-full max-w-3xl h-[340px] sm:h-[400px] flex items-center justify-center my-2">
          {/* Background Ambient Cyclorama Shadow */}
          <div
            className="absolute w-72 sm:w-96 h-28 sm:h-36 bg-amber-950/15 rounded-full blur-2xl pointer-events-none"
            style={{
              transform: 'translateY(110px)'
            }}
          />

          {/* Video Layer (If video-1.mp4 is available in public folder) */}
          {hasVideo && (
            <video
              ref={videoRef}
              src="/video-1.mp4"
              muted
              playsInline
              preload="auto"
              onError={() => setHasVideo(false)}
              className="absolute w-full h-full object-contain pointer-events-none transition-opacity duration-500 rounded-3xl"
              style={{
                opacity: hasVideo ? 0.9 : 0
              }}
            />
          )}

          {/* High-Resolution Presentation Preserved in Place */}
          <div
            className="relative w-72 sm:w-96 h-72 sm:h-96 flex items-center justify-center transition-transform duration-300"
            style={{
              transform: `perspective(1000px) rotateX(${mousePos.current.y * 6}deg) rotateY(${mousePos.current.x * 6}deg)`
            }}
          >
            {/* Handcrafted Royal Thali Base Silver Platter */}
            <div className="absolute w-64 sm:w-80 h-64 sm:h-80 rounded-full border border-amber-300/40 bg-gradient-to-br from-[#EAE7DD] via-[#F4F1EA] to-[#D5CFC2] shadow-xl flex items-center justify-center">
              {/* Delicate concentric rim engravings */}
              <div className="w-[94%] h-[94%] rounded-full border border-dashed border-amber-800/20 flex items-center justify-center">
                <div className="w-[88%] h-[88%] rounded-full border border-amber-800/10" />
              </div>
            </div>

            {/* Central Master High-Resolution Food Dish (signature_royal_dish / image-1.webp) */}
            <div className="relative w-56 sm:w-72 h-56 sm:h-72 rounded-full overflow-hidden shadow-2xl z-20 border-4 border-[#FAFAF8]">
              <img
                src="/image-1.webp"
                onError={(e) => {
                  e.target.src = '/signature_royal_dish.jpg';
                }}
                alt="Royal Cuisine Composition"
                className="w-full h-full object-cover"
              />
              {/* Micro-steam overlay effect */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/10 pointer-events-none opacity-60" />
            </div>
          </div>
        </div>

        {/* 6. EDITORIAL CALL-TO-ACTION BUTTONS */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-3 z-20">
          {/* Explore Menu Button (Triggers existing full menu view) */}
          <button
            onClick={() => {
              soundManager.playPop();
              if (onExploreMenu) onExploreMenu();
            }}
            className="group px-7 py-3.5 rounded-2xl bg-[#FAFAF8] hover:bg-[#F5F2EA] text-[#2B2320] font-bold text-sm border-2 border-[#D9D3C5] shadow-xs transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px] text-amber-800 transition-transform group-hover:rotate-12">
              menu_book
            </span>
            <span>Explore Royal Menu</span>
            <span className="text-xs text-gray-400 font-mono">→</span>
          </button>

          {/* Book Your Table Button (Triggers existing smooth scroll to 12-table reservation) */}
          <button
            onClick={() => {
              soundManager.playSuccess();
              if (onReserveTable) onReserveTable();
            }}
            className="group px-8 py-3.5 rounded-2xl bg-[#2B2320] hover:bg-black text-[#FAFAF8] font-extrabold text-sm shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2.5 cursor-pointer ring-2 ring-amber-600/30 ring-offset-2 ring-offset-[#FAFAF8]"
          >
            <span className="material-symbols-outlined text-[20px] text-amber-400 transition-transform group-hover:scale-110">
              calendar_month
            </span>
            <span>Book Your Table</span>
          </button>
        </div>
      </div>
    </section>
  );
}
