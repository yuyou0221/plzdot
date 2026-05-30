import { NextResponse } from "next/server";
import { requireApiUserDataLevelZero } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { isUserDataAuditWriteError, recordUserDataAuditLog } from "@/lib/user-data-audit";
import { userDataImportPreviewType } from "@/lib/user-data-import-preview";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const auth = await requireApiUserDataLevelZero();
  if ("response" in auth) return auth.response;

  try {
    const previewRecords = await prisma.dataImport.findMany({
      where: { importType: userDataImportPreviewType },
      select: { id: true, rawMetadata: true },
    });
    const now = Date.now();
    const expiredIds = previewRecords
      .filter((record) => {
        const metadata = jsonRecord(record.rawMetadata);
        const expiresAt = typeof metadata.expiresAt === "string" ? new Date(metadata.expiresAt).getTime() : Number.NaN;
        return Number.isFinite(expiresAt) && expiresAt <= now;
      })
      .map((record) => record.id);

    await prisma.$transaction(async (tx) => {
      if (expiredIds.length > 0) {
        await tx.dataImport.deleteMany({ where: { id: { in: expiredIds } } });
      }

      await recordUserDataAuditLog({
        actor: auth.user,
        request,
        action: "清理过期Excel预览",
        targetType: "DataImport",
        result: "成功",
        summary: `已清理 ${expiredIds.length} 条过期用户数据 Excel 预览记录。`,
        metadata: { scannedCount: previewRecords.length, deletedCount: expiredIds.length },
        client: tx,
        required: true,
      });
    });

    return NextResponse.json({
      ok: true,
      deletedCount: expiredIds.length,
      message: `已清理 ${expiredIds.length} 条过期预览记录。`,
    });
  } catch (error) {
    if (isUserDataAuditWriteError(error)) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "清理过期Excel预览",
      targetType: "DataImport",
      result: "失败",
      summary: error instanceof Error && error.message ? error.message : "清理过期预览记录失败。",
    });

    return NextResponse.json({ ok: false, message: "清理过期预览记录失败。" }, { status: 500 });
  }
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
