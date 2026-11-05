"use client";

import React, { useCallback, useEffect, useState } from "react";
import { LedgerParticleCore } from "./components/LedgerParticleCore";

interface PaymentRequestItem {
  id: string;
  escrowId: string;
  status: string;
  amountDecimal: string;
  receivedDecimal: string;
  remainingDecimal: string;
  excessDecimal: string;
  heldDecimal: string;
  commitment: string;
  cipherPreview: string;
  paymentsCount: number;
  createdAtIso: string;
}

interface RemittanceItem {
  id: string;
  escrowId: string;
  status: string;
  sourceDecimal: string;
  feeDecimal: string;
  targetDecimal: string;
  targetCurrency: string;
  recipientType: string;
  country: string;
  attempts: number;
  payoutRef: string | null;
  lastFailureCode: string | null;
  commitment: string;
  createdAtIso: string;
}

interface AuditedRecord {
  recordId: string;
  kind: "PAYMENT" | "REMITTANCE";
  escrowId: string;
  createdAtIso: string;
  decryptedPayload: Record<string, unknown>;
  commitment: string;
  onchainCommitment: string | null;
  verifiedOnchain: boolean;
}

interface DashboardState {
  organization: {
    id: string;
    name: string;
    nearAccount: string;
    publicKeyShort: string;
  };
  paymentRequests: PaymentRequestItem[];
  remittances: RemittanceItem[];
  audit: {
    grantId: string;
    auditorKeyShort: string;
    chainValid: boolean;
    anchoredRootsCount: number;
    latestAnchoredRoot: string | null;
    records: AuditedRecord[];
    auditLog: Array<{
      id: string;
      actor: string;
      action: string;
      targetId: string;
      atIso: string;
      hash: string;
    }>;
  };
  reconciliation: {
    checkedCount: number;
    discrepancies: Array<{
      kind: string;
      recordId: string;
      escrowId: string;
      status: string;
      expectedHeldMinor: string;
      onchainHeldMinor: string;
      reason: string;
    }>;
  };
  ledger: {
    entriesCount: number;
    csv: string;
  };
}

export default function LedgerlyHomePage() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Merchant Payment Request form state
  const [orderRef, setOrderRef] = useState("INV-2026-8849");
  const [orderAmount, setOrderAmount] = useState("680.00");
  const [customerEmail, setCustomerEmail] = useState("treasury@studio-forma.ch");

  // Remittance form state
  const [remitAmount, setRemitAmount] = useState("250.00");
  const [remitCurrency, setRemitCurrency] = useState<"PHP" | "IDR" | "EUR" | "USDC">("PHP");
  const [remitRecipient, setRemitRecipient] = useState("Manila Loom Works");
  const [remitDest, setRemitDest] = useState("GCASH:+63-917-402-8819");
  const [remitMode, setRemitMode] = useState<"SUCCESS" | "TRANSIENT_FAILURE">("SUCCESS");

  const fetchState = useCallback(async () => {
    const res = await fetch("/api/v1/state", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as DashboardState;
      setState(data);
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const runAction = async (payload: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok: boolean;
        state?: DashboardState;
        error?: { code: string; message: string };
      };
      if (!res.ok || !data.ok) {
        setNotice(`ERR [${data.error?.code ?? "REJECTED"}]: ${data.error?.message ?? "Failed"}`);
      } else {
        if (data.state) setState(data.state);
        setNotice(successMsg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!state?.ledger.csv) return;
    const blob = new Blob([state.ledger.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledgerly-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusTone = (status: string) => {
    if (status === "SETTLED" || status === "PAID") return "status-pill status-pill-emerald";
    if (status === "OVERPAID" || status === "PARTIALLY_PAID" || status === "PAYOUT_FAILED") {
      return "status-pill status-pill-amber";
    }
    return "status-pill status-pill-blue";
  };

  return (
    <div style={{ position: "relative", minHeight: "400vh" }}>
      {/* Tactile paper grain & architectural vertical guides */}
      <div className="paper-grain" />
      <div className="grid-guides">
        <div />
        <div />
        <div />
        <div />
      </div>

      {/* 3D Interactive Black Particle Core (responds to scroll across 4 sections + cursor) */}
      <LedgerParticleCore />

      {/* Top Fixed Minimal Instrument Header */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          background: "rgba(244, 241, 234, 0.82)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--line-hairline)",
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            padding: "0.85rem 2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <a
              href="#hero"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                fontWeight: 600,
                letterSpacing: "0.22em",
                color: "var(--ink-black)",
                textDecoration: "none",
              }}
            >
              LEDGERLY // NEAR
            </a>
            <span className="status-pill status-pill-emerald">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent-emerald)",
                }}
              />
              ESCROW ACTIVE · TESTNET
            </span>
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: "1.75rem", flexWrap: "wrap" }}>
            <a href="#hero" className="mono-label" style={{ textDecoration: "none" }}>
              01 / RAIL CORE
            </a>
            <a href="#merchant" className="mono-label" style={{ textDecoration: "none" }}>
              02 / MERCHANT CHECKOUT
            </a>
            <a href="#remittance" className="mono-label" style={{ textDecoration: "none" }}>
              03 / REMITTANCE
            </a>
            <a href="#auditor" className="mono-label" style={{ textDecoration: "none" }}>
              04 / AUDIT &amp; SETTLEMENT
            </a>
          </nav>

          <div className="mono-label" style={{ color: "var(--ink-black)" }}>
            {state ? state.organization.nearAccount : "INITIALIZING LEDGER…"}
          </div>
        </div>

        {notice && (
          <div
            style={{
              background: "var(--ink-black)",
              color: "var(--bg-paper)",
              padding: "0.4rem 2rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              letterSpacing: "0.08em",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>TELEMETRY // {notice}</span>
            <button
              onClick={() => setNotice(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--bg-paper)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.68rem",
                cursor: "pointer",
              }}
            >
              [DISMISS]
            </button>
          </div>
        )}
      </header>

      {/* Main Content Container above Canvas */}
      <main style={{ position: "relative", zIndex: 10 }}>
        {/* ===================================================================
            SECTION 01: HERO — Object floats centered below headline, calm
           =================================================================== */}
        <section
          id="hero"
          style={{
            minHeight: "100vh",
            maxWidth: 1440,
            margin: "0 auto",
            padding: "6.5rem 2rem 2.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Top Hero Headline Block */}
          <div style={{ maxWidth: 920, margin: "0 auto", textAlign: "center" }}>
            <div
              className="mono-label"
              style={{
                marginBottom: "1rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.3rem 0.85rem",
                border: "1px solid var(--line-hairline)",
                background: "rgba(244, 241, 234, 0.75)",
              }}
            >
              <span>INSTRUMENT 01 // CONFIDENTIAL STABLECOIN RAILS</span>
              <span style={{ color: "var(--accent-emerald)" }}>● NEAR PROTOCOL</span>
            </div>

            <h1
              style={{
                fontSize: "clamp(2.35rem, 5.1vw, 4.65rem)",
                fontWeight: 400,
                lineHeight: 1.04,
                letterSpacing: "-0.035em",
                color: "var(--ink-black)",
                marginBottom: "1.15rem",
              }}
            >
              Bring the boring business money onchain.
            </h1>

            <p
              style={{
                fontSize: "clamp(0.95rem, 1.25vw, 1.12rem)",
                lineHeight: 1.6,
                color: "var(--ink-muted)",
                maxWidth: 640,
                margin: "0 auto",
                fontWeight: 400,
              }}
            >
              Payroll-grade merchant checkout, cross-border stablecoin remittances, and
              selective-disclosure auditability. Private by default. Provable on demand.
            </p>
          </div>

          {/* Center viewport is intentionally open so the 3D black particle core floats right below the headline */}
          <div style={{ flex: 1, minHeight: "34vh" }} />

          {/* Bottom Precision Telemetry Strip */}
          <div>
            <div
              className="hairline-top hairline-bottom"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1.25rem",
                padding: "1.1rem 0",
                background: "rgba(244, 241, 234, 0.72)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div>
                <div className="mono-label">PRIVACY ARCHITECTURE</div>
                <div className="mono-data" style={{ marginTop: "0.25rem", color: "var(--ink-black)" }}>
                  AES-256-GCM + SHA-256 COMMIT
                </div>
              </div>
              <div>
                <div className="mono-label">SETTLEMENT FINALITY</div>
                <div className="mono-data" style={{ marginTop: "0.25rem", color: "var(--accent-emerald)" }}>
                  ~1.4 SEC · &lt;$0.01 NEAR GAS
                </div>
              </div>
              <div>
                <div className="mono-label">EXCEPTION ENGINE</div>
                <div className="mono-data" style={{ marginTop: "0.25rem", color: "var(--ink-black)" }}>
                  AUTO-REFUND OVERPAY &amp; TIMEOUT
                </div>
              </div>
              <div>
                <div className="mono-label">SELECTIVE DISCLOSURE</div>
                <div className="mono-data" style={{ marginTop: "0.25rem", color: "var(--accent-blue)" }}>
                  X25519 SCOPED VIEW KEYS
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            SECTION 02: MERCHANT & CHECKOUT — Particle core shifts right & tilts
           =================================================================== */}
        <section
          id="merchant"
          style={{
            minHeight: "100vh",
            maxWidth: 1440,
            margin: "0 auto",
            padding: "6rem 2rem 4rem",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            className="section-split-left"
            style={{
              width: "100%",
              maxWidth: "56%",
            }}
          >
            <div className="mono-label" style={{ marginBottom: "0.6rem", color: "var(--accent-emerald)" }}>
              02 // MERCHANT SETTLEMENT &amp; INSTANT CHECKOUT
            </div>
            <h2
              style={{
                fontSize: "clamp(1.75rem, 3vw, 2.65rem)",
                fontWeight: 400,
                letterSpacing: "-0.028em",
                lineHeight: 1.12,
                color: "var(--ink-black)",
                marginBottom: "0.85rem",
              }}
            >
              Every invoice matched to the minor unit. Exceptions handled in protocol.
            </h2>
            <p
              style={{
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "var(--ink-muted)",
                marginBottom: "1.5rem",
              }}
            >
              Order metadata and buyer identity are sealed off-chain; only an opaque 32-byte escrow
              ID and cryptographic commitment touch NEAR. Underpayments hold safely, overpayments
              auto-refund the delta, and exact matches settle immediately to your treasury.
            </p>

            {/* Interactive Merchant Instrument Panel */}
            <div className="instrument-panel">
              <div
                className="hairline-bottom"
                style={{
                  paddingBottom: "0.75rem",
                  marginBottom: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="mono-label" style={{ color: "var(--ink-black)" }}>
                  ISSUE CONFIDENTIAL PAYMENT REQUEST
                </span>
                <span className="mono-label">CURRENCY: USDC (NEP-141)</span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "0.85rem",
                }}
              >
                <div>
                  <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                    ORDER REFERENCE
                  </label>
                  <input
                    className="ledger-input"
                    value={orderRef}
                    onChange={(e) => setOrderRef(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                    AMOUNT (USDC)
                  </label>
                  <input
                    className="ledger-input"
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                    COUNTERPARTY EMAIL
                  </label>
                  <input
                    className="ledger-input"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                  />
                </div>
              </div>

              <button
                className="ledger-btn"
                disabled={busy}
                onClick={() =>
                  runAction(
                    {
                      action: "CREATE_PAYMENT_REQUEST",
                      orderRef,
                      amountDecimal: orderAmount,
                      customerEmail,
                    },
                    `Sealed ${orderRef} (${orderAmount} USDC) & anchored commitment on NEAR.`,
                  )
                }
              >
                + REGISTER ESCROW &amp; SEAL INVOICE
              </button>

              {/* Live Payment Requests Table + Instant Checkout Simulator */}
              <div className="hairline-top" style={{ marginTop: "1.35rem", paddingTop: "1rem" }}>
                <div
                  className="mono-label"
                  style={{ marginBottom: "0.65rem", display: "flex", justifyContent: "space-between" }}
                >
                  <span>ACTIVE &amp; SETTLED ESCROWS ({state?.paymentRequests.length ?? 0})</span>
                  <span>SIMULATE BUYER DEPOSIT</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {(state?.paymentRequests ?? []).slice(0, 4).map((pr) => {
                    const reqAmount = Number(pr.amountDecimal);
                    const overpayAmount = (reqAmount + 25).toFixed(2);
                    const partialAmount = Math.max(1, Math.floor(reqAmount / 2)).toFixed(2);
                    const canPay = pr.status === "OPEN" || pr.status === "PARTIALLY_PAID";

                    return (
                      <div
                        key={pr.id}
                        style={{
                          padding: "0.75rem",
                          border: "1px solid var(--line-hairline)",
                          background: "rgba(255, 255, 255, 0.45)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                            <span className="mono-data" style={{ fontWeight: 600, color: "var(--ink-black)" }}>
                              {Number(pr.amountDecimal).toFixed(2)} USDC
                            </span>
                            <span className={statusTone(pr.status)}>{pr.status}</span>
                          </div>
                          <div className="mono-label" style={{ marginTop: "0.25rem" }}>
                            ESCROW: {pr.escrowId.slice(0, 12)}… · COMMIT: {pr.commitment.slice(0, 12)}… ·
                            RCVD: {Number(pr.receivedDecimal).toFixed(2)} USDC
                          </div>
                        </div>

                        {canPay ? (
                          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                            <button
                              className="ledger-btn-outline"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  {
                                    action: "SIMULATE_BUYER_DEPOSIT",
                                    escrowId: pr.escrowId,
                                    amountDecimal: Number(pr.remainingDecimal).toFixed(2),
                                  },
                                  `Exact deposit matched for ${pr.id} -> Released to merchant.`,
                                )
                              }
                            >
                              PAY EXACT ({Number(pr.remainingDecimal).toFixed(0)})
                            </button>
                            <button
                              className="ledger-btn-outline"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  {
                                    action: "SIMULATE_BUYER_DEPOSIT",
                                    escrowId: pr.escrowId,
                                    amountDecimal: overpayAmount,
                                  },
                                  `Overpaid ${overpayAmount} USDC -> Auto-refunded 25 USDC excess & settled.`,
                                )
                              }
                            >
                              OVERPAY (+25)
                            </button>
                            {pr.status === "OPEN" && (
                              <button
                                className="ledger-btn-outline"
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    {
                                      action: "SIMULATE_BUYER_DEPOSIT",
                                      escrowId: pr.escrowId,
                                      amountDecimal: partialAmount,
                                    },
                                    `Partial deposit (${partialAmount} USDC) held in escrow.`,
                                  )
                                }
                              >
                                PARTIAL (50%)
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="mono-label" style={{ color: "var(--accent-emerald)" }}>
                            ✓ SETTLED ON-CHAIN
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            SECTION 03: REMITTANCE — Particle core shifts left & reorients
           =================================================================== */}
        <section
          id="remittance"
          style={{
            minHeight: "100vh",
            maxWidth: 1440,
            margin: "0 auto",
            padding: "6rem 2rem 4rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <div
            className="section-split-right"
            style={{
              width: "100%",
              maxWidth: "56%",
            }}
          >
            <div className="mono-label" style={{ marginBottom: "0.6rem", color: "var(--accent-blue)" }}>
              03 // CROSS-BORDER STABLECOIN REMITTANCE RAILS
            </div>
            <h2
              style={{
                fontSize: "clamp(1.75rem, 3vw, 2.65rem)",
                fontWeight: 400,
                letterSpacing: "-0.028em",
                lineHeight: 1.12,
                color: "var(--ink-black)",
                marginBottom: "0.85rem",
              }}
            >
              Stablecoin speed in the core. Local currency at the last mile.
            </h2>
            <p
              style={{
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "var(--ink-muted)",
                marginBottom: "1.5rem",
              }}
            >
              Lock deterministic FX quotes, screen counterparties, and embed FATF Travel Rule
              payloads inside encrypted envelopes. If an off-ramp corridor falters, bounded retries
              and fail-safe escrow refunds protect every cent.
            </p>

            {/* Interactive Remittance Instrument Panel */}
            <div className="instrument-panel">
              <div
                className="hairline-bottom"
                style={{
                  paddingBottom: "0.75rem",
                  marginBottom: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <span className="mono-label" style={{ color: "var(--ink-black)" }}>
                  DISPATCH CROSS-BORDER PAYOUT INTENT
                </span>
                <span className="mono-label">FEE: 0.50% · RATE LOCK: 60 MIN</span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "0.85rem",
                }}
              >
                <div>
                  <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                    SOURCE (USDC)
                  </label>
                  <input
                    className="ledger-input"
                    value={remitAmount}
                    onChange={(e) => setRemitAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                    CORRIDOR / CURRENCY
                  </label>
                  <select
                    className="ledger-select"
                    value={remitCurrency}
                    onChange={(e) =>
                      setRemitCurrency(e.target.value as "PHP" | "IDR" | "EUR" | "USDC")
                    }
                  >
                    <option value="PHP">USDC → PHP (GCash Manila)</option>
                    <option value="IDR">USDC → IDR (Bank BCA Jakarta)</option>
                    <option value="EUR">USDC → EUR (SEPA Instant)</option>
                    <option value="USDC">USDC → USDC (Direct NEAR Account)</option>
                  </select>
                </div>
                <div>
                  <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                    BENEFICIARY NAME
                  </label>
                  <input
                    className="ledger-input"
                    value={remitRecipient}
                    onChange={(e) => setRemitRecipient(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                    DESTINATION ACCOUNT
                  </label>
                  <input
                    className="ledger-input"
                    value={remitDest}
                    onChange={(e) => setRemitDest(e.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="mono-label">OFF-RAMP SIMULATION:</span>
                  <button
                    type="button"
                    className="ledger-btn-outline"
                    onClick={() =>
                      setRemitMode((m) => (m === "SUCCESS" ? "TRANSIENT_FAILURE" : "SUCCESS"))
                    }
                  >
                    {remitMode === "SUCCESS"
                      ? "MODE: INSTANT SETTLE"
                      : "MODE: SIMULATE PARTNER OUTAGE"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    className="ledger-btn"
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        {
                          action: "CREATE_AND_FUND_REMITTANCE",
                          sourceUsdcDecimal: remitAmount,
                          targetCurrency: remitCurrency,
                          recipientType:
                            remitCurrency === "USDC"
                              ? "NEAR_ACCOUNT"
                              : remitCurrency === "PHP"
                                ? "EWALLET"
                                : "BANK",
                          recipientName: remitRecipient,
                          recipientAccountOrWallet:
                            remitCurrency === "USDC" ? "rosa.ledgerly.testnet" : remitDest,
                          recipientCountry:
                            remitCurrency === "PHP"
                              ? "PH"
                              : remitCurrency === "IDR"
                                ? "ID"
                                : "DE",
                          offRampMode: remitMode,
                        },
                        remitMode === "SUCCESS"
                          ? `Remittance funded & settled to ${remitRecipient} in ${remitCurrency}.`
                          : `Off-ramp partner timed out -> Queued in PAYOUT_FAILED for SettlementWorker retry.`,
                      )
                    }
                  >
                    LOCK QUOTE &amp; DISPATCH REMITTANCE
                  </button>

                  <button
                    className="ledger-btn-outline"
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        { action: "RETRY_FAILED_SETTLEMENTS" },
                        "SettlementWorker retried pending payouts -> Settled.",
                      )
                    }
                  >
                    RUN RETRY WORKER
                  </button>
                </div>
              </div>

              {/* Remittance Feed */}
              <div className="hairline-top" style={{ marginTop: "1.35rem", paddingTop: "1rem" }}>
                <div className="mono-label" style={{ marginBottom: "0.65rem" }}>
                  RECENT CROSS-BORDER DISPATCHES ({state?.remittances.length ?? 0})
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {(state?.remittances ?? []).slice(0, 4).map((rm) => (
                    <div
                      key={rm.id}
                      style={{
                        padding: "0.75rem",
                        border: "1px solid var(--line-hairline)",
                        background: "rgba(255, 255, 255, 0.45)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                          <span className="mono-data" style={{ fontWeight: 600, color: "var(--ink-black)" }}>
                            {Number(rm.sourceDecimal).toFixed(2)} USDC → {rm.targetDecimal}{" "}
                            {rm.targetCurrency}
                          </span>
                          <span className={statusTone(rm.status)}>{rm.status}</span>
                        </div>
                        <div className="mono-label" style={{ marginTop: "0.25rem" }}>
                          CORRIDOR: {rm.country} ({rm.recipientType}) · ATTEMPTS: {rm.attempts}/3 ·
                          COMMIT: {rm.commitment.slice(0, 14)}…
                        </div>
                      </div>
                      <div className="mono-label" style={{ color: "var(--ink-black)" }}>
                        {rm.payoutRef ? `REF: ${rm.payoutRef}` : rm.lastFailureCode ?? "AWAITING"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            SECTION 04: AUDITOR / TRUST / SETTLEMENT — Particle object bursts
            and dissolves into fine particles settling across the entire section
           =================================================================== */}
        <section
          id="auditor"
          style={{
            minHeight: "100vh",
            maxWidth: 1440,
            margin: "0 auto",
            padding: "6.5rem 2rem 5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ maxWidth: 780, marginBottom: "2.25rem" }}>
            <div className="mono-label" style={{ marginBottom: "0.6rem", color: "var(--accent-emerald)" }}>
              04 // SELECTIVE DISCLOSURE, RECONCILIATION &amp; AUDIT PROOF
            </div>
            <h2
              style={{
                fontSize: "clamp(1.85rem, 3.3vw, 2.95rem)",
                fontWeight: 400,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color: "var(--ink-black)",
                marginBottom: "0.85rem",
              }}
            >
              Confidential to the world. Mathematically verifiable to your auditor.
            </h2>
            <p
              style={{
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "var(--ink-muted)",
              }}
            >
              Grant time-bound, revocable X25519 view keys scoped to a single period. Your auditor
              decrypts records locally and verifies every canonical payload hash against the
              immutable commitment stored in <code className="mono-data">ledgerly-escrow</code>.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {/* Left Column: Auditor Verification Console */}
            <div className="instrument-panel">
              <div
                className="hairline-bottom"
                style={{
                  paddingBottom: "0.75rem",
                  marginBottom: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <div className="mono-label" style={{ color: "var(--ink-black)" }}>
                    SCOPED AUDITOR VIEW KEY VERIFICATION
                  </div>
                  <div className="mono-label" style={{ marginTop: "0.2rem" }}>
                    GRANT: {state?.audit.grantId ?? "—"} · KEY: {state?.audit.auditorKeyShort ?? "—"}
                  </div>
                </div>
                <button
                  className="ledger-btn-outline"
                  disabled={busy}
                  onClick={() =>
                    runAction(
                      { action: "REFRESH_AUDIT_GRANT" },
                      "Issued fresh scoped X25519 ViewKeyGrant & anchored audit log root on NEAR.",
                    )
                  }
                >
                  ROTATE VIEW KEY
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {(state?.audit.records ?? []).slice(0, 4).map((rec) => (
                  <div
                    key={rec.recordId}
                    style={{
                      padding: "0.75rem",
                      border: "1px solid var(--line-hairline)",
                      background: "rgba(255, 255, 255, 0.52)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.35rem",
                      }}
                    >
                      <span className="mono-data" style={{ fontWeight: 600, color: "var(--ink-black)" }}>
                        [{rec.kind}] {rec.recordId}
                      </span>
                      <span
                        className={
                          rec.verifiedOnchain
                            ? "status-pill status-pill-emerald"
                            : "status-pill status-pill-amber"
                        }
                      >
                        {rec.verifiedOnchain
                          ? "✓ SHA-256 COMMITMENT MATCHED"
                          : "PENDING ON-CHAIN ANCHOR"}
                      </span>
                    </div>
                    <div className="mono-label" style={{ color: "var(--ink-charcoal)" }}>
                      DECRYPTED:{" "}
                      {JSON.stringify(rec.decryptedPayload).slice(0, 96)}
                      {JSON.stringify(rec.decryptedPayload).length > 96 ? "…" : ""}
                    </div>
                    <div className="mono-label" style={{ marginTop: "0.25rem" }}>
                      ON-CHAIN HASH: {rec.commitment.slice(0, 28)}…
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Double-Entry Reconciliation & Hash-Chain Telemetry */}
            <div className="instrument-panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div
                  className="hairline-bottom"
                  style={{
                    paddingBottom: "0.75rem",
                    marginBottom: "1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="mono-label" style={{ color: "var(--ink-black)" }}>
                    CONTINUOUS RECONCILIATION &amp; AUDIT CHAIN
                  </span>
                  <span className="status-pill status-pill-emerald">
                    {state?.audit.chainValid ? "HASH CHAIN INTACT" : "VERIFYING"}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.85rem",
                    marginBottom: "1.15rem",
                  }}
                >
                  <div
                    style={{
                      padding: "0.75rem",
                      border: "1px solid var(--line-hairline)",
                      background: "rgba(255,255,255,0.45)",
                    }}
                  >
                    <div className="mono-label">ESCROWS RECONCILED</div>
                    <div
                      className="mono-data"
                      style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "0.25rem" }}
                    >
                      {state?.reconciliation.checkedCount ?? 0}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "0.75rem",
                      border: "1px solid var(--line-hairline)",
                      background: "rgba(255,255,255,0.45)",
                    }}
                  >
                    <div className="mono-label">DOUBLE-ENTRY JOURNAL LEGS</div>
                    <div
                      className="mono-data"
                      style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "0.25rem" }}
                    >
                      {state?.ledger.entriesCount ?? 0}
                    </div>
                  </div>
                </div>

                <div className="mono-label" style={{ marginBottom: "0.45rem" }}>
                  LATEST ANCHORED MERKLE / HASH-CHAIN ROOT ON NEAR:
                </div>
                <div
                  className="mono-data"
                  style={{
                    padding: "0.6rem 0.75rem",
                    background: "rgba(15, 16, 18, 0.05)",
                    border: "1px solid var(--line-hairline)",
                    wordBreak: "break-all",
                    fontSize: "0.72rem",
                    marginBottom: "1rem",
                  }}
                >
                  {state?.audit.latestAnchoredRoot ?? "0".repeat(64)}
                </div>

                <div className="mono-label" style={{ marginBottom: "0.45rem" }}>
                  EXCEPTION QUEUE ({state?.reconciliation.discrepancies.length ?? 0} ITEMS):
                </div>
                {state?.reconciliation.discrepancies.length === 0 ? (
                  <div
                    className="mono-label"
                    style={{
                      padding: "0.65rem",
                      border: "1px solid var(--line-hairline)",
                      color: "var(--accent-emerald)",
                    }}
                  >
                    ✓ ZERO DISCREPANCIES — ALL ESCROW BALANCES MATCH INTERNAL LEDGER
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {state?.reconciliation.discrepancies.map((d) => (
                      <div
                        key={d.recordId}
                        className="mono-label"
                        style={{
                          padding: "0.55rem",
                          border: "1px solid rgba(138, 90, 25, 0.35)",
                          background: "var(--accent-amber-soft)",
                          color: "var(--accent-amber)",
                        }}
                      >
                        [{d.reason}] {d.recordId} · STATUS: {d.status}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                className="hairline-top"
                style={{
                  marginTop: "1.25rem",
                  paddingTop: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <span className="mono-label">ERP EXPORT (XERO / QUICKBOOKS / JURNAL)</span>
                <button className="ledger-btn" onClick={handleDownloadCsv}>
                  ↓ EXPORT RECONCILIATION CSV
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===================================================================
          FOOTER — Solid black, extremely minimal, full-width LEDGERLY wordmark
         =================================================================== */}
      <footer
        style={{
          position: "relative",
          zIndex: 20,
          backgroundColor: "#060607",
          color: "#f4f1ea",
          padding: "3.5rem 2rem 1rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(244, 241, 234, 0.14)",
            paddingBottom: "1.5rem",
            marginBottom: "2rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(244, 241, 234, 0.6)",
            }}
          >
            BORING MONEY, BEAUTIFULLY EXECUTED.
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(244, 241, 234, 0.6)",
            }}
          >
            NEAR PROTOCOL · CONFIDENTIAL ESCROW RAILS
          </span>
        </div>

        <div
          style={{
            width: "100%",
            textAlign: "center",
            fontSize: "clamp(4.2rem, 17.6vw, 19rem)",
            fontWeight: 600,
            letterSpacing: "-0.055em",
            lineHeight: 0.86,
            color: "#f4f1ea",
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          LEDGERLY
        </div>
      </footer>
    </div>
  );
}
