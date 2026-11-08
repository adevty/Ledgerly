# Ledgerly Threat Model & Key Custody Architecture

**Status:** Current Architecture & Security Posture (Phase 2 / NEAR Hackathon)  
**Scope:** Privacy layer, X25519 key management, on-chain commitments, and threat boundaries.

---

## 1. Current Custody Architecture

In the current implementation, both the merchant organization keypair and the auditor X25519 keypair are generated and persisted in the local SQLite database table `runtime_meta` as plaintext PKCS#8 / DER byte hex strings (`SqliteRuntimeMetaStore.getOrCreateKeyPair`).

### Trust & Custody Model
* **Operator Custodial Model:** The backend server maintains custody of the organization private key (used to encrypt payment/remittance envelopes) and the auditor private key (used to decrypt scoped envelopes on demand for verification).
* **Decryption Execution:** Auditor record decryption is performed server-side within the active view-key grant scope (`ViewKeyUseCases.verifyScopedRecordsAsAuditor`). Plaintext records are returned to the authorized client session over HTTPS.

---

## 2. Threat Vector Protections

### Protected Against:
1. **Public Blockchain Observers & Competitors:**
   * Raw invoice details, recipient identities, bank/wire coordinates, fiat settlement amounts, and memo fields are never written to the NEAR blockchain.
   * On-chain state stores only an opaque envelope commitment: `sha256(canonicalJson(payload) || salt)`.
2. **Dictionary & Rainbow Table Attacks on Low-Entropy Payloads:**
   * High-entropy 32-byte cryptographic salts (`crypto.randomBytes(32)`) are concatenated with canonical JSON payloads before hashing.
   * Public chain observers cannot pre-compute or brute-force common payment amounts or counterparty IDs.
3. **Passive Tampering of Off-Chain Records:**
   * Any unauthorized modification to off-chain ledger payloads immediately causes commitment hash mismatches during auditor verification.
   * Audit log sequence numbers and root hashes form a tamper-evident SHA-256 chain anchored to NEAR smart contract state.

---

## 3. Current Limitations & Risks

1. **Host & Database Compromise:**
   * Because private keys reside in plaintext within SQLite (`runtime_meta`), an attacker obtaining root access, a filesystem dump, or an unencrypted database backup can extract the private keys and decrypt all historical records.
2. **Operator Trust Requirement:**
   * The business entity hosting the Ledgerly server has the capability to inspect plaintext records. The privacy guarantee is currently between the business and the public/competitors, not between the business and its hosting operator.
3. **Co-located Auditor Keys:**
   * Auditor keys currently reside on the same server as merchant keys, rather than in an isolated auditor-controlled security boundary.

---

## 4. Proposed Hardening Roadmap

### Proposal A: Master-Key Encryption at Rest (Near-Term Proposal)
* **Design:** Encrypt private key fields in `runtime_meta` using AES-256-GCM via `node:crypto`, deriving key-encryption keys from an environment variable `LEDGERLY_MASTER_KEY` (or external KMS like AWS KMS / GCP Secret Manager / Vault).
* **Tradeoffs:**
  * *Pros:* Database backups and SQLite disk images stolen at rest cannot be decrypted without the separate master key. Meets baseline SOC 2 and ISO 27001 requirements for key storage.
  * *Cons:* Keys remain in Node.js process memory during runtime. Does not protect against runtime process memory scraping or compromised server instances. Requires operational key rotation procedures.
* **Status:** *PROPOSAL ONLY — requires explicit human approval before implementation.*

### Proposal B: Client-Side Auditor Key Custody (Medium-Term)
* **Design:** Auditors generate X25519 keypairs locally within their browser or external CLI using WebCrypto. Only the auditor's public key is registered with Ledgerly.
* **Tradeoffs:**
  * *Pros:* True zero-knowledge auditing; the server operator cannot decrypt data on behalf of an auditor or intercept decrypted payloads.
  * *Cons:* Requires client-side envelope decryption UI/tooling and client-side handling of re-wrapped envelope symmetric keys.

### Proposal C: Confidential Computing / TEE (Long-Term)
* **Design:** Run the Ledgerly settlement engine inside a Trusted Execution Environment (e.g. NEAR AI Cloud / Intel SGX / AMD SEV).
* **Tradeoffs:** Hardware-enforced isolation where even the cloud host cannot inspect execution memory or disk contents.
