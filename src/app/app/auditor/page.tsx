"use client";

import React, { useMemo, useState } from "react";
import {
  DashboardEmptyState,
  InlineErrorBanner,
  SkeletonRows,
  StatusBadge,
  useLedgerlyDashboard,
} from "../_context";

type AuditRecordFilter = "ALL" | "PAYMENT" | "REMITTANCE" | "UNVERIFIED";
type AuditSortOrder = "NEWEST" | "OLDEST" | "RECORD_ID" | "UNVERIFIED";

export default function AuditorVerificationPage() {
  const { state, busy, pendingKey, runAction, downloadCsv } = useLedgerlyDashboard();
  const [recordFilter, setRecordFilter] = useState<AuditRecordFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<AuditSortOrder>("NEWEST");

  const allRecords = state?.audit.records ?? [];

  const filteredRecords = useMemo(() => {
    let list = allRecords;

    // 1. Filter by category
    if (recordFilter === "PAYMENT") {
      list = list.filter((r) => r.kind === "PAYMENT");
    } else if (recordFilter === "REMITTANCE") {
      list = list.filter((r) => r.kind === "REMITTANCE");
    } else if (recordFilter === "UNVERIFIED") {
      list = list.filter((r) => !r.verifiedOnchain);
    }

    // 2. Filter by search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        if (r.recordId.toLowerCase().includes(q)) return true;
        if (r.escrowId.toLowerCase().includes(q)) return true;
        if (r.commitment.toLowerCase().includes(q)) return true;
        const payloadStr = JSON.stringify(r.decryptedPayload).toLowerCase();
        return payloadStr.includes(q);
      });
    }

    // 3. Sort records (default: NEWEST first)
    return [...list].sort((a, b) => {
      const timeA = new Date(a.createdAtIso).getTime();
      const timeB = new Date(b.createdAtIso).getTime();

      if (sortOrder === "NEWEST") {
        return timeB - timeA;
      }
      if (sortOrder === "OLDEST") {
        return timeA - timeB;
      }
      if (sortOrder === "RECORD_ID") {
        return a.recordId.localeCompare(b.recordId);
      }
      if (sortOrder === "UNVERIFIED") {
        if (!a.verifiedOnchain && b.verifiedOnchain) return -1;
        if (a.verifiedOnchain && !b.verifiedOnchain) return 1;
        return timeB - timeA;
      }
      return 0;
    });
  }, [allRecords, recordFilter, searchQuery, sortOrder]);

  const handleRotateKey = () =>
    runAction(
      { action: "REFRESH_AUDIT_GRANT" },
      "Rotated scoped X25519 auditor view key & anchored audit log root on NEAR.",
      {
        actionKey: "rotate_view_key",
        errorScope: "auditor_page",
        successTitle: "Scoped View Key Rotated",
      },
    );

  const handleAutoReconcile = () =>
    runAction(
      { action: "AUTO_RECONCILE_DISCREPANCIES" },
      "Executed on-chain settlement releases and refunds on NEAR Testnet. All escrows balanced.",
      {
        actionKey: "auto_reconcile",
        errorScope: "auditor_page",
        successTitle: "Escrows Reconciled On-Chain",
      },
    );

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
            Selective Disclosure &amp; Reconciliation
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
            Auditor Verification &amp; Accounting Export
          </h1>
          <p style={{ fontSize: "0.86rem", color: "var(--ink-muted)", maxWidth: 660, lineHeight: 1.55 }}>
            Scoped, time-bound X25519 view keys let external auditors decrypt authorized records
            locally and verify every canonical payload hash against the immutable commitment stored
            in <code className="mono-data">ledgerly-escrow</code>.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={handleRotateKey}
          >
            {pendingKey === "rotate_view_key" ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                <span>Processing…</span>
              </>
            ) : (
              <span>Rotate Scoped View Key</span>
            )}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={downloadCsv}
          >
            Export Reconciliation CSV ({state?.ledger.entriesCount ?? 0} legs)
          </button>
        </div>
      </div>

      <InlineErrorBanner scope="auditor_page" />

      {/* Unified 2-Column Architectural Telemetry Strip */}
      <div
        className="kpi-strip"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          marginBottom: "1.5rem",
        }}
      >
        <div className="kpi-cell">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span className="mono-label">Active Scoped View Key Grant</span>
            <StatusBadge status="ACTIVE" label="Active Grant" />
          </div>
          <div className="mono-data" style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0.2rem 0" }}>
            {state?.audit.grantId ?? "—"}
          </div>
          <div className="mono-label">
            Auditor X25519 Key: {state?.audit.auditorKeyShort ?? "—"} · Scope: PAYMENT + REMITTANCE
          </div>
        </div>

        <div className="kpi-cell">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span className="mono-label">Tamper-Evident Audit Hash Chain</span>
            <StatusBadge
              status={state?.audit.chainValid ? "VERIFIED" : "PENDING"}
              label={state?.audit.chainValid ? "Hash Chain Intact" : "Verifying"}
            />
          </div>
          <div className="mono-data" style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0.2rem 0" }}>
            {state?.audit.anchoredRootsCount ?? 0} Anchored Roots on NEAR
          </div>
          <div className="mono-label" style={{ wordBreak: "break-all" }}>
            Latest Root: {state?.audit.latestAnchoredRoot ?? "—"}
            {state?.network && (
              <span style={{ marginLeft: "0.5rem" }}>
                ·{" "}
                <a
                  href={`${state.network.explorerBaseUrl}/address/${state.network.escrowContractId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "underline", color: "var(--slate-blue)" }}
                >
                  Verify on Nearblocks ↗
                </a>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* High-Density Decrypted Records Ledger Table */}
      <div className="fin-card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
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
              Decrypted Records in Scope ({filteredRecords.length})
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginTop: "0.1rem" }}>
              Verified locally via canonical JSON commitment{" "}
              <code className="mono-data" style={{ fontSize: "0.72rem" }}>
                sha256(canonicalJSON(payload) || salt)
              </code>
            </p>
          </div>

          {/* Filter Pills */}
          <div className="filter-pill-group" role="tablist" aria-label="Filter auditor records">
            {(
              [
                { id: "ALL", label: `All (${allRecords.length})` },
                {
                  id: "PAYMENT",
                  label: `Payments (${allRecords.filter((r) => r.kind === "PAYMENT").length})`,
                },
                {
                  id: "REMITTANCE",
                  label: `Remittances (${allRecords.filter((r) => r.kind === "REMITTANCE").length})`,
                },
                {
                  id: "UNVERIFIED",
                  label: `Unverified (${allRecords.filter((r) => !r.verifiedOnchain).length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={recordFilter === tab.id}
                className={`filter-pill ${recordFilter === tab.id ? "filter-pill-active" : ""}`}
                onClick={() => setRecordFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Sort Secondary Toolbar */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            background: "var(--bg-ivory-subtle)",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* Search Input */}
          <div
            style={{
              position: "relative",
              flex: "1 1 260px",
              maxWidth: 440,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "0.65rem",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "0.82rem",
                color: "var(--ink-muted)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            >
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, email, memo, order ref, or counterparty…"
              style={{
                width: "100%",
                paddingLeft: "2rem",
                paddingRight: searchQuery ? "2rem" : "0.75rem",
                fontSize: "0.8rem",
                height: 32,
                borderRadius: 4,
                border: "1px solid var(--line-medium)",
                background: "var(--bg-ivory-card)",
                color: "var(--ink-charcoal)",
                outline: "none",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "0.45rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ink-muted)",
                  fontSize: "0.8rem",
                  padding: "0.2rem",
                }}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
            <span className="mono-label" style={{ fontSize: "0.72rem" }}>
              Sort:
            </span>
            <div className="filter-pill-group" role="group" aria-label="Sort auditor records">
              {(
                [
                  { id: "NEWEST", label: "Newest First ↓" },
                  { id: "OLDEST", label: "Oldest First ↑" },
                  { id: "RECORD_ID", label: "ID (A-Z)" },
                  { id: "UNVERIFIED", label: "Status" },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`filter-pill ${sortOrder === s.id ? "filter-pill-active" : ""}`}
                  style={{ fontSize: "0.72rem", height: 26, padding: "0 0.55rem" }}
                  onClick={() => setSortOrder(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {searchQuery && (
              <span className="mono-label" style={{ fontSize: "0.72rem", color: "var(--sage-green)" }}>
                Matched {filteredRecords.length}
              </span>
            )}
          </div>
        </div>

        {state === null ? (
          <SkeletonRows count={2} />
        ) : filteredRecords.length === 0 ? (
          <DashboardEmptyState
            title={
              allRecords.length === 0
                ? "No decrypted auditor records in scope"
                : searchQuery
                  ? `No records matching "${searchQuery}"`
                  : recordFilter === "UNVERIFIED"
                    ? "Zero unverified records"
                    : `No ${recordFilter.toLowerCase()} records in current view`
            }
            description={
              allRecords.length === 0
                ? "Issue or rotate a scoped X25519 view key grant to decrypt authorized payment and remittance envelopes for external verification."
                : searchQuery
                  ? "Try searching with another keyword or clear the search field to view all scope records."
                  : recordFilter === "UNVERIFIED"
                    ? "Every decrypted record in this grant matches its immutable SHA-256 commitment stored on the NEAR escrow contract."
                    : "Switch back to All to inspect all decrypted envelopes in the active auditor grant."
            }
            primaryAction={
              allRecords.length === 0
                ? {
                    label: "Rotate Scoped View Key",
                    onClick: () => {
                      void handleRotateKey();
                    },
                  }
                : searchQuery
                  ? {
                      label: "Clear Search Query",
                      onClick: () => setSearchQuery(""),
                    }
                  : {
                      label: `Show All Records (${allRecords.length})`,
                      onClick: () => setRecordFilter("ALL"),
                    }
            }
            secondaryAction={
              allRecords.length > 0 && !searchQuery
                ? {
                    label: "Rotate Scoped View Key",
                    onClick: () => {
                      void handleRotateKey();
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Record ID &amp; Timestamp</th>
                  <th>Decrypted Envelope Payload</th>
                  <th>Escrow &amp; Commitment</th>
                  <th className="col-num">Verification</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => (
                  <tr key={rec.recordId}>
                    <td>
                      <span
                        className="mono-label"
                        style={{
                          fontSize: "0.63rem",
                          padding: "0.12rem 0.42rem",
                          borderRadius: 3,
                          background:
                            rec.kind === "PAYMENT"
                              ? "var(--sage-green-soft)"
                              : "var(--slate-blue-soft)",
                          color:
                            rec.kind === "PAYMENT" ? "var(--sage-green)" : "var(--slate-blue)",
                        }}
                      >
                        {rec.kind}
                      </span>
                    </td>
                    <td>
                      <span className="mono-data" style={{ fontWeight: 600 }}>
                        {rec.recordId}
                      </span>
                      <div className="mono-label" style={{ fontSize: "0.68rem", color: "var(--ink-muted)", marginTop: "0.15rem" }}>
                        {new Date(rec.createdAtIso).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                    <td style={{ maxWidth: 420 }}>
                      <div
                        className="mono-data"
                        style={{
                          fontSize: "0.73rem",
                          padding: "0.35rem 0.55rem",
                          borderRadius: 4,
                          background: "rgba(20, 21, 23, 0.03)",
                          border: "1px solid var(--line-soft)",
                          color: "var(--ink-charcoal)",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(rec.decryptedPayload)}
                      </div>
                    </td>
                    <td>
                      <span className="mono-label">
                        {rec.escrowId.slice(0, 12)}… · {rec.commitment.slice(0, 12)}…
                      </span>
                    </td>
                    <td className="col-num">
                      <StatusBadge
                        status={rec.verifiedOnchain ? "VERIFIED" : "PENDING"}
                        label={rec.verifiedOnchain ? "Verified On-Chain" : "Pending"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chain vs. Internal Ledger Reconciliation */}
      <div className="fin-card" style={{ padding: "1.1rem 1.25rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <span style={{ fontWeight: 600, fontSize: "0.94rem" }}>
              Chain vs. Internal Ledger Reconciliation ({state?.reconciliation.checkedCount ?? 0}{" "}
              checked)
            </span>
            <div className="mono-label" style={{ marginTop: "0.2rem" }}>
              Source of Truth: NEAR Escrow Contract · Zero Discrepancies:{" "}
              {state?.reconciliation.discrepancies.length === 0 ? "Confirmed" : "Review Required"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <StatusBadge
              status={state?.reconciliation.discrepancies.length === 0 ? "SETTLED" : "PAYOUT_FAILED"}
              label={
                state?.reconciliation.discrepancies.length === 0
                  ? "Reconciled"
                  : `${state?.reconciliation.discrepancies.length ?? 0} Discrepancies`
              }
            />
            {state?.reconciliation.discrepancies && state.reconciliation.discrepancies.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={handleAutoReconcile}
                style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", height: "auto" }}
              >
                {pendingKey === "auto_reconcile" ? "Reconciling on NEAR…" : "⚡ Auto-Reconcile On-Chain Balances"}
              </button>
            )}
          </div>
        </div>

        {(state?.reconciliation.discrepancies.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.9rem" }}>
            {state?.reconciliation.discrepancies.map((d) => (
              <div
                key={d.recordId}
                style={{
                  padding: "0.65rem 0.85rem",
                  borderRadius: 4,
                  border: "1px solid rgba(133, 85, 29, 0.25)",
                  background: "var(--amber-warm-soft)",
                  color: "var(--amber-warm)",
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <span className="mono-data">
                  [{d.reason}] {d.recordId} · Expected: {d.expectedHeldMinor} · On-Chain:{" "}
                  {d.onchainHeldMinor}
                </span>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
