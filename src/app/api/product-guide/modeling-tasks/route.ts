import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import {
  formatDate,
  optionalText,
  parseDateOnly,
  parseNonNegativeInt,
  parsePositiveInt,
  requiredText,
} from "@/lib/product-guide-mutation";
import { isModelingMilestoneTaskNo } from "@/lib/schedule-domain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const projectId = requiredText(payload.projectId);
  const operatorName = optionalText(payload.operatorName) ?? "产品组工作指引";

  if (!projectId) {
    return NextResponse.json({ ok: false, message: "缺少项目。" }, { status: 400 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, projectCode: true, projectName: true },
    });

    if (!project) {
      return NextResponse.json({ ok: false, message: "找不到对应项目。" }, { status: 404 });
    }

    const projectTaskId = await resolveModelingProjectTaskId(project.id, optionalText(payload.projectTaskId));

    if (!projectTaskId) {
      return NextResponse.json({ ok: false, message: "找不到该项目对应的建模任务。" }, { status: 404 });
    }

    const styleNames = normalizeStyleNames(payload.styleNames);
    const styleCount = parsePositiveInt(payload.styleCount);

    if (styleNames.length === 0 && !styleCount) {
      return NextResponse.json({ ok: false, message: "请填写款式名称或款式数量。" }, { status: 400 });
    }

    const count = styleNames.length > 0 ? styleNames.length : styleCount ?? 0;
    const difficulty = optionalText(payload.difficulty) ?? "常规款";
    const estimatedWorkdays = parseNonNegativeInt(payload.estimatedWorkdays, 7) || 7;
    const originalArtApprovedDate = parseDateOnly(payload.originalArtApprovedDate);
    const originalArtStatus = originalArtApprovedDate ? "已过审" : optionalText(payload.originalArtStatus) ?? "未过审";
    const isRequired = typeof payload.isRequired === "boolean" ? payload.isRequired : true;
    const now = new Date();

    const existingCount = await prisma.modelingTask.count({
      where: { projectId: project.id, projectTaskId },
    });
    const createdTasks = await prisma.$transaction(async (tx) => {
      const tasks = [];

      for (let index = 0; index < count; index += 1) {
        const sequence = existingCount + index + 1;
        const providedName = styleNames[index];
        const styleName = providedName || `款式 ${sequence}（待补充）`;

        tasks.push(
          await tx.modelingTask.create({
            data: {
              projectId: project.id,
              projectTaskId,
              styleCode: buildStyleCode(project.projectCode, project.projectName, sequence),
              styleName,
              isRequired,
              originalArtStatus,
              originalArtApprovedDate,
              difficulty,
              estimatedWorkdays,
              status: "未分配",
              affectsProjectSchedule: true,
              lastUpdatedAt: now,
              lastUpdatedBy: operatorName,
            },
            select: { id: true, styleName: true },
          }),
        );
      }

      const progress = await tx.projectModelingProgress.findFirst({
        where: { projectId: project.id, projectTaskId },
        orderBy: { lastCalculatedAt: "desc" },
      });

      if (progress) {
        await tx.projectModelingProgress.update({
          where: { id: progress.id },
          data: {
            totalRequiredStyles: progress.totalRequiredStyles + count,
            unassignedStyles: progress.unassignedStyles + count,
            progressPercent: progress.totalRequiredStyles + count > 0
              ? Math.round((progress.approvedStyles / (progress.totalRequiredStyles + count)) * 100)
              : 0,
            lastCalculatedAt: now,
          },
        });
      } else {
        await tx.projectModelingProgress.create({
          data: {
            projectId: project.id,
            projectTaskId,
            totalRequiredStyles: count,
            approvedStyles: 0,
            inProgressStyles: 0,
            submittedStyles: 0,
            outsourcedStyles: 0,
            unassignedStyles: count,
            progressPercent: 0,
            canWritebackProjectTask: false,
            lastCalculatedAt: now,
          },
        });
      }

      await tx.progressUpdate.create({
        data: {
          projectId: project.id,
          projectTaskId,
          updateType: "产品组递交建模款式清单",
          oldValue: { existingStyleCount: existingCount },
          newValue: {
            createdStyleCount: count,
            styleNames: tasks.map((task) => task.styleName),
            originalArtStatus,
            originalArtApprovedDate: originalArtApprovedDate ? formatDate(originalArtApprovedDate) : null,
          },
          note: optionalText(payload.note),
          updatedByName: operatorName,
        },
      });

      return tasks;
    });

    return NextResponse.json({
      ok: true,
      createdCount: createdTasks.length,
      projectTaskId,
      needsRecalculation: true,
      message: `已递交 ${createdTasks.length} 个建模款式给建模排期，当前状态为未分配。`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `录入款式失败：${error.message}`
            : "录入款式失败。",
      },
      { status: 500 },
    );
  }
}

async function resolveModelingProjectTaskId(projectId: string, projectTaskId?: string) {
  if (projectTaskId) {
    const task = await prisma.projectTask.findFirst({
      where: { id: projectTaskId, projectId },
      select: { id: true, taskNo: true, taskName: true, milestoneType: true },
    });

    if (task && isModelingProjectTask(task)) {
      return task.id;
    }
  }

  const task = await prisma.projectTask.findFirst({
    where: {
      projectId,
      OR: [
        { taskName: { contains: "建模" } },
        { taskNo: { in: [7, 8, 9, 10] } },
      ],
    },
    orderBy: [{ taskNo: "asc" }],
    select: { id: true },
  });

  return task?.id;
}

function isModelingProjectTask(task: { taskNo: number; taskName: string; milestoneType: string }) {
  return isModelingMilestoneTaskNo(task.taskNo) || `${task.milestoneType} ${task.taskName}`.includes("建模");
}

function normalizeStyleNames(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/\r?\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildStyleCode(projectCode: string | null, projectName: string, sequence: number) {
  const baseCode = projectCode?.trim() || projectName.replace(/\s+/g, "").slice(0, 12) || "STYLE";
  return `${baseCode}-S${String(sequence).padStart(2, "0")}`;
}
