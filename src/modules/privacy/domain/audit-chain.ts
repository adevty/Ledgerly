import { createHash } from "node:crypto";

export interface AuditLogEntry {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly targetId: string;
  readonly atIso: string;
  readonly prevHash: string;
  readonly hash: string;
}

export const GENESIS_AUDIT_HASH = "0".repeat(64);

/**
 * Compute deterministic hash-chain link:
 *   `sha256(prevHash || actor || action || targetId || atIso)`
 * Periodically anchored on-chain via `ledgerly-escrow::anchor(root)` (Tahap 4 §4).
 */
export function computeAuditEntryHash(input: {
  prevHash: string;
  actor: string;
  action: string;
  targetId: string;
  atIso: string;
}): string {
  return createHash("sha256")
    .update(`${input.prevHash}|${input.actor}|${input.action}|${input.targetId}|${input.atIso}`, "utf8")
    .digest("hex");
}

export function appendAuditEntry(
  chain: readonly AuditLogEntry[],
  input: { id: string; actor: string; action: string; targetId: string; at: Date },
): AuditLogEntry {
  const prevHash = chain.length === 0 ? GENESIS_AUDIT_HASH : chain[chain.length - 1]!.hash;
  const atIso = input.at.toISOString();
  const hash = computeAuditEntryHash({
    prevHash,
    actor: input.actor,
    action: input.action,
    targetId: input.targetId,
    atIso,
  });
  return {
    id: input.id,
    actor: input.actor,
    action: input.action,
    targetId: input.targetId,
    atIso,
    prevHash,
    hash,
  };
}

/** Verify every link in the audit log hash chain from genesis (or a known starting hash). */
export function verifyAuditChain(
  chain: readonly AuditLogEntry[],
  expectedStartPrevHash: string = GENESIS_AUDIT_HASH,
): boolean {
  let prev = expectedStartPrevHash;
  for (const entry of chain) {
    if (entry.prevHash !== prev) return false;
    const expected = computeAuditEntryHash(entry);
    if (entry.hash !== expected) return false;
    prev = entry.hash;
  }
  return true;
}
