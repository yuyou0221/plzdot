import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildModelingTodosFromTasks } from "@/lib/modeling-todos";
import { createModelingProductGuideEvent } from "@/lib/modeling-product-guide-events";
import { refreshProjectModelingProgress } from "@/lib/modeling-schedule-mutation";
import type { ModelingFeedbackAttachments, ModelingReferenceImage, ModelingTaskStatus } from "@/lib/modeling-schedule-types";

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
  styleName: string;
  styleSequence: string | null;
};

type PreparedStyleSubmission = {
  style: ParsedStyleInput;
  target: ProjectTaskTarget;
  existing: MatchedTask | null;
};

const pendingConfirmationStatuses = new Set(["待确认", "退回补充"]);
const formalProgressExcludedStatuses = new Set<ModelingTaskStatus>(["待确认", "退回补充"]);

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
  const styleSubmissionBatchId = optionalText(payload.styleSubmissionBatchId) ?? optionalText(payload.submissionBatchId) ?? sourceRequestId ?? randomUUID();
  const requestedStyleSubmissionVersion = optionalPositiveInt(payload.styleSubmissionVersion) ?? optionalPositiveInt(payload.submissionVersion);
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
    const existingBatchTask = await tx.modelingTask.findFirst({
      where: { projectId, styleSubmissionBatchId },
      select: { styleSubmissionVersion: true },
      orderBy: { styleSubmissionVersion: "desc" },
    });
    const maxVersion = await tx.modelingTask.aggregate({
      where: { projectId },
      _max: { styleSubmissionVersion: true },
    });
    const styleSubmissionVersion =
      requestedStyleSubmissionVersion ?? existingBatchTask?.styleSubmissionVersion ?? (maxVersion._max.styleSubmissionVersion ?? 0) + 1;
    const preparedStyles: PreparedStyleSubmission[] = [];

    for (const style of styles) {
      const target = targets.get(style)!;
      const existing = await matchExistingModelingTask(tx, projectId, target.id, style);
      preparedStyles.push({ style, target, existing });
    }

    assertFullPendingSeriesResubmission(
      await tx.modelingTask.findMany({
        where: { projectId, status: { in: ["待确认", "退回补充"] } },
        select: {
          id: true,
          projectTaskId: true,
          styleCode: true,
          styleSequence: true,
          styleName: true,
        },
        orderBy: [{ styleSequence: "asc" }, { styleCode: "asc" }, { createdAt: "asc" }],
      }),
      preparedStyles,
    );
    assertNoDuplicateStyleMatches(preparedStyles);

    for (const { style, target, existing } of preparedStyles) {
      const styleCode = style.styleCode || buildStyleCode(project.projectCode, project.projectName, target.taskNo, style);
      const commonData = {
        sourceStyleId: style.sourceStyleId,
        styleSubmissionBatchId,
        styleSubmissionVersion,
        styleSubmissionSubmittedAt: now,
        styleSubmissionSubmittedBy: submittedByName,
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
        notes: style.notes,
        affectsProjectSchedule: true,
        lastUpdatedAt: now,
        lastUpdatedBy: submittedByName,
      };

      const task = existing
        ? await tx.modelingTask.update({
            where: { id: existing.id },
            data: {
              ...removeUndefined(commonData),
              ...(pendingConfirmationStatuses.has(existing.status)
                ? {
                    status: "待确认",
                    blockedSince: null,
                    blockedDays: 0,
                    blockType: null,
                  }
                : {}),
            },
            select: { id: true, status: true, styleCode: true, styleName: true, styleSequence: true },
          })
        : await tx.modelingTask.create({
            data: {
              projectId,
              projectTaskId: target.id,
              ...removeUndefined(commonData),
              status: "待确认",
              remainingWorkdays: style.estimatedWorkdays,
            } as Prisma.ModelingTaskUncheckedCreateInput,
            select: { id: true, status: true, styleCode: true, styleName: true, styleSequence: true },
          });

      touchedProjectTaskIds.add(target.id);
      resultStyles.push({
        sourceStyleId: style.sourceStyleId ?? undefined,
        styleSubmissionBatchId,
        styleSubmissionVersion,
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
      styleSubmissionBatchId,
      styleSubmissionVersion,
      styles: resultStyles,
      todos: buildModelingTodosFromTasks(
        resultStyles.map((style) => ({
          projectId,
          projectName: project.projectName,
          styleName: style.styleName,
          modelingStatus: style.modelingStatus,
        })),
      ),
      createdCount: resultStyles.filter((style) => style.createdOrUpdated === "created").length,
      updatedCount: resultStyles.filter((style) => style.createdOrUpdated === "updated").length,
      pendingConfirmationCount: resultStyles.filter((style) => style.modelingStatus === "待确认").length,
    };
  });
}

export async function confirmModelingStyleSubmission(payload: Record<string, unknown>, actor: ContractActor = {}) {
  const projectId = requiredText(payload.projectId, "缺少项目。");
  const action = normalizeConfirmationAction(requiredText(payload.action, "缺少确认动作。"));
  const requestedTaskIds = parseStringArray(payload.modelingTaskIds);
  const operatorName = optionalText(payload.operatorName) ?? actor.name ?? "建模排期";
  const note = optionalText(payload.note);
  const now = new Date();

  if (action === "return" && !note) {
    throw new ModelingContractError("退回补充必须填写原因。");
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, projectName: true },
    });

    if (!project) {
      throw new ModelingContractError("找不到对应项目。", 404);
    }

    const tasks = await tx.modelingTask.findMany({
      where: {
        projectId,
        ...(requestedTaskIds.length > 0 ? { id: { in: requestedTaskIds } } : {}),
        status: { in: ["待确认", "退回补充"] },
      },
      orderBy: [{ isFirstModelingStyle: "desc" }, { styleSequence: "asc" }, { styleCode: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        sourceStyleId: true,
        styleSubmissionBatchId: true,
        styleSubmissionVersion: true,
        projectTaskId: true,
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
      },
    });

    if (requestedTaskIds.length > 0 && tasks.length !== requestedTaskIds.length) {
      throw new ModelingContractError("部分款式不存在，或当前不是待确认 / 退回补充状态。", 404);
    }

    if (tasks.length === 0) {
      throw new ModelingContractError("当前项目没有待确认的建模款式。", 404);
    }

    const allProjectStylesForValidation = await tx.modelingTask.findMany({
      where: { projectId, status: { not: "取消" } },
      select: {
        id: true,
        projectTaskId: true,
        styleCode: true,
        styleSequence: true,
        styleName: true,
        isFirstModelingStyle: true,
        originalArtStatus: true,
        originalArtApprovedDate: true,
        difficulty: true,
        estimatedWorkdays: true,
      },
    });
    const projectTasks = await tx.projectTask.findMany({
      where: { id: { in: [...new Set(allProjectStylesForValidation.map((task) => task.projectTaskId))] }, projectId },
      select: { id: true, taskNo: true },
    });
    const taskNoByProjectTaskId = new Map(projectTasks.map((task) => [task.id, task.taskNo]));
    const issues = validateStyleConfirmationTasks(tasks, taskNoByProjectTaskId, allProjectStylesForValidation);

    if (action === "confirm" && issues.length > 0) {
      throw new ModelingContractError(`款式清单不能确认：${issues.join("；")}`);
    }

    const taskIds = tasks.map((task) => task.id);
    const startedProjectTaskIds =
      action === "confirm"
        ? new Set(
            (
              await tx.modelingTask.findMany({
                where: {
                  projectId,
                  projectTaskId: { in: [...new Set(tasks.map((task) => task.projectTaskId))] },
                  id: { notIn: taskIds },
                  status: { notIn: ["待确认", "退回补充", "未启动"] },
                },
                select: { projectTaskId: true },
              })
            ).map((task) => task.projectTaskId),
          )
        : new Set<string>();

    if (action === "return") {
      await Promise.all(
        tasks.map((task) =>
          tx.modelingFeedback.create({
            data: {
              modelingTaskId: task.id,
              feedbackType: "款式清单退回补充",
              roundNo: 1,
              feedbackByName: operatorName,
              feedbackAt: now,
              content: note ?? "款式清单退回补充",
              status: "待补充",
            },
          }),
        ),
      );

      await tx.modelingTask.updateMany({
        where: { id: { in: taskIds } },
        data: {
          status: "退回补充",
          lastFeedbackAt: now,
          lastUpdatedAt: now,
          lastUpdatedBy: operatorName,
          blockedSince: now,
          blockedDays: 0,
          blockType: "款式清单退回补充",
        },
      });
    } else {
      await Promise.all(
        tasks.map((task) =>
          tx.modelingTask.update({
            where: { id: task.id },
            data: {
              status: startedProjectTaskIds.has(task.projectTaskId) ? "未分配" : "未启动",
              lastUpdatedAt: now,
              lastUpdatedBy: operatorName,
              blockedSince: null,
              blockedDays: 0,
              blockType: startedProjectTaskIds.has(task.projectTaskId) ? "补款确认后自动进入未分配" : null,
            },
          }),
        ),
      );
    }

    const touchedProjectTaskIds = [...new Set(tasks.map((task) => task.projectTaskId))];
    for (const projectTaskId of touchedProjectTaskIds) {
      await refreshProjectModelingProgress(tx, projectId, projectTaskId);
    }

    const resultStyles = tasks.map((task) => ({
      projectId,
      projectTaskId: task.projectTaskId,
      taskNo: taskNoByProjectTaskId.get(task.projectTaskId) ?? null,
      modelingTaskId: task.id,
      sourceStyleId: task.sourceStyleId,
      styleSubmissionBatchId: task.styleSubmissionBatchId,
      styleSubmissionVersion: task.styleSubmissionVersion,
      styleCode: task.styleCode,
      styleSequence: task.styleSequence,
      styleName: task.styleName,
      isFirstModelingStyle: task.isFirstModelingStyle,
      isRequired: task.isRequired,
      referenceImageUrls: referenceImagesFromJson(task.referenceImageUrls),
      originalArtStatus: task.originalArtStatus,
      originalArtApprovedDate: formatDate(task.originalArtApprovedDate),
      difficulty: task.difficulty,
      estimatedWorkdays: task.estimatedWorkdays,
      previousStatus: task.status,
      modelingStatus: action === "confirm" ? (startedProjectTaskIds.has(task.projectTaskId) ? "未分配" : "未启动") : "退回补充",
      autoStartedAfterConfirmation: action === "confirm" && startedProjectTaskIds.has(task.projectTaskId),
    }));
    const eventType = action === "confirm" ? "style_list_confirmed" : "style_list_returned";
    const productGuideEvent = await createModelingProductGuideEvent(tx, {
      eventType,
      projectId,
      projectTaskId: touchedProjectTaskIds.length === 1 ? touchedProjectTaskIds[0] : null,
      generatedBy: operatorName,
      payload: {
        eventType,
        sourceModule: "modeling-schedule",
        targetModule: "product-guide",
        projectId,
        projectName: project.projectName,
        action,
        confirmedStyleCount: action === "confirm" ? tasks.length : 0,
        returnedStyleCount: action === "return" ? tasks.length : 0,
        returnReason: action === "return" ? (note ?? "") : null,
        styles: resultStyles.map((style) => ({
          projectId: style.projectId,
          projectTaskId: style.projectTaskId,
          taskNo: style.taskNo,
          modelingTaskId: style.modelingTaskId,
          sourceStyleId: style.sourceStyleId,
          styleSubmissionBatchId: style.styleSubmissionBatchId,
          styleSubmissionVersion: style.styleSubmissionVersion,
          styleCode: style.styleCode,
          styleSequence: style.styleSequence,
          styleName: style.styleName,
          isFirstModelingStyle: style.isFirstModelingStyle,
          isRequired: style.isRequired,
          previousStatus: style.previousStatus,
          modelingStatus: style.modelingStatus,
          autoStartedAfterConfirmation: style.autoStartedAfterConfirmation,
        })),
      },
    });

    return {
      projectId,
      projectName: project.projectName,
      action,
      confirmedCount: action === "confirm" ? tasks.length : 0,
      returnedCount: action === "return" ? tasks.length : 0,
      styles: resultStyles,
      productGuideEvent,
      issues,
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
      select: {
        id: true,
        projectTaskId: true,
        sourceStyleId: true,
        status: true,
        styleCode: true,
        styleSequence: true,
        styleName: true,
        isFirstModelingStyle: true,
        isRequired: true,
      },
      orderBy: [{ styleSequence: "asc" }, { styleCode: "asc" }, { createdAt: "asc" }],
    });

    if (targetTasks.length === 0) {
      throw new ModelingContractError(taskNo === 7 ? "找不到第一款建模款式。" : "找不到其余建模款式。", 404);
    }

    if (targetTasks.some((task) => pendingConfirmationStatuses.has(task.status))) {
      throw new ModelingContractError("款式清单还没有由建模侧确认，不能启动建模任务。");
    }

    const startableIds = targetTasks.filter((task) => normalizeStatus(task.status, false) === "未启动").map((task) => task.id);
    const startableIdSet = new Set(startableIds);
    const skippedStyles = targetTasks
      .filter((task) => !startableIdSet.has(task.id))
      .map((task) => ({
        projectId,
        projectTaskId: task.projectTaskId,
        taskNo,
        modelingTaskId: task.id,
        sourceStyleId: task.sourceStyleId,
        styleCode: task.styleCode,
        styleSequence: task.styleSequence,
        styleName: task.styleName,
        isFirstModelingStyle: task.isFirstModelingStyle,
        isRequired: task.isRequired,
        previousStatus: task.status,
        modelingStatus: task.status,
        skipReason: buildStartSkipReason(task.status),
      }));

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
      skippedCount: skippedStyles.length,
      skippedStyles,
      styles: targetTasks.map((task) => ({
        projectId,
        projectTaskId: task.projectTaskId,
        taskNo,
        modelingTaskId: task.id,
        sourceStyleId: task.sourceStyleId,
        styleCode: task.styleCode,
        styleSequence: task.styleSequence,
        styleName: task.styleName,
        isFirstModelingStyle: task.isFirstModelingStyle,
        isRequired: task.isRequired,
        previousStatus: task.status,
        modelingStatus: startableIdSet.has(task.id) ? "未分配" : task.status,
        startResult: startableIdSet.has(task.id) ? "started" : "skipped",
        skipReason: startableIdSet.has(task.id) ? "" : buildStartSkipReason(task.status),
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
  const feedbackAttachments = parseReviewFeedbackAttachments(payload);
  const submissionFeedbackId = optionalText(payload.submissionFeedbackId) ?? optionalText(payload.feedbackId) ?? optionalText(payload.modelingFeedbackId);

  if ((reviewResult === "内部不通过" || reviewResult === "送审不通过") && !feedbackContent) {
    throw new ModelingContractError("内部不通过或送审不通过必须填写文字反馈。");
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.modelingTask.findUnique({
      where: { id: modelingTaskId },
      select: {
        id: true,
        projectId: true,
        projectTaskId: true,
        styleCode: true,
        styleName: true,
        status: true,
        isOutsourced: true,
        modelerId: true,
        plannedStartDate: true,
        actualStartDate: true,
        activeWorkStartedAt: true,
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

    assertReviewResultTransitionAllowed(reviewResult, normalizeStatus(task.status, task.isOutsourced));

    const latestFeedback = await tx.modelingFeedback.findFirst({
      where: { modelingTaskId },
      orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }],
      select: { roundNo: true },
    });
    const latestSubmissionFeedback = await tx.modelingFeedback.findFirst({
      where: { modelingTaskId, feedbackType: "建模师提交" },
      orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, roundNo: true, status: true, submissionSnapshot: true },
    });

    if (!latestSubmissionFeedback) {
      throw new ModelingContractError("当前款式没有可审核的建模成果提交记录。");
    }

    if (submissionFeedbackId && submissionFeedbackId !== latestSubmissionFeedback.id) {
      throw new ModelingContractError("审核结果对应的不是最新建模成果提交，请刷新后重新审核。", 409);
    }

    assertReviewTargetSubmissionAllowed(reviewResult, latestSubmissionFeedback.status);

    const submissionRestoreStatus = readSubmissionRestoreStatus(latestSubmissionFeedback?.submissionSnapshot);
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
      await createWorkLogIfNeeded(tx, task, now, "internal_review_approved", reviewerName);
      Object.assign(data, buildStopTimerData(task.activeWorkStartedAt, now));
      data.internalApprovedDate = startOfDay(reviewAt);
      data.remainingWorkdays = 0;
      data.blockedSince = null;
      data.blockedDays = 0;
      data.blockType = null;
    } else if (reviewResult === "内部不通过") {
      nextStatus = submissionRestoreStatus;
      feedbackType = "内部审核反馈";
      feedbackStatus = "待处理";
      resolvedAt = undefined;
      data.reviewRound = nextRound;
      data.lastFeedbackAt = reviewAt;
      data.blockType = "内部不通过";
      data.blockedSince = null;
      data.blockedDays = 0;
    } else if (reviewResult === "已送审") {
      nextStatus = "已送审";
      feedbackType = "送审记录";
      resolvedAt = undefined;
      data.blockedSince = now;
      data.blockedDays = 0;
      data.blockType = "送审中";
    } else if (reviewResult === "等反馈") {
      nextStatus = "等反馈";
      feedbackType = "等待版权方反馈";
      resolvedAt = undefined;
      data.blockedSince = now;
      data.blockedDays = 0;
      data.blockType = "等版权方反馈";
    } else if (reviewResult === "送审通过") {
      nextStatus = "已通过";
      feedbackType = "版权方过审";
      await createWorkLogIfNeeded(tx, task, now, "copyright_review_approved", reviewerName);
      Object.assign(data, buildStopTimerData(task.activeWorkStartedAt, now));
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
      nextStatus = submissionRestoreStatus;
      feedbackType = "版权方反馈";
      feedbackStatus = "待处理";
      resolvedAt = undefined;
      data.reviewRound = nextRound;
      data.lastFeedbackAt = reviewAt;
      data.blockType = "版权方驳回";
      data.blockedSince = null;
      data.blockedDays = 0;
    }

    const feedbackText = withAttachmentNotes(feedbackContent ?? reviewResult, feedbackAttachments);

    await tx.modelingFeedback.create({
      data: {
        modelingTaskId,
        feedbackType,
        roundNo: nextStatus === "排队中" ? nextRound : Math.max(1, task.reviewRound ?? latestFeedback?.roundNo ?? 1),
        feedbackByUserId: reviewerId,
        feedbackByName: reviewerName,
        feedbackAt: reviewAt,
        content: feedbackText,
        attachmentUrl: firstReviewAttachmentUrl(feedbackAttachments),
        resolvedAt,
        resolvedBy: resolvedAt ? reviewerName : undefined,
        status: feedbackStatus,
      },
    });

    await tx.modelingFeedback.update({
      where: { id: latestSubmissionFeedback.id },
      data: {
        status: buildReviewedSubmissionStatus(reviewResult),
        resolvedAt: reviewAt,
        resolvedBy: reviewerName,
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
      submissionFeedbackId: latestSubmissionFeedback.id,
      reviewedSubmissionRound: latestSubmissionFeedback.roundNo,
      modelingStatus: updated.status,
      feedbackContent: feedbackText,
      feedbackAttachments: feedbackAttachments.structured,
      attachmentUrls: feedbackAttachments.urls,
      restoredFromSubmissionSnapshot: reviewResult === "内部不通过" || reviewResult === "送审不通过",
      restoreStatusOnRejection: reviewResult === "内部不通过" || reviewResult === "送审不通过" ? submissionRestoreStatus : undefined,
      writebackDraft,
    };
  });
}

export async function cancelModelingStyle(payload: Record<string, unknown>, actor: ContractActor = {}) {
  const modelingTaskId = requiredText(payload.modelingTaskId, "缺少建模款式任务。");
  const cancelReason = optionalText(payload.cancelReason) ?? optionalText(payload.reason);
  const operatorName = optionalText(payload.operatorName) ?? actor.name ?? "建模排期";
  const operatorId = optionalText(payload.operatorId) ?? actor.id ?? null;
  const releaseScheduleRequirement = payload.releaseScheduleRequirement === true;
  const now = new Date();

  if (!cancelReason) {
    throw new ModelingContractError("取消款式必须填写原因。");
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.modelingTask.findUnique({
      where: { id: modelingTaskId },
      select: {
        id: true,
        projectId: true,
        projectTaskId: true,
        styleCode: true,
        styleName: true,
        status: true,
        isRequired: true,
        affectsProjectSchedule: true,
        modelerId: true,
        activeWorkStartedAt: true,
        reviewRound: true,
      },
    });

    if (!task) {
      throw new ModelingContractError("找不到对应建模款式任务。", 404);
    }

    const payloadProjectId = optionalText(payload.projectId);
    const payloadProjectTaskId = optionalText(payload.projectTaskId);

    if (payloadProjectId && payloadProjectId !== task.projectId) {
      throw new ModelingContractError("取消事件的项目与建模款式不一致。");
    }

    if (payloadProjectTaskId && payloadProjectTaskId !== task.projectTaskId) {
      throw new ModelingContractError("取消事件的项目任务与建模款式不一致。");
    }

    const currentStatus = normalizeStatus(task.status, false);

    if (currentStatus === "已通过") {
      throw new ModelingContractError("已通过款式不能直接取消，请先走重开事件。");
    }

    if (currentStatus === "取消") {
      const writebackDraft = await refreshProjectModelingProgress(tx, task.projectId, task.projectTaskId);

      return {
        projectId: task.projectId,
        projectTaskId: task.projectTaskId,
        modelingTaskId: task.id,
        styleCode: task.styleCode,
        styleName: task.styleName,
        previousStatus: task.status,
        modelingStatus: task.status,
        releasedScheduleRequirement: false,
        writebackDraft,
      };
    }

    if (task.isRequired && !releaseScheduleRequirement) {
      throw new ModelingContractError("必做款式取消会影响项目建模完成口径，必须明确 releaseScheduleRequirement=true。");
    }

    const latestFeedback = await tx.modelingFeedback.findFirst({
      where: { modelingTaskId },
      orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }, { createdAt: "desc" }],
      select: { roundNo: true },
    });
    const roundNo = Math.max(task.reviewRound ?? 0, latestFeedback?.roundNo ?? 0) + 1;
    const data: Prisma.ModelingTaskUpdateInput = {
      status: "取消",
      isRequired: task.isRequired && releaseScheduleRequirement ? false : task.isRequired,
      affectsProjectSchedule: task.affectsProjectSchedule && releaseScheduleRequirement ? false : task.affectsProjectSchedule,
      activeWorkStartedAt: null,
      lastFeedbackAt: now,
      lastUpdatedAt: now,
      lastUpdatedBy: operatorName,
      blockedSince: null,
      blockedDays: 0,
      blockType: null,
    };

    await createWorkLogIfNeeded(tx, task, now, "cancel_style", operatorName);
    Object.assign(data, buildStopTimerData(task.activeWorkStartedAt, now));

    await tx.modelingFeedback.create({
      data: {
        modelingTaskId,
        feedbackType: "款式取消",
        roundNo,
        feedbackByUserId: operatorId,
        feedbackByName: operatorName,
        feedbackAt: now,
        content: cancelReason,
        resolvedAt: now,
        resolvedBy: operatorName,
        status: "已记录",
      },
    });

    const updated = await tx.modelingTask.update({
      where: { id: modelingTaskId },
      data,
      select: { id: true, projectId: true, projectTaskId: true, styleCode: true, styleName: true, status: true, isRequired: true, affectsProjectSchedule: true },
    });

    const writebackDraft = await refreshProjectModelingProgress(tx, updated.projectId, updated.projectTaskId);

    return {
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      modelingTaskId: updated.id,
      styleCode: updated.styleCode,
      styleName: updated.styleName,
      previousStatus: task.status,
      modelingStatus: updated.status,
      releasedScheduleRequirement: task.isRequired && releaseScheduleRequirement,
      isRequired: updated.isRequired,
      affectsProjectSchedule: updated.affectsProjectSchedule,
      writebackDraft,
    };
  });
}

export async function reopenApprovedModelingStyle(payload: Record<string, unknown>, actor: ContractActor = {}) {
  const modelingTaskId = requiredText(payload.modelingTaskId, "缺少建模款式任务。");
  const reopenReason = optionalText(payload.reopenReason) ?? optionalText(payload.reason);
  const operatorName = optionalText(payload.operatorName) ?? actor.name ?? "建模排期";
  const operatorId = optionalText(payload.operatorId) ?? actor.id ?? null;
  const now = new Date();

  if (!reopenReason) {
    throw new ModelingContractError("已通过款式重开必须填写原因。");
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.modelingTask.findUnique({
      where: { id: modelingTaskId },
      select: {
        id: true,
        projectId: true,
        projectTaskId: true,
        styleCode: true,
        styleName: true,
        status: true,
        isOutsourced: true,
        estimatedWorkdays: true,
        modelerId: true,
        activeWorkStartedAt: true,
        reviewRound: true,
      },
    });

    if (!task) {
      throw new ModelingContractError("找不到对应建模款式任务。", 404);
    }

    const payloadProjectId = optionalText(payload.projectId);
    const payloadProjectTaskId = optionalText(payload.projectTaskId);

    if (payloadProjectId && payloadProjectId !== task.projectId) {
      throw new ModelingContractError("重开事件的项目与建模款式不一致。");
    }

    if (payloadProjectTaskId && payloadProjectTaskId !== task.projectTaskId) {
      throw new ModelingContractError("重开事件的项目任务与建模款式不一致。");
    }

    if (normalizeStatus(task.status, task.isOutsourced) !== "已通过") {
      throw new ModelingContractError(`只有已通过款式可以重开。当前状态：${task.status}。`);
    }

    const latestFeedback = await tx.modelingFeedback.findFirst({
      where: { modelingTaskId },
      orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }, { createdAt: "desc" }],
      select: { roundNo: true },
    });
    const roundNo = Math.max(task.reviewRound ?? 0, latestFeedback?.roundNo ?? 0) + 1;
    const data: Prisma.ModelingTaskUpdateInput = {
      status: "排队中",
      actualFinishDate: null,
      internalApprovedDate: null,
      copyrightApprovedDate: null,
      actualWorkdays: null,
      remainingWorkdays: task.estimatedWorkdays,
      activeWorkStartedAt: null,
      reviewRound: roundNo,
      lastFeedbackAt: now,
      lastUpdatedAt: now,
      lastUpdatedBy: operatorName,
      blockedSince: null,
      blockedDays: 0,
      blockType: null,
    };

    await createWorkLogIfNeeded(tx, task, now, "reopen_approved_style", operatorName);
    Object.assign(data, buildStopTimerData(task.activeWorkStartedAt, now));

    await tx.modelingFeedback.create({
      data: {
        modelingTaskId,
        feedbackType: "已通过款式重开",
        roundNo,
        feedbackByUserId: operatorId,
        feedbackByName: operatorName,
        feedbackAt: now,
        content: reopenReason,
        status: "待处理",
      },
    });

    const updated = await tx.modelingTask.update({
      where: { id: modelingTaskId },
      data,
      select: { id: true, projectId: true, projectTaskId: true, styleCode: true, styleName: true, status: true },
    });

    const writebackDraft = await refreshProjectModelingProgress(tx, updated.projectId, updated.projectTaskId);

    return {
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      modelingTaskId: updated.id,
      styleCode: updated.styleCode,
      styleName: updated.styleName,
      previousStatus: task.status,
      modelingStatus: updated.status,
      reviewRound: roundNo,
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
        styleSubmissionBatchId: true,
        styleSubmissionVersion: true,
        styleSubmissionSubmittedAt: true,
        styleSubmissionSubmittedBy: true,
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
        actualWorkMinutes: true,
        activeWorkStartedAt: true,
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
        styleSubmissionBatchId: task.styleSubmissionBatchId,
        styleSubmissionVersion: task.styleSubmissionVersion,
        styleSubmissionSubmittedAt: formatDateTime(task.styleSubmissionSubmittedAt),
        styleSubmissionSubmittedBy: task.styleSubmissionSubmittedBy,
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
        actualWorkMinutes: task.actualWorkMinutes,
        activeWorkStartedAt: formatDateTime(task.activeWorkStartedAt),
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
  const requiredTasks = tasks.filter((task) => task.isRequired && !formalProgressExcludedStatuses.has(normalizeStatus(task.status, task.isOutsourced)));
  const totalRequiredStyles = requiredTasks.length;
  const approvedStyles = requiredTasks.filter((task) => normalizeStatus(task.status, task.isOutsourced) === "已通过").length;
  const inProgressStyles = requiredTasks.filter((task) => {
    const status = normalizeStatus(task.status, task.isOutsourced);
    return status === "已排期" || status === "排队中" || status === "建模中" || status === "修改中";
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

function normalizeConfirmationAction(value: string) {
  const text = value.replace(/[，,。.\s_-]/g, "").toLowerCase();

  if (text === "confirm" || text === "approve" || text === "confirmed" || value === "确认通过" || value === "确认") {
    return "confirm";
  }

  if (text === "return" || text === "reject" || text === "rollback" || value === "退回补充" || value === "退回") {
    return "return";
  }

  throw new ModelingContractError("确认动作只支持确认通过或退回补充。");
}

function validateStyleConfirmationTasks(
  tasks: Array<{
    id: string;
    projectTaskId: string;
    styleCode: string;
    styleSequence: string | null;
    styleName: string;
    isFirstModelingStyle: boolean;
    originalArtStatus: string;
    originalArtApprovedDate: Date | null;
    difficulty: string;
    estimatedWorkdays: number;
  }>,
  taskNoByProjectTaskId: Map<string, number>,
  allSeriesTasks = tasks,
) {
  const issues: string[] = [];
  const firstStyleCount = allSeriesTasks.filter((task) => task.isFirstModelingStyle).length;

  if (firstStyleCount !== 1) {
    issues.push("必须且只能有 1 个第一款建模款式");
  }

  const sequenceCounts = new Map<string, number>();
  for (const task of allSeriesTasks) {
    const sequence = (task.styleSequence ?? "").trim();
    if (sequence) {
      sequenceCounts.set(sequence, (sequenceCounts.get(sequence) ?? 0) + 1);
    }
  }

  for (const [sequence, count] of sequenceCounts) {
    if (count > 1) {
      issues.push(`款式序号 ${sequence} 重复`);
    }
  }

  for (const task of tasks) {
    const taskNo = taskNoByProjectTaskId.get(task.projectTaskId);

    if (!task.styleName.trim()) {
      issues.push("存在款式名称为空的记录");
    }

    if (task.isFirstModelingStyle && taskNo !== 7) {
      issues.push(`${task.styleName} 是第一款，但没有挂到任务 7`);
    }

    if (!task.isFirstModelingStyle && taskNo !== 10) {
      issues.push(`${task.styleName} 不是第一款，但没有挂到任务 10`);
    }

    if (!task.difficulty.trim()) {
      issues.push(`${task.styleName} 缺少难度`);
    }

    if (!Number.isFinite(task.estimatedWorkdays) || task.estimatedWorkdays <= 0) {
      issues.push(`${task.styleName} 预计建模天数不正确`);
    }

    if (!isOriginalArtApproved(task.originalArtStatus, task.originalArtApprovedDate)) {
      issues.push(`${task.styleName} 原画尚未过审`);
    }
  }

  return [...new Set(issues)];
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
      select: { id: true, status: true, styleName: true, styleSequence: true },
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

function assertFullPendingSeriesResubmission(
  pendingTasks: Array<{
    id: string;
    projectTaskId: string;
    styleCode: string;
    styleSequence: string | null;
    styleName: string;
  }>,
  preparedStyles: PreparedStyleSubmission[],
) {
  if (pendingTasks.length === 0) {
    return;
  }

  const pendingTaskIds = new Set(pendingTasks.map((task) => task.id));
  const matchedPendingTaskIds = new Set(
    preparedStyles
      .map((item) => item.existing?.id)
      .filter((taskId): taskId is string => typeof taskId === "string" && pendingTaskIds.has(taskId)),
  );
  const missingTasks = pendingTasks.filter((task) => !matchedPendingTaskIds.has(task.id));

  if (missingTasks.length === 0) {
    return;
  }

  const missingNames = missingTasks
    .slice(0, 5)
    .map((task) => task.styleName || task.styleSequence || task.styleCode)
    .join("、");

  throw new ModelingContractError(
    `重新提交款式清单必须包含同一系列的完整款式，不能通过缺失删除款式。缺少：${missingNames}${missingTasks.length > 5 ? "等" : ""}。如需取消款式，请走单独取消事件。`,
    409,
  );
}

function assertNoDuplicateStyleMatches(preparedStyles: PreparedStyleSubmission[]) {
  const counts = new Map<string, number>();

  for (const item of preparedStyles) {
    if (!item.existing) {
      continue;
    }

    counts.set(item.existing.id, (counts.get(item.existing.id) ?? 0) + 1);
  }

  const duplicatedTaskId = [...counts.entries()].find(([, count]) => count > 1)?.[0];

  if (!duplicatedTaskId) {
    return;
  }

  const duplicatedTask = preparedStyles.find((item) => item.existing?.id === duplicatedTaskId)?.existing;

  throw new ModelingContractError(`提交的款式清单存在重复匹配：${duplicatedTask?.styleName ?? duplicatedTaskId}。请检查款式序号、款式编号或 sourceStyleId。`, 409);
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
  if (text === "已送审" || text === "送审中" || text === "提交版权方") return "已送审";
  if (text === "等反馈" || text === "等待反馈" || text === "等待版权方反馈") return "等反馈";
  if (text === "送审通过" || text === "版权方通过") return "送审通过";
  if (text === "送审不通过" || text === "版权方不通过" || text === "版权方驳回") return "送审不通过";

  throw new ModelingContractError("审核结果不在允许范围内。");
}

function assertReviewResultTransitionAllowed(reviewResult: string, currentStatus: ModelingTaskStatus) {
  if (reviewResult === "内部通过可送审" || reviewResult === "内部不通过") {
    if (currentStatus !== "待验收") {
      throw new ModelingContractError(`建模成果尚未提交给产品检修，不能写入内部审核结果。当前状态：${currentStatus}。`);
    }

    return;
  }

  if (reviewResult === "已送审") {
    if (currentStatus !== "待送审") {
      throw new ModelingContractError(`款式尚未内部通过，不能标记已送审。当前状态：${currentStatus}。`);
    }

    return;
  }

  if (reviewResult === "等反馈") {
    if (currentStatus !== "已送审" && currentStatus !== "待送审") {
      throw new ModelingContractError(`款式尚未送审，不能标记等反馈。当前状态：${currentStatus}。`);
    }

    return;
  }

  if (reviewResult === "送审通过" || reviewResult === "送审不通过") {
    if (currentStatus !== "待送审" && currentStatus !== "已送审" && currentStatus !== "等反馈") {
      throw new ModelingContractError(`款式尚未进入送审阶段，不能写入版权方送审结果。当前状态：${currentStatus}。`);
    }
  }
}

function assertReviewTargetSubmissionAllowed(reviewResult: string, submissionStatus: string) {
  if (reviewResult === "内部通过可送审" || reviewResult === "内部不通过") {
    if (submissionStatus !== "待产品美术验收") {
      throw new ModelingContractError(`当前建模成果提交已经处理过，不能重复写入内部审核结果。提交状态：${submissionStatus}。`, 409);
    }

    return;
  }

  if (
    submissionStatus !== "内部通过" &&
    submissionStatus !== "内部通过可送审" &&
    submissionStatus !== "待版权方送审" &&
    submissionStatus !== "已送审" &&
    submissionStatus !== "等版权方反馈"
  ) {
    throw new ModelingContractError(`当前建模成果尚未内部通过，不能写入版权方送审结果。提交状态：${submissionStatus}。`, 409);
  }
}

function buildReviewedSubmissionStatus(reviewResult: string) {
  if (reviewResult === "内部通过可送审") return "内部通过";
  if (reviewResult === "内部不通过") return "内部不通过";
  if (reviewResult === "已送审") return "已送审";
  if (reviewResult === "等反馈") return "等版权方反馈";
  if (reviewResult === "送审通过") return "版权方过审";
  return "版权方不通过";
}

function readSubmissionRestoreStatus(value: unknown): ModelingTaskStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "排队中";
  }

  const status = normalizeStatus(String((value as Record<string, unknown>).restoreStatusOnRejection ?? ""), false);

  return status === "未分配" || status === "未启动" || status === "待确认" || status === "退回补充" || status === "已通过" || status === "取消" ? "排队中" : status;
}

function normalizeStatus(value: string, isOutsourced: boolean): ModelingTaskStatus {
  if (isOutsourced && (value === "已排期" || value === "排队中" || value === "建模中" || value === "进行中")) {
    return "外包中";
  }

  if (value.includes("退回")) return "退回补充";
  if (value.includes("待确认")) return "待确认";
  if (value.includes("未启动")) return "未启动";
  if (value.includes("未分配")) return "未分配";
  if (value.includes("待验收") || value.includes("待内审") || value.includes("待审核")) return "待验收";
  if (value.includes("待送审")) return "待送审";
  if (value.includes("已送审") || value.includes("送审")) return "已送审";
  if (value.includes("等反馈") || value.includes("反馈")) return "等反馈";
  if (value.includes("排队")) return "排队中";
  if (value.includes("修改")) return "修改中";
  if (value.includes("建模中") || value.includes("进行中")) return "建模中";
  if (value.includes("通过") || value.includes("完成")) return "已通过";
  if (value.includes("外包")) return "外包中";
  if (value.includes("暂停")) return "暂停";
  if (value.includes("取消")) return "取消";
  if (value.includes("排期")) return "已排期";

  return "未分配";
}

function buildStartSkipReason(status: string) {
  const normalizedStatus = normalizeStatus(status, false);

  if (normalizedStatus === "未分配" || normalizedStatus === "已排期" || normalizedStatus === "排队中" || normalizedStatus === "建模中" || normalizedStatus === "外包中") {
    return "已启动，无需重复启动";
  }

  if (normalizedStatus === "待验收" || normalizedStatus === "待送审" || normalizedStatus === "已送审" || normalizedStatus === "等反馈") {
    return "已进入审核或送审流程";
  }

  if (normalizedStatus === "已通过") {
    return "已通过，无需启动";
  }

  if (normalizedStatus === "暂停" || normalizedStatus === "取消") {
    return `当前状态为${normalizedStatus}，不能启动`;
  }

  return `当前状态为${normalizedStatus}，不能启动`;
}

function isOriginalArtApproved(status: string, approvedDate: Date | null) {
  const text = status.trim();

  if (text.includes("未") || text.includes("待") || text.includes("不通过") || text.includes("驳回")) {
    return false;
  }

  return Boolean(approvedDate) || text.includes("已过审") || text.includes("过审") || text.includes("通过") || text.includes("确认");
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

type ReviewAttachmentItem = {
  label: string;
  url: string;
};

type ParsedReviewFeedbackAttachments = {
  structured: ModelingFeedbackAttachments | null;
  items: ReviewAttachmentItem[];
  urls: string[];
};

function parseReviewFeedbackAttachments(payload: Record<string, unknown>): ParsedReviewFeedbackAttachments {
  const items: ReviewAttachmentItem[] = [];
  const structured = parseStructuredFeedbackAttachments(payload.feedbackAttachments ?? payload.attachments);

  if (structured?.imageUrl) {
    items.push({ label: "图片反馈", url: structured.imageUrl });
  }

  if (structured?.pdfUrl) {
    items.push({ label: "PDF 反馈", url: structured.pdfUrl });
  }

  if (structured?.pptUrl) {
    items.push({ label: "PPT 反馈", url: structured.pptUrl });
  }

  for (const url of parseStringArray(payload.attachmentUrls)) {
    items.push({ label: "附件", url });
  }

  const dedupedItems: ReviewAttachmentItem[] = [];
  const seenUrls = new Set<string>();

  for (const item of items) {
    if (seenUrls.has(item.url)) {
      continue;
    }

    seenUrls.add(item.url);
    dedupedItems.push(item);
  }

  return {
    structured: firstStructuredFeedbackAttachmentUrl(structured) ? structured : null,
    items: dedupedItems,
    urls: dedupedItems.map((item) => item.url),
  };
}

function parseStructuredFeedbackAttachments(value: unknown): ModelingFeedbackAttachments | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const attachments: ModelingFeedbackAttachments = {
    imageUrl: optionalText(record.imageUrl),
    pdfUrl: optionalText(record.pdfUrl),
    pptUrl: optionalText(record.pptUrl),
  };

  return firstStructuredFeedbackAttachmentUrl(attachments) ? attachments : null;
}

function firstStructuredFeedbackAttachmentUrl(attachments?: ModelingFeedbackAttachments | null) {
  return attachments?.imageUrl || attachments?.pdfUrl || attachments?.pptUrl || undefined;
}

function firstReviewAttachmentUrl(attachments: ParsedReviewFeedbackAttachments) {
  return attachments.urls[0];
}

function withAttachmentNotes(content: string, attachments: ParsedReviewFeedbackAttachments) {
  if (attachments.items.length === 0) {
    return content;
  }

  return [content, ...attachments.items.map((item) => `${item.label}：${item.url}`)].join("\n");
}

async function createWorkLogIfNeeded(
  tx: Prisma.TransactionClient,
  task: {
    id: string;
    projectId: string;
    projectTaskId: string;
    modelerId: string | null;
    activeWorkStartedAt: Date | null;
  },
  endedAt: Date,
  stopReason: string,
  stoppedBy: string,
) {
  const durationMinutes = minutesBetween(task.activeWorkStartedAt, endedAt);

  if (!task.activeWorkStartedAt || durationMinutes <= 0) {
    return;
  }

  await tx.modelingWorkLog.create({
    data: {
      modelingTaskId: task.id,
      projectId: task.projectId,
      projectTaskId: task.projectTaskId,
      modelerId: task.modelerId,
      startedAt: task.activeWorkStartedAt,
      endedAt,
      durationMinutes,
      stopReason,
      stoppedBy,
    },
  });
}

function buildStopTimerData(startedAt: Date | null, now: Date): Prisma.ModelingTaskUpdateInput {
  const data: Prisma.ModelingTaskUpdateInput = {
    activeWorkStartedAt: null,
  };
  const minutes = minutesBetween(startedAt, now);

  if (minutes > 0) {
    data.actualWorkMinutes = { increment: minutes };
  }

  return data;
}

function minutesBetween(startedAt: Date | null, endedAt: Date) {
  if (!startedAt || Number.isNaN(startedAt.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000));
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

function formatDateTime(date?: Date | null) {
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
