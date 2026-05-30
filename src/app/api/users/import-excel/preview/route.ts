import { NextResponse } from "next/server";
import { requireApiUserDataLevelZero } from "@/lib/auth/api";
import { recordUserDataAuditLog } from "@/lib/user-data-audit";
import { createUserDataImportPreviewRecord, hashUserDataImportBuffer } from "@/lib/user-data-import-preview";
import { previewUserDataWorkbook, UserDataImportValidationError } from "@/lib/user-data-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiUserDataLevelZero();
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "请先选择用户数据 Excel 文件。" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ ok: false, message: "当前只支持 .xlsx 格式。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = hashUserDataImportBuffer(buffer);
    const preview = await previewUserDataWorkbook({
      buffer,
      fileName: file.name,
    });
    const previewRecord = await createUserDataImportPreviewRecord({
      actor: auth.user,
      fileName: file.name,
      fileHash,
      preview,
    });

    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "Excel预览",
      targetType: "用户数据Excel",
      targetId: previewRecord.previewId,
      result: preview.canApply ? "成功" : "拒绝",
      summary: preview.canApply ? "用户数据 Excel 安全测试预览通过。" : "用户数据 Excel 安全测试预览未通过。",
      metadata: {
        fileName: file.name,
        fileHash,
        expiresAt: previewRecord.expiresAt,
        counts: preview.counts,
        checks: preview.checks,
        warningCount: preview.warnings.length,
        errorCount: preview.errors.length,
      },
    });

    return NextResponse.json({
      ok: true,
      message: preview.canApply ? "安全测试预览通过，可以覆盖更新。" : "安全测试预览发现问题，请先处理后再覆盖更新。",
      preview,
      previewId: previewRecord.previewId,
      expiresAt: previewRecord.expiresAt,
      fileHash,
    });
  } catch (error) {
    const isValidationError = error instanceof UserDataImportValidationError;
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "Excel预览",
      targetType: "用户数据Excel",
      result: "失败",
      summary: error instanceof Error && error.message ? error.message : "用户数据预览失败。",
      metadata: { status: isValidationError ? 400 : 500 },
    });

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `用户数据预览失败：${error.message}`
            : "用户数据预览失败。",
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
