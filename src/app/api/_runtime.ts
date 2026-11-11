import {
  InMemoryOutbox,
  MockChainGateway,
  MockFxAdapter,
  MockOffRampAdapter,
  MockScreeningAdapter,
  NearRpcChainGateway,
  openLedgerlySqliteDb,
  RealFxAdapter,
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
import {
  generateX25519KeyPair,
  inspectAuditChain,
  verifyAuditChain,
  type AuditChainVerificationResult,
  type KeyPairHex,
} from "@/modules/privacy/domain";
import { exportLedgerToCsv } from "@/modules/ledger/domain";
import { isRealNearTx } from "@/lib/validation";
import { PaymentUseCases } from "@/modules/payments/application/use-cases";
import { RemittanceUseCases } from "@/modules/remittance/application/use-cases";
import { DisclosureUseCases } from "@/modules/privacy/application/use-cases";
import type { Actor } from "@/modules/identity/domain";
import {
  ChainIndexerWorker,
  ExpiryWorker,
  ReconciliationWorker,
  SettlementWorker,
  startBackgroundWorkers,
} from "@/workers";
import { seedLedgerlyDataset } from "@/lib/seeder";

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
  readonly fx: RealFxAdapter;
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

export function getRuntime(forceFresh = false): Promise<LedgerlyRuntime> {
  if (!globalForLedgerly.__ledgerlyRuntime || forceFresh) {
    globalForLedgerly.__ledgerlyRuntime = createSeededRuntime();
  }
  return globalForLedgerly.__ledgerlyRuntime;
}

let cachedDashboardSnapshot: {
  data: DashboardSnapshot;
  cachedAt: number;
} | null = null;

export function resetRuntime(): void {
  globalForLedgerly.__ledgerlyRuntime = undefined;
  cachedDashboardSnapshot = null;
}

export function invalidateDashboardSnapshotCache(): void {
  cachedDashboardSnapshot = null;
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
  const operatorAccountId = (
    process.env.NEAR_OPERATOR_ACCOUNT_ID?.trim().replace(/^["']|["']$/g, "") || undefined
  ) as AccountId | undefined;
  const operatorPrivateKey =
    process.env.NEAR_OPERATOR_PRIVATE_KEY?.trim().replace(/^["']|["']$/g, "") || undefined;
  const explorerBaseUrl =
    process.env.NEAR_EXPLORER_BASE_URL ?? "https://testnet.nearblocks.io";

  const forceSandbox =
    process.env.LEDGERLY_NETWORK_MODE === "sandbox" ||
    process.env.LEDGERLY_FORCE_SANDBOX === "true" ||
    process.env.LOCAL_SANDBOX_SIMULATION === "true";

  // When operator credentials are provided and sandbox is not explicitly forced,
  // connect to live NEAR testnet RPC.
  const useLiveNearRpc =
    !forceSandbox &&
    Boolean(
      operatorAccountId &&
      operatorPrivateKey &&
      operatorPrivateKey.startsWith("ed25519:"),
    );

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
  const fx = new RealFxAdapter();
  const offRamp = new MockOffRampAdapter();
  const screening = new MockScreeningAdapter();

  const paymentRepo = new SqlitePaymentRequestRepository(db, outbox);
  const remittanceRepo = new SqliteRemittanceRepository(db, outbox);
  const grantRepo = new SqliteViewKeyGrantRepository(db, outbox);

  const defaultMerchantAccount = (
    useLiveNearRpc && operatorAccountId ? operatorAccountId : "atelier-sari.ledgerly.testnet"
  ) as AccountId;
  const defaultOffRampAccount = (
    useLiveNearRpc && operatorAccountId ? operatorAccountId : "offramp-pool.ledgerly.testnet"
  ) as AccountId;

  const payments = new PaymentUseCases({
    repo: paymentRepo,
    chain,
    ledger,
    idempotency,
    clock: systemClock,
    merchantNearAccounts: new Map([[DEMO_ORG_ID, defaultMerchantAccount]]),
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
    offRampSettlementAccount: defaultOffRampAccount,
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

  const alreadySeeded = metaStore.get<boolean>("seeded_v2") === true;
  let defaultGrantId =
    metaStore.get<GrantId>("default_grant_id") ?? ("grant_q4_external_audit" as GrantId);

  const runtimeInstance: LedgerlyRuntime = {
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

  if (!alreadySeeded) {
    try {
      await seedLedgerlyDataset(runtimeInstance);
      defaultGrantId = metaStore.get<GrantId>("default_grant_id") ?? defaultGrantId;
      runtimeInstance.defaultGrantId = defaultGrantId;
    } catch (seedErr) {
      console.warn("Runtime seed warning:", seedErr);
    }
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

  startBackgroundWorkers(runtimeInstance);
  return runtimeInstance;
}

async function computeDashboardSnapshot() {
  const rt = await getRuntime();
  await rt.indexer.runOnce();
  await rt.expiry.runOnce();
  const prs = await rt.paymentRepo.listByOrgId(DEMO_ORG_ID);
  const rms = await rt.remittanceRepo.listByOrgId(DEMO_ORG_ID);
  const ledgerEntries = await rt.ledger.listEntries();
  const recon = await rt.reconciliation.runOnce();
  const auditVerifications = await rt.disclosures.verifyScopedRecordsAsAuditor({
    grantId: rt.defaultGrantId,
    auditorPrivateKeyHex: rt.auditorKeys.privateKeyHex,
  });

  const auditLog = rt.metaStore.loadAuditLog();
  const anchoredRoots = rt.chain.getAnchoredRoots();
  const latestRootFromChainOrLog =
    anchoredRoots[anchoredRoots.length - 1] ?? auditLog[auditLog.length - 1]?.hash ?? null;
  const chainInspection = inspectAuditChain(auditLog);

  return {
    network: {
      mode: rt.networkMode,
      rpcUrl: rt.rpcUrl,
      escrowContractId: rt.escrowContractId,
      usdcContractId: rt.usdcContractId,
      explorerBaseUrl: rt.explorerBaseUrl,
      enableLiveIntents:
        process.env.ENABLE_LIVE_INTENTS === "true" || process.env.ENABLE_LIVE_INTENTS === "1",
    },
    organization: {
      id: DEMO_ORG_ID,
      name: "Atelier Sari Global Ltd.",
      nearAccount: "atelier-sari.ledgerly.testnet",
      publicKeyShort: `${rt.orgKeys.publicKeyHex.slice(0, 18)}…${rt.orgKeys.publicKeyHex.slice(-8)}`,
    },
    paymentRequests: prs.map((p) => {
      const s = p.aggregate.snapshot();
      const rawTx = s.payments[s.payments.length - 1]?.txHash ?? null;
      const latestTx = isRealNearTx(rawTx) ? rawTx : null;
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
        fundingTx: isRealNearTx(s.fundingTx) ? s.fundingTx : null,
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
      chainValid: chainInspection.valid,
      chainVerification: chainInspection,
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
    fxRates: await rt.fx.getLiveRates(),
  };
}

export type DashboardSnapshot = Awaited<ReturnType<typeof computeDashboardSnapshot>>;

export async function buildDashboardSnapshot(forceFresh = false): Promise<DashboardSnapshot> {
  const now = Date.now();
  if (!forceFresh && cachedDashboardSnapshot && now - cachedDashboardSnapshot.cachedAt < 3000) {
    return cachedDashboardSnapshot.data;
  }
  const data = await computeDashboardSnapshot();
  cachedDashboardSnapshot = { data, cachedAt: now };
  return data;
}
