import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { applyProjectMainImport, ProjectMainImportValidationError } from "@/lib/imports/project-main-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const importType = optionalText(formData.get("importType")) ?? "project-main";

    if (importType !== "project-main") {
      return NextResponse.json({ ok: false, message: "当前只支持项目主数据导入。" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "请先选择一份 Excel 文件。" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ ok: false, message: "当前只支持 .xlsx 格式。" }, { status: 400 });
    }

    const importDir = path.join(process.cwd(), ".local", "imports", "project-main", timestampId());
    await fs.mkdir(importDir, { recursive: true });

    const workbookPath = path.join(importDir, sanitizeFileName(file.name));
    await fs.writeFile(workbookPath, Buffer.from(await file.arrayBuffer()));

    const result = await applyProjectMainImport(workbookPath, file.name, auth.user.name);

    return NextResponse.json({
      ok: true,
      message: `导入完成：新增 ${result.createdProjects} 个项目，更新 ${result.updatedProjects} 个项目。需要重新测算排期。`,
      result,
      outputDir: importDir,
    });
  } catch (error) {
    const isValidationError = error instanceof ProjectMainImportValidationError;

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `项目主数据导入失败：${error.message}`
            : "项目主数据导入失败。",
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}

function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function sanitizeFileName(value: string) {
  const basename = path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return basename || "project-import.xlsx";
}

function timestampId() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}
