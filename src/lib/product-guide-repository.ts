import "server-only";

import { prisma } from "@/lib/db/prisma";
import type {
  ProductGuideData,
  ProductGuideDueBucket,
  ProductGuideFilterOption,
  ProductGuideItem,
  ProductGuideMilestoneBoard,
  ProductGuideMilestoneCard,
  ProductGuideMetric,
  ProductGuideRecentUpdate,
  ProductGuideRiskLevel,
  ProductGuideStyleSummary,
} from "@/lib/product-guide-types";
import { isKnownMilestone, milestoneByTaskNo } from "@/lib/schedule-domain";
import { getScheduleWorkbenchData } from "@/lib/schedule-repository";
import type { ScheduleWorkbenchData } from "@/lib/sample-schedule";

type ProjectRow = {
  id: string;
  projectName: string;
  styleCount: number | null;
  plannedLaunchDate: Date;
  projectTeamId: string | null;
  projectOwnerId: string | null;
  artOwnerId: string | null;
  currentStage: string | null;
  status: string;
  updatedAt: Date;
};

type TeamRow = {
  id: string;
  name: string;
};

type UserRow = {
  id: string;
  name: string;
  teamId: string | null;
  departmentTeamId: string | null;
  projectGroupTeamId: string | null;
  roleTitle: string | null;
  businessRoles: unknown;
  status: string;
};

type ProjectResultRow = {
  projectId: string;
  plannedLaunchDate: Date;
  forecastLaunchDate: Date | null;
  delayDays: number | null;
  riskLevel: string;
  currentTaskId: string | null;
  currentTaskName: string | null;
  riskMessage: string | null;
  projectProgressPercent: number | null;
  blockedTaskCount: number | null;
  staleTaskCount: number | null;
  rawResult: unknown;
};

type ScheduleTaskResultRow = {
  id: string;
  projectId: string;
  projectTaskId: string;
  taskNo: number;
  taskName: string;
  milestoneType: string;
  plannedFinishDate: Date | null;
  forecastFinishDate: Date | null;
  expectedFinishDate: Date | null;
  taskActionType: string | null;
  displayStatus: string | null;
  delayDays: number | null;
  riskLevel: string;
  riskMessage: string | null;
  rawResult: unknown;
};

type ProjectTaskRow = {
  id: string;
  projectId: string;
  taskNo: number;
  taskName: string;
  milestoneType: string;
  ownerId: string | null;
  plannedFinishDate: Date | null;
  actualFinishDate: Date | null;
  expectedFinishDate: Date | null;
  status: string;
  isBlocked: boolean;
  blockReason: string | null;
  progressNote: string | null;
  lastUpdatedAt: Date | null;
  updatedAt: Date;
};

type ModelingProgressRow = {
  projectId: string;
  totalRequiredStyles: number;
  approvedStyles: number;
  inProgressStyles: number;
  submittedStyles: number;
  outsourcedStyles: number;
  unassignedStyles: number;
  progressPercent: number;
  projectedAllApprovedDate: Date | null;
  lastCalculatedAt: Date;
};

type ModelingTaskRow = {
  id: string;
  projectId: string;
  projectTaskId: string;
  styleCode: string;
  styleName: string;
  isRequired: boolean;
  originalArtStatus: string;
  originalArtApprovedDate: Date | null;
  difficulty: string;
  estimatedWorkdays: number;
  modelerId: string | null;
  isOutsourced: boolean;
  outsourceVendorId: string | null;
  plannedFinishDate: Date | null;
  actualFinishDate: Date | null;
  status: string;
  reviewRound: number | null;
  lastFeedbackAt: Date | null;
  blockedDays: number | null;
  blockType: string | null;
  lastUpdatedAt: Date | null;
  updatedAt: Date;
};

type ModelingFeedbackRow = {
  modelingTaskId: string;
  feedbackType: string;
  content: string;
  feedbackAt: Date;
  status: string;
};

type ProgressUpdateRow = {
  id: string;
  projectId: string;
  projectTaskId: string;
  updateType: string;
  newValue: unknown;
  note: string | null;
  updatedByName: string | null;
  createdAt: Date;
};

type AlertRow = {
  id: string;
  alertType: string;
  severity: string;
  projectId: string | null;
  projectTaskId: string | null;
  modelingTaskId: string | null;
  userId: string | null;
  title: string;
  message: string;
  status: string;
  ownerId: string | null;
  createdAt: Date;
};

type WorkTaskRow = {
  id: string;
  sourceType: string;
  projectId: string | null;
  projectTaskId: string | null;
  modelingTaskId: string | null;
  taskTitle: string;
  taskGroup: string;
  ownerId: string | null;
  expectedFinishDate: Date | null;
  forecastDeadline: Date | null;
  riskLevel: string;
  riskMessage: string | null;
  status: string;
  actionRequired: string | null;
  updatedAt: Date;
};

type RefLabel = {
  key: string;
  label: string;
};

type ContextMaps = {
  teamById: Map<string, TeamRow>;
  userById: Map<string, UserRow>;
  taskById: Map<string, ProjectTaskRow>;
  projectResultById: Map<string, ProjectResultRow>;
  modelingProgressByProjectId: Map<string, ModelingProgressRow>;
  recentUpdatesByProjectId: Map<string, ProductGuideRecentUpdate[]>;
  recentUpdatesByTaskId: Map<string, ProductGuideRecentUpdate[]>;
};

const keyPathTaskNos = new Set([6, 7, 8, 9, 10, 11, 14, 15, 17, 18, 21, 22, 23, 24, 25, 26, 27, 30]);

const riskLabel: Record<ProductGuideRiskLevel, string> = {
  normal: "正常推进",
  watch: "需关注",
  risk: "延期风险",
  delay: "必然延期",
};

export async function getProductGuideData(): Promise<ProductGuideData> {
  try {
    const [projects, teams, users, latestRun, scheduleData] = await Promise.all([
      prisma.project.findMany({
        orderBy: [{ plannedLaunchDate: "asc" }, { id: "asc" }],
        take: 300,
        select: {
          id: true,
          projectName: true,
          styleCount: true,
          plannedLaunchDate: true,
          projectTeamId: true,
          projectOwnerId: true,
          artOwnerId: true,
          currentStage: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.team.findMany({
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          teamId: true,
          departmentTeamId: true,
          projectGroupTeamId: true,
          roleTitle: true,
          businessRoles: true,
          status: true,
        },
      }),
      prisma.scheduleRun.findFirst({
        where: { runStatus: "成功" },
        orderBy: { calculatedAt: "desc" },
      }),
      getScheduleWorkbenchData(),
    ]);

    if (projects.length === 0) {
      return buildFallbackData();
    }

    const projectIds = projects.map((project) => project.id);
    const [projectResults, taskResults, projectTasks, modelingProgress, modelingTasks, alerts, workTasks, progressUpdates] =
      await Promise.all([
        latestRun
          ? prisma.scheduleProjectResult.findMany({
              where: { scheduleRunId: latestRun.id, projectId: { in: projectIds } },
              select: {
                projectId: true,
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
                rawResult: true,
              },
            })
          : Promise.resolve([] as ProjectResultRow[]),
        latestRun
          ? prisma.scheduleTaskResult.findMany({
              where: { scheduleRunId: latestRun.id, projectId: { in: projectIds } },
              orderBy: [{ projectId: "asc" }, { taskNo: "asc" }],
              select: {
                id: true,
                projectId: true,
                projectTaskId: true,
                taskNo: true,
                taskName: true,
                milestoneType: true,
                plannedFinishDate: true,
                forecastFinishDate: true,
                expectedFinishDate: true,
                taskActionType: true,
                displayStatus: true,
                delayDays: true,
                riskLevel: true,
                riskMessage: true,
                rawResult: true,
              },
            })
          : Promise.resolve([] as ScheduleTaskResultRow[]),
        prisma.projectTask.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: [{ projectId: "asc" }, { taskNo: "asc" }],
          select: {
            id: true,
            projectId: true,
            taskNo: true,
            taskName: true,
            milestoneType: true,
            ownerId: true,
            plannedFinishDate: true,
            actualFinishDate: true,
            expectedFinishDate: true,
            status: true,
            isBlocked: true,
            blockReason: true,
            progressNote: true,
            lastUpdatedAt: true,
            updatedAt: true,
          },
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
            progressPercent: true,
            projectedAllApprovedDate: true,
            lastCalculatedAt: true,
          },
        }),
        prisma.modelingTask.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: [{ updatedAt: "desc" }],
          take: 1200,
          select: {
            id: true,
            projectId: true,
            projectTaskId: true,
            styleCode: true,
            styleName: true,
            isRequired: true,
            originalArtStatus: true,
            originalArtApprovedDate: true,
            difficulty: true,
            estimatedWorkdays: true,
            modelerId: true,
            isOutsourced: true,
            outsourceVendorId: true,
            plannedFinishDate: true,
            actualFinishDate: true,
            status: true,
            reviewRound: true,
            lastFeedbackAt: true,
            blockedDays: true,
            blockType: true,
            lastUpdatedAt: true,
            updatedAt: true,
          },
        }),
        prisma.alert.findMany({
          where: {
            projectId: { in: projectIds },
            status: { not: "已处理" },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 300,
          select: {
            id: true,
            alertType: true,
            severity: true,
            projectId: true,
            projectTaskId: true,
            modelingTaskId: true,
            userId: true,
            title: true,
            message: true,
            status: true,
            ownerId: true,
            createdAt: true,
          },
        }),
        prisma.workTask.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: [{ updatedAt: "desc" }],
          take: 500,
          select: {
            id: true,
            sourceType: true,
            projectId: true,
            projectTaskId: true,
            modelingTaskId: true,
            taskTitle: true,
            taskGroup: true,
            ownerId: true,
            expectedFinishDate: true,
            forecastDeadline: true,
            riskLevel: true,
            riskMessage: true,
            status: true,
            actionRequired: true,
            updatedAt: true,
          },
        }),
        prisma.progressUpdate.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: [{ createdAt: "desc" }],
          take: 900,
          select: {
            id: true,
            projectId: true,
            projectTaskId: true,
            updateType: true,
            newValue: true,
            note: true,
            updatedByName: true,
            createdAt: true,
          },
        }),
      ]);

    const latestFeedbackByTaskId = await getLatestModelingFeedbackByTaskId(modelingTasks.map((task) => task.id));
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const maps: ContextMaps = {
      teamById: new Map(teams.map((team) => [team.id, team])),
      userById: new Map(users.map((user) => [user.id, user])),
      taskById: new Map(projectTasks.map((task) => [task.id, task])),
      projectResultById: new Map(projectResults.map((result) => [result.projectId, result])),
      modelingProgressByProjectId: new Map(modelingProgress.map((progress) => [progress.projectId, progress])),
      recentUpdatesByProjectId: groupRecentUpdates(progressUpdates, "projectId"),
      recentUpdatesByTaskId: groupRecentUpdates(progressUpdates, "projectTaskId"),
    };
    const itemsById = new Map<string, ProductGuideItem>();

    for (const row of taskResults) {
      const project = projectById.get(row.projectId);
      if (!project || isCompletedProject(project, maps.projectResultById.get(project.id))) {
        continue;
      }

      const result = maps.projectResultById.get(project.id);
      const task = maps.taskById.get(row.projectTaskId);
      if (isCompletedScheduleTask(row, task)) {
        continue;
      }

      const riskLevel = toGuideRiskLevel(row.riskLevel, row.delayDays);
      const dueDate = firstDate(row.plannedFinishDate, row.expectedFinishDate, task?.expectedFinishDate, row.forecastFinishDate);
      const lastUpdatedAt = task?.lastUpdatedAt ?? task?.updatedAt ?? undefined;
      const staleDays = daysSince(task?.lastUpdatedAt);
      const isStale = staleDays > 3;
      const isCurrentTask = Boolean(
        (result?.currentTaskId && result.currentTaskId === row.projectTaskId) ||
          (result?.currentTaskName && result.currentTaskName === row.taskName),
      );
      const isKeyPath = isCurrentTask || (keyPathTaskNos.has(row.taskNo) && isWithinActionWindow(dueDate, 7, 14));
      const isNearRisk = isHighRisk(riskLevel) && (isCurrentTask || Boolean(task?.isBlocked) || isWithinActionWindow(dueDate, 7, 21));
      const shouldShow = isNearRisk || isStale || isKeyPath || Boolean(task?.isBlocked);

      if (!shouldShow) {
        continue;
      }

      addOrMergeItem(
        itemsById,
        buildScheduleTaskItem({
          project,
          result,
          task,
          row,
          maps,
          riskLevel: isNearRisk ? riskLevel : isStale || task?.isBlocked ? "watch" : "normal",
          dueDate,
          lastUpdatedAt,
          staleDays,
          isStale,
          isKeyPath,
        }),
      );
    }

    for (const result of projectResults) {
      const project = projectById.get(result.projectId);
      if (!project || isCompletedProject(project, result)) {
        continue;
      }

      const riskLevel = toGuideRiskLevel(result.riskLevel, result.delayDays);
      if (!isHighRisk(riskLevel)) {
        continue;
      }

      const currentTask =
        (result.currentTaskId ? maps.taskById.get(result.currentTaskId) : undefined) ??
        projectTasks.find((task) => task.projectId === project.id && task.taskName === result.currentTaskName);
      const id = currentTask ? `task:${currentTask.id}` : `project-risk:${project.id}`;

      addOrMergeItem(
        itemsById,
        buildProjectRiskItem({
          id,
          project,
          result,
          task: currentTask,
          maps,
          riskLevel,
        }),
      );
    }

    for (const task of projectTasks) {
      const project = projectById.get(task.projectId);
      if (!project || isCompletedProject(project, maps.projectResultById.get(project.id)) || isCompletedProjectTask(task)) {
        continue;
      }

      const staleDays = daysSince(task.lastUpdatedAt);
      const isStale = staleDays > 3;
      const shouldShow = task.isBlocked || isStale;

      if (!shouldShow) {
        continue;
      }

      addOrMergeItem(
        itemsById,
        buildProjectTaskItem({
          project,
          result: maps.projectResultById.get(project.id),
          task,
          maps,
          riskLevel: task.isBlocked ? "risk" : "watch",
          staleDays,
          isStale,
        }),
      );
    }

    for (const task of workTasks) {
      if (!task.projectId || isDoneText(task.status)) {
        continue;
      }

      const project = projectById.get(task.projectId);
      if (!project || isCompletedProject(project, maps.projectResultById.get(project.id))) {
        continue;
      }

      const dueDate = task.expectedFinishDate ?? task.forecastDeadline ?? undefined;
      const riskLevel = toGuideRiskLevel(task.riskLevel);
      const shouldShow = isHighRisk(riskLevel) || Boolean(task.actionRequired) || isWithinNextDays(dueDate, 7);

      if (!shouldShow) {
        continue;
      }

      addOrMergeItem(
        itemsById,
        buildWorkTaskItem({
          project,
          workTask: task,
          maps,
          riskLevel: isHighRisk(riskLevel) ? riskLevel : "watch",
        }),
      );
    }

    for (const alert of alerts) {
      if (!alert.projectId || isDoneText(alert.status)) {
        continue;
      }

      const project = projectById.get(alert.projectId);
      if (!project || isCompletedProject(project, maps.projectResultById.get(project.id))) {
        continue;
      }

      addOrMergeItem(itemsById, buildAlertItem({ project, alert, maps }));
    }

    for (const progress of modelingProgress) {
      const project = projectById.get(progress.projectId);
      if (!project || isCompletedProject(project, maps.projectResultById.get(project.id)) || isProjectPastModeling(project)) {
        continue;
      }

      if (progress.unassignedStyles > 0) {
        addOrMergeItem(
          itemsById,
          buildModelingProgressItem({
            project,
            progress,
            maps,
            kind: "unassigned",
          }),
        );
      }

      if (progress.submittedStyles > 0) {
        addOrMergeItem(
          itemsById,
          buildModelingProgressItem({
            project,
            progress,
            maps,
            kind: "submitted",
          }),
        );
      }
    }

    for (const modelingTask of modelingTasks) {
      const project = projectById.get(modelingTask.projectId);
      if (!project || isCompletedProject(project, maps.projectResultById.get(project.id)) || isProjectPastModeling(project)) {
        continue;
      }

      const status = normalizeModelingStatus(modelingTask.status, modelingTask.isOutsourced);
      const staleDays = daysSince(modelingTask.lastUpdatedAt);
      const isStale = status === "建模中" && staleDays > 3;
      const needsArtReview = status === "待验收" || status === "已送审" || status === "等反馈" || status.includes("修改");
      const isUnassigned = status === "未分配";
      const isBlocked = needsArtReview || Boolean(modelingTask.blockedDays && modelingTask.blockedDays > 0);

      if (!isUnassigned && !needsArtReview && !isStale && !isBlocked) {
        continue;
      }

      addOrMergeItem(
        itemsById,
        buildModelingTaskItem({
          project,
          modelingTask,
          maps,
          status,
          staleDays,
          isStale,
        }),
      );
    }

    const items = Array.from(itemsById.values()).sort(sortGuideItems);
    const milestoneBoard = buildMilestoneBoard(scheduleData, projectById, maps.teamById);

    return {
      sourceLabel: latestRun ? "数据库聚合" : "数据库项目",
      generatedAt: new Date().toISOString(),
      metrics: buildMetrics(items),
      milestoneBoard,
      filters: buildFilters(items, users, teams, milestoneBoard.cards),
      items,
      styleSummaries: buildStyleSummaries(modelingTasks, latestFeedbackByTaskId),
    };
  } catch (error) {
    console.error("Failed to build product guide data", error);
    return buildFallbackData();
  }
}

function buildScheduleTaskItem({
  project,
  result,
  task,
  row,
  maps,
  riskLevel,
  dueDate,
  lastUpdatedAt,
  staleDays,
  isStale,
  isKeyPath,
}: {
  project: ProjectRow;
  result: ProjectResultRow | undefined;
  task: ProjectTaskRow | undefined;
  row: ScheduleTaskResultRow;
  maps: ContextMaps;
  riskLevel: ProductGuideRiskLevel;
  dueDate: Date | undefined;
  lastUpdatedAt: Date | undefined;
  staleDays: number;
  isStale: boolean;
  isKeyPath: boolean;
}): ProductGuideItem {
  const projectRefs = projectReference(project, maps);
  const taskOwner = personRef(task?.ownerId, maps.userById, "待补充负责人");
  const progress = modelingSummary(project.id, maps);
  const statusLabel = task?.status ?? row.displayStatus ?? row.taskActionType ?? "未完成";
  const reasonTags = [
    isHighRisk(riskLevel) ? riskLabel[riskLevel] : null,
    isStale ? "超 3 天未更新" : null,
    task?.isBlocked ? "任务阻塞" : null,
    isKeyPath ? "关键路径" : null,
  ].filter(isString);
  const suggestion = taskSuggestion({ row, task, result, riskLevel, isStale });
  const riskCopy = row.riskMessage ?? result?.riskMessage ?? riskCopyForLevel(project.projectName, riskLevel, isStale);

  return {
    id: `task:${row.projectTaskId}`,
    source: "schedule-task",
    projectId: project.id,
    projectName: project.projectName,
    ...projectRefs,
    taskId: row.projectTaskId,
    taskName: row.taskName,
    milestone: normalizeMilestone(row.milestoneType, row.taskNo),
    ownerKey: taskOwner.key,
    ownerName: taskOwner.label,
    plannedFinishDate: formatDate(row.plannedFinishDate ?? task?.plannedFinishDate),
    forecastFinishDate: formatDate(row.forecastFinishDate ?? row.expectedFinishDate ?? task?.expectedFinishDate),
    actualFinishDate: formatDate(task?.actualFinishDate ?? completionDateForRaw(row.rawResult)),
    statusLabel,
    riskLevel,
    riskLabel: riskLabel[riskLevel],
    suggestion,
    lastUpdatedAt: formatDate(lastUpdatedAt),
    staleDays,
    isStale,
    isBlocked: Boolean(task?.isBlocked),
    requiresArtReview: isModelingArtReviewTask(row.taskName, statusLabel),
    waitingLicensor: isWaitingLicensorText(`${row.taskName} ${row.riskMessage ?? ""} ${task?.progressNote ?? ""}`),
    dueDate: formatDate(dueDate),
    dueBucket: dueBucket(dueDate),
    reasonTags,
    projectProgressPercent: result?.projectProgressPercent ?? 0,
    modelingSummary: progress,
    reminderReason: buildReminderReason(reasonTags, row.riskMessage ?? task?.blockReason),
    nextStep: suggestion,
    relatedProjectProgress: projectProgressText(result, project),
    riskCopy,
    recentUpdates: recentUpdatesFor(project.id, row.projectTaskId, maps),
  };
}

function buildProjectRiskItem({
  id,
  project,
  result,
  task,
  maps,
  riskLevel,
}: {
  id: string;
  project: ProjectRow;
  result: ProjectResultRow;
  task: ProjectTaskRow | undefined;
  maps: ContextMaps;
  riskLevel: ProductGuideRiskLevel;
}): ProductGuideItem {
  const projectRefs = projectReference(project, maps);
  const taskOwner = personRef(task?.ownerId ?? project.projectOwnerId, maps.userById, projectRefs.productOwnerName);
  const dueDate = task?.plannedFinishDate ?? task?.expectedFinishDate ?? result.plannedLaunchDate;
  const suggestion = "该项目预测会延期，请确认当前卡点并更新预计完成时间。";
  const staleDays = daysSince(task?.lastUpdatedAt);

  return {
    id,
    source: "project-risk",
    projectId: project.id,
    projectName: project.projectName,
    ...projectRefs,
    taskId: task?.id,
    taskName: task?.taskName ?? result.currentTaskName ?? "当前项目推进",
    milestone: task?.milestoneType ?? "项目推进",
    ownerKey: taskOwner.key,
    ownerName: taskOwner.label,
    plannedFinishDate: formatDate(task?.plannedFinishDate ?? result.plannedLaunchDate),
    forecastFinishDate: formatDate(task?.expectedFinishDate ?? result.forecastLaunchDate),
    statusLabel: task?.status ?? result.currentTaskName ?? "未完成",
    riskLevel,
    riskLabel: riskLabel[riskLevel],
    suggestion,
    lastUpdatedAt: formatDate(task?.lastUpdatedAt ?? task?.updatedAt ?? project.updatedAt),
    staleDays,
    isStale: staleDays > 3,
    isBlocked: Boolean(result.blockedTaskCount && result.blockedTaskCount > 0),
    requiresArtReview: isModelingArtReviewTask(task?.taskName ?? result.currentTaskName ?? "", task?.status ?? ""),
    waitingLicensor: isWaitingLicensorText(result.riskMessage ?? ""),
    dueDate: formatDate(dueDate),
    dueBucket: dueBucket(dueDate),
    reasonTags: [riskLabel[riskLevel], "项目预测风险"],
    projectProgressPercent: result.projectProgressPercent ?? 0,
    modelingSummary: modelingSummary(project.id, maps),
    reminderReason: result.riskMessage ?? "当前项目测算结果已进入延期风险。",
    nextStep: suggestion,
    relatedProjectProgress: projectProgressText(result, project),
    riskCopy: result.riskMessage ?? `${project.projectName} 当前有延期风险，请尽快确认卡点。`,
    recentUpdates: recentUpdatesFor(project.id, task?.id, maps),
  };
}

function buildProjectTaskItem({
  project,
  result,
  task,
  maps,
  riskLevel,
  staleDays,
  isStale,
}: {
  project: ProjectRow;
  result: ProjectResultRow | undefined;
  task: ProjectTaskRow;
  maps: ContextMaps;
  riskLevel: ProductGuideRiskLevel;
  staleDays: number;
  isStale: boolean;
}): ProductGuideItem {
  const projectRefs = projectReference(project, maps);
  const taskOwner = personRef(task.ownerId ?? project.projectOwnerId, maps.userById, projectRefs.productOwnerName);
  const suggestion = task.isBlocked
    ? "该任务当前存在阻塞，请确认卡点、责任人和下一次更新时间。"
    : "请确认该任务是否已经完成，并补录实际完成时间。";
  const reasonTags = [
    task.isBlocked ? "任务阻塞" : null,
    isStale ? "超 3 天未更新" : null,
  ].filter(isString);

  return {
    id: `task:${task.id}`,
    source: "project-task",
    projectId: project.id,
    projectName: project.projectName,
    ...projectRefs,
    taskId: task.id,
    taskName: task.taskName,
    milestone: normalizeMilestone(task.milestoneType, task.taskNo),
    ownerKey: taskOwner.key,
    ownerName: taskOwner.label,
    plannedFinishDate: formatDate(task.plannedFinishDate),
    forecastFinishDate: formatDate(task.expectedFinishDate),
    actualFinishDate: formatDate(task.actualFinishDate),
    statusLabel: task.status,
    riskLevel,
    riskLabel: riskLabel[riskLevel],
    suggestion,
    lastUpdatedAt: formatDate(task.lastUpdatedAt ?? task.updatedAt),
    staleDays,
    isStale,
    isBlocked: task.isBlocked,
    requiresArtReview: isModelingArtReviewTask(task.taskName, task.status),
    waitingLicensor: isWaitingLicensorText(`${task.taskName} ${task.blockReason ?? ""} ${task.progressNote ?? ""}`),
    dueDate: formatDate(task.plannedFinishDate ?? task.expectedFinishDate),
    dueBucket: dueBucket(task.plannedFinishDate ?? task.expectedFinishDate),
    reasonTags,
    projectProgressPercent: result?.projectProgressPercent ?? 0,
    modelingSummary: modelingSummary(project.id, maps),
    reminderReason: buildReminderReason(reasonTags, task.blockReason ?? task.progressNote),
    nextStep: suggestion,
    relatedProjectProgress: projectProgressText(result, project),
    riskCopy: task.blockReason ?? (isStale ? `${task.taskName} 已超过 3 天没有更新。` : "该任务需要产品组跟进。"),
    recentUpdates: recentUpdatesFor(project.id, task.id, maps),
  };
}

function buildWorkTaskItem({
  project,
  workTask,
  maps,
  riskLevel,
}: {
  project: ProjectRow;
  workTask: WorkTaskRow;
  maps: ContextMaps;
  riskLevel: ProductGuideRiskLevel;
}): ProductGuideItem {
  const projectRefs = projectReference(project, maps);
  const owner = personRef(workTask.ownerId ?? project.projectOwnerId, maps.userById, projectRefs.productOwnerName);
  const dueDate = workTask.expectedFinishDate ?? workTask.forecastDeadline ?? undefined;
  const suggestion = workTask.actionRequired ?? "请按周任务要求推进，并补充当前处理进展。";

  return {
    id: `work:${workTask.id}`,
    source: "work-task",
    projectId: project.id,
    projectName: project.projectName,
    ...projectRefs,
    taskId: workTask.projectTaskId ?? undefined,
    taskName: workTask.taskTitle,
    milestone: workTask.taskGroup,
    ownerKey: owner.key,
    ownerName: owner.label,
    plannedFinishDate: formatDate(workTask.expectedFinishDate),
    forecastFinishDate: formatDate(workTask.forecastDeadline),
    statusLabel: workTask.status,
    riskLevel,
    riskLabel: riskLabel[riskLevel],
    suggestion,
    lastUpdatedAt: formatDate(workTask.updatedAt),
    staleDays: daysSince(workTask.updatedAt),
    isStale: daysSince(workTask.updatedAt) > 3,
    isBlocked: isHighRisk(riskLevel),
    requiresArtReview: isModelingArtReviewTask(workTask.taskTitle, workTask.status),
    waitingLicensor: isWaitingLicensorText(`${workTask.taskTitle} ${workTask.riskMessage ?? ""}`),
    dueDate: formatDate(dueDate),
    dueBucket: dueBucket(dueDate),
    reasonTags: [isHighRisk(riskLevel) ? riskLabel[riskLevel] : "周任务", workTask.sourceType].filter(isString),
    projectProgressPercent: maps.projectResultById.get(project.id)?.projectProgressPercent ?? 0,
    modelingSummary: modelingSummary(project.id, maps),
    reminderReason: workTask.riskMessage ?? "该周任务需要产品组处理。",
    nextStep: suggestion,
    relatedProjectProgress: projectProgressText(maps.projectResultById.get(project.id), project),
    riskCopy: workTask.riskMessage ?? suggestion,
    recentUpdates: recentUpdatesFor(project.id, workTask.projectTaskId ?? undefined, maps),
  };
}

function buildAlertItem({
  project,
  alert,
  maps,
}: {
  project: ProjectRow;
  alert: AlertRow;
  maps: ContextMaps;
}): ProductGuideItem {
  const projectRefs = projectReference(project, maps);
  const owner = personRef(alert.ownerId ?? alert.userId ?? project.projectOwnerId, maps.userById, projectRefs.productOwnerName);
  const severityRisk = alert.severity.includes("高") || alert.severity.includes("严重") ? "risk" : "watch";
  const suggestion = alertSuggestion(alert);

  return {
    id: `alert:${alert.id}`,
    source: "alert",
    projectId: project.id,
    projectName: project.projectName,
    ...projectRefs,
    taskId: alert.projectTaskId ?? alert.modelingTaskId ?? undefined,
    taskName: alert.title,
    milestone: alert.alertType,
    ownerKey: owner.key,
    ownerName: owner.label,
    statusLabel: alert.status,
    riskLevel: severityRisk,
    riskLabel: riskLabel[severityRisk],
    suggestion,
    lastUpdatedAt: formatDate(alert.createdAt),
    staleDays: daysSince(alert.createdAt),
    isStale: daysSince(alert.createdAt) > 3,
    isBlocked: alert.severity.includes("阻塞") || alert.message.includes("阻塞"),
    requiresArtReview: isModelingArtReviewTask(`${alert.title} ${alert.message}`, alert.alertType),
    waitingLicensor: isWaitingLicensorText(`${alert.title} ${alert.message}`),
    dueBucket: "none",
    reasonTags: [alert.severity, "未处理提醒"].filter(isString),
    projectProgressPercent: maps.projectResultById.get(project.id)?.projectProgressPercent ?? 0,
    modelingSummary: modelingSummary(project.id, maps),
    reminderReason: alert.message,
    nextStep: suggestion,
    relatedProjectProgress: projectProgressText(maps.projectResultById.get(project.id), project),
    riskCopy: alert.message,
    recentUpdates: recentUpdatesFor(project.id, alert.projectTaskId ?? undefined, maps),
  };
}

function buildModelingProgressItem({
  project,
  progress,
  maps,
  kind,
}: {
  project: ProjectRow;
  progress: ModelingProgressRow;
  maps: ContextMaps;
  kind: "unassigned" | "submitted";
}): ProductGuideItem {
  const projectRefs = projectReference(project, maps);
  const owner = kind === "submitted" ? projectRefs.artOwner : projectRefs.productOwner;
  const title = kind === "unassigned" ? "建模款式未分配" : "建模款式等待产品美术验收";
  const riskLevel: ProductGuideRiskLevel = kind === "unassigned" && progress.unassignedStyles > 3 ? "risk" : "watch";
  const suggestion =
    kind === "unassigned"
      ? "该项目建模款式仍有未分配，请确认是否需要外包。"
      : "该款式等待产品美术验收，请确认内部通过、退回修改或后续送审。";
  const count = kind === "unassigned" ? progress.unassignedStyles : progress.submittedStyles;

  return {
    id: `modeling-progress:${project.id}:${kind}`,
    source: "modeling",
    projectId: project.id,
    projectName: project.projectName,
    projectTeamKey: projectRefs.projectTeamKey,
    projectTeamName: projectRefs.projectTeamName,
    productOwnerKey: projectRefs.productOwnerKey,
    productOwnerName: projectRefs.productOwnerName,
    artOwnerKey: projectRefs.artOwnerKey,
    artOwnerName: projectRefs.artOwnerName,
    taskName: title,
    milestone: "建模里程碑",
    ownerKey: owner.key,
    ownerName: owner.label,
    forecastFinishDate: formatDate(progress.projectedAllApprovedDate),
    statusLabel: kind === "unassigned" ? `${count} 款未分配` : `${count} 款待验收`,
    riskLevel,
    riskLabel: riskLabel[riskLevel],
    suggestion,
    lastUpdatedAt: formatDate(progress.lastCalculatedAt),
    staleDays: daysSince(progress.lastCalculatedAt),
    isStale: daysSince(progress.lastCalculatedAt) > 3,
    isBlocked: kind === "submitted",
    requiresArtReview: true,
    waitingLicensor: false,
    dueDate: formatDate(progress.projectedAllApprovedDate),
    dueBucket: dueBucket(progress.projectedAllApprovedDate),
    reasonTags: [kind === "unassigned" ? "未分配款式" : "等待产品美术验收", "建模进度"],
    projectProgressPercent: maps.projectResultById.get(project.id)?.projectProgressPercent ?? 0,
    modelingSummary: modelingSummary(project.id, maps),
    reminderReason: `${project.projectName} 当前建模进度为 ${progress.progressPercent}%，${title} ${count} 款。`,
    nextStep: suggestion,
    relatedProjectProgress: projectProgressText(maps.projectResultById.get(project.id), project),
    riskCopy: `${project.projectName} 建模里程碑仍有 ${count} 款需要产品组处理。`,
    recentUpdates: recentUpdatesFor(project.id, undefined, maps),
  };
}

function buildModelingTaskItem({
  project,
  modelingTask,
  maps,
  status,
  staleDays,
  isStale,
}: {
  project: ProjectRow;
  modelingTask: ModelingTaskRow;
  maps: ContextMaps;
  status: string;
  staleDays: number;
  isStale: boolean;
}): ProductGuideItem {
  const projectRefs = projectReference(project, maps);
  const owner = status === "未分配" ? projectRefs.productOwner : projectRefs.artOwner;
  const needsArtReview = status === "待验收" || status === "已送审" || status === "等反馈" || status.includes("修改");
  const isWaitingLicensor = status === "等反馈" || isWaitingLicensorText(modelingTask.blockType ?? "");
  const riskLevel: ProductGuideRiskLevel =
    Boolean(modelingTask.blockedDays && modelingTask.blockedDays > 3) || isWaitingLicensor ? "risk" : isStale ? "watch" : "watch";
  const suggestion =
    status === "未分配"
      ? "该项目建模款式仍有未分配，请确认是否需要外包。"
      : needsArtReview
        ? status === "待验收"
          ? "该款式已由建模师提交成果，请产品美术检修并给出内部审核结果。"
          : "该款式卡在送审 / 修改，请产品美术确认下一步反馈。"
        : "请确认建模进度并补录最新更新时间。";
  const styleName = modelingTask.styleName || modelingTask.styleCode;

  return {
    id: `modeling:${modelingTask.id}`,
    source: "modeling",
    projectId: project.id,
    projectName: project.projectName,
    ...projectRefs,
    taskId: modelingTask.projectTaskId,
    taskName: styleName,
    milestone: "建模里程碑",
    ownerKey: owner.key,
    ownerName: owner.label,
    plannedFinishDate: formatDate(modelingTask.plannedFinishDate),
    actualFinishDate: formatDate(modelingTask.actualFinishDate),
    statusLabel: `${status}${modelingTask.reviewRound ? ` · 第 ${modelingTask.reviewRound} 轮` : ""}`,
    riskLevel,
    riskLabel: riskLabel[riskLevel],
    suggestion,
    lastUpdatedAt: formatDate(modelingTask.lastUpdatedAt ?? modelingTask.updatedAt),
    staleDays,
    isStale,
    isBlocked: Boolean(modelingTask.blockedDays && modelingTask.blockedDays > 0),
    requiresArtReview: needsArtReview,
    waitingLicensor: isWaitingLicensor,
    dueDate: formatDate(modelingTask.plannedFinishDate),
    dueBucket: dueBucket(modelingTask.plannedFinishDate),
    reasonTags: [
      status === "未分配" ? "未分配款式" : null,
      needsArtReview ? "等待产品美术验收" : null,
      isStale ? "超 3 天未更新" : null,
      isWaitingLicensor ? "等待版权方反馈" : null,
    ].filter(isString),
    projectProgressPercent: maps.projectResultById.get(project.id)?.projectProgressPercent ?? 0,
    modelingSummary: modelingSummary(project.id, maps),
    reminderReason: `${styleName} 当前状态为 ${status}，需要产品组继续推进。`,
    nextStep: suggestion,
    relatedProjectProgress: projectProgressText(maps.projectResultById.get(project.id), project),
    riskCopy: modelingTask.blockType ?? `${styleName} 当前需要处理。`,
    recentUpdates: recentUpdatesFor(project.id, modelingTask.projectTaskId, maps),
  };
}

function projectReference(project: ProjectRow, maps: ContextMaps) {
  const projectTeam = teamRef(project.projectTeamId, maps.teamById);
  const productOwner = personRef(project.projectOwnerId, maps.userById, "待补充产品研发");
  const artOwner = personRef(project.artOwnerId, maps.userById, "待补充产品美术");

  return {
    projectTeamKey: projectTeam.key,
    projectTeamName: projectTeam.label,
    productOwnerKey: productOwner.key,
    productOwnerName: productOwner.label,
    artOwnerKey: artOwner.key,
    artOwnerName: artOwner.label,
    productOwner,
    artOwner,
  };
}

function buildMilestoneBoard(
  scheduleData: ScheduleWorkbenchData,
  projectById: Map<string, ProjectRow>,
  teamById: Map<string, TeamRow>,
): ProductGuideMilestoneBoard {
  return {
    months: scheduleData.months,
    initialMonth: scheduleData.initialMonth,
    milestones: scheduleData.milestones,
    cards: scheduleData.projectCards.map((card) => {
      const project = projectById.get(card.projectId);
      const scheduleProjectTeam = scheduleData.projectDetails[card.projectId]?.projectTeam;
      const projectTeam = teamRef(project?.projectTeamId ?? scheduleProjectTeam, teamById);

      return {
        id: card.id,
        projectId: card.projectId,
        name: card.name,
        plannedMonth: card.plannedMonth,
        forecastMonth: card.forecastMonth,
        milestone: card.milestone,
        riskLevel: card.riskLevel,
        projectTeamKey: projectTeam.key,
        projectTeamName: projectTeam.label,
      };
    }),
  };
}

async function getLatestModelingFeedbackByTaskId(modelingTaskIds: string[]) {
  if (modelingTaskIds.length === 0) {
    return new Map<string, ModelingFeedbackRow>();
  }

  const feedbackRows = await prisma.modelingFeedback.findMany({
    where: { modelingTaskId: { in: modelingTaskIds } },
    orderBy: [{ feedbackAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(2000, modelingTaskIds.length * 5),
    select: {
      modelingTaskId: true,
      feedbackType: true,
      content: true,
      feedbackAt: true,
      status: true,
    },
  });
  const latestByTaskId = new Map<string, ModelingFeedbackRow>();

  for (const feedback of feedbackRows) {
    if (!latestByTaskId.has(feedback.modelingTaskId)) {
      latestByTaskId.set(feedback.modelingTaskId, feedback);
    }
  }

  return latestByTaskId;
}

function buildStyleSummaries(
  modelingTasks: ModelingTaskRow[],
  latestFeedbackByTaskId: Map<string, ModelingFeedbackRow>,
): ProductGuideStyleSummary[] {
  return modelingTasks
    .map((task) => {
      const feedback = latestFeedbackByTaskId.get(task.id);

      return {
        id: task.id,
        projectId: task.projectId,
        projectTaskId: task.projectTaskId,
        styleCode: task.styleCode,
        styleName: task.styleName || task.styleCode,
        isRequired: task.isRequired,
        originalArtStatus: task.originalArtStatus,
        originalArtApprovedDate: formatDate(task.originalArtApprovedDate),
        difficulty: task.difficulty,
        estimatedWorkdays: task.estimatedWorkdays,
        status: normalizeModelingStatus(task.status, task.isOutsourced),
        plannedFinishDate: formatDate(task.plannedFinishDate),
        actualFinishDate: formatDate(task.actualFinishDate),
        latestFeedbackSummary: feedback?.content,
        latestFeedbackAt: formatDate(feedback?.feedbackAt),
        blockType: task.blockType ?? feedback?.feedbackType,
        lastUpdatedAt: formatDate(task.lastUpdatedAt ?? task.updatedAt),
      };
    })
    .sort((a, b) => a.projectId.localeCompare(b.projectId) || a.styleCode.localeCompare(b.styleCode, "zh-CN"));
}

function groupRecentUpdates(rows: ProgressUpdateRow[], key: "projectId" | "projectTaskId") {
  const groups = new Map<string, ProductGuideRecentUpdate[]>();

  for (const row of rows) {
    const groupKey = row[key];
    const current = groups.get(groupKey) ?? [];

    if (current.length >= 5) {
      continue;
    }

    current.push({
      id: row.id,
      updateType: row.updateType,
      note: row.note ?? undefined,
      createdAt: formatDateTime(row.createdAt),
      updatedByName: row.updatedByName ?? undefined,
      newValueSummary: summarizeUpdateValue(row.newValue),
    });
    groups.set(groupKey, current);
  }

  return groups;
}

function recentUpdatesFor(projectId: string, taskId: string | undefined, maps: ContextMaps) {
  const seen = new Set<string>();
  const updates: ProductGuideRecentUpdate[] = [];
  const candidates = [
    ...(taskId ? maps.recentUpdatesByTaskId.get(taskId) ?? [] : []),
    ...(maps.recentUpdatesByProjectId.get(projectId) ?? []),
  ];

  for (const update of candidates) {
    if (seen.has(update.id)) {
      continue;
    }

    seen.add(update.id);
    updates.push(update);

    if (updates.length >= 3) {
      break;
    }
  }

  return updates;
}

function summarizeUpdateValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const parts = Object.entries(value as Record<string, unknown>)
    .map(([key, fieldValue]) => `${updateFieldLabel(key)}：${summarizePrimitive(fieldValue)}`)
    .filter((text) => !text.endsWith("："))
    .slice(0, 3);

  return parts.length > 0 ? parts.join("，") : undefined;
}

function updateFieldLabel(key: string) {
  const labels: Record<string, string> = {
    status: "状态",
    actualFinishDate: "实际完成",
    expectedFinishDate: "预计完成",
    submittedAt: "送审日期",
    reviewTarget: "送审对象",
    blockReason: "阻塞原因",
    progressNote: "进度",
    createdStyleCount: "新增款式",
    styleNames: "款式",
    isBlocked: "阻塞",
  };

  return labels[key] ?? key;
}

function summarizePrimitive(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => summarizePrimitive(item)).filter(Boolean).slice(0, 3).join("、");
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function addOrMergeItem(itemsById: Map<string, ProductGuideItem>, item: ProductGuideItem) {
  const existing = itemsById.get(item.id);

  if (!existing) {
    itemsById.set(item.id, item);
    return;
  }

  existing.reasonTags = uniqueStrings([...existing.reasonTags, ...item.reasonTags]);
  existing.isStale = existing.isStale || item.isStale;
  existing.isBlocked = existing.isBlocked || item.isBlocked;
  existing.requiresArtReview = existing.requiresArtReview || item.requiresArtReview;
  existing.waitingLicensor = existing.waitingLicensor || item.waitingLicensor;
  existing.staleDays = Math.max(existing.staleDays, item.staleDays);
  existing.recentUpdates = mergeRecentUpdates(existing.recentUpdates, item.recentUpdates);
  const worseRiskLevel = worseRisk(existing.riskLevel, item.riskLevel);

  if (worseRiskLevel !== existing.riskLevel) {
    existing.riskLevel = item.riskLevel;
    existing.riskLabel = item.riskLabel;
    existing.riskCopy = item.riskCopy;
  }

  if (item.isBlocked && !existing.isBlocked) {
    existing.suggestion = item.suggestion;
  }
}

function mergeRecentUpdates(a: ProductGuideRecentUpdate[], b: ProductGuideRecentUpdate[]) {
  const seen = new Set<string>();
  const merged: ProductGuideRecentUpdate[] = [];

  for (const update of [...a, ...b]) {
    if (seen.has(update.id)) {
      continue;
    }

    seen.add(update.id);
    merged.push(update);
  }

  return merged
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 3);
}

function buildMetrics(items: ProductGuideItem[]): ProductGuideMetric[] {
  const riskCount = items.filter((item) => item.riskLevel === "risk" || item.riskLevel === "delay").length;
  const staleCount = items.filter((item) => item.isStale).length;
  const artReviewCount = items.filter((item) => item.requiresArtReview).length;
  const licensorCount = items.filter((item) => item.waitingLicensor).length;

  return [
    {
      label: "今日需处理",
      value: items.filter((item) => item.dueBucket === "today").length,
      helper: "已到期或今天到期",
      tone: "danger",
    },
    {
      label: "本周需处理",
      value: items.filter((item) => item.dueBucket === "today" || item.dueBucket === "this-week").length,
      helper: "未来 7 天内需推进",
      tone: "info",
    },
    {
      label: "有延期风险",
      value: riskCount,
      helper: "未完成项目的当前风险",
      tone: riskCount > 0 ? "warning" : "neutral",
    },
    {
      label: "超 3 天未更新",
      value: staleCount,
      helper: "任务或提醒长时间无进展",
      tone: staleCount > 0 ? "warning" : "neutral",
    },
    {
      label: "等待产品美术验收",
      value: artReviewCount,
      helper: "建模送审、反馈或验收",
      tone: artReviewCount > 0 ? "warning" : "neutral",
    },
    {
      label: "等待版权方反馈",
      value: licensorCount,
      helper: "送审后等待外部反馈",
      tone: licensorCount > 0 ? "danger" : "neutral",
    },
  ];
}

function buildFilters(
  items: ProductGuideItem[],
  users: UserRow[],
  teamsSource: TeamRow[] = [],
  milestoneCards: ProductGuideMilestoneCard[] = [],
) {
  const teamById = new Map(teamsSource.map((team) => [team.id, team.name]));
  const projectGroupsFromUsers = users
    .filter((user) => user.status !== "停用" && user.projectGroupTeamId)
    .map((user) => ({ value: user.projectGroupTeamId ?? "", label: teamById.get(user.projectGroupTeamId ?? "") ?? "未匹配项目小组" }));
  const teams = uniqueOptions([
    ...items.map((item) => ({ value: item.projectTeamKey, label: item.projectTeamName })),
    ...milestoneCards.map((card) => ({ value: card.projectTeamKey, label: card.projectTeamName })),
    ...projectGroupsFromUsers,
  ]);
  const productOwners = uniqueOptions(items.map((item) => ({ value: item.productOwnerKey, label: item.productOwnerName })));
  const artOwners = uniqueOptions(items.map((item) => ({ value: item.artOwnerKey, label: item.artOwnerName })));
  const peopleFromItems = items.flatMap((item) => [
    { value: item.ownerKey, label: item.ownerName },
    { value: item.productOwnerKey, label: item.productOwnerName },
    { value: item.artOwnerKey, label: item.artOwnerName },
  ]);
  const activeProductUsers = users
    .filter((user) => user.status !== "停用" && isProductRole(user))
    .map((user) => ({ value: user.id, label: user.name }));

  return {
    teams,
    productOwners,
    artOwners,
    people: uniqueOptions([...activeProductUsers, ...peopleFromItems]),
  };
}

function buildFallbackData(): ProductGuideData {
  const generatedAt = new Date().toISOString();
  const items: ProductGuideItem[] = [
    {
      id: "fallback:1",
      source: "project-risk",
      projectId: "fallback-project-1",
      projectName: "无牙仔猫猫",
      projectTeamKey: "产品一组",
      projectTeamName: "产品一组",
      taskName: "根据效果图建模",
      milestone: "建模里程碑",
      ownerKey: "张娜",
      ownerName: "张娜",
      productOwnerKey: "张娜",
      productOwnerName: "张娜",
      artOwnerKey: "李桃",
      artOwnerName: "李桃",
      plannedFinishDate: "2026-05-22",
      forecastFinishDate: "2026-05-28",
      statusLabel: "进行中",
      riskLevel: "risk",
      riskLabel: "延期风险",
      suggestion: "该项目预测会延期，请确认当前卡点并更新预计完成时间。",
      lastUpdatedAt: "2026-05-17",
      staleDays: 5,
      isStale: true,
      isBlocked: false,
      requiresArtReview: true,
      waitingLicensor: false,
      dueDate: "2026-05-22",
      dueBucket: "today",
      reasonTags: ["延期风险", "超 3 天未更新", "关键路径"],
      projectProgressPercent: 42,
      modelingSummary: "建模 3/8 款通过，2 款进行中，1 款送审，1 款未分配。",
      reminderReason: "建模里程碑预测落后计划，且最近更新已超过 3 天。",
      nextStep: "该项目预测会延期，请确认当前卡点并更新预计完成时间。",
      relatedProjectProgress: "项目进度 42%，计划上线 2026-05-22。",
      riskCopy: "若本周无法确认外包补位，建模里程碑会继续延期。",
      recentUpdates: [],
    },
    {
      id: "fallback:2",
      source: "modeling",
      projectId: "fallback-project-2",
      projectName: "奥特曼正比例",
      projectTeamKey: "产品二组",
      projectTeamName: "产品二组",
      taskName: "正比例复杂款 03",
      milestone: "建模里程碑",
      ownerKey: "赵航",
      ownerName: "赵航",
      productOwnerKey: "刘然",
      productOwnerName: "刘然",
      artOwnerKey: "赵航",
      artOwnerName: "赵航",
      plannedFinishDate: "2026-05-25",
      statusLabel: "已送审 · 第 2 轮",
      riskLevel: "watch",
      riskLabel: "需关注",
      suggestion: "该款式卡在送审 / 修改，请产品美术确认下一步反馈。",
      lastUpdatedAt: "2026-05-20",
      staleDays: 2,
      isStale: false,
      isBlocked: true,
      requiresArtReview: true,
      waitingLicensor: true,
      dueDate: "2026-05-25",
      dueBucket: "this-week",
      reasonTags: ["等待产品美术验收", "等待版权方反馈"],
      projectProgressPercent: 28,
      modelingSummary: "建模 1/6 款通过，2 款进行中，1 款送审，2 款未分配。",
      reminderReason: "款式已送审，等待确认版权方反馈和修改动作。",
      nextStep: "该款式卡在送审 / 修改，请产品美术确认下一步反馈。",
      relatedProjectProgress: "项目进度 28%，复杂款式占比较高。",
      riskCopy: "送审反馈未明确会影响建模里程碑回收。",
      recentUpdates: [],
    },
  ];

  return {
    sourceLabel: "基础样例",
    generatedAt,
    metrics: buildMetrics(items),
    milestoneBoard: {
      months: ["26年5月"],
      initialMonth: "26年5月",
      milestones: ["原画里程碑", "建模里程碑", "红蜡里程碑", "平面里程碑", "产前里程碑", "大货里程碑"],
      cards: [
        {
          id: "fallback-project-1:建模里程碑",
          projectId: "fallback-project-1",
          name: "无牙仔猫猫",
          plannedMonth: "26年5月",
          forecastMonth: "26年5月",
          milestone: "建模里程碑",
          riskLevel: "risk",
          projectTeamKey: "产品一组",
          projectTeamName: "产品一组",
        },
        {
          id: "fallback-project-2:建模里程碑",
          projectId: "fallback-project-2",
          name: "奥特曼正比例",
          plannedMonth: "26年5月",
          forecastMonth: "26年5月",
          milestone: "建模里程碑",
          riskLevel: "normal",
          projectTeamKey: "产品二组",
          projectTeamName: "产品二组",
        },
      ],
    },
    filters: buildFilters(items, [], [], [
      {
        id: "fallback-project-1:建模里程碑",
        projectId: "fallback-project-1",
        name: "无牙仔猫猫",
        plannedMonth: "26年5月",
        forecastMonth: "26年5月",
        milestone: "建模里程碑",
        riskLevel: "risk",
        projectTeamKey: "产品一组",
        projectTeamName: "产品一组",
      },
      {
        id: "fallback-project-2:建模里程碑",
        projectId: "fallback-project-2",
        name: "奥特曼正比例",
        plannedMonth: "26年5月",
        forecastMonth: "26年5月",
        milestone: "建模里程碑",
        riskLevel: "normal",
        projectTeamKey: "产品二组",
        projectTeamName: "产品二组",
      },
    ]),
    items,
    styleSummaries: [],
  };
}

function taskSuggestion({
  row,
  task,
  result,
  riskLevel,
  isStale,
}: {
  row: ScheduleTaskResultRow;
  task: ProjectTaskRow | undefined;
  result: ProjectResultRow | undefined;
  riskLevel: ProductGuideRiskLevel;
  isStale: boolean;
}) {
  const statusText = `${row.taskName} ${task?.status ?? ""} ${row.displayStatus ?? ""}`;

  if (isModelingArtReviewTask(row.taskName, statusText)) {
    return "该款式卡在送审 / 修改，请产品美术确认下一步反馈。";
  }

  if (riskLevel === "delay" || riskLevel === "risk" || result?.riskLevel.includes("风险")) {
    return "该项目预测会延期，请确认当前卡点并更新预计完成时间。";
  }

  if (isStale) {
    return "请确认该任务是否已经完成，并补录实际完成时间。";
  }

  return "请确认当前任务状态，并更新下一步推进时间。";
}

function alertSuggestion(alert: AlertRow) {
  const text = `${alert.title} ${alert.message}`;

  if (isWaitingLicensorText(text)) {
    return "请确认版权方反馈是否已收到，并同步下一步修改或验收时间。";
  }

  if (isModelingArtReviewTask(text, alert.alertType)) {
    return "该款式卡在送审 / 修改，请产品美术确认下一步反馈。";
  }

  if (text.includes("未更新")) {
    return "请确认该任务是否已经完成，并补录实际完成时间。";
  }

  return "请确认提醒对应的责任人、卡点和下一次更新时间。";
}

function buildReminderReason(reasonTags: string[], fallback?: string | null) {
  if (fallback?.trim()) {
    return fallback;
  }

  if (reasonTags.length === 0) {
    return "该任务属于当前需要产品组推进的工作。";
  }

  return `触发原因：${reasonTags.join("、")}。`;
}

function projectProgressText(result: ProjectResultRow | undefined, project: ProjectRow) {
  const progress = result?.projectProgressPercent ?? 0;
  const planned = formatDate(result?.plannedLaunchDate ?? project.plannedLaunchDate) ?? "待补充";
  const forecast = formatDate(result?.forecastLaunchDate);

  return forecast ? `项目进度 ${progress}%，计划上线 ${planned}，预测完成 ${forecast}。` : `项目进度 ${progress}%，计划上线 ${planned}。`;
}

function modelingSummary(projectId: string, maps: ContextMaps) {
  const progress = maps.modelingProgressByProjectId.get(projectId);

  if (!progress || progress.totalRequiredStyles === 0) {
    return "暂无建模款式进度。";
  }

  return `建模 ${progress.approvedStyles}/${progress.totalRequiredStyles} 款通过，${progress.inProgressStyles} 款进行中，${progress.submittedStyles} 款待验收/送审，${progress.outsourcedStyles} 款外包，${progress.unassignedStyles} 款未分配。`;
}

function riskCopyForLevel(projectName: string, riskLevel: ProductGuideRiskLevel, isStale: boolean) {
  if (riskLevel === "delay") {
    return `${projectName} 当前已进入必然延期，请尽快确认补救动作。`;
  }

  if (riskLevel === "risk") {
    return `${projectName} 当前存在延期风险，请确认卡点和预计完成时间。`;
  }

  if (isStale) {
    return `${projectName} 有任务超过 3 天未更新。`;
  }

  return `${projectName} 需要产品组继续推进。`;
}

function toGuideRiskLevel(value?: string | null, delayDays?: number | null): ProductGuideRiskLevel {
  const text = value ?? "";

  if (text === "delay" || text.includes("必然") || text.includes("严重")) {
    return "delay";
  }

  if (text === "risk" || text.includes("风险") || (typeof delayDays === "number" && delayDays > 0)) {
    return "risk";
  }

  return "normal";
}

function isHighRisk(value: ProductGuideRiskLevel) {
  return value === "risk" || value === "delay";
}

function worseRisk(a: ProductGuideRiskLevel, b: ProductGuideRiskLevel) {
  const weights: Record<ProductGuideRiskLevel, number> = {
    normal: 0,
    watch: 1,
    risk: 2,
    delay: 3,
  };

  return weights[b] > weights[a] ? b : a;
}

function sortGuideItems(a: ProductGuideItem, b: ProductGuideItem) {
  const riskOrder = riskSortValue(b.riskLevel) - riskSortValue(a.riskLevel);
  if (riskOrder !== 0) return riskOrder;

  if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
  if (a.dueBucket !== b.dueBucket) return dueBucketSortValue(a.dueBucket) - dueBucketSortValue(b.dueBucket);

  const dateOrder = dateSortValue(a.dueDate ?? a.plannedFinishDate) - dateSortValue(b.dueDate ?? b.plannedFinishDate);
  if (dateOrder !== 0) return dateOrder;

  return a.projectName.localeCompare(b.projectName, "zh-CN");
}

function riskSortValue(value: ProductGuideRiskLevel) {
  return value === "delay" ? 4 : value === "risk" ? 3 : value === "watch" ? 2 : 1;
}

function dueBucketSortValue(value: ProductGuideDueBucket) {
  if (value === "today") return 0;
  if (value === "this-week") return 1;
  if (value === "later") return 2;
  return 3;
}

function dueBucket(value?: Date | null): ProductGuideDueBucket {
  if (!value) {
    return "none";
  }

  const today = startOfDay(new Date());
  const date = startOfDay(value);
  const diffDays = Math.floor((date.getTime() - today.getTime()) / 86_400_000);

  if (diffDays <= 0) {
    return "today";
  }

  if (diffDays <= 7) {
    return "this-week";
  }

  return "later";
}

function isWithinNextDays(value: Date | null | undefined, days: number) {
  if (!value) {
    return false;
  }

  const today = startOfDay(new Date());
  const date = startOfDay(value);
  const diffDays = Math.floor((date.getTime() - today.getTime()) / 86_400_000);

  return diffDays <= days;
}

function isWithinActionWindow(value: Date | null | undefined, futureDays: number, pastDays: number) {
  if (!value) {
    return false;
  }

  const today = startOfDay(new Date());
  const date = startOfDay(value);
  const diffDays = Math.floor((date.getTime() - today.getTime()) / 86_400_000);

  return diffDays >= -pastDays && diffDays <= futureDays;
}

function daysSince(value?: Date | null) {
  if (!value) {
    return 0;
  }

  const start = startOfDay(value).getTime();
  const end = startOfDay(new Date()).getTime();

  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function firstDate(...values: Array<Date | null | undefined>) {
  return values.find((value): value is Date => Boolean(value));
}

function dateSortValue(value?: string) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const time = new Date(`${value}T12:00:00Z`).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function formatDate(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function formatDateTime(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function teamRef(value: string | null | undefined, teamById: Map<string, TeamRow>): RefLabel {
  if (value && teamById.has(value)) {
    return { key: value, label: teamById.get(value)?.name ?? "未匹配团队" };
  }

  if (value?.trim()) {
    return { key: value, label: readableRef(value, "未匹配项目组") };
  }

  return { key: "__missing_team", label: "待补充项目组" };
}

function personRef(value: string | null | undefined, userById: Map<string, UserRow>, fallback: string): RefLabel {
  if (value && userById.has(value)) {
    return { key: value, label: userById.get(value)?.name ?? fallback };
  }

  if (value?.trim()) {
    return { key: value, label: readableRef(value, fallback) };
  }

  return { key: `__missing_${fallback}`, label: fallback };
}

function readableRef(value: string, fallback: string) {
  if (value.length > 20 && value.includes("-")) {
    return `${fallback} ${value.slice(0, 6)}`;
  }

  return value;
}

function uniqueOptions(options: ProductGuideFilterOption[]) {
  const seen = new Set<string>();
  const result: ProductGuideFilterOption[] = [];

  for (const option of options) {
    if (!option.value || seen.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    result.push(option);
  }

  return result.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isProductRole(user: UserRow) {
  const roleText = [stringValue(user.roleTitle), ...jsonStringList(user.businessRoles)].filter(Boolean).join(" ");
  return Boolean(roleText && (roleText.includes("产品研发") || roleText.includes("产品总监") || roleText.includes("产品") || roleText.includes("美术")));
}

function jsonStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(stringValue).filter((item): item is string => Boolean(item));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isCompletedProject(project: ProjectRow, result: ProjectResultRow | undefined) {
  const raw = rawObject(result?.rawResult);
  const summary = rawObject(raw.summary);
  const unfinishedTasks = Number(summary.unfinishedTasks);
  const statusText = [project.status, project.currentStage, raw.status].filter(Boolean).join(" ");

  return (
    statusText.includes("已完") ||
    statusText.includes("完结") ||
    (result?.projectProgressPercent ?? 0) >= 100 ||
    unfinishedTasks === 0
  );
}

function isProjectPastModeling(project: ProjectRow) {
  const stageText = `${project.currentStage ?? ""} ${project.status ?? ""}`;
  return ["红蜡", "模具", "大货", "已完", "完结"].some((stage) => stageText.includes(stage));
}

function isCompletedScheduleTask(row: ScheduleTaskResultRow, task?: ProjectTaskRow) {
  return [row.displayStatus, row.taskActionType, task?.status].some((value) => isDoneText(value)) || Boolean(task?.actualFinishDate);
}

function isCompletedProjectTask(task: ProjectTaskRow) {
  return isDoneText(task.status) || Boolean(task.actualFinishDate);
}

function isDoneText(value?: string | null) {
  if (!value) {
    return false;
  }

  return (
    value.includes("已完成") ||
    value.includes("已通过") ||
    value.includes("已处理") ||
    value.includes("完结") ||
    value === "完成" ||
    value.includes("取消")
  );
}

function normalizeModelingStatus(value: string, isOutsourced: boolean) {
  if (isOutsourced && (value.includes("排队") || value.includes("排期") || value.includes("建模") || value.includes("进行"))) {
    return "外包中";
  }

  if (value.includes("待确认")) return "待确认";
  if (value.includes("退回补充")) return "退回补充";
  if (value.includes("未启动")) return "未启动";
  if (value.includes("未分配")) return "未分配";
  if (value.includes("待验收") || value.includes("待内审") || value.includes("待审核")) return "待验收";
  if (value.includes("待送审")) return "待送审";
  if (value.includes("送审")) return "已送审";
  if (value.includes("反馈")) return "等反馈";
  if (value.includes("排队")) return "排队中";
  if (value.includes("修改") || value.includes("返修")) return "修改中";
  if (value.includes("建模")) return "建模中";
  if (value.includes("通过") || value.includes("完成")) return "已通过";
  if (value.includes("外包")) return "外包中";
  if (value.includes("排期")) return "已排期";

  return value || "待确认";
}

function normalizeMilestone(value: string, taskNo: number) {
  if (value?.trim() && isKnownMilestone(value)) {
    return value;
  }

  return milestoneByTaskNo(taskNo);
}

function isModelingArtReviewTask(taskName: string, statusText: string) {
  const text = `${taskName} ${statusText}`;
  return (
    text.includes("建模") ||
    text.includes("送审") ||
    text.includes("美术") ||
    text.includes("修改") ||
    text.includes("反馈") ||
    text.includes("验收")
  );
}

function isWaitingLicensorText(value: string) {
  return value.includes("版权") || value.includes("反馈") || value.includes("送审") || value.includes("等反馈");
}

function completionDateForRaw(value: unknown) {
  const raw = rawObject(value);
  return dateFromRawValue(raw.actualFinishDate) ?? dateFromRawValue(raw.inferredCompletionDate);
}

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function dateFromRawValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isString(value: string | null | undefined): value is string {
  return Boolean(value);
}
