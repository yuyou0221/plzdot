import type { Prisma } from "@prisma/client";

export const canonicalTaskRuleSourceVersion = "任务规则v4";
export const standardScheduleTaskCount = 31;

export function canonicalTaskRuleWhere(): Prisma.TaskRuleWhereInput {
  return {
    isActive: true,
    sourceVersion: canonicalTaskRuleSourceVersion,
    taskNo: { gte: 1, lte: standardScheduleTaskCount },
  };
}

export function canonicalTaskRuleForTaskNoWhere(taskNo: number): Prisma.TaskRuleWhereInput {
  return {
    ...canonicalTaskRuleWhere(),
    taskNo,
  };
}
