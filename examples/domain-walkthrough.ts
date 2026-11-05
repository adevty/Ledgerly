/**
 * Usage example for the core domain (module 1).
 * Run: npx tsx examples/domain-walkthrough.ts
 *
 * Simulates: a merchant payment that is overpaid and auto-refunded, and a
 * remittance whose first payout fails transiently and then settles.
 */
import { Money, Rate, newEscrowId, unwrap } from "../src/shared";
import type { AccountId, OrgId, PaymentRequestId, RemittanceId, TxHash, UserId } from "../src/shared";
import { PaymentRequest } from "../src/modules/payments/domain";
import { Quote, Remittance } from "../src/modules/remittance/domain";

const now = new Date();
const usdc = (d: string) => unwrap(Money.parse(d, "USDC"));

// --- Merchant payment -------------------------------------------------------
const pr = unwrap(
  PaymentRequest.create({
    id: "pr_demo" as PaymentRequestId,
    merchantId: "org_sari" as OrgId,
    escrowId: newEscrowId(),
    amount: usdc("120"),
    expiresAt: new Date(now.getTime() + 15 * 60_000),
    now,
  }),
);
unwrap(pr.recordPayment({ txHash: "tx1" as TxHash, payer: "buyer.testnet" as AccountId, amount: usdc("130"), detectedAt: now }));
console.log("status:", pr.status, "excess:", pr.excess().toDecimalString()); // OVERPAID 10
unwrap(pr.confirmRefund(pr.excess(), now));
unwrap(pr.markSettled(usdc("120"), now));
console.log("status:", pr.status, "events:", pr.pullEvents().map((e) => e.type));

// --- Remittance -------------------------------------------------------------
const quote = unwrap(
  Quote.create({
    source: usdc("200"),
    fee: usdc("1"),
    rate: unwrap(Rate.parse("USDC", "PHP", "56.1234")),
    lockedUntil: new Date(now.getTime() + 60_000),
  }),
);
const rm = unwrap(
  Remittance.quote({
    id: "rm_demo" as RemittanceId,
    senderId: "u_maria" as UserId,
    escrowId: newEscrowId(),
    recipient: { type: "EWALLET", destinationRef: "enc:gcash", country: "PH" },
    quote,
    now,
  }),
);
console.log(`quote: 200 USDC → ${quote.target.toDecimalString()} PHP (fee ${quote.fee.toDecimalString()})`);
unwrap(rm.fund("tx_fund" as TxHash, usdc("200"), now));
unwrap(rm.startPayout(now));
unwrap(rm.markPayoutFailed("OFFRAMP_UNAVAILABLE", true, now));
const retry = unwrap(rm.startPayout(now));
unwrap(rm.markSettled("gcash_ref_123", now));
console.log("retry key:", retry.idempotencyKey, "status:", rm.status);
