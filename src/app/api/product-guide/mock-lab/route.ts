import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { clearMockIntegrationStore, getMockIntegrationSnapshot } from "@/lib/product-guide-integration-mock";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json({
    ok: true,
    snapshot: await getMockIntegrationSnapshot(),
  });
}

export async function DELETE() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  await clearMockIntegrationStore();
  return NextResponse.json({ ok: true, message: "已清空本地模拟记录。" });
}
