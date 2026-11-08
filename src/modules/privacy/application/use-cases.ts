import {
  domainError,
  err,
  ok,
  type ChainGateway,
  type Clock,
  type DomainError,
  type EscrowId,
  type GrantId,
  type OrgId,
  type Result,
} from "@/shared";
import { authorize, type Actor } from "@/modules/identity/domain/rbac";
import type { PaymentRequestRepository } from "@/modules/payments/domain";
import type { RemittanceRepository } from "@/modules/remittance/domain";
import {
  appendAuditEntry,
  openAndVerifyPayload,
  ViewKeyGrant,
  type AuditLogEntry,
  type DisclosureScope,
  type ScopedRecordCandidate,
  type ViewKeyGrantRepository,
} from "../domain";

export type AuditorRecordStatus = "verified" | "mismatch" | "not-registered";

export interface AuditedRecordView {
  readonly recordId: string;
  readonly kind: "PAYMENT" | "REMITTANCE";
  readonly escrowId: EscrowId;
  readonly createdAtIso: string;
  readonly decryptedPayload: unknown;
  readonly commitment: string;
  readonly onchainCommitment: string | null;
  readonly verifiedOnchain: boolean;
  readonly status: AuditorRecordStatus;
  readonly statusNote: string;
}

export class DisclosureUseCases {
  private readonly auditLog: AuditLogEntry[] = [];
  private seq = 1;

  constructor(
    private readonly deps: {
      grantRepo: ViewKeyGrantRepository;
      paymentRepo: PaymentRequestRepository;
      remittanceRepo: RemittanceRepository;
      chain: ChainGateway;
      clock: Clock;
      initialAuditLog?: readonly AuditLogEntry[];
      onAuditEntry?: (entry: AuditLogEntry) => AuditLogEntry | void;
    },
  ) {
    if (deps.initialAuditLog && deps.initialAuditLog.length > 0) {
      this.auditLog.push(...deps.initialAuditLog);
      this.seq = this.auditLog.length + 1;
    }
  }

  /**
   * Organization OWNER issues a scoped ViewKeyGrant for an external auditor.
   * Automatically finds all matching records in `scope` and re-wraps their DEKs
   * to the auditor's X25519 public key without re-encrypting ciphertexts (AD-3).
   */
  async issueScopedViewKey(input: {
    actor: Actor;
    grantId: GrantId;
    auditorPublicKeyHex: string;
    orgPrivateKeyHex: string;
    scope: DisclosureScope;
    expiresAt: Date;
  }): Promise<Result<{ grantId: GrantId; authorizedRecordCount: number }, DomainError>> {
    const auth = authorize(input.actor, "ISSUE_VIEW_KEY", input.scope.orgId);
    if (!auth.ok) return auth;

    const now = this.deps.clock.now();
    const grantRes = ViewKeyGrant.issue({
      id: input.grantId,
      orgId: input.scope.orgId,
      auditorPublicKeyHex: input.auditorPublicKeyHex,
      scope: input.scope,
      expiresAt: input.expiresAt,
      now,
    });
    if (!grantRes.ok) return grantRes;

    const candidates = await this.collectScopedCandidates(input.scope);
    const countRes = grantRes.value.authorizeRecords(candidates, input.orgPrivateKeyHex, now);
    if (!countRes.ok) return countRes;

    await this.deps.grantRepo.save(grantRes.value);
    await this.recordAndAnchorAudit(input.actor.userId, "ISSUE_VIEW_KEY", input.grantId, now);

    return ok({ grantId: input.grantId, authorizedRecordCount: countRes.value });
  }

  /**
   * Organization OWNER revokes a ViewKeyGrant.
   */
  async revokeViewKey(input: {
    actor: Actor;
    grantId: GrantId;
  }): Promise<Result<true, DomainError>> {
    const grant = await this.deps.grantRepo.findById(input.grantId);
    if (!grant) return err(domainError("NOT_FOUND", "ViewKeyGrant not found"));

    const auth = authorize(input.actor, "REVOKE_VIEW_KEY", grant.orgId);
    if (!auth.ok) return auth;

    const now = this.deps.clock.now();
    const rev = grant.revoke(now);
    if (!rev.ok) return rev;

    await this.deps.grantRepo.save(grant);
    await this.recordAndAnchorAudit(input.actor.userId, "REVOKE_VIEW_KEY", input.grantId, now);
    return ok(true);
  }

  /**
   * Auditor decrypts all scoped records using their private key and verifies
   * every record's commitment against the `ledgerly-escrow` smart contract.
   */
  async verifyScopedRecordsAsAuditor(input: {
    grantId: GrantId;
    auditorPrivateKeyHex: string;
  }): Promise<Result<readonly AuditedRecordView[], DomainError>> {
    const grant = await this.deps.grantRepo.findById(input.grantId);
    if (!grant) return err(domainError("NOT_FOUND", "ViewKeyGrant not found"));

    const now = this.deps.clock.now();
    const active = grant.assertActive(now);
    if (!active.ok) return active;

    const results: AuditedRecordView[] = [];
    const scope = grant.scope;

    if (scope.kinds.includes("PAYMENT")) {
      const payments = await this.deps.paymentRepo.listByOrgId(scope.orgId);
      for (const p of payments) {
        if (!grant.matchesScope({ orgId: scope.orgId, kind: "PAYMENT", createdAt: p.createdAt })) {
          continue;
        }
        const wrappedDek = grant.getAuditorWrappedDek(p.aggregate.id, now);
        if (!wrappedDek.ok) return wrappedDek;

        const opened = openAndVerifyPayload({
          ciphertextHex: p.envelope.ciphertextHex,
          wrappedDekHex: wrappedDek.value,
          saltHex: p.envelope.saltHex,
          expectedCommitment: p.envelope.commitment,
          privateKeyHex: input.auditorPrivateKeyHex,
        });
        if (!opened.ok) return opened;

        const onchain = await this.deps.chain.getEscrow(p.aggregate.escrowId);
        let status: AuditorRecordStatus = "not-registered";
        let statusNote = "Quote expired or unfunded; no on-chain escrow registered.";

        if (onchain) {
          if (onchain.commitment === p.envelope.commitment) {
            status = "verified";
            statusNote = "On-chain commitment matches sealed payload hash.";
          } else {
            status = "mismatch";
            statusNote = "CRITICAL: On-chain commitment does not match sealed payload hash.";
          }
        }

        results.push({
          recordId: p.aggregate.id,
          kind: "PAYMENT",
          escrowId: p.aggregate.escrowId,
          createdAtIso: p.createdAt.toISOString(),
          decryptedPayload: opened.value,
          commitment: p.envelope.commitment,
          onchainCommitment: onchain?.commitment ?? null,
          verifiedOnchain: status === "verified",
          status,
          statusNote,
        });
      }
    }

    if (scope.kinds.includes("REMITTANCE")) {
      const remittances = await this.deps.remittanceRepo.listByOrgId(scope.orgId);
      for (const r of remittances) {
        if (!grant.matchesScope({ orgId: scope.orgId, kind: "REMITTANCE", createdAt: r.createdAt })) {
          continue;
        }
        const wrappedDek = grant.getAuditorWrappedDek(r.aggregate.id, now);
        if (!wrappedDek.ok) return wrappedDek;

        const opened = openAndVerifyPayload({
          ciphertextHex: r.envelope.ciphertextHex,
          wrappedDekHex: wrappedDek.value,
          saltHex: r.envelope.saltHex,
          expectedCommitment: r.envelope.commitment,
          privateKeyHex: input.auditorPrivateKeyHex,
        });
        if (!opened.ok) return opened;

        const onchain = await this.deps.chain.getEscrow(r.aggregate.escrowId);
        let status: AuditorRecordStatus = "not-registered";
        let statusNote = "Quote expired or unfunded; no on-chain escrow registered.";

        if (onchain) {
          if (onchain.commitment === r.envelope.commitment) {
            status = "verified";
            statusNote = "On-chain commitment matches sealed payload hash.";
          } else {
            status = "mismatch";
            statusNote = "CRITICAL: On-chain commitment does not match sealed payload hash.";
          }
        }

        results.push({
          recordId: r.aggregate.id,
          kind: "REMITTANCE",
          escrowId: r.aggregate.escrowId,
          createdAtIso: r.createdAt.toISOString(),
          decryptedPayload: opened.value,
          commitment: r.envelope.commitment,
          onchainCommitment: onchain?.commitment ?? null,
          verifiedOnchain: status === "verified",
          status,
          statusNote,
        });
      }
    }

    // Read-only queries must NOT write audit entries
    return ok(results);
  }

  getAuditLog(): readonly AuditLogEntry[] {
    return this.auditLog;
  }

  private async collectScopedCandidates(
    scope: DisclosureScope,
  ): Promise<ScopedRecordCandidate[]> {
    const out: ScopedRecordCandidate[] = [];
    if (scope.kinds.includes("PAYMENT")) {
      const payments = await this.deps.paymentRepo.listByOrgId(scope.orgId);
      for (const p of payments) {
        const candidate: ScopedRecordCandidate = {
          recordId: p.aggregate.id,
          orgId: scope.orgId,
          kind: "PAYMENT",
          createdAt: p.createdAt,
          orgWrappedDekHex: p.envelope.wrappedDekHex,
        };
        if (
          candidate.createdAt >= scope.from &&
          candidate.createdAt <= scope.to
        ) {
          out.push(candidate);
        }
      }
    }
    if (scope.kinds.includes("REMITTANCE")) {
      const remittances = await this.deps.remittanceRepo.listByOrgId(scope.orgId);
      for (const r of remittances) {
        const candidate: ScopedRecordCandidate = {
          recordId: r.aggregate.id,
          orgId: scope.orgId,
          kind: "REMITTANCE",
          createdAt: r.createdAt,
          orgWrappedDekHex: r.envelope.wrappedDekHex,
        };
        if (
          candidate.createdAt >= scope.from &&
          candidate.createdAt <= scope.to
        ) {
          out.push(candidate);
        }
      }
    }
    return out;
  }

  async recordAuditAction(
    actor: string,
    action: string,
    targetId: string,
  ): Promise<AuditLogEntry> {
    const now = this.deps.clock.now();
    return this.recordAndAnchorAudit(actor, action, targetId, now);
  }

  private async recordAndAnchorAudit(
    actor: string,
    action: string,
    targetId: string,
    now: Date,
  ): Promise<AuditLogEntry> {
    let entry = appendAuditEntry(this.auditLog, {
      id: `audit_${this.seq++}`,
      actor,
      action,
      targetId,
      at: now,
    });
    if (this.deps.onAuditEntry) {
      const dbEntry = this.deps.onAuditEntry(entry);
      if (dbEntry) {
        entry = dbEntry;
      }
    }
    this.auditLog.push(entry);
    await this.deps.chain.anchorAuditRoot(entry.hash);
    return entry;
  }
}
