import { prisma } from "@/lib/db/prisma";
import { persistScheduleEngineResult } from "@/lib/schedule-engine/service";
import type { ScheduleEnginePayload } from "@/lib/schedule-engine/port";
import { milestoneByTaskNo } from "@/lib/schedule-domain";

type ActualSchedulePayload = {
  generatedAt: string;
  sourceWorkbook?: string;
  projectCount: number;
  futureTaskCount: number;
  projects: ActualProject[];
  rows: ActualTaskRow[];
  futureRows: ActualTaskRow[];
};

type PersistableSchedulePayload = ScheduleEnginePayload;

type ActualProject = {
  projectId: string;
  projectName: string;
  owner?: string;
  artist?: string;
  team?: string;
  status?: string;
  level?: string;
  productType?: string;
  spec?: string | number;
  scenario?: string;
  route?: string;
  hasThreeView?: boolean;
  projectStartDate?: string;
  plannedLaunchDate: string;
};

type ActualTaskRow = {
  recordKey: string;
  projectId: string;
  taskId: number;
  taskName: string;
  taskStatus?: string;
  plannedStartDate?: string;
  plannedFinishDate?: string;
  actualStartDate?: string;
  actualFinishDate?: string;
  expectedFinishDate?: string;
  forecastStartDate?: string;
  forecastFinishDate?: string;
  note?: string;
};

export type ActualScheduleImportResult = {
  ok: true;
  runId: string;
  projects: number;
  projectTasks: number;
  futureTasks: number;
};

export type ActualScheduleTestImportPreview = {
  payloadPath: string | null;
  sourceFileName: string;
  incoming: {
    projects: number;
    projectTasks: number;
    futureTasks: number;
  };
  clearScope: {
    projects: number;
    projectTasks: number;
    scheduleRuns: number;
    scheduleTaskResults: number;
    taskCards: number;
    alerts: number;
    progressUpdates: number;
  };
};

export async function previewActualSchedulePayload(payloadPath: string): Promise<ActualScheduleTestImportPreview> {
  const resolvedPayloadPath = await resolvePayloadPath(payloadPath);
  const { payload, tasks } = await readActualSchedulePayload(resolvedPayloadPath);
  return previewActualSchedulePayloadContent(payload, {
    sourceFileName: sourceFileNameForPayload(payload, resolvedPayloadPath),
    sourcePayloadPath: resolvedPayloadPath,
    tasks,
  });
}

export async function previewActualSchedulePayloadContent(
  payload: ActualSchedulePayload & PersistableSchedulePayload,
  options: { sourceFileName?: string; sourcePayloadPath?: string | null; tasks?: ActualTaskRow[] } = {},
): Promise<ActualScheduleTestImportPreview> {
  const tasks = options.tasks ?? validTaskRows(payload);
  const [projects, projectTasks, scheduleRuns, scheduleTaskResults, taskCards, alerts, progressUpdates] = await Promise.all([
    prisma.project.count(),
    prisma.projectTask.count(),
    prisma.scheduleRun.count(),
    prisma.scheduleTaskResult.count(),
    prisma.taskCard.count(),
    prisma.alert.count(),
    prisma.progressUpdate.count(),
  ]);

  return {
    payloadPath: options.sourcePayloadPath ?? null,
    sourceFileName: sourceFileNameForPayload(payload, options.sourceFileName ?? "uploaded-actual-schedule.json"),
    incoming: {
      projects: payload.projects.length,
      projectTasks: tasks.length,
      futureTasks: payload.futureRows.length,
    },
    clearScope: {
      projects,
      projectTasks,
      scheduleRuns,
      scheduleTaskResults,
      taskCards,
      alerts,
      progressUpdates,
    },
  };
}

export async function importActualSchedulePayload(payloadPath: string): Promise<ActualScheduleImportResult> {
  const resolvedPayloadPath = await resolvePayloadPath(payloadPath);
  const { payload, tasks } = await readActualSchedulePayload(resolvedPayloadPath);
  return importActualSchedulePayloadContent(payload, {
    sourceFileName: sourceFileNameForPayload(payload, resolvedPayloadPath),
    sourcePayloadPath: resolvedPayloadPath,
    tasks,
  });
}

export async function importActualSchedulePayloadContent(
  payload: ActualSchedulePayload & PersistableSchedulePayload,
  options: { sourceFileName?: string; sourcePayloadPath?: string | null; tasks?: ActualTaskRow[] } = {},
): Promise<ActualScheduleImportResult> {
  const tasks = options.tasks ?? validTaskRows(payload);
  const sourceFileName = sourceFileNameForPayload(payload, options.sourceFileName ?? "uploaded-actual-schedule.json");
  const sourcePayloadPath = options.sourcePayloadPath ?? null;
  const runId = `actual-import-${Date.now()}`;

  await prisma.$transaction(async (tx) => {
    await clearScheduleData(tx);

    await tx.dataImport.create({
      data: {
        id: runId,
        importType: "测试数据全量替换导入",
        sourceFileName,
        sourceFilePath: payload.sourceWorkbook ?? sourcePayloadPath ?? sourceFileName,
        rowCount: payload.futureRows.length,
        importStatus: "成功",
        rawMetadata: {
          generatedAt: payload.generatedAt,
          sourcePayloadPath,
          projectCount: payload.projects.length,
          futureTaskCount: payload.futureRows.length,
        },
      },
    });

    await tx.project.createMany({
      data: payload.projects.map((project) => ({
        id: project.projectId,
        projectCode: project.projectId,
        projectName: project.projectName,
        productType: project.productType || null,
        styleCount: toNullableNumber(project.spec),
        projectLevel: project.level || null,
        routeType: project.route || project.scenario || null,
        needThreeView: project.hasThreeView ?? false,
        plannedLaunchDate: toDate(project.plannedLaunchDate),
        projectStartDate: toNullableDate(project.projectStartDate),
        projectTeamId: project.team || null,
        projectOwnerId: project.owner || null,
        artOwnerId: project.artist || null,
        currentStage: project.status || null,
        status: project.status || "进行中",
        sourceImportId: runId,
      })),
    });

    await tx.projectTask.createMany({
      data: tasks.map((row) => ({
        id: `${row.projectId}-${row.taskId}`,
        projectId: row.projectId,
        taskNo: Number(row.taskId),
        taskName: row.taskName,
        milestoneType: milestoneByTaskNo(Number(row.taskId)),
        plannedStartDate: toNullableDate(row.plannedStartDate),
        plannedFinishDate: toNullableDate(row.plannedFinishDate),
        actualStartDate: toNullableDate(row.actualStartDate),
        actualFinishDate: toNullableDate(row.actualFinishDate),
        expectedFinishDate: toNullableDate(row.expectedFinishDate),
        status: row.taskStatus || "未开始",
        progressNote: row.note || null,
        lastUpdatedAt: lastUpdatedAt(row),
        sourceImportId: runId,
      })),
      skipDuplicates: true,
    });

    await tx.scheduleRun.create({
      data: {
        id: runId,
        runName: `测试数据全量替换导入 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        runType: "导入重算",
        sourceImportId: runId,
        scriptName: "project-analysis-v5-excel.js",
        scriptVersion: "actual-excel-import",
        inputSnapshot: {
          sourcePayloadPath,
          sourceWorkbook: payload.sourceWorkbook,
        },
        runStatus: "成功",
        calculatedAt: generatedAtDate(payload.generatedAt),
      },
    });
  });

  await persistScheduleEngineResult(runId, payload);

  return {
    ok: true,
    runId,
    projects: payload.projects.length,
    projectTasks: tasks.length,
    futureTasks: payload.futureRows.length,
  };
}

async function readActualSchedulePayload(resolvedPayloadPath: string) {
  const fs = await import("node:fs/promises");
  const payload = JSON.parse(await fs.readFile(resolvedPayloadPath, "utf8")) as ActualSchedulePayload & PersistableSchedulePayload;
  const tasks = validTaskRows(payload);

  return { payload, tasks };
}

function validTaskRows(payload: ActualSchedulePayload & PersistableSchedulePayload) {
  const tasks = payload.rows.filter((row) => row.projectId && Number.isFinite(Number(row.taskId)));

  if (payload.projects.length === 0 || tasks.length === 0) {
    throw new Error(
      `排期测算结果为空，已拒绝写入数据库。请确认上传的是完整项目排期源表，而不是项目主数据导入表或其他模板。项目数：${payload.projects.length}，任务数：${tasks.length}。`,
    );
  }

  return tasks;
}

async function resolvePayloadPath(payloadPath: string) {
  const path = await import("node:path");
  return path.resolve(payloadPath);
}

function sourceFileNameForPayload(payload: ActualSchedulePayload, fallback: string) {
  return fileNameFromPath(payload.sourceWorkbook ?? fallback);
}

function fileNameFromPath(value: string) {
  const segments = value.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? value;
}

async function clearScheduleData(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  await tx.alert.deleteMany();
  await tx.taskDragLog.deleteMany();
  await tx.scheduleSimulation.deleteMany();
  await tx.scheduleAdjustment.deleteMany();
  await tx.taskCard.deleteMany();
  await tx.workTask.deleteMany();
  await tx.scheduleTaskResult.deleteMany();
  await tx.scheduleProjectResult.deleteMany();
  await tx.scheduleRun.deleteMany();
  await tx.progressUpdate.deleteMany();
  await tx.projectTask.deleteMany();
  await tx.project.deleteMany();
}

function toNullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toDate(value: string) {
  return dateOnly(value);
}

function toNullableDate(value?: string) {
  return value ? toDate(value) : null;
}

function lastUpdatedAt(row: ActualTaskRow) {
  return toNullableDate(row.actualFinishDate || row.expectedFinishDate || row.actualStartDate);
}

function generatedAtDate(value: string) {
  const date = dateOnly(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date(value);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}
