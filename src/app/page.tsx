"use client";

import React from "react";
import Link from "next/link";
import { PaymentWaveRails } from "./components/PaymentWaveRails";

export default function LedgerlyLandingPage() {
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      {/* Soft warm paper grain overlay */}
      <div className="paper-grain" />

      {/* Horizontal Wave-Like Particle Rails (left -> right, cursor-reactive, scroll-adaptive) */}
      <PaymentWaveRails />

      {/* Minimal Header */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          background: "rgba(247, 244, 238, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "1rem 1.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <a
            href="#hero"
            style={{
              fontSize: "1.05rem",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--ink-charcoal)",
              textDecoration: "none",
            }}
          >
            Ledgerly
          </a>

          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2rem",
              fontSize: "0.86rem",
              color: "var(--ink-body)",
            }}
          >
            <a href="#problem" style={{ color: "inherit", textDecoration: "none" }}>
              Problem
            </a>
            <a href="#solution" style={{ color: "inherit", textDecoration: "none" }}>
              Solution
            </a>
            <a href="#capabilities" style={{ color: "inherit", textDecoration: "none" }}>
              Capabilities
            </a>
          </nav>

          <Link
            href="/app"
            className="btn-primary"
            style={{ padding: "0.52rem 1.05rem", fontSize: "0.84rem" }}
          >
            Launch App
          </Link>
        </div>
      </header>

      <main style={{ position: "relative", zIndex: 10 }}>
        {/* ===================================================================
            1. HERO SECTION — Calm, steady horizontal particle waves
           =================================================================== */}
        <section
          id="hero"
          style={{
            minHeight: "100vh",
            maxWidth: 1180,
            margin: "0 auto",
            padding: "8.5rem 1.75rem 4rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ maxWidth: 720 }}>
            <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
              Payment Infrastructure on NEAR
            </div>

            <h1
              style={{
                fontSize: "clamp(2.5rem, 5vw, 4.35rem)",
                fontWeight: 500,
                lineHeight: 1.06,
                letterSpacing: "-0.035em",
                color: "var(--ink-charcoal)",
                marginBottom: "1.25rem",
              }}
            >
              Bring the boring business money onchain.
            </h1>

            <p
              style={{
                fontSize: "clamp(1.02rem, 1.3vw, 1.18rem)",
                lineHeight: 1.62,
                color: "var(--ink-body)",
                maxWidth: 580,
                marginBottom: "2rem",
              }}
            >
              Instant merchant checkout, cross-border stablecoin remittances, and
              private-by-default auditability—built for real finance teams.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
              <Link href="/app" className="btn-primary">
                Launch App
              </Link>
              <a href="#capabilities" className="btn-secondary">
                View Documentation
              </a>
            </div>
          </div>

          {/* Open visual band where the horizontal wave particle rails flow */}
          <div style={{ flex: 1, minHeight: "26vh" }} />

          {/* Subtle key metrics bar */}
          <div
            className="hairline-top"
            style={{
              paddingTop: "1.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "1.5rem",
            }}
          >
            <div>
              <div className="mono-label">Settlement Finality</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 500, marginTop: "0.25rem" }}>
                Under 2 seconds
              </div>
            </div>
            <div>
              <div className="mono-label">Cross-Border Cost</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 500, marginTop: "0.25rem" }}>
                &lt; 0.5% transparent fee
              </div>
            </div>
            <div>
              <div className="mono-label">Data Confidentiality</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 500, marginTop: "0.25rem" }}>
                Encrypted envelopes
              </div>
            </div>
            <div>
              <div className="mono-label">Audit Readiness</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 500, marginTop: "0.25rem" }}>
                Scoped view keys
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            2. THE PROBLEM — Particle waves become turbulent & irregular
           =================================================================== */}
        <section
          id="problem"
          style={{
            minHeight: "92vh",
            maxWidth: 1180,
            margin: "0 auto",
            padding: "6rem 1.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ maxWidth: 640, marginBottom: "2.75rem" }}>
            <div className="eyebrow" style={{ color: "var(--slate-blue)", marginBottom: "0.75rem" }}>
              The Problem
            </div>
            <h2
              style={{
                fontSize: "clamp(1.85rem, 3.3vw, 2.85rem)",
                fontWeight: 500,
                lineHeight: 1.12,
                letterSpacing: "-0.03em",
                marginBottom: "1rem",
              }}
            >
              Legacy rails are slow and expensive. Raw blockchains expose your business.
            </h2>
            <p style={{ fontSize: "1.02rem", lineHeight: 1.65, color: "var(--ink-body)" }}>
              Cross-border wires trap working capital for days and charge opaque FX spreads. Yet
              standard stablecoin transfers broadcast supplier pricing, payroll, and revenue to
              the public—without handling refunds, underpayments, or accounting reconciliation.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
            }}
          >
            <div className="fin-card">
              <div className="mono-label" style={{ marginBottom: "0.5rem" }}>
                01 · Settlement Friction
              </div>
              <h3 style={{ fontSize: "1.12rem", fontWeight: 500, marginBottom: "0.5rem" }}>
                Days in transit, 3–6% lost in fees
              </h3>
              <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "var(--ink-muted)" }}>
                Correspondent banks deduct unpredictable intermediary fees while suppliers and
                overseas contractors wait days for local currency clearing.
              </p>
            </div>

            <div className="fin-card">
              <div className="mono-label" style={{ marginBottom: "0.5rem" }}>
                02 · Public Ledger Exposure
              </div>
              <h3 style={{ fontSize: "1.12rem", fontWeight: 500, marginBottom: "0.5rem" }}>
                Zero commercial privacy
              </h3>
              <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "var(--ink-muted)" }}>
                On standard public chains, a single payment reveals your treasury wallet, vendor
                margins, and transaction history to competitors.
              </p>
            </div>

            <div className="fin-card">
              <div className="mono-label" style={{ marginBottom: "0.5rem" }}>
                03 · Missing Financial Controls
              </div>
              <h3 style={{ fontSize: "1.12rem", fontWeight: 500, marginBottom: "0.5rem" }}>
                No exception handling or context
              </h3>
              <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "var(--ink-muted)" }}>
                Direct token transfers carry no invoice reference, cannot auto-refund overpayments,
                and leave finance teams reconciling hashes by hand.
              </p>
            </div>
          </div>
        </section>

        {/* ===================================================================
            3. THE SOLUTION — Waves align into clean, structured parallel rails
           =================================================================== */}
        <section
          id="solution"
          style={{
            minHeight: "88vh",
            maxWidth: 1180,
            margin: "0 auto",
            padding: "6rem 1.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div className="fin-card" style={{ maxWidth: 880, padding: "2.5rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>
              The Solution
            </div>
            <h2
              style={{
                fontSize: "clamp(1.85rem, 3.2vw, 2.75rem)",
                fontWeight: 500,
                lineHeight: 1.14,
                letterSpacing: "-0.03em",
                marginBottom: "1rem",
              }}
            >
              Structured stablecoin rails with built-in escrow, privacy, and accounting.
            </h2>
            <p
              style={{
                fontSize: "1.02rem",
                lineHeight: 1.65,
                color: "var(--ink-body)",
                marginBottom: "1.75rem",
                maxWidth: 720,
              }}
            >
              Ledgerly combines pooled NEAR escrow contracts with off-chain envelope encryption.
              Every payment carries rich accounting context for your ERP, settles in seconds, and
              anchors a cryptographic commitment onchain—verifiable by your auditor, invisible to
              everyone else.
            </p>

            <div
              className="hairline-top"
              style={{
                paddingTop: "1.5rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                  Pooled Escrow Protection
                </div>
                <p style={{ fontSize: "0.86rem", color: "var(--ink-muted)", lineHeight: 1.55 }}>
                  Holds funds safely until conditions match, with fail-safe user exits if offline.
                </p>
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                  Envelope Encryption
                </div>
                <p style={{ fontSize: "0.86rem", color: "var(--ink-muted)", lineHeight: 1.55 }}>
                  AES-256-GCM per-record keys wrapped with X25519 keep invoices and PII private.
                </p>
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                  Double-Entry Ledger
                </div>
                <p style={{ fontSize: "0.86rem", color: "var(--ink-muted)", lineHeight: 1.55 }}>
                  Every settlement and refund posts balanced journal legs ready for CSV export.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            4. KEY CAPABILITIES — Clean minimal cards
           =================================================================== */}
        <section
          id="capabilities"
          style={{
            minHeight: "88vh",
            maxWidth: 1180,
            margin: "0 auto",
            padding: "5rem 1.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ maxWidth: 620, marginBottom: "2.5rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.65rem" }}>
              Key Capabilities
            </div>
            <h2
              style={{
                fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
                fontWeight: 500,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
              }}
            >
              Everything a finance team needs to run onchain operations tomorrow.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {/* Card 1: Merchant Checkout */}
            <div className="fin-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <span className="status-pill status-pill-emerald">Merchant Checkout</span>
                  <span className="mono-label">USDC · NEP-141</span>
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: "0.6rem" }}>
                  Automated invoice matching &amp; exception handling
                </h3>
                <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "var(--ink-muted)", marginBottom: "1.25rem" }}>
                  Generate clean checkout links tied to opaque escrow IDs. Exact payments release
                  instantly to your treasury, overpayments automatically refund the excess, and
                  partial deposits hold until completion or expiry.
                </p>
              </div>
              <div className="hairline-top" style={{ paddingTop: "0.9rem", display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--ink-muted)" }}>
                <span>Auto-reconciled to order ID</span>
                <Link href="/app" style={{ color: "var(--sage-green)", textDecoration: "none", fontWeight: 500 }}>
                  Try Checkout →
                </Link>
              </div>
            </div>

            {/* Card 2: Cross-Border Remittance */}
            <div className="fin-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <span className="status-pill status-pill-blue">Remittances</span>
                  <span className="mono-label">PHP · IDR · EUR · USDC</span>
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: "0.6rem" }}>
                  Stablecoin speed to local bank and e-wallet rails
                </h3>
                <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "var(--ink-muted)", marginBottom: "1.25rem" }}>
                  Lock guaranteed FX quotes with transparent fees, enforce sanctions and Travel
                  Rule checks, and pay out to local corridors. Automatic retries and escrow
                  refunds ensure funds are never stranded.
                </p>
              </div>
              <div className="hairline-top" style={{ paddingTop: "0.9rem", display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--ink-muted)" }}>
                <span>Idempotent partner payouts</span>
                <Link href="/app" style={{ color: "var(--slate-blue)", textDecoration: "none", fontWeight: 500 }}>
                  Send Remittance →
                </Link>
              </div>
            </div>

            {/* Card 3: Auditability */}
            <div className="fin-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <span className="status-pill status-pill-emerald">Auditability</span>
                  <span className="mono-label">X25519 + SHA-256</span>
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: "0.6rem" }}>
                  Selective disclosure with onchain proof
                </h3>
                <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "var(--ink-muted)", marginBottom: "1.25rem" }}>
                  Issue time-bound, revocable view keys scoped to a specific reporting period.
                  Auditors decrypt authorized records and verify every payload against the
                  commitment anchored in the NEAR escrow contract.
                </p>
              </div>
              <div className="hairline-top" style={{ paddingTop: "0.9rem", display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--ink-muted)" }}>
                <span>One-click ERP CSV export</span>
                <Link href="/app" style={{ color: "var(--sage-green)", textDecoration: "none", fontWeight: 500 }}>
                  Inspect Audit View →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            5. FINAL CTA SECTION — Particle waves converge toward "Launch App"
           =================================================================== */}
        <section
          id="cta"
          style={{
            minHeight: "78vh",
            maxWidth: 1180,
            margin: "0 auto",
            padding: "6rem 1.75rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div
            className="fin-card"
            style={{
              maxWidth: 680,
              width: "100%",
              padding: "3rem 2.25rem",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>
              Ready for Modern Finance Teams
            </div>
            <h2
              style={{
                fontSize: "clamp(1.85rem, 3.2vw, 2.65rem)",
                fontWeight: 500,
                letterSpacing: "-0.03em",
                lineHeight: 1.14,
                marginBottom: "0.9rem",
              }}
            >
              Run your first confidential settlement in seconds.
            </h2>
            <p
              style={{
                fontSize: "0.98rem",
                lineHeight: 1.6,
                color: "var(--ink-body)",
                maxWidth: 500,
                margin: "0 auto 1.85rem",
              }}
            >
              Explore the live interactive sandbox on NEAR Testnet—create invoices, simulate
              buyer checkouts, dispatch remittances, and verify auditor proofs.
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "0.85rem", flexWrap: "wrap" }}>
              <Link id="final-launch-btn" href="/app" className="btn-primary">
                Launch App
              </Link>
              <a href="#hero" className="btn-secondary">
                Back to Top
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ===================================================================
          MINIMAL LIGHT FOOTER — Small text only, simple links & copyright
         =================================================================== */}
      <footer
        style={{
          position: "relative",
          zIndex: 10,
          borderTop: "1px solid var(--line-soft)",
          background: "rgba(247, 244, 238, 0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "1.6rem 1.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            fontSize: "0.8rem",
            color: "var(--ink-muted)",
          }}
        >
          <div>© 2026 Ledgerly. Built on NEAR Protocol.</div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <Link href="/app" style={{ color: "var(--ink-body)", textDecoration: "none" }}>
              Launch App
            </Link>
            <a href="#problem" style={{ color: "var(--ink-body)", textDecoration: "none" }}>
              Problem
            </a>
            <a href="#solution" style={{ color: "var(--ink-body)", textDecoration: "none" }}>
              Solution
            </a>
            <a href="#capabilities" style={{ color: "var(--ink-body)", textDecoration: "none" }}>
              Capabilities
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
