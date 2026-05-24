export const authRoleLabels: Record<string, string> = {
  admin: "管理员",
  manager: "管理者",
  viewer: "只读成员",
};

export const authRoleOptions = [
  { value: "viewer", label: authRoleLabels.viewer },
  { value: "manager", label: authRoleLabels.manager },
  { value: "admin", label: authRoleLabels.admin },
];

export type AuthUser = {
  id: string;
  name: string;
  loginName: string;
  authRole: string;
};

export const bypassAuthUser: AuthUser = {
  id: "auth-disabled",
  name: "内部试用",
  loginName: "auth-disabled",
  authRole: "admin",
};

export function isAuthEnabled() {
  return process.env.AUTH_ENABLED === "true";
}

export function canManageUsers(user: Pick<AuthUser, "authRole">) {
  return user.authRole === "admin";
}

export function canEditOperations(user: Pick<AuthUser, "authRole">) {
  return user.authRole === "admin" || user.authRole === "manager";
}

export function normalizeAuthRole(value: unknown) {
  if (value === "admin" || value === "manager" || value === "viewer") {
    return value;
  }

  return "viewer";
}
