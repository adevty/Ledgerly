import {
  Money,
  type ChainGateway,
  type Clock,
  type EscrowId,
  type OnchainEvent,
} from "@/shared";
import type { PaymentRequestRepository } from "@/modules/payments/domain";
import type { RemittanceRepository } from "@/modules/remittance/domain";
import type { PaymentUseCases } from "@/modules/payments/application/use-cases";
import type { RemittanceUseCases } from "@/modules/remittance/application/use-cases";

/**
 * ChainIndexerWorker (Tahap 3 §3 & Tahap 4 §5.3, §8).
 *
 * Responsibilities:
 * 1. Poll `ChainGateway.pollEvents(cursor)` for new NEP-297 contract events.
 * 2. Deduplicate events by `(txHash, logIndex)` so at-least-once delivery is
 *    effectively exactly-once.
 * 3. Route `OnchainDepositDetected` to `PaymentUseCases` or `RemittanceUseCases`.
 * 4. Reconcile external `OnchainRefundConfirmed` events (e.g., when a depositor
 *    calls `claim_refund` directly on-chain while the backend is down — AD-2, AD-9).
 */
export class ChainIndexerWorker {
  private cursorBlockHeight = 0n;
  private isRunning = false;
  private readonly processedEventIds = new Set<string>();
  private readonly inFlightEventIds = new Set<string>();

  constructor(
    private readonly deps: {
      chain: ChainGateway;
      paymentRepo: PaymentRequestRepository;
      remittanceRepo: RemittanceRepository;
      payments: PaymentUseCases;
      remittances: RemittanceUseCases;
      clock: Clock;
    },
  ) {}

  getCursor(): bigint {
    return this.cursorBlockHeight;
  }

  async runOnce(): Promise<{ processedCount: number; latestBlockHeight: bigint }> {
    if (this.isRunning) {
      return { processedCount: 0, latestBlockHeight: this.cursorBlockHeight };
    }
    this.isRunning = true;

    try {
      const { events, latestBlockHeight } = await this.deps.chain.pollEvents(this.cursorBlockHeight);
      let processedCount = 0;

      for (const ev of events) {
        const dedupKey = `${ev.txHash}:${ev.logIndex}`;
        if (this.processedEventIds.has(dedupKey) || this.inFlightEventIds.has(dedupKey)) {
          continue;
        }

        this.inFlightEventIds.add(dedupKey);
        try {
          await this.dispatchEvent(ev);
          this.processedEventIds.add(dedupKey);
        } finally {
          this.inFlightEventIds.delete(dedupKey);
        }

        processedCount += 1;
        if (ev.blockHeight > this.cursorBlockHeight) {
          this.cursorBlockHeight = ev.blockHeight;
        }
      }

      if (processedCount > 0 && latestBlockHeight > this.cursorBlockHeight) {
        this.cursorBlockHeight = latestBlockHeight;
      }

      return { processedCount, latestBlockHeight: this.cursorBlockHeight };
    } finally {
      this.isRunning = false;
    }
  }

  private async dispatchEvent(ev: OnchainEvent): Promise<void> {
    if (ev.type === "OnchainDepositDetected") {
      const paymentReq = await this.deps.paymentRepo.findByEscrowId(ev.escrowId);
      if (paymentReq) {
        await this.deps.payments.handleOnchainDeposit({
          escrowId: ev.escrowId,
          txHash: ev.txHash,
          payer: ev.depositor,
          amountMinor: ev.amountMinor,
        });
        return;
      }

      const remittance = await this.deps.remittanceRepo.findByEscrowId(ev.escrowId);
      if (remittance) {
        await this.deps.remittances.handleFundingAndSettle({
          escrowId: ev.escrowId,
          txHash: ev.txHash,
          amountMinor: ev.amountMinor,
        });
      }
      return;
    }

    if (ev.type === "OnchainRefundConfirmed") {
      await this.reconcileOnchainRefund(ev.escrowId, ev.amountMinor);
    }
  }

  /**
   * Reconcile an on-chain refund (such as user's fail-safe `claim_refund`)
   * when the aggregate is not yet in `REFUNDED` state.
   */
  private async reconcileOnchainRefund(escrowId: EscrowId, amountMinor: bigint): Promise<void> {
    const now = this.deps.clock.now();

    const rem = await this.deps.remittanceRepo.findByEscrowId(escrowId);
    if (rem && rem.aggregate.status !== "REFUNDED") {
      const res = rem.aggregate.confirmRefund(now);
      if (res.ok) {
        await this.deps.remittanceRepo.save(rem.aggregate);
      }
      return;
    }

    const pr = await this.deps.paymentRepo.findByEscrowId(escrowId);
    if (pr && pr.aggregate.status !== "REFUNDED" && pr.aggregate.status !== "SETTLED") {
      const amt = Money.of(amountMinor, "USDC");
      if (!amt.ok) return;
      if (pr.aggregate.status === "PARTIALLY_PAID") {
        pr.aggregate.cancel(now);
      }
      const res = pr.aggregate.confirmRefund(amt.value, now);
      if (res.ok) {
        await this.deps.paymentRepo.save(pr.aggregate);
      }
    }
  }
}
