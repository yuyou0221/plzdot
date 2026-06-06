import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { updateModelingTask, ModelingTaskUpdateError } from "@/lib/modeling-schedule-mutation";
import { getModelingScheduleData } from "@/lib/modeling-schedule-repository";
import { consumeModelingWritebackDraftAndRecalculate } from "@/lib/schedule-recalculation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  try {
    const result = await updateModelingTask(id, payload);
    const data = await getModelingScheduleData();
    const task = data.tasks.find((item) => item.id === id);
    const projectSummary = data.projectSummaries.find((project) => project.projectId === result.projectId);
    const scheduleSync = await consumeModelingWritebackDraftAndRecalculate(result.writebackDraft, {
      createdBy: auth.user.id,
    });

    return NextResponse.json({
      ok: true,
      message: result.message,
      eventType: result.eventType,
      task,
      projectSummary,
      projectScheduleReadiness: result.writebackDraft,
      scheduleSync,
    });
  } catch (error) {
    if (error instanceof ModelingTaskUpdateError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `保存建模款式失败：${error.message}` : "保存建模款式失败。",
      },
      { status: 500 },
    );
  }
}
