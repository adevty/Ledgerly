import { createHash } from "node:crypto";
import { domainError, err, ok, type DomainError, type Result } from "./index";

export interface IdempotencyStore {
  get<T>(key: string): Promise<{ actorId: string; requestHash: string; response: T } | null>;
  set<T>(key: string, record: { actorId: string; requestHash: string; response: T }): Promise<void>;
}

/**
 * Execute a money-moving operation idempotently (AD-10, NFR-03).
 * - If the same `(key, actorId, requestHash)` was already processed, returns the cached response.
 * - If the same `key` is reused with a DIFFERENT payload or actor, returns `IDEMPOTENCY_CONFLICT`.
 */
export async function withIdempotency<T>(
  store: IdempotencyStore,
  input: {
    key: string;
    actorId: string;
    requestPayload: unknown;
    execute: () => Promise<Result<T, DomainError>>;
  },
): Promise<Result<T, DomainError>> {
  const requestHash = createHash("sha256")
    .update(JSON.stringify(input.requestPayload), "utf8")
    .digest("hex");

  const existing = await store.get<T>(input.key);
  if (existing) {
    if (existing.actorId !== input.actorId || existing.requestHash !== requestHash) {
      return err(
        domainError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency-Key was already used with different request parameters",
        ),
      );
    }
    return ok(existing.response);
  }

  const res = await input.execute();
  if (res.ok) {
    await store.set(input.key, {
      actorId: input.actorId,
      requestHash,
      response: res.value,
    });
  }
  return res;
}
