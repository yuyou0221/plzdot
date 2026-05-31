import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { canAccessInternalTestTools } from "@/lib/runtime-flags";

export const runtime = "nodejs";

const TEST_PROJECT_PREFIX = "MT-TEST-";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  if (!canAccessInternalTestTools(auth.user)) {
    return NextResponse.json({ ok: false, message: "建模接口测试数据只允许在本地开发环境使用。" }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({}));
  const seed = safeText(payload.seed) || buildSeed();
  const styleCount = clampInt(payload.styleCount, 3, 8, 5);
  const now = new Date();
  const plannedLaunchDate = addDays(startOfDay(now), 120);
  const projectCode = `${TEST_PROJECT_PREFIX}${seed}`;
  const projectName = `[建模测试] ${seed}`;

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        projectCode,
        projectName,
        ipName: "建模接口模拟 IP",
        productType: "接口测试",
        styleCount,
        projectLevel: "测试",
        routeType: "标准",
        plannedLaunchDate,
        projectStartDate: startOfDay(now),
        currentStage: "原画完成待建模",
        status: "规划中",
        notes: "CONTRACT_TEST_PROJECT",
      },
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        currentStage: true,
        status: true,
        plannedLaunchDate: true,
      },
    });

    const task7 = await tx.projectTask.create({
      data: {
        projectId: project.id,
        taskNo: 7,
        taskName: "精细建模确认风格",
        milestoneType: "建模",
        plannedStartDate: startOfDay(now),
        plannedFinishDate: addDays(startOfDay(now), 7),
        status: "当前应开始",
        progressNote: "建模接口本地测试任务",
      },
      select: { id: true, taskNo: true, taskName: true, status: true },
    });

    const task10 = await tx.projectTask.create({
      data: {
        projectId: project.id,
        taskNo: 10,
        taskName: "根据效果图建模",
        milestoneType: "建模",
        plannedStartDate: addDays(startOfDay(now), 8),
        plannedFinishDate: addDays(startOfDay(now), 28),
        status: "等待前置实际完成",
        progressNote: "建模接口本地测试任务",
      },
      select: { id: true, taskNo: true, taskName: true, status: true },
    });

    return {
      project: {
        ...project,
        plannedLaunchDate: formatDate(project.plannedLaunchDate),
        task7,
        task10,
      },
    };
  });

  return NextResponse.json({
    ok: true,
    seed,
    project: result.project,
    styles: buildFixtureStyles(seed, styleCount),
  });
}

function buildFixtureStyles(seed: string, count: number) {
  const names = ["晨跑", "午睡", "料理", "滑板", "雨衣", "音乐", "派对", "太空"];
  const difficultyByIndex = ["常规款", "简单款", "换色款", "困难正比例款"];
  const workdaysByDifficulty: Record<string, number> = {
    常规款: 7,
    简单款: 4,
    换色款: 1,
    困难正比例款: 20,
  };

  return Array.from({ length: count }, (_, index) => {
    const sequence = String(index + 1);
    const difficulty = difficultyByIndex[index % difficultyByIndex.length];
    const isFirstModelingStyle = index === 0;

    return {
      sourceStyleId: `fixture-${seed}-S${sequence.padStart(2, "0")}`,
      styleCode: `FIX-${seed}-S${sequence.padStart(2, "0")}`,
      styleSequence: sequence,
      styleName: `模拟款式-${names[index] ?? sequence}`,
      isFirstModelingStyle,
      difficulty,
      estimatedWorkdays: workdaysByDifficulty[difficulty] ?? 7,
      originalArtApprovedDate: formatDate(new Date()),
      referenceImageUrl: "",
      notes: isFirstModelingStyle ? "模拟数据：第一款，对应任务 7" : "模拟数据：其余款，对应任务 10",
    };
  });
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildSeed() {
  return String(Date.now()).slice(-8);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(value: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}
