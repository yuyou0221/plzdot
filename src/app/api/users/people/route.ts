import { NextResponse } from "next/server";
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

  try {
    const person = await prisma.user.create({
      data: {
        name,
        teamId: optionalText(payload.teamId),
        roleTitle: optionalText(payload.roleTitle),
        userType: normalizeUserType(payload.userType),
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
