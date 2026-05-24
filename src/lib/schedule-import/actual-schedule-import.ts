import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { persistScheduleAnalysis } from "@/lib/schedule-engine/adapters";
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

type PersistableSchedulePayload = Parameters<typeof persistScheduleAnalysis>[1];

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

export async function importActualSchedulePayload(payloadPath: string): Promise<ActualScheduleImportResult> {
  const resolvedPayloadPath = path.resolve(payloadPath);
  const payload = JSON.parse(await fs.readFile(resolvedPayloadPath, "utf8")) as ActualSchedulePayload & PersistableSchedulePayload;
  const runId = `actual-import-${Date.now()}`;
  const tasks = payload.rows.filter((row) => row.projectId && Number.isFinite(Number(row.taskId)));

  await prisma.$transaction(async (tx) => {
    await clearScheduleData(tx);

    await tx.dataImport.create({
      data: {
        id: runId,
        importType: "真实项目排期测算",
        sourceFileName: path.basename(payload.sourceWorkbook ?? resolvedPayloadPath),
        sourceFilePath: payload.sourceWorkbook ?? resolvedPayloadPath,
        rowCount: payload.futureRows.length,
        importStatus: "成功",
        rawMetadata: {
          generatedAt: payload.generatedAt,
          sourcePayloadPath: resolvedPayloadPath,
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
        runName: `真实项目排期导入 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        runType: "正式测算",
        sourceImportId: runId,
        scriptName: "project-analysis-v5-excel.js",
        scriptVersion: "actual-excel-import",
        inputSnapshot: {
          sourcePayloadPath: resolvedPayloadPath,
          sourceWorkbook: payload.sourceWorkbook,
        },
        runStatus: "成功",
        calculatedAt: generatedAtDate(payload.generatedAt),
      },
    });
  });

  await persistScheduleAnalysis(runId, payload);

  return {
    ok: true,
    runId,
    projects: payload.projects.length,
    projectTasks: tasks.length,
    futureTasks: payload.futureRows.length,
  };
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
