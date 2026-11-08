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