# Ledgerly

Confidential, audit-ready **merchant payments & cross-border remittance** on NEAR.

## Status
- [x] Module 1 — shared kernel + core domain (payments, remittance) + tests
- [ ] Module 2 — `ledgerly-escrow` contract (Rust)
- [ ] Module 3 — privacy (encryption, commitments, view keys)
- [ ] Module 4 — use cases, Prisma, mock adapters
- [ ] Module 5 — workers (indexer, settlement, expiry)
- [ ] Module 6 — UI

## Run
```bash
npm install
npm run typecheck
npm test
npx tsx examples/domain-walkthrough.ts
```

## Layout
```
src/shared/                    Money, Rate, Result, branded IDs, events, clock
src/modules/payments/domain/   PaymentRequest aggregate + events + repository port
src/modules/remittance/domain/ Remittance aggregate, Quote VO, FX/off-ramp ports
examples/                      runnable domain walkthrough
```
The domain layer is pure TypeScript (no I/O). Money is always bigint minor units.
