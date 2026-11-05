import type { PaymentRequestId, EscrowId } from "@/shared";
import type { PaymentRequest } from "./payment-request";

/**
 * Repository port (implemented by Prisma adapter in module 4).
 * `save` must persist the aggregate AND its pulled events to the outbox
 * atomically, and enforce optimistic locking on `version`.
 */
export interface PaymentRequestRepository {
  findById(id: PaymentRequestId): Promise<PaymentRequest | null>;
  findByEscrowId(escrowId: EscrowId): Promise<PaymentRequest | null>;
  save(request: PaymentRequest): Promise<void>;
}
