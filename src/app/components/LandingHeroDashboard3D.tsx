"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { SEED_DISPLAY_VALUES, SEED_INVOICES, SEED_OPEN_ESCROW_USDC } from "@/lib/seed-data";

interface ResolvedScenePalette {
  canvasBg: string;
  surface1: string;
  surface2: string;
  surface3: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  accentPrimary: string;
  accentSubtle: string;
  settledFg: string;
  settledBg: string;
  settledBorder: string;
  pendingFg: string;
  pendingBg: string;
  pendingBorder: string;
  lightKey: string;
  lightFill: string;
  lightAmbient: string;
  fontSans: string;
  fontMono: string;
}

function readScenePaletteFromTokens(): ResolvedScenePalette {
  const probe = document.createElement("span");
  probe.style.position = "fixed";
  probe.style.left = "-9999px";
  probe.style.top = "-9999px";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const resolveColor = (cssVar: string): string => {
    probe.style.color = `var(${cssVar})`;
    return window.getComputedStyle(probe).color;
  };

  probe.style.fontFamily = "var(--font-family-sans)";
  const fontSans = window.getComputedStyle(probe).fontFamily || "sans-serif";

  probe.style.fontFamily = "var(--font-family-mono)";
  const fontMono = window.getComputedStyle(probe).fontFamily || "monospace";

  const palette: ResolvedScenePalette = {
    canvasBg: resolveColor("--surface-canvas"),
    surface1: resolveColor("--surface-1"),
    surface2: resolveColor("--surface-2"),
    surface3: resolveColor("--surface-3"),
    borderSubtle: resolveColor("--border-subtle"),
    borderDefault: resolveColor("--border-default"),
    borderStrong: resolveColor("--border-strong"),
    textPrimary: resolveColor("--text-primary"),
    textSecondary: resolveColor("--text-secondary"),
    textMuted: resolveColor("--text-muted"),
    textOnAccent: resolveColor("--text-on-accent"),
    accentPrimary: resolveColor("--accent-primary"),
    accentSubtle: resolveColor("--accent-subtle"),
    settledFg: resolveColor("--status-settled-fg"),
    settledBg: resolveColor("--status-settled-bg"),
    settledBorder: resolveColor("--status-settled-border"),
    pendingFg: resolveColor("--status-pending-fg"),
    pendingBg: resolveColor("--status-pending-bg"),
    pendingBorder: resolveColor("--status-pending-border"),
    lightKey: resolveColor("--scene-light-key"),
    lightFill: resolveColor("--scene-light-fill"),
    lightAmbient: resolveColor("--scene-light-ambient"),
    fontSans,
    fontMono,
  };

  document.body.removeChild(probe);
  return palette;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCopyGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  strokeStyle: string,
) {
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = Math.max(1.5, size * 0.11);
  ctx.lineJoin = "round";
  const box = size * 0.64;
  drawRoundedRect(ctx, x + size * 0.28, y + size * 0.28, box, box, size * 0.12);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + size * 0.2, y + size * 0.68);
  ctx.lineTo(x + size * 0.12, y + size * 0.68);
  ctx.lineTo(x + size * 0.12, y + size * 0.12);
  ctx.lineTo(x + size * 0.68, y + size * 0.12);
  ctx.lineTo(x + size * 0.68, y + size * 0.2);
  ctx.stroke();
  ctx.restore();
}

function buildBaseDashboardTexture(
  palette: ResolvedScenePalette,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 1280;
  const height = 800;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  // Outer card fill
  drawRoundedRect(ctx, 2, 2, width - 4, height - 4, 30);
  ctx.fillStyle = palette.surface1;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.borderDefault;
  ctx.stroke();

  // Clip inside rounded window
  ctx.save();
  drawRoundedRect(ctx, 3, 3, width - 6, height - 6, 28);
  ctx.clip();

  // Topbar
  ctx.fillStyle = palette.surface2;
  ctx.fillRect(0, 0, width, 82);
  ctx.strokeStyle = palette.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 82);
  ctx.lineTo(width, 82);
  ctx.stroke();

  // Brand mark
  drawRoundedRect(ctx, 32, 22, 38, 38, 10);
  ctx.fillStyle = palette.accentPrimary;
  ctx.fill();

  ctx.strokeStyle = palette.textOnAccent;
  ctx.lineWidth = 4.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(44, 32);
  ctx.lineTo(44, 50);
  ctx.lineTo(60, 50);
  ctx.stroke();

  ctx.fillStyle = palette.textPrimary;
  ctx.font = `700 24px ${palette.fontSans}`;
  ctx.fillText("Ledgerly", 84, 49);

  ctx.fillStyle = palette.textMuted;
  ctx.font = `500 20px ${palette.fontSans}`;
  ctx.fillText("/  Merchant Workspace", 200, 49);

  // Network contract badge on right
  drawRoundedRect(ctx, 846, 20, 402, 42, 11);
  ctx.fillStyle = palette.surface1;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.borderDefault;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(870, 41, 6, 0, Math.PI * 2);
  ctx.fillStyle = palette.settledFg;
  ctx.fill();

  ctx.fillStyle = palette.textSecondary;
  ctx.font = `500 18px ${palette.fontMono}`;
  ctx.fillText("ledgerly-escrow-9e70f9ea.testnet", 888, 47);

  // Sidebar column
  ctx.fillStyle = palette.surface1;
  ctx.fillRect(0, 83, 256, height - 83);
  ctx.strokeStyle = palette.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(256, 82);
  ctx.lineTo(256, height);
  ctx.stroke();

  const navItems = [
    { label: "Overview", active: true, count: "" },
    { label: "Merchant Checkout", active: false, count: "3" },
    { label: "Remittances", active: false, count: "2" },
    { label: "Auditor Access", active: false, count: "5" },
  ];

  navItems.forEach((item, idx) => {
    const y = 114 + idx * 62;
    if (item.active) {
      drawRoundedRect(ctx, 20, y, 216, 48, 12);
      ctx.fillStyle = palette.surface2;
      ctx.fill();

      drawRoundedRect(ctx, 20, y + 11, 5, 26, 2.5);
      ctx.fillStyle = palette.accentPrimary;
      ctx.fill();
    }
    ctx.fillStyle = item.active ? palette.textPrimary : palette.textSecondary;
    ctx.font = `${item.active ? "600" : "500"} 19px ${palette.fontSans}`;
    ctx.fillText(item.label, 42, y + 31);

    if (item.count) {
      ctx.fillStyle = palette.textMuted;
      ctx.font = `600 16px ${palette.fontMono}`;
      ctx.fillText(item.count, 212, y + 30);
    }
  });

  // Sidebar bottom accounting status card
  drawRoundedRect(ctx, 20, 646, 216, 120, 14);
  ctx.fillStyle = palette.surface2;
  ctx.fill();
  ctx.strokeStyle = palette.borderDefault;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = palette.textMuted;
  ctx.font = `600 15px ${palette.fontSans}`;
  ctx.fillText("Ledger Reconciliation", 38, 678);

  ctx.fillStyle = palette.settledFg;
  ctx.font = `600 18px ${palette.fontSans}`;
  ctx.fillText("All Escrows Balanced", 38, 710);

  ctx.fillStyle = palette.textSecondary;
  ctx.font = `500 15px ${palette.fontMono}`;
  ctx.fillText("12 legs · CSV ready", 38, 740);

  // Main workspace top balance panel
  drawRoundedRect(ctx, 290, 114, 954, 214, 22);
  ctx.fillStyle = palette.surface2;
  ctx.fill();
  ctx.strokeStyle = palette.borderDefault;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = palette.textMuted;
  ctx.font = `600 18px ${palette.fontSans}`;
  ctx.fillText("Settled Treasury Balance (NEP-141 USDC)", 324, 158);

  ctx.fillStyle = palette.textPrimary;
  ctx.font = `700 56px ${palette.fontMono}`;
  ctx.fillText(SEED_DISPLAY_VALUES.settledBalanceFormatted, 324, 232);

  // Verified status pill inside balance card
  drawRoundedRect(ctx, 324, 258, 366, 40, 10);
  ctx.fillStyle = palette.settledBg;
  ctx.fill();
  ctx.strokeStyle = palette.settledBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(346, 278, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = palette.settledFg;
  ctx.fill();

  ctx.fillStyle = palette.settledFg;
  ctx.font = `600 17px ${palette.fontSans}`;
  ctx.fillText("Verified on NEAR · Balanced books", 362, 284);

  // Orange primary button inside balance card
  drawRoundedRect(ctx, 1024, 142, 188, 54, 13);
  ctx.fillStyle = palette.accentPrimary;
  ctx.fill();
  ctx.fillStyle = palette.textOnAccent;
  ctx.font = `700 19px ${palette.fontSans}`;
  ctx.fillText("+ New Invoice", 1054, 176);

  // Subtle lower metrics grid visible behind the raised foreground planes
  const kpis = [
    { label: "Today Settled", val: "1,930.00 USDC" },
    { label: "Open Escrow", val: SEED_DISPLAY_VALUES.openEscrowFormatted },
    { label: "Active View Keys", val: "1 Scoped Key" },
  ];
  kpis.forEach((kpi, idx) => {
    const x = 290 + idx * 324;
    drawRoundedRect(ctx, x, 356, 306, 122, 18);
    ctx.fillStyle = palette.surface2;
    ctx.fill();
    ctx.strokeStyle = palette.borderSubtle;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = palette.textMuted;
    ctx.font = `500 16px ${palette.fontSans}`;
    ctx.fillText(kpi.label, x + 24, 396);

    ctx.fillStyle = palette.textPrimary;
    ctx.font = `700 26px ${palette.fontMono}`;
    ctx.fillText(kpi.val, x + 24, 442);
  });

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function buildInvoicesPlaneTexture(
  palette: ResolvedScenePalette,
  copied: boolean,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 1080;
  const height = 430;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  drawRoundedRect(ctx, 2, 2, width - 4, height - 4, 26);
  ctx.fillStyle = palette.surface2;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.borderDefault;
  ctx.stroke();

  ctx.fillStyle = palette.textPrimary;
  ctx.font = `600 22px ${palette.fontSans}`;
  ctx.fillText("Merchant Invoices", 34, 52);

  ctx.fillStyle = palette.textMuted;
  ctx.font = `500 17px ${palette.fontSans}`;
  ctx.fillText("Private off-chain details · SHA-256 commitment on NEAR", 590, 52);

  ctx.strokeStyle = palette.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, 78);
  ctx.lineTo(width - 2, 78);
  ctx.stroke();

  const rows = [
    {
      id: SEED_INVOICES[0].id,
      amount: `${SEED_INVOICES[0].amountDecimal} USDC`,
      status: SEED_INVOICES[0].status,
      settled: SEED_INVOICES[0].status === "SETTLED",
      hash: SEED_INVOICES[0].commitmentShort,
    },
    {
      id: SEED_INVOICES[1].id,
      amount: `${SEED_INVOICES[1].amountDecimal} USDC`,
      status: SEED_INVOICES[1].status,
      settled: SEED_INVOICES[1].status === "SETTLED",
      hash: SEED_INVOICES[1].commitmentShort,
    },
    {
      id: SEED_INVOICES[3].id,
      amount: `${SEED_INVOICES[3].amountDecimal} USDC`,
      status: SEED_INVOICES[3].status,
      settled: (SEED_INVOICES[3].status as string) === "SETTLED",
      hash: SEED_INVOICES[3].commitmentShort,
    },
  ];

  rows.forEach((row, idx) => {
    const y = 100 + idx * 104;
    drawRoundedRect(ctx, 28, y, width - 56, 86, 16);
    ctx.fillStyle = palette.surface1;
    ctx.fill();
    ctx.strokeStyle = palette.borderSubtle;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Invoice ID
    ctx.fillStyle = palette.textPrimary;
    ctx.font = `600 21px ${palette.fontMono}`;
    ctx.fillText(row.id, 54, y + 51);

    // Amount
    ctx.fillStyle = palette.textPrimary;
    ctx.font = `700 22px ${palette.fontMono}`;
    ctx.fillText(row.amount, 286, y + 51);

    // Status pill
    const pillW = row.settled ? 132 : 104;
    drawRoundedRect(ctx, 514, y + 23, pillW, 40, 10);
    ctx.fillStyle = row.settled ? palette.settledBg : palette.pendingBg;
    ctx.fill();
    ctx.strokeStyle = row.settled ? palette.settledBorder : palette.pendingBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(536, y + 43, 5, 0, Math.PI * 2);
    ctx.fillStyle = row.settled ? palette.settledFg : palette.pendingFg;
    ctx.fill();

    ctx.fillStyle = row.settled ? palette.settledFg : palette.pendingFg;
    ctx.font = `600 17px ${palette.fontSans}`;
    ctx.fillText(row.status, 550, y + 49);

    // Short hash chip with copy button
    drawRoundedRect(ctx, 742, y + 21, 286, 44, 10);
    ctx.fillStyle = palette.surface2;
    ctx.fill();
    ctx.strokeStyle = idx === 0 && copied ? palette.accentPrimary : palette.borderDefault;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = palette.textSecondary;
    ctx.font = `500 18px ${palette.fontMono}`;
    ctx.fillText(row.hash, 762, y + 49);

    if (idx === 0 && copied) {
      ctx.fillStyle = palette.settledFg;
      ctx.font = `600 16px ${palette.fontSans}`;
      ctx.fillText("Copied", 948, y + 49);
    } else {
      drawCopyGlyph(ctx, 984, y + 31, 24, palette.textMuted);
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function buildVerificationCardTexture(
  palette: ResolvedScenePalette,
  copied: boolean,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 620;
  const height = 250;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  drawRoundedRect(ctx, 2, 2, width - 4, height - 4, 24);
  ctx.fillStyle = palette.surface3;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.borderStrong;
  ctx.stroke();

  // Status dot + header
  ctx.beginPath();
  ctx.arc(38, 44, 7, 0, Math.PI * 2);
  ctx.fillStyle = palette.settledFg;
  ctx.fill();

  ctx.fillStyle = palette.textPrimary;
  ctx.font = `600 21px ${palette.fontSans}`;
  ctx.fillText("Verified on NEAR", 56, 51);

  drawRoundedRect(ctx, 434, 24, 156, 38, 10);
  ctx.fillStyle = palette.settledBg;
  ctx.fill();
  ctx.strokeStyle = palette.settledBorder;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = palette.settledFg;
  ctx.font = `600 16px ${palette.fontSans}`;
  ctx.fillText("Match Confirmed", 450, 49);

  // Commitment Hash row with copy button
  drawRoundedRect(ctx, 28, 86, width - 56, 68, 14);
  ctx.fillStyle = palette.surface1;
  ctx.fill();
  ctx.strokeStyle = copied ? palette.accentPrimary : palette.borderDefault;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = palette.textMuted;
  ctx.font = `500 17px ${palette.fontSans}`;
  ctx.fillText("Commitment", 48, 126);

  ctx.fillStyle = palette.textPrimary;
  ctx.font = `600 20px ${palette.fontMono}`;
  ctx.fillText("8f9c2e...41b9", 188, 127);

  drawRoundedRect(ctx, 456, 100, 114, 40, 10);
  ctx.fillStyle = copied ? palette.settledBg : palette.accentSubtle;
  ctx.fill();
  ctx.fillStyle = copied ? palette.settledFg : palette.accentPrimary;
  ctx.font = `600 16px ${palette.fontSans}`;
  ctx.fillText(copied ? "Copied" : "Copy Hash", copied ? 485 : 472, 126);

  // Bottom receipt metadata
  ctx.fillStyle = palette.textSecondary;
  ctx.font = `500 17px ${palette.fontMono}`;
  ctx.fillText("Tx 4PDxv1...Wuhaa  ·  2/2 Balanced Journal Legs", 30, 206);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

interface LayeredPlanesProps {
  palette: ResolvedScenePalette;
  pointerRef: React.MutableRefObject<{ x: number; y: number }>;
  scrollProgress: number;
  copied: boolean;
  onCopyHash: () => void;
}

function LayeredDashboardPlanes({
  palette,
  pointerRef,
  scrollProgress,
  copied,
  onCopyHash,
}: LayeredPlanesProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { gl, invalidate } = useThree();
  const maxAnisotropy = useMemo(() => Math.min(8, gl.capabilities.getMaxAnisotropy()), [gl]);

  const sceneBgColor = useMemo(() => new THREE.Color(palette.canvasBg), [palette.canvasBg]);
  const slabSurface1 = useMemo(() => new THREE.Color(palette.surface1), [palette.surface1]);
  const slabSurface2 = useMemo(() => new THREE.Color(palette.surface2), [palette.surface2]);
  const slabSurface3 = useMemo(() => new THREE.Color(palette.surface3), [palette.surface3]);
  const keyLightColor = useMemo(() => new THREE.Color(palette.lightKey), [palette.lightKey]);
  const fillLightColor = useMemo(() => new THREE.Color(palette.lightFill), [palette.lightFill]);
  const ambientLightColor = useMemo(
    () => new THREE.Color(palette.lightAmbient),
    [palette.lightAmbient],
  );

  const baseTexture = useMemo(
    () => buildBaseDashboardTexture(palette, maxAnisotropy),
    [palette, maxAnisotropy],
  );
  const invoicesTexture = useMemo(
    () => buildInvoicesPlaneTexture(palette, copied, maxAnisotropy),
    [palette, copied, maxAnisotropy],
  );
  const verificationTexture = useMemo(
    () => buildVerificationCardTexture(palette, copied, maxAnisotropy),
    [palette, copied, maxAnisotropy],
  );

  useEffect(() => {
    return () => {
      baseTexture.dispose();
    };
  }, [baseTexture]);

  useEffect(() => {
    return () => {
      invoicesTexture.dispose();
    };
  }, [invoicesTexture]);

  useEffect(() => {
    return () => {
      verificationTexture.dispose();
    };
  }, [verificationTexture]);

  useEffect(() => {
    invalidate();
  }, [palette, scrollProgress, copied, invalidate]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const clampedScroll = Math.max(0, Math.min(1, scrollProgress));
    // Calm architectural tilt + soft pointer parallax + slow scroll rotation
    const targetRotY = -0.17 + pointerRef.current.x * 0.11 + clampedScroll * 0.22;
    const targetRotX = 0.09 - pointerRef.current.y * 0.08 - clampedScroll * 0.11;
    const targetPosY = clampedScroll * 0.08;

    const damp = 1 - Math.exp(-Math.min(delta, 0.05) * 7.5);
    group.rotation.y += (targetRotY - group.rotation.y) * damp;
    group.rotation.x += (targetRotX - group.rotation.x) * damp;
    group.position.y += (targetPosY - group.position.y) * damp;

    if (
      Math.abs(targetRotY - group.rotation.y) > 0.0006 ||
      Math.abs(targetRotX - group.rotation.x) > 0.0006 ||
      Math.abs(targetPosY - group.position.y) > 0.0006
    ) {
      invalidate();
    }
  });

  return (
    <>
      <color attach="background" args={[sceneBgColor]} />
      <ambientLight color={ambientLightColor} intensity={2.05} />
      <directionalLight position={[3.6, 4.2, 5.4]} color={keyLightColor} intensity={0.95} />
      <directionalLight position={[-4.0, -2.2, 3.2]} color={fillLightColor} intensity={0.42} />

      <group ref={groupRef} rotation={[0.09, -0.17, 0]}>
        {/* Plane 1 (Base): Ledgerly Workspace Shell + Settled Balance */}
        <group position={[-0.22, 0.18, 0]}>
          <RoundedBox args={[4.52, 2.82, 0.05]} radius={0.09} smoothness={4} position={[0, 0, -0.028]}>
            <meshStandardMaterial color={slabSurface1} roughness={0.93} metalness={0.02} />
          </RoundedBox>
          <mesh position={[0, 0, 0.001]}>
            <planeGeometry args={[4.48, 2.8]} />
            <meshStandardMaterial
              map={baseTexture}
              transparent
              roughness={0.92}
              metalness={0.02}
            />
          </mesh>
        </group>

        {/* Plane 2 (Raised Midground): Invoice Settlement Rows with SETTLED badges */}
        <group position={[0.24, -0.34, 0.24]} rotation={[0, -0.02, 0]}>
          <RoundedBox args={[3.74, 1.49, 0.045]} radius={0.08} smoothness={4} position={[0, 0, -0.025]}>
            <meshStandardMaterial color={slabSurface2} roughness={0.92} metalness={0.02} />
          </RoundedBox>
          <mesh position={[0, 0, 0.001]} onClick={onCopyHash}>
            <planeGeometry args={[3.7, 1.47]} />
            <meshStandardMaterial
              map={invoicesTexture}
              transparent
              roughness={0.91}
              metalness={0.02}
            />
          </mesh>
        </group>

        {/* Plane 3 (Raised Foreground): On-Chain Commitment Hash + Copy Action */}
        <group position={[0.88, -0.96, 0.46]} rotation={[-0.015, -0.035, 0]}>
          <RoundedBox args={[2.18, 0.88, 0.045]} radius={0.075} smoothness={4} position={[0, 0, -0.025]}>
            <meshStandardMaterial color={slabSurface3} roughness={0.9} metalness={0.02} />
          </RoundedBox>
          <mesh position={[0, 0, 0.001]} onClick={onCopyHash}>
            <planeGeometry args={[2.14, 0.86]} />
            <meshStandardMaterial
              map={verificationTexture}
              transparent
              roughness={0.9}
              metalness={0.02}
            />
          </mesh>
        </group>
      </group>
    </>
  );
}

export interface LandingHeroDashboard3DProps {
  scrollProgress: number;
  copied: boolean;
  onCopyHash: () => void;
}

export default function LandingHeroDashboard3D({
  scrollProgress,
  copied,
  onCopyHash,
}: LandingHeroDashboard3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [palette, setPalette] = useState<ResolvedScenePalette | null>(null);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [, setFontTick] = useState(0);

  useEffect(() => {
    setPalette(readScenePaletteFromTokens());

    const observer = new MutationObserver(() => {
      setPalette(readScenePaletteFromTokens());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });

    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        setPalette(readScenePaletteFromTokens());
        setFontTick((c) => c + 1);
      });
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        setInView(Boolean(entries[0]?.isIntersecting));
      },
      { threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      setTabVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const isActive = inView && tabVisible;

  return (
    <div
      ref={containerRef}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        pointerRef.current = {
          x: Math.max(-1, Math.min(1, nx)),
          y: Math.max(-1, Math.min(1, ny)),
        };
      }}
      onPointerLeave={() => {
        pointerRef.current = { x: 0, y: 0 };
      }}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        cursor: "grab",
        backgroundColor: "var(--surface-canvas)",
      }}
      aria-label="Interactive 3D preview of the Ledgerly merchant dashboard"
    >
      {palette && (
        <Canvas
          flat
          dpr={[1, 2]}
          frameloop={isActive ? "demand" : "never"}
          camera={{ position: [0.06, -0.08, 5.25], fov: 36 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <LayeredDashboardPlanes
            palette={palette}
            pointerRef={pointerRef}
            scrollProgress={scrollProgress}
            copied={copied}
            onCopyHash={onCopyHash}
          />
        </Canvas>
      )}
    </div>
  );
}
