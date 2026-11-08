# Ledgerly

> **Confidential, audit-ready merchant invoicing, multi-chain checkout, and cross-border remittances on NEAR Protocol.**  
> **Hackathon Tracks:** `realworld` (Bring the boring money onchain) + `privacy` (Selective disclosure & confidential accounting).

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13.0-green.svg)](https://nodejs.org/)
[![NEAR Testnet](https://img.shields.io/badge/NEAR-Testnet%20Verified-00EC97.svg?logo=near&logoColor=black)](https://testnet.nearblocks.io/address/ledgerly-escrow-9e70f9ea.testnet)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 1. Problem, Value, and NEAR Usage

Most businesses cannot operate stablecoins on public blockchains because public transactions broadcast customer identities, revenue numbers, and supply-chain pricing directly to competitors. Conversely, fully shielded privacy networks prevent compliance teams, tax authorities, and external auditors from verifying corporate accounts. Furthermore, raw token transfers lack invoice context, and irreversible transfers cannot handle real-world commercial exceptions such as overpayments, underpayments, expirations, or failed off-ramp payouts.

Ledgerly provides an end-to-end commercial payments and treasury platform designed for real companies. Invoices and supplier remittances are encrypted off-chain using AES-256-GCM with ephemeral X25519 key agreements. Only opaque 32-byte cryptographic commitments (`sha256(canonicalJSON(payload) || salt)`) are registered on-chain. When audits occur, merchants grant scoped, time-bound X25519 view keys that decrypt records server-side for verification against immutable on-chain commitments without exposing data to the public. Every transaction automatically posts balanced double-entry debit/credit ledger records (`Σ debits == Σ credits`), exportable directly to ERP-ready CSV.

NEAR Protocol serves as the settlement and verification layer through four concrete mechanisms:
1. **Smart Escrow (`ledgerly-escrow-9e70f9ea.testnet`)**: Receives NEP-141 USDC deposits via `ft_transfer_call`, enforces registration commitments, handles automated overpayment splits (releasing invoice amounts while auto-refunding excess deposits), and exposes a depositor fail-safe (`claim_refund`) that returns funds after timeout even if backend servers go offline or contracts pause.
2. **On-Chain Audit Anchoring**: Periodically anchors tamper-evident SHA-256 Merkle audit root hashes to contract storage via the `anchor(log_root)` method, emitting NEP-297 compliant event logs.
3. **Multi-Chain 1Click Intents (`https://1click.chaindefuser.com`)**: Retrieves live solver quotes enabling buyers to pay across foreign chains (Solana, Base, Ethereum, Arbitrum, Bitcoin), with solver routes delivering settlement on NEAR.
4. **Relayer & Sponsored Gas**: The backend operator account (`ledgerly-op-a627a4c0.testnet`) uses a restricted function-call key to sponsor gas, register escrows, and execute automated batch settlements.

---

## 2. Judge Quickstart (Under 5 Minutes)

Run the verification flow in three progressive tiers:

### Tier 1: Local Sandbox Simulation (No keys or blockchain credentials required)

```bash
# 1. Use supported Node version & install dependencies
nvm use || nvm install 24
npm ci

# 2. Copy environment configuration and seed deterministic demo dataset
cp .env.example .env
npm run seed

# 3. Execute the full end-to-end sandbox verification script
npm run demo
```
**Expected output:**
```
======================================================
  SANDBOX: simulated chain
======================================================
1. Create invoice INV-DEMO-XXXX (680.00 USDC) with idempotency key ... PASS
2. Buyer deposit 700.00 USDC (20.00 USDC overpayment) ... PASS
3. Run indexer (1 events) & settlement workers ... PASS
4. Assert released=680.00 USDC, refund=20.00 USDC, status=SETTLED ... PASS
5. Anchor audit log root (XXXX…) on contract ... PASS
6. Issue view key, decrypt server-side & verify sha256(canonicalJSON||salt) ... PASS
7. Export CSV to ./out/reconciliation.csv & assert sum(debits)==sum(credits) (12080000000 minor) ... PASS
======================================================
  SANDBOX: simulated chain
======================================================
✅ All 7 sandbox verification steps passed successfully!
```

#### Highlight: Depositor Fail-Safe Refund (`--refund-path`)
Demonstrates depositor emergency fund recovery on contract when backend workers are completely offline:
```bash
npm run demo -- --refund-path
```
**Expected output:**
```
MODE: --refund-path (Depositor fail-safe exit with workers offline)
1. Create invoice (300.00 USDC, 1s expiry) ... PASS
2. Buyer deposit 300.00 USDC into escrow ... PASS
3. Backend workers STOPPED (simulated outage) ... PASS
4. Depositor invokes emergency claim_refund on contract ... PASS
5. Assert escrow closed & 300.00 USDC returned to depositor ... PASS
✅ Sandbox --refund-path verification completed successfully!
```

---

### Tier 2: Keyless On-Chain Verification (Direct NEAR Testnet queries)

Verifies the deployed smart contract, accounts, view methods, and all 5 README transactions directly against public NEAR testnet RPCs without requiring any private keys:

```bash
npm run verify:onchain
```
**Expected output:**
- Confirms `ledgerly-escrow-9e70f9ea.testnet` and `ledgerly-usdc-a627a4c0.testnet` are deployed with bytecode.
- Calls `is_paused()` (`false`) and `get_token()` (`ledgerly-usdc-a627a4c0.testnet`).
- Asserts success, receiver ID, and method for all 5 verified transactions (`DeployContract`, `register`, `ft_transfer_call`, `release`, `anchor`).
- Validates anchored audit root `9a28c44f6b7428b931a51854daeef47c33f882999ca60813083d226bb11d8913`.
- Recomputes SHA-256 commitment from fictional published fixture (`examples/verify-fixture.json`).
- Prints Nearblocks explorer links and exits `0`.

---

### Tier 3: Interactive UI & Wallet Checkout

```bash
# Start local development server
npm run dev
```
1. Open [http://localhost:3000/checkout](http://localhost:3000/checkout) in Chrome or Brave with **Meteor Wallet** extension installed (set to Testnet).
2. Connect wallet and click **"Get 100 test USDC"** to mint tokens from the public testnet faucet (`ledgerly-usdc-a627a4c0.testnet`).
3. Click **"Sign & Pay"** to submit a live `ft_transfer_call` transaction.
4. The background indexer detects the on-chain receipt within 3.5 seconds and settles the invoice.

*(Optional)* Run live testnet settlement script with your own operator credentials:
```bash
npm run demo:live -- --yes
```

---

## 3. Real vs. Simulated Capabilities (Registry Truth)

In accordance with our honesty protocol, all features in the UI and documentation derive their status strictly from [`src/lib/capabilities.ts`](src/lib/capabilities.ts):

| Capability | Status | Implementation Details / Honesty Disclosure |
|:---|:---:|:---|
| **Escrow Registration** | `LIVE` | Calls `register` on `ledgerly-escrow-9e70f9ea.testnet` with SHA-256 commitment and timelock. |
| **USDC Deposit** | `LIVE` | NEP-141 `ft_transfer_call` transfers into escrow contract on NEAR Testnet. |
| **Escrow Settlement Release**| `LIVE` | Operator executes `release` on contract; funds transfer to merchant or settlement pool. |
| **Escrow Auto-Refund** | `LIVE` | Contract automatically refunds excess amounts on overpayment or cancelled orders. |
| **Audit Root Anchoring** | `LIVE` | Hashes Merkle roots to `anchor(log_root)` on-chain, emitting NEP-297 event logs. |
| **Payer Direct Refund Claim**| `LIVE` | Payer invokes `claim_refund` on-chain directly after `refund_after` expiry. |
| **1Click Solver Dry Quote** | `LIVE` | Live quotes queried directly from `https://1click.chaindefuser.com/v0/quote`. |
| **Cross-Chain Deposit Address** | `DRY-RUN` | Dry-run quote enabled by default; live deposit addresses disabled in demo to prevent unmonitored transfers. |
| **Multi-Chain Solver Swap** | `SIMULATED` | Sandbox solver simulation; cross-chain solver fulfillment on testnet is simulated via adapter. |
| **Fiat Off-Ramp Payout** | `MOCK` | Simulated local banking rails (GCash, BDO, BCA); real banking rails are mocked. |
| **OFAC Sanctions Screening** | `MOCK` | Mock compliance check against an in-memory blocklist port. |
| **FATF Travel Rule Compliance** | `MOCK` | Compliance metadata is captured and sealed off-chain; inter-VASP network transmission is not implemented. |
| **Forex Exchange Rates** | `LIVE` | Live real-time forex rates with static fallback. Fees come from the live quote. |

---

## 4. Hackathon Scope & Provenance

* **Hackathon Window**: October 19, 2026 – November 14, 2026.
* **First Commit Date**: `2026-11-05T18:38:38+07:00` (commit `547a664`).
* **Commit Verification**: All 48 commits fall strictly within the official hackathon window (verified via `git log`).
* **AI Assistance Disclosure**: Developed with AI pair-programming assistance (Claude Opus / Antigravity). All architecture decisions, cryptographic schemes, Rust smart contracts, and test suites were reviewed, validated, and executed in terminal sessions.
* **Libraries & Core Dependencies**:
  - **Runtime**: Node.js >= 22.13.0 (Node 24 recommended).
  - **Frontend & Server**: Next.js 16 (App Router + Turbopack), React 19, Tailwind CSS, Lucide icons, Three.js / React Three Fiber.
  - **Smart Contract**: Rust `near-sdk 5.5` (compiled to `wasm32-unknown-unknown`).
  - **Database**: Zero-dependency `node:sqlite` (built into Node.js 22.13+), Write-Ahead Logging (`WAL` mode).
  - **Testing**: Vitest 5.1.0, Cargo test.

---

## 5. Live Testnet Deployments & Verified Transactions

| Contract / Account | Network Address | Explorer Link |
|:---|:---|:---|
| **Ledgerly Escrow Contract** | `ledgerly-escrow-9e70f9ea.testnet` | [View on Nearblocks ↗](https://testnet.nearblocks.io/address/ledgerly-escrow-9e70f9ea.testnet) |
| **Mock USDC (NEP-141)** | `ledgerly-usdc-a627a4c0.testnet` | [View on Nearblocks ↗](https://testnet.nearblocks.io/address/ledgerly-usdc-a627a4c0.testnet) |
| **Operator / Relayer** | `ledgerly-op-a627a4c0.testnet` | [View on Nearblocks ↗](https://testnet.nearblocks.io/address/ledgerly-op-a627a4c0.testnet) |

### Verified Live On-Chain Transactions

* **Contract Deployment & Init**: [`G4dNE6TLB3ASheZn1dtejQpRdZkL9g5S46CNQDhpL7G7`](https://testnet.nearblocks.io/txns/G4dNE6TLB3ASheZn1dtejQpRdZkL9g5S46CNQDhpL7G7)
* **Escrow Registration (`register`)**: [`8Zk7wGRQFhWUwR6Lv54adty52yVdfxbT1yZHuzmu4NQK`](https://testnet.nearblocks.io/txns/8Zk7wGRQFhWUwR6Lv54adty52yVdfxbT1yZHuzmu4NQK)
* **Real USDC Deposit (`ft_transfer_call`)**: [`48uhApH2ij8eQ4PsDau2J6Zg5qi1ZvJFMK2n1rBJzdFa`](https://testnet.nearblocks.io/txns/48uhApH2ij8eQ4PsDau2J6Zg5qi1ZvJFMK2n1rBJzdFa)
* **Settlement Release (`release`)**: [`4PDxv1WbzU9XQ9LAMSKAJ4iVuha9SfymWvw1pRTWuhaa`](https://testnet.nearblocks.io/txns/4PDxv1WbzU9XQ9LAMSKAJ4iVuha9SfymWvw1pRTWuhaa)
* **Audit Hash-Chain Anchoring (`anchor`)**: [`1VQz6TK4ksKVsS7uwucPg3B2y3bnFMDghAdfo1RZNWG`](https://testnet.nearblocks.io/txns/1VQz6TK4ksKVsS7uwucPg3B2y3bnFMDghAdfo1RZNWG)

---

## 6. Architecture & Security Model

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Buyer / Merchant / Auditor                        │
 └───────────────────┬────────────────────────────────┬───────────────────┘
                     │ Browser Checkout               │ Auditor View
                     ▼                                ▼
       ┌───────────────────────────┐    ┌───────────────────────────┐
       │   Meteor Wallet (Ext)     │    │   External Auditor Key    │
       │   - Native MeteorCom SDK  │    │   - Scoped View Key Grant │
       │   - Unsigned Borsh Tx     │    │   - Server-Side Decrypt   │
       └─────────────┬─────────────┘    └─────────────▲─────────────┘
                     │ ft_transfer_call()             │
                     ▼                                │
 ┌────────────────────────────────────────────────────┴───────────────────┐
 │                      NEAR Protocol (Testnet)                           │
 │                                                                        │
 │   ┌──────────────────────────┐      ┌──────────────────────────────┐   │
 │   │  ledgerly-usdc (NEP-141) │ ---> │   ledgerly-escrow Contract   │   │
 │   │  - 6 Decimals            │      │   - register()               │   │
 │   │  - Public Faucet Mint    │      │   - ft_on_transfer()         │   │
 │   └──────────────────────────┘      │   - release() / refund()     │   │
 │                                     │   - claim_refund() [timeout] │   │
 │                                     │   - anchor(log_root)         │   │
 │                                     └──────────────┬───────────────┘   │
 └────────────────────────────────────────────────────┼───────────────────┘
                                                      │ Events & RPC Polling
                                                      ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                   Ledgerly Monolith (Next.js 16)                       │
 │                                                                        │
 │   ┌─────────────────────┐  ┌────────────────────┐  ┌───────────────┐   │
 │   │ ChainIndexerWorker  │  │ SettlementWorker   │  │ ExpiryWorker  │   │
 │   └──────────┬──────────┘  └─────────┬──────────┘  └───────┬───────┘   │
 │              │                       │                     │           │
 │              ▼                       ▼                     ▼           │
 │   ┌────────────────────────────────────────────────────────────────┐   │
 │   │                SQLite Local Persistence Layer                  │   │
 │   │   - WAL Mode (Zero npm dependencies via Node `node:sqlite`)    │   │
 │   │   - PaymentRequests, Remittances, Grants, Double-Entry Ledger  │   │
 │   │   - Idempotency & Tamper-Evident SHA-256 Audit Chain           │   │
 │   └────────────────────────────────────────────────────────────────┘   │
 └────────────────────────────────────────────────────────────────────────┘
```

### Security & Threat Model Summary
Per our detailed [Threat Model](docs/THREAT_MODEL.md):
- **Server-Side Decryption**: Auditor view keys are processed server-side within the active view-key grant scope. Decrypted payloads are verified against the on-chain SHA-256 commitment and transmitted over HTTPS to the authorized auditor session.
- **Custody Boundary**: The host maintains custody of organization and auditor X25519 keys stored in `runtime_meta`. Privacy is enforced against public observers, counterparties, and blockchain crawlers.
- **Fail-Safe Mechanism**: The smart contract guarantees that depositors can always call `claim_refund` directly after the timeout expires, bypassing the backend server completely.

---

## 7. Testing & Quality Verification

Run the full automated test suites:

```bash
# TypeScript Domain & Integration Test Suite (123 tests, 18 test files)
npm test

# Rust Smart Contract Test Suite (6 unit tests)
npm run contract:test

# Static Type Checking
npm run typecheck

# Production Next.js Build
npm run build
```

---

## 8. Demo Links & Submission

* **Hosted Web Application**: `TODO: [Paste hosted demo URL here]`
* **60–90 Second Video Walkthrough**: `TODO: [Paste YouTube / Loom link here]`
* **X / Twitter Announcement Post**: `TODO: [Paste X post link here]`

---

## 9. License

MIT License. Copyright (c) 2026 Ledgerly Contributors.
