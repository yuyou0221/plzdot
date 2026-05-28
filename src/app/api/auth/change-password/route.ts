import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { encryptExportablePassword } from "@/lib/auth/password-export";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const maxPasswordLength = 128;

export async function POST(request: Request) {
  const auth = await requireApiUser();

  if ("response" in auth) {
    return auth.response;
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  const confirmPassword = typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ ok: false, message: "请填写当前密码、新密码和确认密码。" }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ ok: false, message: "两次输入的新密码不一致。" }, { status: 400 });
  }

  if (newPassword.length > maxPasswordLength) {
    return NextResponse.json({ ok: false, message: "新密码不能超过 128 个字符。" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { id: true, loginName: true, passwordHash: true, status: true },
  });

  if (!user?.loginName || !user.passwordHash || user.status === "停用") {
    return NextResponse.json({ ok: false, message: "当前账号不可用，请重新登录。" }, { status: 401 });
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return NextResponse.json({ ok: false, message: "当前密码不正确。" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(newPassword),
      passwordExportCiphertext: encryptExportablePassword(newPassword),
      mustChangePassword: false,
    },
  });

  return NextResponse.json({ ok: true, message: "密码已更新。" });
}
