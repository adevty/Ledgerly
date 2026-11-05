import { mkdirSync } from "node:fs";
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
  ViewKeyGrant,
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

/**
 * Open or initialize the SQLite database using Node's built-in `node:sqlite`.
 */
export function openLedgerlySqliteDb(dbPath?: string): DatabaseSync {
  const target =
    dbPath ?? process.env.LEDGERLY_SQLITE_PATH ?? resolve(process.cwd(), ".data/ledgerly.sqlite");

  if (target !== ":memory:") {
    mkdirSync(dirname(target), { recursive: true });
  }

  const db = new DatabaseSync(target);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

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

    CREATE TABLE IF NOT EXISTS audit_log_entries (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_json TEXT NOT NULL
    );
  `);

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

  appendAuditEntry(entry: AuditLogEntry): void {
    const stmt = this.db.prepare("INSERT INTO audit_log_entries (entry_json) VALUES (?)");
    stmt.run(JSON.stringify(entry));
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
