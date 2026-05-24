import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { normalizeStatus, optionalText, requiredText } from "@/lib/user-data-mutation";

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
    return NextResponse.json({ ok: false, message: "请填写团队名称。" }, { status: 400 });
  }

  try {
    const team = await prisma.team.create({
      data: {
        name,
        teamType: optionalText(payload.teamType) ?? "业务团队",
        parentTeamId: optionalText(payload.parentTeamId),
        leaderUserId: optionalText(payload.leaderUserId),
        status: normalizeStatus(payload.status),
        notes: optionalText(payload.notes),
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({ ok: true, id: team.id, message: `${team.name} 已新增。` });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error && error.message ? `新增团队失败：${error.message}` : "新增团队失败。" },
      { status: 500 },
    );
  }
}
