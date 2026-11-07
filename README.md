# Ledgerly

> **Confidential, audit-ready merchant payments and cross-border remittances on NEAR Protocol.**  
> *"Bring the boring money onchain"* — payroll, invoicing, remittances, merchant payments, and stablecoin rails for real businesses.

[![NEAR Testnet](https://img.shields.io/badge/NEAR-Testnet%20Live-00EC97?logo=near&logoColor=black)](https://testnet.nearblocks.io/address/ledgerly-escrow-9e70f9ea.testnet)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-near--sdk%205.5-DEA584?logo=rust&logoColor=black)](https://near-sdk.io/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20Turbopack-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Vitest](https://img.shields.io/badge/Tests-59%20Passing-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Security Audit](https://img.shields.io/badge/Security-0%20Vulnerabilities-brightgreen)](https://docs.npmjs.com/cli/v10/commands/npm-audit)

---

## 1. Executive Summary

Companies *can* move stablecoins on public blockchains, but they cannot *operate* them as a proper finance system:
1. **The Privacy vs. Auditability Paradox**: Public blockchains broadcast suppliers, revenues, prices, and employee addresses to competitors; conversely, fully shielded chains are rejected by tax authorities and external auditors.
2. **Payment ≠ Accounting Event**: On-chain token transfers lack business context (order references, VAT breakdown, customer identity). Reconciliation becomes a manual operational nightmare.
3. **No Exception Handling**: Blockchains treat all transactions as final. Underpayments, overpayments, expired quotes, cancelled orders, and failed off-ramp payouts get permanently stuck.
4. **Last-Mile Fiat Problem**: Overseas suppliers and remittance recipients need local fiat currency in their e-wallet (GCash, GoPay, Dana) or bank account (BCA, BDO), not crypto hex addresses.

**Ledgerly solves this**:
* **Confidential by Default**: Business metadata is encrypted off-chain via AES-256-GCM and ephemeral X25519 key agreements. Only opaque 32-byte commitments (`sha256(canonicalJSON(payload) || salt)`) are registered on-chain.
* **Audit-Ready Selective Disclosure**: Regulators and external auditors receive scoped, time-bound X25519 view keys to decrypt and verify invoices against immutable on-chain commitments without exposing data to the public.
* **Automated Exception Handling**: The smart escrow contract automatically refunds excess funds on overpayments, cancels expired invoices, and provides a depositor fail-safe (`claim_refund`) even if the backend is down.
* **Double-Entry Balanced Accounting**: Every settlement, refund, and fee posts balanced debit/credit legs (`Σ debits == Σ credits`), exportable directly to ERP-ready CSV (Xero / QuickBooks compatible).

---

## 2. Live NEAR Testnet Deployments

Both the **Escrow Smart Contract** and the **NEP-141 Mock USDC Token** are live and verified on NEAR Testnet:

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

## 3. Architecture & Security Model

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Buyer / Merchant / Auditor                        │
 └───────────────────┬────────────────────────────────┬───────────────────┘
                     │ Browser Checkout               │ Auditor View
                     ▼                                ▼
       ┌───────────────────────────┐    ┌───────────────────────────┐
       │   Meteor Wallet (Ext)     │    │   External Auditor Key    │
       │   - Native MeteorCom SDK  │    │   - Scoped View Key Decrypt
       │   - Unsigned Borsh Tx     │    │   - On-Chain Root Check   │
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

### Key Technical Innovations

1. **NEAR Intents 1Click Multichain Rail**:
   Direct integration with `https://1click.chaindefuser.com` solver network. Allows clients to pay invoices from any blockchain (Solana, Base, Ethereum, Arbitrum, Bitcoin) while solvers automatically execute cross-chain settlement and deliver exact USDC to the merchant on NEAR.
2. **Native Meteor PostMessenger Extension Bridge**:
   Direct integration with `window.meteorCom` without vulnerable third-party wrapper libraries. Constructs browser-safe unsigned Borsh transactions with LE integer encoding, serialized to comma-joined Base64 format matching `@meteorwallet/sdk`.
3. **Zero-Dependency SQLite Persistence (`node:sqlite`)**:
   Runs native ACID WAL persistence in Node.js v24. Invoices, remittances, view key grants, double-entry ledger journals, and X25519 keypairs survive server restarts without external database setup.
4. **Fail-Safe Depositor Refund (`claim_refund`)**:
   Guarantees that funds are never locked permanently. If an invoice expires or the backend goes completely offline, the depositor can call `claim_refund` directly on the smart contract to retrieve their funds.
5. **FATF Travel Rule & Sanctions Screening**:
   Automated threshold checks on remittances $\ge \$1,000$ USDC to enforce Travel Rule metadata capture, and sanctions screening integration with automatic aggregate blocking.

---

## 4. Application Modules & Routes

* **`/` — Ambient Landing Page**: Features `PaymentWaveRails` (calm particle rails flowing across 4 scroll-choreographed states) and fintech copy explaining the value proposition.
* **`/checkout` & `/checkout/[id]` — Buyer Checkout Portal**: Clean invoice payment UI with instant Meteor Wallet connection, 1-click testnet USDC faucet, QR codes, overpayment auto-split preview, and 3.5s real-time auto-sync to `SETTLED`.
* **`/app/merchant` — Merchant Workspace**: Invoice generation, real-time status transitions (`OPEN` $\to$ `PAID` $\to$ `SETTLED`), manual settlement simulation, and direct links to on-chain receipts.
* **`/app/remittance` — Cross-Border Remittance**: Live rate-locking across corridors (USD $\to$ PHP, USD $\to$ IDR), transparent fee calculation, Travel Rule modal, and automated off-ramp retry queue.
* **`/app/auditor` — Auditor Selective Disclosure**: One-click decryption of scoped business envelopes, cryptographic verification of SHA-256 commitments against the NEAR contract, audit log root inspection, and ERP-compliant CSV export.

---

## 5. Getting Started

### Prerequisites
* **Node.js**: v22.0.0 or higher (v24.x recommended for native `node:sqlite`).
* **Rust & Cargo**: (Only if modifying smart contracts) with `wasm32-unknown-unknown` target.

### Installation & Verification

```bash
# Clone the repository
git clone https://github.com/adevty/Ledgerly.git
cd Ledgerly

# Install dependencies (0 vulnerabilities)
npm install

# Run static TypeScript typecheck
npm run typecheck

# Run the complete test suite (49 unit & integration tests)
npm test

# Run Rust smart contract unit tests
npm run contract:test

# Build the Next.js production bundle
npm run build
```

### Running Locally

```bash
# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser:
* Landing Page: `http://localhost:3000/`
* Merchant Portal: `http://localhost:3000/app/merchant`
* Buyer Checkout: `http://localhost:3000/checkout`
* Remittance App: `http://localhost:3000/app/remittance`
* Auditor Console: `http://localhost:3000/app/auditor`

---

## 6. Testing Checkout Payment Rails

### Option A: Native NEAR Testnet with Meteor Wallet
1. Open **`http://localhost:3000/checkout`** in Chrome/Brave with the **Meteor Wallet Extension** installed.
2. Ensure your Meteor Wallet is toggled to **Testnet**.
3. Click **"Connect Meteor"** — the extension will link your testnet account.
4. Click **"Get 100 test USDC"** — the live faucet on contract `ledgerly-usdc-a627a4c0.testnet` will mint tokens to your wallet.
5. Click **"Sign & Pay"** — approve the `ft_transfer_call` transaction in the Meteor Wallet popup.
6. The page will automatically detect the on-chain confirmation within 3.5 seconds and transition to **SETTLED**!

### Option B: Cross-Chain Settlement with NEAR Intents (1Click)
1. On **`http://localhost:3000/checkout`**, click the **"⚡ Pay Any Chain (NEAR Intents)"** rail tab.
2. Select your origin token/chain: **Solana (SOL)**, **Base (ETH)**, **Arbitrum (USDC)**, **Ethereum (ETH)**, or **Bitcoin (BTC)**.
3. Observe the live quote retrieved directly from `https://1click.chaindefuser.com/v0/quote` displaying exact input requirements, estimated fulfillment time, and zero protocol fees.
4. Click **"Generate 1Click Deposit Address"** to obtain an authentic single-use cross-chain deposit address.
5. Click **"Simulate Solver Settlement (Testnet)"** to immediately simulate intent fulfillment on testnet and watch the invoice settle!

---

## 7. License

MIT License. Built for the NEAR Protocol *"Bring the boring money onchain"* Hackathon.
