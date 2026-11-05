import {
  Money,
  domainError,
  err,
  ok,
  type AccountId,
  type ChainGateway,
  type Currency,
  type DomainError,
  type DomainEvent,
  type EscrowId,
  type GrantId,
  type IdempotencyStore,
  type OnchainEscrowKind,
  type OnchainEscrowView,
  type OnchainEvent,
  type OrgId,
  type PaymentRequestId,
  type RemittanceId,
  type Result,
  type TxHash,
} from "@/shared";
import type {
  PaymentRequest,
  PaymentRequestRepository,
  StoredPaymentRequest,
} from "@/modules/payments/domain";
import type {
  FxRatePort,
  OffRampPort,
  PayoutResult,
  Remittance,
  RemittanceRepository,
  StoredRemittance,
} from "@/modules/remittance/domain";
import type {
  EncryptedEnvelope,
  ViewKeyGrant,
  ViewKeyGrantRepository,
} from "@/modules/privacy/domain";
import type {
  ScreeningDecision,
  ScreeningPort,
  ScreeningSubject,
} from "@/modules/compliance/domain";
import {
  validateBalancedLegs,
  type LedgerEntryRecord,
  type LedgerLeg,
  type LedgerPort,
} from "@/modules/ledger/domain/ledger";

/**
 * Transactional Outbox store (AD-10).
 * Collects domain events emitted when aggregates are saved so workers can
 * process them reliably with at-least-once delivery.
 */
export interface OutboxRecord {
  readonly id: string;
  readonly event: DomainEvent;
  processedAt: Date | null;
}

export class InMemoryOutbox {
  private readonly items: OutboxRecord[] = [];
  private seq = 1;

  pushAll(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.items.push({ id: `outbox_${this.seq++}`, event, processedAt: null });
    }
  }

  pending(): OutboxRecord[] {
    return this.items.filter((i) => i.processedAt === null);
  }

  markProcessed(id: string, now: Date): void {
    const found = this.items.find((i) => i.id === id);
    if (found) found.processedAt = now;
  }

  all(): readonly OutboxRecord[] {
    return this.items;
  }
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, { actorId: string; requestHash: string; response: unknown }>();

  async get<T>(key: string): Promise<{ actorId: string; requestHash: string; response: T } | null> {
    const rec = this.map.get(key);
    return rec ? (rec as { actorId: string; requestHash: string; response: T }) : null;
  }

  async set<T>(key: string, record: { actorId: string; requestHash: string; response: T }): Promise<void> {
    this.map.set(key, record);
  }
}

export class InMemoryPaymentRequestRepository implements PaymentRequestRepository {
  private readonly store = new Map<
    PaymentRequestId,
    { snap: ReturnType<PaymentRequest["snapshot"]>; envelope: EncryptedEnvelope; createdAt: Date }
  >();

  constructor(private readonly outbox: InMemoryOutbox) {}

  async findById(id: PaymentRequestId): Promise<StoredPaymentRequest | null> {
    const row = this.store.get(id);
    if (!row) return null;
    const { PaymentRequest: PR } = await import("@/modules/payments/domain");
    return {
      aggregate: PR.rehydrate(row.snap),
      envelope: row.envelope,
      createdAt: row.createdAt,
    };
  }

  async findByEscrowId(escrowId: EscrowId): Promise<StoredPaymentRequest | null> {
    for (const [id, row] of this.store.entries()) {
      if (row.snap.escrowId === escrowId) {
        return this.findById(id);
      }
    }
    return null;
  }

  async listByOrgId(orgId: OrgId): Promise<StoredPaymentRequest[]> {
    const out: StoredPaymentRequest[] = [];
    for (const [id, row] of this.store.entries()) {
      if (row.snap.merchantId === orgId) {
        const loaded = await this.findById(id);
        if (loaded) out.push(loaded);
      }
    }
    return out;
  }

  async listAll(): Promise<StoredPaymentRequest[]> {
    const out: StoredPaymentRequest[] = [];
    for (const id of this.store.keys()) {
      const loaded = await this.findById(id);
      if (loaded) out.push(loaded);
    }
    return out;
  }

  async save(
    request: PaymentRequest,
    envelope?: EncryptedEnvelope,
    createdAt?: Date,
  ): Promise<void> {
    const existing = this.store.get(request.id);
    if (existing && existing.snap.version !== request.version) {
      throw new Error(`Optimistic lock conflict on PaymentRequest ${request.id}`);
    }
    const env = envelope ?? existing?.envelope;
    if (!env) throw new Error("EncryptedEnvelope required when creating PaymentRequest");
    const created = createdAt ?? existing?.createdAt ?? new Date();

    request.version += 1;
    this.store.set(request.id, {
      snap: request.snapshot(),
      envelope: env,
      createdAt: created,
    });
    this.outbox.pushAll(request.pullEvents());
  }
}

export class InMemoryRemittanceRepository implements RemittanceRepository {
  private readonly store = new Map<
    RemittanceId,
    {
      snap: ReturnType<Remittance["snapshot"]>;
      orgId: OrgId;
      envelope: EncryptedEnvelope;
      createdAt: Date;
    }
  >();

  constructor(private readonly outbox: InMemoryOutbox) {}

  async findById(id: RemittanceId): Promise<StoredRemittance | null> {
    const row = this.store.get(id);
    if (!row) return null;
    const { Remittance: RM } = await import("@/modules/remittance/domain");
    return {
      aggregate: RM.rehydrate(row.snap),
      orgId: row.orgId,
      envelope: row.envelope,
      createdAt: row.createdAt,
    };
  }

  async findByEscrowId(escrowId: EscrowId): Promise<StoredRemittance | null> {
    for (const [id, row] of this.store.entries()) {
      if (row.snap.escrowId === escrowId) {
        return this.findById(id);
      }
    }
    return null;
  }

  async listByOrgId(orgId: OrgId): Promise<StoredRemittance[]> {
    const out: StoredRemittance[] = [];
    for (const [id, row] of this.store.entries()) {
      if (row.orgId === orgId) {
        const loaded = await this.findById(id);
        if (loaded) out.push(loaded);
      }
    }
    return out;
  }

  async listAll(): Promise<StoredRemittance[]> {
    const out: StoredRemittance[] = [];
    for (const id of this.store.keys()) {
      const loaded = await this.findById(id);
      if (loaded) out.push(loaded);
    }
    return out;
  }

  async save(
    remittance: Remittance,
    meta?: { orgId: OrgId; envelope: EncryptedEnvelope; createdAt: Date },
  ): Promise<void> {
    const existing = this.store.get(remittance.id);
    if (existing && existing.snap.version !== remittance.version) {
      throw new Error(`Optimistic lock conflict on Remittance ${remittance.id}`);
    }
    const orgId = meta?.orgId ?? existing?.orgId;
    const env = meta?.envelope ?? existing?.envelope;
    const created = meta?.createdAt ?? existing?.createdAt ?? new Date();
    if (!orgId || !env) {
      throw new Error("orgId and EncryptedEnvelope required when creating Remittance");
    }

    remittance.version += 1;
    this.store.set(remittance.id, {
      snap: remittance.snapshot(),
      orgId,
      envelope: env,
      createdAt: created,
    });
    this.outbox.pushAll(remittance.pullEvents());
  }
}

export class InMemoryViewKeyGrantRepository implements ViewKeyGrantRepository {
  private readonly store = new Map<GrantId, ReturnType<ViewKeyGrant["snapshot"]>>();

  constructor(private readonly outbox: InMemoryOutbox) {}

  async findById(id: GrantId): Promise<ViewKeyGrant | null> {
    const snap = this.store.get(id);
    if (!snap) return null;
    const { ViewKeyGrant: VKG } = await import("@/modules/privacy/domain");
    return VKG.rehydrate(snap);
  }

  async findByOrgId(orgId: OrgId): Promise<ViewKeyGrant[]> {
    const out: ViewKeyGrant[] = [];
    for (const [id, snap] of this.store.entries()) {
      if (snap.orgId === orgId) {
        const g = await this.findById(id);
        if (g) out.push(g);
      }
    }
    return out;
  }

  async save(grant: ViewKeyGrant): Promise<void> {
    grant.version += 1;
    this.store.set(grant.id, grant.snapshot());
    this.outbox.pushAll(grant.pullEvents());
  }
}

export class InMemoryLedgerAdapter implements LedgerPort {
  private readonly entries: LedgerEntryRecord[] = [];
  private seq = 1;

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

    const created: LedgerEntryRecord[] = input.legs.map((leg) => ({
      id: `le_${this.seq++}`,
      journalId: input.journalId,
      account: leg.account,
      debitMinor: leg.debitMinor,
      creditMinor: leg.creditMinor,
      currency: input.currency,
      refType: input.refType,
      refId: input.refId,
      createdAt: input.now,
    }));
    this.entries.push(...created);
    return ok(created);
  }

  async listEntries(filter?: {
    refType?: "PAYMENT_REQUEST" | "REMITTANCE";
    refId?: string;
  }): Promise<readonly LedgerEntryRecord[]> {
    return this.entries.filter(
      (e) =>
        (!filter?.refType || e.refType === filter.refType) &&
        (!filter?.refId || e.refId === filter.refId),
    );
  }
}

/**
 * Configurable Mock FX Adapter (USDC -> PHP, IDR, EUR, INR, MXN, USD).
 */
export class MockFxAdapter implements FxRatePort {
  private readonly rates: Record<Currency, string> = {
    USDC: "1",
    USD: "1",
    PHP: "56.25",
    IDR: "15850.00",
    EUR: "0.92",
    INR: "84.10",
    MXN: "20.15",
  };

  setRate(to: Currency, rateDecimal: string): void {
    this.rates[to] = rateDecimal;
  }

  async quote(from: Currency, to: Currency, source: Money): Promise<{ rate: string; fee: Money }> {
    if (from !== "USDC") throw new Error("MockFxAdapter only quotes from USDC");
    // Flat 0.5% fee or minimum 0.50 USDC (0 USDC for direct NEAR-account transfers)
    const feeMinor =
      to === "USDC"
        ? 0n
        : source.amountMinor / 200n > 500_000n
          ? source.amountMinor / 200n
          : 500_000n;
    const feeRes = Money.of(feeMinor < source.amountMinor ? feeMinor : 0n, "USDC");
    if (!feeRes.ok) throw new Error(feeRes.error.message);
    return { rate: this.rates[to], fee: feeRes.value };
  }
}

/**
 * Configurable Mock Off-Ramp Adapter (simulates GCash/bank payouts, transient
 * failures, and permanent invalid-account failures for hackathon demos).
 */
export type MockOffRampMode =
  | { mode: "SUCCESS" }
  | { mode: "TRANSIENT_FAILURE"; code?: string }
  | { mode: "PERMANENT_FAILURE"; code?: string };

export class MockOffRampAdapter implements OffRampPort {
  private behavior: MockOffRampMode = { mode: "SUCCESS" };
  private readonly processedKeys = new Map<string, PayoutResult>();
  private seq = 1;

  setBehavior(behavior: MockOffRampMode): void {
    this.behavior = behavior;
  }

  async payout(req: {
    idempotencyKey: string;
    remittanceId: RemittanceId;
    amount: Money;
    destinationRef: string;
    country: string;
  }): Promise<PayoutResult> {
    const existing = this.processedKeys.get(req.idempotencyKey);
    if (existing) return existing;

    let result: PayoutResult;
    if (this.behavior.mode === "SUCCESS") {
      result = {
        status: "SETTLED",
        payoutRef: `payout_${req.country.toLowerCase()}_${this.seq++}`,
      };
    } else if (this.behavior.mode === "TRANSIENT_FAILURE") {
      result = {
        status: "FAILED",
        code: this.behavior.code ?? "OFFRAMP_UNAVAILABLE",
        retryable: true,
      };
    } else {
      result = {
        status: "FAILED",
        code: this.behavior.code ?? "RECIPIENT_ACCOUNT_INVALID",
        retryable: false,
      };
    }

    this.processedKeys.set(req.idempotencyKey, result);
    return result;
  }
}

/**
 * Configurable Mock Sanctions Screening Adapter.
 * Blocks subjects whose name or account matches a configurable blocklist.
 */
export class MockScreeningAdapter implements ScreeningPort {
  private readonly blockedTerms = new Set<string>(["sanctioned", "ofac-blocked", "lazarus"]);

  addBlockedTerm(term: string): void {
    this.blockedTerms.add(term.toLowerCase());
  }

  async screen(subject: ScreeningSubject): Promise<ScreeningDecision> {
    const combined = `${subject.name} ${subject.accountOrRef} ${subject.country}`.toLowerCase();
    for (const term of this.blockedTerms) {
      if (combined.includes(term)) {
        return { allowed: false, reasonCode: "SANCTIONS_HIT" };
      }
    }
    return { allowed: true };
  }
}

/**
 * In-Memory Simulation of `ledgerly-escrow` on NEAR (`ChainGateway` port).
 * Mirrors the exact invariants of `contracts/ledgerly-escrow/src/lib.rs` so
 * full end-to-end flows and tests run fast without a live RPC.
 */
export class MockChainGateway implements ChainGateway {
  private readonly escrows = new Map<EscrowId, OnchainEscrowView>();
  private readonly anchors: string[] = [];
  private readonly eventLog: OnchainEvent[] = [];
  private blockHeight = 1n;
  private seq = 1;

  async registerEscrow(input: {
    escrowId: EscrowId;
    kind: OnchainEscrowKind;
    commitment: string;
    refundAfterNs: bigint;
  }): Promise<{ txHash: TxHash }> {
    this.escrows.set(input.escrowId, {
      kind: input.kind,
      depositor: null,
      heldMinor: 0n,
      commitment: input.commitment,
      status: "Open",
      refundAfterNs: input.refundAfterNs,
    });
    return { txHash: `tx_reg_${this.seq++}` as TxHash };
  }

  /** Simulate a buyer or sender calling `ft_transfer_call` on the USDC contract. */
  async simulateDeposit(input: {
    escrowId: EscrowId;
    depositor: AccountId;
    amountMinor: bigint;
    commitment?: string;
    kind?: OnchainEscrowKind;
    refundAfterNs?: bigint;
  }): Promise<{ txHash: TxHash }> {
    const existing = this.escrows.get(input.escrowId);
    if (!existing) {
      if (!input.commitment) throw new Error("Unknown escrow without inline commitment");
      this.escrows.set(input.escrowId, {
        kind: input.kind ?? "Remittance",
        depositor: input.depositor,
        heldMinor: input.amountMinor,
        commitment: input.commitment,
        status: "Held",
        refundAfterNs: input.refundAfterNs ?? 0n,
      });
    } else {
      if (existing.status === "Closed") throw new Error("Escrow is closed");
      this.escrows.set(input.escrowId, {
        ...existing,
        depositor: existing.depositor ?? input.depositor,
        heldMinor: existing.heldMinor + input.amountMinor,
        status: "Held",
      });
    }
    const txHash = `tx_dep_${this.seq++}` as TxHash;
    this.blockHeight += 1n;
    this.eventLog.push({
      type: "OnchainDepositDetected",
      txHash,
      logIndex: 0,
      blockHeight: this.blockHeight,
      escrowId: input.escrowId,
      depositor: input.depositor,
      amountMinor: input.amountMinor,
    });
    return { txHash };
  }

  /**
   * Simulate a depositor directly calling `claim_refund(escrow_id)` on NEAR
   * after `refund_after` has elapsed (fail-safe exit when backend is offline — AD-2).
   */
  async simulateUserClaimRefund(escrowId: EscrowId): Promise<{ txHash: TxHash }> {
    const e = this.escrows.get(escrowId);
    if (!e || e.heldMinor === 0n) {
      throw new Error("Nothing held in escrow to claim");
    }
    const amountMinor = e.heldMinor;
    this.escrows.set(escrowId, {
      ...e,
      heldMinor: 0n,
      status: "Closed",
    });
    const txHash = `tx_claim_ref_${this.seq++}` as TxHash;
    this.blockHeight += 1n;
    this.eventLog.push({
      type: "OnchainRefundConfirmed",
      txHash,
      logIndex: 0,
      blockHeight: this.blockHeight,
      escrowId,
      amountMinor,
    });
    return { txHash };
  }

  async release(input: {
    escrowId: EscrowId;
    receiver: AccountId;
    amountMinor: bigint;
  }): Promise<{ txHash: TxHash }> {
    const e = this.escrows.get(input.escrowId);
    if (!e || e.heldMinor < input.amountMinor) {
      throw new Error("Insufficient escrow balance for release");
    }
    const nextHeld = e.heldMinor - input.amountMinor;
    this.escrows.set(input.escrowId, {
      ...e,
      heldMinor: nextHeld,
      status: nextHeld === 0n ? "Closed" : "Held",
    });
    const txHash = `tx_rel_${this.seq++}` as TxHash;
    this.blockHeight += 1n;
    this.eventLog.push({
      type: "OnchainReleaseConfirmed",
      txHash,
      logIndex: 0,
      blockHeight: this.blockHeight,
      escrowId: input.escrowId,
      amountMinor: input.amountMinor,
    });
    return { txHash };
  }

  async refund(input: {
    escrowId: EscrowId;
    amountMinor: bigint;
  }): Promise<{ txHash: TxHash }> {
    const e = this.escrows.get(input.escrowId);
    if (!e || e.heldMinor < input.amountMinor) {
      throw new Error("Insufficient escrow balance for refund");
    }
    const nextHeld = e.heldMinor - input.amountMinor;
    this.escrows.set(input.escrowId, {
      ...e,
      heldMinor: nextHeld,
      status: nextHeld === 0n ? "Closed" : "Held",
    });
    const txHash = `tx_ref_${this.seq++}` as TxHash;
    this.blockHeight += 1n;
    this.eventLog.push({
      type: "OnchainRefundConfirmed",
      txHash,
      logIndex: 0,
      blockHeight: this.blockHeight,
      escrowId: input.escrowId,
      amountMinor: input.amountMinor,
    });
    return { txHash };
  }

  async anchorAuditRoot(logRootHex: string): Promise<{ txHash: TxHash }> {
    this.anchors.push(logRootHex);
    return { txHash: `tx_anc_${this.seq++}` as TxHash };
  }

  async getEscrow(escrowId: EscrowId): Promise<OnchainEscrowView | null> {
    return this.escrows.get(escrowId) ?? null;
  }

  async pollEvents(fromBlockHeightExclusive: bigint): Promise<{
    readonly events: readonly OnchainEvent[];
    readonly latestBlockHeight: bigint;
  }> {
    return {
      events: this.eventLog.filter((ev) => ev.blockHeight > fromBlockHeightExclusive),
      latestBlockHeight: this.blockHeight,
    };
  }

  getAnchoredRoots(): readonly string[] {
    return this.anchors;
  }
}
