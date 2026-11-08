import { describe, expect, it } from "vitest";
import {
  SEED_DISPLAY_VALUES,
  SEED_INVOICES,
  SEED_OPEN_ESCROW_USDC,
  SEED_REMITTANCES,
  SEED_SETTLED_CHECKOUT_USDC,
  SEED_SETTLED_REMITTANCE_USDC,
  SEED_TOTAL_SETTLED_USDC,
} from "@/lib/seed-data";
import { getRuntime } from "@/app/api/_runtime";
import { inspectAuditChain } from "@/modules/privacy/domain";

describe("Task E - Single Source of Truth & Seed Consistency", () => {
  it("recomputes settled totals strictly matching displayed aggregates", () => {
    // 1. Recompute checkout volume from individual seed invoices
    const computedCheckoutSettled = SEED_INVOICES
      .filter((i) => i.status === "SETTLED")
      .reduce((sum, i) => sum + Number(i.amountDecimal), 0);

    expect(computedCheckoutSettled).toBe(2040.00);
    expect(computedCheckoutSettled).toBe(SEED_SETTLED_CHECKOUT_USDC);

    // 2. Recompute remittance volume from individual seed remittances
    const computedRemittanceSettled = SEED_REMITTANCES
      .filter((r) => r.status === "SETTLED")
      .reduce((sum, r) => sum + Number(r.sourceUsdcDecimal), 0);

    expect(computedRemittanceSettled).toBe(2350.00);
    expect(computedRemittanceSettled).toBe(SEED_SETTLED_REMITTANCE_USDC);

    // 3. Settled balance = checkout + remitted
    const computedTotalSettled = computedCheckoutSettled + computedRemittanceSettled;
    expect(computedTotalSettled).toBe(4390.00);
    expect(computedTotalSettled).toBe(SEED_TOTAL_SETTLED_USDC);

    // 4. Open escrow
    const computedOpenEscrow = SEED_INVOICES
      .filter((i) => i.status === "OPEN")
      .reduce((sum, i) => sum + Number(i.amountDecimal), 0);

    expect(computedOpenEscrow).toBe(420.00);
    expect(computedOpenEscrow).toBe(SEED_OPEN_ESCROW_USDC);

    // 5. Display strings
    expect(SEED_DISPLAY_VALUES.settledBalanceFormatted).toBe("4,390.00 USDC");
    expect(SEED_DISPLAY_VALUES.subtitle).toBe(
      "2,040 checkout · 2,350 remitted · Balanced books",
    );
  });

  it("seeded runtime database matches seed dataset and maintains a valid audit chain", async () => {
    const rt = await getRuntime(true);

    const prs = await rt.paymentRepo.listAll();
    const rms = await rt.remittanceRepo.listAll();

    expect(prs.length).toBe(4);
    expect(rms.length).toBe(4);

    // 3 settled invoices + 1 open invoice
    const settledPrs = prs.filter((p) => p.aggregate.snapshot().status === "SETTLED");
    const openPrs = prs.filter((p) => p.aggregate.snapshot().status === "OPEN");
    expect(settledPrs.length).toBe(3);
    expect(openPrs.length).toBe(1);

    // Overpayment invoice verification (INV-2026-8844)
    const overpaidPr = prs.find((p) => p.aggregate.id === "pr_inv_8844");
    expect(overpaidPr).toBeDefined();
    expect(overpaidPr?.aggregate.snapshot().status).toBe("SETTLED");
    expect(overpaidPr?.aggregate.received().toDecimalString()).toBe("265.000000");
    expect(overpaidPr?.aggregate.snapshot().refunded.toDecimalString()).toBe("25.000000");

    // 3 settled remittances + 1 expired quote
    const settledRms = rms.filter((r) => r.aggregate.snapshot().status === "SETTLED");
    const expiredRms = rms.filter((r) => r.aggregate.snapshot().status === "EXPIRED");
    expect(settledRms.length).toBe(3);
    expect(expiredRms.length).toBe(1);

    // Audit chain verification
    const auditLog = rt.metaStore.loadAuditLog();
    expect(auditLog.length).toBeGreaterThanOrEqual(3);

    const inspection = inspectAuditChain(auditLog);
    expect(inspection.valid).toBe(true);
    expect(inspection.brokenAtIndex).toBeFalsy();

    // Check on-chain root anchored
    const anchoredRoots = rt.chain.getAnchoredRoots();
    expect(anchoredRoots.length).toBeGreaterThanOrEqual(1);
    expect(anchoredRoots[anchoredRoots.length - 1]).toBe(auditLog[auditLog.length - 1]?.hash);
  });
});
