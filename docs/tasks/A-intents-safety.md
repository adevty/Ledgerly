# Task A - NEAR Intents (1Click) safety and live/fallback honesty
Source of truth: docs/AUDIT.md.

Known issues: src/shared/one-click-client.ts falls back to buildOracleFallbackQuote and FNV-1a-derived fake deposit addresses when the API fails; dry:false returns real MAINNET deposit addresses while the escrow target is on NEAR TESTNET; FX falls back to DEFAULT_FALLBACK_RATES silently; the UI shows "Live Oracle"/"Live Solver Network" regardless of source.

1. NEVER show a fabricated deposit address. Remove FNV-1a address derivation from every production path (keep it only under tests/ if a test needs it). If the live API fails, return state `unavailable` with a reason; the UI shows "Solver unavailable, retry" and NO address, NO QR, NO copy button.
2. Default to dry:true. Real deposit-address generation (dry:false) only when env ENABLE_LIVE_INTENTS=true AND the user ticks an explicit confirmation ("mainnet solver address; demo escrow is testnet; do not send real funds"). Default UI label: "DRY-RUN QUOTE - no deposit address".
3. Provenance: quote results carry source: 'live' | 'oracle-fallback' and asOf; FX results carry source: 'live' | 'secondary' | 'static-fallback' and asOf. Badges: "Live" only when source is live and fresh (< 5 min); otherwise "Fallback estimate (not executable)" / "Stale rate". Fallback quotes disable address generation and "Execute".
4. Fees: inspect the REAL response shape of the 1Click quote (log structure once, redact values) and display exactly the fee the quote returns. Remove hardcoded "zero protocol fees" from the Pay Any Chain section (_checkout-portal.tsx ~L1356). Per hackathon rules, without a partner JWT the default fee is 0.2%. A "no Ledgerly fee" statement is allowed only for direct NEP-141 checkout, worded to that scope.
5. Validate any address returned by the solver against its chain's format before display; reject otherwise.
6. Tests (vitest): API failure => unavailable and no address; default is dry:true; live path requires both env and confirmation; fee comes from the fixture response; 429, malformed JSON, 2200ms timeout; expired quote deadline disables pay.

Edge cases: partial responses, quote expiry while the page is open, switching chain mid-quote, double-click on generate (idempotent). No new dependencies.
