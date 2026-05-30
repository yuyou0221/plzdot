import "server-only";

import { prisma } from "@/lib/db/prisma";
import { findLatestBusinessScheduleRunSelect } from "@/lib/schedule-run-selector";
import type {
  ProjectAnalysisData,
  ProjectAnalysisMetric,
  ProjectAnalysisRiskLevel,
  ProjectAnalysisTask,
} from "@/lib/project-analysis-types";
import { milestoneByTaskNo } from "@/lib/schedule-domain";

type ProjectRow = NonNullable<Awaited<ReturnType<typeof getProjectRow>>>;
type ProjectTaskRow = Awaited<ReturnType<typeof getProjectTaskRows>>[number];
type ScheduleTaskResultRow = Awaited<ReturnType<typeof getScheduleTaskResultRows>>[number];
type ScheduleProjectResultRow = NonNullable<Awaited<ReturnType<typeof getScheduleProjectResultRow>>>;

const riskLabel: Record<ProjectAnalysisRiskLevel, string> = {
  done: "已完成",
  doneLate: "延期完成",
  normal: "正常推进",
  risk: "延期风险",
  delay: "必然延期",
};

export async function getProjectAnalysisData(projectId: string): Promise<ProjectAnalysisData | null> {
  const [project, latestRun] = await Promise.all([
    getProjectRow(projectId),
    findLatestBusinessScheduleRunSelect({
      id: true,
      runName: true,
      scriptVersion: true,
      calculatedAt: true,
    }),
  ]);

  if (!project) {
    return null;
  }

  const [projectTasks, taskResults, projectResult, modelingProgress, workTasks, alerts] = await Promise.all([
    getProjectTaskRows(projectId),
    latestRun ? getScheduleTaskResultRows(projectId, latestRun.id) : Promise.resolve([]),
    latestRun ? getScheduleProjectResultRow(projectId, latestRun.id) : Promise.resolve(null),
    getModelingProgressRow(projectId),
    prisma.workTask.findMany({
      where: { projectId },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        status: true,
        riskLevel: true,
        updatedAt: true,
      },
    }),
    prisma.alert.findMany({
      where: { projectId, status: { not: "已处理" } },
      take: 200,
      select: {
        id: true,
        severity: true,
        status: true,
      },
    }),
  ]);

  const userIds = uniqueStrings([
    project.projectOwnerId,
    project.artOwnerId,
    ...projectTasks.map((task) => task.ownerId),
  ]);
  const teamIds = uniqueStrings([project.projectTeamId]);
  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    }),
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true },
    }),
  ]);
  const userById = new Map(users.map((user) => [user.id, user.name]));
  const teamById = new Map(teams.map((team) => [team.id, team.name]));

  const tasks = buildAnalysisTasks(projectTasks, taskResults, userById);
  const resultRiskLevel = projectRiskLevel(project, projectResult, tasks);
  const completedTasks = tasks.filter((task) => task.riskLevel === "done" || task.riskLevel === "doneLate").length;
  const riskTasks = tasks.filter((task) => task.riskLevel === "risk" || task.riskLevel === "delay").length;
  const blockedTasks = tasks.filter((task) => task.isBlocked).length;
  const staleTasks = tasks.filter((task) => task.staleDays > 3 && task.riskLevel !== "done" && task.riskLevel !== "doneLate").length;
  const missingExpectedFinishCount =
    projectResult?.missingExpectedFinishCount ??
    tasks.filter((task) => !task.expectedFinishDate && !task.actualFinishDate && task.riskLevel !== "done").length;
  const progressPercent =
    projectResult?.projectProgressPercent ??
    (tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0);
  const delayDays = projectResult?.delayDays ?? Math.max(0, ...tasks.map((task) => task.delayDays ?? 0));
  const currentTaskDisplay =
    resultRiskLevel === "done" || resultRiskLevel === "doneLate"
      ? "项目已完成"
      : projectResult?.currentTaskName ?? currentTaskName(tasks);

  return {
    sourceLabel: latestRun ? "最新成功测算" : "项目录入数据",
    generatedAt: new Date().toISOString(),
    latestRun: latestRun
      ? {
          id: latestRun.id,
          name: latestRun.runName ?? "未命名测算",
          scriptVersion: latestRun.scriptVersion ?? undefined,
          calculatedAt: formatDateTime(latestRun.calculatedAt),
        }
      : undefined,
    project: {
      id: project.id,
      code: project.projectCode ?? undefined,
      name: project.projectName,
      ipName: project.ipName ?? undefined,
      licensorName: project.licensorName ?? undefined,
      productType: project.productType ?? undefined,
      styleCount: project.styleCount ?? undefined,
      projectLevel: project.projectLevel ?? undefined,
      routeType: project.routeType ?? undefined,
      projectTeamName: labelFromMap(project.projectTeamId, teamById, "待补充项目组"),
      productOwnerName: labelFromMap(project.projectOwnerId, userById, "待补充产品研发"),
      artOwnerName: labelFromMap(project.artOwnerId, userById, "待补充产品美术"),
      currentStage: project.currentStage ?? "待补充",
      status: project.status,
      plannedLaunchDate: formatDate(project.plannedLaunchDate) ?? "待补",
      projectStartDate: formatDate(project.projectStartDate),
      updatedAt: formatDateTime(project.updatedAt),
    },
    result: {
      riskLevel: resultRiskLevel,
      riskLabel: riskLabel[resultRiskLevel],
      plannedLaunchDate: formatDate(projectResult?.plannedLaunchDate ?? project.plannedLaunchDate) ?? "待补",
      forecastLaunchDate: formatDate(projectResult?.forecastLaunchDate),
      delayDays,
      currentTaskName: currentTaskDisplay,
      riskMessage: projectRiskMessage(project, projectResult, resultRiskLevel),
      projectProgressPercent: progressPercent,
      blockedTaskCount: projectResult?.blockedTaskCount ?? blockedTasks,
      staleTaskCount: projectResult?.staleTaskCount ?? staleTasks,
      missingExpectedFinishCount,
    },
    modelingProgress: modelingProgress
      ? {
          totalRequiredStyles: modelingProgress.totalRequiredStyles,
          approvedStyles: modelingProgress.approvedStyles,
          inProgressStyles: modelingProgress.inProgressStyles,
          submittedStyles: modelingProgress.submittedStyles,
          outsourcedStyles: modelingProgress.outsourcedStyles,
          unassignedStyles: modelingProgress.unassignedStyles,
          progressPercent: modelingProgress.progressPercent,
          projectedAllApprovedDate: formatDate(modelingProgress.projectedAllApprovedDate),
          lastCalculatedAt: formatDateTime(modelingProgress.lastCalculatedAt),
        }
      : undefined,
    metrics: buildMetrics({
      totalTasks: tasks.length,
      completedTasks,
      riskTasks,
      blockedTasks,
      staleTasks,
      missingExpectedFinishCount,
      delayDays,
      progressPercent,
      workTaskCount: workTasks.filter((task) => !isDoneText(task.status)).length,
      alertCount: alerts.filter((alert) => !isDoneText(alert.status)).length,
    }),
    tasks,
  };
}

function getProjectRow(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      projectCode: true,
      projectName: true,
      ipName: true,
      licensorName: true,
      productType: true,
      styleCount: true,
      projectLevel: true,
      routeType: true,
      plannedLaunchDate: true,
      projectStartDate: true,
      projectTeamId: true,
      projectOwnerId: true,
      artOwnerId: true,
      currentStage: true,
      status: true,
      updatedAt: true,
    },
  });
}

function getProjectTaskRows(projectId: string) {
  return prisma.projectTask.findMany({
    where: { projectId },
    orderBy: [{ taskNo: "asc" }, { id: "asc" }],
    select: {
      id: true,
      taskNo: true,
      taskName: true,
      milestoneType: true,
      ownerId: true,
      plannedStartDate: true,
      plannedFinishDate: true,
      actualStartDate: true,
      actualFinishDate: true,
      expectedFinishDate: true,
      status: true,
      isBlocked: true,
      blockReason: true,
      progressNote: true,
      lastUpdatedAt: true,
      updatedAt: true,
    },
  });
}

function getScheduleTaskResultRows(projectId: string, scheduleRunId: string) {
  return prisma.scheduleTaskResult.findMany({
    where: { projectId, scheduleRunId },
    orderBy: [{ taskNo: "asc" }, { id: "asc" }],
    select: {
      id: true,
      projectTaskId: true,
      taskNo: true,
      taskName: true,
      milestoneType: true,
      plannedStartDate: true,
      plannedFinishDate: true,
      forecastStartDate: true,
      forecastFinishDate: true,
      expectedFinishDate: true,
      taskActionType: true,
      displayStatus: true,
      delayDays: true,
      remainingSafeDays: true,
      recoverableByDate: true,
      isRecoverable: true,
      blockingPredecessorNames: true,
      riskLevel: true,
      riskMessage: true,
    },
  });
}

function getScheduleProjectResultRow(projectId: string, scheduleRunId: string) {
  return prisma.scheduleProjectResult.findFirst({
    where: { projectId, scheduleRunId },
    select: {
      plannedLaunchDate: true,
      forecastLaunchDate: true,
      delayDays: true,
      riskLevel: true,
      currentTaskId: true,
      currentTaskName: true,
      riskMessage: true,
      projectProgressPercent: true,
      blockedTaskCount: true,
      staleTaskCount: true,
      missingExpectedFinishCount: true,
      rawResult: true,
    },
  });
}

function getModelingProgressRow(projectId: string) {
  return prisma.projectModelingProgress.findFirst({
    where: { projectId },
    orderBy: { lastCalculatedAt: "desc" },
    select: {
      totalRequiredStyles: true,
      approvedStyles: true,
      inProgressStyles: true,
      submittedStyles: true,
      outsourcedStyles: true,
      unassignedStyles: true,
      progressPercent: true,
      projectedAllApprovedDate: true,
      lastCalculatedAt: true,
    },
  });
}

function buildAnalysisTasks(
  projectTasks: ProjectTaskRow[],
  taskResults: ScheduleTaskResultRow[],
  userById: Map<string, string>,
): ProjectAnalysisTask[] {
  const resultByTaskId = new Map(taskResults.map((result) => [result.projectTaskId, result]));
  const rows: ProjectAnalysisTask[] = [];

  for (const task of projectTasks) {
    rows.push(buildTaskRow(task, resultByTaskId.get(task.id), userById));
  }

  const knownTaskIds = new Set(projectTasks.map((task) => task.id));
  for (const result of taskResults) {
    if (!knownTaskIds.has(result.projectTaskId)) {
      rows.push(buildTaskRow(undefined, result, userById));
    }
  }

  return rows.sort((a, b) => a.taskNo - b.taskNo || a.taskName.localeCompare(b.taskName, "zh-CN"));
}

function buildTaskRow(
  task: ProjectTaskRow | undefined,
  result: ScheduleTaskResultRow | undefined,
  userById: Map<string, string>,
): ProjectAnalysisTask {
  const taskNo = task?.taskNo ?? result?.taskNo ?? 0;
  const taskName = task?.taskName ?? result?.taskName ?? "未命名任务";
  const plannedFinishDate = task?.plannedFinishDate ?? result?.plannedFinishDate;
  const actualFinishDate = task?.actualFinishDate;
  const completed = Boolean(actualFinishDate) || [task?.status, result?.displayStatus, result?.taskActionType].some(isDoneText);
  const staleDays = completed ? 0 : daysSince(task?.lastUpdatedAt ?? task?.updatedAt);
  const riskLevel = taskRiskLevel({ task, result, completed, actualFinishDate, plannedFinishDate, staleDays });

  return {
    id: task?.id ?? result?.id ?? `${taskNo}:${taskName}`,
    projectTaskId: task?.id ?? result?.projectTaskId,
    taskNo,
    taskName,
    milestone: task?.milestoneType ?? result?.milestoneType ?? normalizeMilestone(taskNo),
    ownerName: labelFromMap(task?.ownerId, userById, "待补负责人"),
    status: task?.status ?? "待同步任务",
    displayStatus: result?.displayStatus ?? result?.taskActionType ?? task?.status ?? "未测算",
    isBlocked: Boolean(task?.isBlocked),
    plannedStartDate: formatDate(task?.plannedStartDate ?? result?.plannedStartDate),
    plannedFinishDate: formatDate(plannedFinishDate),
    actualStartDate: formatDate(task?.actualStartDate),
    actualFinishDate: formatDate(actualFinishDate),
    expectedFinishDate: formatDate(task?.expectedFinishDate ?? result?.expectedFinishDate),
    forecastStartDate: formatDate(result?.forecastStartDate),
    forecastFinishDate: formatDate(result?.forecastFinishDate),
    delayDays: result?.delayDays ?? undefined,
    remainingSafeDays: result?.remainingSafeDays ?? undefined,
    recoverableByDate: formatDate(result?.recoverableByDate),
    isRecoverable: result?.isRecoverable ?? undefined,
    riskLevel,
    riskLabel: riskLabel[riskLevel],
    riskMessage: result?.riskMessage ?? task?.blockReason ?? undefined,
    blockingPredecessorNames: parseStringList(result?.blockingPredecessorNames),
    staleDays,
    basis: taskBasis({ task, result, riskLevel, staleDays, completed, actualFinishDate, plannedFinishDate }),
  };
}

function buildMetrics(values: {
  totalTasks: number;
  completedTasks: number;
  riskTasks: number;
  blockedTasks: number;
  staleTasks: number;
  missingExpectedFinishCount: number;
  delayDays: number;
  progressPercent: number;
  workTaskCount: number;
  alertCount: number;
}): ProjectAnalysisMetric[] {
  return [
    {
      label: "项目进度",
      value: `${values.progressPercent}%`,
      helper: `${values.completedTasks}/${values.totalTasks} 个任务已完成`,
      tone: values.progressPercent >= 80 ? "good" : "neutral",
    },
    {
      label: "延期天数",
      value: `${values.delayDays} 天`,
      helper: values.delayDays > 0 ? "来自最新测算或任务延误" : "当前未测出延期",
      tone: values.delayDays > 0 ? "danger" : "good",
    },
    {
      label: "风险任务",
      value: `${values.riskTasks}`,
      helper: `阻塞 ${values.blockedTasks}，超 3 天未更新 ${values.staleTasks}`,
      tone: values.riskTasks > 0 || values.blockedTasks > 0 ? "warning" : "good",
    },
    {
      label: "待补信息",
      value: `${values.missingExpectedFinishCount}`,
      helper: `未处理提醒 ${values.alertCount}，周任务 ${values.workTaskCount}`,
      tone: values.missingExpectedFinishCount > 0 ? "warning" : "neutral",
    },
  ];
}

function projectRiskLevel(
  project: ProjectRow,
  result: ScheduleProjectResultRow | null,
  tasks: ProjectAnalysisTask[],
): ProjectAnalysisRiskLevel {
  const completed = isDoneText(project.status) || (result?.projectProgressPercent ?? 0) >= 100;
  const delayDays = result?.delayDays ?? 0;

  if (completed) {
    return delayDays > 0 ? "doneLate" : "done";
  }

  const resultRisk = toRiskLevel(result?.riskLevel, delayDays);
  if (resultRisk !== "normal") {
    return resultRisk;
  }

  if (tasks.some((task) => task.riskLevel === "delay")) return "delay";
  if (tasks.some((task) => task.riskLevel === "risk")) return "risk";

  return "normal";
}

function projectRiskMessage(
  project: ProjectRow,
  result: ScheduleProjectResultRow | null,
  riskLevel: ProjectAnalysisRiskLevel,
) {
  if (result?.riskMessage) {
    return result.riskMessage;
  }

  if (riskLevel === "doneLate") {
    return `${project.projectName} 已完成，但较原计划存在延期。`;
  }

  if (riskLevel === "done") {
    return `${project.projectName} 已完成。`;
  }

  if (riskLevel === "delay") {
    return `${project.projectName} 当前测算为必然延期，需要确认补救动作。`;
  }

  if (riskLevel === "risk") {
    return `${project.projectName} 当前存在延期风险，请优先查看风险任务。`;
  }

  return "当前项目按现有录入信息正常推进。";
}

function currentTaskName(tasks: ProjectAnalysisTask[]) {
  return tasks.find((task) => task.riskLevel === "risk" || task.riskLevel === "delay")?.taskName ?? tasks.find((task) => task.riskLevel === "normal")?.taskName ?? "待同步";
}

function taskRiskLevel({
  task,
  result,
  completed,
  actualFinishDate,
  plannedFinishDate,
  staleDays,
}: {
  task: ProjectTaskRow | undefined;
  result: ScheduleTaskResultRow | undefined;
  completed: boolean;
  actualFinishDate?: Date | null;
  plannedFinishDate?: Date | null;
  staleDays: number;
}): ProjectAnalysisRiskLevel {
  if (completed) {
    return actualFinishDate && plannedFinishDate && actualFinishDate.getTime() > plannedFinishDate.getTime() ? "doneLate" : "done";
  }

  if (task?.isBlocked) {
    return "risk";
  }

  const mapped = toRiskLevel(result?.riskLevel, result?.delayDays);
  if (mapped !== "normal") {
    return mapped;
  }

  if (typeof result?.remainingSafeDays === "number" && result.remainingSafeDays < 0) {
    return "risk";
  }

  if (staleDays > 3) {
    return "risk";
  }

  return "normal";
}

function taskBasis({
  task,
  result,
  riskLevel,
  staleDays,
  completed,
  actualFinishDate,
  plannedFinishDate,
}: {
  task: ProjectTaskRow | undefined;
  result: ScheduleTaskResultRow | undefined;
  riskLevel: ProjectAnalysisRiskLevel;
  staleDays: number;
  completed: boolean;
  actualFinishDate?: Date | null;
  plannedFinishDate?: Date | null;
}) {
  if (completed) {
    const delayDays = actualFinishDate && plannedFinishDate ? dayDiff(actualFinishDate, plannedFinishDate) : 0;
    return delayDays > 0 ? `已完成，较计划晚 ${delayDays} 天。` : "已完成，不作为当前风险。";
  }

  if (task?.isBlocked) {
    return task.blockReason ? `任务阻塞：${task.blockReason}` : "任务被标记为阻塞。";
  }

  if (result?.riskMessage) {
    return result.riskMessage;
  }

  if (riskLevel === "delay") {
    return `测算为必然延期${typeof result?.delayDays === "number" ? `，预计晚 ${result.delayDays} 天` : ""}。`;
  }

  if (typeof result?.delayDays === "number" && result.delayDays > 0) {
    return `预测完成时间晚于计划 ${result.delayDays} 天。`;
  }

  if (typeof result?.remainingSafeDays === "number") {
    return result.remainingSafeDays >= 0
      ? `距离影响项目上线还有 ${result.remainingSafeDays} 天安全余量。`
      : `安全余量已用完 ${Math.abs(result.remainingSafeDays)} 天。`;
  }

  if (staleDays > 3) {
    return `该任务已超过 ${staleDays} 天未更新。`;
  }

  if (!task?.expectedFinishDate && !result?.expectedFinishDate) {
    return "未录入预计完成时间，测算只能使用计划日期。";
  }

  return "当前测算未发现明显风险。";
}

function toRiskLevel(value?: string | null, delayDays?: number | null): ProjectAnalysisRiskLevel {
  const text = value ?? "";

  if (text === "delay" || text.includes("必然") || text.includes("严重")) {
    return "delay";
  }

  if (text === "risk" || text.includes("风险") || (typeof delayDays === "number" && delayDays > 0)) {
    return "risk";
  }

  return "normal";
}

function normalizeMilestone(taskNo: number) {
  return milestoneByTaskNo(taskNo);
}

function labelFromMap(value: string | null | undefined, map: Map<string, string>, fallback: string) {
  if (value && map.has(value)) {
    return map.get(value) ?? fallback;
  }

  return value?.trim() ? value : fallback;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  return [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function isDoneText(value?: string | null) {
  if (!value) return false;

  return (
    value.includes("已完成") ||
    value.includes("已通过") ||
    value.includes("已处理") ||
    value.includes("完结") ||
    value === "完成" ||
    value.includes("取消")
  );
}

function daysSince(value?: Date | null) {
  if (!value) return 0;

  const start = startOfDay(value).getTime();
  const end = startOfDay(new Date()).getTime();

  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function dayDiff(a: Date, b: Date) {
  return Math.floor((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function formatDate(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function formatDateTime(value: Date) {
  return value.toISOString().slice(0, 16).replace("T", " ");
}
