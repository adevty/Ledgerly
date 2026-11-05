import {
  AggregateRoot,
  Money,
  Rate,
  domainError,
  err,
  invalidTransition,
  ok,
  type AccountId,
  type Currency,
  type DomainError,
  type EscrowId,
  type RemittanceId,
  type Result,
  type TxHash,
  type UserId,
} from "@/shared";
import type { RemittanceEvent } from "./events";

/** Lifecycle of a remittance (Tahap 4 §1.3). */
export type RemittanceStatus =
  | "QUOTED"
  | "EXPIRED"
  | "BLOCKED"
  | "FUNDED"
  | "PAYOUT_PENDING"
  | "PAYOUT_FAILED"
  | "SETTLED"
  | "REFUNDING"
  | "REFUNDED";

export const MAX_PAYOUT_ATTEMPTS = 3;

/**
 * Where the money ends up.
 * - NEAR_ACCOUNT: released as USDC directly to a (verified) NEAR account.
 * - BANK / EWALLET: paid out in local currency by an off-ramp partner.
 * Destination details (account number, name) are stored ENCRYPTED by the
 * privacy module; the domain only sees an opaque reference.
 */
export type Recipient =
  | { type: "NEAR_ACCOUNT"; accountId: AccountId; country: string }
  | { type: "BANK" | "EWALLET"; destinationRef: string; country: string };

/**
 * Quote value object. Fee is charged in the source currency:
 *   target = rate.convert(source - fee)   (rounded down)
 */
export class Quote {
  private constructor(
    readonly source: Money,
    readonly fee: Money,
    readonly target: Money,
    readonly rate: Rate,
    readonly lockedUntil: Date,
  ) {}

  static create(p: {
    source: Money;
    fee: Money;
    rate: Rate;
    lockedUntil: Date;
  }): Result<Quote, DomainError> {
    if (p.source.currency !== "USDC") return err(domainError("CURRENCY_MISMATCH", "Source must be USDC"));
    const net = p.source.subtract(p.fee);
    if (!net.ok) return err(domainError("INVALID_AMOUNT", "Fee exceeds source amount"));
    if (net.value.isZero()) return err(domainError("INVALID_AMOUNT", "Nothing left after fee"));
    const target = p.rate.convert(net.value);
    if (!target.ok) return target;
    return ok(new Quote(p.source, p.fee, target.value, p.rate, p.lockedUntil));
  }

  isLocked(now: Date): boolean {
    return now <= this.lockedUntil;
  }

  get targetCurrency(): Currency {
    return this.target.currency;
  }
}

export interface RemittanceSnapshot {
  id: RemittanceId;
  senderId: UserId;
  escrowId: EscrowId;
  recipient: Recipient;
  quote: Quote;
  status: RemittanceStatus;
  attempts: number;
  fundingTx: TxHash | null;
  payoutRef: string | null;
  lastFailureCode: string | null;
  version: number;
}

/**
 * Remittance aggregate root.
 *
 * Key rules:
 *  - Funding must exactly match quote.source and arrive within the quote lock;
 *    otherwise the remittance goes straight to REFUNDING (funds never get stuck).
 *  - Payout retries are bounded (MAX_PAYOUT_ATTEMPTS); each attempt has a
 *    unique idempotency key so the off-ramp never pays twice.
 *  - Chain is the source of truth for funds: an on-chain refund (e.g. sender's
 *    claim_refund after timeout) is reconciled from any funded state.
 */
export class Remittance extends AggregateRoot<RemittanceEvent> {
  private constructor(private s: Omit<RemittanceSnapshot, "version">) {
    super();
  }

  static quote(p: {
    id: RemittanceId;
    senderId: UserId;
    escrowId: EscrowId;
    recipient: Recipient;
    quote: Quote;
    now: Date;
  }): Result<Remittance, DomainError> {
    if (p.recipient.type === "NEAR_ACCOUNT" && p.quote.targetCurrency !== "USDC") {
      return err(domainError("CURRENCY_MISMATCH", "NEAR account recipients receive USDC"));
    }
    if (p.recipient.type !== "NEAR_ACCOUNT" && p.quote.targetCurrency === "USDC") {
      return err(domainError("CURRENCY_MISMATCH", "Bank/e-wallet payouts need a fiat currency"));
    }
    const r = new Remittance({
      id: p.id,
      senderId: p.senderId,
      escrowId: p.escrowId,
      recipient: p.recipient,
      quote: p.quote,
      status: "QUOTED",
      attempts: 0,
      fundingTx: null,
      payoutRef: null,
      lastFailureCode: null,
    });
    r.raise({
      type: "RemittanceQuoted",
      aggregateId: p.id,
      occurredAt: p.now,
      payload: { escrowId: p.escrowId, targetCurrency: p.quote.targetCurrency },
    });
    return ok(r);
  }

  static rehydrate(snap: RemittanceSnapshot): Remittance {
    const { version, ...rest } = snap;
    const r = new Remittance({ ...rest });
    r.version = version;
    return r;
  }

  snapshot(): RemittanceSnapshot {
    return { ...this.s, version: this.version };
  }

  get id(): RemittanceId { return this.s.id; }
  get status(): RemittanceStatus { return this.s.status; }
  get attempts(): number { return this.s.attempts; }
  get quoteVO(): Quote { return this.s.quote; }
  get recipient(): Recipient { return this.s.recipient; }
  get escrowId(): EscrowId { return this.s.escrowId; }

  /** Compliance screening hit — only possible before funds arrive. */
  block(reasonCode: string, now: Date): Result<RemittanceStatus, DomainError> {
    if (this.s.status !== "QUOTED") return err(invalidTransition("Remittance", this.s.status, "block"));
    this.s.status = "BLOCKED";
    this.raise({ type: "ScreeningBlocked", aggregateId: this.s.id, occurredAt: now, payload: { reasonCode } });
    return ok(this.s.status);
  }

  /** Quote lock elapsed without funding. Safe to call repeatedly from a cron. */
  expireQuote(now: Date): Result<RemittanceStatus, DomainError> {
    if (this.s.status === "QUOTED" && !this.s.quote.isLocked(now)) {
      this.s.status = "EXPIRED";
      this.raise({ type: "RemittanceExpired", aggregateId: this.s.id, occurredAt: now, payload: {} });
    }
    return ok(this.s.status);
  }

  /**
   * Escrow deposit detected. Mismatched amount or stale quote → REFUNDING.
   * Returns ok in both cases because the money movement is a fact we must
   * reconcile, not a request we can reject.
   */
  fund(txHash: TxHash, amount: Money, now: Date): Result<RemittanceStatus, DomainError> {
    if (this.s.status !== "QUOTED") return err(invalidTransition("Remittance", this.s.status, "fund"));
    this.s.fundingTx = txHash;
    this.raise({
      type: "RemittanceFunded",
      aggregateId: this.s.id,
      occurredAt: now,
      payload: { txHash, amountMinor: amount.amountMinor.toString() },
    });

    if (!amount.equals(this.s.quote.source)) {
      this.beginRefund("FUNDING_AMOUNT_MISMATCH", amount, now);
    } else if (!this.s.quote.isLocked(now)) {
      this.beginRefund("QUOTE_EXPIRED", amount, now);
    } else {
      this.s.status = "FUNDED";
    }
    return ok(this.s.status);
  }

  /**
   * Start (or retry) an off-ramp payout. Returns the idempotency key to pass
   * to the off-ramp partner for this attempt.
   */
  startPayout(now: Date): Result<{ idempotencyKey: string; attempt: number }, DomainError> {
    if (this.s.recipient.type === "NEAR_ACCOUNT") {
      return err(invalidTransition("Remittance", this.s.status, "startPayout(NEAR_ACCOUNT)"));
    }
    if (this.s.status !== "FUNDED" && this.s.status !== "PAYOUT_FAILED") {
      return err(invalidTransition("Remittance", this.s.status, "startPayout"));
    }
    if (this.s.attempts >= MAX_PAYOUT_ATTEMPTS) {
      return err(domainError("MAX_ATTEMPTS_REACHED", "Payout attempts exhausted"));
    }
    this.s.attempts += 1;
    this.s.status = "PAYOUT_PENDING";
    this.raise({
      type: "PayoutStarted",
      aggregateId: this.s.id,
      occurredAt: now,
      payload: { attempt: this.s.attempts },
    });
    return ok({ idempotencyKey: `${this.s.id}#${this.s.attempts}`, attempt: this.s.attempts });
  }

  /**
   * Payout failed. Retryable failures under the attempt cap → PAYOUT_FAILED
   * (a worker will retry with backoff). Otherwise → REFUNDING.
   */
  markPayoutFailed(code: string, retryable: boolean, now: Date): Result<RemittanceStatus, DomainError> {
    if (this.s.status !== "PAYOUT_PENDING") {
      return err(invalidTransition("Remittance", this.s.status, "markPayoutFailed"));
    }
    this.s.lastFailureCode = code;
    const canRetry = retryable && this.s.attempts < MAX_PAYOUT_ATTEMPTS;
    this.raise({
      type: "PayoutFailed",
      aggregateId: this.s.id,
      occurredAt: now,
      payload: { attempt: this.s.attempts, code, retryable: canRetry },
    });
    if (canRetry) this.s.status = "PAYOUT_FAILED";
    else this.beginRefund(code, this.s.quote.source, now);
    return ok(this.s.status);
  }

  /**
   * Mark settled.
   * - Off-ramp: PAYOUT_PENDING → SETTLED with the partner reference.
   * - NEAR account: FUNDED → SETTLED after escrow release to the recipient.
   */
  markSettled(payoutRef: string, now: Date): Result<RemittanceStatus, DomainError> {
    const direct = this.s.recipient.type === "NEAR_ACCOUNT";
    const expected: RemittanceStatus = direct ? "FUNDED" : "PAYOUT_PENDING";
    if (this.s.status !== expected) return err(invalidTransition("Remittance", this.s.status, "markSettled"));
    this.s.payoutRef = payoutRef;
    this.s.status = "SETTLED";
    this.raise({ type: "RemittanceSettled", aggregateId: this.s.id, occurredAt: now, payload: { payoutRef } });
    return ok(this.s.status);
  }

  /**
   * On-chain refund observed (operator refund OR sender's claim_refund).
   * Accepted from any state where funds may be in escrow.
   */
  confirmRefund(now: Date): Result<RemittanceStatus, DomainError> {
    const funded: RemittanceStatus[] = ["FUNDED", "PAYOUT_FAILED", "REFUNDING", "PAYOUT_PENDING"];
    if (!funded.includes(this.s.status)) {
      return err(invalidTransition("Remittance", this.s.status, "confirmRefund"));
    }
    // Refund while a payout is in flight is a reconciliation alarm: the
    // off-ramp might still pay. Surface it for manual review.
    const conflict = this.s.status === "PAYOUT_PENDING";
    this.s.status = "REFUNDED";
    this.raise({
      type: "RemittanceRefunded",
      aggregateId: this.s.id,
      occurredAt: now,
      payload: { requiresReview: conflict },
    });
    return ok(this.s.status);
  }

  private beginRefund(reasonCode: string, amount: Money, now: Date): void {
    this.s.status = "REFUNDING";
    this.raise({
      type: "RemittanceRefundRequested",
      aggregateId: this.s.id,
      occurredAt: now,
      payload: { reasonCode, amountMinor: amount.amountMinor.toString() },
    });
  }
}
