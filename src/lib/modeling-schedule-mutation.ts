import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth/permissions";
import type { ModelingTaskStatus, ModelingWritebackDraft } from "@/lib/modeling-schedule-types";

const validStatuses = new Set<ModelingTaskStatus>([
  "未启动",
  "未分配",
  "已排期",
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
const formalModelingStatuses = new Set<ModelingTaskStatus>(["建模中", "修改中", "待验收", "待送审", "已送审", "等反馈", "已通过", "外包中"]);

export class ModelingTaskUpdateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ModelingTaskUpdateError";
    this.statusCode = statusCode;
  }
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

    await tx.modelingFeedback.create({
      data: {
        modelingTaskId: taskId,
        feedbackType: "建模师提交",
        roundNo,
        feedbackByUserId: actor.id === "auth-disabled" ? undefined : actor.id,
        feedbackByName: submitterName,
        feedbackAt: now,
        content: feedbackContent,
        attachmentUrl: uniqueUrls[0],
        status: "待产品美术验收",
      },
    });

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
      },
    });

    const writebackDraft = await refreshProjectModelingProgress(tx, updated.projectId, updated.projectTaskId);

    return {
      projectId: updated.projectId,
      projectTaskId: updated.projectTaskId,
      message: "已提交建模成果，等待产品美术验收。",
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

    let nextStatus = explicitStatus ?? normalizeExistingStatus(existing.status, existing.isOutsourced);

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

    applyStatusEffects(data, {
      status: nextStatus,
      existing,
      actualStartDate: actualStartDate ?? existing.actualStartDate,
      actualFinishDate: actualFinishDate ?? existing.actualFinishDate,
      today,
      now,
      blockType: optionalText(payload.blockType),
    });

    const feedbackContent = optionalText(payload.feedbackContent);

    if (feedbackContent) {
      const feedbackType = optionalText(payload.feedbackType) ?? defaultFeedbackType(nextStatus);
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
          content: feedbackContent,
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
      message: buildSuccessMessage(nextStatus, Boolean(modelerId), requestedOutsource === true, Boolean(feedbackContent), writebackDraft),
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
  const requiredTasks = projectTasks.filter((task) => task.isRequired);
  const totalRequiredStyles = requiredTasks.length;
  const approvedStyles = requiredTasks.filter((task) => normalizeExistingStatus(task.status, task.isOutsourced) === "已通过").length;
  const inProgressStyles = requiredTasks.filter((task) => {
    const status = normalizeExistingStatus(task.status, task.isOutsourced);
    return status === "已排期" || status === "建模中" || status === "修改中";
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

function normalizeExistingStatus(value: string, isOutsourced: boolean): ModelingTaskStatus {
  if (isOutsourced && (value === "已排期" || value === "建模中" || value === "进行中")) {
    return "外包中";
  }

  if (validStatuses.has(value as ModelingTaskStatus)) {
    return value as ModelingTaskStatus;
  }

  if (value.includes("未分配")) return "未分配";
  if (value.includes("未启动")) return "未启动";
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
