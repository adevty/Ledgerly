"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  FileCheck2,
  LayoutGrid,
  Moon,
  ShoppingBag,
  Sun,
  X,
} from "lucide-react";
import { LedgerlyDashboardProvider, StatusBadge, useLedgerlyDashboard } from "./_context";
import { HashBadge } from "../components/HashBadge";
import { LedgerlyBrandMark } from "../components/LedgerlyBrandMark";

function NavIcon({
  kind,
}: {
  kind: "overview" | "merchant" | "remittance" | "auditor" | "checkout";
}) {
  if (kind === "overview") {
    return <LayoutGrid className="app-nav-icon" aria-hidden="true" />;
  }
  if (kind === "merchant") {
    return <CreditCard className="app-nav-icon" aria-hidden="true" />;
  }
  if (kind === "remittance") {
    return <ArrowLeftRight className="app-nav-icon" aria-hidden="true" />;
  }
  if (kind === "checkout") {
    return <ShoppingBag className="app-nav-icon" aria-hidden="true" />;
  }
  return <FileCheck2 className="app-nav-icon" aria-hidden="true" />;
}

function getPendingActionLabel(key: string | null): { title: string; desc: string } {
  switch (key) {
    case "create_invoice":
    case "create_payment":
    case "create_checkout":
      return {
        title: "Creating Invoice & Committing Hash",
        desc: "Broadcasting payment request to NEAR testnet escrow...",
      };
    case "send_remittance":
    case "remit_payout":
      return {
        title: "Initiating Cross-Border Remittance",
        desc: "Screening sanctions, quoting FX & funding payout on NEAR...",
      };
    case "sweep_payout":
      return {
        title: "Sweeping Merchant Payout",
        desc: "Calling escrow contract sweep & transferring funds...",
      };
    case "refund_payment":
      return {
        title: "Executing Escrow Refund",
        desc: "Processing fail-safe exit & returning funds to buyer...",
      };
    case "rotate_view_key":
      return {
        title: "Rotating Scoped View Key",
        desc: "Generating new X25519 keypair and updating auditor grant...",
      };
    case "auto_reconcile":
      return {
        title: "Reconciling Ledger Discrepancies",
        desc: "Executing on-chain settlement releases and balancing escrows...",
      };
    case "anchor_root":
      return {
        title: "Anchoring Audit Root on NEAR",
        desc: "Committing cryptographic SHA-256 hash-chain root to smart contract...",
      };
    case "export_csv":
      return {
        title: "Exporting Reconciliation CSV",
        desc: "Compiling balanced double-entry ledger records...",
      };
    case "retry_settlements":
      return {
        title: "Retrying Failed Settlements",
        desc: "Triggering SettlementWorker payout retry loop...",
      };
    case "seed_demo":
      return {
        title: "Seeding Ledgerly Demo State",
        desc: "Generating transactions, escrow contracts & commitments...",
      };
    default:
      if (key?.startsWith("pay_")) {
        return {
          title: "Processing Escrow Payment",
          desc: "Calling ft_transfer_call with payment payload to escrow contract...",
        };
      }
      return {
        title: "Broadcasting to NEAR Testnet",
        desc: "Processing cryptographic transaction & settling on-chain...",
      };
  }
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, busy, pendingKey, toasts, dismissToast } = useLedgerlyDashboard();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [copiedAccount, setCopiedAccount] = useState(false);

  useEffect(() => {
    if (document.documentElement.getAttribute("data-theme") === "light") {
      setTheme("light");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (next === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      return next;
    });
  }, []);

  const operationsNav: Array<{
    href: string;
    label: string;
    icon: "overview" | "merchant" | "remittance";
    exact: boolean;
    badge: React.ReactNode | null;
  }> = [
    {
      href: "/app",
      label: "Overview",
      icon: "overview",
      exact: true,
      badge: null,
    },
    {
      href: "/app/merchant",
      label: "Merchant Checkout",
      icon: "merchant",
      exact: false,
      badge: state ? String(state.paymentRequests.length) : null,
    },
    {
      href: "/app/remittance",
      label: "Remittances",
      icon: "remittance",
      exact: false,
      badge: state ? String(state.remittances.length) : null,
    },
  ];

  const complianceNav: Array<{
    href: string;
    label: string;
    icon: "auditor" | "checkout";
    exact: boolean;
    badge: React.ReactNode | null;
  }> = [
    {
      href: "/app/auditor",
      label: "Auditor",
      icon: "auditor",
      exact: false,
      badge: state ? String(state.audit.records.length) : null,
    },
    {
      href: "/checkout",
      label: "Buyer Checkout",
      icon: "checkout",
      exact: false,
      badge: <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const orgInitials = state?.organization.name
    ? state.organization.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "LD";

  return (
    <div style={{ minHeight: "100dvh", position: "relative" }}>
      <div className="app-ambient-backdrop" aria-hidden="true" />

      {/* Solid Top Sticky Header */}
      <header className="app-topbar sticky top-0 z-50">
        <div className="app-topbar-inner">
          <div className="app-topbar-left">
            <Link
              href="/"
              className="app-brand-link"
            >
              <LedgerlyBrandMark />
              <span>Ledgerly</span>
            </Link>
            <StatusBadge
              status={state?.network?.mode === "NEAR_TESTNET_RPC" ? "ACTIVE" : "OVERPAID"}
              label={
                state?.network?.mode === "NEAR_TESTNET_RPC"
                  ? "NEAR TESTNET"
                  : "SANDBOX"
              }
            />
            {state?.network?.escrowContractId && (
              <span className="hide-on-mobile">
                <HashBadge
                  value={state.network.escrowContractId}
                  href={`${state.network.explorerBaseUrl}/address/${state.network.escrowContractId}`}
                />
              </span>
            )}
          </div>

          <div className="app-topbar-right">
            <button
              type="button"
              onClick={toggleTheme}
              className="lp-theme-toggle"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
              )}
            </button>

            {state ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (state?.organization.nearAccount && typeof navigator !== "undefined" && navigator.clipboard) {
                    void navigator.clipboard.writeText(state.organization.nearAccount);
                    setCopiedAccount(true);
                    setTimeout(() => setCopiedAccount(false), 1600);
                  }
                }}
                className="group cursor-pointer select-none transition-all duration-200 org-profile-pill"
                title={`Click to copy NEAR testnet account: ${state.organization.nearAccount}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (state?.organization.nearAccount && typeof navigator !== "undefined" && navigator.clipboard) {
                      void navigator.clipboard.writeText(state.organization.nearAccount);
                      setCopiedAccount(true);
                      setTimeout(() => setCopiedAccount(false), 1600);
                    }
                  }
                }}
              >
                <div style={{ position: "relative", width: 26, height: 26, flexShrink: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      background:
                        "linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(6, 182, 212, 0.12))",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      color: "var(--status-settled-fg)",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {orgInitials}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      bottom: -1,
                      right: -1,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: "#10b981",
                      border: "1.5px solid var(--surface-1)",
                    }}
                  />
                </div>
                <div style={{ textAlign: "left" }}>
                  <div className="org-profile-name">
                    {state.organization.name}
                  </div>
                  <div
                    className="tabular-nums inline-flex items-center gap-1"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.66rem",
                      color: copiedAccount ? "var(--status-settled-fg)" : "var(--text-muted)",
                      transition: "color 150ms ease",
                    }}
                  >
                    <span className="org-profile-account">
                      {copiedAccount ? "Copied!" : state.organization.nearAccount}
                    </span>
                    {copiedAccount ? (
                      <Check className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                <div className="skeleton-placeholder" style={{ width: 132, height: 13 }} />
                <div className="skeleton-placeholder" style={{ width: 168, height: 10 }} />
              </div>
            )}

            <Link
              href="/"
              className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
              style={{ padding: "0.42rem 0.75rem", fontSize: "0.78rem" }}
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hide-on-mobile-inline">Landing</span>
            </Link>
          </div>
        </div>

        <div className="header-rail-track" aria-hidden="true">
          <div className={`header-rail-line ${busy ? "header-rail-line-busy" : ""}`} />
        </div>
      </header>

      {/* Mobile Sticky Horizontal Pill Navigation Bar (Visible only <= 860px) */}
      <nav className="app-mobile-nav" aria-label="Mobile Navigation">
        <div className="app-mobile-nav-inner">
          {[...operationsNav, ...complianceNav].map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-mobile-nav-pill ${active ? "app-mobile-nav-pill-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon kind={item.icon} />
                <span>{item.label}</span>
                {item.badge !== null && (
                  <span className="app-mobile-nav-badge">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main 2-Column Dashboard Shell */}
      <div className="app-shell">
        {/* Sidebar Navigation */}
        <aside className="app-sidebar sticky top-20 self-start" aria-label="Workspace Navigation">
          <div>
            <div
              className="mono-label"
              style={{ padding: "0 0.55rem", marginBottom: "0.5rem" }}
            >
              Operations
            </div>
            <nav className="app-nav-list">
              {operationsNav.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`app-nav-link ${active ? "app-nav-link-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="app-nav-link-label-group">
                      <NavIcon kind={item.icon} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge !== null && (
                      <span className="app-nav-badge tabular-nums">{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hairline-top" style={{ paddingTop: "0.95rem" }}>
            <div
              className="mono-label"
              style={{ padding: "0 0.55rem", marginBottom: "0.5rem" }}
            >
              Audit &amp; Checkout
            </div>
            <nav className="app-nav-list">
              {complianceNav.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`app-nav-link ${active ? "app-nav-link-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="app-nav-link-label-group">
                      <NavIcon kind={item.icon} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge !== null && (
                      <span className="app-nav-badge tabular-nums">{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Escrow & Reconciliation Status Card */}
          <div
            style={{
              padding: "0.85rem 0.9rem",
              borderRadius: "var(--primitive-radius-md)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.35rem",
              }}
            >
              <span className="mono-label">Escrow &amp; Ledger</span>
              <CheckCircle2
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--status-settled-fg)" }}
                aria-hidden="true"
              />
            </div>

            <div
              style={{
                fontSize: "0.8rem",
                color:
                  (state?.reconciliation.discrepancies.length ?? 0) === 0
                    ? "var(--status-settled-fg)"
                    : "var(--status-pending-fg)",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "0.42rem",
              }}
            >
              <span className="status-pill-dot" aria-hidden="true" />
              <span className="tabular-nums">
                {(state?.reconciliation.discrepancies.length ?? 0) === 0
                  ? "Balanced books"
                  : `${state?.reconciliation.discrepancies.length ?? 0} Pending Review`}
              </span>
            </div>

            <div
              className="tabular-nums"
              style={{
                marginTop: "0.3rem",
                fontSize: "0.72rem",
                color: "var(--text-muted)",
              }}
            >
              {state?.ledger.entriesCount ?? 0} journal legs · Verified on NEAR
            </div>
          </div>
        </aside>

        {/* Active Page Content */}
        <main style={{ minWidth: 0 }}>
          <div key={pathname} className="page-transition-enter">
            {children}
          </div>
        </main>
      </div>

      {/* Floating In-Flight Transaction / Action Processing HUD */}
      {busy && (
        <aside
          className="tx-processing-hud"
          role="status"
          aria-live="assertive"
          aria-label="Transaction in progress"
        >
          <div className="tx-hud-card">
            <div className="tx-hud-spinner-wrap">
              <span className="tx-hud-spinner" aria-hidden="true" />
              <span className="tx-hud-spinner-inner" aria-hidden="true" />
            </div>
            <div className="tx-hud-content">
              <div className="tx-hud-title-row">
                <span className="tx-hud-title">{getPendingActionLabel(pendingKey).title}</span>
                <span className="tx-hud-badge">PROCESSING</span>
              </div>
              <div className="tx-hud-subtitle">{getPendingActionLabel(pendingKey).desc}</div>
            </div>
            <div className="tx-hud-bar" aria-hidden="true">
              <div className="tx-hud-bar-inner" />
            </div>
          </div>
        </aside>
      )}

      {/* Non-Blocking Auto-Dismissing Toast Stack */}
      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => {
            const isSuccess = toast.kind === "success";
            return (
              <div
                key={toast.id}
                className={`toast-item ${isSuccess ? "toast-item-success" : "toast-item-error"}`}
              >
                <div
                  className={`toast-icon-badge ${
                    isSuccess ? "toast-icon-badge-success" : "toast-icon-badge-error"
                  }`}
                  aria-hidden="true"
                >
                  {isSuccess ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    <span
                      className={`toast-status-chip ${
                        isSuccess ? "toast-status-chip-success" : "toast-status-chip-error"
                      }`}
                    >
                      {isSuccess ? "Success" : "Failed"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "0.15rem",
                    }}
                  >
                    {toast.title}
                  </div>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {toast.message}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="btn-quiet"
                  style={{
                    padding: "0.25rem",
                    borderRadius: "4px",
                    flexShrink: 0,
                    opacity: 0.7,
                    cursor: "pointer",
                  }}
                >
                  <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AppDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LedgerlyDashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </LedgerlyDashboardProvider>
  );
}
