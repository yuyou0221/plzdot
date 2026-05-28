import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { buildUserDataExportWorkbookBuffer } from "@/lib/user-data-export";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  try {
    const buffer = await buildUserDataExportWorkbookBuffer({ includePlainPasswords: true });
    const fileName = `用户数据标准导出-${timestampId()}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
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
