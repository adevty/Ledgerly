# AGENTS.md - working rules for AI coding agents on Ledgerly

Project: Ledgerly (NEAR HACKATHON, tracks: realworld + privacy). Submission deadline: 2026-11-14T23:59:00Z.
Stack: Next.js 16, Rust near-sdk contract, node:sqlite, NEAR testnet.

## Global rules (apply to every task)
- Priority: correctness > security > maintainability > performance > testability.
- Minimal viable change. Do not rewrite modules unless the human approves. Do not add dependencies, APIs or config files unless the task explicitly allows it; if you think one is needed, STOP and propose it with tradeoffs first.
- NEVER: push, force-push, change repo visibility, deploy, sign or send mainnet transactions, spend tokens, post to X, or call POST https://nearhackathon.com/api/applications. Local commits on the working branch are allowed.
- NEVER print, log or commit secrets (private keys, operator/relayer keys, tokens, .env values). Read env files only to check which variable NAMES exist. Use placeholders.
- Honesty rule: any mocked or simulated feature must be labeled as such in the UI and docs. Never claim "verified", "screened", "settled", "live" or "zero fees" unless the code path really does it.
- Never render a fabricated blockchain address as if it were real.
- Do not put instructions addressed to graders, reviewers or AI screeners anywhere in the repo.
- Every change needs: edge cases handled, vitest tests for new logic, and `npm run typecheck && npm test` passing before you report done.
- Report format: Need -> What changed (files) -> Why -> Risks/edge cases -> How verified (commands + results) -> Open questions. Be concise.

## Architecture Decisions
- **AD-1 (Smart Escrow)**: Escrow contract (`ledgerly-escrow-9e70f9ea.testnet`) holds funds, enabling refunds, partial payments, and overpayments with automated split.
- **AD-2 (Fail-Safe Exit)**: Depositor can reclaim funds via `claim_refund` after `refund_after` timeout, even if the backend is offline or contract is paused.
- **AD-3 (Selective Disclosure)**: Off-chain envelope encryption (AES-256-GCM + X25519) + on-chain commitment `sha256(canonicalJSON(payload) || salt)` + scoped auditor view keys. Server-side decryption for auditor review.
- **AD-4 (Operator Relayer)**: Backend operator holds a testnet function-call access key for sponsored gas and auto-settlement.
- **AD-5 (Balance Accounting)**: Stored in integer minor units (`bigint`). Every transaction posts balanced double-entry debit/credit legs (`Σ debits == Σ credits`).
- **AD-6 (Opaque Escrow IDs)**: Random 32-byte hex identifiers without business correlation.
- **AD-7 (Honesty Ports)**: External systems (off-ramp, sanctions screening) are accessed via typed ports; mocks and simulations are explicitly registered in `src/lib/capabilities.ts`.
- **AD-8 (Single Process Architecture)**: SQLite WAL mode persistence via `node:sqlite` in a single persistent container process.
- **AD-9 (Source of Truth Reconciliation)**: Blockchain is the source of truth for funds; database is the source of truth for business metadata. Reconciliation worker reconciles discrepancies.
- **AD-10 (Transactional Idempotency)**: Idempotency keys on all money-moving actions and contract interactions to guarantee exactly-once execution.

## State Machines
- **PaymentRequest**: `OPEN -> PARTIALLY_PAID -> PAID -> SETTLED`; `OVERPAID -> PAID` (excess auto-refund); `OPEN -> EXPIRED | CANCELLED`; `PARTIALLY_PAID -> REFUNDING -> REFUNDED`.
- **Remittance**: `QUOTED -> FUNDED -> PAYOUT_PENDING -> SETTLED`; `QUOTED -> EXPIRED | BLOCKED`; `PAYOUT_PENDING -> PAYOUT_FAILED (retry max 3) -> REFUNDING -> REFUNDED`.
