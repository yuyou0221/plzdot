import "server-only";

import { prisma } from "@/lib/db/prisma";
import { excludeScheduleSimulationProjectsWhere } from "@/lib/schedule-simulation";
import { defaultScheduleEnginePort, runAndPersistScheduleAnalysis } from "@/lib/schedule-engine/service";
import { isCompletedTaskStatus } from "@/lib/schedule-domain/status";
import { ingestProjectTaskFactEventWithTx, parseProjectTaskFactEvent } from "@/lib/schedule-task-fact-events-core";

export async function createOfficialScheduleRecalculation(input: {
  runName: string;
  runType: string;
  source: string;
  createdBy?: string | null;
  sourceImportId?: string | null;
  syncedModelingFacts?: number;
  skipModelingFactSync?: boolean;
}) {
  const syncedModelingFacts = input.skipModelingFactSync
    ? (input.syncedModelingFacts ?? 0)
    : await syncApprovedModelingProgressToProjectTasks();
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

export async function consumeModelingWritebackDraftAndRecalculate(
  writebackDraft: { projectId?: string | null; projectTaskId?: string | null } | null | undefined,
  input: { createdBy?: string | null } = {},
) {
  const projectId = writebackDraft?.projectId?.trim();

  if (!projectId) {
    return null;
  }

  const syncedModelingFacts = await syncApprovedModelingProgressToProjectTasks({ projectIds: [projectId] });

  if (syncedModelingFacts === 0) {
    return {
      ok: true,
      status: "skipped" as const,
      syncedModelingFacts,
      recalculation: null,
      message: "建模完成事实没有新增写入。",
    };
  }

  const recalculation = await createOfficialScheduleRecalculation({
    runName: `建模完成事实重算 ${projectId}`,
    runType: "任务事实重算",
    source: `modeling-writeback:${projectId}`,
    createdBy: input.createdBy ?? null,
    syncedModelingFacts,
    skipModelingFactSync: true,
  });

  return {
    ok: recalculation.ok,
    status: recalculation.ok ? ("success" as const) : ("failed" as const),
    syncedModelingFacts,
    recalculation,
    message: recalculation.ok
      ? "建模完成事实已同步并完成排期重算。"
      : recalculation.message,
  };
}

export async function syncApprovedModelingProgressToProjectTasks(input: { projectIds?: string[] } = {}) {
  return prisma.$transaction(async (tx) => {
    const projectWhere = excludeScheduleSimulationProjectsWhere();
    const projectIdsFilter = input.projectIds?.filter(Boolean);

    if (projectIdsFilter?.length) {
      projectWhere.id = { in: projectIdsFilter };
    }

    const projects = await tx.project.findMany({
      where: projectWhere,
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length === 0) return 0;

    const projectTasks = await tx.projectTask.findMany({
      where: {
        taskNo: { in: [7, 10] },
        projectId: { in: projectIds },
      },
      select: {
        id: true,
        projectId: true,
        taskNo: true,
        taskName: true,
        status: true,
        actualStartDate: true,
        actualFinishDate: true,
      },
    });
    const projectTaskIds = projectTasks.map((task) => task.id);
    if (projectTaskIds.length === 0) return 0;

    const modelingTasks = await tx.modelingTask.findMany({
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
      if (projectTask.actualFinishDate || isCompletedProjectTaskStatus(projectTask.status)) continue;

      const rows = modelingTasksByProjectTaskId.get(projectTask.id) ?? [];
      if (rows.length === 0 || !rows.every((task) => isApprovedModelingTaskStatus(task.status))) {
        continue;
      }

      const finishDate = maxDate(rows.map((task) => task.copyrightApprovedDate ?? task.actualFinishDate ?? task.updatedAt));
      if (!finishDate) continue;

      const actualFinishDate = formatDateOnly(finishDate);
      const event = parseProjectTaskFactEvent({
        eventId: `modeling-schedule:${projectTask.id}:task-${projectTask.taskNo}:completed:${actualFinishDate}`,
        eventType: "task_completed",
        sourceModule: "modeling-schedule",
        projectId: projectTask.projectId,
        taskNo: projectTask.taskNo,
        taskKey: `#${projectTask.taskNo}`,
        taskName: projectTask.taskName,
        occurredAt: formatShanghaiIso(finishDate),
        operatorId: "modeling-schedule",
        operatorName: "建模排期",
        payload: {
          actualFinishDate,
          actualStartDate: projectTask.actualStartDate ? formatDateOnly(projectTask.actualStartDate) : undefined,
          status: "已完成",
          note: `建模排期同步：任务 #${projectTask.taskNo} 的必做款式全部通过，项目排期在重算前记录完成事实。`,
        },
      });
      const ingestResult = await ingestProjectTaskFactEventWithTx(tx, event);

      if (ingestResult.ok && !ingestResult.duplicate) {
        syncedCount += 1;
      }
    }

    return syncedCount;
  });
}

function maxDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .map((value) => value.getTime());

  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
}

function isApprovedModelingTaskStatus(status: string | null | undefined) {
  if (!status) return false;
  return status.includes("已通过") || status.includes("宸查€氳繃");
}

function isCompletedProjectTaskStatus(status: string | null | undefined) {
  if (!status) return false;
  return isCompletedTaskStatus(status) || status.includes("宸插畬鎴?");
}

function formatDateOnly(value: Date) {
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  return new Date(value.getTime() + shanghaiOffsetMs).toISOString().slice(0, 10);
}

function formatShanghaiIso(value: Date) {
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(value.getTime() + shanghaiOffsetMs);
  return `${local.toISOString().slice(0, 19)}+08:00`;
}
