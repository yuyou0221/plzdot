import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const latestScheduleRunOrder = { calculatedAt: "desc" } as const;

export async function findLatestBusinessScheduleRun() {
  const formalRun = await prisma.scheduleRun.findFirst({
    where: { runStatus: "成功", runType: "正式测算" },
    orderBy: latestScheduleRunOrder,
  });

  return (
    formalRun ??
    prisma.scheduleRun.findFirst({
      where: { runStatus: "成功" },
      orderBy: latestScheduleRunOrder,
    })
  );
}

export async function findLatestBusinessScheduleRunSelect<T extends Prisma.ScheduleRunSelect>(select: T) {
  const formalRun = await prisma.scheduleRun.findFirst({
    where: { runStatus: "成功", runType: "正式测算" },
    orderBy: latestScheduleRunOrder,
    select,
  });

  return (
    formalRun ??
    prisma.scheduleRun.findFirst({
      where: { runStatus: "成功" },
      orderBy: latestScheduleRunOrder,
      select,
    })
  );
}
