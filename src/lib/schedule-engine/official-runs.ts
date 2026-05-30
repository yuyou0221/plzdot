import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const officialScheduleRunTypes = ["正式测算", "任务事实重算", "导入重算"] as const;

export function officialScheduleRunWhere(): Prisma.ScheduleRunWhereInput {
  return {
    runStatus: "成功",
    runType: { in: [...officialScheduleRunTypes] },
  };
}

export function getLatestOfficialScheduleRun() {
  return prisma.scheduleRun.findFirst({
    where: officialScheduleRunWhere(),
    orderBy: { calculatedAt: "desc" },
  });
}
