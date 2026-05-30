import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth/permissions";
import { createModelingProductGuideEvent } from "@/lib/modeling-product-guide-events";
import type {
  ModelingFeedbackAttachments,
  ModelingTaskStatus,
  ModelingTaskUpdateEventType,
  ModelingWritebackDraft,
} from "@/lib/modeling-schedule-types";

const validStatuses = new Set<ModelingTaskStatus>([
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
]);
const reviewBlockedStatuses = new Set<ModelingTaskStatus>(["待验收", "已送审", "等反馈"]);
const formalModelingStatuses = new Set<ModelingTaskStatus>(["排队中", "建模中", "修改中", "待验收", "待送审", "已送审", "等反馈", "已通过", "外包中"]);
const productReviewManagedStatuses = new Set<ModelingTaskStatus>(["待验收", "待送审", "已送审", "等反馈", "已通过"]);
const timerActiveStatuses = new Set<ModelingTaskStatus>(["排队中", "建模中", "修改中"]);
const preConfirmationStatuses = new Set<ModelingTaskStatus>(["待确认", "退回补充"]);

export class ModelingTaskUpdateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ModelingTaskUpdateError";
    this.statusCode = statusCode;
  }
}

export async function updateModelingWorkTimer(taskId: string, action: "start" | "stop", actor: AuthUser) {
  if (!taskId || taskId.startsWith("virtual-")) {
    throw new ModelingTaskUpdateError("虚拟款式不能记录建模工时，请先录入真实款式。", 400);
  }

  if (action !== "start" && action !== "stop") {
    throw new ModelingTaskUpdateError("计时操作不正确。", 400);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.modelingTask.findUnique({ where: { id: taskId } });

    if (!existing) {
      throw new ModelingTaskUpdateError("没有找到这条建模款式。", 404);
    }

    const operatorName = actor.name || "建模师";
    const now = new Date();
    const today = startOfDay(now);
    const currentStatus = normalizeExistingStatus(existing.status, existing.isOutsourced);

    if (preConfirmationStatuses.has(currentStatus)) {
      throw new ModelingTaskUpdateError("款式清单还没有由建模侧确认，不能记录建模工时。", 400);
    }

    if (actor.authRole === "viewer" && existing.modelerId !== actor.id) {
      throw new ModelingTaskUpdateError("只能记录分配给自己的建模款式工时。", 403);
    }

    if (!existing.modelerId) {
      throw new ModelingTaskUpdateError("请先给这款分配建模师，再开始记录工时。", 400);
    }

    if (action === "start") {
      if (!["已排期", "排队中", "建模中", "修改中"].includes(currentStatus)) {
        throw new ModelingTaskUpdateError("只有已排期、排队中、建模中或修改中的款式可以开始计时。", 400);
      }

      if (existing.isOutsourced) {
        throw new ModelingTaskUpdateError("外包款式不记录建模师个人计时。", 400);
      }

      if (!isOriginalArtApproved(existing.originalArtStatus, existing.originalArtApprovedDate)) {
        throw new ModelingTaskUpdateError("原画未过审的款式不能开始建模计时。", 400);
      }

      const stoppedTaskIds = await stopActiveTasksForModeler(tx, existing.modelerId, taskId, now, operatorName);

      const updated = await tx.modelingTask.update({
        where: { id: taskId },
        data: {
          status: currentStatus === "修改中" ? "修改中" : "建模中",
          actualStartDate: existing.actualStartDate ?? existing.plannedStartDate ?? today,
          activeWorkStartedAt: existing.activeWorkStartedAt ?? now,
          lastUpdatedAt: now,
          lastUpdatedBy: operatorName,
          blockedSince: null,
          blockedDays: 0,
          blockType: currentStatus === "修改中" ? (existing.blockType ?? "修改中") : null,
        },
      });

      const writebackDraft = await refreshProjectModelingProgress(tx, updated.projectId, updated.projectTaskId);

      return {
        projectId: updated.projectId,
        projectTaskId: updated.projectTaskId,
        affectedTaskIds: [updated.id, ...stoppedTaskIds],
        message: "已开始记录本款式建模工时。",
        writebackDraft,
      };
    }

    await createWorkLogIfNeeded(tx, existing, now, "manual_stop", operatorName);
    const timerData = buildStopTimerData(existing.activeWorkStartedAt, now);
    const updated = await tx.modelingTask.update({
      where: { id: taskId },
      data: {
        ...timerData,
        lastUpdatedAt: now,
        lastUpdatedBy: operatorName,
      },
    });
    const writebackDraft = await refreshProjectModelingProgress(tx, updated.projectId, updated.projectTaskId);

    return {
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      affectedTaskIds: [updated.id],
      message: existing.activeWorkStartedAt ? "已停止本款式计时。" : "当前款式没有正在运行的计时。",
      writebackDraft,
    };
  });
}

export async function submitModelingWork(taskId: string, payload: Record<string, unknown>, actor: AuthUser) {
  if (!taskId || taskId.startsWith("virtual-")) {
    throw new ModelingTaskUpdateError("虚拟款式不能提交成果，请先录入真实款式。", 400);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.modelingTask.findUnique({ where: { id: taskId } });

    if (!existing) {
      throw new ModelingTaskUpdateError("没有找到这条建模款式。", 404);
    }

    if (actor.authRole === "viewer" && existing.modelerId !== actor.id) {
      throw new ModelingTaskUpdateError("只能提交分配给自己的建模款式。", 403);
    }

    const currentStatus = normalizeExistingStatus(existing.status, existing.isOutsourced);
    if (preConfirmationStatuses.has(currentStatus)) {
      throw new ModelingTaskUpdateError("款式清单还没有由建模侧确认，不能提交建模成果。", 400);
    }

    if (currentStatus === "未启动" || currentStatus === "未分配" || currentStatus === "已通过" || currentStatus === "取消") {
      throw new ModelingTaskUpdateError("当前状态不能提交建模成果，请先完成分配并进入建模流程。", 400);
    }

    if (!isOriginalArtApproved(existing.originalArtStatus, existing.originalArtApprovedDate)) {
      throw new ModelingTaskUpdateError("原画未过审的款式不能提交建模成果。", 400);
    }

    const content = optionalText(payload.content);
    const deliverableUrls = parseStringList(payload.deliverableUrls);
    const singleUrl = optionalText(payload.deliverableUrl);
    if (singleUrl) {
      deliverableUrls.unshift(singleUrl);
    }

    const uniqueUrls = [...new Set(deliverableUrls.filter(Boolean))];
    if (!content && uniqueUrls.length === 0) {
      throw new ModelingTaskUpdateError("请填写成果说明或成果链接。", 400);
    }

    const now = new Date();
    const today = startOfDay(now);
    const latestFeedback = await tx.modelingFeedback.findFirst({
      where: { modelingTaskId: taskId },
      orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }],
      select: { roundNo: true },
    });
    const roundNo = Math.max(existing.reviewRound ?? 0, latestFeedback?.roundNo ?? 0) + 1;
    const submitterName = actor.name || "建模师";
    const feedbackContent = buildWorkSubmissionContent(content, uniqueUrls);
    const submittedWorkMinutes = existing.actualWorkMinutes + minutesBetween(existing.activeWorkStartedAt, now);
    const submissionSnapshot = {
      submittedFromStatus: currentStatus,
      restoreStatusOnRejection: "排队中",
      modelerId: existing.modelerId,
      isOutsourced: existing.isOutsourced,
      outsourceVendorId: existing.outsourceVendorId,
      stableOutsourceCapacity: existing.stableOutsourceCapacity,
      actualWorkMinutesBeforeSubmit: existing.actualWorkMinutes,
      submittedWorkMinutes,
      activeWorkStartedAt: existing.activeWorkStartedAt?.toISOString() ?? null,
      submittedAt: now.toISOString(),
      submittedByUserId: actor.id === "auth-disabled" ? null : actor.id,
      submittedByName: submitterName,
      content: content ?? "",
      deliverableUrls: uniqueUrls,
      reviewRound: roundNo,
    } satisfies Prisma.JsonObject;

    const submissionFeedback = await tx.modelingFeedback.create({
      data: {
        modelingTaskId: taskId,
        feedbackType: "建模师提交",
        roundNo,
        feedbackByUserId: actor.id === "auth-disabled" ? undefined : actor.id,
        feedbackByName: submitterName,
        feedbackAt: now,
        content: feedbackContent,
        attachmentUrl: uniqueUrls[0],
        submissionSnapshot,
        status: "待产品美术验收",
      },
      select: {
        id: true,
        roundNo: true,
      },
    });

    await createWorkLogIfNeeded(tx, existing, now, "submit_modeling_work", submitterName);

    const updated = await tx.modelingTask.update({
      where: { id: taskId },
      data: {
        status: "待验收",
        actualStartDate: existing.actualStartDate ?? existing.plannedStartDate ?? today,
        remainingWorkdays: 0,
        reviewRound: roundNo,
        lastFeedbackAt: now,
        lastUpdatedAt: now,
        lastUpdatedBy: submitterName,
        blockedSince: null,
        blockedDays: 0,
        blockType: null,
        ...buildStopTimerData(existing.activeWorkStartedAt, now),
      },
    });

    const writebackDraft = await refreshProjectModelingProgress(tx, updated.projectId, updated.projectTaskId);
    const reviewRequestPayload = {
      eventType: "modeling_work_submitted",
      targetModule: "product-guide",
      sourceModule: "modeling-schedule",
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      modelingTaskId: updated.id,
      sourceStyleId: existing.sourceStyleId,
      styleCode: updated.styleCode,
      styleSequence: updated.styleSequence,
      styleName: updated.styleName,
      modelingStatus: updated.status,
      feedbackId: submissionFeedback.id,
      submissionFeedbackId: submissionFeedback.id,
      reviewRound: submissionFeedback.roundNo,
      submittedFromStatus: submissionSnapshot.submittedFromStatus,
      restoreStatusOnRejection: submissionSnapshot.restoreStatusOnRejection,
      submittedWorkMinutes: submissionSnapshot.submittedWorkMinutes,
      submittedAt: now.toISOString(),
      submittedBy: submitterName,
      content: content ?? "",
      deliverableUrls: uniqueUrls,
      submissionSnapshot,
    } satisfies Prisma.JsonObject;
    const productGuideEvent = await createModelingProductGuideEvent(tx, {
      eventType: "modeling_work_submitted",
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      modelingTaskId: updated.id,
      payload: reviewRequestPayload,
      generatedBy: submitterName,
    });

    return {
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      modelingTaskId: updated.id,
      message: "已提交建模成果，等待产品美术验收。",
      reviewRequest: {
        eventId: productGuideEvent.eventId,
        occurredAt: productGuideEvent.occurredAt,
        ...reviewRequestPayload,
      },
      productGuideEvent,
      writebackDraft,
    };
  });
}

export async function updateModelingTask(taskId: string, payload: Record<string, unknown>) {
  if (!taskId || taskId.startsWith("virtual-")) {
    throw new ModelingTaskUpdateError("虚拟款式不能保存，请先在产品组工作指引中录入真实款式。", 400);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.modelingTask.findUnique({ where: { id: taskId } });

    if (!existing) {
      throw new ModelingTaskUpdateError("没有找到这条建模款式。", 404);
    }

    const now = new Date();
    const today = startOfDay(now);
    const explicitStatus = parseStatus(payload.status);
    const currentStatus = normalizeExistingStatus(existing.status, existing.isOutsourced);
    const data: Prisma.ModelingTaskUpdateInput = {
      lastUpdatedAt: now,
      lastUpdatedBy: "建模排期页面",
    };

    const modelerId = hasOwn(payload, "modelerId") ? optionalText(payload.modelerId) : undefined;
    const requestedOutsource = hasOwn(payload, "isOutsourced") ? payload.isOutsourced === true : undefined;
    const outsourceVendorId = hasOwn(payload, "outsourceVendorId") ? optionalText(payload.outsourceVendorId) : undefined;
    const plannedStartDate = hasOwn(payload, "plannedStartDate") ? optionalDate(payload.plannedStartDate) : undefined;
    const plannedFinishDate = hasOwn(payload, "plannedFinishDate") ? optionalDate(payload.plannedFinishDate) : undefined;
    const actualStartDate = hasOwn(payload, "actualStartDate") ? optionalDate(payload.actualStartDate) : undefined;
    const actualFinishDate = hasOwn(payload, "actualFinishDate") ? optionalDate(payload.actualFinishDate) : undefined;
    const remainingWorkdays = hasOwn(payload, "remainingWorkdays") ? optionalNonNegativeInt(payload.remainingWorkdays) : undefined;
    const notes = hasOwn(payload, "notes") ? optionalText(payload.notes) : undefined;
    const containsFeedbackUpdate =
      hasOwn(payload, "feedbackType") ||
      hasOwn(payload, "feedbackContent") ||
      hasOwn(payload, "feedbackAttachments") ||
      hasOwn(payload, "blockType");
    const updateEventType = classifyModelingTaskUpdateEvent({
      modelerId,
      requestedOutsource,
      outsourceVendorId,
      plannedStartDate,
      plannedFinishDate,
      actualStartDate,
      actualFinishDate,
      remainingWorkdays,
      notes,
    });

    if (containsFeedbackUpdate) {
      throw new ModelingTaskUpdateError("检修和送审反馈只能由产品组审核 / 送审结果接口写入，建模排期页只读展示。", 400);
    }

    if (explicitStatus) {
      throw new ModelingTaskUpdateError("状态推进由系统根据分配、外包、计时、提交成果和产品审核结果自动生成，不能手动写入。", 400);
    }

    if (
      productReviewManagedStatuses.has(currentStatus) &&
      (explicitStatus ||
        modelerId !== undefined ||
        requestedOutsource !== undefined ||
        outsourceVendorId !== undefined ||
        actualStartDate !== undefined ||
        actualFinishDate !== undefined ||
        remainingWorkdays !== undefined)
    ) {
      throw new ModelingTaskUpdateError("当前款式已进入产品审核 / 送审流程，不能通过建模排期通用更新入口改写。", 400);
    }

    if (plannedStartDate !== undefined) {
      data.plannedStartDate = plannedStartDate;
    }

    if (plannedFinishDate !== undefined) {
      data.plannedFinishDate = plannedFinishDate;
    }

    if (actualStartDate !== undefined) {
      data.actualStartDate = actualStartDate;
    }

    if (actualFinishDate !== undefined) {
      data.actualFinishDate = actualFinishDate;
    }

    if (remainingWorkdays !== undefined) {
      data.remainingWorkdays = remainingWorkdays;
    }

    if (notes !== undefined) {
      data.notes = notes;
    }

    if (
      preConfirmationStatuses.has(currentStatus) &&
      (modelerId !== undefined ||
        requestedOutsource !== undefined ||
        outsourceVendorId !== undefined ||
        plannedStartDate !== undefined ||
        plannedFinishDate !== undefined ||
        actualStartDate !== undefined ||
        actualFinishDate !== undefined ||
        remainingWorkdays !== undefined ||
        containsFeedbackUpdate ||
        (explicitStatus && explicitStatus !== currentStatus))
    ) {
      throw new ModelingTaskUpdateError("款式清单还没有由建模侧确认，不能分配、外包、排期、记录反馈或推进状态。", 400);
    }

    let nextStatus = explicitStatus ?? currentStatus;
    let assignmentOutsourceVendorId = outsourceVendorId;

    if (modelerId !== undefined) {
      if (modelerId) {
        const modeler = await tx.user.findFirst({
          where: { id: modelerId, isModeler: true, status: { not: "停用" } },
          select: { id: true },
        });

        if (!modeler) {
          throw new ModelingTaskUpdateError("请选择有效的建模师。", 400);
        }

        data.modelerId = modelerId;
        data.isOutsourced = false;
        data.outsourceVendorId = null;
        data.stableOutsourceCapacity = false;

        if (!explicitStatus && (existing.status === "未启动" || existing.status === "未分配")) {
          nextStatus = "已排期";
        }
      } else {
        data.modelerId = null;
      }
    }

    if (requestedOutsource === true) {
      const nextVendorId = outsourceVendorId ?? existing.outsourceVendorId;

      if (!nextVendorId) {
        throw new ModelingTaskUpdateError("标记外包时需要选择外包供应商。", 400);
      }

      const vendor = await tx.outsourceVendor.findFirst({
        where: { id: nextVendorId, status: { not: "停用" } },
        select: { id: true, stableCapacity: true },
      });

      if (!vendor) {
        throw new ModelingTaskUpdateError("请选择有效的外包供应商。", 400);
      }

      data.isOutsourced = true;
      data.outsourceVendorId = vendor.id;
      data.stableOutsourceCapacity = vendor.stableCapacity;
      data.modelerId = null;
      assignmentOutsourceVendorId = vendor.id;
      nextStatus = explicitStatus ?? "外包中";
    } else if (requestedOutsource === false) {
      data.isOutsourced = false;
      data.outsourceVendorId = null;
      data.stableOutsourceCapacity = false;
    }

    if (outsourceVendorId !== undefined && requestedOutsource !== true) {
      data.outsourceVendorId = outsourceVendorId;
    }

    if (nextStatus === "外包中" && requestedOutsource !== true && !existing.isOutsourced) {
      throw new ModelingTaskUpdateError("进入外包中状态时需要通过外包操作选择供应商。", 400);
    }

    if (!isOriginalArtApproved(existing.originalArtStatus, existing.originalArtApprovedDate) && formalModelingStatuses.has(nextStatus)) {
      throw new ModelingTaskUpdateError("原画未过审的款式不能进入正式建模、外包、送审或通过状态。", 400);
    }

    if (explicitStatus || nextStatus !== currentStatus || actualStartDate !== undefined || actualFinishDate !== undefined) {
      applyStatusEffects(data, {
        status: nextStatus,
        existing,
        actualStartDate: actualStartDate ?? existing.actualStartDate,
        actualFinishDate: actualFinishDate ?? existing.actualFinishDate,
        today,
        now,
        blockType: optionalText(payload.blockType),
      });
    }

    const feedbackContent = optionalText(payload.feedbackContent);
    const feedbackAttachments = parseFeedbackAttachments(payload.feedbackAttachments);
    const hasFeedbackAttachment = firstAttachmentUrl(feedbackAttachments) !== undefined;
    const feedbackType = optionalText(payload.feedbackType) ?? defaultFeedbackType(nextStatus);
    const hasFeedback = Boolean(feedbackContent) || hasFeedbackAttachment;

    const isRejectionFeedback =
      (nextStatus === "排队中" || nextStatus === "修改中") &&
      (explicitStatus === "排队中" || explicitStatus === "修改中" || feedbackType.includes("不通过") || feedbackType.includes("驳回") || hasOwn(payload, "feedbackContent"));

    if (isRejectionFeedback && !feedbackContent) {
      throw new ModelingTaskUpdateError("内部不通过或送审不通过必须填写文字反馈。", 400);
    }

    if (
      existing.activeWorkStartedAt &&
      (!timerActiveStatuses.has(nextStatus) || requestedOutsource === true || (modelerId !== undefined && modelerId !== existing.modelerId))
    ) {
      await createWorkLogIfNeeded(
        tx,
        existing,
        now,
        requestedOutsource === true ? "mark_outsourced" : modelerId !== undefined && modelerId !== existing.modelerId ? "assignment_changed" : "status_changed",
        "建模排期页面",
      );
      Object.assign(data, buildStopTimerData(existing.activeWorkStartedAt, now));
    }

    await recordAssignmentHistoryIfNeeded(tx, existing, {
      modelerId,
      requestedOutsource,
      outsourceVendorId: assignmentOutsourceVendorId,
      changedBy: "建模排期页面",
      reason: optionalText(payload.assignmentReason) ?? optionalText(payload.reason),
    });

    if (hasFeedback) {
      const latestFeedback = await tx.modelingFeedback.findFirst({
        where: { modelingTaskId: taskId },
        orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }],
        select: { roundNo: true },
      });
      const roundNo = Math.max(existing.reviewRound ?? 0, latestFeedback?.roundNo ?? 0) + 1;

      await tx.modelingFeedback.create({
        data: {
          modelingTaskId: taskId,
          feedbackType,
          roundNo,
          feedbackByName: "建模排期页面",
          feedbackAt: now,
          content: buildFeedbackContentWithAttachments(feedbackContent ?? feedbackType, feedbackAttachments),
          attachmentUrl: firstAttachmentUrl(feedbackAttachments),
          status: nextStatus === "已通过" ? "已解决" : "待处理",
          resolvedAt: nextStatus === "已通过" ? now : undefined,
          resolvedBy: nextStatus === "已通过" ? "建模排期页面" : undefined,
        },
      });

      data.reviewRound = roundNo;
      data.lastFeedbackAt = now;
    }

    const updated = await tx.modelingTask.update({
      where: { id: taskId },
      data: {
        ...data,
        status: nextStatus,
      },
    });

    const writebackDraft = await refreshProjectModelingProgress(tx, updated.projectId, updated.projectTaskId);

    return {
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      eventType: updateEventType,
      message: buildSuccessMessage(
        nextStatus,
        Boolean(modelerId),
        requestedOutsource === true,
        hasFeedback,
        remainingWorkdays !== undefined || notes !== undefined,
        writebackDraft,
      ),
      writebackDraft,
    };
  });
}

function applyStatusEffects(
  data: Prisma.ModelingTaskUpdateInput,
  options: {
    status: ModelingTaskStatus;
    existing: {
      plannedStartDate: Date | null;
      actualStartDate: Date | null;
      blockedSince: Date | null;
    };
    actualStartDate: Date | null;
    actualFinishDate: Date | null;
    today: Date;
    now: Date;
    blockType: string | null;
  },
) {
  const { status, existing, today, now } = options;

  if (status === "未启动" || status === "未分配") {
    data.modelerId = null;
    data.isOutsourced = false;
    data.outsourceVendorId = null;
    data.stableOutsourceCapacity = false;
  }

  if (status === "排队中") {
    data.actualStartDate = options.actualStartDate ?? existing.actualStartDate ?? existing.plannedStartDate ?? today;
    data.blockedSince = null;
    data.blockedDays = 0;
    data.blockType = options.blockType ?? null;
  }

  if (status === "建模中" || status === "修改中") {
    data.actualStartDate = options.actualStartDate ?? today;
    data.blockedSince = null;
    data.blockedDays = 0;
    data.blockType = status === "修改中" ? (options.blockType ?? "修改中") : null;
  }

  if (status === "待验收") {
    data.actualStartDate = options.actualStartDate ?? existing.actualStartDate ?? existing.plannedStartDate ?? today;
    data.remainingWorkdays = 0;
    data.blockedSince = null;
    data.blockedDays = 0;
    data.blockType = null;
  }

  if (status === "待送审") {
    data.internalApprovedDate = today;
    data.remainingWorkdays = 0;
    data.blockedSince = null;
    data.blockedDays = 0;
    data.blockType = null;
  }

  if (reviewBlockedStatuses.has(status)) {
    const blockedSince = existing.blockedSince ?? now;
    data.blockedSince = blockedSince;
    data.blockedDays = daysSince(blockedSince, now);
    data.blockType = options.blockType ?? (status === "等反馈" ? "等版权方反馈" : "送审中");
  }

  if (status === "已通过") {
    const finishDate = options.actualFinishDate ?? today;
    const startDate = options.actualStartDate ?? existing.actualStartDate ?? existing.plannedStartDate ?? finishDate;

    data.actualStartDate = startDate;
    data.actualFinishDate = finishDate;
    data.copyrightApprovedDate = finishDate;
    data.actualWorkdays = workdaysBetween(startDate, finishDate);
    data.remainingWorkdays = 0;
    data.blockedSince = null;
    data.blockedDays = 0;
    data.blockType = null;
  }
}

export async function refreshProjectModelingProgress(
  tx: Prisma.TransactionClient,
  projectId: string,
  projectTaskId: string,
): Promise<ModelingWritebackDraft | undefined> {
  const projectTasks = await tx.modelingTask.findMany({
    where: { projectId, affectsProjectSchedule: true },
    select: {
      id: true,
      projectTaskId: true,
      isRequired: true,
      modelerId: true,
      isOutsourced: true,
      plannedFinishDate: true,
      actualFinishDate: true,
      status: true,
    },
  });
  const requiredTasks = projectTasks.filter((task) => task.isRequired && !preConfirmationStatuses.has(normalizeExistingStatus(task.status, task.isOutsourced)));
  const totalRequiredStyles = requiredTasks.length;
  const approvedStyles = requiredTasks.filter((task) => normalizeExistingStatus(task.status, task.isOutsourced) === "已通过").length;
  const inProgressStyles = requiredTasks.filter((task) => {
    const status = normalizeExistingStatus(task.status, task.isOutsourced);
    return status === "已排期" || status === "排队中" || status === "建模中" || status === "修改中";
  }).length;
  const submittedStyles = requiredTasks.filter((task) => {
    const status = normalizeExistingStatus(task.status, task.isOutsourced);
    return status === "待验收" || status === "已送审" || status === "等反馈";
  }).length;
  const outsourcedStyles = requiredTasks.filter((task) => normalizeExistingStatus(task.status, task.isOutsourced) === "外包中" || task.isOutsourced).length;
  const unassignedStyles = requiredTasks.filter((task) => normalizeExistingStatus(task.status, task.isOutsourced) === "未分配" && !task.modelerId && !task.isOutsourced).length;
  const allRequiredApproved = totalRequiredStyles > 0 && approvedStyles === totalRequiredStyles;
  const projectedAllApprovedDate = maxDate(
    requiredTasks.map((task) => (allRequiredApproved ? task.actualFinishDate : task.plannedFinishDate ?? task.actualFinishDate)),
  );
  const progressData = {
    projectId,
    projectTaskId,
    totalRequiredStyles,
    approvedStyles,
    inProgressStyles,
    submittedStyles,
    outsourcedStyles,
    unassignedStyles,
    progressPercent: totalRequiredStyles > 0 ? Math.round((approvedStyles / totalRequiredStyles) * 100) : 0,
    projectedAllApprovedDate,
    canWritebackProjectTask: allRequiredApproved,
    lastCalculatedAt: new Date(),
  };
  const existingProgress = await tx.projectModelingProgress.findFirst({
    where: { projectId, projectTaskId },
    select: { id: true },
  });

  if (existingProgress) {
    await tx.projectModelingProgress.update({
      where: { id: existingProgress.id },
      data: progressData,
    });
  } else {
    await tx.projectModelingProgress.create({
      data: {
        id: `${projectId}-${projectTaskId}-modeling-progress`,
        ...progressData,
      },
    });
  }

  if (!allRequiredApproved || !projectedAllApprovedDate) {
    return undefined;
  }

  return {
    projectId,
    projectTaskId,
    actualFinishDate: formatDate(projectedAllApprovedDate),
    requiredStyles: totalRequiredStyles,
    approvedStyles,
    message: "所有必做款式已通过，可由项目排期确认回写“根据效果图建模”完成。",
  };
}

function parseStatus(value: unknown) {
  const status = optionalText(value);

  if (!status) {
    return null;
  }

  if (!validStatuses.has(status as ModelingTaskStatus)) {
    throw new ModelingTaskUpdateError("建模状态不在允许范围内。", 400);
  }

  return status as ModelingTaskStatus;
}

function classifyModelingTaskUpdateEvent(options: {
  modelerId?: string | null;
  requestedOutsource?: boolean;
  outsourceVendorId?: string | null;
  plannedStartDate?: Date | null;
  plannedFinishDate?: Date | null;
  actualStartDate?: Date | null;
  actualFinishDate?: Date | null;
  remainingWorkdays?: number | null;
  notes?: string | null;
}): ModelingTaskUpdateEventType {
  if (options.modelerId !== undefined) {
    return options.modelerId ? "assign_modeler" : "clear_modeler";
  }

  if (options.requestedOutsource === true || options.outsourceVendorId) {
    return "mark_outsourced";
  }

  if (options.requestedOutsource === false || options.outsourceVendorId === null) {
    return "clear_outsource";
  }

  if (
    options.plannedStartDate !== undefined ||
    options.plannedFinishDate !== undefined ||
    options.actualStartDate !== undefined ||
    options.actualFinishDate !== undefined
  ) {
    return "update_schedule_fields";
  }

  return "update_modeler_inputs";
}

function normalizeExistingStatus(value: string, isOutsourced: boolean): ModelingTaskStatus {
  if (isOutsourced && (value === "已排期" || value === "排队中" || value === "建模中" || value === "进行中")) {
    return "外包中";
  }

  if (validStatuses.has(value as ModelingTaskStatus)) {
    return value as ModelingTaskStatus;
  }

  if (value.includes("退回")) return "退回补充";
  if (value.includes("待确认")) return "待确认";
  if (value.includes("未分配")) return "未分配";
  if (value.includes("未启动")) return "未启动";
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

function isOriginalArtApproved(status: string, approvedDate: Date | null) {
  const text = status.trim();

  if (text.includes("未") || text.includes("待") || text.includes("不通过") || text.includes("驳回")) {
    return false;
  }

  return Boolean(approvedDate) || text.includes("已过审") || text.includes("过审") || text.includes("通过") || text.includes("确认");
}

function defaultFeedbackType(status: ModelingTaskStatus) {
  if (status === "待验收") return "建模师提交";
  if (status === "待送审") return "内部通过";
  if (status === "已送审") return "送审记录";
  if (status === "等反馈") return "版权方反馈";
  if (status === "排队中") return "排队反馈";
  if (status === "修改中") return "修改意见";
  if (status === "建模中") return "修改意见";
  if (status === "已通过") return "通过记录";
  return "检修反馈";
}

function buildWorkSubmissionContent(content: string | null, urls: string[]) {
  const lines = [];
  if (content) {
    lines.push(content);
  }

  if (urls.length > 0) {
    lines.push("成果链接：");
    lines.push(...urls.map((url) => `- ${url}`));
  }

  return lines.join("\n");
}

async function stopActiveTasksForModeler(
  tx: Prisma.TransactionClient,
  modelerId: string,
  exceptTaskId: string,
  now: Date,
  operatorName: string,
) {
  const activeTasks = await tx.modelingTask.findMany({
    where: {
      modelerId,
      id: { not: exceptTaskId },
      activeWorkStartedAt: { not: null },
    },
    select: {
      id: true,
      projectId: true,
      projectTaskId: true,
      modelerId: true,
      activeWorkStartedAt: true,
    },
  });

  for (const task of activeTasks) {
    await createWorkLogIfNeeded(tx, task, now, "start_other_task", operatorName);
    await tx.modelingTask.update({
      where: { id: task.id },
      data: {
        ...buildStopTimerData(task.activeWorkStartedAt, now),
        lastUpdatedAt: now,
        lastUpdatedBy: operatorName,
      },
    });
  }

  return activeTasks.map((task) => task.id);
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

async function recordAssignmentHistoryIfNeeded(
  tx: Prisma.TransactionClient,
  existing: {
    id: string;
    projectId: string;
    projectTaskId: string;
    modelerId: string | null;
    outsourceVendorId: string | null;
    isOutsourced: boolean;
  },
  options: {
    modelerId?: string | null;
    requestedOutsource?: boolean;
    outsourceVendorId?: string | null;
    changedBy: string;
    reason: string | null;
  },
) {
  let assignmentType: string | null = null;
  let toModelerId: string | null | undefined;
  let toOutsourceVendorId: string | null | undefined;

  if (options.modelerId !== undefined && options.modelerId !== existing.modelerId) {
    assignmentType = options.modelerId ? "assign_modeler" : "clear_modeler";
    toModelerId = options.modelerId;
    toOutsourceVendorId = null;
  }

  if (options.requestedOutsource === true && options.outsourceVendorId !== existing.outsourceVendorId) {
    assignmentType = "mark_outsourced";
    toModelerId = null;
    toOutsourceVendorId = options.outsourceVendorId ?? null;
  } else if (options.requestedOutsource === false && (existing.isOutsourced || existing.outsourceVendorId)) {
    assignmentType = "clear_outsource";
    toOutsourceVendorId = null;
  }

  if (!assignmentType) {
    return;
  }

  await tx.modelingAssignmentHistory.create({
    data: {
      modelingTaskId: existing.id,
      projectId: existing.projectId,
      projectTaskId: existing.projectTaskId,
      assignmentType,
      fromModelerId: existing.modelerId,
      toModelerId,
      fromOutsourceVendorId: existing.outsourceVendorId,
      toOutsourceVendorId,
      changedBy: options.changedBy,
      reason: options.reason,
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

function parseFeedbackAttachments(value: unknown): ModelingFeedbackAttachments | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const attachments: ModelingFeedbackAttachments = {
    imageUrl: optionalText(record.imageUrl),
    pdfUrl: optionalText(record.pdfUrl),
    pptUrl: optionalText(record.pptUrl),
  };

  return firstAttachmentUrl(attachments) ? attachments : null;
}

function firstAttachmentUrl(attachments?: ModelingFeedbackAttachments | null) {
  if (!attachments) {
    return undefined;
  }

  return attachments.imageUrl || attachments.pdfUrl || attachments.pptUrl || undefined;
}

function buildFeedbackContentWithAttachments(content: string, attachments?: ModelingFeedbackAttachments | null) {
  const lines = [content];

  if (attachments?.imageUrl) {
    lines.push(`图片反馈：${attachments.imageUrl}`);
  }

  if (attachments?.pdfUrl) {
    lines.push(`PDF 反馈：${attachments.pdfUrl}`);
  }

  if (attachments?.pptUrl) {
    lines.push(`PPT 反馈：${attachments.pptUrl}`);
  }

  return lines.join("\n");
}

function parseStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function buildSuccessMessage(
  status: ModelingTaskStatus,
  assignedModeler: boolean,
  outsourced: boolean,
  hasFeedback: boolean,
  updatedModelerInput: boolean,
  writebackDraft?: ModelingWritebackDraft,
) {
  if (writebackDraft) {
    return writebackDraft.message;
  }

  if (outsourced) {
    return "外包状态已保存。";
  }

  if (assignedModeler) {
    return "建模师分配已保存。";
  }

  if (hasFeedback) {
    return "建模反馈已记录。";
  }

  if (updatedModelerInput) {
    return "剩余工时和备注已保存。";
  }

  return `款式状态已更新为“${status}”。`;
}

function hasOwn(payload: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function optionalText(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new ModelingTaskUpdateError("日期格式不正确。", 400);
  }

  const parsed = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new ModelingTaskUpdateError("日期格式不正确。", 400);
  }

  return startOfDay(parsed);
}

function optionalNonNegativeInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new ModelingTaskUpdateError("剩余工时必须是非负整数。", 400);
  }

  return Math.trunc(numberValue);
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function daysSince(date: Date, today = new Date()) {
  const start = startOfDay(date).getTime();
  const end = startOfDay(today).getTime();

  return Math.max(0, Math.floor((end - start) / 86_400_000));
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
  const dates = values.filter((date): date is Date => Boolean(date));

  if (dates.length === 0) {
    return null;
  }

  return dates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest), dates[0]);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
