import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  base58Encode,
  buildSignedNearTransaction,
  NearRpcChainGateway,
  parseNearEd25519SecretKey,
  type NearActionInput,
} from "../src/shared/near-rpc-gateway";

/**
 * Deploy `contracts/mock-usdc` (NEP-141, 6 decimals, public faucet) to NEAR Testnet, then:
 *   1. create a separate OPERATOR account (a token transfer to self is illegal, so the
 *      operator that funds demo deposits must differ from the escrow account),
 *   2. point `ledgerly-escrow.set_token` at the new token,
 *   3. whitelist the operator on the escrow,
 *   4. mint demo USDC and run a live ft_transfer_call -> release smoke test,
 *   5. rewrite `.env.local`.
 */
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function loadEnv(): Record<string, string> {
  const p = resolve(process.cwd(), ".env.local");
  const out: Record<string, string> = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function newKeypair() {
  const seed32 = randomBytes(32);
  const priv = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed32]),
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(priv).export({ format: "der", type: "spki" });
  const pub32 = new Uint8Array(spki.subarray(spki.length - 32));
  const full = new Uint8Array(64);
  full.set(seed32, 0);
  full.set(pub32, 32);
  return {
    secretKeyNear: `ed25519:${base58Encode(full)}`,
    publicKeyNear: `ed25519:${base58Encode(pub32)}`,
  };
}

async function createAccount(id: string, publicKey: string) {
  const res = await fetch("https://helper.testnet.near.org/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: publicKey }),
  });
  if (!res.ok) throw new Error(`Helper failed for ${id}: ${res.status} ${await res.text()}`);
  console.log(`✓ Created account ${id}`);
}

async function rpc<T>(url: string, method: string, params: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "x", method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: unknown };
  if (body.error || body.result === undefined) throw new Error(JSON.stringify(body.error));
  return body.result;
}

async function sendTx(
  url: string,
  signerId: string,
  secretKey: string,
  receiverId: string,
  actions: NearActionInput[],
): Promise<string> {
  const k = parseNearEd25519SecretKey(secretKey);
  for (let attempt = 0; attempt < 5; attempt++) {
    const ak = await rpc<{ nonce: number; block_hash: string }>(url, "query", {
      request_type: "view_access_key",
      finality: "optimistic",
      account_id: signerId,
      public_key: k.publicKeyNear,
    });
    const signed = buildSignedNearTransaction({
      signerId,
      signerSeed32: k.seed32,
      signerPublicKey32: k.publicKey32,
      nonce: BigInt(ak.nonce) + 1n,
      receiverId,
      blockHashBase58: ak.block_hash,
      actions,
    });
    try {
      const out = await rpc<{ status?: { Failure?: unknown }; transaction: { hash: string } }>(
        url,
        "send_tx",
        { signed_tx_base64: signed.signedTxBase64, wait_until: "EXECUTED_OPTIMISTIC" },
      );
      if (out.status && "Failure" in out.status) {
        throw new Error(`Execution failed: ${JSON.stringify(out.status.Failure)}`);
      }
      return out.transaction?.hash ?? signed.txHashBase58;
    } catch (e) {
      if (attempt < 4 && String(e).includes("InvalidNonce")) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
  throw new Error("unreachable");
}

const call = (
  methodName: string,
  argsJson: Record<string, unknown>,
  depositYocto = 0n,
): NearActionInput => ({
  kind: "FunctionCall",
  methodName,
  argsJson,
  gas: 50_000_000_000_000n,
  depositYocto,
});

async function main() {
  const env = loadEnv();
  const rpcUrl = env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
  const escrowId = env.NEAR_ESCROW_CONTRACT_ID;
  const escrowKey = env.NEAR_ESCROW_PRIVATE_KEY ?? env.NEAR_OPERATOR_PRIVATE_KEY;
  if (!escrowId || !escrowKey) throw new Error("Run `npm run contract:deploy` first.");

  const suffix = randomBytes(4).toString("hex");
  const tokenId = `ledgerly-usdc-${suffix}.testnet`;
  const operatorId = `ledgerly-op-${suffix}.testnet`;
  const tokenKp = newKeypair();
  const opKp = newKeypair();
  await createAccount(tokenId, tokenKp.publicKeyNear);
  await createAccount(operatorId, opKp.publicKeyNear);

  const wasm = new Uint8Array(
    readFileSync(
      resolve(process.cwd(), "contracts/mock-usdc/target/wasm32-unknown-unknown/release/mock_usdc.wasm"),
    ),
  );
  console.log(`Deploying mock USDC (${wasm.byteLength} bytes) to ${tokenId} ...`);
  const deployTx = await sendTx(rpcUrl, tokenId, tokenKp.secretKeyNear, tokenId, [
    { kind: "DeployContract", wasmBytes: wasm },
    call("new", {}),
  ]);
  console.log(`✓ Token deploy tx: https://testnet.nearblocks.io/txns/${deployTx}`);

  const setTokenTx = await sendTx(rpcUrl, escrowId, escrowKey, escrowId, [
    call("set_token", { token: tokenId }),
    call("add_operator", { operator: operatorId }),
  ]);
  console.log(`✓ Escrow set_token + add_operator tx: https://testnet.nearblocks.io/txns/${setTokenTx}`);

  // Faucet auto-registers storage, so escrow + operator need no storage_deposit.
  const faucetTx = await sendTx(rpcUrl, operatorId, opKp.secretKeyNear, tokenId, [
    call("faucet", { account_id: escrowId, amount: "1000000" }),
    call("faucet", { account_id: operatorId, amount: "10000000000" }),
  ]);
  console.log(`✓ Faucet tx: https://testnet.nearblocks.io/txns/${faucetTx}`);

  const content = [
    "# Updated by scripts/deploy-usdc.ts",
    `NEAR_RPC_URL=${rpcUrl}`,
    `NEAR_ESCROW_CONTRACT_ID=${escrowId}`,
    `NEAR_ESCROW_PRIVATE_KEY=${escrowKey}`,
    `NEAR_USDC_CONTRACT_ID=${tokenId}`,
    `NEAR_OPERATOR_ACCOUNT_ID=${operatorId}`,
    `NEAR_OPERATOR_PRIVATE_KEY=${opKp.secretKeyNear}`,
    `LEDGERLY_INDEXER_TOKEN=${env.LEDGERLY_INDEXER_TOKEN ?? "ledgerly_testnet_indexer_secret"}`,
    "",
  ].join("\n");
  writeFileSync(resolve(process.cwd(), ".env.local"), content, "utf8");
  console.log("✓ Rewrote .env.local");

  // Live smoke test: operator -> ft_transfer_call -> escrow, then release back to operator.
  const gw = new NearRpcChainGateway({
    rpcUrl,
    escrowContractId: escrowId as never,
    usdcContractId: tokenId as never,
    operatorAccountId: operatorId as never,
    operatorPrivateKey: opKp.secretKeyNear,
  });
  const escrow = randomBytes(32).toString("hex") as never;
  const commitment = randomBytes(32).toString("hex");
  const reg = await gw.registerEscrow({
    escrowId: escrow,
    kind: "Payment",
    commitment,
    refundAfterNs: BigInt(Date.now() + 48 * 3600 * 1000) * 1_000_000n,
  });
  console.log(`✓ register(): ${reg.txHash}`);
  const dep = await gw.simulateDeposit({
    escrowId: escrow,
    depositor: operatorId as never,
    amountMinor: 25_000_000n,
  });
  console.log(`✓ ft_transfer_call() real USDC deposit: https://testnet.nearblocks.io/txns/${dep}`);
  const held = await gw.getEscrow(escrow);
  console.log(`✓ get_escrow(): status=${held?.status} held=${held?.heldMinor.toString()}`);
  const rel = await gw.release({
    escrowId: escrow,
    receiver: operatorId as never,
    amountMinor: 25_000_000n,
  });
  console.log(`✓ release() real USDC payout: https://testnet.nearblocks.io/txns/${rel.txHash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
