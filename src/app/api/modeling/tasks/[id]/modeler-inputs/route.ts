import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { ModelingTaskUpdateError, updateModelingTask } from "@/lib/modeling-schedule-mutation";
import { getModelingScheduleData } from "@/lib/modeling-schedule-repository";
import { consumeModelingWritebackDraftAndRecalculate } from "@/lib/schedule-recalculation";

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

  const updatePayload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(payload, "remainingWorkdays")) {
    updatePayload.remainingWorkdays = payload.remainingWorkdays;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
    updatePayload.notes = payload.notes;
  }

  if (!Object.prototype.hasOwnProperty.call(updatePayload, "remainingWorkdays") && !Object.prototype.hasOwnProperty.call(updatePayload, "notes")) {
    return NextResponse.json({ ok: false, message: "请填写剩余工时或备注。" }, { status: 400 });
  }

  if (auth.user.authRole === "viewer") {
    const task = await prisma.modelingTask.findUnique({
      where: { id },
      select: { modelerId: true, isOutsourced: true },
    });

    if (!task) {
      return NextResponse.json({ ok: false, message: "没有找到这条建模款式。" }, { status: 404 });
    }

    if (task.isOutsourced || task.modelerId !== auth.user.id) {
      return NextResponse.json({ ok: false, message: "只能更新分配给自己的建模款式备注和剩余工时。" }, { status: 403 });
    }
  }

  try {
    const result = await updateModelingTask(id, updatePayload);
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
        message: error instanceof Error && error.message ? `保存建模备注失败：${error.message}` : "保存建模备注失败。",
      },
      { status: 500 },
    );
  }
}
