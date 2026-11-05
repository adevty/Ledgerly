import type { ChainGateway, EscrowId } from "@/shared";
import type { PaymentRequestRepository } from "@/modules/payments/domain";
import type { RemittanceRepository } from "@/modules/remittance/domain";

export interface ReconciliationDiscrepancy {
  readonly kind: "PAYMENT_REQUEST" | "REMITTANCE";
  readonly recordId: string;
  readonly escrowId: EscrowId;
  readonly status: string;
  readonly expectedHeldMinor: bigint;
  readonly onchainHeldMinor: bigint;
  readonly reason: string;
}

/**
 * ReconciliationWorker & Exception Queue builder (AD-9, Tahap 3 §7, Tahap 4 §6).
 *
 * Principle: "Chain = source of truth for funds; DB = source of truth for business context."
 * Compares the expected held balance of every aggregate against the on-chain
 * `ledgerly-escrow` balance and surfaces any discrepancy or failed payout
 * into the Exception Queue for operator review.
 */
export class ReconciliationWorker {
  constructor(
    private readonly deps: {
      paymentRepo: PaymentRequestRepository;
      remittanceRepo: RemittanceRepository;
      chain: ChainGateway;
    },
  ) {}

  async runOnce(): Promise<{
    checkedCount: number;
    discrepancies: readonly ReconciliationDiscrepancy[];
  }> {
    const discrepancies: ReconciliationDiscrepancy[] = [];
    let checkedCount = 0;

    const payments = await this.deps.paymentRepo.listAll();
    for (const stored of payments) {
      checkedCount += 1;
      const pr = stored.aggregate;
      const expectedHeld = pr.held().amountMinor;
      const onchain = await this.deps.chain.getEscrow(pr.escrowId);
      const actualHeld = onchain?.heldMinor ?? 0n;

      if (expectedHeld !== actualHeld) {
        discrepancies.push({
          kind: "PAYMENT_REQUEST",
          recordId: pr.id,
          escrowId: pr.escrowId,
          status: pr.status,
          expectedHeldMinor: expectedHeld,
          onchainHeldMinor: actualHeld,
          reason: "ONCHAIN_BALANCE_MISMATCH",
        });
      }
    }

    const remittances = await this.deps.remittanceRepo.listAll();
    for (const stored of remittances) {
      checkedCount += 1;
      const rm = stored.aggregate;
      const expectedHeld =
        rm.status === "FUNDED" ||
        rm.status === "PAYOUT_PENDING" ||
        rm.status === "PAYOUT_FAILED" ||
        rm.status === "REFUNDING"
          ? rm.quoteVO.source.amountMinor
          : 0n;

      const onchain = await this.deps.chain.getEscrow(rm.escrowId);
      const actualHeld = onchain?.heldMinor ?? 0n;

      if (expectedHeld !== actualHeld) {
        discrepancies.push({
          kind: "REMITTANCE",
          recordId: rm.id,
          escrowId: rm.escrowId,
          status: rm.status,
          expectedHeldMinor: expectedHeld,
          onchainHeldMinor: actualHeld,
          reason: "ONCHAIN_BALANCE_MISMATCH",
        });
      } else if (rm.status === "PAYOUT_FAILED" || rm.status === "BLOCKED") {
        discrepancies.push({
          kind: "REMITTANCE",
          recordId: rm.id,
          escrowId: rm.escrowId,
          status: rm.status,
          expectedHeldMinor: expectedHeld,
          onchainHeldMinor: actualHeld,
          reason: rm.status === "BLOCKED" ? "COMPLIANCE_BLOCKED" : "PAYOUT_RETRY_PENDING",
        });
      }
    }

    return { checkedCount, discrepancies };
  }
}
