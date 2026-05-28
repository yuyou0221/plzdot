import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  const { projectId } = await context.params;

  if (!projectId) {
    return NextResponse.json({ ok: false, message: "缺少项目。" }, { status: 400 });
  }

  const tasks = await prisma.projectTask.findMany({
    where: {
      projectId,
      taskNo: { in: [7, 10] },
    },
    orderBy: [{ taskNo: "asc" }],
    select: {
      id: true,
      taskNo: true,
      taskName: true,
    },
  });

  const firstStyleTask = tasks.find((task) => task.taskNo === 7);
  const remainingStylesTask = tasks.find((task) => task.taskNo === 10);

  return NextResponse.json({
    ok: true,
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
  });
}
