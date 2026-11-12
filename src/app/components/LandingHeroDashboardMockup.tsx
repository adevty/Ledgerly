"use client";

import React from "react";
import { SEED_DISPLAY_VALUES, SEED_INVOICES } from "@/lib/seed-data";
import type { DashboardState } from "@/app/app/_context";

export interface LandingHeroDashboardMockupProps {
  state?: DashboardState | null;
}

/**
 * SVG mockup fallback of the real Ledgerly workspace dashboard.
 * Rendered when WebGL is unavailable or prefers-reduced-motion is enabled.
 * Dynamically binds to live protocol state when provided.
 */
export function LandingHeroDashboardMockup({ state }: LandingHeroDashboardMockupProps = {}) {
  const escrowContractId = state?.network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet";
  const orgName = state?.organization?.name ?? "Merchant Workspace";

  const settledMerchant = state?.paymentRequests
    ? state.paymentRequests
        .filter((p) => p.status === "SETTLED" || p.status === "PAID")
        .reduce((sum, p) => sum + Number(p.amountDecimal), 0)
    : null;

  const settledRemittance = state?.remittances
    ? state.remittances
        .filter((r) => r.status === "SETTLED")
        .reduce((sum, r) => sum + Number(r.sourceDecimal), 0)
    : null;

  const totalSettledNum =
    settledMerchant !== null || settledRemittance !== null
      ? (settledMerchant ?? 0) + (settledRemittance ?? 0)
      : null;

  const settledBalanceFormatted = totalSettledNum !== null
    ? `${totalSettledNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
    : SEED_DISPLAY_VALUES.settledBalanceFormatted;

  const subtitle = state?.paymentRequests
    ? `${state.paymentRequests.length} Active Invoices · Fully Reconciled`
    : SEED_DISPLAY_VALUES.subtitle;

  const defaultRow1 = {
    id: "pr_inv_8841",
    amount: "1,450.00 USDC",
    status: "SETTLED",
    isGreen: true,
    hash: "e738c4...ab47",
  };
  const defaultRow2 = {
    id: SEED_INVOICES[1]?.orderRef || "INV-2026-8842",
    amount: "1,050.00 USDC",
    status: "SETTLED",
    isGreen: true,
    hash: "3a71d0...92c4",
  };
  const defaultRow3 = {
    id: "INV-2026-8851",
    amount: "420.00 USDC",
    status: "OPEN",
    isGreen: false,
    hash: "7f4c91...19a2",
  };

  const parsedRows = state?.paymentRequests && state.paymentRequests.length > 0
    ? state.paymentRequests.slice(0, 3).map((p, idx) => {
        const isSettled = p.status === "SETTLED";
        const isPaid = p.status === "PAID";
        const isGreen = isSettled || isPaid;
        const hash = p.commitment
          ? `${p.commitment.slice(0, 6)}...${p.commitment.slice(-4)}`
          : (SEED_INVOICES[idx]?.commitmentShort ?? "e738c4...ab47");
        return {
          id: p.id,
          amount: `${Number(p.amountDecimal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
          status: p.status,
          isGreen,
          hash,
        };
      })
    : [];

  const row1 = parsedRows[0] ?? defaultRow1;
  const row2 = parsedRows[1] ?? defaultRow2;
  const row3 = parsedRows[2] ?? defaultRow3;
  return (
    <div
      className="lp-mockup-wrapper"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "var(--surface-canvas)",
      }}
    >
      <svg
        viewBox="0 0 880 580"
        width="100%"
        height="100%"
        role="img"
        aria-label="Ledgerly dashboard showing 4,390.00 USDC settled balance, settled invoice rows, and short commitment hashes with copy controls"
        style={{ maxWidth: 860, height: "auto", display: "block" }}
      >
        {/* Base Workspace Window Plane */}
        <g transform="translate(26, 22)">
          <rect
            x="0"
            y="0"
            width="760"
            height="470"
            rx="18"
            fill="var(--surface-1)"
            stroke="var(--border-default)"
            strokeWidth="1.5"
          />
          {/* Window Top Bar */}
          <rect
            x="1"
            y="1"
            width="758"
            height="46"
            rx="17"
            fill="var(--surface-2)"
          />
          <line
            x1="0"
            y1="47"
            x2="760"
            y2="47"
            stroke="var(--border-subtle)"
            strokeWidth="1"
          />
          {/* Brand Mark */}
          <rect x="18" y="13" width="20" height="20" rx="5" fill="var(--accent-primary)" />
          <path
            d="M24 18V28H33"
            stroke="var(--text-on-accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <text
            x="46"
            y="28"
            fill="var(--text-primary)"
            fontFamily="var(--font-family-sans)"
            fontSize="13"
            fontWeight="700"
          >
            Ledgerly
          </text>
          <text
            x="112"
            y="28"
            fill="var(--text-muted)"
            fontFamily="var(--font-family-sans)"
            fontSize="12"
            fontWeight="500"
          >
            / Merchant Workspace
          </text>

          {/* Topbar Contract Pill */}
          <rect
            x="522"
            y="12"
            width="220"
            height="23"
            rx="6"
            fill="var(--surface-1)"
            stroke="var(--border-default)"
            strokeWidth="1"
          />
          <circle cx="534" cy="23.5" r="3.5" fill="var(--status-settled-fg)" />
          <text
            x="544"
            y="27.5"
            fill="var(--text-secondary)"
            fontFamily="var(--font-family-mono)"
            fontSize="10.5"
            fontWeight="500"
          >
            {escrowContractId}
          </text>

          {/* Left Sidebar */}
          <line
            x1="168"
            y1="47"
            x2="168"
            y2="470"
            stroke="var(--border-subtle)"
            strokeWidth="1"
          />
          <rect x="14" y="64" width="140" height="30" rx="7" fill="var(--surface-2)" />
          <rect x="14" y="71" width="3" height="16" rx="1.5" fill="var(--accent-primary)" />
          <text
            x="28"
            y="83"
            fill="var(--text-primary)"
            fontFamily="var(--font-family-sans)"
            fontSize="12"
            fontWeight="600"
          >
            Overview
          </text>
          <text
            x="28"
            y="116"
            fill="var(--text-secondary)"
            fontFamily="var(--font-family-sans)"
            fontSize="12"
            fontWeight="500"
          >
            Invoices
          </text>
          <text
            x="28"
            y="146"
            fill="var(--text-secondary)"
            fontFamily="var(--font-family-sans)"
            fontSize="12"
            fontWeight="500"
          >
            Remittances
          </text>
          <text
            x="28"
            y="176"
            fill="var(--text-secondary)"
            fontFamily="var(--font-family-sans)"
            fontSize="12"
            fontWeight="500"
          >
            Auditor Access
          </text>

          {/* Settled Balance Strip */}
          <rect
            x="188"
            y="64"
            width="552"
            height="108"
            rx="14"
            fill="var(--surface-2)"
            stroke="var(--border-default)"
            strokeWidth="1"
          />
          <text
            x="208"
            y="88"
            fill="var(--text-muted)"
            fontFamily="var(--font-family-sans)"
            fontSize="11.5"
            fontWeight="600"
          >
            Settled Balance (NEP-141 USDC)
          </text>
          <text
            x="208"
            y="128"
            fill="var(--text-primary)"
            fontFamily="var(--font-family-mono)"
            fontSize="30"
            fontWeight="700"
          >
            {settledBalanceFormatted}
          </text>
          <text
            x="208"
            y="152"
            fill="var(--status-settled-fg)"
            fontFamily="var(--font-family-sans)"
            fontSize="11.5"
            fontWeight="600"
          >
            {subtitle}
          </text>

          {/* Action CTA in Mockup */}
          <rect x="610" y="82" width="112" height="32" rx="8" fill="var(--accent-primary)" />
          <text
            x="666"
            y="102"
            textAnchor="middle"
            fill="var(--text-on-accent)"
            fontFamily="var(--font-family-sans)"
            fontSize="11.5"
            fontWeight="700"
          >
            New Invoice
          </text>
        </g>

        {/* Raised Layer 2: Invoice Rows Table Plane */}
        <g transform="translate(152, 212)">
          <rect
            x="0"
            y="0"
            width="642"
            height="236"
            rx="16"
            fill="var(--surface-2)"
            stroke="var(--border-default)"
            strokeWidth="1.5"
          />
          <text
            x="22"
            y="30"
            fill="var(--text-primary)"
            fontFamily="var(--font-family-sans)"
            fontSize="13"
            fontWeight="650"
          >
            Recent Invoices
          </text>
          <text
            x="505"
            y="30"
            fill="var(--text-muted)"
            fontFamily="var(--font-family-sans)"
            fontSize="11.5"
            fontWeight="500"
          >
            Off-chain details · On-chain hash
          </text>
          <line
            x1="0"
            y1="44"
            x2="642"
            y2="44"
            stroke="var(--border-subtle)"
            strokeWidth="1"
          />

          {/* Row 1 */}
          <g transform="translate(16, 56)">
            <rect
              x="0"
              y="0"
              width="610"
              height="48"
              rx="10"
              fill="var(--surface-1)"
              stroke="var(--border-subtle)"
              strokeWidth="1"
            />
            <text
              x="16"
              y="29"
              fill="var(--text-primary)"
              fontFamily="var(--font-family-mono)"
              fontSize="12.5"
              fontWeight="600"
            >
              {row1.id}
            </text>
            <text
              x="164"
              y="29"
              fill="var(--text-primary)"
              fontFamily="var(--font-family-mono)"
              fontSize="12.5"
              fontWeight="700"
            >
              {row1.amount}
            </text>
            {/* Status badge */}
            <rect
              x="300"
              y="13"
              width="78"
              height="22"
              rx="6"
              fill={row1.isGreen ? "var(--status-settled-bg)" : "var(--status-pending-bg)"}
              stroke={row1.isGreen ? "var(--status-settled-border)" : "var(--status-pending-border)"}
              strokeWidth="1"
            />
            <circle cx="313" cy="24" r="3" fill={row1.isGreen ? "var(--status-settled-fg)" : "var(--status-pending-fg)"} />
            <text
              x="323"
              y="28"
              fill={row1.isGreen ? "var(--status-settled-fg)" : "var(--status-pending-fg)"}
              fontFamily="var(--font-family-sans)"
              fontSize="10.5"
              fontWeight="650"
            >
              {row1.status}
            </text>
            {/* Short hash + copy */}
            <rect
              x="448"
              y="12"
              width="146"
              height="24"
              rx="6"
              fill="var(--surface-2)"
              stroke="var(--border-default)"
              strokeWidth="1"
            />
            <text
              x="460"
              y="28"
              fill="var(--text-secondary)"
              fontFamily="var(--font-family-mono)"
              fontSize="11"
            >
              {row1.hash}
            </text>
            <rect
              x="573"
              y="18"
              width="9"
              height="9"
              rx="1.5"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.2"
            />
            <path
              d="M571 24H570V16H578V17"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.2"
            />
          </g>

          {/* Row 2 */}
          <g transform="translate(16, 114)">
            <rect
              x="0"
              y="0"
              width="610"
              height="48"
              rx="10"
              fill="var(--surface-1)"
              stroke="var(--border-subtle)"
              strokeWidth="1"
            />
            <text
              x="16"
              y="29"
              fill="var(--text-primary)"
              fontFamily="var(--font-family-mono)"
              fontSize="12.5"
              fontWeight="600"
            >
              {row2.id}
            </text>
            <text
              x="164"
              y="29"
              fill="var(--text-primary)"
              fontFamily="var(--font-family-mono)"
              fontSize="12.5"
              fontWeight="700"
            >
              {row2.amount}
            </text>
            <rect
              x="300"
              y="13"
              width="78"
              height="22"
              rx="6"
              fill={row2.isGreen ? "var(--status-settled-bg)" : "var(--status-pending-bg)"}
              stroke={row2.isGreen ? "var(--status-settled-border)" : "var(--status-pending-border)"}
              strokeWidth="1"
            />
            <circle cx="313" cy="24" r="3" fill={row2.isGreen ? "var(--status-settled-fg)" : "var(--status-pending-fg)"} />
            <text
              x="323"
              y="28"
              fill={row2.isGreen ? "var(--status-settled-fg)" : "var(--status-pending-fg)"}
              fontFamily="var(--font-family-sans)"
              fontSize="10.5"
              fontWeight="650"
            >
              {row2.status}
            </text>
            <rect
              x="448"
              y="12"
              width="146"
              height="24"
              rx="6"
              fill="var(--surface-2)"
              stroke="var(--border-default)"
              strokeWidth="1"
            />
            <text
              x="460"
              y="28"
              fill="var(--text-secondary)"
              fontFamily="var(--font-family-mono)"
              fontSize="11"
            >
              {row2.hash}
            </text>
            <rect
              x="573"
              y="18"
              width="9"
              height="9"
              rx="1.5"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.2"
            />
            <path
              d="M571 24H570V16H578V17"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.2"
            />
          </g>

          {/* Row 3 */}
          <g transform="translate(16, 172)">
            <rect
              x="0"
              y="0"
              width="610"
              height="48"
              rx="10"
              fill="var(--surface-1)"
              stroke="var(--border-subtle)"
              strokeWidth="1"
            />
            <text
              x="16"
              y="29"
              fill="var(--text-primary)"
              fontFamily="var(--font-family-mono)"
              fontSize="12.5"
              fontWeight="600"
            >
              {row3.id}
            </text>
            <text
              x="164"
              y="29"
              fill="var(--text-primary)"
              fontFamily="var(--font-family-mono)"
              fontSize="12.5"
              fontWeight="700"
            >
              {row3.amount}
            </text>
            <rect
              x="300"
              y="13"
              width="66"
              height="22"
              rx="6"
              fill={row3.isGreen ? "var(--status-settled-bg)" : "var(--status-pending-bg)"}
              stroke={row3.isGreen ? "var(--status-settled-border)" : "var(--status-pending-border)"}
              strokeWidth="1"
            />
            <circle cx="313" cy="24" r="3" fill={row3.isGreen ? "var(--status-settled-fg)" : "var(--status-pending-fg)"} />
            <text
              x="323"
              y="28"
              fill={row3.isGreen ? "var(--status-settled-fg)" : "var(--status-pending-fg)"}
              fontFamily="var(--font-family-sans)"
              fontSize="10.5"
              fontWeight="650"
            >
              {row3.status}
            </text>
            <rect
              x="448"
              y="12"
              width="146"
              height="24"
              rx="6"
              fill="var(--surface-2)"
              stroke="var(--border-default)"
              strokeWidth="1"
            />
            <text
              x="460"
              y="28"
              fill="var(--text-secondary)"
              fontFamily="var(--font-family-mono)"
              fontSize="11"
            >
              {row3.hash}
            </text>
            <rect
              x="573"
              y="18"
              width="9"
              height="9"
              rx="1.5"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.2"
            />
            <path
              d="M571 24H570V16H578V17"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.2"
            />
          </g>
        </g>

        {/* Raised Layer 3: On-Chain Commitment Verification Card */}
        <g transform="translate(500, 428)">
          <rect
            x="0"
            y="0"
            width="350"
            height="124"
            rx="16"
            fill="var(--surface-3)"
            stroke="var(--border-strong)"
            strokeWidth="1.25"
          />
          <circle cx="24" cy="28" r="5" fill="var(--status-settled-fg)" />
          <text
            x="36"
            y="32"
            fill="var(--text-primary)"
            fontFamily="var(--font-family-sans)"
            fontSize="12.5"
            fontWeight="650"
          >
            Verified on NEAR
          </text>
          <text
            x="24"
            y="58"
            fill="var(--text-secondary)"
            fontFamily="var(--font-family-sans)"
            fontSize="11.5"
          >
            Commitment Hash
          </text>
          <rect
            x="140"
            y="43"
            width="186"
            height="24"
            rx="6"
            fill="var(--surface-1)"
            stroke="var(--border-default)"
            strokeWidth="1"
          />
          <text
            x="152"
            y="59"
            fill="var(--text-primary)"
            fontFamily="var(--font-family-mono)"
            fontSize="11.5"
            fontWeight="600"
          >
            8f9c2e...41b9
          </text>
          <text
            x="284"
            y="59"
            fill="var(--accent-primary)"
            fontFamily="var(--font-family-sans)"
            fontSize="10.5"
            fontWeight="600"
          >
            Copy
          </text>
          <text
            x="24"
            y="95"
            fill="var(--text-muted)"
            fontFamily="var(--font-family-mono)"
            fontSize="10.5"
          >
            Tx 4PDxv1...Wuhaa · Balanced 2/2 legs
          </text>
        </g>
      </svg>
    </div>
  );
}
