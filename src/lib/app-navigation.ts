import type { AuthUser } from "@/lib/auth/permissions";
import { canAccessUserData } from "@/lib/auth/permissions";

export type AppNavItem = {
  href: string;
  label: string;
  badge: string;
  icon: "calendar" | "guide" | "modeling" | "users";
};

const baseNavItems: AppNavItem[] = [
  { href: "/", label: "项目排期", badge: "P0", icon: "calendar" },
  { href: "/product-guide", label: "产品组工作指引", badge: "P0", icon: "guide" },
  { href: "/modeling", label: "建模排期", badge: "P0", icon: "modeling" },
];

export function getFormalAppNavItems(user: Pick<AuthUser, "permissionLevel" | "roleTitle" | "businessRoles">) {
  return canAccessUserData(user)
    ? [...baseNavItems, { href: "/users", label: "用户数据", badge: "基础", icon: "users" } satisfies AppNavItem]
    : baseNavItems;
}

