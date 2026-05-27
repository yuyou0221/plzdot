import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { previewModelingImport } from "@/lib/imports/modeling-import";
import { previewProjectMainImport } from "@/lib/imports/project-main-preview";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const importType = optionalText(formData.get("importType")) ?? "project-main";

    if (importType !== "project-main" && importType !== "modeling") {
      return NextResponse.json({ ok: false, message: "当前只支持项目主数据和建模款式预览。" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "请先选择一份 Excel 文件。" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ ok: false, message: "当前只支持 .xlsx 格式。" }, { status: 400 });
    }

    const importDir = path.join(process.cwd(), ".local", "import-previews", timestampId());
    await fs.mkdir(importDir, { recursive: true });

    const workbookPath = path.join(importDir, sanitizeFileName(file.name));
    await fs.writeFile(workbookPath, Buffer.from(await file.arrayBuffer()));

    const preview =
      importType === "modeling"
        ? await previewModelingImport(workbookPath, file.name)
        : await previewProjectMainImport(workbookPath, file.name);

    return NextResponse.json({
      ok: true,
      message: "预览已生成。本次没有写入数据库。",
      preview,
      outputDir: importDir,
    });
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
