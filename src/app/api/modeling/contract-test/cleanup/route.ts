import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const TEST_PROJECT_PREFIX = "MT-TEST-";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  if (!isLocalContractTestEnabled()) {
    return NextResponse.json({ ok: false, message: "建模接口测试数据只允许在本地开发环境使用。" }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({}));
  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  const scope = typeof payload.scope === "string" ? payload.scope.trim() : "current";

  const projects = await prisma.project.findMany({
    where:
      scope === "all"
        ? { projectCode: { startsWith: TEST_PROJECT_PREFIX } }
        : { id: projectId, projectCode: { startsWith: TEST_PROJECT_PREFIX } },
    select: { id: true },
  });
  const projectIds = projects.map((project) => project.id);

  if (projectIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deletedProjectCount: 0,
      deletedTaskCount: 0,
      deletedStyleCount: 0,
      deletedFeedbackCount: 0,
      deletedProgressCount: 0,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const modelingTasks = await tx.modelingTask.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const modelingTaskIds = modelingTasks.map((task) => task.id);

    const feedback = await tx.modelingFeedback.deleteMany({
      where: { modelingTaskId: { in: modelingTaskIds } },
    });
    const progress = await tx.projectModelingProgress.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    const styles = await tx.modelingTask.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    const projectTasks = await tx.projectTask.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    const projectsDeleted = await tx.project.deleteMany({
      where: { id: { in: projectIds }, projectCode: { startsWith: TEST_PROJECT_PREFIX } },
    });

    return {
      deletedProjectCount: projectsDeleted.count,
      deletedTaskCount: projectTasks.count,
      deletedStyleCount: styles.count,
      deletedFeedbackCount: feedback.count,
      deletedProgressCount: progress.count,
    };
  });

  return NextResponse.json({ ok: true, ...result });
}

function isLocalContractTestEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MODELING_CONTRACT_TEST === "true";
}
