"use client";

import React, { useEffect, useRef } from "react";

interface CoreParticle {
  /** Base 3D coordinates on the geometric ledger core (radius ~ 1). */
  bx: number;
  by: number;
  bz: number;
  /** Target 3D coordinates when burst/dissolved in Section 4 (normalized viewport space). */
  dx: number;
  dy: number;
  dz: number;
  /** Velocity vector during initial radial burst. */
  vx: number;
  vy: number;
  vz: number;
  /** Base particle radius in px. */
  size: number;
  /** Base opacity. */
  alpha: number;
  /** Phase offset for subtle breathing motion. */
  phase: number;
  /** Accent tint: 0 = deep charcoal/black, 1 = muted emerald, 2 = trust blue. */
  tint: 0 | 1 | 2;
}

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

/**
 * 3D Interactive Particle Core + Ambient Field for Ledgerly.
 *
 * Scroll choreography across 4 sections (`progress` in [0, 3]):
 *  - 0.0 (Hero): Centered below the headline, calm axial rotation.
 *  - 1.0 (Merchant & Checkout): Shifts right (+26% vw), tilts to expose the ledger rings.
 *  - 2.0 (Remittance): Shifts left (-26% vw), reorients along the cross-border rail axis.
 *  - 3.0 (Auditor / Settlement): Bursts and dissolves into thousands of fine particles that
 *    gently spread and settle across the entire final section.
 */
export function LedgerParticleCore() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- 1. Build the 3D geometric ledger core particles (~2,500 particles) ---
    const coreParticles: CoreParticle[] = [];
    const totalCore = 2500;

    for (let i = 0; i < totalCore; i++) {
      const u = i / totalCore;
      let bx = 0;
      let by = 0;
      let bz = 0;

      if (i < 950) {
        // Layer A: Geodesic Fibonacci sphere core with subtle faceted octant modulation
        const phi = Math.acos(1 - (2 * (i + 0.5)) / 950);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const facet = 0.52 + 0.06 * Math.cos(4 * phi) * Math.sin(4 * theta);
        bx = facet * Math.sin(phi) * Math.cos(theta);
        by = facet * Math.sin(phi) * Math.sin(theta);
        bz = facet * Math.cos(phi);
      } else if (i < 1850) {
        // Layer B: Primary inclined settlement torus ring (major R = 1.02, minor r = 0.14)
        const idx = i - 950;
        const t = (idx / 900) * Math.PI * 2;
        const p = idx * 2.39996; // Golden angle around minor tube
        const R = 1.02;
        const r = 0.13;
        const tx = (R + r * Math.cos(p)) * Math.cos(t);
        const ty = (R + r * Math.cos(p)) * Math.sin(t);
        const tz = r * Math.sin(p);
        // Tilt ring by 32 deg around X
        const tilt = 0.56;
        bx = tx;
        by = ty * Math.cos(tilt) - tz * Math.sin(tilt);
        bz = ty * Math.sin(tilt) + tz * Math.cos(tilt);
      } else {
        // Layer C: Orthogonal precision rail ring + outer meridian ticks (R = 1.28)
        const idx = i - 1850;
        const t = (idx / 650) * Math.PI * 2;
        const p = idx * 1.61803;
        const R = 1.26;
        const r = 0.055;
        const tx = (R + r * Math.cos(p)) * Math.cos(t);
        const ty = r * Math.sin(p);
        const tz = (R + r * Math.cos(p)) * Math.sin(t);
        const tilt = -0.48;
        bx = tx * Math.cos(tilt) - ty * Math.sin(tilt);
        by = tx * Math.sin(tilt) + ty * Math.cos(tilt);
        bz = tz;
      }

      // Deterministic pseudo-random values for burst & settlement in Section 4
      const s1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 93.9898 + 12.456) * 24634.6345;
      const r2 = s2 - Math.floor(s2);
      const s3 = Math.sin(i * 45.164 + 39.112) * 19543.1234;
      const r3 = s3 - Math.floor(s3);

      // Radial burst impulse + wide settled field across the entire final section
      const norm = Math.hypot(bx, by, bz) || 1;
      const burstSpeed = 1.6 + r1 * 2.2;
      const vx = (bx / norm) * burstSpeed + (r2 - 0.5) * 1.2;
      const vy = (by / norm) * burstSpeed + (r3 - 0.5) * 1.2;
      const vz = (bz / norm) * burstSpeed + (r1 - 0.5) * 1.2;

      // Settled coordinates cover the full width/height of Section 4 in gentle stratified bands
      const dx = (r1 - 0.5) * 4.4;
      const dy = (r2 - 0.5) * 2.6 + Math.sin(r1 * Math.PI * 4) * 0.18;
      const dz = (r3 - 0.5) * 2.2;

      let tint: 0 | 1 | 2 = 0;
      if (i % 47 === 0) tint = 1; // Muted emerald verification node
      else if (i % 73 === 0) tint = 2; // Soft trust blue node

      coreParticles.push({
        bx,
        by,
        bz,
        dx,
        dy,
        dz,
        vx,
        vy,
        vz,
        size: 1.15 + (i % 5) * 0.28,
        alpha: 0.42 + (u % 0.55),
        phase: r1 * Math.PI * 2,
        tint,
      });
    }

    // --- 2. Build the soft floating background particle field (~160 particles) ---
    const ambientParticles: AmbientParticle[] = [];
    for (let i = 0; i < 160; i++) {
      const s1 = Math.sin(i * 31.7 + 11.3) * 10000;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 73.1 + 57.9) * 10000;
      const r2 = s2 - Math.floor(s2);
      ambientParticles.push({
        x: r1,
        y: r2,
        vx: (r1 - 0.5) * 0.00018,
        vy: -0.00008 - r2 * 0.00014,
        size: 0.9 + (i % 3) * 0.5,
        alpha: 0.11 + (i % 5) * 0.035,
      });
    }

    let width = window.innerWidth;
    let height = window.innerHeight;
    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    // --- 3. Pointer & Scroll state ---
    let pointerX = 0;
    let pointerY = 0;
    let rawMousePxX = -9999;
    let rawMousePxY = -9999;
    let smoothPointerX = 0;
    let smoothPointerY = 0;

    const handlePointerMove = (e: MouseEvent) => {
      rawMousePxX = e.clientX;
      rawMousePxY = e.clientY;
      pointerX = (e.clientX / Math.max(width, 1) - 0.5) * 2;
      pointerY = (e.clientY / Math.max(height, 1) - 0.5) * 2;
    };
    window.addEventListener("mousemove", handlePointerMove, { passive: true });

    let smoothProgress = 0;
    let rafId = 0;
    let startTime = performance.now();

    const getScrollProgress = (): number => {
      // Measure progress across the 4 main sections (0 -> 3)
      const vh = Math.max(window.innerHeight, 1);
      const raw = window.scrollY / vh;
      return Math.max(0, Math.min(3.2, raw));
    };

    // Keyframes for the 4 sections: [xOffsetRatio, yOffsetRatio, zOffset, rotX, rotY, rotZ, scale, dispersion]
    const keyframes = [
      // Section 1: Hero — centered slightly below headline, calm
      { x: 0.0, y: 0.09, z: 0, rx: 0.32, ry: 0.0, rz: 0.08, scale: 1.0, disp: 0.0 },
      // Section 2: Merchant & Checkout — shifts right, rotates & tilts
      { x: 0.25, y: 0.0, z: -0.25, rx: 1.08, ry: 1.65, rz: 0.52, scale: 0.92, disp: 0.0 },
      // Section 3: Remittance — shifts left, changes orientation
      { x: -0.25, y: -0.02, z: 0.15, rx: -0.68, ry: 3.4, rz: -0.46, scale: 0.95, disp: 0.0 },
      // Section 4: Auditor / Trust / Settlement — bursts and dissolves across the entire section
      { x: 0.0, y: 0.0, z: 0.35, rx: 0.45, ry: 5.1, rz: 0.15, scale: 1.15, disp: 1.0 },
    ] as const;

    const sampleKeyframes = (p: number) => {
      const clamped = Math.max(0, Math.min(3, p));
      const idx = Math.min(2, Math.floor(clamped));
      const tRaw = clamped - idx;
      // Smoothstep easing between sections
      const t = tRaw * tRaw * (3 - 2 * tRaw);
      const a = keyframes[idx]!;
      const b = keyframes[idx + 1]!;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        rx: a.rx + (b.rx - a.rx) * t,
        ry: a.ry + (b.ry - a.ry) * t,
        rz: a.rz + (b.rz - a.rz) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        disp: a.disp + (b.disp - a.disp) * t,
      };
    };

    const render = (now: number) => {
      const elapsed = (now - startTime) * 0.001;
      const targetProgress = getScrollProgress();
      smoothProgress += (targetProgress - smoothProgress) * 0.075;
      smoothPointerX += (pointerX - smoothPointerX) * 0.08;
      smoothPointerY += (pointerY - smoothPointerY) * 0.08;

      ctx.clearRect(0, 0, width, height);

      // --- A. Draw slow-drifting background ambient particle field ---
      for (let i = 0; i < ambientParticles.length; i++) {
        const ap = ambientParticles[i]!;
        ap.x = (ap.x + ap.vx + 1) % 1;
        ap.y = (ap.y + ap.vy + 1) % 1;
        const px = ap.x * width - smoothPointerX * 14;
        const py = ap.y * height - smoothPointerY * 14;
        ctx.fillStyle = `rgba(18, 20, 23, ${ap.alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, ap.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- B. Compute 3D state of central particle object ---
      const kf = sampleKeyframes(smoothProgress);
      const baseRadius = Math.min(width, height) * 0.255 * kf.scale;

      // On mobile screens (< 900px), reduce horizontal shift so object stays visible
      const responsiveXFactor = width < 900 ? 0.35 : 1.0;
      const centerX = width * 0.5 + kf.x * width * responsiveXFactor + smoothPointerX * 22;
      const centerY = height * 0.5 + kf.y * height + smoothPointerY * 18;

      // Combine scroll rotation + continuous slow spin + cursor tilt
      const rotX = kf.rx + elapsed * 0.14 + smoothPointerY * 0.38;
      const rotY = kf.ry + elapsed * 0.22 + smoothPointerX * 0.48;
      const rotZ = kf.rz + Math.sin(elapsed * 0.3) * 0.08;

      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosZ = Math.cos(rotZ);
      const sinZ = Math.sin(rotZ);

      // Burst envelope: peaks at mid-transition into Section 4 (`disp ~ 0.35`), then settles
      const d = kf.disp;
      const burstPulse = Math.sin(d * Math.PI) * 0.85;
      const settleWeight = d * d * (3 - 2 * d);

      const fov = 3.4;

      for (let i = 0; i < coreParticles.length; i++) {
        const p = coreParticles[i]!;

        // Subtle organic breathing on the lattice
        const breath = 1 + Math.sin(elapsed * 1.4 + p.phase) * 0.022;
        const lx = p.bx * breath;
        const ly = p.by * breath;
        const lz = p.bz * breath;

        // Rotate lattice point in 3D (Y -> X -> Z)
        const x1 = lx * cosY + lz * sinY;
        const z1 = -lx * sinY + lz * cosY;
        const y2 = ly * cosX - z1 * sinX;
        const z2 = ly * sinX + z1 * cosX;
        const rx = x1 * cosZ - y2 * sinZ;
        const ry = x1 * sinZ + y2 * cosZ;
        const rz = z2;

        // Blend between rotating geometric core and Section 4 burst+settle field
        const settleDriftX = p.dx + Math.sin(elapsed * 0.55 + p.phase) * 0.07;
        const settleDriftY = p.dy + Math.cos(elapsed * 0.45 + p.phase) * 0.06;
        const settleDriftZ = p.dz;

        const wx = rx * (1 - settleWeight) + p.vx * burstPulse + settleDriftX * settleWeight;
        const wy = ry * (1 - settleWeight) + p.vy * burstPulse + settleDriftY * settleWeight;
        const wz = rz * (1 - settleWeight) + p.vz * burstPulse + settleDriftZ * settleWeight + kf.z;

        const depth = fov - wz;
        if (depth <= 0.25) continue;
        const perspective = fov / depth;

        let sx = centerX + wx * baseRadius * perspective;
        let sy = centerY + wy * baseRadius * perspective;

        // Cursor-interactive localized magnetic repulsion / ripple
        const dxMouse = sx - rawMousePxX;
        const dyMouse = sy - rawMousePxY;
        const distSq = dxMouse * dxMouse + dyMouse * dyMouse;
        const influenceRadius = 135;
        if (distSq < influenceRadius * influenceRadius && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / influenceRadius) * 26;
          sx += (dxMouse / dist) * force;
          sy += (dyMouse / dist) * force;
        }

        // Cull offscreen particles for performance
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;

        const radius = Math.max(0.65, p.size * perspective * (1 - settleWeight * 0.18));
        const depthAlpha = Math.max(0.12, Math.min(0.95, p.alpha * ((wz + 1.8) / 2.8)));
        const finalAlpha = depthAlpha * (1 - settleWeight * 0.22);

        if (p.tint === 1) {
          // Muted emerald green accent (#1F6F54)
          ctx.fillStyle = `rgba(31, 111, 84, ${Math.min(0.95, finalAlpha + 0.18)})`;
        } else if (p.tint === 2) {
          // Soft trust blue accent (#3B6B9B)
          ctx.fillStyle = `rgba(59, 107, 155, ${Math.min(0.95, finalAlpha + 0.15)})`;
        } else {
          // Deep charcoal / soft black (#0D0E10)
          ctx.fillStyle = `rgba(13, 14, 16, ${finalAlpha})`;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handlePointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
