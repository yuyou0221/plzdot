import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

type SaveAdjustmentInput = {
  projectId?: string;
  toMonth?: string;
  toDate?: string;
  reason?: string;
};

type SaveAdjustmentsRequest = {
  adjustments?: SaveAdjustmentInput[];
};

type MonthPoint = {
  year: number;
  month: number;
};

type SavedAdjustment = {
  adjustmentId: string;
  projectId: string;
  projectName: string;
  fromMonth: string;
  toMonth: string;
  fromValue: string;
  toValue: string;
};

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  let payload: SaveAdjustmentsRequest;

  try {
    payload = (await request.json()) as SaveAdjustmentsRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const normalizedAdjustments = normalizeAdjustments(payload.adjustments);

  if (normalizedAdjustments.length === 0) {
    return NextResponse.json({ ok: false, message: "没有需要保存的上线日历调整。" }, { status: 400 });
  }

  const invalidTarget = normalizedAdjustments.find((adjustment) => {
    if (adjustment.toDate) {
      return !parseDateOnly(adjustment.toDate);
    }

    return !adjustment.toMonth || !parseMonthLabel(adjustment.toMonth);
  });
  if (invalidTarget) {
    return NextResponse.json(
      { ok: false, message: `无法识别目标上线日期或月份。` },
      { status: 400 },
    );
  }

  try {
    const projects = await prisma.project.findMany({
      where: { id: { in: normalizedAdjustments.map((adjustment) => adjustment.projectId) } },
      select: {
        id: true,
        projectName: true,
        plannedLaunchDate: true,
      },
    });
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const missingProject = normalizedAdjustments.find((adjustment) => !projectById.has(adjustment.projectId));

    if (missingProject) {
      return NextResponse.json(
        { ok: false, message: `找不到项目：${missingProject.projectId}。` },
        { status: 404 },
      );
    }

    const savedAdjustments = await prisma.$transaction(async (tx) => {
      const saved: SavedAdjustment[] = [];

      for (const adjustment of normalizedAdjustments) {
        const project = projectById.get(adjustment.projectId);

        if (!project) {
          continue;
        }

        const targetDate = resolveTargetDate(project.plannedLaunchDate, adjustment);
        if (!targetDate) {
          continue;
        }

        const fromValue = formatDate(project.plannedLaunchDate);
        const toValue = formatDate(targetDate);

        if (fromValue === toValue) {
          continue;
        }

        await tx.project.update({
          where: { id: project.id },
          data: { plannedLaunchDate: dateOnly(toValue) },
        });

        const taskCardId = `calendar:${project.id}`;
        const fromMonth = formatMonthLabel(dateToMonthPoint(project.plannedLaunchDate));
        const toMonth = formatMonthLabel(dateToMonthPoint(targetDate));
        const createdAdjustment = await tx.scheduleAdjustment.create({
          data: {
            taskCardId,
            entityType: "Project",
            entityId: project.id,
            adjustmentType: "上线日历调整",
            changedField: "plannedLaunchDate",
            fromValue,
            toValue,
            reason: adjustment.reason ?? `${project.projectName} 计划上线从 ${fromValue} 调整到 ${toValue}`,
            requiresSimulation: true,
            affectsFinance: true,
            affectsReview: false,
            status: "已保存",
            createdByName: "项目排期页面",
          },
        });

        await tx.taskDragLog.create({
          data: {
            taskCardId,
            cardType: "上线日历项目卡",
            entityType: "Project",
            entityId: project.id,
            fromLaneType: "launchMonth",
            fromLaneKey: fromMonth,
            toLaneType: "launchMonth",
            toLaneKey: toMonth,
            changedField: "plannedLaunchDate",
            fromValue,
            toValue,
            adjustmentId: createdAdjustment.id,
            confirmed: true,
            dragReason: adjustment.reason ?? "上线日历拖拽调整",
            draggedByName: "项目排期页面",
          },
        });

        saved.push({
          adjustmentId: createdAdjustment.id,
          projectId: project.id,
          projectName: project.projectName,
          fromMonth,
          toMonth,
          fromValue,
          toValue,
        });
      }

      return saved;
    });

    return NextResponse.json({
      ok: true,
      savedCount: savedAdjustments.length,
      adjustments: savedAdjustments,
      message:
        savedAdjustments.length > 0
          ? `已保存 ${savedAdjustments.length} 项上线日历调整。`
          : "没有日期发生变化，未生成新的调整记录。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `保存上线日历调整失败：${error.message}`
            : "保存上线日历调整失败。",
      },
      { status: 500 },
    );
  }
}

function normalizeAdjustments(adjustments: SaveAdjustmentInput[] | undefined) {
  const byProjectId = new Map<string, { projectId: string; toMonth?: string; toDate?: string; reason?: string }>();

  for (const adjustment of adjustments ?? []) {
    const projectId = adjustment.projectId?.trim();
    const toMonth = adjustment.toMonth?.trim();
    const toDate = adjustment.toDate?.trim();

    if (!projectId || (!toMonth && !toDate)) {
      continue;
    }

    byProjectId.set(projectId, {
      projectId,
      toMonth,
      toDate,
      reason: adjustment.reason?.trim() || undefined,
    });
  }

  return Array.from(byProjectId.values());
}

function resolveTargetDate(
  sourceDate: Date,
  adjustment: { toMonth?: string; toDate?: string },
) {
  if (adjustment.toDate) {
    return parseDateOnly(adjustment.toDate);
  }

  const targetMonth = adjustment.toMonth ? parseMonthLabel(adjustment.toMonth) : null;
  return targetMonth ? dateInTargetMonth(sourceDate, targetMonth) : null;
}

function parseDateOnly(value: string) {
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

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth({ year, month })) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, 12));
}

function parseMonthLabel(label: string): MonthPoint | null {
  const fullYearMonth = label.match(/^(\d{4})年(\d{1,2})月$/);
  if (fullYearMonth) {
    return normalizeMonthPoint(Number(fullYearMonth[1]), Number(fullYearMonth[2]));
  }

  const shortYearMonth = label.match(/^(\d{2})年(\d{1,2})月$/);
  if (shortYearMonth) {
    return normalizeMonthPoint(2000 + Number(shortYearMonth[1]), Number(shortYearMonth[2]));
  }

  return null;
}

function normalizeMonthPoint(year: number, month: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

function dateInTargetMonth(sourceDate: Date, targetMonth: MonthPoint) {
  const day = Math.min(sourceDate.getUTCDate(), daysInMonth(targetMonth));
  return new Date(Date.UTC(targetMonth.year, targetMonth.month - 1, day, 12));
}

function daysInMonth(month: MonthPoint) {
  return new Date(Date.UTC(month.year, month.month, 0, 12)).getUTCDate();
}

function dateToMonthPoint(date: Date): MonthPoint {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function formatMonthLabel(month: MonthPoint) {
  return `${String(month.year).slice(-2)}年${month.month}月`;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return new Date(value);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}
