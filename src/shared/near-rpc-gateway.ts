import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type {
  ChainGateway,
  OnchainEscrowKind,
  OnchainEscrowStatus,
  OnchainEscrowView,
  OnchainEvent,
} from "./chain-gateway";
import type { AccountId, EscrowId, TxHash } from "./ids";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map<string, number>(
  Array.from(BASE58_ALPHABET).map((char, idx) => [char, idx]),
);

/**
 * Encode a byte buffer into Bitcoin/NEAR Base58 representation.
 */
export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++;
  }

  const digits: number[] = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    out += BASE58_ALPHABET[digits[i]!]!;
  }
  return out;
}

/**
 * Decode a Bitcoin/NEAR Base58 string into a Uint8Array.
 */
export function base58Decode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") {
    zeros++;
  }

  const bytes: number[] = [];
  for (let i = zeros; i < input.length; i++) {
    const ch = input[i]!;
    const val = BASE58_MAP.get(ch);
    if (val === undefined) {
      throw new Error(`Invalid base58 character '${ch}'`);
    }
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[zeros + i] = bytes[bytes.length - 1 - i]!;
  }
  return out;
}

/**
 * Parse a NEAR `ed25519:...` secret key into 32-byte seed and 32-byte public key.
 */
export function parseNearEd25519SecretKey(secretKeyStr: string): {
  seed32: Uint8Array;
  publicKey32: Uint8Array;
  publicKeyNear: string;
} {
  const cleaned = secretKeyStr.startsWith("ed25519:")
    ? secretKeyStr.slice("ed25519:".length).trim()
    : secretKeyStr.trim();
  const decoded = base58Decode(cleaned);
  if (decoded.length !== 64 && decoded.length !== 32) {
    throw new Error(
      `Expected 32-byte or 64-byte Ed25519 key in base58, got ${decoded.length} bytes`,
    );
  }
  const seed32 = decoded.slice(0, 32);

  // PKCS#8 DER prefix for a 32-byte Ed25519 private seed (RFC 8410)
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privKeyObj = createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, Buffer.from(seed32)]),
    format: "der",
    type: "pkcs8",
  });
  const pubKeyObj = createPublicKey(privKeyObj);
  const spkiDer = pubKeyObj.export({ format: "der", type: "spki" });
  const publicKey32 = new Uint8Array(spkiDer.subarray(spkiDer.length - 32));

  return {
    seed32,
    publicKey32,
    publicKeyNear: `ed25519:${base58Encode(publicKey32)}`,
  };
}

/**
 * Sign a 32-byte message hash (SHA-256 of Borsh-encoded NEAR Transaction) using Ed25519.
 */
export function signNearTransactionHash(
  txHash32: Uint8Array,
  seed32: Uint8Array,
): Uint8Array {
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privKeyObj = createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, Buffer.from(seed32)]),
    format: "der",
    type: "pkcs8",
  });
  const sig = sign(null, Buffer.from(txHash32), privKeyObj);
  return new Uint8Array(sig);
}

/**
 * Verify an Ed25519 signature over a 32-byte NEAR transaction hash.
 */
export function verifyNearTransactionSignature(
  txHash32: Uint8Array,
  signature64: Uint8Array,
  publicKey32: Uint8Array,
): boolean {
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const pubKeyObj = createPublicKey({
    key: Buffer.concat([spkiPrefix, Buffer.from(publicKey32)]),
    format: "der",
    type: "spki",
  });
  return verify(null, Buffer.from(txHash32), pubKeyObj, Buffer.from(signature64));
}

// ------------------------------------------------------------------ Borsh Writer

class BorshWriter {
  private chunks: Buffer[] = [];

  writeU8(v: number): void {
    const b = Buffer.alloc(1);
    b.writeUInt8(v, 0);
    this.chunks.push(b);
  }

  writeU32(v: number): void {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0, 0);
    this.chunks.push(b);
  }

  writeU64(v: bigint): void {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(v, 0);
    this.chunks.push(b);
  }

  writeU128(v: bigint): void {
    const b = Buffer.alloc(16);
    const low = v & 0xffffffffffffffffn;
    const high = (v >> 64n) & 0xffffffffffffffffn;
    b.writeBigUInt64LE(low, 0);
    b.writeBigUInt64LE(high, 8);
    this.chunks.push(b);
  }

  writeFixedBytes(bytes: Uint8Array): void {
    this.chunks.push(Buffer.from(bytes));
  }

  writeBytes(bytes: Uint8Array): void {
    this.writeU32(bytes.length);
    this.chunks.push(Buffer.from(bytes));
  }

  writeString(str: string): void {
    const utf8 = Buffer.from(str, "utf8");
    this.writeU32(utf8.length);
    this.chunks.push(utf8);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export type NearActionInput =
  | {
      kind: "DeployContract";
      wasmBytes: Uint8Array;
    }
  | {
      kind: "FunctionCall";
      methodName: string;
      argsJson: Record<string, unknown>;
      gas: bigint;
      depositYocto: bigint;
    };

/**
 * Serialize and sign a NEAR transaction into `signed_tx_base64` + compute its deterministic `txHash`.
 */
export function buildSignedNearTransaction(input: {
  signerId: string;
  signerSeed32: Uint8Array;
  signerPublicKey32: Uint8Array;
  nonce: bigint;
  receiverId: string;
  blockHashBase58: string;
  actions: readonly NearActionInput[];
}): {
  txHashBase58: TxHash;
  signedTxBase64: string;
  txBytes: Uint8Array;
  signature64: Uint8Array;
} {
  const blockHash32 = base58Decode(input.blockHashBase58);
  if (blockHash32.length !== 32) {
    throw new Error(`Invalid NEAR blockHash length: ${blockHash32.length}`);
  }

  const txWriter = new BorshWriter();
  txWriter.writeString(input.signerId);
  // PublicKey: 0 (ED25519) + 32 bytes
  txWriter.writeU8(0);
  txWriter.writeFixedBytes(input.signerPublicKey32);
  txWriter.writeU64(input.nonce);
  txWriter.writeString(input.receiverId);
  txWriter.writeFixedBytes(blockHash32);

  txWriter.writeU32(input.actions.length);
  for (const act of input.actions) {
    if (act.kind === "DeployContract") {
      // Action::DeployContract = enum index 1
      txWriter.writeU8(1);
      txWriter.writeBytes(act.wasmBytes);
    } else {
      // Action::FunctionCall = enum index 2
      txWriter.writeU8(2);
      txWriter.writeString(act.methodName);
      const argsBytes = Buffer.from(JSON.stringify(act.argsJson), "utf8");
      txWriter.writeBytes(argsBytes);
      txWriter.writeU64(act.gas);
      txWriter.writeU128(act.depositYocto);
    }
  }

  const txBytes = txWriter.toBuffer();
  const txHash32 = createHash("sha256").update(txBytes).digest();
  const signature64 = signNearTransactionHash(txHash32, input.signerSeed32);

  const signedWriter = new BorshWriter();
  signedWriter.writeFixedBytes(txBytes);
  // Signature: 0 (ED25519) + 64 bytes
  signedWriter.writeU8(0);
  signedWriter.writeFixedBytes(signature64);

  return {
    txHashBase58: base58Encode(txHash32) as TxHash,
    signedTxBase64: signedWriter.toBuffer().toString("base64"),
    txBytes: new Uint8Array(txBytes),
    signature64,
  };
}

/**
 * Parse NEP-297 `EVENT_JSON:{"standard":"ledgerly",...}` logs from NEAR transaction receipts.
 */
export function parseNep297EscrowEvents(
  logs: readonly string[],
  txHash: TxHash,
  blockHeight: bigint,
): OnchainEvent[] {
  const out: OnchainEvent[] = [];
  logs.forEach((line, idx) => {
    if (!line.startsWith("EVENT_JSON:")) return;
    try {
      const parsed = JSON.parse(line.slice("EVENT_JSON:".length)) as {
        standard?: string;
        event?: string;
        data?: Array<Record<string, unknown>> | Record<string, unknown>;
      };
      if (parsed.standard !== "ledgerly" && parsed.standard !== "ledgerly-escrow") return;
      const items: Array<Record<string, unknown>> = Array.isArray(parsed.data)
        ? parsed.data
        : parsed.data && typeof parsed.data === "object"
          ? [parsed.data]
          : [];

      for (const item of items) {
        const escrowId = String(item.escrow_id ?? "") as EscrowId;
        const amountMinor = BigInt(String(item.amount ?? "0"));
        if (parsed.event === "escrow_funded") {
          out.push({
            type: "OnchainDepositDetected",
            txHash,
            logIndex: idx,
            blockHeight,
            escrowId,
            depositor: String(item.depositor ?? "buyer.testnet") as AccountId,
            amountMinor,
          });
        } else if (parsed.event === "escrow_released") {
          out.push({
            type: "OnchainReleaseConfirmed",
            txHash,
            logIndex: idx,
            blockHeight,
            escrowId,
            amountMinor,
          });
        } else if (parsed.event === "escrow_refunded") {
          out.push({
            type: "OnchainRefundConfirmed",
            txHash,
            logIndex: idx,
            blockHeight,
            escrowId,
            amountMinor,
          });
        }
      }
    } catch {
      // Ignore malformed log lines
    }
  });
  return out;
}

export interface NearRpcChainGatewayConfig {
  readonly rpcUrl: string;
  readonly escrowContractId: AccountId;
  readonly usdcContractId: AccountId;
  readonly operatorAccountId: AccountId;
  readonly operatorPrivateKey: string;
}

const GAS_30_TGAS = 30_000_000_000_000n;
const GAS_50_TGAS = 50_000_000_000_000n;

/**
 * Production & Testnet `ChainGateway` adapter communicating directly with NEAR JSON-RPC.
 */
export class NearRpcChainGateway implements ChainGateway {
  private readonly rpcUrl: string;
  public readonly escrowContractId: AccountId;
  public readonly usdcContractId: AccountId;
  public readonly operatorAccountId: AccountId;
  private readonly seed32: Uint8Array;
  private readonly publicKey32: Uint8Array;
  private readonly publicKeyNear: string;

  private recordedEvents: OnchainEvent[] = [];
  private anchoredRoots: string[] = [];
  private latestBlockHeight = 185_420_000n;
  private lastUsedNonce = 0n;

  constructor(config: NearRpcChainGatewayConfig) {
    this.rpcUrl = config.rpcUrl;
    this.escrowContractId = config.escrowContractId;
    this.usdcContractId = config.usdcContractId;
    this.operatorAccountId = config.operatorAccountId;

    const parsed = parseNearEd25519SecretKey(config.operatorPrivateKey);
    this.seed32 = parsed.seed32;
    this.publicKey32 = parsed.publicKey32;
    this.publicKeyNear = parsed.publicKeyNear;
  }

  private async rpcCall<T>(
    method: string,
    params: unknown,
    timeoutMs = 8000,
    overrideRpcUrl?: string,
  ): Promise<T> {
    const targetUrl = overrideRpcUrl ?? this.rpcUrl;
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ledgerly-rpc",
        method,
        params,
      }),
    });
    if (!res.ok) {
      throw new Error(`NEAR RPC HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as {
      result?: T;
      error?: { name?: string; cause?: unknown; message?: string; data?: unknown };
    };
    if (body.error) {
      const errorCause = (body.error.cause as { cause?: string; name?: string })?.cause;
      if (errorCause === "NOT_OBSERVED" || body.error.name === "TIMEOUT_ERROR") {
        throw new Error(
          `Transaction was not observed on NEAR RPC (TIMEOUT / NOT_OBSERVED)`,
        );
      }
      throw new Error(
        `NEAR RPC Error (${body.error.name ?? "RPC_ERROR"}): ${
          body.error.message ?? ""
        } ${JSON.stringify(body.error.data ?? body.error.cause ?? body.error)}`,
      );
    }
    return body.result as T;
  }

  private async getAccessKeyNonceAndBlockHash(): Promise<{
    nonce: bigint;
    blockHash: string;
    blockHeight: bigint;
  }> {
    const ak = await this.rpcCall<{
      nonce: number;
      block_hash: string;
      block_height: number;
    }>("query", {
      request_type: "view_access_key",
      finality: "optimistic",
      account_id: this.operatorAccountId,
      public_key: this.publicKeyNear,
    });
    this.latestBlockHeight = BigInt(ak.block_height);
    const chainNextNonce = BigInt(ak.nonce) + 1n;
    const nextNonce =
      chainNextNonce > this.lastUsedNonce ? chainNextNonce : this.lastUsedNonce + 1n;
    this.lastUsedNonce = nextNonce;
    return {
      nonce: nextNonce,
      blockHash: ak.block_hash,
      blockHeight: BigInt(ak.block_height),
    };
  }

  public async sendFunctionCall(
    receiverId: string,
    methodName: string,
    argsJson: Record<string, unknown>,
    gas: bigint = GAS_30_TGAS,
    depositYocto: bigint = 0n,
  ): Promise<{ txHash: TxHash; logs: string[]; blockHeight: bigint }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { nonce, blockHash, blockHeight } = await this.getAccessKeyNonceAndBlockHash();
      const signed = buildSignedNearTransaction({
        signerId: this.operatorAccountId,
        signerSeed32: this.seed32,
        signerPublicKey32: this.publicKey32,
        nonce,
        receiverId,
        blockHashBase58: blockHash,
        actions: [
          {
            kind: "FunctionCall",
            methodName,
            argsJson,
            gas,
            depositYocto,
          },
        ],
      });

      try {
        const outcome = await this.rpcCall<{
          status?: { Failure?: unknown };
          transaction: { hash: string };
          transaction_outcome?: { outcome?: { logs?: string[] } };
          receipts_outcome?: Array<{ outcome?: { logs?: string[] } }>;
        }>("send_tx", {
          signed_tx_base64: signed.signedTxBase64,
          wait_until: "EXECUTED_OPTIMISTIC",
        });

        if (outcome.status && "Failure" in outcome.status) {
          throw new Error(
            `NEAR Transaction Execution Failed (${methodName}): ${JSON.stringify(outcome.status.Failure)}`,
          );
        }

        const txHash = (outcome.transaction?.hash ?? signed.txHashBase58) as TxHash;
        const logs: string[] = [];
        for (const l of outcome.transaction_outcome?.outcome?.logs ?? []) {
          logs.push(l);
        }
        for (const ro of outcome.receipts_outcome ?? []) {
          for (const l of ro.outcome?.logs ?? []) {
            logs.push(l);
          }
        }

        const parsedEvents = parseNep297EscrowEvents(logs, txHash, blockHeight);
        if (parsedEvents.length > 0) {
          this.recordedEvents.push(...parsedEvents);
        }

        return { txHash, logs, blockHeight };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const akMatch = msg.match(/"ak_nonce":(\d+)/);
        if (akMatch?.[1] && attempt < 2) {
          this.lastUsedNonce = BigInt(akMatch[1]);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Exhausted retries for ${methodName}`);
  }

  async registerEscrow(input: {
    escrowId: EscrowId;
    kind: OnchainEscrowKind;
    commitment: string;
    refundAfterNs: bigint;
  }): Promise<{ txHash: TxHash }> {
    const { txHash } = await this.sendFunctionCall(
      this.escrowContractId,
      "register",
      {
        escrow_id: input.escrowId,
        kind: input.kind,
        commitment: input.commitment,
        refund_after: Number(input.refundAfterNs),
      },
      GAS_30_TGAS,
      0n,
    );
    return { txHash };
  }

  async release(input: {
    escrowId: EscrowId;
    receiver: AccountId;
    amountMinor: bigint;
  }): Promise<{ txHash: TxHash }> {
    const { txHash } = await this.sendFunctionCall(
      this.escrowContractId,
      "release",
      {
        escrow_id: input.escrowId,
        receiver: input.receiver,
        amount: input.amountMinor.toString(),
      },
      GAS_50_TGAS,
      0n,
    );
    return { txHash };
  }

  async refund(input: {
    escrowId: EscrowId;
    amountMinor: bigint;
  }): Promise<{ txHash: TxHash }> {
    const { txHash } = await this.sendFunctionCall(
      this.escrowContractId,
      "refund",
      {
        escrow_id: input.escrowId,
        amount: input.amountMinor.toString(),
      },
      GAS_50_TGAS,
      0n,
    );
    return { txHash };
  }

  async anchorAuditRoot(logRootHex: string): Promise<{ txHash: TxHash }> {
    const { txHash } = await this.sendFunctionCall(
      this.escrowContractId,
      "anchor",
      {
        log_root: logRootHex,
      },
      GAS_30_TGAS,
      0n,
    );
    this.anchoredRoots.push(logRootHex);
    return { txHash };
  }

  getAnchoredRoots(): readonly string[] {
    return this.anchoredRoots;
  }

  async getEscrow(escrowId: EscrowId): Promise<OnchainEscrowView | null> {
    const argsBase64 = Buffer.from(
      JSON.stringify({ escrow_id: escrowId }),
      "utf8",
    ).toString("base64");

    const res = await this.rpcCall<{
      result: number[];
      block_height: number;
    }>("query", {
      request_type: "call_function",
      finality: "optimistic",
      account_id: this.escrowContractId,
      method_name: "get_escrow",
      args_base64: argsBase64,
    });

    this.latestBlockHeight = BigInt(res.block_height);
    const jsonStr = Buffer.from(res.result).toString("utf8");
    const parsed = JSON.parse(jsonStr) as {
      kind: OnchainEscrowKind;
      depositor: AccountId | null;
      held: string;
      commitment: string;
      status: OnchainEscrowStatus;
      refund_after: number;
    } | null;

    if (!parsed) return null;
    return {
      kind: parsed.kind,
      depositor: parsed.depositor,
      heldMinor: BigInt(parsed.held),
      commitment: parsed.commitment,
      status: parsed.status,
      refundAfterNs: BigInt(parsed.refund_after),
    };
  }

  /**
   * Execute an NEP-141 `ft_transfer_call` on the USDC token contract to fund an escrow on NEAR Testnet.
   */
  async simulateDeposit(input: {
    escrowId: EscrowId;
    depositor: AccountId;
    amountMinor: bigint;
    commitment?: string;
    kind?: OnchainEscrowKind;
    refundAfterNs?: bigint;
  }): Promise<TxHash> {
    const defaultRefundAfterNs = BigInt(Date.now() + 48 * 3600 * 1000) * 1_000_000n;
    const msgObj: Record<string, unknown> = {
      escrow_id: input.escrowId,
      depositor: input.depositor,
      refund_after: Number(input.refundAfterNs ?? defaultRefundAfterNs),
    };
    if (input.kind) msgObj.kind = input.kind;
    if (input.commitment) msgObj.commitment = input.commitment;

    const { txHash } = await this.sendFunctionCall(
      this.usdcContractId,
      "ft_transfer_call",
      {
        receiver_id: this.escrowContractId,
        amount: input.amountMinor.toString(),
        msg: JSON.stringify(msgObj),
      },
      GAS_50_TGAS,
      1n,
    );
    return txHash;
  }

  async pollEvents(fromBlockHeightExclusive: bigint): Promise<{
    readonly events: readonly OnchainEvent[];
    readonly latestBlockHeight: bigint;
  }> {
    const events = this.recordedEvents.filter(
      (e) => e.blockHeight > fromBlockHeightExclusive,
    );
    return {
      events,
      latestBlockHeight: this.latestBlockHeight,
    };
  }

  /**
   * Verify and ingest an external wallet transaction (`?transactionHashes=...` from MyNearWallet
   * or browser extension wallet) directly from NEAR JSON-RPC `tx` endpoint.
   */
  async ingestExternalTransaction(
    txHash: TxHash,
    senderAccountId?: AccountId,
  ): Promise<readonly OnchainEvent[]> {
    let resolvedSigner = senderAccountId;

    // If senderAccountId is not passed, attempt to query the Nearblocks indexer to resolve signer_account_id
    if (!resolvedSigner) {
      try {
        const isTestnet = this.rpcUrl.includes("testnet") || this.rpcUrl.includes("test.");
        const indexerUrl = isTestnet
          ? `https://api-testnet.nearblocks.io/v3/txns/${txHash}`
          : `https://api.nearblocks.io/v3/txns/${txHash}`;
        const res = await fetch(indexerUrl, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const body = (await res.json()) as { data?: { signer_account_id?: string } };
          if (body.data?.signer_account_id) {
            resolvedSigner = body.data.signer_account_id as AccountId;
          }
        }
      } catch {
        // Fallback to candidates below
      }
    }

    const candidateAccounts: AccountId[] = Array.from(
      new Set([
        ...(resolvedSigner ? [resolvedSigner] : []),
        this.escrowContractId,
        this.operatorAccountId,
      ]),
    );

    let outcome: {
      status?: { Failure?: unknown };
      transaction_outcome?: { outcome?: { logs?: string[] } };
      receipts_outcome?: Array<{ outcome?: { logs?: string[] } }>;
    } | null = null;
    let lastError: unknown = null;

    const rpcEndpoints = Array.from(
      new Set([
        this.rpcUrl,
        ...(this.rpcUrl.includes("testnet") || this.rpcUrl.includes("test.")
          ? ["https://archival-rpc.testnet.near.org"]
          : []),
      ]),
    );

    for (const rpcUrl of rpcEndpoints) {
      if (outcome) break;
      for (const candidate of candidateAccounts) {
        try {
          const res = await this.rpcCall<{
            status?: { Failure?: unknown };
            transaction_outcome?: { outcome?: { logs?: string[] } };
            receipts_outcome?: Array<{ outcome?: { logs?: string[] } }>;
          }>("tx", [txHash, candidate], 5000, rpcUrl);
          if (res && (res.transaction_outcome || res.receipts_outcome || res.status)) {
            outcome = res;
            break;
          }
        } catch (err) {
          lastError = err;
        }
      }
    }

    if (!outcome) {
      throw new Error(
        `Transaction ${txHash} not found on NEAR RPC: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }

    if (outcome.status && "Failure" in outcome.status) {
      throw new Error(
        `External wallet transaction failed on-chain: ${JSON.stringify(outcome.status.Failure)}`,
      );
    }

    const logs: string[] = [];
    for (const l of outcome.transaction_outcome?.outcome?.logs ?? []) {
      logs.push(l);
    }
    for (const ro of outcome.receipts_outcome ?? []) {
      for (const l of ro.outcome?.logs ?? []) {
        logs.push(l);
      }
    }

    this.latestBlockHeight += 1n;
    const parsedEvents = parseNep297EscrowEvents(logs, txHash, this.latestBlockHeight);
    if (parsedEvents.length > 0) {
      this.recordedEvents.push(...parsedEvents);
    }
    return parsedEvents;
  }
}
