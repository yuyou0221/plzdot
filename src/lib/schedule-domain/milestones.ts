export const scheduleMilestones = [
  "大货里程碑",
  "原画里程碑",
  "建模里程碑",
  "红蜡里程碑",
  "平面里程碑",
  "产前里程碑",
] as const;

export type ScheduleMilestone = (typeof scheduleMilestones)[number];

const scheduleMilestoneSet = new Set<string>(scheduleMilestones);

export function isKnownMilestone(value: string): value is ScheduleMilestone {
  return scheduleMilestoneSet.has(value);
}

export function milestoneByTaskNo(taskNo: number): ScheduleMilestone {
  if (taskNo >= 1 && taskNo <= 6) return "原画里程碑";
  if (isModelingMilestoneTaskNo(taskNo)) return "建模里程碑";
  if ((taskNo >= 11 && taskNo <= 15) || taskNo === 17 || taskNo === 18) return "红蜡里程碑";
  if (taskNo >= 21 && taskNo <= 27) return "产前里程碑";
  if (taskNo === 30) return "大货里程碑";
  return "平面里程碑";
}

export const modelingMilestoneTaskNos = [7, 8, 9, 10] as const;
export const displayOnlySideTaskNos = [8, 9] as const;

export function isModelingMilestoneTaskNo(taskNo: number) {
  return taskNo >= 7 && taskNo <= 10;
}

export function isDisplayOnlySideTaskNo(taskNo: number) {
  return displayOnlySideTaskNos.includes(taskNo as (typeof displayOnlySideTaskNos)[number]);
}

