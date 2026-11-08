"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Globe,
  KeyRound,
  Plus,
  ReceiptText,
  Scale,
  Send,
  Wallet,
} from "lucide-react";
import {
  AnimatedNumber,
  DashboardEmptyState,
  SkeletonRows,
  StatusBadge,
  StatusBadgeWithTransition,
  useLedgerlyDashboard,
} from "./_context";
import { HashBadge } from "../components/HashBadge";

interface UnifiedActivityItem {
  id: string;
  kind: "MERCHANT_CHECKOUT" | "REMITTANCE";
  title: string;
  escrowId: string;
  commitment: string;
  amountDisplay: string;
  status: string;
  createdAtIso: string;
  href: string;
}

const CORRIDOR_TICKERS = [
  { code: "PHP", fallback: 63.02, decimals: 2 },
  { code: "IDR", fallback: 18080, decimals: 0 },
  { code: "EUR", fallback: 0.8905, decimals: 4 },
  { code: "AUD", fallback: 1.455, decimals: 2 },
  { code: "SGD", fallback: 1.282, decimals: 2 },
  { code: "KRW", fallback: 1356, decimals: 0 },
  { code: "JPY", fallback: 158.3, decimals: 2 },
] as const;

export default function AppOverviewPage() {
  const router = useRouter();
  const { state, transitions } = useLedgerlyDashboard();
  const isLoading = state === null;

  // 1. Total Settled (USDC) across Merchant Checkouts + Remittances
  const settledMerchantUsdc = (state?.paymentRequests ?? [])
    .filter((p) => p.status === "SETTLED" || p.status === "PAID")
    .reduce((acc, p) => acc + Number(p.amountDecimal), 0);

  const settledRemittanceUsdc = (state?.remittances ?? [])
    .filter((r) => r.status === "SETTLED")
    .reduce((acc, r) => acc + Number(r.sourceDecimal), 0);

  const totalSettledUsdc = settledMerchantUsdc + settledRemittanceUsdc;

  // 2. Open Payment Requests
  const openRequests = (state?.paymentRequests ?? []).filter(
    (p) => p.status === "OPEN" || p.status === "PARTIALLY_PAID",
  );
  const openRequestsVolume = openRequests.reduce((acc, p) => acc + Number(p.remainingDecimal), 0);

  // 3. Pending / Failed Remittances
  const pendingOrFailedRemittances = (state?.remittances ?? []).filter(
    (r) =>
      r.status === "QUOTED" ||
      r.status === "FUNDED" ||
      r.status === "PAYOUT_PENDING" ||
      r.status === "PAYOUT_FAILED" ||
      r.status === "BLOCKED",
  );
  const failedRemittancesCount = (state?.remittances ?? []).filter(
    (r) => r.status === "PAYOUT_FAILED" || r.status === "BLOCKED",
  ).length;

  // 4. Exception Queue count
  const exceptionCount = state?.reconciliation.discrepancies.length ?? 0;

  // 5. Unified Recent Activity (last 6 transactions across both flows, newest first)
  const recentActivity = useMemo<UnifiedActivityItem[]>(() => {
    const paymentItems: UnifiedActivityItem[] = (state?.paymentRequests ?? []).map((pr) => ({
      id: pr.id,
      kind: "MERCHANT_CHECKOUT",
      title: `Invoice Settlement · ${pr.id}`,
      escrowId: pr.escrowId,
      commitment: pr.commitment,
      amountDisplay: `${Number(pr.amountDecimal).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} USDC`,
      status: pr.status,
      createdAtIso: pr.createdAtIso,
      href: "/app/merchant",
    }));

    const remittanceItems: UnifiedActivityItem[] = (state?.remittances ?? []).map((rm) => {
      const numTarget = Number(String(rm.targetDecimal).replace(/,/g, ""));
      const targetFormatted = Number.isNaN(numTarget)
        ? rm.targetDecimal
        : numTarget.toLocaleString("en-US", {
            minimumFractionDigits:
              rm.targetCurrency === "IDR" || rm.targetCurrency === "KRW" ? 0 : 2,
            maximumFractionDigits: 2,
          });
      return {
        id: rm.id,
        kind: "REMITTANCE",
        title: `${rm.country} Corridor (${rm.recipientType}) · ${rm.id}`,
        escrowId: rm.escrowId,
        commitment: rm.commitment,
        amountDisplay: `${Number(rm.sourceDecimal).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USDC → ${targetFormatted} ${rm.targetCurrency}`,
        status: rm.status,
        createdAtIso: rm.createdAtIso,
        href: "/app/remittance",
      };
    });

    return [...paymentItems, ...remittanceItems]
      .sort((a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime())
      .slice(0, 6);
  }, [state]);

  return (
    <div>
      {/* Treasury Header */}
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              marginBottom: "0.35rem",
            }}
          >
            <span className="eyebrow">Treasury Workspace</span>
            <StatusBadge status="ACTIVE" label="Active · NEAR Testnet" />
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 650,
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
            }}
          >
            Treasury &amp; Settlement Overview
          </h1>
        </div>

        {/* Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
          <Link
            href="/app/merchant"
            className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Create Invoice</span>
          </Link>
          <Link
            href="/app/remittance"
            className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Send Remittance</span>
          </Link>
        </div>
      </div>

      {/* Unified 4-Column KPI Strip */}
      <div className="kpi-strip" style={{ marginBottom: "1.35rem" }}>
        {/* Cell 1: Total Settled (USDC) */}
        <div className="kpi-cell">
          <div className="inline-flex items-center justify-between" style={{ width: "100%" }}>
            <span className="mono-label">Total Settled Volume</span>
            <span className="kpi-icon-badge">
              <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </div>
          {isLoading ? (
            <div
              style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}
            >
              <div className="skeleton-placeholder" style={{ width: "68%", height: 24 }} />
              <div className="skeleton-placeholder" style={{ width: "80%", height: 10 }} />
            </div>
          ) : (
            <>
              <div className="kpi-value tabular-nums">
                <AnimatedNumber value={totalSettledUsdc} decimals={2} />{" "}
                <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-muted)" }}>
                  USDC
                </span>
              </div>
              <div className="mono-label tabular-nums" style={{ color: "var(--status-settled-fg)" }}>
                <AnimatedNumber value={settledMerchantUsdc} decimals={0} /> checkout ·{" "}
                <AnimatedNumber value={settledRemittanceUsdc} decimals={0} /> remitted
              </div>
            </>
          )}
        </div>

        {/* Cell 2: Open Payment Requests */}
        <div className="kpi-cell">
          <div className="inline-flex items-center justify-between" style={{ width: "100%" }}>
            <span className="mono-label">Open Payment Requests</span>
            <span className="kpi-icon-badge">
              <ReceiptText className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </div>
          {isLoading ? (
            <div
              style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}
            >
              <div className="skeleton-placeholder" style={{ width: "36%", height: 24 }} />
              <div className="skeleton-placeholder" style={{ width: "74%", height: 10 }} />
            </div>
          ) : (
            <>
              <div className="kpi-value tabular-nums">
                <AnimatedNumber value={openRequests.length} decimals={0} />
              </div>
              <div className="mono-label tabular-nums" style={{ color: "var(--text-secondary)" }}>
                <AnimatedNumber value={openRequestsVolume} decimals={2} /> USDC receivable
              </div>
            </>
          )}
        </div>

        {/* Cell 3: Pending / Failed Remittances */}
        <div className="kpi-cell">
          <div className="inline-flex items-center justify-between" style={{ width: "100%" }}>
            <span className="mono-label">Active / Retry Payouts</span>
            <span className="kpi-icon-badge">
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </div>
          {isLoading ? (
            <div
              style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}
            >
              <div className="skeleton-placeholder" style={{ width: "36%", height: 24 }} />
              <div className="skeleton-placeholder" style={{ width: "78%", height: 10 }} />
            </div>
          ) : (
            <>
              <div className="kpi-value tabular-nums">
                <AnimatedNumber value={pendingOrFailedRemittances.length} decimals={0} />
              </div>
              <div
                className="mono-label tabular-nums"
                style={{
                  color:
                    failedRemittancesCount > 0
                      ? "var(--status-pending-fg)"
                      : "var(--text-secondary)",
                }}
              >
                {failedRemittancesCount > 0
                  ? `${failedRemittancesCount} require retry`
                  : "All 8 corridors active"}
              </div>
            </>
          )}
        </div>

        {/* Cell 4: Exception Queue count */}
        <div className="kpi-cell">
          <div className="inline-flex items-center justify-between" style={{ width: "100%" }}>
            <span className="mono-label">Reconciliation Queue</span>
            <span className="kpi-icon-badge">
              <Scale className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </div>
          {isLoading ? (
            <div
              style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}
            >
              <div className="skeleton-placeholder" style={{ width: "32%", height: 24 }} />
              <div className="skeleton-placeholder" style={{ width: "76%", height: 10 }} />
            </div>
          ) : (
            <>
              <div className="kpi-value tabular-nums">
                <AnimatedNumber value={exceptionCount} decimals={0} />
              </div>
              <div
                className="mono-label"
                style={{
                  color:
                    exceptionCount === 0
                      ? "var(--status-settled-fg)"
                      : "var(--status-pending-fg)",
                }}
              >
                {exceptionCount === 0 ? "Balanced books" : "Review in Auditor"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2-Column Live Corridor Desk & Auditor Access Bento */}
      <div className="overview-bento-grid" style={{ marginBottom: "1.35rem" }}>
        {/* Left Card: Live FX Corridor Ticker */}
        <div
          className="fin-card"
          style={{
            padding: "1.15rem 1.3rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "0.9rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="mono-label" style={{ color: "var(--accent-primary)" }}>
                Live FX Corridor Desk (1 USDC)
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: "0.1rem" }}>
                Real-Time APAC &amp; European Clearing Rates
              </div>
            </div>
            <Link
              href="/app/remittance"
              className="inline-flex items-center gap-1 whitespace-nowrap mono-label"
              style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}
            >
              <span>Dispatch FX</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
              gap: "0.45rem",
            }}
          >
            {CORRIDOR_TICKERS.map((c) => {
              const liveRate = state?.fxRates?.[c.code]?.rate ?? c.fallback;
              const formatted =
                c.decimals === 0
                  ? Math.round(liveRate).toLocaleString("en-US")
                  : liveRate.toLocaleString("en-US", {
                      minimumFractionDigits: c.decimals,
                      maximumFractionDigits: c.decimals,
                    });
              return (
                <div
                  key={c.code}
                  style={{
                    padding: "0.48rem 0.65rem",
                    borderRadius: 8,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.14rem",
                  }}
                >
                  <span className="mono-label" style={{ fontSize: "0.7rem" }}>
                    USDC / {c.code}
                  </span>
                  <span
                    className="mono-data tabular-nums"
                    style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}
                  >
                    {formatted}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Card: Auditor Access & On-Chain Commitments */}
        <div
          className="fin-card"
          style={{
            padding: "1.15rem 1.3rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "0.85rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="mono-label" style={{ color: "var(--status-settled-fg)" }}>
                Auditor Access
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: "0.1rem" }}>
                Scoped View Keys &amp; Verified Commitments
              </div>
            </div>
            <Link
              href="/app/auditor"
              className="inline-flex items-center gap-1 whitespace-nowrap mono-label"
              style={{ color: "var(--status-settled-fg)", textDecoration: "none", fontWeight: 600 }}
            >
              <span>Auditor View</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.48rem 0.7rem",
                borderRadius: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <span className="inline-flex items-center gap-1.5 mono-label">
                <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Active Grant</span>
              </span>
              <span className="mono-data tabular-nums" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                {state?.audit.grantId ?? "—"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.48rem 0.7rem",
                borderRadius: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <span className="inline-flex items-center gap-1.5 mono-label">
                <CheckCircle2
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
                <span>Anchored Roots</span>
              </span>
              <span
                className="mono-data tabular-nums"
                style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--status-settled-fg)" }}
              >
                {state?.audit.anchoredRootsCount ?? 0} on NEAR
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* High-Density Recent Activity Ledger Table */}
      <div className="fin-card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "1.1rem 1.3rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "0.98rem", fontWeight: 600 }}>Recent Ledger Activity</h2>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
              Latest chronological settlements across merchant invoices and global remittances
            </p>
          </div>

          <Link
            href="/app/auditor"
            className="btn-secondary inline-flex items-center gap-1 whitespace-nowrap"
            style={{ padding: "0.36rem 0.72rem", fontSize: "0.76rem" }}
          >
            <span>Verify in Auditor View</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </Link>
        </div>

        {isLoading ? (
          <SkeletonRows count={3} />
        ) : recentActivity.length === 0 ? (
          <DashboardEmptyState
            title="No treasury activity recorded yet"
            description="Create a private merchant invoice link or dispatch a cross-border remittance to begin settling funds on NEAR."
            primaryAction={{
              label: "Create Invoice",
              onClick: () => router.push("/app/merchant"),
            }}
            secondaryAction={{
              label: "Send Remittance",
              onClick: () => router.push("/app/remittance"),
            }}
          />
        ) : (
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Rail</th>
                  <th>Reference</th>
                  <th>Escrow &amp; Commitment</th>
                  <th>Status</th>
                  <th className="col-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((item) => {
                  const hasTransition = Boolean(transitions[item.id]);
                  return (
                    <tr
                      key={`${item.kind}_${item.id}`}
                      className={hasTransition ? "tx-row-transitioned" : undefined}
                      style={{ cursor: "pointer" }}
                      onClick={() => router.push(item.href)}
                    >
                      <td>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            padding: "0.18rem 0.5rem",
                            borderRadius: 6,
                            background:
                              item.kind === "MERCHANT_CHECKOUT"
                                ? "var(--status-settled-bg)"
                                : "var(--accent-subtle)",
                            color:
                              item.kind === "MERCHANT_CHECKOUT"
                                ? "var(--status-settled-fg)"
                                : "var(--accent-primary)",
                          }}
                        >
                          {item.kind === "MERCHANT_CHECKOUT" ? "Invoice" : "Remittance"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 550, color: "var(--text-primary)" }}>
                          {item.title}
                        </span>
                      </td>
                      <td>
                        <div className="inline-flex items-center gap-1.5 flex-wrap">
                          <HashBadge
                            label="Escrow"
                            value={item.escrowId}
                            startChars={6}
                            endChars={4}
                          />
                          <HashBadge
                            label="Commit"
                            value={item.commitment}
                            startChars={6}
                            endChars={4}
                          />
                        </div>
                      </td>
                      <td>
                        <StatusBadgeWithTransition id={item.id} status={item.status} />
                      </td>
                      <td className="col-num">
                        <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                          {item.amountDisplay}
                        </span>
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
