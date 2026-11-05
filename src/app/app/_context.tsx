"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface PaymentRequestItem {
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
  latestTxHash?: string | null;
  createdAtIso: string;
}

export interface RemittanceItem {
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

export interface AuditedRecord {
  recordId: string;
  kind: "PAYMENT" | "REMITTANCE";
  escrowId: string;
  createdAtIso: string;
  decryptedPayload: Record<string, unknown>;
  commitment: string;
  onchainCommitment: string | null;
  verifiedOnchain: boolean;
}

export interface DashboardState {
  network?: {
    mode: "NEAR_TESTNET_RPC" | "LOCAL_SANDBOX_SIMULATION";
    rpcUrl: string;
    escrowContractId: string;
    usdcContractId: string;
    explorerBaseUrl: string;
  };
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
    auditLog?: Array<{
      id: string;
      actor: string;
      action: string;
      targetId: string;
      atIso: string;
      hash: string;
    }>;
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

export interface ToastItem {
  id: string;
  kind: "success" | "error";
  title: string;
  message: string;
}

export interface InlineErrorState {
  scope: string;
  code: string;
  message: string;
}

export interface StatusTransition {
  from: string;
  to: string;
}

export interface RunActionOptions {
  actionKey?: string;
  errorScope?: string;
  successTitle?: string;
}

interface DashboardContextValue {
  state: DashboardState | null;
  busy: boolean;
  pendingKey: string | null;
  toasts: ToastItem[];
  inlineError: InlineErrorState | null;
  transitions: Record<string, StatusTransition>;
  dismissToast: (id: string) => void;
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  clearInlineError: () => void;
  setInlineError: (err: InlineErrorState | null) => void;
  runAction: (
    payload: Record<string, unknown>,
    successMsg: string,
    options?: RunActionOptions,
  ) => Promise<boolean>;
  downloadCsv: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function LedgerlyDashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DashboardState | null>(null);
  const stateRef = useRef<DashboardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [inlineError, setInlineError] = useState<InlineErrorState | null>(null);
  const [transitions, setTransitions] = useState<Record<string, StatusTransition>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      setTimeout(() => {
        dismissToast(id);
      }, 4400);
    },
    [dismissToast],
  );

  const clearInlineError = useCallback(() => {
    setInlineError(null);
  }, []);

  const recordTransitions = useCallback(
    (prev: DashboardState | null, next: DashboardState) => {
      if (!prev) return;
      const detected: Record<string, StatusTransition> = {};

      const prevPayments = new Map(prev.paymentRequests.map((p) => [p.id, p.status]));
      for (const p of next.paymentRequests) {
        const oldStatus = prevPayments.get(p.id);
        if (oldStatus && oldStatus !== p.status) {
          detected[p.id] = { from: oldStatus, to: p.status };
        }
      }

      const prevRemits = new Map(prev.remittances.map((r) => [r.id, r.status]));
      for (const r of next.remittances) {
        const oldStatus = prevRemits.get(r.id);
        if (oldStatus && oldStatus !== r.status) {
          detected[r.id] = { from: oldStatus, to: r.status };
        } else if (!oldStatus && (r.status === "SETTLED" || r.status === "PAYOUT_FAILED" || r.status === "BLOCKED")) {
          detected[r.id] = { from: "QUOTED", to: r.status };
        }
      }

      const keys = Object.keys(detected);
      if (keys.length > 0) {
        setTransitions((curr) => ({ ...curr, ...detected }));
        setTimeout(() => {
          setTransitions((curr) => {
            const copy = { ...curr };
            for (const k of keys) {
              delete copy[k];
            }
            return copy;
          });
        }, 4200);
      }
    },
    [],
  );

  const fetchState = useCallback(async () => {
    const res = await fetch("/api/v1/state", { cache: "no-store" });
    if (res.ok) {
      const next = (await res.json()) as DashboardState;
      recordTransitions(stateRef.current, next);
      stateRef.current = next;
      setState(next);
    }
  }, [recordTransitions]);

  useEffect(() => {
    void fetchState();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void fetchState();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const runAction = useCallback(
    async (
      payload: Record<string, unknown>,
      successMsg: string,
      options?: RunActionOptions,
    ): Promise<boolean> => {
      const key = options?.actionKey ?? String(payload.action ?? "action");
      const scope = options?.errorScope ?? key;

      setBusy(true);
      setPendingKey(key);
      setInlineError(null);

      const startedAt = Date.now();
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

        // Ensure a calm, perceptible loading state (~360ms minimum)
        const elapsed = Date.now() - startedAt;
        if (elapsed < 360) {
          await new Promise((resolve) => setTimeout(resolve, 360 - elapsed));
        }

        if (!res.ok || !data.ok) {
          const code = data.error?.code ?? "VALIDATION_ERROR";
          const message = data.error?.message ?? "Unable to process request.";
          setInlineError({ scope, code, message });
          pushToast({
            kind: "error",
            title: `Action Failed · ${code}`,
            message,
          });
          return false;
        }

        if (data.state) {
          recordTransitions(stateRef.current, data.state);
          stateRef.current = data.state;
          setState(data.state);
        }

        pushToast({
          kind: "success",
          title: options?.successTitle ?? "Transaction Confirmed",
          message: successMsg,
        });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network request failed.";
        setInlineError({ scope, code: "NETWORK_ERROR", message });
        pushToast({
          kind: "error",
          title: "Network Error",
          message,
        });
        return false;
      } finally {
        setBusy(false);
        setPendingKey(null);
      }
    },
    [pushToast, recordTransitions],
  );

  const downloadCsv = useCallback(() => {
    if (!state?.ledger.csv) return;
    const blob = new Blob([state.ledger.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledgerly-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast({
      kind: "success",
      title: "Export Complete",
      message: `Downloaded ${state.ledger.entriesCount} double-entry journal legs as CSV.`,
    });
  }, [state, pushToast]);

  return (
    <DashboardContext.Provider
      value={{
        state,
        busy,
        pendingKey,
        toasts,
        inlineError,
        transitions,
        dismissToast,
        pushToast,
        clearInlineError,
        setInlineError,
        runAction,
        downloadCsv,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useLedgerlyDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useLedgerlyDashboard must be used inside LedgerlyDashboardProvider");
  }
  return ctx;
}

export function statusTone(status: string): string {
  const normalized = status.toUpperCase();
  if (
    normalized === "SETTLED" ||
    normalized === "PAID" ||
    normalized === "VERIFIED" ||
    normalized === "ACTIVE"
  ) {
    return "status-pill status-pill-emerald";
  }
  if (
    normalized === "FAILED" ||
    normalized === "BLOCKED" ||
    normalized === "CANCELLED" ||
    normalized === "EXPIRED"
  ) {
    return "status-pill status-pill-red";
  }
  if (
    normalized === "OVERPAID" ||
    normalized === "PARTIALLY_PAID" ||
    normalized === "PAYOUT_FAILED" ||
    normalized === "REFUNDING"
  ) {
    return "status-pill status-pill-amber";
  }
  // OPEN, QUOTED, FUNDED, PENDING, PAYOUT_PENDING
  return "status-pill status-pill-blue";
}

export function isPendingOrProcessingStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return (
    normalized === "OPEN" ||
    normalized === "PENDING" ||
    normalized === "PAYOUT_PENDING" ||
    normalized === "QUOTED" ||
    normalized === "FUNDED" ||
    normalized === "PARTIALLY_PAID" ||
    normalized === "PAYOUT_FAILED" ||
    normalized === "REFUNDING"
  );
}

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const pulse = isPendingOrProcessingStatus(status);
  return (
    <span className={statusTone(status)}>
      <span
        className={`status-pill-dot ${pulse ? "status-pill-dot-pulse" : ""}`}
        aria-hidden="true"
      />
      <span>{label ?? status.replace(/_/g, " ")}</span>
    </span>
  );
}

export function AnimatedNumber({
  value,
  decimals = 0,
}: {
  value: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState<number>(value);
  const prevValueRef = useRef<number>(0);

  useEffect(() => {
    const from = prevValueRef.current;
    const to = value;
    prevValueRef.current = value;

    if (from === to) {
      setDisplay(to);
      return;
    }

    const durationMs = 520;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        raf = window.requestAnimationFrame(tick);
      } else {
        setDisplay(to);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [value]);

  return (
    <>
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }} aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            padding: "0.9rem 1rem",
            borderBottom: idx < count - 1 ? "1px solid var(--line-soft)" : "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
            <div className="skeleton-block" style={{ width: "38%", height: 14 }} />
            <div className="skeleton-block" style={{ width: "62%", height: 10 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <div className="skeleton-block" style={{ width: 82, height: 14 }} />
            <div className="skeleton-block" style={{ width: 64, height: 20, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatusBadgeWithTransition({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const { transitions } = useLedgerlyDashboard();
  const transition = transitions[id];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
      {transition && (
        <span className="status-transition-tag" title="Recent state transition">
          <span>{transition.from.replace(/_/g, " ")}</span>
          <span aria-hidden="true">→</span>
          <span style={{ color: "var(--sage-green)", fontWeight: 600 }}>
            {transition.to.replace(/_/g, " ")}
          </span>
        </span>
      )}
      <StatusBadge status={status} />
    </span>
  );
}

export function DashboardEmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  icon?: string;
  title: string;
  description: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty-state-box">
      <div className="empty-state-icon" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
          <path d="M5.5 6h5M5.5 9.5h3" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ fontWeight: 550, fontSize: "0.9rem", color: "var(--ink-charcoal)" }}>
        {title}
      </div>
      <p
        style={{
          fontSize: "0.81rem",
          color: "var(--ink-muted)",
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {(primaryAction || secondaryAction) && (
        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          {primaryAction && (
            <button
              type="button"
              className="btn-primary"
              style={{ padding: "0.5rem 0.95rem", fontSize: "0.8rem" }}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: "0.48rem 0.9rem", fontSize: "0.8rem" }}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function InlineErrorBanner({ scope }: { scope: string }) {
  const { inlineError, clearInlineError } = useLedgerlyDashboard();
  if (!inlineError || inlineError.scope !== scope) return null;

  return (
    <div className="inline-error-banner" role="alert" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem", lineHeight: 1.3 }}>✕</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.84rem", marginBottom: "0.15rem" }}>
            {inlineError.code}
          </div>
          <div style={{ fontSize: "0.83rem", opacity: 0.92, lineHeight: 1.45 }}>
            {inlineError.message}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={clearInlineError}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--crimson-red)",
          fontSize: "0.76rem",
          fontWeight: 500,
          cursor: "pointer",
          padding: "0.2rem 0.4rem",
          flexShrink: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
