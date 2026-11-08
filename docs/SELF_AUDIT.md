# Ledgerly System & Codebase Self-Audit Report

**Audit Date**: 2026-11-08  
**Scope**: Codebase audit (`Next.js 16`, `Rust near-sdk 5.5` smart contracts, `node:sqlite` persistence, API layer, workers, and git history).  
**Post-Hardening Status**: Phase 8 Final QA verified.

---

## 1. Executive Summary & Verification Stats

| Metric | Measured / Audited Value | Documented / Claimed Value | Status |
|:---|:---|:---|:---|
| **Vitest Tests Passing** | **122 passed** (18 test files) | 122 passed (18 test files) | **Verified & Synchronized** |
| **Rust Contract Tests** | **6 passed** (0 failed) | 6 passed (0 failed) | **Verified** |
| **Node.js Compatibility** | Requires **Node.js >= 22.13.0** (Node 24 recommended) | `Node >= 22.13.0` (package.json engines & .nvmrc) | **Verified** |
| **Hackathon Commit Window**| 48 commits (2026-11-05 to 2026-11-08) | Window: 2026-10-19 to 2026-11-14 | **100% Inside Hackathon Window** |
| **Committed Secrets** | 0 private keys, tokens, or .env secrets committed | 0 leaked secrets | **Clean** |
| **Escrow Contracts** | `ledgerly-escrow-9e70f9ea.testnet`, `ledgerly-usdc-a627a4c0.testnet` | Testnet deployed & verified | **Verified On-Chain** |
| **Off-chain Privacy** | AES-256-GCM + X25519 DEK wrapping + SHA-256 commitments | Fully confidential off-chain records | **Verified** |
| **npm audit** | 0 vulnerabilities found | 0 vulnerabilities | **Verified** |

---

## 2. Section 1: Real vs. Mocked Operations

Audit of core protocol operations to verify whether code executes against live networks/cryptographic primitives or uses simulation/mocks.

| Operation / Feature | Operational Status | Evidence (Repo-Relative Path) | Technical Mechanism & Notes |
|:---|:---|:---|:---|
| **NEAR Escrow Register (`register`)** | **REAL** (Dual Mode: Real on Testnet RPC, Mock in Sandbox) | [`src/shared/near-rpc-gateway.ts`](src/shared/near-rpc-gateway.ts)<br>[`contracts/ledgerly-escrow/src/lib.rs`](contracts/ledgerly-escrow/src/lib.rs) | In `NEAR_TESTNET_RPC` mode, signs with Borsh/Ed25519 and broadcasts `register` transaction to `ledgerly-escrow-9e70f9ea.testnet`. In `LOCAL_SANDBOX_SIMULATION`, handled by `MockChainGateway`. |
| **NEAR Escrow Deposit (`ft_transfer_call`)** | **REAL** (Live Wallet & RPC) | [`src/app/checkout/_checkout-portal.tsx`](src/app/checkout/_checkout-portal.tsx)<br>[`src/shared/near-rpc-gateway.ts`](src/shared/near-rpc-gateway.ts) | In browser checkout with Meteor Wallet connected, user signs a real NEP-141 `ft_transfer_call` to `ledgerly-escrow` on NEAR Testnet. Backend relayer also executes real `ft_transfer_call` via `NearRpcChainGateway.simulateDeposit`. |
| **NEAR Escrow Release (`release`)** | **REAL** (Dual Mode) | [`src/shared/near-rpc-gateway.ts`](src/shared/near-rpc-gateway.ts)<br>[`contracts/ledgerly-escrow/src/lib.rs`](contracts/ledgerly-escrow/src/lib.rs) | Real cross-contract function call from operator account to `ledgerly-escrow` invoking `release` with 50 Tgas. In sandbox mode, handled by `MockChainGateway.release`. |
| **NEAR Escrow Refund (`refund`)** | **REAL** (Dual Mode) | [`src/shared/near-rpc-gateway.ts`](src/shared/near-rpc-gateway.ts)<br>[`contracts/ledgerly-escrow/src/lib.rs`](contracts/ledgerly-escrow/src/lib.rs) | Real cross-contract function call to `ledgerly-escrow` returning held tokens to original depositor. In sandbox mode, handled by `MockChainGateway.refund`. |
| **NEAR Escrow Root Anchor (`anchor`)** | **REAL** (Dual Mode) | [`src/shared/near-rpc-gateway.ts`](src/shared/near-rpc-gateway.ts)<br>[`contracts/ledgerly-escrow/src/lib.rs`](contracts/ledgerly-escrow/src/lib.rs) | Calls `anchor(log_root)` on-chain and emits `EVENT_JSON:{"event":"log_anchored"}`. Live testnet tx confirmed: [`1VQz6TK4ksKVsS7uwucPg3B2y3bnFMDghAdfo1RZNWG`](https://testnet.nearblocks.io/txns/1VQz6TK4ksKVsS7uwucPg3B2y3bnFMDghAdfo1RZNWG). |
| **Fail-Safe User Exit (`claim_refund`)** | **REAL on contract & gateway** | [`contracts/ledgerly-escrow/src/lib.rs`](contracts/ledgerly-escrow/src/lib.rs)<br>[`src/shared/near-rpc-gateway.ts`](src/shared/near-rpc-gateway.ts) | Smart contract contains fully implemented `claim_refund` permitting depositor-only exit after `refund_after` timestamp. Works even if backend is offline or contract is paused. Verified in `npm run demo -- --refund-path` and `npm run demo:live -- --refund-path --yes`. |
| **1Click Quote (dry: true)** | **REAL** (Live HTTP with local fallback) | [`src/shared/one-click-client.ts`](src/shared/one-click-client.ts)<br>`POST https://1click.chaindefuser.com/v0/quote` | Sends live HTTP requests to NEAR Intents solver network with timeout (2200ms). If solver endpoint returns 200, returns real market quotes. Falls back to `buildOracleFallbackQuote` if offline or rate-limited. Fees extracted from live quote. |
| **1Click Quote (dry: false)** | **REAL** (Gated behind user disclaimer) | [`src/shared/one-click-client.ts`](src/shared/one-click-client.ts) | Protected by `ENABLE_LIVE_INTENTS` and explicit user confirmation. Rejects unconfirmed live calls with 403. |
| **1Click Deposit Address** | **REAL Live / DRY-RUN by default** | [`src/shared/one-click-client.ts`](src/shared/one-click-client.ts) | Dry-run mode by default. Rejects fabricated addresses; displays honest fallback notice when solver offline. |
| **"Simulate Solver Settlement"** | **SIMULATION** (Badged from registry) | [`src/app/checkout/_checkout-portal.tsx`](src/app/checkout/_checkout-portal.tsx)<br>[`src/app/api/v1/actions/route.ts`](src/app/api/v1/actions/route.ts) | Bypasses actual cross-chain deposit. Clearly badged as `SIMULATED` from `src/lib/capabilities.ts`. Protected by `DEMO_MODE=true` in production. |
| **Off-Ramp Pool / Payout** | **MOCK** (Badged from registry) | [`src/shared/mocks.ts`](src/shared/mocks.ts)<br>[`src/app/api/_runtime.ts`](src/app/api/_runtime.ts) | `MockOffRampAdapter` generates synthetic payout references (`payout_<country>_<seq>`) based on configured mode. Explicitly badged as `MOCK`. |
| **Sanctions / OFAC Screening** | **MOCK** (Badged from registry) | [`src/shared/mocks.ts`](src/shared/mocks.ts)<br>[`src/modules/remittance/application/use-cases.ts`](src/modules/remittance/application/use-cases.ts) | In-memory string matching against test blocklist. Explicitly badged as `MOCK` in UI and documentation. |
| **FATF Travel Rule Payload** | **REAL Validation & Encryption / MOCK Transmission** | [`src/modules/compliance/domain/compliance.ts`](src/modules/compliance/domain/compliance.ts)<br>[`src/modules/remittance/application/use-cases.ts`](src/modules/remittance/application/use-cases.ts) | Enforces mandatory originator & beneficiary identity when remittance $\ge 1,000$ USDC. Real AES-256-GCM envelope sealing and commitment hashing. Inter-VASP protocol transmission is documented as not implemented. |
| **FX Rates** | **REAL** (Dual External Providers with Static Fallback) | [`src/shared/real-fx-adapter.ts`](src/shared/real-fx-adapter.ts)<br>Primary: `open.er-api.com`<br>Secondary: `api.frankfurter.dev` | Real live rates fetched from open forex APIs with 60s in-memory caching. Falls back to static rates only if network requests fail. |
| **Capability Badging** | **REAL (Dynamic Registry)** | [`src/lib/capabilities.ts`](src/lib/capabilities.ts) | All status pills (`LIVE`, `SIMULATED`, `MOCK`, `DRY-RUN`) derive strictly from typed capability registry. Zero fabricated static badges. |
| **Reconciled / Zero Discrepancies** | **REAL** | [`src/workers/reconciliation-worker.ts`](src/workers/reconciliation-worker.ts)<br>[`src/app/app/auditor/page.tsx`](src/app/app/auditor/page.tsx) | Real calculation executed by `ReconciliationWorker.runOnce()`. Compares aggregate expected held balance with `ledgerly-escrow` balance via `getEscrow()`. Displays "Reconciled" only when discrepancy array is empty. |

---

## 3. Section 2: Post-Hardening Claims Audit

| # | Claim / Documented Sentence | Location | Audit Rating | Post-Fix Verification Reality |
|:---|:---|:---|:---:|:---|
| 1 | *"Confidential by Default: Business metadata is encrypted off-chain via AES-256-GCM and ephemeral X25519 key agreements. Only opaque 32-byte commitments are registered on-chain."* | `README.md` | **SUPPORTED** | Implemented in `src/modules/privacy/domain/envelope.ts`. Payloads encrypted with unique DEKs; smart contract stores only 32-byte commitment (`sha256(canonicalJSON(payload) \|\| salt)`). |
| 2 | *"Audit-Ready Selective Disclosure: Regulators and external auditors receive scoped, time-bound X25519 view keys to decrypt and verify invoices against immutable on-chain commitments"* | `README.md` | **SUPPORTED** | Implemented in `src/modules/privacy/domain/view-key-grant.ts` and `DisclosureUseCases`. Decryption occurs server-side per `docs/THREAT_MODEL.md`; hashes verified against contract. |
| 3 | *"Fail-Safe Depositor Refund (`claim_refund`) ... even if the backend is down."* | `README.md` | **SUPPORTED** | Implemented in Rust contract (`contracts/ledgerly-escrow/src/lib.rs#L299`) and gateways. Verified via `npm run demo -- --refund-path` and live contract view. |
| 4 | *"Double-Entry Balanced Accounting: Every settlement, refund, and fee posts balanced debit/credit legs (Σ debits == Σ credits), exportable directly to ERP-ready CSV"* | `README.md` | **SUPPORTED** | Implemented in `src/modules/ledger/domain/ledger.ts`. Unit-tested by `assertBalancedDoubleEntry` in `tests/verification-helpers.test.ts`. |
| 5 | *"NEAR Intents 1Click Multichain Rail: Allows clients to pay invoices from any blockchain... while solvers execute cross-chain settlement"* | `README.md` | **SUPPORTED (HONEST)** | Accurately labeled: live quotes from solver network; testnet fulfillment simulated in sandbox; live deposit generation disabled in demo by default. |
| 6 | *"Native Meteor PostMessenger Extension Bridge: Direct integration with window.meteorCom without third-party wrapper libraries."* | `README.md` | **SUPPORTED** | Implemented in `src/shared/near-wallet-client.ts`. Signs live `ft_transfer_call` on NEAR Testnet. |
| 7 | *"Zero-Dependency SQLite Persistence (`node:sqlite`): Runs native ACID WAL persistence in Node.js v24."* | `README.md` | **SUPPORTED** | Implemented in `src/shared/sqlite-persistence.ts`. Hardened with `UNIQUE(seq)`, WAL mode, and `busy_timeout = 5000`. |
| 8 | *"FATF Travel Rule & Sanctions Screening: Automated threshold checks on remittances ≥ $1,000 USDC... and sanctions screening integration"* | `README.md` | **SUPPORTED (HONEST)** | Accurately badged as `MOCK` for sanctions screening and inter-VASP network transmission. Input validation and off-chain encryption are real. |
| 9 | *"Dynamic Honest Badging: All mocked or simulated features are explicitly badged from capability registry"* | `README.md` | **SUPPORTED** | Tested in `tests/capabilities.test.ts` (7 tests). Static badges removed. |

---

## 4. Section 3: Codebase Vulnerability Remediations

1. **SQLite Concurrency & Sequence Integrity (Task S & Task B)**:
   - Added `seq INTEGER NOT NULL UNIQUE` to `audit_log_entries`.
   - Applied `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL`.
   - Wrapped audit log appends in `BEGIN IMMEDIATE` transactions to prevent forks under concurrent writers.
   - Tested under cross-connection concurrent execution in `tests/audit-chain.test.ts`.
2. **Action Wiring & On-Chain Anchoring**:
   - `recordAuditAction` wired to: view key rotation, reconciliation export, manual/auto reconcile, grant issuance, and explicit root anchoring.
   - Passive reads strictly do not write to audit log.
3. **Validation & Overflow Protection (Task E)**:
   - Strict `validateInvoiceRef`, `validateUsdcAmount`, `validateCustomerEmail`, and `validateRemittanceInput`.
   - Fixed table layout overflow and truncation in CSS (`.ledger-table-wrap`, sticky columns).
4. **Runnable Verification Scripts (Task D)**:
   - `npm run demo` (offline sandbox with 7-step assertions, balanced books, and `--refund-path`).
   - `npm run verify:onchain` (100% keyless verification of contracts and 5 README transactions).
   - `npm run demo:live` (live testnet verification with safety guardrails requiring `--yes`).
5. **Runtime Reproducibility & Deployment (Task F)**:
   - Set `"engines": { "node": ">=22.13.0" }` and `.nvmrc: 24`.
   - Built background worker runner (`src/workers/runner.ts`) with standing intervals, HMR guard, and SIGTERM shutdown.
   - Created `/api/health` monitoring endpoint.
   - Hardened simulation endpoints with IP rate-limiting, `DEMO_MODE`, and `DEMO_ADMIN_TOKEN`.
   - Multi-stage non-root `Dockerfile` and `docs/DEPLOY.md`.
