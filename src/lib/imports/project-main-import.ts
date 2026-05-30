import "server-only";

import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { extractProjectWorkbook, previewProjectMainImport, type ProjectMainImportPreview } from "@/lib/imports/project-main-preview";
import { ingestProjectTaskFactEventWithTx, parseProjectTaskFactEvent } from "@/lib/schedule-task-fact-events-core";
import { milestoneByTaskNo } from "@/lib/schedule-domain";
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
  importedTaskFacts: number;
  skippedTaskFacts: number;
  failedTaskFacts: number;
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
  const workbook = await extractProjectWorkbook(workbookPath);
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
            actualProgress: "实际进度录入表按 projectId / 项目名称 + taskNo / taskName 转成 ProjectTaskFactEvent",
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

    await upsertTaskRulesFromWorkbook(tx, workbook.taskRules);
    const actualImport = await applyActualTaskFactsFromWorkbook(tx, workbook.actuals, workbook.taskRules, importRecord.id, importedBy);

    await normalizeProjectLaunchDatesForMonths(tx, affectedMonths);

    await tx.dataImport.update({
      where: { id: importRecord.id },
      data: {
        rawMetadata: {
          mode: "merge",
          inputContract: {
            identity: "项目ID优先；无项目ID时使用项目名称 + 版权方 + IP",
            actualProgress: "实际进度录入表按 projectId / 项目名称 + taskNo / taskName 转成 ProjectTaskFactEvent",
            blockedCalculatedFields: ["预测完成时间", "预测上线时间", "风险等级", "延期判断", "产能超载", "里程碑状态"],
          },
          summary: preview.summary,
          referenceChanges: preview.referenceChanges,
          monthBuckets: preview.monthBuckets,
          sheets: preview.sheets,
          actualTaskFacts: actualImport,
        },
      },
    });

    return {
      ok: true,
      importId: importRecord.id,
      createdProjects,
      updatedProjects,
      importedTaskFacts: actualImport.imported,
      skippedTaskFacts: actualImport.skipped,
      failedTaskFacts: actualImport.failed,
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
    productLine: nullableText(row.productLine),
    styleCount: row.styleCount,
    retailPrice: nullableText(row.retailPrice),
    projectLevel: nullableText(row.projectLevel),
    routeType: nullableText(row.routeType),
    needThreeView: row.needThreeView,
    plannedLaunchDate: dateOnly(row.plannedLaunchDate),
    projectStartDate: nullableDate(row.projectStartDate),
    projectTeamId: nullableText(row.projectTeam),
    projectOwnerId: nullableText(row.productOwner),
    artOwnerId: nullableText(row.productArtist),
    modelingOwnerId: nullableText(row.modelingOwner),
    subsidiary: nullableText(row.subsidiary),
    royaltyRate: nullableText(row.royaltyRate),
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

async function upsertTaskRulesFromWorkbook(tx: Prisma.TransactionClient, taskRules: Array<Record<string, unknown>>) {
  for (const record of taskRules) {
    const taskNo = numberFieldAny(record, ["taskId", "taskNo", "任务编号", "任务ID"]);
    if (!taskNo || taskNo < 1 || taskNo > 31) {
      continue;
    }

    const taskName = stringFieldAny(record, ["taskName", "任务名称"]);
    if (!taskName) {
      continue;
    }

    await tx.taskRule.upsert({
      where: {
        taskNo_sourceVersion: {
          taskNo,
          sourceVersion: "任务规则v4",
        },
      },
      update: {
        taskName,
        milestoneType: milestoneByTaskNo(taskNo),
        standardWorkdays: numberFieldAny(record, ["durationDays", "标准工期"]) ?? undefined,
        isActive: true,
      },
      create: {
        taskNo,
        taskName,
        milestoneType: milestoneByTaskNo(taskNo),
        standardWorkdays: numberFieldAny(record, ["durationDays", "标准工期"]) ?? undefined,
        sourceVersion: "任务规则v4",
        isActive: true,
      },
    });
  }
}

async function applyActualTaskFactsFromWorkbook(
  tx: Prisma.TransactionClient,
  actuals: Array<Record<string, unknown>>,
  taskRules: Array<Record<string, unknown>>,
  importId: string,
  importedBy: string,
) {
  const result = {
    imported: 0,
    skipped: 0,
    failed: 0,
  };

  if (actuals.length === 0) {
    return result;
  }

  const projects = await tx.project.findMany({
    select: {
      id: true,
      projectCode: true,
      projectName: true,
    },
  });
  const projectById = new Map(projects.map((project) => [normalizeKey(project.id), project]));
  const projectByCode = uniqueMap(projects, (project) => normalizeKey(project.projectCode));
  const projectByName = uniqueMap(projects, (project) => normalizeKey(project.projectName));
  const taskNoByName = await buildTaskNoByName(tx, taskRules);

  for (const [index, record] of actuals.entries()) {
    const recordKey = stringFieldAny(record, ["recordKey", "记录Key"]);
    const projectId = stringFieldAny(record, ["项目ID", "系统项目ID", "projectId"]);
    const projectName = stringFieldAny(record, ["项目名称"]);
    const projectCode = stringFieldAny(record, ["项目编号"]) || projectCodeFromRecordKey(recordKey);
    const project =
      projectById.get(normalizeKey(projectId)) ||
      projectByCode.get(normalizeKey(projectCode)) ||
      projectByName.get(normalizeKey(projectName));

    const taskName = stringFieldAny(record, ["taskName", "任务名称"]);
    const taskNo =
      numberFieldAny(record, ["taskNo", "taskId", "任务编号", "任务ID"]) ||
      taskNoFromRecordKey(recordKey) ||
      taskNoByName.get(normalizeKey(taskName));

    const actualStartDate = dateFromValue(fieldAny(record, ["实际开始日期", "actualStartDate"]));
    const actualFinishDate = dateFromValue(fieldAny(record, ["实际完成日期", "actualFinishDate"]));
    const expectedFinishDate = dateFromValue(fieldAny(record, ["推进中任务预期完成时间", "预计完成日期", "expectedFinishDate"]));
    const note = stringFieldAny(record, ["备注", "父记录", "note"]);

    if (!project || !taskNo || taskNo < 1 || taskNo > 31 || (!actualStartDate && !actualFinishDate)) {
      result.skipped += 1;
      continue;
    }

    const eventType = actualFinishDate ? "task_completed" : "task_started";
    const event = parseProjectTaskFactEvent({
      eventId: `excel-import:${importId}:actual:${index + 2}:${project.id}:${taskNo}:${eventType}`,
      eventType,
      sourceModule: "manual-excel",
      projectId: project.id,
      taskNo,
      taskKey: `#${taskNo}`,
      taskName: taskName || `#${taskNo}`,
      occurredAt: occurredAtFromDate(actualFinishDate || actualStartDate),
      operatorId: importedBy,
      operatorName: importedBy,
      payload:
        eventType === "task_completed"
          ? {
              actualFinishDate,
              ...(actualStartDate ? { actualStartDate } : {}),
              status: "已完成",
              note: note || `Excel 导入：${taskName || `#${taskNo}`} 已完成。`,
            }
          : {
              actualStartDate,
              ...(expectedFinishDate ? { expectedFinishDate } : {}),
              status: "进行中",
              note: note || `Excel 导入：${taskName || `#${taskNo}`} 已开始。`,
            },
    });

    const ingestResult = await ingestProjectTaskFactEventWithTx(tx, event);
    if (ingestResult.ok || ingestResult.duplicate) {
      result.imported += ingestResult.duplicate ? 0 : 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

async function buildTaskNoByName(tx: Prisma.TransactionClient, workbookTaskRules: Array<Record<string, unknown>>) {
  const taskNoByName = new Map<string, number>();

  for (const record of workbookTaskRules) {
    const taskNo = numberFieldAny(record, ["taskId", "taskNo", "任务编号", "任务ID"]);
    const taskName = stringFieldAny(record, ["taskName", "任务名称"]);
    if (taskNo && taskName) {
      taskNoByName.set(normalizeKey(taskName), taskNo);
    }
  }

  const dbRules = await tx.taskRule.findMany({
    where: { isActive: true },
    select: { taskNo: true, taskName: true },
  });
  for (const rule of dbRules) {
    taskNoByName.set(normalizeKey(rule.taskName), rule.taskNo);
  }

  return taskNoByName;
}

function uniqueMap<T>(items: T[], keyOf: (item: T) => string) {
  const counts = new Map<string, number>();
  const values = new Map<string, T>();

  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    values.set(key, item);
  }

  for (const [key, count] of counts.entries()) {
    if (count > 1) {
      values.delete(key);
    }
  }

  return values;
}

function projectCodeFromRecordKey(recordKey: string) {
  const match = recordKey.match(/^([^-]+)-\d+$/);
  return match?.[1] ?? "";
}

function taskNoFromRecordKey(recordKey: string) {
  const match = recordKey.match(/-(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function occurredAtFromDate(dateText: string) {
  return `${dateText}T12:00:00+08:00`;
}

function fieldAny(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (!isBlankValue(value)) {
      return value;
    }
  }

  return undefined;
}

function stringFieldAny(record: Record<string, unknown>, keys: string[]) {
  const value = fieldAny(record, keys);
  return isBlankValue(value) ? "" : String(value).trim();
}

function numberFieldAny(record: Record<string, unknown>, keys: string[]) {
  const value = fieldAny(record, keys);
  if (isBlankValue(value)) return null;
  const number = Number(String(value).trim());

  return Number.isInteger(number) ? number : null;
}

function dateFromValue(value: unknown) {
  if (isBlankValue(value)) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30, 12);
    return formatDate(new Date(excelEpoch + Math.round(value) * 24 * 60 * 60 * 1000));
  }

  const text = String(value).trim();
  const dateMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (dateMatch) {
    return `${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, "0")}-${String(Number(dateMatch[3])).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : formatDate(parsed);
}

function isBlankValue(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
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

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function buildProjectNotes(row: ProjectPreviewRow) {
  const parts = [
    row.annualPlan ? `年度规划：${row.annualPlan}` : "",
    row.urgency ? `紧急程度：${row.urgency}` : "",
    row.notes ? `备注：${row.notes}` : "",
  ].filter(Boolean);

  return parts.join("\n");
}
