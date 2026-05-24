import { isCompletedTaskStatus } from "@/lib/schedule-domain/status";

export type ScheduleResultViewMode = "plan" | "forecast";

export type ScheduleResultDateSource = {
  plannedFinishDate?: Date | null;
  forecastFinishDate?: Date | null;
  expectedFinishDate?: Date | null;
  actualFinishDate?: Date | null;
  displayStatus?: string | null;
  taskActionType?: string | null;
};

export function scheduleFinishDateForView(row: ScheduleResultDateSource, viewMode: ScheduleResultViewMode) {
  if (viewMode === "plan") {
    return row.plannedFinishDate ?? row.expectedFinishDate ?? row.forecastFinishDate ?? null;
  }

  if (isCompletedTaskStatus(row.displayStatus) || isCompletedTaskStatus(row.taskActionType)) {
    return row.actualFinishDate ?? row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate ?? null;
  }

  return row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate ?? null;
}

