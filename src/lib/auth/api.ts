import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { bypassAuthUser, isAuthEnabled, type AuthUser } from "@/lib/auth/permissions";

export async function requireApiUser() {
  if (!isAuthEnabled()) {
    return { user: bypassAuthUser };
  }

  const user = await getCurrentUser();

  if (!user) {
    return { response: NextResponse.json({ ok: false, message: "请先登录。" }, { status: 401 }) };
  }

  return { user };
}

export async function requireApiRole(roles: string[]) {
  const result = await requireApiUser();

  if ("response" in result) {
    return result;
  }

  if (!roles.includes(result.user.authRole)) {
    return { response: NextResponse.json({ ok: false, message: "当前账号没有权限执行此操作。" }, { status: 403 }) };
  }

  return { user: result.user as AuthUser };
}
