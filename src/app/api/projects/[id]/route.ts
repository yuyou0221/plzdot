import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { getProjectDetail } from "@/lib/schedule-repository";
import { prisma } from "@/lib/db/prisma";
import { affectedLaunchMonthKeys, normalizeProjectLaunchDatesForMonths } from "@/lib/schedule-engine/planned-launch-normalization";

export const runtime = "nodejs";

type UpdateProjectRequest = {
  plannedLaunchDate?: string;
  routeType?: string;
  projectTeamId?: string;
  modelingOwnerId?: string;
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProjectDetail(id);

  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  let payload: UpdateProjectRequest;

  try {
    payload = (await request.json()) as UpdateProjectRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const plannedLaunchDate =
    payload.plannedLaunchDate === undefined ? undefined : parseDateOnly(payload.plannedLaunchDate);

  if (payload.plannedLaunchDate !== undefined && !plannedLaunchDate) {
    return NextResponse.json({ ok: false, message: "请填写有效的计划上线日期。" }, { status: 400 });
  }

  const data: {
    plannedLaunchDate?: Date;
    routeType?: string | null;
    projectTeamId?: string | null;
    modelingOwnerId?: string | null;
  } = {};

  if (plannedLaunchDate) {
    data.plannedLaunchDate = plannedLaunchDate;
  }

  if (payload.routeType !== undefined) {
    data.routeType = normalizeOptionalText(payload.routeType);
  }

  if (payload.projectTeamId !== undefined) {
    data.projectTeamId = normalizeOptionalText(payload.projectTeamId);
  }

  if (payload.modelingOwnerId !== undefined) {
    data.modelingOwnerId = normalizeOptionalText(payload.modelingOwnerId);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, message: "没有可保存的项目字段。" }, { status: 400 });
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      const existingProject = plannedLaunchDate
        ? await tx.project.findUnique({ where: { id }, select: { plannedLaunchDate: true } })
        : null;
      const updatedProject = await tx.project.update({
        where: { id },
        data,
        select: { id: true },
      });

      await normalizeProjectLaunchDatesForMonths(
        tx,
        affectedLaunchMonthKeys(existingProject?.plannedLaunchDate, plannedLaunchDate),
      );

      return tx.project.findUniqueOrThrow({
        where: { id: updatedProject.id },
        select: {
          id: true,
          projectName: true,
          plannedLaunchDate: true,
          routeType: true,
          projectTeamId: true,
          modelingOwnerId: true,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      project: {
        ...project,
        plannedLaunchDate: formatDate(project.plannedLaunchDate),
      },
      message: `${project.projectName} 已保存。`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message ? `保存项目规划失败：${error.message}` : "保存项目规划失败。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;

  try {
    const existingProject = await prisma.project.findUnique({
      where: { id },
      select: { id: true, projectName: true },
    });

    if (!existingProject) {
      return NextResponse.json({ ok: false, message: "项目不存在。" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const [projectTasks, modelingTasks, adjustments] = await Promise.all([
        tx.projectTask.findMany({ where: { projectId: id }, select: { id: true } }),
        tx.modelingTask.findMany({ where: { projectId: id }, select: { id: true } }),
        tx.scheduleAdjustment.findMany({
          where: { entityType: "Project", entityId: id },
          select: { id: true },
        }),
      ]);
      const projectTaskIds = projectTasks.map((task) => task.id);
      const modelingTaskIds = modelingTasks.map((task) => task.id);
      const adjustmentIds = adjustments.map((adjustment) => adjustment.id);

      if (adjustmentIds.length > 0) {
        await tx.scheduleSimulation.deleteMany({ where: { adjustmentId: { in: adjustmentIds } } });
      }

      if (modelingTaskIds.length > 0) {
        await tx.modelingFeedback.deleteMany({ where: { modelingTaskId: { in: modelingTaskIds } } });
      }

      await Promise.all([
        tx.scheduleAdjustment.deleteMany({ where: { entityType: "Project", entityId: id } }),
        tx.taskDragLog.deleteMany({ where: { entityType: "Project", entityId: id } }),
        tx.scheduleProjectResult.deleteMany({ where: { projectId: id } }),
        tx.scheduleTaskResult.deleteMany({ where: { projectId: id } }),
        tx.projectModelingProgress.deleteMany({ where: { projectId: id } }),
        tx.workTask.deleteMany({
          where: {
            OR: [
              { projectId: id },
              ...(projectTaskIds.length > 0 ? [{ projectTaskId: { in: projectTaskIds } }] : []),
              ...(modelingTaskIds.length > 0 ? [{ modelingTaskId: { in: modelingTaskIds } }] : []),
            ],
          },
        }),
        tx.taskCard.deleteMany({ where: { OR: [{ projectId: id }, { entityType: "Project", entityId: id }] } }),
        tx.alert.deleteMany({
          where: {
            OR: [
              { projectId: id },
              ...(projectTaskIds.length > 0 ? [{ projectTaskId: { in: projectTaskIds } }] : []),
              ...(modelingTaskIds.length > 0 ? [{ modelingTaskId: { in: modelingTaskIds } }] : []),
            ],
          },
        }),
        tx.modelingTask.deleteMany({ where: { projectId: id } }),
        tx.projectTask.deleteMany({ where: { projectId: id } }),
      ]);

      await tx.project.delete({ where: { id } });
    });

    return NextResponse.json({
      ok: true,
      message: `${existingProject.projectName} 已删除。`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message ? `删除项目失败：${error.message}` : "删除项目失败。",
      },
      { status: 500 },
    );
  }
}

function normalizeOptionalText(value: string | undefined) {
  const text = value?.trim();
  return text || null;
}

function parseDateOnly(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, 12));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
