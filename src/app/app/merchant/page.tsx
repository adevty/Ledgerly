"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Info,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  DashboardEmptyState,
  InlineErrorBanner,
  SkeletonRows,
  StatusBadge,
  StatusBadgeWithTransition,
  useLedgerlyDashboard,
} from "../_context";
import { HashBadge } from "../../components/HashBadge";
import { CryptoTokenIcon } from "../../components/CryptoTokenIcon";
import { validatePaymentRequestInput } from "@/lib/validation";

type MerchantFilter = "ALL" | "OPEN" | "SETTLED" | "EXCEPTIONS";

export default function MerchantCheckoutPage() {
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

  const invoiceInputRef = useRef<HTMLInputElement | null>(null);

  const [orderRef, setOrderRef] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [description, setDescription] = useState("");
  const [lastCreatedRef, setLastCreatedRef] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MerchantFilter>("ALL");

  const allRequests = state?.paymentRequests ?? [];

  const filteredRequests = useMemo(() => {
    if (statusFilter === "ALL") return allRequests;
    if (statusFilter === "OPEN") {
      return allRequests.filter(
        (pr) => pr.status === "OPEN" || pr.status === "PARTIALLY_PAID",
      );
    }
    if (statusFilter === "SETTLED") {
      return allRequests.filter(
        (pr) => pr.status === "SETTLED" || pr.status === "PAID",
      );
    }
    return allRequests.filter(
      (pr) =>
        pr.status === "OVERPAID" ||
        pr.status === "EXPIRED" ||
        pr.status === "CANCELLED",
    );
  }, [allRequests, statusFilter]);

  const validation = useMemo(() => {
    return validatePaymentRequestInput({
      orderRef,
      amountDecimal: orderAmount,
      customerEmail: customerEmail.trim() ? customerEmail : undefined,
    });
  }, [orderRef, orderAmount, customerEmail]);

  const handleCreateCheckout = async () => {
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0] ?? "Please fix validation errors.";
      setInlineError({ scope: "merchant_form", code: "VALIDATION_ERROR", message: firstError });
      pushToast({ kind: "error", title: "Validation Error", message: firstError });
      return;
    }

    setLastCreatedRef(null);
    const ok = await runAction(
      {
        action: "CREATE_PAYMENT_REQUEST",
        orderRef: orderRef.trim(),
        amountDecimal: orderAmount.trim(),
        customerEmail: customerEmail.trim(),
        description: description.trim(),
      },
      `Created invoice ${orderRef.trim()} (${orderAmount.trim()} USDC) & registered escrow on NEAR.`,
      {
        actionKey: "create_checkout",
        errorScope: "merchant_form",
        successTitle: "Checkout Link Created",
      },
    );

    if (ok) {
      setLastCreatedRef(`${orderRef.trim()} · ${orderAmount.trim()} USDC`);
    }
  };

  const handleResetDefaults = () => {
    clearInlineError();
    setLastCreatedRef(null);
    setOrderRef("");
    setOrderAmount("");
    setCustomerEmail("");
    setDescription("");
  };

  const explorerBaseUrl =
    state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io";
  const escrowContractId =
    state?.network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet";

  const previewAmountNum = Number(orderAmount.replace(/,/g, ""));
  const formattedPreviewAmount =
    !Number.isNaN(previewAmountNum) && previewAmountNum > 0
      ? previewAmountNum.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "0.00";

  return (
    <div>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
            Merchant Receivables &amp; Escrow
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
            Merchant Checkout &amp; Escrow Matching
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
            Private by default: invoice details and customer contacts stay off-chain encrypted with
            AES-256-GCM while only a 32-byte escrow ID and SHA-256 commitment hash are registered on
            NEAR.
          </p>
        </div>

        <Link
          href="/checkout"
          className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <span>Open Buyer Portal</span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </Link>
      </div>

      {/* Asymmetric Two-Column Composer + Live Invoice Preview */}
      <div className="composer-split-grid" style={{ marginBottom: "1.6rem" }}>
        {/* Left Column: Payment Request Composer */}
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
                Create Payment Request
              </h2>
              <p style={{ fontSize: "0.79rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                Configure settlement terms and keep buyer invoice details off-chain while publishing
                the commitment on NEAR.
              </p>
            </div>
            <StatusBadge status="ACTIVE" label="NEP-141 USDC · 24h Escrow" />
          </div>

          <InlineErrorBanner scope="merchant_form" />

          {/* Section 01: Invoice & Settlement Terms */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">
                <span className="form-section-step">01</span>
                <span>Invoice &amp; Settlement Amount</span>
              </span>
            </div>

            <div className="form-grid-2">
              <div className="field-group">
                <label className="field-label" htmlFor="merchant-order-ref">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Invoice Reference</span>
                    <span
                      title="Internal order or ERP reference bound to the idempotency key."
                      style={{ color: "var(--text-muted)", display: "inline-flex", cursor: "help" }}
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </span>
                </label>
                <input
                  id="merchant-order-ref"
                  ref={invoiceInputRef}
                  className="ledger-input tabular-nums"
                  value={orderRef}
                  onChange={(e) => setOrderRef(e.target.value)}
                  placeholder="e.g. INV-2026-001"
                  disabled={busy}
                />
                {orderRef.trim() && validation.errors.orderRef && (
                  <span style={{ color: "var(--status-failed-fg)", fontSize: "0.72rem", display: "block", marginTop: "0.25rem" }}>
                    {validation.errors.orderRef}
                  </span>
                )}
                <span className="field-hint">
                  Bound to idempotency key for ERP reconciliation.
                </span>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="merchant-order-amount">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Expected Amount</span>
                    <span
                      title="6-decimal NEP-141 USDC. Overpayments auto-refund excess; partial payments remain held in escrow."
                      style={{ color: "var(--text-muted)", display: "inline-flex", cursor: "help" }}
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </span>
                </label>
                <div className="input-affix-wrap">
                  <input
                    id="merchant-order-amount"
                    className="ledger-input tabular-nums"
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={busy}
                  />
                  <span className="input-affix-tag">USDC</span>
                </div>
                {orderAmount.trim() && validation.errors.amount && (
                  <span style={{ color: "var(--status-failed-fg)", fontSize: "0.72rem", display: "block", marginTop: "0.25rem" }}>
                    {validation.errors.amount}
                  </span>
                )}
                <span className="field-hint">
                  Overpayments auto-refund excess; partial deposits remain held in escrow.
                </span>
              </div>
            </div>
          </div>

          {/* Section 02: Counterparty & Private Off-Chain Metadata */}
          <div className="form-section-last">
            <div className="form-section-header">
              <span className="form-section-title">
                <span className="form-section-step">02</span>
                <span>Counterparty &amp; Off-Chain Invoice Details</span>
              </span>
            </div>

            <div className="form-grid-2">
              <div className="field-group">
                <label className="field-label" htmlFor="merchant-customer-email">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Customer / Treasury Email</span>
                    <span
                      title="Encrypted off-chain with AES-256-GCM + X25519; never written to NEAR."
                      style={{ color: "var(--text-muted)", display: "inline-flex", cursor: "help" }}
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </span>
                </label>
                <input
                  id="merchant-customer-email"
                  className="ledger-input"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="treasury@client.example"
                  disabled={busy}
                />
                {customerEmail.trim() && validation.errors.customerEmail && (
                  <span style={{ color: "var(--status-failed-fg)", fontSize: "0.72rem", display: "block", marginTop: "0.25rem" }}>
                    {validation.errors.customerEmail}
                  </span>
                )}
                <span className="field-hint">
                  Private off-chain; visible only to scoped view-key holders.
                </span>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="merchant-description">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Line Item Description</span>
                    <span
                      title="Hashed into canonical JSON commitment sha256(payload || salt)."
                      style={{ color: "var(--text-muted)", display: "inline-flex", cursor: "help" }}
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </span>
                </label>
                <input
                  id="merchant-description"
                  className="ledger-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe goods or services settled"
                  disabled={busy}
                />
                <span className="field-hint">
                  Anchored to canonical SHA-256 commitment hash.
                </span>
              </div>
            </div>
          </div>

          {/* Form Footer / Action Bar */}
          <div className="form-action-bar">
            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
                disabled={busy || !validation.valid}
                onClick={handleCreateCheckout}
              >
                {pendingKey === "create_checkout" ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    <span>Registering Escrow…</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Create Checkout Link &amp; Register Escrow</span>
                  </>
                )}
              </button>

              {lastCreatedRef && !busy && (
                <span
                  className="mono-data tabular-nums inline-flex items-center gap-1"
                  style={{
                    fontSize: "0.76rem",
                    color: "var(--status-settled-fg)",
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Ready: {lastCreatedRef}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              className="btn-quiet inline-flex items-center gap-1.5 whitespace-nowrap"
              disabled={busy}
              onClick={handleResetDefaults}
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Clear Form</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Invoice & Commitment Preview */}
        <aside className="ticket-preview-card" aria-label="Live Invoice Preview">
          <div className="ticket-header-band">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--status-settled-fg)" }}
                aria-hidden="true"
              />
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Live Invoice Preview
              </span>
            </span>
            <CryptoTokenIcon symbol="USDC" size={18} />
          </div>

          <div style={{ padding: "1.25rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "0.75rem",
              }}
            >
              <span className="mono-label">Receivable Amount</span>
              <div
                className="tabular-nums"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--text-primary)",
                }}
              >
                {formattedPreviewAmount}{" "}
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  USDC
                </span>
              </div>
            </div>

            <div className="ticket-divider-dashed" />

            {/* Private Off-Chain Section */}
            <div
              style={{
                padding: "0.75rem 0.85rem",
                borderRadius: 10,
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                marginBottom: "0.7rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.45rem",
                }}
              >
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{
                    fontSize: "0.76rem",
                    color: "var(--status-settled-fg)",
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Private by default (off-chain)</span>
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.28rem", fontSize: "0.76rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Order Ref</span>
                  <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                    {orderRef.trim() || "—"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Counterparty</span>
                  <span
                    className="truncate"
                    style={{ fontWeight: 500, maxWidth: 190, color: "var(--text-primary)" }}
                  >
                    {customerEmail.trim() || "—"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Line Memo</span>
                  <span
                    className="truncate"
                    style={{ color: "var(--text-secondary)", maxWidth: 190 }}
                  >
                    {description.trim() || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Public On-Chain Section */}
            <div
              style={{
                padding: "0.75rem 0.85rem",
                borderRadius: 10,
                background: "var(--surface-canvas)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.45rem",
                }}
              >
                {state?.network?.mode === "NEAR_TESTNET_RPC" ? (
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{
                      fontSize: "0.76rem",
                      color: "var(--status-settled-fg)",
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Verified on NEAR</span>
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{
                      fontSize: "0.76rem",
                      color: "var(--status-pending-fg)",
                      fontWeight: 600,
                    }}
                  >
                    <span className="status-pill-dot" aria-hidden="true" />
                    <span>Simulated (Sandbox)</span>
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)" }}>Target Contract</span>
                  <HashBadge value={escrowContractId} startChars={8} endChars={8} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)" }}>Accepted Rails</span>
                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                    NEAR + 1Click Intents
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* High-Density Payment Requests Ledger Table */}
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
              Payment Requests ({filteredRequests.length})
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
              Simulate buyer deposits to test exact settlement, overpayment auto-refund, or partial
              escrow holds
            </p>
          </div>

          {/* Filter Pills */}
          <div className="filter-pill-group" role="tablist" aria-label="Filter payment requests">
            {(
              [
                { id: "ALL", label: `All (${allRequests.length})` },
                {
                  id: "OPEN",
                  label: `Open (${
                    allRequests.filter(
                      (p) => p.status === "OPEN" || p.status === "PARTIALLY_PAID",
                    ).length
                  })`,
                },
                {
                  id: "SETTLED",
                  label: `Settled (${
                    allRequests.filter((p) => p.status === "SETTLED" || p.status === "PAID").length
                  })`,
                },
                {
                  id: "EXCEPTIONS",
                  label: `Exceptions (${
                    allRequests.filter(
                      (p) =>
                        p.status === "OVERPAID" ||
                        p.status === "EXPIRED" ||
                        p.status === "CANCELLED",
                    ).length
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
        ) : filteredRequests.length === 0 ? (
          <DashboardEmptyState
            title={
              allRequests.length === 0
                ? "No payment requests created yet"
                : `No ${statusFilter.toLowerCase()} payment requests found`
            }
            description={
              allRequests.length === 0
                ? "Create your first invoice above to register an escrow ID and SHA-256 commitment hash on NEAR."
                : "All payment requests are currently in other lifecycle states. Switch back to view all records or create a new checkout link."
            }
            primaryAction={{
              label: "+ Create Checkout Request",
              onClick: () => invoiceInputRef.current?.focus(),
            }}
            secondaryAction={
              statusFilter !== "ALL"
                ? {
                    label: `Show All Requests (${allRequests.length})`,
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
                  <th>Request ID</th>
                  <th>Escrow &amp; Commitment</th>
                  <th>Status</th>
                  <th className="col-num">Expected</th>
                  <th className="col-num">Received</th>
                  <th className="col-num">Buyer Simulation</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((pr) => {
                  const reqAmount = Number(pr.amountDecimal);
                  const overpayAmount = (reqAmount + 25).toFixed(2);
                  const partialAmount = Math.max(1, Math.floor(reqAmount / 2)).toFixed(2);
                  const canPay = pr.status === "OPEN" || pr.status === "PARTIALLY_PAID";
                  const hasTransition = Boolean(transitions[pr.id]);

                  const exactKey = `pay_exact_${pr.id}`;
                  const overKey = `pay_over_${pr.id}`;
                  const partialKey = `pay_partial_${pr.id}`;

                  return (
                    <tr
                      key={pr.id}
                      className={hasTransition ? "tx-row-transitioned" : undefined}
                    >
                      <td>
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                            {pr.id}
                          </span>
                          <Link
                            href={`/checkout/${pr.id}`}
                            className="inline-flex items-center gap-1 whitespace-nowrap"
                            style={{
                              fontSize: "0.73rem",
                              color: "var(--accent-primary)",
                              textDecoration: "none",
                              fontWeight: 600,
                              padding: "0.15rem 0.48rem",
                              borderRadius: 6,
                              background: "var(--accent-subtle)",
                              border: "1px solid var(--accent-border)",
                            }}
                          >
                            <span>Checkout</span>
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          </Link>
                        </div>
                      </td>
                      <td>
                        <div className="inline-flex items-center gap-1.5 flex-wrap">
                          <HashBadge
                            label="Escrow"
                            value={pr.escrowId}
                            startChars={6}
                            endChars={4}
                          />
                          <HashBadge
                            label="Commit"
                            value={pr.commitment}
                            startChars={6}
                            endChars={4}
                          />
                          {pr.latestTxHash && (
                            <HashBadge
                              label="Tx"
                              value={pr.latestTxHash}
                              startChars={6}
                              endChars={4}
                              href={`${explorerBaseUrl}/txns/${pr.latestTxHash}`}
                            />
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusBadgeWithTransition id={pr.id} status={pr.status} />
                      </td>
                      <td className="col-num">
                        <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                          {Number(pr.amountDecimal).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          USDC
                        </span>
                      </td>
                      <td className="col-num">
                        <span
                          className="mono-data tabular-nums"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {Number(pr.receivedDecimal).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          USDC
                        </span>
                      </td>
                      <td className="col-num">
                        {canPay ? (
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              className="btn-primary tabular-nums"
                              style={{ padding: "0.34rem 0.68rem", fontSize: "0.75rem" }}
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  {
                                    action: "SIMULATE_BUYER_DEPOSIT",
                                    escrowId: pr.escrowId,
                                    amountDecimal: Number(pr.remainingDecimal).toFixed(2),
                                  },
                                  `Exact deposit (${Number(pr.remainingDecimal).toFixed(2)} USDC) matched & settled for ${pr.id}.`,
                                  {
                                    actionKey: exactKey,
                                    errorScope: "merchant_form",
                                    successTitle: "Payment Settled",
                                  },
                                )
                              }
                            >
                              {pendingKey === exactKey ? (
                                <>
                                  <span className="btn-spinner" aria-hidden="true" />
                                  <span>Settling…</span>
                                </>
                              ) : (
                                <span>Pay Exact ({Number(pr.remainingDecimal).toFixed(0)})</span>
                              )}
                            </button>

                            <button
                              type="button"
                              className="btn-secondary tabular-nums"
                              style={{ padding: "0.34rem 0.58rem", fontSize: "0.74rem" }}
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  {
                                    action: "SIMULATE_BUYER_DEPOSIT",
                                    escrowId: pr.escrowId,
                                    amountDecimal: overpayAmount,
                                  },
                                  `Overpayment (${overpayAmount} USDC) -> Auto-refunded 25.00 USDC excess & settled ${pr.id}.`,
                                  {
                                    actionKey: overKey,
                                    errorScope: "merchant_form",
                                    successTitle: "Overpayment Auto-Refunded & Settled",
                                  },
                                )
                              }
                            >
                              {pendingKey === overKey ? (
                                <>
                                  <span className="btn-spinner" aria-hidden="true" />
                                  <span>Wait…</span>
                                </>
                              ) : (
                                <span>+25 Overpay</span>
                              )}
                            </button>

                            {pr.status === "OPEN" && (
                              <button
                                type="button"
                                className="btn-secondary tabular-nums"
                                style={{ padding: "0.34rem 0.58rem", fontSize: "0.74rem" }}
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    {
                                      action: "SIMULATE_BUYER_DEPOSIT",
                                      escrowId: pr.escrowId,
                                      amountDecimal: partialAmount,
                                    },
                                    `Partial payment (${partialAmount} USDC) held in escrow; awaiting remaining balance.`,
                                    {
                                      actionKey: partialKey,
                                      errorScope: "merchant_form",
                                      successTitle: "Partial Payment Recorded",
                                    },
                                  )
                                }
                              >
                                {pendingKey === partialKey ? (
                                  <>
                                    <span className="btn-spinner" aria-hidden="true" />
                                    <span>Wait…</span>
                                  </>
                                ) : (
                                  <span>50% Partial</span>
                                )}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1"
                            style={{
                              fontSize: "0.78rem",
                              color: "var(--status-settled-fg)",
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Settled to Treasury</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
