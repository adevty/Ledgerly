# AGENT.md — Ledgerly

> **Single source of truth** for any human or AI agent working on this repository.
> Read this file completely **before** doing any task. If something here conflicts with your assumptions, this file wins. If something here conflicts with the user's latest explicit instruction, the user wins — then update this file.

Last updated: 2026-11-05 · Hackathon deadline: **~2026-11-13 (8 days from 2026-11-05)**

---

## 1. Project Overview

| | |
|---|---|
| **Name** | Ledgerly |
| **One-liner** | Confidential, audit-ready merchant payments and cross-border remittances on NEAR — "Stripe + Wise, but private by default and provable to auditors." |
| **Hackathon track** | *"Bring the boring money onchain"* — payroll, invoicing, remittances, merchant payments and stablecoin rails for real businesses. Something a normal company could use tomorrow. |
| **Chain** | NEAR Protocol (testnet for the hackathon) |
| **Market** | Global |

### Problem
Companies *can* move stablecoins, but they cannot *operate* them as a finance system:
- **Privacy vs. auditability paradox** — public chains expose revenue, prices and counterparties; full privacy makes auditors and regulators reject it.
- **Payment ≠ accounting event** — on-chain transfers carry no business context (order ID, invoice), so reconciliation is manual.
- **No exception handling** — underpayment, overpayment, double payment, expiry, refunds and failed payouts are unhandled because transfers are final.
- **Last-mile fiat** — recipients need local currency in a bank/e-wallet, not USDC; off-ramps can fail.
- **Recipient identity risk** — hex addresses, address poisoning, "changed bank details" fraud.
- **No legally useful proof of payment** — a tx hash is not a receipt.

Core insight: *the problem is not moving money; it is moving money **with** context, privacy, control and audit evidence.*

### Target users (personas)
| Persona | Need |
|---|---|
| **Merchant owner** (e.g. online shop selling globally) | Accept international payments cheaply and fast, cash out locally |
| **Merchant finance/ops** | Every payment auto-matched to an order; painless refunds; CSV export |
| **Remittance sender** (e.g. migrant worker) | Send money home fast, cheap, transparent FX |
| **Recipient** (non-crypto family member) | Money lands in e-wallet/bank; no crypto knowledge needed |
| **Auditor / compliance** | Verify a scoped period without full system access or public exposure |

---

## 2. Current Scope (MVP / Hackathon)

### In scope
1. **Merchant Payments** — payment request → checkout link/QR → buyer pays USDC into escrow → auto-match → exact / partial / overpaid (auto-refund excess) / expired / refund → settle to merchant.
2. **Remittances** — quote with rate lock + transparent fee → fund escrow → payout via (mock) off-ramp in local currency, or direct USDC release to a NEAR account → retry / refund on failure.
3. **Privacy & selective disclosure** — encrypted business data off-chain, hash commitment on-chain, scoped view keys for auditors with on-chain verification.
4. **Compliance (mocked)** — sanctions screening, Travel Rule data capture (≥ USD 1,000).
5. **Evidence** — receipts, reconciliation CSV export, tamper-evident audit log anchored on-chain.

### Deferred
| Item | Target |
|---|---|
| Payroll (contractor/employee), invoicing (B2B) | **V1** |
| Real off-ramp / FX / KYC partners | V1 (mocks now, behind ports) |
| ZK proofs, NEAR confidential intents (amount privacy) | V1 |
| Chain Signatures multi-chain payouts, NEAR Intents routing | V1 (day-7 stretch only) |
| ERP sync (Xero/QuickBooks), MPC/passkey wallets | V1 |
| Treasury/liquidity forecasting, yield, full tax engine | V2 |

### Constraints
- **Solo builder**, **8 days**.
- Skills: TypeScript / Next.js (strong), Rust (basic–intermediate), NEAR (intermediate).
- ⇒ Keep everything TypeScript-first; keep Rust minimal.
- All external providers (off-ramp, FX, KYC/sanctions) are **mocks**, for the hackathon only.

---

## 3. Architecture Decisions (LOCKED — do not change without user confirmation)

| # | Decision | Rationale | Accepted trade-off |
|---|---|---|---|
| AD-1 | **Escrow contract** holds funds (pooled), not direct buyer→merchant transfer | Enables refunds, partial/over-payment handling, timeouts | Contract holds funds temporarily → higher contract risk; mitigated by keeping it tiny and tested |
| AD-2 | **Sender fail-safe `claim_refund`**: depositor can reclaim after `refund_after` timeout, **even if backend is down or contract is paused** | Funds can never get stuck | — |
| AD-3 | **Privacy = off-chain envelope encryption (AES-256-GCM per-record DEK) + on-chain commitment `sha256(canonicalJSON(payload) ‖ salt)` + scoped view keys (X25519 re-wrap)** | Feasible in 8 days; audit-verifiable | **USDC transfer amounts remain publicly visible on testnet.** Pooled escrow only reduces counterparty linkability. Amount privacy comes in V1 via confidential intents/ZK. Must be stated honestly in the pitch |
| AD-4 | **Backend holds a limited function-call access key** for users (no seed phrases) | Normal-company UX | Custodial-light; declared honestly as a demo limitation. V1: MPC/passkey |
| AD-5 | **`amountMinor` stored in plaintext in the internal DB** | Simple matching & queries | Operator can see amounts (privacy is vs. public/chain, not vs. operator). Fully encrypted in V1 |
| AD-6 | **Escrow IDs are backend-generated, opaque 32-byte hex** with no business meaning | No on-chain correlation | Checkout page still shows amount to the buyer (required to pay) |
| AD-7 | **NEAR Intents & Chain Signatures are nice-to-have** (day 7) | Protect the core demo | Behind `SolverPort`; mock by default |
| AD-8 | **Modular monolith** (single Next.js app, hexagonal modules) + separate worker process | Solo-friendly, one repo | Workers can't run on serverless → deploy separately |
| AD-9 | **Chain = source of truth for funds; DB = source of truth for business context.** Reconciliation job compares them | Correctness | — |
| AD-10 | **Transactional outbox + idempotency keys** on every money-moving command and contract call | At-least-once + idempotent consumers ⇒ effectively exactly-once | Some boilerplate |

### Smart contract summary — `ledgerly-escrow` (target ~200–300 lines Rust)
- State: `owner`, `operators`, allowed `token` (USDC NEP-141), `escrows: LookupMap<EscrowId, Escrow{kind, depositor, held, commitment, status, refund_after}>`, `paused`.
- Methods: `register` (operator), `ft_on_transfer` (**only** from `token`; unknown/closed escrow ⇒ return amount = auto-refund), `release` / `refund` (operator; decrement `held` before `ft_transfer`, restore in callback on failure), `claim_refund` (depositor after timeout; works when paused), `anchor(log_root)`, `get_escrow` (view), admin (`add/remove_operator`, `set_paused`).
- Events (NEP-297, `standard: "ledgerly"`): `escrow_registered`, `escrow_funded`, `escrow_released`, `escrow_refunded`, `log_anchored`. No business data in events.
- Invariants: `released + refunded ≤ deposited`; only `token` may call `ft_on_transfer`; `claim_refund` before timeout always fails; `paused` never blocks `claim_refund`.

### State machines (implemented in `src/modules/*/domain`)
- **PaymentRequest**: `OPEN → PARTIALLY_PAID → PAID → SETTLED`; `OVERPAID → PAID` (after excess refund); `OPEN → EXPIRED | CANCELLED`; `PARTIALLY_PAID → REFUNDING` (expiry/cancel); `PAID | SETTLED → REFUNDING → REFUNDED`.
- **Remittance**: `QUOTED → FUNDED → PAYOUT_PENDING → SETTLED`; `QUOTED → EXPIRED | BLOCKED`; wrong amount / stale quote at funding ⇒ `REFUNDING`; `PAYOUT_PENDING → PAYOUT_FAILED → (retry, max 3) | REFUNDING → REFUNDED`; NEAR-account recipient: `FUNDED → SETTLED` directly. On-chain refund observed during `PAYOUT_PENDING` ⇒ `REFUNDED` with `requiresReview: true`.

Full design documents (Tahap 1–4) live in the agent brain directory; this file summarizes everything binding.

---

## 4. Tech Stack & Preferences

| Layer | Choice |
|---|---|
| App (frontend + API) | **Next.js (App Router) + TypeScript**, route handlers / server actions |
| UI | Tailwind CSS + shadcn/ui — must look like finance software, not a crypto app |
| Validation | Zod |
| Database | **PostgreSQL + Prisma** |
| Smart contract | **Rust + near-sdk 5.x**, small (200–300 lines); tests via `cargo test` + near-workspaces |
| Chain client | near-api-js / `@near-js/*` |
| Crypto | WebCrypto / `@noble/ciphers`, `@noble/curves`, `@noble/hashes` |
| Auth | Auth.js email magic link |
| Testing | **Vitest** (currently v5) |
| Logging | pino, structured, `correlationId` = request/remittance id |
| Deploy | Vercel (app) + Railway/Fly (worker) + Neon (DB) + NEAR testnet |

### Coding conventions
- **Money is always `bigint` minor units** via `Money` (USDC = 6 decimals). Never use floats for money. FX via rational `Rate`, rounding **down**.
- **Domain layer is pure TypeScript** — no I/O, no framework imports, fully unit-testable.
- Domain returns `Result<T, DomainError>` for expected failures; `throw` only for bugs/broken invariants.
- Use branded ID types (`PaymentRequestId`, `EscrowId`, `AccountId`, …).
- State changes only through aggregate methods (state machine); illegal ⇒ `INVALID_TRANSITION`.
- Aggregates raise domain events; repositories persist aggregate + events to the outbox atomically with optimistic locking (`version`).
- Event payloads and logs **never contain PII or decrypted business data**.
- External systems are accessed only through **ports** (`OffRampPort`, `FxRatePort`, `ScreeningPort`, `ChainGateway`, `SolverPort`, repositories); mocks implement the same interfaces as future real adapters.
- Path alias `@/*` → `src/*`. Tests live next to code as `*.test.ts`.
- Clear comments explaining *why*, especially around money and state transitions.
- Do not run `npm audit fix --force`; upgrade dependencies explicitly.

### Repository layout
```
src/
  shared/                       Money, Rate, Result, errors, branded IDs, events, clock
  modules/
    payments/domain/            PaymentRequest aggregate, events, repository port
    remittance/domain/          Remittance aggregate, Quote VO, FX/off-ramp ports
    privacy/  compliance/  ledger/  identity/   (upcoming)
  app/                          Next.js routes & UI (upcoming)
contracts/ledgerly-escrow/      Rust contract (upcoming)
examples/                       runnable walkthroughs
```

---

## 5. Design Principles

1. **Something a normal company could use tomorrow.** UX like Stripe/Wise: email login, no seed phrases, no crypto jargon in primary flows, ≤ 3 steps to pay/send.
2. **Privacy-first, audit-ready** — confidential by default *within hackathon limits*, with selective disclosure that auditors can cryptographically verify.
3. **Simple & reliable > fancy.** Fewer moving parts, explicit state machines, idempotency, fail-safe refunds.
4. **Exceptions are first-class.** Every failure path (partial, overpaid, expired, double pay, payout failure, backend down) must be handled and demoable.
5. **Be honest about demo limitations** — public USDC amounts, custodial-light keys, mocked partners. Never present mocks as real integrations.
6. **Production path is visible** — ports/adapters make it obvious how mocks get swapped for real partners.
7. **No over-engineering.** If it doesn't serve the 8-day demo or a locked decision, don't build it.

---

## 6. Agreed Implementation Order

| # | Module | Status |
|---|---|---|
| 1 | Shared kernel + core domain (payments & remittance) + tests | ✅ Done |
| 2 | `ledgerly-escrow` contract (Rust) + tests | ✅ Done |
| 3 | Privacy module (envelope encryption, commitments, view keys, verification) | ✅ Done |
| 4 | Application use cases, Prisma schema/repositories, mock adapters (FX, off-ramp, screening, solver) | ✅ Done |
| 5 | Workers (chain indexer, settlement, expiry, reconciliation) | ✅ Done |
| 6 | UI (merchant dashboard, checkout, remittance app, auditor portal) | ✅ Done |

Rough day plan: D1 design ✅ · D2 contract · D3 backend core · D4 privacy + mocks · D5 merchant UI · D6 remittance + auditor UI → **feature freeze** · D7 exceptions polish + stretch (Intents/Chain Signatures) · D8 demo video, README, pitch.

Generate code **one module per request**; get user approval before moving on.

---

## 7. How Agents Must Work

1. **Read this file first**, every time, before any task.
2. **Do not change locked architecture decisions (§3)** or scope (§2) without explicit user confirmation. Propose, explain trade-offs, wait.
3. **Follow the implementation order (§6).** One module at a time; finish with passing typecheck + tests.
4. **Prioritize simplicity and delivery speed** for the hackathon deadline. Prefer the boring, reliable solution.
5. **If in doubt, ask** before generating large amounts of code. State assumptions explicitly.
6. **Always mention trade-offs** of any new design choice.
7. Every module must include: interfaces/ports, clear comments, usage example where useful, unit tests, and run instructions.
8. Before finishing a task, run:
   ```bash
   npm run typecheck && npm test
   ```
   (and `cargo test` for the contract once it exists).
9. **Update this file** (Current Status, Open Questions, decisions) when a module is completed or a decision changes.
10. Communicate with the user in **Indonesian** unless asked otherwise; code, comments and docs in **English**.
11. The user's workflow commands: **"lanjut"/"setuju"** = proceed to next step; **"revisi [bagian]"** = revise only that part; **"detail [komponen]"** = deep-dive that component.

---

## 8. Current Status

- **Phase**: Stage 5 — Implementation. Stages 1–4 (Problem, Planning, Architecture, Design) are approved.
- **Module 1 done**:
  - `src/shared`: `Money`, `Rate`, `Result`, `DomainError`, branded IDs, `newEscrowId`, `parseAccountId`, `AggregateRoot`, `Clock`/`FixedClock`.
  - `src/modules/payments/domain`: `PaymentRequest` aggregate (+ `CANCELLED` state added vs. original design), events, repository port.
  - `src/modules/remittance/domain`: `Remittance` aggregate, `Quote` VO, `MAX_PAYOUT_ATTEMPTS = 3`, `FxRatePort`, `OffRampPort`, repository port.
  - 29 unit tests passing; `examples/domain-walkthrough.ts` runs.
  - Tooling: TypeScript 5, Vitest 5, tsx; `npm audit` = 0 vulnerabilities.
- **Module 2 done**:
  - `contracts/ledgerly-escrow/src/lib.rs`: Rust smart contract (`near-sdk 5.5`) implementing `register`, `ft_on_transfer` (NEP-141 receiver with automatic refund on unknown/closed escrow), `release`, `refund` (optimistic balance debit + callback rollback `on_transfer_complete`), `claim_refund` (depositor exit after timeout even when paused), `anchor`, NEP-297 events, and 6 unit tests.
  - `src/shared/chain-gateway.ts`: `ChainGateway` port for backend/worker interaction with the contract.
- **Module 3 done**:
  - `src/modules/privacy/domain`: `canonicalJson`, `computeCommitment`/`verifyCommitment` (`sha256(canonicalJSON(payload) || salt)`), `sealPayload`/`openAndVerifyPayload` (AES-256-GCM per-record DEK + X25519 ECDH-HKDF key wrapping), `rewrapDekForAuditor`, `ViewKeyGrant` aggregate (scoped, time-bound, revocable selective disclosure), and `AuditLogEntry` hash chain (`appendAuditEntry`, `verifyAuditChain`).
- **Module 4 done**:
  - `prisma/schema.prisma`: Full PostgreSQL schema (Organizations, Users, Memberships, PaymentRequests, Payments, Remittances, ViewKeyGrants, GrantWraps, LedgerEntries, OutboxEvents, IdempotencyRecords, AuditLogs, IndexerCursors).
  - `src/modules/identity/domain/rbac.ts`: Role-based access control policy (`OWNER`, `FINANCE`, `VIEWER`).
  - `src/modules/compliance/domain/compliance.ts`: Sanctions screening port & FATF Travel Rule enforcement (`>= 1,000 USDC`).
  - `src/modules/ledger/domain/ledger.ts`: Double-entry accounting invariant (`Σ debits == Σ credits`) and ERP-ready CSV export.
  - `src/shared/idempotency.ts` & `src/shared/mocks.ts`: Idempotency guard, transactional outbox, in-memory repositories (with optimistic locking), `MockFxAdapter`, `MockOffRampAdapter`, `MockScreeningAdapter`, and `MockChainGateway`.
  - Application use cases: `PaymentUseCases`, `RemittanceUseCases`, `DisclosureUseCases` + end-to-end integration test suite (`tests/application-use-cases.test.ts`).
- **Module 5 done**:
  - `src/workers/chain-indexer-worker.ts`: `ChainIndexerWorker` with block cursor, `(txHash, logIndex)` deduplication, automatic routing of `OnchainDepositDetected`, and reconciliation of external `OnchainRefundConfirmed` (such as user fail-safe `claim_refund`).
  - `src/workers/settlement-worker.ts`: `SettlementWorker` retrying `PAYOUT_FAILED` remittances up to `MAX_PAYOUT_ATTEMPTS`.
  - `src/workers/expiry-worker.ts`: `ExpiryWorker` expiring open requests/quotes and auto-refunding `PARTIALLY_PAID` requests upon expiry.
  - `src/workers/reconciliation-worker.ts`: `ReconciliationWorker` comparing internal expected held balance against on-chain escrow balance and building the Exception Queue (`tests/workers.test.ts`).
- **Module 6 done**:
  - `src/app/components/PaymentWaveRails.tsx`: Horizontal wave-like particle rails (charcoal black, muted sage green, soft slate blue) flowing left-to-right with cursor ripple/bending and 4-state scroll choreography (calm waves in Hero → turbulent/irregular in Problem → structured parallel rails in Solution & Capabilities → converging into the "Launch App" button in Final CTA).
  - `src/app/page.tsx`, `src/app/app/page.tsx`, `src/app/checkout/[id]/page.tsx`, `src/app/globals.css`: Calm, refined fintech landing page (`/`) + full interactive workspace (`/app`) and standalone buyer checkout (`/checkout/[id]`).
  - `src/app/api/_runtime.ts`, `src/app/api/v1/state/route.ts`, `src/app/api/v1/actions/route.ts`: Live Next.js route handlers wired to all domain use cases and workers (`tests/ui-api.test.ts`).
- **Known deviation**: remittance funded after quote lock expiry goes straight to `REFUNDING` (requote flow deferred to use-case layer).

```bash
npm install
npm run typecheck
npm test
npm run contract:test
npm run contract:check
npx tsx examples/domain-walkthrough.ts
```

---

## 9. Open Questions

| # | Question | Default if unanswered |
|---|---|---|
| OQ-1 | Use a self-deployed mock USDC (NEP-141) or an existing testnet USDC? | Deploy our own mock USDC for full control |
| OQ-2 | Requote flow when funding arrives after quote lock — auto-requote within tolerance (≤ 1%) or always refund? | Always refund (current behavior) |
| OQ-3 | Default `refund_after` timeout for escrows (merchant vs. remittance)? | Merchant: request expiry + 24h; Remittance: 2h |
| OQ-4 | Indexing approach: plain RPC polling vs. FastNEAR / NEAR Lake? | RPC polling (simplest) |
| OQ-5 | Which demo corridors/currencies to showcase? | USDC→PHP (e-wallet) and USDC→IDR (bank) |
| OQ-6 | Maker-checker approval for large refunds (FR-13, P2) — include in demo? | Skip unless time remains on day 7 |
| OQ-7 | Hosted Postgres (Neon) vs. local Docker for the demo? | Neon for deploy, Docker locally |
