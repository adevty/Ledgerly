import type { DomainEvent } from "@/shared";

/**
 * Payments bounded-context events (Tahap 4 §8).
 * Amounts are serialized as minor-unit strings; no PII / order data.
 */
export type PaymentEvent =
  | DomainEvent<"PaymentRequestCreated", { merchantId: string; escrowId: string }>
  | DomainEvent<"PaymentReceived", { txHash: string; amountMinor: string }>
  | DomainEvent<"PaymentOverpaid", { excessMinor: string }>
  | DomainEvent<"PaymentRequestPaid", Record<string, never>>
  | DomainEvent<"PaymentRequestExpired", Record<string, never>>
  | DomainEvent<"PaymentRequestCancelled", Record<string, never>>
  | DomainEvent<"RefundRequested", { amountMinor: string; reason: string }>
  | DomainEvent<"RefundCompleted", { amountMinor: string }>
  | DomainEvent<"PaymentRequestSettled", { releasedMinor: string }>;

export type PaymentEventType = PaymentEvent["type"];
