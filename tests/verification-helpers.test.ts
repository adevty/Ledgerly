import { describe, expect, it } from "vitest";
import {
  assertBalancedDoubleEntry,
  parseNearRpcTxOutcome,
  verifyCommitmentRecomputation,
} from "@/lib/verification-helpers";
import { computeCommitment } from "@/modules/privacy/domain/commitment";

describe("Task D - Verification Helpers Unit Tests", () => {
  describe("assertBalancedDoubleEntry", () => {
    it("validates perfectly balanced double-entry ledger CSV rows", () => {
      const csv = `entry_id,journal_id,currency,account,debit_minor,credit_minor,posted_at
entry_1,j_1,USDC,asset:escrow_usdc,700000000,0,2026-11-08T00:00:00Z
entry_2,j_1,USDC,liability:merchant_pending,0,700000000,2026-11-08T00:00:00Z
entry_3,j_2,USDC,liability:merchant_pending,20000000,0,2026-11-08T00:01:00Z
entry_4,j_2,USDC,asset:escrow_usdc,0,20000000,2026-11-08T00:01:00Z
`;
      const res = assertBalancedDoubleEntry(csv);
      expect(res.valid).toBe(true);
      expect(res.totalDebitsMinor).toBe(720_000_000n);
      expect(res.totalCreditsMinor).toBe(720_000_000n);
      expect(res.rowCount).toBe(4);
      expect(res.error).toBeUndefined();
    });

    it("rejects unbalanced ledger CSV rows", () => {
      const csv = `entry_id,journal_id,currency,account,debit_minor,credit_minor,posted_at
entry_1,j_1,USDC,asset:escrow_usdc,680000000,0,2026-11-08T00:00:00Z
entry_2,j_1,USDC,liability:merchant_pending,0,670000000,2026-11-08T00:00:00Z
`;
      const res = assertBalancedDoubleEntry(csv);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Unbalanced books");
    });

    it("rejects invalid CSV formats or non-integer minor unit lines", () => {
      expect(assertBalancedDoubleEntry("").valid).toBe(false);
      expect(assertBalancedDoubleEntry("foo,bar\n1,2").valid).toBe(false);
      expect(
        assertBalancedDoubleEntry(
          "entry_id,journal_id,currency,account,debit_minor,credit_minor,posted_at\ne1,j1,USDC,acc,invalid_int,0,now",
        ).valid,
      ).toBe(false);
    });
  });

  describe("verifyCommitmentRecomputation", () => {
    it("accurately verifies matching SHA-256 canonical JSON commitment", () => {
      const payload = {
        orderRef: "INV-2026-8841",
        amountDecimal: "1450.00",
        customerEmail: "procurement@kyoto-living.jp",
      };
      const salt = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const expectedCommitment = computeCommitment(payload, salt);

      expect(verifyCommitmentRecomputation(payload, salt, expectedCommitment)).toBe(true);
      expect(verifyCommitmentRecomputation(payload, salt, "wrong_hash")).toBe(false);
      expect(verifyCommitmentRecomputation({ ...payload, orderRef: "INV-OTHER" }, salt, expectedCommitment)).toBe(false);
    });
  });

  describe("parseNearRpcTxOutcome", () => {
    it("extracts status, receiver, method, and logs from successful RPC outcome", () => {
      const mockRpcResponse = {
        transaction: {
          receiver_id: "ledgerly-escrow-9e70f9ea.testnet",
          actions: [
            {
              FunctionCall: {
                method_name: "register",
                args: "e30=",
                deposit: "0",
                gas: 30000000000000,
              },
            },
          ],
        },
        status: {
          SuccessValue: "",
        },
        receipts_outcome: [
          {
            outcome: {
              status: { SuccessValue: "" },
              logs: ['EVENT_JSON:{"standard":"ledgerly-escrow","event":"escrow_registered"}'],
            },
          },
        ],
      };

      const parsed = parseNearRpcTxOutcome(mockRpcResponse);
      expect(parsed.success).toBe(true);
      expect(parsed.receiverId).toBe("ledgerly-escrow-9e70f9ea.testnet");
      expect(parsed.method).toBe("register");
      expect(parsed.logs.length).toBe(1);
    });

    it("detects failed transactions in root or receipt outcomes", () => {
      const failedRpc = {
        transaction: {
          receiver_id: "ledgerly-escrow-9e70f9ea.testnet",
          actions: [{ FunctionCall: { method_name: "release" } }],
        },
        status: {
          Failure: { ActionError: { kind: { FunctionCallError: "ExecutionError" } } },
        },
      };

      const parsed = parseNearRpcTxOutcome(failedRpc);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });
});
