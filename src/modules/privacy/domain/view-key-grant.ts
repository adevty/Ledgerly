import {
  AggregateRoot,
  domainError,
  err,
  invalidTransition,
  ok,
  type DomainError,
  type DomainEvent,
  type GrantId,
  type OrgId,
  type Result,
} from "@/shared";
import { rewrapDekForAuditor } from "./envelope";

export type DisclosureRecordKind = "PAYMENT" | "REMITTANCE";

/**
 * Scope of a selective disclosure view key (Tahap 4 §1.2).
 * Restricts an auditor to a specific organization, time window, and record types.
 */
export interface DisclosureScope {
  readonly orgId: OrgId;
  readonly from: Date;
  readonly to: Date;
  readonly kinds: readonly DisclosureRecordKind[];
}

export interface ScopedRecordCandidate {
  readonly recordId: string;
  readonly orgId: OrgId;
  readonly kind: DisclosureRecordKind;
  readonly createdAt: Date;
  readonly orgWrappedDekHex: string;
}

export type PrivacyEvent =
  | DomainEvent<"ViewKeyIssued", { grantId: string; orgId: string; expiresAt: string }>
  | DomainEvent<"ViewKeyRevoked", { grantId: string; orgId: string }>;

export interface ViewKeyGrantSnapshot {
  id: GrantId;
  orgId: OrgId;
  auditorPublicKeyHex: string;
  scope: DisclosureScope;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Map of recordId -> wrappedDekHex for the auditor. */
  auditorWraps: Record<string, string>;
  version: number;
}

/**
 * ViewKeyGrant aggregate root (Tahap 4 §1.1 & AD-3).
 *
 * Represents a scoped, time-bound, revocable grant that lets an external
 * auditor decrypt only records inside `scope` and verify them against
 * on-chain commitments.
 */
export class ViewKeyGrant extends AggregateRoot<PrivacyEvent> {
  private constructor(private s: Omit<ViewKeyGrantSnapshot, "version">) {
    super();
  }

  static issue(p: {
    id: GrantId;
    orgId: OrgId;
    auditorPublicKeyHex: string;
    scope: DisclosureScope;
    expiresAt: Date;
    now: Date;
  }): Result<ViewKeyGrant, DomainError> {
    if (p.scope.orgId !== p.orgId) {
      return err(domainError("OUT_OF_SCOPE", "Scope orgId must match grant orgId"));
    }
    if (p.scope.from >= p.scope.to) {
      return err(domainError("INVALID_AMOUNT", "Scope 'from' must be before 'to'"));
    }
    if (p.scope.kinds.length === 0) {
      return err(domainError("OUT_OF_SCOPE", "Scope must include at least one record kind"));
    }
    if (p.expiresAt <= p.now) {
      return err(domainError("GRANT_EXPIRED", "expiresAt must be in the future"));
    }

    const grant = new ViewKeyGrant({
      id: p.id,
      orgId: p.orgId,
      auditorPublicKeyHex: p.auditorPublicKeyHex,
      scope: { ...p.scope, kinds: [...p.scope.kinds] },
      expiresAt: p.expiresAt,
      revokedAt: null,
      auditorWraps: {},
    });
    grant.raise({
      type: "ViewKeyIssued",
      aggregateId: p.id,
      occurredAt: p.now,
      payload: {
        grantId: p.id,
        orgId: p.orgId,
        expiresAt: p.expiresAt.toISOString(),
      },
    });
    return ok(grant);
  }

  static rehydrate(snap: ViewKeyGrantSnapshot): ViewKeyGrant {
    const { version, ...rest } = snap;
    const g = new ViewKeyGrant({
      ...rest,
      auditorWraps: { ...rest.auditorWraps },
    });
    g.version = version;
    return g;
  }

  snapshot(): ViewKeyGrantSnapshot {
    return {
      ...this.s,
      auditorWraps: { ...this.s.auditorWraps },
      version: this.version,
    };
  }

  get id(): GrantId { return this.s.id; }
  get orgId(): OrgId { return this.s.orgId; }
  get scope(): DisclosureScope { return this.s.scope; }
  get revokedAt(): Date | null { return this.s.revokedAt; }

  /** Check whether a record falls inside the grant's scope. */
  matchesScope(rec: { orgId: OrgId; kind: DisclosureRecordKind; createdAt: Date }): boolean {
    return (
      rec.orgId === this.s.scope.orgId &&
      this.s.scope.kinds.includes(rec.kind) &&
      rec.createdAt >= this.s.scope.from &&
      rec.createdAt <= this.s.scope.to
    );
  }

  /** Assert the grant is currently active (not revoked and not expired). */
  assertActive(now: Date): Result<true, DomainError> {
    if (this.s.revokedAt !== null) {
      return err(domainError("GRANT_REVOKED", "View key grant has been revoked"));
    }
    if (now > this.s.expiresAt) {
      return err(domainError("GRANT_EXPIRED", "View key grant has expired"));
    }
    return ok(true);
  }

  /**
   * Re-wrap DEKs for in-scope records to the auditor's public key.
   * Rejects out-of-scope records so an org key can never leak outside `scope`.
   */
  authorizeRecords(
    records: readonly ScopedRecordCandidate[],
    orgPrivateKeyHex: string,
    now: Date,
  ): Result<number, DomainError> {
    const active = this.assertActive(now);
    if (!active.ok) return active;

    let count = 0;
    for (const rec of records) {
      if (!this.matchesScope(rec)) {
        return err(
          domainError("OUT_OF_SCOPE", `Record '${rec.recordId}' is outside disclosure scope`),
        );
      }
      const wrapped = rewrapDekForAuditor(
        rec.orgWrappedDekHex,
        orgPrivateKeyHex,
        this.s.auditorPublicKeyHex,
      );
      if (!wrapped.ok) return wrapped;
      this.s.auditorWraps[rec.recordId] = wrapped.value;
      count += 1;
    }
    return ok(count);
  }

  /**
   * Retrieve the auditor-wrapped DEK for `recordId`.
   * Fails if the grant is revoked or expired.
   */
  getAuditorWrappedDek(recordId: string, now: Date): Result<string, DomainError> {
    const active = this.assertActive(now);
    if (!active.ok) return active;
    const w = this.s.auditorWraps[recordId];
    if (!w) {
      return err(domainError("OUT_OF_SCOPE", `Record '${recordId}' is not authorized by this grant`));
    }
    return ok(w);
  }

  /** Revoke the grant immediately. Idempotent-safe via state guard. */
  revoke(now: Date): Result<true, DomainError> {
    if (this.s.revokedAt !== null) {
      return err(invalidTransition("ViewKeyGrant", "REVOKED", "revoke"));
    }
    this.s.revokedAt = now;
    this.s.auditorWraps = {}; // Wipe wrapped DEKs so revoked grants never serve keys
    this.raise({
      type: "ViewKeyRevoked",
      aggregateId: this.s.id,
      occurredAt: now,
      payload: { grantId: this.s.id, orgId: this.s.orgId },
    });
    return ok(true);
  }
}
