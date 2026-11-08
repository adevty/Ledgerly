# Task G - README for a machine reader and a human judge
No marketing language. Use only facts from docs/AUDIT.md, docs/THREAT_MODEL.md and scripts you actually ran. Do not state anything you have not verified.

Structure, in order:
1. Title, one-sentence description, tracks: realworld, privacy.
2. Problem / what it does / how NEAR is used (3 short paragraphs max). Name concrete pieces: NEP-141 escrow, ft_transfer_call, claim_refund, anchor, 1Click Intents; mention relayer/meta-transactions only if verified in code.
3. Judge quickstart (<= 5 min), "do X -> see Y", three tiers: (1) `nvm use && npm ci && cp .env.example .env && npm run seed && npm run demo` (sandbox, no keys); (2) `npm run verify:onchain` (keyless, against the deployed testnet contract); (3) optional Meteor wallet checkout with the public USDC faucet. Include the `--refund-path` demo as the highlight with the expected output.
4. Real vs simulated table generated from src/lib/capabilities.ts (keep in sync by a script or test). State plainly: cross-chain solver fulfillment on testnet is simulated; off-ramp and sanctions screening are mocks; Travel Rule transmission is not implemented; fees come from the live quote.
5. Hackathon scope: first commit date and the window (2026-10-19 to 2026-11-14), verified with git log; disclose that the code was developed with AI assistance; list libraries/templates used.
6. Live testnet deployments and verified tx links (re-check each link resolves).
7. Architecture (keep the diagram, trim prose); security and threat model link, with auditor wording per THREAT_MODEL (server-side decryption).
8. Testing: real counts from `npm test` and `npm run contract:test`; Node >= 22.13.0 (24.x recommended); remove static badges that are not backed by a real run or CI.
9. Hosted demo URL, demo video URL, X post URL: clearly marked TODO placeholders (the human fills them).
10. License.

Repo hygiene: merge AGENT.md and AGENTS.md into one AGENTS.md (keep the rules, remove anything addressed to graders). Suggest a GitHub description and topics in your report (near, near-intents, nep-141, stablecoin, invoicing, escrow, remittance); the human sets them. Remove phrases like "100% live".
Verify every README command by running it in a fresh clone in a temp dir; report failures.
