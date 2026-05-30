import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { applyModelingImport, ModelingImportValidationError } from "@/lib/imports/modeling-import";
import { applyProjectMainImport, ProjectMainImportValidationError } from "@/lib/imports/project-main-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const importType = optionalText(formData.get("importType")) ?? "project-main";

    if (importType !== "project-main" && importType !== "modeling") {
      return NextResponse.json({ ok: false, message: "当前只支持项目主数据和建模款式导入。" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "请先选择一份 Excel 文件。" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ ok: false, message: "当前只支持 .xlsx 格式。" }, { status: 400 });
    }

    const importDir = path.join(process.cwd(), ".local", "imports", importType, timestampId());
    await fs.mkdir(importDir, { recursive: true });

    const workbookPath = path.join(importDir, sanitizeFileName(file.name));
    await fs.writeFile(workbookPath, Buffer.from(await file.arrayBuffer()));

    if (importType === "modeling") {
      const result = await applyModelingImport(workbookPath, file.name, auth.user.name);

      return NextResponse.json({
        ok: true,
        message: `导入完成：新增 ${result.createdTasks} 款，更新 ${result.updatedTasks} 款，写入 ${result.feedbackRows} 条反馈。`,
        result,
        outputDir: importDir,
      });
    }

    const result = await applyProjectMainImport(workbookPath, file.name, auth.user.name);
    const taskRuleWarningText =
      result.taskRuleWarnings.length > 0 ? ` 任务规则有 ${result.taskRuleWarnings.length} 条只读校验提醒。` : "";
    const plannedLaunchAdjustmentText =
      result.plannedLaunchAdjustmentSummary.total > 0
        ? ` 计划上线调整 ${result.plannedLaunchAdjustmentSummary.total} 项，${result.plannedLaunchAdjustmentSummary.text}`
        : "";
    const message = `导入完成：新增 ${result.createdProjects} 个项目，更新 ${result.updatedProjects} 个项目，写入 ${result.importedTaskFacts} 条任务事实。需要重新测算排期。${plannedLaunchAdjustmentText}${taskRuleWarningText}`;

    return NextResponse.json({
      ok: true,
      message,
      result,
      outputDir: importDir,
    });
  } catch (error) {
    const isValidationError = error instanceof ProjectMainImportValidationError || error instanceof ModelingImportValidationError;

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `数据导入失败：${error.message}`
            : "数据导入失败。",
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
