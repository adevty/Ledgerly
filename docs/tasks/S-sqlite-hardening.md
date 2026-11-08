# Task S - Harden the SQLite layer
File: src/shared/sqlite-persistence.ts. No new dependencies, no migration to another database, no rewrite of repositories.

1. Apply on every connection: PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL. DB path from env LEDGERLY_DB_PATH (default .data/ledgerly.sqlite); create the directory if missing; fail with a clear error if read-only.
2. Schema versioning via PRAGMA user_version with ordered, idempotent migrations safe on existing DBs. First migration: UNIQUE(seq) on audit_log_entries. If existing rows already violate it, do not delete data; report the conflict and stop.
3. Provide a `withTransaction(fn)` helper using BEGIN IMMEDIATE / COMMIT / ROLLBACK. All audit-log appends and every multi-statement ledger write must use it, reading the latest seq/hash FROM THE DB inside the transaction.
4. Add `npm run db:backup`: timestamped snapshot via VACUUM INTO into ./backups/ (gitignored); refuse to overwrite an existing file.
5. Ensure .data/, backups/ and *.sqlite* are in .gitignore and .dockerignore.
6. Tests with a temporary file DB (no shared state): migration on empty DB and on a v0 DB, concurrent appends via Promise.all stay contiguous, rollback on error leaves no partial writes, read-only path gives a clear error.
7. Report: schema diff, any existing-data conflicts, typecheck + tests passing.

Edge cases: process killed mid-transaction, WAL/SHM files on a mounted volume, two processes opening the same file (document: only one supported), a long read blocking a checkpoint.
