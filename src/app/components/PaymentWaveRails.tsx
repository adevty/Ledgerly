"use client";

import React, { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

interface RailParticle {
  /** Normalized horizontal position [0, 1] flowing left -> right. */
  u: number;
  /** Rail lane index [0 .. NUM_RAILS - 1]. */
  rail: number;
  /** Fine offset within the lane [-1, 1]. */
  laneOffset: number;
  /** Depth layer [-1, 1] for subtle parallax & size variation. */
  depth: number;
  /** Base horizontal flow speed. */
  speed: number;
  /** Individual random seed for turbulence & organic motion. */
  seed: number;
  /** Base radius in px. */
  size: number;
  /** Base opacity. */
  alpha: number;
  /** Color variant: 0 = charcoal black, 1 = muted sage green, 2 = soft slate blue. */
  colorKind: 0 | 1 | 2;
}

const NUM_RAILS = 7;
const PARTICLE_COUNT = 2100;

/**
 * Horizontal Wave-Like Particle Rails for Ledgerly.
 *
 * Particles flow smoothly from left to right in soft wave formations and
 * transition across 4 states as the user scrolls:
 *  - State 0 (Hero): Calm, steady, fluid horizontal waves.
 *  - State 1 (The Problem): Turbulent, irregular, fragmented wave motion.
 *  - State 2 (The Solution & Capabilities): Clean, structured, parallel payment rails.
 *  - State 3 (Final CTA): Waves gently converge and flow toward the final "Launch App" button.
 */
export function PaymentWaveRails() {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isLanding = pathname === "/";

  useEffect(() => {
    if (!isLanding) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles: RailParticle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const s1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 93.9898 + 19.137) * 24634.6345;
      const r2 = s2 - Math.floor(s2);
      const s3 = Math.sin(i * 45.164 + 63.711) * 19543.1234;
      const r3 = s3 - Math.floor(s3);

      const rail = i % NUM_RAILS;
      const depth = (r2 - 0.5) * 2; // [-1, 1]
      let colorKind: 0 | 1 | 2 = 0;
      if (i % 4 === 0) colorKind = 1; // Muted sage green (#3E6B58)
      else if (i % 13 === 0) colorKind = 2; // Soft slate blue (#4A6B88)

      particles.push({
        u: r1,
        rail,
        laneOffset: (r3 - 0.5) * 2,
        depth,
        speed: 0.00052 + r2 * 0.00042 + rail * 0.00003,
        seed: r1 * Math.PI * 20,
        size: 1.05 + (depth + 1) * 0.48,
        alpha: 0.24 + (depth + 1) * 0.26,
        colorKind,
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

    // Cursor state for gentle wave bending & ripple
    let mouseX = -9999;
    let mouseY = -9999;
    let smoothMouseX = width * 0.5;
    let smoothMouseY = height * 0.5;
    let mouseVelocityY = 0;
    let lastMouseY = height * 0.5;
    let mouseActive = 0;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      const dy = e.clientY - lastMouseY;
      lastMouseY = e.clientY;
      mouseVelocityY = Math.max(-28, Math.min(28, mouseVelocityY * 0.7 + dy * 0.45));
      mouseActive = 1;
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    let smoothStage = 0;
    let rafId = 0;
    const startTime = performance.now();

    /**
     * Map document scroll into a continuous stage value in [0, 3]:
     *   0.0 = Hero (calm horizontal waves)
     *   1.0 = Problem (turbulent, irregular waves)
     *   2.0 = Solution + Capabilities (clean, structured parallel rails)
     *   3.0 = Final CTA (waves converge toward the "Launch App" button)
     */
    const computeScrollStage = (): number => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = Math.max(0, Math.min(1, window.scrollY / maxScroll));
      return ratio * 3.0;
    };

    const getWeights = (stage: number) => {
      // Smooth triangular/bell weights for the 4 states summing to 1
      const s = Math.max(0, Math.min(3, stage));
      const wHero = Math.max(0, 1 - s);
      const wProblem = Math.max(0, 1 - Math.abs(s - 1));
      const wSolution = Math.max(0, 1 - Math.abs(s - 2));
      const wCta = Math.max(0, s - 2);

      // Ease each weight with smoothstep
      const ease = (v: number) => v * v * (3 - 2 * v);
      const eh = ease(wHero);
      const ep = ease(wProblem);
      const es = ease(wSolution);
      const ec = ease(wCta);
      const sum = eh + ep + es + ec || 1;
      return {
        hero: eh / sum,
        problem: ep / sum,
        solution: es / sum,
        cta: ec / sum,
      };
    };

    const render = (now: number) => {
      const t = (now - startTime) * 0.001;
      const targetStage = computeScrollStage();
      smoothStage += (targetStage - smoothStage) * 0.065;

      if (mouseActive > 0) {
        smoothMouseX += (mouseX - smoothMouseX) * 0.11;
        smoothMouseY += (mouseY - smoothMouseY) * 0.11;
        mouseVelocityY *= 0.94;
      }

      const w = getWeights(smoothStage);

      // Measure final CTA "Launch App" button position if visible
      let ctaTargetX = width * 0.5;
      let ctaTargetY = height * 0.56;
      const ctaEl = document.getElementById("final-launch-btn");
      if (ctaEl) {
        const rect = ctaEl.getBoundingClientRect();
        if (rect.top < height * 1.2 && rect.bottom > -height * 0.2) {
          ctaTargetX = rect.left + rect.width * 0.5;
          ctaTargetY = Math.max(height * 0.2, Math.min(height * 0.85, rect.top + rect.height * 0.5));
        }
      }

      ctx.clearRect(0, 0, width, height);

      const centerY = height * 0.54;
      const railSpan = Math.min(height * 0.42, 340);

      // Draw subtle architectural horizontal guide lines when in "Solution" (parallel rails) state
      if (w.solution > 0.08) {
        ctx.strokeStyle = `rgba(62, 107, 88, ${w.solution * 0.09})`;
        ctx.lineWidth = 1;
        for (let r = 0; r < NUM_RAILS; r++) {
          const laneNorm = (r / (NUM_RAILS - 1) - 0.5) * 2;
          const ry = centerY + laneNorm * (railSpan * 0.44);
          ctx.beginPath();
          ctx.moveTo(0, ry);
          ctx.lineTo(width, ry);
          ctx.stroke();
        }
      }

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i]!;

        // Speed modulation: steady in Hero, erratic in Problem, uniform in Solution, brisk into CTA
        const speedMult =
          w.hero * 1.0 +
          w.problem * (0.55 + 0.95 * Math.sin(t * 2.2 + p.seed)) +
          w.solution * 1.25 +
          w.cta * 1.35;

        p.u = (p.u + p.speed * Math.max(0.25, speedMult)) % 1;

        const x = p.u * width;
        const laneNorm = (p.rail / (NUM_RAILS - 1) - 0.5) * 2; // [-1, 1]

        // 1. Hero Y: soft, calm, harmonic horizontal waves
        const heroWave =
          Math.sin(p.u * Math.PI * 2.4 - t * 0.85 + p.rail * 0.55) * 34 +
          Math.cos(p.u * Math.PI * 4.2 - t * 0.45 + p.depth * 1.2) * 14;
        const yHero =
          centerY + laneNorm * (railSpan * 0.38) + heroWave + p.laneOffset * 11;

        // 2. Problem Y: turbulent, irregular, fragmented cross-waves
        const turbWave =
          Math.sin(p.u * Math.PI * 7.5 + t * 2.1 + p.seed) * 62 +
          Math.cos(p.u * Math.PI * 13.0 - t * 1.7 + p.rail * 2.1) * 38 +
          Math.sin(t * 3.1 + p.seed * 2) * 24;
        const yProblem =
          centerY + laneNorm * (railSpan * 0.58) + turbWave + p.laneOffset * 28;

        // 3. Solution Y: crisp, aligned, parallel horizontal payment rails
        const structuredWave = Math.sin(p.u * Math.PI * 2.0 - t * 1.4) * 3.5;
        const ySolution =
          centerY + laneNorm * (railSpan * 0.44) + structuredWave + p.laneOffset * 2.2;

        // 4. Final CTA Y: waves gently converge toward the "Launch App" button focal point
        // As `p.u` approaches `ctaTargetX / width`, rails pinch smoothly toward `ctaTargetY`
        const targetU = Math.max(0.25, Math.min(0.75, ctaTargetX / Math.max(width, 1)));
        const distToTargetU = Math.abs(p.u - targetU);
        const pinch = Math.exp(-(distToTargetU * distToTargetU) / 0.065); // 0 at edges -> 1 at button X
        const baseSpread = laneNorm * (railSpan * 0.46) * (1 - pinch * 0.88);
        const gentleLeadWave =
          Math.sin(p.u * Math.PI * 3.0 - t * 1.2 + p.rail * 0.3) * 16 * (1 - pinch * 0.75);
        const yCta =
          ctaTargetY + baseSpread + gentleLeadWave + p.laneOffset * (6 * (1 - pinch * 0.7));

        let y =
          yHero * w.hero +
          yProblem * w.problem +
          ySolution * w.solution +
          yCta * w.cta;

        // Cursor-interactive wave bend & ripple
        if (mouseActive > 0) {
          const dx = x - smoothMouseX;
          const dy = y - smoothMouseY;
          const distSq = dx * dx + dy * dy;
          const radius = 190;
          if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq) || 1;
            const falloff = 1 - dist / radius;
            const smoothFalloff = falloff * falloff * (3 - 2 * falloff);
            // Gentle vertical bend away from cursor + wake ripple from mouse vertical velocity
            const pushDir = dy >= 0 ? 1 : -1;
            const ripple = Math.sin(dist * 0.08 - t * 6) * 8 * smoothFalloff;
            y += pushDir * smoothFalloff * 24 + mouseVelocityY * smoothFalloff * 0.85 + ripple;
          }
        }

        // Edge fade-in / fade-out so particles enter and exit seamlessly
        const edgeFade = Math.min(1, p.u * 9) * Math.min(1, (1 - p.u) * 9);
        const alpha = p.alpha * edgeFade;

        if (p.colorKind === 1) {
          // Muted sage green (#3E6B58)
          ctx.fillStyle = `rgba(62, 107, 88, ${Math.min(0.92, alpha + 0.14)})`;
        } else if (p.colorKind === 2) {
          // Soft slate blue (#4A6B88)
          ctx.fillStyle = `rgba(74, 107, 136, ${Math.min(0.88, alpha + 0.1)})`;
        } else {
          // Charcoal black (#18191B)
          ctx.fillStyle = `rgba(24, 25, 27, ${alpha})`;
        }

        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isLanding]);

  if (!isLanding) return null;

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
