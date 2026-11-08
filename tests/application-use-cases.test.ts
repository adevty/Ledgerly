import { describe, expect, it } from "vitest";
import {
  FixedClock,
  InMemoryIdempotencyStore,
  InMemoryLedgerAdapter,
  InMemoryOutbox,
  InMemoryPaymentRequestRepository,
  InMemoryRemittanceRepository,
  InMemoryViewKeyGrantRepository,
  MockChainGateway,
  MockFxAdapter,
  MockOffRampAdapter,
  MockScreeningAdapter,
  unwrap,
  type AccountId,
  type GrantId,
  type OrgId,
  type PaymentRequestId,
  type RemittanceId,
  type UserId,
} from "@/shared";
import { generateX25519KeyPair, verifyAuditChain } from "@/modules/privacy/domain";
import { exportLedgerToCsv } from "@/modules/ledger/domain";
import { PaymentUseCases } from "@/modules/payments/application/use-cases";
import { RemittanceUseCases } from "@/modules/remittance/application/use-cases";
import { DisclosureUseCases } from "@/modules/privacy/application/use-cases";
import type { Actor } from "@/modules/identity/domain";

const T0 = new Date("2026-11-05T12:00:00Z");
const ORG_ID = "org_sari" as OrgId;
const OWNER: Actor = { userId: "u_sari" as UserId, orgId: ORG_ID, role: "OWNER" };
const VIEWER: Actor = { userId: "u_intern" as UserId, orgId: ORG_ID, role: "VIEWER" };

function setupContainer() {
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
  const grantRepo = new InMemoryViewKeyGrantRepository(outbox);

  const merchantNearAccounts = new Map<OrgId, AccountId>([
    [ORG_ID, "sari.ledgerly.testnet" as AccountId],
  ]);

  const payments = new PaymentUseCases({
    repo: paymentRepo,
    chain,
    ledger,
    idempotency,
    clock,
    merchantNearAccounts,
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

  const disclosures = new DisclosureUseCases({
    grantRepo,
    paymentRepo,
    remittanceRepo,
    chain,
    clock,
  });

  return {
    clock,
    outbox,
    chain,
    ledger,
    offRamp,
    payments,
    remittances,
    disclosures,
  };
}

describe("Module 4 — End-to-End Application Use Cases & Mock Adapters", () => {
  it("handles merchant payment lifecycle: create -> overpay -> auto-refund excess -> settle -> CSV export", async () => {
    const c = setupContainer();
    const orgKeys = generateX25519KeyPair();

    // VIEWER cannot create payment request (RBAC check)
    const forbidden = await c.payments.createPaymentRequest({
      idempotencyKey: "idem_forbidden",
      actor: VIEWER,
      requestId: "pr_0" as PaymentRequestId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      orderRef: "ORD-000",
      amountDecimal: "100",
      expiresInSec: 3600,
    });
    expect(!forbidden.ok && forbidden.error.code).toBe("FORBIDDEN_ROLE");

    // OWNER creates 120 USDC payment request
    const created = unwrap(
      await c.payments.createPaymentRequest({
        idempotencyKey: "idem_pr_1",
        actor: OWNER,
        requestId: "pr_1" as PaymentRequestId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        orderRef: "ORD-123",
        description: "Woven basket batch",
        customerEmail: "buyer@global.example",
        amountDecimal: "120",
        expiresInSec: 3600,
      }),
    );

    // Idempotent replay with same key & payload returns identical output
    const replay = unwrap(
      await c.payments.createPaymentRequest({
        idempotencyKey: "idem_pr_1",
        actor: OWNER,
        requestId: "pr_1" as PaymentRequestId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        orderRef: "ORD-123",
        amountDecimal: "120",
        expiresInSec: 3600,
      }),
    );
    expect(replay.escrowId).toBe(created.escrowId);

    // Buyer deposits 130 USDC (overpaid by 10 USDC) into escrow on-chain
    const dep = await c.chain.simulateDeposit({
      escrowId: created.escrowId,
      depositor: "buyer.testnet" as AccountId,
      amountMinor: 130_000_000n,
    });

    const settled = unwrap(
      await c.payments.handleOnchainDeposit({
        escrowId: created.escrowId,
        txHash: dep.txHash,
        payer: "buyer.testnet" as AccountId,
        amountMinor: 130_000_000n,
      }),
    );
    expect(settled.status).toBe("SETTLED");

    // On-chain escrow balance is now 0 and Closed (10 refunded + 120 released)
    const escrowAfter = await c.chain.getEscrow(created.escrowId);
    expect(escrowAfter?.heldMinor).toBe(0n);
    expect(escrowAfter?.status).toBe("Closed");

    // Double-entry ledger has 6 legs (deposit, excess refund, merchant settlement) and exports cleanly
    const entries = await c.ledger.listEntries({ refType: "PAYMENT_REQUEST", refId: "pr_1" });
    expect(entries.length).toBe(6);
    const csv = exportLedgerToCsv(entries);
    expect(csv).toContain("asset:escrow_usdc");
    expect(csv).toContain("120000000");
  });

  it("enforces Travel Rule >= 1,000 USDC, blocks sanctioned recipients, and handles transient off-ramp retry", async () => {
    const c = setupContainer();
    const orgKeys = generateX25519KeyPair();

    // 1,200 USDC without Travel Rule -> rejected
    const missingTravelRule = await c.remittances.createQuotedRemittance({
      idempotencyKey: "idem_rm_tr",
      actor: OWNER,
      remittanceId: "rm_tr" as RemittanceId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      sourceUsdcDecimal: "1200",
      targetCurrency: "PHP",
      recipientType: "EWALLET",
      recipientName: "Rosa Santos",
      recipientAccountOrWallet: "+639171234567",
      recipientCountry: "PH",
    });
    expect(!missingTravelRule.ok && missingTravelRule.error.code).toBe("TRAVEL_RULE_REQUIRED");

    // Sanctioned recipient -> transitions to BLOCKED
    const sanctioned = unwrap(
      await c.remittances.createQuotedRemittance({
        idempotencyKey: "idem_rm_sanctioned",
        actor: OWNER,
        remittanceId: "rm_bad" as RemittanceId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        sourceUsdcDecimal: "100",
        targetCurrency: "PHP",
        recipientType: "EWALLET",
        recipientName: "Lazarus Group Entity",
        recipientAccountOrWallet: "+639000000000",
        recipientCountry: "PH",
      }),
    );
    expect(sanctioned.status).toBe("BLOCKED");

    // Valid 200 USDC -> PHP remittance with transient failure then successful retry
    const quoted = unwrap(
      await c.remittances.createQuotedRemittance({
        idempotencyKey: "idem_rm_ok",
        actor: OWNER,
        remittanceId: "rm_1" as RemittanceId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        sourceUsdcDecimal: "200",
        targetCurrency: "PHP",
        recipientType: "EWALLET",
        recipientName: "Rosa Santos",
        recipientAccountOrWallet: "+639171234567",
        recipientCountry: "PH",
      }),
    );
    expect(quoted.status).toBe("QUOTED");

    // Sender deposits 200 USDC into escrow
    const fundTx = await c.chain.simulateDeposit({
      escrowId: quoted.escrowId,
      depositor: "maria.ledgerly.testnet" as AccountId,
      amountMinor: 200_000_000n,
      commitment: quoted.commitment,
      kind: "Remittance",
    });

    // Configure off-ramp to fail transiently on attempt #1
    c.offRamp.setBehavior({ mode: "TRANSIENT_FAILURE", code: "GCASH_TIMEOUT" });
    const firstTry = unwrap(
      await c.remittances.handleFundingAndSettle({
        escrowId: quoted.escrowId,
        txHash: fundTx.txHash,
        amountMinor: 200_000_000n,
      }),
    );
    expect(firstTry.status).toBe("PAYOUT_FAILED");
    expect(firstTry.attempts).toBe(1);

    // Off-ramp recovers -> retry succeeds and settles
    c.offRamp.setBehavior({ mode: "SUCCESS" });
    const secondTry = unwrap(await c.remittances.retryPayout("rm_1" as RemittanceId));
    expect(secondTry.status).toBe("SETTLED");
    expect(secondTry.attempts).toBe(2);
  });

  it("completes selective disclosure audit flow with on-chain commitment verification", async () => {
    const c = setupContainer();
    const orgKeys = generateX25519KeyPair();
    const auditorKeys = generateX25519KeyPair();

    // Create 1 payment request and 1 remittance
    await c.payments.createPaymentRequest({
      idempotencyKey: "idem_audit_pr",
      actor: OWNER,
      requestId: "pr_audit_1" as PaymentRequestId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      orderRef: "INV-AUDIT-01",
      amountDecimal: "75",
      expiresInSec: 3600,
    });

    const rm = unwrap(
      await c.remittances.createQuotedRemittance({
        idempotencyKey: "idem_audit_rm",
        actor: OWNER,
        remittanceId: "rm_audit_1" as RemittanceId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        sourceUsdcDecimal: "50",
        targetCurrency: "IDR",
        recipientType: "BANK",
        recipientName: "PT Sumber Makmur",
        recipientAccountOrWallet: "BCA-1234567890",
        recipientCountry: "ID",
      }),
    );
    await c.chain.registerEscrow({
      escrowId: rm.escrowId,
      kind: "Remittance",
      commitment: rm.commitment,
      refundAfterNs: 999999999999999999n,
    });

    // Issue scoped view key for both PAYMENT and REMITTANCE
    const grantRes = unwrap(
      await c.disclosures.issueScopedViewKey({
        actor: OWNER,
        grantId: "grant_nov_2026" as GrantId,
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

    // Auditor decrypts both records and verifies their commitments against on-chain state
    const verified = unwrap(
      await c.disclosures.verifyScopedRecordsAsAuditor({
        grantId: "grant_nov_2026" as GrantId,
        auditorPrivateKeyHex: auditorKeys.privateKeyHex,
      }),
    );
    expect(verified.length).toBe(2);
    expect(verified.every((r) => r.verifiedOnchain)).toBe(true);

    // Read-only verification does not append an audit entry
    expect(c.chain.getAnchoredRoots().length).toBe(1);

    // Explicit audit action appends and anchors on-chain
    await c.disclosures.recordAuditAction(
      "auditor_external",
      "AUDIT_RECORDS_VERIFIED",
      "grant_nov_2026",
    );

    // Audit log hash chain is intact and anchored on-chain
    expect(verifyAuditChain(c.disclosures.getAuditLog())).toBe(true);
    expect(c.chain.getAnchoredRoots().length).toBe(2);
  });
});
