"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DashboardEmptyState,
  InlineErrorBanner,
  SkeletonRows,
  StatusBadge,
  StatusBadgeWithTransition,
  useLedgerlyDashboard,
} from "../_context";

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

  const [orderRef, setOrderRef] = useState("INV-2026-8849");
  const [orderAmount, setOrderAmount] = useState("680.00");
  const [customerEmail, setCustomerEmail] = useState("treasury@studio-forma.ch");
  const [description, setDescription] = useState("Handcrafted architectural lighting batch");
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

  const handleCreateCheckout = async () => {
    if (!orderRef.trim()) {
      const msg = "Invoice reference is required to generate an escrow commitment.";
      setInlineError({ scope: "merchant_form", code: "MISSING_INVOICE_REF", message: msg });
      pushToast({ kind: "error", title: "Validation Error", message: msg });
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
      `Sealed invoice ${orderRef.trim()} (${orderAmount.trim()} USDC) & registered escrow on NEAR.`,
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
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setOrderRef(`INV-2026-${randomSuffix}`);
    setOrderAmount("680.00");
    setCustomerEmail("treasury@studio-forma.ch");
    setDescription("Handcrafted architectural lighting batch");
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
          Merchant Payments
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
          Merchant Checkout &amp; Escrow Matching
        </h1>
        <p style={{ fontSize: "0.86rem", color: "var(--ink-muted)", maxWidth: 660, lineHeight: 1.55 }}>
          Invoice metadata and customer details are sealed off-chain with AES-256-GCM; only an
          opaque 32-byte escrow ID and SHA-256 commitment are registered on NEAR.
        </p>
      </div>

      {/* Create Confidential Payment Request Form */}
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
              Create Confidential Payment Request
            </h2>
            <p style={{ fontSize: "0.79rem", color: "var(--ink-muted)", marginTop: "0.15rem" }}>
              Configure settlement terms and seal buyer invoice metadata before publishing the
              on-chain commitment.
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
            <span className="mono-label">On-Chain Escrow Parameters</span>
          </div>

          <div className="form-grid-2">
            <div className="field-group">
              <label className="field-label" htmlFor="merchant-order-ref">
                <span>Invoice Reference</span>
                <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                  Required
                </span>
              </label>
              <input
                id="merchant-order-ref"
                ref={invoiceInputRef}
                className="ledger-input"
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
                placeholder="INV-2026-8849"
                disabled={busy}
              />
              <span className="field-hint">
                Internal order or ERP reference bound to the idempotency key.
              </span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="merchant-order-amount">
                <span>Expected Amount</span>
                <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                  6 Decimals
                </span>
              </label>
              <div className="input-affix-wrap">
                <input
                  id="merchant-order-amount"
                  className="ledger-input"
                  value={orderAmount}
                  onChange={(e) => setOrderAmount(e.target.value)}
                  placeholder="680.00"
                  disabled={busy}
                />
                <span className="input-affix-tag">USDC</span>
              </div>
              <span className="field-hint">
                Overpayments auto-refund excess; partial payments remain safely held.
              </span>
            </div>
          </div>
        </div>

        {/* Section 02: Counterparty & Confidential Envelope */}
        <div className="form-section-last">
          <div className="form-section-header">
            <span className="form-section-title">
              <span className="form-section-step">02</span>
              <span>Counterparty &amp; Sealed Envelope Metadata</span>
            </span>
            <span className="mono-label" style={{ color: "var(--sage-green)" }}>
              AES-256-GCM + X25519 Sealed Off-Chain
            </span>
          </div>

          <div className="form-grid-2">
            <div className="field-group">
              <label className="field-label" htmlFor="merchant-customer-email">
                <span>Customer / Treasury Email</span>
                <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                  Private
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
              <span className="field-hint">
                Never written to NEAR; only revealed to authorized view-key holders.
              </span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="merchant-description">
                <span>Line Item Description</span>
                <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                  Committed
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
                Hashed into canonical JSON commitment{" "}
                <code className="mono-data" style={{ fontSize: "0.7rem" }}>
                  sha256(payload || salt)
                </code>
                .
              </span>
            </div>
          </div>
        </div>

        {/* Form Footer / Action Bar */}
        <div className="form-action-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={handleCreateCheckout}
            >
              {pendingKey === "create_checkout" ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Processing…</span>
                </>
              ) : (
                <span>Create Checkout Link &amp; Register Escrow</span>
              )}
            </button>

            {lastCreatedRef && !busy && (
              <span
                className="mono-data"
                style={{
                  fontSize: "0.76rem",
                  color: "var(--sage-green)",
                  fontWeight: 500,
                }}
              >
                Ready for payment: {lastCreatedRef}
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn-quiet"
            disabled={busy}
            onClick={handleResetDefaults}
          >
            Reset Sample Fields
          </button>
        </div>
      </div>

      {/* High-Density Payment Requests Ledger Table */}
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
              Payment Requests ({filteredRequests.length})
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginTop: "0.1rem" }}>
              Simulate buyer deposits to test exact settlement, overpayment refund, or partial
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
                ? "Create your first confidential invoice above to register an opaque escrow ID and SHA-256 commitment on NEAR."
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
          <div className="ledger-table-wrap">
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
                        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                          <span className="mono-data" style={{ fontWeight: 600 }}>
                            {pr.id}
                          </span>
                          <Link
                            href={`/checkout/${pr.id}`}
                            style={{
                              fontSize: "0.74rem",
                              color: "var(--sage-green)",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            Checkout ↗
                          </Link>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                          <span className="mono-label">
                            {pr.escrowId.slice(0, 12)}… · {pr.commitment.slice(0, 12)}…
                          </span>
                          {pr.latestTxHash && (
                            <a
                              href={`${
                                state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io"
                              }/txns/${pr.latestTxHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mono-label"
                              style={{
                                color: "var(--slate-blue)",
                                textDecoration: "none",
                                fontWeight: 600,
                              }}
                              title={`NEAR Transaction: ${pr.latestTxHash}`}
                            >
                              Tx:{pr.latestTxHash.slice(0, 8)}… ↗
                            </a>
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusBadgeWithTransition id={pr.id} status={pr.status} />
                      </td>
                      <td className="col-num">
                        <span className="mono-data" style={{ fontWeight: 600 }}>
                          {Number(pr.amountDecimal).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          USDC
                        </span>
                      </td>
                      <td className="col-num">
                        <span className="mono-data" style={{ color: "var(--ink-body)" }}>
                          {Number(pr.receivedDecimal).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          USDC
                        </span>
                      </td>
                      <td className="col-num">
                        {canPay ? (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: "0.35rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: "0.35rem 0.7rem", fontSize: "0.76rem" }}
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
                                  <span>Processing…</span>
                                </>
                              ) : (
                                <span>Pay Exact ({Number(pr.remainingDecimal).toFixed(0)})</span>
                              )}
                            </button>

                            <button
                              type="button"
                              className="btn-quiet"
                              style={{ padding: "0.35rem 0.55rem", fontSize: "0.75rem" }}
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
                                  <span>Processing…</span>
                                </>
                              ) : (
                                <span>+25 Overpay</span>
                              )}
                            </button>

                            {pr.status === "OPEN" && (
                              <button
                                type="button"
                                className="btn-quiet"
                                style={{ padding: "0.35rem 0.55rem", fontSize: "0.75rem" }}
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    {
                                      action: "SIMULATE_BUYER_DEPOSIT",
                                      escrowId: pr.escrowId,
                                      amountDecimal: partialAmount,
                                    },
                                    `Partial payment (${partialAmount} USDC) held safely in escrow; awaiting remaining balance.`,
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
                                    <span>Processing…</span>
                                  </>
                                ) : (
                                  <span>50% Partial</span>
                                )}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="mono-label" style={{ color: "var(--sage-green)" }}>
                            Settled to Treasury
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
