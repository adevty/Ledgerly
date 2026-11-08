#!/usr/bin/env tsx
/**
 * CLI script to seed or reset the Ledgerly SQLite database with realistic demo data.
 * Usage:
 *   npx tsx scripts/seed.ts         # Seeds if not already seeded
 *   npx tsx scripts/seed.ts --reset # Wipes and reseeds (refuses in production)
 */

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { getRuntime, resetRuntime } from "../src/app/api/_runtime";
import { inspectAuditChain } from "../src/modules/privacy/domain";

async function main() {
  const isReset = process.argv.includes("--reset");

  console.log("=================================================");
  console.log("  Ledgerly Demo Environment Seeder");
  console.log("=================================================");

  if (isReset) {
    if (process.env.NODE_ENV === "production") {
      console.error("\n❌ REFUSED: Cannot run seed:reset when NODE_ENV=production!");
      process.exit(1);
    }

    console.log("\n[1/3] Wiping existing SQLite database files...");
    const dbDir = resolve(process.cwd(), ".data");
    const targets = [
      resolve(dbDir, "ledgerly.sqlite"),
      resolve(dbDir, "ledgerly.sqlite-wal"),
      resolve(dbDir, "ledgerly.sqlite-shm"),
    ];

    for (const target of targets) {
      if (existsSync(target)) {
        rmSync(target, { force: true });
        console.log(`  - Removed ${target}`);
      }
    }
    resetRuntime();
  }

  console.log("\n[2/3] Initializing runtime & executing deterministic seed...");
  const rt = await getRuntime(true);

  console.log("\n[3/3] Verifying generated dataset & audit chain...");
  const prs = await rt.paymentRepo.listAll();
  const rms = await rt.remittanceRepo.listAll();
  const auditLog = rt.metaStore.loadAuditLog();
  const inspection = inspectAuditChain(auditLog);
  const anchoredRoots = rt.chain.getAnchoredRoots();

  const settledMerchantUsdc = prs
    .filter((p) => p.aggregate.snapshot().status === "SETTLED")
    .reduce((acc, p) => acc + Number(p.aggregate.snapshot().amount.toDecimalString()), 0);

  const settledRemittanceUsdc = rms
    .filter((r) => r.aggregate.snapshot().status === "SETTLED")
    .reduce((acc, r) => acc + Number(r.aggregate.snapshot().quote.source.toDecimalString()), 0);

  const totalSettled = settledMerchantUsdc + settledRemittanceUsdc;

  console.log("\n-------------------------------------------------");
  console.log("  Seed Summary & Mathematical Verification");
  console.log("-------------------------------------------------");
  console.log(`  Invoices Total:        ${prs.length} (3 Settled, 1 Open)`);
  console.log(`  Settled Checkout:      ${settledMerchantUsdc.toFixed(2)} USDC`);
  console.log(`  Remittances Total:      ${rms.length} (3 Settled, 1 Expired)`);
  console.log(`  Settled Remittances:   ${settledRemittanceUsdc.toFixed(2)} USDC`);
  console.log(`  Total Settled Balance: ${totalSettled.toFixed(2)} USDC (Target: 4,390.00 USDC)`);
  console.log(`  Audit Log Entries:     ${auditLog.length}`);
  console.log(`  Audit Chain Valid:     ${inspection.valid ? "✅ YES" : "❌ BROKEN"}`);
  console.log(`  Anchored Root on NEAR: ${anchoredRoots[anchoredRoots.length - 1] ?? "None"}`);
  console.log("-------------------------------------------------\n");

  if (!inspection.valid) {
    console.error("❌ ERROR: Generated audit chain failed integrity verification!");
    process.exit(1);
  }

  if (totalSettled !== 4390) {
    console.error(`❌ ERROR: Settled balance mismatch! Expected 4,390.00, got ${totalSettled}`);
    process.exit(1);
  }

  console.log("✅ Seed completed successfully!");
}

main().catch((err) => {
  console.error("Fatal seed failure:", err);
  process.exit(1);
});
