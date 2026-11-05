import { err, ok, type Result } from "./result";
import { domainError, type DomainError } from "./errors";

/** Nominal ("branded") types prevent mixing up IDs of different aggregates. */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrgId = Brand<string, "OrgId">;
export type UserId = Brand<string, "UserId">;
export type PaymentRequestId = Brand<string, "PaymentRequestId">;
export type RemittanceId = Brand<string, "RemittanceId">;
export type GrantId = Brand<string, "GrantId">;
export type TxHash = Brand<string, "TxHash">;
export type Commitment = Brand<string, "Commitment">;

/**
 * Opaque escrow identifier: 32 random bytes, hex encoded.
 * It carries NO business meaning (order ref, merchant, etc.) so that
 * on-chain observers cannot correlate it to anything (Tahap 4 decision #2).
 */
export type EscrowId = Brand<string, "EscrowId">;

export const ESCROW_ID_RE = /^[0-9a-f]{64}$/;

export function newEscrowId(randomBytes: (n: number) => Uint8Array = defaultRandom): EscrowId {
  return Buffer.from(randomBytes(32)).toString("hex") as EscrowId;
}

function defaultRandom(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** NEAR account id (human-readable), e.g. "maria.ledgerly.testnet". */
export type AccountId = Brand<string, "AccountId">;

// NEAR rules: 2-64 chars, lowercase alnum separated by single '.', '-' or '_'.
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function parseAccountId(raw: string): Result<AccountId, DomainError> {
  const v = raw.trim().toLowerCase();
  if (v.length < 2 || v.length > 64 || !ACCOUNT_RE.test(v)) {
    return err(domainError("INVALID_ACCOUNT_ID", `Invalid NEAR account id '${raw}'`));
  }
  return ok(v as AccountId);
}
