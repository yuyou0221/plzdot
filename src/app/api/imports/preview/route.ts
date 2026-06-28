import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { isHighestPermissionLevel } from "@/lib/auth/permissions";
import { previewModelingImport } from "@/lib/imports/modeling-import";
import { createImportPreviewToken, type ManagedImportType } from "@/lib/imports/preview-token";
import { previewProjectMainImport, type ProjectMainImportMode } from "@/lib/imports/project-main-preview";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const importType = optionalText(formData.get("importType")) ?? "project-main";

    if (importType !== "project-main" && importType !== "project-main-full-refresh" && importType !== "modeling") {
      return NextResponse.json({ ok: false, message: "当前只支持项目主数据和建模款式预览。" }, { status: 400 });
    }

    if (importType === "project-main-full-refresh" && !isHighestPermissionLevel(auth.user)) {
      return NextResponse.json({ ok: false, message: "全量更新项目只允许最高权限账号使用。" }, { status: 403 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "请先选择一份 Excel 文件。" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ ok: false, message: "当前只支持 .xlsx 格式。" }, { status: 400 });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-import-preview-"));
    const workbookPath = path.join(tempDir, sanitizeFileName(file.name));
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileHash = sha256(fileBuffer);

    try {
      await fs.writeFile(workbookPath, fileBuffer);

      const preview =
        importType === "modeling"
          ? await previewModelingImport(workbookPath, file.name)
          : await previewProjectMainImport(workbookPath, file.name, { mode: projectImportMode(importType) });
      const token = await createImportPreviewToken({
        importType: importType as ManagedImportType,
        fileName: file.name,
        fileHash,
        importedBy: auth.user.id,
        rowCount: preview.summary.totalRows,
      });

      return NextResponse.json({
        ok: true,
        message: "预览已生成。本次没有写入数据库，请用同一份文件确认导入。",
        preview,
        ...token,
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `生成导入预览失败：${error.message}` : "生成导入预览失败。",
      },
      { status: 500 },
    );
  }
}

function projectImportMode(importType: string): ProjectMainImportMode {
  return importType === "project-main-full-refresh" ? "full-refresh" : "merge";
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

function sha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
