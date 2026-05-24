import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { hashPassword, isValidPassword } from "@/lib/auth/password";
import { normalizeAuthRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  normalizeBoolean,
  normalizeStatus,
  normalizeUserType,
  optionalNonNegativeInt,
  optionalText,
  requiredText,
} from "@/lib/user-data-mutation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const name = requiredText(payload.name);

  if (!name) {
    return NextResponse.json({ ok: false, message: "请填写姓名。" }, { status: 400 });
  }

  const loginName = optionalText(payload.loginName);
  const password = typeof payload.password === "string" ? payload.password : "";

  if (loginName && !isValidPassword(password)) {
    return NextResponse.json({ ok: false, message: "开通登录账号时，初始密码至少需要 8 位。" }, { status: 400 });
  }

  try {
    const person = await prisma.user.create({
      data: {
        name,
        teamId: optionalText(payload.teamId),
        roleTitle: optionalText(payload.roleTitle),
        userType: normalizeUserType(payload.userType),
        loginName,
        passwordHash: loginName ? hashPassword(password) : null,
        authRole: normalizeAuthRole(payload.authRole),
        isModeler: normalizeBoolean(payload.isModeler),
        weeklyCapacityStyles: optionalNonNegativeInt(payload.weeklyCapacityStyles),
        status: normalizeStatus(payload.status),
        notes: optionalText(payload.notes),
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({ ok: true, id: person.id, message: `${person.name} 已新增。` });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error && error.message ? `新增人员失败：${error.message}` : "新增人员失败。" },
      { status: 500 },
    );
  }
}
