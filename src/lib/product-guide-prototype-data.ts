import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProductGuideStyleSummary } from "@/lib/product-guide-types";
import { getScheduleWorkbenchData } from "@/lib/schedule-repository";
import { excludeScheduleSimulationProjectsWhere } from "@/lib/schedule-simulation";
import type { ProjectCard, ProjectDetail, RiskLevel, ScheduleTaskRow, ScheduleWorkbenchData } from "@/lib/sample-schedule";

type PrototypeProjectRow = {
  id: string;
  projectName: string;
  plannedLaunchDate: Date;
};

type PrototypeProjectTaskRow = {
  id: string;
  projectId: string;
  taskNo: number;
  milestoneType: string;
  plannedFinishDate: Date | null;
  expectedFinishDate: Date | null;
  status: string;
  isBlocked: boolean;
};

type FormalProjectRow = {
  id: string;
  projectCode: string | null;
  projectName: string;
  plannedLaunchDate: Date;
  projectTeamId: string | null;
  projectOwnerId: string | null;
  artOwnerId: string | null;
  currentStage: string | null;
  status: string;
};

type FormalProjectResultRow = {
  projectId: string;
  plannedLaunchDate: Date;
  forecastLaunchDate: Date | null;
  delayDays: number | null;
  riskLevel: string;
  currentTaskName: string | null;
  riskMessage: string | null;
  projectProgressPercent: number | null;
};

type FormalTaskResultRow = {
  id: string;
  projectTaskId: string;
  projectId: string;
  taskNo: number;
  taskName: string;
  milestoneType: string;
  plannedStartDate: Date | null;
  plannedFinishDate: Date | null;
  forecastStartDate: Date | null;
  forecastFinishDate: Date | null;
  expectedFinishDate: Date | null;
  taskActionType: string | null;
  displayStatus: string | null;
  delayDays: number | null;
  remainingSafeDays: number | null;
  recoverableByDate: Date | null;
  blockingPredecessorNames: unknown;
  riskLevel: string;
  riskMessage: string | null;
};

export type ProductGuideProjectMaster = {
  projectId: string;
  projectCode?: string;
  projectName: string;
  licensorName?: string;
  ipName?: string;
  productType?: string;
  productLine?: string;
  projectTeamName?: string;
  projectOwnerName?: string;
  artOwnerName?: string;
};

export type ProductGuidePrototypeData = ScheduleWorkbenchData & {
  productGuideProjectMasters: Record<string, ProductGuideProjectMaster>;
  productGuideStyleSummaries: ProductGuideStyleSummary[];
};

const milestoneOptions: ProjectCard["milestone"][] = [
  "原画里程碑",
  "建模里程碑",
  "红蜡里程碑",
  "平面里程碑",
  "产前里程碑",
  "大货里程碑",
];

export async function getProductGuidePrototypeData(): Promise<ProductGuidePrototypeData> {
  const scheduleData = await getScheduleWorkbenchData({ includeTaskRows: true, includeProjectDetails: true });
  const baseData = await withProjectTaskFallbackRows(scheduleData);
  const enrichedData = await withProjectMasterRows(baseData);

  return withModelingRows(enrichedData);
}

async function withProjectTaskFallbackRows(scheduleData: ScheduleWorkbenchData): Promise<ScheduleWorkbenchData> {
  const trustedScheduleData = isSimulationScheduleSource(scheduleData.sourceLabel)
    ? (await buildLatestFormalScheduleData(scheduleData)) ?? scheduleData
    : scheduleData;
  const projectTaskData = await buildProjectTaskScheduleData(trustedScheduleData);

  return mergeProjectTaskFallbackRows(trustedScheduleData, projectTaskData);
}

function mergeProjectTaskFallbackRows(
  scheduleData: ScheduleWorkbenchData,
  projectTaskData: ScheduleWorkbenchData,
): ScheduleWorkbenchData {
  const fallbackProjectIds = new Set(Object.keys(projectTaskData.projectDetails));
  const trustsScheduleProjects =
    !isSimulationScheduleSource(scheduleData.sourceLabel) &&
    (scheduleData.scheduleTasks.length > 0 ||
      scheduleData.projectCards.length > 0 ||
      Object.keys(scheduleData.projectDetails).length > 0);

  if (trustsScheduleProjects) {
    const scheduleProjectIds = new Set([
      ...scheduleData.scheduleTasks.map((task) => task.projectId),
      ...scheduleData.projectCards.map((card) => card.projectId),
      ...Object.keys(scheduleData.projectDetails),
    ]);
    const missingProjectIds = [...fallbackProjectIds].filter((projectId) => !scheduleProjectIds.has(projectId));

    if (missingProjectIds.length === 0) {
      return scheduleData;
    }

    const missingProjectIdSet = new Set(missingProjectIds);
    return {
      ...scheduleData,
      sourceLabel: `${scheduleData.sourceLabel} + ProjectTask 补齐`,
      months: mergeTextLists(scheduleData.months, projectTaskData.months),
      initialMonth: scheduleData.initialMonth || projectTaskData.initialMonth,
      projectCards: [
        ...scheduleData.projectCards,
        ...projectTaskData.projectCards.filter((card) => missingProjectIdSet.has(card.projectId)),
      ],
      scheduleTasks: [
        ...scheduleData.scheduleTasks,
        ...projectTaskData.scheduleTasks.filter((task) => missingProjectIdSet.has(task.projectId)),
      ],
      projectDetails: {
        ...scheduleData.projectDetails,
        ...Object.fromEntries(
          Object.entries(projectTaskData.projectDetails).filter(([projectId]) => missingProjectIdSet.has(projectId)),
        ),
      },
    };
  }

  const realProjectIds = fallbackProjectIds;

  if (realProjectIds.size === 0) {
    return scheduleData;
  }

  const realScheduleTasks = scheduleData.scheduleTasks.filter((task) => realProjectIds.has(task.projectId));
  if (realScheduleTasks.length === 0) {
    return projectTaskData;
  }

  const realScheduleProjectCards = scheduleData.projectCards.filter((card) => realProjectIds.has(card.projectId));
  const realProjectDetails = Object.fromEntries(
    Object.entries(scheduleData.projectDetails).filter(([projectId]) => realProjectIds.has(projectId)),
  );
  const realScheduleData = {
    ...scheduleData,
    projectCards: realScheduleProjectCards,
    scheduleTasks: realScheduleTasks,
    projectDetails: realProjectDetails,
  };
  const scheduleProjectIds = new Set(realScheduleTasks.map((task) => task.projectId));
  const missingProjectIds = [...realProjectIds].filter((projectId) => !scheduleProjectIds.has(projectId));

  if (missingProjectIds.length === 0) {
    return realScheduleData;
  }

  const missingProjectIdSet = new Set(missingProjectIds);
  const projectDetails = { ...realProjectDetails };
  for (const projectId of missingProjectIds) {
    const fallbackDetail = projectTaskData.projectDetails[projectId];
    if (fallbackDetail) {
      projectDetails[projectId] = fallbackDetail;
    }
  }

  return {
    ...realScheduleData,
    sourceLabel: `${scheduleData.sourceLabel} + ProjectTask 补齐`,
    months: mergeTextLists(scheduleData.months, projectTaskData.months),
    initialMonth: scheduleData.initialMonth || projectTaskData.initialMonth,
    projectCards: [
      ...realScheduleProjectCards,
      ...projectTaskData.projectCards.filter((card) => missingProjectIdSet.has(card.projectId)),
    ],
    scheduleTasks: [
      ...realScheduleTasks,
      ...projectTaskData.scheduleTasks.filter((task) => missingProjectIdSet.has(task.projectId)),
    ],
    projectDetails,
  };
}

function isSimulationScheduleSource(sourceLabel: string) {
  return /schedule-simulation:|simulation|模拟/i.test(sourceLabel);
}

async function buildLatestFormalScheduleData(
  seedData: ScheduleWorkbenchData,
): Promise<ScheduleWorkbenchData | null> {
  const latestRun = await prisma.scheduleRun.findFirst({
    where: { runStatus: "成功", runType: "正式测算" },
    orderBy: { calculatedAt: "desc" },
  });

  if (!latestRun) {
    return null;
  }

  const projects = await prisma.project.findMany({
    where: excludeScheduleSimulationProjectsWhere(),
    orderBy: [{ plannedLaunchDate: "asc" }, { projectName: "asc" }],
    take: 300,
    select: {
      id: true,
      projectCode: true,
      projectName: true,
      plannedLaunchDate: true,
      projectTeamId: true,
      projectOwnerId: true,
      artOwnerId: true,
      currentStage: true,
      status: true,
    },
  });
  const projectIds = projects.map((project) => project.id);

  if (projectIds.length === 0) {
    return null;
  }

  const [taskResults, projectResults, projectTasks, modelingProgress] = await Promise.all([
    prisma.scheduleTaskResult.findMany({
      where: { scheduleRunId: latestRun.id, projectId: { in: projectIds } },
      orderBy: [{ projectId: "asc" }, { taskNo: "asc" }],
      select: {
        id: true,
        projectTaskId: true,
        projectId: true,
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
        blockingPredecessorNames: true,
        riskLevel: true,
        riskMessage: true,
      },
    }),
    prisma.scheduleProjectResult.findMany({
      where: { scheduleRunId: latestRun.id, projectId: { in: projectIds } },
      select: {
        projectId: true,
        plannedLaunchDate: true,
        forecastLaunchDate: true,
        delayDays: true,
        riskLevel: true,
        currentTaskName: true,
        riskMessage: true,
        projectProgressPercent: true,
      },
    }),
    prisma.projectTask.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, taskNo: true },
    }),
    prisma.projectModelingProgress.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        totalRequiredStyles: true,
        approvedStyles: true,
        inProgressStyles: true,
        submittedStyles: true,
        outsourcedStyles: true,
        unassignedStyles: true,
      },
    }),
  ]);

  if (taskResults.length === 0) {
    return null;
  }

  const scheduledProjectIds = new Set([
    ...taskResults.map((row) => row.projectId),
    ...projectResults.map((row) => row.projectId),
  ]);
  const scheduledProjects = projects.filter((project) => scheduledProjectIds.has(project.id));
  const projectById = new Map(scheduledProjects.map((project) => [project.id, project]));
  const resultByProjectId = new Map(projectResults.map((result) => [result.projectId, result]));
  const projectTaskIdByKey = new Map(projectTasks.map((task) => [projectTaskKey(task.projectId, task.taskNo), task.id]));
  const modelingByProjectId = new Map(modelingProgress.map((progress) => [progress.projectId, progress]));
  const tasksByProjectId = new Map<string, typeof taskResults>();

  for (const task of taskResults) {
    tasksByProjectId.set(task.projectId, [...(tasksByProjectId.get(task.projectId) ?? []), task]);
  }

  const projectCards = buildFormalMilestoneCards(taskResults, projectById);
  const months = buildMonthTimeline(projectCards, scheduledProjects.map((project) => project.plannedLaunchDate));
  const scheduleTasks = buildFormalScheduleTaskRows(taskResults, projectById, resultByProjectId, projectTaskIdByKey);
  const projectDetails: Record<string, ProjectDetail> = {};

  for (const project of scheduledProjects) {
    const rows = tasksByProjectId.get(project.id) ?? [];
    const result = resultByProjectId.get(project.id);
    const progress = modelingByProjectId.get(project.id);
    const riskLevel = toRiskLevel(result?.riskLevel);
    const unfinishedRows = rows.filter((row) => !isFormalTaskDone(row));

    projectDetails[project.id] = {
      id: project.id,
      name: project.projectName,
      projectTeam: project.projectTeamId ?? "待补充项目组",
      owner: project.projectOwnerId ?? "待补充",
      artOwner: project.artOwnerId ?? "待补充",
      currentTask: result?.currentTaskName ?? unfinishedRows[0]?.taskName ?? "项目任务已完成",
      plannedFinish: formatDate(project.plannedLaunchDate),
      forecastFinish: formatDate(result?.forecastLaunchDate),
      riskLevel,
      riskMessage: result?.riskMessage ?? "来自最新正式测算。",
      progressPercent: result?.projectProgressPercent ?? projectProgressFromFormalRows(rows),
      modelingProgress: {
        approved: progress?.approvedStyles ?? 0,
        total: progress?.totalRequiredStyles ?? 0,
        inProgress: progress?.inProgressStyles ?? 0,
        submitted: progress?.submittedStyles ?? 0,
        outsourced: progress?.outsourcedStyles ?? 0,
        unassigned: progress?.unassignedStyles ?? 0,
      },
      weeklyTasks: unfinishedRows.slice(0, 5).map((task) => task.taskName),
    };
  }

  return {
    ...seedData,
    sourceLabel: latestRun.runName ? `正式测算：${latestRun.runName}` : "正式测算",
    months: months.length > 0 ? months : seedData.months,
    initialMonth: months[0] ?? seedData.initialMonth,
    metrics: [
      { label: "正式项目", value: scheduledProjects.length, helper: "来自最新正式测算" },
      { label: "正式任务", value: scheduleTasks.length, helper: "来自 ScheduleTaskResult" },
      { label: "延期风险", value: scheduleTasks.filter((task) => task.riskLevel === "risk").length, helper: "正式测算任务风险" },
      { label: "必然延期", value: scheduleTasks.filter((task) => task.riskLevel === "delay").length, helper: "正式测算任务风险" },
    ],
    projectCards,
    scheduleTasks,
    projectDetails,
  };
}

function buildFormalScheduleTaskRows(
  taskResults: FormalTaskResultRow[],
  projectById: Map<string, FormalProjectRow>,
  resultByProjectId: Map<string, FormalProjectResultRow>,
  projectTaskIdByKey: Map<string, string>,
): ScheduleTaskRow[] {
  return taskResults
    .map((row): ScheduleTaskRow => {
      const project = projectById.get(row.projectId);
      const projectResult = resultByProjectId.get(row.projectId);
      const riskLevel = toRiskLevel(row.riskLevel);
      const plannedFinish = formatDate(row.plannedFinishDate);
      const forecastFinish = formatDate(row.forecastFinishDate);
      const expectedFinish = formatDate(row.expectedFinishDate);
      const recoverableByDate = formatDate(row.recoverableByDate);
      const plannedStart = formatDate(row.plannedStartDate);
      const forecastStart = formatDate(row.forecastStartDate);
      const currentDdl = forecastFinish || expectedFinish || plannedFinish;
      const latestFinish = recoverableByDate || forecastFinish || expectedFinish || plannedFinish;

      return {
        id: row.id,
        projectTaskId: projectTaskIdByKey.get(projectTaskKey(row.projectId, row.taskNo)) ?? row.projectTaskId,
        projectId: row.projectId,
        projectCode: project?.projectCode ?? row.projectId,
        projectName: project?.projectName ?? row.projectId,
        projectStage: project?.currentStage ?? project?.status ?? "待补充",
        plannedLaunchDate: formatDate(projectResult?.plannedLaunchDate ?? project?.plannedLaunchDate),
        forecastLaunchDate: formatDate(projectResult?.forecastLaunchDate),
        launchDeltaDays: projectResult?.delayDays ?? null,
        taskNo: row.taskNo,
        taskName: row.taskName,
        milestoneType: row.milestoneType || normalizeMilestone(row.milestoneType, row.taskNo),
        durationDays: null,
        taskStatus: row.displayStatus ?? "未开始",
        shouldStartLabel: row.displayStatus ?? "",
        missingActualPredecessorIds: jsonText(row.blockingPredecessorNames) ?? "",
        actualStartDate: "",
        actualFinishDate: "",
        expectedFinishDate: expectedFinish,
        inferredCompletedLabel: isFormalTaskDone(row) ? "已完成" : "",
        inferredCompletionDate: "",
        plannedStartDate: plannedStart,
        plannedFinishDate: plannedFinish,
        progressForecastStartDate: forecastStart,
        progressForecastFinishDate: forecastFinish,
        calculatedStartDate: forecastStart,
        calculatedFinishDate: forecastFinish,
        currentDdlDate: currentDdl,
        originalLatestStartDate: plannedStart,
        originalLatestFinishDate: plannedFinish || expectedFinish,
        latestStartDate: forecastStart || plannedStart,
        latestFinishDate: latestFinish,
        floatDays: null,
        planDeltaDays: row.delayDays,
        deadlineRiskDays: row.delayDays,
        warningWindowDays: row.remainingSafeDays,
        impactStatus: row.displayStatus ?? "",
        riskLevel,
        riskText: row.riskMessage ?? row.riskLevel,
        isBlockingLaunchLabel: hasBlockingValue(row.blockingPredecessorNames) ? "是" : "否",
      };
    })
    .sort((a, b) => a.projectName.localeCompare(b.projectName, "zh-CN") || a.taskNo - b.taskNo);
}

function buildFormalMilestoneCards(
  taskResults: FormalTaskResultRow[],
  projectById: Map<string, FormalProjectRow>,
): ProjectCard[] {
  const group = new Map<string, { projectId: string; milestone: ProjectCard["milestone"]; rows: FormalTaskResultRow[] }>();

  for (const row of taskResults) {
    const project = projectById.get(row.projectId);
    if (!project) continue;

    const milestone = normalizeMilestone(row.milestoneType, row.taskNo);
    const key = `${row.projectId}:${milestone}`;
    const current = group.get(key);
    if (current) {
      current.rows.push(row);
    } else {
      group.set(key, { projectId: row.projectId, milestone, rows: [row] });
    }
  }

  const cards: ProjectCard[] = [];
  for (const item of group.values()) {
    const project = projectById.get(item.projectId);
    if (!project) continue;

    const plannedDate = maxDate(item.rows.map((row) => row.plannedFinishDate ?? row.expectedFinishDate ?? row.forecastFinishDate));
    const forecastDate = maxDate(item.rows.map((row) => forecastDateForFormalRow(row)));
    const plannedMonth = plannedDate ? monthLabel(plannedDate) : "";
    const forecastMonth = forecastDate ? monthLabel(forecastDate) : plannedMonth;
    const month = plannedMonth || forecastMonth;
    if (!month) continue;

    cards.push({
      id: `${item.projectId}:${item.milestone}`,
      projectId: item.projectId,
      name: project.projectName,
      month,
      plannedMonth: plannedMonth || month,
      forecastMonth: forecastMonth || month,
      milestone: item.milestone,
      riskLevel: groupFormalRiskLevel(item.rows),
    });
  }

  return cards.sort((a, b) => compareMonthLabels(a.plannedMonth ?? a.month, b.plannedMonth ?? b.month) || a.name.localeCompare(b.name, "zh-CN"));
}

function forecastDateForFormalRow(row: FormalTaskResultRow) {
  return row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate;
}

function groupFormalRiskLevel(rows: FormalTaskResultRow[]): RiskLevel {
  if (rows.length > 0 && rows.every(isFormalTaskDone)) {
    return rows.some((row) => toRiskLevel(row.riskLevel) === "doneLate") ? "doneLate" : "done";
  }

  return rows.filter((row) => !isFormalTaskDone(row)).reduce<RiskLevel>((level, row) => {
    return worseRiskLevel(level, toRiskLevel(row.riskLevel));
  }, "normal");
}

function isFormalTaskDone(row: FormalTaskResultRow) {
  return isDoneText(row.displayStatus) || isDoneText(row.taskActionType);
}

function projectProgressFromFormalRows(rows: FormalTaskResultRow[]) {
  if (rows.length === 0) return 0;
  return Math.round((rows.filter(isFormalTaskDone).length / rows.length) * 100);
}

function projectTaskKey(projectId: string, taskNo: number) {
  return `${projectId}:${taskNo}`;
}

function hasBlockingValue(value: unknown) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function jsonText(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(String).join(",");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function toRiskLevel(value?: string | null): RiskLevel {
  if (!value) return "normal";
  if (value === "done" || value === "doneLate" || value === "normal" || value === "risk" || value === "delay") {
    return value;
  }
  if (value.includes("延期完成")) return "doneLate";
  if (value.includes("已完成") || value.includes("已通过")) return "done";
  if (value.includes("必然延期") || value.includes("严重延期")) return "delay";
  if (value.includes("延期风险") || value.includes("风险")) return "risk";
  if (value.includes("延期")) return "delay";
  return "normal";
}

function worseRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  const weights: Record<RiskLevel, number> = {
    done: 0,
    doneLate: 0,
    normal: 1,
    risk: 2,
    delay: 3,
  };

  return weights[b] > weights[a] ? b : a;
}

async function withProjectMasterRows(scheduleData: ScheduleWorkbenchData): Promise<ProductGuidePrototypeData> {
  const projectIds = [
    ...new Set(
      [
        ...scheduleData.scheduleTasks.map((task) => task.projectId),
        ...scheduleData.projectCards.map((card) => card.projectId),
        ...Object.keys(scheduleData.projectDetails),
      ].filter(Boolean),
    ),
  ];

  if (projectIds.length === 0) {
    return { ...scheduleData, productGuideProjectMasters: {}, productGuideStyleSummaries: [] };
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      projectCode: true,
      projectName: true,
      licensorName: true,
      ipName: true,
      productType: true,
      productLine: true,
      projectTeamId: true,
      projectOwnerId: true,
      artOwnerId: true,
    },
  });
  const teamIds = [...new Set(projects.map((project) => project.projectTeamId).filter((id): id is string => Boolean(id)))];
  const userIds = [
    ...new Set(
      projects
        .flatMap((project) => [project.projectOwnerId, project.artOwnerId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [teams, users] = await Promise.all([
    teamIds.length > 0 ? prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }) : [],
    userIds.length > 0 ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
  ]);
  const teamById = new Map(teams.map((team) => [team.id, team.name]));
  const userById = new Map(users.map((user) => [user.id, user.name]));
  const masters: Record<string, ProductGuideProjectMaster> = {};

  for (const project of projects) {
    masters[project.id] = {
      projectId: project.id,
      projectCode: project.projectCode ?? undefined,
      projectName: project.projectName,
      licensorName: project.licensorName ?? undefined,
      ipName: project.ipName ?? undefined,
      productType: project.productType ?? undefined,
      productLine: project.productLine ?? undefined,
      projectTeamName: project.projectTeamId ? teamById.get(project.projectTeamId) ?? project.projectTeamId : undefined,
      projectOwnerName: project.projectOwnerId ? userById.get(project.projectOwnerId) ?? project.projectOwnerId : undefined,
      artOwnerName: project.artOwnerId ? userById.get(project.artOwnerId) ?? project.artOwnerId : undefined,
    };
  }

  return { ...scheduleData, productGuideProjectMasters: masters, productGuideStyleSummaries: [] };
}

async function withModelingRows(scheduleData: ProductGuidePrototypeData): Promise<ProductGuidePrototypeData> {
  const projectIds = [
    ...new Set(
      [
        ...scheduleData.scheduleTasks.map((task) => task.projectId),
        ...scheduleData.projectCards.map((card) => card.projectId),
        ...Object.keys(scheduleData.projectDetails),
      ].filter(Boolean),
    ),
  ];

  if (projectIds.length === 0) {
    return { ...scheduleData, productGuideStyleSummaries: [] };
  }

  const [progressRows, modelingTasks] = await Promise.all([
    prisma.projectModelingProgress.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        totalRequiredStyles: true,
        approvedStyles: true,
        inProgressStyles: true,
        submittedStyles: true,
        outsourcedStyles: true,
        unassignedStyles: true,
      },
    }),
    prisma.modelingTask.findMany({
      where: { projectId: { in: projectIds }, status: { not: "取消" } },
      orderBy: [{ projectId: "asc" }, { isFirstModelingStyle: "desc" }, { styleSequence: "asc" }, { styleCode: "asc" }],
      take: 2000,
      select: {
        id: true,
        projectId: true,
        projectTaskId: true,
        sourceStyleId: true,
        styleSubmissionBatchId: true,
        styleSubmissionVersion: true,
        styleCode: true,
        styleSequence: true,
        styleName: true,
        isFirstModelingStyle: true,
        isRequired: true,
        referenceImageUrls: true,
        originalArtStatus: true,
        originalArtApprovedDate: true,
        difficulty: true,
        estimatedWorkdays: true,
        status: true,
        isOutsourced: true,
        plannedFinishDate: true,
        actualFinishDate: true,
        lastUpdatedAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const progressByProjectId = new Map(progressRows.map((progress) => [progress.projectId, progress]));
  const projectDetails = { ...scheduleData.projectDetails };

  for (const projectId of projectIds) {
    const progress = progressByProjectId.get(projectId);
    if (!progress) continue;

    const detail = projectDetails[projectId];
    if (!detail) continue;

    projectDetails[projectId] = {
      ...detail,
      modelingProgress: {
        approved: progress.approvedStyles,
        total: progress.totalRequiredStyles,
        inProgress: progress.inProgressStyles,
        submitted: progress.submittedStyles,
        outsourced: progress.outsourcedStyles,
        unassigned: progress.unassignedStyles,
      },
    };
  }

  return {
    ...scheduleData,
    projectDetails,
    productGuideStyleSummaries: modelingTasks.map((task) => ({
      id: task.id,
      modelingTaskId: task.id,
      sourceStyleId: task.sourceStyleId ?? undefined,
      styleSubmissionBatchId: task.styleSubmissionBatchId ?? undefined,
      styleSubmissionVersion: task.styleSubmissionVersion ?? undefined,
      projectId: task.projectId,
      projectTaskId: task.projectTaskId,
      styleCode: task.styleCode,
      styleName: task.styleName || task.styleCode,
      styleSequence: task.styleSequence ?? undefined,
      isFirstModelingStyle: task.isFirstModelingStyle,
      isRequired: task.isRequired,
      referenceImageUrls: referenceImagesFromJson(task.referenceImageUrls),
      originalArtStatus: task.originalArtStatus,
      originalArtApprovedDate: formatDate(task.originalArtApprovedDate),
      difficulty: task.difficulty,
      estimatedWorkdays: task.estimatedWorkdays,
      status: task.isOutsourced && task.status !== "已通过" ? "外包中" : task.status,
      plannedFinishDate: formatDate(task.plannedFinishDate),
      actualFinishDate: formatDate(task.actualFinishDate),
      lastUpdatedAt: formatDate(task.lastUpdatedAt ?? task.updatedAt),
    })),
  };
}

async function buildProjectTaskScheduleData(scheduleData: ScheduleWorkbenchData): Promise<ScheduleWorkbenchData> {
  const projects = await prisma.project.findMany({
    where: excludeScheduleSimulationProjectsWhere(),
    orderBy: [{ plannedLaunchDate: "asc" }, { projectName: "asc" }],
    take: 300,
    select: {
      id: true,
      projectCode: true,
      projectName: true,
      ipName: true,
      licensorName: true,
      productType: true,
      plannedLaunchDate: true,
      projectTeamId: true,
      projectOwnerId: true,
      artOwnerId: true,
      currentStage: true,
      status: true,
    },
  });
  const projectIds = projects.map((project) => project.id);
  const projectTasks = await prisma.projectTask.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: [{ projectId: "asc" }, { taskNo: "asc" }, { id: "asc" }],
    select: {
      id: true,
      projectId: true,
      taskNo: true,
      taskName: true,
      milestoneType: true,
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
    },
  });
  const tasksByProjectId = new Map<string, typeof projectTasks>();
  for (const task of projectTasks) {
    tasksByProjectId.set(task.projectId, [...(tasksByProjectId.get(task.projectId) ?? []), task]);
  }
  const teamIds = [...new Set(projects.map((project) => project.projectTeamId).filter((id): id is string => Boolean(id)))];
  const userIds = [
    ...new Set(
      projects
        .flatMap((project) => [project.projectOwnerId, project.artOwnerId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [teams, users] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const teamById = new Map(teams.map((team) => [team.id, team.name]));
  const userById = new Map(users.map((user) => [user.id, user.name]));
  const scheduleTasks: ScheduleTaskRow[] = [];
  const projectDetails: Record<string, ProjectDetail> = {};

  for (const project of projects) {
    const tasks = tasksByProjectId.get(project.id) ?? [];
    if (tasks.length === 0) continue;

    projectDetails[project.id] = {
      id: project.id,
      name: project.projectName,
      projectTeam: project.projectTeamId ? teamById.get(project.projectTeamId) ?? project.projectTeamId : "待补充项目组",
      owner: project.projectOwnerId ? userById.get(project.projectOwnerId) ?? project.projectOwnerId : "待补充产品研发",
      artOwner: project.artOwnerId ? userById.get(project.artOwnerId) ?? project.artOwnerId : "待补充产品美术",
      currentTask: tasks.find((task) => !isDoneText(task.status))?.taskName ?? "项目任务已完成",
      plannedFinish: formatDate(project.plannedLaunchDate),
      forecastFinish: formatDate(project.plannedLaunchDate),
      riskLevel: tasks.some((task) => task.isBlocked) ? "delay" : "normal",
      riskMessage: tasks.find((task) => task.blockReason)?.blockReason ?? "从 ProjectTask 读取任务事实，暂无排期测算结果。",
      progressPercent: Math.round((tasks.filter((task) => isDoneText(task.status)).length / tasks.length) * 100),
      modelingProgress: {
        approved: 0,
        total: 0,
        inProgress: 0,
        submitted: 0,
        outsourced: 0,
        unassigned: 0,
      },
      weeklyTasks: tasks.filter((task) => !isDoneText(task.status)).slice(0, 5).map((task) => task.taskName),
    };

    for (const task of tasks) {
      const riskLevel = task.isBlocked ? "delay" : isDoneText(task.status) ? "done" : "normal";
      const plannedFinish = formatDate(task.plannedFinishDate);
      const expectedFinish = formatDate(task.expectedFinishDate);

      scheduleTasks.push({
        id: task.id,
        projectTaskId: task.id,
        projectId: project.id,
        projectCode: project.projectCode ?? project.id,
        projectName: project.projectName,
        projectStage: project.currentStage ?? project.status,
        plannedLaunchDate: formatDate(project.plannedLaunchDate),
        forecastLaunchDate: formatDate(project.plannedLaunchDate),
        launchDeltaDays: null,
        taskNo: task.taskNo,
        taskName: task.taskName,
        milestoneType: task.milestoneType,
        durationDays: null,
        taskStatus: task.status,
        shouldStartLabel: task.status,
        missingActualPredecessorIds: "",
        actualStartDate: formatDate(task.actualStartDate),
        actualFinishDate: formatDate(task.actualFinishDate),
        expectedFinishDate: expectedFinish,
        inferredCompletedLabel: isDoneText(task.status) ? "已完成" : "",
        inferredCompletionDate: formatDate(task.actualFinishDate),
        plannedStartDate: formatDate(task.plannedStartDate),
        plannedFinishDate: plannedFinish,
        progressForecastStartDate: formatDate(task.plannedStartDate),
        progressForecastFinishDate: expectedFinish || plannedFinish,
        calculatedStartDate: formatDate(task.plannedStartDate),
        calculatedFinishDate: expectedFinish || plannedFinish,
        currentDdlDate: plannedFinish || expectedFinish,
        originalLatestStartDate: formatDate(task.plannedStartDate),
        originalLatestFinishDate: plannedFinish || expectedFinish,
        latestStartDate: formatDate(task.plannedStartDate),
        latestFinishDate: expectedFinish || plannedFinish,
        floatDays: null,
        planDeltaDays: null,
        deadlineRiskDays: null,
        warningWindowDays: null,
        impactStatus: task.isBlocked ? "阻塞" : task.status,
        riskLevel,
        riskText: task.blockReason ?? task.progressNote ?? "来自 ProjectTask 任务事实。",
        isBlockingLaunchLabel: task.isBlocked ? "是" : "否",
      });
    }
  }

  const projectCards = buildProjectTaskMilestoneCards(projects, projectTasks);
  const months = buildMonthTimeline(projectCards, projects.map((project) => project.plannedLaunchDate));

  return {
    ...scheduleData,
    sourceLabel: scheduleTasks.length > 0 ? "ProjectTask 任务清单" : scheduleData.sourceLabel,
    months: months.length > 0 ? months : scheduleData.months,
    initialMonth: months[0] ?? scheduleData.initialMonth,
    metrics: [
      { label: "真实项目", value: projects.length, helper: "来自当前 Project 表" },
      { label: "真实任务", value: projectTasks.length, helper: "来自 ProjectTask 表" },
      { label: "阻塞任务", value: projectTasks.filter((task) => task.isBlocked).length, helper: "ProjectTask.isBlocked" },
      { label: "建模回传", value: await prisma.modelingProductGuideEvent.count(), helper: "建模排期回传事件" },
    ],
    projectCards,
    calendarProjects: [],
    scheduleTasks,
    projectDetails,
  };
}

function mergeTextLists(primary: string[], secondary: string[]) {
  return [...new Set([...primary, ...secondary].filter(Boolean))];
}

function buildProjectTaskMilestoneCards(
  projects: PrototypeProjectRow[],
  projectTasks: PrototypeProjectTaskRow[],
): ProjectCard[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const group = new Map<string, PrototypeProjectTaskRow[]>();

  for (const task of projectTasks) {
    const milestone = normalizeMilestone(task.milestoneType, task.taskNo);
    const key = `${task.projectId}:${milestone}`;
    group.set(key, [...(group.get(key) ?? []), task]);
  }

  const cards: ProjectCard[] = [];

  for (const [key, tasks] of group.entries()) {
    const [projectId, milestoneValue] = key.split(":");
    const project = projectById.get(projectId);
    if (!project || !milestoneValue) continue;

    const milestone = normalizeMilestone(milestoneValue, tasks[0]?.taskNo ?? 1);
    const plannedDate = maxDate(tasks.map((task) => task.plannedFinishDate)) ?? project.plannedLaunchDate;
    const forecastDate = maxDate(tasks.map((task) => task.expectedFinishDate ?? task.plannedFinishDate)) ?? plannedDate;
    const allDone = tasks.length > 0 && tasks.every((task) => isDoneText(task.status));
    const riskLevel: RiskLevel = tasks.some((task) => task.isBlocked) ? "delay" : allDone ? "done" : "normal";

    cards.push({
      id: `${projectId}:${milestone}`,
      projectId,
      name: project.projectName,
      month: monthLabel(plannedDate),
      plannedMonth: monthLabel(plannedDate),
      forecastMonth: monthLabel(forecastDate),
      milestone,
      riskLevel,
    });
  }

  return cards.sort((a, b) => a.month.localeCompare(b.month, "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
}

function buildMonthTimeline(cards: ProjectCard[], fallbackDates: Date[]) {
  const labels = new Set<string>();
  for (const card of cards) {
    if (card.plannedMonth) labels.add(card.plannedMonth);
    if (card.forecastMonth) labels.add(card.forecastMonth);
    if (card.month) labels.add(card.month);
  }
  for (const date of fallbackDates) {
    labels.add(monthLabel(date));
  }

  return [...labels].sort(compareMonthLabels);
}

function maxDate(dates: Array<Date | null | undefined>) {
  const validDates = dates.filter((date): date is Date => date instanceof Date);
  if (validDates.length === 0) return null;
  return new Date(Math.max(...validDates.map((date) => date.getTime())));
}

function formatDate(date?: Date | null) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function referenceImagesFromJson(value: unknown): ProductGuideStyleSummary["referenceImageUrls"] {
  if (!Array.isArray(value)) return [];

  const images: NonNullable<ProductGuideStyleSummary["referenceImageUrls"]> = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const record = item as Record<string, unknown>;
    const url = textValue(record.url);
    if (!url) continue;

    images.push({
      name: textValue(record.name),
      url,
      type: textValue(record.type),
    });
  }

  return images;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function monthLabel(date: Date) {
  const year = date.getFullYear().toString().slice(2);
  return `${year}年${date.getMonth() + 1}月`;
}

function compareMonthLabels(a: string, b: string) {
  return monthLabelPoint(a) - monthLabelPoint(b);
}

function monthLabelPoint(value: string) {
  const match = value.match(/(\d{2})年(\d{1,2})月/);
  if (!match) return 0;
  return Number(match[1]) * 12 + Number(match[2]);
}

function normalizeMilestone(value: string, taskNo: number): ProjectCard["milestone"] {
  if (milestoneOptions.includes(value as ProjectCard["milestone"])) {
    return value as ProjectCard["milestone"];
  }

  if (taskNo <= 6) return "原画里程碑";
  if (taskNo <= 13) return "建模里程碑";
  if (taskNo <= 18) return "红蜡里程碑";
  if (taskNo <= 22) return "平面里程碑";
  if (taskNo <= 26) return "产前里程碑";
  return "大货里程碑";
}

function isDoneText(value?: string | null) {
  const text = value?.trim();
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return (
    lowerText === "done" ||
    text === "完成" ||
    text === "通过" ||
    text.includes("已完成") ||
    text.includes("已通过") ||
    text.includes("送审通过")
  );
}
