import type { AuthUser } from "@/lib/auth/permissions";
import { canAccessFinance, canAccessUserData } from "@/lib/auth/permissions";

export type AppNavItem = {
  href: string;
  label: string;
  badge: string;
  icon: "calendar" | "guide" | "modeling" | "finance" | "users";
};

const baseNavItems: AppNavItem[] = [
  { href: "/", label: "项目排期", badge: "P0", icon: "calendar" },
  { href: "/product-guide", label: "产品组工作指引", badge: "P0", icon: "guide" },
  { href: "/modeling", label: "建模排期", badge: "P0", icon: "modeling" },
];

export function getFormalAppNavItems(user: Pick<AuthUser, "authRole" | "permissionLevel" | "roleTitle" | "businessRoles">) {
  const items = [...baseNavItems];

  if (canAccessFinance(user)) {
    items.push({ href: "/finance", label: "财务测算", badge: "试算", icon: "finance" });
  }

  if (canAccessUserData(user)) {
    items.push({ href: "/users", label: "用户数据", badge: "基础", icon: "users" });
  }

  return items;
}
