import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { FinanceProjectFactInputError, updateFinanceProjectFact } from "@/lib/finance/finance-estimation-repository";

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiRole(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as {
    actualDevelopmentCost?: unknown;
    totalOrderQuantity?: unknown;
    actualSales?: unknown;
    channelSampleQuantity?: unknown;
    displayBoxQuantity?: unknown;
    displayBoxUnitPrice?: unknown;
    notes?: unknown;
  } | null;

  if (!payload) {
    return NextResponse.json({ ok: false, message: "财务事实内容格式不正确。" }, { status: 400 });
  }

  const { projectId } = await context.params;

  try {
    const fact = await updateFinanceProjectFact({
      projectId,
      actualDevelopmentCost: payload.actualDevelopmentCost,
      totalOrderQuantity: payload.totalOrderQuantity,
      actualSales: payload.actualSales,
      channelSampleQuantity: payload.channelSampleQuantity,
      displayBoxQuantity: payload.displayBoxQuantity,
      displayBoxUnitPrice: payload.displayBoxUnitPrice,
      notes: payload.notes,
      updatedByUserId: auth.user.id,
    });

    return NextResponse.json({ ok: true, fact });
  } catch (error) {
    if (error instanceof FinanceProjectFactInputError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Failed to update finance project fact.", error);
    return NextResponse.json({ ok: false, message: "保存财务事实失败。" }, { status: 500 });
  }
}
