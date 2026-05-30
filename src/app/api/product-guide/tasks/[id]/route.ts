import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { optionalText, parseDateOnly, todayDateOnly } from "@/lib/product-guide-mutation";
import { isModelingMilestoneTaskNo, milestoneByTaskNo } from "@/lib/schedule-domain";

export const runtime = "nodejs";

type TaskAction = "complete" | "progress" | "expected-finish" | "block" | "unblock" | "submit-review";
type ProjectTaskFactEventType =
  | "task_started"
  | "task_expected_finish_updated"
  | "task_submitted_for_review"
  | "task_completed"
  | "task_blocked"
  | "task_unblocked"
  | "task_paused"
  | "task_resumed"
  | "task_note_updated";

type ProjectTaskFactEvent = {
  eventId: string;
  eventType: ProjectTaskFactEventType;
  sourceModule: "product-guide";
  projectId: string;
  taskNo: number;
  taskKey: string;
  taskName: string;
  occurredAt: string;
  operatorId: string;
  operatorName: string;
  payload: Record<string, unknown>;
};

type ProjectTaskRow = {
  id: string;
  projectId: string;
  taskNo: number;
  taskName: string;
  milestoneType: string;
  status: string;
  actualStartDate: Date | null;
  actualFinishDate: Date | null;
  isBlocked: boolean;
};

const allowedTaskStatuses = new Set(["未开始", "进行中", "已完成", "阻塞", "暂停", "取消", "送审中", "已送审"]);
const actionSet = new Set<TaskAction>(["complete", "progress", "expected-finish", "block", "unblock", "submit-review"]);

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

  const action = optionalText(payload.action) as TaskAction | undefined;

  if (!action || !actionSet.has(action)) {
    return NextResponse.json({ ok: false, message: "无法识别任务动作。" }, { status: 400 });
  }

  try {
    const task = await prisma.projectTask.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        taskNo: true,
        taskName: true,
        milestoneType: true,
        status: true,
        actualStartDate: true,
        actualFinishDate: true,
        isBlocked: true,
      },
    });

    if (!task) {
      return NextResponse.json({ ok: false, message: "找不到对应任务。" }, { status: 404 });
    }

    const now = new Date();
    const operatorName = optionalText(payload.operatorName) ?? auth.user.name ?? "产品组工作指引";
    const event = buildProjectTaskFactEvent({
      action,
      payload,
      task,
      operatorId: auth.user.id,
      operatorName,
      occurredAt: occurredAtInChina(now),
    });

    const scheduleResult = await submitTaskFactEvent(request, event);
    const styleListHandoff =
      event.eventType === "task_completed" ? await buildOriginalArtStyleListHandoff(task.projectId, task.id) : null;
    const modelingStartEvent =
      event.eventType === "task_started" ? buildModelingStartEvent(task, operatorName, now) : null;

    return NextResponse.json({
      ok: true,
      message: scheduleResult.message ?? messageForEvent(event.eventType),
      event,
      ...styleListHandoff,
      ...modelingStartEvent,
      needsRecalculation: true,
    });
  } catch (error) {
    if (error instanceof MutationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `提交任务事实事件失败：${error.message}`
            : "提交任务事实事件失败。",
      },
      { status: 500 },
    );
  }
}

function buildProjectTaskFactEvent({
  action,
  payload,
  task,
  operatorId,
  operatorName,
  occurredAt,
}: {
  action: TaskAction;
  payload: Record<string, unknown>;
  task: ProjectTaskRow;
  operatorId: string;
  operatorName: string;
  occurredAt: string;
}): ProjectTaskFactEvent {
  const note = optionalText(payload.note) ?? null;
  const eventPayload = buildEventPayload(action, payload, task, note);

  return {
    eventId: randomUUID(),
    eventType: eventTypeForAction(action, payload, task),
    sourceModule: "product-guide",
    projectId: task.projectId,
    taskNo: task.taskNo,
    taskKey: `#${task.taskNo}`,
    taskName: task.taskName,
    occurredAt,
    operatorId,
    operatorName,
    payload: eventPayload,
  };
}

function buildEventPayload(action: TaskAction, payload: Record<string, unknown>, task: ProjectTaskRow, note: string | null) {
  if (action === "complete") {
    const actualFinishDate = requiredDateText(payload.actualFinishDate, "请填写有效的实际完成日期。") ?? todayString();
    const actualStartDate = optionalDateText(payload.actualStartDate) ?? formatDateOnly(task.actualStartDate);

    return compactPayload({
      actualStartDate,
      actualFinishDate,
      status: "已完成",
      note,
    });
  }

  if (action === "progress") {
    const status = optionalText(payload.status);

    if (status && !allowedTaskStatuses.has(status)) {
      throw new MutationError("任务状态不在允许范围内。", 400);
    }

    if (status === "阻塞") {
      throw new MutationError("阻塞需要填写阻塞原因，请使用“标记阻塞”。", 400);
    }

    if (!status && !note) {
      throw new MutationError("请填写任务状态或当前进度。", 400);
    }

    const actualStartDate =
      status === "进行中" ? optionalDateText(payload.actualStartDate) ?? formatDateOnly(task.actualStartDate) ?? todayString() : undefined;

    return compactPayload({
      actualStartDate,
      status,
      note,
    });
  }

  if (action === "expected-finish") {
    return compactPayload({
      expectedFinishDate: requiredDateText(payload.expectedFinishDate, "请填写有效的预计完成日期。"),
      status: "进行中",
      note,
    });
  }

  if (action === "submit-review") {
    const submittedAt = requiredDateText(payload.submittedAt, "请填写有效的送审日期。") ?? todayString();
    const expectedFinishDate = requiredDateText(payload.expectedFinishDate, "请填写有效的预计完成日期。");

    return compactPayload({
      actualStartDate: optionalDateText(payload.actualStartDate) ?? formatDateOnly(task.actualStartDate) ?? todayString(),
      submittedAt,
      expectedFinishDate,
      status: "送审中",
      reviewTarget: optionalText(payload.reviewTarget),
      note,
    });
  }

  if (action === "block") {
    const blockReason = optionalText(payload.blockReason);

    if (!blockReason) {
      throw new MutationError("请填写阻塞原因。", 400);
    }

    return compactPayload({
      status: "阻塞",
      blockReason,
      expectedFinishDate: optionalDateText(payload.expectedFinishDate),
      note,
    });
  }

  if (action === "unblock") {
    return compactPayload({
      status: optionalText(payload.status) ?? "进行中",
      expectedFinishDate: optionalDateText(payload.expectedFinishDate),
      note,
    });
  }

  return compactPayload({ note });
}

function eventTypeForAction(action: TaskAction, payload: Record<string, unknown>, task: ProjectTaskRow): ProjectTaskFactEventType {
  if (action === "complete") return "task_completed";
  if (action === "expected-finish") return "task_expected_finish_updated";
  if (action === "submit-review") return "task_submitted_for_review";
  if (action === "block") return "task_blocked";
  if (action === "unblock") return "task_unblocked";

  const status = optionalText(payload.status);

  if (status === "进行中") {
    if (task.isBlocked) return "task_unblocked";
    if (task.status === "暂停") return "task_resumed";
    if (task.status !== "进行中" && !task.actualStartDate) return "task_started";
  }

  if (status === "暂停") return "task_paused";

  return "task_note_updated";
}

async function submitTaskFactEvent(request: Request, event: ProjectTaskFactEvent) {
  const response = await fetch(new URL("/api/schedule/task-fact-events", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(event),
  });
  const result = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

  if (!response.ok || !result.ok) {
    throw new MutationError(result.message ?? "项目排期任务事实事件接口暂时不可用。", response.status || 502);
  }

  return result;
}

async function buildOriginalArtStyleListHandoff(projectId: string, completedTaskId: string) {
  const projectTasks = await prisma.projectTask.findMany({
    where: { projectId },
    orderBy: [{ taskNo: "asc" }],
    select: {
      id: true,
      taskNo: true,
      taskName: true,
      milestoneType: true,
      status: true,
      actualFinishDate: true,
    },
  });
  const originalArtTasks = projectTasks.filter(isOriginalArtTask);
  const completedOriginalArtTask = originalArtTasks.some((task) => task.id === completedTaskId);

  if (!completedOriginalArtTask) {
    return null;
  }

  const allOriginalArtTasksCompleted = originalArtTasks.every(isTaskCompleted);
  if (!allOriginalArtTasksCompleted) {
    return null;
  }

  const existingStyleCount = await prisma.modelingTask.count({ where: { projectId } });
  if (existingStyleCount > 0) {
    return null;
  }

  const taskRefs = buildStyleListTaskRefs(projectTasks);
  const modelingProjectTask = taskRefs.firstStyleTask ?? projectTasks.find(isModelingTask);

  return {
    requiresStyleList: true,
    styleListProjectTaskId: modelingProjectTask?.id,
    styleListTaskRefs: taskRefs,
    styleListMessage: modelingProjectTask
      ? "原画里程碑已完成，请录入建模款式清单。提交后先等待建模侧确认，任务 7 / 10 启动时再通知建模排期。"
      : "原画里程碑已完成，请录入建模款式清单；但当前项目缺少建模任务 7 / 10，请先确认任务模板。",
  };
}

function buildStyleListTaskRefs(tasks: Array<{ id: string; taskNo: number; taskName: string }>) {
  const firstStyleTask = tasks.find((task) => task.taskNo === 7);
  const remainingStylesTask = tasks.find((task) => task.taskNo === 10);

  return {
    firstStyleTask: firstStyleTask
      ? {
          id: firstStyleTask.id,
          taskNo: 7,
          taskName: firstStyleTask.taskName,
        }
      : undefined,
    remainingStylesTask: remainingStylesTask
      ? {
          id: remainingStylesTask.id,
          taskNo: 10,
          taskName: remainingStylesTask.taskName,
        }
      : undefined,
  };
}

function buildModelingStartEvent(
  task: { id: string; projectId: string; taskNo: number; taskName: string },
  operatorName: string,
  now: Date,
) {
  if (task.taskNo !== 7 && task.taskNo !== 10) {
    return null;
  }

  return {
    modelingStartEvent: {
      sourceRequestId: `product-guide:start:${task.id}:${now.getTime()}`,
      projectId: task.projectId,
      projectTaskId: task.id,
      taskNo: task.taskNo,
      taskName: task.taskName,
      startScope: task.taskNo === 7 ? "first-style" : "remaining-styles",
      startedAt: occurredAtInChina(now),
      startedByName: operatorName,
    },
  };
}

function isOriginalArtTask(task: { taskNo: number; taskName: string; milestoneType: string }) {
  return milestoneByTaskNo(task.taskNo) === "原画里程碑" || `${task.milestoneType} ${task.taskName}`.includes("原画");
}

function isModelingTask(task: { taskNo: number; taskName: string; milestoneType: string }) {
  return isModelingMilestoneTaskNo(task.taskNo) || `${task.milestoneType} ${task.taskName}`.includes("建模");
}

function isTaskCompleted(task: { status: string; actualFinishDate: Date | null }) {
  return Boolean(task.actualFinishDate) || task.status.includes("已完成") || task.status.includes("已通过");
}

function messageForEvent(eventType: ProjectTaskFactEventType) {
  if (eventType === "task_started") return "已提交任务开始事件，项目排期将记录事实并重新测算。";
  if (eventType === "task_completed") return "已提交任务完成事件，项目排期将记录事实并重新测算。";
  if (eventType === "task_expected_finish_updated") return "已提交预计完成时间变更事件。";
  if (eventType === "task_submitted_for_review") return "已提交任务送审事件。";
  if (eventType === "task_blocked") return "已提交任务阻塞事件。";
  if (eventType === "task_unblocked") return "已提交解除阻塞事件。";
  if (eventType === "task_paused") return "已提交任务暂停事件。";
  if (eventType === "task_resumed") return "已提交任务恢复事件。";
  return "已提交任务备注更新事件。";
}

function requiredDateText(value: unknown, message: string) {
  const text = optionalDateText(value);

  if (!text) {
    throw new MutationError(message, 400);
  }

  return text;
}

function optionalDateText(value: unknown) {
  const text = optionalText(value);

  if (!text) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new MutationError("日期格式应为 YYYY-MM-DD。", 400);
  }

  if (!parseDateOnly(text)) {
    throw new MutationError("日期格式应为 YYYY-MM-DD。", 400);
  }

  return text;
}

function todayString() {
  return formatDateOnly(todayDateOnly()) ?? "";
}

function formatDateOnly(date: Date | null) {
  if (!date) {
    return null;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function occurredAtInChina(date: Date) {
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);

  return `${chinaDate.toISOString().slice(0, 19)}+08:00`;
}

function compactPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );
}

class MutationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
