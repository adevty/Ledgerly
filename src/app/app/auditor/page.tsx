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

export default function AuditorVerificationPage() {
  const { state, busy, pendingKey, runAction, downloadCsv } = useLedgerlyDashboard();
  const [recordFilter, setRecordFilter] = useState<AuditRecordFilter>("ALL");

  const allRecords = state?.audit.records ?? [];

  const filteredRecords = useMemo(() => {
    if (recordFilter === "ALL") return allRecords;
    if (recordFilter === "PAYMENT") return allRecords.filter((r) => r.kind === "PAYMENT");
    if (recordFilter === "REMITTANCE") return allRecords.filter((r) => r.kind === "REMITTANCE");
    return allRecords.filter((r) => !r.verifiedOnchain);
  }, [allRecords, recordFilter]);

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

        {state === null ? (
          <SkeletonRows count={2} />
        ) : filteredRecords.length === 0 ? (
          <DashboardEmptyState
            title={
              allRecords.length === 0
                ? "No decrypted auditor records in scope"
                : recordFilter === "UNVERIFIED"
                  ? "Zero unverified records"
                  : `No ${recordFilter.toLowerCase()} records in current view`
            }
            description={
              allRecords.length === 0
                ? "Issue or rotate a scoped X25519 view key grant to decrypt authorized payment and remittance envelopes for external verification."
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
                : {
                    label: `Show All Records (${allRecords.length})`,
                    onClick: () => setRecordFilter("ALL"),
                  }
            }
            secondaryAction={
              allRecords.length > 0
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
                  <th>Record ID</th>
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

          <StatusBadge
            status={state?.reconciliation.discrepancies.length === 0 ? "SETTLED" : "PAYOUT_FAILED"}
            label={
              state?.reconciliation.discrepancies.length === 0
                ? "Reconciled"
                : `${state?.reconciliation.discrepancies.length ?? 0} Discrepancies`
            }
          />
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
