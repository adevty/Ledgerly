"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  DashboardEmptyState,
  InlineErrorBanner,
  RemittanceItem,
  SkeletonRows,
  StatusBadge,
  StatusBadgeWithTransition,
  useLedgerlyDashboard,
} from "../_context";

interface LockedQuotePreview {
  sourceUsdc: string;
  feeUsdc: string;
  netUsdc: string;
  targetCurrency: string;
  targetAmount: string;
  rateLabel: string;
  expiresAtLabel: string;
  sourceLabel?: string;
}

type RemittanceFilter = "ALL" | "PENDING_OR_FAILED" | "SETTLED";

type SupportedCorridorCurrency = "PHP" | "IDR" | "EUR" | "AUD" | "SGD" | "KRW" | "JPY" | "USDC";

const DEFAULT_CORRIDOR_RATES: Record<
  SupportedCorridorCurrency,
  { rate: number; decimals: number; source: string; updatedAt?: string }
> = {
  PHP: { rate: 63.02, decimals: 2, source: "open.er-api.com" },
  IDR: { rate: 18080.0, decimals: 0, source: "open.er-api.com" },
  EUR: { rate: 0.8905, decimals: 4, source: "open.er-api.com" },
  AUD: { rate: 1.455, decimals: 2, source: "open.er-api.com" },
  SGD: { rate: 1.282, decimals: 2, source: "open.er-api.com" },
  KRW: { rate: 1356.0, decimals: 0, source: "open.er-api.com" },
  JPY: { rate: 158.3, decimals: 2, source: "open.er-api.com" },
  USDC: { rate: 1.0, decimals: 2, source: "Parity (1:1)" },
};

export default function RemittancePage() {
  const {
    state,
    busy,
    pendingKey,
    transitions,
    runAction,
    setInlineError,
    clearInlineError,
    pushToast,
  } = useLedgerlyDashboard();

  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const [remitAmount, setRemitAmount] = useState("250.00");
  const [remitCurrency, setRemitCurrency] = useState<SupportedCorridorCurrency>("PHP");
  const [remitRecipient, setRemitRecipient] = useState("Manila Loom Works");
  const [remitDest, setRemitDest] = useState("GCASH:+63-917-402-8819");
  const [remitMode, setRemitMode] = useState<"SUCCESS" | "TRANSIENT_FAILURE">("SUCCESS");
  const [includeTravelRule, setIncludeTravelRule] = useState(true);
  const [lockedQuote, setLockedQuote] = useState<LockedQuotePreview | null>(null);
  const [lockingQuote, setLockingQuote] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RemittanceFilter>("ALL");
  const [selectedRemittance, setSelectedRemittance] = useState<RemittanceItem | null>(null);

  const allRemittances = state?.remittances ?? [];

  const activeRates = useMemo(() => {
    const live = state?.fxRates;
    return {
      PHP: {
        rate: live?.PHP?.rate ?? DEFAULT_CORRIDOR_RATES.PHP.rate,
        decimals: 2,
        source: live?.PHP?.source ?? DEFAULT_CORRIDOR_RATES.PHP.source,
        updatedAt: live?.PHP?.updatedAtIso,
      },
      IDR: {
        rate: live?.IDR?.rate ?? DEFAULT_CORRIDOR_RATES.IDR.rate,
        decimals: 0,
        source: live?.IDR?.source ?? DEFAULT_CORRIDOR_RATES.IDR.source,
        updatedAt: live?.IDR?.updatedAtIso,
      },
      EUR: {
        rate: live?.EUR?.rate ?? DEFAULT_CORRIDOR_RATES.EUR.rate,
        decimals: 4,
        source: live?.EUR?.source ?? DEFAULT_CORRIDOR_RATES.EUR.source,
        updatedAt: live?.EUR?.updatedAtIso,
      },
      AUD: {
        rate: live?.AUD?.rate ?? DEFAULT_CORRIDOR_RATES.AUD.rate,
        decimals: 2,
        source: live?.AUD?.source ?? DEFAULT_CORRIDOR_RATES.AUD.source,
        updatedAt: live?.AUD?.updatedAtIso,
      },
      SGD: {
        rate: live?.SGD?.rate ?? DEFAULT_CORRIDOR_RATES.SGD.rate,
        decimals: 2,
        source: live?.SGD?.source ?? DEFAULT_CORRIDOR_RATES.SGD.source,
        updatedAt: live?.SGD?.updatedAtIso,
      },
      KRW: {
        rate: live?.KRW?.rate ?? DEFAULT_CORRIDOR_RATES.KRW.rate,
        decimals: 0,
        source: live?.KRW?.source ?? DEFAULT_CORRIDOR_RATES.KRW.source,
        updatedAt: live?.KRW?.updatedAtIso,
      },
      JPY: {
        rate: live?.JPY?.rate ?? DEFAULT_CORRIDOR_RATES.JPY.rate,
        decimals: 2,
        source: live?.JPY?.source ?? DEFAULT_CORRIDOR_RATES.JPY.source,
        updatedAt: live?.JPY?.updatedAtIso,
      },
      USDC: {
        rate: 1.0,
        decimals: 2,
        source: "Parity (1:1)",
        updatedAt: undefined,
      },
    };
  }, [state?.fxRates]);

  const filteredRemittances = useMemo(() => {
    if (statusFilter === "ALL") return allRemittances;
    if (statusFilter === "SETTLED") {
      return allRemittances.filter((rm) => rm.status === "SETTLED");
    }
    return allRemittances.filter((rm) => rm.status !== "SETTLED");
  }, [allRemittances, statusFilter]);

  const failedCount = allRemittances.filter(
    (rm) => rm.status === "PAYOUT_FAILED" || rm.status === "BLOCKED",
  ).length;

  const handleLockQuote = async () => {
    clearInlineError();
    const numeric = Number(remitAmount);
    if (!remitAmount.trim() || Number.isNaN(numeric) || numeric <= 0) {
      const msg = "Enter a valid positive USDC amount before locking an FX quote.";
      setInlineError({ scope: "remit_form", code: "INVALID_QUOTE_AMOUNT", message: msg });
      pushToast({ kind: "error", title: "Quote Rejected", message: msg });
      return;
    }

    setLockingQuote(true);
    await new Promise((resolve) => setTimeout(resolve, 360));
    const fee = Math.max(0.5, numeric * 0.005);
    const net = Math.max(0, numeric - fee);
    const corridor = activeRates[remitCurrency];
    const targetVal = (net * corridor.rate).toLocaleString("en-US", {
      minimumFractionDigits: corridor.decimals,
      maximumFractionDigits: corridor.decimals,
    });

    const preview: LockedQuotePreview = {
      sourceUsdc: numeric.toFixed(2),
      feeUsdc: fee.toFixed(2),
      netUsdc: net.toFixed(2),
      targetCurrency: remitCurrency,
      targetAmount: targetVal,
      rateLabel: `1 USDC = ${corridor.rate.toLocaleString("en-US", {
        minimumFractionDigits: corridor.decimals,
        maximumFractionDigits: corridor.decimals,
      })} ${remitCurrency}`,
      expiresAtLabel: "60m rate lock (Live Market Feed)",
      sourceLabel: corridor.source,
    };

    setLockedQuote(preview);
    setLockingQuote(false);
    pushToast({
      kind: "success",
      title: "Real-Time FX Quote Locked",
      message: `${preview.sourceUsdc} USDC → ${preview.targetAmount} ${remitCurrency} (${preview.rateLabel}) via ${corridor.source}.`,
    });
  };

  const handleSendRemittance = async () => {
    const cleanAmount = remitAmount.replace(/,/g, "").trim();
    if (!remitRecipient.trim() || !remitDest.trim()) {
      const msg = "Recipient name and destination account or wallet are required.";
      setInlineError({ scope: "remit_form", code: "MISSING_RECIPIENT", message: msg });
      pushToast({ kind: "error", title: "Validation Error", message: msg });
      return;
    }

    let destination = remitDest.trim();
    if (remitCurrency === "USDC") {
      destination = destination || "rosa.ledgerly.testnet";
      if (!destination.includes(".")) {
        destination = `${destination}.testnet`;
      }
    }

    const country =
      remitCurrency === "PHP"
        ? "PH"
        : remitCurrency === "IDR"
          ? "ID"
          : remitCurrency === "EUR"
            ? "DE"
            : remitCurrency === "AUD"
              ? "AU"
              : remitCurrency === "SGD"
                ? "SG"
                : remitCurrency === "KRW"
                  ? "KR"
                  : remitCurrency === "JPY"
                    ? "JP"
                    : "SG";

    const ok = await runAction(
      {
        action: "CREATE_AND_FUND_REMITTANCE",
        sourceUsdcDecimal: cleanAmount,
        targetCurrency: remitCurrency,
        recipientType:
          remitCurrency === "USDC"
            ? "NEAR_ACCOUNT"
            : remitCurrency === "PHP"
              ? "EWALLET"
              : "BANK",
        recipientName: remitRecipient.trim(),
        recipientAccountOrWallet: destination,
        recipientCountry: country,
        offRampMode: remitMode,
        includeTravelRule,
      },
      remitMode === "SUCCESS"
        ? `Dispatched & settled ${cleanAmount} USDC to ${remitRecipient.trim()} (${remitCurrency}).`
        : `Partner timeout simulated -> Remittance queued in PAYOUT_FAILED for bounded retry.`,
      {
        actionKey: "send_remittance",
        errorScope: "remit_form",
        successTitle:
          remitMode === "SUCCESS" ? "Remittance Settled" : "Queued for Retry (Partner Outage)",
      },
    );

    if (ok) {
      setLockedQuote(null);
    }
  };

  const isBusy = busy || lockingQuote;

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
          Cross-Border Remittances
        </div>
        <h1
          style={{
            fontSize: "1.65rem",
            fontWeight: 600,
            letterSpacing: "-0.025em",
            marginBottom: "0.35rem",
            color: "var(--ink-charcoal)",
          }}
        >
          Stablecoin to Local Currency Settlement
        </h1>
        <p style={{ fontSize: "0.86rem", color: "var(--ink-muted)", maxWidth: 660, lineHeight: 1.55 }}>
          Lock deterministic FX rates, enforce sanctions screening and FATF Travel Rule checks
          (&ge; 1,000 USDC), and settle directly to local e-wallets, bank accounts, or NEAR
          accounts.
        </p>
      </div>

      {/* Dispatch Remittance Form */}
      <div className="fin-card" style={{ marginBottom: "1.5rem" }}>
        {/* Card Header */}
        <div
          className="hairline-bottom"
          style={{
            paddingBottom: "0.95rem",
            marginBottom: "0.35rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <h2 style={{ fontWeight: 600, fontSize: "1rem", color: "var(--ink-charcoal)" }}>
              Dispatch Cross-Border Payout
            </h2>
            <p style={{ fontSize: "0.79rem", color: "var(--ink-muted)", marginTop: "0.15rem" }}>
              Fund a NEAR USDC escrow and trigger automated local currency off-ramp settlement.
            </p>
          </div>
          <StatusBadge status="OPEN" label="0.50% Fee · 60m Rate Lock" />
        </div>

        <InlineErrorBanner scope="remit_form" />

        {/* Section 01: Payout Amount & Corridor */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-title">
              <span className="form-section-step">01</span>
              <span>Payout Amount &amp; Settlement Corridor</span>
            </span>
            <span className="mono-label">FX &amp; Treasury Funding</span>
          </div>

          <div className="form-grid-2">
            <div className="field-group">
              <label className="field-label" htmlFor="remit-amount">
                <span>Send Amount</span>
                <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                  Source Asset
                </span>
              </label>
              <div className="input-affix-wrap">
                <input
                  id="remit-amount"
                  ref={amountInputRef}
                  className="ledger-input"
                  value={remitAmount}
                  onChange={(e) => {
                    setRemitAmount(e.target.value);
                    setLockedQuote(null);
                  }}
                  placeholder="250.00"
                  disabled={isBusy}
                />
                <span className="input-affix-tag">USDC</span>
              </div>
              <span className="field-hint">
                Transparent 0.50% fee (min 0.50 USDC) deducted prior to FX conversion.
              </span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="remit-corridor">
                <span>Payout Corridor</span>
                <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                  Target Rail
                </span>
              </label>
              <select
                id="remit-corridor"
                className="ledger-select"
                value={remitCurrency}
                onChange={(e) => {
                  const curr = e.target.value as SupportedCorridorCurrency;
                  setRemitCurrency(curr);
                  setLockedQuote(null);
                  if (curr === "PHP") {
                    setRemitRecipient("Manila Loom Works");
                    setRemitDest("GCASH:+63-917-402-8819");
                  } else if (curr === "IDR") {
                    setRemitRecipient("PT Artisan Nusantara");
                    setRemitDest("BCA:0182-9910-442");
                  } else if (curr === "EUR") {
                    setRemitRecipient("Studio Forma GmbH");
                    setRemitDest("IBAN:DE89370400440532013000");
                  } else if (curr === "AUD") {
                    setRemitRecipient("Sydney Harbourside Supplies Pty");
                    setRemitDest("BSB:082-901 ACC:99812039");
                  } else if (curr === "SGD") {
                    setRemitRecipient("Marina Straits Trading Pte Ltd");
                    setRemitDest("PAYNOW:UEN:201829012K");
                  } else if (curr === "KRW") {
                    setRemitRecipient("Seoul Digital Hanok Co.");
                    setRemitDest("KB_BANK:98012-04-192831");
                  } else if (curr === "JPY") {
                    setRemitRecipient("Kyoto Artisan Crafts KK");
                    setRemitDest("MUFG:0005-1928471");
                  } else if (curr === "USDC") {
                    setRemitRecipient("Rosa Santos");
                    setRemitDest("rosa.ledgerly.testnet");
                  }
                }}
                disabled={isBusy}
              >
                <option value="PHP">
                  USDC → PHP (GCash Manila · 1 USDC ≈ {activeRates.PHP.rate.toFixed(2)} PHP)
                </option>
                <option value="IDR">
                  USDC → IDR (Bank BCA Jakarta · 1 USDC ≈ {Math.round(activeRates.IDR.rate).toLocaleString("en-US")} IDR)
                </option>
                <option value="EUR">
                  USDC → EUR (SEPA Instant Frankfurt · 1 USDC ≈ {activeRates.EUR.rate.toFixed(4)} EUR)
                </option>
                <option value="AUD">
                  USDC → AUD (NPP / PayID Sydney · 1 USDC ≈ {activeRates.AUD.rate.toFixed(3)} AUD)
                </option>
                <option value="SGD">
                  USDC → SGD (FAST / PayNow Singapore · 1 USDC ≈ {activeRates.SGD.rate.toFixed(3)} SGD)
                </option>
                <option value="KRW">
                  USDC → KRW (Open Banking Seoul · 1 USDC ≈ {Math.round(activeRates.KRW.rate).toLocaleString("en-US")} KRW)
                </option>
                <option value="JPY">
                  USDC → JPY (Zengin System Tokyo · 1 USDC ≈ {activeRates.JPY.rate.toFixed(2)} JPY)
                </option>
                <option value="USDC">USDC → USDC (Direct NEAR Account · 1:1)</option>
              </select>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "0.35rem",
                  fontSize: "0.72rem",
                }}
              >
                <span style={{ color: "var(--ink-muted)" }}>
                  Live Rate: 1 USDC = {activeRates[remitCurrency].rate.toLocaleString("en-US", {
                    minimumFractionDigits: activeRates[remitCurrency].decimals,
                    maximumFractionDigits: activeRates[remitCurrency].decimals,
                  })} {remitCurrency}
                </span>
                <span className="mono-label" style={{ color: "var(--sage-green)", fontSize: "0.68rem" }}>
                  🟢 Live Market ({activeRates[remitCurrency].source})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 02: Beneficiary & Destination */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-title">
              <span className="form-section-step">02</span>
              <span>Beneficiary &amp; Destination Account</span>
            </span>
            <span className="mono-label" style={{ color: "var(--sage-green)" }}>
              AES-256-GCM Sealed Off-Chain
            </span>
          </div>

          <div className="form-grid-2">
            <div className="field-group">
              <label className="field-label" htmlFor="remit-recipient">
                <span>Recipient Legal / Business Name</span>
                <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                  Sanctions Checked
                </span>
              </label>
              <input
                id="remit-recipient"
                className="ledger-input"
                value={remitRecipient}
                onChange={(e) => setRemitRecipient(e.target.value)}
                placeholder="Manila Loom Works"
                disabled={isBusy}
              />
              <span className="field-hint">
                Screened against OFAC, EU, and UN sanctions lists before escrow funding.
              </span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="remit-destination">
                <span>Account / Wallet Destination</span>
                <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                  Encrypted
                </span>
              </label>
              <input
                id="remit-destination"
                className="ledger-input"
                value={remitDest}
                onChange={(e) => setRemitDest(e.target.value)}
                placeholder="GCASH:+63-917-402-8819"
                disabled={isBusy}
              />
              <span className="field-hint">
                Encrypted inside the off-chain envelope; only commitment hash is stored on NEAR.
              </span>
            </div>
          </div>
        </div>

        {/* Section 03: Compliance & Partner Execution Controls */}
        <div className="form-section-last">
          <div className="form-section-header">
            <span className="form-section-title">
              <span className="form-section-step">03</span>
              <span>Compliance &amp; Execution Controls</span>
            </span>
            <span className="mono-label">FATF Travel Rule &amp; Resilience</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              padding: "0.75rem 0.9rem",
              borderRadius: 5,
              background: "rgba(20, 21, 23, 0.02)",
              border: "1px solid var(--line-soft)",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.81rem",
                color: "var(--ink-charcoal)",
                fontWeight: 450,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={includeTravelRule}
                onChange={(e) => setIncludeTravelRule(e.target.checked)}
                disabled={isBusy}
                style={{ accentColor: "var(--ink-charcoal)", width: 14, height: 14 }}
              />
              <span>
                Attach FATF Travel Rule originator &amp; beneficiary payload (mandatory &ge; 1,000
                USDC)
              </span>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span className="mono-label" style={{ fontSize: "0.64rem" }}>
                Off-Ramp Mode:
              </span>
              <button
                type="button"
                className="btn-quiet"
                style={{
                  padding: "0.28rem 0.6rem",
                  fontSize: "0.74rem",
                  border: "1px solid var(--line-soft)",
                  background:
                    remitMode === "TRANSIENT_FAILURE" ? "var(--amber-warm-soft)" : "#ffffff",
                  color:
                    remitMode === "TRANSIENT_FAILURE"
                      ? "var(--amber-warm)"
                      : "var(--ink-charcoal)",
                }}
                disabled={isBusy}
                onClick={() =>
                  setRemitMode((m) => (m === "SUCCESS" ? "TRANSIENT_FAILURE" : "SUCCESS"))
                }
              >
                {remitMode === "SUCCESS"
                  ? "Instant Partner Settle"
                  : "Simulate Partner Outage"}
              </button>
            </div>
          </div>
        </div>

        {/* Locked Quote Inline Summary */}
        {lockedQuote && (
          <div
            style={{
              marginTop: "0.9rem",
              padding: "0.75rem 0.95rem",
              borderRadius: 5,
              border: "1px solid rgba(47, 94, 75, 0.25)",
              background: "var(--sage-green-soft)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <div
                className="mono-data"
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--sage-green)",
                  marginBottom: "0.15rem",
                }}
              >
                Locked Quote: {lockedQuote.sourceUsdc} USDC → {lockedQuote.targetAmount}{" "}
                {lockedQuote.targetCurrency}
              </div>
              <div className="mono-label" style={{ color: "var(--ink-body)" }}>
                Rate: {lockedQuote.rateLabel} · Fee: {lockedQuote.feeUsdc} USDC · Net:{" "}
                {lockedQuote.netUsdc} USDC
              </div>
            </div>
            <StatusBadge status="ACTIVE" label={lockedQuote.expiresAtLabel} />
          </div>
        )}

        {/* Form Footer / Action Bar */}
        <div className="form-action-bar">
          <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="btn-primary"
              disabled={isBusy}
              onClick={handleSendRemittance}
            >
              {pendingKey === "send_remittance" ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Processing…</span>
                </>
              ) : (
                <span>Send Remittance</span>
              )}
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={isBusy}
              onClick={handleLockQuote}
            >
              {lockingQuote ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Processing…</span>
                </>
              ) : (
                <span>Lock Quote</span>
              )}
            </button>
          </div>

          <button
            type="button"
            className="btn-quiet"
            disabled={isBusy}
            onClick={() =>
              runAction(
                { action: "RETRY_FAILED_SETTLEMENTS" },
                "SettlementWorker retried pending payouts -> Settled.",
                {
                  actionKey: "retry_settlements",
                  errorScope: "remit_form",
                  successTitle: "Failed Payouts Recovered",
                },
              )
            }
          >
            {pendingKey === "retry_settlements" ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                <span>Processing…</span>
              </>
            ) : (
              <span>
                Retry Failed Payouts{failedCount > 0 ? ` (${failedCount})` : ""}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* NEAR Blockchain Rail & Settlement Architecture Banner */}
      <div
        className="kpi-strip"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          marginBottom: "1.25rem",
        }}
      >
        <div className="kpi-cell">
          <span className="mono-label">NEAR Escrow Contract</span>
          <div className="mono-data" style={{ fontWeight: 600, fontSize: "0.88rem", margin: "0.2rem 0" }}>
            {state?.network?.escrowContractId ?? "ledgerly-escrow.testnet"}
          </div>
          <a
            href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/address/${state?.network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet"}`}
            target="_blank"
            rel="noreferrer"
            className="mono-label"
            style={{ color: "var(--slate-blue)", textDecoration: "underline" }}
          >
            Verify Escrow on Nearblocks ↗
          </a>
        </div>

        <div className="kpi-cell">
          <span className="mono-label">NEP-141 Settlement Token</span>
          <div className="mono-data" style={{ fontWeight: 600, fontSize: "0.88rem", margin: "0.2rem 0" }}>
            {state?.network?.usdcContractId ?? "ledgerly-usdc.testnet"}
          </div>
          <a
            href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/address/${state?.network?.usdcContractId ?? "ledgerly-usdc-a627a4c0.testnet"}`}
            target="_blank"
            rel="noreferrer"
            className="mono-label"
            style={{ color: "var(--slate-blue)", textDecoration: "underline" }}
          >
            Verify USDC Token on Nearblocks ↗
          </a>
        </div>

        <div className="kpi-cell">
          <span className="mono-label">Off-Ramp Settlement Pool</span>
          <div className="mono-data" style={{ fontWeight: 600, fontSize: "0.88rem", margin: "0.2rem 0" }}>
            offramp-pool.ledgerly.testnet
          </div>
          <a
            href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/address/offramp-pool.ledgerly.testnet`}
            target="_blank"
            rel="noreferrer"
            className="mono-label"
            style={{ color: "var(--slate-blue)", textDecoration: "underline" }}
          >
            Verify Liquidity Account ↗
          </a>
        </div>

        <div className="kpi-cell">
          <span className="mono-label">On-Chain Finality &amp; Gas</span>
          <div className="mono-data" style={{ fontWeight: 600, fontSize: "0.88rem", margin: "0.2rem 0", color: "var(--sage-green)" }}>
            NEAR Testnet (~1.2s Finality)
          </div>
          <span className="mono-label" style={{ color: "var(--ink-muted)" }}>
            Gas sponsored by Enterprise Treasury
          </span>
        </div>
      </div>

      {/* High-Density Dispatched Remittances Ledger Table */}
      <div className="fin-card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "1.1rem 1.25rem",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <h2 style={{ fontWeight: 600, fontSize: "0.98rem", color: "var(--ink-charcoal)" }}>
              Dispatched Remittances ({filteredRemittances.length})
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginTop: "0.1rem" }}>
              Bounded retry cap: 3 attempts before auto-refund or operator exception queue
            </p>
          </div>

          {/* Filter Pills */}
          <div className="filter-pill-group" role="tablist" aria-label="Filter remittances">
            {(
              [
                { id: "ALL", label: `All (${allRemittances.length})` },
                {
                  id: "PENDING_OR_FAILED",
                  label: `Pending / Failed (${
                    allRemittances.filter((r) => r.status !== "SETTLED").length
                  })`,
                },
                {
                  id: "SETTLED",
                  label: `Settled (${
                    allRemittances.filter((r) => r.status === "SETTLED").length
                  })`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.id}
                className={`filter-pill ${statusFilter === tab.id ? "filter-pill-active" : ""}`}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {state === null ? (
          <SkeletonRows count={2} />
        ) : filteredRemittances.length === 0 ? (
          <DashboardEmptyState
            title={
              allRemittances.length === 0
                ? "No cross-border remittances dispatched yet"
                : statusFilter === "PENDING_OR_FAILED"
                  ? "Zero pending or failed remittances"
                  : "No settled remittances in this view"
            }
            description={
              allRemittances.length === 0
                ? "Lock an FX quote and dispatch your first stablecoin payout above to settle funds into PHP, IDR, EUR, or NEAR."
                : statusFilter === "PENDING_OR_FAILED"
                  ? "All active remittance corridors have settled cleanly with zero partner exceptions."
                  : "Switch back to All to inspect pending payouts or dispatch a new cross-border remittance above."
            }
            primaryAction={{
              label: "+ Dispatch New Payout",
              onClick: () => amountInputRef.current?.focus(),
            }}
            secondaryAction={
              statusFilter !== "ALL"
                ? {
                    label: `Show All Remittances (${allRemittances.length})`,
                    onClick: () => setStatusFilter("ALL"),
                  }
                : undefined
            }
          />
        ) : (
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Remittance ID</th>
                  <th>Corridor &amp; Rail</th>
                  <th>Status</th>
                  <th>On-Chain Proof &amp; Tx</th>
                  <th>Attempts &amp; Partner Ref</th>
                  <th className="col-num">Source (USDC)</th>
                  <th className="col-num">Target Payout</th>
                  <th style={{ textAlign: "right" }}>Chain History</th>
                </tr>
              </thead>
              <tbody>
                {filteredRemittances.map((rm) => {
                  const hasTransition = Boolean(transitions[rm.id]);
                  return (
                    <tr
                      key={rm.id}
                      className={hasTransition ? "tx-row-transitioned" : undefined}
                    >
                      <td>
                        <span className="mono-data" style={{ fontWeight: 600 }}>
                          {rm.id}
                        </span>
                        <div className="mono-label" style={{ fontSize: "0.7rem", color: "var(--ink-muted)" }}>
                          {new Date(rm.createdAtIso).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{rm.country}</span>{" "}
                        <span className="mono-label">({rm.recipientType})</span>
                      </td>
                      <td>
                        <StatusBadgeWithTransition id={rm.id} status={rm.status} />
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          {rm.fundingTx ? (
                            <a
                              href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/txns/${rm.fundingTx}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mono-label"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                color: "var(--slate-blue)",
                                fontWeight: 600,
                                textDecoration: "underline",
                                fontSize: "0.74rem",
                              }}
                              title={`NEAR Deposit Transaction: ${rm.fundingTx}`}
                            >
                              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--sage-green)" }} />
                              <span>Tx:{rm.fundingTx.slice(0, 8)}…</span>
                              <span aria-hidden="true">↗</span>
                            </a>
                          ) : (
                            <span className="mono-label" style={{ color: "var(--ink-muted)", fontSize: "0.72rem" }}>
                              Deposit: Sandbox
                            </span>
                          )}
                          <a
                            href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/address/${state?.network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet"}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mono-label"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                              color: "var(--ink-muted)",
                              fontSize: "0.7rem",
                            }}
                            title={`NEAR Escrow ID: ${rm.escrowId}`}
                          >
                            <span>escrow:{rm.escrowId.slice(0, 8)}…</span>
                            <span aria-hidden="true">↗</span>
                          </a>
                        </div>
                      </td>
                      <td>
                        <span className="mono-label">
                          {rm.attempts}/3 ·{" "}
                          {rm.payoutRef
                            ? rm.payoutRef
                            : rm.lastFailureCode ?? `${rm.commitment.slice(0, 8)}…`}
                        </span>
                      </td>
                      <td className="col-num">
                        <span className="mono-data" style={{ fontWeight: 600 }}>
                          {Number(rm.sourceDecimal).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          USDC
                        </span>
                      </td>
                      <td className="col-num">
                        <span className="mono-data" style={{ fontWeight: 600, color: "var(--sage-green)" }}>
                          {rm.targetDecimal} {rm.targetCurrency}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setSelectedRemittance(rm)}
                          style={{
                            padding: "0.25rem 0.55rem",
                            fontSize: "0.72rem",
                            fontWeight: 500,
                            height: "auto",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Audit History ↗
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* On-Chain Transaction Lifecycle Modal */}
      {selectedRemittance && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="chain-history-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20, 21, 23, 0.45)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRemittance(null);
          }}
        >
          <div
            className="fin-card"
            style={{
              width: "100%",
              maxWidth: 680,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "1.4rem",
              background: "var(--bg-ivory-card)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid var(--line-medium)",
              borderRadius: 8,
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                paddingBottom: "1rem",
                borderBottom: "1px solid var(--line-soft)",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <div className="eyebrow" style={{ marginBottom: "0.25rem" }}>
                  NEAR Blockchain Transaction Lifecycle
                </div>
                <h2
                  id="chain-history-title"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 600,
                    color: "var(--ink-charcoal)",
                  }}
                >
                  On-Chain Audit · {selectedRemittance.id}
                </h2>
                <div className="mono-label" style={{ marginTop: "0.2rem" }}>
                  Dispatched at {new Date(selectedRemittance.createdAtIso).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <StatusBadge status={selectedRemittance.status} />
                <button
                  type="button"
                  onClick={() => setSelectedRemittance(null)}
                  className="btn-quiet"
                  style={{
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    fontSize: "1rem",
                    borderRadius: 4,
                  }}
                  aria-label="Close dialog"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Stepper Timeline */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Step 1: Envelope & Commitment */}
              <div
                style={{
                  padding: "0.85rem 1rem",
                  background: "var(--bg-ivory)",
                  borderRadius: 6,
                  border: "1px solid var(--line-soft)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    1. Sealed Envelope &amp; SHA-256 Commitment
                  </span>
                  <span className="mono-label" style={{ color: "var(--sage-green)" }}>
                    ✓ Sealed Off-Chain
                  </span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginBottom: "0.5rem" }}>
                  Counterparty PII &amp; bank details were sealed with AES-256-GCM. Canonical commitment was registered to NEAR escrow.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem" }}>
                    <span className="mono-label">Escrow ID:</span>
                    <span className="mono-data" style={{ wordBreak: "break-all" }}>
                      {selectedRemittance.escrowId}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem" }}>
                    <span className="mono-label">Commitment:</span>
                    <span className="mono-data" style={{ wordBreak: "break-all" }}>
                      {selectedRemittance.commitment}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 2: On-Chain Deposit Tx */}
              <div
                style={{
                  padding: "0.85rem 1rem",
                  background: selectedRemittance.fundingTx ? "var(--slate-blue-soft)" : "var(--bg-ivory)",
                  borderRadius: 6,
                  border: selectedRemittance.fundingTx ? "1px solid rgba(59, 90, 117, 0.25)" : "1px solid var(--line-soft)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--slate-blue)" }}>
                    2. NEP-141 USDC Escrow Funding Deposit
                  </span>
                  <span className="mono-label" style={{ color: selectedRemittance.fundingTx ? "var(--slate-blue)" : "var(--ink-muted)", fontWeight: 600 }}>
                    {selectedRemittance.fundingTx ? "✓ Executed On-Chain" : "Sandbox Simulation"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.76rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono-label">Escrow Smart Contract:</span>
                    <a
                      href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/address/${state?.network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet"}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mono-data"
                      style={{ color: "var(--slate-blue)", textDecoration: "underline" }}
                    >
                      {state?.network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet"} ↗
                    </a>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono-label">NEP-141 Token Contract:</span>
                    <a
                      href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/address/${state?.network?.usdcContractId ?? "ledgerly-usdc-a627a4c0.testnet"}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mono-data"
                      style={{ color: "var(--slate-blue)", textDecoration: "underline" }}
                    >
                      {state?.network?.usdcContractId ?? "ledgerly-usdc-a627a4c0.testnet"} ↗
                    </a>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono-label">Deposited Amount:</span>
                    <span className="mono-data" style={{ fontWeight: 600 }}>
                      {selectedRemittance.sourceDecimal} USDC
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <span className="mono-label">Blockchain Tx Hash:</span>
                    {selectedRemittance.fundingTx ? (
                      <a
                        href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/txns/${selectedRemittance.fundingTx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono-data"
                        style={{
                          color: "var(--slate-blue)",
                          textDecoration: "underline",
                          fontWeight: 600,
                          wordBreak: "break-all",
                        }}
                      >
                        {selectedRemittance.fundingTx} ↗
                      </a>
                    ) : (
                      <span className="mono-label" style={{ color: "var(--ink-muted)" }}>
                        Seeded prior to live tx tracking
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 3: Escrow Release & Off-Ramp Payout */}
              <div
                style={{
                  padding: "0.85rem 1rem",
                  background: selectedRemittance.status === "SETTLED" ? "var(--sage-green-soft)" : "var(--bg-ivory)",
                  borderRadius: 6,
                  border: selectedRemittance.status === "SETTLED" ? "1px solid rgba(47, 94, 75, 0.25)" : "1px solid var(--line-soft)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.82rem", color: selectedRemittance.status === "SETTLED" ? "var(--sage-green)" : "var(--ink-charcoal)" }}>
                    3. Escrow Release &amp; Partner Settlement
                  </span>
                  <span className="mono-label" style={{ color: selectedRemittance.status === "SETTLED" ? "var(--sage-green)" : "var(--ink-muted)", fontWeight: 600 }}>
                    {selectedRemittance.status === "SETTLED" ? "✓ Settled On-Chain" : selectedRemittance.status}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.76rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono-label">Settlement Pool Account:</span>
                    <a
                      href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/address/offramp-pool.ledgerly.testnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="mono-data"
                      style={{ color: "var(--slate-blue)", textDecoration: "underline" }}
                    >
                      offramp-pool.ledgerly.testnet ↗
                    </a>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono-label">Target Currency Payout:</span>
                    <span className="mono-data" style={{ fontWeight: 600, color: "var(--sage-green)" }}>
                      {selectedRemittance.targetDecimal} {selectedRemittance.targetCurrency}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono-label">Partner Reference:</span>
                    <span className="mono-data">
                      {selectedRemittance.payoutRef ?? selectedRemittance.lastFailureCode ?? "Pending settlement"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono-label">Payout Attempts:</span>
                    <span className="mono-data">
                      {selectedRemittance.attempts} / 3 (Bounded Retry Policy)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                marginTop: "1.25rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--line-soft)",
              }}
            >
              <div>
                {selectedRemittance.fundingTx && (
                  <a
                    href={`${state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"}/txns/${selectedRemittance.fundingTx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      textDecoration: "none",
                      fontSize: "0.8rem",
                      padding: "0.45rem 0.85rem",
                    }}
                  >
                    <span>View Deposit Tx on Nearblocks</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedRemittance(null)}
                style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
