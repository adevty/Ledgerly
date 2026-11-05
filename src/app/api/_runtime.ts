import {
  InMemoryOutbox,
  MockChainGateway,
  MockFxAdapter,
  MockOffRampAdapter,
  MockScreeningAdapter,
  NearRpcChainGateway,
  openLedgerlySqliteDb,
  SqliteIdempotencyStore,
  SqliteLedgerAdapter,
  SqlitePaymentRequestRepository,
  SqliteRemittanceRepository,
  SqliteRuntimeMetaStore,
  SqliteViewKeyGrantRepository,
  systemClock,
  unwrap,
  type AccountId,
  type GrantId,
  type OrgId,
  type PaymentRequestId,
  type RemittanceId,
  type UserId,
} from "@/shared";
import { generateX25519KeyPair, verifyAuditChain, type KeyPairHex } from "@/modules/privacy/domain";
import { exportLedgerToCsv } from "@/modules/ledger/domain";
import { PaymentUseCases } from "@/modules/payments/application/use-cases";
import { RemittanceUseCases } from "@/modules/remittance/application/use-cases";
import { DisclosureUseCases } from "@/modules/privacy/application/use-cases";
import type { Actor } from "@/modules/identity/domain";
import {
  ChainIndexerWorker,
  ExpiryWorker,
  ReconciliationWorker,
  SettlementWorker,
} from "@/workers";

export const DEMO_ORG_ID = "org_atelier_sari" as OrgId;
export const DEMO_ACTOR: Actor = {
  userId: "u_cfo_sari" as UserId,
  orgId: DEMO_ORG_ID,
  role: "OWNER",
};

export interface LedgerlyRuntime {
  readonly networkMode: "NEAR_TESTNET_RPC" | "LOCAL_SANDBOX_SIMULATION";
  readonly rpcUrl: string;
  readonly escrowContractId: AccountId;
  readonly usdcContractId: AccountId;
  readonly explorerBaseUrl: string;
  readonly orgKeys: KeyPairHex;
  readonly auditorKeys: KeyPairHex;
  readonly metaStore: SqliteRuntimeMetaStore;
  readonly outbox: InMemoryOutbox;
  readonly chain: MockChainGateway | NearRpcChainGateway;
  readonly ledger: SqliteLedgerAdapter;
  readonly fx: MockFxAdapter;
  readonly offRamp: MockOffRampAdapter;
  readonly screening: MockScreeningAdapter;
  readonly paymentRepo: SqlitePaymentRequestRepository;
  readonly remittanceRepo: SqliteRemittanceRepository;
  readonly grantRepo: SqliteViewKeyGrantRepository;
  readonly payments: PaymentUseCases;
  readonly remittances: RemittanceUseCases;
  readonly disclosures: DisclosureUseCases;
  readonly indexer: ChainIndexerWorker;
  readonly settlement: SettlementWorker;
  readonly expiry: ExpiryWorker;
  readonly reconciliation: ReconciliationWorker;
  defaultGrantId: GrantId;
}

const globalForLedgerly = globalThis as unknown as {
  __ledgerlyRuntime?: Promise<LedgerlyRuntime>;
};

export function getRuntime(): Promise<LedgerlyRuntime> {
  if (!globalForLedgerly.__ledgerlyRuntime) {
    globalForLedgerly.__ledgerlyRuntime = createSeededRuntime();
  }
  return globalForLedgerly.__ledgerlyRuntime;
}

async function createSeededRuntime(): Promise<LedgerlyRuntime> {
  const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  const db = openLedgerlySqliteDb(isTestEnv ? ":memory:" : undefined);
  const metaStore = new SqliteRuntimeMetaStore(db);

  const orgKeys = metaStore.getOrCreateKeyPair("org_keys", generateX25519KeyPair);
  const auditorKeys = metaStore.getOrCreateKeyPair("auditor_keys", generateX25519KeyPair);
  const outbox = new InMemoryOutbox();
  const idempotency = new SqliteIdempotencyStore(db);

  const rpcUrl = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
  const escrowContractId = (process.env.NEAR_ESCROW_CONTRACT_ID ??
    "escrow.ledgerly.testnet") as AccountId;
  const usdcContractId = (process.env.NEAR_USDC_CONTRACT_ID ??
    "usdc.fakes.testnet") as AccountId;
  const operatorAccountId = process.env.NEAR_OPERATOR_ACCOUNT_ID as AccountId | undefined;
  const operatorPrivateKey = process.env.NEAR_OPERATOR_PRIVATE_KEY;
  const explorerBaseUrl =
    process.env.NEAR_EXPLORER_BASE_URL ?? "https://testnet.nearblocks.io";

  const useLiveNearRpc = Boolean(operatorAccountId && operatorPrivateKey);
  const networkMode: "NEAR_TESTNET_RPC" | "LOCAL_SANDBOX_SIMULATION" = useLiveNearRpc
    ? "NEAR_TESTNET_RPC"
    : "LOCAL_SANDBOX_SIMULATION";

  const chain: MockChainGateway | NearRpcChainGateway =
    useLiveNearRpc && operatorAccountId && operatorPrivateKey
      ? new NearRpcChainGateway({
          rpcUrl,
          escrowContractId,
          usdcContractId,
          operatorAccountId,
          operatorPrivateKey,
        })
      : new MockChainGateway();

  const ledger = new SqliteLedgerAdapter(db);
  const fx = new MockFxAdapter();
  const offRamp = new MockOffRampAdapter();
  const screening = new MockScreeningAdapter();

  const paymentRepo = new SqlitePaymentRequestRepository(db, outbox);
  const remittanceRepo = new SqliteRemittanceRepository(db, outbox);
  const grantRepo = new SqliteViewKeyGrantRepository(db, outbox);

  const payments = new PaymentUseCases({
    repo: paymentRepo,
    chain,
    ledger,
    idempotency,
    clock: systemClock,
    merchantNearAccounts: new Map([[DEMO_ORG_ID, "atelier-sari.ledgerly.testnet" as AccountId]]),
  });

  const remittances = new RemittanceUseCases({
    repo: remittanceRepo,
    fx,
    offRamp,
    screening,
    chain,
    ledger,
    idempotency,
    clock: systemClock,
    offRampSettlementAccount: "offramp-pool.ledgerly.testnet" as AccountId,
  });

  const initialAuditLog = metaStore.loadAuditLog();
  const disclosures = new DisclosureUseCases({
    grantRepo,
    paymentRepo,
    remittanceRepo,
    chain,
    clock: systemClock,
    initialAuditLog,
    onAuditEntry: (entry) => metaStore.appendAuditEntry(entry),
  });

  const indexer = new ChainIndexerWorker({
    chain,
    paymentRepo,
    remittanceRepo,
    payments,
    remittances,
    clock: systemClock,
  });

  const settlement = new SettlementWorker({
    remittanceRepo,
    remittances,
  });

  const expiry = new ExpiryWorker({
    paymentRepo,
    remittanceRepo,
    chain,
    clock: systemClock,
  });

  const reconciliation = new ReconciliationWorker({
    paymentRepo,
    remittanceRepo,
    chain,
  });

  const alreadySeeded = metaStore.get<boolean>("seeded_v1") === true;
  let defaultGrantId =
    metaStore.get<GrantId>("default_grant_id") ?? ("grant_q4_external_audit" as GrantId);

  if (!alreadySeeded) {
    try {
      // --- Seed #1: Settled merchant payment (exact match) ---
      const pr1 = unwrap(
        await payments.createPaymentRequest({
          idempotencyKey: "seed_pr_1",
          actor: DEMO_ACTOR,
          requestId: "pr_inv_8841" as PaymentRequestId,
          orgPublicKeyHex: orgKeys.publicKeyHex,
          orderRef: "INV-2026-8841",
          description: "Wholesale ceramic vessel batch — Kyoto Studio",
          customerEmail: "procurement@kyoto-living.jp",
          amountDecimal: "1450.00",
          expiresInSec: 86400,
        }),
      );
      await chain.simulateDeposit({
        escrowId: pr1.escrowId,
        depositor: "kyoto-living.testnet" as AccountId,
        amountMinor: 1_450_000_000n,
      });
      await indexer.runOnce();

      // --- Seed #2: Open merchant payment request ready for live interactive checkout ---
      await payments.createPaymentRequest({
        idempotencyKey: "seed_pr_2",
        actor: DEMO_ACTOR,
        requestId: "pr_inv_8842" as PaymentRequestId,
        orgPublicKeyHex: orgKeys.publicKeyHex,
        orderRef: "INV-2026-8842",
        description: "Bespoke brass lighting fixtures (12 units)",
        customerEmail: "ap@nordic-atelier.dk",
        amountDecimal: "420.00",
        expiresInSec: 86400,
      });

      // --- Seed #3: Settled cross-border remittance (USDC -> PHP via GCash) ---
      const rm1 = unwrap(
        await remittances.createQuotedRemittance({
          idempotencyKey: "seed_rm_1",
          actor: DEMO_ACTOR,
          remittanceId: "rm_mnl_301" as RemittanceId,
          orgPublicKeyHex: orgKeys.publicKeyHex,
          sourceUsdcDecimal: "350.00",
          targetCurrency: "PHP",
          recipientType: "EWALLET",
          recipientName: "Rosa Santos Artisans Co.",
          recipientAccountOrWallet: "GCASH:+63-917-555-0192",
          recipientCountry: "PH",
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
    } catch (seedErr) {
      console.warn("Runtime seed warning:", seedErr);
    }

    // --- Seed #4: Issue an initial scoped ViewKeyGrant for the Auditor console ---
    defaultGrantId = "grant_q4_external_audit" as GrantId;
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

    metaStore.set("default_grant_id", defaultGrantId);
    metaStore.set("seeded_v1", true);
  } else if (chain instanceof MockChainGateway) {
    // Re-populate in-memory MockChainGateway when running in sandbox mode after restart
    const savedPayments = await paymentRepo.listAll();
    for (const p of savedPayments) {
      const s = p.aggregate.snapshot();
      await chain.registerEscrow({
        escrowId: s.escrowId,
        kind: "Payment",
        commitment: p.envelope.commitment,
        refundAfterNs: BigInt(s.expiresAt.getTime() + 86400_000) * 1_000_000n,
      });
      const heldMinor = p.aggregate.held().amountMinor;
      if (heldMinor > 0n) {
        await chain.simulateDeposit({
          escrowId: s.escrowId,
          depositor: s.payments[0]?.payer ?? ("buyer.testnet" as AccountId),
          amountMinor: heldMinor,
        });
      }
    }
    const savedRemittances = await remittanceRepo.listAll();
    for (const r of savedRemittances) {
      const s = r.aggregate.snapshot();
      await chain.registerEscrow({
        escrowId: s.escrowId,
        kind: "Remittance",
        commitment: r.envelope.commitment,
        refundAfterNs: BigInt(Date.now() + 86400_000) * 1_000_000n,
      });
      const heldStatuses = ["FUNDED", "PAYOUT_PENDING", "PAYOUT_FAILED", "REFUNDING"];
      if (heldStatuses.includes(s.status)) {
        await chain.simulateDeposit({
          escrowId: s.escrowId,
          depositor: "atelier-sari.ledgerly.testnet" as AccountId,
          amountMinor: s.quote.source.amountMinor,
          commitment: r.envelope.commitment,
          kind: "Remittance",
        });
      }
    }
  }

  return {
    networkMode,
    rpcUrl,
    escrowContractId,
    usdcContractId,
    explorerBaseUrl,
    orgKeys,
    auditorKeys,
    metaStore,
    outbox,
    chain,
    ledger,
    fx,
    offRamp,
    screening,
    paymentRepo,
    remittanceRepo,
    grantRepo,
    payments,
    remittances,
    disclosures,
    indexer,
    settlement,
    expiry,
    reconciliation,
    defaultGrantId,
  };
}

export async function buildDashboardSnapshot() {
  const rt = await getRuntime();
  const prs = await rt.paymentRepo.listByOrgId(DEMO_ORG_ID);
  const rms = await rt.remittanceRepo.listByOrgId(DEMO_ORG_ID);
  const ledgerEntries = await rt.ledger.listEntries();
  const recon = await rt.reconciliation.runOnce();
  const auditVerifications = await rt.disclosures.verifyScopedRecordsAsAuditor({
    grantId: rt.defaultGrantId,
    auditorPrivateKeyHex: rt.auditorKeys.privateKeyHex,
  });

  const auditLog = rt.disclosures.getAuditLog();
  const anchoredRoots = rt.chain.getAnchoredRoots();
  const latestRootFromChainOrLog =
    anchoredRoots[anchoredRoots.length - 1] ?? auditLog[auditLog.length - 1]?.hash ?? null;

  return {
    network: {
      mode: rt.networkMode,
      rpcUrl: rt.rpcUrl,
      escrowContractId: rt.escrowContractId,
      usdcContractId: rt.usdcContractId,
      explorerBaseUrl: rt.explorerBaseUrl,
    },
    organization: {
      id: DEMO_ORG_ID,
      name: "Atelier Sari Global Ltd.",
      nearAccount: "atelier-sari.ledgerly.testnet",
      publicKeyShort: `${rt.orgKeys.publicKeyHex.slice(0, 18)}…${rt.orgKeys.publicKeyHex.slice(-8)}`,
    },
    paymentRequests: prs.map((p) => {
      const s = p.aggregate.snapshot();
      const latestTx = s.payments[s.payments.length - 1]?.txHash ?? null;
      return {
        id: s.id,
        escrowId: s.escrowId,
        status: s.status,
        amountDecimal: s.amount.toDecimalString(),
        receivedDecimal: p.aggregate.received().toDecimalString(),
        remainingDecimal: p.aggregate.remaining().toDecimalString(),
        excessDecimal: p.aggregate.excess().toDecimalString(),
        heldDecimal: p.aggregate.held().toDecimalString(),
        commitment: p.envelope.commitment,
        cipherPreview: `${p.envelope.ciphertextHex.slice(0, 24)}…`,
        paymentsCount: s.payments.length,
        latestTxHash: latestTx,
        createdAtIso: p.createdAt.toISOString(),
      };
    }),
    remittances: rms.map((r) => {
      const s = r.aggregate.snapshot();
      return {
        id: s.id,
        escrowId: s.escrowId,
        status: s.status,
        sourceDecimal: s.quote.source.toDecimalString(),
        feeDecimal: s.quote.fee.toDecimalString(),
        targetDecimal: s.quote.target.toDecimalString(),
        targetCurrency: s.quote.targetCurrency,
        recipientType: s.recipient.type,
        country: s.recipient.country,
        attempts: s.attempts,
        payoutRef: s.payoutRef,
        lastFailureCode: s.lastFailureCode,
        commitment: r.envelope.commitment,
        createdAtIso: r.createdAt.toISOString(),
      };
    }),
    audit: {
      grantId: rt.defaultGrantId,
      auditorKeyShort: `${rt.auditorKeys.publicKeyHex.slice(0, 18)}…${rt.auditorKeys.publicKeyHex.slice(-8)}`,
      chainValid: verifyAuditChain(auditLog),
      anchoredRootsCount: Math.max(anchoredRoots.length, auditLog.length),
      latestAnchoredRoot: latestRootFromChainOrLog,
      records: auditVerifications.ok ? auditVerifications.value : [],
      auditLog,
    },
    reconciliation: {
      checkedCount: recon.checkedCount,
      discrepancies: recon.discrepancies.map((d) => ({
        ...d,
        expectedHeldMinor: d.expectedHeldMinor.toString(),
        onchainHeldMinor: d.onchainHeldMinor.toString(),
      })),
    },
    ledger: {
      entriesCount: ledgerEntries.length,
      csv: exportLedgerToCsv(ledgerEntries),
    },
  };
}
