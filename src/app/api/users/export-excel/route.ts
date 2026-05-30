import { NextResponse } from "next/server";
import { requireApiUserDataLevelZero } from "@/lib/auth/api";
import { assertPasswordExportSecretConfigured } from "@/lib/auth/password-export";
import { recordUserDataAuditLog } from "@/lib/user-data-audit";
import { buildUserDataExportWorkbookBuffer } from "@/lib/user-data-export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUserDataLevelZero();
  if ("response" in auth) return auth.response;

  try {
    assertPasswordExportSecretConfigured();
    const buffer = await buildUserDataExportWorkbookBuffer({ includePlainPasswords: true });
    const fileName = `用户数据标准导出-${timestampId()}.xlsx`;
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "Excel导出",
      targetType: "用户数据Excel",
      result: "成功",
      summary: "导出用户数据标准 Excel，包含可解密的密码列。",
      metadata: { fileName, byteLength: buffer.byteLength, includePlainPasswords: true },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    await recordUserDataAuditLog({
      actor: auth.user,
      request,
      action: "Excel导出",
      targetType: "用户数据Excel",
      result: "失败",
      summary: error instanceof Error && error.message ? error.message : "用户数据导出失败。",
    });

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `用户数据导出失败：${error.message}`
            : "用户数据导出失败。",
      },
      { status: 500 },
    );
  }
}

function timestampId() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}
