# Ledgerly System & Codebase Audit Report

**Audit Date**: 2026-11-08  
**Scope**: Codebase audit (`Next.js 16`, `Rust near-sdk 5.5` smart contracts, `node:sqlite` persistence, API layer, workers, and git history).  
**Rules & Constraints**: Read-only investigation. No repository code altered; report compiled in `docs/AUDIT.md`.

---

## 1. Executive Summary & Verification Stats

| Metric | Measured / Audited Value | Documented / Claimed Value | Status |
|:---|:---|:---|:---|
| **Vitest Tests Passing** | **59 passed** (12 test files) | 59 (Badge) / 49 (README line 142) | **Discrepancy in README text** |
| **Node.js Compatibility** | Requires **Node.js >= 22.13.0** (or Node 24+) for `node:sqlite` without flags | `Node >= 22.0.0` | **Incorrect in README** |
| **Hackathon Commit Window**| 38 commits (2026-11-05 to 2026-11-08) | Baseline: 2026-10-19 | **100% Inside Hackathon Window** |
| **Committed Secrets** | 0 private keys or tokens committed in git history | 0 leaked secrets | **Clean** |
| **Escrow Contracts** | `ledgerly-escrow-9e70f9ea.testnet`, `ledgerly-usdc-a627a4c0.testnet` | Testnet deployed & verified | **Supported** |
| **Off-chain Privacy** | AES-256-GCM + X25519 DEK wrapping + SHA-256 commitments | Fully confidential off-chain records | **Supported** |

---

## 2. Section 1: Real vs. Mocked Operations

Audit of core protocol operations to verify whether code executes against live networks/cryptographic primitives or uses simulation/mocks.

| Operation / Feature | Operational Status | Evidence (File + Line / Command) | Technical Mechanism & Notes |
|:---|:---|:---|:---|
| **NEAR Escrow Register (`register`)** | **REAL** (Dual Mode: Real on Testnet RPC, Mock in Sandbox) | [`src/shared/near-rpc-gateway.ts#L645-L665`](file:///home/zeth/Desktop/Ledgerly/src/shared/near-rpc-gateway.ts#L645-L665)<br>[`contracts/ledgerly-escrow/src/lib.rs#L118-L151`](file:///home/zeth/Desktop/Ledgerly/contracts/ledgerly-escrow/src/lib.rs#L118-L151) | In `NEAR_TESTNET_RPC` mode, signs with Borsh/Ed25519 and broadcasts `register` transaction to `ledgerly-escrow-9e70f9ea.testnet`. In `LOCAL_SANDBOX_SIMULATION`, handled by [`MockChainGateway`](file:///home/zeth/Desktop/Ledgerly/src/shared/mocks.ts#L465-L480). |
| **NEAR Escrow Deposit (`ft_transfer_call`)** | **REAL** (Live Wallet & RPC) | [`src/app/checkout/_checkout-portal.tsx#L584-L593`](file:///home/zeth/Desktop/Ledgerly/src/app/checkout/_checkout-portal.tsx#L584-L593)<br>[`src/shared/near-rpc-gateway.ts#L782-L800`](file:///home/zeth/Desktop/Ledgerly/src/shared/near-rpc-gateway.ts#L782-L800) | In browser checkout with Meteor Wallet connected, user signs a real NEP-141 `ft_transfer_call` to `ledgerly-escrow` on NEAR Testnet. Backend relayer also executes real `ft_transfer_call` via `NearRpcChainGateway.simulateDeposit`. |
| **NEAR Escrow Release (`release`)** | **REAL** (Dual Mode) | [`src/shared/near-rpc-gateway.ts#L667-L685`](file:///home/zeth/Desktop/Ledgerly/src/shared/near-rpc-gateway.ts#L667-L685)<br>[`contracts/ledgerly-escrow/src/lib.rs#L278-L282`](file:///home/zeth/Desktop/Ledgerly/contracts/ledgerly-escrow/src/lib.rs#L278-L282) | Real cross-contract function call from operator account to `ledgerly-escrow` invoking `release` with 50 Tgas. In sandbox mode, handled by `MockChainGateway.release`. |
| **NEAR Escrow Refund (`refund`)** | **REAL** (Dual Mode) | [`src/shared/near-rpc-gateway.ts#L687-L703`](file:///home/zeth/Desktop/Ledgerly/src/shared/near-rpc-gateway.ts#L687-L703)<br>[`contracts/ledgerly-escrow/src/lib.rs#L284-L294`](file:///home/zeth/Desktop/Ledgerly/contracts/ledgerly-escrow/src/lib.rs#L284-L294) | Real cross-contract function call to `ledgerly-escrow` returning held tokens to original depositor. In sandbox mode, handled by `MockChainGateway.refund`. |
| **NEAR Escrow Root Anchor (`anchor`)** | **REAL** (Dual Mode) | [`src/shared/near-rpc-gateway.ts#L705-L717`](file:///home/zeth/Desktop/Ledgerly/src/shared/near-rpc-gateway.ts#L705-L717)<br>[`contracts/ledgerly-escrow/src/lib.rs#L316-L321`](file:///home/zeth/Desktop/Ledgerly/contracts/ledgerly-escrow/src/lib.rs#L316-L321) | Calls `anchor(log_root)` on-chain and emits `EVENT_JSON:{"event":"log_anchored"}`. Live testnet tx confirmed: [`1VQz6TK4ksKVsS7uwucPg3B2y3bnFMDghAdfo1RZNWG`](https://testnet.nearblocks.io/txns/1VQz6TK4ksKVsS7uwucPg3B2y3bnFMDghAdfo1RZNWG). |
| **Fail-Safe User Exit (`claim_refund`)** | **REAL on contract / MOCK in sandbox** | [`contracts/ledgerly-escrow/src/lib.rs#L299-L313`](file:///home/zeth/Desktop/Ledgerly/contracts/ledgerly-escrow/src/lib.rs#L299-L313)<br>[`src/shared/mocks.ts#L529-L551`](file:///home/zeth/Desktop/Ledgerly/src/shared/mocks.ts#L529-L551) | Smart contract contains fully implemented `claim_refund` permitting depositor-only exit after `refund_after` timestamp. No automated backend client initiates this (by design, user-invoked). Simulated in `MockChainGateway.simulateUserClaimRefund`. |
| **1Click Quote (dry: true)** | **REAL** (Live HTTP with local fallback) | [`src/shared/one-click-client.ts#L305-L426`](file:///home/zeth/Desktop/Ledgerly/src/shared/one-click-client.ts#L305-L426)<br>`POST https://1click.chaindefuser.com/v0/quote` | Sends live HTTP requests to NEAR Intents solver network with timeout (2200ms). If solver endpoint returns 200, returns real market quotes. Falls back to `buildOracleFallbackQuote` (line 229) if offline or rate-limited. |
| **1Click Quote (dry: false)** | **REAL** (Live HTTP with local fallback) | [`src/shared/one-click-client.ts#L327-L414`](file:///home/zeth/Desktop/Ledgerly/src/shared/one-click-client.ts#L327-L414) | Sends live `dry: false` payload to 1Click API. Verified live in testing: returns active solver correlation ID and live intent parameters. |
| **1Click Deposit Address** | **REAL** (Live API generated with FNV-1a fallback) | [`src/shared/one-click-client.ts#L378-L401`](file:///home/zeth/Desktop/Ledgerly/src/shared/one-click-client.ts#L378-L401)<br>Fallback: [`src/shared/one-click-client.ts#L140-L176`](file:///home/zeth/Desktop/Ledgerly/src/shared/one-click-client.ts#L140-L176) | Verified live: `OneClickClient` receives live address (e.g. `9HSWuranHanr...`) from solver network. If offline, derives deterministic fallback address (`0x...`, `bc1q...`, Base58) using FNV-1a generator. |
| **"Simulate Solver Settlement"** | **MOCK / SIMULATION** | [`src/app/checkout/_checkout-portal.tsx#L448-L466`](file:///home/zeth/Desktop/Ledgerly/src/app/checkout/_checkout-portal.tsx#L448-L466)<br>[`src/app/api/v1/actions/route.ts#L62-L83`](file:///home/zeth/Desktop/Ledgerly/src/app/api/v1/actions/route.ts#L62-L83) | Bypasses actual cross-chain deposit. Invokes `SIMULATE_BUYER_DEPOSIT` with `payer: solver.<chain>.near`, directly funding the NEAR escrow contract to emulate intent fulfillment. |
| **Off-Ramp Pool / Payout** | **MOCK** | [`src/shared/mocks.ts#L382-L429`](file:///home/zeth/Desktop/Ledgerly/src/shared/mocks.ts#L382-L429)<br>[`src/app/api/_runtime.ts#L161`](file:///home/zeth/Desktop/Ledgerly/src/app/api/_runtime.ts#L161) | `MockOffRampAdapter` generates synthetic payout references (`payout_<country>_<seq>`) based on configured mode (`SUCCESS`, `TRANSIENT_FAILURE`, `PERMANENT_FAILURE`). Releases funds on-chain to placeholder account `offramp-pool.ledgerly.testnet`. |
| **Sanctions / OFAC Screening** | **MOCK** | [`src/shared/mocks.ts#L431-L451`](file:///home/zeth/Desktop/Ledgerly/src/shared/mocks.ts#L431-L451)<br>[`src/modules/remittance/application/use-cases.ts#L173-L181`](file:///home/zeth/Desktop/Ledgerly/src/modules/remittance/application/use-cases.ts#L173-L181) | Simple in-memory string matching against `["sanctioned", "ofac-blocked", "lazarus"]`. If matched, remittance aggregate transitions to `BLOCKED`. No external sanctions database connected. |
| **FATF Travel Rule Payload** | **REAL Validation & Encryption / MOCK Transmission** | [`src/modules/compliance/domain/compliance.ts#L50-L74`](file:///home/zeth/Desktop/Ledgerly/src/modules/compliance/domain/compliance.ts#L50-L74)<br>[`src/modules/remittance/application/use-cases.ts#L152-L160`](file:///home/zeth/Desktop/Ledgerly/src/modules/remittance/application/use-cases.ts#L152-L160) | Enforces mandatory originator & beneficiary identity when remittance $\ge 1,000$ USDC. Real AES-256-GCM envelope sealing and commitment hashing. Inter-VASP protocol transmission (IVMS 101/TRP) is not implemented. |
| **FX Rates (Live vs. Fallback)** | **REAL** (Dual External Providers with Static Fallback) | [`src/shared/real-fx-adapter.ts#L96-L136`](file:///home/zeth/Desktop/Ledgerly/src/shared/real-fx-adapter.ts#L96-L136)<br>Primary: `open.er-api.com`<br>Secondary: `api.frankfurter.dev` | Real live rates fetched from open forex APIs with 60s in-memory caching. Falls back to `DEFAULT_FALLBACK_RATES` (line 15) only if both primary and secondary network requests fail. |
| **"Verified on NEAR" Badge** | **STATIC MOCK (UNSUPPORTED)** | [`src/app/checkout/_checkout-portal.tsx#L2118-L2121`](file:///home/zeth/Desktop/Ledgerly/src/app/checkout/_checkout-portal.tsx#L2118-L2121)<br>[`src/app/app/merchant/page.tsx#L510-L512`](file:///home/zeth/Desktop/Ledgerly/src/app/app/merchant/page.tsx#L510-L512) | Static UI pill with a green checkmark. Rendered unconditionally; does not perform any on-chain query or verification check against transaction state. |
| **"Reconciled / Zero Discrepancies" Badge** | **REAL** | [`src/workers/reconciliation-worker.ts#L32-L98`](file:///home/zeth/Desktop/Ledgerly/src/workers/reconciliation-worker.ts#L32-L98)<br>[`src/app/app/auditor/page.tsx#L347-L367`](file:///home/zeth/Desktop/Ledgerly/src/app/app/auditor/page.tsx#L347-L367) | Real calculation executed by `ReconciliationWorker.runOnce()`. Compares aggregate expected held balance with `ledgerly-escrow` balance via `getEscrow()`. Displays "Reconciled" only when discrepancy array is empty. |

---

## 3. Section 2: Claims Audit

Detailed audit of capabilities claimed in `README.md` and user-facing UI screens.

| # | Claim / Documented Sentence | Location | Audit Rating | Evidence & Verification Analysis |
|:---|:---|:---|:---:|:---|
| 1 | *"Confidential by Default: Business metadata is encrypted off-chain via AES-256-GCM and ephemeral X25519 key agreements. Only opaque 32-byte commitments are registered on-chain."* | `README.md:24-25` | **SUPPORTED** | Implemented in [`src/modules/privacy/domain/envelope.ts`](file:///home/zeth/Desktop/Ledgerly/src/modules/privacy/domain/envelope.ts). Tested in `tests/privacy.test.ts`. Payloads are encrypted with unique DEKs; smart contract only stores 32-byte hex commitment (`sha256(canonicalJSON(payload) \|\| salt)`). |
| 2 | *"Audit-Ready Selective Disclosure: Regulators and external auditors receive scoped, time-bound X25519 view keys to decrypt and verify invoices against immutable on-chain commitments"* | `README.md:25-26` | **SUPPORTED** | Implemented in [`src/modules/privacy/domain/view-key-grant.ts`](file:///home/zeth/Desktop/Ledgerly/src/modules/privacy/domain/view-key-grant.ts) and [`DisclosureUseCases`](file:///home/zeth/Desktop/Ledgerly/src/modules/privacy/application/use-cases.ts). Auditor decrypts DEKs using their X25519 private key and checks canonical hash against on-chain escrow commitment. |
| 3 | *"Fail-Safe Depositor Refund (`claim_refund`) ... even if the backend is down."* | `README.md:26, 105-106` | **SUPPORTED** | Implemented in Rust contract ([`contracts/ledgerly-escrow/src/lib.rs#L299`](file:///home/zeth/Desktop/Ledgerly/contracts/ledgerly-escrow/src/lib.rs#L299)). Depositor can invoke transaction directly on NEAR Testnet after `refund_after` timestamp elapses, even when contract is paused. |
| 4 | *"Double-Entry Balanced Accounting: Every settlement, refund, and fee posts balanced debit/credit legs (Σ debits == Σ credits), exportable directly to ERP-ready CSV"* | `README.md:27-28` | **SUPPORTED** | Implemented in [`src/modules/ledger/domain/ledger.ts`](file:///home/zeth/Desktop/Ledgerly/src/modules/ledger/domain/ledger.ts). `validateBalancedLegs` enforces zero-sum debits/credits. Export function `exportLedgerToCsv` generates valid RFC-4180 CSV with standard accounting codes (1010, 4000, 2010, etc.). |
| 5 | *"NEAR Intents 1Click Multichain Rail: Allows clients to pay invoices from any blockchain (Solana, Base, Ethereum, Arbitrum, Bitcoin) while solvers automatically execute cross-chain settlement"* | `README.md:99-101` | **PARTIAL** | Live quote endpoint and deposit address generation work via `1click.chaindefuser.com`. However, cross-chain solver fulfillment on testnet relies on a simulation button (`action: "SIMULATE_BUYER_DEPOSIT"`) rather than automated solver settlement from Solana/Bitcoin testnets. |
| 6 | *"Native Meteor PostMessenger Extension Bridge: Direct integration with window.meteorCom without vulnerable third-party wrapper libraries."* | `README.md:101-103` | **SUPPORTED** | Implemented in [`src/shared/near-wallet-client.ts#L104-L210`](file:///home/zeth/Desktop/Ledgerly/src/shared/near-wallet-client.ts#L104-L210). Handshakes directly with `window.meteorCom` postMessage protocol, encodes unsigned Borsh transactions, and signs live `ft_transfer_call`. |
| 7 | *"Zero-Dependency SQLite Persistence (`node:sqlite`): Runs native ACID WAL persistence in Node.js v24."* | `README.md:103-105` | **SUPPORTED** | Implemented in [`src/shared/sqlite-persistence.ts`](file:///home/zeth/Desktop/Ledgerly/src/shared/sqlite-persistence.ts). Uses Node's built-in `DatabaseSync` in WAL mode without any external npm SQLite libraries (`better-sqlite3`, `sqlite3`). |
| 8 | *"FATF Travel Rule & Sanctions Screening: Automated threshold checks on remittances ≥ $1,000 USDC... and sanctions screening integration with automatic aggregate blocking."* | `README.md:107-109` | **PARTIAL** | Travel Rule threshold check and PII encryption are fully implemented in domain logic. Sanctions screening uses a mock adapter with a hardcoded blocklist (`MockScreeningAdapter`). Inter-VASP communication network is not implemented. |
| 9 | *"Zero protocol fees"* | `README.md:180`, `src/app/checkout/_checkout-portal.tsx:1356` | **SUPPORTED** | Protocol fee on direct merchant checkout is 0%. Remittance quotes enforce a transparent 0.5% protocol fee (or min 0.50 USDC) for fiat corridors in [`src/shared/real-fx-adapter.ts#L208-L214`](file:///home/zeth/Desktop/Ledgerly/src/shared/real-fx-adapter.ts#L208-L214). |
| 10 | *"100% live real-time APIs for 1Click crypto oracles and forex remittance"* | Git commit `86fe8ce` | **SUPPORTED** | Both `RealFxAdapter` (`open.er-api.com` / `api.frankfurter.dev`) and `OneClickClient` (`1click.chaindefuser.com`) query live external production APIs. |
| 11 | *"Verified on NEAR"* (Status Badge) | `src/app/checkout/_checkout-portal.tsx:2120`, `src/app/app/merchant/page.tsx:511` | **UNSUPPORTED** | Rendered as a static emerald badge unconditionally. Does not verify on-chain receipt status dynamically. |
| 12 | *"Reconciled / Zero Discrepancies"* (Auditor Badge) | `src/app/app/auditor/page.tsx:364` | **SUPPORTED** | Backed by `ReconciliationWorker.runOnce()`. Dynamically reflects zero discrepancies when on-chain held balances equal aggregate requirements. |
| 13 | *"Settled Balance: 4,390.00 USDC"* | `src/app/components/LandingHeroDashboardMockup.tsx:195` | **UNSUPPORTED** | Hardcoded static SVG text on landing page mockup. Real live settled balance in `/app` is 4,540.00 USDC (due to subsequent settled invoices in database). |
| 14 | *"Node.js: v22.0.0 or higher"* | `README.md:125` | **UNSUPPORTED** | `node:sqlite` was introduced in v22.5.0 (flagged) and only runs without flags starting in **v22.13.0**. Running on Node v22.0.0 causes `ERR_UNKNOWN_BUILTIN_MODULE`. |

---

## 4. Section 3: Test Suite Audit

Comparison between repository claims and actual test runner execution.

```bash
$ npm test
✓ tests/ui-api.test.ts (1 test)
✓ tests/near-rpc-gateway.test.ts (8 tests)
✓ tests/real-fx-adapter.test.ts (5 tests)
✓ tests/sqlite-persistence.test.ts (2 tests)
✓ tests/workers.test.ts (3 tests)
✓ tests/application-use-cases.test.ts (3 tests)
✓ src/modules/remittance/domain/remittance.test.ts (12 tests)
✓ src/modules/privacy/domain/privacy.test.ts (4 tests)
✓ src/modules/payments/domain/payment-request.test.ts (10 tests)
✓ src/shared/shared.test.ts (7 tests)
✓ tests/wallet-tx-encoding.test.ts (1 test)
✓ tests/one-click-client.test.ts (3 tests)

Test Files  12 passed (12)
     Tests  59 passed (59)
  Duration  2.23s
```

| Location | Stated Test Count | Actual Test Count | Analysis & Root Cause |
|:---|:---:|:---:|:---|
| **Vitest CLI Output** | — | **59 passed** (12 files) | Clean run, zero failures, zero skipped tests. |
| **README Badge (Line 10)** | `59 Passing` | **59 passed** | Badge accurately updated in commit `bed5814`. |
| **README Text (Line 142)** | `49 unit & integration tests` | **59 passed** | **Stale documentation**. Commit `bed5814` updated the badge URL to 59, but omitted updating the bash comment text on line 142. |

---

## 5. Section 4: Node Version Compatibility & `node:sqlite`

Investigation into `node:sqlite` lifecycle across Node releases and assessment of the README prerequisite.

### Node.js Release Lifecycle for `node:sqlite`

| Node.js Version | `node:sqlite` Availability | Flag Requirement | Compatibility Assessment |
|:---|:---:|:---:|:---|
| **Node.js < 22.5.0** (e.g. 22.0.0, 22.4.0) | **Missing** | N/A (`ERR_UNKNOWN_BUILTIN_MODULE`) | **Fails immediately**. README prerequisite `Node >= 22.0.0` is invalid. |
| **Node.js 22.5.0 – 22.12.0** | Available | **Requires `--experimental-sqlite`** | **Fails without flag**. Cannot run `next dev` or `vitest` without node CLI flag injection. |
| **Node.js 22.13.0+** | Available | **Unflagged** (runs without flags) | **Supported**. Emits `ExperimentalWarning: SQLite is an experimental feature`. |
| **Node.js 23.0.0 – 23.3.0** | Available | Requires `--experimental-sqlite` | Fails without flag. |
| **Node.js 23.4.0+** | Available | **Unflagged** | Supported. |
| **Node.js 24.10.0** (Installed version) | Available | **Unflagged** | **Verified working**. Database operations run cleanly. |

> [!WARNING]
> **README Correction Needed**: The prerequisite in `README.md:125` must be updated from `Node.js: v22.0.0 or higher` to **`Node.js: v22.13.0 or higher (v24.x recommended)`**.

---

## 6. Section 5: Hosting Architecture & Operational Constraints

Analysis of statefulness, persistence requirements, and process lifecycle constraints.

| Component / Subsystem | Filesystem / Process Constraint | Behavior on Ephemeral Serverless (Vercel / AWS Lambda) | Recommended Production Target |
|:---|:---|:---|:---|
| **SQLite Database** (`.data/ledgerly.sqlite`) | **Persistent POSIX filesystem required** (`WAL`, `.shm`, `.wal` locks) | **Incompatible / High Risk**. Ephemeral serverless containers cause split-brain state, read-only errors, or complete data wipe on cold start. | Persistent container (Docker / Fly.io / Railway / VPS) with volume mount, or migration to Turso / Cloudflare D1 / hosted Postgres. |
| **ChainIndexerWorker** | **Periodic / Event-driven polling** | **Request-bound**. Currently only executed synchronously on incoming API calls (`_runtime.ts:361`). If no HTTP requests occur, on-chain deposits are not indexed. | Long-running daemon process (`setInterval(..., 3000)`) or scheduled serverless cron (e.g. Vercel Cron). |
| **SettlementWorker** | **Retry loop for off-ramp queues** | **Request-bound**. Only triggers on manual retry or when creating remittances. Failed payouts remain unretried without incoming triggers. | Background task runner (BullMQ / Cron / standing Node worker). |
| **ExpiryWorker** | **Timestamp timeout sweeps** | **Request-bound**. Quote locks and invoice expiries only transition when `/api/v1/state` is called. | Background cron job running every 60 seconds. |
| **Runtime In-Memory State** (`globalThis.__ledgerlyRuntime`) | **Single-process singleton** | Multiple serverless lambdas instantiate isolated runtime instances with divergent mock chain gateways. | Redis/PostgreSQL coordination or stateful single-instance Node server. |

---

## 7. Section 6: Cryptographic Key Custody & Decryption Capabilities

Audit of X25519 key agreements, envelope encryption, and access boundaries.

| Key / Material | Storage Location | Custodian | Decryption Scope & Capabilities | Security Assessment |
|:---|:---|:---|:---|:---|
| **Organization Private Key** (`orgKeys.privateKeyHex`) | `.data/ledgerly.sqlite` table `runtime_meta` (key: `org_keys`) | **Server / Operator** | Can unwrap all initial DEKs and decrypt **all business payloads** across payments and remittances. | **Server-side custody**. Plaintext DER in SQLite. Vulnerable to server host compromise. |
| **Auditor Private Key** (`auditorKeys.privateKeyHex`) | `.data/ledgerly.sqlite` table `runtime_meta` (key: `auditor_keys`) | **Server / Operator** (shared with auditor view) | Can decrypt all records within active `ViewKeyGrant` scopes. | **No client-side custody**. The backend executes `verifyScopedRecordsAsAuditor` on behalf of the auditor and transmits decrypted JSON to the browser. |
| **Ephemeral Keypairs** (DEK Wrapping) | Ephemeral in-memory during `wrapDekForRecipient` | Transient | One-time key agreement per record; discarded immediately after wrapping. | **Correct**. Follows standard ephemeral-static ECDH best practices. |
| **NEAR Operator Key** (`NEAR_OPERATOR_PRIVATE_KEY`) | `.env.local` | **Backend Operator** | Full transaction signing authority on `ledgerly-escrow` (can execute `release`, `refund`, and `anchor`). | Kept out of git. Handled via environment variables. |

---

## 8. Section 7: Data Inconsistencies Deep-Dive

Investigation of numerical, status, and verification anomalies observed across interfaces.

| Anomaly / Symptom | UI Surface Observed | Root Cause Analysis | Code Evidence |
|:---|:---|:---|:---|
| **4,390 USDC vs. 4,540 USDC Settled Balance** | Landing page: **4,390 USDC**<br>`/app` Overview: **4,540 USDC** | The landing page uses a **static hardcoded SVG/Canvas graphic** (`LandingHeroDashboardMockup.tsx` & `LandingHeroDashboard3D.tsx`) based on earlier seed data (2,040 checkout + 2,350 remitted = 4,390). In `/app/page.tsx`, the balance is computed **dynamically from the live SQLite database** (`state.paymentRequests` + `state.remittances`). Subsequent test checkout settlements (`pr_mw6h36gh` +150 USDC) raised the live total to 4,540 USDC. | [`src/app/components/LandingHeroDashboardMockup.tsx#L195-L205`](file:///home/zeth/Desktop/Ledgerly/src/app/components/LandingHeroDashboardMockup.tsx#L195-L205)<br>[`src/app/app/page.tsx#L56-L64`](file:///home/zeth/Desktop/Ledgerly/src/app/app/page.tsx#L56-L64) |
| **Auditor Shows "Unverified (1)"** | `/app/auditor` filter pill: `Unverified (1)` | Remittance `rm_mw6g1y6t` expired before it was funded. Remittances register their escrows **inline upon initial funding** on NEAR. Because `rm_mw6g1y6t` was never funded on-chain, calling `get_escrow()` on `ledgerly-escrow.testnet` returns `null`. Hence `verifiedOnchain === false`. | [`src/modules/privacy/application/use-cases.ts#L185-L195`](file:///home/zeth/Desktop/Ledgerly/src/modules/privacy/application/use-cases.ts#L185-L195)<br>[`contracts/ledgerly-escrow/src/lib.rs#L221-L242`](file:///home/zeth/Desktop/Ledgerly/contracts/ledgerly-escrow/src/lib.rs#L221-L242) |
| **Auditor Shows "Verifying" instead of "Hash Chain Intact"** | `/app/auditor` status badge: `"Verifying"` | `state.audit.chainValid` evaluated to `false`. A race condition during concurrent background API polling caused **duplicate sequence entry #881** in SQLite `audit_log_entries` sharing the identical `prevHash` (`27483d0e9c...`). This broken hash continuity causes `verifyAuditChain` to reject the chain. | [`src/app/app/auditor/page.tsx#L272-L275`](file:///home/zeth/Desktop/Ledgerly/src/app/app/auditor/page.tsx#L272-L275)<br>[`src/modules/privacy/domain/audit-chain.ts#L36-L54`](file:///home/zeth/Desktop/Ledgerly/src/modules/privacy/domain/audit-chain.ts#L36-L54) |
| **6 of 20 Remittances are EXPIRED at 0/3 Attempts** | `/app/remittance` table: `EXPIRED (0/3)` | Remittances start in `QUOTED` status with `attempts: 0`. If the sender does not fund the escrow within the quote window (e.g. 60s), `ExpiryWorker.runOnce()` transitions the status from `QUOTED` to `EXPIRED`. The 3-attempt limit applies exclusively to **off-ramp payout retries after funding**; because funds were never deposited, 0 payout attempts were made. | [`src/workers/expiry-worker.ts#L64-L73`](file:///home/zeth/Desktop/Ledgerly/src/workers/expiry-worker.ts#L64-L73)<br>[`src/modules/remittance/domain/remittance.ts#L174-L180`](file:///home/zeth/Desktop/Ledgerly/src/modules/remittance/domain/remittance.ts#L174-L180) |

---

## 9. Section 8: Secrets Hygiene Audit

Scan of the git commit tree and working directory using regex patterns for private keys, API credentials, and secrets.

```bash
# Pattern Scan:
# (ed25519:[1-9A-HJ-NP-Za-km-z]{30,}|BEGIN (RSA|EC|OPENSSH|DSA|PGP|)?PRIVATE KEY)
# Scan Scope: All 38 commits and working tree
```

| File Path | Commit / Working Tree | Pattern Match Type | Finding & Evaluation |
|:---|:---|:---|:---|
| `.env.example` | Tracked in Git (`36db487`) | `NEAR_OPERATOR_PRIVATE_KEY=` | **Clean Placeholder**. Empty variable assignment intended as template. |
| `tests/near-rpc-gateway.test.ts` | Tracked in Git (`36db487` .. `e3b9269`) | `ed25519:...` | **Clean Synthetic Test Fixture**. Key is deterministically generated from `new Uint8Array(32).fill(7)`. No real account access. |
| `scripts/deploy-testnet.ts` | Tracked in Git (`36db487` .. `e3b9269`) | `process.env.NEAR_..._PRIVATE_KEY` | **Clean Reference**. Reads from environment; no hardcoded keys. |
| `scripts/deploy-usdc.ts` | Tracked in Git (`8e2642c` .. `e3b9269`) | `process.env.NEAR_..._PRIVATE_KEY` | **Clean Reference**. Reads from environment; no hardcoded keys. |
| `.env.local` | Untracked Working Tree | `ed25519:...` (NEAR Testnet key) | **Properly Ignored**. Matches `.gitignore` rule `.env.*`. Not committed to Git history. |
| `.data/ledgerly.sqlite` | Untracked Working Tree | X25519 Private Keys in `runtime_meta` | **Properly Ignored**. Matches `.gitignore` rule `*.sqlite`. Not committed to Git history. |

---

## 10. Section 9: Git History & Hackathon Eligibility Window

Verification of all repository commits against the hackathon eligibility baseline date (**2026-10-19**).

| # | Commit Hash | Author Date (ISO-8601) | Author | Subject | Window Status |
|:---:|:---:|:---|:---|:---|:---:|
| 1 | `547a664` | `2026-11-05T18:38:38+07:00` | Adevty | Initial commit | **Inside Window** |
| 2 | `d3825b7` | `2026-11-05T18:40:44+07:00` | fzn-sh | Initial commit | **Inside Window** |
| 3 | `b10fdc2` | `2026-11-05T18:47:33+07:00` | fzn-sh | feat: add AGENT.MD | **Inside Window** |
| 4 | `14e8101` | `2026-11-05T19:08:43+07:00` | fzn-sh | feat(contract): implement ledgerly-escrow Rust contract and chain gateway port (Module 2) | **Inside Window** |
| 5 | `096f471` | `2026-11-05T19:23:34+07:00` | fzn-sh | feat(privacy): implement envelope encryption, commitments, view key grants, and audit chain (Module 3) | **Inside Window** |
| 6 | `4993830` | `2026-11-05T19:37:42+07:00` | fzn-sh | feat(app): implement application use cases, prisma schema, rbac, compliance, and mock adapters (Module 4) | **Inside Window** |
| 7 | `70e94c2` | `2026-11-05T19:55:22+07:00` | fzn-sh | feat(workers): implement chain indexer, settlement retry, expiry, and reconciliation workers (Module 5) | **Inside Window** |
| 8 | `ce8fff7` | `2026-11-05T20:21:32+07:00` | fzn-sh | feat(ui): implement Next.js 16 interactive fintech UI, 3D particle core, and live API routes (Module 6) | **Inside Window** |
| 9 | `0127216` | `2026-11-05T20:38:58+07:00` | fzn-sh | feat(ui): redesign landing page with PaymentWaveRails and separate /app workspace | **Inside Window** |
| 10 | `9f2d966` | `2026-11-05T21:37:13+07:00` | fzn-sh | feat(ui): refactor dashboard into modular high-density layout with anti-AI-slop design | **Inside Window** |
| 11 | `36db487` | `2026-11-05T22:52:15+07:00` | fzn-sh | feat(near): add live NEAR Testnet JSON-RPC gateway, Borsh/Ed25519 signer, and deploy script | **Inside Window** |
| 12 | `6f3db25` | `2026-11-05T23:21:58+07:00` | fzn-sh | feat(checkout): add Meteor Wallet extension bridge, /checkout route, and high-density checkout UI | **Inside Window** |
| 13 | `3aa360c` | `2026-11-05T23:42:42+07:00` | fzn-sh | feat(persistence): implement zero-dependency SQLite persistence layer via node:sqlite | **Inside Window** |
| 14 | `8e2642c` | `2026-11-06T00:28:45+07:00` | fzn-sh | feat(onchain): real NEP-141 mock USDC + Meteor-signed escrow deposits | **Inside Window** |
| 15 | `aeb1c8c` | `2026-11-06T00:43:01+07:00` | fzn-sh | feat(ui): add real-time auto-sync, polling, and status transitions for checkout and dashboard | **Inside Window** |
| 16 | `fa167f7` | `2026-11-06T00:46:34+07:00` | fzn-sh | docs: add comprehensive hackathon README, live testnet explorer links, and workspace navigation | **Inside Window** |
| 17 | `604e81d` | `2026-11-06T13:21:39+07:00` | fzn-sh | feat(intents): implement NEAR Intents 1Click cross-chain payment rail | **Inside Window** |
| 18 | `86fe8ce` | `2026-11-06T13:45:01+07:00` | fzn-sh | feat(pricing): connect 100% live real-time APIs for 1Click crypto oracles and forex remittance | **Inside Window** |
| 19 | `44a2046` | `2026-11-07T11:17:40+07:00` | fzn-sh | feat(checkout): add safety warning banner and evaluation guidance for NEAR Intents cross-chain rail | **Inside Window** |
| 20 | `e04f667` | `2026-11-07T11:23:58+07:00` | fzn-sh | style(checkout): redesign cross-chain routing spec and deposit box using fintech data density principles | **Inside Window** |
| 21 | `81eac41` | `2026-11-07T11:36:08+07:00` | fzn-sh | fix(wallet): trigger instant Meteor Wallet extension network switch on Testnet/Mainnet toggle | **Inside Window** |
| 22 | `18467be` | `2026-11-07T11:54:04+07:00` | fzn-sh | fix(rpc): resolve external tx signer dynamically via Nearblocks and handle RPC timeouts gracefully | **Inside Window** |
| 23 | `173933a` | `2026-11-07T12:27:11+07:00` | fzn-sh | fix(rpc): enforce strict on-chain NEP-297 event verification and archival resolution | **Inside Window** |
| 24 | `21c1c9a` | `2026-11-07T12:35:40+07:00` | fzn-sh | feat(checkout): replace static error banner with non-blocking toast notification | **Inside Window** |
| 25 | `033727f` | `2026-11-07T12:44:43+07:00` | fzn-sh | refactor(checkout): streamline wallet connection flow with binary Connect/Disconnect controls | **Inside Window** |
| 26 | `3bd2300` | `2026-11-07T20:43:59+07:00` | fzn-sh | fix(api): prevent Unexpected end of JSON input with top-level error handling and safe JSON parsing | **Inside Window** |
| 27 | `9c54567` | `2026-11-07T21:03:13+07:00` | fzn-sh | fix(rpc): implement multi-provider failover on 429 and TTL caching for escrow view queries | **Inside Window** |
| 28 | `2c1ac76` | `2026-11-07T21:17:06+07:00` | fzn-sh | fix(indexer): parse Nearblocks v3 for wallet tx verification to bypass RPC rate limits | **Inside Window** |
| 29 | `8a9afa8` | `2026-11-07T21:29:01+07:00` | fzn-sh | fix(remittance): register offramp settlement account in USDC storage, sanitize inputs, and auto-populate travel rule | **Inside Window** |
| 30 | `86fbd56` | `2026-11-07T21:37:33+07:00` | fzn-sh | fix(remittance): cleanup redundant handler syntax and verify storage deposit on NEAR testnet | **Inside Window** |
| 31 | `c906dfa` | `2026-11-07T21:58:20+07:00` | fzn-sh | feat(remittance): expose on-chain txHash and Nearblocks explorer link for remittances | **Inside Window** |
| 32 | `fbeaad1` | `2026-11-07T22:09:59+07:00` | fzn-sh | feat(remittance): add on-chain transaction history column, telemetry banner, and interactive audit lifecycle modal | **Inside Window** |
| 33 | `f5a8040` | `2026-11-07T22:20:27+07:00` | fzn-sh | feat(auditor): add auto-reconcile action to balance on-chain escrows and clear discrepancies | **Inside Window** |
| 34 | `9086645` | `2026-11-07T22:37:16+07:00` | fzn-sh | feat(auditor): sort records newest first, add live search bar and sorting controls | **Inside Window** |
| 35 | `8d93eea` | `2026-11-07T22:49:42+07:00` | fzn-sh | feat(corridors): add AUD, SGD, KRW, and JPY currencies with live forex rates and local banking rails | **Inside Window** |
| 36 | `bed5814` | `2026-11-07T23:01:37+07:00` | fzn-sh | docs: update test count badge and repository URL in README | **Inside Window** |
| 37 | `1d3f3a1` | `2026-11-08T11:36:55+07:00` | fzn-sh | feat(ui): refine checkout flow, 1-click relayer gasless, and sleek fintech styling | **Inside Window** |
| 38 | `e3b9269` | `2026-11-08T11:50:03+07:00` | fzn-sh | fix(remittance): trigger settlement worker on dispatch and prevent contract banner overflow | **Inside Window** |

* **Total Commits**: 38  
* **Earliest Commit**: `547a664` (2026-11-05T18:38:38+07:00)  
* **Latest Commit**: `e3b9269` (2026-11-08T11:50:03+07:00)  
* **Baseline Commits (< 2026-10-19)**: **0**  
* **Hackathon Compliance**: **100% created during the hackathon**.

---

## 11. Prioritized Fix List

Actionable, prioritized recommendations for the development team before final hackathon submission:

### 🔴 High Priority (Correctness & Honesty Rule Compliance)

1. **Fix Audit Log Forking / Concurrency Bug**:
   - *Problem*: `verifyScopedRecordsAsAuditor` is called on every dashboard poll, appending audit entries with `prevHash` derived from in-memory state. Concurrent requests generated identical sequence entries (#880 and #881), breaking `verifyAuditChain` and keeping the status at `"Verifying"`.
   - *Fix*: Do not append an audit log entry on passive read-only queries (`computeDashboardSnapshot`). Only record audit entries when an explicit auditor action is taken (e.g. rotating a grant or exporting CSV), and wrap append operations in an atomic SQLite transaction.
2. **Synchronize Documentation & Node.js Version**:
   - *Problem*: `README.md:125` states `Node.js >= 22.0.0`, but `node:sqlite` was added in v22.5.0 (flagged) and requires `Node.js >= 22.13.0` to run without flags.
   - *Fix*: Update prerequisite to `Node.js >= 22.13.0 (v24.x recommended)`. Update line 142 from `49 unit & integration tests` to `59 unit & integration tests`.
3. **Make "Verified on NEAR" Badge Dynamic**:
   - *Problem*: `src/app/checkout/_checkout-portal.tsx:2120` and `merchant/page.tsx:511` display a static `"Verified on NEAR"` badge even if the transaction is pending or running in local sandbox.
   - *Fix*: Bind the badge to actual on-chain transaction confirmation (`item.latestTxHash` or `onchainStatus === 'Held' | 'Closed'`). Show `"Simulated"` when in `LOCAL_SANDBOX_SIMULATION` mode.

### 🟡 Medium Priority (Production Architecture & Operations)

4. **Background Worker Execution**:
   - *Problem*: `ChainIndexerWorker`, `SettlementWorker`, and `ExpiryWorker` only execute lazily when an HTTP request hits the API.
   - *Fix*: Add a lightweight standing interval timer in server mode or implement a scheduled cron route to guarantee asynchronous quote expiry and indexer polling when no users are browsing the frontend.
5. **Harmonize Landing Page Mockup Numbers**:
   - *Problem*: Landing page SVG mockup shows `4,390.00 USDC` while `/app` displays `4,540.00 USDC`.
   - *Fix*: Update the static SVG/Canvas mockup text in `LandingHeroDashboardMockup.tsx` and `LandingHeroDashboard3D.tsx` to match current seed figures, or display a real-time summary widget.
6. **Gracefully Handle Unfunded Remittance Auditor Verification**:
   - *Problem*: Remittances that expire in `QUOTED` state are never funded on-chain, causing `get_escrow()` to return `null` and flagging them as `Unverified (1)` in the auditor console.
   - *Fix*: Clarify in the auditor UI that unfunded expired quotes never registered an on-chain escrow, distinguishing them from on-chain commitment mismatches.

### 🟢 Low Priority (Hardening & Polish)

7. **Auditor Client-Side Key Custody**:
   - *Recommendation*: For V2, migrate auditor private key handling to WebCrypto in the browser or an auditor extension so the server does not have custody of the auditor's decryption key.
8. **Automated Travel Rule Mock Indicator**:
   - *Recommendation*: Explicitly label the Travel Rule feature in the remittance modal as `"Travel Rule Data Sealed (Off-Chain Protocol Mock)"` to satisfy the strict Honesty Rule.
