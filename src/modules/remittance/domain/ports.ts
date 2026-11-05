import type { Money, Currency, RemittanceId, EscrowId, OrgId } from "@/shared";
import type { EncryptedEnvelope } from "@/modules/privacy/domain";
import type { Remittance } from "./remittance";

export interface StoredRemittance {
  readonly aggregate: Remittance;
  readonly orgId: OrgId;
  readonly envelope: EncryptedEnvelope;
  readonly createdAt: Date;
}

/** Repository port (in-memory & Prisma adapters). Same atomic outbox contract as payments. */
export interface RemittanceRepository {
  findById(id: RemittanceId): Promise<StoredRemittance | null>;
  findByEscrowId(escrowId: EscrowId): Promise<StoredRemittance | null>;
  listByOrgId(orgId: OrgId): Promise<StoredRemittance[]>;
  save(
    remittance: Remittance,
    meta?: { orgId: OrgId; envelope: EncryptedEnvelope; createdAt: Date },
  ): Promise<void>;
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
