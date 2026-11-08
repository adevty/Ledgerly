/**
 * Deterministic database seeder for Ledgerly demo environment.
 * Generates the realistic dataset defined in `src/lib/seed-data.ts`:
 * - 3 settled invoices ($1,450.00, $350.00, $240.00 = $2,040.00 USDC)
 * - 1 OPEN invoice ready to pay ($420.00 USDC)
 * - 1 overpayment-refund example (the $240.00 invoice funded with $265.00, $25.00 auto-refunded)
 * - 3 settled remittances to PH, ID, AU corridors ($350.00, $1,200.00, $800.00 = $2,350.00 USDC)
 * - 1 expired quote example ($150.00 USDC) labeled simulated, never funded on-chain
 * - A valid, sequenced audit chain anchored on-chain
 */

import { unwrap, type AccountId, type GrantId, type PaymentRequestId, type RemittanceId } from "@/shared";
import { DEMO_ACTOR, DEMO_ORG_ID, type LedgerlyRuntime } from "@/app/api/_runtime";
import { SEED_INVOICES, SEED_REMITTANCES } from "@/lib/seed-data";

export interface SeederSummary {
  readonly seededAtIso: string;
  readonly invoicesCount: number;
  readonly remittancesCount: number;
  readonly settledBalanceUsdc: string;
  readonly openEscrowUsdc: string;
  readonly auditLogLength: number;
  readonly anchoredRootHex: string | null;
}

export async function seedLedgerlyDataset(rt: LedgerlyRuntime): Promise<SeederSummary> {
  const { payments, remittances, disclosures, chain, indexer, metaStore, orgKeys, auditorKeys } = rt;

  // 1. Invoices
  // #1 Settled ($1,450.00 USDC)
  const inv1 = SEED_INVOICES[0];
  const pr1 = unwrap(
    await payments.createPaymentRequest({
      idempotencyKey: "seed_pr_1",
      actor: DEMO_ACTOR,
      requestId: inv1.id as PaymentRequestId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      orderRef: inv1.orderRef,
      description: inv1.description,
      customerEmail: inv1.customerEmail,
      amountDecimal: inv1.amountDecimal,
      expiresInSec: 86400,
    }),
  );
  await chain.simulateDeposit({
    escrowId: pr1.escrowId,
    depositor: inv1.payer as AccountId,
    amountMinor: 1_450_000_000n,
  });
  await indexer.runOnce();

  // #2 Settled ($350.00 USDC)
  const inv2 = SEED_INVOICES[1];
  const pr2 = unwrap(
    await payments.createPaymentRequest({
      idempotencyKey: "seed_pr_2",
      actor: DEMO_ACTOR,
      requestId: inv2.id as PaymentRequestId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      orderRef: inv2.orderRef,
      description: inv2.description,
      customerEmail: inv2.customerEmail,
      amountDecimal: inv2.amountDecimal,
      expiresInSec: 86400,
    }),
  );
  await chain.simulateDeposit({
    escrowId: pr2.escrowId,
    depositor: inv2.payer as AccountId,
    amountMinor: 350_000_000n,
  });
  await indexer.runOnce();

  // #3 Settled with Overpayment Auto-Refund ($240.00 USDC invoice, $265.00 deposited, $25.00 refunded)
  const inv3 = SEED_INVOICES[2];
  const pr3 = unwrap(
    await payments.createPaymentRequest({
      idempotencyKey: "seed_pr_3",
      actor: DEMO_ACTOR,
      requestId: inv3.id as PaymentRequestId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      orderRef: inv3.orderRef,
      description: inv3.description,
      customerEmail: inv3.customerEmail,
      amountDecimal: inv3.amountDecimal,
      expiresInSec: 86400,
    }),
  );
  await chain.simulateDeposit({
    escrowId: pr3.escrowId,
    depositor: inv3.payer as AccountId,
    amountMinor: 265_000_000n, // $265.00 deposited ($25.00 excess)
  });
  await indexer.runOnce();

  // #4 Open Invoice ready for interactive checkout ($420.00 USDC)
  const inv4 = SEED_INVOICES[3];
  await payments.createPaymentRequest({
    idempotencyKey: "seed_pr_4",
    actor: DEMO_ACTOR,
    requestId: inv4.id as PaymentRequestId,
    orgPublicKeyHex: orgKeys.publicKeyHex,
    orderRef: inv4.orderRef,
    description: inv4.description,
    customerEmail: inv4.customerEmail,
    amountDecimal: inv4.amountDecimal,
    expiresInSec: 86400,
  });

  // 2. Remittances
  // #1 PH GCash ($350.00 USDC)
  const rem1 = SEED_REMITTANCES[0];
  const rm1 = unwrap(
    await remittances.createQuotedRemittance({
      idempotencyKey: "seed_rm_1",
      actor: DEMO_ACTOR,
      remittanceId: rem1.id as RemittanceId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      sourceUsdcDecimal: rem1.sourceUsdcDecimal,
      targetCurrency: rem1.targetCurrency,
      recipientType: rem1.rail,
      recipientName: rem1.recipientName,
      recipientAccountOrWallet: rem1.recipientAccountOrWallet,
      recipientCountry: rem1.recipientCountry,
      quoteLockSec: 3600,
    }),
  );
  await chain.simulateDeposit({
    escrowId: rm1.escrowId,
    depositor: "atelier-sari.ledgerly.testnet" as AccountId,
    amountMinor: 350_000_000n,
    commitment: rm1.commitment,
    kind: "Remittance",
  });
  await indexer.runOnce();

  // #2 ID BCA Bank with Travel Rule payload ($1,200.00 USDC)
  const rem2 = SEED_REMITTANCES[1];
  const rm2 = unwrap(
    await remittances.createQuotedRemittance({
      idempotencyKey: "seed_rm_2",
      actor: DEMO_ACTOR,
      remittanceId: rem2.id as RemittanceId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      sourceUsdcDecimal: rem2.sourceUsdcDecimal,
      targetCurrency: rem2.targetCurrency,
      recipientType: rem2.rail,
      recipientName: rem2.recipientName,
      recipientAccountOrWallet: rem2.recipientAccountOrWallet,
      recipientCountry: rem2.recipientCountry,
      quoteLockSec: 3600,
      travelRule: {
        originatorName: "Atelier Sari Global Ltd.",
        originatorCountry: "SG",
        beneficiaryName: rem2.recipientName,
        beneficiaryCountry: rem2.recipientCountry,
      },
    }),
  );
  await chain.simulateDeposit({
    escrowId: rm2.escrowId,
    depositor: "atelier-sari.ledgerly.testnet" as AccountId,
    amountMinor: 1_200_000_000n,
    commitment: rm2.commitment,
    kind: "Remittance",
  });
  await indexer.runOnce();

  // #3 AU PayID ($800.00 USDC)
  const rem3 = SEED_REMITTANCES[2];
  const rm3 = unwrap(
    await remittances.createQuotedRemittance({
      idempotencyKey: "seed_rm_3",
      actor: DEMO_ACTOR,
      remittanceId: rem3.id as RemittanceId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      sourceUsdcDecimal: rem3.sourceUsdcDecimal,
      targetCurrency: rem3.targetCurrency,
      recipientType: rem3.rail,
      recipientName: rem3.recipientName,
      recipientAccountOrWallet: rem3.recipientAccountOrWallet,
      recipientCountry: rem3.recipientCountry,
      quoteLockSec: 3600,
    }),
  );
  await chain.simulateDeposit({
    escrowId: rm3.escrowId,
    depositor: "atelier-sari.ledgerly.testnet" as AccountId,
    amountMinor: 800_000_000n,
    commitment: rm3.commitment,
    kind: "Remittance",
  });
  await indexer.runOnce();

  // #4 Expired Quote Example ($150.00 USDC)
  const rem4 = SEED_REMITTANCES[3];
  const rm4 = unwrap(
    await remittances.createQuotedRemittance({
      idempotencyKey: "seed_rm_4",
      actor: DEMO_ACTOR,
      remittanceId: rem4.id as RemittanceId,
      orgPublicKeyHex: orgKeys.publicKeyHex,
      sourceUsdcDecimal: rem4.sourceUsdcDecimal,
      targetCurrency: rem4.targetCurrency,
      recipientType: rem4.rail,
      recipientName: rem4.recipientName,
      recipientAccountOrWallet: rem4.recipientAccountOrWallet,
      recipientCountry: rem4.recipientCountry,
      quoteLockSec: 0, // Immediately past lock
    }),
  );
  // Mark quote expired (never funded on chain)
  const storedRm4 = await rt.remittanceRepo.findById(rm4.remittanceId);
  if (storedRm4) {
    storedRm4.aggregate.expireQuote(new Date(Date.now() + 1000));
    await rt.remittanceRepo.save(storedRm4.aggregate, storedRm4);
  }

  // 3. ViewKeyGrant & Audit Chain
  const defaultGrantId = "grant_q4_external_audit" as GrantId;
  await disclosures.issueScopedViewKey({
    actor: DEMO_ACTOR,
    grantId: defaultGrantId,
    auditorPublicKeyHex: auditorKeys.publicKeyHex,
    orgPrivateKeyHex: orgKeys.privateKeyHex,
    scope: {
      orgId: DEMO_ORG_ID,
      from: new Date(Date.now() - 7 * 86400 * 1000),
      to: new Date(Date.now() + 7 * 86400 * 1000),
      kinds: ["PAYMENT", "REMITTANCE"],
    },
    expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
  });

  // Record audit actions for the valid chain
  await disclosures.recordAuditAction(
    DEMO_ACTOR.userId,
    "EXPORT_RECONCILIATION",
    "seed_export_q4_merchant_ledger.csv",
  );
  await disclosures.recordAuditAction(
    DEMO_ACTOR.userId,
    "RECONCILE",
    "seed_reconcile_pass_zero_discrepancies",
  );

  // Anchor latest root on chain
  const auditLog = metaStore.loadAuditLog();
  const latestEntry = auditLog[auditLog.length - 1];
  let anchoredRootHex: string | null = null;
  if (latestEntry) {
    await disclosures.recordAuditAction(DEMO_ACTOR.userId, "ANCHOR_AUDIT_ROOT", latestEntry.hash);
    const updatedLog = metaStore.loadAuditLog();
    const finalEntry = updatedLog[updatedLog.length - 1]!;
    await chain.anchorAuditRoot(finalEntry.hash);
    anchoredRootHex = finalEntry.hash;
  }

  metaStore.set("default_grant_id", defaultGrantId);
  metaStore.set("seeded_v2", true);

  return {
    seededAtIso: new Date().toISOString(),
    invoicesCount: SEED_INVOICES.length,
    remittancesCount: SEED_REMITTANCES.length,
    settledBalanceUsdc: "4,390.00",
    openEscrowUsdc: "420.00",
    auditLogLength: metaStore.loadAuditLog().length,
    anchoredRootHex,
  };
}
