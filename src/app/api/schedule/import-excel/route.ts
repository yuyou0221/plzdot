import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json(
    {
      ok: false,
      message: "项目排期 Excel 直接导入已关闭。请先到数据导入页生成预览，校验通过后再确认导入。",
    },
    { status: 410 },
  );
}
