import type { Money, Currency, RemittanceId, EscrowId } from "@/shared";
import type { Remittance } from "./remittance";

/** Repository port (Prisma adapter in module 4). Same atomic outbox contract as payments. */
export interface RemittanceRepository {
  findById(id: RemittanceId): Promise<Remittance | null>;
  findByEscrowId(escrowId: EscrowId): Promise<Remittance | null>;
  save(remittance: Remittance): Promise<void>;
}

/**
 * Outbound ports used by remittance use cases. Defined here (domain-owned
 * contracts) and implemented by mock adapters now, real partners later.
 */
export interface FxRatePort {
  /** Returns decimal rate string for 1 `from` = x `to`, plus fee in source currency. */
  quote(from: Currency, to: Currency, source: Money): Promise<{ rate: string; fee: Money }>;
}

export type PayoutResult =
  | { status: "SETTLED"; payoutRef: string }
  | { status: "FAILED"; code: string; retryable: boolean };

export interface OffRampPort {
  payout(req: {
    idempotencyKey: string;
    remittanceId: RemittanceId;
    amount: Money;
    destinationRef: string;
    country: string;
  }): Promise<PayoutResult>;
}
