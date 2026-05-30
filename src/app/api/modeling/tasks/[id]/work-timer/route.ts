import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { ModelingTaskUpdateError, updateModelingWorkTimer } from "@/lib/modeling-schedule-mutation";
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

  const action = payload.action === "start" || payload.action === "stop" ? payload.action : null;

  if (!action) {
    return NextResponse.json({ ok: false, message: "计时操作不正确。" }, { status: 400 });
  }

  if (action === "stop") {
    return NextResponse.json({ ok: false, message: "停止建模计时由系统在开始其他款式或提交成果时自动处理。" }, { status: 400 });
  }

  try {
    const result = await updateModelingWorkTimer(id, action, auth.user);
    const data = await getModelingScheduleData();
    const task = data.tasks.find((item) => item.id === id);
    const affectedTaskIds = new Set(result.affectedTaskIds ?? [id]);
    const updatedTasks = data.tasks.filter((item) => affectedTaskIds.has(item.id));
    const projectSummary = data.projectSummaries.find((project) => project.projectId === result.projectId);

    return NextResponse.json({
      ok: true,
      message: result.message,
      task,
      updatedTasks,
      projectSummary,
      projectScheduleReadiness: result.writebackDraft,
    });
  } catch (error) {
    if (error instanceof ModelingTaskUpdateError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `记录建模工时失败：${error.message}` : "记录建模工时失败。",
      },
      { status: 500 },
    );
  }
}
