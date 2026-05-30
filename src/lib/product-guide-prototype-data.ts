import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProductGuideStyleSummary } from "@/lib/product-guide-types";
import { getScheduleWorkbenchData } from "@/lib/schedule-repository";
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

export type ProductGuidePrototypeData = ScheduleWorkbenchData & {
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
  const baseData = scheduleData.scheduleTasks.length > 0 ? scheduleData : await withProjectTaskRows(scheduleData);

  return withModelingRows(baseData);
}

async function withModelingRows(scheduleData: ScheduleWorkbenchData): Promise<ProductGuidePrototypeData> {
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

async function withProjectTaskRows(scheduleData: ScheduleWorkbenchData): Promise<ScheduleWorkbenchData> {
  const projects = await prisma.project.findMany({
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
  return Boolean(value?.includes("完成") || value?.includes("通过") || value?.toLowerCase() === "done");
}
