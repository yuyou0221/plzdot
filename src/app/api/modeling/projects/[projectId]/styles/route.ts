import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { getProjectModelingStyles, ModelingContractError } from "@/lib/modeling-product-guide-contract";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiRole(["admin", "manager", "viewer"]);
  if ("response" in auth) return auth.response;

  const { projectId } = await context.params;

  try {
    const result = await getProjectModelingStyles(projectId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ModelingContractError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `读取项目建模款式失败：${error.message}` : "读取项目建模款式失败。",
      },
      { status: 500 },
    );
  }
}
