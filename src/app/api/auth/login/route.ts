import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ensureDefaultAdminUser } from "@/lib/auth/default-admin";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureDefaultAdminUser();

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const loginName = typeof payload.loginName === "string" ? payload.loginName.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!loginName || !password) {
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
    },
  });

  if (!user?.loginName || !verifyPassword(password, user.passwordHash)) {
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
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

  return response;
}
