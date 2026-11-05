import { describe, expect, it } from "vitest";
import {
  Money,
  Rate,
  newEscrowId,
  unwrap,
  type AccountId,
  type RemittanceId,
  type TxHash,
  type UserId,
} from "@/shared";
import { MAX_PAYOUT_ATTEMPTS, Quote, Remittance, type Recipient } from "./remittance";

const T0 = new Date("2026-11-05T10:00:00Z");
const LOCK = new Date(T0.getTime() + 60_000);
const usdc = (d: string) => unwrap(Money.parse(d, "USDC"));

function phpQuote() {
  return unwrap(
    Quote.create({
      source: usdc("200"),
      fee: usdc("1"),
      rate: unwrap(Rate.parse("USDC", "PHP", "56.1234")),
      lockedUntil: LOCK,
    }),
  );
}

const ewallet: Recipient = { type: "EWALLET", destinationRef: "dest_enc_1", country: "PH" };

function newRemittance(recipient: Recipient = ewallet, quote = phpQuote()) {
  return unwrap(
    Remittance.quote({
      id: "rm_1" as RemittanceId,
      senderId: "u_1" as UserId,
      escrowId: newEscrowId(),
      recipient,
      quote,
      now: T0,
    }),
  );
}
const tx = "tx_fund" as TxHash;

describe("Quote", () => {
  it("applies fee before conversion and rounds down", () => {
    const q = phpQuote();
    expect(q.target.toDecimalString()).toBe("11168.55"); // (200-1) * 56.1234
  });
  it("rejects fee ≥ source", () => {
    expect(Quote.create({ source: usdc("1"), fee: usdc("1"), rate: unwrap(Rate.parse("USDC", "PHP", "1")), lockedUntil: LOCK }).ok).toBe(false);
  });
});

describe("Remittance", () => {
  it("happy path: fund → payout → settled", () => {
    const r = newRemittance();
    expect(unwrap(r.fund(tx, usdc("200"), T0))).toBe("FUNDED");
    const { idempotencyKey } = unwrap(r.startPayout(T0));
    expect(idempotencyKey).toBe("rm_1#1");
    expect(unwrap(r.markSettled("offramp_ref_1", T0))).toBe("SETTLED");
  });

  it("direct NEAR account recipient settles without off-ramp", () => {
    const usdcQuote = unwrap(
      Quote.create({ source: usdc("50"), fee: usdc("0.1"), rate: unwrap(Rate.parse("USDC", "USDC", "1")), lockedUntil: LOCK }),
    );
    const r = newRemittance({ type: "NEAR_ACCOUNT", accountId: "rosa.ledgerly.testnet" as AccountId, country: "PH" }, usdcQuote);
    unwrap(r.fund(tx, usdc("50"), T0));
    expect(r.startPayout(T0).ok).toBe(false);
    expect(unwrap(r.markSettled("release_tx", T0))).toBe("SETTLED");
  });

  it("wrong funding amount → REFUNDING", () => {
    const r = newRemittance();
    expect(unwrap(r.fund(tx, usdc("150"), T0))).toBe("REFUNDING");
  });

  it("funding after quote lock → REFUNDING", () => {
    const r = newRemittance();
    expect(unwrap(r.fund(tx, usdc("200"), new Date(LOCK.getTime() + 1)))).toBe("REFUNDING");
  });

  it("retryable failures retry until cap, then refund", () => {
    const r = newRemittance();
    unwrap(r.fund(tx, usdc("200"), T0));
    for (let i = 1; i < MAX_PAYOUT_ATTEMPTS; i++) {
      unwrap(r.startPayout(T0));
      expect(unwrap(r.markPayoutFailed("OFFRAMP_UNAVAILABLE", true, T0))).toBe("PAYOUT_FAILED");
    }
    unwrap(r.startPayout(T0));
    expect(unwrap(r.markPayoutFailed("OFFRAMP_UNAVAILABLE", true, T0))).toBe("REFUNDING");
    expect(unwrap(r.confirmRefund(T0))).toBe("REFUNDED");
  });

  it("permanent failure refunds immediately", () => {
    const r = newRemittance();
    unwrap(r.fund(tx, usdc("200"), T0));
    unwrap(r.startPayout(T0));
    expect(unwrap(r.markPayoutFailed("RECIPIENT_ACCOUNT_INVALID", false, T0))).toBe("REFUNDING");
  });

  it("screening block only before funding", () => {
    const r = newRemittance();
    expect(unwrap(r.block("SANCTIONS_HIT", T0))).toBe("BLOCKED");
    expect(r.fund(tx, usdc("200"), T0).ok).toBe(false);
  });

  it("sender claim_refund (on-chain) is reconciled from FUNDED", () => {
    const r = newRemittance();
    unwrap(r.fund(tx, usdc("200"), T0));
    expect(unwrap(r.confirmRefund(T0))).toBe("REFUNDED");
  });

  it("refund during in-flight payout is flagged for review", () => {
    const r = newRemittance();
    unwrap(r.fund(tx, usdc("200"), T0));
    unwrap(r.startPayout(T0));
    r.pullEvents();
    unwrap(r.confirmRefund(T0));
    const ev = r.pullEvents().find((e) => e.type === "RemittanceRefunded");
    expect(ev?.payload).toEqual({ requiresReview: true });
  });

  it("quote expires without funding", () => {
    const r = newRemittance();
    expect(unwrap(r.expireQuote(T0))).toBe("QUOTED");
    expect(unwrap(r.expireQuote(new Date(LOCK.getTime() + 1)))).toBe("EXPIRED");
  });
});
