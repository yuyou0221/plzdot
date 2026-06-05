import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { updateFinanceEstimationConfig } from "@/lib/finance/finance-estimation-repository";

export async function PATCH(request: Request) {
  const auth = await requireApiRole(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as {
    discountRate?: unknown;
    salesByLevel?: unknown;
  } | null;

  if (!payload) {
    return NextResponse.json({ ok: false, message: "配置内容格式不正确。" }, { status: 400 });
  }

  const config = await updateFinanceEstimationConfig({
    discountRate: payload.discountRate,
    salesByLevel: payload.salesByLevel,
    updatedByUserId: auth.user.id,
  });

  return NextResponse.json({ ok: true, config });
}
