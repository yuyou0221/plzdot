import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  normalizeBoolean,
  normalizeStatus,
  optionalText,
  requiredText,
  stringList,
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
    return NextResponse.json({ ok: false, message: "请填写供应商名称。" }, { status: 400 });
  }

  try {
    const vendor = await prisma.outsourceVendor.create({
      data: {
        name,
        contactName: optionalText(payload.contactName),
        contactInfo: optionalText(payload.contactInfo),
        specialtyTags: stringList(payload.specialtyTags),
        stableCapacity: normalizeBoolean(payload.stableCapacity),
        status: normalizeStatus(payload.status),
        notes: optionalText(payload.notes),
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({ ok: true, id: vendor.id, message: `${vendor.name} 已新增。` });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error && error.message ? `新增外包供应商失败：${error.message}` : "新增外包供应商失败。" },
      { status: 500 },
    );
  }
}
