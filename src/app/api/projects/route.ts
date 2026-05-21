import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

type CreateProjectRequest = {
  projectName?: string;
  plannedLaunchDate?: string;
  routeType?: string;
  projectTeamId?: string;
};

export async function POST(request: Request) {
  let payload: CreateProjectRequest;

  try {
    payload = (await request.json()) as CreateProjectRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const projectName = normalizeRequiredText(payload.projectName);
  const plannedLaunchDate = parseDateOnly(payload.plannedLaunchDate);

  if (!projectName) {
    return NextResponse.json({ ok: false, message: "请填写项目名称。" }, { status: 400 });
  }

  if (!plannedLaunchDate) {
    return NextResponse.json({ ok: false, message: "请填写有效的计划上线日期。" }, { status: 400 });
  }

  try {
    const project = await prisma.project.create({
      data: {
        projectName,
        plannedLaunchDate,
        routeType: normalizeOptionalText(payload.routeType),
        projectTeamId: normalizeOptionalText(payload.projectTeamId),
        status: "进行中",
      },
      select: {
        id: true,
        projectName: true,
        plannedLaunchDate: true,
        routeType: true,
        projectTeamId: true,
      },
    });

    return NextResponse.json({
      ok: true,
      project: {
        ...project,
        plannedLaunchDate: formatDate(project.plannedLaunchDate),
      },
      message: `${project.projectName} 已新增。`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message ? `新增项目失败：${error.message}` : "新增项目失败。",
      },
      { status: 500 },
    );
  }
}

function normalizeRequiredText(value: string | undefined) {
  const text = value?.trim();
  return text || null;
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
