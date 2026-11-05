# Ledgerly

Confidential, audit-ready **merchant payments & cross-border remittance** on NEAR.

## Status
- [x] Module 1 — shared kernel + core domain (payments, remittance) + tests
- [x] Module 2 — `ledgerly-escrow` contract (Rust) + `ChainGateway` port + tests
- [x] Module 3 — privacy (envelope encryption, commitments, view keys, audit hash chain) + tests
- [x] Module 4 — application use cases, Prisma schema, RBAC, compliance, double-entry ledger, mock adapters + integration tests
- [ ] Module 5 — workers (indexer, settlement, expiry, reconciliation)
- [ ] Module 6 — UI

## Run
```bash
npm install
npm run typecheck
npm test
npm run contract:test
npm run contract:check
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
