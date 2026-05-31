import "server-only";

import type { AuthUser } from "@/lib/auth/permissions";

export function isProtectedRuntime() {
  const appEnv = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV || "").toLowerCase();

  return process.env.NODE_ENV === "production" || appEnv === "staging" || appEnv === "production";
}

export function isDemoDataAllowed() {
  return !isProtectedRuntime() && process.env.ALLOW_DEMO_DATA === "true";
}

export function canAccessInternalTestTools(user: Pick<AuthUser, "authRole" | "permissionLevel" | "id">) {
  if (user.authRole === "admin" || user.permissionLevel === 0) {
    return true;
  }

  return !isProtectedRuntime() && user.id === "auth-disabled";
}

