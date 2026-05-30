import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { assertPasswordExportSecretConfigured, encryptExportablePassword } from "@/lib/auth/password-export";
import { prisma } from "@/lib/db/prisma";
import { recordUserDataAuditLog } from "@/lib/user-data-audit";

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
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "修改本人密码",
      targetType: "User",
      targetId: auth.user.id,
      result: "拒绝",
      summary: "修改密码时缺少必填项。",
    });
    return NextResponse.json({ ok: false, message: "请填写当前密码、新密码和确认密码。" }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "修改本人密码",
      targetType: "User",
      targetId: auth.user.id,
      result: "拒绝",
      summary: "两次输入的新密码不一致。",
    });
    return NextResponse.json({ ok: false, message: "两次输入的新密码不一致。" }, { status: 400 });
  }

  if (newPassword.length > maxPasswordLength) {
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "修改本人密码",
      targetType: "User",
      targetId: auth.user.id,
      result: "拒绝",
      summary: "新密码超过长度限制。",
      metadata: { maxPasswordLength },
    });
    return NextResponse.json({ ok: false, message: "新密码不能超过 128 个字符。" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { id: true, loginName: true, passwordHash: true, status: true },
  });

  if (!user?.loginName || !user.passwordHash || user.status === "停用") {
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "修改本人密码",
      targetType: "User",
      targetId: auth.user.id,
      result: "失败",
      summary: "当前账号不可用，不能修改密码。",
    });
    return NextResponse.json({ ok: false, message: "当前账号不可用，请重新登录。" }, { status: 401 });
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "修改本人密码",
      targetType: "User",
      targetId: auth.user.id,
      result: "拒绝",
      summary: "当前密码不正确。",
    });
    return NextResponse.json({ ok: false, message: "当前密码不正确。" }, { status: 400 });
  }

  try {
    assertPasswordExportSecretConfigured();
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "密码导出密钥未配置。";
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "修改本人密码",
      targetType: "User",
      targetId: auth.user.id,
      result: "失败",
      summary: message,
    });

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(newPassword),
      passwordExportCiphertext: encryptExportablePassword(newPassword),
      mustChangePassword: false,
    },
  });
  await recordUserDataAuditLog({
    actor: auth.user,
    request,
    action: "修改本人密码",
    targetType: "User",
    targetId: user.id,
    result: "成功",
    summary: "本人密码已修改，并同步更新可导出密码记录。",
  });

  return NextResponse.json({ ok: true, message: "密码已更新。" });
}
