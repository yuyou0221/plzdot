import "server-only";

import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { previewProjectMainImport, type ProjectMainImportPreview } from "@/lib/imports/project-main-preview";
import { affectedLaunchMonthKeys, normalizeProjectLaunchDatesForMonths } from "@/lib/schedule-engine/planned-launch-normalization";
import { launchMonthKeyFromDate } from "@/lib/schedule-domain/planned-launch-rules";

type ProjectPreviewRow = ProjectMainImportPreview["rows"][number];

export class ProjectMainImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectMainImportValidationError";
  }
}

export type ProjectMainImportApplyResult = {
  ok: true;
  importId: string;
  createdProjects: number;
  updatedProjects: number;
  rowCount: number;
  requiresRecalculation: boolean;
  previewSummary: ProjectMainImportPreview["summary"];
};

export async function applyProjectMainImport(
  workbookPath: string,
  fileName: string,
  importedBy: string,
): Promise<ProjectMainImportApplyResult> {
  const preview = await previewProjectMainImport(workbookPath, fileName);
  assertPreviewCanBeApplied(preview);

  return prisma.$transaction(async (tx) => {
    const importRecord = await tx.dataImport.create({
      data: {
        importType: "项目主数据导入",
        sourceFileName: fileName,
        sourceFilePath: path.resolve(workbookPath),
        rowCount: preview.summary.totalRows,
        importStatus: "成功",
        importedBy,
        rawMetadata: {
          mode: "merge",
          inputContract: {
            identity: "项目ID优先；无项目ID时使用项目名称 + 版权方 + IP",
            blockedCalculatedFields: ["预测完成时间", "预测上线时间", "风险等级", "延期判断", "产能超载", "里程碑状态"],
          },
          summary: preview.summary,
          referenceChanges: preview.referenceChanges,
          monthBuckets: preview.monthBuckets,
          sheets: preview.sheets,
        },
      },
    });

    let createdProjects = 0;
    let updatedProjects = 0;
    const affectedMonths = new Set<string>();

    for (const row of preview.rows) {
      if (row.plannedLaunchDate) {
        affectedMonths.add(launchMonthKeyFromDate(dateOnly(row.plannedLaunchDate)));
      }

      if (row.matchStatus === "matched" && row.matchedProjectId) {
        const existingProject = await tx.project.findUnique({
          where: { id: row.matchedProjectId },
          select: { plannedLaunchDate: true },
        });
        for (const monthKey of affectedLaunchMonthKeys(existingProject?.plannedLaunchDate)) {
          affectedMonths.add(monthKey);
        }

        await tx.project.update({
          where: { id: row.matchedProjectId },
          data: projectUpdateData(row, importRecord.id),
        });
        updatedProjects += 1;
        continue;
      }

      if (row.matchStatus === "new") {
        await tx.project.create({
          data: {
            ...projectCreateData(row, importRecord.id),
          },
        });
        createdProjects += 1;
      }
    }

    await normalizeProjectLaunchDatesForMonths(tx, affectedMonths);

    return {
      ok: true,
      importId: importRecord.id,
      createdProjects,
      updatedProjects,
      rowCount: preview.summary.totalRows,
      requiresRecalculation: true,
      previewSummary: preview.summary,
    };
  });
}

function assertPreviewCanBeApplied(preview: ProjectMainImportPreview) {
  const blockers: string[] = [];

  if (preview.summary.invalidRows > 0 || preview.summary.errorCount > 0) {
    blockers.push(`有 ${preview.summary.invalidRows} 行不可导入，请先修正必填字段。`);
  }
  if (preview.summary.conflictRows > 0) {
    blockers.push(`有 ${preview.summary.conflictRows} 行匹配冲突，请先人工确认。`);
  }
  if (preview.summary.unverifiedRows > 0) {
    blockers.push("当前无法校验数据库已有项目，请先确认数据库可用。");
  }

  if (blockers.length > 0) {
    throw new ProjectMainImportValidationError(blockers.join(" "));
  }
}

function projectCreateData(row: ProjectPreviewRow, importId: string) {
  if (!row.plannedLaunchDate) {
    throw new ProjectMainImportValidationError(`第 ${row.rowNumber} 行缺少计划上线日期，无法创建项目。`);
  }

  return {
    projectCode: nullableText(row.projectCode),
    projectName: row.projectName,
    ipName: nullableText(row.ipName),
    licensorName: nullableText(row.licensorName),
    productType: nullableText(row.productType),
    styleCount: row.styleCount,
    projectLevel: nullableText(row.projectLevel),
    routeType: nullableText(row.routeType),
    needThreeView: row.needThreeView,
    plannedLaunchDate: dateOnly(row.plannedLaunchDate),
    projectStartDate: nullableDate(row.projectStartDate),
    projectTeamId: nullableText(row.projectTeam),
    projectOwnerId: nullableText(row.productOwner),
    artOwnerId: nullableText(row.productArtist),
    modelingOwnerId: nullableText(row.modelingOwner),
    currentStage: nullableText(row.status),
    status: nullableText(row.status) ?? "规划中",
    notes: nullableText(buildProjectNotes(row)),
    sourceImportId: importId,
  };
}

function projectUpdateData(row: ProjectPreviewRow, importId: string) {
  const data = projectCreateData({ ...row, plannedLaunchDate: row.plannedLaunchDate || "2000-01-01" }, importId);
  const { plannedLaunchDate, notes, ...rest } = data;

  return {
    ...rest,
    ...(row.plannedLaunchDate ? { plannedLaunchDate } : {}),
    ...(buildProjectNotes(row) ? { notes } : {}),
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

function nullableDate(value: string) {
  return value ? dateOnly(value) : null;
}

function dateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date(value);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function buildProjectNotes(row: ProjectPreviewRow) {
  const parts = [
    row.annualPlan ? `年度规划：${row.annualPlan}` : "",
    row.urgency ? `紧急程度：${row.urgency}` : "",
    row.notes ? `备注：${row.notes}` : "",
  ].filter(Boolean);

  return parts.join("\n");
}
