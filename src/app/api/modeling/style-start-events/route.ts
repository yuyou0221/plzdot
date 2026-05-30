import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { ModelingContractError, startModelingStyles } from "@/lib/modeling-product-guide-contract";

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
    const result = await startModelingStyles(payload, auth.user);
    const message =
      result.startedCount > 0
        ? `已启动 ${result.startedCount} 个建模款式，跳过 ${result.skippedCount} 个。`
        : `没有新的建模款式需要启动，跳过 ${result.skippedCount} 个。`;

    return NextResponse.json({
      ok: true,
      message,
      ...result,
    });
  } catch (error) {
    if (error instanceof ModelingContractError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `启动建模款式失败：${error.message}` : "启动建模款式失败。",
      },
      { status: 500 },
    );
  }
}
