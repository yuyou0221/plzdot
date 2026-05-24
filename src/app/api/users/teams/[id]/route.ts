import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { normalizeStatus, optionalText, requiredText } from "@/lib/user-data-mutation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
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

  const parentTeamId = optionalText(payload.parentTeamId);

  try {
    const team = await prisma.team.update({
      where: { id },
      data: {
        name,
        teamType: optionalText(payload.teamType) ?? "业务团队",
        parentTeamId: parentTeamId === id ? null : parentTeamId,
        leaderUserId: optionalText(payload.leaderUserId),
        status: normalizeStatus(payload.status),
        notes: optionalText(payload.notes),
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({ ok: true, id: team.id, message: `${team.name} 已保存。` });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error && error.message ? `保存团队失败：${error.message}` : "保存团队失败。" },
      { status: 500 },
    );
  }
}
