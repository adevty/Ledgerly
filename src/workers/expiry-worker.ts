import type { ChainGateway, Clock } from "@/shared";
import type { PaymentRequestRepository } from "@/modules/payments/domain";
import type { RemittanceRepository } from "@/modules/remittance/domain";

/**
 * ExpiryWorker (Tahap 3 §3 & Tahap 4 §6).
 *
 * Responsibilities:
 * 1. Expire `OPEN` payment requests past `expiresAt` (`OPEN -> EXPIRED`).
 * 2. Expire `PARTIALLY_PAID` payment requests past `expiresAt` (`PARTIALLY_PAID -> REFUNDING -> REFUNDED`)
 *    and automatically refund the buyer's partial deposit from the escrow contract.
 * 3. Expire `QUOTED` remittances whose FX rate lock (`lockedUntil`) has elapsed (`QUOTED -> EXPIRED`).
 */
export class ExpiryWorker {
  constructor(
    private readonly deps: {
      paymentRepo: PaymentRequestRepository;
      remittanceRepo: RemittanceRepository;
      chain: ChainGateway;
      clock: Clock;
    },
  ) {}

  async runOnce(): Promise<{
    expiredRequests: number;
    refundedPartialRequests: number;
    expiredQuotes: number;
  }> {
    const now = this.deps.clock.now();
    let expiredRequests = 0;
    let refundedPartialRequests = 0;
    let expiredQuotes = 0;

    const requests = await this.deps.paymentRepo.listAll();
    for (const stored of requests) {
      const pr = stored.aggregate;
      const before = pr.status;
      if (before !== "OPEN" && before !== "PARTIALLY_PAID") {
        continue;
      }

      const expRes = pr.expire(now);
      if (!expRes.ok || pr.status === before) {
        continue;
      }

      if (pr.status === "EXPIRED") {
        expiredRequests += 1;
        await this.deps.paymentRepo.save(pr);
      } else if (pr.status === "REFUNDING") {
        const heldAmount = pr.held();
        if (!heldAmount.isZero()) {
          await this.deps.chain.refund({
            escrowId: pr.escrowId,
            amountMinor: heldAmount.amountMinor,
          });
          pr.confirmRefund(heldAmount, now);
        }
        refundedPartialRequests += 1;
        await this.deps.paymentRepo.save(pr);
      }
    }

    const remittances = await this.deps.remittanceRepo.listAll();
    for (const stored of remittances) {
      const rm = stored.aggregate;
      if (rm.status !== "QUOTED") continue;
      const expRes = rm.expireQuote(now);
      if (expRes.ok && expRes.value === "EXPIRED") {
        expiredQuotes += 1;
        await this.deps.remittanceRepo.save(rm);
      }
    }

    return { expiredRequests, refundedPartialRequests, expiredQuotes };
  }
}
