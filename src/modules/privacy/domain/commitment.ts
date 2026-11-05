import { createHash } from "node:crypto";
import type { Commitment } from "@/shared";

/**
 * Deterministic JSON serialization with lexicographically sorted object keys.
 * Ensures that the exact same logical business payload always hashes to the
 * same 32-byte commitment regardless of property insertion order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Compute `sha256(canonicalJSON(payload) || saltHex)` as a 64-char hex string.
 * Stored on-chain in `ledgerly-escrow` (AD-3).
 */
export function computeCommitment(payload: unknown, saltHex: string): Commitment {
  if (!/^[0-9a-f]{64}$/i.test(saltHex)) {
    throw new Error("Salt must be a 32-byte (64 hex chars) value");
  }
  const canonical = canonicalJson(payload);
  const hash = createHash("sha256")
    .update(Buffer.from(canonical, "utf8"))
    .update(Buffer.from(saltHex.toLowerCase(), "hex"))
    .digest("hex");
  return hash as Commitment;
}

/**
 * Constant-time verification that `payload` + `saltHex` matches `expectedCommitment`.
 */
export function verifyCommitment(
  payload: unknown,
  saltHex: string,
  expectedCommitment: string,
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(saltHex) || !/^[0-9a-f]{64}$/i.test(expectedCommitment)) {
    return false;
  }
  const actual = computeCommitment(payload, saltHex);
  return actual.toLowerCase() === expectedCommitment.toLowerCase();
}
