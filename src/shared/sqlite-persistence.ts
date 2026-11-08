import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  Money,
  Rate,
  ok,
  unwrap,
  type AccountId,
  type Currency,
  type DomainError,
  type EscrowId,
  type GrantId,
  type IdempotencyStore,
  type OrgId,
  type PaymentRequestId,
  type RemittanceId,
  type Result,
  type TxHash,
  type UserId,
} from "@/shared";
import {
  PaymentRequest,
  type Payment,
  type PaymentRequestRepository,
  type PaymentRequestSnapshot,
  type PaymentStatus,
  type StoredPaymentRequest,
} from "@/modules/payments/domain";
import {
  Quote,
  Remittance,
  type Recipient,
  type RemittanceRepository,
  type RemittanceSnapshot,
  type RemittanceStatus,
  type StoredRemittance,
} from "@/modules/remittance/domain";
import {
  GENESIS_AUDIT_HASH,
  ViewKeyGrant,
  computeAuditEntryHash,
  type AuditLogEntry,
  type DisclosureRecordKind,
  type EncryptedEnvelope,
  type KeyPairHex,
  type ViewKeyGrantRepository,
  type ViewKeyGrantSnapshot,
} from "@/modules/privacy/domain";
import {
  validateBalancedLegs,
  type LedgerEntryRecord,
  type LedgerLeg,
  type LedgerPort,
} from "@/modules/ledger/domain/ledger";
import type { InMemoryOutbox } from "./mocks";

interface SerializedMoney {
  readonly amountMinor: string;
  readonly currency: Currency;
}

interface SerializedRate {
  readonly from: Currency;
  readonly to: Currency;
  readonly num: string;
  readonly den: string;
}

interface SerializedQuote {
  readonly source: SerializedMoney;
  readonly fee: SerializedMoney;
  readonly rate: SerializedRate;
  readonly lockedUntilIso: string;
}

interface SerializedPayment {
  readonly txHash: TxHash;
  readonly payer: AccountId;
  readonly amount: SerializedMoney;
  readonly detectedAtIso: string;
}

interface SerializedPaymentRequestSnapshot {
  readonly id: PaymentRequestId;
  readonly merchantId: OrgId;
  readonly escrowId: EscrowId;
  readonly amount: SerializedMoney;
  readonly status: PaymentStatus;
  readonly expiresAtIso: string;
  readonly payments: readonly SerializedPayment[];
  readonly refunded: SerializedMoney;
  readonly pendingRefund: SerializedMoney;
  readonly released: SerializedMoney;
  readonly version: number;
}

interface SerializedRemittanceSnapshot {
  readonly id: RemittanceId;
  readonly senderId: UserId;
  readonly escrowId: EscrowId;
  readonly recipient: Recipient;
  readonly quote: SerializedQuote;
  readonly status: RemittanceStatus;
  readonly attempts: number;
  readonly fundingTx: TxHash | null;
  readonly payoutRef: string | null;
  readonly lastFailureCode: string | null;
  readonly version: number;
}

interface SerializedViewKeyGrantSnapshot {
  readonly id: GrantId;
  readonly orgId: OrgId;
  readonly auditorPublicKeyHex: string;
  readonly scope: {
    readonly orgId: OrgId;
    readonly fromIso: string;
    readonly toIso: string;
    readonly kinds: readonly DisclosureRecordKind[];
  };
  readonly expiresAtIso: string;
  readonly revokedAtIso: string | null;
  readonly auditorWraps: Record<string, string>;
  readonly version: number;
}

function serializeMoney(m: Money): SerializedMoney {
  return { amountMinor: m.amountMinor.toString(), currency: m.currency };
}

function deserializeMoney(s: SerializedMoney): Money {
  return unwrap(Money.of(BigInt(s.amountMinor), s.currency));
}

function serializeRate(r: Rate): SerializedRate {
  return {
    from: r.from,
    to: r.to,
    num: r.num.toString(),
    den: r.den.toString(),
  };
}

function deserializeRate(s: SerializedRate): Rate {
  return unwrap(Rate.of(s.from, s.to, BigInt(s.num), BigInt(s.den)));
}

function serializeQuote(q: Quote): SerializedQuote {
  return {
    source: serializeMoney(q.source),
    fee: serializeMoney(q.fee),
    rate: serializeRate(q.rate),
    lockedUntilIso: q.lockedUntil.toISOString(),
  };
}

function deserializeQuote(s: SerializedQuote): Quote {
  return unwrap(
    Quote.create({
      source: deserializeMoney(s.source),
      fee: deserializeMoney(s.fee),
      rate: deserializeRate(s.rate),
      lockedUntil: new Date(s.lockedUntilIso),
    }),
  );
}

function serializePaymentRequestSnapshot(
  snap: PaymentRequestSnapshot,
): SerializedPaymentRequestSnapshot {
  return {
    id: snap.id,
    merchantId: snap.merchantId,
    escrowId: snap.escrowId,
    amount: serializeMoney(snap.amount),
    status: snap.status,
    expiresAtIso: snap.expiresAt.toISOString(),
    payments: snap.payments.map((p) => ({
      txHash: p.txHash,
      payer: p.payer,
      amount: serializeMoney(p.amount),
      detectedAtIso: p.detectedAt.toISOString(),
    })),
    refunded: serializeMoney(snap.refunded),
    pendingRefund: serializeMoney(snap.pendingRefund),
    released: serializeMoney(snap.released),
    version: snap.version,
  };
}

function deserializePaymentRequestSnapshot(
  raw: SerializedPaymentRequestSnapshot,
): PaymentRequestSnapshot {
  const payments: Payment[] = raw.payments.map((p) => ({
    txHash: p.txHash,
    payer: p.payer,
    amount: deserializeMoney(p.amount),
    detectedAt: new Date(p.detectedAtIso),
  }));
  return {
    id: raw.id,
    merchantId: raw.merchantId,
    escrowId: raw.escrowId,
    amount: deserializeMoney(raw.amount),
    status: raw.status,
    expiresAt: new Date(raw.expiresAtIso),
    payments,
    refunded: deserializeMoney(raw.refunded),
    pendingRefund: deserializeMoney(raw.pendingRefund),
    released: deserializeMoney(raw.released),
    version: raw.version,
  };
}

function serializeRemittanceSnapshot(snap: RemittanceSnapshot): SerializedRemittanceSnapshot {
  return {
    id: snap.id,
    senderId: snap.senderId,
    escrowId: snap.escrowId,
    recipient: snap.recipient,
    quote: serializeQuote(snap.quote),
    status: snap.status,
    attempts: snap.attempts,
    fundingTx: snap.fundingTx,
    payoutRef: snap.payoutRef,
    lastFailureCode: snap.lastFailureCode,
    version: snap.version,
  };
}

function deserializeRemittanceSnapshot(raw: SerializedRemittanceSnapshot): RemittanceSnapshot {
  return {
    id: raw.id,
    senderId: raw.senderId,
    escrowId: raw.escrowId,
    recipient: raw.recipient,
    quote: deserializeQuote(raw.quote),
    status: raw.status,
    attempts: raw.attempts,
    fundingTx: raw.fundingTx,
    payoutRef: raw.payoutRef,
    lastFailureCode: raw.lastFailureCode,
    version: raw.version,
  };
}

function serializeGrantSnapshot(snap: ViewKeyGrantSnapshot): SerializedViewKeyGrantSnapshot {
  return {
    id: snap.id,
    orgId: snap.orgId,
    auditorPublicKeyHex: snap.auditorPublicKeyHex,
    scope: {
      orgId: snap.scope.orgId,
      fromIso: snap.scope.from.toISOString(),
      toIso: snap.scope.to.toISOString(),
      kinds: [...snap.scope.kinds],
    },
    expiresAtIso: snap.expiresAt.toISOString(),
    revokedAtIso: snap.revokedAt ? snap.revokedAt.toISOString() : null,
    auditorWraps: { ...snap.auditorWraps },
    version: snap.version,
  };
}

function deserializeGrantSnapshot(raw: SerializedViewKeyGrantSnapshot): ViewKeyGrantSnapshot {
  return {
    id: raw.id,
    orgId: raw.orgId,
    auditorPublicKeyHex: raw.auditorPublicKeyHex,
    scope: {
      orgId: raw.scope.orgId,
      from: new Date(raw.scope.fromIso),
      to: new Date(raw.scope.toIso),
      kinds: [...raw.scope.kinds],
    },
    expiresAt: new Date(raw.expiresAtIso),
    revokedAt: raw.revokedAtIso ? new Date(raw.revokedAtIso) : null,
    auditorWraps: { ...raw.auditorWraps },
    version: raw.version,
  };
}

export class MigrationConflictError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "MigrationConflictError";
  }
}

/**
 * Execute an atomic transaction using BEGIN IMMEDIATE to avoid race conditions.
 * Automatically rolls back on any thrown exception.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // ignore rollback failure if transaction was already aborted
    }
    throw err;
  }
}

export interface SchemaMigration {
  readonly version: number;
  readonly name: string;
  readonly up: (db: DatabaseSync) => void;
}

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  {
    version: 1,
    name: "enforce_unique_audit_log_seq",
    up: (db: DatabaseSync) => {
      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log_entries'")
        .get();

      if (!tableCheck) {
        db.exec(`
          CREATE TABLE audit_log_entries (
            seq INTEGER PRIMARY KEY,
            entry_json TEXT NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_entries_seq ON audit_log_entries(seq);
        `);
        return;
      }

      // Check if any existing rows violate uniqueness of seq
      const dupes = db
        .prepare("SELECT seq, COUNT(*) as c FROM audit_log_entries GROUP BY seq HAVING c > 1")
        .all() as Array<{ seq: number; c: number }>;

      if (dupes.length > 0) {
        throw new MigrationConflictError(
          `Migration 1 conflict: audit_log_entries contains duplicate sequence numbers: ${JSON.stringify(dupes)}`,
          { duplicates: dupes },
        );
      }

      // Check if entry_json contains duplicate audit IDs/forked chain
      const rows = db.prepare("SELECT seq, entry_json FROM audit_log_entries").all() as Array<{
        seq: number;
        entry_json: string;
      }>;
      const seenIds = new Set<string>();
      const duplicateIds: string[] = [];
      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.entry_json) as { id?: string };
          if (parsed?.id) {
            if (seenIds.has(parsed.id)) {
              duplicateIds.push(parsed.id);
            }
            seenIds.add(parsed.id);
          }
        } catch {
          // ignore parse errors
        }
      }

      if (duplicateIds.length > 0) {
        throw new MigrationConflictError(
          `Migration 1 conflict: audit_log_entries contains duplicate audit IDs (forked chain): ${duplicateIds.slice(0, 5).join(", ")} (total: ${duplicateIds.length})`,
          { duplicateIds },
        );
      }

      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_entries_seq ON audit_log_entries(seq);");
    },
  },
];

export function runMigrations(db: DatabaseSync): number {
  const versionRow = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  let currentVersion = versionRow?.user_version ?? 0;

  for (const migration of SCHEMA_MIGRATIONS) {
    if (migration.version > currentVersion) {
      withTransaction(db, () => {
        migration.up(db);
        db.exec(`PRAGMA user_version = ${migration.version};`);
      });
      currentVersion = migration.version;
    }
  }

  return currentVersion;
}

export function assertNodeSqliteSupport(): void {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if ((major ?? 0) < 22 || ((major ?? 0) === 22 && (minor ?? 0) < 13)) {
    throw new Error(
      `[Ledgerly] Incompatible Node.js runtime: ${process.version}. Ledgerly requires Node.js >= 22.13.0 (Node 24 recommended) with built-in 'node:sqlite' database engine support.`,
    );
  }
}

/**
 * Open or initialize the SQLite database using Node's built-in `node:sqlite`.
 */
export function openLedgerlySqliteDb(dbPath?: string): DatabaseSync {
  assertNodeSqliteSupport();
  const target =
    dbPath ??
    process.env.LEDGERLY_DB_PATH ??
    process.env.LEDGERLY_SQLITE_PATH ??
    resolve(process.cwd(), ".data/ledgerly.sqlite");

  if (target !== ":memory:") {
    const dir = dirname(target);
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      throw new Error(
        `Failed to create database directory '${dir}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      if (existsSync(/*turbopackIgnore: true*/ target)) {
        accessSync(/*turbopackIgnore: true*/ target, constants.R_OK | constants.W_OK);
      } else {
        accessSync(/*turbopackIgnore: true*/ dir, constants.R_OK | constants.W_OK);
      }
    } catch {
      throw new Error(`Database path '${target}' is read-only or not writable.`);
    }
  }

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(target);
  } catch (err) {
    throw new Error(
      `Database path '${target}' cannot be opened: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // PRAGMAs applied on EVERY connection
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
  `);

  // Base tables (v0 schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_meta (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY,
      escrow_id TEXT NOT NULL UNIQUE,
      org_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_order_refs (
      org_id TEXT NOT NULL,
      order_ref TEXT NOT NULL,
      payment_request_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (org_id, order_ref)
    );

    CREATE TABLE IF NOT EXISTS remittances (
      id TEXT PRIMARY KEY,
      escrow_id TEXT NOT NULL UNIQUE,
      org_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS view_key_grants (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      journal_id TEXT NOT NULL,
      account TEXT NOT NULL,
      debit_minor TEXT NOT NULL,
      credit_minor TEXT NOT NULL,
      currency TEXT NOT NULL,
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL
    );
  `);

  // Run versioned migrations
  runMigrations(db);

  return db;
}

export class SqliteRuntimeMetaStore {
  constructor(private readonly db: DatabaseSync) {}

  get<T>(key: string): T | null {
    const stmt = this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?");
    const row = stmt.get(key) as { value_json: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.value_json) as T;
  }

  set<T>(key: string, value: T): void {
    const stmt = this.db.prepare(`
      INSERT INTO runtime_meta (key, value_json)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
    `);
    stmt.run(key, JSON.stringify(value));
  }

  getOrCreateKeyPair(key: string, generator: () => KeyPairHex): KeyPairHex {
    const existing = this.get<KeyPairHex>(key);
    if (existing && existing.publicKeyHex && existing.privateKeyHex) {
      return existing;
    }
    const created = generator();
    this.set(key, created);
    return created;
  }

  loadAuditLog(): AuditLogEntry[] {
    const stmt = this.db.prepare("SELECT entry_json FROM audit_log_entries ORDER BY seq ASC");
    const rows = stmt.all() as Array<{ entry_json: string }>;
    return rows.map((r) => JSON.parse(r.entry_json) as AuditLogEntry);
  }

  appendAuditEntry(input: {
    id?: string;
    seq?: number;
    actor: string;
    action: string;
    targetId: string;
    atIso?: string;
    at?: Date;
    prevHash?: string;
    hash?: string;
  }): AuditLogEntry {
    return withTransaction(this.db, () => {
      const stmtLast = this.db.prepare(
        "SELECT seq, entry_json FROM audit_log_entries ORDER BY seq DESC LIMIT 1",
      );
      const lastRow = stmtLast.get() as { seq: number; entry_json: string } | undefined;
      const nextSeq = lastRow ? lastRow.seq + 1 : 1;
      const lastEntry = lastRow ? (JSON.parse(lastRow.entry_json) as AuditLogEntry) : null;
      const prevHash = lastEntry ? lastEntry.hash : GENESIS_AUDIT_HASH;
      const atIso = input.atIso ?? (input.at ? input.at.toISOString() : new Date().toISOString());

      const hash = computeAuditEntryHash({
        prevHash,
        actor: input.actor,
        action: input.action,
        targetId: input.targetId,
        atIso,
      });

      const entry: AuditLogEntry = {
        id: `audit_${nextSeq}`,
        seq: nextSeq,
        actor: input.actor,
        action: input.action,
        targetId: input.targetId,
        atIso,
        prevHash,
        hash,
      };

      const stmt = this.db.prepare(
        "INSERT INTO audit_log_entries (seq, entry_json) VALUES (?, ?)",
      );
      stmt.run(nextSeq, JSON.stringify(entry));
      return entry;
    });
  }
}

export class SqliteIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: DatabaseSync) {}

  async get<T>(key: string): Promise<{ actorId: string; requestHash: string; response: T } | null> {
    const stmt = this.db.prepare(
      "SELECT actor_id, request_hash, response_json FROM idempotency_keys WHERE key = ?",
    );
    const row = stmt.get(key) as
      | { actor_id: string; request_hash: string; response_json: string }
      | undefined;
    if (!row) return null;
    return {
      actorId: row.actor_id,
      requestHash: row.request_hash,
      response: JSON.parse(row.response_json) as T,
    };
  }

  async set<T>(
    key: string,
    record: { actorId: string; requestHash: string; response: T },
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO idempotency_keys (key, actor_id, request_hash, response_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        actor_id = excluded.actor_id,
        request_hash = excluded.request_hash,
        response_json = excluded.response_json
    `);
    stmt.run(key, record.actorId, record.requestHash, JSON.stringify(record.response));
  }
}

export class SqlitePaymentRequestRepository implements PaymentRequestRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly outbox: InMemoryOutbox,
  ) {}

  private hydrateRow(row: {
    snapshot_json: string;
    envelope_json: string;
    created_at: string;
  }): StoredPaymentRequest {
    const rawSnap = JSON.parse(row.snapshot_json) as SerializedPaymentRequestSnapshot;
    const snap = deserializePaymentRequestSnapshot(rawSnap);
    const envelope = JSON.parse(row.envelope_json) as EncryptedEnvelope;
    return {
      aggregate: PaymentRequest.rehydrate(snap),
      envelope,
      createdAt: new Date(row.created_at),
    };
  }

  async findById(id: PaymentRequestId): Promise<StoredPaymentRequest | null> {
    const stmt = this.db.prepare(
      "SELECT snapshot_json, envelope_json, created_at FROM payment_requests WHERE id = ?",
    );
    const row = stmt.get(id) as
      | { snapshot_json: string; envelope_json: string; created_at: string }
      | undefined;
    return row ? this.hydrateRow(row) : null;
  }

  async findByEscrowId(escrowId: EscrowId): Promise<StoredPaymentRequest | null> {
    const stmt = this.db.prepare(
      "SELECT snapshot_json, envelope_json, created_at FROM payment_requests WHERE escrow_id = ?",
    );
    const row = stmt.get(escrowId) as
      | { snapshot_json: string; envelope_json: string; created_at: string }
      | undefined;
    return row ? this.hydrateRow(row) : null;
  }

  async listByOrgId(orgId: OrgId): Promise<StoredPaymentRequest[]> {
    const stmt = this.db.prepare(
      "SELECT snapshot_json, envelope_json, created_at FROM payment_requests WHERE org_id = ? ORDER BY created_at ASC",
    );
    const rows = stmt.all(orgId) as Array<{
      snapshot_json: string;
      envelope_json: string;
      created_at: string;
    }>;
    return rows.map((r) => this.hydrateRow(r));
  }

  async listAll(): Promise<StoredPaymentRequest[]> {
    const stmt = this.db.prepare(
      "SELECT snapshot_json, envelope_json, created_at FROM payment_requests ORDER BY created_at ASC",
    );
    const rows = stmt.all() as Array<{
      snapshot_json: string;
      envelope_json: string;
      created_at: string;
    }>;
    return rows.map((r) => this.hydrateRow(r));
  }

  async save(
    request: PaymentRequest,
    envelope?: EncryptedEnvelope,
    createdAt?: Date,
  ): Promise<void> {
    const checkStmt = this.db.prepare(
      "SELECT version, envelope_json, created_at FROM payment_requests WHERE id = ?",
    );
    const existing = checkStmt.get(request.id) as
      | { version: number; envelope_json: string; created_at: string }
      | undefined;

    if (existing && existing.version !== request.version) {
      throw new Error(`Optimistic lock conflict on PaymentRequest ${request.id}`);
    }

    const env =
      envelope ?? (existing ? (JSON.parse(existing.envelope_json) as EncryptedEnvelope) : undefined);
    if (!env) {
      throw new Error("EncryptedEnvelope required when creating PaymentRequest");
    }
    const createdIso = createdAt
      ? createdAt.toISOString()
      : existing?.created_at ?? new Date().toISOString();

    request.version += 1;
    const snap = request.snapshot();
    const serializedSnap = serializePaymentRequestSnapshot(snap);

    const upsertStmt = this.db.prepare(`
      INSERT INTO payment_requests (id, escrow_id, org_id, version, snapshot_json, envelope_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        version = excluded.version,
        snapshot_json = excluded.snapshot_json,
        envelope_json = excluded.envelope_json
    `);
    upsertStmt.run(
      request.id,
      snap.escrowId,
      snap.merchantId,
      request.version,
      JSON.stringify(serializedSnap),
      JSON.stringify(env),
      createdIso,
    );

    this.outbox.pushAll(request.pullEvents());
  }

  async hasOrderRef(orgId: OrgId, orderRef: string): Promise<boolean> {
    const stmt = this.db.prepare(
      "SELECT 1 FROM merchant_order_refs WHERE org_id = ? AND order_ref = ?",
    );
    const row = stmt.get(orgId, orderRef);
    return Boolean(row);
  }

  async recordOrderRef(orgId: OrgId, orderRef: string, id: PaymentRequestId): Promise<void> {
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO merchant_order_refs (org_id, order_ref, payment_request_id, created_at) VALUES (?, ?, ?, ?)",
    );
    stmt.run(orgId, orderRef, id, new Date().toISOString());
  }
}

export class SqliteRemittanceRepository implements RemittanceRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly outbox: InMemoryOutbox,
  ) {}

  private hydrateRow(row: {
    org_id: string;
    snapshot_json: string;
    envelope_json: string;
    created_at: string;
  }): StoredRemittance {
    const rawSnap = JSON.parse(row.snapshot_json) as SerializedRemittanceSnapshot;
    const snap = deserializeRemittanceSnapshot(rawSnap);
    const envelope = JSON.parse(row.envelope_json) as EncryptedEnvelope;
    return {
      aggregate: Remittance.rehydrate(snap),
      orgId: row.org_id as OrgId,
      envelope,
      createdAt: new Date(row.created_at),
    };
  }

  async findById(id: RemittanceId): Promise<StoredRemittance | null> {
    const stmt = this.db.prepare(
      "SELECT org_id, snapshot_json, envelope_json, created_at FROM remittances WHERE id = ?",
    );
    const row = stmt.get(id) as
      | { org_id: string; snapshot_json: string; envelope_json: string; created_at: string }
      | undefined;
    return row ? this.hydrateRow(row) : null;
  }

  async findByEscrowId(escrowId: EscrowId): Promise<StoredRemittance | null> {
    const stmt = this.db.prepare(
      "SELECT org_id, snapshot_json, envelope_json, created_at FROM remittances WHERE escrow_id = ?",
    );
    const row = stmt.get(escrowId) as
      | { org_id: string; snapshot_json: string; envelope_json: string; created_at: string }
      | undefined;
    return row ? this.hydrateRow(row) : null;
  }

  async listByOrgId(orgId: OrgId): Promise<StoredRemittance[]> {
    const stmt = this.db.prepare(
      "SELECT org_id, snapshot_json, envelope_json, created_at FROM remittances WHERE org_id = ? ORDER BY created_at ASC",
    );
    const rows = stmt.all(orgId) as Array<{
      org_id: string;
      snapshot_json: string;
      envelope_json: string;
      created_at: string;
    }>;
    return rows.map((r) => this.hydrateRow(r));
  }

  async listAll(): Promise<StoredRemittance[]> {
    const stmt = this.db.prepare(
      "SELECT org_id, snapshot_json, envelope_json, created_at FROM remittances ORDER BY created_at ASC",
    );
    const rows = stmt.all() as Array<{
      org_id: string;
      snapshot_json: string;
      envelope_json: string;
      created_at: string;
    }>;
    return rows.map((r) => this.hydrateRow(r));
  }

  async save(
    remittance: Remittance,
    meta?: { orgId: OrgId; envelope: EncryptedEnvelope; createdAt: Date },
  ): Promise<void> {
    const checkStmt = this.db.prepare(
      "SELECT org_id, version, envelope_json, created_at FROM remittances WHERE id = ?",
    );
    const existing = checkStmt.get(remittance.id) as
      | { org_id: string; version: number; envelope_json: string; created_at: string }
      | undefined;

    if (existing && existing.version !== remittance.version) {
      throw new Error(`Optimistic lock conflict on Remittance ${remittance.id}`);
    }

    const orgId = meta?.orgId ?? (existing?.org_id as OrgId | undefined);
    const env =
      meta?.envelope ??
      (existing ? (JSON.parse(existing.envelope_json) as EncryptedEnvelope) : undefined);
    const createdIso = meta?.createdAt
      ? meta.createdAt.toISOString()
      : existing?.created_at ?? new Date().toISOString();

    if (!orgId || !env) {
      throw new Error("orgId and EncryptedEnvelope required when creating Remittance");
    }

    remittance.version += 1;
    const snap = remittance.snapshot();
    const serializedSnap = serializeRemittanceSnapshot(snap);

    const upsertStmt = this.db.prepare(`
      INSERT INTO remittances (id, escrow_id, org_id, version, snapshot_json, envelope_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        version = excluded.version,
        snapshot_json = excluded.snapshot_json,
        envelope_json = excluded.envelope_json
    `);
    upsertStmt.run(
      remittance.id,
      snap.escrowId,
      orgId,
      remittance.version,
      JSON.stringify(serializedSnap),
      JSON.stringify(env),
      createdIso,
    );

    this.outbox.pushAll(remittance.pullEvents());
  }
}

export class SqliteViewKeyGrantRepository implements ViewKeyGrantRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly outbox: InMemoryOutbox,
  ) {}

  async findById(id: GrantId): Promise<ViewKeyGrant | null> {
    const stmt = this.db.prepare("SELECT snapshot_json FROM view_key_grants WHERE id = ?");
    const row = stmt.get(id) as { snapshot_json: string } | undefined;
    if (!row) return null;
    const raw = JSON.parse(row.snapshot_json) as SerializedViewKeyGrantSnapshot;
    return ViewKeyGrant.rehydrate(deserializeGrantSnapshot(raw));
  }

  async findByOrgId(orgId: OrgId): Promise<ViewKeyGrant[]> {
    const stmt = this.db.prepare("SELECT snapshot_json FROM view_key_grants WHERE org_id = ?");
    const rows = stmt.all(orgId) as Array<{ snapshot_json: string }>;
    return rows.map((r) => {
      const raw = JSON.parse(r.snapshot_json) as SerializedViewKeyGrantSnapshot;
      return ViewKeyGrant.rehydrate(deserializeGrantSnapshot(raw));
    });
  }

  async save(grant: ViewKeyGrant): Promise<void> {
    grant.version += 1;
    const snap = grant.snapshot();
    const serialized = serializeGrantSnapshot(snap);
    const stmt = this.db.prepare(`
      INSERT INTO view_key_grants (id, org_id, version, snapshot_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        version = excluded.version,
        snapshot_json = excluded.snapshot_json
    `);
    stmt.run(grant.id, grant.orgId, grant.version, JSON.stringify(serialized));
    this.outbox.pushAll(grant.pullEvents());
  }
}

export class SqliteLedgerAdapter implements LedgerPort {
  constructor(private readonly db: DatabaseSync) {}

  async postBalancedJournal(input: {
    journalId: string;
    currency: Currency;
    refType: "PAYMENT_REQUEST" | "REMITTANCE";
    refId: string;
    legs: readonly LedgerLeg[];
    now: Date;
  }): Promise<Result<readonly LedgerEntryRecord[], DomainError>> {
    const check = validateBalancedLegs(input.legs);
    if (!check.ok) return check;

    return withTransaction(this.db, () => {
      const countRow = this.db
        .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM ledger_entries")
        .get() as { max_seq: number };
      let nextSeq = (countRow?.max_seq ?? 0) + 1;

      const insertStmt = this.db.prepare(`
        INSERT INTO ledger_entries (id, journal_id, account, debit_minor, credit_minor, currency, ref_type, ref_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const created: LedgerEntryRecord[] = [];
      for (const leg of input.legs) {
        const id = `le_${nextSeq++}`;
        const createdAtIso = input.now.toISOString();
        insertStmt.run(
          id,
          input.journalId,
          leg.account,
          leg.debitMinor.toString(),
          leg.creditMinor.toString(),
          input.currency,
          input.refType,
          input.refId,
          createdAtIso,
        );
        created.push({
          id,
          journalId: input.journalId,
          account: leg.account,
          debitMinor: leg.debitMinor,
          creditMinor: leg.creditMinor,
          currency: input.currency,
          refType: input.refType,
          refId: input.refId,
          createdAt: input.now,
        });
      }
      return ok(created);
    });
  }

  async listEntries(filter?: {
    refType?: "PAYMENT_REQUEST" | "REMITTANCE";
    refId?: string;
  }): Promise<readonly LedgerEntryRecord[]> {
    const stmt = this.db.prepare(
      "SELECT id, journal_id, account, debit_minor, credit_minor, currency, ref_type, ref_id, created_at FROM ledger_entries ORDER BY seq ASC",
    );
    const rows = stmt.all() as Array<{
      id: string;
      journal_id: string;
      account: string;
      debit_minor: string;
      credit_minor: string;
      currency: Currency;
      ref_type: "PAYMENT_REQUEST" | "REMITTANCE";
      ref_id: string;
      created_at: string;
    }>;

    return rows
      .filter(
        (r) =>
          (!filter?.refType || r.ref_type === filter.refType) &&
          (!filter?.refId || r.ref_id === filter.refId),
      )
      .map((r) => ({
        id: r.id,
        journalId: r.journal_id,
        account: r.account,
        debitMinor: BigInt(r.debit_minor),
        creditMinor: BigInt(r.credit_minor),
        currency: r.currency,
        refType: r.ref_type,
        refId: r.ref_id,
        createdAt: new Date(r.created_at),
      }));
  }
}
