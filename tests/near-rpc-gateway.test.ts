import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  base58Decode,
  base58Encode,
  buildSignedNearTransaction,
  NearRpcChainGateway,
  parseNearEd25519SecretKey,
  parseNep297EscrowEvents,
  verifyNearTransactionSignature,
  type AccountId,
  type EscrowId,
  type TxHash,
} from "../src/shared";

describe("NEAR RPC Gateway & Borsh / Ed25519 Protocol Layer", () => {
  it("encodes and decodes Base58 buffers losslessly including leading zeros", () => {
    const sample = new Uint8Array([0, 0, 18, 99, 255, 1, 42, 128]);
    const encoded = base58Encode(sample);
    expect(encoded.startsWith("11")).toBe(true);
    const decoded = base58Decode(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(sample));
  });

  it("parses a NEAR Ed25519 key, serializes Borsh transaction, and verifies Ed25519 signature", () => {
    const seed = new Uint8Array(32).fill(7);
    const secretNear = `ed25519:${base58Encode(seed)}`;
    const parsedKey = parseNearEd25519SecretKey(secretNear);
    expect(parsedKey.publicKey32.length).toBe(32);
    expect(parsedKey.publicKeyNear.startsWith("ed25519:")).toBe(true);

    const blockHash = base58Encode(new Uint8Array(32).fill(11));
    const built = buildSignedNearTransaction({
      signerId: "operator.ledgerly.testnet",
      signerSeed32: parsedKey.seed32,
      signerPublicKey32: parsedKey.publicKey32,
      nonce: 42n,
      receiverId: "escrow.ledgerly.testnet",
      blockHashBase58: blockHash,
      actions: [
        {
          kind: "FunctionCall",
          methodName: "register_escrow",
          argsJson: {
            escrow_id: "esc_123",
            kind: "Payment",
            commitment: "a".repeat(64),
            refund_after: 1700000000,
          },
          gas: 30_000_000_000_000n,
          depositYocto: 0n,
        },
      ],
    });

    const txHash32 = createHash("sha256").update(built.txBytes).digest();
    expect(base58Encode(txHash32)).toBe(built.txHashBase58);
    expect(
      verifyNearTransactionSignature(txHash32, built.signature64, parsedKey.publicKey32),
    ).toBe(true);
  });

  it("parses NEP-297 EVENT_JSON logs emitted by ledgerly-escrow", () => {
    const logs = [
      'EVENT_JSON:{"standard":"ledgerly-escrow","version":"1.0.0","event":"escrow_funded","data":[{"escrow_id":"esc_abc","depositor":"buyer.testnet","amount":"680000000","held":"680000000"}]}',
      'EVENT_JSON:{"standard":"ledgerly-escrow","version":"1.0.0","event":"escrow_released","data":[{"escrow_id":"esc_abc","receiver":"merchant.testnet","amount":"680000000"}]}',
    ];
    const events = parseNep297EscrowEvents(logs, "9xTxHashBase58" as TxHash, 185000100n);
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe("OnchainDepositDetected");
    expect(events[1]?.type).toBe("OnchainReleaseConfirmed");
  });

  it("executes registerEscrow, simulateDeposit, and getEscrow via JSON-RPC", async () => {
    const seed = new Uint8Array(32).fill(9);
    const blockHash = base58Encode(new Uint8Array(32).fill(3));

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method: string;
        params: Record<string, unknown>;
      };

      if (body.method === "query" && body.params.request_type === "view_access_key") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "ledgerly-rpc",
            result: {
              nonce: 100,
              block_hash: blockHash,
              block_height: 185420010,
            },
          }),
          { status: 200 },
        );
      }

      if (body.method === "send_tx") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "ledgerly-rpc",
            result: {
              transaction: { hash: "5GvNearTxHashBase58Testnet111111111111111111" },
              receipts_outcome: [
                {
                  outcome: {
                    logs: [
                      'EVENT_JSON:{"standard":"ledgerly-escrow","version":"1.0.0","event":"escrow_funded","data":[{"escrow_id":"esc_live_1","depositor":"buyer.testnet","amount":"250000000","held":"250000000"}]}',
                    ],
                  },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (body.method === "query" && body.params.request_type === "call_function") {
        const escrowJson = JSON.stringify({
          kind: "Payment",
          depositor: "buyer.testnet",
          held: "250000000",
          commitment: "b".repeat(64),
          status: "Held",
          refund_after: 1900000000,
        });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "ledgerly-rpc",
            result: {
              result: Array.from(Buffer.from(escrowJson, "utf8")),
              block_height: 185420015,
            },
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected RPC call: ${body.method}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    try {
      const gw = new NearRpcChainGateway({
        rpcUrl: "https://test.rpc.fastnear.com",
        escrowContractId: "escrow.ledgerly.testnet" as AccountId,
        usdcContractId: "usdc.fakes.testnet" as AccountId,
        operatorAccountId: "operator.ledgerly.testnet" as AccountId,
        operatorPrivateKey: `ed25519:${base58Encode(seed)}`,
      });

      const reg = await gw.registerEscrow({
        escrowId: "esc_live_1" as EscrowId,
        kind: "Payment",
        commitment: "b".repeat(64),
        refundAfterNs: 1900000000n,
      });
      expect(reg.txHash).toBe("5GvNearTxHashBase58Testnet111111111111111111");

      const view = await gw.getEscrow("esc_live_1" as EscrowId);
      expect(view?.heldMinor).toBe(250_000_000n);
      expect(view?.status).toBe("Held");

      const polled = await gw.pollEvents(0n);
      expect(polled.events.length).toBeGreaterThanOrEqual(1);
      expect(polled.events[0]?.type).toBe("OnchainDepositDetected");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
