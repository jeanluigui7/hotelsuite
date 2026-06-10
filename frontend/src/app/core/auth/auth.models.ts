export interface AuthUser {
  userId: string;
  email: string;
  roleId: string;
  roleName: string;
  isSuperAdmin: boolean;
  permissions: string[];
  branchIds: string[];
}

export interface Branch {
  id: string;
  name: string;
  address?: string | null;
  taxId?: string | null;
  currency: string;
  cutoffHour: number;
  status: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  branchId?: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}
