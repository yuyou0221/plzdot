import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { isHighestPermissionLevel } from "@/lib/auth/permissions";
import { applyModelingImport, ModelingImportValidationError } from "@/lib/imports/modeling-import";
import {
  markImportPreviewTokenUsed,
  validateImportPreviewToken,
  type ManagedImportType,
} from "@/lib/imports/preview-token";
import { applyProjectMainImport, ProjectMainImportValidationError } from "@/lib/imports/project-main-import";
import type { ProjectMainImportMode } from "@/lib/imports/project-main-preview";
import { createOfficialScheduleRecalculation } from "@/lib/schedule-recalculation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  let tempDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const importType = optionalText(formData.get("importType")) ?? "project-main";
    const previewId = optionalText(formData.get("previewId"));
    const previewFileHash = optionalText(formData.get("fileHash"));

    if (importType !== "project-main" && importType !== "project-main-full-refresh" && importType !== "modeling") {
      return NextResponse.json({ ok: false, message: "当前只支持项目主数据和建模款式导入。" }, { status: 400 });
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

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileHash = sha256(fileBuffer);
    const validation = await validateImportPreviewToken({
      previewId,
      fileHash: previewFileHash,
      importType: importType as ManagedImportType,
      importedBy: auth.user.id,
    });

    if (!validation.ok) {
      return NextResponse.json({ ok: false, message: validation.message }, { status: 409 });
    }

    if (validation.metadata.fileHash !== fileHash) {
      return NextResponse.json({ ok: false, message: "确认导入的文件和预览文件不一致，请重新预览。" }, { status: 409 });
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-import-apply-"));
    const workbookPath = path.join(tempDir, sanitizeFileName(file.name));
    await fs.writeFile(workbookPath, fileBuffer);

    if (importType === "modeling") {
      const result = await applyModelingImport(workbookPath, file.name, auth.user.name);
      await markImportPreviewTokenUsed(validation.previewId, validation.metadata);

      return NextResponse.json({
        ok: true,
        message: `建模款式导入完成：新增 ${result.createdTasks} 款，更新 ${result.updatedTasks} 款，写入 ${result.feedbackRows} 条反馈。`,
        result,
      });
    }

    const projectImportModeValue = projectImportMode(importType);
    const result = await applyProjectMainImport(workbookPath, file.name, auth.user.name, { mode: projectImportModeValue });
    const recalculation = await createOfficialScheduleRecalculation({
      runName: `导入重算 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      runType: "导入重算",
      source: projectImportModeValue === "full-refresh" ? "project-main-full-refresh" : "project-main-import",
      sourceImportId: result.importId,
      createdBy: auth.user.id,
    });
    await markImportPreviewTokenUsed(validation.previewId, validation.metadata);

    const taskRuleWarningText =
      result.taskRuleWarnings.length > 0 ? ` 任务规则有 ${result.taskRuleWarnings.length} 条只读校验提醒。` : "";
    const plannedLaunchAdjustmentText =
      result.plannedLaunchAdjustmentSummary.total > 0
        ? ` 计划上线调整 ${result.plannedLaunchAdjustmentSummary.total} 项，${result.plannedLaunchAdjustmentSummary.text}`
        : "";
    const archivedProjectText = result.archivedProjects > 0 ? ` 移出规划 ${result.archivedProjects} 个旧项目。` : "";
    const recalculationText = recalculation.ok ? "已自动完成正式排期重算。" : recalculation.message;

    return NextResponse.json({
      ok: recalculation.ok,
      message: `导入完成：新增 ${result.createdProjects} 个项目，更新 ${result.updatedProjects} 个项目，写入 ${result.importedTaskFacts} 条任务事实。${archivedProjectText}${recalculationText}${plannedLaunchAdjustmentText}${taskRuleWarningText}`,
      result,
      recalculation,
    });
  } catch (error) {
    const isValidationError = error instanceof ProjectMainImportValidationError || error instanceof ModelingImportValidationError;

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `数据导入失败：${error.message}` : "数据导入失败。",
      },
      { status: isValidationError ? 400 : 500 },
    );
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
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
