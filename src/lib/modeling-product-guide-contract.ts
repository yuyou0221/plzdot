import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { refreshProjectModelingProgress } from "@/lib/modeling-schedule-mutation";
import type { ModelingReferenceImage, ModelingTaskStatus } from "@/lib/modeling-schedule-types";

type ContractActor = {
  id?: string;
  name?: string;
};

type ParsedStyleInput = {
  sourceStyleId: string | null;
  projectTaskId: string | null;
  taskNo: number | null;
  styleCode: string;
  styleSequence: string;
  styleName: string;
  isRequired: boolean;
  isFirstModelingStyle: boolean;
  productType: string | null;
  difficulty: string;
  estimatedWorkdays: number;
  originalArtStatus: string;
  originalArtApprovedDate: Date | null;
  referenceImageUrls: ModelingReferenceImage[];
  notes: string | null;
};

type ProjectTaskTarget = {
  id: string;
  taskNo: number;
  taskName: string;
};

type MatchedTask = {
  id: string;
  status: string;
};

export class ModelingContractError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ModelingContractError";
    this.statusCode = statusCode;
  }
}

export async function submitModelingStyleSubmission(payload: Record<string, unknown>, actor: ContractActor = {}) {
  const projectId = requiredText(payload.projectId, "缺少项目。");
  const submittedByName = optionalText(payload.submittedByName) ?? actor.name ?? "产品组工作指引";
  const sourceRequestId = optionalText(payload.sourceRequestId);
  const styles = parseStyleInputs(payload.styles);

  if (styles.length === 0) {
    throw new ModelingContractError("请提交至少一条建模款式。");
  }

  const firstStyleCount = styles.filter((style) => style.isFirstModelingStyle).length;

  if (firstStyleCount !== 1) {
    throw new ModelingContractError("必须且只能有 1 个第一款建模款式。");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, projectName: true, projectCode: true },
  });

  if (!project) {
    throw new ModelingContractError("找不到对应项目。", 404);
  }

  const projectTasks = await prisma.projectTask.findMany({
    where: { projectId, taskNo: { in: [7, 10] } },
    select: { id: true, taskNo: true, taskName: true },
  });
  const targets = resolveStyleTargets({
    projectTasks,
    styles,
    topLevelProjectTaskId: optionalText(payload.projectTaskId),
    topLevelTaskNo: optionalInt(payload.taskNo),
    firstStyleProjectTaskId: optionalText(payload.firstStyleProjectTaskId) ?? optionalText(payload.task7ProjectTaskId),
    remainingStylesProjectTaskId: optionalText(payload.remainingStylesProjectTaskId) ?? optionalText(payload.task10ProjectTaskId),
  });

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const resultStyles = [];
    const touchedProjectTaskIds = new Set<string>();

    for (const style of styles) {
      const target = targets.get(style)!;
      const existing = await matchExistingModelingTask(tx, projectId, target.id, style);
      const styleCode = style.styleCode || buildStyleCode(project.projectCode, project.projectName, target.taskNo, style);
      const commonData = {
        sourceStyleId: style.sourceStyleId,
        styleCode,
        styleSequence: style.styleSequence,
        styleName: style.styleName,
        isFirstModelingStyle: style.isFirstModelingStyle,
        isRequired: style.isRequired,
        referenceImageUrls: style.referenceImageUrls,
        originalArtStatus: style.originalArtStatus,
        originalArtApprovedDate: style.originalArtApprovedDate,
        difficulty: style.difficulty,
        estimatedWorkdays: style.estimatedWorkdays,
        affectsProjectSchedule: true,
        lastUpdatedAt: now,
        lastUpdatedBy: submittedByName,
      };

      const task = existing
        ? await tx.modelingTask.update({
            where: { id: existing.id },
            data: removeUndefined(commonData),
            select: { id: true, status: true, styleCode: true, styleName: true, styleSequence: true },
          })
        : await tx.modelingTask.create({
            data: {
              projectId,
              projectTaskId: target.id,
              ...removeUndefined(commonData),
              status: "未启动",
              remainingWorkdays: style.estimatedWorkdays,
            } as Prisma.ModelingTaskUncheckedCreateInput,
            select: { id: true, status: true, styleCode: true, styleName: true, styleSequence: true },
          });

      touchedProjectTaskIds.add(target.id);
      resultStyles.push({
        sourceStyleId: style.sourceStyleId ?? undefined,
        styleCode: task.styleCode,
        styleSequence: task.styleSequence ?? style.styleSequence,
        styleName: task.styleName,
        isFirstModelingStyle: style.isFirstModelingStyle,
        projectTaskId: target.id,
        taskNo: target.taskNo,
        modelingTaskId: task.id,
        modelingStatus: task.status,
        createdOrUpdated: existing ? "updated" : "created",
      });
    }

    for (const projectTaskId of touchedProjectTaskIds) {
      await refreshProjectModelingProgress(tx, projectId, projectTaskId);
    }

    return {
      projectId,
      projectName: project.projectName,
      sourceRequestId,
      styles: resultStyles,
      createdCount: resultStyles.filter((style) => style.createdOrUpdated === "created").length,
      updatedCount: resultStyles.filter((style) => style.createdOrUpdated === "updated").length,
    };
  });
}

export async function startModelingStyles(payload: Record<string, unknown>, actor: ContractActor = {}) {
  const projectId = requiredText(payload.projectId, "缺少项目。");
  const taskNo = requiredInt(payload.taskNo, "缺少任务编号。");
  const startScope = requiredText(payload.startScope, "缺少启动范围。");

  if (taskNo !== 7 && taskNo !== 10) {
    throw new ModelingContractError("建模款式启动只接受任务 7 或任务 10。");
  }

  if (taskNo === 7 && startScope !== "first-style") {
    throw new ModelingContractError("任务 7 只能启动第一款建模款式。");
  }

  if (taskNo === 10 && startScope !== "remaining-styles") {
    throw new ModelingContractError("任务 10 只能启动其余建模款式。");
  }

  const projectTaskId = await resolveProjectTaskIdForStart(projectId, taskNo, optionalText(payload.projectTaskId));
  const now = new Date();
  const operatorName = optionalText(payload.operatorName) ?? actor.name ?? "产品组工作指引";

  return prisma.$transaction(async (tx) => {
    const targetTasks = await tx.modelingTask.findMany({
      where: {
        projectId,
        projectTaskId,
        isFirstModelingStyle: taskNo === 7,
      },
      select: { id: true, status: true, styleCode: true, styleName: true },
      orderBy: [{ styleSequence: "asc" }, { styleCode: "asc" }, { createdAt: "asc" }],
    });

    if (targetTasks.length === 0) {
      throw new ModelingContractError(taskNo === 7 ? "找不到第一款建模款式。" : "找不到其余建模款式。", 404);
    }

    const startableIds = targetTasks.filter((task) => normalizeStatus(task.status, false) === "未启动").map((task) => task.id);

    if (startableIds.length > 0) {
      await tx.modelingTask.updateMany({
        where: { id: { in: startableIds } },
        data: {
          status: "未分配",
          lastUpdatedAt: now,
          lastUpdatedBy: operatorName,
        },
      });
    }

    await refreshProjectModelingProgress(tx, projectId, projectTaskId);

    return {
      projectId,
      projectTaskId,
      taskNo,
      startScope,
      targetCount: targetTasks.length,
      startedCount: startableIds.length,
      styles: targetTasks.map((task) => ({
        modelingTaskId: task.id,
        styleCode: task.styleCode,
        styleName: task.styleName,
        previousStatus: task.status,
        modelingStatus: startableIds.includes(task.id) ? "未分配" : task.status,
      })),
    };
  });
}

export async function recordModelingReviewResult(payload: Record<string, unknown>, actor: ContractActor = {}) {
  const modelingTaskId = requiredText(payload.modelingTaskId, "缺少建模款式任务。");
  const reviewResult = normalizeReviewResult(requiredText(payload.reviewResult, "缺少审核结果。"));
  const reviewAt = parseDateOnly(payload.reviewAt) ?? new Date();
  const reviewerName = optionalText(payload.reviewerName) ?? actor.name ?? "产品组工作指引";
  const reviewerId = optionalText(payload.reviewerId) ?? actor.id ?? null;
  const feedbackContent = optionalText(payload.feedbackContent);
  const attachmentUrls = parseStringArray(payload.attachmentUrls);

  return prisma.$transaction(async (tx) => {
    const task = await tx.modelingTask.findUnique({
      where: { id: modelingTaskId },
      select: {
        id: true,
        projectId: true,
        projectTaskId: true,
        styleCode: true,
        styleName: true,
        plannedStartDate: true,
        actualStartDate: true,
        reviewRound: true,
      },
    });

    if (!task) {
      throw new ModelingContractError("找不到对应建模款式任务。", 404);
    }

    const payloadProjectId = optionalText(payload.projectId);
    const payloadProjectTaskId = optionalText(payload.projectTaskId);

    if (payloadProjectId && payloadProjectId !== task.projectId) {
      throw new ModelingContractError("审核结果的项目与建模款式不一致。");
    }

    if (payloadProjectTaskId && payloadProjectTaskId !== task.projectTaskId) {
      throw new ModelingContractError("审核结果的项目任务与建模款式不一致。");
    }

    const latestFeedback = await tx.modelingFeedback.findFirst({
      where: { modelingTaskId },
      orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }],
      select: { roundNo: true },
    });
    const nextRound = Math.max(task.reviewRound ?? 0, latestFeedback?.roundNo ?? 0) + 1;
    const now = new Date();
    const data: Prisma.ModelingTaskUpdateInput = {
      lastUpdatedAt: now,
      lastUpdatedBy: reviewerName,
    };
    let nextStatus: ModelingTaskStatus;
    let feedbackType: string;
    let feedbackStatus = "已记录";
    let resolvedAt: Date | undefined = reviewAt;

    if (reviewResult === "内部通过可送审") {
      nextStatus = "待送审";
      feedbackType = "内部通过";
      data.internalApprovedDate = startOfDay(reviewAt);
      data.remainingWorkdays = 0;
      data.blockedSince = null;
      data.blockedDays = 0;
      data.blockType = null;
    } else if (reviewResult === "内部不通过") {
      nextStatus = "修改中";
      feedbackType = "内部审核反馈";
      feedbackStatus = "待处理";
      resolvedAt = undefined;
      data.reviewRound = nextRound;
      data.lastFeedbackAt = reviewAt;
      data.blockType = "内部不通过";
      data.blockedSince = reviewAt;
      data.blockedDays = daysSince(reviewAt, now);
    } else if (reviewResult === "送审通过") {
      nextStatus = "已通过";
      feedbackType = "版权方过审";
      const finishDate = startOfDay(reviewAt);
      const startDate = task.actualStartDate ?? task.plannedStartDate ?? finishDate;
      data.copyrightApprovedDate = finishDate;
      data.actualStartDate = startDate;
      data.actualFinishDate = finishDate;
      data.actualWorkdays = workdaysBetween(startDate, finishDate);
      data.remainingWorkdays = 0;
      data.blockedSince = null;
      data.blockedDays = 0;
      data.blockType = null;
    } else {
      nextStatus = "修改中";
      feedbackType = "版权方反馈";
      feedbackStatus = "待处理";
      resolvedAt = undefined;
      data.reviewRound = nextRound;
      data.lastFeedbackAt = reviewAt;
      data.blockType = "版权方驳回";
      data.blockedSince = reviewAt;
      data.blockedDays = daysSince(reviewAt, now);
    }

    const feedbackText = withAttachmentNotes(feedbackContent ?? reviewResult, attachmentUrls);

    await tx.modelingFeedback.create({
      data: {
        modelingTaskId,
        feedbackType,
        roundNo: nextStatus === "修改中" ? nextRound : Math.max(1, task.reviewRound ?? latestFeedback?.roundNo ?? 1),
        feedbackByUserId: reviewerId,
        feedbackByName: reviewerName,
        feedbackAt: reviewAt,
        content: feedbackText,
        attachmentUrl: attachmentUrls[0],
        resolvedAt,
        resolvedBy: resolvedAt ? reviewerName : undefined,
        status: feedbackStatus,
      },
    });

    const updated = await tx.modelingTask.update({
      where: { id: modelingTaskId },
      data: {
        ...data,
        status: nextStatus,
      },
      select: { id: true, projectId: true, projectTaskId: true, styleCode: true, styleName: true, status: true },
    });

    const writebackDraft = await refreshProjectModelingProgress(tx, updated.projectId, updated.projectTaskId);

    return {
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      modelingTaskId: updated.id,
      styleCode: updated.styleCode,
      styleName: updated.styleName,
      reviewResult,
      modelingStatus: updated.status,
      writebackDraft,
    };
  });
}

export async function getProjectModelingStyles(projectId: string) {
  if (!projectId) {
    throw new ModelingContractError("缺少项目。");
  }

  const [tasks, users, vendors, projectTasks] = await Promise.all([
    prisma.modelingTask.findMany({
      where: { projectId },
      orderBy: [{ isFirstModelingStyle: "desc" }, { styleSequence: "asc" }, { styleCode: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        projectId: true,
        projectTaskId: true,
        sourceStyleId: true,
        styleCode: true,
        styleSequence: true,
        styleName: true,
        isFirstModelingStyle: true,
        isRequired: true,
        referenceImageUrls: true,
        difficulty: true,
        estimatedWorkdays: true,
        status: true,
        modelerId: true,
        isOutsourced: true,
        outsourceVendorId: true,
        plannedStartDate: true,
        plannedFinishDate: true,
        actualStartDate: true,
        internalApprovedDate: true,
        copyrightApprovedDate: true,
        reviewRound: true,
        lastFeedbackAt: true,
        blockedDays: true,
        blockType: true,
        lastUpdatedAt: true,
      },
    }),
    prisma.user.findMany({ where: { isModeler: true }, select: { id: true, name: true } }),
    prisma.outsourceVendor.findMany({ select: { id: true, name: true } }),
    prisma.projectTask.findMany({ where: { projectId, taskNo: { in: [7, 10] } }, select: { id: true, taskNo: true, taskName: true } }),
  ]);

  const feedbackRows =
    tasks.length > 0
      ? await prisma.modelingFeedback.findMany({
          where: { modelingTaskId: { in: tasks.map((task) => task.id) } },
          orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }, { createdAt: "desc" }],
          select: { modelingTaskId: true, roundNo: true, feedbackAt: true, content: true, status: true },
        })
      : [];
  const latestFeedbackByTaskId = new Map<string, (typeof feedbackRows)[number]>();

  for (const feedback of feedbackRows) {
    if (!latestFeedbackByTaskId.has(feedback.modelingTaskId)) {
      latestFeedbackByTaskId.set(feedback.modelingTaskId, feedback);
    }
  }

  const userById = new Map(users.map((user) => [user.id, user]));
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const projectTaskById = new Map(projectTasks.map((task) => [task.id, task]));

  return {
    projectId,
    styles: tasks.map((task) => {
      const feedback = latestFeedbackByTaskId.get(task.id);
      const projectTask = projectTaskById.get(task.projectTaskId);
      const status = normalizeStatus(task.status, task.isOutsourced);

      return {
        projectId: task.projectId,
        projectTaskId: task.projectTaskId,
        taskNo: projectTask?.taskNo ?? null,
        taskName: projectTask?.taskName ?? "",
        modelingTaskId: task.id,
        sourceStyleId: task.sourceStyleId,
        styleCode: task.styleCode,
        styleSequence: task.styleSequence,
        styleName: task.styleName,
        isFirstModelingStyle: task.isFirstModelingStyle,
        isRequired: task.isRequired,
        referenceImageUrls: referenceImagesFromJson(task.referenceImageUrls),
        difficulty: task.difficulty,
        estimatedWorkdays: task.estimatedWorkdays,
        modelingStatus: status,
        modelerId: task.modelerId,
        modelerName: task.modelerId ? userById.get(task.modelerId)?.name ?? "" : "",
        isOutsourced: task.isOutsourced,
        outsourceVendorId: task.outsourceVendorId,
        outsourceVendorName: task.outsourceVendorId ? vendorById.get(task.outsourceVendorId)?.name ?? "" : "",
        plannedStartDate: formatDate(task.plannedStartDate),
        plannedFinishDate: formatDate(task.plannedFinishDate),
        actualStartDate: formatDate(task.actualStartDate),
        internalApprovedDate: formatDate(task.internalApprovedDate),
        copyrightApprovedDate: formatDate(task.copyrightApprovedDate),
        reviewRound: task.reviewRound ?? feedback?.roundNo ?? 0,
        lastFeedbackAt: formatDate(task.lastFeedbackAt ?? feedback?.feedbackAt),
        latestFeedbackSummary: feedback?.content ?? "",
        feedbackStatus: feedback?.status ?? "",
        blockType: task.blockType,
        blockedDays: task.blockedDays ?? 0,
        lastUpdatedAt: formatDate(task.lastUpdatedAt),
      };
    }),
  };
}

export async function getProjectModelingProgress(projectId: string) {
  if (!projectId) {
    throw new ModelingContractError("缺少项目。");
  }

  const tasks = await prisma.modelingTask.findMany({
    where: { projectId, affectsProjectSchedule: true },
    select: {
      id: true,
      projectTaskId: true,
      isRequired: true,
      status: true,
      isOutsourced: true,
      modelerId: true,
      plannedFinishDate: true,
      actualFinishDate: true,
    },
  });
  const requiredTasks = tasks.filter((task) => task.isRequired);
  const totalRequiredStyles = requiredTasks.length;
  const approvedStyles = requiredTasks.filter((task) => normalizeStatus(task.status, task.isOutsourced) === "已通过").length;
  const inProgressStyles = requiredTasks.filter((task) => {
    const status = normalizeStatus(task.status, task.isOutsourced);
    return status === "已排期" || status === "建模中" || status === "修改中";
  }).length;
  const submittedStyles = requiredTasks.filter((task) => {
    const status = normalizeStatus(task.status, task.isOutsourced);
    return status === "待验收" || status === "已送审" || status === "等反馈";
  }).length;
  const waitingSubmissionStyles = requiredTasks.filter((task) => normalizeStatus(task.status, task.isOutsourced) === "待送审").length;
  const outsourcedStyles = requiredTasks.filter((task) => normalizeStatus(task.status, task.isOutsourced) === "外包中" || task.isOutsourced).length;
  const unstartedStyles = requiredTasks.filter((task) => normalizeStatus(task.status, task.isOutsourced) === "未启动").length;
  const unassignedStyles = requiredTasks.filter((task) => normalizeStatus(task.status, task.isOutsourced) === "未分配" && !task.modelerId && !task.isOutsourced).length;
  const canWritebackProjectTask = totalRequiredStyles > 0 && approvedStyles === totalRequiredStyles;

  return {
    projectId,
    projectTaskIds: [...new Set(tasks.map((task) => task.projectTaskId))],
    totalRequiredStyles,
    approvedStyles,
    inProgressStyles,
    submittedStyles,
    waitingSubmissionStyles,
    outsourcedStyles,
    unstartedStyles,
    unassignedStyles,
    progressPercent: totalRequiredStyles > 0 ? Math.round((approvedStyles / totalRequiredStyles) * 100) : 0,
    canWritebackProjectTask,
    projectedAllApprovedDate: formatDate(
      maxDate(requiredTasks.map((task) => (canWritebackProjectTask ? task.actualFinishDate : task.plannedFinishDate ?? task.actualFinishDate))),
    ),
  };
}

function parseStyleInputs(value: unknown): ParsedStyleInput[] {
  if (!Array.isArray(value)) {
    throw new ModelingContractError("款式清单格式不正确。");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ModelingContractError(`第 ${index + 1} 行款式格式不正确。`);
    }

    const record = item as Record<string, unknown>;
    const styleName = requiredText(record.styleName, `第 ${index + 1} 行缺少款式名称。`);
    const styleSequence = optionalText(record.styleSequence) ?? String(index + 1);
    const originalArtApprovedDate = parseDateOnly(record.originalArtApprovedDate);
    const difficulty = optionalText(record.difficulty) ?? "常规款";

    return {
      sourceStyleId: optionalText(record.sourceStyleId),
      projectTaskId: optionalText(record.projectTaskId),
      taskNo: optionalInt(record.taskNo),
      styleCode: optionalText(record.styleCode) ?? "",
      styleSequence,
      styleName,
      isRequired: typeof record.isRequired === "boolean" ? record.isRequired : true,
      isFirstModelingStyle: record.isFirstModelingStyle === true,
      productType: optionalText(record.productType),
      difficulty,
      estimatedWorkdays: optionalPositiveInt(record.estimatedWorkdays) ?? estimatedWorkdaysForDifficulty(difficulty),
      originalArtStatus: optionalText(record.originalArtStatus) ?? (originalArtApprovedDate ? "已过审" : "未过审"),
      originalArtApprovedDate,
      referenceImageUrls: parseReferenceImages(record.referenceImageUrls),
      notes: optionalText(record.notes),
    };
  });
}

function resolveStyleTargets(options: {
  projectTasks: ProjectTaskTarget[];
  styles: ParsedStyleInput[];
  topLevelProjectTaskId: string | null;
  topLevelTaskNo: number | null;
  firstStyleProjectTaskId: string | null;
  remainingStylesProjectTaskId: string | null;
}) {
  const { projectTasks, styles } = options;
  const byTaskNo = new Map(projectTasks.map((task) => [task.taskNo, task]));
  const byId = new Map(projectTasks.map((task) => [task.id, task]));
  const targets = new Map<ParsedStyleInput, ProjectTaskTarget>();

  for (const style of styles) {
    const expectedTaskNo = style.isFirstModelingStyle ? 7 : 10;
    const explicitProjectTaskId =
      style.projectTaskId ??
      (style.isFirstModelingStyle ? options.firstStyleProjectTaskId : options.remainingStylesProjectTaskId) ??
      options.topLevelProjectTaskId;
    const explicitTaskNo = style.taskNo ?? options.topLevelTaskNo;
    const target = explicitProjectTaskId ? byId.get(explicitProjectTaskId) : byTaskNo.get(expectedTaskNo);

    if (!target) {
      throw new ModelingContractError(`找不到任务 ${expectedTaskNo} 对应的项目任务。`, 404);
    }

    if (target.taskNo !== expectedTaskNo) {
      throw new ModelingContractError(style.isFirstModelingStyle ? "第一款必须挂到任务 7。" : "非第一款必须挂到任务 10。");
    }

    if (explicitTaskNo && explicitTaskNo !== expectedTaskNo) {
      throw new ModelingContractError(style.isFirstModelingStyle ? "第一款的 taskNo 必须是 7。" : "非第一款的 taskNo 必须是 10。");
    }

    targets.set(style, target);
  }

  return targets;
}

async function matchExistingModelingTask(
  tx: Prisma.TransactionClient,
  projectId: string,
  projectTaskId: string,
  style: ParsedStyleInput,
): Promise<MatchedTask | null> {
  const matchers: Array<{ where: Prisma.ModelingTaskWhereInput; label: string }> = [];

  if (style.sourceStyleId) matchers.push({ where: { projectId, projectTaskId, sourceStyleId: style.sourceStyleId }, label: "sourceStyleId" });
  if (style.styleCode) matchers.push({ where: { projectId, projectTaskId, styleCode: style.styleCode }, label: "styleCode" });
  if (style.styleSequence) matchers.push({ where: { projectId, projectTaskId, styleSequence: style.styleSequence }, label: "styleSequence" });
  if (style.styleName) matchers.push({ where: { projectId, projectTaskId, styleName: style.styleName }, label: "styleName" });

  for (const matcher of matchers) {
    const matches = await tx.modelingTask.findMany({
      where: matcher.where,
      select: { id: true, status: true },
      take: 2,
    });

    if (matches.length > 1) {
      throw new ModelingContractError(`款式匹配冲突：${matcher.label} 对应多条建模任务。`, 409);
    }

    if (matches.length === 1) {
      return matches[0];
    }
  }

  return null;
}

async function resolveProjectTaskIdForStart(projectId: string, taskNo: 7 | 10, projectTaskId?: string | null) {
  const task = projectTaskId
    ? await prisma.projectTask.findFirst({
        where: { id: projectTaskId, projectId },
        select: { id: true, taskNo: true },
      })
    : await prisma.projectTask.findFirst({
        where: { projectId, taskNo },
        select: { id: true, taskNo: true },
      });

  if (!task) {
    throw new ModelingContractError(`找不到任务 ${taskNo} 对应的项目任务。`, 404);
  }

  if (task.taskNo !== taskNo) {
    throw new ModelingContractError(`启动事件的 projectTaskId 不属于任务 ${taskNo}。`);
  }

  return task.id;
}

function normalizeReviewResult(value: string) {
  const text = value.replace(/[，,。.\s]/g, "");

  if (text === "内部通过可送审" || text === "内部通过") return "内部通过可送审";
  if (text === "内部不通过") return "内部不通过";
  if (text === "送审通过" || text === "版权方通过") return "送审通过";
  if (text === "送审不通过" || text === "版权方不通过" || text === "版权方驳回") return "送审不通过";

  throw new ModelingContractError("审核结果不在允许范围内。");
}

function normalizeStatus(value: string, isOutsourced: boolean): ModelingTaskStatus {
  if (isOutsourced && (value === "已排期" || value === "建模中" || value === "进行中")) {
    return "外包中";
  }

  if (value.includes("未启动")) return "未启动";
  if (value.includes("未分配")) return "未分配";
  if (value.includes("待验收") || value.includes("待内审") || value.includes("待审核")) return "待验收";
  if (value.includes("待送审")) return "待送审";
  if (value.includes("已送审") || value.includes("送审")) return "已送审";
  if (value.includes("等反馈") || value.includes("反馈")) return "等反馈";
  if (value.includes("修改")) return "修改中";
  if (value.includes("建模中") || value.includes("进行中")) return "建模中";
  if (value.includes("通过") || value.includes("完成")) return "已通过";
  if (value.includes("外包")) return "外包中";
  if (value.includes("暂停")) return "暂停";
  if (value.includes("取消")) return "取消";
  if (value.includes("排期")) return "已排期";

  return "未分配";
}

function parseReferenceImages(value: unknown): ModelingReferenceImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const url = optionalText(record.url);

      if (!url) {
        return null;
      }

      const image: ModelingReferenceImage = { url };
      const name = optionalText(record.name);
      const type = optionalText(record.type);

      if (name) image.name = name;
      if (type) image.type = type;

      return image;
    })
    .filter((item): item is ModelingReferenceImage => item !== null);
}

function referenceImagesFromJson(value: unknown): ModelingReferenceImage[] {
  return parseReferenceImages(value);
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function withAttachmentNotes(content: string, attachmentUrls: string[]) {
  if (attachmentUrls.length === 0) {
    return content;
  }

  return `${content}\n附件：${attachmentUrls.join("\n")}`;
}

function requiredText(value: unknown, message: string) {
  const text = optionalText(value);

  if (!text) {
    throw new ModelingContractError(message);
  }

  return text;
}

function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function requiredInt(value: unknown, message: string) {
  const number = optionalInt(value);

  if (number === null) {
    throw new ModelingContractError(message);
  }

  return number;
}

function optionalInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function optionalPositiveInt(value: unknown) {
  const number = optionalInt(value);
  return number && number > 0 ? number : null;
}

function parseDateOnly(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return startOfDay(value);
  }

  if (typeof value !== "string") {
    throw new ModelingContractError("日期格式不正确。");
  }

  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new ModelingContractError("日期格式不正确。");
  }

  return startOfDay(parsed);
}

function estimatedWorkdaysForDifficulty(difficulty: string) {
  if (difficulty.includes("换色")) return 1;
  if (difficulty.includes("简单")) return 4;
  if (difficulty.includes("困难") || difficulty.includes("正比例")) return 20;
  return 7;
}

function buildStyleCode(projectCode: string | null, projectName: string, taskNo: number, style: ParsedStyleInput) {
  const baseCode = projectCode?.trim() || projectName.replace(/\s+/g, "").slice(0, 12) || "STYLE";
  const sequence = style.styleSequence || style.sourceStyleId || "1";
  return `${baseCode}-T${taskNo}-S${String(sequence).padStart(2, "0")}`;
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function daysSince(date: Date, today = new Date()) {
  return Math.max(0, Math.floor((startOfDay(today).getTime() - startOfDay(date).getTime()) / 86_400_000));
}

function workdaysBetween(startDate: Date, finishDate: Date) {
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

function maxDate(values: Array<Date | null | undefined>) {
  const dates = values.filter((date): date is Date => date instanceof Date && Number.isFinite(date.getTime()));

  if (dates.length === 0) {
    return null;
  }

  return dates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest), dates[0]);
}

function formatDate(date?: Date | null) {
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}
