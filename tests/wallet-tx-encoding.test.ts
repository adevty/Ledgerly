import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeUnsignedFunctionCallTx } from "../src/shared/near-wallet-client";
import { base58Encode, buildSignedNearTransaction, parseNearEd25519SecretKey } from "../src/shared/near-rpc-gateway";

describe("browser unsigned tx encoder", () => {
  it("matches the server-side Borsh transaction bytes exactly", () => {
    const seed = randomBytes(32);
    // Build a 64-byte NEAR secret key (seed || pub) via the server parser.
    const k = parseNearEd25519SecretKey(`ed25519:${base58Encode(new Uint8Array(seed))}`);
    const blockHash = base58Encode(new Uint8Array(randomBytes(32)));
    const args = { receiver_id: "escrow.testnet", amount: "25000000", msg: "{}" };

    const server = buildSignedNearTransaction({
      signerId: "buyer.testnet",
      signerSeed32: k.seed32,
      signerPublicKey32: k.publicKey32,
      nonce: 77n,
      receiverId: "usdc.testnet",
      blockHashBase58: blockHash,
      actions: [{ kind: "FunctionCall", methodName: "ft_transfer_call", argsJson: args, gas: 50_000_000_000_000n, depositYocto: 1n }],
    });

    const client = encodeUnsignedFunctionCallTx({
      signerId: "buyer.testnet",
      publicKeyNear: k.publicKeyNear,
      nonce: 77n,
      receiverId: "usdc.testnet",
      blockHashBase58: blockHash,
      methodName: "ft_transfer_call",
      argsJson: args,
      gas: 50_000_000_000_000n,
      depositYocto: 1n,
    });

    expect(Buffer.from(client).toString("hex")).toBe(Buffer.from(server.txBytes).toString("hex"));
  });
});
