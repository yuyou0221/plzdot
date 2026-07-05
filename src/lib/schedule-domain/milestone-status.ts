import { isCompletedTaskStatus } from "@/lib/schedule-domain/status";

export type ScheduleMilestoneRiskLevel = "done" | "doneLate" | "normal" | "risk" | "delay";

export type ScheduleMilestoneTaskInput = {
  displayStatus?: string | null;
  taskActionType?: string | null;
  rawResult?: unknown;
};

export function evaluateScheduleMilestoneRiskLevel<T extends ScheduleMilestoneTaskInput>(
  rows: T[],
  riskLevelForRow: (row: T) => ScheduleMilestoneRiskLevel,
) {
  const activeRows = rows.filter(isActiveScheduleMilestoneTask);

  if (activeRows.length > 0 && activeRows.every(isCompletedScheduleMilestoneTask)) {
    return activeRows.some((row) => riskLevelForRow(row) === "doneLate") ? "doneLate" : "done";
  }

  return activeRows.filter((row) => !isCompletedScheduleMilestoneTask(row)).reduce<ScheduleMilestoneRiskLevel>((level, row) => {
    return worseScheduleMilestoneRiskLevel(level, riskLevelForRow(row));
  }, "normal");
}

export function isCompletedScheduleMilestoneTask(row: ScheduleMilestoneTaskInput) {
  if ([row.displayStatus, row.taskActionType].some(isCompletedTaskStatus)) {
    return true;
  }

  const raw = rawObject(row.rawResult);

  return (
    Boolean(rawDateText(raw.actualFinishDate)) ||
    Boolean(rawDateText(raw.inferredCompletionDate)) ||
    rawBoolean(raw.inferredCompleted) === true ||
    isCompletedTaskStatus(rawText(raw.taskStatus)) ||
    isCompletedTaskStatus(rawText(raw.status))
  );
}

export function isActiveScheduleMilestoneTask(row: ScheduleMilestoneTaskInput) {
  const raw = rawObject(row.rawResult);
  const enabled = firstBoolean(raw.taskEnabled, raw.enabled, raw.isEnabled, raw.isActive, raw.isApplicable);

  if (firstBoolean(raw.nonSchedulingTask, raw.displayOnlySideTask) === true) {
    return false;
  }

  if (enabled === false) {
    return false;
  }

  const statusText = [row.displayStatus, row.taskActionType, rawText(raw.taskStatus), rawText(raw.status)]
    .filter(Boolean)
    .join(" ");

  return !statusText.includes("取消") && !statusText.includes("不适用");
}

function worseScheduleMilestoneRiskLevel(current: ScheduleMilestoneRiskLevel, next: ScheduleMilestoneRiskLevel) {
  const weight: Record<ScheduleMilestoneRiskLevel, number> = {
    done: 0,
    doneLate: 0,
    normal: 1,
    risk: 2,
    delay: 3,
  };

  return weight[next] > weight[current] ? next : current;
}

function rawObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rawText(value: unknown) {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function rawDateText(value: unknown) {
  const text = rawText(value);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text : null;
}

function rawBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true" || value === "是") return true;
    if (value === "false" || value === "否") return false;
  }

  return null;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    const parsed = rawBoolean(value);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}
