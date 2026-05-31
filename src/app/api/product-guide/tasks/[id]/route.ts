import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { formatDate, optionalText, parseDateOnly, requiredText, todayDateOnly } from "@/lib/product-guide-mutation";
import {
  parseProjectTaskFactEvent,
  TaskFactEventValidationError,
  type ProjectTaskFactEvent,
} from "@/lib/schedule-task-fact-events";
import { ingestTaskFactEventAndRecalculate } from "@/lib/schedule-task-fact-events-service";
import { isModelingMilestoneTaskNo, milestoneByTaskNo } from "@/lib/schedule-domain";

export const runtime = "nodejs";

type TaskAction = "complete" | "progress" | "expected-finish" | "block" | "unblock" | "submit-review";

type ProductGuideTaskRow = {
  id: string;
  projectId: string;
  taskNo: number;
  taskName: string;
  milestoneType: string;
  status: string;
  actualStartDate: Date | null;
  actualFinishDate: Date | null;
  expectedFinishDate: Date | null;
  isBlocked: boolean;
};

const allowedTaskActions: TaskAction[] = ["complete", "progress", "expected-finish", "block", "unblock", "submit-review"];
const allowedTaskStatuses = new Set(["未开始", "进行中", "已完成", "阻塞", "暂停", "取消", "送审中", "已送审"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const action = optionalText(payload.action) as TaskAction | undefined;

  if (!action || !allowedTaskActions.includes(action)) {
    return NextResponse.json({ ok: false, message: "无法识别任务动作。" }, { status: 400 });
  }

  if (requiresManagerOverride(payload) && auth.user.authRole !== "admin" && auth.user.authRole !== "manager") {
    return NextResponse.json({ ok: false, message: "强制处理、历史补录和覆盖关键事实仅管理者可操作。" }, { status: 403 });
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
        expectedFinishDate: true,
        isBlocked: true,
      },
    });

    if (!task) {
      return NextResponse.json({ ok: false, message: "找不到对应任务。" }, { status: 404 });
    }

    const operatorName = optionalText(payload.operatorName) ?? auth.user.name ?? auth.user.loginName;
    const event = buildProjectTaskFactEvent({
      payload,
      action,
      task,
      operatorId: auth.user.id,
      operatorName,
    });
    const parsedEvent = parseProjectTaskFactEvent(event);
    const result = await ingestTaskFactEventAndRecalculate(parsedEvent);

    if (!result.ok) {
        return NextResponse.json(result, { status: result.status ?? 422 });
    }

    const styleListHandoff =
      !result.duplicate && parsedEvent.eventType === "task_completed"
        ? await buildOriginalArtStyleListHandoff(task.projectId, task.id)
        : null;
    const modelingStartEvent =
      !result.duplicate && parsedEvent.eventType === "task_started"
        ? buildModelingStartEvent(task, operatorName, parsedEvent.occurredAt)
        : null;

    return NextResponse.json({
      ok: true,
      id: result.projectTaskId ?? task.id,
      taskName: task.taskName,
      eventId: result.eventId,
      duplicate: result.duplicate,
      needsRecalculation: result.needsRecalculation,
      scheduleRunId: result.scheduleRunId,
      recalculation: result.recalculation,
      message: result.message,
      ...styleListHandoff,
      ...modelingStartEvent,
    });
  } catch (error) {
    if (error instanceof TaskFactEventValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    if (error instanceof MutationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `保存任务进度失败：${error.message}`
            : "保存任务进度失败。",
      },
      { status: 500 },
    );
  }
}

function requiresManagerOverride(payload: Record<string, unknown>) {
  return Boolean(
    payload.override ||
      payload.force ||
      payload.forceComplete ||
      payload.overrideExistingFact ||
      payload.backfill ||
      payload.historyBackfill ||
      payload.bulk,
  );
}

function buildProjectTaskFactEvent({
  payload,
  action,
  task,
  operatorId,
  operatorName,
}: {
  payload: Record<string, unknown>;
  action: TaskAction;
  task: ProductGuideTaskRow;
  operatorId: string;
  operatorName: string;
}): ProjectTaskFactEvent {
  const now = new Date();
  const note = optionalText(payload.note);
  const eventPayload = eventPayloadForAction(action, payload, task, note);

  return {
    eventId: optionalText(payload.eventId) ?? deterministicEventId(task.id, action, eventPayload),
    eventType: eventTypeForAction(action, payload, task),
    sourceModule: "product-guide",
    projectId: task.projectId,
    taskNo: task.taskNo,
    taskKey: `#${task.taskNo}`,
    taskName: task.taskName,
    occurredAt: toIsoWithLocalOffset(now),
    operatorId,
    operatorName,
    payload: eventPayload,
  };
}

function eventTypeForAction(
  action: TaskAction,
  payload: Record<string, unknown>,
  task: ProductGuideTaskRow,
): ProjectTaskFactEvent["eventType"] {
  if (action === "complete") return "task_completed";
  if (action === "expected-finish") return "task_expected_finish_updated";
  if (action === "block") return "task_blocked";
  if (action === "unblock") return "task_unblocked";
  if (action === "submit-review") return "task_submitted_for_review";

  const status = normalizeStatus(optionalText(payload.status));
  const currentStatus = normalizeStatus(task.status);

  if (status === "进行中") {
    if (task.isBlocked) return "task_unblocked";
    if (currentStatus === "暂停") return "task_resumed";
    if (currentStatus !== "进行中" && !task.actualStartDate) return "task_started";
  }

  if (status === "暂停") {
    return "task_paused";
  }

  if (status === "进行中" && !task.actualStartDate) {
    return "task_started";
  }

  return "task_note_updated";
}

function eventPayloadForAction(
  action: TaskAction,
  payload: Record<string, unknown>,
  task: ProductGuideTaskRow,
  note: string | undefined,
) {
  if (action === "complete") {
    const actualFinishDate = parseDateOnly(payload.actualFinishDate) ?? todayDateOnly();

    return {
      actualFinishDate: formatDate(actualFinishDate),
      ...(task.actualStartDate ? { actualStartDate: formatDate(task.actualStartDate) } : {}),
      status: "已完成",
      ...(note ? { note } : {}),
    };
  }

  if (action === "expected-finish") {
    const expectedFinishDate = parseDateOnly(payload.expectedFinishDate);
    if (!expectedFinishDate) {
      throw new MutationError("请填写有效的预计完成日期。", 400);
    }

    return {
      expectedFinishDate: formatDate(expectedFinishDate),
      status: "进行中",
      ...(note ? { note } : {}),
    };
  }

  if (action === "block") {
    const blockReason = requiredText(payload.blockReason);
    if (!blockReason) {
      throw new MutationError("请填写阻塞原因。", 400);
    }

    const expectedFinishDate = parseDateOnly(payload.expectedFinishDate);

    return {
      status: "阻塞",
      blockReason,
      ...(expectedFinishDate ? { expectedFinishDate: formatDate(expectedFinishDate) } : {}),
      ...(note ? { note } : {}),
    };
  }

  if (action === "unblock") {
    const expectedFinishDate = parseDateOnly(payload.expectedFinishDate);

    return {
      status: "进行中",
      ...(expectedFinishDate ? { expectedFinishDate: formatDate(expectedFinishDate) } : {}),
      ...(note ? { note } : {}),
    };
  }

  if (action === "submit-review") {
    const submittedAt = parseDateOnly(payload.submittedAt) ?? todayDateOnly();
    const expectedFinishDate = parseDateOnly(payload.expectedFinishDate) ?? task.expectedFinishDate ?? submittedAt;
    const reviewTarget = optionalText(payload.reviewTarget) ?? "版权方 / 审核方";

    return {
      submittedAt: formatDate(submittedAt),
      expectedFinishDate: formatDate(expectedFinishDate),
      status: "送审中",
      reviewTarget,
      ...(note ? { note } : {}),
    };
  }

  const status = normalizeStatus(optionalText(payload.status));
  if (status && !allowedTaskStatuses.has(status)) {
    throw new MutationError(`任务状态不在允许范围内：${status}`, 400);
  }

  if (!status && !note) {
    throw new MutationError("请填写任务状态或当前进度。", 400);
  }

  if (status === "进行中" && !task.actualStartDate) {
    const actualStartDate = parseDateOnly(payload.actualStartDate) ?? todayDateOnly();

    return {
      actualStartDate: formatDate(actualStartDate),
      status: "进行中",
      ...(note ? { note } : {}),
    };
  }

  return {
    ...(status ? { status } : {}),
    ...(note ? { note } : {}),
  };
}

function normalizeStatus(status: string | undefined) {
  if (!status) {
    return undefined;
  }

  if (status.includes("送审")) return "送审中";
  if (status.includes("阻塞")) return "阻塞";
  if (status.includes("暂停")) return "暂停";
  if (status.includes("取消")) return "取消";
  if (status.includes("完成")) return "已完成";
  if (status.includes("进行")) return "进行中";
  if (status.includes("未开始")) return "未开始";

  return status;
}

function deterministicEventId(taskId: string, action: TaskAction, payload: Record<string, unknown>) {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 20);
  return `product-guide:task-event:${taskId}:${action}:${hash}`;
}

function toIsoWithLocalOffset(date: Date) {
  const timezoneOffset = -date.getTimezoneOffset();
  const sign = timezoneOffset >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(timezoneOffset);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const minutes = String(absoluteOffset % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return `${local.toISOString().slice(0, 19)}${sign}${hours}:${minutes}`;
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
  occurredAt: string,
) {
  if (task.taskNo !== 7 && task.taskNo !== 10) {
    return null;
  }

  return {
    modelingStartEvent: {
      sourceRequestId: `product-guide:start:${task.id}:${Date.now()}`,
      projectId: task.projectId,
      projectTaskId: task.id,
      taskNo: task.taskNo,
      taskName: task.taskName,
      startScope: task.taskNo === 7 ? "first-style" : "remaining-styles",
      startedAt: occurredAt,
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

class MutationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
