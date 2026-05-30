import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const latestScheduleRunOrder = { calculatedAt: "desc" } as const;

export async function findLatestBusinessScheduleRun() {
  if (isScheduleSimulationRuntime()) {
    return prisma.scheduleRun.findFirst({
      where: { runStatus: "成功" },
      orderBy: latestScheduleRunOrder,
    });
  }

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
  if (isScheduleSimulationRuntime()) {
    return prisma.scheduleRun.findFirst({
      where: { runStatus: "成功" },
      orderBy: latestScheduleRunOrder,
      select,
    });
  }

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

function isScheduleSimulationRuntime() {
  return process.env.SCHEDULE_SIMULATION_RUNTIME === "1";
}
