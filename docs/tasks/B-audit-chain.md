# Task B - Audit chain fork, truthful auditor states, threat model
Source: docs/AUDIT.md sections 6 and 7. Depends on Task S (withTransaction).

1. Root cause: verifyScopedRecordsAsAuditor / computeDashboardSnapshot appends audit entries on passive polls; concurrent requests fork the chain (duplicate seq with same prevHash). Fix:
   - Read-only queries MUST NOT write audit entries. Only explicit actions do (grant issued/rotated, export CSV, anchor, manual reconcile).
   - Append inside a single BEGIN IMMEDIATE transaction that reads the latest seq/hash from the DB, not memory. UNIQUE(seq) comes from Task S.
2. Do not silently rewrite history. If an existing chain is already broken, detect and report the first broken seq; the auditor badge shows Verified / Broken at #N / Unavailable and never spins. (The demo DB will be reseeded later.)
3. Record status semantics: `verified`, `mismatch` (on-chain commitment differs: serious), `not-registered` (expired quote never funded, no on-chain escrow ever existed: expected). The header says "Zero Discrepancies" only when mismatch == 0; show not-registered separately with an explanation.
4. Copy fix: the backend decrypts and sends plaintext to the browser. Replace "decrypt locally" / "Verified locally" strings (auditor page, landing) with accurate wording: "Decrypted server-side within the grant scope; payload hash verified against the on-chain commitment."
5. Tests: expired, rotated and wrong-scope grants; tampered payload; Promise.all of 20 concurrent appends yields contiguous seq and a valid chain; a read-only snapshot never changes the chain length.
6. Create docs/THREAT_MODEL.md (max 1 page): org and auditor X25519 private keys are plaintext in SQLite table runtime_meta, so the operator can decrypt everything; protects against public chain observers and competitors; commitment+salt prevents brute-forcing low-entropy payloads; limitations; next steps (encrypt keys at rest with an env master key via node:crypto, client-side auditor key custody, TEE/NEAR AI Cloud). PROPOSE at-rest encryption with tradeoffs; do not implement without approval.

Edge cases: clock skew on grant expiry, RPC timeout during verification (Unavailable, not Failed), duplicate commitments.
