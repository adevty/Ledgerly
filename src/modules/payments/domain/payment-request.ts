import {
  AggregateRoot,
  Money,
  domainError,
  err,
  invalidTransition,
  ok,
  type AccountId,
  type DomainError,
  type EscrowId,
  type OrgId,
  type PaymentRequestId,
  type Result,
  type TxHash,
} from "@/shared";
import type { PaymentEvent } from "./events";

/**
 * Lifecycle of a merchant payment request (Tahap 4 §1.3).
 * CANCELLED was added for the "merchant cancels before any payment" path.
 */
export type PaymentStatus =
  | "OPEN"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERPAID"
  | "SETTLED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDING"
  | "REFUNDED";

/** A single on-chain deposit matched to this request. */
export interface Payment {
  readonly txHash: TxHash;
  readonly payer: AccountId;
  readonly amount: Money;
  readonly detectedAt: Date;
}

export interface CreatePaymentRequestProps {
  id: PaymentRequestId;
  merchantId: OrgId;
  escrowId: EscrowId;
  amount: Money;
  expiresAt: Date;
  now: Date;
}

/** Snapshot used by repositories to persist/rehydrate the aggregate. */
export interface PaymentRequestSnapshot {
  id: PaymentRequestId;
  merchantId: OrgId;
  escrowId: EscrowId;
  amount: Money;
  status: PaymentStatus;
  expiresAt: Date;
  payments: Payment[];
  refunded: Money;
  pendingRefund: Money;
  released: Money;
  version: number;
}

/**
 * PaymentRequest aggregate root.
 *
 * Money accounting (all USDC minor units):
 *   received      = Σ payments
 *   net           = received - refunded           (funds still attributable to the request)
 *   held (escrow) = net - released                (should equal on-chain `held`)
 *
 * Invariants:
 *   - refunded + pendingRefund ≤ received
 *   - released ≤ net
 *   - only the state machine can change `status`
 */
export class PaymentRequest extends AggregateRoot<PaymentEvent> {
  private constructor(private s: Omit<PaymentRequestSnapshot, "version">) {
    super();
  }

  // ---------------------------------------------------------------- factory

  static create(p: CreatePaymentRequestProps): Result<PaymentRequest, DomainError> {
    if (p.amount.currency !== "USDC") {
      return err(domainError("CURRENCY_MISMATCH", "Payment requests are settled in USDC"));
    }
    if (p.amount.isZero()) return err(domainError("INVALID_AMOUNT", "Amount must be > 0"));
    if (p.expiresAt <= p.now) return err(domainError("INVALID_AMOUNT", "expiresAt must be in the future"));

    const zero = Money.zero("USDC");
    const pr = new PaymentRequest({
      id: p.id,
      merchantId: p.merchantId,
      escrowId: p.escrowId,
      amount: p.amount,
      status: "OPEN",
      expiresAt: p.expiresAt,
      payments: [],
      refunded: zero,
      pendingRefund: zero,
      released: zero,
    });
    pr.raise({
      type: "PaymentRequestCreated",
      aggregateId: p.id,
      occurredAt: p.now,
      payload: { merchantId: p.merchantId, escrowId: p.escrowId },
    });
    return ok(pr);
  }

  static rehydrate(snap: PaymentRequestSnapshot): PaymentRequest {
    const { version, ...rest } = snap;
    const pr = new PaymentRequest({ ...rest, payments: [...rest.payments] });
    pr.version = version;
    return pr;
  }

  snapshot(): PaymentRequestSnapshot {
    return { ...this.s, payments: [...this.s.payments], version: this.version };
  }

  // ---------------------------------------------------------------- queries

  get id(): PaymentRequestId { return this.s.id; }
  get status(): PaymentStatus { return this.s.status; }
  get amount(): Money { return this.s.amount; }
  get escrowId(): EscrowId { return this.s.escrowId; }

  received(): Money {
    return sum(this.s.payments.map((p) => p.amount));
  }

  net(): Money {
    return sub(this.received(), this.s.refunded);
  }

  /** Amount still held in escrow for this request. */
  held(): Money {
    return sub(this.net(), this.s.released);
  }

  /** Overpaid amount that must be returned to the payer. */
  excess(): Money {
    const net = this.net();
    return net.compare(this.s.amount) > 0 ? sub(net, this.s.amount) : Money.zero("USDC");
  }

  /** Remaining amount the buyer still has to pay. */
  remaining(): Money {
    const net = this.net();
    return net.compare(this.s.amount) < 0 ? sub(this.s.amount, net) : Money.zero("USDC");
  }

  // ---------------------------------------------------------------- commands

  /**
   * Record an on-chain deposit detected by the indexer.
   * Idempotent by txHash: a duplicate returns DUPLICATE_PAYMENT, which callers
   * should treat as a no-op (at-least-once event delivery).
   *
   * A payment arriving when already PAID/OVERPAID (e.g. buyer paid twice) is
   * accepted and becomes an overpayment to be refunded.
   */
  recordPayment(payment: Payment): Result<PaymentStatus, DomainError> {
    const allowed: PaymentStatus[] = ["OPEN", "PARTIALLY_PAID", "PAID", "OVERPAID"];
    if (!allowed.includes(this.s.status)) {
      return err(invalidTransition("PaymentRequest", this.s.status, "recordPayment"));
    }
    if (payment.amount.currency !== "USDC" || payment.amount.isZero()) {
      return err(domainError("INVALID_AMOUNT", "Payment must be a positive USDC amount"));
    }
    if (this.s.payments.some((p) => p.txHash === payment.txHash)) {
      return err(domainError("DUPLICATE_PAYMENT", "Payment already recorded", { txHash: payment.txHash }));
    }

    this.s.payments.push(payment);
    this.raise({
      type: "PaymentReceived",
      aggregateId: this.s.id,
      occurredAt: payment.detectedAt,
      payload: { txHash: payment.txHash, amountMinor: payment.amount.amountMinor.toString() },
    });
    this.reevaluate(payment.detectedAt);
    return ok(this.s.status);
  }

  /**
   * Expire the request. OPEN → EXPIRED. PARTIALLY_PAID → REFUNDING (full refund).
   * Returns the current status unchanged when not yet due (safe to call from a cron).
   */
  expire(now: Date): Result<PaymentStatus, DomainError> {
    if (now <= this.s.expiresAt) return ok(this.s.status);
    if (this.s.status === "OPEN") {
      this.s.status = "EXPIRED";
      this.raise({ type: "PaymentRequestExpired", aggregateId: this.s.id, occurredAt: now, payload: {} });
      return ok(this.s.status);
    }
    if (this.s.status === "PARTIALLY_PAID") {
      this.raise({ type: "PaymentRequestExpired", aggregateId: this.s.id, occurredAt: now, payload: {} });
      this.beginRefund(this.held(), "EXPIRED_PARTIAL", now);
      return ok(this.s.status);
    }
    return ok(this.s.status);
  }

  /** Merchant cancels. OPEN → CANCELLED, PARTIALLY_PAID → REFUNDING. */
  cancel(now: Date): Result<PaymentStatus, DomainError> {
    if (this.s.status === "OPEN") {
      this.s.status = "CANCELLED";
      this.raise({ type: "PaymentRequestCancelled", aggregateId: this.s.id, occurredAt: now, payload: {} });
      return ok(this.s.status);
    }
    if (this.s.status === "PARTIALLY_PAID") {
      this.raise({ type: "PaymentRequestCancelled", aggregateId: this.s.id, occurredAt: now, payload: {} });
      this.beginRefund(this.held(), "CANCELLED_PARTIAL", now);
      return ok(this.s.status);
    }
    return err(invalidTransition("PaymentRequest", this.s.status, "cancel"));
  }

  /**
   * Merchant-initiated refund of a paid (PAID) or settled (SETTLED) request.
   * For SETTLED, funds come from the merchant's balance (application concern);
   * the domain only enforces the cap.
   */
  requestRefund(amount: Money, reason: string, now: Date): Result<PaymentStatus, DomainError> {
    if (this.s.status !== "PAID" && this.s.status !== "SETTLED") {
      return err(invalidTransition("PaymentRequest", this.s.status, "requestRefund"));
    }
    if (amount.isZero()) return err(domainError("INVALID_AMOUNT", "Refund must be > 0"));
    const cap = this.net();
    if (amount.currency !== "USDC" || amount.compare(cap) > 0) {
      return err(
        domainError("REFUND_EXCEEDS_AVAILABLE", "Refund exceeds refundable amount", {
          requested: amount.amountMinor.toString(),
          available: cap.amountMinor.toString(),
        }),
      );
    }
    this.beginRefund(amount, reason, now);
    return ok(this.s.status);
  }

  /**
   * Confirm a refund executed on-chain (escrow_refunded event).
   * Handles both overpayment-excess refunds (OVERPAID → PAID) and full/partial
   * refunds (REFUNDING → REFUNDED).
   */
  confirmRefund(amount: Money, now: Date): Result<PaymentStatus, DomainError> {
    if (this.s.status === "OVERPAID") {
      if (amount.compare(this.excess()) > 0) {
        return err(domainError("REFUND_EXCEEDS_AVAILABLE", "Refund larger than excess"));
      }
      this.s.refunded = add(this.s.refunded, amount);
      this.raise(refundCompleted(this.s.id, amount, now));
      this.reevaluate(now);
      return ok(this.s.status);
    }
    if (this.s.status === "REFUNDING") {
      if (amount.compare(this.s.pendingRefund) > 0) {
        return err(domainError("REFUND_EXCEEDS_AVAILABLE", "Refund larger than pending refund"));
      }
      this.s.refunded = add(this.s.refunded, amount);
      this.s.pendingRefund = sub(this.s.pendingRefund, amount);
      this.raise(refundCompleted(this.s.id, amount, now));
      if (this.s.pendingRefund.isZero()) this.s.status = "REFUNDED";
      return ok(this.s.status);
    }
    return err(invalidTransition("PaymentRequest", this.s.status, "confirmRefund"));
  }

  /** Confirm funds released from escrow to the merchant. PAID → SETTLED. */
  markSettled(released: Money, now: Date): Result<PaymentStatus, DomainError> {
    if (this.s.status !== "PAID") {
      return err(invalidTransition("PaymentRequest", this.s.status, "markSettled"));
    }
    if (!released.equals(this.s.amount)) {
      return err(domainError("INVALID_AMOUNT", "Released amount must equal request amount"));
    }
    this.s.released = released;
    this.s.status = "SETTLED";
    this.raise({
      type: "PaymentRequestSettled",
      aggregateId: this.s.id,
      occurredAt: now,
      payload: { releasedMinor: released.amountMinor.toString() },
    });
    return ok(this.s.status);
  }

  // ---------------------------------------------------------------- internals

  /** Derive PARTIALLY_PAID / PAID / OVERPAID from received vs amount. */
  private reevaluate(now: Date): void {
    const cmp = this.net().compare(this.s.amount);
    const before = this.s.status;
    if (cmp < 0) this.s.status = "PARTIALLY_PAID";
    else if (cmp === 0) this.s.status = "PAID";
    else this.s.status = "OVERPAID";

    if (this.s.status === "OVERPAID") {
      this.raise({
        type: "PaymentOverpaid",
        aggregateId: this.s.id,
        occurredAt: now,
        payload: { excessMinor: this.excess().amountMinor.toString() },
      });
    } else if (this.s.status === "PAID" && before !== "PAID") {
      this.raise({ type: "PaymentRequestPaid", aggregateId: this.s.id, occurredAt: now, payload: {} });
    }
  }

  private beginRefund(amount: Money, reason: string, now: Date): void {
    this.s.status = "REFUNDING";
    this.s.pendingRefund = amount;
    this.raise({
      type: "RefundRequested",
      aggregateId: this.s.id,
      occurredAt: now,
      payload: { amountMinor: amount.amountMinor.toString(), reason },
    });
  }
}

// Small helpers: these operations are guaranteed safe by aggregate invariants,
// so a failure indicates a bug and is thrown.
function add(a: Money, b: Money): Money {
  const r = a.add(b);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
function sub(a: Money, b: Money): Money {
  const r = a.subtract(b);
  if (!r.ok) throw new Error(`invariant violated: ${r.error.message}`);
  return r.value;
}
function sum(ms: Money[]): Money {
  return ms.reduce(add, Money.zero("USDC"));
}
function refundCompleted(id: PaymentRequestId, amount: Money, now: Date): PaymentEvent {
  return {
    type: "RefundCompleted",
    aggregateId: id,
    occurredAt: now,
    payload: { amountMinor: amount.amountMinor.toString() },
  };
}
