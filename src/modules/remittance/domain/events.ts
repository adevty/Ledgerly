import type { DomainEvent } from "@/shared";

/** Remittance bounded-context events (Tahap 4 §8). No PII. */
export type RemittanceEvent =
  | DomainEvent<"RemittanceQuoted", { escrowId: string; targetCurrency: string }>
  | DomainEvent<"RemittanceExpired", Record<string, never>>
  | DomainEvent<"ScreeningBlocked", { reasonCode: string }>
  | DomainEvent<"RemittanceFunded", { txHash: string; amountMinor: string }>
  | DomainEvent<"PayoutStarted", { attempt: number }>
  | DomainEvent<"PayoutFailed", { attempt: number; code: string; retryable: boolean }>
  | DomainEvent<"RemittanceSettled", { payoutRef: string }>
  | DomainEvent<"RemittanceRefundRequested", { reasonCode: string; amountMinor: string }>
  | DomainEvent<"RemittanceRefunded", { requiresReview: boolean }>;

export type RemittanceEventType = RemittanceEvent["type"];
