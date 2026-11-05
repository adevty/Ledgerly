import { describe, expect, it } from "vitest";
import {
  FixedClock,
  InMemoryIdempotencyStore,
  InMemoryLedgerAdapter,
  InMemoryOutbox,
  InMemoryPaymentRequestRepository,
  InMemoryRemittanceRepository,
  MockChainGateway,
  MockFxAdapter,
  MockOffRampAdapter,
  MockScreeningAdapter,
  unwrap,
  type AccountId,
  type OrgId,
  type PaymentRequestId,
  type RemittanceId,
  type UserId,
} from "@/shared";
import { generateX25519KeyPair } from "@/modules/privacy/domain";
import { PaymentUseCases } from "@/modules/payments/application/use-cases";
import { RemittanceUseCases } from "@/modules/remittance/application/use-cases";
import type { Actor } from "@/modules/identity/domain";
import {
  ChainIndexerWorker,
  ExpiryWorker,
  ReconciliationWorker,
  SettlementWorker,
} from "@/workers";

const T0 = new Date("2026-11-05T12:00:00Z");
const ORG_ID = "org_sari" as OrgId;
const OWNER: Actor = { userId: "u_sari" as UserId, orgId: ORG_ID, role: "OWNER" };

function setupWorkers() {
  const clock = new FixedClock(T0);
  const outbox = new InMemoryOutbox();
  const idempotency = new InMemoryIdempotencyStore();
  const chain = new MockChainGateway();
  const ledger = new InMemoryLedgerAdapter();
  const fx = new MockFxAdapter();
  const offRamp = new MockOffRampAdapter();
  const screening = new MockScreeningAdapter();

  const paymentRepo = new InMemoryPaymentRequestRepository(outbox);
  const remittanceRepo = new InMemoryRemittanceRepository(outbox);

  const payments = new PaymentUseCases({
    repo: paymentRepo,
    chain,
    ledger,
    idempotency,
    clock,
    merchantNearAccounts: new Map([[ORG_ID, "sari.ledgerly.testnet" as AccountId]]),
  });

  const remittances = new RemittanceUseCases({
    repo: remittanceRepo,
    fx,
    offRamp,
    screening,
    chain,
    ledger,
    idempotency,
    clock,
    offRampSettlementAccount: "offramp.ledgerly.testnet" as AccountId,
  });

  const indexer = new ChainIndexerWorker({
    chain,
    paymentRepo,
    remittanceRepo,
    payments,
    remittances,
    clock,
  });

  const settlement = new SettlementWorker({
    remittanceRepo,
    remittances,
  });

  const expiry = new ExpiryWorker({
    paymentRepo,
    remittanceRepo,
    chain,
    clock,
  });

  const reconciliation = new ReconciliationWorker({
    paymentRepo,
    remittanceRepo,
    chain,
  });

  return {
    clock,
    outbox,
    chain,
    offRamp,
    paymentRepo,
    remittanceRepo,
    payments,
    remittances,
    indexer,
    settlement,
    expiry,
    reconciliation,
  };
}

describe("Module 5 — Background Workers (Indexer, Settlement, Expiry, Reconciliation)", () => {
  it("ChainIndexerWorker automatically detects on-chain deposits, settles payments, and deduplicates events", async () => {
    const w = setupWorkers();
    const orgKeys = generateX25519KeyPair();

    const created = unwrap(
      await w.payments.createPaymentRequest({
        idempotencyKey: "idem_w_pr_1",
        actor: OWNER,
        requestId: "pr_w_1" as PaymentRequestId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        orderRef: "ORD-W-1",
        amountDecimal: "100",
        expiresInSec: 3600,
      }),
    );

    // Buyer pays on-chain; before indexer runs, request is still OPEN
    await w.chain.simulateDeposit({
      escrowId: created.escrowId,
      depositor: "buyer.testnet" as AccountId,
      amountMinor: 100_000_000n,
    });
    expect((await w.paymentRepo.findById("pr_w_1" as PaymentRequestId))?.aggregate.status).toBe("OPEN");

    // Indexer polls chain -> detects deposit -> settles request to merchant
    const run1 = await w.indexer.runOnce();
    expect(run1.processedCount).toBe(1);
    expect((await w.paymentRepo.findById("pr_w_1" as PaymentRequestId))?.aggregate.status).toBe("SETTLED");

    // Second pass consumes the OnchainReleaseConfirmed emitted during settlement; third pass has 0 new events
    await w.indexer.runOnce();
    const run3 = await w.indexer.runOnce();
    expect(run3.processedCount).toBe(0);
  });

  it("ExpiryWorker expires open requests/quotes and auto-refunds partially paid requests on expiry", async () => {
    const w = setupWorkers();
    const orgKeys = generateX25519KeyPair();

    // Request 1: stays OPEN until expiry
    await w.payments.createPaymentRequest({
      idempotencyKey: "idem_exp_open",
      actor: OWNER,
      requestId: "pr_exp_open" as PaymentRequestId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      orderRef: "ORD-EXP-1",
      amountDecimal: "100",
      expiresInSec: 600,
    });

    // Request 2: receives partial payment (40 of 100 USDC), then expires -> auto-refunds 40 USDC
    const partial = unwrap(
      await w.payments.createPaymentRequest({
        idempotencyKey: "idem_exp_partial",
        actor: OWNER,
        requestId: "pr_exp_partial" as PaymentRequestId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        orderRef: "ORD-EXP-2",
        amountDecimal: "100",
        expiresInSec: 600,
      }),
    );
    await w.chain.simulateDeposit({
      escrowId: partial.escrowId,
      depositor: "buyer.testnet" as AccountId,
      amountMinor: 40_000_000n,
    });
    await w.indexer.runOnce();
    expect((await w.paymentRepo.findById("pr_exp_partial" as PaymentRequestId))?.aggregate.status).toBe(
      "PARTIALLY_PAID",
    );

    // Remittance quote that is never funded
    await w.remittances.createQuotedRemittance({
      idempotencyKey: "idem_exp_rm",
      actor: OWNER,
      remittanceId: "rm_exp_1" as RemittanceId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      sourceUsdcDecimal: "50",
      targetCurrency: "PHP",
      recipientType: "EWALLET",
      recipientName: "Rosa Santos",
      recipientAccountOrWallet: "+639170001111",
      recipientCountry: "PH",
      quoteLockSec: 60,
    });

    // Advance clock past both expiries (15 minutes)
    w.clock.advance(15 * 60 * 1000);
    const expStats = await w.expiry.runOnce();
    expect(expStats).toEqual({
      expiredRequests: 1,
      refundedPartialRequests: 1,
      expiredQuotes: 1,
    });

    expect((await w.paymentRepo.findById("pr_exp_open" as PaymentRequestId))?.aggregate.status).toBe("EXPIRED");
    expect((await w.paymentRepo.findById("pr_exp_partial" as PaymentRequestId))?.aggregate.status).toBe("REFUNDED");
    expect((await w.chain.getEscrow(partial.escrowId))?.heldMinor).toBe(0n);
    expect((await w.remittanceRepo.findById("rm_exp_1" as RemittanceId))?.aggregate.status).toBe("EXPIRED");
  });

  it("SettlementWorker retries failed off-ramp payouts, and ChainIndexerWorker reconciles user fail-safe claim_refund", async () => {
    const w = setupWorkers();
    const orgKeys = generateX25519KeyPair();

    // Remittance #1: transient off-ramp failure -> SettlementWorker retries -> SETTLED
    const rm1 = unwrap(
      await w.remittances.createQuotedRemittance({
        idempotencyKey: "idem_sw_1",
        actor: OWNER,
        remittanceId: "rm_sw_1" as RemittanceId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        sourceUsdcDecimal: "100",
        targetCurrency: "PHP",
        recipientType: "EWALLET",
        recipientName: "Rosa Santos",
        recipientAccountOrWallet: "+639171112222",
        recipientCountry: "PH",
      }),
    );

    w.offRamp.setBehavior({ mode: "TRANSIENT_FAILURE", code: "BANK_MAINTENANCE" });
    await w.chain.simulateDeposit({
      escrowId: rm1.escrowId,
      depositor: "maria.testnet" as AccountId,
      amountMinor: 100_000_000n,
      commitment: rm1.commitment,
    });
    await w.indexer.runOnce();

    // ReconciliationWorker surfaces PAYOUT_RETRY_PENDING in Exception Queue
    const reconBefore = await w.reconciliation.runOnce();
    expect(reconBefore.discrepancies.some((d) => d.reason === "PAYOUT_RETRY_PENDING")).toBe(true);

    // Partner recovers; SettlementWorker retries and settles
    w.offRamp.setBehavior({ mode: "SUCCESS" });
    const retryStats = await w.settlement.runOnce();
    expect(retryStats).toEqual({ retriedCount: 1, settledCount: 1, refundedCount: 0 });

    const reconAfter = await w.reconciliation.runOnce();
    expect(reconAfter.discrepancies.length).toBe(0);

    // Remittance #2: fail-safe user claim_refund on-chain while in PAYOUT_FAILED state -> reconciled to REFUNDED
    const rm2 = unwrap(
      await w.remittances.createQuotedRemittance({
        idempotencyKey: "idem_sw_2",
        actor: OWNER,
        remittanceId: "rm_sw_2" as RemittanceId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        sourceUsdcDecimal: "80",
        targetCurrency: "IDR",
        recipientType: "BANK",
        recipientName: "Budi Santoso",
        recipientAccountOrWallet: "BCA-99887766",
        recipientCountry: "ID",
      }),
    );
    w.offRamp.setBehavior({ mode: "TRANSIENT_FAILURE" });
    await w.chain.simulateDeposit({
      escrowId: rm2.escrowId,
      depositor: "maria.testnet" as AccountId,
      amountMinor: 80_000_000n,
      commitment: rm2.commitment,
    });
    await w.indexer.runOnce();
    expect((await w.remittanceRepo.findById("rm_sw_2" as RemittanceId))?.aggregate.status).toBe("PAYOUT_FAILED");

    // Sender calls `claim_refund` directly on NEAR contract
    await w.chain.simulateUserClaimRefund(rm2.escrowId);

    // Indexer observes `OnchainRefundConfirmed` and reconciles DB state to REFUNDED (AD-2, AD-9)
    await w.indexer.runOnce();
    expect((await w.remittanceRepo.findById("rm_sw_2" as RemittanceId))?.aggregate.status).toBe("REFUNDED");
  });
});
