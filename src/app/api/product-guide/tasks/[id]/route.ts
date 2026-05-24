import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { formatDate, optionalText, parseDateOnly, requiredText, todayDateOnly } from "@/lib/product-guide-mutation";

export const runtime = "nodejs";

type TaskAction = "complete" | "expected-finish" | "block" | "unblock" | "submit-review";

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

  if (!action || !["complete", "expected-finish", "block", "unblock", "submit-review"].includes(action)) {
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
            },
            newValue: {
              status: "已完成",
              actualFinishDate: formatDate(actualFinishDate),
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
            status: "已送审",
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
              status: "已送审",
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

    return NextResponse.json({ ok: true, ...result, needsRecalculation: true });
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

function updateTypeForAction(action: TaskAction) {
  if (action === "complete") return "产品组标记任务完成";
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
