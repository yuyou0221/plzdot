import type { Prisma } from "@prisma/client";

export const scheduleSimulationDataPrefix = "schedule-simulation:";

export function excludeScheduleSimulationProjectsWhere(): Prisma.ProjectWhereInput {
  return {
    OR: [
      { sourceImportId: null },
      { NOT: { sourceImportId: { startsWith: scheduleSimulationDataPrefix } } },
    ],
  };
}
