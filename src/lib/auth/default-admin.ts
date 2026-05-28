import "server-only";

import { prisma } from "@/lib/db/prisma";
import { encryptExportablePassword } from "@/lib/auth/password-export";
import { hashPassword } from "@/lib/auth/password";

export const defaultAdminLogin = "admin";
export const defaultAdminPassword = "admin123456";

export async function ensureDefaultAdminUser() {
  await ensureDefaultPermissionRoles();

  const authUserCount = await prisma.user.count({ where: { loginName: { not: null } } });

  if (authUserCount > 0) {
    return;
  }

  const loginName = process.env.INITIAL_ADMIN_LOGIN || defaultAdminLogin;
  const password = process.env.INITIAL_ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : defaultAdminPassword);

  if (!password) {
    throw new Error("INITIAL_ADMIN_PASSWORD is required before creating the first production admin user.");
  }

  await prisma.user.create({
    data: {
      name: "系统管理员",
      loginName,
      passwordHash: hashPassword(password),
      passwordExportCiphertext: encryptExportablePassword(password),
      authRole: "admin",
      permissionLevel: 0,
      userType: "内部",
      roleTitle: "系统管理员",
      status: "启用",
      notes: "登录权限系统默认管理员账号，请在正式使用前修改密码。",
    },
  });
}

async function ensureDefaultPermissionRoles() {
  for (const roleName of ["admin", "manager", "viewer"]) {
    await prisma.permissionRole.upsert({
      where: { roleName },
      create: { roleName, status: "启用" },
      update: { status: "启用" },
    });
  }
}
