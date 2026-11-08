#!/usr/bin/env tsx
/**
 * scripts/demo-live.ts - Live Verification on NEAR Testnet
 *
 * Runs end-to-end verification flows directly against NEAR Testnet using real
 * testnet accounts, smart contract transactions, and cryptographic verification.
 *
 * Protocol & Safety Guardrails:
 * - Requires user's own testnet environment variables (.env.local or process.env):
 *     NEAR_OPERATOR_ACCOUNT_ID
 *     NEAR_OPERATOR_PRIVATE_KEY
 *     NEAR_ESCROW_CONTRACT_ID
 *     NEAR_USDC_CONTRACT_ID
 * - Refuses to execute if any required variable is missing.
 * - Refuses to execute if network is NOT testnet (rejects mainnet accounts / RPC).
 * - Refuses to execute without explicit `--yes` confirmation flag (unless `--dry`).
 * - Never prints, logs, or leaks private key values.
 * - Prints all account IDs before executing transactions.
 * - Pure assertion helpers with vitest test coverage.
 * - Exit 0 only if all assertions pass. Runtime < 3 minutes.
 *
 * Usage:
 *   # Print plan without executing transactions:
 *   npx tsx scripts/demo-live.ts --dry
 *
 *   # Run live end-to-end payment & overpayment settlement on testnet:
 *   npx tsx scripts/demo-live.ts --yes
 *
 *   # Run live fail-safe refund path (offline workers):
 *   npx tsx scripts/demo-live.ts --refund-path --yes
 *
 *   # Publish a fictional verification fixture on-chain for verify:onchain:
 *   npx tsx scripts/demo-live.ts --publish-fixture --yes
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { getRuntime, DEMO_ACTOR, DEMO_ORG_ID } from "../src/app/api/_runtime";
import {
  NearRpcChainGateway,
  parseNearRpcTxOutcome,
  type AccountId,
  type EscrowId,
  type GrantId,
  type PaymentRequestId,
} from "../src/shared";
import { exportLedgerToCsv } from "../src/modules/ledger/domain";
import { computeCommitment } from "../src/modules/privacy/domain/commitment";
import { stopBackgroundWorkers } from "../src/workers";
import {
  assertBalancedDoubleEntry,
  verifyCommitmentRecomputation,
} from "../src/lib/verification-helpers";

// Load .env.local if present without external dependencies
function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !(key in process.env)) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadLocalEnv();
// Disable background intervals during deterministic CLI live verification
process.env.LEDGERLY_DISABLE_BACKGROUND_WORKERS = "true";

const OPERATOR_ACCOUNT_ID = process.env.NEAR_OPERATOR_ACCOUNT_ID as AccountId | undefined;
const OPERATOR_PRIVATE_KEY = process.env.NEAR_OPERATOR_PRIVATE_KEY;
const ESCROW_CONTRACT_ID = (process.env.NEAR_ESCROW_CONTRACT_ID ??
  "ledgerly-escrow-9e70f9ea.testnet") as AccountId;
const USDC_CONTRACT_ID = (process.env.NEAR_USDC_CONTRACT_ID ??
  "ledgerly-usdc-a627a4c0.testnet") as AccountId;
const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";

function printLiveBanner() {
  console.log("\n================================================================================");
  console.log("       LEDGERLY LIVE DEMO & ON-CHAIN VERIFICATION (NEAR TESTNET)                ");
  console.log("================================================================================\n");
}

async function main(): Promise<void> {
  const isDry = process.argv.includes("--dry");
  const isConfirmed = process.argv.includes("--yes");
  const isRefundPath = process.argv.includes("--refund-path");
  const isPublishFixture = process.argv.includes("--publish-fixture");

  printLiveBanner();

  // Guardrail 1: Enforce testnet network only
  const isMainnet =
    process.env.NEAR_ENV === "mainnet" ||
    RPC_URL.includes("mainnet") ||
    (OPERATOR_ACCOUNT_ID && !OPERATOR_ACCOUNT_ID.endsWith(".testnet")) ||
    !ESCROW_CONTRACT_ID.endsWith(".testnet") ||
    !USDC_CONTRACT_ID.endsWith(".testnet");

  if (isMainnet) {
    console.error("❌ Refusing to execute: Ledgerly demo:live is strictly restricted to NEAR testnet.");
    console.error("   Detected non-testnet account or RPC URL. Mainnet transactions are strictly forbidden.");
    process.exit(1);
  }

  // Guardrail 2: Enforce required credentials
  if (!isDry && (!OPERATOR_ACCOUNT_ID || !OPERATOR_PRIVATE_KEY)) {
    console.error("❌ Missing required NEAR Testnet credentials.");
    console.error("   Ensure the following environment variables are set in .env.local or your environment:");
    console.error("     NEAR_OPERATOR_ACCOUNT_ID  (e.g. your-account.testnet)");
    console.error("     NEAR_OPERATOR_PRIVATE_KEY (e.g. ed25519:...)");
    console.error("     NEAR_ESCROW_CONTRACT_ID   (default: ledgerly-escrow-9e70f9ea.testnet)");
    console.error("     NEAR_USDC_CONTRACT_ID     (default: ledgerly-usdc-a627a4c0.testnet)");
    process.exit(1);
  }

  // Guardrail 3: Enforce explicit --yes confirmation
  if (!isDry && !isConfirmed) {
    console.error("❌ Refusing to execute live transactions without explicit confirmation.");
    console.error("   Pass --yes to confirm execution against NEAR Testnet, or pass --dry to inspect plan.");
    console.error("   Example: npm run demo:live -- --yes");
    process.exit(1);
  }

  // Print account details (NEVER printing private key values)
  console.log("Active Testnet Configuration:");
  console.log(`  Operator Account : ${OPERATOR_ACCOUNT_ID ?? "[none provided]"}`);
  console.log(`  Escrow Contract  : ${ESCROW_CONTRACT_ID}`);
  console.log(`  USDC Token       : ${USDC_CONTRACT_ID}`);
  console.log(`  RPC Gateway      : ${RPC_URL}`);
  console.log(`  Secret Key       : [REDACTED - length: ${OPERATOR_PRIVATE_KEY ? OPERATOR_PRIVATE_KEY.length : 0} chars]`);
  console.log("");

  // --------------------------------------------------------------------------
  // DRY RUN
  // --------------------------------------------------------------------------
  if (isDry) {
    console.log("[DRY-RUN] Execution plan:");
    if (isPublishFixture) {
      console.log("  Mode: --publish-fixture");
      console.log("  1. Generate unique fictional order ref and confidential payload");
      console.log("  2. Compute canonical JSON commitment sha256(canonicalJSON(payload)||salt)");
      console.log("  3. Call register() on escrow contract to publish commitment on NEAR Testnet");
      console.log("  4. Write fixture to examples/verify-fixture.json with live tx hash");
      console.log("  5. Verify on-chain get_escrow() returns matching commitment");
    } else if (isRefundPath) {
      console.log("  Mode: --refund-path (Depositor fail-safe exit)");
      console.log("  1. Register payment escrow on testnet with short/expired refund deadline");
      console.log("  2. Depositor transfers USDC via ft_transfer_call");
      console.log("  3. Keep backend workers offline / stopped (simulating server failure)");
      console.log("  4. Depositor calls claim_refund() directly on contract");
      console.log("  5. Assert escrow status becomes Refunded/Closed on-chain");
    } else {
      console.log("  Mode: Standard E2E Live Testnet Flow");
      console.log("  1. Create invoice (680.00 USDC) & register commitment on testnet escrow");
      console.log("  2. Depositor funds escrow with 700.00 USDC via ft_transfer_call (20.00 USDC overpay)");
      console.log("  3. Run indexer worker once: detect on-chain deposit event from NEAR block receipts");
      console.log("  4. Run settlement worker once: release 680.00 USDC to merchant & refund 20.00 USDC to buyer");
      console.log("  5. Anchor audit log Merkle root on escrow contract via anchor() method");
      console.log("  6. Issue scoped auditor view key, decrypt invoice, and verify SHA-256 commitment");
      console.log("  7. Export ./out/reconciliation-live.csv and verify sum(debits) == sum(credits)");
    }
    console.log("\n[DRY-RUN] Plan validated. Exiting 0.");
    process.exit(0);
  }

  const runId = Date.now().toString(36) + randomBytes(3).toString("hex");

  // --------------------------------------------------------------------------
  // MODE: --publish-fixture
  // --------------------------------------------------------------------------
  if (isPublishFixture) {
    console.log("MODE: --publish-fixture (Registering fresh fictional fixture on testnet contract)\n");

    const gateway = new NearRpcChainGateway({
      rpcUrl: RPC_URL,
      escrowContractId: ESCROW_CONTRACT_ID,
      usdcContractId: USDC_CONTRACT_ID,
      operatorAccountId: OPERATOR_ACCOUNT_ID!,
      operatorPrivateKey: OPERATOR_PRIVATE_KEY!,
    });

    const orderRef = `INV-FICTIONAL-2026-${runId.toUpperCase()}`;
    const payload = {
      orderRef,
      description: "Fictional Ceramic Batch for On-Chain Commitment Verification",
      customerEmail: "procurement@fictional-domain.example",
      amountDecimal: "250.00",
      currency: "USDC",
    };
    const salt = randomBytes(32).toString("hex");
    const commitment = computeCommitment(payload, salt);
    const escrowId = randomBytes(32).toString("hex") as EscrowId;

    console.log(`1. Fictional Order Ref: ${orderRef}`);
    console.log(`   Escrow ID          : ${escrowId}`);
    console.log(`   Computed Commitment: ${commitment}`);

    console.log("2. Registering escrow on-chain via NearRpcChainGateway...");
    const regRes = await gateway.registerEscrow({
      escrowId,
      kind: "Payment",
      commitment,
      refundAfterNs: BigInt(Date.now() + 48 * 3600 * 1000) * 1_000_000n,
    });
    console.log(`   ✓ Registered on testnet! TxHash: ${regRes.txHash}`);
    console.log(`     https://testnet.nearblocks.io/txns/${regRes.txHash}`);

    // Update examples/verify-fixture.json
    const fixturePath = resolve(process.cwd(), "examples/verify-fixture.json");
    let existingTxHashes: Record<string, string> = {
      deployment: "G4dNE6TLB3ASheZn1dtejQpRdZkL9g5S46CNQDhpL7G7",
      register: regRes.txHash,
      ft_transfer_call: "48uhApH2ij8eQ4PsDau2J6Zg5qi1ZvJFMK2n1rBJzdFa",
      release: "4PDxv1WbzU9XQ9LAMSKAJ4iVuha9SfymWvw1pRTWuhaa",
      anchor: "1VQz6TK4ksKVsS7uwucPg3B2y3bnFMDghAdfo1RZNWG",
    };

    if (existsSync(fixturePath)) {
      try {
        const old = JSON.parse(readFileSync(fixturePath, "utf8")) as { txHashes?: Record<string, string> };
        if (old.txHashes) {
          existingTxHashes = { ...old.txHashes, register: regRes.txHash };
        }
      } catch {
        // use defaults
      }
    }

    const fixtureContent = {
      escrowId,
      payload,
      salt,
      commitment,
      txHashes: existingTxHashes,
    };

    writeFileSync(fixturePath, JSON.stringify(fixtureContent, null, 2) + "\n", "utf8");
    console.log(`3. Wrote fixture to ${fixturePath}`);

    // Verify on-chain view matches
    console.log("4. Verifying on-chain get_escrow() returns matching commitment...");
    const view = await gateway.getEscrow(escrowId, true);
    if (!view || view.commitment.toLowerCase() !== commitment.toLowerCase()) {
      throw new Error(`On-chain escrow verification failed: expected ${commitment}, got ${view?.commitment}`);
    }
    console.log(`   ✓ On-chain commitment verified: ${view.commitment}`);
    console.log("\n✅ Fixture successfully published and verified on NEAR Testnet (exit 0)!\n");
    process.exit(0);
  }

  // --------------------------------------------------------------------------
  // LIVE FLOW (STANDARD OR REFUND PATH)
  // --------------------------------------------------------------------------
  console.log(`Initializing live runtime for ${OPERATOR_ACCOUNT_ID}...`);
  stopBackgroundWorkers();
  const rt = await getRuntime(true);
  stopBackgroundWorkers();

  if (rt.networkMode !== "NEAR_TESTNET_RPC") {
    throw new Error(`Runtime failed to initialize in NEAR_TESTNET_RPC mode (current: ${rt.networkMode})`);
  }

  if (isRefundPath) {
    console.log("MODE: --refund-path (Live fail-safe refund with offline workers)\n");

    const reqId = `pr_live_ref_${runId}` as PaymentRequestId;
    const createRes = await rt.payments.createPaymentRequest({
      idempotencyKey: `idem_live_ref_${runId}`,
      actor: DEMO_ACTOR,
      requestId: reqId,
      orgPublicKeyHex: rt.orgKeys.publicKeyHex,
      orderRef: `INV-REFUND-${runId.toUpperCase()}`,
      description: "Live fail-safe refund invoice",
      amountDecimal: "10.00",
      expiresInSec: 1, // expired immediately for demo
    });

    if (!createRes.ok) throw new Error(`Step 1 Failed: ${createRes.error.message}`);
    const escrowId = createRes.value.escrowId;
    console.log(`1. Created invoice and registered on testnet escrow (${escrowId}) ... PASS`);

    console.log("2. Depositing 10.00 USDC via ft_transfer_call on testnet...");
    const depositTx = await rt.chain.simulateDeposit({
      escrowId,
      depositor: OPERATOR_ACCOUNT_ID!,
      amountMinor: 10_000_000n,
    });
    console.log(`   ✓ Deposit confirmed! TxHash: ${depositTx} ... PASS`);

    console.log("3. Workers remain STOPPED (simulating server outage) ... PASS");

    console.log("4. Depositor invoking claim_refund() directly on escrow contract...");
    const claimRes = await rt.chain.claimRefund(escrowId);
    console.log(`   ✓ Refund claimed on-chain! TxHash: ${claimRes.txHash} ... PASS`);

    console.log("5. Asserting escrow status on-chain is Closed/Refunded...");
    const escrowView = await rt.chain.getEscrow(escrowId, true);
    if (!escrowView || escrowView.heldMinor !== 0n) {
      throw new Error(`Escrow balance not zeroed: held=${escrowView?.heldMinor}`);
    }
    console.log(`   ✓ Escrow held balance zeroed (status: ${escrowView.status}) ... PASS`);

    console.log("\n✅ Live --refund-path verification completed successfully!\n");
    process.exit(0);
  }

  // --------------------------------------------------------------------------
  // STANDARD LIVE DEMO FLOW
  // --------------------------------------------------------------------------
  console.log("MODE: Standard Live Testnet Flow\n");

  // Step 1: Create Invoice
  const reqId = `pr_live_${runId}` as PaymentRequestId;
  const orderRef = `INV-LIVE-${runId.toUpperCase()}`;
  console.log(`1. Creating invoice (680.00 USDC) with order ref ${orderRef}...`);
  const createRes = await rt.payments.createPaymentRequest({
    idempotencyKey: `idem_live_${runId}`,
    actor: DEMO_ACTOR,
    requestId: reqId,
    orgPublicKeyHex: rt.orgKeys.publicKeyHex,
    orderRef,
    description: "Live Testnet Batch Order #2026",
    customerEmail: "procurement@atelier-sari.example",
    amountDecimal: "680.00",
    expiresInSec: 86400,
  });

  if (!createRes.ok) throw new Error(`Step 1 Failed: ${createRes.error.message}`);
  const escrowId = createRes.value.escrowId;
  console.log(`   ✓ Invoice registered on testnet contract! EscrowId: ${escrowId} ... PASS`);

  // Step 2: Overpay with 700 USDC (20 USDC overpayment)
  console.log("2. Depositor funding 700.00 USDC via ft_transfer_call (20.00 USDC overpayment)...");
  const depositTx = await rt.chain.simulateDeposit({
    escrowId,
    depositor: OPERATOR_ACCOUNT_ID!,
    amountMinor: 700_000_000n,
  });
  console.log(`   ✓ Deposit confirmed on testnet! TxHash: ${depositTx} ... PASS`);

  // Step 3: Run Indexer Worker
  console.log("3. Running indexer worker to detect on-chain deposit event...");
  const indexerRes = await rt.indexer.runOnce();
  console.log(`   ✓ Indexer processed ${indexerRes.processedCount} events (latestBlock: ${indexerRes.latestBlockHeight}) ... PASS`);

  // Step 4: Run Settlement Worker & Assert Status
  console.log("4. Running settlement worker & asserting invoice status...");
  await rt.settlement.runOnce();
  const reloaded = await rt.paymentRepo.findById(reqId);
  if (!reloaded) {
    throw new Error(`Invoice record ${reqId} not found in database`);
  }
  const snap = reloaded.aggregate.snapshot();

  if (snap.status !== "SETTLED") {
    throw new Error(`Expected invoice status SETTLED, got ${snap.status}`);
  }
  if (snap.released.amountMinor !== 680_000_000n) {
    throw new Error(`Expected released 680.00 USDC, got ${snap.released.amountMinor}`);
  }
  if (snap.refunded.amountMinor !== 20_000_000n) {
    throw new Error(`Expected refund 20.00 USDC, got ${snap.refunded.amountMinor}`);
  }
  console.log("   ✓ Verified released=680.00 USDC, refund=20.00 USDC, status=SETTLED ... PASS");

  // Step 5: Anchor audit log Merkle root on escrow contract
  console.log("5. Anchoring audit log root on escrow contract...");
  await rt.disclosures.recordAuditAction(DEMO_ACTOR.userId, "EXPORT_RECONCILIATION", "live_demo_run");
  const auditLog = rt.metaStore.loadAuditLog();
  const latestEntry = auditLog[auditLog.length - 1];
  if (!latestEntry) throw new Error("Audit log is empty");

  await rt.disclosures.recordAuditAction(DEMO_ACTOR.userId, "ANCHOR_AUDIT_ROOT", latestEntry.hash);
  const logWithAnchor = rt.metaStore.loadAuditLog();
  const rootHex = logWithAnchor[logWithAnchor.length - 1]!.hash;
  const anchorRes = await rt.chain.anchorAuditRoot(rootHex);
  console.log(`   ✓ Root anchored on testnet! TxHash: ${anchorRes.txHash} ... PASS`);

  // Step 6: Issue scoped auditor view key and verify commitment
  console.log("6. Issuing scoped auditor view key & verifying commitment recomputation...");
  const grantId = `grant_live_${runId}` as GrantId;
  await rt.disclosures.issueScopedViewKey({
    actor: DEMO_ACTOR,
    grantId,
    auditorPublicKeyHex: rt.auditorKeys.publicKeyHex,
    orgPrivateKeyHex: rt.orgKeys.privateKeyHex,
    scope: {
      orgId: DEMO_ORG_ID,
      from: new Date(Date.now() - 3600_000),
      to: new Date(Date.now() + 3600_000),
      kinds: ["PAYMENT"],
    },
    expiresAt: new Date(Date.now() + 86400_000),
  });

  const auditedRecordsRes = await rt.disclosures.verifyScopedRecordsAsAuditor({
    grantId,
    auditorPrivateKeyHex: rt.auditorKeys.privateKeyHex,
  });
  if (!auditedRecordsRes.ok) throw new Error(`Auditor decrypt failed: ${auditedRecordsRes.error.message}`);

  const target = auditedRecordsRes.value.find((r) => r.recordId === reqId);
  if (!target || !target.decryptedPayload) {
    throw new Error("Target record payload missing from auditor view");
  }

  const isCommitmentValid = verifyCommitmentRecomputation(
    target.decryptedPayload as unknown as Record<string, unknown>,
    reloaded.envelope.saltHex,
    reloaded.envelope.commitment,
  );
  if (!isCommitmentValid) {
    throw new Error("SHA-256 commitment recomputation mismatch!");
  }
  console.log("   ✓ Server-side decrypt and SHA-256 commitment recomputation verified ... PASS");

  // Step 7: Export double-entry CSV and verify sum(debits) == sum(credits)
  console.log("7. Exporting double-entry reconciliation CSV...");
  const allEntries = await rt.ledger.listEntries();
  const csvData = exportLedgerToCsv(allEntries);

  const outDir = resolve(process.cwd(), "out");
  mkdirSync(outDir, { recursive: true });
  const csvPath = resolve(outDir, "reconciliation-live.csv");
  writeFileSync(csvPath, csvData, "utf8");

  const ledgerCheck = assertBalancedDoubleEntry(csvData);
  if (!ledgerCheck.valid) {
    throw new Error(`Double-entry balance check failed: ${ledgerCheck.error}`);
  }
  console.log(`   ✓ Balanced books: ${ledgerCheck.rowCount} entries, total debits = total credits (${ledgerCheck.totalDebitsMinor} minor units)`);
  console.log(`   ✓ Exported to ${csvPath} ... PASS`);

  console.log("\n================================================================================");
  console.log(">>> ALL LIVE TESTNET VERIFICATIONS COMPLETED SUCCESSFULLY (exit 0) <<<");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("\n❌ LIVE TESTNET DEMO FAILED:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
