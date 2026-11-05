"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AnimatedNumber,
  DashboardEmptyState,
  SkeletonRows,
  StatusBadge,
  StatusBadgeWithTransition,
  useLedgerlyDashboard,
} from "./_context";

interface UnifiedActivityItem {
  id: string;
  kind: "MERCHANT_CHECKOUT" | "REMITTANCE";
  title: string;
  escrowPreview: string;
  commitmentPreview: string;
  amountDisplay: string;
  status: string;
  createdAtIso: string;
  href: string;
}

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

  // 5. Unified Recent Activity (last 5 transactions across both flows, newest first)
  const recentActivity = useMemo<UnifiedActivityItem[]>(() => {
    const paymentItems: UnifiedActivityItem[] = (state?.paymentRequests ?? []).map((pr) => ({
      id: pr.id,
      kind: "MERCHANT_CHECKOUT",
      title: `Invoice Settlement · ${pr.id}`,
      escrowPreview: `${pr.escrowId.slice(0, 12)}…`,
      commitmentPreview: `${pr.commitment.slice(0, 12)}…`,
      amountDisplay: `${Number(pr.amountDecimal).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} USDC`,
      status: pr.status,
      createdAtIso: pr.createdAtIso,
      href: "/app/merchant",
    }));

    const remittanceItems: UnifiedActivityItem[] = (state?.remittances ?? []).map((rm) => ({
      id: rm.id,
      kind: "REMITTANCE",
      title: `${rm.country} Corridor (${rm.recipientType}) · ${rm.id}`,
      escrowPreview: `${rm.escrowId.slice(0, 12)}…`,
      commitmentPreview: `${rm.commitment.slice(0, 12)}…`,
      amountDisplay: `${Number(rm.sourceDecimal).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} USDC → ${rm.targetDecimal} ${rm.targetCurrency}`,
      status: rm.status,
      createdAtIso: rm.createdAtIso,
      href: "/app/remittance",
    }));

    return [...paymentItems, ...remittanceItems]
      .sort((a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime())
      .slice(0, 5);
  }, [state]);

  return (
    <div>
      {/* Page Header + Escrow Status Badge + Quick Actions */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
            <span className="eyebrow">Workspace Summary</span>
            <StatusBadge status="ACTIVE" label="Active · Testnet" />
          </div>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 600, letterSpacing: "-0.025em", color: "var(--ink-charcoal)" }}>
            Treasury &amp; Payment Overview
          </h1>
        </div>

        {/* Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
          <Link href="/app/merchant" className="btn-primary">
            Create Checkout
          </Link>
          <Link href="/app/remittance" className="btn-secondary">
            Send Remittance
          </Link>
        </div>
      </div>

      {/* Unified 4-Column Architectural KPI Strip */}
      <div className="kpi-strip" style={{ marginBottom: "1.5rem" }}>
        {/* Cell 1: Total Settled (USDC) */}
        <div className="kpi-cell">
          <div className="mono-label">Total Settled (USDC)</div>
          {isLoading ? (
            <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="skeleton-block" style={{ width: "68%", height: 24 }} />
              <div className="skeleton-block" style={{ width: "80%", height: 10 }} />
            </div>
          ) : (
            <>
              <div className="kpi-value">
                <AnimatedNumber value={totalSettledUsdc} decimals={2} />{" "}
                <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--ink-muted)" }}>USDC</span>
              </div>
              <div className="mono-label" style={{ color: "var(--sage-green)" }}>
                <AnimatedNumber value={settledMerchantUsdc} decimals={0} /> checkout ·{" "}
                <AnimatedNumber value={settledRemittanceUsdc} decimals={0} /> remitted
              </div>
            </>
          )}
        </div>

        {/* Cell 2: Open Payment Requests */}
        <div className="kpi-cell">
          <div className="mono-label">Open Payment Requests</div>
          {isLoading ? (
            <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="skeleton-block" style={{ width: "36%", height: 24 }} />
              <div className="skeleton-block" style={{ width: "74%", height: 10 }} />
            </div>
          ) : (
            <>
              <div className="kpi-value">
                <AnimatedNumber value={openRequests.length} decimals={0} />
              </div>
              <div className="mono-label" style={{ color: "var(--ink-body)" }}>
                <AnimatedNumber value={openRequestsVolume} decimals={2} /> USDC receivable
              </div>
            </>
          )}
        </div>

        {/* Cell 3: Pending / Failed Remittances */}
        <div className="kpi-cell">
          <div className="mono-label">Pending / Failed Remittances</div>
          {isLoading ? (
            <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="skeleton-block" style={{ width: "36%", height: 24 }} />
              <div className="skeleton-block" style={{ width: "78%", height: 10 }} />
            </div>
          ) : (
            <>
              <div className="kpi-value">
                <AnimatedNumber value={pendingOrFailedRemittances.length} decimals={0} />
              </div>
              <div
                className="mono-label"
                style={{
                  color: failedRemittancesCount > 0 ? "var(--amber-warm)" : "var(--slate-blue)",
                }}
              >
                {failedRemittancesCount > 0
                  ? `${failedRemittancesCount} require retry`
                  : "Corridors nominal"}
              </div>
            </>
          )}
        </div>

        {/* Cell 4: Exception Queue count */}
        <div className="kpi-cell">
          <div className="mono-label">Exception Queue</div>
          {isLoading ? (
            <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="skeleton-block" style={{ width: "32%", height: 24 }} />
              <div className="skeleton-block" style={{ width: "76%", height: 10 }} />
            </div>
          ) : (
            <>
              <div className="kpi-value">
                <AnimatedNumber value={exceptionCount} decimals={0} />
              </div>
              <div
                className="mono-label"
                style={{
                  color: exceptionCount === 0 ? "var(--sage-green)" : "var(--amber-warm)",
                }}
              >
                {exceptionCount === 0 ? "Ledger balanced" : "Review in Auditor"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* High-Density Recent Activity Ledger Table */}
      <div className="fin-card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "1.1rem 1.25rem",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "0.98rem", fontWeight: 600 }}>Recent Activity</h2>
            <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginTop: "0.1rem" }}>
              Last 5 ledger events across merchant checkouts and cross-border remittances
            </p>
          </div>

          <Link
            href="/app/auditor"
            style={{
              fontSize: "0.79rem",
              color: "var(--ink-charcoal)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Verify in Auditor View →
          </Link>
        </div>

        {isLoading ? (
          <SkeletonRows count={3} />
        ) : recentActivity.length === 0 ? (
          <DashboardEmptyState
            title="No treasury activity recorded yet"
            description="Create a confidential merchant checkout link or dispatch a cross-border remittance to begin settling funds on NEAR."
            primaryAction={{
              label: "Create Checkout",
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
                          className="mono-label"
                          style={{
                            fontSize: "0.63rem",
                            padding: "0.12rem 0.42rem",
                            borderRadius: 3,
                            background:
                              item.kind === "MERCHANT_CHECKOUT"
                                ? "var(--sage-green-soft)"
                                : "var(--slate-blue-soft)",
                            color:
                              item.kind === "MERCHANT_CHECKOUT"
                                ? "var(--sage-green)"
                                : "var(--slate-blue)",
                          }}
                        >
                          {item.kind === "MERCHANT_CHECKOUT" ? "Checkout" : "Remittance"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 550, color: "var(--ink-charcoal)" }}>
                          {item.title}
                        </span>
                      </td>
                      <td>
                        <span className="mono-label">
                          {item.escrowPreview} · {item.commitmentPreview}
                        </span>
                      </td>
                      <td>
                        <StatusBadgeWithTransition id={item.id} status={item.status} />
                      </td>
                      <td className="col-num">
                        <span className="mono-data" style={{ fontWeight: 600 }}>
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
