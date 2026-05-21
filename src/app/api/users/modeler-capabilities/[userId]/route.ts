import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { optionalNonNegativeInt, stringList } from "@/lib/user-data-mutation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const specialtyTags = stringList(payload.specialtyTags);
  const weaknessTags = stringList(payload.weaknessTags);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          isModeler: true,
          weeklyCapacityStyles: optionalNonNegativeInt(payload.weeklyCapacityStyles),
        },
        select: { id: true, name: true },
      });

      await tx.modelerCapabilityTag.deleteMany({ where: { userId } });

      const rows = [
        ...specialtyTags.map((tagName) => ({ userId, tagName, tagType: "擅长" })),
        ...weaknessTags.map((tagName) => ({ userId, tagName, tagType: "不擅长" })),
      ];

      if (rows.length > 0) {
        await tx.modelerCapabilityTag.createMany({ data: rows });
      }

      return updatedUser;
    });

    return NextResponse.json({ ok: true, id: user.id, message: `${user.name} 的建模能力已保存。` });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error && error.message ? `保存建模能力失败：${error.message}` : "保存建模能力失败。" },
      { status: 500 },
    );
  }
}
