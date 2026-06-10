/** Authenticated user resolved from the access token. */
export interface AuthUser {
  userId: string;
  email: string;
  roleId: string;
  roleName: string;
  isSuperAdmin: boolean;
  /** Permission keys "module:action" granted to the user's role. */
  permissions: string[];
  /** Branch ids the user may operate. */
  branchIds: string[];
}

/**
 * Tenant scope injected after auth. Repositories filter by `branchIds`.
 * `activeBranchId` is the branch the request operates on (from ?branchId or the first one).
 */
export interface RequestScope {
  userId: string;
  roleId: string;
  isSuperAdmin: boolean;
  branchIds: string[];
  activeBranchId: string | null;
}
