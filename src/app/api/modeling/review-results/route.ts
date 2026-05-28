import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { appendMockIntegrationEntry, getMockIntegrationSnapshot } from "@/lib/product-guide-integration-mock";

export const runtime = "nodejs";

const reviewResults = new Set(["内部通过可送审", "内部不通过", "送审通过", "送审不通过"]);

export async function GET() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const snapshot = await getMockIntegrationSnapshot();
  return NextResponse.json({ ok: true, results: snapshot.reviewResults });
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  if (!text(payload.modelingTaskId)) {
    return NextResponse.json({ ok: false, message: "缺少 modelingTaskId。" }, { status: 400 });
  }

  if (!reviewResults.has(text(payload.reviewResult))) {
    return NextResponse.json({ ok: false, message: "审核结果不在允许范围内。" }, { status: 400 });
  }

  await appendMockIntegrationEntry("reviewResults", payload);

  return NextResponse.json({
    ok: true,
    message: "模拟建模排期已接收审核 / 送审结果。",
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
