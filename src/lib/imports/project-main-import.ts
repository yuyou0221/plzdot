import "server-only";

import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  extractProjectWorkbook,
  previewProjectMainImport,
  type ProjectMainImportMode,
  type ProjectMainImportPreview,
} from "@/lib/imports/project-main-preview";
import { removedFromScheduleStatus } from "@/lib/schedule-simulation";
import { ingestProjectTaskFactEventWithTx, parseProjectTaskFactEvent } from "@/lib/schedule-task-fact-events-core";
import { canonicalTaskRuleWhere } from "@/lib/schedule-task-rules";
import {
  plannedLaunchAdjustmentSummary,
  recordPlannedLaunchDateAdjustment,
  type PlannedLaunchAdjustmentRecord,
} from "@/lib/schedule-planning-adjustments";

type ProjectPreviewRow = ProjectMainImportPreview["rows"][number];

type ActualTaskFactSample = {
  rowNumber: number;
  projectName: string;
  projectCode: string;
  projectId: string;
  taskName: string;
  taskNo?: number | null;
  reason: string;
};

type ActualTaskFactsApplySummary = {
  actualRowsTotal: number;
  actualRowsMatched: number;
  actualRowsSkipped: number;
  actualFactsCreated: number;
  actualFactsUpdated: number;
  actualFactsSkippedExisting: number;
  actualProjectNameFallbackCount: number;
  actualUnmatchedProjectSamples: ActualTaskFactSample[];
  actualUnmatchedTaskSamples: ActualTaskFactSample[];
  actualSkippedRowSamples: ActualTaskFactSample[];
  imported: number;
  skipped: number;
  failed: number;
};

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
  archivedProjects: number;
  importedTaskFacts: number;
  skippedTaskFacts: number;
  failedTaskFacts: number;
  actualTaskFacts: ActualTaskFactsApplySummary;
  taskRuleWarnings: string[];
  plannedLaunchAdjustmentSummary: {
    total: number;
    advanced: number;
    delayed: number;
    text: string;
  };
  rowCount: number;
  requiresRecalculation: boolean;
  previewSummary: ProjectMainImportPreview["summary"];
};

export async function applyProjectMainImport(
  workbookPath: string,
  fileName: string,
  importedBy: string,
  options: { mode?: ProjectMainImportMode } = {},
): Promise<ProjectMainImportApplyResult> {
  const mode = options.mode ?? "merge";
  const preview = await previewProjectMainImport(workbookPath, fileName, { mode });
  const workbook = await extractProjectWorkbook(workbookPath);
  assertPreviewCanBeApplied(preview);

  return prisma.$transaction(async (tx) => {
    const importRecord = await tx.dataImport.create({
      data: {
        importType: mode === "full-refresh" ? "项目主数据全量更新" : "项目主数据导入",
        sourceFileName: fileName,
        sourceFilePath: path.resolve(workbookPath),
        rowCount: preview.summary.totalRows,
        importStatus: "成功",
        importedBy,
        rawMetadata: {
          mode,
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
    let archivedProjects = 0;
    const plannedLaunchAdjustments: PlannedLaunchAdjustmentRecord[] = [];
    for (const row of preview.rows) {
      if (row.matchStatus === "matched" && row.matchedProjectId) {
        const existingProject = row.plannedLaunchDate
          ? await tx.project.findUnique({
              where: { id: row.matchedProjectId },
              select: { id: true, plannedLaunchDate: true, projectName: true },
            })
          : null;

        await tx.project.update({
          where: { id: row.matchedProjectId },
          data: projectUpdateData(row, importRecord.id),
        });

        if (existingProject && row.plannedLaunchDate) {
          const adjustmentRecord = await recordPlannedLaunchDateAdjustment(tx, {
            projectId: existingProject.id,
            projectName: existingProject.projectName,
            fromDate: existingProject.plannedLaunchDate,
            toDate: dateOnly(row.plannedLaunchDate),
            source: "project-main-import",
            adjustmentType: "Excel主数据规划调整",
            cardType: "Excel项目主数据行",
            reason: `${existingProject.projectName} 计划上线由 Excel 导入从 ${formatDate(existingProject.plannedLaunchDate)} 调整到 ${row.plannedLaunchDate}`,
            createdByName: importedBy,
          });

          if (adjustmentRecord) {
            plannedLaunchAdjustments.push(adjustmentRecord);
          }
        }

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

    if (mode === "full-refresh") {
      const staleProjectIds = preview.fullRefresh?.staleProjects.map((project) => project.projectId) ?? [];
      archivedProjects = await archiveProjectsRemovedFromExcel(tx, staleProjectIds, importRecord.id);
    }

    const taskRuleWarnings = await compareWorkbookTaskRules(tx, workbook.taskRules);
    const actualImport = await applyActualTaskFactsFromWorkbook(tx, workbook.actuals, workbook.taskRules, importedBy);

    await tx.dataImport.update({
      where: { id: importRecord.id },
      data: {
        rawMetadata: {
          mode,
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
          taskRuleWarnings,
          plannedLaunchAdjustments,
          ...(mode === "full-refresh"
            ? {
                fullRefresh: {
                  archivedProjects,
                  staleProjects: preview.fullRefresh?.staleProjects ?? [],
                },
              }
            : {}),
        },
      },
    });

    return {
      ok: true,
      importId: importRecord.id,
      createdProjects,
      updatedProjects,
      archivedProjects,
      importedTaskFacts: actualImport.imported,
      skippedTaskFacts: actualImport.skipped,
      failedTaskFacts: actualImport.failed,
      actualTaskFacts: actualImport,
      taskRuleWarnings,
      plannedLaunchAdjustmentSummary: {
        total: plannedLaunchAdjustments.length,
        advanced: plannedLaunchAdjustments.filter((record) => record.direction === "提前").length,
        delayed: plannedLaunchAdjustments.filter((record) => record.direction === "延期").length,
        text: plannedLaunchAdjustmentSummary(plannedLaunchAdjustments),
      },
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

async function archiveProjectsRemovedFromExcel(tx: Prisma.TransactionClient, projectIds: string[], importId: string) {
  const uniqueProjectIds = Array.from(new Set(projectIds.filter(Boolean)));
  if (uniqueProjectIds.length === 0) {
    return 0;
  }

  await Promise.all([
    tx.scheduleProjectResult.deleteMany({ where: { projectId: { in: uniqueProjectIds } } }),
    tx.scheduleTaskResult.deleteMany({ where: { projectId: { in: uniqueProjectIds } } }),
    tx.workTask.deleteMany({ where: { projectId: { in: uniqueProjectIds } } }),
    tx.taskCard.deleteMany({ where: { projectId: { in: uniqueProjectIds } } }),
    tx.alert.deleteMany({ where: { projectId: { in: uniqueProjectIds } } }),
  ]);

  const result = await tx.project.updateMany({
    where: { id: { in: uniqueProjectIds } },
    data: {
      status: removedFromScheduleStatus,
      currentStage: removedFromScheduleStatus,
      sourceImportId: importId,
    },
  });

  return result.count;
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

async function compareWorkbookTaskRules(tx: Prisma.TransactionClient, taskRules: Array<Record<string, unknown>>) {
  if (taskRules.length === 0) {
    return [];
  }

  const dbRules = await tx.taskRule.findMany({
    where: canonicalTaskRuleWhere(),
    select: { taskNo: true, taskName: true, standardWorkdays: true },
  });
  const dbRuleByTaskNo = new Map(dbRules.map((rule) => [rule.taskNo, rule]));
  const warnings: string[] = [];

  for (const record of taskRules) {
    const taskNo = numberFieldAny(record, ["taskId", "taskNo", "任务编号", "任务ID"]);
    const taskName = stringFieldAny(record, ["taskName", "任务名称"]);
    const standardWorkdays = numberFieldAny(record, ["durationDays", "标准工期"]);

    if (!taskNo || taskNo < 1 || taskNo > 31 || !taskName) {
      continue;
    }

    const dbRule = dbRuleByTaskNo.get(taskNo);
    if (!dbRule) {
      warnings.push(`任务规则v4 中 #${taskNo} ${taskName} 在系统规则中不存在，导入已忽略该规则。`);
      continue;
    }

    if (normalizeKey(dbRule.taskName) !== normalizeKey(taskName)) {
      warnings.push(`任务规则v4 中 #${taskNo} 名称为“${taskName}”，系统规则为“${dbRule.taskName}”，导入未修改系统规则。`);
    }

    if (
      typeof standardWorkdays === "number" &&
      typeof dbRule.standardWorkdays === "number" &&
      standardWorkdays !== dbRule.standardWorkdays
    ) {
      warnings.push(
        `任务规则v4 中 #${taskNo} 标准工期为 ${standardWorkdays}，系统规则为 ${dbRule.standardWorkdays}，导入未修改系统规则。`,
      );
    }
  }

  return warnings;
}

async function applyActualTaskFactsFromWorkbook(
  tx: Prisma.TransactionClient,
  actuals: Array<Record<string, unknown>>,
  taskRules: Array<Record<string, unknown>>,
  importedBy: string,
) {
  const result: ActualTaskFactsApplySummary = {
    actualRowsTotal: actuals.length,
    actualRowsMatched: 0,
    actualRowsSkipped: 0,
    actualFactsCreated: 0,
    actualFactsUpdated: 0,
    actualFactsSkippedExisting: 0,
    actualProjectNameFallbackCount: 0,
    actualUnmatchedProjectSamples: [],
    actualUnmatchedTaskSamples: [],
    actualSkippedRowSamples: [],
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
    const rowNumber = index + 2;
    const recordKey = stringFieldAny(record, ["recordKey", "记录Key"]);
    const projectId = stringFieldAny(record, ["项目ID", "系统项目ID", "系统 projectId", "projectId"]);
    const projectName = stringFieldAny(record, ["项目名称", "projectName"]);
    const recordKeyProjectCode = projectCodeFromRecordKey(recordKey);
    const explicitProjectCode = stringFieldAny(record, ["业务项目编号", "项目编号", "项目编码", "projectCode"]);
    const projectCode = recordKeyProjectCode || explicitProjectCode;
    const projectMatch = resolveActualProject({
      projectById,
      projectByCode,
      projectByName,
      recordKeyProjectCode,
      projectId,
      explicitProjectCode,
      projectName,
    });

    const taskName = stringFieldAny(record, ["taskName", "任务名称"]);
    const taskNo =
      taskNoFromRecordKey(recordKey) ||
      numberFieldAny(record, ["taskNo", "taskId", "任务编号", "任务ID"]) ||
      taskNoByName.get(normalizeKey(taskName));

    const taskStatus = stringFieldAny(record, ["taskStatus", "任务状态", "状态", "status"]);
    const actualStartDate = dateFromValue(fieldAny(record, ["实际开始日期", "actualStartDate"]));
    const actualFinishDate = dateFromValue(fieldAny(record, ["实际完成日期", "actualFinishDate"]));
    const expectedFinishDate = dateFromValue(fieldAny(record, ["推进中任务预期完成时间", "预计完成日期", "expectedFinishDate"]));
    const note = stringFieldAny(record, ["备注", "父记录", "note"]);

    if (!projectMatch.project) {
      result.actualRowsSkipped += 1;
      pushSample(result.actualUnmatchedProjectSamples, {
        rowNumber,
        projectName,
        projectCode,
        projectId,
        taskName,
        taskNo,
        reason: projectMatch.reason,
      });
      continue;
    }
    if (projectMatch.usedNameFallback) {
      result.actualProjectNameFallbackCount += 1;
    }

    if (!taskNo || taskNo < 1 || taskNo > 31) {
      result.actualRowsSkipped += 1;
      pushSample(result.actualUnmatchedTaskSamples, {
        rowNumber,
        projectName,
        projectCode,
        projectId: projectMatch.project.id,
        taskName,
        taskNo,
        reason: "未匹配到标准任务编号",
      });
      continue;
    }

    if (!actualStartDate && !actualFinishDate && !expectedFinishDate) {
      result.actualRowsSkipped += 1;
      pushSample(result.actualSkippedRowSamples, {
        rowNumber,
        projectName,
        projectCode,
        projectId: projectMatch.project.id,
        taskName,
        taskNo,
        reason: "没有实际开始、实际完成或预计完成日期",
      });
      continue;
    }

    result.actualRowsMatched += 1;

    const events = buildActualFactEvents({
      projectId: projectMatch.project.id,
      taskNo,
      taskName,
      importedBy,
      actualStartDate,
      actualFinishDate,
      expectedFinishDate,
      taskStatus,
      note,
    });

    for (const eventInput of events) {
      const event = parseProjectTaskFactEvent(eventInput);
      const ingestResult = await ingestProjectTaskFactEventWithTx(tx, event);

      if (ingestResult.duplicate) {
        result.actualFactsSkippedExisting += 1;
        continue;
      }
      if (ingestResult.ok) {
        result.actualFactsCreated += 1;
        result.actualFactsUpdated += 1;
        continue;
      }

      result.failed += 1;
      pushSample(result.actualSkippedRowSamples, {
        rowNumber,
        projectName,
        projectCode,
        projectId: projectMatch.project.id,
        taskName,
        taskNo,
        reason: ingestResult.message,
      });
    }
  }

  result.imported = result.actualFactsCreated;
  result.skipped = result.actualRowsSkipped + result.actualFactsSkippedExisting;

  return result;
}

function resolveActualProject({
  projectById,
  projectByCode,
  projectByName,
  recordKeyProjectCode,
  projectId,
  explicitProjectCode,
  projectName,
}: {
  projectById: Map<string, { id: string; projectCode: string | null; projectName: string }>;
  projectByCode: Map<string, { id: string; projectCode: string | null; projectName: string }>;
  projectByName: Map<string, { id: string; projectCode: string | null; projectName: string }>;
  recordKeyProjectCode: string;
  projectId: string;
  explicitProjectCode: string;
  projectName: string;
}) {
  const byRecordKey = projectByCode.get(normalizeKey(recordKeyProjectCode));
  if (byRecordKey) {
    return { project: byRecordKey, reason: "recordKey 业务编号匹配", usedNameFallback: false };
  }

  const byId = projectById.get(normalizeKey(projectId));
  if (byId) {
    return { project: byId, reason: "项目ID匹配", usedNameFallback: false };
  }

  const byCode = projectByCode.get(normalizeKey(explicitProjectCode));
  if (byCode) {
    return { project: byCode, reason: "业务项目编号匹配", usedNameFallback: false };
  }

  const byName = projectByName.get(normalizeKey(projectName));
  if (byName) {
    return { project: byName, reason: "项目名称精确唯一匹配", usedNameFallback: true };
  }

  return {
    project: null,
    reason: projectName ? "项目名称未匹配到唯一项目" : "缺少项目ID、业务编号和项目名称",
    usedNameFallback: false,
  };
}

function buildActualFactEvents({
  projectId,
  taskNo,
  taskName,
  importedBy,
  actualStartDate,
  actualFinishDate,
  expectedFinishDate,
  taskStatus,
  note,
}: {
  projectId: string;
  taskNo: number;
  taskName: string;
  importedBy: string;
  actualStartDate: string;
  actualFinishDate: string;
  expectedFinishDate: string;
  taskStatus: string;
  note: string;
}) {
  const name = taskName || `#${taskNo}`;
  const events: Array<Parameters<typeof parseProjectTaskFactEvent>[0]> = [];

  if (actualStartDate) {
    events.push({
      eventId: `manual-excel:task-fact:${projectId}:${taskNo}:task_started:${actualStartDate}`,
      eventType: "task_started",
      sourceModule: "manual-excel",
      projectId,
      taskNo,
      taskKey: `#${taskNo}`,
      taskName: name,
      occurredAt: occurredAtFromDate(actualStartDate),
      operatorId: importedBy,
      operatorName: importedBy,
      payload: {
        actualStartDate,
        status: "进行中",
        note: note || `Excel 导入：${name} 已开始。`,
      },
    });
  }

  if (expectedFinishDate) {
    events.push({
      eventId: `manual-excel:task-fact:${projectId}:${taskNo}:task_expected_finish_updated:${expectedFinishDate}`,
      eventType: "task_expected_finish_updated",
      sourceModule: "manual-excel",
      projectId,
      taskNo,
      taskKey: `#${taskNo}`,
      taskName: name,
      occurredAt: occurredAtFromDate(expectedFinishDate),
      operatorId: importedBy,
      operatorName: importedBy,
      payload: {
        expectedFinishDate,
        status: taskStatus || "进行中",
        note: note || `Excel 导入：${name} 更新预计完成。`,
      },
    });
  }

  if (actualFinishDate) {
    events.push({
      eventId: `manual-excel:task-fact:${projectId}:${taskNo}:task_completed:${actualFinishDate}`,
      eventType: "task_completed",
      sourceModule: "manual-excel",
      projectId,
      taskNo,
      taskKey: `#${taskNo}`,
      taskName: name,
      occurredAt: occurredAtFromDate(actualFinishDate),
      operatorId: importedBy,
      operatorName: importedBy,
      payload: {
        actualFinishDate,
        ...(actualStartDate ? { actualStartDate } : {}),
        ...(expectedFinishDate ? { expectedFinishDate } : {}),
        status: "已完成",
        note: note || `Excel 导入：${name} 已完成。`,
      },
    });
  }

  return events;
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
    where: canonicalTaskRuleWhere(),
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

function pushSample(samples: ActualTaskFactSample[], sample: ActualTaskFactSample) {
  if (samples.length >= 10) {
    return;
  }

  samples.push(sample);
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
