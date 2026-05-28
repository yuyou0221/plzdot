import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json(
    {
      ok: false,
      message: "产品组不再直接生成建模任务，请使用建模排期入口 /api/modeling/style-submissions。",
    },
    { status: 410 },
  );
}
