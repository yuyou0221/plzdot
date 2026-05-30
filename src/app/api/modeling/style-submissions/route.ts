import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { ModelingContractError, submitModelingStyleSubmission } from "@/lib/modeling-product-guide-contract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager", "viewer"]);
  if ("response" in auth) return auth.response;

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  try {
    const result = await submitModelingStyleSubmission(payload, auth.user);

    return NextResponse.json({
      ok: true,
      message: `已接收 ${result.styles.length} 个建模款式，等待建模侧确认。`,
      ...result,
    });
  } catch (error) {
    if (error instanceof ModelingContractError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `提交建模款式失败：${error.message}` : "提交建模款式失败。",
      },
      { status: 500 },
    );
  }
}
