import type { Prisma } from "@prisma/client";

export const scheduleSimulationDataPrefix = "schedule-simulation:";
export const removedFromScheduleStatus = "已移出规划";

const inactiveScheduleStatusKeywords = ["取消", removedFromScheduleStatus, "移出规划"];

export function excludeScheduleSimulationProjectsWhere(): Prisma.ProjectWhereInput {
  return {
    AND: [
      {
        OR: [
          { sourceImportId: null },
          { NOT: { sourceImportId: { startsWith: scheduleSimulationDataPrefix } } },
        ],
      },
      ...inactiveScheduleStatusKeywords.flatMap((keyword) => [
        { NOT: { status: { contains: keyword } } },
        { OR: [{ currentStage: null }, { NOT: { currentStage: { contains: keyword } } }] },
      ]),
    ],
  };
}
