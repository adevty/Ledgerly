import { domainError, err, ok, type DomainError, type OrgId, type Result, type UserId } from "@/shared";

export type OrgRole = "OWNER" | "FINANCE" | "VIEWER";

export type OrgAction =
  | "CREATE_PAYMENT_REQUEST"
  | "REFUND_PAYMENT"
  | "SEND_REMITTANCE"
  | "VIEW_RECORDS"
  | "ISSUE_VIEW_KEY"
  | "REVOKE_VIEW_KEY"
  | "EXPORT_CSV"
  | "MANAGE_MEMBERS";

export interface Actor {
  readonly userId: UserId;
  readonly orgId: OrgId;
  readonly role: OrgRole;
}

const ROLE_PERMISSIONS: Record<OrgRole, readonly OrgAction[]> = {
  OWNER: [
    "CREATE_PAYMENT_REQUEST",
    "REFUND_PAYMENT",
    "SEND_REMITTANCE",
    "VIEW_RECORDS",
    "ISSUE_VIEW_KEY",
    "REVOKE_VIEW_KEY",
    "EXPORT_CSV",
    "MANAGE_MEMBERS",
  ],
  FINANCE: [
    "CREATE_PAYMENT_REQUEST",
    "REFUND_PAYMENT",
    "SEND_REMITTANCE",
    "VIEW_RECORDS",
    "EXPORT_CSV",
  ],
  VIEWER: ["VIEW_RECORDS", "EXPORT_CSV"],
};

/**
 * Policy check for off-chain RBAC per organization (Tahap 4 §7).
 */
export function authorize(
  actor: Actor,
  action: OrgAction,
  targetOrgId: OrgId,
): Result<true, DomainError> {
  if (actor.orgId !== targetOrgId) {
    return err(domainError("FORBIDDEN_ROLE", "Actor does not belong to target organization"));
  }
  if (!ROLE_PERMISSIONS[actor.role].includes(action)) {
    return err(
      domainError("FORBIDDEN_ROLE", `Role '${actor.role}' is not allowed to perform '${action}'`, {
        role: actor.role,
        action,
      }),
    );
  }
  return ok(true);
}
