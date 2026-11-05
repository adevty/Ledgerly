import { describe, expect, it } from "vitest";
import { unwrap, type GrantId, type OrgId } from "@/shared";
import {
  appendAuditEntry,
  canonicalJson,
  computeCommitment,
  generateX25519KeyPair,
  openAndVerifyPayload,
  sealPayload,
  verifyAuditChain,
  verifyCommitment,
  ViewKeyGrant,
  type AuditLogEntry,
  type DisclosureScope,
} from "./index";

const T0 = new Date("2026-11-05T10:00:00Z");
const T_EXP = new Date("2026-11-12T10:00:00Z");
const ORG_ID = "org_sari" as OrgId;
const SALT = "a".repeat(64);

describe("canonicalJson & commitment", () => {
  it("produces identical commitments regardless of key order", () => {
    const a = { orderRef: "ORD-123", buyer: { name: "Alice", country: "SG" }, items: [2, 1] };
    const b = { items: [2, 1], buyer: { country: "SG", name: "Alice" }, orderRef: "ORD-123" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    const c1 = computeCommitment(a, SALT);
    const c2 = computeCommitment(b, SALT);
    expect(c1).toBe(c2);
    expect(verifyCommitment(a, SALT, c1)).toBe(true);
    expect(verifyCommitment({ ...a, orderRef: "ORD-999" }, SALT, c1)).toBe(false);
  });
});

describe("Envelope encryption + selective disclosure via ViewKeyGrant", () => {
  const orgKeys = generateX25519KeyPair();
  const auditorKeys = generateX25519KeyPair();
  const wrongKeys = generateX25519KeyPair();

  const secretPayload = {
    orderRef: "INV-2026-0042",
    customerEmail: "buyer@example.com",
    memo: "Handcrafted rattan lamp",
    amountMinor: "120000000",
  };

  it("seals payload for org, opens & verifies commitment, and rejects tampered commitment", () => {
    const env = unwrap(sealPayload(secretPayload, orgKeys.publicKeyHex));
    const opened = unwrap(
      openAndVerifyPayload<typeof secretPayload>({
        ciphertextHex: env.ciphertextHex,
        wrappedDekHex: env.wrappedDekHex,
        saltHex: env.saltHex,
        expectedCommitment: env.commitment,
        privateKeyHex: orgKeys.privateKeyHex,
      }),
    );
    expect(opened).toEqual(secretPayload);

    // Wrong private key cannot unwrap DEK
    const wrongKeyAttempt = openAndVerifyPayload({
      ciphertextHex: env.ciphertextHex,
      wrappedDekHex: env.wrappedDekHex,
      saltHex: env.saltHex,
      expectedCommitment: env.commitment,
      privateKeyHex: wrongKeys.privateKeyHex,
    });
    expect(!wrongKeyAttempt.ok && wrongKeyAttempt.error.code).toBe("CRYPTO_ERROR");

    // Tampered on-chain commitment fails verification
    const tamperedCommitment = openAndVerifyPayload({
      ciphertextHex: env.ciphertextHex,
      wrappedDekHex: env.wrappedDekHex,
      saltHex: env.saltHex,
      expectedCommitment: "b".repeat(64),
      privateKeyHex: orgKeys.privateKeyHex,
    });
    expect(!tamperedCommitment.ok && tamperedCommitment.error.code).toBe("COMMITMENT_MISMATCH");
  });

  it("issues scoped ViewKeyGrant, re-wraps DEK for auditor, and enforces scope/expiry/revocation", () => {
    const env = unwrap(sealPayload(secretPayload, orgKeys.publicKeyHex));
    const scope: DisclosureScope = {
      orgId: ORG_ID,
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-11-30T23:59:59Z"),
      kinds: ["PAYMENT"],
    };

    const grant = unwrap(
      ViewKeyGrant.issue({
        id: "grant_1" as GrantId,
        orgId: ORG_ID,
        auditorPublicKeyHex: auditorKeys.publicKeyHex,
        scope,
        expiresAt: T_EXP,
        now: T0,
      }),
    );

    const count = unwrap(
      grant.authorizeRecords(
        [
          {
            recordId: "pr_1",
            orgId: ORG_ID,
            kind: "PAYMENT",
            createdAt: T0,
            orgWrappedDekHex: env.wrappedDekHex,
          },
        ],
        orgKeys.privateKeyHex,
        T0,
      ),
    );
    expect(count).toBe(1);

    // Auditor unwraps with their own private key and verifies against on-chain commitment
    const auditorWrappedDek = unwrap(grant.getAuditorWrappedDek("pr_1", T0));
    const decryptedByAuditor = unwrap(
      openAndVerifyPayload<typeof secretPayload>({
        ciphertextHex: env.ciphertextHex,
        wrappedDekHex: auditorWrappedDek,
        saltHex: env.saltHex,
        expectedCommitment: env.commitment,
        privateKeyHex: auditorKeys.privateKeyHex,
      }),
    );
    expect(decryptedByAuditor).toEqual(secretPayload);

    // Out-of-scope record (REMITTANCE when scope only allows PAYMENT) is rejected
    const outOfScope = grant.authorizeRecords(
      [
        {
          recordId: "rm_1",
          orgId: ORG_ID,
          kind: "REMITTANCE",
          createdAt: T0,
          orgWrappedDekHex: env.wrappedDekHex,
        },
      ],
      orgKeys.privateKeyHex,
      T0,
    );
    expect(!outOfScope.ok && outOfScope.error.code).toBe("OUT_OF_SCOPE");

    // Expired check
    const afterExpiry = new Date(T_EXP.getTime() + 1000);
    const expiredRes = grant.getAuditorWrappedDek("pr_1", afterExpiry);
    expect(!expiredRes.ok && expiredRes.error.code).toBe("GRANT_EXPIRED");

    // Revocation wipes wrapped keys and blocks access
    expect(unwrap(grant.revoke(T0))).toBe(true);
    const revokedRes = grant.getAuditorWrappedDek("pr_1", T0);
    expect(!revokedRes.ok && revokedRes.error.code).toBe("GRANT_REVOKED");
  });
});

describe("Tamper-evident AuditLog hash chain", () => {
  it("verifies valid chain and detects any modified entry", () => {
    const chain: AuditLogEntry[] = [];
    chain.push(
      appendAuditEntry(chain, {
        id: "log_1",
        actor: "owner@sari.shop",
        action: "ISSUE_VIEW_KEY",
        targetId: "grant_1",
        at: T0,
      }),
    );
    chain.push(
      appendAuditEntry(chain, {
        id: "log_2",
        actor: "auditor@kpmg.example",
        action: "READ_SCOPED_RECORDS",
        targetId: "grant_1",
        at: new Date(T0.getTime() + 5000),
      }),
    );

    expect(verifyAuditChain(chain)).toBe(true);

    const tampered: AuditLogEntry[] = [
      { ...chain[0]!, actor: "attacker@evil.example" },
      chain[1]!,
    ];
    expect(verifyAuditChain(tampered)).toBe(false);
  });
});
