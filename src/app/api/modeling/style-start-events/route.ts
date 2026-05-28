import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { appendMockIntegrationEntry, getMockIntegrationSnapshot } from "@/lib/product-guide-integration-mock";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const snapshot = await getMockIntegrationSnapshot();
  return NextResponse.json({ ok: true, events: snapshot.styleStartEvents });
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

  const taskNo = typeof payload.taskNo === "number" ? payload.taskNo : Number.NaN;
  const scope = text(payload.startScope);

  if (taskNo !== 7 && taskNo !== 10) {
    return NextResponse.json({ ok: false, message: "taskNo 必须是 7 或 10。" }, { status: 400 });
  }

  if ((taskNo === 7 && scope !== "first-style") || (taskNo === 10 && scope !== "remaining-styles")) {
    return NextResponse.json({ ok: false, message: "taskNo 和 startScope 不匹配。" }, { status: 400 });
  }

  await appendMockIntegrationEntry("styleStartEvents", payload);

  return NextResponse.json({
    ok: true,
    message: taskNo === 7 ? "模拟建模排期已启动第一款建模款式。" : "模拟建模排期已启动其余建模款式。",
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
