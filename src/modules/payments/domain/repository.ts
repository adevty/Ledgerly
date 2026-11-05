import type { PaymentRequestId, EscrowId, OrgId } from "@/shared";
import type { EncryptedEnvelope } from "@/modules/privacy/domain";
import type { PaymentRequest } from "./payment-request";

export interface StoredPaymentRequest {
  readonly aggregate: PaymentRequest;
  readonly envelope: EncryptedEnvelope;
  readonly createdAt: Date;
}

/**
 * Repository port (implemented by in-memory & Prisma adapters).
 * `save` must persist the aggregate, its encrypted envelope, AND its pulled
 * events to the outbox atomically, and enforce optimistic locking on `version`.
 */
export interface PaymentRequestRepository {
  findById(id: PaymentRequestId): Promise<StoredPaymentRequest | null>;
  findByEscrowId(escrowId: EscrowId): Promise<StoredPaymentRequest | null>;
  listByOrgId(orgId: OrgId): Promise<StoredPaymentRequest[]>;
  save(request: PaymentRequest, envelope?: EncryptedEnvelope, createdAt?: Date): Promise<void>;
}
