export type TenantStatus = "active" | "suspended" | "pending";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
};
