"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileCheck2,
  Key,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  Terminal,
} from "lucide-react";
import { LedgerlyBrandMark } from "../components/LedgerlyBrandMark";
import { HashBadge } from "../components/HashBadge";

const ESCROW_CONTRACT_ID = "ledgerly-escrow-9e70f9ea.testnet";
const USDC_CONTRACT_ID = "ledgerly-usdc-a627a4c0.testnet";
const OPERATOR_ACCOUNT_ID = "ledgerly-op-a627a4c0.testnet";

interface CodeSnippetProps {
  code: string;
  language?: string;
  title?: string;
}

function CodeSnippet({ code, language = "bash", title }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard fallback
    }
  };

  return (
    <div className="docs-code-card">
      <div className="docs-code-header">
        <div className="docs-code-title">
          <Terminal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="docs-code-title-text">{title || language}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="docs-code-copy-btn"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="docs-code-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeSection, setActiveSection] = useState("overview");

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

  const navSections = [
    { id: "overview", label: "1. Overview & Vision", shortLabel: "1. Overview" },
    { id: "privacy", label: "2. Privacy & Encryption", shortLabel: "2. Privacy" },
    { id: "escrow", label: "3. Smart Escrow on NEAR", shortLabel: "3. Escrow" },
    { id: "api", label: "4. Developer API", shortLabel: "4. REST API" },
    { id: "accounting", label: "5. Verifiable Accounting", shortLabel: "5. Accounting" },
    { id: "threat-model", label: "6. Threat Model & Security", shortLabel: "6. Security" },
  ];

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--surface-canvas)", color: "var(--text-primary)" }}>
      {/* Top Docs Header */}
      <header className="lp-header">
        <div className="lp-header-inner">
          <div className="lp-brand-group">
            <Link href="/" className="lp-brand" aria-label="Ledgerly Home">
              <LedgerlyBrandMark size={28} />
              <span>Ledgerly</span>
            </Link>
            <span style={{ color: "var(--border-default)" }} aria-hidden="true">
              /
            </span>
            <span style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Documentation
            </span>
          </div>

          <div className="lp-header-actions">
            <Link
              href="/"
              className="lp-btn-secondary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              title="Back to Home"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Home</span>
            </Link>

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

            <a
              href="https://github.com/adevty/Ledgerly"
              target="_blank"
              rel="noreferrer"
              className="lp-btn-secondary lp-hide-mobile"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>

            <Link href="/app" className="lp-btn-primary">
              <span>Open App</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Docs Shell */}
      <div className="docs-container">
        <div className="docs-shell">
          {/* Sticky Navigation Sidebar */}
          <aside className="docs-sidebar" aria-label="Documentation Navigation">
            <div className="docs-sidebar-header" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <BookOpen className="w-4 h-4 text-[var(--accent-primary)]" aria-hidden="true" />
              <span style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Docs Index
              </span>
            </div>

            <nav className="docs-nav-list">
              {navSections.map((sec) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  onClick={() => setActiveSection(sec.id)}
                  className={`docs-nav-link ${activeSection === sec.id ? "docs-nav-link-active" : ""}`}
                >
                  <span className="docs-nav-label-desktop">{sec.label}</span>
                  <span className="docs-nav-label-mobile">{sec.shortLabel}</span>
                </a>
              ))}
            </nav>
          </aside>

          {/* Documentation Content Column */}
          <main className="docs-content">
            {/* Section 1: Overview */}
            <section id="overview" className="docs-section">
              <span className="lp-step-pill">1 · Architecture</span>
              <h1 className="docs-title">Overview &amp; Core Value Proposition</h1>
              <p className="docs-lead">
                Ledgerly is a privacy-first financial infrastructure protocol designed for on-chain businesses.
                Submitted to <strong>NEAR Hackathon</strong> under the <code>realworld</code> (Bring the boring money onchain)
                and <code>privacy</code> (Selective disclosure &amp; confidential onchain financial infrastructure) tracks.
              </p>

              <div className="docs-callout">
                <ShieldCheck className="w-5 h-5 text-[var(--status-settled-fg)] shrink-0" aria-hidden="true" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>The Double-Sided Privacy Dilemma</div>
                  <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    Public blockchains broadcast customer names, supplier terms, and cashflows to competitors.
                    Conversely, dark anonymous privacy networks prevent businesses from proving compliance to certified auditors,
                    accountants, or tax authorities. Ledgerly bridges this divide with <em>Selective Disclosure</em>.
                  </div>
                </div>
              </div>

              <div className="docs-grid-2">
                <div className="docs-card">
                  <div className="docs-card-title">Off-Chain Confidentiality</div>
                  <p className="docs-card-body">
                    Commercial invoices, itemized descriptions, counterparty contact details, and banking metadata
                    are encrypted via authenticated AES-256-GCM. Zero raw business information leaks to public block explorers.
                  </p>
                </div>
                <div className="docs-card">
                  <div className="docs-card-title">On-Chain Mathematical Proof</div>
                  <p className="docs-card-body">
                    Only a random 32-byte opaque escrow identifier and a tamper-evident commitment hash
                    (<code>sha256(canonicalJSON(payload) || salt)</code>) are anchored to the NEAR smart contract.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2: Privacy & Encryption */}
            <section id="privacy" className="docs-section">
              <span className="lp-step-pill">2 · Cryptography</span>
              <h2 className="docs-title">Privacy &amp; Envelope Encryption (AD-3)</h2>
              <p className="docs-lead">
                Ledgerly uses off-chain envelope encryption combined with scoped asymmetric view keys (X25519)
                to allow certified auditors to verify financial records without exposing customer data to the world.
              </p>

              <div className="docs-card">
                <h3 style={{ fontSize: "1rem", fontWeight: 650, marginBottom: "0.5rem" }}>
                  Commitment Calculation Formula
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.85rem" }}>
                  Every invoice and remittance is transformed into a deterministic canonical JSON string, concatenated with a 32-byte cryptographic salt, and hashed via SHA-256 before contract deposit:
                </p>
                <CodeSnippet
                  title="Cryptographic Commitment Definition"
                  language="typescript"
                  code={`const canonical = canonicalJson({
  id: "req_9f8e7d6c",
  orderRef: "INV-2026-001",
  amountDecimal: "680.00",
  currency: "USDC",
  customerEmail: "finance@partner.example"
});

// 32-byte high-entropy salt prevents dictionary & rainbow table attacks
const commitment = crypto.createHash("sha256")
  .update(Buffer.concat([Buffer.from(canonical, "utf8"), saltBytes]))
  .digest("hex");`}
                />
              </div>

              <div style={{ marginTop: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 650, marginBottom: "0.5rem" }}>
                  Auditor Scoped View Keys
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  Merchants can issue time-limited, scoped view keys to authorized auditors.
                  The auditor accesses the <code>/app/auditor</code> console, loads the encrypted envelope,
                  and decrypts it using their key grant. The system re-hashes the decrypted payload and verifies
                  that it matches the on-chain commitment anchored on NEAR Testnet.
                </p>
              </div>
            </section>

            {/* Section 3: Smart Escrow on NEAR */}
            <section id="escrow" className="docs-section">
              <span className="lp-step-pill">3 · Smart Contracts</span>
              <h2 className="docs-title">Smart Escrow on NEAR Testnet (AD-1 &amp; AD-2)</h2>
              <p className="docs-lead">
                Built in Rust using <code>near-sdk</code> and deployed on NEAR Testnet.
                Funds are held autonomously by the contract rather than in custodial bank accounts.
              </p>

              <div className="docs-contracts-table">
                <div className="docs-contract-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>Escrow Contract</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      Holds deposits, automates overpayment splits, and executes timeout refunds
                    </div>
                  </div>
                  <HashBadge
                    value={ESCROW_CONTRACT_ID}
                    href={`https://testnet.nearblocks.io/address/${ESCROW_CONTRACT_ID}`}
                  />
                </div>

                <div className="docs-contract-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>NEP-141 USDC Token</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      6-decimal compliant testnet fungible token with ft_transfer_call support
                    </div>
                  </div>
                  <HashBadge
                    value={USDC_CONTRACT_ID}
                    href={`https://testnet.nearblocks.io/address/${USDC_CONTRACT_ID}`}
                  />
                </div>

                <div className="docs-contract-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>Backend Operator Key</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      Automated settlement relayer and gas sponsor for seamless checkout
                    </div>
                  </div>
                  <HashBadge
                    value={OPERATOR_ACCOUNT_ID}
                    href={`https://testnet.nearblocks.io/address/${OPERATOR_ACCOUNT_ID}`}
                  />
                </div>
              </div>

              <div className="docs-grid-2" style={{ marginTop: "1.75rem" }}>
                <div className="docs-card">
                  <div className="docs-card-title">Automated Overpayment Split</div>
                  <p className="docs-card-body">
                    If a buyer sends 700 USDC for a 680 USDC invoice, the escrow contract releases 680 USDC
                    to the merchant and automatically refunds the 20 USDC excess to the buyer in the exact same transaction.
                  </p>
                </div>
                <div className="docs-card">
                  <div className="docs-card-title">Fail-Safe Emergency Exit</div>
                  <p className="docs-card-body">
                    If an invoice expires without completion, the buyer can call <code>claim_refund</code> directly
                    on the contract to reclaim their tokens, even if the Ledgerly backend is offline or unreachable.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4: Developer REST API */}
            <section id="api" className="docs-section">
              <span className="lp-step-pill">4 · Integration</span>
              <h2 className="docs-title">Developer REST API (AD-10)</h2>
              <p className="docs-lead">
                Integrate Ledgerly into your billing, ERP, or e-commerce workflow using idempotent JSON endpoints hosted on our live production environment.
              </p>

              {/* Live Production API Environment Banner */}
              <div className="docs-api-banner">
                <div className="docs-api-banner-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0, flexWrap: "wrap" }}>
                    <span className="status-pill status-pill-emerald">
                      <span className="status-pill-dot" aria-hidden="true" />
                      <span>Live Production API</span>
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Railway Hosted · NEAR Testnet Connected</span>
                  </div>
                  <div className="docs-api-banner-actions">
                    <a
                      href="https://tryledgerly.up.railway.app/api/health"
                      target="_blank"
                      rel="noreferrer"
                      className="lp-rail-chip"
                    >
                      <span>GET /api/health</span>
                      <ArrowUpRight className="w-3 h-3 text-[var(--accent-primary)]" aria-hidden="true" />
                    </a>
                    <a
                      href="https://tryledgerly.up.railway.app/api/v1/state"
                      target="_blank"
                      rel="noreferrer"
                      className="lp-rail-chip"
                    >
                      <span>GET /api/v1/state</span>
                      <ArrowUpRight className="w-3 h-3 text-[var(--accent-primary)]" aria-hidden="true" />
                    </a>
                  </div>
                </div>

                <div className="docs-api-url-bar">
                  <span className="docs-api-url-label">BASE URL:</span>
                  <a
                    href="https://tryledgerly.up.railway.app/"
                    target="_blank"
                    rel="noreferrer"
                    className="docs-api-url-link"
                  >
                    <span>https://tryledgerly.up.railway.app</span>
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              </div>

              {/* Endpoint 1: Create Invoice */}
              <div style={{ marginBottom: "2rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem" }}>
                  <span className="status-pill" style={{ background: "rgba(59, 130, 246, 0.12)", color: "#60A5FA", border: "1px solid rgba(59, 130, 246, 0.28)", fontSize: "0.68rem", padding: "0.14rem 0.48rem" }}>
                    POST
                  </span>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 650, margin: 0 }}>
                    1. Create Non-Custodial Invoice (Payment Request)
                  </h3>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.65rem" }}>
                  Issues an idempotent escrow payment request. Encrypts sensitive metadata off-chain and anchors the cryptographic commitment to NEAR testnet.
                </p>
                <CodeSnippet
                  title="cURL — Create Payment Request"
                  language="bash"
                  code={`curl -X POST https://tryledgerly.up.railway.app/api/v1/actions \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "CREATE_PAYMENT_REQUEST",
    "orderRef": "INV-2026-088",
    "amountDecimal": "250.00",
    "customerEmail": "billing@client.com"
  }'`}
                />
                <div style={{ marginTop: "0.65rem" }}>
                  <CodeSnippet
                    title="Response (200 OK)"
                    language="json"
                    code={`{
  "ok": true,
  "action": "CREATE_PAYMENT_REQUEST",
  "result": {
    "id": "pr_a1b2c3d4",
    "orderRef": "INV-2026-088",
    "amountDecimal": "250.00",
    "currency": "USDC",
    "status": "OPEN",
    "escrowId": "e738c4ab...24ef",
    "commitment": "8f4a13b6...99c2",
    "checkoutUrl": "https://tryledgerly.up.railway.app/checkout/pr_a1b2c3d4"
  }
}`}
                  />
                </div>
              </div>

              {/* Endpoint 2: Query Live State */}
              <div style={{ marginBottom: "2rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem" }}>
                  <span className="status-pill" style={{ background: "rgba(52, 211, 153, 0.12)", color: "#34D399", border: "1px solid rgba(52, 211, 153, 0.28)", fontSize: "0.68rem", padding: "0.14rem 0.48rem" }}>
                    GET
                  </span>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 650, margin: 0 }}>
                    2. Query Live Protocol State
                  </h3>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.65rem" }}>
                  Fetches active escrow invoices, cross-border remittances, settled totals, verified accounting entries, and network configuration.
                </p>
                <CodeSnippet
                  title="cURL — Query State"
                  language="bash"
                  code={`curl -X GET https://tryledgerly.up.railway.app/api/v1/state`}
                />
                <div style={{ marginTop: "0.65rem" }}>
                  <CodeSnippet
                    title="Response (200 OK)"
                    language="json"
                    code={`{
  "ok": true,
  "state": {
    "network": "testnet",
    "escrowContractId": "ledgerly-escrow-9e70f9ea.testnet",
    "usdcContractId": "ledgerly-usdc-a627a4c0.testnet",
    "totalSettledUsdc": "11,110.00",
    "varianceInvariant": "0.00",
    "paymentRequestsCount": 4,
    "remittancesCount": 3
  }
}`}
                  />
                </div>
              </div>

              {/* Endpoint 3: System Health */}
              <div style={{ marginBottom: "2rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem" }}>
                  <span className="status-pill" style={{ background: "rgba(52, 211, 153, 0.12)", color: "#34D399", border: "1px solid rgba(52, 211, 153, 0.28)", fontSize: "0.68rem", padding: "0.14rem 0.48rem" }}>
                    GET
                  </span>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 650, margin: 0 }}>
                    3. System Health &amp; Worker Heartbeats
                  </h3>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.65rem" }}>
                  Validates persistent SQLite storage, live NEAR RPC endpoint availability, and background reconciliation worker health.
                </p>
                <CodeSnippet
                  title="cURL — Health Check"
                  language="bash"
                  code={`curl -X GET https://tryledgerly.up.railway.app/api/health`}
                />
                <div style={{ marginTop: "0.65rem" }}>
                  <CodeSnippet
                    title="Response (200 OK)"
                    language="json"
                    code={`{
  "status": "ok",
  "runtimeMode": "NEAR_TESTNET_RPC",
  "db": "ok",
  "rpc": "reachable",
  "workers": {
    "running": true,
    "heartbeatAgesMs": {
      "indexer": 1240,
      "reconciliation": 1238
    }
  }
}`}
                  />
                </div>
              </div>

              {/* Endpoint 4: Testnet Faucet */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem" }}>
                  <span className="status-pill" style={{ background: "rgba(59, 130, 246, 0.12)", color: "#60A5FA", border: "1px solid rgba(59, 130, 246, 0.28)", fontSize: "0.68rem", padding: "0.14rem 0.48rem" }}>
                    POST
                  </span>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 650, margin: 0 }}>
                    4. Fund USDC from Testnet Faucet
                  </h3>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.65rem" }}>
                  Mints 500.00 NEP-141 Testnet USDC directly to any target testnet account for end-to-end integration testing.
                </p>
                <CodeSnippet
                  title="cURL — Faucet Testnet USDC"
                  language="bash"
                  code={`curl -X POST https://tryledgerly.up.railway.app/api/v1/actions \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "FAUCET_USDC",
    "accountId": "your-account.testnet"
  }'`}
                />
              </div>
            </section>

            {/* Section 5: Verifiable Accounting */}
            <section id="accounting" className="docs-section">
              <span className="lp-step-pill">5 · Compliance</span>
              <h2 className="docs-title">Verifiable Double-Entry Accounting (AD-5)</h2>
              <p className="docs-lead">
                Every business event automatically writes mathematical double-entry journal legs
                stored in integer minor units (<code>bigint</code>), guaranteeing a $0.00 net variance invariant (<code>&Sigma; debits == &Sigma; credits</code>).
              </p>

              <div className="docs-card">
                <div className="docs-card-title">Ready for QuickBooks &amp; Xero CSV Export</div>
                <p className="docs-card-body" style={{ marginBottom: "0.75rem" }}>
                  Both the merchant console and the auditor portal feature one-click CSV ledger export, formatted for standard accounting software with account codes, debit/credit columns, and transaction hash anchors.
                </p>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <span className="lp-rail-chip">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>General Ledger Journal</span>
                  </span>
                  <span className="lp-rail-chip">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Auditor Trail Log</span>
                  </span>
                  <span className="lp-rail-chip">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Balance Variance Invariant</span>
                  </span>
                </div>
              </div>
            </section>

            {/* Section 6: Threat Model */}
            <section id="threat-model" className="docs-section">
              <span className="lp-step-pill">6 · Security</span>
              <h2 className="docs-title">Threat Model &amp; Security Roadmap</h2>
              <p className="docs-lead">
                Comprehensive security posture and key custody boundary analysis.
              </p>

              <div className="docs-grid-2">
                <div className="docs-card">
                  <div className="docs-card-title">Protected Threats</div>
                  <ul style={{ paddingLeft: "1.2rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <li>Public chain observers and competitors sniffing financial volumes.</li>
                    <li>Dictionary attacks via high-entropy 32-byte salts per payload.</li>
                    <li>Passive tampering of off-chain database records detected via hash mismatch.</li>
                  </ul>
                </div>

                <div className="docs-card">
                  <div className="docs-card-title">Hardening Roadmap</div>
                  <ul style={{ paddingLeft: "1.2rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <li><strong>Proposal A:</strong> Master-Key AES-256-GCM encryption at rest via external KMS (Vault/AWS/GCP).</li>
                    <li><strong>Proposal B:</strong> Client-side browser-based WebCrypto auditor key generation.</li>
                    <li><strong>Proposal C:</strong> Confidential Computing inside TEE (Intel SGX / AMD SEV).</li>
                  </ul>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
