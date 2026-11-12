"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CheckCircle2,
  Download,
  KeyRound,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  DashboardEmptyState,
  InlineErrorBanner,
  SkeletonRows,
  StatusBadge,
  useLedgerlyDashboard,
} from "../_context";
import { HashBadge } from "../../components/HashBadge";
import { PayloadPreviewCard } from "../../components/PayloadPreviewCard";

type AuditRecordFilter =
  | "ALL"
  | "PAYMENT"
  | "REMITTANCE"
  | "VERIFIED"
  | "MISMATCH"
  | "NOT_REGISTERED";
type AuditSortOrder = "NEWEST" | "OLDEST" | "RECORD_ID" | "UNVERIFIED";

function formatMinorUsdc(minorStr: string | number): string {
  const num = Number(minorStr);
  if (Number.isNaN(num)) return String(minorStr);
  return `${(num / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;
}

export default function AuditorVerificationPage() {
  const { state, busy, pendingKey, runAction, downloadCsv } = useLedgerlyDashboard();
  const [recordFilter, setRecordFilter] = useState<AuditRecordFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<AuditSortOrder>("NEWEST");

  const allRecords = state?.audit.records ?? [];

  const getRecordStatus = (
    r: (typeof allRecords)[number],
  ): "verified" | "mismatch" | "not-registered" => {
    if (r.status) return r.status;
    if (r.verifiedOnchain) return "verified";
    if (r.onchainCommitment) return "mismatch";
    return "not-registered";
  };

  const discrepancies = state?.reconciliation.discrepancies ?? [];
  const recordMismatches = allRecords.filter((r) => getRecordStatus(r) === "mismatch");
  const recordNotRegistered = allRecords.filter((r) => getRecordStatus(r) === "not-registered");
  const totalMismatches = discrepancies.length + recordMismatches.length;

  const chainInspection = state?.audit.chainVerification;
  const chainBadge = useMemo(() => {
    if (!state?.audit) {
      return { status: "UNAVAILABLE", label: "Unavailable" };
    }
    if (chainInspection) {
      if (chainInspection.valid) {
        return { status: "VERIFIED", label: "Verified" };
      }
      return {
        status: "FAILED",
        label:
          chainInspection.brokenAtSeq != null
            ? `Broken at #${chainInspection.brokenAtSeq}`
            : "Broken",
      };
    }
    return state.audit.chainValid
      ? { status: "VERIFIED", label: "Verified" }
      : { status: "FAILED", label: "Broken" };
  }, [state?.audit, chainInspection]);

  const filteredRecords = useMemo(() => {
    let list = allRecords;

    // 1. Filter by category
    if (recordFilter === "PAYMENT") {
      list = list.filter((r) => r.kind === "PAYMENT");
    } else if (recordFilter === "REMITTANCE") {
      list = list.filter((r) => r.kind === "REMITTANCE");
    } else if (recordFilter === "VERIFIED") {
      list = list.filter((r) => getRecordStatus(r) === "verified");
    } else if (recordFilter === "MISMATCH") {
      list = list.filter((r) => getRecordStatus(r) === "mismatch");
    } else if (recordFilter === "NOT_REGISTERED") {
      list = list.filter((r) => getRecordStatus(r) === "not-registered");
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
        const aVerified = getRecordStatus(a) === "verified";
        const bVerified = getRecordStatus(b) === "verified";
        if (!aVerified && bVerified) return -1;
        if (aVerified && !bVerified) return 1;
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

  const explorerUrl = state?.network?.explorerBaseUrl ?? "https://testnet.nearblocks.io";
  const escrowContractId =
    state?.network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet";

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
            Auditor Access &amp; Balanced Books
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
            Auditor Verification &amp; Accounting Export
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
            Scoped, time-bound X25519 view keys let external auditors access authorized records.
            Decrypted server-side within the grant scope; payload hash verified against the on-chain commitment stored
            in <code className="mono-data">ledgerly-escrow</code>.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
            disabled={busy}
            onClick={handleRotateKey}
          >
            {pendingKey === "rotate_view_key" ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                <span>Rotating…</span>
              </>
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Rotate Scoped View Key</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums"
            disabled={busy}
            onClick={() => {
              downloadCsv();
              void runAction(
                { action: "EXPORT_RECONCILIATION_CSV" },
                "Exported ledger reconciliation CSV & anchored audit root on NEAR.",
                { actionKey: "export_csv", errorScope: "auditor_page" },
              );
            }}
          >
            {pendingKey === "export_csv" ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                <span>Exporting…</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Export Reconciliation CSV ({state?.ledger.entriesCount ?? 0} legs)</span>
              </>
            )}
          </button>
        </div>
      </div>

      <InlineErrorBanner scope="auditor_page" />

      {/* Unified 2-Column Assurance Strip */}
      <div
        className="kpi-strip"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
          marginBottom: "1.4rem",
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
            <span className="inline-flex items-center gap-2">
              <span className="kpi-icon-badge">
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="mono-label">Active Scoped View Key Grant</span>
            </span>
            <StatusBadge status="ACTIVE" label="Active Grant" />
          </div>
          <div
            style={{
              margin: "0.35rem 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <span className="mono-data tabular-nums" style={{ fontSize: "1.12rem", fontWeight: 650 }}>
              {state?.audit.grantId ?? "—"}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--status-settled-fg)",
                background: "var(--status-settled-bg)",
                padding: "0.16rem 0.5rem",
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              Scope: Payments + Remittances
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
            <HashBadge
              label="X25519 Key"
              value={state?.audit.auditorKeyShort ?? "—"}
              startChars={12}
              endChars={8}
            />
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
            <span className="inline-flex items-center gap-2">
              <span className="kpi-icon-badge">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="mono-label">Tamper-Evident Audit Hash Chain</span>
            </span>
            <StatusBadge
              status={chainBadge.status}
              label={chainBadge.label}
            />
          </div>
          <div
            className="mono-data tabular-nums"
            style={{ fontSize: "1.12rem", fontWeight: 650, margin: "0.35rem 0" }}
          >
            {state?.audit.anchoredRootsCount ?? 0} Anchored Roots on NEAR
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <HashBadge
              label="Latest Root"
              value={state?.audit.latestAnchoredRoot ?? "—"}
              startChars={10}
              endChars={8}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <button
                type="button"
                className="btn-secondary whitespace-nowrap inline-flex items-center gap-1.5"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    { action: "ANCHOR_AUDIT_LOG" },
                    "Anchored current audit log root hash to NEAR smart contract.",
                    { actionKey: "anchor_root", errorScope: "auditor_page" },
                  )
                }
                style={{ fontSize: "0.74rem", padding: "0.22rem 0.55rem", height: "auto" }}
              >
                {pendingKey === "anchor_root" ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    <span>Anchoring…</span>
                  </>
                ) : (
                  <span>Anchor Root</span>
                )}
              </button>
              <a
                href={`${explorerUrl}/address/${escrowContractId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 whitespace-nowrap mono-label"
                style={{
                  color: "var(--accent-primary)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                <span>Verify on Nearblocks</span>
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Chain vs. Internal Ledger Reconciliation Banner */}
      <div className="fin-card" style={{ padding: "1.15rem 1.3rem", marginBottom: "1.4rem" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {totalMismatches === 0 ? (
                <CheckCircle2
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-settled-fg)" }}
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--status-failed-fg, #ef4444)" }}
                  aria-hidden="true"
                />
              )}
              <span className="tabular-nums" style={{ fontWeight: 600, fontSize: "0.96rem" }}>
                Chain vs. Internal Ledger Reconciliation ({state?.reconciliation.checkedCount ?? 0}{" "}
                checked)
              </span>
            </div>
            <div className="mono-label" style={{ marginTop: "0.22rem" }}>
              Source of Truth: NEAR Escrow Contract · Zero Discrepancies:{" "}
              {totalMismatches === 0 ? "Confirmed (0 Mismatches)" : `${totalMismatches} Discrepancy(ies)`}
              {recordNotRegistered.length > 0 && (
                <span style={{ marginLeft: "0.5rem", color: "var(--text-muted)" }}>
                  · {recordNotRegistered.length} not registered (unfunded / expired quotes, expected)
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <StatusBadge
              status={totalMismatches === 0 ? "SETTLED" : "PAYOUT_FAILED"}
              label={
                totalMismatches === 0
                  ? "Reconciled"
                  : `${totalMismatches} Discrepancies`
              }
            />
            {state?.reconciliation.discrepancies &&
              state.reconciliation.discrepancies.length > 0 && (
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
                  disabled={busy}
                  onClick={handleAutoReconcile}
                  style={{ fontSize: "0.78rem", padding: "0.42rem 0.85rem", height: "auto" }}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 shrink-0 ${
                      pendingKey === "auto_reconcile" ? "animate-spin" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    {pendingKey === "auto_reconcile"
                      ? "Reconciling on NEAR…"
                      : "Auto-Reconcile On-Chain Balances"}
                  </span>
                </button>
              )}
          </div>
        </div>

        {(state?.reconciliation.discrepancies.length ?? 0) > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.45rem",
              marginTop: "0.95rem",
              maxHeight: 260,
              overflowY: "auto",
              paddingRight: "0.2rem",
            }}
          >
            {state?.reconciliation.discrepancies.map((d) => (
              <div
                key={d.recordId}
                style={{
                  padding: "0.62rem 0.85rem",
                  borderRadius: 8,
                  border: "1px solid var(--status-pending-border)",
                  background: "var(--status-pending-bg)",
                  color: "var(--text-primary)",
                  fontSize: "0.79rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <div className="inline-flex items-center gap-2 flex-wrap">
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--status-pending-fg)",
                      fontWeight: 600,
                      background: "var(--surface-1)",
                      padding: "0.12rem 0.45rem",
                      borderRadius: 6,
                      border: "1px solid var(--status-pending-border)",
                    }}
                  >
                    {d.reason}
                  </span>
                  <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                    {d.recordId}
                  </span>
                  <span
                    className="mono-data tabular-nums"
                    style={{ color: "var(--text-secondary)", fontSize: "0.76rem" }}
                    title={`Raw minor units — Expected: ${d.expectedHeldMinor} · On-Chain: ${d.onchainHeldMinor}`}
                  >
                    Expected: {formatMinorUsdc(d.expectedHeldMinor)} · On-Chain:{" "}
                    {formatMinorUsdc(d.onchainHeldMinor)}
                  </span>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* High-Density Decrypted Records Ledger Table */}
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
              Authorized Invoice &amp; Payment Records ({filteredRecords.length})
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
              Decrypted securely using your auditor view key and verified against the on-chain hash recorded on NEAR.
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
                  id: "VERIFIED",
                  label: `Verified (${allRecords.filter((r) => getRecordStatus(r) === "verified").length})`,
                },
                {
                  id: "MISMATCH",
                  label: `Mismatch (${recordMismatches.length})`,
                },
                {
                  id: "NOT_REGISTERED",
                  label: `Not Registered (${recordNotRegistered.length})`,
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
            padding: "0.75rem 1.3rem",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border-subtle)",
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
            <Search
              className="w-3.5 h-3.5 shrink-0"
              style={{
                position: "absolute",
                left: "0.72rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Search auditor records"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, email, memo, order ref, or counterparty…"
              style={{
                width: "100%",
                paddingLeft: "2.1rem",
                paddingRight: searchQuery ? "2rem" : "0.75rem",
                fontSize: "0.8rem",
                height: 36,
                borderRadius: 8,
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--input-fg)",
                outline: "none",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search query"
                style={{
                  position: "absolute",
                  right: "0.45rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: "0.2rem",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                title="Clear search"
              >
                <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Sort Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
            <span className="mono-label">Sort</span>
            <div className="filter-pill-group" role="group" aria-label="Sort auditor records">
              <button
                type="button"
                className={`filter-pill inline-flex items-center gap-1 whitespace-nowrap ${
                  sortOrder === "NEWEST" ? "filter-pill-active" : ""
                }`}
                style={{ fontSize: "0.74rem", height: 28, padding: "0 0.6rem" }}
                onClick={() => setSortOrder("NEWEST")}
              >
                <span>Newest</span>
                <ArrowDown className="w-3 h-3 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`filter-pill inline-flex items-center gap-1 whitespace-nowrap ${
                  sortOrder === "OLDEST" ? "filter-pill-active" : ""
                }`}
                style={{ fontSize: "0.74rem", height: 28, padding: "0 0.6rem" }}
                onClick={() => setSortOrder("OLDEST")}
              >
                <span>Oldest</span>
                <ArrowUp className="w-3 h-3 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`filter-pill whitespace-nowrap ${
                  sortOrder === "RECORD_ID" ? "filter-pill-active" : ""
                }`}
                style={{ fontSize: "0.74rem", height: 28, padding: "0 0.6rem" }}
                onClick={() => setSortOrder("RECORD_ID")}
              >
                ID (A-Z)
              </button>
              <button
                type="button"
                className={`filter-pill whitespace-nowrap ${
                  sortOrder === "UNVERIFIED" ? "filter-pill-active" : ""
                }`}
                style={{ fontSize: "0.74rem", height: 28, padding: "0 0.6rem" }}
                onClick={() => setSortOrder("UNVERIFIED")}
              >
                Status
              </button>
            </div>

            {searchQuery && (
              <span
                className="tabular-nums"
                style={{ fontSize: "0.74rem", color: "var(--status-settled-fg)", fontWeight: 600 }}
              >
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
                  : recordFilter === "MISMATCH"
                    ? "Zero mismatched records"
                    : recordFilter === "NOT_REGISTERED"
                      ? "Zero unregistered records"
                      : `No ${recordFilter.toLowerCase()} records in current view`
            }
            description={
              allRecords.length === 0
                ? "Issue or rotate a scoped X25519 view key grant to decrypt authorized payment and remittance records for external verification."
                : searchQuery
                  ? "Try searching with another keyword or clear the search field to view all scope records."
                  : recordFilter === "MISMATCH"
                    ? "Every decrypted record in this grant matches its immutable SHA-256 commitment stored on the NEAR escrow contract."
                    : recordFilter === "NOT_REGISTERED"
                      ? "All records in scope have active on-chain escrow registrations."
                      : "Switch back to All to inspect all decrypted records in the active auditor grant."
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
          <div className="ledger-table-wrap overflow-x-auto auditor-table-wrap">
            <table className="ledger-table auditor-table">
              <thead>
                <tr>
                  <th style={{ width: "9%", minWidth: 70 }}>Kind</th>
                  <th style={{ width: "20%", minWidth: 140 }}>Record ID &amp; Timestamp</th>
                  <th style={{ width: "42%", minWidth: 210 }}>Decrypted Off-Chain Record</th>
                  <th style={{ width: "16%", minWidth: 130 }}>Escrow &amp; Commitment</th>
                  <th className="col-num" style={{ width: "13%", minWidth: 110 }}>Verification</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => (
                  <tr key={rec.recordId}>
                    <td>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          padding: "0.16rem 0.48rem",
                          borderRadius: 6,
                          background:
                            rec.kind === "PAYMENT"
                              ? "var(--status-settled-bg)"
                              : "var(--accent-subtle)",
                          color:
                            rec.kind === "PAYMENT"
                              ? "var(--status-settled-fg)"
                              : "var(--accent-primary)",
                        }}
                      >
                        {rec.kind}
                      </span>
                    </td>
                    <td>
                      <span
                        className="mono-data tabular-nums truncate"
                        style={{ fontWeight: 600, fontSize: "0.75rem", display: "inline-block", maxWidth: 145 }}
                        title={rec.recordId}
                      >
                        {rec.recordId}
                      </span>
                      <div
                        className="tabular-nums"
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                          marginTop: "0.15rem",
                        }}
                      >
                        {new Date(rec.createdAtIso).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                    <td className="auditor-payload-col">
                      <PayloadPreviewCard payload={rec.decryptedPayload} kind={rec.kind} />
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.25rem",
                          alignItems: "flex-start",
                        }}
                      >
                        <HashBadge
                          label="Escrow"
                          value={rec.escrowId}
                          startChars={6}
                          endChars={4}
                        />
                        <HashBadge
                          label="Commit"
                          value={rec.commitment}
                          startChars={6}
                          endChars={4}
                        />
                      </div>
                    </td>
                    <td className="col-num" style={{ whiteSpace: "nowrap" }}>
                      {(() => {
                        const recStatus = getRecordStatus(rec);
                        if (recStatus === "verified") {
                          return <StatusBadge status="VERIFIED" label="Verified" />;
                        }
                        if (recStatus === "mismatch") {
                          return (
                            <span title={rec.statusNote ?? "On-chain commitment differs"}>
                              <StatusBadge status="MISMATCH" label="Mismatch" />
                            </span>
                          );
                        }
                        return (
                          <span
                            title={
                              rec.statusNote ?? "Expired quote never funded on-chain"
                            }
                          >
                            <StatusBadge
                              status="NOT_REGISTERED"
                              label="Not Registered"
                            />
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
