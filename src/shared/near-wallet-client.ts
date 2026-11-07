"use client";

export type NearWalletProviderKind =
  | "METEOR_WALLET"
  | "MY_NEAR_WALLET"
  | "EMBEDDED_TESTNET_SIGNER";

export interface NearWalletSession {
  readonly accountId: string;
  readonly publicKey: string;
  readonly provider: NearWalletProviderKind;
  readonly network: "testnet" | "mainnet";
  readonly connectedAtIso: string;
}

interface MeteorComInjectedObject {
  sendMessageData: (data: Record<string, unknown>) => void;
  addMessageDataListener: (listener: (data: MeteorPostMessageResponse) => void) => void;
}

interface MeteorPostMessageResponse {
  uid?: string;
  status?: string;
  endTags?: string[];
  message?: string;
  payload?: {
    accountId?: string;
    allKeys?: string[];
    publicKey?: string;
    signature?: string;
    [key: string]: unknown;
  };
}

declare global {
  interface Window {
    meteorCom?: MeteorComInjectedObject;
    meteorWallet?: unknown;
  }
}

const STORAGE_KEY = "ledgerly_near_wallet_session_v1";
const METEOR_WALLET_BASE_URL = "https://wallet.meteorwallet.app";
const METEOR_POPUP_WIDTH = 500;
const METEOR_POPUP_HEIGHT = 720;
const METEOR_PING_INTERVAL_MS = 450;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
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
  let out = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    out += BASE58_ALPHABET[digits[i]!];
  }
  return out;
}

function randomUid(len = 21): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
  const bytes = new Uint8Array(len);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(bytes);
  }
  let id = "";
  for (let i = 0; i < len; i++) {
    id += alphabet[bytes[i]! & 63];
  }
  return id;
}

export async function generateRandomNearPublicKey(): Promise<string> {
  let pubBytes = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto) {
    try {
      const kp = (await window.crypto.subtle.generateKey(
        { name: "Ed25519" },
        true,
        ["sign", "verify"],
      )) as CryptoKeyPair;
      const rawPub = await window.crypto.subtle.exportKey("raw", kp.publicKey);
      pubBytes = new Uint8Array(rawPub);
    } catch {
      window.crypto.getRandomValues(pubBytes);
    }
  }
  return `ed25519:${encodeBase58(pubBytes)}`;
}

/**
 * Check whether the Meteor Wallet browser extension content script (`window.meteorCom`) is active.
 */
export function isMeteorExtensionDetected(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.meteorCom && typeof window.meteorCom.sendMessageData === "function");
}

export function loadNearWalletSession(): NearWalletSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NearWalletSession;
    if (!parsed.accountId || !parsed.publicKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveNearWalletSession(session: NearWalletSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function disconnectNearWallet(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Execute an action against the Meteor Wallet Chrome/Brave Extension (`window.meteorCom`)
 * or fallback to the official Meteor Web Wallet popup (`https://wallet.meteorwallet.app/connect/...`).
 * Implements the exact `@meteorwallet/sdk` `MeteorPostMessenger` protocol.
 */
async function runMeteorPostMessageAction(params: {
  network: "testnet" | "mainnet";
  actionType: "login" | "verify_owner" | "sign";
  inputs: Record<string, unknown>;
}): Promise<MeteorPostMessageResponse["payload"]> {
  if (typeof window === "undefined") {
    throw new Error("Meteor Wallet can only be connected in the browser.");
  }

  // Wait briefly in case the extension content-script is still injecting `window.meteorCom`
  if (!window.meteorCom) {
    await new Promise((r) => setTimeout(r, 120));
  }

  const uid = randomUid(21);
  const useExtension = Boolean(
    window.meteorCom && typeof window.meteorCom.sendMessageData === "function",
  );
  const walletOrigin = new URL(METEOR_WALLET_BASE_URL).origin;

  let popupWin: Window | null = null;
  if (!useExtension) {
    const w = METEOR_POPUP_WIDTH;
    const h = METEOR_POPUP_HEIGHT;
    const topWin = window.top ?? window;
    const y = Math.max(0, Math.round(topWin.outerHeight / 2 + topWin.screenY - h / 2));
    const x = Math.max(0, Math.round(topWin.outerWidth / 2 + topWin.screenX - w / 2));
    const qs = new URLSearchParams({
      source: "wpm",
      connectionUid: uid,
      pageUri: encodeURIComponent(window.location.href),
    }).toString();

    popupWin = window.open(
      `${METEOR_WALLET_BASE_URL}/connect/${params.network}/${params.actionType}?${qs}`,
      "_blank",
      `popup=1,width=${w},height=${h},top=${y},left=${x}`,
    );
    if (!popupWin) {
      throw new Error(
        "Meteor Wallet extension was not detected and popup window was blocked by the browser.",
      );
    }
  }

  return new Promise((resolve, reject) => {
    let status = "initializing";
    let endTags: string[] = [];
    let wasOpened = useExtension;
    let settled = false;

    const sendFrame = () => {
      const msg: Record<string, unknown> = {
        endTags,
        actionType: params.actionType,
        status,
        uid,
        network: params.network,
      };
      if (status === "initializing") {
        msg.inputs = params.inputs;
      }

      if (useExtension) {
        window.meteorCom?.sendMessageData(msg);
      } else if (popupWin && !popupWin.closed) {
        wasOpened = true;
        popupWin.postMessage(msg, walletOrigin);
      }
    };

    const cleanup = (intervalId: ReturnType<typeof setInterval>) => {
      clearInterval(intervalId);
      if (!useExtension) {
        window.removeEventListener("message", onWinMessage);
      }
    };

    const handleIncoming = (data: MeteorPostMessageResponse | undefined) => {
      if (!data || data.uid !== uid || settled) return;

      if (data.status === "attempting_reconnect") {
        status = "initializing";
        sendFrame();
        return;
      }

      if (data.status === "connected" && status === "initializing") {
        status = "connected";
        return;
      }

      if (data.status === "closed_success") {
        settled = true;
        status = "closed_success";
        sendFrame();
        cleanup(intervalId);
        resolve(data.payload);
        return;
      }

      if (data.status === "closed_fail" || data.status === "closed_window") {
        settled = true;
        status = data.status;
        endTags = data.endTags ?? [];
        sendFrame();
        cleanup(intervalId);
        const tagMsg = data.endTags?.length ? ` (${data.endTags.join(", ")})` : "";
        reject(
          new Error(
            data.message ??
              (data.status === "closed_window"
                ? "Meteor Wallet window was closed before completing sign-in."
                : `Meteor Wallet rejected the connection request${tagMsg}.`),
          ),
        );
      }
    };

    const onWinMessage = (event: MessageEvent) => {
      handleIncoming(event.data as MeteorPostMessageResponse | undefined);
    };

    if (useExtension) {
      window.meteorCom!.addMessageDataListener(handleIncoming);
    } else {
      window.addEventListener("message", onWinMessage);
    }

    const intervalId = setInterval(() => {
      if (settled) return;
      if (!useExtension && popupWin && popupWin.closed && wasOpened) {
        settled = true;
        cleanup(intervalId);
        reject(new Error("Meteor Wallet popup window was closed before completing sign-in."));
        return;
      }
      sendFrame();
    }, METEOR_PING_INTERVAL_MS);

    sendFrame();
  });
}

/**
 * Connect to Meteor Wallet (Browser Extension via `window.meteorCom` or Meteor Web Popup).
 * Automatically falls back to `mainnet` `verify_owner` if the user's Meteor Wallet only
 * contains a Mainnet account and no Testnet account.
 */
export async function connectMeteorWallet(
  contractId: string,
  preferredNetwork: "testnet" | "mainnet" = "testnet",
): Promise<NearWalletSession> {
  const generatedPublicKey = await generateRandomNearPublicKey();

  // If Mainnet is selected, ensure contractId does not point to a .testnet account
  const targetContractId =
    preferredNetwork === "mainnet" && contractId.endsWith(".testnet")
      ? "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
      : contractId;

  try {
    const payload = await runMeteorPostMessageAction({
      network: preferredNetwork,
      actionType: "login",
      inputs: {
        public_key: generatedPublicKey,
        type: "ALL_METHODS",
        contract_id: targetContractId,
      },
    });

    const accountId = payload?.accountId;
    if (!accountId) {
      throw new Error("Meteor Wallet did not return an accountId.");
    }

    const session: NearWalletSession = {
      accountId,
      publicKey: payload?.allKeys?.[0] ?? generatedPublicKey,
      provider: "METEOR_WALLET",
      network: preferredNetwork,
      connectedAtIso: new Date().toISOString(),
    };
    saveNearWalletSession(session);
    return session;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If user closed the window intentionally, rethrow immediately
    if (msg.toLowerCase().includes("closed")) {
      throw err;
    }

    // Attempt verify_owner fallback on the preferred network
    try {
      const verifyPayload = await runMeteorPostMessageAction({
        network: preferredNetwork,
        actionType: "verify_owner",
        inputs: {
          message: `Authenticate with Ledgerly Checkout on ${preferredNetwork.toUpperCase()}`,
        },
      });
      if (verifyPayload?.accountId) {
        const session: NearWalletSession = {
          accountId: verifyPayload.accountId,
          publicKey: verifyPayload.publicKey ?? generatedPublicKey,
          provider: "METEOR_WALLET",
          network: preferredNetwork,
          connectedAtIso: new Date().toISOString(),
        };
        saveNearWalletSession(session);
        return session;
      }
    } catch {
      // Secondary fallback below
    }

    // If testnet login failed because the user only has a Mainnet account in Meteor Wallet,
    // attempt `verify_owner` on Mainnet so they can still authenticate their Meteor Wallet.
    if (preferredNetwork === "testnet") {
      try {
        const verifyPayload = await runMeteorPostMessageAction({
          network: "mainnet",
          actionType: "verify_owner",
          inputs: {
            message: `Authenticate with Ledgerly Confidential Checkout (${targetContractId})`,
          },
        });
        if (verifyPayload?.accountId) {
          const session: NearWalletSession = {
            accountId: verifyPayload.accountId,
            publicKey: verifyPayload.publicKey ?? generatedPublicKey,
            provider: "METEOR_WALLET",
            network: "mainnet",
            connectedAtIso: new Date().toISOString(),
          };
          saveNearWalletSession(session);
          return session;
        }
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

/**
 * Connect an embedded NEAR Testnet buyer signer with a real Ed25519 keypair.
 */
export async function connectEmbeddedTestnetWallet(
  preferredAccountId = "kyoto-living.testnet",
): Promise<NearWalletSession> {
  const cleanAccount = preferredAccountId.trim().toLowerCase() || "kyoto-living.testnet";
  const publicKey = await generateRandomNearPublicKey();

  const session: NearWalletSession = {
    accountId:
      cleanAccount.endsWith(".testnet") || cleanAccount.endsWith(".near")
        ? cleanAccount
        : `${cleanAccount}.testnet`,
    publicKey,
    provider: "EMBEDDED_TESTNET_SIGNER",
    network: "testnet",
    connectedAtIso: new Date().toISOString(),
  };
  saveNearWalletSession(session);
  return session;
}

/**
 * Build the official MyNearWallet Testnet web login redirect URL.
 */
export function buildMyNearWalletLoginUrl(contractId: string, currentUrl: string): string {
  const url = new URL("https://testnet.mynearwallet.com/login/");
  url.searchParams.set("contract_id", contractId);
  url.searchParams.set("success_url", currentUrl);
  url.searchParams.set("failure_url", currentUrl);
  return url.toString();
}

/**
 * Inspect current browser URL query parameters for MyNearWallet callback (`?account_id=...`
 * or `?transactionHashes=...`).
 */
export function consumeNearWalletCallbackUrl(): {
  session: NearWalletSession | null;
  transactionHashes: string[];
} {
  if (typeof window === "undefined") {
    return { session: null, transactionHashes: [] };
  }

  const url = new URL(window.location.href);
  const accountId = url.searchParams.get("account_id");
  const publicKey = url.searchParams.get("public_key") ?? url.searchParams.get("all_keys");
  const txHashesRaw = url.searchParams.get("transactionHashes");

  let session: NearWalletSession | null = null;
  let dirty = false;

  if (accountId) {
    const fallbackBytes = new Uint8Array(32);
    window.crypto.getRandomValues(fallbackBytes);
    session = {
      accountId,
      publicKey: publicKey ? publicKey.split(",")[0]! : `ed25519:${encodeBase58(fallbackBytes)}`,
      provider: "MY_NEAR_WALLET",
      network: "testnet",
      connectedAtIso: new Date().toISOString(),
    };
    saveNearWalletSession(session);
    url.searchParams.delete("account_id");
    url.searchParams.delete("public_key");
    url.searchParams.delete("all_keys");
    dirty = true;
  }

  const transactionHashes = txHashesRaw
    ? txHashesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (txHashesRaw) {
    url.searchParams.delete("transactionHashes");
    dirty = true;
  }

  if (dirty) {
    window.history.replaceState({}, "", url.toString());
  }

  return { session, transactionHashes };
}

/**
 * Build the NEP-141 `ft_transfer_call` transaction preview for an escrow deposit.
 */
export function buildFtTransferCallPreview(input: {
  usdcContractId: string;
  escrowContractId: string;
  escrowId: string;
  depositorAccountId: string;
  amountDecimal: string;
}): {
  receiverId: string;
  methodName: "ft_transfer_call";
  gasTgas: string;
  attachedDepositYocto: string;
  args: {
    receiver_id: string;
    amount: string;
    msg: string;
  };
} {
  const amountMinor = BigInt(Math.round(Number(input.amountDecimal) * 1_000_000)).toString();
  const refundAfterNs = Number(BigInt(Date.now() + 48 * 3600 * 1000) * 1_000_000n);
  return {
    receiverId: input.usdcContractId,
    methodName: "ft_transfer_call",
    gasTgas: "50 TGas",
    attachedDepositYocto: "1 yoctoNEAR",
    args: {
      receiver_id: input.escrowContractId,
      amount: amountMinor,
      msg: JSON.stringify({
        escrow_id: input.escrowId,
        depositor: input.depositorAccountId,
        refund_after: refundAfterNs,
      }),
    },
  };
}


// ------------------------------------------------------------------ Wallet-signed deposits

const NEAR_TESTNET_RPC_URL = "https://test.rpc.fastnear.com";
const B58_MAP = new Map<string, number>(Array.from(BASE58_ALPHABET).map((c, i) => [c, i]));

function decodeBase58(input: string): Uint8Array {
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < input.length; i++) {
    const val = B58_MAP.get(input[i]!);
    if (val === undefined) throw new Error("Invalid base58 character in NEAR key/hash");
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
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i]!;
  return out;
}

/** Minimal browser-safe Borsh encoding of an UNSIGNED NEAR transaction with one FunctionCall. */
export function encodeUnsignedFunctionCallTx(input: {
  signerId: string;
  publicKeyNear: string;
  nonce: bigint;
  receiverId: string;
  blockHashBase58: string;
  methodName: string;
  argsJson: Record<string, unknown>;
  gas: bigint;
  depositYocto: bigint;
}): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const u32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    chunks.push(b);
  };
  const u64 = (v: bigint) => {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, v, true);
    chunks.push(b);
  };
  const u128 = (v: bigint) => {
    u64(v & 0xffffffffffffffffn);
    u64((v >> 64n) & 0xffffffffffffffffn);
  };
  const str = (v: string) => {
    const b = enc.encode(v);
    u32(b.length);
    chunks.push(b);
  };

  const pub = decodeBase58(input.publicKeyNear.replace(/^ed25519:/, ""));
  if (pub.length !== 32) throw new Error("Wallet public key must be a 32-byte ed25519 key.");
  const blockHash = decodeBase58(input.blockHashBase58);

  str(input.signerId);
  chunks.push(new Uint8Array([0]), pub); // PublicKey::ED25519
  u64(input.nonce);
  str(input.receiverId);
  chunks.push(blockHash);
  u32(1); // one action
  chunks.push(new Uint8Array([2])); // Action::FunctionCall
  str(input.methodName);
  const args = enc.encode(JSON.stringify(input.argsJson));
  u32(args.length);
  chunks.push(args);
  u64(input.gas);
  u128(input.depositYocto);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function nearRpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(NEAR_TESTNET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "ledgerly-client", method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: unknown };
  if (body.result === undefined) {
    throw new Error(`NEAR RPC error: ${JSON.stringify(body.error ?? "empty response")}`);
  }
  return body.result;
}

/** Pull a tx hash out of whatever shape the wallet returns (shape differs between versions). */
function extractTxHash(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown): string | null => {
    if (!v || typeof v !== "object" || seen.has(v)) return null;
    seen.add(v);
    const o = v as Record<string, unknown>;
    for (const k of ["transactionHash", "txHash", "transaction_hash"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    if (Array.isArray(o.transactionHashes) && typeof o.transactionHashes[0] === "string") {
      return o.transactionHashes[0] as string;
    }
    const tx = o.transaction as { hash?: unknown } | undefined;
    if (tx && typeof tx.hash === "string") return tx.hash;
    for (const child of Object.values(o)) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(payload);
}

/**
 * Ask the connected Meteor Wallet to sign + broadcast NEP-141 `ft_transfer_call(escrow)`.
 * The buyer's own wallet signs; the backend never touches the buyer's funds.
 *
 * The `sign` message shape (`inputs.transactions` = comma-joined base64 Borsh txs) mirrors
 * `@meteorwallet/sdk` `requestSignTransactions`; the wallet answers with `payload.executionOutcomes`.
 */
export async function signFtDepositWithMeteor(
  session: NearWalletSession,
  input: {
    usdcContractId: string;
    escrowContractId: string;
    escrowId: string;
    amountDecimal: string;
  },
): Promise<{ txHash: string | null }> {
  if (session.provider !== "METEOR_WALLET") {
    throw new Error("Connect Meteor Wallet to sign this deposit.");
  }
  if (session.network !== "testnet") {
    throw new Error("Escrow runs on NEAR Testnet; switch Meteor Wallet to a Testnet account.");
  }

  // Meteor may have returned a locally generated login key; use a real on-chain full-access key.
  let publicKey = session.publicKey;
  let nonceBase: { nonce: number; block_hash: string } | null = null;
  try {
    nonceBase = await nearRpc("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: session.accountId,
      public_key: publicKey,
    });
  } catch {
    const list = await nearRpc<{ keys: Array<{ public_key: string; access_key: { permission: unknown } }> }>(
      "query",
      { request_type: "view_access_key_list", finality: "final", account_id: session.accountId },
    );
    const full = list.keys.find((k) => k.access_key.permission === "FullAccess");
    if (!full) throw new Error(`No full-access key found for ${session.accountId}.`);
    publicKey = full.public_key;
    nonceBase = await nearRpc("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: session.accountId,
      public_key: publicKey,
    });
  }

  const call = buildFtTransferCallPreview({
    usdcContractId: input.usdcContractId,
    escrowContractId: input.escrowContractId,
    escrowId: input.escrowId,
    depositorAccountId: session.accountId,
    amountDecimal: input.amountDecimal,
  });

  const txBytes = encodeUnsignedFunctionCallTx({
    signerId: session.accountId,
    publicKeyNear: publicKey,
    nonce: BigInt(nonceBase!.nonce) + 1n,
    receiverId: call.receiverId,
    blockHashBase58: nonceBase!.block_hash,
    methodName: call.methodName,
    argsJson: call.args,
    gas: 50_000_000_000_000n,
    depositYocto: 1n,
  });
  let bin = "";
  for (const b of txBytes) bin += String.fromCharCode(b);

  const payload = await runMeteorPostMessageAction({
    network: "testnet",
    actionType: "sign",
    inputs: { transactions: btoa(bin) }, // SDK sends a comma-joined base64 string, not an array
  });
  return { txHash: extractTxHash(payload) };
}
