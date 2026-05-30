import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { buildSchedulePlanningSourceExportBuffer } from "@/lib/schedule-excel-export";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  try {
    const buffer = await buildSchedulePlanningSourceExportBuffer();
    const fileName = `番茄项目规划信息收集-项目排期导出-${timestampId()}.xlsx`;

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
            ? `项目排期 Excel 导出失败：${error.message}`
            : "项目排期 Excel 导出失败。",
      },
      { status: 500 },
    );
  }
}

function timestampId() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}
