import { describe, expect, it } from "vitest";
import {
  FixedClock,
  InMemoryOutbox,
  MockChainGateway,
  MockFxAdapter,
  MockOffRampAdapter,
  MockScreeningAdapter,
  unwrap,
  type AccountId,
  type GrantId,
  type OrgId,
  type PaymentRequestId,
  type RemittanceId,
  type UserId,
} from "@/shared";
import {
  appendAuditEntry,
  generateX25519KeyPair,
  inspectAuditChain,
  sealPayload,
  verifyAuditChain,
  ViewKeyGrant,
  type AuditLogEntry,
  type DisclosureScope,
} from "@/modules/privacy/domain";
import { DisclosureUseCases } from "@/modules/privacy/application/use-cases";
import { PaymentUseCases } from "@/modules/payments/application/use-cases";
import { RemittanceUseCases } from "@/modules/remittance/application/use-cases";
import type { Actor } from "@/modules/identity/domain";
import {
  openLedgerlySqliteDb,
  SqliteIdempotencyStore,
  SqliteLedgerAdapter,
  SqlitePaymentRequestRepository,
  SqliteRemittanceRepository,
  SqliteRuntimeMetaStore,
  SqliteViewKeyGrantRepository,
} from "@/shared/sqlite-persistence";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const T0 = new Date("2026-11-05T12:00:00Z");
const T_EXP = new Date("2026-11-12T12:00:00Z");
const ORG_ID = "org_audit_test" as OrgId;
const OWNER: Actor = { userId: "u_owner" as UserId, orgId: ORG_ID, role: "OWNER" };

describe("Task B: Truthful Auditor States, Scope Enforcements & Tamper-Evident Hash Chain", () => {
  it("enforces expired, rotated/revoked, and wrong-scope grants correctly", async () => {
    const orgKeys = generateX25519KeyPair();
    const auditorKeys = generateX25519KeyPair();
    const clock = new FixedClock(T0);

    const scope: DisclosureScope = {
      orgId: ORG_ID,
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-11-30T23:59:59Z"),
      kinds: ["PAYMENT"], // Payments only
    };

    const grant = unwrap(
      ViewKeyGrant.issue({
        id: "grant_scoped_1" as GrantId,
        orgId: ORG_ID,
        auditorPublicKeyHex: auditorKeys.publicKeyHex,
        scope,
        expiresAt: T_EXP,
        now: T0,
      }),
    );

    const secretPayload = { orderRef: "ORD-99", amountMinor: "10000000" };
    const env = unwrap(sealPayload(secretPayload, orgKeys.publicKeyHex));

    // 1. Wrong scope: authorizing REMITTANCE when scope is PAYMENT only
    const wrongScopeRes = grant.authorizeRecords(
      [
        {
          recordId: "rm_wrong_scope",
          orgId: ORG_ID,
          kind: "REMITTANCE",
          createdAt: T0,
          orgWrappedDekHex: env.wrappedDekHex,
        },
      ],
      orgKeys.privateKeyHex,
      T0,
    );
    expect(wrongScopeRes.ok).toBe(false);
    if (!wrongScopeRes.ok) {
      expect(wrongScopeRes.error.code).toBe("OUT_OF_SCOPE");
    }

    // 2. Authorize valid in-scope PAYMENT record
    const authOk = unwrap(
      grant.authorizeRecords(
        [
          {
            recordId: "pr_valid",
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
    expect(authOk).toBe(1);

    // 3. Expired grant: advance clock past T_EXP
    const expiredRes = grant.getAuditorWrappedDek("pr_valid", new Date(T_EXP.getTime() + 1000));
    expect(expiredRes.ok).toBe(false);
    if (!expiredRes.ok) {
      expect(expiredRes.error.code).toBe("GRANT_EXPIRED");
    }

    // 4. Revocation (rotated out):
    unwrap(grant.revoke(T0));
    const revokedRes = grant.getAuditorWrappedDek("pr_valid", T0);
    expect(revokedRes.ok).toBe(false);
    if (!revokedRes.ok) {
      expect(revokedRes.error.code).toBe("GRANT_REVOKED");
    }
  });

  it("detects tampered on-chain commitment as mismatch, and unfunded quote as not-registered", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-audit-tamper-"));
    const dbPath = join(tempDir, "audit-tamper.sqlite");

    const clock = new FixedClock(T0);
    const orgKeys = generateX25519KeyPair();
    const auditorKeys = generateX25519KeyPair();

    try {
      const db = openLedgerlySqliteDb(dbPath);
      const outbox = new InMemoryOutbox();
      const meta = new SqliteRuntimeMetaStore(db);
      const paymentRepo = new SqlitePaymentRequestRepository(db, outbox);
      const remittanceRepo = new SqliteRemittanceRepository(db, outbox);
      const grantRepo = new SqliteViewKeyGrantRepository(db, outbox);
      const ledger = new SqliteLedgerAdapter(db);
      const idempotency = new SqliteIdempotencyStore(db);
      const chain = new MockChainGateway();
      const fx = new MockFxAdapter();
      const offRamp = new MockOffRampAdapter();
      const screening = new MockScreeningAdapter();

      const payments = new PaymentUseCases({
        repo: paymentRepo,
        chain,
        ledger,
        idempotency,
        clock,
        merchantNearAccounts: new Map([[ORG_ID, "merchant.testnet" as AccountId]]),
      });

      const remittances = new RemittanceUseCases({
        repo: remittanceRepo,
        fx,
        offRamp,
        screening,
        chain,
        ledger,
        idempotency,
        clock,
        offRampSettlementAccount: "offramp.ledgerly.testnet" as AccountId,
      });

      const disclosures = new DisclosureUseCases({
        grantRepo,
        paymentRepo,
        remittanceRepo,
        chain,
        clock,
        initialAuditLog: meta.loadAuditLog(),
        onAuditEntry: (entry) => meta.appendAuditEntry(entry),
      });

      // 1. Create a payment request and register a TAMPERED commitment on-chain
      const pr = unwrap(
        await payments.createPaymentRequest({
          idempotencyKey: "idem_pr_tamper",
          actor: OWNER,
          requestId: "pr_tampered" as PaymentRequestId,
          orgPublicKeyHex: orgKeys.publicKeyHex,
          orderRef: "ORD-GENUINE",
          description: "Genuine goods",
          amountDecimal: "100",
          expiresInSec: 3600,
        }),
      );

      // Register with tampered commitment
      await chain.registerEscrow({
        escrowId: pr.escrowId,
        kind: "Payment",
        commitment: "0000000000000000000000000000000000000000000000000000000000000000",
        refundAfterNs: 999999999999999999n,
      });

      // 2. Create a remittance quote that is NOT funded on-chain (expired or pending quote)
      const rm = unwrap(
        await remittances.createQuotedRemittance({
          idempotencyKey: "idem_rm_unfunded",
          actor: OWNER,
          remittanceId: "rm_unfunded" as RemittanceId,
          orgPublicKeyHex: orgKeys.publicKeyHex,
          sourceUsdcDecimal: "50",
          targetCurrency: "SGD",
          recipientType: "BANK",
          recipientName: "Tan Ah Kow",
          recipientAccountOrWallet: "DBS-123456",
          recipientCountry: "SG",
        }),
      );
      // Notice: NO chain.registerEscrow for rm; on-chain escrow is null

      // 3. Issue audit view key grant
      unwrap(
        await disclosures.issueScopedViewKey({
          actor: OWNER,
          grantId: "grant_tamper_test" as GrantId,
          auditorPublicKeyHex: auditorKeys.publicKeyHex,
          orgPrivateKeyHex: orgKeys.privateKeyHex,
          scope: {
            orgId: ORG_ID,
            from: new Date("2026-11-01T00:00:00Z"),
            to: new Date("2026-11-30T23:59:59Z"),
            kinds: ["PAYMENT", "REMITTANCE"],
          },
          expiresAt: T_EXP,
        }),
      );

      // 4. Verify as auditor
      const verified = unwrap(
        await disclosures.verifyScopedRecordsAsAuditor({
          grantId: "grant_tamper_test" as GrantId,
          auditorPrivateKeyHex: auditorKeys.privateKeyHex,
        }),
      );
      expect(verified).toHaveLength(2);

      // Check tampered payment record
      const prRecord = verified.find((r) => r.recordId === "pr_tampered");
      expect(prRecord).toBeDefined();
      expect(prRecord?.status).toBe("mismatch");
      expect(prRecord?.verifiedOnchain).toBe(false);
      expect(prRecord?.statusNote).toContain("CRITICAL");

      // Check unfunded remittance record
      const rmRecord = verified.find((r) => r.recordId === "rm_unfunded");
      expect(rmRecord).toBeDefined();
      expect(rmRecord?.status).toBe("not-registered");
      expect(rmRecord?.verifiedOnchain).toBe(false);
      expect(rmRecord?.statusNote).toMatch(/registered/i);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("read-only verification query never changes the chain length", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-audit-readonly-"));
    const dbPath = join(tempDir, "audit-readonly.sqlite");

    const clock = new FixedClock(T0);
    const orgKeys = generateX25519KeyPair();
    const auditorKeys = generateX25519KeyPair();

    try {
      const db = openLedgerlySqliteDb(dbPath);
      const outbox = new InMemoryOutbox();
      const meta = new SqliteRuntimeMetaStore(db);
      const paymentRepo = new SqlitePaymentRequestRepository(db, outbox);
      const remittanceRepo = new SqliteRemittanceRepository(db, outbox);
      const grantRepo = new SqliteViewKeyGrantRepository(db, outbox);
      const chain = new MockChainGateway();

      const disclosures = new DisclosureUseCases({
        grantRepo,
        paymentRepo,
        remittanceRepo,
        chain,
        clock,
        initialAuditLog: meta.loadAuditLog(),
        onAuditEntry: (entry) => meta.appendAuditEntry(entry),
      });

      // Issue grant (this writes 1 audit entry)
      unwrap(
        await disclosures.issueScopedViewKey({
          actor: OWNER,
          grantId: "grant_readonly" as GrantId,
          auditorPublicKeyHex: auditorKeys.publicKeyHex,
          orgPrivateKeyHex: orgKeys.privateKeyHex,
          scope: {
            orgId: ORG_ID,
            from: new Date("2026-11-01T00:00:00Z"),
            to: new Date("2026-11-30T23:59:59Z"),
            kinds: ["PAYMENT"],
          },
          expiresAt: T_EXP,
        }),
      );

      const chainLenBefore = disclosures.getAuditLog().length;
      expect(chainLenBefore).toBe(1);

      // Perform read-only auditor verification multiple times (passive polling simulation)
      for (let i = 0; i < 5; i++) {
        const res = await disclosures.verifyScopedRecordsAsAuditor({
          grantId: "grant_readonly" as GrantId,
          auditorPrivateKeyHex: auditorKeys.privateKeyHex,
        });
        expect(res.ok).toBe(true);
      }

      // Chain length MUST NOT change
      const chainLenAfter = disclosures.getAuditLog().length;
      expect(chainLenAfter).toBe(chainLenBefore);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("Promise.all of 20 concurrent appends yields contiguous seq and a valid unbroken chain", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-audit-concurrent-"));
    const dbPath = join(tempDir, "audit-concurrent.sqlite");

    try {
      const db = openLedgerlySqliteDb(dbPath);
      const meta = new SqliteRuntimeMetaStore(db);

      const tasks = Array.from({ length: 20 }, (_, i) => ({
        id: `audit_concurrent_${i}`,
        actor: `operator_${i % 3}`,
        action: "EXPLICIT_ACTION",
        targetId: `target_${i}`,
        atIso: new Date(T0.getTime() + i * 1000).toISOString(),
      }));

      // Concurrent execution
      await Promise.all(tasks.map((task) => Promise.resolve(meta.appendAuditEntry(task))));

      const log = meta.loadAuditLog();
      expect(log).toHaveLength(20);

      // Check contiguous sequence
      for (let i = 0; i < 20; i++) {
        expect(log[i]?.seq).toBe(i + 1);
      }

      // Validate chain integrity
      const inspection = inspectAuditChain(log);
      expect(inspection.valid).toBe(true);
      expect(inspection.brokenAtSeq).toBeNull();
      expect(inspection.brokenAtIndex).toBeNull();
      expect(verifyAuditChain(log)).toBe(true);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("inspectAuditChain accurately diagnoses broken or forked chains with exact brokenAtSeq", () => {
    const entries: AuditLogEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(
        appendAuditEntry(entries, {
          id: `entry_${i}`,
          actor: "alice",
          action: "TEST",
          targetId: `t_${i}`,
          at: new Date(T0.getTime() + i * 1000),
        }),
      );
    }
    expect(inspectAuditChain(entries).valid).toBe(true);

    // Tamper with index 2
    const tampered = [
      entries[0]!,
      entries[1]!,
      { ...entries[2]!, hash: "deadbeef".repeat(8) },
      entries[3]!,
      entries[4]!,
    ];

    const diag = inspectAuditChain(tampered);
    expect(diag.valid).toBe(false);
    expect(diag.brokenAtIndex).toBe(2);
    expect(diag.brokenAtSeq).toBe(3); // seq is 1-indexed
    expect(diag.reason).toBe("hash_mismatch");
  });

  it("every wired explicit action increments audit log by exactly 1, keeps chain valid, and anchors root on-chain", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ledgerly-audit-actions-"));
    const dbPath = join(tempDir, "audit-actions.sqlite");

    const clock = new FixedClock(T0);
    const orgKeys = generateX25519KeyPair();
    const auditorKeys = generateX25519KeyPair();

    try {
      const db = openLedgerlySqliteDb(dbPath);
      const outbox = new InMemoryOutbox();
      const meta = new SqliteRuntimeMetaStore(db);
      const paymentRepo = new SqlitePaymentRequestRepository(db, outbox);
      const remittanceRepo = new SqliteRemittanceRepository(db, outbox);
      const grantRepo = new SqliteViewKeyGrantRepository(db, outbox);
      const chain = new MockChainGateway();

      const disclosures = new DisclosureUseCases({
        grantRepo,
        paymentRepo,
        remittanceRepo,
        chain,
        clock,
        initialAuditLog: meta.loadAuditLog(),
        onAuditEntry: (entry) => meta.appendAuditEntry(entry),
      });

      let expectedLen = 0;
      let expectedAnchors = 0;

      // 1. Action: Grant Issuance
      unwrap(
        await disclosures.issueScopedViewKey({
          actor: OWNER,
          grantId: "grant_action_1" as GrantId,
          auditorPublicKeyHex: auditorKeys.publicKeyHex,
          orgPrivateKeyHex: orgKeys.privateKeyHex,
          scope: {
            orgId: ORG_ID,
            from: new Date("2026-11-01T00:00:00Z"),
            to: new Date("2026-11-30T23:59:59Z"),
            kinds: ["PAYMENT"],
          },
          expiresAt: T_EXP,
        }),
      );
      expectedLen += 1;
      expectedAnchors += 1;
      expect(disclosures.getAuditLog()).toHaveLength(expectedLen);
      expect(verifyAuditChain(disclosures.getAuditLog())).toBe(true);
      expect(chain.getAnchoredRoots()).toHaveLength(expectedAnchors);

      // 2. Action: Rotate Scoped View Key
      await disclosures.recordAuditAction(OWNER.userId, "ROTATE_VIEW_KEY", "grant_action_2");
      expectedLen += 1;
      expectedAnchors += 1;
      expect(disclosures.getAuditLog()).toHaveLength(expectedLen);
      expect(verifyAuditChain(disclosures.getAuditLog())).toBe(true);
      expect(chain.getAnchoredRoots()).toHaveLength(expectedAnchors);

      // 3. Action: Export Reconciliation CSV
      await disclosures.recordAuditAction(
        OWNER.userId,
        "EXPORT_RECONCILIATION_CSV",
        "ledger_export_01",
      );
      expectedLen += 1;
      expectedAnchors += 1;
      expect(disclosures.getAuditLog()).toHaveLength(expectedLen);
      expect(verifyAuditChain(disclosures.getAuditLog())).toBe(true);
      expect(chain.getAnchoredRoots()).toHaveLength(expectedAnchors);

      // 4. Action: Manual/Auto Reconcile
      await disclosures.recordAuditAction(
        OWNER.userId,
        "MANUAL_RECONCILE",
        "checked_10_discrepancies_0",
      );
      expectedLen += 1;
      expectedAnchors += 1;
      expect(disclosures.getAuditLog()).toHaveLength(expectedLen);
      expect(verifyAuditChain(disclosures.getAuditLog())).toBe(true);
      expect(chain.getAnchoredRoots()).toHaveLength(expectedAnchors);

      // 5. Action: Explicit Anchor Action
      await disclosures.recordAuditAction(OWNER.userId, "MANUAL_ANCHOR", "grant_action_1");
      expectedLen += 1;
      expectedAnchors += 1;
      expect(disclosures.getAuditLog()).toHaveLength(expectedLen);
      expect(verifyAuditChain(disclosures.getAuditLog())).toBe(true);
      expect(chain.getAnchoredRoots()).toHaveLength(expectedAnchors);

      // Passive query: verifyScopedRecordsAsAuditor should NOT increment
      const queryRes = await disclosures.verifyScopedRecordsAsAuditor({
        grantId: "grant_action_1" as GrantId,
        auditorPrivateKeyHex: auditorKeys.privateKeyHex,
      });
      expect(queryRes.ok).toBe(true);
      expect(disclosures.getAuditLog()).toHaveLength(expectedLen);
      expect(chain.getAnchoredRoots()).toHaveLength(expectedAnchors);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
