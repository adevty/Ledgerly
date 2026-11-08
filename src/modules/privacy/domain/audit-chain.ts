import { createHash } from "node:crypto";

export interface AuditLogEntry {
  readonly id: string;
  readonly seq?: number;
  readonly actor: string;
  readonly action: string;
  readonly targetId: string;
  readonly atIso: string;
  readonly prevHash: string;
  readonly hash: string;
}

export const GENESIS_AUDIT_HASH = "0".repeat(64);

export interface AuditChainVerificationResult {
  readonly valid: boolean;
  readonly brokenAtSeq?: number | null;
  readonly brokenAtIndex?: number | null;
  readonly reason?: "prev_hash_mismatch" | "hash_mismatch" | "empty" | "seq_out_of_order" | null;
  readonly length: number;
}

export function getAuditEntrySeq(entry: AuditLogEntry, fallbackIndex?: number): number {
  if (typeof entry.seq === "number" && Number.isFinite(entry.seq)) {
    return entry.seq;
  }
  const match = entry.id.match(/^audit_(\d+)$/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return fallbackIndex !== undefined ? fallbackIndex + 1 : 1;
}

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

/**
 * Inspect every link in the audit log hash chain from genesis (or a known starting hash),
 * returning diagnostics on the exact failure point if broken.
 */
export function inspectAuditChain(
  chain: readonly AuditLogEntry[],
  expectedStartPrevHash: string = GENESIS_AUDIT_HASH,
): AuditChainVerificationResult {
  if (!chain || chain.length === 0) {
    return {
      valid: true,
      brokenAtSeq: null,
      brokenAtIndex: null,
      reason: null,
      length: 0,
    };
  }
  let prev = expectedStartPrevHash;
  let lastSeq = -1;

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]!;
    const seq = getAuditEntrySeq(entry, i);

    if (i > 0 && seq <= lastSeq) {
      return {
        valid: false,
        brokenAtSeq: seq,
        brokenAtIndex: i,
        reason: "seq_out_of_order",
        length: chain.length,
      };
    }

    if (entry.prevHash !== prev) {
      return {
        valid: false,
        brokenAtSeq: seq,
        brokenAtIndex: i,
        reason: "prev_hash_mismatch",
        length: chain.length,
      };
    }
    const expected = computeAuditEntryHash(entry);
    if (entry.hash !== expected) {
      return {
        valid: false,
        brokenAtSeq: seq,
        brokenAtIndex: i,
        reason: "hash_mismatch",
        length: chain.length,
      };
    }
    prev = entry.hash;
    lastSeq = seq;
  }

  return {
    valid: true,
    brokenAtSeq: null,
    brokenAtIndex: null,
    reason: null,
    length: chain.length,
  };
}

/** Verify every link in the audit log hash chain from genesis (or a known starting hash). */
export function verifyAuditChain(
  chain: readonly AuditLogEntry[],
  expectedStartPrevHash: string = GENESIS_AUDIT_HASH,
): boolean {
  return inspectAuditChain(chain, expectedStartPrevHash).valid;
}
