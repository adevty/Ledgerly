import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { domainError, err, ok, type Commitment, type DomainError, type Result } from "@/shared";
import { computeCommitment, verifyCommitment } from "./commitment";

/**
 * X25519 key pair encoded as hex (SPKI DER for public, PKCS8 DER for private)
 * so keys are self-describing and interoperable across Node.js and WebCrypto.
 */
export interface KeyPairHex {
  readonly publicKeyHex: string;
  readonly privateKeyHex: string;
}

/**
 * Encrypted record stored off-chain in PostgreSQL (AD-3).
 * - `ciphertextHex`: AES-256-GCM(DEK, iv || tag || canonical_payload)
 * - `wrappedDekHex`: DEK wrapped to the organization's X25519 public key
 * - `saltHex`: 32 random bytes used in the commitment
 * - `commitment`: `sha256(canonicalJSON(payload) || salt)` anchored on-chain
 */
export interface EncryptedEnvelope {
  readonly ciphertextHex: string;
  readonly wrappedDekHex: string;
  readonly saltHex: string;
  readonly commitment: Commitment;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = Buffer.from("ledgerly-dek-wrap-v1", "utf8");

/** Generate a fresh X25519 key pair (for an Organization or an Auditor). */
export function generateX25519KeyPair(): KeyPairHex {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKeyHex: publicKey.export({ type: "spki", format: "der" }).toString("hex"),
    privateKeyHex: privateKey.export({ type: "pkcs8", format: "der" }).toString("hex"),
  };
}

/** Encrypt arbitrary bytes with a 32-byte symmetric key using AES-256-GCM. */
export function aesGcmEncrypt(key32: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key32, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("hex");
}

/** Decrypt AES-256-GCM hex payload (`iv || tag || ciphertext`). */
export function aesGcmDecrypt(key32: Buffer, packedHex: string): Result<Buffer, DomainError> {
  try {
    const buf = Buffer.from(packedHex, "hex");
    if (buf.length < IV_BYTES + TAG_BYTES) {
      return err(domainError("CRYPTO_ERROR", "Ciphertext too short"));
    }
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key32, iv);
    decipher.setAuthTag(tag);
    return ok(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch {
    return err(domainError("CRYPTO_ERROR", "AES-GCM decryption or authentication failed"));
  }
}

/**
 * Wrap a 32-byte Data Encryption Key (DEK) to a recipient's X25519 public key
 * using ephemeral-static ECDH + HKDF-SHA256 + AES-256-GCM.
 */
export function wrapDekForRecipient(dek32: Buffer, recipientPublicKeyHex: string): Result<string, DomainError> {
  try {
    const recipientPub = createPublicKey({
      key: Buffer.from(recipientPublicKeyHex, "hex"),
      format: "der",
      type: "spki",
    });
    const ephemeral = generateKeyPairSync("x25519");
    const ephPubDer = ephemeral.publicKey.export({ type: "spki", format: "der" });
    const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipientPub });
    const wrappingKey = Buffer.from(hkdfSync("sha256", shared, ephPubDer, HKDF_INFO, 32));
    const sealedDekHex = aesGcmEncrypt(wrappingKey, dek32);
    // Format: 2-byte length of ephemeral SPKI DER || ephemeral SPKI DER || sealedDek
    const sealedBuf = Buffer.from(sealedDekHex, "hex");
    const header = Buffer.alloc(2);
    header.writeUInt16BE(ephPubDer.length, 0);
    return ok(Buffer.concat([header, ephPubDer, sealedBuf]).toString("hex"));
  } catch {
    return err(domainError("CRYPTO_ERROR", "Invalid recipient X25519 public key"));
  }
}

/** Unwrap a 32-byte DEK using the recipient's X25519 private key. */
export function unwrapDekWithPrivateKey(
  wrappedDekHex: string,
  recipientPrivateKeyHex: string,
): Result<Buffer, DomainError> {
  try {
    const buf = Buffer.from(wrappedDekHex, "hex");
    if (buf.length < 2) return err(domainError("CRYPTO_ERROR", "Malformed wrapped DEK"));
    const ephLen = buf.readUInt16BE(0);
    if (buf.length < 2 + ephLen + IV_BYTES + TAG_BYTES) {
      return err(domainError("CRYPTO_ERROR", "Truncated wrapped DEK"));
    }
    const ephPubDer = buf.subarray(2, 2 + ephLen);
    const sealedDekHex = buf.subarray(2 + ephLen).toString("hex");
    const ephPub = createPublicKey({ key: ephPubDer, format: "der", type: "spki" });
    const priv = createPrivateKey({
      key: Buffer.from(recipientPrivateKeyHex, "hex"),
      format: "der",
      type: "pkcs8",
    });
    const shared = diffieHellman({ privateKey: priv, publicKey: ephPub });
    const wrappingKey = Buffer.from(hkdfSync("sha256", shared, ephPubDer, HKDF_INFO, 32));
    return aesGcmDecrypt(wrappingKey, sealedDekHex);
  } catch {
    return err(domainError("CRYPTO_ERROR", "Failed to unwrap DEK with private key"));
  }
}

/**
 * Re-wrap a record's DEK from the organization's key to a scoped auditor's
 * X25519 public key WITHOUT re-encrypting the underlying ciphertext (AD-3).
 */
export function rewrapDekForAuditor(
  orgWrappedDekHex: string,
  orgPrivateKeyHex: string,
  auditorPublicKeyHex: string,
): Result<string, DomainError> {
  const dek = unwrapDekWithPrivateKey(orgWrappedDekHex, orgPrivateKeyHex);
  if (!dek.ok) return dek;
  return wrapDekForRecipient(dek.value, auditorPublicKeyHex);
}

/**
 * Seal a business payload into an `EncryptedEnvelope` + on-chain commitment.
 */
export function sealPayload<T>(
  payload: T,
  orgPublicKeyHex: string,
): Result<EncryptedEnvelope, DomainError> {
  const dek = randomBytes(32);
  const saltHex = randomBytes(32).toString("hex");
  const commitment = computeCommitment(payload, saltHex);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertextHex = aesGcmEncrypt(dek, plaintext);
  const wrapped = wrapDekForRecipient(dek, orgPublicKeyHex);
  if (!wrapped.ok) return wrapped;

  return ok({
    ciphertextHex,
    wrappedDekHex: wrapped.value,
    saltHex,
    commitment,
  });
}

/**
 * Open an `EncryptedEnvelope` (by org or by auditor using their wrapped DEK)
 * and cryptographically verify it against the expected on-chain commitment.
 */
export function openAndVerifyPayload<T>(input: {
  ciphertextHex: string;
  wrappedDekHex: string;
  saltHex: string;
  expectedCommitment: string;
  privateKeyHex: string;
}): Result<T, DomainError> {
  const dek = unwrapDekWithPrivateKey(input.wrappedDekHex, input.privateKeyHex);
  if (!dek.ok) return dek;
  const plainBuf = aesGcmDecrypt(dek.value, input.ciphertextHex);
  if (!plainBuf.ok) return plainBuf;

  let parsed: T;
  try {
    parsed = JSON.parse(plainBuf.value.toString("utf8")) as T;
  } catch {
    return err(domainError("CRYPTO_ERROR", "Decrypted payload is not valid JSON"));
  }

  if (!verifyCommitment(parsed, input.saltHex, input.expectedCommitment)) {
    return err(
      domainError(
        "COMMITMENT_MISMATCH",
        "Payload does not match on-chain commitment (tampering detected)",
      ),
    );
  }
  return ok(parsed);
}

/** Derive a deterministic 32-byte master key from a passphrase/env secret. */
export function deriveMasterKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}
