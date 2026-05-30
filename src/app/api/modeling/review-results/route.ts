import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { ModelingContractError, recordModelingReviewResult } from "@/lib/modeling-product-guide-contract";

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
    const result = await recordModelingReviewResult(payload, auth.user);

    return NextResponse.json({
      ok: true,
      message: `审核结果已写入，当前状态：${result.modelingStatus}。`,
      ...result,
    });
  } catch (error) {
    if (error instanceof ModelingContractError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `写入审核结果失败：${error.message}` : "写入审核结果失败。",
      },
      { status: 500 },
    );
  }
}
