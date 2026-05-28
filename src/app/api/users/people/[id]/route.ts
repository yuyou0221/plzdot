import { NextResponse } from "next/server";
import { requireApiRole, requireApiUserDataLevelZero } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { userDataExcelOnlyResponse } from "@/lib/user-data-excel-only";

export const runtime = "nodejs";

export async function PATCH() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  return userDataExcelOnlyResponse();
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUserDataLevelZero();
  if ("response" in auth) return auth.response;

  const { id } = await params;

  if (auth.user.id === id) {
    return NextResponse.json({ ok: false, message: "不能删除当前登录账号。" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, status: true },
  });

  if (!target) {
    return NextResponse.json({ ok: false, message: "未找到要删除的人员。" }, { status: 404 });
  }

  if (target.status !== "停用") {
    return NextResponse.json({ ok: false, message: "只能删除停用状态的账号。" }, { status: 400 });
  }

  const businessReferenceCount = await countBusinessReferences(id);

  if (businessReferenceCount > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: `该停用账号仍被 ${businessReferenceCount} 条项目、任务或建模记录引用，暂不能删除。请先在对应业务数据中取消引用。`,
      },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.team.updateMany({ where: { leaderUserId: id }, data: { leaderUserId: null } });
    await tx.modelerCapabilityTag.deleteMany({ where: { userId: id } });
    await tx.userAvailabilityBlock.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true, id, message: `已删除停用账号：${target.name}` });
}

async function countBusinessReferences(userId: string) {
  const [
    projectCount,
    projectTaskCount,
    modelingTaskCount,
    modelingFeedbackCount,
    workTaskCount,
    alertCount,
  ] = await Promise.all([
    prisma.project.count({ where: { OR: [{ projectOwnerId: userId }, { artOwnerId: userId }] } }),
    prisma.projectTask.count({ where: { ownerId: userId } }),
    prisma.modelingTask.count({ where: { OR: [{ modelerId: userId }, { assignmentOwnerId: userId }] } }),
    prisma.modelingFeedback.count({ where: { feedbackByUserId: userId } }),
    prisma.workTask.count({ where: { ownerId: userId } }),
    prisma.alert.count({ where: { OR: [{ userId }, { ownerId: userId }] } }),
  ]);

  return projectCount + projectTaskCount + modelingTaskCount + modelingFeedbackCount + workTaskCount + alertCount;
}
