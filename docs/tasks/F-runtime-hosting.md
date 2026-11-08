# Task F - Runtime reproducibility and public-demo hardening (prepare only, do NOT deploy)
1. package.json engines and .nvmrc: Node >= 22.13.0, .nvmrc = 24. Fail fast with a clear message if node:sqlite is unavailable.
2. Workers currently run only on HTTP requests. In server mode start one standing interval per worker (indexer ~3s, settlement, expiry ~60s, reconciliation), guarded by a globalThis flag against double start under Next dev HMR; graceful shutdown on SIGTERM; safe to restart mid-settlement (idempotent, resume from the last indexed block). Tests for restart/idempotency.
3. GET /api/health: db ok, RPC reachable, last indexed block, worker heartbeat ages, runtime mode. No secrets/PII.
4. Public-demo hardening: destructive/simulation endpoints (/api/v1/actions: SIMULATE_*, auto-reconcile, seed/reset) are rate-limited per IP and disabled unless DEMO_MODE=true; reset requires a DEMO_ADMIN_TOKEN header (env NAME only). Hosted default mode = sandbox; testnet mode only with the operator key held as a host secret.
5. Dockerfile (multi-stage, non-root, DB at /data volume) and docs/DEPLOY.md for Fly.io or Railway with a persistent volume, env variable NAMES only, single instance, no autostop. Explain why serverless (Vercel) will not work.

Edge cases: read-only or missing DB path, WAL files on a volume, single writer, RPC outage on startup (backoff, app still serves).
