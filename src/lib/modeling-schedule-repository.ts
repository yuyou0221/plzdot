import "server-only";

import { prisma } from "@/lib/db/prisma";
import { buildModelingTodosFromTasks } from "@/lib/modeling-todos";
import type {
  ModelerCapacity,
  ModelingMilestoneCard,
  ModelingMilestoneOverview,
  ModelingMilestoneRiskLevel,
  ModelingMetric,
  ModelingReferenceImage,
  ModelingScheduleData,
  ModelingTaskCard,
  ModelingTaskStatus,
  OutsourceVendorOption,
  ProjectModelingSummary,
} from "@/lib/modeling-schedule-types";

const statusColumns: ModelingTaskStatus[] = [
  "待确认",
  "退回补充",
  "未启动",
  "未分配",
  "已排期",
  "排队中",
  "建模中",
  "修改中",
  "待验收",
  "待送审",
  "已送审",
  "等反馈",
  "已通过",
  "外包中",
  "暂停",
  "取消",
];

const activeQueueStatuses = new Set<ModelingTaskStatus>(["已排期", "排队中", "建模中", "修改中", "待验收", "已送审", "等反馈", "外包中", "暂停"]);
const preConfirmationStatuses = new Set<ModelingTaskStatus>(["待确认", "退回补充"]);
const reviewBlockedStatuses = new Set<ModelingTaskStatus>(["待验收", "已送审", "等反馈"]);
const defaultVirtualModelers: ModelerCapacity[] = [
  {
    id: "virtual-modeler-a",
    name: "待补充建模师 A",
    roleTitle: "内部建模",
    weeklyCapacityStyles: 4,
    weeklyAvailableWorkdays: 4,
    isSchedulable: true,
    specialtyTags: [],
    isVirtual: true,
  },
  {
    id: "virtual-modeler-b",
    name: "待补充建模师 B",
    roleTitle: "内部建模",
    weeklyCapacityStyles: 4,
    weeklyAvailableWorkdays: 4,
    isSchedulable: true,
    specialtyTags: [],
    isVirtual: true,
  },
  {
    id: "virtual-modeler-c",
    name: "待补充建模师 C",
    roleTitle: "内部建模",
    weeklyCapacityStyles: 4,
    weeklyAvailableWorkdays: 4,
    isSchedulable: true,
    specialtyTags: [],
    isVirtual: true,
  },
];

type ProjectRow = {
  id: string;
  projectName: string;
  styleCount: number | null;
  currentStage: string | null;
  status: string;
  plannedLaunchDate: Date;
};

type ModelingTaskRow = {
  id: string;
  projectId: string;
  projectTaskId: string;
  sourceStyleId: string | null;
  styleCode: string;
  styleSequence: string | null;
  styleName: string;
  isFirstModelingStyle: boolean;
  referenceImageUrls: unknown;
  originalArtStatus: string;
  originalArtApprovedDate: Date | null;
  difficulty: string;
  estimatedWorkdays: number;
  modelerId: string | null;
  isOutsourced: boolean;
  outsourceVendorId: string | null;
  stableOutsourceCapacity: boolean | null;
  plannedStartDate: Date | null;
  plannedFinishDate: Date | null;
  actualStartDate: Date | null;
  actualFinishDate: Date | null;
  internalApprovedDate: Date | null;
  copyrightApprovedDate: Date | null;
  actualWorkdays: number | null;
  actualWorkMinutes: number;
  activeWorkStartedAt: Date | null;
  remainingWorkdays: number | null;
  notes: string | null;
  status: string;
  reviewRound: number | null;
  lastFeedbackAt: Date | null;
  blockedDays: number | null;
  blockType: string | null;
  lastUpdatedAt: Date | null;
};

type FeedbackRow = {
  modelingTaskId: string;
  roundNo: number;
  feedbackAt: Date;
  content: string;
  status: string;
};

type ScheduleTaskResultRow = {
  projectId: string;
  projectTaskId: string;
  taskNo: number;
  taskName: string;
  plannedFinishDate: Date | null;
  forecastFinishDate: Date | null;
  expectedFinishDate: Date | null;
  displayStatus: string | null;
  taskActionType: string | null;
  riskLevel: string;
  riskMessage: string | null;
  rawResult: unknown;
};

type ModelingMilestoneCompletion = {
  isCompleted: boolean;
  completionDate: Date | null;
};

export async function getModelingScheduleData(): Promise<ModelingScheduleData> {
  try {
    const [projects, realTasks, users, vendors, progressRows, latestRun] = await Promise.all([
      prisma.project.findMany({
        orderBy: [{ plannedLaunchDate: "asc" }, { id: "asc" }],
        take: 300,
        select: {
          id: true,
          projectName: true,
          styleCount: true,
          currentStage: true,
          status: true,
          plannedLaunchDate: true,
        },
      }),
      prisma.modelingTask.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 1200,
        select: {
          id: true,
          projectId: true,
          projectTaskId: true,
          sourceStyleId: true,
          styleCode: true,
          styleSequence: true,
          styleName: true,
          isFirstModelingStyle: true,
          referenceImageUrls: true,
          originalArtStatus: true,
          originalArtApprovedDate: true,
          difficulty: true,
          estimatedWorkdays: true,
          modelerId: true,
          isOutsourced: true,
          outsourceVendorId: true,
          stableOutsourceCapacity: true,
          plannedStartDate: true,
          plannedFinishDate: true,
          actualStartDate: true,
          actualFinishDate: true,
          internalApprovedDate: true,
          copyrightApprovedDate: true,
          actualWorkdays: true,
          actualWorkMinutes: true,
          activeWorkStartedAt: true,
          remainingWorkdays: true,
          notes: true,
          status: true,
          reviewRound: true,
          lastFeedbackAt: true,
          blockedDays: true,
          blockType: true,
          lastUpdatedAt: true,
        },
      }),
      prisma.user.findMany({
        where: { isModeler: true, status: { not: "停用" } },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          roleTitle: true,
          weeklyCapacityStyles: true,
          weeklyAvailableWorkdays: true,
          isSchedulable: true,
        },
      }),
      prisma.outsourceVendor.findMany({
        where: { status: { not: "停用" } },
        select: {
          id: true,
          name: true,
          stableCapacity: true,
        },
      }),
      prisma.projectModelingProgress.findMany(),
      prisma.scheduleRun.findFirst({
        where: { runStatus: "成功" },
        orderBy: { calculatedAt: "desc" },
      }),
    ]);

    const userIds = users.map((user) => user.id);
    const [capabilityTags, feedbackRows, milestoneRows] = await Promise.all([
      userIds.length > 0
        ? prisma.modelerCapabilityTag.findMany({
            where: { userId: { in: userIds } },
            orderBy: [{ userId: "asc" }, { tagName: "asc" }],
          })
        : Promise.resolve([]),
      realTasks.length > 0
        ? prisma.modelingFeedback.findMany({
            where: { modelingTaskId: { in: realTasks.map((task) => task.id) } },
            orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }, { createdAt: "desc" }],
            take: 800,
            select: {
              modelingTaskId: true,
              roundNo: true,
              feedbackAt: true,
              content: true,
              status: true,
            },
        })
        : Promise.resolve([]),
      latestRun
        ? prisma.scheduleTaskResult.findMany({
            where: { scheduleRunId: latestRun.id, taskNo: { in: [7, 8, 9, 10] } },
            orderBy: [{ projectId: "asc" }, { taskNo: "asc" }],
            select: {
              projectId: true,
              projectTaskId: true,
              taskNo: true,
              taskName: true,
              plannedFinishDate: true,
              forecastFinishDate: true,
              expectedFinishDate: true,
              displayStatus: true,
              taskActionType: true,
              riskLevel: true,
              riskMessage: true,
              rawResult: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const projectById = new Map(projects.map((project) => [project.id, project]));
    const modelers = buildModelers(users, capabilityTags, realTasks);
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const vendorOptions = buildVendors(vendors);
    const modelingCompletionByProjectId = buildModelingCompletionByProjectId(projects, milestoneRows);
    const tasks =
      realTasks.length > 0
        ? buildRealTasks(realTasks, projectById, modelers, vendorById, feedbackRows, modelingCompletionByProjectId)
        : buildVirtualTasks(
            projects,
            modelers,
            vendors.length > 0 ? vendors[0].name : "待补充外包供应商",
            modelingCompletionByProjectId,
          );
    const summaries = buildProjectSummaries(projects, tasks, progressRows, realTasks.length === 0, modelingCompletionByProjectId);

    return {
      sourceLabel: realTasks.length > 0 ? "数据库建模任务" : "数据库项目 + 虚拟款式任务",
      generatedAt: new Date().toISOString(),
      todos: buildModelingTodosFromTasks(tasks),
      milestoneOverview: buildMilestoneOverview(projects, milestoneRows),
      metrics: buildMetrics(tasks, modelers),
      tasks,
      modelers,
      vendors: vendorOptions,
      projectSummaries: summaries,
      statusColumns,
    };
  } catch (error) {
    console.error("Failed to build modeling schedule data", error);
    const fallbackProjects = buildFallbackProjects();
    const tasks = buildVirtualTasks(fallbackProjects, defaultVirtualModelers, "待补充外包供应商");
    const fallbackVendors = buildVendors([]);

    return {
      sourceLabel: "样例虚拟款式任务",
      generatedAt: new Date().toISOString(),
      todos: [],
      milestoneOverview: buildMilestoneOverview(fallbackProjects, []),
      metrics: buildMetrics(tasks, defaultVirtualModelers),
      tasks,
      modelers: defaultVirtualModelers,
      vendors: fallbackVendors,
      projectSummaries: buildProjectSummaries(fallbackProjects, tasks, [], true),
      statusColumns,
    };
  }
}

function buildVendors(vendors: Array<{ id: string; name: string; stableCapacity: boolean }>): OutsourceVendorOption[] {
  if (vendors.length === 0) {
    return [
      {
        id: "virtual-vendor",
        name: "待补充外包供应商",
        stableCapacity: true,
        isVirtual: true,
      },
    ];
  }

  return vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    stableCapacity: vendor.stableCapacity,
    isVirtual: false,
  }));
}

function buildModelers(
  users: Array<{
    id: string;
    name: string;
    roleTitle: string | null;
    weeklyCapacityStyles: number | null;
    weeklyAvailableWorkdays: number | null;
    isSchedulable: boolean;
  }>,
  capabilityTags: Array<{ userId: string; tagName: string }>,
  tasks: ModelingTaskRow[],
): ModelerCapacity[] {
  const tagsByUserId = new Map<string, string[]>();

  for (const tag of capabilityTags) {
    const tags = tagsByUserId.get(tag.userId) ?? [];
    tags.push(tag.tagName);
    tagsByUserId.set(tag.userId, tags);
  }

  const modelers = users.map((user): ModelerCapacity => {
    const weeklyAvailableWorkdays = user.weeklyAvailableWorkdays ?? user.weeklyCapacityStyles ?? 4;

    return {
      id: user.id,
      name: user.name,
      roleTitle: user.roleTitle ?? "建模师",
      weeklyCapacityStyles: weeklyAvailableWorkdays,
      weeklyAvailableWorkdays,
      isSchedulable: user.isSchedulable,
      specialtyTags: tagsByUserId.get(user.id) ?? [],
      isVirtual: false,
    };
  });
  const knownModelerIds = new Set(modelers.map((modeler) => modeler.id));

  for (const task of tasks) {
    if (!task.modelerId || knownModelerIds.has(task.modelerId)) {
      continue;
    }

    knownModelerIds.add(task.modelerId);
    modelers.push({
      id: task.modelerId,
      name: `未知建模师 ${task.modelerId.slice(0, 6)}`,
      roleTitle: "待补充人员",
      weeklyCapacityStyles: 4,
      weeklyAvailableWorkdays: 4,
      isSchedulable: true,
      specialtyTags: [],
      isVirtual: true,
    });
  }

  return modelers.length > 0 ? modelers : defaultVirtualModelers;
}

function buildMilestoneOverview(
  projects: ProjectRow[],
  rows: ScheduleTaskResultRow[],
  today = new Date(),
): ModelingMilestoneOverview {
  const currentMonth = dateToMonthPoint(today);
  const nextMonth = addMonths(currentMonth, 1);
  const currentMonthLabel = formatMonthLabel(currentMonth);
  const nextMonthLabel = formatMonthLabel(nextMonth);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const rowsByProjectId = new Map<string, ScheduleTaskResultRow[]>();

  for (const row of rows) {
    const projectRows = rowsByProjectId.get(row.projectId) ?? [];
    projectRows.push(row);
    rowsByProjectId.set(row.projectId, projectRows);
  }

  const cards = Array.from(rowsByProjectId.entries())
    .map(([projectId, projectRows]) => {
      const project = projectById.get(projectId);

      if (!project) {
        return null;
      }

      return buildMilestoneCard(project, projectRows);
    })
    .filter((card): card is ModelingMilestoneCard => card !== null)
    .sort((a, b) => {
      const dateOrder = a.plannedFinishDate.localeCompare(b.plannedFinishDate);
      if (dateOrder !== 0) return dateOrder;

      return a.projectName.localeCompare(b.projectName, "zh-CN");
    });

  return {
    currentMonthLabel,
    nextMonthLabel,
    previousUnfinished: cards.filter((card) => !card.isCompleted && compareMonthPoint(dateStringToMonthPoint(card.plannedFinishDate), currentMonth) < 0),
    currentMonth: cards.filter((card) => compareMonthPoint(dateStringToMonthPoint(card.plannedFinishDate), currentMonth) === 0),
    nextMonth: cards.filter((card) => compareMonthPoint(dateStringToMonthPoint(card.plannedFinishDate), nextMonth) === 0),
  };
}

function buildMilestoneCard(project: ProjectRow, rows: ScheduleTaskResultRow[]): ModelingMilestoneCard | null {
  const plannedFinish = maxDate(rows.map((row) => row.plannedFinishDate ?? row.expectedFinishDate ?? row.forecastFinishDate));

  if (!plannedFinish) {
    return null;
  }

  const forecastFinish = maxDate(rows.map((row) => row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate));
  const completion = modelingMilestoneCompletion(project, rows);
  const completedTaskCount = rows.filter(isCompletedScheduleTask).length;
  const isCompleted = completion.isCompleted;
  const unfinishedRows = isCompleted ? [] : rows.filter((row) => !isCompletedScheduleTask(row));
  const delayDays = forecastFinish ? Math.max(daysBetween(forecastFinish, plannedFinish), 0) : 0;
  const riskLevel = isCompleted ? "done" : groupMilestoneRisk(rows, delayDays);

  return {
    id: `modeling-milestone:${project.id}`,
    projectId: project.id,
    projectName: project.projectName,
    projectStage: project.currentStage ?? project.status,
    styleCount: project.styleCount ?? 0,
    plannedFinishDate: formatDate(plannedFinish) ?? "",
    forecastFinishDate: formatDate(forecastFinish),
    statusLabel: isCompleted ? "已完成" : "未完成",
    riskLevel,
    riskMessage: rows.find((row) => row.riskMessage?.trim())?.riskMessage ?? undefined,
    completedTaskCount: isCompleted ? rows.length : completedTaskCount,
    totalTaskCount: rows.length,
    unfinishedTaskNames: unfinishedRows.map((row) => row.taskName),
    delayDays,
    isCompleted,
  };
}

function buildModelingCompletionByProjectId(projects: ProjectRow[], rows: ScheduleTaskResultRow[]) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const rowsByProjectId = new Map<string, ScheduleTaskResultRow[]>();
  const completionByProjectId = new Map<string, ModelingMilestoneCompletion>();

  for (const row of rows) {
    const projectRows = rowsByProjectId.get(row.projectId) ?? [];
    projectRows.push(row);
    rowsByProjectId.set(row.projectId, projectRows);
  }

  for (const [projectId, projectRows] of rowsByProjectId) {
    const project = projectById.get(projectId);

    if (!project) {
      continue;
    }

    const completion = modelingMilestoneCompletion(project, projectRows);

    if (completion.isCompleted) {
      completionByProjectId.set(projectId, completion);
    }
  }

  return completionByProjectId;
}

function modelingMilestoneCompletion(project: ProjectRow, rows: ScheduleTaskResultRow[]): ModelingMilestoneCompletion {
  const completedTaskCount = rows.filter(isCompletedScheduleTask).length;
  const projectCompleted = isProjectPastModeling(project);
  const isCompleted = projectCompleted || (rows.length > 0 && completedTaskCount === rows.length);

  if (!isCompleted) {
    return { isCompleted: false, completionDate: null };
  }

  return {
    isCompleted: true,
    completionDate:
      maxDate(rows.map(completionDateForScheduleTask)) ??
      maxDate(rows.map((row) => row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate)),
  };
}

function isProjectPastModeling(project: ProjectRow) {
  const stageText = `${project.currentStage ?? ""} ${project.status ?? ""}`;
  return ["红蜡", "模具", "大货", "已完", "完结"].some((stage) => stageText.includes(stage));
}

function isCompletedScheduleTask(row: ScheduleTaskResultRow) {
  const raw = rawTaskResult(row.rawResult);

  if (dateFromRawValue(raw.actualFinishDate) || dateFromRawValue(raw.inferredCompletionDate) || raw.inferredCompleted === true) {
    return true;
  }

  return [row.displayStatus, row.taskActionType].some((value) => {
    if (!value) return false;
    return value.includes("已完成") || value.includes("已通过");
  });
}

function completionDateForScheduleTask(row: ScheduleTaskResultRow) {
  const raw = rawTaskResult(row.rawResult);

  return (
    dateFromRawValue(raw.actualFinishDate) ??
    dateFromRawValue(raw.inferredCompletionDate) ??
    row.forecastFinishDate ??
    row.expectedFinishDate ??
    row.plannedFinishDate
  );
}

function groupMilestoneRisk(rows: ScheduleTaskResultRow[], delayDays: number): ModelingMilestoneRiskLevel {
  if (rows.some((row) => row.riskLevel.includes("必然") || row.riskLevel.includes("严重") || row.riskLevel === "delay")) {
    return "delay";
  }

  if (rows.some((row) => row.riskLevel.includes("风险") || row.riskLevel === "risk") || delayDays > 0) {
    return "risk";
  }

  return "normal";
}

function buildRealTasks(
  rows: ModelingTaskRow[],
  projectById: Map<string, ProjectRow>,
  modelers: ModelerCapacity[],
  vendorById: Map<string, { id: string; name: string; stableCapacity: boolean }>,
  feedbackRows: FeedbackRow[],
  completedModelingByProjectId: Map<string, ModelingMilestoneCompletion>,
): ModelingTaskCard[] {
  const modelerById = new Map(modelers.map((modeler) => [modeler.id, modeler]));
  const latestFeedbackByTaskId = new Map<string, FeedbackRow>();
  const feedbackCountByTaskId = new Map<string, number>();

  for (const feedback of feedbackRows) {
    feedbackCountByTaskId.set(feedback.modelingTaskId, (feedbackCountByTaskId.get(feedback.modelingTaskId) ?? 0) + 1);

    if (!latestFeedbackByTaskId.has(feedback.modelingTaskId)) {
      latestFeedbackByTaskId.set(feedback.modelingTaskId, feedback);
    }
  }

  return rows.map((task) => {
    const project = projectById.get(task.projectId);
    const modeler = task.modelerId ? modelerById.get(task.modelerId) : undefined;
    const vendor = task.outsourceVendorId ? vendorById.get(task.outsourceVendorId) : undefined;
    const completion = completedModelingByProjectId.get(task.projectId);
    const isCompletedBySchedule = Boolean(completion);
    const status = isCompletedBySchedule ? "已通过" : normalizeStatus(task.status, task.isOutsourced);
    const latestFeedback = latestFeedbackByTaskId.get(task.id);
    const actualFinishDate = isCompletedBySchedule
      ? task.actualFinishDate ?? completion?.completionDate ?? task.plannedFinishDate
      : task.actualFinishDate;
    const lastUpdatedAt = isCompletedBySchedule ? actualFinishDate ?? task.lastUpdatedAt : task.lastUpdatedAt;
    const consumedWorkdays = task.actualWorkdays ?? consumedDays(task.actualStartDate ?? task.plannedStartDate, actualFinishDate);
    const staleDays = isCompletedBySchedule ? 0 : daysSince(lastUpdatedAt);

    return {
      id: task.id,
      projectId: task.projectId,
      projectTaskId: task.projectTaskId,
      projectName: project?.projectName ?? "未知项目",
      projectStage: project?.currentStage ?? project?.status ?? "待补充阶段",
      sourceStyleId: task.sourceStyleId ?? undefined,
      styleCode: task.styleCode,
      styleSequence: task.styleSequence ?? undefined,
      styleName: task.styleName || "待补充款式名",
      isFirstModelingStyle: task.isFirstModelingStyle,
      referenceImageUrls: referenceImagesFromJson(task.referenceImageUrls),
      status,
      difficulty: task.difficulty || "常规",
      estimatedWorkdays: task.estimatedWorkdays || 7,
      consumedWorkdays,
      originalArtStatus: isCompletedBySchedule ? "原画已过审" : task.originalArtStatus,
      originalArtApprovedDate: formatDate(task.originalArtApprovedDate),
      modelerId: task.modelerId ?? undefined,
      modelerName: modeler?.name,
      isOutsourced: task.isOutsourced,
      outsourceVendorId: task.outsourceVendorId ?? undefined,
      outsourceVendorName: vendor?.name,
      stableOutsourceCapacity: task.stableOutsourceCapacity ?? vendor?.stableCapacity ?? false,
      plannedStartDate: formatDate(task.plannedStartDate),
      plannedFinishDate: formatDate(task.plannedFinishDate),
      actualStartDate: formatDate(task.actualStartDate),
      actualFinishDate: formatDate(actualFinishDate),
      internalApprovedDate: formatDate(task.internalApprovedDate),
      copyrightApprovedDate: formatDate(task.copyrightApprovedDate),
      actualWorkMinutes: task.actualWorkMinutes,
      activeWorkStartedAt: formatDateTime(task.activeWorkStartedAt),
      remainingWorkdays: task.remainingWorkdays,
      notes: task.notes ?? undefined,
      feedbackCount: feedbackCountByTaskId.get(task.id) ?? 0,
      reviewRound: task.reviewRound ?? latestFeedback?.roundNo ?? 0,
      lastFeedbackAt: isCompletedBySchedule ? undefined : formatDate(task.lastFeedbackAt ?? latestFeedback?.feedbackAt),
      lastUpdatedAt: formatDate(lastUpdatedAt),
      staleDays,
      isStale: !isCompletedBySchedule && status === "建模中" && staleDays > 3,
      blockedDays: isCompletedBySchedule
        ? 0
        : (task.blockedDays ?? (reviewBlockedStatuses.has(status) ? Math.max(1, daysSince(task.lastFeedbackAt)) : 0)),
      blockType: isCompletedBySchedule ? undefined : (task.blockType ?? (reviewBlockedStatuses.has(status) ? (status === "待验收" ? "待产品美术验收" : "送审 / 反馈") : undefined)),
      latestFeedback: isCompletedBySchedule ? undefined : latestFeedback?.content,
      feedbackStatus: isCompletedBySchedule ? undefined : latestFeedback?.status,
      isVirtual: false,
      canDragAssign: !task.modelerId && !task.isOutsourced && status === "未分配" && !isCompletedBySchedule,
    };
  });
}

function buildVirtualTasks(
  projects: ProjectRow[],
  modelers: ModelerCapacity[],
  outsourceVendorName: string,
  completedModelingByProjectId = new Map<string, ModelingMilestoneCompletion>(),
): ModelingTaskCard[] {
  const today = startOfDay(new Date());
  const taskRows: ModelingTaskCard[] = [];

  projects
    .filter((project) => (project.styleCount ?? 0) > 0)
    .forEach((project, projectIndex) => {
      const styleCount = Math.min(Math.max(project.styleCount ?? 0, 0), 24);
      const stage = project.currentStage ?? project.status;
      const completion = completedModelingByProjectId.get(project.id);
      const isCompletedBySchedule = Boolean(completion);

      for (let index = 1; index <= styleCount; index += 1) {
        const status = isCompletedBySchedule ? "已通过" : virtualStatusForProject(stage, index);
        const difficulty = virtualDifficulty(project.projectName, index);
        const estimatedWorkdays = estimatedWorkdaysForDifficulty(difficulty);
        const assignedModeler =
          status === "未分配" || status === "外包中"
            ? undefined
            : modelers[(projectIndex + index + (index % 2 === 0 ? 0 : 1)) % modelers.length];
        const plannedStartDate = isCompletedBySchedule
          ? addCalendarDays(completion?.completionDate ?? today, -estimatedWorkdays)
          : virtualPlannedStartDate(today, projectIndex, index, status);
        const plannedFinishDate = isCompletedBySchedule ? (completion?.completionDate ?? today) : addWorkdays(plannedStartDate, estimatedWorkdays);
        const actualFinishDate = status === "已通过" ? plannedFinishDate : undefined;
        const lastUpdatedAt = isCompletedBySchedule ? actualFinishDate : virtualLastUpdatedAt(today, index, status);
        const lastFeedbackAt = reviewBlockedStatuses.has(status) ? addCalendarDays(today, -Math.max(2, (index % 6) + 2)) : undefined;
        const consumedWorkdays =
          status === "未分配" ? 0 : consumedDays(plannedStartDate, actualFinishDate) || Math.min(estimatedWorkdays, index + 1);

        taskRows.push({
          id: `virtual-${project.id}-${index}`,
          projectId: project.id,
          projectTaskId: `${project.id}-modeling-task`,
          projectName: project.projectName,
          projectStage: stage,
          sourceStyleId: undefined,
          styleCode: `${project.id}-S${String(index).padStart(2, "0")}`,
          styleSequence: String(index),
          styleName: `待补充款式名 ${String(index).padStart(2, "0")}`,
          isFirstModelingStyle: index === 1,
          referenceImageUrls: [],
          status,
          difficulty,
          estimatedWorkdays,
          consumedWorkdays,
          originalArtStatus: isCompletedBySchedule || !(stage === "原画" || stage === "企划立项") ? "原画已过审" : "原画未过审",
          originalArtApprovedDate:
            !isCompletedBySchedule && (stage === "原画" || stage === "企划立项")
              ? undefined
              : formatDate(addCalendarDays(plannedStartDate, -5)),
          modelerId: assignedModeler?.id,
          modelerName: assignedModeler?.name,
          isOutsourced: status === "外包中",
          outsourceVendorId: status === "外包中" ? "virtual-vendor" : undefined,
          outsourceVendorName: status === "外包中" ? outsourceVendorName : undefined,
          stableOutsourceCapacity: status === "外包中",
          plannedStartDate: status === "未分配" ? undefined : formatDate(plannedStartDate),
          plannedFinishDate: status === "未分配" ? undefined : formatDate(plannedFinishDate),
          actualStartDate: status === "未分配" ? undefined : formatDate(plannedStartDate),
          actualFinishDate: formatDate(actualFinishDate),
          actualWorkMinutes: consumedWorkdays * 480,
          activeWorkStartedAt: undefined,
          feedbackCount: reviewBlockedStatuses.has(status) ? Math.max(1, index % 4) : 0,
          reviewRound: reviewBlockedStatuses.has(status) ? Math.max(1, index % 4) : 0,
          lastFeedbackAt: formatDate(lastFeedbackAt),
          lastUpdatedAt: formatDate(lastUpdatedAt),
          staleDays: daysSince(lastUpdatedAt),
          isStale: !isCompletedBySchedule && status === "建模中" && daysSince(lastUpdatedAt) > 3,
          blockedDays: !isCompletedBySchedule && reviewBlockedStatuses.has(status) ? Math.max(1, daysSince(lastFeedbackAt)) : 0,
          blockType: !isCompletedBySchedule && reviewBlockedStatuses.has(status) ? (status === "待验收" ? "待产品美术验收" : status === "等反馈" ? "等版权方反馈" : "送审中") : undefined,
          latestFeedback: !isCompletedBySchedule && reviewBlockedStatuses.has(status) ? (status === "待验收" ? "虚拟提交：建模师已提交成果，等待产品美术验收。" : "虚拟反馈：待补充检修问题与版权方意见。") : undefined,
          feedbackStatus: !isCompletedBySchedule && reviewBlockedStatuses.has(status) ? "待处理" : undefined,
          isVirtual: true,
          canDragAssign: status === "未分配" && !isCompletedBySchedule,
        });
      }
    });

  return taskRows;
}

function buildProjectSummaries(
  projects: ProjectRow[],
  tasks: ModelingTaskCard[],
  progressRows: Array<{
    projectId: string;
    totalRequiredStyles: number;
    approvedStyles: number;
    inProgressStyles: number;
    submittedStyles: number;
    outsourcedStyles: number;
    unassignedStyles: number;
    progressPercent: number;
  }>,
  isVirtual: boolean,
  completedModelingByProjectId = new Map<string, ModelingMilestoneCompletion>(),
): ProjectModelingSummary[] {
  const progressByProjectId = new Map(progressRows.map((progress) => [progress.projectId, progress]));

  return projects
    .filter((project) => {
      const hasModelingTasks = tasks.some((task) => task.projectId === project.id && !preConfirmationStatuses.has(task.status));

      if (!isVirtual) {
        return hasModelingTasks || progressByProjectId.has(project.id);
      }

      return (project.styleCount ?? 0) > 0 || hasModelingTasks;
    })
    .map((project) => {
      const progress = progressByProjectId.get(project.id);
      const projectTasks = tasks.filter((task) => task.projectId === project.id && !preConfirmationStatuses.has(task.status));
      const isCompletedBySchedule = completedModelingByProjectId.has(project.id);

      if (isCompletedBySchedule) {
        const totalStyles = projectTasks.length || progress?.totalRequiredStyles || project.styleCount || 0;

        return {
          projectId: project.id,
          projectName: project.projectName,
          currentStage: project.currentStage ?? project.status,
          plannedLaunchDate: formatDate(project.plannedLaunchDate) ?? "",
          totalStyles,
          approvedStyles: totalStyles,
          inProgressStyles: 0,
          submittedStyles: 0,
          outsourcedStyles: 0,
          unassignedStyles: 0,
          progressPercent: 100,
          isVirtual: isVirtual && projectTasks.length > 0,
        };
      }

      if (projectTasks.length > 0) {
        const totalStyles = projectTasks.length;
        const approvedStyles = projectTasks.filter((task) => task.status === "已通过").length;
        const inProgressStyles = projectTasks.filter((task) => task.status === "已排期" || task.status === "排队中" || task.status === "建模中" || task.status === "修改中").length;
        const submittedStyles = projectTasks.filter((task) => task.status === "待验收" || task.status === "已送审" || task.status === "等反馈").length;
        const outsourcedStyles = projectTasks.filter((task) => task.status === "外包中" || task.isOutsourced).length;
        const unassignedStyles = projectTasks.filter((task) => task.status === "未分配" && !task.modelerId && !task.isOutsourced).length;

        return {
          projectId: project.id,
          projectName: project.projectName,
          currentStage: project.currentStage ?? project.status,
          plannedLaunchDate: formatDate(project.plannedLaunchDate) ?? "",
          totalStyles,
          approvedStyles,
          inProgressStyles,
          submittedStyles,
          outsourcedStyles,
          unassignedStyles,
          progressPercent: totalStyles > 0 ? Math.round((approvedStyles / totalStyles) * 100) : 0,
          isVirtual,
        };
      }

      if (progress && !isVirtual) {
        return {
          projectId: project.id,
          projectName: project.projectName,
          currentStage: project.currentStage ?? project.status,
          plannedLaunchDate: formatDate(project.plannedLaunchDate) ?? "",
          totalStyles: progress.totalRequiredStyles,
          approvedStyles: progress.approvedStyles,
          inProgressStyles: progress.inProgressStyles,
          submittedStyles: progress.submittedStyles,
          outsourcedStyles: progress.outsourcedStyles,
          unassignedStyles: progress.unassignedStyles,
          progressPercent: progress.progressPercent,
          isVirtual: false,
        };
      }

      const totalStyles = projectTasks.length;
      const approvedStyles = projectTasks.filter((task) => task.status === "已通过").length;
      const inProgressStyles = projectTasks.filter((task) => task.status === "已排期" || task.status === "排队中" || task.status === "建模中" || task.status === "修改中").length;
      const submittedStyles = projectTasks.filter((task) => task.status === "待验收" || task.status === "已送审" || task.status === "等反馈").length;
      const outsourcedStyles = projectTasks.filter((task) => task.status === "外包中" || task.isOutsourced).length;
      const unassignedStyles = projectTasks.filter((task) => task.status === "未分配" && !task.modelerId && !task.isOutsourced).length;

      return {
        projectId: project.id,
        projectName: project.projectName,
        currentStage: project.currentStage ?? project.status,
        plannedLaunchDate: formatDate(project.plannedLaunchDate) ?? "",
        totalStyles,
        approvedStyles,
        inProgressStyles,
        submittedStyles,
        outsourcedStyles,
        unassignedStyles,
        progressPercent: totalStyles > 0 ? Math.round((approvedStyles / totalStyles) * 100) : 0,
        isVirtual,
      };
    });
}

function buildMetrics(tasks: ModelingTaskCard[], modelers: ModelerCapacity[]): ModelingMetric[] {
  const overloadedModelerCount = modelers.filter((modeler) => assignedActiveTasks(tasks, modeler.id).length > 4).length;
  const stuckTasks = tasks.filter((task) => task.status === "修改中" || reviewBlockedStatuses.has(task.status) || Boolean(task.blockType));

  return [
    {
      label: "建模任务总数",
      value: tasks.length,
      helper: "按款式统计，虚拟款式会标注",
      tone: "neutral",
    },
    {
      label: "未分配款式数",
      value: tasks.filter((task) => task.status === "未分配" && !task.modelerId && !task.isOutsourced).length,
      helper: "负责人待手动录入",
      tone: "warning",
    },
    {
      label: "超载建模师数",
      value: overloadedModelerCount,
      helper: "排队款式超过 4 个",
      tone: overloadedModelerCount > 0 ? "danger" : "neutral",
    },
    {
      label: "待验收 / 送审卡住",
      value: stuckTasks.length,
      helper: "待验收、已送审、等反馈或修改阻塞",
      tone: stuckTasks.length > 0 ? "danger" : "info",
    },
  ];
}

function assignedActiveTasks(tasks: ModelingTaskCard[], modelerId: string) {
  return tasks.filter((task) => task.modelerId === modelerId && activeQueueStatuses.has(task.status));
}

function normalizeStatus(value: string, isOutsourced: boolean): ModelingTaskStatus {
  if (isOutsourced && (value === "已排期" || value === "排队中" || value === "建模中" || value === "进行中")) {
    return "外包中";
  }

  if (statusColumns.includes(value as ModelingTaskStatus)) {
    return value as ModelingTaskStatus;
  }

  if (value.includes("退回")) return "退回补充";
  if (value.includes("待确认")) return "待确认";
  if (value.includes("未启动")) return "未启动";
  if (value.includes("未分配")) return "未分配";
  if (value.includes("排队")) return "排队中";
  if (value.includes("排期")) return "已排期";
  if (value.includes("修改")) return "修改中";
  if (value.includes("建模中") || value.includes("进行中")) return "建模中";
  if (value.includes("待验收") || value.includes("待内审") || value.includes("待审核")) return "待验收";
  if (value.includes("待送审")) return "待送审";
  if (value.includes("送审")) return "已送审";
  if (value.includes("反馈")) return "等反馈";
  if (value.includes("通过") || value.includes("完成")) return "已通过";
  if (value.includes("外包")) return "外包中";
  if (value.includes("暂停")) return "暂停";
  if (value.includes("取消")) return "取消";

  return "未分配";
}

function virtualStatusForProject(stage: string, styleIndex: number): ModelingTaskStatus {
  if (stage === "已完结" || stage === "大货生产" || stage === "模具开发" || stage === "红蜡") {
    return "已通过";
  }

  if (stage === "3D建模") {
    if (styleIndex % 7 === 0) return "外包中";
    if (styleIndex % 5 === 0) return "等反馈";
    if (styleIndex % 4 === 0) return "已送审";
    if (styleIndex % 3 === 0) return "建模中";
    return "已排期";
  }

  if (stage === "原画") {
    return "未分配";
  }

  return "未分配";
}

function virtualDifficulty(projectName: string, styleIndex: number) {
  if (projectName.includes("正比例") || styleIndex % 11 === 0) return "困难正比例";
  if (styleIndex % 6 === 0) return "换色款";
  if (styleIndex % 4 === 0) return "简单款";
  return "常规款";
}

function estimatedWorkdaysForDifficulty(difficulty: string) {
  if (difficulty === "换色款") return 1;
  if (difficulty === "简单款") return 4;
  if (difficulty === "困难正比例") return 20;
  return 7;
}

function virtualPlannedStartDate(today: Date, projectIndex: number, styleIndex: number, status: ModelingTaskStatus) {
  if (status === "已通过") {
    return addCalendarDays(today, -35 - (projectIndex % 12) - (styleIndex % 4));
  }

  if (status === "未分配") {
    return addCalendarDays(today, 3 + (styleIndex % 7));
  }

  return addCalendarDays(today, -((projectIndex % 5) + styleIndex + 1));
}

function virtualLastUpdatedAt(today: Date, styleIndex: number, status: ModelingTaskStatus) {
  if (status === "建模中") {
    return addCalendarDays(today, -(styleIndex % 2 === 0 ? 4 : 2));
  }

  if (reviewBlockedStatuses.has(status)) {
    return addCalendarDays(today, -Math.max(2, (styleIndex % 6) + 2));
  }

  if (status === "已通过") {
    return addCalendarDays(today, -20 - (styleIndex % 8));
  }

  return addCalendarDays(today, -(styleIndex % 3));
}

function consumedDays(startDate?: Date | null, finishDate?: Date | null) {
  if (!isValidDate(startDate)) {
    return 0;
  }

  return workdaysBetween(startDate, isValidDate(finishDate) ? finishDate : new Date());
}

function maxDate(values: Array<Date | null | undefined>) {
  const dates = values.filter(isValidDate);

  if (dates.length === 0) {
    return null;
  }

  return dates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest), dates[0]);
}

function rawTaskResult(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function referenceImagesFromJson(value: unknown): ModelingReferenceImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url.trim() : "";

      if (!url) {
        return null;
      }

      const image: ModelingReferenceImage = { url };
      const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "";
      const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : "";

      if (name) image.name = name;
      if (type) image.type = type;

      return image;
    })
    .filter((item): item is ModelingReferenceImage => item !== null);
}

function dateFromRawValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function daysBetween(later: Date, earlier: Date) {
  if (!isValidDate(later) || !isValidDate(earlier)) {
    return 0;
  }

  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / 86_400_000);
}

function dateToMonthPoint(date: Date) {
  const safeDate = isValidDate(date) ? date : new Date();

  return {
    year: safeDate.getUTCFullYear(),
    month: safeDate.getUTCMonth() + 1,
  };
}

function dateStringToMonthPoint(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return dateToMonthPoint(Number.isNaN(date.getTime()) ? new Date() : date);
}

function addMonths(monthPoint: { year: number; month: number }, offset: number) {
  const monthIndex = monthPoint.year * 12 + (monthPoint.month - 1) + offset;

  return {
    year: Math.floor(monthIndex / 12),
    month: (monthIndex % 12) + 1,
  };
}

function compareMonthPoint(a: { year: number; month: number }, b: { year: number; month: number }) {
  return a.year === b.year ? a.month - b.month : a.year - b.year;
}

function formatMonthLabel(monthPoint: { year: number; month: number }) {
  return `${String(monthPoint.year).slice(2)}年${monthPoint.month}月`;
}

function daysSince(date?: Date | null) {
  if (!isValidDate(date)) {
    return 0;
  }

  const start = startOfDay(date).getTime();
  const end = startOfDay(new Date()).getTime();

  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function workdaysBetween(startDate: Date, finishDate: Date) {
  if (!isValidDate(startDate) || !isValidDate(finishDate)) {
    return 0;
  }

  const start = startOfDay(startDate);
  const finish = startOfDay(finishDate);

  if (finish.getTime() < start.getTime()) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);

  while (cursor.getTime() <= finish.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

function addWorkdays(date: Date, workdays: number) {
  const result = new Date(isValidDate(date) ? date : new Date());
  let remaining = Math.max(1, workdays) - 1;

  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return result;
}

function addCalendarDays(date: Date, days: number) {
  const result = new Date(isValidDate(date) ? date : new Date());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfDay(date: Date) {
  if (!isValidDate(date)) {
    return startOfDay(new Date());
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function formatDate(date?: Date | null) {
  return isValidDate(date) ? date.toISOString().slice(0, 10) : undefined;
}

function formatDateTime(date?: Date | null) {
  return isValidDate(date) ? date.toISOString() : undefined;
}

function isValidDate(date?: Date | null): date is Date {
  return date instanceof Date && Number.isFinite(date.getTime());
}

function buildFallbackProjects(): ProjectRow[] {
  const today = startOfDay(new Date());

  return [
    {
      id: "fallback-bird-4",
      projectName: "小鸟4代",
      styleCount: 6,
      currentStage: "3D建模",
      status: "3D建模",
      plannedLaunchDate: addCalendarDays(today, 40),
    },
    {
      id: "fallback-bear",
      projectName: "自嘲熊",
      styleCount: 4,
      currentStage: "原画",
      status: "原画",
      plannedLaunchDate: addCalendarDays(today, 70),
    },
    {
      id: "fallback-cat",
      projectName: "猫福珊迪2",
      styleCount: 8,
      currentStage: "3D建模",
      status: "3D建模",
      plannedLaunchDate: addCalendarDays(today, 90),
    },
  ];
}
