/**
 * Typed domain errors. `code` is stable and maps to API error codes
 * (see Tahap 4 §6 error taxonomy). Never put PII in `details`.
 */
export type DomainErrorCode =
  | "INVALID_AMOUNT"
  | "CURRENCY_MISMATCH"
  | "INVALID_ACCOUNT_ID"
  | "INVALID_TRANSITION"
  | "QUOTE_EXPIRED"
  | "REFUND_EXCEEDS_AVAILABLE"
  | "DUPLICATE_PAYMENT"
  | "REQUEST_EXPIRED"
  | "MAX_ATTEMPTS_REACHED"
  | "FUNDING_AMOUNT_MISMATCH"
  | "CRYPTO_ERROR"
  | "COMMITMENT_MISMATCH"
  | "GRANT_EXPIRED"
  | "GRANT_REVOKED"
  | "OUT_OF_SCOPE";

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly details?: Record<string, string | number | boolean>;
}

export const domainError = (
  code: DomainErrorCode,
  message: string,
  details?: DomainError["details"],
): DomainError => ({ code, message, ...(details ? { details } : {}) });

export const invalidTransition = (aggregate: string, from: string, action: string): DomainError =>
  domainError("INVALID_TRANSITION", `${aggregate}: cannot '${action}' from state '${from}'`, {
    aggregate,
    from,
    action,
  });
