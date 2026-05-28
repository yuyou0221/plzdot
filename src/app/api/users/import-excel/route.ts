import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiUserDataLevelZero } from "@/lib/auth/api";
import {
  importUserDataWorkbook,
  sanitizeUserDataImportFileName,
  UserDataImportValidationError,
} from "@/lib/user-data-import";

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

    const importDir = path.join(process.cwd(), ".local", "imports", "user-data", timestampId());
    await fs.mkdir(importDir, { recursive: true });

    const workbookPath = path.join(importDir, sanitizeUserDataImportFileName(file.name));
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(workbookPath, buffer);

    const result = await importUserDataWorkbook({
      buffer,
      fileName: file.name,
      importedBy: auth.user.name,
    });

    return NextResponse.json({
      ok: true,
      message: `用户数据覆盖导入完成：人员新增 ${result.people.created}、更新 ${result.people.updated}、停用 ${result.deactivated.people}；权限角色新增 ${result.permissionRoles.created}、更新 ${result.permissionRoles.updated}；团队新增 ${result.teams.created}、更新 ${result.teams.updated}、停用 ${result.deactivated.teams}；外包新增 ${result.vendors.created}、更新 ${result.vendors.updated}、停用 ${result.deactivated.vendors}。`,
      result,
      outputDir: importDir,
    });
  } catch (error) {
    const isValidationError = error instanceof UserDataImportValidationError;

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

function timestampId() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}
