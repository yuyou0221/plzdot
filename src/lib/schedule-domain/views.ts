import { isCompletedTaskStatus } from "@/lib/schedule-domain/status";

export type ScheduleResultViewMode = "plan" | "forecast";

export type ScheduleResultDateSource = {
  latestFinishDate?: Date | null;
  plannedFinishDate?: Date | null;
  forecastFinishDate?: Date | null;
  expectedFinishDate?: Date | null;
  actualFinishDate?: Date | null;
  displayStatus?: string | null;
  taskActionType?: string | null;
};

export function scheduleFinishDateForView(row: ScheduleResultDateSource, viewMode: ScheduleResultViewMode) {
  if (viewMode === "plan") {
    return row.latestFinishDate ?? null;
  }

  if (isCompletedTaskStatus(row.displayStatus) || isCompletedTaskStatus(row.taskActionType)) {
    return row.actualFinishDate ?? row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate ?? null;
  }

  return row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate ?? null;
}

export type PlanningMilestoneDateSource = {
  taskNo?: number | null;
  latestFinishDate?: Date | null;
  actualFinishDate?: Date | null;
  inferredCompletionDate?: Date | null;
  calculatedFinishDate?: Date | null;
};

export type PlanningMilestoneStatus = "done" | "doneLate" | "normal" | "delay";

export function getPlanningMilestoneDueDate({
  rows,
  fallbackDate,
}: {
  rows: PlanningMilestoneDateSource[];
  fallbackDate?: Date | null;
}) {
  const mainTaskNo = rows.some((row) => row.taskNo === 30) ? 30 : rows.some((row) => row.taskNo === 31) ? 31 : null;
  const candidateRows = mainTaskNo ? rows.filter((row) => row.taskNo === mainTaskNo) : rows;

  return latestDate(candidateRows.map((row) => row.latestFinishDate)) ?? latestDate(rows.map((row) => row.latestFinishDate)) ?? fallbackDate ?? null;
}

export function getPlanningMilestoneStatus({
  dueDate,
  completedDate,
  calculatedFinishDate,
  today,
}: {
  dueDate?: Date | null;
  completedDate?: Date | null;
  calculatedFinishDate?: Date | null;
  today: Date;
}): PlanningMilestoneStatus {
  if (completedDate) {
    if (!dueDate) {
      return "done";
    }

    return compareDateOnly(completedDate, dueDate) <= 0 ? "done" : "doneLate";
  }

  if (!dueDate) {
    return "normal";
  }

  if (compareDateOnly(today, dueDate) > 0) {
    return "delay";
  }

  if (calculatedFinishDate && compareDateOnly(calculatedFinishDate, dueDate) > 0) {
    return "delay";
  }

  return "normal";
}

function latestDate(values: Array<Date | null | undefined>) {
  let result: Date | null = null;

  for (const value of values) {
    if (!value) {
      continue;
    }

    if (!result || value.getTime() > result.getTime()) {
      result = value;
    }
  }

  return result;
}

function compareDateOnly(left: Date, right: Date) {
  return dateOnlyTime(left) - dateOnlyTime(right);
}

function dateOnlyTime(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

