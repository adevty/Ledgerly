# Task H - Final pre-submission verification
Do not push, publish, post or submit anything.

1. Fresh-clone test: clone into a temp dir, use the Node version from .nvmrc, follow ONLY the README Judge quickstart literally. Report every deviation or undocumented step; fix doc/code issues (minimal changes).
2. Run typecheck, npm test, npm run contract:test, npm run build, npm audit; report real numbers. Remove any "0 vulnerabilities" claim not backed by npm audit.
3. Secrets scan of the working tree and full git history for private keys, seed phrases, API keys, .env contents, JWTs. Print only file path + commit hash, never values. If anything is found, STOP and tell me to rotate it first.
4. Sanitize docs/AUDIT.md: replace absolute file:///home/... paths with repo-relative paths, update statuses to post-fix reality, keep it as docs/SELF_AUDIT.md.
5. Claim check: re-run the claims audit; no UNSUPPORTED claim may remain in the UI or README. Manually block the network and confirm no fabricated deposit address can render.
6. Link check: every Nearblocks link and address in the README resolves and matches the deployed accounts.
7. UX smoke at 1280px and 1920px, light and dark: landing, merchant, remittance, auditor, checkout. Report overflow, console errors, empty states.
8. Git identity: list the authors in git log; the team size in the submission must match.
9. Draft (do not post) an X post: first line states the user problem; says it was built at NEAR HACKATHON; includes @NEARProtocol and #NEARHackathon; says concretely what NEAR enables (escrow refund guarantee, intents cross-chain settlement, auditable commitments); placeholders for demo and repo URLs; a genuine feedback question. Also a 60-90s demo script (overpay -> auto-refund -> auditor verifies -> balanced CSV -> claim_refund with the backend off) with exact clicks.
10. Prepare the submission JSON per the HACKATHON.md contract with placeholders for every human-decided field (no invented names, emails, NEAR payout account or URLs; no requestId yet). Print it for review only; validate lengths (idea 20-2000 chars); no private data.

Deliver a go/no-go checklist with PASS/FAIL per item.
