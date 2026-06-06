import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canonicalTaskRuleForTaskNoWhere } from "@/lib/schedule-task-rules";

export const STANDARD_SCHEDULE_TASK_COUNT = 31;

const eventTypes = new Set<ProjectTaskFactEvent["eventType"]>([
  "task_started",
  "task_expected_finish_updated",
  "task_submitted_for_review",
  "task_completed",
  "task_blocked",
  "task_unblocked",
  "task_paused",
  "task_resumed",
  "task_note_updated",
]);

const allowedStatuses = new Set([
  "未开始",
  "进行中",
  "送审中",
  "已送审",
  "已完成",
  "阻塞",
  "暂停",
  "取消",
]);

const legacyStatusAliases = new Map([
  ["鏈紑濮?", "未开始"],
  ["杩涜涓?", "进行中"],
  ["閫佸涓?", "送审中"],
  ["宸查€佸", "已送审"],
  ["宸插畬鎴?", "已完成"],
  ["闃诲", "阻塞"],
  ["鏆傚仠", "暂停"],
  ["鍙栨秷", "取消"],
]);

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

type ProjectTaskFactEventSourceModule = "product-guide" | "manual-excel" | "modeling-schedule";

export type ProjectTaskFactEvent = {
  eventId: string;
  eventType: ProjectTaskFactEventType;
  sourceModule: ProjectTaskFactEventSourceModule;
  projectId: string;
  taskNo: number;
  taskKey: string;
  taskName: string;
  occurredAt: string;
  operatorId: string;
  operatorName: string;
  payload: Record<string, unknown>;
};

type TaskRow = {
  id: string;
  projectId: string;
  taskNo: number;
  taskName: string;
  status: string;
  actualStartDate: Date | null;
  actualFinishDate: Date | null;
  expectedFinishDate: Date | null;
  isBlocked: boolean;
  blockReason: string | null;
  progressNote: string | null;
};

export type IngestResult = {
  ok: boolean;
  eventId: string;
  duplicate: boolean;
  processingStatus: "processed" | "failed";
  projectTaskId?: string;
  needsRecalculation: boolean;
  message: string;
  status?: number;
};

type FailedResult = IngestResult & {
  ok: false;
  status: number;
};

export class TaskFactEventValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TaskFactEventValidationError";
    this.status = status;
  }
}

export function parseProjectTaskFactEvent(value: unknown): ProjectTaskFactEvent {
  if (!isPlainObject(value)) {
    throw new TaskFactEventValidationError("任务事实事件必须是 JSON 对象。");
  }

  const eventId = requiredString(value.eventId, "eventId");
  const eventType = requiredString(value.eventType, "eventType") as ProjectTaskFactEventType;

  if (!eventTypes.has(eventType)) {
    throw new TaskFactEventValidationError(`无法识别任务事实事件类型：${eventType}`);
  }

  const sourceModule = requiredString(value.sourceModule, "sourceModule");
  if (sourceModule !== "product-guide" && sourceModule !== "manual-excel" && sourceModule !== "modeling-schedule") {
    throw new TaskFactEventValidationError("任务事实事件 sourceModule 必须是 product-guide、manual-excel 或 modeling-schedule。");
  }

  const taskNo = positiveInteger(value.taskNo, "taskNo");
  if (!isStandardScheduleTaskNo(taskNo)) {
    throw new TaskFactEventValidationError(`taskNo 必须是 1-${STANDARD_SCHEDULE_TASK_COUNT} 的标准任务编号。`);
  }

  const occurredAt = requiredString(value.occurredAt, "occurredAt");
  if (!dateTimeFromIso(occurredAt)) {
    throw new TaskFactEventValidationError("occurredAt 必须是带时区的 ISO 时间字符串。");
  }

  const payload = isPlainObject(value.payload) ? value.payload : null;
  if (!payload) {
    throw new TaskFactEventValidationError("payload 必须是 JSON 对象。");
  }

  return {
    eventId,
    eventType,
    sourceModule,
    projectId: requiredString(value.projectId, "projectId"),
    taskNo,
    taskKey: requiredString(value.taskKey, "taskKey"),
    taskName: requiredString(value.taskName, "taskName"),
    occurredAt,
    operatorId: requiredString(value.operatorId, "operatorId"),
    operatorName: requiredString(value.operatorName, "operatorName"),
    payload,
  };
}

export async function ingestProjectTaskFactEvent(event: ProjectTaskFactEvent): Promise<IngestResult> {
  return prisma.$transaction((tx) => ingestProjectTaskFactEventWithTx(tx, event));
}

export async function ingestProjectTaskFactEventWithTx(
  tx: Prisma.TransactionClient,
  event: ProjectTaskFactEvent,
): Promise<IngestResult> {
  const existingEvent = await tx.projectTaskFactEventLog.findUnique({
    where: { eventId: event.eventId },
    select: {
      eventId: true,
      projectTaskId: true,
      processingStatus: true,
      errorMessage: true,
    },
  });

  if (existingEvent) {
    const processed = existingEvent.processingStatus === "processed";

    return {
      ok: processed,
      eventId: existingEvent.eventId,
      duplicate: true,
      processingStatus: processed ? "processed" : "failed",
      projectTaskId: existingEvent.projectTaskId ?? undefined,
      needsRecalculation: false,
      message: processed ? "项目排期已接收任务事实事件" : (existingEvent.errorMessage ?? "任务事实事件此前处理失败。"),
      status: processed ? undefined : 409,
    };
  }

  const project = await tx.project.findUnique({
    where: { id: event.projectId },
    select: { id: true },
  });

  if (!project) {
    return createFailedEventLog(tx, event, "项目不存在，无法写入任务事实。", 404);
  }

  const task = await resolveProjectTask(tx, event);
  if (!task.ok) {
    return task;
  }

  const taskPatch = buildProjectTaskPatch(event, task.row);
  if (!taskPatch.ok) {
    return createFailedEventLog(tx, event, taskPatch.message, taskPatch.status, task.row.id);
  }

  const oldValue: Prisma.InputJsonObject = taskSnapshot(task.row);
  const updatedTask = await tx.projectTask.update({
    where: { id: task.row.id },
    data: taskPatch.data,
    select: taskSelect,
  });
  const eventPayload = toJsonObject(event.payload);
  const newValue: Prisma.InputJsonObject = {
    ...taskSnapshot(updatedTask),
    eventType: event.eventType,
    eventPayload,
  };
  const note = textValue(event.payload.note) ?? taskPatch.defaultNote;

  await tx.progressUpdate.create({
    data: {
      projectId: event.projectId,
      projectTaskId: updatedTask.id,
      updateType: updateTypeLabel(event.eventType),
      oldValue,
      newValue,
      note,
      updatedBy: event.operatorId,
      updatedByName: event.operatorName,
    },
  });

  const eventLog = await tx.projectTaskFactEventLog.create({
    data: {
      eventId: event.eventId,
      eventType: event.eventType,
      sourceModule: event.sourceModule,
      projectId: event.projectId,
      projectTaskId: updatedTask.id,
      taskNo: event.taskNo,
      taskKey: event.taskKey,
      taskName: event.taskName,
      occurredAt: dateTimeFromIso(event.occurredAt)!,
      operatorId: event.operatorId,
      operatorName: event.operatorName,
      payload: eventPayload,
      processingStatus: "processed",
    },
    select: { eventId: true, projectTaskId: true },
  });

  return {
    ok: true,
    eventId: eventLog.eventId,
    duplicate: false,
    processingStatus: "processed",
    projectTaskId: eventLog.projectTaskId ?? undefined,
    needsRecalculation: true,
    message: "项目排期已接收任务事实事件",
  };
}

const taskSelect = {
  id: true,
  projectId: true,
  taskNo: true,
  taskName: true,
  status: true,
  actualStartDate: true,
  actualFinishDate: true,
  expectedFinishDate: true,
  isBlocked: true,
  blockReason: true,
  progressNote: true,
} satisfies Prisma.ProjectTaskSelect;

async function resolveProjectTask(tx: Prisma.TransactionClient, event: ProjectTaskFactEvent) {
  const existingTask = await tx.projectTask.findFirst({
    where: { projectId: event.projectId, taskNo: event.taskNo },
    orderBy: { id: "asc" },
    select: taskSelect,
  });

  if (existingTask) {
    return { ok: true as const, row: existingTask };
  }

  const taskRule = await tx.taskRule.findFirst({
    where: canonicalTaskRuleForTaskNoWhere(event.taskNo),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      taskName: true,
      milestoneType: true,
    },
  });

  if (!taskRule) {
    return createFailedEventLog(tx, event, "找不到对应任务规则，无法初始化 ProjectTask。", 422);
  }

  const createdTask = await tx.projectTask.create({
    data: {
      projectId: event.projectId,
      taskRuleId: taskRule.id,
      taskNo: event.taskNo,
      taskName: taskRule.taskName || event.taskName,
      milestoneType: taskRule.milestoneType,
      status: "未开始",
    },
    select: taskSelect,
  });

  return { ok: true as const, row: createdTask };
}

function buildProjectTaskPatch(event: ProjectTaskFactEvent, task: TaskRow) {
  const occurredAt = dateTimeFromIso(event.occurredAt)!;
  const operatorName = event.operatorName || event.operatorId;
  const payload = event.payload;
  const note = textValue(payload.note);
  const data: Prisma.ProjectTaskUpdateInput = {
    lastUpdatedAt: occurredAt,
    lastUpdatedBy: operatorName,
  };
  let defaultNote: string | undefined;

  if (event.eventType === "task_started") {
    const actualStartDate = requiredDate(payload.actualStartDate, "actualStartDate");
    data.status = "进行中";
    data.actualStartDate = actualStartDate;
    data.progressNote = note ?? task.progressNote;
    defaultNote = note;
  }

  if (event.eventType === "task_expected_finish_updated") {
    const expectedFinishDate = requiredDate(payload.expectedFinishDate, "expectedFinishDate");
    data.status = statusValue(payload.status, "进行中");
    data.expectedFinishDate = expectedFinishDate;
    data.progressNote = note ?? task.progressNote;
    defaultNote = note;
  }

  if (event.eventType === "task_submitted_for_review") {
    requiredDate(payload.submittedAt, "submittedAt");
    const expectedFinishDate = requiredDate(payload.expectedFinishDate, "expectedFinishDate");
    data.status = statusValue(payload.status, "送审中");
    data.expectedFinishDate = expectedFinishDate;
    data.progressNote = note ?? task.progressNote;
    defaultNote = note;
  }

  if (event.eventType === "task_completed") {
    const actualFinishDate = requiredDate(payload.actualFinishDate, "actualFinishDate");
    const actualStartDate = optionalDate(payload.actualStartDate, "actualStartDate");
    data.status = "已完成";
    data.actualFinishDate = actualFinishDate;
    data.isBlocked = false;
    data.blockReason = null;
    data.progressNote = note ?? task.progressNote;

    if (actualStartDate && !task.actualStartDate) {
      data.actualStartDate = actualStartDate;
    }

    defaultNote = note;
  }

  if (event.eventType === "task_blocked") {
    const blockReason = requiredPayloadText(payload.blockReason, "blockReason");
    const expectedFinishDate = optionalDate(payload.expectedFinishDate, "expectedFinishDate");
    const status = statusValue(payload.status, "阻塞");

    if (status !== "阻塞") {
      return failedPatch("task_blocked 的 status 必须是“阻塞”。");
    }

    data.status = "阻塞";
    data.isBlocked = true;
    data.blockReason = blockReason;
    data.progressNote = note ?? blockReason;

    if (expectedFinishDate) {
      data.expectedFinishDate = expectedFinishDate;
    }

    defaultNote = note ?? blockReason;
  }

  if (event.eventType === "task_unblocked") {
    const expectedFinishDate = optionalDate(payload.expectedFinishDate, "expectedFinishDate");
    data.status = statusValue(payload.status, "进行中");
    data.isBlocked = false;
    data.blockReason = null;
    data.progressNote = note ?? task.progressNote;

    if (expectedFinishDate) {
      data.expectedFinishDate = expectedFinishDate;
    }

    defaultNote = note;
  }

  if (event.eventType === "task_paused") {
    const status = statusValue(payload.status, "暂停");

    if (status !== "暂停") {
      return failedPatch("task_paused 的 status 必须是“暂停”。");
    }

    data.status = "暂停";
    data.progressNote = note ?? task.progressNote;
    defaultNote = note;
  }

  if (event.eventType === "task_resumed") {
    const status = statusValue(payload.status, "进行中");
    const actualStartDate = optionalDate(payload.actualStartDate, "actualStartDate");

    if (status !== "进行中") {
      return failedPatch("task_resumed 的 status 必须是“进行中”。");
    }

    data.status = "进行中";
    data.progressNote = note ?? task.progressNote;

    if (actualStartDate && !task.actualStartDate) {
      data.actualStartDate = actualStartDate;
    }

    defaultNote = note;
  }

  if (event.eventType === "task_note_updated") {
    const status = textValue(payload.status);

    if (!note && !status) {
      return failedPatch("task_note_updated 必须包含 note 或 status。");
    }

    if (status) {
      if (!allowedStatuses.has(status)) {
        return failedPatch(`任务状态不在允许范围内：${status}`);
      }
      data.status = status;
    }

    if (note) {
      data.progressNote = note;
    }

    defaultNote = note;
  }

  return {
    ok: true as const,
    data,
    defaultNote,
  };
}

async function createFailedEventLog(
  tx: Prisma.TransactionClient,
  event: ProjectTaskFactEvent,
  errorMessage: string,
  status: number,
  projectTaskId?: string,
): Promise<FailedResult> {
  await tx.projectTaskFactEventLog.create({
    data: {
      eventId: event.eventId,
      eventType: event.eventType,
      sourceModule: event.sourceModule,
      projectId: event.projectId,
      projectTaskId,
      taskNo: event.taskNo,
      taskKey: event.taskKey,
      taskName: event.taskName,
      occurredAt: dateTimeFromIso(event.occurredAt)!,
      operatorId: event.operatorId,
      operatorName: event.operatorName,
      payload: toJsonObject(event.payload),
      processingStatus: "failed",
      errorMessage,
    },
  });

  return {
    ok: false,
    eventId: event.eventId,
    duplicate: false,
    processingStatus: "failed",
    projectTaskId,
    needsRecalculation: false,
    message: errorMessage,
    status,
  };
}

function failedPatch(message: string) {
  return {
    ok: false as const,
    message,
    status: 400,
  };
}

function updateTypeLabel(eventType: ProjectTaskFactEventType) {
  const labels: Record<ProjectTaskFactEventType, string> = {
    task_started: "任务事实：开始推进",
    task_expected_finish_updated: "任务事实：更新预计完成",
    task_submitted_for_review: "任务事实：提交送审",
    task_completed: "任务事实：标记完成",
    task_blocked: "任务事实：标记阻塞",
    task_unblocked: "任务事实：解除阻塞",
    task_paused: "任务事实：暂停",
    task_resumed: "任务事实：恢复",
    task_note_updated: "任务事实：备注更新",
  };

  return labels[eventType];
}

function taskSnapshot(task: TaskRow) {
  return {
    taskNo: task.taskNo,
    taskName: task.taskName,
    status: task.status,
    actualStartDate: formatDate(task.actualStartDate),
    actualFinishDate: formatDate(task.actualFinishDate),
    expectedFinishDate: formatDate(task.expectedFinishDate),
    isBlocked: task.isBlocked,
    blockReason: task.blockReason,
    progressNote: task.progressNote,
  };
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  throw new TaskFactEventValidationError(`缺少 ${fieldName}`);
}

function requiredPayloadText(value: unknown, fieldName: string) {
  const text = textValue(value);
  if (text) {
    return text;
  }

  throw new TaskFactEventValidationError(`缺少 ${fieldName}`);
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    throw new TaskFactEventValidationError(`缺少 ${fieldName}`);
  }

  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  throw new TaskFactEventValidationError(`${fieldName} 必须是正整数。`);
}

function isStandardScheduleTaskNo(taskNo: number) {
  return Number.isInteger(taskNo) && taskNo >= 1 && taskNo <= STANDARD_SCHEDULE_TASK_COUNT;
}

function statusValue(value: unknown, fallback: string) {
  const rawStatus = textValue(value) ?? fallback;
  const status = legacyStatusAliases.get(rawStatus) ?? rawStatus;

  if (!allowedStatuses.has(status)) {
    throw new TaskFactEventValidationError(`任务状态不在允许范围内：${status}`);
  }

  return status;
}

function requiredDate(value: unknown, fieldName: string) {
  const date = optionalDate(value, fieldName);

  if (date) {
    return date;
  }

  throw new TaskFactEventValidationError(`${fieldName} 必须是 YYYY-MM-DD 格式。`);
}

function optionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new TaskFactEventValidationError(`${fieldName} 必须是 YYYY-MM-DD 格式。`);
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new TaskFactEventValidationError(`${fieldName} 必须是 YYYY-MM-DD 格式。`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new TaskFactEventValidationError(`${fieldName} 必须是有效日期。`);
  }

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new TaskFactEventValidationError(`${fieldName} 必须是有效日期。`);
  }

  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateTimeFromIso(value: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!hasTimezone) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
