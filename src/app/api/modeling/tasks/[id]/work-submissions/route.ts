import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { ModelingTaskUpdateError, submitModelingWork } from "@/lib/modeling-schedule-mutation";
import { getModelingScheduleData } from "@/lib/modeling-schedule-repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin", "manager", "viewer"]);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  try {
    const result = await submitModelingWork(id, payload, auth.user);
    const data = await getModelingScheduleData();
    const task = data.tasks.find((item) => item.id === id);
    const projectSummary = data.projectSummaries.find((project) => project.projectId === result.projectId);

    return NextResponse.json({
      ok: true,
      message: result.message,
      task,
      projectSummary,
      reviewRequest: result.reviewRequest,
      productGuideEvent: result.productGuideEvent,
      writebackDraft: result.writebackDraft,
    });
  } catch (error) {
    if (error instanceof ModelingTaskUpdateError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `提交建模成果失败：${error.message}` : "提交建模成果失败。",
      },
      { status: 500 },
    );
  }
}
