import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { confirmModelingStyleSubmission, ModelingContractError } from "@/lib/modeling-product-guide-contract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  try {
    const result = await confirmModelingStyleSubmission(payload, auth.user);

    return NextResponse.json({
      ok: true,
      message: result.action === "confirm" ? `已确认 ${result.confirmedCount} 个建模款式。` : `已退回 ${result.returnedCount} 个建模款式补充。`,
      ...result,
    });
  } catch (error) {
    if (error instanceof ModelingContractError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `提交款式清单确认失败：${error.message}` : "提交款式清单确认失败。",
      },
      { status: 500 },
    );
  }
}
