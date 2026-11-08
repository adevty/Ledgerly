/**
 * Pure assertion and verification helper functions used by:
 * - `npm run demo` (sandbox verification)
 * - `npm run verify:onchain` (keyless on-chain verification)
 * - `npm run demo:live` (live testnet verification)
 *
 * All functions are pure, deterministic, and unit tested.
 */

import { computeCommitment, verifyCommitment } from "@/modules/privacy/domain/commitment";

export interface BalancedLedgerCheck {
  readonly valid: boolean;
  readonly totalDebitsMinor: bigint;
  readonly totalCreditsMinor: bigint;
  readonly rowCount: number;
  readonly error?: string;
}

/**
 * Parses double-entry CSV output and verifies that total debits strictly equal
 * total credits in integer minor units (no float math).
 * Expected CSV format: header line followed by lines with:
 * `entry_id,journal_id,currency,account,debit_minor,credit_minor,posted_at,...`
 */
export function assertBalancedDoubleEntry(csvContent: string): BalancedLedgerCheck {
  const lines = csvContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return {
      valid: false,
      totalDebitsMinor: 0n,
      totalCreditsMinor: 0n,
      rowCount: 0,
      error: "CSV contains no ledger entry rows",
    };
  }

  const header = lines[0]!.split(",").map((c) => c.trim().toLowerCase());
  const debitIdx = header.indexOf("debit_minor");
  const creditIdx = header.indexOf("credit_minor");

  if (debitIdx === -1 || creditIdx === -1) {
    return {
      valid: false,
      totalDebitsMinor: 0n,
      totalCreditsMinor: 0n,
      rowCount: 0,
      error: "CSV missing debit_minor or credit_minor columns",
    };
  }

  let totalDebits = 0n;
  let totalCredits = 0n;
  let rows = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",").map((c) => c.trim());
    if (cols.length <= Math.max(debitIdx, creditIdx)) continue;

    const debitStr = cols[debitIdx] ?? "0";
    const creditStr = cols[creditIdx] ?? "0";

    try {
      totalDebits += BigInt(debitStr);
      totalCredits += BigInt(creditStr);
      rows++;
    } catch {
      return {
        valid: false,
        totalDebitsMinor: totalDebits,
        totalCreditsMinor: totalCredits,
        rowCount: rows,
        error: `Invalid integer minor unit on line ${i + 1}: debit='${debitStr}', credit='${creditStr}'`,
      };
    }
  }

  const isBalanced = totalDebits === totalCredits && rows > 0;
  return {
    valid: isBalanced,
    totalDebitsMinor: totalDebits,
    totalCreditsMinor: totalCredits,
    rowCount: rows,
    ...(isBalanced
      ? {}
      : {
          error:
            rows === 0
              ? "No valid entry rows found"
              : `Unbalanced books: debits=${totalDebits.toString()}, credits=${totalCredits.toString()}`,
        }),
  };
}

/**
 * Recomputes SHA-256 commitment from confidential payload and salt hex,
 * comparing with expected on-chain commitment.
 */
export function verifyCommitmentRecomputation(
  payload: Record<string, unknown>,
  saltHex: string,
  expectedCommitment: string,
): boolean {
  if (!saltHex || !expectedCommitment || !payload) return false;
  const computed = computeCommitment(payload, saltHex);
  return computed.toLowerCase() === expectedCommitment.toLowerCase() &&
    verifyCommitment(payload, saltHex, expectedCommitment);
}

/**
 * Inspects a NEAR RPC transaction outcome response and extracts
 * execution status, receiver account ID, invoked method, and emitted logs.
 */
export function parseNearRpcTxOutcome(rawRpcTx: unknown): {
  readonly success: boolean;
  readonly receiverId: string;
  readonly method: string;
  readonly logs: readonly string[];
  readonly error?: string;
} {
  if (!rawRpcTx || typeof rawRpcTx !== "object") {
    return { success: false, receiverId: "", method: "", logs: [], error: "Empty or invalid RPC response" };
  }

  const root = rawRpcTx as {
    transaction?: {
      receiver_id?: string;
      actions?: Array<
        | { FunctionCall?: { method_name?: string } }
        | { DeployContract?: unknown }
        | Record<string, unknown>
      >;
    };
    status?: {
      SuccessValue?: string;
      SuccessReceiptId?: string;
      Failure?: unknown;
    };
    receipts_outcome?: Array<{
      outcome?: {
        logs?: string[];
        status?: {
          SuccessValue?: string;
          SuccessReceiptId?: string;
          Failure?: unknown;
        };
      };
    }>;
  };

  const receiverId = root.transaction?.receiver_id ?? "";
  const firstAction = root.transaction?.actions?.[0];
  let method = "unknown";

  if (firstAction && typeof firstAction === "object") {
    const act = firstAction as Record<string, unknown>;
    const fc = act.FunctionCall as { method_name?: string } | undefined;
    if (fc?.method_name) {
      method = fc.method_name;
    } else if ("DeployContract" in act) {
      method = "DeployContract";
    } else {
      method = Object.keys(act)[0] ?? "unknown";
    }
  }

  const isRootFailure = Boolean(root.status?.Failure);
  const receipts = root.receipts_outcome ?? [];
  const hasReceiptFailure = receipts.some((r) => Boolean(r.outcome?.status?.Failure));
  const success = !isRootFailure && !hasReceiptFailure && Boolean(root.status);

  const logs: string[] = [];
  for (const r of receipts) {
    if (Array.isArray(r.outcome?.logs)) {
      logs.push(...r.outcome.logs);
    }
  }

  return {
    success,
    receiverId,
    method,
    logs,
    ...(success ? {} : { error: `Transaction execution failed or contains execution error` }),
  };
}
