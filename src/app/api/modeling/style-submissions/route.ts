import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import {
  appendMockIntegrationEntry,
  buildMockStyleCreateResult,
  getMockIntegrationSnapshot,
} from "@/lib/product-guide-integration-mock";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const snapshot = await getMockIntegrationSnapshot();
  return NextResponse.json({ ok: true, submissions: snapshot.styleSubmissions });
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

  const validationMessage = validateStyleSubmission(payload);
  if (validationMessage) {
    return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
  }

  await appendMockIntegrationEntry("styleSubmissions", payload);
  const result = await buildMockStyleCreateResult(payload);

  return NextResponse.json({
    ok: true,
    message: `模拟建模排期已接收 ${result.styles.length} 个款式，默认状态为未启动。`,
    ...result,
  });
}

function validateStyleSubmission(payload: Record<string, unknown>) {
  if (!text(payload.sourceRequestId)) return "缺少 sourceRequestId。";
  if (!text(payload.projectId)) return "缺少 projectId。";
  if (!text(payload.projectTaskId)) return "缺少 projectTaskId。";
  if (!Array.isArray(payload.styles) || payload.styles.length === 0) return "请至少提交一个款式。";

  const styles = payload.styles.filter((style): style is Record<string, unknown> => typeof style === "object" && style !== null && !Array.isArray(style));
  if (styles.length !== payload.styles.length) return "styles 必须是对象数组。";
  if (styles.filter((style) => style.isFirstModelingStyle === true).length !== 1) return "必须且只能有一个第一款建模款式。";
  if (styles.some((style) => !text(style.styleName))) return "款式名称不能为空。";

  return "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
