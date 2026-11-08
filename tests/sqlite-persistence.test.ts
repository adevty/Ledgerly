import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  FixedClock,
  InMemoryOutbox,
  MockChainGateway,
  MockFxAdapter,
  MockOffRampAdapter,
  MockScreeningAdapter,
  Money,
  unwrap,
  type AccountId,
  type GrantId,
  type OrgId,
  type PaymentRequestId,
  type RemittanceId,
  type UserId,
} from "@/shared";
import { generateX25519KeyPair, verifyAuditChain } from "@/modules/privacy/domain";
import { PaymentUseCases } from "@/modules/payments/application/use-cases";
import { RemittanceUseCases } from "@/modules/remittance/application/use-cases";
import { DisclosureUseCases } from "@/modules/privacy/application/use-cases";
import type { Actor } from "@/modules/identity/domain";
import {
  MigrationConflictError,
  openLedgerlySqliteDb,
  runMigrations,
  SqliteIdempotencyStore,
  SqliteLedgerAdapter,
  SqlitePaymentRequestRepository,
  SqliteRemittanceRepository,
  SqliteRuntimeMetaStore,
  SqliteViewKeyGrantRepository,
  withTransaction,
} from "../src/shared/sqlite-persistence";

const T0 = new Date("2026-11-05T12:00:00Z");
const ORG_ID = "org_sqlite_test" as OrgId;
const OWNER: Actor = { userId: "u_owner" as UserId, orgId: ORG_ID, role: "OWNER" };

describe("SQLite Persistence Layer (node:sqlite)", () => {
  it("persists RuntimeMeta, AuditLogs, Idempotency, and Ledger entries across connections", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-meta-"));
    const dbPath = join(tempDir, "ledgerly-meta.sqlite");

    try {
      // Session 1
      const db1 = openLedgerlySqliteDb(dbPath);
      const meta1 = new SqliteRuntimeMetaStore(db1);
      const idem1 = new SqliteIdempotencyStore(db1);
      const ledger1 = new SqliteLedgerAdapter(db1);

      meta1.set("custom:test", { active: true, count: 42 });
      const kp = meta1.getOrCreateKeyPair("org-key", generateX25519KeyPair);
      meta1.appendAuditEntry({
        id: "audit_entry_1",
        actor: OWNER.userId,
        action: "GRANT_ISSUED",
        targetId: "grant_1",
        atIso: T0.toISOString(),
        prevHash: "0".repeat(64),
        hash: "1".repeat(64),
      });

      await idem1.set("key_1", {
        actorId: OWNER.userId,
        requestHash: "hash_abc",
        response: { success: true },
      });

      const journalRes = await ledger1.postBalancedJournal({
        journalId: "j_01",
        currency: "USDC",
        refType: "PAYMENT_REQUEST",
        refId: "pr_1",
        legs: [
          { account: "escrow:USDC", debitMinor: 50_000_000n, creditMinor: 0n },
          { account: "merchant:org_sqlite_test", debitMinor: 0n, creditMinor: 50_000_000n },
        ],
        now: T0,
      });
      expect(journalRes.ok).toBe(true);

      db1.close();

      // Session 2: Verify persistence
      const db2 = openLedgerlySqliteDb(dbPath);
      const meta2 = new SqliteRuntimeMetaStore(db2);
      const idem2 = new SqliteIdempotencyStore(db2);
      const ledger2 = new SqliteLedgerAdapter(db2);

      expect(meta2.get<{ active: boolean; count: number }>("custom:test")).toEqual({
        active: true,
        count: 42,
      });
      // Second call returns existing without generating new
      const kpLoaded = meta2.getOrCreateKeyPair("org-key", generateX25519KeyPair);
      expect(kpLoaded.publicKeyHex).toBe(kp.publicKeyHex);

      const logs = meta2.loadAuditLog();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.targetId).toBe("grant_1");

      const idemLoaded = await idem2.get<{ success: boolean }>("key_1");
      expect(idemLoaded?.actorId).toBe(OWNER.userId);
      expect(idemLoaded?.response).toEqual({ success: true });

      const entries = await ledger2.listEntries({ refType: "PAYMENT_REQUEST", refId: "pr_1" });
      expect(entries).toHaveLength(2);
      expect(entries[0]?.debitMinor).toBe(50_000_000n);
      expect(entries[1]?.creditMinor).toBe(50_000_000n);

      db2.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("persists PaymentRequests, Remittances, and ViewKeyGrants across DB restarts", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-repos-"));
    const dbPath = join(tempDir, "ledgerly-repos.sqlite");

    const clock = new FixedClock(T0);
    const orgKeys = generateX25519KeyPair();
    const auditorKeys = generateX25519KeyPair();

    try {
      // Session 1: Create entities through Application Use Cases using SQLite repositories
      const db1 = openLedgerlySqliteDb(dbPath);
      const outbox1 = new InMemoryOutbox();
      const meta1 = new SqliteRuntimeMetaStore(db1);
      const paymentRepo1 = new SqlitePaymentRequestRepository(db1, outbox1);
      const remittanceRepo1 = new SqliteRemittanceRepository(db1, outbox1);
      const grantRepo1 = new SqliteViewKeyGrantRepository(db1, outbox1);
      const ledger1 = new SqliteLedgerAdapter(db1);
      const idempotency1 = new SqliteIdempotencyStore(db1);
      const chain1 = new MockChainGateway();
      const fx1 = new MockFxAdapter();
      const offRamp1 = new MockOffRampAdapter();
      const screening1 = new MockScreeningAdapter();

      const payments1 = new PaymentUseCases({
        repo: paymentRepo1,
        chain: chain1,
        ledger: ledger1,
        idempotency: idempotency1,
        clock,
        merchantNearAccounts: new Map([[ORG_ID, "merchant.testnet" as AccountId]]),
      });

      const remittances1 = new RemittanceUseCases({
        repo: remittanceRepo1,
        fx: fx1,
        offRamp: offRamp1,
        screening: screening1,
        chain: chain1,
        ledger: ledger1,
        idempotency: idempotency1,
        clock,
        offRampSettlementAccount: "offramp.ledgerly.testnet" as AccountId,
      });

      const disclosures1 = new DisclosureUseCases({
        grantRepo: grantRepo1,
        paymentRepo: paymentRepo1,
        remittanceRepo: remittanceRepo1,
        chain: chain1,
        clock,
        initialAuditLog: meta1.loadAuditLog(),
        onAuditEntry: (entry) => meta1.appendAuditEntry(entry),
      });

      // 1. Create a Payment Request
      const createdPayment = unwrap(
        await payments1.createPaymentRequest({
          idempotencyKey: "idem_pr_sqlite",
          actor: OWNER,
          requestId: "pr_sqlite_100" as PaymentRequestId,
          orgPublicKeyHex: orgKeys.publicKeyHex,
          orderRef: "ORD-SQLITE-1",
          description: "Persistent Invoice 100",
          amountDecimal: "100",
          expiresInSec: 3600,
        }),
      );
      expect(createdPayment.escrowId).toBeDefined();

      // 2. Create a Remittance
      const createdRemittance = unwrap(
        await remittances1.createQuotedRemittance({
          idempotencyKey: "idem_rm_sqlite",
          actor: OWNER,
          remittanceId: "rm_sqlite_200" as RemittanceId,
          orgPublicKeyHex: orgKeys.publicKeyHex,
          sourceUsdcDecimal: "50",
          targetCurrency: "IDR",
          recipientType: "BANK",
          recipientName: "Budi Santoso",
          recipientAccountOrWallet: "BCA-9876543210",
          recipientCountry: "ID",
        }),
      );
      expect(createdRemittance.escrowId).toBeDefined();

      // Register both in chain for audit verification
      await chain1.registerEscrow({
        escrowId: createdRemittance.escrowId,
        kind: "Remittance",
        commitment: createdRemittance.commitment,
        refundAfterNs: 999999999999999999n,
      });

      // 3. Issue ViewKey grant
      const grantRes = unwrap(
        await disclosures1.issueScopedViewKey({
          actor: OWNER,
          grantId: "grant_sqlite_1" as GrantId,
          auditorPublicKeyHex: auditorKeys.publicKeyHex,
          orgPrivateKeyHex: orgKeys.privateKeyHex,
          scope: {
            orgId: ORG_ID,
            from: new Date("2026-11-01T00:00:00Z"),
            to: new Date("2026-11-30T23:59:59Z"),
            kinds: ["PAYMENT", "REMITTANCE"],
          },
          expiresAt: new Date("2026-11-15T00:00:00Z"),
        }),
      );
      expect(grantRes.authorizedRecordCount).toBe(2);

      db1.close();

      // Session 2: Open SQLite database afresh and verify data and decryption
      const db2 = openLedgerlySqliteDb(dbPath);
      const outbox2 = new InMemoryOutbox();
      const meta2 = new SqliteRuntimeMetaStore(db2);
      const paymentRepo2 = new SqlitePaymentRequestRepository(db2, outbox2);
      const remittanceRepo2 = new SqliteRemittanceRepository(db2, outbox2);
      const grantRepo2 = new SqliteViewKeyGrantRepository(db2, outbox2);

      const loadedPayment = await paymentRepo2.findById("pr_sqlite_100" as PaymentRequestId);
      expect(loadedPayment).not.toBeNull();
      expect(loadedPayment?.aggregate.amount).toEqual(unwrap(Money.of(100_000_000n, "USDC")));
      expect(loadedPayment?.aggregate.status).toBe("OPEN");

      const loadedRemittance = await remittanceRepo2.findById("rm_sqlite_200" as RemittanceId);
      expect(loadedRemittance).not.toBeNull();
      expect(loadedRemittance?.aggregate.quoteVO.source).toEqual(unwrap(Money.of(50_000_000n, "USDC")));
      expect(loadedRemittance?.aggregate.status).toBe("QUOTED");

      const loadedGrant = await grantRepo2.findById("grant_sqlite_1" as GrantId);
      expect(loadedGrant).not.toBeNull();
      expect(loadedGrant?.orgId).toBe(ORG_ID);

      // Verify auditor can decrypt records from the reloaded repositories
      const disclosures2 = new DisclosureUseCases({
        grantRepo: grantRepo2,
        paymentRepo: paymentRepo2,
        remittanceRepo: remittanceRepo2,
        chain: chain1,
        clock,
        initialAuditLog: meta2.loadAuditLog(),
      });

      const auditRecords = unwrap(
        await disclosures2.verifyScopedRecordsAsAuditor({
          grantId: "grant_sqlite_1" as GrantId,
          auditorPrivateKeyHex: auditorKeys.privateKeyHex,
        }),
      );
      expect(auditRecords).toHaveLength(2);
      const prRecord = auditRecords.find((r) => r.recordId === "pr_sqlite_100");
      expect(prRecord).toBeDefined();
      const prPayload = prRecord?.decryptedPayload as { orderRef?: string; description?: string };
      expect(prPayload.orderRef).toBe("ORD-SQLITE-1");
      expect(prPayload.description).toBe("Persistent Invoice 100");

      const rmRecord = auditRecords.find((r) => r.recordId === "rm_sqlite_200");
      expect(rmRecord).toBeDefined();
      const rmPayload = rmRecord?.decryptedPayload as { recipientName?: string };
      expect(rmPayload.recipientName).toBe("Budi Santoso");

      // Verify audit log chain
      const auditLog = meta2.loadAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
      expect(verifyAuditChain(auditLog)).toBe(true);

      db2.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("applies required pragmas (WAL, busy_timeout=5000, foreign_keys=ON, synchronous=NORMAL)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-pragmas-"));
    const dbPath = join(tempDir, "ledgerly-pragmas.sqlite");

    try {
      const db = openLedgerlySqliteDb(dbPath);
      const jMode = db.prepare("PRAGMA journal_mode;").get() as { journal_mode: string };
      expect(jMode.journal_mode.toLowerCase()).toBe("wal");

      const busyTimeout = db.prepare("PRAGMA busy_timeout;").get() as { timeout: number };
      expect(busyTimeout.timeout).toBe(5000);

      const fKeys = db.prepare("PRAGMA foreign_keys;").get() as { foreign_keys: number };
      expect(fKeys.foreign_keys).toBe(1);

      const syncMode = db.prepare("PRAGMA synchronous;").get() as { synchronous: number };
      expect(syncMode.synchronous).toBe(1); // 1 = NORMAL

      const userVer = db.prepare("PRAGMA user_version;").get() as { user_version: number };
      expect(userVer.user_version).toBe(1);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runs migrations on empty DB and establishes v1 with UNIQUE(seq) index", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-mig-empty-"));
    const dbPath = join(tempDir, "empty.sqlite");

    try {
      const db = openLedgerlySqliteDb(dbPath);
      const v = db.prepare("PRAGMA user_version").get() as { user_version: number };
      expect(v.user_version).toBe(1);

      // Verify unique index on audit_log_entries(seq)
      const indexList = db
        .prepare("PRAGMA index_list(audit_log_entries);")
        .all() as Array<{ name: string; unique: number }>;
      const uniqueSeq = indexList.find(
        (i) => i.name === "idx_audit_log_entries_seq" && i.unique === 1,
      );
      expect(uniqueSeq).toBeDefined();

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("migrates a v0 database to v1 successfully", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-mig-v0-"));
    const dbPath = join(tempDir, "v0.sqlite");

    try {
      // Simulate existing v0 database before migration
      const rawDb = new DatabaseSync(dbPath);
      rawDb.exec(`
        CREATE TABLE audit_log_entries (
          seq INTEGER,
          entry_json TEXT NOT NULL
        );
        INSERT INTO audit_log_entries (seq, entry_json) VALUES
          (1, '{"id":"audit_1","actor":"test","action":"ACTION","targetId":"t1","atIso":"2026-11-05T00:00:00Z","hash":"h1","prevHash":"0"}'),
          (2, '{"id":"audit_2","actor":"test","action":"ACTION","targetId":"t2","atIso":"2026-11-05T00:01:00Z","hash":"h2","prevHash":"h1"}');
      `);
      const vBefore = rawDb.prepare("PRAGMA user_version;").get() as { user_version: number };
      expect(vBefore.user_version).toBe(0);
      rawDb.close();

      // Opening through openLedgerlySqliteDb applies migration 1
      const migratedDb = openLedgerlySqliteDb(dbPath);
      const vAfter = migratedDb.prepare("PRAGMA user_version;").get() as { user_version: number };
      expect(vAfter.user_version).toBe(1);

      // Verify index was created
      const indexList = migratedDb
        .prepare("PRAGMA index_list(audit_log_entries);")
        .all() as Array<{ name: string; unique: number }>;
      expect(indexList.some((i) => i.name === "idx_audit_log_entries_seq" && i.unique === 1)).toBe(
        true,
      );

      // Verify rows are preserved
      const count = migratedDb.prepare("SELECT count(*) as c FROM audit_log_entries;").get() as {
        c: number;
      };
      expect(count.c).toBe(2);

      migratedDb.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects conflict and refuses to destroy data on duplicate seq in v0 DB", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-mig-dupe-"));
    const dbPath = join(tempDir, "dupe.sqlite");

    try {
      // Create v0 DB with duplicate seq
      const rawDb = new DatabaseSync(dbPath);
      rawDb.exec(`
        CREATE TABLE audit_log_entries (
          seq INTEGER,
          entry_json TEXT NOT NULL
        );
        INSERT INTO audit_log_entries (seq, entry_json) VALUES
          (881, '{"id":"audit_881_a","actor":"a1","action":"A","targetId":"t1","atIso":"2026-11-05T00:00:00Z","hash":"h1","prevHash":"0"}'),
          (881, '{"id":"audit_881_b","actor":"a2","action":"B","targetId":"t2","atIso":"2026-11-05T00:01:00Z","hash":"h2","prevHash":"0"}');
      `);
      rawDb.close();

      // Migrating should throw MigrationConflictError
      expect(() => openLedgerlySqliteDb(dbPath)).toThrow(MigrationConflictError);

      // Verify original data is intact (never deleted or rewritten)
      const inspectDb = new DatabaseSync(dbPath);
      const rows = inspectDb.prepare("SELECT seq FROM audit_log_entries").all() as Array<{
        seq: number;
      }>;
      expect(rows).toHaveLength(2);
      expect(rows[0]?.seq).toBe(881);
      expect(rows[1]?.seq).toBe(881);
      inspectDb.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("withTransaction commits atomicity and rolls back on failure leaving no partial writes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-tx-"));
    const dbPath = join(tempDir, "tx.sqlite");

    try {
      const db = openLedgerlySqliteDb(dbPath);
      db.exec("CREATE TABLE test_tx (id INTEGER PRIMARY KEY, val TEXT);");

      // Successful transaction
      withTransaction(db, () => {
        db.prepare("INSERT INTO test_tx (id, val) VALUES (1, 'val1');").run();
        db.prepare("INSERT INTO test_tx (id, val) VALUES (2, 'val2');").run();
      });

      const count1 = db.prepare("SELECT count(*) as c FROM test_tx;").get() as { c: number };
      expect(count1.c).toBe(2);

      // Failed transaction should roll back completely
      expect(() =>
        withTransaction(db, () => {
          db.prepare("INSERT INTO test_tx (id, val) VALUES (3, 'val3');").run();
          throw new Error("Simulated failure mid-transaction");
        }),
      ).toThrow("Simulated failure mid-transaction");

      // Row 3 must NOT exist
      const count2 = db.prepare("SELECT count(*) as c FROM test_tx;").get() as { c: number };
      expect(count2.c).toBe(2);
      const row3 = db.prepare("SELECT * FROM test_tx WHERE id = 3;").get();
      expect(row3).toBeUndefined();

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("handles concurrent audit log appends via Promise.all staying contiguous", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-concur-"));
    const dbPath = join(tempDir, "concur.sqlite");

    try {
      const db = openLedgerlySqliteDb(dbPath);
      const meta = new SqliteRuntimeMetaStore(db);

      // 20 concurrent appends
      const tasks = Array.from({ length: 20 }, (_, i) => ({
        id: `audit_concurrent_${i}`,
        actor: `actor_${i}`,
        action: "RECORD_ACTION",
        targetId: `target_${i}`,
        atIso: new Date(Date.now() + i * 100).toISOString(),
      }));

      // Run via Promise.all
      const results = await Promise.all(tasks.map((t) => Promise.resolve(meta.appendAuditEntry(t))));
      expect(results).toHaveLength(20);

      const logs = meta.loadAuditLog();
      expect(logs).toHaveLength(20);

      // Verify sequence is strictly contiguous 1..20
      const seqs = logs.map((l) => l.seq);
      expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

      // Verify tamper-evident audit hash chain is intact
      expect(verifyAuditChain(logs)).toBe(true);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails with a clear error if database directory is not writable", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-ro-"));
    chmodSync(tempDir, 0o444); // read-only directory
    const dbPath = join(tempDir, "readonly.sqlite");

    try {
      expect(() => openLedgerlySqliteDb(dbPath)).toThrow(/read-only or not writable/);
    } finally {
      chmodSync(tempDir, 0o777);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("cross-connection concurrency: two separate DatabaseSync connections appending concurrently produce contiguous seq and a valid chain", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-sqlite-cross-conn-"));
    const dbPath = join(tempDir, "cross-conn.sqlite");

    try {
      // Initialize schema
      const initDb = openLedgerlySqliteDb(dbPath);
      initDb.close();

      // Two distinct connections to the same database file
      const db1 = openLedgerlySqliteDb(dbPath);
      const db2 = openLedgerlySqliteDb(dbPath);
      const meta1 = new SqliteRuntimeMetaStore(db1);
      const meta2 = new SqliteRuntimeMetaStore(db2);

      // Concurrently append 10 entries from conn1 and 10 entries from conn2
      const tasks1 = Array.from({ length: 10 }, (_, i) => ({
        id: `audit_conn1_${i}`,
        actor: "conn1_operator",
        action: "WRITE_CONN1",
        targetId: `target_1_${i}`,
        atIso: new Date(Date.now() + i * 50).toISOString(),
      }));

      const tasks2 = Array.from({ length: 10 }, (_, i) => ({
        id: `audit_conn2_${i}`,
        actor: "conn2_operator",
        action: "WRITE_CONN2",
        targetId: `target_2_${i}`,
        atIso: new Date(Date.now() + i * 50 + 25).toISOString(),
      }));

      // Interleave tasks
      const allTasks = tasks1.flatMap((t1, i) => [
        () => meta1.appendAuditEntry(t1),
        () => meta2.appendAuditEntry(tasks2[i]!),
      ]);

      await Promise.all(allTasks.map((fn) => Promise.resolve().then(fn)));

      const finalLogs = meta1.loadAuditLog();
      expect(finalLogs).toHaveLength(20);

      // Verify sequence is contiguous 1..20
      const seqs = finalLogs.map((l) => l.seq);
      expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

      // Verify hash chain integrity
      expect(verifyAuditChain(finalLogs)).toBe(true);

      db1.close();
      db2.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
