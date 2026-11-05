import type { RemittanceRepository } from "@/modules/remittance/domain";
import type { RemittanceUseCases } from "@/modules/remittance/application/use-cases";

/**
 * SettlementWorker (Tahap 3 §3 & Tahap 4 §5.2).
 *
 * Scans remittances stuck in `PAYOUT_FAILED` (transient off-ramp errors under
 * `MAX_PAYOUT_ATTEMPTS`) and retries payout via `RemittanceUseCases.retryPayout`.
 * If attempts are exhausted, `RemittanceUseCases` automatically triggers an
 * on-chain escrow refund back to the sender.
 */
export class SettlementWorker {
  constructor(
    private readonly deps: {
      remittanceRepo: RemittanceRepository;
      remittances: RemittanceUseCases;
    },
  ) {}

  async runOnce(): Promise<{ retriedCount: number; settledCount: number; refundedCount: number }> {
    const all = await this.deps.remittanceRepo.listAll();
    let retriedCount = 0;
    let settledCount = 0;
    let refundedCount = 0;

    for (const stored of all) {
      if (stored.aggregate.status !== "PAYOUT_FAILED") {
        continue;
      }
      retriedCount += 1;
      const res = await this.deps.remittances.retryPayout(stored.aggregate.id);
      if (res.ok) {
        if (res.value.status === "SETTLED") settledCount += 1;
        if (res.value.status === "REFUNDED") refundedCount += 1;
      }
    }

    return { retriedCount, settledCount, refundedCount };
  }
}
