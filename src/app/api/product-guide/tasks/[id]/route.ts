import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { formatDate, optionalText, parseDateOnly, requiredText, todayDateOnly } from "@/lib/product-guide-mutation";
import { isModelingMilestoneTaskNo, milestoneByTaskNo } from "@/lib/schedule-domain";

export const runtime = "nodejs";

type TaskAction = "complete" | "progress" | "expected-finish" | "block" | "unblock" | "submit-review";
const allowedTaskStatuses = new Set(["未开始", "进行中", "已完成", "阻塞", "暂停", "取消", "送审中", "已送审"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const action = optionalText(payload.action) as TaskAction | undefined;

  if (!action || !["complete", "progress", "expected-finish", "block", "unblock", "submit-review"].includes(action)) {
    return NextResponse.json({ ok: false, message: "无法识别任务动作。" }, { status: 400 });
  }

  try {
    const task = await prisma.projectTask.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        taskName: true,
        status: true,
        actualFinishDate: true,
        expectedFinishDate: true,
        isBlocked: true,
        blockReason: true,
        progressNote: true,
        taskNo: true,
        milestoneType: true,
      },
    });

    if (!task) {
      return NextResponse.json({ ok: false, message: "找不到对应任务。" }, { status: 404 });
    }

    const operatorName = optionalText(payload.operatorName) ?? "产品组工作指引";
    const note = optionalText(payload.note);
    const now = new Date();
    const updateType = updateTypeForAction(action);

    const result = await prisma.$transaction(async (tx) => {
      if (action === "complete") {
        const actualFinishDate = parseDateOnly(payload.actualFinishDate) ?? todayDateOnly();

        const updatedTask = await tx.projectTask.update({
          where: { id: task.id },
          data: {
            status: "已完成",
            actualFinishDate,
            isBlocked: false,
            progressNote: note ?? task.progressNote,
            lastUpdatedAt: now,
            lastUpdatedBy: operatorName,
          },
          select: { id: true, taskName: true },
        });

        await tx.progressUpdate.create({
          data: {
            projectId: task.projectId,
            projectTaskId: task.id,
            updateType,
            oldValue: {
              status: task.status,
              actualFinishDate: task.actualFinishDate ? formatDate(task.actualFinishDate) : null,
              isBlocked: task.isBlocked,
            },
            newValue: {
              status: "已完成",
              actualFinishDate: formatDate(actualFinishDate),
              isBlocked: false,
            },
            note,
            updatedByName: operatorName,
          },
        });

        return {
          id: updatedTask.id,
          taskName: updatedTask.taskName,
          message: "已记录完成时间。该项目需要重新测算，预测视图将在重新测算后更新。",
        };
      }

      if (action === "progress") {
        const status = optionalText(payload.status);

        if (status && !allowedTaskStatuses.has(status)) {
          throw new MutationError("任务状态不在允许范围内。", 400);
        }

        if (!status && !note) {
          throw new MutationError("请填写任务状态或当前进度。", 400);
        }

        const nextStatus = status ?? task.status;
        const updatedTask = await tx.projectTask.update({
          where: { id: task.id },
          data: {
            status: nextStatus,
            progressNote: note ?? task.progressNote,
            lastUpdatedAt: now,
            lastUpdatedBy: operatorName,
          },
          select: { id: true, taskName: true },
        });

        await tx.progressUpdate.create({
          data: {
            projectId: task.projectId,
            projectTaskId: task.id,
            updateType,
            oldValue: {
              status: task.status,
              progressNote: task.progressNote,
            },
            newValue: {
              status: nextStatus,
              progressNote: note ?? task.progressNote,
            },
            note,
            updatedByName: operatorName,
          },
        });

        return {
          id: updatedTask.id,
          taskName: updatedTask.taskName,
          message: "已记录任务进度。进行中任务超过 3 天未更新时会继续提醒。",
        };
      }

      if (action === "expected-finish") {
        const expectedFinishDate = parseDateOnly(payload.expectedFinishDate);

        if (!expectedFinishDate) {
          throw new MutationError("请填写有效的预计完成日期。", 400);
        }

        const updatedTask = await tx.projectTask.update({
          where: { id: task.id },
          data: {
            expectedFinishDate,
            progressNote: note ?? task.progressNote,
            lastUpdatedAt: now,
            lastUpdatedBy: operatorName,
          },
          select: { id: true, taskName: true },
        });

        await tx.progressUpdate.create({
          data: {
            projectId: task.projectId,
            projectTaskId: task.id,
            updateType,
            oldValue: {
              expectedFinishDate: task.expectedFinishDate ? formatDate(task.expectedFinishDate) : null,
              progressNote: task.progressNote,
            },
            newValue: {
              expectedFinishDate: formatDate(expectedFinishDate),
              progressNote: note ?? task.progressNote,
            },
            note,
            updatedByName: operatorName,
          },
        });

        return {
          id: updatedTask.id,
          taskName: updatedTask.taskName,
          message: "已更新预计完成时间。该项目需要重新测算，预测视图将在重新测算后更新。",
        };
      }

      if (action === "block") {
        const blockReason = requiredText(payload.blockReason);

        if (!blockReason) {
          throw new MutationError("请填写阻塞原因。", 400);
        }

        const updatedTask = await tx.projectTask.update({
          where: { id: task.id },
          data: {
            isBlocked: true,
            blockReason,
            progressNote: note ?? blockReason,
            lastUpdatedAt: now,
            lastUpdatedBy: operatorName,
          },
          select: { id: true, taskName: true },
        });

        await tx.progressUpdate.create({
          data: {
            projectId: task.projectId,
            projectTaskId: task.id,
            updateType,
            oldValue: {
              isBlocked: task.isBlocked,
              blockReason: task.blockReason,
              progressNote: task.progressNote,
            },
            newValue: {
              isBlocked: true,
              blockReason,
              progressNote: note ?? blockReason,
            },
            note: note ?? blockReason,
            updatedByName: operatorName,
          },
        });

        return {
          id: updatedTask.id,
          taskName: updatedTask.taskName,
          message: "已记录阻塞原因。该任务会继续出现在工作指引和管理层提醒中。",
        };
      }

      if (action === "submit-review") {
        const submittedAt = parseDateOnly(payload.submittedAt) ?? todayDateOnly();
        const reviewTarget = optionalText(payload.reviewTarget) ?? "版权方 / 审核方";
        const progressNote = note ?? `已于 ${formatDate(submittedAt)} 送审至${reviewTarget}，等待反馈。`;

        const updatedTask = await tx.projectTask.update({
          where: { id: task.id },
          data: {
            status: "送审中",
            progressNote,
            lastUpdatedAt: now,
            lastUpdatedBy: operatorName,
          },
          select: { id: true, taskName: true },
        });

        await tx.progressUpdate.create({
          data: {
            projectId: task.projectId,
            projectTaskId: task.id,
            updateType,
            oldValue: {
              status: task.status,
              progressNote: task.progressNote,
            },
            newValue: {
              status: "送审中",
              submittedAt: formatDate(submittedAt),
              reviewTarget,
              progressNote,
            },
            note: progressNote,
            updatedByName: operatorName,
          },
        });

        return {
          id: updatedTask.id,
          taskName: updatedTask.taskName,
          message: "已记录送审状态。该项目需要重新测算，预测视图将在重新测算后更新。",
        };
      }

      const updatedTask = await tx.projectTask.update({
        where: { id: task.id },
        data: {
          isBlocked: false,
          progressNote: note ?? task.progressNote,
          lastUpdatedAt: now,
          lastUpdatedBy: operatorName,
        },
        select: { id: true, taskName: true },
      });

      await tx.progressUpdate.create({
        data: {
          projectId: task.projectId,
          projectTaskId: task.id,
          updateType,
          oldValue: {
            isBlocked: task.isBlocked,
            blockReason: task.blockReason,
            progressNote: task.progressNote,
          },
          newValue: {
            isBlocked: false,
            blockReason: task.blockReason,
            progressNote: note ?? task.progressNote,
          },
          note,
          updatedByName: operatorName,
        },
      });

      return {
        id: updatedTask.id,
        taskName: updatedTask.taskName,
        message: "已解除阻塞。该项目需要重新测算，预测视图将在重新测算后更新。",
      };
    });

    const styleListHandoff =
      action === "complete" ? await buildOriginalArtStyleListHandoff(task.projectId, task.id) : null;
    const modelingStartEvent =
      action === "progress" && optionalText(payload.status) === "进行中" && task.status !== "进行中"
        ? buildModelingStartEvent(task, operatorName, now)
        : null;

    return NextResponse.json({ ok: true, ...result, ...styleListHandoff, ...modelingStartEvent, needsRecalculation: true });
  } catch (error) {
    if (error instanceof MutationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `保存任务进度失败：${error.message}`
            : "保存任务进度失败。",
      },
      { status: 500 },
    );
  }
}

async function buildOriginalArtStyleListHandoff(projectId: string, completedTaskId: string) {
  const projectTasks = await prisma.projectTask.findMany({
    where: { projectId },
    orderBy: [{ taskNo: "asc" }],
    select: {
      id: true,
      taskNo: true,
      taskName: true,
      milestoneType: true,
      status: true,
      actualFinishDate: true,
    },
  });
  const originalArtTasks = projectTasks.filter(isOriginalArtTask);
  const completedOriginalArtTask = originalArtTasks.some((task) => task.id === completedTaskId);

  if (!completedOriginalArtTask) {
    return null;
  }

  const allOriginalArtTasksCompleted = originalArtTasks.every(isTaskCompleted);
  if (!allOriginalArtTasksCompleted) {
    return null;
  }

  const existingStyleCount = await prisma.modelingTask.count({ where: { projectId } });
  if (existingStyleCount > 0) {
    return null;
  }

  const taskRefs = buildStyleListTaskRefs(projectTasks);
  const modelingProjectTask = taskRefs.firstStyleTask ?? projectTasks.find(isModelingTask);

  return {
    requiresStyleList: true,
    styleListProjectTaskId: modelingProjectTask?.id,
    styleListTaskRefs: taskRefs,
    styleListMessage: modelingProjectTask
      ? "原画里程碑已完成，请录入建模款式清单。提交后款式默认未启动，任务 7 / 10 启动时再通知建模排期。"
      : "原画里程碑已完成，请录入建模款式清单；但当前项目缺少建模任务 7 / 10，请先确认任务模板。",
  };
}

function buildStyleListTaskRefs(tasks: Array<{ id: string; taskNo: number; taskName: string }>) {
  const firstStyleTask = tasks.find((task) => task.taskNo === 7);
  const remainingStylesTask = tasks.find((task) => task.taskNo === 10);

  return {
    firstStyleTask: firstStyleTask
      ? {
          id: firstStyleTask.id,
          taskNo: 7,
          taskName: firstStyleTask.taskName,
        }
      : undefined,
    remainingStylesTask: remainingStylesTask
      ? {
          id: remainingStylesTask.id,
          taskNo: 10,
          taskName: remainingStylesTask.taskName,
        }
      : undefined,
  };
}

function buildModelingStartEvent(
  task: { id: string; projectId: string; taskNo: number; taskName: string },
  operatorName: string,
  now: Date,
) {
  if (task.taskNo !== 7 && task.taskNo !== 10) {
    return null;
  }

  return {
    modelingStartEvent: {
      sourceRequestId: `product-guide:start:${task.id}:${now.getTime()}`,
      projectId: task.projectId,
      projectTaskId: task.id,
      taskNo: task.taskNo,
      taskName: task.taskName,
      startScope: task.taskNo === 7 ? "first-style" : "remaining-styles",
      startedAt: now.toISOString(),
      startedByName: operatorName,
    },
  };
}

function isOriginalArtTask(task: { taskNo: number; taskName: string; milestoneType: string }) {
  return milestoneByTaskNo(task.taskNo) === "原画里程碑" || `${task.milestoneType} ${task.taskName}`.includes("原画");
}

function isModelingTask(task: { taskNo: number; taskName: string; milestoneType: string }) {
  return isModelingMilestoneTaskNo(task.taskNo) || `${task.milestoneType} ${task.taskName}`.includes("建模");
}

function isTaskCompleted(task: { status: string; actualFinishDate: Date | null }) {
  return Boolean(task.actualFinishDate) || task.status.includes("已完成") || task.status.includes("已通过");
}

function updateTypeForAction(action: TaskAction) {
  if (action === "complete") return "产品组标记任务完成";
  if (action === "progress") return "产品组更新任务进度";
  if (action === "expected-finish") return "产品组更新预计完成日期";
  if (action === "block") return "产品组标记任务阻塞";
  if (action === "submit-review") return "产品组标记任务送审";
  return "产品组解除任务阻塞";
}

class MutationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
