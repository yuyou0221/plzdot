import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { buildMockModelingStyles } from "@/lib/product-guide-integration-mock";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const { projectId } = await context.params;

  if (!projectId) {
    return NextResponse.json({ ok: false, message: "缺少项目。" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    projectId,
    styles: await buildMockModelingStyles(projectId),
  });
}
