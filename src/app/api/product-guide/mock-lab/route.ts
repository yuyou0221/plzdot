import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import {
  appendMockIntegrationEntry,
  buildMockModelingProgress,
  buildMockModelingStyles,
  buildMockStyleCreateResult,
  clearMockIntegrationStore,
  getMockIntegrationSnapshot,
  type MockIntegrationKind,
} from "@/lib/product-guide-integration-mock";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  if (projectId) {
    const [snapshot, styles, progress] = await Promise.all([
      getMockIntegrationSnapshot(),
      buildMockModelingStyles(projectId),
      buildMockModelingProgress(projectId),
    ]);

    return NextResponse.json({
      ok: true,
      snapshot,
      styles: { ok: true, projectId, styles },
      progress: { ok: true, projectId, progress },
    });
  }

  return NextResponse.json({
    ok: true,
    snapshot: await getMockIntegrationSnapshot(),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const payload = isRecord(body.payload) ? body.payload : body;
  const kind = normalizeKind(body.kind) ?? kindFromTargetPath(text(body.path));
  if (!kind) {
    return NextResponse.json({ ok: false, message: "无法识别模拟写入类型。" }, { status: 400 });
  }

  await appendMockIntegrationEntry(kind, payload);

  if (kind === "styleSubmissions") {
    const result = await buildMockStyleCreateResult(payload);
    return NextResponse.json({
      ok: true,
      message: `模拟建模排期已接收 ${result.styles.length} 个款式，状态为待确认。`,
      ...result,
    });
  }

  return NextResponse.json({
    ok: true,
    message: mockMessageForKind(kind),
  });
}

export async function DELETE() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  await clearMockIntegrationStore();
  return NextResponse.json({ ok: true, message: "已清空本地模拟记录。" });
}

function normalizeKind(value: unknown): MockIntegrationKind | null {
  if (value === "taskFactEvents" || value === "styleSubmissions" || value === "styleStartEvents" || value === "reviewResults") {
    return value;
  }

  return null;
}

function kindFromTargetPath(path: string): MockIntegrationKind | null {
  if (path.includes("/api/schedule/task-fact-events")) return "taskFactEvents";
  if (path.includes("/api/modeling/style-submissions")) return "styleSubmissions";
  if (path.includes("/api/modeling/style-start-events")) return "styleStartEvents";
  if (path.includes("/api/modeling/review-results")) return "reviewResults";
  return null;
}

function mockMessageForKind(kind: MockIntegrationKind) {
  if (kind === "taskFactEvents") return "模拟项目排期已接收任务事实事件。";
  if (kind === "styleStartEvents") return "模拟建模排期已接收款式启动事件。";
  if (kind === "reviewResults") return "模拟建模排期已接收审核 / 送审结果。";
  return "模拟写入已记录。";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
