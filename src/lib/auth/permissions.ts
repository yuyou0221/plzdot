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
  permissionLevel: number;
  roleTitle?: string;
  businessRoles: string[];
};

export const bypassAuthUser: AuthUser = {
  id: "auth-disabled",
  name: "内部试用",
  loginName: "auth-disabled",
  authRole: "admin",
  permissionLevel: 0,
  roleTitle: "系统管理员",
  businessRoles: ["系统管理员"],
};

export function isAuthEnabled() {
  return process.env.AUTH_ENABLED === "true";
}

export function normalizeUserPermissionLevel(value: unknown, fallback = 9) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return Math.trunc(numberValue);
}

export function defaultPermissionLevelForAuthRole(authRole: string) {
  if (authRole === "admin") {
    return 0;
  }

  if (authRole === "manager") {
    return 5;
  }

  return 9;
}

export function formatUserPermissionLevel(level: number | null | undefined) {
  return typeof level === "number" ? `等级 ${level}` : "未设置";
}

export function isHighestPermissionLevel(user: Pick<AuthUser, "permissionLevel">) {
  return user.permissionLevel === 0;
}

export function isHumanResourcesUser(user: Pick<AuthUser, "roleTitle" | "businessRoles">) {
  const text = [user.roleTitle, ...(user.businessRoles ?? [])].filter(Boolean).join(" ").toLowerCase();

  return text.includes("人力资源") || text.includes("人事") || text.includes("hr") || text.includes("human resources");
}

export function canAccessUserData(user: Pick<AuthUser, "permissionLevel" | "roleTitle" | "businessRoles">) {
  return user.permissionLevel === 0 || isHumanResourcesUser(user);
}

export function canSeeSensitiveUserData(user: Pick<AuthUser, "permissionLevel">) {
  return user.permissionLevel === 0;
}

export function canManageUsers(user: Pick<AuthUser, "authRole">) {
  return user.authRole === "admin";
}

export function canEditOperations(user: Pick<AuthUser, "authRole">) {
  return user.authRole === "admin" || user.authRole === "manager";
}

export function normalizeAuthRole(value: unknown) {
  if (typeof value === "string") {
    const role = value.trim();
    const normalizedRole = role.toLowerCase();
    if (normalizedRole === "admin" || normalizedRole === "manager" || normalizedRole === "viewer") {
      return normalizedRole;
    }

    return role.length > 0 ? role : "viewer";
  }

  return "viewer";
}
