"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useReducedMotion, useScroll } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Moon,
  Sun,
} from "lucide-react";
import { CryptoTokenIcon } from "./components/CryptoTokenIcon";
import { HashBadge } from "./components/HashBadge";
import { LandingHeroDashboardMockup } from "./components/LandingHeroDashboardMockup";
import type { DashboardState } from "./app/_context";

const LandingHeroDashboard3D = dynamic(() => import("./components/LandingHeroDashboard3D"), {
  ssr: false,
  loading: () => <LandingHeroDashboardMockup />,
});

const DEMO_COMMITMENT_HASH =
  "8f9c2e04a1b7d3e9520c64f8a12e7b93d501c8e4f2a690b3d71e5c84a20f41b9";
const ESCROW_CONTRACT_ID = "ledgerly-escrow-9e70f9ea.testnet";
const USDC_CONTRACT_ID = "ledgerly-usdc-a627a4c0.testnet";
const OPERATOR_ACCOUNT_ID = "ledgerly-op-a627a4c0.testnet";
const VERIFIED_RELEASE_TX = "4PDxv1WbzU9XQ9LAMSKAJ4iVuha9SfymWvw1pRTWuhaa";
const VERIFIED_DEPOSIT_TX = "48uhApH2ij8eQ4PsDau2J6Zg5qi1ZvJFMK2n1rBJzdFa";
const VERIFIED_ANCHOR_TX = "1VQz6TK4ksKVsS7uwucPg3B2y3bnFMDghAdfo1RZNWG";

function detectWebGLSupport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

function LedgerlyBrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--accent-primary)" />
      <path
        d="M8 7.5V16.5H16"
        stroke="var(--text-on-accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SUPPORTED_RAILS: Array<{ label: string; symbol: string; chain: string }> = [
  { label: "NEAR USDC", symbol: "USDC", chain: "near" },
  { label: "Solana", symbol: "SOL", chain: "sol" },
  { label: "Base", symbol: "ETH", chain: "base" },
  { label: "Arbitrum", symbol: "USDC", chain: "arb" },
  { label: "Ethereum", symbol: "ETH", chain: "eth" },
  { label: "Bitcoin", symbol: "BTC", chain: "btc" },
];

export default function LandingPage() {
  const prefersReducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const [webglReady, setWebglReady] = useState<boolean | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [copiedHeroHash, setCopiedHeroHash] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [protocolState, setProtocolState] = useState<DashboardState | null>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  useEffect(() => {
    let mounted = true;
    const fetchState = async () => {
      try {
        const res = await fetch("/api/v1/state", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as DashboardState;
        if (mounted) {
          setProtocolState(data);
        }
      } catch {
        // silent fallback
      }
    };

    void fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const escrowContractId = protocolState?.network?.escrowContractId || ESCROW_CONTRACT_ID;
  const explorerBaseUrl = protocolState?.network?.explorerBaseUrl || "https://testnet.nearblocks.io";
  const orgName = protocolState?.organization?.name || "Atelier Sari Global Ltd.";

  const paymentRequests = protocolState?.paymentRequests;
  const totalInvoicesCount = paymentRequests?.length ?? 4;
  const settledInvoicesCount = paymentRequests
    ? paymentRequests.filter((p) => p.status === "SETTLED").length
    : 3;
  const hasPendingInvoices = paymentRequests
    ? paymentRequests.some((p) => p.status === "OPEN" || p.status === "PARTIALLY_PAID")
    : false;

  const statusLabel = hasPendingInvoices
    ? `${settledInvoicesCount}/${totalInvoicesCount} SETTLED`
    : "SETTLED";
  const statusPillClass = hasPendingInvoices ? "status-pill-amber" : "status-pill-emerald";

  const totalSettledUsdc = paymentRequests
    ? paymentRequests
        .filter((p) => p.status === "SETTLED")
        .reduce((acc, p) => acc + Number(p.receivedDecimal || p.amountDecimal), 0)
        .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "4,390.00";

  const activeCommitmentHash =
    paymentRequests?.[0]?.commitment || DEMO_COMMITMENT_HASH;

  useEffect(() => {
    setWebglReady(detectWebGLSupport());
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light") {
      setTheme("light");
    }
  }, []);

  useEffect(() => {
    return scrollYProgress.on("change", (latest) => {
      setScrollProgress(latest);
    });
  }, [scrollYProgress]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (next === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      return next;
    });
  }, []);

  const handleCopyHeroHash = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(activeCommitmentHash);
      setCopiedHeroHash(true);
      window.setTimeout(() => setCopiedHeroHash(false), 1800);
    } catch {
      // clipboard unavailable
    }
  }, [activeCommitmentHash]);

  const show3DStage = webglReady === true && !prefersReducedMotion;

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-canvas)",
        color: "var(--text-primary)",
      }}
    >
      {/* Top Navigation */}
      <header className="lp-header">
        <div className="lp-header-inner">
          <Link href="/" className="lp-brand">
            <LedgerlyBrandMark />
            <span>Ledgerly</span>
          </Link>

          <nav className="lp-nav" aria-label="Primary">
            <a href="#pillars" className="lp-nav-link">
              Capabilities
            </a>
            <a href="#workflow" className="lp-nav-link">
              Workflow
            </a>
            <a href="#contracts" className="lp-nav-link">
              NEAR Testnet
            </a>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <button
              type="button"
              onClick={toggleTheme}
              className="btn-quiet"
              style={{ padding: "0.42rem 0.7rem", fontSize: "0.8rem" }}
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="lp-hide-mobile">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="lp-hide-mobile">Dark</span>
                </>
              )}
            </button>

            <Link
              href="/checkout"
              className="btn-secondary lp-hide-mobile"
              style={{ padding: "0.45rem 0.9rem", fontSize: "0.84rem" }}
            >
              Buyer Checkout
            </Link>

            <Link
              href="/app"
              className="btn-primary"
              style={{ padding: "0.46rem 1rem", fontSize: "0.85rem" }}
            >
              <span>Open App</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section ref={heroRef} className="lp-container">
          <div className="lp-hero">
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.3rem 0.7rem",
                  borderRadius: "var(--primitive-radius-sm)",
                  backgroundColor: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  fontSize: "0.78rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                <CheckCircle2
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>
                  {protocolState?.network?.mode === "NEAR_TESTNET_RPC"
                    ? `Live on NEAR Testnet · ${protocolState.network.escrowContractId}`
                    : protocolState?.network?.mode === "LOCAL_SANDBOX_SIMULATION"
                      ? "Sandbox Simulation Active · NEP-141 USDC & 1Click Intents"
                      : "Live on NEAR Testnet · NEP-141 USDC & 1Click Intents"}
                </span>
              </div>

              <h1 className="lp-hero-title">
                Private stablecoin invoicing and accounting.
              </h1>

              <p className="lp-hero-lead">
                Accept USDC and cross-chain payments without exposing customer or invoice data.
                Settle via smart escrow, share scoped auditor access, and export balanced books.
              </p>

              <div className="lp-cta-row">
                <Link href="/app/merchant" className="btn-primary">
                  <span>Create Invoice</span>
                  <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                </Link>
                <Link href="/checkout" className="btn-secondary">
                  <span>Try Buyer Checkout</span>
                </Link>
                <Link href="/app/auditor" className="btn-quiet">
                  <span>Auditor View</span>
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </Link>
              </div>

              <div className="lp-rails-row">
                <span style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--text-muted)" }}>
                  Settle in USDC directly or pay across chains
                </span>
                <div className="lp-rails-chips">
                  {SUPPORTED_RAILS.map((rail) => (
                    <span key={rail.label} className="lp-rail-chip">
                      <CryptoTokenIcon symbol={rail.symbol} chain={rail.chain} size={16} />
                      <span>{rail.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Layered 3D Dashboard Preview (or Static Mockup Fallback) */}
            <div className="lp-hero-stage-card">
              <div className="lp-hero-stage-topbar">
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <span className={`status-pill ${statusPillClass}`}>
                    <span className="status-pill-dot" aria-hidden="true" />
                    <span>{statusLabel}</span>
                  </span>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    <span>Ledgerly Workspace</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>·</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 500 }}>
                      {orgName}
                    </span>
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  {protocolState?.network?.mode && (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        padding: "0.15rem 0.45rem",
                        borderRadius: "var(--primitive-radius-xs)",
                        backgroundColor:
                          protocolState.network.mode === "NEAR_TESTNET_RPC"
                            ? "var(--status-settled-bg)"
                            : "var(--surface-2)",
                        color:
                          protocolState.network.mode === "NEAR_TESTNET_RPC"
                            ? "var(--status-settled-fg)"
                            : "var(--text-muted)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {protocolState.network.mode === "NEAR_TESTNET_RPC" ? "TESTNET LIVE" : "SANDBOX"}
                    </span>
                  )}

                  <a
                    href={`${explorerBaseUrl}/address/${escrowContractId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tabular-nums"
                    style={{
                      fontFamily: "var(--font-family-mono)",
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      textDecoration: "none",
                    }}
                    title="View Escrow on NEAR Explorer"
                  >
                    <span>{escrowContractId}</span>
                    <ArrowUpRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              </div>

              {/* Dynamic Protocol Metrics Sub-strip */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  padding: "0.45rem 1rem",
                  backgroundColor: "var(--surface-2)",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <span>
                    <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {totalSettledUsdc} USDC
                    </strong>{" "}
                    Settled Treasury
                  </span>
                  <span>·</span>
                  <span>
                    <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {totalInvoicesCount}
                    </strong>{" "}
                    Invoices
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor:
                          protocolState?.audit?.chainValid !== false
                            ? "var(--status-settled-fg)"
                            : "var(--status-amber-fg)",
                      }}
                    />
                    <span>
                      Audit Chain: {protocolState?.audit?.chainValid !== false ? "Valid" : "Pending"} (
                      {protocolState?.audit?.anchoredRootsCount ?? 1} Anchored)
                    </span>
                  </span>
                  <span>·</span>
                  <span style={{ color: "var(--status-settled-fg)", fontWeight: 500 }}>
                    Double-Entry Balanced
                  </span>
                </div>
              </div>

              <div className="lp-hero-stage-viewport">
                {show3DStage ? (
                  <LandingHeroDashboard3D
                    scrollProgress={scrollProgress}
                    copied={copiedHeroHash}
                    onCopyHash={handleCopyHeroHash}
                    state={protocolState}
                  />
                ) : (
                  <LandingHeroDashboardMockup state={protocolState} />
                )}
              </div>
            </div>
          </div>

          {/* 4 Plain-Language Product Pillars */}
          <div id="pillars" className="lp-pillars-grid">
            <article className="lp-pillar-card">
              <h2 className="lp-pillar-title">
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>Private by default</span>
              </h2>
              <p className="lp-pillar-body">
                Customer contacts, line items, and bank details stay encrypted off-chain.
              </p>
            </article>

            <article className="lp-pillar-card">
              <h2 className="lp-pillar-title">
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>Verified on NEAR</span>
              </h2>
              <p className="lp-pillar-body">
                Every invoice anchors a cryptographic commitment hash on-chain for proof of payment.
              </p>
            </article>

            <article className="lp-pillar-card">
              <h2 className="lp-pillar-title">
                <Clock
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-pending-fg)" }}
                  aria-hidden="true"
                />
                <span>Auditor access</span>
              </h2>
              <p className="lp-pillar-body">
                Share time-bound view keys so external auditors can verify records without public leaks.
              </p>
            </article>

            <article className="lp-pillar-card">
              <h2 className="lp-pillar-title">
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>Balanced books</span>
              </h2>
              <p className="lp-pillar-body">
                Every settlement generates balanced double-entry journals ready for CSV export.
              </p>
            </article>
          </div>
        </section>

        {/* Below Hero: 3 Clean Workflow Sections with Real UI Snippets */}
        <section id="workflow" className="lp-container">
          <div className="lp-workflow-stack">
            {/* Section 1: Create invoice */}
            <article className="lp-workflow-section">
              <div>
                <span className="lp-step-pill">1 · Create invoice</span>
                <h2 className="lp-section-title">
                  Create invoices without exposing commercial terms.
                </h2>
                <p className="lp-section-body">
                  Set amount, buyer contact, and tax notes in your workspace. Commercial terms stay
                  off-chain while only a proof commitment registers on NEAR.
                </p>
                <ul className="lp-bullet-list">
                  <li className="lp-bullet-item">
                    <CheckCircle2
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--status-settled-fg)", marginTop: "0.18rem" }}
                      aria-hidden="true"
                    />
                    <span>Instant buyer checkout links and QR codes</span>
                  </li>
                  <li className="lp-bullet-item">
                    <CheckCircle2
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--status-settled-fg)", marginTop: "0.18rem" }}
                      aria-hidden="true"
                    />
                    <span>Supports global remittance payout corridors</span>
                  </li>
                </ul>
                <Link href="/app/merchant" className="btn-secondary">
                  <span>Open Merchant Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </Link>
              </div>

              {/* Real UI Snippet 1: Merchant Invoice Form + Commitment Preview */}
              <div className="lp-ui-snippet" aria-label="Create invoice workspace snippet">
                <div className="lp-ui-snippet-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      New Payment Request
                    </span>
                    <span className="status-pill status-pill-amber">
                      <span className="status-pill-dot" aria-hidden="true" />
                      <span>OPEN</span>
                    </span>
                  </div>
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: "var(--font-family-mono)",
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    INV-2026-8849
                  </span>
                </div>

                <div className="lp-ui-snippet-body">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        padding: "0.75rem 0.9rem",
                        borderRadius: "var(--primitive-radius-sm)",
                        backgroundColor: "var(--surface-1)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        Invoice Amount
                      </div>
                      <div
                        className="tabular-nums"
                        style={{
                          marginTop: "0.25rem",
                          fontFamily: "var(--font-family-mono)",
                          fontSize: "1.15rem",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                        }}
                      >
                        680.00 USDC
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "0.75rem 0.9rem",
                        borderRadius: "var(--primitive-radius-sm)",
                        backgroundColor: "var(--surface-1)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        Off-Chain Buyer Record
                      </div>
                      <div
                        style={{
                          marginTop: "0.28rem",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        ap@nordic-freight.example
                      </div>
                    </div>
                  </div>

                  <div className="lp-ui-row">
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        Line Item &amp; Tax Breakdown (Off-Chain Only)
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                        Q4 API Retainer · 0% Reverse-Charge VAT · Net 7
                      </div>
                    </div>
                    <span className="status-pill status-pill-emerald">
                      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>Private</span>
                    </span>
                  </div>

                  <div className="lp-ui-row">
                    <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      On-chain SHA-256 commitment
                    </span>
                    <HashBadge
                      value={activeCommitmentHash}
                      href={`https://testnet.nearblocks.io/txns/8Zk7wGRQFhWUwR6Lv54adty52yVdfxbT1yZHuzmu4NQK`}
                    />
                  </div>
                </div>
              </div>
            </article>

            {/* Section 2: Settle on NEAR */}
            <article className="lp-workflow-section">
              <div>
                <span className="lp-step-pill">2 · Settle on NEAR</span>
                <h2 className="lp-section-title">
                  Settle in USDC or pay from any major chain.
                </h2>
                <p className="lp-section-body">
                  Buyers pay directly with USDC on NEAR or bridge seamlessly from Solana, Ethereum,
                  and Bitcoin. Escrow handles refunds and timeouts automatically.
                </p>
                <ul className="lp-bullet-list">
                  <li className="lp-bullet-item">
                    <CheckCircle2
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--status-settled-fg)", marginTop: "0.18rem" }}
                      aria-hidden="true"
                    />
                    <span>Automatic excess refund in the same transaction flow</span>
                  </li>
                  <li className="lp-bullet-item">
                    <AlertCircle
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--status-pending-fg)", marginTop: "0.18rem" }}
                      aria-hidden="true"
                    />
                    <span>Direct refund recovery if an invoice expires</span>
                  </li>
                </ul>
                <Link href="/checkout" className="btn-secondary">
                  <span>Inspect Buyer Checkout</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </Link>
              </div>

              {/* Real UI Snippet 2: Escrow Settlement & Exception Breakdown */}
              <div className="lp-ui-snippet" aria-label="Settle on NEAR checkout snippet">
                <div className="lp-ui-snippet-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CryptoTokenIcon symbol="USDC" chain="near" size={18} />
                    <span style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      Escrow Settlement Receipt
                    </span>
                  </div>
                  <span className="status-pill status-pill-emerald">
                    <span className="status-pill-dot" aria-hidden="true" />
                    <span>SETTLED</span>
                  </span>
                </div>

                <div className="lp-ui-snippet-body">
                  <div className="lp-ui-row">
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Buyer Deposit (<code style={{ fontFamily: "var(--font-family-mono)" }}>ft_transfer_call</code>)
                    </span>
                    <span
                      className="tabular-nums"
                      style={{
                        fontFamily: "var(--font-family-mono)",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      700.00 USDC
                    </span>
                  </div>

                  <div className="lp-ui-row">
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Released to Merchant (<code style={{ fontFamily: "var(--font-family-mono)" }}>INV-2026-8849</code>)
                    </span>
                    <span
                      className="tabular-nums"
                      style={{
                        fontFamily: "var(--font-family-mono)",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        color: "var(--status-settled-fg)",
                      }}
                    >
                      680.00 USDC
                    </span>
                  </div>

                  <div className="lp-ui-row">
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Automatic Overpayment Refund
                    </span>
                    <span
                      className="tabular-nums"
                      style={{
                        fontFamily: "var(--font-family-mono)",
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: "var(--status-pending-fg)",
                      }}
                    >
                      20.00 USDC returned
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      paddingTop: "0.25rem",
                    }}
                  >
                    <HashBadge
                      label="Deposit"
                      value={VERIFIED_DEPOSIT_TX}
                      href={`https://testnet.nearblocks.io/txns/${VERIFIED_DEPOSIT_TX}`}
                    />
                    <HashBadge
                      label="Release"
                      value={VERIFIED_RELEASE_TX}
                      href={`https://testnet.nearblocks.io/txns/${VERIFIED_RELEASE_TX}`}
                    />
                  </div>
                </div>
              </div>
            </article>

            {/* Section 3: Audit & export */}
            <article className="lp-workflow-section">
              <div>
                <span className="lp-step-pill">3 · Audit &amp; export</span>
                <h2 className="lp-section-title">
                  Prove balances with scoped view keys and CSV exports.
                </h2>
                <p className="lp-section-body">
                  External auditors decrypt only authorized records, check cryptographic proof on
                  NEAR, and export balanced double-entry books in one click.
                </p>
                <ul className="lp-bullet-list">
                  <li className="lp-bullet-item">
                    <CheckCircle2
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--status-settled-fg)", marginTop: "0.18rem" }}
                      aria-hidden="true"
                    />
                    <span>Audit log roots anchored directly on NEAR Testnet</span>
                  </li>
                  <li className="lp-bullet-item">
                    <CheckCircle2
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--status-settled-fg)", marginTop: "0.18rem" }}
                      aria-hidden="true"
                    />
                    <span>Double-entry balance guarantee: total debits equal total credits</span>
                  </li>
                </ul>
                <Link href="/app/auditor" className="btn-primary">
                  <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Open Auditor &amp; CSV Export</span>
                </Link>
              </div>

              {/* Real UI Snippet 3: Auditor Verification + Balanced Ledger Rows */}
              <div className="lp-ui-snippet" aria-label="Audit and CSV export workspace snippet">
                <div className="lp-ui-snippet-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      Selective Disclosure &amp; Ledger
                    </span>
                    <span className="status-pill status-pill-emerald">
                      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>VERIFIED</span>
                    </span>
                  </div>
                  <HashBadge
                    label="Anchor"
                    value={VERIFIED_ANCHOR_TX}
                    href={`https://testnet.nearblocks.io/txns/${VERIFIED_ANCHOR_TX}`}
                  />
                </div>

                <div className="lp-ui-snippet-body">
                  <div className="lp-ui-row">
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        DR · 1010 Escrow Clearing (USDC)
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        Journal leg #1 · Ref INV-2026-8849
                      </div>
                    </div>
                    <span
                      className="tabular-nums"
                      style={{
                        fontFamily: "var(--font-family-mono)",
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      +680.00 USDC
                    </span>
                  </div>

                  <div className="lp-ui-row">
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        CR · 4000 Merchant Settlement Revenue
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        Journal leg #2 · Ref INV-2026-8849
                      </div>
                    </div>
                    <span
                      className="tabular-nums"
                      style={{
                        fontFamily: "var(--font-family-mono)",
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: "var(--status-settled-fg)",
                      }}
                    >
                      -680.00 USDC
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      paddingTop: "0.2rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      Net variance:{" "}
                      <strong
                        className="tabular-nums"
                        style={{
                          fontFamily: "var(--font-family-mono)",
                          color: "var(--status-settled-fg)",
                        }}
                      >
                        0.00 USDC
                      </strong>
                    </span>
                    <span
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 500,
                        color: "var(--text-muted)",
                      }}
                    >
                      Xero / QuickBooks CSV
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* Live Deployed NEAR Testnet Contracts Strip */}
        <section id="contracts" className="lp-container" style={{ paddingBottom: "4rem" }}>
          <div
            style={{
              backgroundColor: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--section-radius)",
              padding: "1.75rem 2rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "1.12rem",
                    fontWeight: 650,
                    letterSpacing: "-0.02em",
                    color: "var(--text-primary)",
                  }}
                >
                  Deployed NEAR Testnet Accounts
                </h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                  View live contract state, token transfers, and audit roots on NEAR Testnet.
                </p>
              </div>
              <Link href="/app" className="btn-primary">
                <span>Launch Workspace</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "0.85rem",
              }}
            >
              <div className="lp-ui-row">
                <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                  Escrow Contract
                </span>
                <HashBadge
                  value={ESCROW_CONTRACT_ID}
                  href={`https://testnet.nearblocks.io/address/${ESCROW_CONTRACT_ID}`}
                />
              </div>

              <div className="lp-ui-row">
                <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                  Mock USDC (NEP-141)
                </span>
                <HashBadge
                  value={USDC_CONTRACT_ID}
                  href={`https://testnet.nearblocks.io/address/${USDC_CONTRACT_ID}`}
                />
              </div>

              <div className="lp-ui-row">
                <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                  Operator / Relayer
                </span>
                <HashBadge
                  value={OPERATOR_ACCOUNT_ID}
                  href={`https://testnet.nearblocks.io/address/${OPERATOR_ACCOUNT_ID}`}
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <LedgerlyBrandMark />
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>
              Ledgerly
            </span>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              · Private stablecoin payments &amp; balanced accounting on NEAR
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
            <Link href="/app" className="lp-nav-link">
              Overview
            </Link>
            <Link href="/app/merchant" className="lp-nav-link">
              Merchant
            </Link>
            <Link href="/app/remittance" className="lp-nav-link">
              Remittance
            </Link>
            <Link href="/app/auditor" className="lp-nav-link">
              Auditor
            </Link>
            <Link href="/checkout" className="lp-nav-link">
              Checkout
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
