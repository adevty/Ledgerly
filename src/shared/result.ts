/**
 * Result type for the domain layer.
 *
 * Domain code never throws for expected business failures; it returns
 * `Result<T, E>` so callers are forced to handle the error path explicitly.
 * Exceptions are reserved for programmer errors (bugs, broken invariants).
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/** Unwrap a result or throw. Use only in tests / composition roots. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) throw new Error(`unwrap on Err: ${JSON.stringify(r.error)}`);
  return r.value;
}
