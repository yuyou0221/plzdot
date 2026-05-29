import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { getModelingProductGuideEvents } from "@/lib/modeling-product-guide-events";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const searchParams = new URL(request.url).searchParams;
  const limitValue = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const events = await getModelingProductGuideEvents({
    projectId: searchParams.get("projectId"),
    eventType: searchParams.get("eventType"),
    status: searchParams.get("status"),
    limit: Number.isFinite(limitValue) ? limitValue : 50,
  });

  return NextResponse.json({
    ok: true,
    events,
  });
}
