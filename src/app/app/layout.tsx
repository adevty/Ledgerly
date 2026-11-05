"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LedgerlyDashboardProvider, StatusBadge, useLedgerlyDashboard } from "./_context";

function NavIcon({ kind }: { kind: "overview" | "merchant" | "remittance" | "auditor" }) {
  if (kind === "overview") {
    return (
      <svg className="app-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <rect x="9" y="9" width="5" height="5" rx="1" />
      </svg>
    );
  }
  if (kind === "merchant") {
    return (
      <svg className="app-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <path d="M2 6.5h12" />
        <path d="M4.8 10h3.2" />
      </svg>
    );
  }
  if (kind === "remittance") {
    return (
      <svg className="app-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M2.5 5.5h10.5M10 2.8l3 2.7-3 2.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.5 10.5H3M6 7.8l-3 2.7 3 2.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="app-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path
        d="M8 1.8l5 2v4c0 3.3-2.2 5.4-5 6.4-2.8-1-5-3.1-5-6.4v-4l5-2z"
        strokeLinejoin="round"
      />
      <path d="M5.8 8.1l1.5 1.5 3-3.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, busy, toasts, dismissToast } = useLedgerlyDashboard();

  const navItems: Array<{
    href: string;
    label: string;
    icon: "overview" | "merchant" | "remittance" | "auditor";
    exact: boolean;
    badge: string | null;
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
    {
      href: "/app/auditor",
      label: "Auditor",
      icon: "auditor",
      exact: false,
      badge: state ? String(state.audit.records.length) : null,
    },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Calm, particle-free fintech ambient backdrop with subtle horizontal ledger lines */}
      <div className="app-ambient-backdrop" aria-hidden="true" />

      {/* Top Sticky Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(247, 244, 238, 0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1320,
            margin: "0 auto",
            padding: "0.95rem 1.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <Link
              href="/"
              style={{
                fontWeight: 600,
                fontSize: "1.05rem",
                letterSpacing: "-0.02em",
                color: "var(--ink-charcoal)",
                textDecoration: "none",
              }}
            >
              Ledgerly
            </Link>
            <span style={{ color: "var(--line-medium)" }}>·</span>
            <StatusBadge
              status="ACTIVE"
              label={
                state?.network?.mode === "NEAR_TESTNET_RPC"
                  ? "NEAR Testnet · Live RPC"
                  : "NEAR Testnet · Sandbox"
              }
            />
            {state?.network?.escrowContractId && (
              <a
                href={`${state.network.explorerBaseUrl}/address/${state.network.escrowContractId}`}
                target="_blank"
                rel="noreferrer"
                className="mono-label"
                style={{
                  textDecoration: "none",
                  color: "var(--ink-muted)",
                  borderBottom: "1px dotted var(--line-medium)",
                }}
              >
                {state.network.escrowContractId} ↗
              </a>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
            <div style={{ textAlign: "right" }}>
              {state ? (
                <>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--ink-charcoal)" }}>
                    {state.organization.name}
                  </div>
                  <div className="mono-label" style={{ fontSize: "0.66rem" }}>
                    {state.organization.nearAccount}
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                  <div className="skeleton-block" style={{ width: 132, height: 13 }} />
                  <div className="skeleton-block" style={{ width: 168, height: 10 }} />
                </div>
              )}
            </div>
            <Link
              href="/"
              className="btn-secondary"
              style={{ padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}
            >
              ← Landing Page
            </Link>
          </div>
        </div>

        {/* Thin horizontal rail line movement along header bottom */}
        <div className="header-rail-track" aria-hidden="true">
          <div className={`header-rail-line ${busy ? "header-rail-line-busy" : ""}`} />
        </div>
      </header>

      {/* Main 2-Column Dashboard Shell */}
      <div className="app-shell">
        {/* Sidebar Navigation */}
        <aside className="app-sidebar" aria-label="Workspace Navigation">
          <div>
            <div className="mono-label" style={{ padding: "0 0.5rem", marginBottom: "0.55rem" }}>
              Workspace
            </div>
            <nav className="app-nav-list">
              {navItems.map((item) => {
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
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== null && <span className="app-nav-badge">{item.badge}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hairline-top" style={{ paddingTop: "0.95rem" }}>
            <div className="mono-label" style={{ marginBottom: "0.35rem" }}>
              Escrow &amp; Ledger Status
            </div>
            <div
              style={{
                fontSize: "0.79rem",
                color: "var(--sage-green)",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "0.42rem",
              }}
            >
              <span className="status-pill-dot" aria-hidden="true" />
              <span>
                {state?.reconciliation.discrepancies.length === 0
                  ? "All Escrows Balanced"
                  : `${state?.reconciliation.discrepancies.length ?? 0} Pending Review`}
              </span>
            </div>
            <div className="mono-label" style={{ marginTop: "0.3rem", fontSize: "0.65rem" }}>
              {state?.ledger.entriesCount ?? 0} Journal Legs · SHA-256 Anchored
            </div>
          </div>
        </aside>

        {/* Active Page Content with Smooth Page Transition */}
        <main style={{ minWidth: 0 }}>
          <div key={pathname} className="page-transition-enter">
            {children}
          </div>
        </main>
      </div>

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
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                  <span
                    className="status-pill-dot"
                    style={{
                      marginTop: "0.38rem",
                      color: isSuccess ? "var(--sage-green)" : "var(--crimson-red)",
                    }}
                    aria-hidden="true"
                  />
                  <div>
                    <div
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: isSuccess ? "var(--ink-charcoal)" : "var(--crimson-red)",
                        marginBottom: "0.12rem",
                      }}
                    >
                      {toast.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.79rem",
                        color: "var(--ink-body)",
                        lineHeight: 1.45,
                      }}
                    >
                      {toast.message}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="mono-label"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--ink-muted)",
                    fontSize: "0.64rem",
                    cursor: "pointer",
                    padding: "0.15rem 0.35rem",
                    flexShrink: 0,
                  }}
                >
                  Close
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
