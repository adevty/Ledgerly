import { describe, expect, it } from "vitest";
import {
  Money,
  newEscrowId,
  unwrap,
  type AccountId,
  type OrgId,
  type PaymentRequestId,
  type TxHash,
} from "@/shared";
import { PaymentRequest } from "./payment-request";

const T0 = new Date("2026-11-05T10:00:00Z");
const usdc = (d: string) => unwrap(Money.parse(d, "USDC"));
const payer = "buyer.testnet" as AccountId;

function newRequest(amount = "120") {
  const pr = unwrap(
    PaymentRequest.create({
      id: "pr_1" as PaymentRequestId,
      merchantId: "org_1" as OrgId,
      escrowId: newEscrowId(),
      amount: usdc(amount),
      expiresAt: new Date(T0.getTime() + 3600_000),
      now: T0,
    }),
  );
  pr.pullEvents(); // drop creation event for clarity
  return pr;
}

const pay = (pr: PaymentRequest, amount: string, tx: string) =>
  pr.recordPayment({ txHash: tx as TxHash, payer, amount: usdc(amount), detectedAt: T0 });

describe("PaymentRequest", () => {
  it("rejects non-USDC, zero amount and past expiry", () => {
    const base = { id: "x" as PaymentRequestId, merchantId: "o" as OrgId, escrowId: newEscrowId(), now: T0 };
    expect(PaymentRequest.create({ ...base, amount: Money.zero("USDC"), expiresAt: new Date(T0.getTime() + 1) }).ok).toBe(false);
    expect(PaymentRequest.create({ ...base, amount: usdc("1"), expiresAt: T0 }).ok).toBe(false);
  });

  it("exact payment → PAID → SETTLED", () => {
    const pr = newRequest();
    expect(unwrap(pay(pr, "120", "tx1"))).toBe("PAID");
    expect(pr.pullEvents().map((e) => e.type)).toEqual(["PaymentReceived", "PaymentRequestPaid"]);
    expect(unwrap(pr.markSettled(usdc("120"), T0))).toBe("SETTLED");
    expect(pr.held().isZero()).toBe(true);
  });

  it("partial then completion", () => {
    const pr = newRequest();
    expect(unwrap(pay(pr, "50", "tx1"))).toBe("PARTIALLY_PAID");
    expect(pr.remaining().toDecimalString()).toBe("70.000000");
    expect(unwrap(pay(pr, "70", "tx2"))).toBe("PAID");
  });

  it("overpayment → refund excess → PAID", () => {
    const pr = newRequest();
    expect(unwrap(pay(pr, "130", "tx1"))).toBe("OVERPAID");
    expect(pr.excess().toDecimalString()).toBe("10.000000");
    expect(unwrap(pr.confirmRefund(usdc("10"), T0))).toBe("PAID");
    expect(pr.held().toDecimalString()).toBe("120.000000");
  });

  it("double payment after PAID becomes overpayment", () => {
    const pr = newRequest();
    pay(pr, "120", "tx1");
    expect(unwrap(pay(pr, "120", "tx2"))).toBe("OVERPAID");
    expect(pr.excess().toDecimalString()).toBe("120.000000");
  });

  it("duplicate txHash is rejected (idempotent indexer)", () => {
    const pr = newRequest();
    pay(pr, "50", "tx1");
    const r = pay(pr, "50", "tx1");
    expect(!r.ok && r.error.code).toBe("DUPLICATE_PAYMENT");
  });

  it("expiry: OPEN → EXPIRED, PARTIALLY_PAID → REFUNDING → REFUNDED", () => {
    const later = new Date(T0.getTime() + 7200_000);
    const a = newRequest();
    expect(unwrap(a.expire(T0))).toBe("OPEN"); // not yet due
    expect(unwrap(a.expire(later))).toBe("EXPIRED");

    const b = newRequest();
    pay(b, "30", "tx1");
    expect(unwrap(b.expire(later))).toBe("REFUNDING");
    expect(unwrap(b.confirmRefund(usdc("30"), later))).toBe("REFUNDED");
  });

  it("merchant refund is capped by net received", () => {
    const pr = newRequest();
    pay(pr, "120", "tx1");
    const tooMuch = pr.requestRefund(usdc("121"), "customer request", T0);
    expect(!tooMuch.ok && tooMuch.error.code).toBe("REFUND_EXCEEDS_AVAILABLE");
    expect(unwrap(pr.requestRefund(usdc("20"), "damaged item", T0))).toBe("REFUNDING");
  });

  it("illegal transitions return INVALID_TRANSITION", () => {
    const pr = newRequest();
    const r = pr.markSettled(usdc("120"), T0);
    expect(!r.ok && r.error.code).toBe("INVALID_TRANSITION");
  });

  it("snapshot/rehydrate round-trips", () => {
    const pr = newRequest();
    pay(pr, "50", "tx1");
    const copy = PaymentRequest.rehydrate(pr.snapshot());
    expect(copy.status).toBe("PARTIALLY_PAID");
    expect(copy.received().equals(pr.received())).toBe(true);
  });
});
