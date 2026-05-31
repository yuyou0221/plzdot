import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { ModelingTaskUpdateError, updateModelingTask } from "@/lib/modeling-schedule-mutation";
import { getModelingScheduleData } from "@/lib/modeling-schedule-repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const action = payload.action === "mark" || payload.action === "clear" ? payload.action : null;
  const outsourceVendorId = typeof payload.outsourceVendorId === "string" ? payload.outsourceVendorId.trim() : "";

  if (!action) {
    return NextResponse.json({ ok: false, message: "外包事件不正确。" }, { status: 400 });
  }

  if (action === "mark" && !outsourceVendorId) {
    return NextResponse.json({ ok: false, message: "标记外包时必须选择外包供应商。" }, { status: 400 });
  }

  try {
    const result = await updateModelingTask(
      id,
      action === "mark"
        ? { isOutsourced: true, outsourceVendorId }
        : { isOutsourced: false, outsourceVendorId: null },
    );
    const data = await getModelingScheduleData();
    const task = data.tasks.find((item) => item.id === id);
    const projectSummary = data.projectSummaries.find((project) => project.projectId === result.projectId);

    return NextResponse.json({
      ok: true,
      message: result.message,
      eventType: result.eventType,
      task,
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
        message: error instanceof Error && error.message ? `保存外包事件失败：${error.message}` : "保存外包事件失败。",
      },
      { status: 500 },
    );
  }
}
