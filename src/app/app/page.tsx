"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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

export default function LedgerlyAppWorkspace() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [orderRef, setOrderRef] = useState("INV-2026-8849");
  const [orderAmount, setOrderAmount] = useState("680.00");
  const [customerEmail, setCustomerEmail] = useState("treasury@studio-forma.ch");

  const [remitAmount, setRemitAmount] = useState("250.00");
  const [remitCurrency, setRemitCurrency] = useState<"PHP" | "IDR" | "EUR" | "USDC">("PHP");
  const [remitRecipient, setRemitRecipient] = useState("Manila Loom Works");
  const [remitDest, setRemitDest] = useState("GCASH:+63-917-402-8819");
  const [remitMode, setRemitMode] = useState<"SUCCESS" | "TRANSIENT_FAILURE">("SUCCESS");

  const fetchState = useCallback(async () => {
    const res = await fetch("/api/v1/state", { cache: "no-store" });
    if (res.ok) {
      setState((await res.json()) as DashboardState);
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
        setNotice(`${data.error?.code ?? "Error"}: ${data.error?.message ?? "Request failed"}`);
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
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <div className="paper-grain" />

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(247, 244, 238, 0.88)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "1rem 1.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Link
              href="/"
              style={{
                fontWeight: 600,
                fontSize: "1.05rem",
                letterSpacing: "-0.02em",
                color: "var(--ink-charcoal)",
                textDecoration: "none",
              }}
            >
              Ledgerly
            </Link>
            <span className="status-pill status-pill-emerald">NEAR Testnet</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <span style={{ fontSize: "0.84rem", color: "var(--ink-muted)" }}>
              {state ? state.organization.name : "Loading workspace…"}
            </span>
            <Link href="/" className="btn-secondary" style={{ padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}>
              ← Back to Overview
            </Link>
          </div>
        </div>

        {notice && (
          <div
            style={{
              background: "var(--sage-green)",
              color: "#fff",
              padding: "0.5rem 1.75rem",
              fontSize: "0.84rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                fontSize: "0.78rem",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "2.5rem 1.75rem 4rem", position: "relative", zIndex: 5 }}>
        <div style={{ marginBottom: "2.25rem" }}>
          <div className="eyebrow" style={{ marginBottom: "0.4rem" }}>
            Treasury &amp; Payment Console
          </div>
          <h1 style={{ fontSize: "2rem", fontWeight: 500, letterSpacing: "-0.03em" }}>
            Merchant Checkout, Remittances &amp; Audit Verification
          </h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
          {/* 1. Merchant Checkout Card */}
          <div className="fin-card">
            <div className="eyebrow" style={{ marginBottom: "0.3rem" }}>
              Merchant Payments
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: "0.5rem" }}>
              Create Confidential Payment Request
            </h2>
            <p style={{ fontSize: "0.88rem", color: "var(--ink-muted)", marginBottom: "1.15rem", lineHeight: 1.55 }}>
              Invoice details are encrypted off-chain; only an opaque escrow ID and SHA-256 commitment are registered on NEAR.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div>
                <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                  Invoice Ref
                </label>
                <input className="ledger-input" value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
              </div>
              <div>
                <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                  Amount (USDC)
                </label>
                <input className="ledger-input" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: "0.9rem" }}>
              <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                Customer Email
              </label>
              <input className="ledger-input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>

            <button
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                runAction(
                  {
                    action: "CREATE_PAYMENT_REQUEST",
                    orderRef,
                    amountDecimal: orderAmount,
                    customerEmail,
                  },
                  `Created payment request ${orderRef} for ${orderAmount} USDC.`,
                )
              }
            >
              Create Checkout Link
            </button>

            <div className="hairline-top" style={{ marginTop: "1.25rem", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
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
                      borderRadius: 8,
                      border: "1px solid var(--line-soft)",
                      background: "rgba(255,255,255,0.6)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.65rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                          {Number(pr.amountDecimal).toFixed(2)} USDC
                        </span>
                        <span className={statusTone(pr.status)}>{pr.status}</span>
                      </div>
                      <div className="mono-label" style={{ marginTop: "0.2rem" }}>
                        Received: {Number(pr.receivedDecimal).toFixed(2)} USDC · Escrow {pr.escrowId.slice(0, 10)}…
                      </div>
                    </div>

                    {canPay && (
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: "0.38rem 0.65rem", fontSize: "0.75rem" }}
                          disabled={busy}
                          onClick={() =>
                            runAction(
                              {
                                action: "SIMULATE_BUYER_DEPOSIT",
                                escrowId: pr.escrowId,
                                amountDecimal: Number(pr.remainingDecimal).toFixed(2),
                              },
                              `Exact payment settled for ${pr.id}.`,
                            )
                          }
                        >
                          Pay Exact
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ padding: "0.38rem 0.65rem", fontSize: "0.75rem" }}
                          disabled={busy}
                          onClick={() =>
                            runAction(
                              {
                                action: "SIMULATE_BUYER_DEPOSIT",
                                escrowId: pr.escrowId,
                                amountDecimal: overpayAmount,
                              },
                              `Overpayment detected -> Auto-refunded 25 USDC excess & settled.`,
                            )
                          }
                        >
                          Overpay (+25)
                        </button>
                        {pr.status === "OPEN" && (
                          <button
                            className="btn-secondary"
                            style={{ padding: "0.38rem 0.65rem", fontSize: "0.75rem" }}
                            disabled={busy}
                            onClick={() =>
                              runAction(
                                {
                                  action: "SIMULATE_BUYER_DEPOSIT",
                                  escrowId: pr.escrowId,
                                  amountDecimal: partialAmount,
                                },
                                `Partial payment (${partialAmount} USDC) held safely in escrow.`,
                              )
                            }
                          >
                            Partial (50%)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Cross-Border Remittance Card */}
          <div className="fin-card">
            <div className="eyebrow" style={{ marginBottom: "0.3rem", color: "var(--slate-blue)" }}>
              Cross-Border Remittances
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: "0.5rem" }}>
              Send Stablecoin to Local Currency
            </h2>
            <p style={{ fontSize: "0.88rem", color: "var(--ink-muted)", marginBottom: "1.15rem", lineHeight: 1.55 }}>
              Lock transparent FX rates, run sanctions &amp; Travel Rule checks, and settle to local banks or e-wallets.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div>
                <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                  Send Amount (USDC)
                </label>
                <input className="ledger-input" value={remitAmount} onChange={(e) => setRemitAmount(e.target.value)} />
              </div>
              <div>
                <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                  Payout Corridor
                </label>
                <select
                  className="ledger-select"
                  value={remitCurrency}
                  onChange={(e) => setRemitCurrency(e.target.value as "PHP" | "IDR" | "EUR" | "USDC")}
                >
                  <option value="PHP">USDC → PHP (GCash)</option>
                  <option value="IDR">USDC → IDR (Bank BCA)</option>
                  <option value="EUR">USDC → EUR (SEPA)</option>
                  <option value="USDC">USDC → NEAR Account</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.9rem" }}>
              <div>
                <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                  Recipient Name
                </label>
                <input className="ledger-input" value={remitRecipient} onChange={(e) => setRemitRecipient(e.target.value)} />
              </div>
              <div>
                <label className="mono-label" style={{ display: "block", marginBottom: "0.3rem" }}>
                  Account / Wallet
                </label>
                <input className="ledger-input" value={remitDest} onChange={(e) => setRemitDest(e.target.value)} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  runAction(
                    {
                      action: "CREATE_AND_FUND_REMITTANCE",
                      sourceUsdcDecimal: remitAmount,
                      targetCurrency: remitCurrency,
                      recipientType:
                        remitCurrency === "USDC" ? "NEAR_ACCOUNT" : remitCurrency === "PHP" ? "EWALLET" : "BANK",
                      recipientName: remitRecipient,
                      recipientAccountOrWallet:
                        remitCurrency === "USDC" ? "rosa.ledgerly.testnet" : remitDest,
                      recipientCountry: remitCurrency === "PHP" ? "PH" : remitCurrency === "IDR" ? "ID" : "DE",
                      offRampMode: remitMode,
                    },
                    remitMode === "SUCCESS"
                      ? `Remittance settled to ${remitRecipient}.`
                      : `Partner timeout simulated -> Queued for automatic retry.`,
                  )
                }
              >
                Send Remittance
              </button>

              <button
                className="btn-secondary"
                style={{ padding: "0.65rem 0.9rem", fontSize: "0.8rem" }}
                onClick={() => setRemitMode((m) => (m === "SUCCESS" ? "TRANSIENT_FAILURE" : "SUCCESS"))}
              >
                {remitMode === "SUCCESS" ? "Mode: Instant Settle" : "Mode: Simulate Outage"}
              </button>

              <button
                className="btn-secondary"
                style={{ padding: "0.65rem 0.9rem", fontSize: "0.8rem" }}
                disabled={busy}
                onClick={() => runAction({ action: "RETRY_FAILED_SETTLEMENTS" }, "Retried pending payouts -> Settled.")}
              >
                Retry Failed
              </button>
            </div>

            <div className="hairline-top" style={{ marginTop: "1.25rem", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {(state?.remittances ?? []).slice(0, 4).map((rm) => (
                <div
                  key={rm.id}
                  style={{
                    padding: "0.75rem",
                    borderRadius: 8,
                    border: "1px solid var(--line-soft)",
                    background: "rgba(255,255,255,0.6)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                        {Number(rm.sourceDecimal).toFixed(2)} USDC → {rm.targetDecimal} {rm.targetCurrency}
                      </span>
                      <span className={statusTone(rm.status)}>{rm.status}</span>
                    </div>
                    <div className="mono-label" style={{ marginTop: "0.2rem" }}>
                      {rm.country} ({rm.recipientType}) · Attempts: {rm.attempts}/3
                    </div>
                  </div>
                  <span className="mono-label">{rm.payoutRef ?? rm.lastFailureCode ?? "Pending"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Selective Disclosure Auditor & Reconciliation Card */}
        <div className="fin-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: "0.3rem" }}>
                Selective Disclosure &amp; Accounting
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 500 }}>
                Auditor View Key Verification &amp; ERP Export
              </h2>
            </div>

            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button
                className="btn-secondary"
                style={{ padding: "0.55rem 1rem", fontSize: "0.82rem" }}
                disabled={busy}
                onClick={() => runAction({ action: "REFRESH_AUDIT_GRANT" }, "Rotated scoped auditor view key.")}
              >
                Rotate Scoped View Key
              </button>
              <button
                className="btn-primary"
                style={{ padding: "0.55rem 1rem", fontSize: "0.82rem" }}
                onClick={handleDownloadCsv}
              >
                Export Reconciliation CSV ({state?.ledger.entriesCount ?? 0} entries)
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
            {(state?.audit.records ?? []).slice(0, 6).map((rec) => (
              <div
                key={rec.recordId}
                style={{
                  padding: "0.85rem",
                  borderRadius: 8,
                  border: "1px solid var(--line-soft)",
                  background: "rgba(255,255,255,0.65)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.86rem" }}>
                    {rec.kind} · {rec.recordId}
                  </span>
                  <span className={rec.verifiedOnchain ? "status-pill status-pill-emerald" : "status-pill status-pill-amber"}>
                    {rec.verifiedOnchain ? "Verified On-Chain" : "Pending"}
                  </span>
                </div>
                <div className="mono-label" style={{ color: "var(--ink-body)", wordBreak: "break-word" }}>
                  {JSON.stringify(rec.decryptedPayload).slice(0, 110)}
                </div>
                <div className="mono-label" style={{ marginTop: "0.3rem" }}>
                  Commitment: {rec.commitment.slice(0, 22)}…
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
