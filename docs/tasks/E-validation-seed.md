# Task E - Validation, demo seed, number consistency, overflow
Source: docs/AUDIT.md section 7. Depends on Tasks B and C.

A. Validation (server authoritative AND client; reuse the existing approach, plain TypeScript guards if none; no new libs without asking):
- Invoice reference: trimmed, 3-64 chars, allowed charset, unique per merchant.
- Amount: positive, stored as integer minor units (6 decimals for USDC), display max 2 decimals, configurable upper bound; reject NaN/Infinity/exponent notation. No float math.
- Customer email: reasonable email check (must reject "sdsd").
- Remittance: amount <= available balance and <= per-tx cap; beneficiary name and account required before submit; Travel Rule checkbox forced ON and disabled when amount >= 1000 USDC.
- Return structured field errors; inline messages; disable submit while invalid; idempotent against double-submit.

B. Single source of truth for numbers: landing mock (LandingHeroDashboardMockup.tsx ~L195, LandingHeroDashboard3D.tsx) and /app overview read from the same seed constants. Totals equal the sum of rows (e.g. checkout + remitted = displayed settled balance). Test recomputes totals from the seed and compares with displayed aggregates.

C. Seed: `npm run seed` creates a clean, realistic dataset: 3 settled invoices, 1 OPEN invoice ready to pay, 1 overpayment-refund example, remittances to PH/ID/AU corridors (mostly SETTLED), and a VALID audit chain. One funded-then-expired example only in sandbox, labeled simulated. No junk data. `npm run seed:reset` wipes and reseeds; it refuses to run when NODE_ENV=production.

D. Remittance table: EXPIRED rows read "Quote expired - never funded (no on-chain escrow)". Do NOT label them "auto-refunded". Add a status legend.

E. UI overflow: fix truncated columns (Chain History, Expected, "Sponsore...") with overflow-x-auto and a sticky first column; verify at 1280px and 1920px.

F. Check whether the prisma/ folder is used. If dead, report it; do not delete without approval.

Edge cases: whitespace-only strings, unicode, negative zero, very large amounts. Tests for every validator.
