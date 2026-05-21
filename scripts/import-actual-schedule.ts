import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db/prisma";
import { persistScheduleAnalysis } from "../src/lib/schedule-engine/adapters";

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

const payloadPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(".local", "actual-run-20260522", "project-task-estimates-v5.json");

async function main() {
  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8")) as ActualSchedulePayload & PersistableSchedulePayload;
  const runId = `actual-import-${Date.now()}`;

  await clearP0Data();

  await prisma.dataImport.create({
    data: {
      id: runId,
      importType: "真实项目排期测算",
      sourceFileName: path.basename(payload.sourceWorkbook ?? payloadPath),
      sourceFilePath: payload.sourceWorkbook ?? payloadPath,
      rowCount: payload.futureRows.length,
      importStatus: "成功",
      rawMetadata: {
        generatedAt: payload.generatedAt,
        sourcePayloadPath: payloadPath,
        projectCount: payload.projects.length,
        futureTaskCount: payload.futureRows.length,
      },
    },
  });

  await prisma.project.createMany({
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

  const tasks = payload.rows.filter((row) => row.projectId && Number.isFinite(Number(row.taskId)));

  await prisma.projectTask.createMany({
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

  await prisma.scheduleRun.create({
    data: {
      id: runId,
      runName: `真实项目排期导入 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      runType: "正式测算",
      sourceImportId: runId,
      scriptName: "project-analysis-v5-excel.js",
      scriptVersion: "actual-excel-import",
      inputSnapshot: {
        sourcePayloadPath: payloadPath,
        sourceWorkbook: payload.sourceWorkbook,
      },
      runStatus: "成功",
      calculatedAt: new Date(`${payload.generatedAt}T00:00:00+08:00`),
    },
  });

  await persistScheduleAnalysis(runId, payload);

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId,
        projects: payload.projects.length,
        projectTasks: tasks.length,
        futureTasks: payload.futureRows.length,
      },
      null,
      2,
    ),
  );
}

async function clearP0Data() {
  await prisma.alert.deleteMany();
  await prisma.taskDragLog.deleteMany();
  await prisma.scheduleSimulation.deleteMany();
  await prisma.scheduleAdjustment.deleteMany();
  await prisma.taskCard.deleteMany();
  await prisma.workTask.deleteMany();
  await prisma.projectModelingProgress.deleteMany();
  await prisma.modelingFeedback.deleteMany();
  await prisma.modelingTask.deleteMany();
  await prisma.scheduleTaskResult.deleteMany();
  await prisma.scheduleProjectResult.deleteMany();
  await prisma.scheduleRun.deleteMany();
  await prisma.progressUpdate.deleteMany();
  await prisma.projectTask.deleteMany();
  await prisma.project.deleteMany();
  await prisma.dataImport.deleteMany();
}

function milestoneByTaskNo(taskNo: number) {
  if (taskNo >= 1 && taskNo <= 6) return "原画里程碑";
  if (taskNo >= 7 && taskNo <= 10) return "建模里程碑";
  if ((taskNo >= 11 && taskNo <= 15) || taskNo === 17 || taskNo === 18) return "红蜡里程碑";
  if (taskNo >= 21 && taskNo <= 27) return "产前里程碑";
  if (taskNo === 30) return "大货里程碑";
  return "平面里程碑";
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

function dateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date(value);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
