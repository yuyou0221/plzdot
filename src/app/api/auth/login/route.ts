import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ensureDefaultAdminUser } from "@/lib/auth/default-admin";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import { recordUserDataAuditLog } from "@/lib/user-data-audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await ensureDefaultAdminUser();
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "默认管理员初始化失败。";
    await recordUserDataAuditLog({
      request,
      action: "登录",
      targetType: "User",
      result: "失败",
      summary: `登录前初始化失败：${message}`,
    });
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    await recordUserDataAuditLog({
      request,
      action: "登录",
      targetType: "User",
      result: "拒绝",
      summary: "登录请求内容不是有效 JSON。",
    });
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const loginName = typeof payload.loginName === "string" ? payload.loginName.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!loginName || !password) {
    await recordUserDataAuditLog({
      request,
      action: "登录",
      targetType: "User",
      targetId: loginName || null,
      result: "拒绝",
      summary: "登录名或密码缺失。",
      metadata: { loginName: loginName || null },
    });
    return NextResponse.json({ ok: false, message: "请填写登录名和密码。" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { loginName, status: { not: "停用" } },
    select: {
      id: true,
      name: true,
      loginName: true,
      passwordHash: true,
      authRole: true,
      permissionLevel: true,
      roleTitle: true,
      businessRoles: true,
    },
  });

  if (!user?.loginName || !verifyPassword(password, user.passwordHash)) {
    await recordUserDataAuditLog({
      request,
      action: "登录",
      targetType: "User",
      targetId: user?.id ?? loginName,
      result: "拒绝",
      summary: "登录失败：登录名或密码不正确。",
      metadata: { loginName, reason: "invalid_credentials" },
    });
    return NextResponse.json({ ok: false, message: "登录名或密码不正确。" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = await createSessionToken({
    userId: user.id,
    loginName: user.loginName,
    role: user.authRole,
  });
  const response = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      loginName: user.loginName,
      authRole: user.authRole,
      permissionLevel: user.permissionLevel,
      roleTitle: user.roleTitle,
      businessRoles: user.businessRoles,
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

  await recordUserDataAuditLog({
    actor: { id: user.id, name: user.name, loginName: user.loginName },
    request,
    action: "登录",
    targetType: "User",
    targetId: user.id,
    result: "成功",
    summary: "账号登录成功。",
    metadata: { loginName: user.loginName },
  });

  return response;
}
