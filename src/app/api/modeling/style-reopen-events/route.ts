import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { ModelingContractError, reopenApprovedModelingStyle } from "@/lib/modeling-product-guide-contract";

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
    const result = await reopenApprovedModelingStyle(payload, auth.user);

    return NextResponse.json({
      ok: true,
      message: `已通过款式已重开：${result.styleName}。`,
      ...result,
    });
  } catch (error) {
    if (error instanceof ModelingContractError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `重开已通过款式失败：${error.message}` : "重开已通过款式失败。",
      },
      { status: 500 },
    );
  }
}
