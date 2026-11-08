# Task C - Capability registry and dynamic badges
Source: docs/AUDIT.md sections 1 and 2.

1. Create src/lib/capabilities.ts: typed map { id, label, status: 'real' | 'dry-run' | 'simulated' | 'mock', note } for: escrow register/deposit/release/refund/anchor, claim_refund, 1Click quote, deposit address, solver settlement, off-ramp payout, sanctions screening, Travel Rule (validation+sealing real; inter-VASP transmission not implemented), FX rates.
2. <StatusBadge> component (reuse existing styles). Show SIMULATED/MOCK next to: Simulate Solver Settlement, off-ramp ("Instant Partner Settle", bank rails), sanctions row ("Mock screening, demo blocklist"), Travel Rule row ("Data sealed off-chain; inter-VASP protocol not implemented").
3. "Verified on NEAR" (_checkout-portal.tsx ~L2120, merchant/page.tsx ~L511) must render dynamically: Verified only when a real tx hash exists AND on-chain status is Held/Closed AND the gateway is NEAR_TESTNET_RPC; "Simulated" in LOCAL_SANDBOX_SIMULATION; "Pending" otherwise.
4. Persistent header indicator of runtime mode: "NEAR TESTNET (live RPC)" vs "SANDBOX (simulated chain)".
5. The compliance row shows the green "OFAC + Travel Rule" check ONLY after a beneficiary is entered and screening actually ran; otherwise a neutral "Pending beneficiary".
6. Test: rendering a capability with status simulated/mock without a badge fails (registry-level test). Statuses are never hardcoded in components.

Edge cases: dark mode contrast, no layout shift, tooltip accessibility, SSR/hydration mismatch for the mode indicator.

## Addendum from Phase 1 review
7. Fee provenance: add feeSource: 'quote' | 'documented-default' to the 1Click quote type. one-click-client.ts currently reads the fee from body.quoteRequest.appFees (probably the request echo) and silently defaults to 20 bps; hardcoded 0.2 / 20 also appear in fallback branches (~L253, 297, 333, 362, 476) and as UI defaults (_checkout-portal.tsx ~L1584 `?? 0.2`, `?? 20`). Inspect the real response shape; if it exposes amountInUsd/amountOutUsd (or similar), derive the effective fee from them. Otherwise label it "0.2% default solver fee (no partner key)". In fallback/unavailable state show "~0.2% (estimate)", never a bare value, and remove the UI `?? 0.2` / `?? 20` defaults.
8. In the fallback state the spot-price row says "Live Feed" and the footer says "Live Solver API". Relabel to "Estimate" unless the price really comes from a fresh live source (verify and report which).
9. When ENABLE_LIVE_INTENTS is not true, do not render the live-address checkbox/button; show "Live deposit addresses are disabled in this demo" instead (expose the flag through an existing config/health response; no secrets). Today the checkbox renders and the server answers 403.
10. Add `ENABLE_LIVE_INTENTS=false` with a one-line comment to .env.example.
