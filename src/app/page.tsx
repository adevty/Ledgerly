"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useReducedMotion, useScroll } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Menu,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  Zap,
} from "lucide-react";
import { CryptoTokenIcon } from "./components/CryptoTokenIcon";
import { HashBadge } from "./components/HashBadge";
import { LandingHeroDashboardMockup } from "./components/LandingHeroDashboardMockup";
import { LedgerlyBrandMark } from "./components/LedgerlyBrandMark";
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

function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
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
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  // Track scroll for sticky glass elevation & active section spy
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 16);

      const sectionIds = ["pillars", "workflow", "contracts"];
      let found = "";
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180 && rect.bottom >= 180) {
            found = id;
            break;
          }
        }
      }
      setActiveSection(found);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 820) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  // Animate-On-Scroll (AOS) Observer
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll("[data-aos]").forEach((el) => {
        el.classList.add("aos-animate");
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("aos-animate");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: "0px 0px -50px 0px",
        threshold: 0.08,
      }
    );

    const elements = document.querySelectorAll("[data-aos]");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
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

  const statusLabel = hasPendingInvoices ? "OPEN" : "SETTLED";
  const statusPillClass = hasPendingInvoices ? "status-pill-amber" : "status-pill-emerald";

  const settledMerchantUsdc = protocolState?.paymentRequests
    ? protocolState.paymentRequests
        .filter((p) => p.status === "SETTLED" || p.status === "PAID")
        .reduce((sum, p) => sum + Number(p.amountDecimal), 0)
    : 2040;

  const settledRemittanceUsdc = protocolState?.remittances
    ? protocolState.remittances
        .filter((r) => r.status === "SETTLED")
        .reduce((sum, r) => sum + Number(r.sourceDecimal), 0)
    : 2350;

  const totalSettledNum = settledMerchantUsdc + settledRemittanceUsdc;
  const totalSettledUsdc = totalSettledNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const show3DStage = webglReady === true && !prefersReducedMotion && !isMobile;

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-canvas)",
        color: "var(--text-primary)",
      }}
    >
      {/* Modern Ultra-Responsive Top Navigation Header */}
      <header className={`lp-header ${scrolled ? "lp-header-scrolled" : ""}`}>
        <div className="lp-header-inner">
          <div className="lp-brand-group">
            <Link href="/" className="lp-brand" aria-label="Ledgerly Home">
              <LedgerlyBrandMark size={28} />
              <span>Ledgerly</span>
            </Link>

            {/* Live NEAR Testnet Protocol Indicator */}
            <div
              className="lp-network-pill lp-hide-mobile"
              title={`Connected to NEAR Testnet · Escrow: ${escrowContractId}`}
            >
              <span className="lp-pulse-dot" aria-hidden="true">
                <span className="lp-pulse-dot-ping" />
                <span className="lp-pulse-dot-core" />
              </span>
              <span>NEAR Testnet</span>
            </div>
          </div>

          {/* Desktop Floating Pill Navigation */}
          <nav className="lp-nav" aria-label="Primary navigation">
            <a
              href="#pillars"
              className={`lp-nav-link ${activeSection === "pillars" ? "lp-nav-link-active" : ""}`}
            >
              Capabilities
            </a>
            <a
              href="#workflow"
              className={`lp-nav-link ${activeSection === "workflow" ? "lp-nav-link-active" : ""}`}
            >
              Workflow
            </a>
            <a
              href="#contracts"
              className={`lp-nav-link ${activeSection === "contracts" ? "lp-nav-link-active" : ""}`}
            >
              NEAR Testnet
            </a>
            <Link
              href="/docs"
              className="lp-nav-link"
            >
              Docs
            </Link>
          </nav>

          {/* Header Action Controls */}
          <div className="lp-header-actions">
            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="lp-theme-toggle"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
              )}
            </button>

            {/* Buyer Checkout Quick Link */}
            <Link
              href="/checkout"
              className="lp-btn-secondary lp-hide-tablet"
            >
              Buyer Checkout
            </Link>

            {/* Open App / Launch Console CTA */}
            <Link
              href="/app"
              className="lp-btn-primary"
            >
              <span>Open App</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </Link>

            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lp-mobile-toggle"
              aria-expanded={mobileMenuOpen}
              aria-controls="lp-mobile-dropdown"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Menu className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation Sheet */}
        {mobileMenuOpen && (
          <div
            id="lp-mobile-dropdown"
            className="lp-mobile-menu"
            role="region"
            aria-label="Mobile Navigation"
          >
            <div className="lp-mobile-menu-inner">
              <div className="lp-mobile-nav-list">
                <a
                  href="#pillars"
                  onClick={() => setMobileMenuOpen(false)}
                  className="lp-mobile-nav-item"
                >
                  <div className="lp-mobile-nav-icon">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="lp-mobile-nav-label">Capabilities</div>
                    <div className="lp-mobile-nav-desc">
                      Multi-token escrow, automated split &amp; fail-safe refund
                    </div>
                  </div>
                </a>

                <a
                  href="#workflow"
                  onClick={() => setMobileMenuOpen(false)}
                  className="lp-mobile-nav-item"
                >
                  <div className="lp-mobile-nav-icon">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="lp-mobile-nav-label">Workflow</div>
                    <div className="lp-mobile-nav-desc">
                      3-step lifecycle: invoice, NEAR settlement, audit log
                    </div>
                  </div>
                </a>

                <a
                  href="#contracts"
                  onClick={() => setMobileMenuOpen(false)}
                  className="lp-mobile-nav-item"
                >
                  <div className="lp-mobile-nav-icon">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="lp-mobile-nav-label">NEAR Testnet</div>
                    <div className="lp-mobile-nav-desc">
                      On-chain escrow &amp; relayer smart contracts
                    </div>
                  </div>
                </a>

                <Link
                  href="/docs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="lp-mobile-nav-item"
                >
                  <div className="lp-mobile-nav-icon">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="lp-mobile-nav-label">Protocol Docs</div>
                    <div className="lp-mobile-nav-desc">
                      Architecture, smart contract specs &amp; developer API
                    </div>
                  </div>
                </Link>
              </div>

              {/* Mobile Actions */}
              <div className="lp-mobile-actions-row">
                <Link
                  href="/checkout"
                  onClick={() => setMobileMenuOpen(false)}
                  className="lp-btn-secondary"
                  style={{ justifyContent: "center" }}
                >
                  Buyer Checkout
                </Link>
                <Link
                  href="/app"
                  onClick={() => setMobileMenuOpen(false)}
                  className="lp-btn-primary"
                  style={{ justifyContent: "center" }}
                >
                  <span>Open App</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* Hero Section */}
        <section ref={heroRef} className="lp-container">
          <div className="lp-hero">
            <div className="lp-hero-copy" data-aos="fade-up">
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
                <span>Live on NEAR Testnet · USDC Escrow &amp; 1Click Intents</span>
              </div>

              <h1 className="lp-hero-title">
                Private Financial Infrastructure for Onchain Businesses
              </h1>

              <p className="lp-hero-lead">
                Execute stablecoin payments, smart escrow, and verifiable audit ledgers — without exposing sensitive commercial data onchain.
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
                <div className="lp-rails-marquee-container" aria-label="Supported Settlement Chains">
                  <div className="lp-rails-marquee-track">
                    <div className="lp-rails-marquee-group">
                      {SUPPORTED_RAILS.map((rail) => (
                        <span key={rail.label} className="lp-rail-chip">
                          <CryptoTokenIcon symbol={rail.symbol} chain={rail.chain} size={16} />
                          <span>{rail.label}</span>
                        </span>
                      ))}
                    </div>
                    <div className="lp-rails-marquee-group" aria-hidden="true">
                      {SUPPORTED_RAILS.map((rail) => (
                        <span key={`${rail.label}-duplicate`} className="lp-rail-chip">
                          <CryptoTokenIcon symbol={rail.symbol} chain={rail.chain} size={16} />
                          <span>{rail.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop 3D Dashboard Preview (Hidden on Mobile <= 767px) */}
            <div className="lp-hero-stage-card lp-hero-stage-desktop" data-aos="fade-left" data-aos-delay="100">
              <div className="lp-hero-stage-topbar">
                <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0, overflow: "hidden" }}>
                  <span className={`status-pill ${statusPillClass}`}>
                    <span className="status-pill-dot" aria-hidden="true" />
                    <span>{statusLabel}</span>
                  </span>
                  <Link
                    href="/app"
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                    title="Open Ledgerly Workspace Overview"
                  >
                    <span>Ledgerly Workspace</span>
                    <span className="lp-hero-topbar-amount" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>·</span>
                      <span className="tabular-nums" style={{ color: "var(--status-settled-fg)", fontWeight: 650 }}>
                        {totalSettledUsdc} USDC
                      </span>
                    </span>
                  </Link>
                </div>

                <a
                  href={`${explorerBaseUrl}/address/${escrowContractId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular-nums lp-hero-contract-link"
                  style={{
                    fontFamily: "var(--font-family-mono)",
                    fontSize: "0.74rem",
                    color: "var(--text-muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    textDecoration: "none",
                    flexShrink: 0,
                  }}
                  title="View Escrow Contract on Nearblocks"
                >
                  <span className="lp-hero-contract-full">{escrowContractId}</span>
                  <span className="lp-hero-contract-short">
                    {escrowContractId.length > 18
                      ? `${escrowContractId.slice(0, 8)}...${escrowContractId.slice(-7)}`
                      : escrowContractId}
                  </span>
                  <ArrowUpRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                </a>
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

            {/* Mobile-Native Live Preview Card (Visible ONLY on Mobile <= 767px) */}
            <div className="lp-hero-stage-mobile" aria-label="Mobile Dashboard Preview">
              <div className="lp-mobile-preview-card">
                <div className="lp-mobile-preview-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0 }}>
                    <span className={`status-pill ${statusPillClass}`}>
                      <span className="status-pill-dot" aria-hidden="true" />
                      <span>{statusLabel}</span>
                    </span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 650, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                      Ledgerly Workspace
                    </span>
                  </div>
                  <a
                    href={`${explorerBaseUrl}/address/${escrowContractId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="lp-mobile-preview-contract"
                    title={`View ${escrowContractId} on NEAR Explorer`}
                  >
                    <span>NEAR Testnet</span>
                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>

                <div className="lp-mobile-preview-body">
                  <div className="lp-mobile-preview-balance-group">
                    <span className="mono-label" style={{ fontSize: "0.72rem" }}>
                      Settled Balance (Reconciled)
                    </span>
                    <div className="lp-mobile-preview-amount tabular-nums">
                      <span>{totalSettledUsdc}</span>
                      <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-muted)" }}>USDC</span>
                    </div>
                    <div className="lp-mobile-preview-reconciled">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Zero Variance · Balanced Double-Entry Books</span>
                    </div>
                  </div>

                  <div className="lp-mobile-preview-grid">
                    <div className="lp-mobile-preview-metric">
                      <span className="mono-label">Active Escrow</span>
                      <span className="mono-data tabular-nums" style={{ fontWeight: 650, color: "var(--text-primary)" }}>
                        {protocolState?.paymentRequests?.length ?? 4} Invoices
                      </span>
                    </div>
                    <div className="lp-mobile-preview-metric">
                      <span className="mono-label">Discrepancy</span>
                      <span className="mono-data tabular-nums" style={{ fontWeight: 650, color: "var(--status-settled-fg)" }}>
                        0.00 USDC
                      </span>
                    </div>
                    <div className="lp-mobile-preview-metric">
                      <span className="mono-label">Audit Proof</span>
                      <span className="mono-data" style={{ fontWeight: 650, color: "var(--text-primary)" }}>
                        SHA-256 On-Chain
                      </span>
                    </div>
                    <div className="lp-mobile-preview-metric">
                      <span className="mono-label">Settlement</span>
                      <span className="mono-data" style={{ fontWeight: 650, color: "var(--accent-primary)" }}>
                        1Click Intents
                      </span>
                    </div>
                  </div>

                  <div className="lp-mobile-preview-tx-row">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <span>INV-2026-8841</span>
                        <span className="status-pill status-pill-emerald" style={{ fontSize: "0.62rem", padding: "0.06rem 0.35rem" }}>PAID</span>
                      </div>
                      <div className="mono-data tabular-nums" style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                        Proof: {activeCommitmentHash ? `${activeCommitmentHash.slice(0, 8)}...${activeCommitmentHash.slice(-6)}` : "e738c4...ab47"}
                      </div>
                    </div>
                    <span className="mono-data tabular-nums" style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 }}>
                      1,450.00 USDC
                    </span>
                  </div>

                  <Link
                    href="/app"
                    className="lp-mobile-preview-cta"
                  >
                    <span>Launch Live Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Core Proposition Grid */}
          <div
            id="pillars"
            className="lp-pillars-grid"
          >
            <article className="lp-pillar-card" data-aos="fade-up" data-aos-delay="50">
              <h2 className="lp-pillar-title">
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>Private financial records</span>
              </h2>
              <p className="lp-pillar-body">
                Customer contacts, pricing terms, and line items stay encrypted off-chain via AES-256-GCM.
              </p>
            </article>

            <article className="lp-pillar-card" data-aos="fade-up" data-aos-delay="100">
              <h2 className="lp-pillar-title">
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>Programmable escrow</span>
              </h2>
              <p className="lp-pillar-body">
                Autonomous smart escrow on NEAR with automated overpayment split &amp; timeout refund exit.
              </p>
            </article>

            <article className="lp-pillar-card" data-aos="fade-up" data-aos-delay="150">
              <h2 className="lp-pillar-title">
                <Clock
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-pending-fg)" }}
                  aria-hidden="true"
                />
                <span>Selective disclosure</span>
              </h2>
              <p className="lp-pillar-body">
                Share scoped view keys so certified auditors can verify records without public data leaks.
              </p>
            </article>

            <article className="lp-pillar-card" data-aos="fade-up" data-aos-delay="200">
              <h2 className="lp-pillar-title">
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>Verifiable accounting</span>
              </h2>
              <p className="lp-pillar-body">
                Balanced double-entry records with zero variance anchored directly on NEAR.
              </p>
            </article>

            <article className="lp-pillar-card" data-aos="fade-up" data-aos-delay="250">
              <h2 className="lp-pillar-title">
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>Cross-chain rails</span>
              </h2>
              <p className="lp-pillar-body">
                Multi-chain settlement via NEAR Intents across Solana, Ethereum, Base, and Arbitrum.
              </p>
            </article>
          </div>
        </section>

        {/* Below Hero: 3 Clean Workflow Sections with Real UI Snippets */}
        <section id="workflow" className="lp-container lp-workflow-section-container">
          <div className="lp-workflow-stack">
            {/* Section 1: Create invoice */}
            <article className="lp-workflow-section" data-aos="fade-up">
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
            <article className="lp-workflow-section" data-aos="fade-up">
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
            <article className="lp-workflow-section" data-aos="fade-up">
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
        <section id="contracts" className="lp-container lp-contracts-section" data-aos="fade-up">
          <div className="lp-contracts-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1.25rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 650,
                    letterSpacing: "-0.02em",
                    color: "var(--text-primary)",
                  }}
                >
                  Deployed NEAR Testnet Accounts
                </h2>
                <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
                  View live contract state, token transfers, and audit roots on NEAR Testnet.
                </p>
              </div>
              <Link href="/app" className="lp-btn-primary">
                <span>Launch Workspace</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </Link>
            </div>

            <div className="lp-contracts-grid">
              <div className="lp-contract-item-card">
                <span style={{ fontSize: "0.84rem", fontWeight: 550, color: "var(--text-secondary)" }}>
                  Escrow Contract
                </span>
                <HashBadge
                  value={ESCROW_CONTRACT_ID}
                  href={`https://testnet.nearblocks.io/address/${ESCROW_CONTRACT_ID}`}
                />
              </div>

              <div className="lp-contract-item-card">
                <span style={{ fontSize: "0.84rem", fontWeight: 550, color: "var(--text-secondary)" }}>
                  Mock USDC (NEP-141)
                </span>
                <HashBadge
                  value={USDC_CONTRACT_ID}
                  href={`https://testnet.nearblocks.io/address/${USDC_CONTRACT_ID}`}
                />
              </div>

              <div className="lp-contract-item-card">
                <span style={{ fontSize: "0.84rem", fontWeight: 550, color: "var(--text-secondary)" }}>
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
      <footer className="lp-footer" data-aos="fade-in">
        <div className="lp-footer-inner">
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <LedgerlyBrandMark />
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>
              Ledgerly
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
            <Link href="/docs" className="lp-nav-link">
              Docs
            </Link>
            <a
              href="https://github.com/adevty/Ledgerly"
              target="_blank"
              rel="noopener noreferrer"
              className="lp-nav-link"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
              aria-label="GitHub Repository"
            >
              <GitHubIcon className="w-4 h-4 shrink-0" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
