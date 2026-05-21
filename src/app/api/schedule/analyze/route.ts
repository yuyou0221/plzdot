import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { persistScheduleAnalysis, runScheduleAnalysisFromDatabase } from "@/lib/schedule-engine/adapters";

export const runtime = "nodejs";

type AnalyzeRequest = {
  source?: string;
  projectIds?: string[];
  today?: string;
};

export async function POST(request: Request) {
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
    const run = await prisma.scheduleRun.create({
      data: {
        runName: `手动测算 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        runType: "正式测算",
        scriptName: "project-analysis-v5-excel.js",
        scriptVersion: "p0-adapter",
        inputSnapshot: {
          source: payload.source ?? "manual",
          projectIds: payload.projectIds ?? [],
          today: payload.today ?? new Date().toISOString().slice(0, 10),
        },
        runStatus: "进行中",
        calculatedAt: new Date(),
      },
    });

    const result = await runScheduleAnalysisFromDatabase({
      projectIds: payload.projectIds,
      today: payload.today,
    });

    await persistScheduleAnalysis(run.id, result);

    await prisma.scheduleRun.update({
      where: { id: run.id },
      data: {
        runStatus: "成功",
        calculatedAt: new Date(),
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

async function checkWritableDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
