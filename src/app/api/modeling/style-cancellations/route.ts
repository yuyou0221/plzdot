import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { cancelModelingStyle, ModelingContractError } from "@/lib/modeling-product-guide-contract";
import { consumeModelingWritebackDraftAndRecalculate } from "@/lib/schedule-recalculation";

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
    const result = await cancelModelingStyle(payload, auth.user);
    const { writebackDraft, ...publicResult } = result;
    const scheduleSync = await consumeModelingWritebackDraftAndRecalculate(writebackDraft, {
      createdBy: auth.user.id,
    });

    return NextResponse.json({
      ok: true,
      message: `款式已取消：${result.styleName}。`,
      ...publicResult,
      projectScheduleReadiness: writebackDraft,
      scheduleSync,
    });
  } catch (error) {
    if (error instanceof ModelingContractError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `取消建模款式失败：${error.message}` : "取消建模款式失败。",
      },
      { status: 500 },
    );
  }
}
