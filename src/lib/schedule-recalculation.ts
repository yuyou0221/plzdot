import "server-only";

import { prisma } from "@/lib/db/prisma";
import { excludeScheduleSimulationProjectsWhere } from "@/lib/schedule-simulation";
import { defaultScheduleEnginePort, runAndPersistScheduleAnalysis } from "@/lib/schedule-engine/service";

export async function createOfficialScheduleRecalculation(input: {
  runName: string;
  runType: string;
  source: string;
  createdBy?: string | null;
  sourceImportId?: string | null;
}) {
  const syncedModelingFacts = await syncApprovedModelingProgressToProjectTasks();
  const run = await prisma.scheduleRun.create({
    data: {
      runName: input.runName,
      runType: input.runType,
      sourceImportId: input.sourceImportId ?? null,
      scriptName: defaultScheduleEnginePort.engineName,
      scriptVersion: defaultScheduleEnginePort.engineVersion,
      inputSnapshot: {
        source: input.source,
        triggeredAt: new Date().toISOString(),
        syncedModelingFacts,
      },
      runStatus: "进行中",
      createdBy: input.createdBy ?? null,
    },
  });

  try {
    const analysis = await runAndPersistScheduleAnalysis(run.id);

    await prisma.scheduleRun.update({
      where: { id: run.id },
      data: {
        runStatus: "成功",
        scriptName: analysis.engineName,
        scriptVersion: analysis.engineVersion,
      },
    });

    return {
      ok: true as const,
      scheduleRunId: run.id,
      projectCount: analysis.payload.projectCount,
      futureTaskCount: analysis.payload.futureTaskCount,
      message: "已完成正式排期重算。",
    };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "排期重算失败。";

    await prisma.scheduleRun.update({
      where: { id: run.id },
      data: {
        runStatus: "失败",
        errorMessage: message,
      },
    });

    return {
      ok: false as const,
      scheduleRunId: run.id,
      message: `数据已保存，但排期重算失败：${message}`,
    };
  }
}

export async function syncApprovedModelingProgressToProjectTasks() {
  const projects = await prisma.project.findMany({
    where: excludeScheduleSimulationProjectsWhere(),
    select: { id: true },
  });
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) return 0;

  const projectTasks = await prisma.projectTask.findMany({
    where: {
      taskNo: { in: [7, 10] },
      projectId: { in: projectIds },
    },
    select: {
      id: true,
      projectId: true,
      taskNo: true,
      actualFinishDate: true,
    },
  });
  const projectTaskIds = projectTasks.map((task) => task.id);
  if (projectTaskIds.length === 0) return 0;

  const modelingTasks = await prisma.modelingTask.findMany({
    where: {
      projectTaskId: { in: projectTaskIds },
      affectsProjectSchedule: true,
      isRequired: true,
    },
    select: {
      projectTaskId: true,
      status: true,
      actualFinishDate: true,
      copyrightApprovedDate: true,
      updatedAt: true,
    },
  });
  const modelingTasksByProjectTaskId = new Map<string, typeof modelingTasks>();

  for (const task of modelingTasks) {
    const rows = modelingTasksByProjectTaskId.get(task.projectTaskId) ?? [];
    rows.push(task);
    modelingTasksByProjectTaskId.set(task.projectTaskId, rows);
  }

  let syncedCount = 0;
  for (const projectTask of projectTasks) {
    if (projectTask.actualFinishDate) continue;

    const rows = modelingTasksByProjectTaskId.get(projectTask.id) ?? [];
    if (rows.length === 0 || !rows.every((task) => task.status === "已通过")) {
      continue;
    }

    const finishDate = maxDate(rows.map((task) => task.copyrightApprovedDate ?? task.actualFinishDate ?? task.updatedAt));
    if (!finishDate) continue;

    await prisma.projectTask.update({
      where: { id: projectTask.id },
      data: {
        status: "已完成",
        actualFinishDate: dateOnly(finishDate),
        progressNote: `建模排期已确认任务 ${projectTask.taskNo} 的必做款式全部通过，项目排期在重算前同步完成事实。`,
      },
    });
    syncedCount += 1;
  }

  return syncedCount;
}

function maxDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .map((value) => value.getTime());

  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
}

function dateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12));
}
