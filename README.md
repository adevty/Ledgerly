# Ledgerly

> **Private Financial Infrastructure for Onchain Businesses**  
> A privacy-first financial infrastructure that enables businesses to execute stablecoin payments, manage escrow, and maintain verifiable financial records without exposing sensitive business data on public blockchains.  
> **Hackathon Tracks:** `realworld` (Bring the boring money onchain) + `privacy` (Selective disclosure & confidential onchain financial infrastructure).

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13.0-green.svg)](https://nodejs.org/)
[![NEAR Testnet](https://img.shields.io/badge/NEAR-Testnet%20Verified-00EC97.svg?logo=near&logoColor=black)](https://testnet.nearblocks.io/address/ledgerly-escrow-9e70f9ea.testnet)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

### Core Proposition
- **Private financial records**: Customer contacts, pricing terms, and line items stay encrypted off-chain via AES-256-GCM + X25519; zero raw commercial metadata leaks to public block explorers.
- **Programmable stablecoin escrow**: Autonomous smart contract on NEAR (`ledgerly-escrow-9e70f9ea.testnet`) with automated overpayment splits and fail-safe timeout refund exits.
- **Selective disclosure for auditors**: Scoped cryptographic view keys allowing certified auditors to decrypt records and verify SHA-256 commitments without public leaks.
- **Verifiable onchain accounting**: Mathematical double-entry ledger entries ($0.00 net variance invariant) with tamper-evident roots anchored on NEAR.
- **Cross-chain payment infrastructure**: Multi-chain settlement via NEAR Intents (1Click API) across Solana, Ethereum, Base, Arbitrum, and Bitcoin.

---

## 1. Problem, Value, and What Actually Runs

Most businesses cannot use public blockchains for day-to-day payments because public ledgers broadcast customer names, revenue, and invoice amounts to everyone. Conversely, completely dark privacy networks make it impossible to provide verifiable records to accountants, auditors, or tax authorities. In addition, standard token transfers have no invoice context and cannot automatically handle commercial issues like overpayments or expired invoices.

Ledgerly provides private financial infrastructure with verifiable onchain trust:
- **Private Off-Chain Storage**: Customer names, emails, and invoice items stay in your local database (stored securely with AES-256-GCM encryption). Only an anonymous 32-byte escrow ID and a SHA-256 verification hash are recorded on NEAR.
- **NEAR Testnet Smart Escrow (`ledgerly-escrow-9e70f9ea.testnet`)**:
  - Receives testnet USDC deposits via `ft_transfer_call`.
  - Automatically splits overpayments: if a customer pays 700 USDC for a 680 USDC invoice, the contract releases 680 USDC to the merchant and automatically refunds the 20 USDC excess to the payer.
  - Fail-safe emergency exit: if an invoice expires, the payer can call `claim_refund` directly on the contract to reclaim funds, even if the backend is completely offline.
- **Authorized Auditor Access**: When financial audits or tax reviews occur, merchants can issue a scoped auditor key. The auditor can view decrypted invoice records and confirm that their hashes match the records on NEAR, without exposing customer data to the public.
- **Verifiable Financial Records**: Every transaction automatically generates balanced double-entry accounting entries (`total debits == total credits`) ready for CSV export into standard financial software like QuickBooks or Xero.
- **Cross-Chain Payment Infrastructure**: Fetches real-time exchange rates from the NEAR Intents (1Click API) across chains (Solana, Base, Ethereum, Arbitrum, Bitcoin), with simulated fulfillment on NEAR Testnet so you can test end-to-end without spending real mainnet assets.

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

| Capability | Status | What Actually Runs (Honesty Disclosure) |
|:---|:---:|:---|
| **Escrow Registration** | `LIVE` | Registers escrow on `ledgerly-escrow-9e70f9ea.testnet` with invoice hash and refund timeout. |
| **USDC Deposit** | `LIVE` | Real testnet USDC transfer into escrow via `ft_transfer_call` on NEAR Testnet. |
| **Escrow Settlement Release**| `LIVE` | Operator executes `release` on contract to pay the merchant upon confirmation. |
| **Escrow Auto-Refund** | `LIVE` | Contract immediately refunds any extra USDC back to the payer if they pay too much. |
| **Audit Root Anchoring** | `LIVE` | Records audit hash roots on NEAR testnet contract for proof of tamper resistance. |
| **Payer Direct Refund Claim**| `LIVE` | Payer can call `claim_refund` directly on the contract to get funds back after timeout. |
| **1Click Solver Dry Quote** | `LIVE` | Queries real-time exchange rates from NEAR Intents 1Click API (`https://1click.chaindefuser.com`). |
| **Cross-Chain Deposit Address** | `DRY-RUN` | Rates are live; deposit addresses are disabled in this demo to avoid sending real mainnet assets. |
| **Multi-Chain Solver Swap** | `SIMULATED` | Simulates payment fulfillment on testnet using testnet USDC without spending real mainnet assets. |
| **Fiat Off-Ramp Payout** | `MOCK` | Simulated local bank transfers (BCA, GCash, SEPA); banking rails are mocked in this demo. |
| **OFAC Sanctions Screening** | `MOCK` | Simulated compliance check against an in-memory blocklist. |
| **FATF Travel Rule Compliance** | `MOCK` | Sender/recipient data is saved securely in the local database; external VASP network is not connected. |
| **Forex Exchange Rates** | `LIVE` | Live exchange rates for international currencies with static fallback. |

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

```mermaid
flowchart TD
    subgraph Clients["1. Client & Role Interfaces"]
        Merchant["Merchant<br/>(Create Invoices & Manage Receivables)"]
        Buyer["Buyer / Payer<br/>(Meteor Wallet / Testnet Signer)"]
        Auditor["Auditor / Regulatory Observer<br/>(Holds Scoped View Key: ld_vk_...)"]
    end

    subgraph OffChain["2. Off-Chain Confidential Layer (Next.js 16 + SQLite WAL)"]
        direction TB
        subgraph PrivacyEngine["Privacy & Envelope Encryption"]
            AES["Envelope Encryption<br/>(AES-256-GCM + X25519)"]
            CommitGen["Commitment Hash Engine<br/>sha256(canonicalJSON || salt)"]
            SQLite[("SQLite Local Storage (WAL Mode)<br/>- Encrypted Commercial Invoices<br/>- Balanced Double-Entry Ledger<br/>- Scoped View Key Grants")]
        end

        subgraph Workers["Autonomous Background Workers"]
            Indexer["ChainIndexerWorker<br/>(Polls Nearblocks RPC receipts)"]
            SettlementW["SettlementWorker<br/>(State: OPEN ➔ PAID ➔ SETTLED)"]
            ReconcileW["ReconciliationWorker<br/>(Enforces Σ Debits == Σ Credits)"]
            ExpiryW["ExpiryWorker<br/>(Monitors invoice timeouts)"]
        end
    end

    subgraph ExternalHonesty["3. External Gateways (Honesty Layer Derived from capabilities.ts)"]
        OneClickAPI["NEAR Intents 1Click API<br/>(LIVE dry quotes / SIMULATED swap fulfillment)"]
        ForexAPI["Forex & Banking Gateway<br/>(LIVE exchange rates / MOCKED fiat rails BCA, GCash, SEPA)"]
    end

    subgraph OnChain["4. On-Chain Settlement Layer (NEAR Protocol Testnet)"]
        direction TB
        Relayer["Operator / Relayer Account<br/>ledgerly-op-a627a4c0.testnet<br/>(Sponsored Gas & Auto-Settlement)"]
        
        subgraph EscrowContract["Smart Escrow Contract (Rust near-sdk 5.5)<br/>ledgerly-escrow-9e70f9ea.testnet"]
            FnRegister["register()<br/>Anchors commitment & refund timeout"]
            FnDeposit["ft_on_transfer()<br/>Auto-splits overpayment back to buyer"]
            FnRelease["release()<br/>Pays merchant upon confirmation"]
            FnRefund["claim_refund()<br/>Fail-Safe Exit after timeout (offline-safe)"]
            FnAnchor["anchor()<br/>Records tamper-evident audit roots"]
        end

        USDCContract["Mock USDC Contract (NEP-141)<br/>ledgerly-usdc-a627a4c0.testnet<br/>(6 Decimals · Faucet Mintable)"]
    end

    %% Interactions
    Merchant -->|"1. Input commercial data"| AES
    AES -->|"Save encrypted payload"| SQLite
    AES -->|"Derive 32-byte commitment"| CommitGen
    CommitGen -->|"2. Register escrow"| FnRegister
    
    Buyer -->|"3a. Native deposit: ft_transfer_call()"| USDCContract
    USDCContract -->|"Transfer with invoice escrowId"| FnDeposit
    Buyer -.->|"3b. Cross-chain intent query"| OneClickAPI
    
    FnDeposit -->|"Exact payment ➔ Locked in escrow"| EscrowContract
    FnDeposit -->|"Overpayment excess ➔ Auto-refunds buyer"| USDCContract
    
    Indexer -->|"4. Detect receipts (14 TGas)"| SQLite
    SettlementW -->|"5. Trigger release via operator key"| Relayer
    Relayer -->|"release()"| FnRelease
    FnRelease -->|"Transfer settled funds"| Merchant

    Buyer -->|"Emergency Exit: claim_refund() [if expired]"| FnRefund
    FnRefund -->|"Return funds even if backend offline"| Buyer

    ReconcileW -->|"6. Audit log root"| FnAnchor
    
    Auditor -->|"7. Submit View Key (ld_vk_...)"| OffChain
    OffChain -->|"Server-side decrypt & verify sha256"| Auditor
```

### Comprehensive Protocol Flow & Truthful Architecture Breakdown

The protocol operates across four distinct tiers, maintaining commercial confidentiality off-chain while anchoring verifiable trust and settlement on NEAR Testnet:

1. **Client & Role Interfaces**:
   - **Merchant**: Creates payment requests without revealing customer identity or pricing terms to the public network.
   - **Buyer / Payer**: Connects via Meteor Wallet or embedded testnet signer to execute NEP-141 token deposits, or queries 1Click intent exchange rates.
   - **Auditor / Regulator**: Submits a scoped cryptographic view key (`ld_vk_...`) issued by the merchant to inspect decrypted line items and verify them against on-chain roots.

2. **Off-Chain Confidential Layer (`Next.js 16` + `node:sqlite` WAL)**:
   - **Envelope Encryption**: Private business terms (customer email, itemized services, VAT tax notes) are encrypted server-side with AES-256-GCM + ephemeral X25519 key derivation.
   - **Commitment Generation**: Computes `sha256(canonicalJSON(payload) || salt)`. Only this 32-byte hash and an opaque escrow ID are sent on-chain.
   - **Background Workers**: `ChainIndexerWorker` polls RPC receipts, `SettlementWorker` coordinates state transitions, `ExpiryWorker` handles expirations, and `ReconciliationWorker` maintains strict balance invariants ($\sum \text{debits} == \sum \text{credits}$ with $0.00$ variance).

3. **External Gateways & Honesty Boundaries (Truth in Code)**:
   - *In strict accordance with our capability registry ([`src/lib/capabilities.ts`](src/lib/capabilities.ts))*:
     - **NEAR Intents 1Click API**: Real-time cross-chain exchange rates are fetched **LIVE** from `https://1click.chaindefuser.com`. Multi-chain solver swap fulfillment is **SIMULATED** on testnet to protect user capital.
     - **Forex & Banking Rails**: Forex market rates are **LIVE**. Off-ramp fiat payouts (BCA, GCash, SEPA) and OFAC sanctions screening are **MOCKED/SIMULATED** in this testnet evaluation environment.

4. **On-Chain Settlement Layer (NEAR Protocol Testnet)**:
   - **NEP-141 USDC Token** (`ledgerly-usdc-a627a4c0.testnet`): 6-decimal fungible token with public faucet minting.
   - **Smart Escrow Contract** (`ledgerly-escrow-9e70f9ea.testnet`):
     - `ft_on_transfer()`: Receives funds and performs **Atomic Overpayment Split**. If a customer overpays, the contract instantly refunds the difference back to the payer within the very same transaction.
     - `claim_refund()`: **Fail-Safe Exit**. Depositors can withdraw their escrowed funds after invoice expiry even if the Ledgerly backend server is completely offline or destroyed.
     - `anchor()`: Anchors SHA-256 audit log roots on-chain to prevent historical record tampering.
   - **Operator Relayer** (`ledgerly-op-a627a4c0.testnet`): Sponsored gas and auto-release settlement executor.

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
