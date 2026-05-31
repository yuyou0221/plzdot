import { NextResponse } from "next/server";
import { requireApiUserDataLevelZero } from "@/lib/auth/api";
import { assertPasswordExportSecretConfigured } from "@/lib/auth/password-export";
import { isUserDataAuditWriteError, recordUserDataAuditLog } from "@/lib/user-data-audit";
import {
  hashUserDataImportBuffer,
  validateUserDataImportPreview,
} from "@/lib/user-data-import-preview";
import {
  importUserDataWorkbook,
  UserDataImportValidationError,
} from "@/lib/user-data-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiUserDataLevelZero();
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const previewId = typeof formData.get("previewId") === "string" ? String(formData.get("previewId")).trim() : null;

    if (!(file instanceof File)) {
      await recordUserDataAuditLog({
        actor: auth.user,
        request,
        action: "Excel覆盖导入",
        targetType: "用户数据Excel",
        result: "拒绝",
        summary: "未选择用户数据 Excel 文件。",
        required: true,
      });
      return NextResponse.json({ ok: false, message: "请先选择用户数据 Excel 文件。" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      await recordUserDataAuditLog({
        actor: auth.user,
        request,
        action: "Excel覆盖导入",
        targetType: "用户数据Excel",
        result: "拒绝",
        summary: "文件格式不是 .xlsx。",
        metadata: { fileName: file.name },
        required: true,
      });
      return NextResponse.json({ ok: false, message: "当前只支持 .xlsx 格式。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = hashUserDataImportBuffer(buffer);
    const previewValidation = await validateUserDataImportPreview({
      previewId,
      actor: auth.user,
      fileHash,
    });

    if (!previewValidation.ok) {
      await recordUserDataAuditLog({
        actor: auth.user,
        request,
        action: "Excel覆盖导入",
        targetType: "用户数据Excel",
        targetId: previewId,
        result: "拒绝",
        summary: previewValidation.reason,
        metadata: { fileName: file.name, fileHash, ...previewValidation.metadata },
        required: true,
      });

      return NextResponse.json({ ok: false, message: previewValidation.reason }, { status: previewValidation.status });
    }

    assertPasswordExportSecretConfigured();
    const result = await importUserDataWorkbook({
      buffer,
      fileName: file.name,
      importedBy: auth.user.name,
      audit: {
        actor: auth.user,
        request,
        previewId: previewValidation.record.id,
        fileHash,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `用户数据覆盖导入完成：人员新增 ${result.people.created}、更新 ${result.people.updated}、停用 ${result.deactivated.people}；权限角色新增 ${result.permissionRoles.created}、更新 ${result.permissionRoles.updated}；团队新增 ${result.teams.created}、更新 ${result.teams.updated}、停用 ${result.deactivated.teams}；外包新增 ${result.vendors.created}、更新 ${result.vendors.updated}、停用 ${result.deactivated.vendors}；不可排期记录新增 ${result.availabilityBlocks.created}、更新 ${result.availabilityBlocks.updated}、停用 ${result.deactivated.availabilityBlocks}。`,
      result,
    });
  } catch (error) {
    if (isUserDataAuditWriteError(error)) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const isValidationError = error instanceof UserDataImportValidationError;
    try {
      await recordUserDataAuditLog({
        actor: auth.user,
        request,
        action: "Excel覆盖导入",
        targetType: "用户数据Excel",
        result: "失败",
        summary: error instanceof Error && error.message ? error.message : "用户数据导入失败。",
        metadata: { status: isValidationError ? 400 : 500 },
        required: true,
      });
    } catch (auditError) {
      if (isUserDataAuditWriteError(auditError)) {
        return NextResponse.json({ ok: false, message: auditError.message }, { status: 500 });
      }
      throw auditError;
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `用户数据导入失败：${error.message}`
            : "用户数据导入失败。",
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
