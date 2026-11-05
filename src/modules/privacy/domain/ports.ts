import type { GrantId, OrgId } from "@/shared";
import type { ViewKeyGrant } from "./view-key-grant";

export interface ViewKeyGrantRepository {
  findById(id: GrantId): Promise<ViewKeyGrant | null>;
  findByOrgId(orgId: OrgId): Promise<ViewKeyGrant[]>;
  save(grant: ViewKeyGrant): Promise<void>;
}
