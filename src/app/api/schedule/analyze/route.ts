import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { defaultScheduleEnginePort, runAndPersistScheduleAnalysis } from "@/lib/schedule-engine/service";

export const runtime = "nodejs";

type AnalyzeRequest = {
  source?: string;
  projectIds?: string[];
  today?: string;
};

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  let payload: AnalyzeRequest = {};

  try {
    payload = (await request.json()) as AnalyzeRequest;
  } catch {
    payload = {};
  }

  const database = await checkWritableDatabase();
  if (!database.ok) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "当前还没有可用数据库，无法保存测算批次。页面会继续使用样例数据；接上 PostgreSQL 后，这个按钮会把 JS 测算结果写回看板。",
      },
      { status: 503 },
    );
  }

  try {
    const calculatedAt = await nextScheduleCalculatedAt();
    const run = await prisma.scheduleRun.create({
      data: {
        runName: `手动测算 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        runType: "正式测算",
        sourceImportId: sourceImportIdFromPayload(payload.source),
        scriptName: defaultScheduleEnginePort.engineName,
        scriptVersion: defaultScheduleEnginePort.engineVersion,
        inputSnapshot: {
          source: payload.source ?? "manual",
          projectIds: payload.projectIds ?? [],
          today: payload.today ?? new Date().toISOString().slice(0, 10),
        },
        runStatus: "进行中",
        calculatedAt,
      },
    });

    const analysis = await runAndPersistScheduleAnalysis(run.id, {
      projectIds: payload.projectIds,
      today: payload.today,
    });
    const result = analysis.payload;

    await prisma.scheduleRun.update({
      where: { id: run.id },
      data: {
        runStatus: "成功",
        calculatedAt,
      },
    });

    return NextResponse.json({
      ok: true,
      scheduleRunId: run.id,
      projectCount: result.projectCount,
      futureTaskCount: result.futureTaskCount,
      message: "测算完成，已写入项目级结果、任务级结果、任务卡和提醒。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `测算未完成：${error.message}`
            : "当前没有可用数据库，无法保存测算批次。页面会继续使用样例数据。",
      },
      { status: 503 },
    );
  }
}

async function nextScheduleCalculatedAt() {
  const latestSuccessfulRun = await prisma.scheduleRun.findFirst({
    where: { runStatus: "成功" },
    orderBy: { calculatedAt: "desc" },
    select: { calculatedAt: true },
  });
  const now = new Date();

  if (!latestSuccessfulRun || now.getTime() > latestSuccessfulRun.calculatedAt.getTime()) {
    return now;
  }

  return new Date(latestSuccessfulRun.calculatedAt.getTime() + 1000);
}

function sourceImportIdFromPayload(source: string | undefined) {
  const prefix = "project-main-import:";

  if (!source?.startsWith(prefix)) {
    return null;
  }

  const importId = source.slice(prefix.length).trim();
  return importId.length > 0 ? importId : null;
}

async function checkWritableDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
