import { createRequire } from "node:module";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { displayTaskStatus, milestoneByTaskNo } from "@/lib/schedule-domain";
import type {
  ScheduleAnalyzeOptions,
  ScheduleEnginePayload,
  ScheduleEngineProjectResult,
  ScheduleEngineTaskResult,
} from "@/lib/schedule-engine/port";

const legacyRequire = createRequire(
  path.join(process.cwd(), "legacy", "schedule-engine", "entry.cjs"),
);

type LegacyScheduleEngine = {
  addScheduleDays: (date: string, days: number) => string;
  subScheduleDays: (date: string, days: number) => string;
  scheduleDaysBetween: (a: string, b: string) => number;
};

type LegacyAnalysisModule = {
  analyzeExtracted: (
    extracted: LegacyExtractedInput,
    args: LegacyAnalysisArgs,
    engine: LegacyScheduleEngine,
    helpers: unknown,
    today: string,
  ) => LegacyAnalysisPayload;
  makeDateHelpers: (engine: LegacyScheduleEngine) => unknown;
};

type LegacyAnalysisArgs = {
  scenario: string;
  hasThreeView: boolean;
  project: string;
  projectName: string;
  plannedBufferDays: number;
};

type LegacyExtractedInput = {
  workbook: string;
  projects: LegacyProjectInput[];
  actuals: LegacyActualInput[];
  taskRules: LegacyTaskRuleInput[];
};

type LegacyProjectInput = {
  projectId: string;
  projectName: string;
  projectStartDate: string;
  plannedLaunchDate: string;
  scenario: string;
  hasThreeView: boolean;
  status?: string;
};

type LegacyActualInput = {
  projectName: string;
  taskName: string;
  recordKey: string;
  actualStartDate?: string;
  actualFinishDate?: string;
  expectedFinishDate?: string;
  taskStatus?: string;
};

type LegacyTaskRuleInput = {
  taskId: number;
  taskName: string;
};

type LegacyAnalysisPayload = ScheduleEnginePayload;
type LegacyProjectResult = ScheduleEngineProjectResult;
type LegacyTaskResult = ScheduleEngineTaskResult;

export async function runScheduleAnalysisFromDatabase(options: ScheduleAnalyzeOptions = {}) {
  const extracted = await buildExtractedInputFromDatabase(options.projectIds);
  const engine = legacyRequire("./project-schedule-core.cjs") as LegacyScheduleEngine;
  const analysis = legacyRequire("./project-analysis-v5-excel.cjs") as LegacyAnalysisModule;
  const helpers = analysis.makeDateHelpers(engine);

  return analysis.analyzeExtracted(
    extracted,
    {
      scenario: "A",
      hasThreeView: false,
      project: "",
      projectName: "",
      plannedBufferDays: 0,
    },
    engine,
    helpers,
    options.today ?? shanghaiToday(),
  );
}

export async function persistScheduleAnalysis(scheduleRunId: string, payload: LegacyAnalysisPayload) {
  await prisma.$transaction(async (tx) => {
    await tx.scheduleProjectResult.deleteMany({ where: { scheduleRunId } });
    await tx.scheduleTaskResult.deleteMany({ where: { scheduleRunId } });
    await tx.taskCard.deleteMany({ where: { lastRenderedFromRunId: scheduleRunId } });
    await tx.alert.deleteMany({ where: { createdFromRunId: scheduleRunId } });

    if (payload.projects.length > 0) {
      await tx.scheduleProjectResult.createMany({
        data: payload.projects.map((project) => {
          const currentTask = pickCurrentTask(payload.futureRows, project.projectId);
          const riskLevel = toProjectRiskLevel(project);

          return {
            scheduleRunId,
            projectId: project.projectId,
            plannedLaunchDate: toDate(project.plannedLaunchDate),
            forecastLaunchDate: toNullableDate(project.projectedLaunchDate),
            delayDays: Number(project.launchDeltaDays || 0),
            riskLevel,
            currentStage: project.status || null,
            currentTaskId: currentTask?.recordKey || null,
            currentTaskName: currentTask?.taskName || null,
            riskMessage: projectRiskMessage(project, riskLevel),
            projectProgressPercent: projectProgressPercent(payload.rows, project.projectId),
            blockedTaskCount: payload.futureRows.filter((row) => row.projectId === project.projectId && row.isBlockingLaunch).length,
            rawResult: toJson(project),
          };
        }),
      });
    }

    if (payload.rows.length > 0) {
      await tx.scheduleTaskResult.createMany({
        data: payload.rows.map((row) => ({
          scheduleRunId,
          projectId: row.projectId,
          projectTaskId: row.recordKey,
          taskNo: Number(row.taskId),
          taskName: row.taskName,
          milestoneType: milestoneByTaskNo(row.taskId),
          plannedStartDate: toNullableDate(row.plannedStartDate),
          plannedFinishDate: toNullableDate(row.plannedFinishDate),
          forecastStartDate: toNullableDate(row.forecastStartDate),
          forecastFinishDate: toNullableDate(row.forecastFinishDate),
          expectedFinishDate: toNullableDate(row.expectedFinishDate),
          taskActionType: row.taskStatus || null,
          displayStatus: displayTaskStatus(row.taskStatus),
          delayDays: Number(row.planDeltaDays || 0),
          remainingSafeDays: Number(row.warningWindowDays || 0),
          blockingPredecessorNames: row.missingActualPredecessorIds
            ? toJson([row.missingActualPredecessorIds])
            : undefined,
          riskLevel: toTaskRiskLevel(row),
          riskMessage: taskRiskMessage(row),
          rawResult: toJson(row),
        })),
      });
    }

    const cards = payload.futureRows
      .filter((row) => row.forecastFinishDate || row.plannedFinishDate)
      .map((row, index) => ({
        id: `${scheduleRunId}-${row.recordKey}`,
        cardType: "项目任务卡",
        entityType: "project_task",
        entityId: row.recordKey,
        projectId: row.projectId,
        title: row.projectName,
        subtitle: row.taskName,
        visualStatus: toVisualStatus(row),
        riskLevel: toTaskRiskLevel(row),
        laneType: "month_milestone",
        laneKey: `${monthLabel(row.forecastFinishDate || row.plannedFinishDate)}:${milestoneByTaskNo(row.taskId)}`,
        sortOrder: index,
        draggable: true,
        lastRenderedFromRunId: scheduleRunId,
      }));

    if (cards.length > 0) {
      await tx.taskCard.createMany({ data: cards });
    }

    const alerts = payload.projects
      .map((project) => {
        const riskLevel = toProjectRiskLevel(project);
        if (riskLevel !== "延期风险" && riskLevel !== "必然延期") return null;

        return {
          alertType: riskLevel,
          severity: riskLevel === "必然延期" ? "紧急" : "重要",
          projectId: project.projectId,
          title: `${project.projectName}：${riskLevel}`,
          message: projectRiskMessage(project, riskLevel),
          triggerRule: "schedule_analysis",
          triggerValue: toJson(project),
          status: "未处理",
          createdFromRunId: scheduleRunId,
        };
      })
      .filter((alert) => alert !== null);

    if (alerts.length > 0) {
      await tx.alert.createMany({ data: alerts });
    }
  });
}

async function buildExtractedInputFromDatabase(projectIds?: string[]): Promise<LegacyExtractedInput> {
  const projects = await prisma.project.findMany({
    where: projectIds?.length ? { id: { in: projectIds } } : undefined,
    orderBy: { plannedLaunchDate: "asc" },
  });

  const projectIdList = projects.map((project) => project.id);
  const [projectTasks, taskRules] = await Promise.all([
    prisma.projectTask.findMany({
      where: projectIdList.length ? { projectId: { in: projectIdList } } : undefined,
      orderBy: [{ projectId: "asc" }, { taskNo: "asc" }],
    }),
    prisma.taskRule.findMany({
      where: { isActive: true },
      orderBy: { taskNo: "asc" },
    }),
  ]);

  return {
    workbook: "database",
    projects: projects.map((project) => ({
      projectId: project.id,
      projectName: project.projectName,
      projectStartDate: formatDate(project.projectStartDate ?? fallbackProjectStart(project.plannedLaunchDate)),
      plannedLaunchDate: formatDate(project.plannedLaunchDate),
      scenario: project.routeType || "A",
      hasThreeView: project.needThreeView ?? false,
      status: project.currentStage || project.status,
    })),
    actuals: projectTasks
      .filter((task) => task.actualStartDate || task.actualFinishDate || task.expectedFinishDate || task.status !== "未开始")
      .map((task) => {
        const project = projects.find((item) => item.id === task.projectId);

        return {
          projectName: project?.projectName ?? task.projectId,
          taskName: task.taskName,
          recordKey: `${task.projectId}-${task.taskNo}`,
          actualStartDate: task.actualStartDate ? formatDate(task.actualStartDate) : undefined,
          actualFinishDate: task.actualFinishDate ? formatDate(task.actualFinishDate) : undefined,
          expectedFinishDate: task.expectedFinishDate ? formatDate(task.expectedFinishDate) : undefined,
          taskStatus: task.status,
        };
      }),
    taskRules: taskRules.map((rule) => ({
      taskId: rule.taskNo,
      taskName: rule.taskName,
    })),
  };
}

function pickCurrentTask(rows: LegacyTaskResult[], projectId: string) {
  return (
    rows.find((row) => row.projectId === projectId && row.isBlockingLaunch) ??
    rows.find((row) => row.projectId === projectId) ??
    null
  );
}

function projectProgressPercent(rows: LegacyTaskResult[], projectId: string) {
  const projectRows = rows.filter((row) => row.projectId === projectId);
  if (projectRows.length === 0) return 0;
  const finished = projectRows.filter((row) => displayTaskStatus(row.taskStatus) === "已完成").length;
  return Math.round((finished / projectRows.length) * 100);
}

function toProjectRiskLevel(project: LegacyProjectResult) {
  const delayDays = Number(project.launchDeltaDays || 0);
  if (isCompletedProjectResult(project)) {
    return delayDays > 0 ? "延期完成" : "已完成";
  }

  if (delayDays <= 0) return "正常";
  return delayDays >= 7 ? "必然延期" : "延期风险";
}

function isCompletedProjectResult(project: LegacyProjectResult) {
  const status = project.status ?? "";

  return status.includes("已完") || status.includes("完结") || project.summary?.unfinishedTasks === 0;
}

function toTaskRiskLevel(row: LegacyTaskResult) {
  if (displayTaskStatus(row.taskStatus) === "已完成") return "正常";
  if (Number(row.planDeltaDays || 0) >= 7 || Number(row.deadlineRiskDays || 0) >= 7) return "必然延期";
  if (Number(row.planDeltaDays || 0) > 0 || Number(row.deadlineRiskDays || 0) > 0 || row.isBlockingLaunch) return "延期风险";
  return "正常";
}

function toVisualStatus(row: LegacyTaskResult) {
  if (displayTaskStatus(row.taskStatus) === "已完成") return "done";
  const risk = toTaskRiskLevel(row);
  if (risk === "必然延期") return "delay";
  if (risk === "延期风险") return "risk";
  return "normal";
}

function projectRiskMessage(project: LegacyProjectResult, riskLevel: string) {
  const days = Number(project.launchDeltaDays || 0);

  if (riskLevel === "延期完成") {
    return `已于 ${project.projectedLaunchDate ?? "实际完成日"} 完成，较计划上线 ${project.plannedLaunchDate} 晚 ${days} 天。`;
  }

  if (riskLevel === "已完成") return "项目已完成。";
  if (riskLevel === "正常") return "当前正常推进。";
  if (riskLevel === "必然延期") return `已再次延期 ${days} 天，原定 DDL 已无法追回。`;
  return `预计出货日期可能延期 ${days} 天，需要项目负责人确认当前卡点。`;
}

function taskRiskMessage(row: LegacyTaskResult) {
  const risk = toTaskRiskLevel(row);
  if (risk === "正常") return "";
  if (risk === "必然延期") return "该任务已造成明显延期风险，需要管理层关注。";
  return "该任务存在延期风险，需要项目负责人跟进。";
}

function monthLabel(value?: string) {
  if (!value) return "未定";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "未定";
  const year = Number(match[1]);
  const month = Number(match[2]);
  return `${String(year).slice(-2)}年${month}月`;
}

function fallbackProjectStart(plannedLaunchDate: Date) {
  const date = new Date(plannedLaunchDate);
  date.setDate(date.getDate() - 180);
  return date;
}

function toDate(value: string) {
  return dateOnly(value);
}

function toNullableDate(value?: string) {
  return value ? toDate(value) : undefined;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date(value);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
