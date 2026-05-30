import type { Prisma } from "@prisma/client";

export type PlannedLaunchChangeDirection = "提前" | "延期";

export type PlannedLaunchAdjustmentRecord = {
  adjustmentId: string;
  projectId: string;
  projectName: string;
  fromMonth: string;
  toMonth: string;
  fromValue: string;
  toValue: string;
  direction: PlannedLaunchChangeDirection;
};

export async function recordPlannedLaunchDateAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    projectName: string;
    fromDate: Date;
    toDate: Date;
    source: string;
    adjustmentType: string;
    cardType: string;
    reason?: string;
    createdBy?: string;
    createdByName?: string;
  },
): Promise<PlannedLaunchAdjustmentRecord | null> {
  const fromValue = formatDate(input.fromDate);
  const toValue = formatDate(input.toDate);

  if (fromValue === toValue) {
    return null;
  }

  const direction = plannedLaunchChangeDirection(input.fromDate, input.toDate);
  const taskCardId = `${input.source}:${input.projectId}`;
  const fromMonth = formatMonthLabel(input.fromDate);
  const toMonth = formatMonthLabel(input.toDate);
  const reason = input.reason ?? `${input.projectName} 计划上线从 ${fromValue} ${direction}到 ${toValue}`;

  const createdAdjustment = await tx.scheduleAdjustment.create({
    data: {
      taskCardId,
      entityType: "Project",
      entityId: input.projectId,
      adjustmentType: input.adjustmentType,
      changedField: "plannedLaunchDate",
      fromValue,
      toValue,
      reason,
      requiresSimulation: true,
      affectsFinance: true,
      affectsReview: false,
      status: "已保存",
      createdBy: input.createdBy,
      createdByName: input.createdByName,
    },
  });

  await tx.taskDragLog.create({
    data: {
      taskCardId,
      cardType: input.cardType,
      entityType: "Project",
      entityId: input.projectId,
      fromLaneType: "launchMonth",
      fromLaneKey: fromMonth,
      toLaneType: "launchMonth",
      toLaneKey: toMonth,
      changedField: "plannedLaunchDate",
      fromValue,
      toValue,
      adjustmentId: createdAdjustment.id,
      confirmed: true,
      dragReason: reason,
      draggedBy: input.createdBy,
      draggedByName: input.createdByName,
    },
  });

  return {
    adjustmentId: createdAdjustment.id,
    projectId: input.projectId,
    projectName: input.projectName,
    fromMonth,
    toMonth,
    fromValue,
    toValue,
    direction,
  };
}

export function plannedLaunchChangeDirection(fromDate: Date, toDate: Date): PlannedLaunchChangeDirection {
  return dateOnlyTime(toDate) > dateOnlyTime(fromDate) ? "延期" : "提前";
}

export function plannedLaunchAdjustmentSummary(records: PlannedLaunchAdjustmentRecord[]) {
  const delayed = records.filter((record) => record.direction === "延期").length;
  const advanced = records.filter((record) => record.direction === "提前").length;
  const parts = [
    advanced > 0 ? `${advanced} 项提前` : "",
    delayed > 0 ? `${delayed} 项延期` : "",
  ].filter(Boolean);

  return parts.length > 0 ? `其中 ${parts.join("，")}。` : "";
}

function dateOnlyTime(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatMonthLabel(date: Date) {
  return `${String(date.getUTCFullYear()).slice(-2)}年${date.getUTCMonth() + 1}月`;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
