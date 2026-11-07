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
import {
  buildFtTransferCallPreview,
  buildMyNearWalletLoginUrl,
  connectMeteorWallet,
} from "../src/shared/near-wallet-client";

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

  it("builds NEP-141 wallet payload preview and MyNearWallet redirect URL with zero PII", () => {
    const loginUrl = buildMyNearWalletLoginUrl(
      "ledgerly-escrow-9e70f9ea.testnet",
      "https://ledgerly.app/checkout/pr_inv_8842",
    );
    expect(loginUrl).toContain("https://testnet.mynearwallet.com/login/");
    expect(loginUrl).toContain("contract_id=ledgerly-escrow-9e70f9ea.testnet");

    const preview = buildFtTransferCallPreview({
      usdcContractId: "ledgerly-escrow-9e70f9ea.testnet",
      escrowContractId: "ledgerly-escrow-9e70f9ea.testnet",
      escrowId: "a".repeat(64),
      depositorAccountId: "kyoto-living.testnet",
      amountDecimal: "420.00",
    });
    expect(preview.methodName).toBe("ft_transfer_call");
    expect(preview.args.amount).toBe("420000000");
    expect(preview.args.msg).toContain("kyoto-living.testnet");
  });

  it("connects to Meteor Wallet browser extension via window.meteorCom PostMessenger protocol", async () => {
    let registeredListener: ((data: Record<string, unknown>) => void) | null = null;
    const fakeWindow = {
      crypto: globalThis.crypto,
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      meteorCom: {
        addMessageDataListener: (cb: (data: Record<string, unknown>) => void) => {
          registeredListener = cb;
        },
        sendMessageData: (msg: Record<string, unknown>) => {
          if (msg.status === "initializing" && registeredListener) {
            registeredListener({
              uid: msg.uid,
              status: "closed_success",
              payload: {
                accountId: "meteor-buyer.testnet",
                allKeys: ["ed25519:5MeteorKeyTestnet11111111111111111111111"],
              },
            });
          }
        },
      },
    };

    vi.stubGlobal("window", fakeWindow);
    try {
      const session = await connectMeteorWallet("ledgerly-escrow-9e70f9ea.testnet", "testnet");
      expect(session.accountId).toBe("meteor-buyer.testnet");
      expect(session.provider).toBe("METEOR_WALLET");
      expect(session.network).toBe("testnet");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ingests external transactions with valid NEP-297 events and rejects unrelated or missing transactions", async () => {
    const seed = new Uint8Array(32).fill(5);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("nearblocks.io")) {
        return new Response(JSON.stringify({ data: { signer_account_id: "buyer.testnet" } }), {
          status: 200,
        });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method: string;
        params: unknown[];
      };

      if (body.method === "tx") {
        const [txHash] = body.params as [string, string];
        if (txHash === "valid_escrow_tx") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: "ledgerly-rpc",
              result: {
                transaction_outcome: {
                  outcome: {
                    logs: [
                      'EVENT_JSON:{"standard":"ledgerly-escrow","version":"1.0.0","event":"escrow_funded","data":[{"escrow_id":"esc_live_2","depositor":"buyer.testnet","amount":"420000000","held":"420000000"}]}',
                    ],
                  },
                },
              },
            }),
            { status: 200 },
          );
        }
        if (txHash === "unrelated_tx") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: "ledgerly-rpc",
              result: {
                transaction_outcome: {
                  outcome: {
                    logs: ["Transfer 10 NEAR to friend.testnet"],
                  },
                },
              },
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "ledgerly-rpc",
            error: {
              name: "HANDLER_ERROR",
              cause: { info: { cause: "NOT_OBSERVED" }, name: "TIMEOUT_ERROR" },
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

      // 1. Valid escrow transaction returns parsed events
      const validEvents = await gw.ingestExternalTransaction("valid_escrow_tx" as TxHash);
      expect(validEvents).toHaveLength(1);
      expect(validEvents[0]?.escrowId).toBe("esc_live_2");

      // 2. Unrelated transaction on NEAR returns 0 escrow events
      const unrelatedEvents = await gw.ingestExternalTransaction("unrelated_tx" as TxHash);
      expect(unrelatedEvents).toHaveLength(0);

      // 3. Unknown transaction throws
      await expect(
        gw.ingestExternalTransaction("unknown_tx" as TxHash),
      ).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
