"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Globe,
  History,
  Info,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import {
  DashboardEmptyState,
  InlineErrorBanner,
  RemittanceItem,
  SkeletonRows,
  StatusBadge,
  StatusBadgeWithTransition,
  useLedgerlyDashboard,
} from "../_context";
import { HashBadge } from "../../components/HashBadge";
import { getFxBadgeInfo } from "@/shared/real-fx-adapter";

interface FixedQuotePreview {
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

const CORRIDOR_META: Record<
  SupportedCorridorCurrency,
  {
    railName: string;
    recipient: string;
    dest: string;
    country: string;
  }
> = {
  PHP: {
    railName: "GCash Manila",
    recipient: "Manila Loom Works",
    dest: "GCASH:+63-917-402-8819",
    country: "PH",
  },
  IDR: {
    railName: "Bank BCA Jakarta",
    recipient: "PT Artisan Nusantara",
    dest: "BCA:0182-9910-442",
    country: "ID",
  },
  EUR: {
    railName: "SEPA Instant Frankfurt",
    recipient: "Studio Forma GmbH",
    dest: "IBAN:DE89370400440532013000",
    country: "DE",
  },
  AUD: {
    railName: "NPP / PayID Sydney",
    recipient: "Sydney Harbourside Supplies Pty",
    dest: "BSB:082-901 ACC:99812039",
    country: "AU",
  },
  SGD: {
    railName: "FAST / PayNow Singapore",
    recipient: "Marina Straits Trading Pte Ltd",
    dest: "PAYNOW:UEN:201829012K",
    country: "SG",
  },
  KRW: {
    railName: "Open Banking Seoul",
    recipient: "Seoul Digital Hanok Co.",
    dest: "KB_BANK:98012-04-192831",
    country: "KR",
  },
  JPY: {
    railName: "Zengin System Tokyo",
    recipient: "Kyoto Artisan Crafts KK",
    dest: "MUFG:0005-1928471",
    country: "JP",
  },
  USDC: {
    railName: "Direct NEAR Account",
    recipient: "Rosa Santos",
    dest: "rosa.ledgerly.testnet",
    country: "SG",
  },
};

const CORRIDOR_LIST: SupportedCorridorCurrency[] = [
  "PHP",
  "IDR",
  "EUR",
  "AUD",
  "SGD",
  "KRW",
  "JPY",
  "USDC",
];

function formatTargetAmount(rawDecimal: string, currency: string): string {
  const clean = String(rawDecimal ?? "0").replace(/,/g, "").trim();
  const num = Number(clean);
  if (Number.isNaN(num)) return rawDecimal;
  const decimals = currency === "IDR" || currency === "KRW" ? 2 : 2;
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

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
  const corridorDropdownRef = useRef<HTMLDivElement | null>(null);

  const [remitAmount, setRemitAmount] = useState("");
  const [remitCurrency, setRemitCurrency] = useState<SupportedCorridorCurrency>("PHP");
  const [corridorMenuOpen, setCorridorMenuOpen] = useState(false);
  const [remitRecipient, setRemitRecipient] = useState("");
  const [remitDest, setRemitDest] = useState("");
  const [remitMode, setRemitMode] = useState<"SUCCESS" | "TRANSIENT_FAILURE">("SUCCESS");
  const [includeTravelRule, setIncludeTravelRule] = useState(true);
  const [fixedQuote, setFixedQuote] = useState<FixedQuotePreview | null>(null);
  const [holdingQuote, setHoldingQuote] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RemittanceFilter>("ALL");
  const [selectedRemittance, setSelectedRemittance] = useState<RemittanceItem | null>(null);

  const allRemittances = state?.remittances ?? [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        corridorDropdownRef.current &&
        !corridorDropdownRef.current.contains(e.target as Node)
      ) {
        setCorridorMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCorridorMenuOpen(false);
        setSelectedRemittance(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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

  const formatRatePill = (curr: SupportedCorridorCurrency, compact = false) => {
    if (curr === "USDC") return "1:1 Parity";
    const info = activeRates[curr];
    const formatted =
      curr === "IDR" || curr === "KRW"
        ? Math.round(info.rate).toLocaleString("en-US")
        : info.rate.toLocaleString("en-US", {
            minimumFractionDigits: info.decimals,
            maximumFractionDigits: info.decimals,
          });
    return compact ? `${formatted} ${curr}` : `1 USDC ≈ ${formatted} ${curr}`;
  };

  const handleSelectCorridor = (curr: SupportedCorridorCurrency) => {
    setRemitCurrency(curr);
    setFixedQuote(null);
    setCorridorMenuOpen(false);
  };

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

  const handleHoldQuote = async () => {
    clearInlineError();
    const numeric = Number(remitAmount);
    if (!remitAmount.trim() || Number.isNaN(numeric) || numeric <= 0) {
      const msg = "Enter a valid positive USDC amount before holding an FX quote.";
      setInlineError({ scope: "remit_form", code: "INVALID_QUOTE_AMOUNT", message: msg });
      pushToast({ kind: "error", title: "Quote Rejected", message: msg });
      return;
    }

    if (remitCurrency !== "USDC") {
      const rateEntry = state?.fxRates?.[remitCurrency] ?? {
        source: activeRates[remitCurrency].source,
        updatedAtIso: activeRates[remitCurrency].updatedAt,
      };
      const badge = getFxBadgeInfo(rateEntry);
      if (!badge.isExecutable) {
        const msg = "Fallback exchange rate estimate is not executable. Please retry when a live forex rate is available.";
        setInlineError({ scope: "remit_form", code: "RATE_FALLBACK_NOT_EXECUTABLE", message: msg });
        pushToast({ kind: "error", title: "Quote Unavailable", message: msg });
        return;
      }
    }

    setHoldingQuote(true);
    await new Promise((resolve) => setTimeout(resolve, 360));
    const fee = Math.max(0.5, numeric * 0.005);
    const net = Math.max(0, numeric - fee);
    const corridor = activeRates[remitCurrency];
    const targetVal = (net * corridor.rate).toLocaleString("en-US", {
      minimumFractionDigits: corridor.decimals,
      maximumFractionDigits: corridor.decimals,
    });

    const preview: FixedQuotePreview = {
      sourceUsdc: numeric.toFixed(2),
      feeUsdc: fee.toFixed(2),
      netUsdc: net.toFixed(2),
      targetCurrency: remitCurrency,
      targetAmount: targetVal,
      rateLabel: `1 USDC = ${corridor.rate.toLocaleString("en-US", {
        minimumFractionDigits: corridor.decimals,
        maximumFractionDigits: corridor.decimals,
      })} ${remitCurrency}`,
      expiresAtLabel: "60m quote window (Live Market Feed)",
      sourceLabel: corridor.source,
    };

    setFixedQuote(preview);
    setHoldingQuote(false);
    pushToast({
      kind: "success",
      title: "Real-Time FX Quote Held",
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

    const country = CORRIDOR_META[remitCurrency]?.country ?? "SG";

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
      setFixedQuote(null);
    }
  };

  const isBusy = busy || holdingQuote;
  const explorerBaseUrl = state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io";
  const escrowContractId =
    state?.network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet";
  const usdcContractId =
    state?.network?.usdcContractId ?? "ledgerly-usdc-a627a4c0.testnet";

  // Live dynamic FX ticket calculation
  const liveGrossUsdc = Math.max(0, Number(remitAmount.replace(/,/g, "")) || 0);
  const liveFeeUsdc = liveGrossUsdc > 0 ? Math.max(0.5, liveGrossUsdc * 0.005) : 0;
  const liveNetUsdc = Math.max(0, liveGrossUsdc - liveFeeUsdc);
  const liveCorridor = activeRates[remitCurrency];
  const liveEstimatedPayout = (liveNetUsdc * liveCorridor.rate).toLocaleString("en-US", {
    minimumFractionDigits: liveCorridor.decimals,
    maximumFractionDigits: liveCorridor.decimals,
  });

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
          Treasury FX Desk
        </div>
        <h1
          className="text-balance"
          style={{
            fontSize: "1.75rem",
            fontWeight: 650,
            letterSpacing: "-0.03em",
            marginBottom: "0.35rem",
            color: "var(--text-primary)",
          }}
        >
          Global Remittances
        </h1>
        <p
          className="text-pretty"
          style={{
            fontSize: "0.86rem",
            color: "var(--text-muted)",
            maxWidth: 660,
            lineHeight: 1.55,
          }}
        >
          Convert USDC to local currencies and settle to bank accounts or e-wallets.
        </p>
      </div>

      {/* Asymmetric Two-Column FX Desk + Live Clearing Ticket */}
      <div className="composer-split-grid" style={{ marginBottom: "1.5rem" }}>
        {/* Left Column: Dispatch Remittance Composer */}
        <div className="fin-card">
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
              <h2 style={{ fontWeight: 600, fontSize: "1.02rem", color: "var(--text-primary)" }}>
                Dispatch Cross-Border Payout
              </h2>
              <p style={{ fontSize: "0.79rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                Fund a NEAR USDC escrow and trigger automated local currency off-ramp clearing.
              </p>
            </div>
            <StatusBadge status="OPEN" label="0.50% Fee · 60m Quote Window" />
          </div>

          <InlineErrorBanner scope="remit_form" />

          {/* Section 01: Payout Amount & Corridor */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">
                <span className="form-section-step">01</span>
                <span>Payout Amount &amp; Settlement Corridor</span>
              </span>
            </div>

            <div className="form-grid-2">
              <div className="field-group">
                <label className="field-label" htmlFor="remit-amount">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Send Amount</span>
                    <span
                      title="Transparent 0.50% fee (min 0.50 USDC) deducted prior to FX conversion."
                      style={{ color: "var(--text-muted)", display: "inline-flex", cursor: "help" }}
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </span>
                </label>
                <div className="input-affix-wrap">
                  <input
                    id="remit-amount"
                    ref={amountInputRef}
                    className="ledger-input tabular-nums"
                    value={remitAmount}
                    onChange={(e) => {
                      setRemitAmount(e.target.value);
                      setFixedQuote(null);
                    }}
                    placeholder="0.00"
                    disabled={isBusy}
                  />
                  <span className="input-affix-tag">USDC</span>
                </div>
                <span className="field-hint">
                  0.50% fee (min 0.50 USDC) deducted prior to FX conversion.
                </span>
              </div>

              <div className="field-group">
                <label className="field-label" id="remit-corridor-label">
                  <span>Payout Corridor</span>
                </label>

                <div className="corridor-dropdown-wrap" ref={corridorDropdownRef}>
                  <button
                    type="button"
                    id="remit-corridor"
                    aria-labelledby="remit-corridor-label"
                    aria-haspopup="listbox"
                    aria-expanded={corridorMenuOpen}
                    disabled={isBusy}
                    className="corridor-select-trigger"
                    onClick={() => setCorridorMenuOpen((prev) => !prev)}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="corridor-currency-badge">{remitCurrency}</span>
                      <span className="truncate" style={{ fontWeight: 550 }}>
                        {CORRIDOR_META[remitCurrency].railName}
                      </span>
                    </span>

                    <span className="inline-flex items-center gap-1.5 shrink-0">
                      <span className="corridor-rate-pill tabular-nums">
                        {formatRatePill(remitCurrency, true)}
                      </span>
                      <ChevronDown
                        className="w-4 h-4 shrink-0"
                        style={{
                          color: "var(--text-muted)",
                          transform: corridorMenuOpen ? "rotate(180deg)" : "none",
                          transition: "transform 0.15s ease",
                        }}
                        aria-hidden="true"
                      />
                    </span>
                  </button>

                  {corridorMenuOpen && (
                    <div
                      role="listbox"
                      aria-labelledby="remit-corridor-label"
                      className="corridor-select-menu"
                    >
                      {CORRIDOR_LIST.map((curr) => {
                        const selected = curr === remitCurrency;
                        return (
                          <button
                            key={curr}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`corridor-select-option ${
                              selected ? "corridor-select-option-active" : ""
                            }`}
                            onClick={() => handleSelectCorridor(curr)}
                          >
                            <span className="inline-flex items-center gap-2 min-w-0">
                              <span className="corridor-currency-badge">{curr}</span>
                              <span className="truncate">
                                USDC{" "}
                                <ArrowRight
                                  className="w-3 h-3 inline shrink-0"
                                  aria-hidden="true"
                                />{" "}
                                {curr} · {CORRIDOR_META[curr].railName}
                              </span>
                            </span>

                            <span className="inline-flex items-center gap-1.5 shrink-0">
                              <span className="corridor-rate-pill tabular-nums">
                                {formatRatePill(curr)}
                              </span>
                              {selected && (
                                <Check
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{ color: "var(--status-settled-fg)" }}
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {(() => {
                  const rateEntry = state?.fxRates?.[remitCurrency] ?? {
                    source: activeRates[remitCurrency].source,
                    updatedAtIso: activeRates[remitCurrency].updatedAt,
                  };
                  const badge = getFxBadgeInfo(rateEntry);
                  return (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "0.25rem",
                        fontSize: "0.72rem",
                      }}
                    >
                      <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                        Feed: {rateEntry.source}
                      </span>
                      {badge.variant === "live" ? (
                        <span
                          className="inline-flex items-center gap-1.5"
                          style={{ color: "var(--status-settled-fg)", fontSize: "0.72rem", fontWeight: 600 }}
                        >
                          <span className="status-pill-dot status-pill-dot-pulse" aria-hidden="true" />
                          <span>{badge.label}</span>
                        </span>
                      ) : badge.variant === "stale" ? (
                        <span
                          className="inline-flex items-center gap-1.5"
                          style={{ color: "#f59e0b", fontSize: "0.72rem", fontWeight: 600 }}
                        >
                          <span>{badge.label}</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5"
                          style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 600 }}
                        >
                          <span>Fallback estimate (not executable)</span>
                        </span>
                      )}
                    </div>
                  );
                })()}
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
            </div>

            <div className="form-grid-2">
              <div className="field-group">
                <label className="field-label" htmlFor="remit-recipient">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Recipient Legal / Business Name</span>
                    <span
                      title="Screened against OFAC, EU, and UN sanctions lists before escrow funding."
                      style={{ color: "var(--text-muted)", display: "inline-flex", cursor: "help" }}
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </span>
                </label>
                <input
                  id="remit-recipient"
                  className="ledger-input"
                  value={remitRecipient}
                  onChange={(e) => setRemitRecipient(e.target.value)}
                  placeholder="e.g. Recipient Legal Name"
                  disabled={isBusy}
                />
                <span className="field-hint">
                  Screened against OFAC, EU, and UN sanctions lists.
                </span>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="remit-destination">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Account / Wallet Destination</span>
                    <span
                      title="Encrypted off-chain; only the commitment hash is stored on NEAR."
                      style={{ color: "var(--text-muted)", display: "inline-flex", cursor: "help" }}
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </span>
                </label>
                <input
                  id="remit-destination"
                  className="ledger-input tabular-nums"
                  value={remitDest}
                  onChange={(e) => setRemitDest(e.target.value)}
                  placeholder="e.g. Account Number or E-Wallet ID"
                  disabled={isBusy}
                />
                <span className="field-hint">
                  Private by default: encrypted off-chain with AES-256-GCM.
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
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
                padding: "0.75rem 0.9rem",
                borderRadius: 10,
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.8rem",
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={includeTravelRule}
                  onChange={(e) => setIncludeTravelRule(e.target.checked)}
                  disabled={isBusy}
                  style={{ accentColor: "var(--accent-primary)", width: 14, height: 14 }}
                />
                <span>
                  Attach FATF Travel Rule payload (mandatory &ge; 1,000 USDC)
                </span>
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span className="mono-label">Off-Ramp:</span>
                <button
                  type="button"
                  className="btn-quiet"
                  style={{
                    padding: "0.28rem 0.62rem",
                    fontSize: "0.74rem",
                    border: "1px solid var(--border-default)",
                    background:
                      remitMode === "TRANSIENT_FAILURE"
                        ? "var(--status-pending-bg)"
                        : "var(--surface-1)",
                    color:
                      remitMode === "TRANSIENT_FAILURE"
                        ? "var(--status-pending-fg)"
                        : "var(--text-primary)",
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

          {/* Form Footer / Action Bar */}
          <div className="form-action-bar">
            <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
                disabled={isBusy}
                onClick={handleSendRemittance}
              >
                {pendingKey === "send_remittance" ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Send Remittance</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
                disabled={isBusy}
                onClick={handleHoldQuote}
              >
                {holdingQuote ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    <span>Holding…</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Hold Quote</span>
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              className="btn-quiet inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums"
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
                <>
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Retry Failed Payouts{failedCount > 0 ? ` (${failedCount})` : ""}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Live Treasury FX Clearing Ticket */}
        <aside className="ticket-preview-card" aria-label="Live FX Quote Breakdown">
          <div className="ticket-header-band">
            <span className="inline-flex items-center gap-2">
              <Globe
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--status-settled-fg)" }}
                aria-hidden="true"
              />
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                {fixedQuote ? "Held FX Clearing Ticket" : "Live FX Clearing Estimate"}
              </span>
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                padding: "0.14rem 0.48rem",
                borderRadius: 6,
                background: fixedQuote ? "var(--status-settled-bg)" : "var(--surface-3)",
                color: fixedQuote ? "var(--status-settled-fg)" : "var(--text-secondary)",
              }}
            >
              {CORRIDOR_META[remitCurrency].country} · {remitCurrency}
            </span>
          </div>

          <div style={{ padding: "1.25rem" }}>
            <div style={{ marginBottom: "0.25rem" }} className="mono-label">
              Estimated Recipient Payout
            </div>
            <div
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "1.6rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--status-settled-fg)",
                lineHeight: 1.15,
              }}
            >
              {fixedQuote ? fixedQuote.targetAmount : liveEstimatedPayout}{" "}
              <span style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--text-primary)" }}>
                {remitCurrency}
              </span>
            </div>
            <div
              className="mono-data tabular-nums"
              style={{ marginTop: "0.25rem", fontSize: "0.75rem", color: "var(--text-muted)" }}
            >
              {fixedQuote
                ? fixedQuote.rateLabel
                : formatRatePill(remitCurrency).replace("≈", "=")}
            </div>

            <div className="ticket-divider-dashed" />

            {/* Fee & Conversion Breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.42rem", fontSize: "0.78rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Gross Treasury Debit</span>
                <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                  {fixedQuote ? fixedQuote.sourceUsdc : liveGrossUsdc.toFixed(2)} USDC
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Protocol Clearing Fee (0.50%)</span>
                <span className="mono-data tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  -{fixedQuote ? fixedQuote.feeUsdc : liveFeeUsdc.toFixed(2)} USDC
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: "0.35rem",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  Net Converted Principal
                </span>
                <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                  {fixedQuote ? fixedQuote.netUsdc : liveNetUsdc.toFixed(2)} USDC
                </span>
              </div>
            </div>

            <div className="ticket-divider-dashed" />

            {/* Corridor & Compliance Summary */}
            <div
              style={{
                padding: "0.75rem 0.85rem",
                borderRadius: 10,
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "0.32rem",
                fontSize: "0.75rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Local Rail</span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {CORRIDOR_META[remitCurrency].railName}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Beneficiary</span>
                <span
                  className="truncate"
                  style={{ fontWeight: 500, maxWidth: 175, color: "var(--text-primary)" }}
                >
                  {remitRecipient.trim() || "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Compliance</span>
                <span
                  className="inline-flex items-center gap-1"
                  style={{
                    color: includeTravelRule
                      ? "var(--status-settled-fg)"
                      : "var(--status-pending-fg)",
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{includeTravelRule ? "OFAC + Travel Rule" : "OFAC Only"}</span>
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* NEAR Blockchain Rail & Settlement Architecture Banner */}
      <div className="kpi-strip" style={{ marginBottom: "1.35rem" }}>
        <div className="kpi-cell" style={{ minWidth: 0, overflow: "hidden" }}>
          <span
            className="mono-label"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            NEAR Escrow Contract
          </span>
          <div style={{ margin: "0.25rem 0", maxWidth: "100%", overflow: "hidden" }}>
            <HashBadge value={escrowContractId} />
          </div>
          <a
            href={`${explorerBaseUrl}/address/${escrowContractId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mono-label"
            style={{
              color: "var(--accent-primary)",
              textDecoration: "none",
              fontWeight: 600,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span>View on Nearblocks</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>

        <div className="kpi-cell" style={{ minWidth: 0, overflow: "hidden" }}>
          <span
            className="mono-label"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            NEP-141 Settlement Token
          </span>
          <div style={{ margin: "0.25rem 0", maxWidth: "100%", overflow: "hidden" }}>
            <HashBadge value={usdcContractId} />
          </div>
          <a
            href={`${explorerBaseUrl}/address/${usdcContractId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mono-label"
            style={{
              color: "var(--accent-primary)",
              textDecoration: "none",
              fontWeight: 600,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span>View USDC on Nearblocks</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>

        <div className="kpi-cell" style={{ minWidth: 0, overflow: "hidden" }}>
          <span
            className="mono-label"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            Off-Ramp Settlement Pool
          </span>
          <div style={{ margin: "0.25rem 0", maxWidth: "100%", overflow: "hidden" }}>
            <HashBadge value="offramp-pool.ledgerly.testnet" />
          </div>
          <a
            href={`${explorerBaseUrl}/address/offramp-pool.ledgerly.testnet`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mono-label"
            style={{
              color: "var(--accent-primary)",
              textDecoration: "none",
              fontWeight: 600,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span>View Pool on Nearblocks</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>

        <div className="kpi-cell" style={{ minWidth: 0, overflow: "hidden" }}>
          <span
            className="mono-label"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            On-Chain Finality &amp; Gas
          </span>
          <div
            className="mono-data tabular-nums"
            style={{
              fontWeight: 600,
              fontSize: "0.86rem",
              margin: "0.25rem 0",
              color: "var(--status-settled-fg)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            ~1.2s Finality · Sponsored Gas
          </div>
          <span
            className="mono-label"
            style={{
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Enterprise Treasury Relayer
          </span>
        </div>
      </div>

      {/* High-Density Dispatched Remittances Ledger Table */}
      <div className="fin-card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "1.1rem 1.3rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <h2
              className="tabular-nums"
              style={{ fontWeight: 600, fontSize: "0.98rem", color: "var(--text-primary)" }}
            >
              Dispatched Remittances ({filteredRemittances.length})
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
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
                ? "Hold an FX quote and dispatch your first stablecoin payout above to settle funds into PHP, IDR, EUR, AUD, SGD, KRW, JPY, or NEAR."
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
          <div className="ledger-table-wrap overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th style={{ padding: "0.65rem 0.85rem" }}>Remittance ID</th>
                  <th style={{ padding: "0.65rem 0.75rem" }}>Corridor &amp; Rail</th>
                  <th style={{ padding: "0.65rem 0.75rem" }}>Status</th>
                  <th style={{ padding: "0.65rem 0.75rem" }}>On-Chain Proof &amp; Tx</th>
                  <th style={{ padding: "0.65rem 0.75rem" }}>Attempts &amp; Ref</th>
                  <th className="col-num" style={{ padding: "0.65rem 0.75rem" }}>
                    Source (USDC)
                  </th>
                  <th className="col-num" style={{ padding: "0.65rem 0.75rem" }}>
                    Target Payout
                  </th>
                  <th style={{ textAlign: "right", padding: "0.65rem 0.85rem" }}>
                    Chain History
                  </th>
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
                      <td style={{ padding: "0.75rem 0.85rem", whiteSpace: "nowrap" }}>
                        <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                          {rm.id}
                        </span>
                        <div
                          className="tabular-nums"
                          style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}
                        >
                          {new Date(rm.createdAtIso).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 0.75rem", whiteSpace: "nowrap" }}>
                        <span className="payload-country-badge" style={{ marginRight: "0.35rem" }}>
                          {rm.country}
                        </span>
                        <span className="mono-label">{rm.recipientType}</span>
                      </td>
                      <td style={{ padding: "0.75rem 0.75rem", whiteSpace: "nowrap" }}>
                        <StatusBadgeWithTransition id={rm.id} status={rm.status} />
                      </td>
                      <td style={{ padding: "0.75rem 0.75rem" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                            alignItems: "flex-start",
                          }}
                        >
                          {rm.fundingTx ? (
                            <HashBadge
                              label="Tx"
                              value={rm.fundingTx}
                              startChars={6}
                              endChars={4}
                              href={`${explorerBaseUrl}/txns/${rm.fundingTx}`}
                            />
                          ) : (
                            <HashBadge
                              label="Escrow"
                              value={rm.escrowId}
                              startChars={6}
                              endChars={4}
                              href={`${explorerBaseUrl}/address/${escrowContractId}`}
                            />
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 0.75rem", whiteSpace: "nowrap" }}>
                        <span className="mono-data tabular-nums" style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                          {rm.attempts}/3 ·{" "}
                          {rm.payoutRef
                            ? rm.payoutRef
                            : rm.lastFailureCode ?? `${rm.commitment.slice(0, 8)}…`}
                        </span>
                      </td>
                      <td className="col-num" style={{ padding: "0.75rem 0.75rem" }}>
                        <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                          {Number(rm.sourceDecimal).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          USDC
                        </span>
                      </td>
                      <td className="col-num" style={{ padding: "0.75rem 0.75rem" }}>
                        <span
                          className="mono-data tabular-nums"
                          style={{ fontWeight: 600, color: "var(--status-settled-fg)" }}
                        >
                          {formatTargetAmount(rm.targetDecimal, rm.targetCurrency)}{" "}
                          {rm.targetCurrency}
                        </span>
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "0.75rem 0.85rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <button
                          type="button"
                          className="btn-secondary inline-flex items-center gap-1 whitespace-nowrap"
                          onClick={() => setSelectedRemittance(rm)}
                          style={{
                            padding: "0.28rem 0.58rem",
                            fontSize: "0.72rem",
                            fontWeight: 500,
                            height: "auto",
                          }}
                        >
                          <History className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>Audit</span>
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
            background: "var(--overlay-scrim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
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
              maxHeight: "90dvh",
              overflowY: "auto",
              padding: "1.5rem",
              background: "var(--dialog-bg)",
              border: "1px solid var(--dialog-border)",
              borderRadius: "var(--panel-radius)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                paddingBottom: "1rem",
                borderBottom: "1px solid var(--border-subtle)",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <div className="eyebrow" style={{ marginBottom: "0.25rem" }}>
                  NEAR Blockchain Transaction Lifecycle
                </div>
                <h2
                  id="chain-history-title"
                  className="tabular-nums"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  On-Chain Audit · {selectedRemittance.id}
                </h2>
                <div className="mono-label tabular-nums" style={{ marginTop: "0.2rem" }}>
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
                    borderRadius: 6,
                  }}
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4 shrink-0" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Stepper Timeline */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Step 1: Off-Chain Record & Commitment */}
              <div
                style={{
                  padding: "0.85rem 1rem",
                  background: "var(--surface-2)",
                  borderRadius: 10,
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.4rem",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    1. Private Off-Chain Record &amp; SHA-256 Commitment
                  </span>
                  <span className="mono-label" style={{ color: "var(--status-settled-fg)" }}>
                    Private by default
                  </span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
                  Counterparty details stay off-chain encrypted with AES-256-GCM. Only the canonical
                  SHA-256 commitment was registered to NEAR escrow.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  <HashBadge
                    label="Escrow ID"
                    value={selectedRemittance.escrowId}
                    startChars={10}
                    endChars={8}
                  />
                  <HashBadge
                    label="Commitment"
                    value={selectedRemittance.commitment}
                    startChars={10}
                    endChars={8}
                  />
                </div>
              </div>

              {/* Step 2: On-Chain Deposit Tx */}
              <div
                style={{
                  padding: "0.85rem 1rem",
                  background: selectedRemittance.fundingTx
                    ? "var(--accent-subtle)"
                    : "var(--surface-2)",
                  borderRadius: 10,
                  border: selectedRemittance.fundingTx
                    ? "1px solid var(--accent-border)"
                    : "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.55rem",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--accent-primary)" }}>
                    2. NEP-141 USDC Escrow Funding Deposit
                  </span>
                  <span
                    className="mono-label"
                    style={{
                      color: selectedRemittance.fundingTx
                        ? "var(--accent-primary)"
                        : "var(--text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    {selectedRemittance.fundingTx ? "Executed On-Chain" : "Sandbox Simulation"}
                  </span>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: "0.45rem", fontSize: "0.76rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="mono-label">Escrow Smart Contract:</span>
                    <HashBadge
                      value={escrowContractId}
                      href={`${explorerBaseUrl}/address/${escrowContractId}`}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="mono-label">NEP-141 Token Contract:</span>
                    <HashBadge
                      value={usdcContractId}
                      href={`${explorerBaseUrl}/address/${usdcContractId}`}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span className="mono-label">Deposited Amount:</span>
                    <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                      {Number(selectedRemittance.sourceDecimal).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      USDC
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="mono-label">Blockchain Tx Hash:</span>
                    {selectedRemittance.fundingTx ? (
                      <HashBadge
                        value={selectedRemittance.fundingTx}
                        startChars={10}
                        endChars={8}
                        href={`${explorerBaseUrl}/txns/${selectedRemittance.fundingTx}`}
                      />
                    ) : (
                      <span className="mono-label" style={{ color: "var(--text-muted)" }}>
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
                  background:
                    selectedRemittance.status === "SETTLED"
                      ? "var(--status-settled-bg)"
                      : "var(--surface-2)",
                  borderRadius: 10,
                  border:
                    selectedRemittance.status === "SETTLED"
                      ? "1px solid var(--status-settled-border)"
                      : "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.55rem",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      color:
                        selectedRemittance.status === "SETTLED"
                          ? "var(--status-settled-fg)"
                          : "var(--text-primary)",
                    }}
                  >
                    3. Escrow Release &amp; Partner Settlement
                  </span>
                  <span
                    className="mono-label"
                    style={{
                      color:
                        selectedRemittance.status === "SETTLED"
                          ? "var(--status-settled-fg)"
                          : "var(--text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    {selectedRemittance.status === "SETTLED"
                      ? "Settled On-Chain"
                      : selectedRemittance.status}
                  </span>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: "0.45rem", fontSize: "0.76rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="mono-label">Settlement Pool Account:</span>
                    <HashBadge
                      value="offramp-pool.ledgerly.testnet"
                      href={`${explorerBaseUrl}/address/offramp-pool.ledgerly.testnet`}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span className="mono-label">Target Currency Payout:</span>
                    <span
                      className="mono-data tabular-nums"
                      style={{ fontWeight: 600, color: "var(--status-settled-fg)" }}
                    >
                      {formatTargetAmount(
                        selectedRemittance.targetDecimal,
                        selectedRemittance.targetCurrency,
                      )}{" "}
                      {selectedRemittance.targetCurrency}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span className="mono-label">Partner Reference:</span>
                    <span className="mono-data tabular-nums">
                      {selectedRemittance.payoutRef ??
                        selectedRemittance.lastFailureCode ??
                        "Pending settlement"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span className="mono-label">Payout Attempts:</span>
                    <span className="mono-data tabular-nums">
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
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                {selectedRemittance.fundingTx && (
                  <a
                    href={`${explorerBaseUrl}/txns/${selectedRemittance.fundingTx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary inline-flex items-center gap-1 whitespace-nowrap"
                    style={{
                      textDecoration: "none",
                      fontSize: "0.8rem",
                      padding: "0.45rem 0.85rem",
                    }}
                  >
                    <span>View Deposit Tx on Nearblocks</span>
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
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
