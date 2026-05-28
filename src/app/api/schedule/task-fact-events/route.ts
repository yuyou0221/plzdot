import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { appendMockIntegrationEntry, getMockIntegrationSnapshot } from "@/lib/product-guide-integration-mock";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const snapshot = await getMockIntegrationSnapshot();
  return NextResponse.json({ ok: true, events: snapshot.taskFactEvents });
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

  const validationMessage = validateProjectTaskFactEvent(payload);
  if (validationMessage) {
    return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
  }

  await appendMockIntegrationEntry("taskFactEvents", payload);

  return NextResponse.json({
    ok: true,
    message: "模拟项目排期已接收任务事实事件。",
  });
}

function validateProjectTaskFactEvent(payload: Record<string, unknown>) {
  if (!text(payload.eventId)) return "缺少 eventId。";
  if (!text(payload.eventType)) return "缺少 eventType。";
  if (payload.sourceModule !== "product-guide") return "sourceModule 必须为 product-guide。";
  if (!text(payload.projectId)) return "缺少 projectId。";
  if (typeof payload.taskNo !== "number") return "taskNo 必须为数字。";
  if (!text(payload.taskKey)) return "缺少 taskKey。";
  if (!text(payload.taskName)) return "缺少 taskName。";
  if (!text(payload.occurredAt) || !text(payload.occurredAt).includes("+08:00")) return "occurredAt 必须是带 +08:00 时区的 ISO 字符串。";
  if (!text(payload.operatorId)) return "缺少 operatorId。";
  if (!text(payload.operatorName)) return "缺少 operatorName。";
  if (typeof payload.payload !== "object" || payload.payload === null || Array.isArray(payload.payload)) return "payload 必须是对象。";
  return "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
