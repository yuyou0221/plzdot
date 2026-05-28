import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  bypassAuthUser,
  canAccessUserData,
  canSeeSensitiveUserData,
  isAuthEnabled,
  type AuthUser,
} from "@/lib/auth/permissions";

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

export async function requireApiUserDataAccess() {
  const result = await requireApiUser();

  if ("response" in result) {
    return result;
  }

  if (!canAccessUserData(result.user)) {
    return { response: NextResponse.json({ ok: false, message: "当前账号不能访问用户数据。" }, { status: 403 }) };
  }

  return { user: result.user as AuthUser };
}

export async function requireApiUserDataLevelZero() {
  const result = await requireApiUser();

  if ("response" in result) {
    return result;
  }

  if (!canSeeSensitiveUserData(result.user)) {
    return { response: NextResponse.json({ ok: false, message: "该操作仅权限等级 0 可用。" }, { status: 403 }) };
  }

  return { user: result.user as AuthUser };
}
