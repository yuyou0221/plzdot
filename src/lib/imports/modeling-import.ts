import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { refreshProjectModelingProgress } from "@/lib/modeling-schedule-mutation";
import type { ModelingTaskStatus } from "@/lib/modeling-schedule-types";

type ExtractedModelingWorkbook = {
  workbook: string;
  sheets: string[];
  styleSheet: string | null;
  feedbackSheet: string | null;
  styles: Array<Record<string, unknown>>;
  feedbacks: Array<Record<string, unknown>>;
};

type PreviewIssue = {
  severity: "error" | "warning" | "info";
  message: string;
};

export type ModelingStyleImportPreviewRow = {
  rowNumber: number;
  styleId: string;
  projectName: string;
  styleName: string;
  styleSequence: string;
  status: ModelingTaskStatus | "";
  modelerName: string;
  vendorName: string;
  estimatedWorkdays: number | null;
  plannedStartDate: string;
  internalApprovedDate: string;
  copyrightApprovedDate: string;
  lastUpdatedAt: string;
  note: string;
  matchStatus: "matched" | "new" | "conflict" | "invalid";
  matchBy: string;
  matchedProjectId?: string;
  matchedTaskId?: string;
  issues: PreviewIssue[];
};

export type ModelingFeedbackImportPreviewRow = {
  rowNumber: number;
  styleId: string;
  projectName: string;
  styleName: string;
  styleSequence: string;
  feedbackDate: string;
  feedbackSource: string;
  feedbackType: string;
  feedbackContent: string;
  processStatus: string;
  resolvedAt: string;
  matchStatus: "matched" | "conflict" | "invalid";
  matchBy: string;
  matchedTaskId?: string;
  issues: PreviewIssue[];
};

export type ModelingImportPreview = {
  importType: "modeling";
  importTypeLabel: string;
  fileName: string;
  sheets: string[];
  parsed: {
    styleRows: number;
    feedbackRows: number;
  };
  summary: {
    totalRows: number;
    styleRows: number;
    feedbackRows: number;
    matchedRows: number;
    newRows: number;
    conflictRows: number;
    invalidRows: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    requiresRecalculation: boolean;
  };
  globalIssues: PreviewIssue[];
  rows: ModelingStyleImportPreviewRow[];
  feedbackRows: ModelingFeedbackImportPreviewRow[];
};

type ImportContext = {
  projects: Array<{ id: string; projectName: string; projectCode: string | null }>;
  tasks: Array<{
    id: string;
    projectId: string;
    projectTaskId: string;
    styleCode: string;
    styleName: string;
    modelerId: string | null;
    outsourceVendorId: string | null;
    isOutsourced: boolean;
    reviewRound: number | null;
  }>;
  projectTasks: Array<{ id: string; projectId: string; taskNo: number; taskName: string }>;
  users: Array<{ id: string; name: string; isModeler: boolean; status: string }>;
  vendors: Array<{ id: string; name: string; stableCapacity: boolean; status: string }>;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

const validStatuses = new Set<ModelingTaskStatus>([
  "未启动",
  "未分配",
  "已排期",
  "建模中",
  "修改中",
  "待送审",
  "已送审",
  "等反馈",
  "已通过",
  "外包中",
  "暂停",
  "取消",
]);

export class ModelingImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelingImportValidationError";
  }
}

export type ModelingImportApplyResult = {
  ok: true;
  importId: string;
  createdTasks: number;
  updatedTasks: number;
  feedbackRows: number;
  assignmentChangeRows: number;
  rowCount: number;
  requiresRecalculation: boolean;
  previewSummary: ModelingImportPreview["summary"];
};

export async function previewModelingImport(workbookPath: string, fileName: string): Promise<ModelingImportPreview> {
  const workbook = await extractWorkbook(workbookPath);
  const context = await loadContext();
  const styleRows = workbook.styles.map((record, index) => previewStyleRow(record, index, context));
  const feedbackRows = workbook.feedbacks.map((record, index) => previewFeedbackRow(record, index, context, styleRows));
  const styleIssueCounts = countIssues(styleRows);
  const feedbackIssueCounts = countIssues(feedbackRows);
  const issueCounts = {
    error: styleIssueCounts.error + feedbackIssueCounts.error,
    warning: styleIssueCounts.warning + feedbackIssueCounts.warning,
    info: styleIssueCounts.info + feedbackIssueCounts.info,
  };

  return {
    importType: "modeling",
    importTypeLabel: "建模款式导入",
    fileName,
    sheets: workbook.sheets,
    parsed: {
      styleRows: styleRows.length,
      feedbackRows: feedbackRows.length,
    },
    summary: {
      totalRows: styleRows.length + feedbackRows.length,
      styleRows: styleRows.length,
      feedbackRows: feedbackRows.length,
      matchedRows: styleRows.filter((row) => row.matchStatus === "matched").length + feedbackRows.filter((row) => row.matchStatus === "matched").length,
      newRows: styleRows.filter((row) => row.matchStatus === "new").length,
      conflictRows: styleRows.filter((row) => row.matchStatus === "conflict").length + feedbackRows.filter((row) => row.matchStatus === "conflict").length,
      invalidRows: styleRows.filter((row) => row.matchStatus === "invalid").length + feedbackRows.filter((row) => row.matchStatus === "invalid").length,
      errorCount: issueCounts.error,
      warningCount: issueCounts.warning,
      infoCount: issueCounts.info,
      requiresRecalculation: styleRows.some((row) => ["待送审", "已送审", "等反馈", "已通过", "修改中"].includes(row.status)),
    },
    globalIssues: workbook.feedbackSheet
      ? []
      : [{ severity: "info", message: "未识别到建模反馈工作表，本次只处理款式明细。" }],
    rows: styleRows,
    feedbackRows,
  };
}

export async function applyModelingImport(
  workbookPath: string,
  fileName: string,
  importedBy: string,
): Promise<ModelingImportApplyResult> {
  const preview = await previewModelingImport(workbookPath, fileName);
  assertPreviewCanBeApplied(preview);
  const workbook = await extractWorkbook(workbookPath);

  return prisma.$transaction(async (tx) => {
    const importRecord = await tx.dataImport.create({
      data: {
        importType: "建模款式导入",
        sourceFileName: fileName,
        sourceFilePath: path.resolve(workbookPath),
        sheetName: [workbook.styleSheet, workbook.feedbackSheet].filter(Boolean).join(" / "),
        rowCount: preview.summary.totalRows,
        importStatus: "成功",
        importedBy,
        rawMetadata: {
          mode: "merge",
          summary: preview.summary,
          sheets: preview.sheets,
        },
      },
    });

    let createdTasks = 0;
    let updatedTasks = 0;
    let feedbackRowCount = 0;
    let assignmentChangeRows = 0;
    const touchedPairs = new Set<string>();

    for (const row of preview.rows) {
      const projectTaskId = await resolveProjectTaskId(tx, row.matchedProjectId!, row.matchedTaskId);
      const modeler = await resolveModeler(tx, row.modelerName);
      const vendor = await resolveVendor(tx, row.vendorName);
      const normalizedStatus = normalizeStatus(row.status, Boolean(vendor));
      const existing = row.matchedTaskId
        ? await tx.modelingTask.findUnique({
            where: { id: row.matchedTaskId },
            select: {
              id: true,
              modelerId: true,
              outsourceVendorId: true,
              isOutsourced: true,
              reviewRound: true,
              styleCode: true,
              actualStartDate: true,
            },
          })
        : null;

      const startDate = nullableDate(row.plannedStartDate);
      const internalApprovedDate = nullableDate(row.internalApprovedDate);
      const copyrightApprovedDate = nullableDate(row.copyrightApprovedDate);
      const actualFinishDate = copyrightApprovedDate ?? (normalizedStatus === "已通过" ? internalApprovedDate : null);
      const nextModelerId = row.modelerName ? (modeler?.id ?? existing?.modelerId ?? null) : existing ? undefined : null;
      const nextVendorId = row.vendorName ? (vendor?.id ?? null) : existing ? undefined : null;
      const data = {
        projectId: row.matchedProjectId!,
        projectTaskId,
        styleCode: row.styleSequence || existing?.styleCode || buildStyleCode(row.matchedProjectId!, row.rowNumber),
        styleName: row.styleName,
        isRequired: true,
        originalArtStatus: "已过审",
        difficulty: "常规款",
        estimatedWorkdays: row.estimatedWorkdays ?? (existing ? undefined : 7),
        modelerId: nextModelerId,
        isOutsourced: row.vendorName ? Boolean(vendor) : existing ? undefined : false,
        outsourceVendorId: nextVendorId,
        stableOutsourceCapacity: row.vendorName ? (vendor?.stableCapacity ?? false) : existing ? undefined : false,
        plannedStartDate: row.plannedStartDate ? startDate : existing ? undefined : null,
        actualStartDate: row.plannedStartDate ? startDate : existing?.actualStartDate ?? null,
        internalApprovedDate: row.internalApprovedDate ? internalApprovedDate : existing ? undefined : null,
        copyrightApprovedDate: row.copyrightApprovedDate ? copyrightApprovedDate : existing ? undefined : null,
        actualFinishDate: actualFinishDate ?? (existing ? undefined : null),
        actualWorkdays: startDate && actualFinishDate ? workdaysBetween(startDate, actualFinishDate) : undefined,
        remainingWorkdays: normalizedStatus === "已通过" ? 0 : row.estimatedWorkdays ?? undefined,
        status: normalizedStatus,
        blockType: normalizedStatus === "修改中" ? "修改中" : null,
        lastFeedbackAt: normalizedStatus === "修改中" ? nullableDate(row.lastUpdatedAt) ?? new Date() : undefined,
        affectsProjectSchedule: true,
        lastUpdatedAt: nullableDate(row.lastUpdatedAt) ?? new Date(),
        lastUpdatedBy: importedBy || "建模 Excel 导入",
      };

      if (existing) {
        const assignmentChanges = buildAssignmentChangeFeedback(
          existing,
          nextModelerId === undefined ? existing.modelerId : nextModelerId,
          modeler?.name ?? row.modelerName,
          nextVendorId === undefined ? existing.outsourceVendorId : nextVendorId,
          vendor?.name ?? row.vendorName,
        );

        await tx.modelingTask.update({
          where: { id: existing.id },
          data: removeUndefined(data),
        });
        updatedTasks += 1;

        for (const content of assignmentChanges) {
          await tx.modelingFeedback.create({
            data: {
              modelingTaskId: existing.id,
              feedbackType: "分配变更",
              roundNo: (existing.reviewRound ?? 0) + 1,
              feedbackByName: importedBy || "建模 Excel 导入",
              feedbackAt: new Date(),
              content,
              status: "已记录",
            },
          });
          assignmentChangeRows += 1;
        }
      } else {
        await tx.modelingTask.create({
          data: {
            id: row.styleId || undefined,
            ...removeUndefined(data),
          } as Prisma.ModelingTaskUncheckedCreateInput,
        });
        createdTasks += 1;
      }

      const taskId = existing?.id ?? row.styleId;
      if (row.note && taskId) {
        await tx.modelingFeedback.create({
          data: {
            modelingTaskId: taskId,
            feedbackType: "导入备注",
            roundNo: (existing?.reviewRound ?? 0) + 1,
            feedbackByName: importedBy || "建模 Excel 导入",
            feedbackAt: nullableDate(row.lastUpdatedAt) ?? new Date(),
            content: row.note,
            status: "已记录",
          },
        });
        feedbackRowCount += 1;
      }

      touchedPairs.add(`${row.matchedProjectId}::${projectTaskId}`);
    }

    for (const row of preview.feedbackRows) {
      const feedbackAt = nullableDate(row.feedbackDate) ?? new Date();
      const resolvedAt = nullableDate(row.resolvedAt);
      const nextRound = await nextFeedbackRound(tx, row.matchedTaskId!);
      const rejected = isCopyrightRejection(row);

      await tx.modelingFeedback.create({
        data: {
          modelingTaskId: row.matchedTaskId!,
          feedbackType: row.feedbackType,
          roundNo: nextRound,
          feedbackByName: row.feedbackSource,
          feedbackAt,
          content: row.feedbackContent,
          status: row.processStatus || (resolvedAt ? "已处理" : "待处理"),
          resolvedAt,
          resolvedBy: resolvedAt ? importedBy : undefined,
        },
      });

      await tx.modelingTask.update({
        where: { id: row.matchedTaskId! },
        data: {
          reviewRound: nextRound,
          lastFeedbackAt: feedbackAt,
          lastUpdatedAt: new Date(),
          lastUpdatedBy: importedBy || "建模 Excel 导入",
          ...(rejected
            ? {
                status: "修改中",
                blockType: "版权方驳回",
                blockedSince: feedbackAt,
                blockedDays: daysSince(feedbackAt),
              }
            : {}),
        },
      });
      feedbackRowCount += 1;

      const task = await tx.modelingTask.findUnique({
        where: { id: row.matchedTaskId! },
        select: { projectId: true, projectTaskId: true },
      });
      if (task) {
        touchedPairs.add(`${task.projectId}::${task.projectTaskId}`);
      }
    }

    for (const pair of touchedPairs) {
      const [projectId, projectTaskId] = pair.split("::");
      await refreshProjectModelingProgress(tx, projectId, projectTaskId);
    }

    await tx.dataImport.update({
      where: { id: importRecord.id },
      data: {
        rawMetadata: {
          mode: "merge",
          summary: preview.summary,
          sheets: preview.sheets,
          createdTasks,
          updatedTasks,
          feedbackRows: feedbackRowCount,
          assignmentChangeRows,
        },
      },
    });

    return {
      ok: true,
      importId: importRecord.id,
      createdTasks,
      updatedTasks,
      feedbackRows: feedbackRowCount,
      assignmentChangeRows,
      rowCount: preview.summary.totalRows,
      requiresRecalculation: preview.summary.requiresRecalculation,
      previewSummary: preview.summary,
    };
  });
}

function assertPreviewCanBeApplied(preview: ModelingImportPreview) {
  const blockers: string[] = [];

  if (preview.summary.invalidRows > 0 || preview.summary.errorCount > 0) {
    blockers.push(`有 ${preview.summary.invalidRows} 行不可导入，请先修正必填字段。`);
  }
  if (preview.summary.conflictRows > 0) {
    blockers.push(`有 ${preview.summary.conflictRows} 行匹配冲突，请先人工确认。`);
  }

  if (blockers.length > 0) {
    throw new ModelingImportValidationError(blockers.join(" "));
  }
}

async function extractWorkbook(workbookPath: string) {
  const scriptPath = path.join(process.cwd(), "legacy", "schedule-engine", "extract_modeling_excel.py");
  const python = process.env.SCHEDULE_IMPORT_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const result = await runCommand(python, [scriptPath, workbookPath]);

  return JSON.parse(result.stdout) as ExtractedModelingWorkbook;
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error([stderr.trim(), stdout.trim()].filter(Boolean).join("\n") || `命令退出码 ${code}`));
    });
  });
}

async function loadContext(): Promise<ImportContext> {
  const [projects, tasks, projectTasks, users, vendors] = await Promise.all([
    prisma.project.findMany({ select: { id: true, projectName: true, projectCode: true } }),
    prisma.modelingTask.findMany({
      select: {
        id: true,
        projectId: true,
        projectTaskId: true,
        styleCode: true,
        styleName: true,
        modelerId: true,
        outsourceVendorId: true,
        isOutsourced: true,
        reviewRound: true,
      },
    }),
    prisma.projectTask.findMany({
      where: { taskNo: { in: [7, 8, 9, 10] } },
      select: { id: true, projectId: true, taskNo: true, taskName: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true, isModeler: true, status: true } }),
    prisma.outsourceVendor.findMany({ select: { id: true, name: true, stableCapacity: true, status: true } }),
  ]);

  return { projects, tasks, projectTasks, users, vendors };
}

function previewStyleRow(record: Record<string, unknown>, index: number, context: ImportContext): ModelingStyleImportPreviewRow {
  const rowNumber = intValue(record["_rowNumber"]) ?? index + 2;
  const styleId = textField(record, ["款式ID", "建模任务ID"]);
  const projectName = textField(record, ["项目名称"]);
  const styleName = textField(record, ["款式名称"]);
  const styleSequence = normalizeCode(textField(record, ["款式序号", "款式编号"]));
  const rawStatus = textField(record, ["建模状态", "状态"]);
  const modelerName = textField(record, ["建模师"]);
  const vendorName = textField(record, ["外包供应商"]);
  const status = normalizeStatus(rawStatus, Boolean(vendorName));
  const issues: PreviewIssue[] = [];

  if (!projectName) issues.push({ severity: "error", message: "项目名称为空。" });
  if (!styleName) issues.push({ severity: "error", message: "款式名称为空。" });
  if (!rawStatus) issues.push({ severity: "error", message: "建模状态为空。" });
  if (rawStatus && !validStatuses.has(status)) issues.push({ severity: "error", message: `建模状态“${rawStatus}”不在允许范围内。` });

  const projectMatch = matchProject(projectName, context.projects);
  if (projectMatch.status === "missing") {
    issues.push({ severity: "error", message: `项目不存在：${projectName}` });
  } else if (projectMatch.status === "conflict") {
    issues.push({ severity: "error", message: `项目名称匹配到多个项目：${projectName}` });
  }

  const taskMatch =
    projectMatch.project && styleName
      ? matchTask({ styleId, projectId: projectMatch.project.id, styleName, styleSequence }, context.tasks)
      : { status: "new" as const, matchBy: "项目未确认，暂不能匹配款式", task: undefined };

  if (taskMatch.status === "conflict") {
    issues.push({ severity: "error", message: "款式名称匹配到多条建模任务，请补充款式ID或款式序号。" });
  }
  if (modelerName && !matchActiveModeler(modelerName, context.users)) {
    issues.push({ severity: "warning", message: `建模师不在可排期人员中：${modelerName}` });
  }
  if (vendorName && !matchVendor(vendorName, context.vendors)) {
    issues.push({ severity: "info", message: `将新增外包供应商：${vendorName}` });
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const resolvedStyleId =
    styleId ||
    taskMatch.task?.id ||
    (projectMatch.project && styleName ? `modeling-${projectMatch.project.id}-${stableHash(`${styleName}:${styleSequence}`)}` : "");

  return {
    rowNumber,
    styleId: resolvedStyleId,
    projectName,
    styleName,
    styleSequence,
    status: rawStatus ? status : "",
    modelerName,
    vendorName,
    estimatedWorkdays: intValue(fieldByAliases(record, ["预计建模天数", "预计工作日"])),
    plannedStartDate: dateText(fieldByAliases(record, ["建模开始日", "计划开始", "实际开始"])),
    internalApprovedDate: dateText(fieldByAliases(record, ["内部通过日期", "内部通过日"])),
    copyrightApprovedDate: dateText(fieldByAliases(record, ["版权方过审日期", "版权方通过日期", "实际完成"])),
    lastUpdatedAt: dateText(fieldByAliases(record, ["最近更新日期", "最后更新"])),
    note: textField(record, ["备注", "最新反馈内容"]),
    matchStatus: hasError ? "invalid" : taskMatch.status === "matched" ? "matched" : taskMatch.status === "conflict" ? "conflict" : "new",
    matchBy: hasError ? "必填或匹配错误" : taskMatch.matchBy,
    matchedProjectId: projectMatch.project?.id,
    matchedTaskId: taskMatch.task?.id,
    issues,
  };
}

function previewFeedbackRow(
  record: Record<string, unknown>,
  index: number,
  context: ImportContext,
  styleRows: ModelingStyleImportPreviewRow[],
): ModelingFeedbackImportPreviewRow {
  const rowNumber = intValue(record["_rowNumber"]) ?? index + 2;
  const styleId = textField(record, ["款式ID", "建模任务ID"]);
  const projectName = textField(record, ["项目名称"]);
  const styleName = textField(record, ["款式名称"]);
  const styleSequence = normalizeCode(textField(record, ["款式序号", "款式编号"]));
  const feedbackDate = dateText(fieldByAliases(record, ["反馈日期"]));
  const feedbackSource = textField(record, ["反馈来源"]);
  const feedbackType = textField(record, ["反馈类型"]);
  const feedbackContent = textField(record, ["反馈内容"]);
  const processStatus = textField(record, ["处理状态"]);
  const resolvedAt = dateText(fieldByAliases(record, ["处理完成日期"]));
  const issues: PreviewIssue[] = [];

  if (!projectName) issues.push({ severity: "error", message: "项目名称为空。" });
  if (!styleName && !styleId) issues.push({ severity: "error", message: "款式名称为空。" });
  if (!feedbackDate) issues.push({ severity: "error", message: "反馈日期为空或格式错误。" });
  if (!feedbackSource) issues.push({ severity: "error", message: "反馈来源为空。" });
  if (!feedbackType) issues.push({ severity: "error", message: "反馈类型为空。" });
  if (!feedbackContent) issues.push({ severity: "error", message: "反馈内容为空。" });

  const styleRowMatch = styleRows.find((row) => {
    if (styleId && row.styleId === styleId) return true;
    return normalizeKey(row.projectName) === normalizeKey(projectName) && normalizeKey(row.styleName) === normalizeKey(styleName);
  });
  const projectMatch = matchProject(projectName, context.projects);
  const taskMatch = styleRowMatch
    ? {
        status: "matched" as const,
        matchBy: styleRowMatch.matchedTaskId ? "本次款式明细 + 已有款式" : "本次款式明细 + 新增款式",
        task: context.tasks.find((task) => task.id === styleRowMatch.matchedTaskId) ?? {
          id: styleRowMatch.styleId,
          projectId: styleRowMatch.matchedProjectId ?? "",
          projectTaskId: "",
          styleCode: styleRowMatch.styleSequence,
          styleName: styleRowMatch.styleName,
          modelerId: null,
          outsourceVendorId: null,
          isOutsourced: false,
          reviewRound: null,
        },
      }
    : projectMatch.project
      ? matchTask({ styleId, projectId: projectMatch.project.id, styleName, styleSequence }, context.tasks)
      : { status: "new" as const, matchBy: "项目未确认，暂不能匹配反馈", task: undefined };

  if (taskMatch.status !== "matched") {
    issues.push({ severity: "error", message: "反馈找不到对应建模款式，请先导入款式明细。" });
  }

  const hasError = issues.some((issue) => issue.severity === "error");

  return {
    rowNumber,
    styleId,
    projectName,
    styleName,
    styleSequence,
    feedbackDate,
    feedbackSource,
    feedbackType,
    feedbackContent,
    processStatus,
    resolvedAt,
    matchStatus: hasError ? "invalid" : taskMatch.status === "matched" ? "matched" : "conflict",
    matchBy: hasError ? "必填或匹配错误" : taskMatch.matchBy,
    matchedTaskId: taskMatch.task?.id ?? styleRowMatch?.matchedTaskId ?? styleRowMatch?.styleId,
    issues,
  };
}

function matchProject(projectName: string, projects: ImportContext["projects"]) {
  const matches = projects.filter((project) => normalizeKey(project.projectName) === normalizeKey(projectName));
  if (matches.length === 1) return { status: "matched" as const, project: matches[0] };
  if (matches.length > 1) return { status: "conflict" as const, project: undefined };
  return { status: "missing" as const, project: undefined };
}

function matchTask(
  candidate: { styleId: string; projectId: string; styleName: string; styleSequence: string },
  tasks: ImportContext["tasks"],
): { status: "matched" | "new" | "conflict"; matchBy: string; task?: ImportContext["tasks"][number] } {
  if (candidate.styleId) {
    const task = tasks.find((item) => item.id === candidate.styleId);
    if (task) return { status: "matched", matchBy: "款式ID", task };
    return { status: "new", matchBy: "款式ID未存在，将新增" };
  }

  const projectTasks = tasks.filter((task) => task.projectId === candidate.projectId);
  const nameMatches = projectTasks.filter((task) => normalizeKey(task.styleName) === normalizeKey(candidate.styleName));
  const sequenceMatches = candidate.styleSequence
    ? nameMatches.filter((task) => normalizeStyleSequence(task.styleCode) === normalizeStyleSequence(candidate.styleSequence))
    : [];

  if (sequenceMatches.length === 1) return { status: "matched", matchBy: "项目名称 + 款式名称 + 款式序号", task: sequenceMatches[0] };
  if (sequenceMatches.length > 1) return { status: "conflict", matchBy: "款式序号匹配到多条" };
  if (nameMatches.length === 1) return { status: "matched", matchBy: "项目名称 + 款式名称", task: nameMatches[0] };
  if (nameMatches.length > 1) return { status: "conflict", matchBy: "项目名称 + 款式名称匹配到多条" };
  return { status: "new", matchBy: "未匹配，将新增" };
}

async function resolveProjectTaskId(tx: Prisma.TransactionClient, projectId: string, matchedTaskId?: string) {
  if (matchedTaskId) {
    const matchedTask = await tx.modelingTask.findUnique({
      where: { id: matchedTaskId },
      select: { projectTaskId: true },
    });
    if (matchedTask?.projectTaskId) {
      return matchedTask.projectTaskId;
    }
  }

  const task =
    (await tx.projectTask.findFirst({
      where: { projectId, taskNo: 10 },
      select: { id: true },
    })) ??
    (await tx.projectTask.findFirst({
      where: { projectId, taskName: { contains: "根据效果图建模" } },
      select: { id: true },
    })) ??
    (await tx.projectTask.findFirst({
      where: { projectId, taskNo: { in: [7, 8, 9, 10] } },
      orderBy: { taskNo: "asc" },
      select: { id: true },
    }));

  if (!task) {
    throw new ModelingImportValidationError(`项目 ${projectId} 找不到建模相关任务。`);
  }

  return task.id;
}

async function resolveModeler(tx: Prisma.TransactionClient, name: string) {
  if (!name) return null;
  return tx.user.findFirst({
    where: { name, isModeler: true, status: { not: "停用" } },
    select: { id: true, name: true },
  });
}

async function resolveVendor(tx: Prisma.TransactionClient, name: string) {
  if (!name) return null;
  const existing = await tx.outsourceVendor.findFirst({
    where: { name },
    select: { id: true, name: true, stableCapacity: true },
  });
  if (existing) return existing;

  return tx.outsourceVendor.create({
    data: {
      id: name,
      name,
      stableCapacity: false,
      status: "启用",
      notes: "由建模款式导入自动补齐。",
    },
    select: { id: true, name: true, stableCapacity: true },
  });
}

function buildAssignmentChangeFeedback(
  existing: { modelerId: string | null; outsourceVendorId: string | null; isOutsourced: boolean },
  nextModelerId: string | null,
  nextModelerName: string,
  nextVendorId: string | null,
  nextVendorName: string,
) {
  const rows: string[] = [];

  if ((existing.modelerId ?? "") !== (nextModelerId ?? "")) {
    rows.push(`建模师调整为：${nextModelerName || "未分配"}。`);
  }
  if ((existing.outsourceVendorId ?? "") !== (nextVendorId ?? "") || existing.isOutsourced !== Boolean(nextVendorId)) {
    rows.push(`外包供应商调整为：${nextVendorName || "未外包"}。`);
  }

  return rows;
}

async function nextFeedbackRound(tx: Prisma.TransactionClient, taskId: string) {
  const latest = await tx.modelingFeedback.findFirst({
    where: { modelingTaskId: taskId },
    orderBy: [{ roundNo: "desc" }, { feedbackAt: "desc" }],
    select: { roundNo: true },
  });

  return (latest?.roundNo ?? 0) + 1;
}

function isCopyrightRejection(row: ModelingFeedbackImportPreviewRow) {
  const text = `${row.feedbackSource} ${row.feedbackType} ${row.feedbackContent}`;
  return text.includes("版权") && (text.includes("驳回") || text.includes("不通过") || text.includes("修改"));
}

function matchActiveModeler(name: string, users: ImportContext["users"]) {
  return users.some((user) => user.name === name && user.isModeler && user.status !== "停用");
}

function matchVendor(name: string, vendors: ImportContext["vendors"]) {
  return vendors.some((vendor) => vendor.name === name && vendor.status !== "停用");
}

function normalizeStatus(value: unknown, isOutsourced: boolean): ModelingTaskStatus {
  const text = String(value ?? "").trim();

  if (validStatuses.has(text as ModelingTaskStatus)) {
    return text as ModelingTaskStatus;
  }

  if (text.includes("未启动")) return "未启动";
  if (text.includes("未分配")) return "未分配";
  if (text.includes("排期")) return "已排期";
  if (text.includes("修改")) return "修改中";
  if (text.includes("建模中") || text.includes("进行中")) return "建模中";
  if (text.includes("待送审")) return "待送审";
  if (text.includes("送审")) return "已送审";
  if (text.includes("反馈")) return "等反馈";
  if (text.includes("通过") || text.includes("完成")) return "已通过";
  if (text.includes("外包")) return "外包中";
  if (text.includes("暂停")) return "暂停";
  if (text.includes("取消")) return "取消";

  return isOutsourced ? "外包中" : "未分配";
}

function countIssues(rows: Array<{ issues: PreviewIssue[] }>) {
  return rows.reduce(
    (total, row) => {
      for (const issue of row.issues) {
        total[issue.severity] += 1;
      }
      return total;
    },
    { error: 0, warning: 0, info: 0 },
  );
}

function fieldByAliases(record: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, alias)) {
      return record[alias];
    }
  }
  return undefined;
}

function textField(record: Record<string, unknown>, aliases: string[]) {
  const value = fieldByAliases(record, aliases);
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function intValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function dateText(value: unknown) {
  const date = nullableDate(value);
  return date ? formatDate(date) : "";
}

function nullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return startOfDay(value);
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialDate(value);

  const raw = String(value).trim();
  if (!raw) return null;

  const numericRaw = Number(raw);
  if (Number.isFinite(numericRaw) && numericRaw >= 20_000 && numericRaw <= 60_000) {
    return excelSerialDate(numericRaw);
  }

  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function excelSerialDate(value: number) {
  return new Date(Date.UTC(1899, 11, 30, 12) + Math.trunc(value) * 86_400_000);
}

function workdaysBetween(startDate: Date, finishDate: Date) {
  const start = startOfDay(startDate);
  const finish = startOfDay(finishDate);
  if (finish.getTime() < start.getTime()) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= finish.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function daysSince(date: Date) {
  return Math.max(0, Math.floor((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000));
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeCode(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) && Number.isInteger(number) ? String(number) : text.replace(/\.0$/, "");
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeStyleSequence(value: string) {
  const normalized = normalizeCode(value);
  const numberMatch = normalized.match(/(\d+)$/);
  return numberMatch ? String(Number(numberMatch[1])) : normalizeKey(normalized);
}

function buildStyleCode(projectId: string, rowNumber: number) {
  return `${projectId}-S${String(rowNumber).padStart(2, "0")}`;
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function stableHash(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
