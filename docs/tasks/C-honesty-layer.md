# Task C - Capability registry and dynamic badges
Source: docs/AUDIT.md sections 1 and 2.

1. Create src/lib/capabilities.ts: typed map { id, label, status: 'real' | 'dry-run' | 'simulated' | 'mock', note } for: escrow register/deposit/release/refund/anchor, claim_refund, 1Click quote, deposit address, solver settlement, off-ramp payout, sanctions screening, Travel Rule (validation+sealing real; inter-VASP transmission not implemented), FX rates.
2. <StatusBadge> component (reuse existing styles). Show SIMULATED/MOCK next to: Simulate Solver Settlement, off-ramp ("Instant Partner Settle", bank rails), sanctions row ("Mock screening, demo blocklist"), Travel Rule row ("Data sealed off-chain; inter-VASP protocol not implemented").
3. "Verified on NEAR" (_checkout-portal.tsx ~L2120, merchant/page.tsx ~L511) must render dynamically: Verified only when a real tx hash exists AND on-chain status is Held/Closed AND the gateway is NEAR_TESTNET_RPC; "Simulated" in LOCAL_SANDBOX_SIMULATION; "Pending" otherwise.
4. Persistent header indicator of runtime mode: "NEAR TESTNET (live RPC)" vs "SANDBOX (simulated chain)".
5. The compliance row shows the green "OFAC + Travel Rule" check ONLY after a beneficiary is entered and screening actually ran; otherwise a neutral "Pending beneficiary".
6. Test: rendering a capability with status simulated/mock without a badge fails (registry-level test). Statuses are never hardcoded in components.

Edge cases: dark mode contrast, no layout shift, tooltip accessibility, SSR/hydration mismatch for the mode indicator.
