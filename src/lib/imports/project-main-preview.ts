import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { suggestedLaunchDateForMonthIndex } from "@/lib/schedule-domain/planned-launch-rules";

type ExtractedWorkbook = {
  workbook: string;
  sheets: string[];
  projects: Array<Record<string, unknown>>;
  actuals: Array<Record<string, unknown>>;
  taskRules: Array<Record<string, unknown>>;
};

type ExistingProject = {
  id: string;
  projectCode: string | null;
  projectName: string;
  ipName: string | null;
  licensorName: string | null;
  productType: string | null;
  plannedLaunchDate: Date;
  projectTeamId: string | null;
  status: string;
};

type PreviewIssue = {
  severity: "error" | "warning" | "info";
  message: string;
};

type ProjectPreviewRow = {
  rowNumber: number;
  projectId: string;
  projectName: string;
  projectCode: string;
  licensorName: string;
  ipName: string;
  productType: string;
  productLine: string;
  styleCount: number | null;
  retailPrice: string;
  projectLevel: string;
  routeType: string;
  needThreeView: boolean | null;
  plannedLaunchDate: string;
  plannedLaunchMonth: string;
  projectStartDate: string;
  projectTeam: string;
  productOwner: string;
  productArtist: string;
  modelingOwner: string;
  subsidiary: string;
  royaltyRate: string;
  status: string;
  annualPlan: string;
  urgency: string;
  notes: string;
  matchStatus: "matched" | "new" | "conflict" | "invalid" | "unverified";
  matchBy: string;
  matchedProjectId?: string;
  matchedProjectName?: string;
  issues: PreviewIssue[];
};

export type ProjectMainImportPreview = {
  importType: "project-main";
  importTypeLabel: string;
  fileName: string;
  sheets: string[];
  parsed: {
    projectRows: number;
    actualRows: number;
    taskRules: number;
  };
  summary: {
    totalRows: number;
    matchedRows: number;
    newRows: number;
    conflictRows: number;
    invalidRows: number;
    unverifiedRows: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    requiresRecalculation: boolean;
  };
  globalIssues: PreviewIssue[];
  referenceChanges: {
    newLicensors: string[];
    newIpAssets: string[];
    newProductTypes: string[];
    newTeams: string[];
  };
  monthBuckets: Array<{
    month: string;
    count: number;
    level: "ok" | "warning" | "error";
    message: string;
  }>;
  rows: ProjectPreviewRow[];
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

const PROJECT_ID_FIELDS = ["项目ID", "项目 Id", "项目 ID", "项目id", "系统项目ID", "系统项目 ID"];
const PROJECT_NAME_FIELDS = ["项目名称", "项目管理系统（统一）"];
const PROJECT_CODE_FIELDS = ["项目编号", "项目编码", "业务项目编号"];
const LICENSOR_FIELDS = ["版权方", "授权方"];
const IP_FIELDS = ["IP", "IP名称", "IP 名称"];
const PRODUCT_TYPE_FIELDS = ["产品类型"];
const PRODUCT_LINE_FIELDS = ["产品线", "产品材质", "材质"];
const RETAIL_PRICE_FIELDS = ["零售价", "建议零售价", "售价"];
const PLANNED_LAUNCH_DATE_FIELDS = ["计划上线日期", "预计上线日期", "计划上线", "预计上线时间", "预估出货日期"];
const PLANNED_LAUNCH_MONTH_FIELDS = ["预计上线月份", "上线月份"];
const PROJECT_START_DATE_FIELDS = ["启动日期", "项目启动日期"];
const PROJECT_TEAM_FIELDS = ["项目组", "所属团队"];
const PRODUCT_OWNER_FIELDS = ["产品研发", "项目管理"];
const PRODUCT_ARTIST_FIELDS = ["产品研发美术", "产品美术"];
const MODELING_OWNER_FIELDS = ["建模负责人", "建模负责", "建模对接人"];
const SUBSIDIARY_FIELDS = ["子公司", "所属子公司"];
const ROYALTY_RATE_FIELDS = ["授权金比例", "授权比例", "版权金比例"];
const STATUS_FIELDS = ["项目状态", "当前阶段"];
const STYLE_COUNT_FIELDS = ["预计款式数", "规格", "款式数"];
const PROJECT_LEVEL_FIELDS = ["项目等级"];
const ROUTE_TYPE_FIELDS = ["路线", "红蜡路线or手板路线"];
const NEED_THREE_VIEW_FIELDS = ["是否需要三视图"];
const ANNUAL_PLAN_FIELDS = ["年度规划"];
const LAUNCH_ORDER_FIELDS = ["上线顺序", "上线排序", "月内顺序", "上线序号"];
const URGENCY_FIELDS = ["紧急程度"];
const NOTES_FIELDS = ["备注"];
const CALCULATED_IMPORT_FIELDS = [
  "预测完成时间",
  "预测完成日期",
  "预测上线时间",
  "预测上线日期",
  "预测完成",
  "风险等级",
  "延期判断",
  "延期天数",
  "产能超载",
  "里程碑状态",
  "forecastFinishDate",
  "forecastLaunchDate",
  "riskLevel",
  "delayDays",
  "capacityOverload",
];

export async function previewProjectMainImport(workbookPath: string, fileName: string): Promise<ProjectMainImportPreview> {
  const workbook = await extractProjectWorkbook(workbookPath);
  const projectRecords = workbook.projects.filter(isProjectRecordCandidate);
  const existingProjectResult = await loadExistingProjects();
  const existingProjects = existingProjectResult.projects;
  const existingRefs = buildExistingRefs(existingProjects);
  const duplicateIndexes = duplicateIdentityIndexes(projectRecords);
  const suggestedLaunchDateByIndex = buildSuggestedLaunchDateByIndex(projectRecords);
  const rows = projectRecords.map((record, index) =>
    previewProjectRow(
      record,
      index,
      existingProjects,
      existingRefs,
      duplicateIndexes,
      existingProjectResult.canMatchExisting,
      suggestedLaunchDateByIndex,
    ),
  );
  const issueCounts = countIssues(rows);

  return {
    importType: "project-main",
    importTypeLabel: "项目主数据导入",
    fileName,
    sheets: workbook.sheets,
    parsed: {
      projectRows: projectRecords.length,
      actualRows: workbook.actuals.length,
      taskRules: workbook.taskRules.length,
    },
    summary: {
      totalRows: rows.length,
      matchedRows: rows.filter((row) => row.matchStatus === "matched").length,
      newRows: rows.filter((row) => row.matchStatus === "new").length,
      conflictRows: rows.filter((row) => row.matchStatus === "conflict").length,
      invalidRows: rows.filter((row) => row.matchStatus === "invalid").length,
      unverifiedRows: rows.filter((row) => row.matchStatus === "unverified").length,
      errorCount: issueCounts.error,
      warningCount: issueCounts.warning + existingProjectResult.globalIssues.filter((issue) => issue.severity === "warning").length,
      infoCount: issueCounts.info + existingProjectResult.globalIssues.filter((issue) => issue.severity === "info").length,
      requiresRecalculation: true,
    },
    globalIssues: existingProjectResult.globalIssues,
    referenceChanges: collectReferenceChanges(rows, existingRefs),
    monthBuckets: buildMonthBuckets(rows),
    rows,
  };
}

export async function extractProjectWorkbook(workbookPath: string) {
  const scriptPath = path.join(process.cwd(), "legacy", "schedule-engine", "extract_project_excel.py");
  const python = process.env.SCHEDULE_IMPORT_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const result = await runCommand(python, [scriptPath, workbookPath]);

  return JSON.parse(result.stdout) as ExtractedWorkbook;
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

async function loadExistingProjects(): Promise<{ projects: ExistingProject[]; canMatchExisting: boolean; globalIssues: PreviewIssue[] }> {
  try {
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        ipName: true,
        licensorName: true,
        productType: true,
        plannedLaunchDate: true,
        projectTeamId: true,
        status: true,
      },
    });

    return { projects, canMatchExisting: true, globalIssues: [] };
  } catch {
    return {
      projects: [],
      canMatchExisting: false,
      globalIssues: [{ severity: "warning", message: "当前数据库不可用，本次只能检查 Excel 内容，无法判断项目是否已经存在。" }],
    };
  }
}

function previewProjectRow(
  record: Record<string, unknown>,
  index: number,
  existingProjects: ExistingProject[],
  existingRefs: ReturnType<typeof buildExistingRefs>,
  duplicateIndexes: Set<number>,
  canMatchExisting: boolean,
  suggestedLaunchDateByIndex: Map<number, string>,
): ProjectPreviewRow {
  const projectId = stringFieldAny(record, PROJECT_ID_FIELDS);
  const projectName = stringFieldAny(record, PROJECT_NAME_FIELDS);
  const projectCode = normalizeCode(fieldAny(record, PROJECT_CODE_FIELDS));
  const licensorName = stringFieldAny(record, LICENSOR_FIELDS);
  const ipName = stringFieldAny(record, IP_FIELDS);
  const productType = stringFieldAny(record, PRODUCT_TYPE_FIELDS);
  const productLine = stringFieldAny(record, PRODUCT_LINE_FIELDS);
  const retailPrice = stringFieldAny(record, RETAIL_PRICE_FIELDS);
  const plannedLaunchDate = plannedLaunchDateFromRecord(record, suggestedLaunchDateByIndex.get(index));
  const plannedLaunchMonth =
    monthFromDateString(plannedLaunchDate) || plannedLaunchMonthFromRecord(record);
  const projectStartDate = dateFromValue(fieldAny(record, PROJECT_START_DATE_FIELDS));
  const projectTeam = stringFieldAny(record, PROJECT_TEAM_FIELDS);
  const productOwner = stringFieldAny(record, PRODUCT_OWNER_FIELDS);
  const productArtist = stringFieldAny(record, PRODUCT_ARTIST_FIELDS);
  const modelingOwner = stringFieldAny(record, MODELING_OWNER_FIELDS);
  const subsidiary = stringFieldAny(record, SUBSIDIARY_FIELDS);
  const royaltyRate = stringFieldAny(record, ROYALTY_RATE_FIELDS);
  const status = stringFieldAny(record, STATUS_FIELDS);
  const styleCount = numberFieldAny(record, STYLE_COUNT_FIELDS);
  const projectLevel = stringFieldAny(record, PROJECT_LEVEL_FIELDS);
  const routeType = stringFieldAny(record, ROUTE_TYPE_FIELDS);
  const needThreeView = booleanFieldAny(record, NEED_THREE_VIEW_FIELDS);
  const annualPlan = stringFieldAny(record, ANNUAL_PLAN_FIELDS);
  const urgency = stringFieldAny(record, URGENCY_FIELDS);
  const notes = stringFieldAny(record, NOTES_FIELDS);
  const issues: PreviewIssue[] = [];

  for (const blockedField of calculatedFieldsInRecord(record)) {
    issues.push({ severity: "error", message: `Excel 包含计算字段「${blockedField}」，项目主数据导入不允许写入。` });
  }
  if (!projectName) {
    issues.push({ severity: "error", message: "项目名称为空，无法导入。" });
  }
  if (!licensorName) {
    issues.push({ severity: "error", message: "版权方为空，项目主数据必填。" });
  }
  if (!ipName) {
    issues.push({ severity: "error", message: "IP 为空，项目主数据必填。" });
  }
  if (duplicateIndexes.has(index)) {
    issues.push({ severity: "warning", message: "文件内出现疑似重复项目，请确认是否为同一项目。" });
  }
  if (projectCode && plannedLaunchMonth) {
    const codeYear = businessCodeYear(projectCode);
    const launchYear = Number(plannedLaunchMonth.slice(0, 4));

    if (codeYear && launchYear && codeYear !== launchYear) {
      issues.push({ severity: "warning", message: `项目编号年份为 ${String(codeYear).slice(-2)}，计划月份为 ${plannedLaunchMonth}，请确认是否正常延期。` });
    }
  }
  if (!plannedLaunchMonth) {
    issues.push({ severity: "warning", message: "没有识别到预计上线月份 / 计划上线日期。" });
  }

  const match = canMatchExisting
    ? matchProject({ projectId, projectName, licensorName, ipName }, existingProjects)
    : { status: "unverified" as const, matchBy: "数据库不可用，暂不能匹配现有项目", project: undefined };

  if (match.status === "new" && !plannedLaunchDate) {
    issues.push({ severity: "error", message: "新增项目缺少计划上线日期，无法创建。" });
  }
  if (match.status === "conflict" && projectId) {
    issues.push({ severity: "error", message: "项目ID没有匹配到现有项目；请修正项目ID，或删除项目ID后按项目名称 + 版权方 + IP 创建新项目。" });
  }
  if (!existingRefs.licensors.has(normalizeKey(licensorName)) && licensorName) {
    issues.push({ severity: "info", message: `将新增版权方：${licensorName}` });
  }
  if (!existingRefs.ips.has(normalizeKey(ipName)) && ipName) {
    issues.push({ severity: "info", message: `将新增 IP：${ipName}` });
  }
  if (!existingRefs.productTypes.has(normalizeKey(productType)) && productType) {
    issues.push({ severity: "info", message: `将新增产品类型：${productType}` });
  }
  if (!existingRefs.teams.has(normalizeKey(projectTeam)) && projectTeam) {
    issues.push({ severity: "info", message: `项目组未在现有项目数据中出现：${projectTeam}` });
  }

  const hasError = issues.some((issue) => issue.severity === "error");

  return {
    rowNumber: index + 2,
    projectId,
    projectName,
    projectCode,
    licensorName,
    ipName,
    productType,
    productLine,
    styleCount,
    retailPrice,
    projectLevel,
    routeType,
    needThreeView,
    plannedLaunchDate,
    plannedLaunchMonth,
    projectStartDate,
    projectTeam,
    productOwner,
    productArtist,
    modelingOwner,
    subsidiary,
    royaltyRate,
    status,
    annualPlan,
    urgency,
    notes,
    matchStatus: hasError ? "invalid" : match.status,
    matchBy: hasError ? "校验错误" : match.matchBy,
    matchedProjectId: match.project?.id,
    matchedProjectName: match.project?.projectName,
    issues,
  };
}

function matchProject(
  candidate: { projectId: string; projectName: string; licensorName: string; ipName: string },
  existingProjects: ExistingProject[],
): { status: "matched" | "new" | "conflict"; matchBy: string; project?: ExistingProject } {
  if (candidate.projectId) {
    const matches = existingProjects.filter((project) => normalizeKey(project.id) === normalizeKey(candidate.projectId));
    if (matches.length === 1) return { status: "matched", matchBy: "项目ID", project: matches[0] };
    return { status: "conflict", matchBy: "项目ID未匹配到现有项目" };
  }

  if (!candidate.projectName || !candidate.licensorName || !candidate.ipName) {
    return { status: "new", matchBy: "缺少完整身份字段，无法匹配现有项目" };
  }

  const identityMatches = existingProjects.filter(
    (project) =>
      normalizeKey(project.projectName) === normalizeKey(candidate.projectName) &&
      normalizeKey(project.ipName) === normalizeKey(candidate.ipName) &&
      normalizeKey(project.licensorName) === normalizeKey(candidate.licensorName),
  );
  if (identityMatches.length === 1) return { status: "matched", matchBy: "项目名称 + IP + 版权方", project: identityMatches[0] };
  if (identityMatches.length > 1) return { status: "conflict", matchBy: "项目名称 + IP + 版权方匹配到多个项目" };

  const nameMatches = existingProjects.filter((project) => normalizeKey(project.projectName) === normalizeKey(candidate.projectName));
  if (nameMatches.length === 1) return { status: "matched", matchBy: "项目名称唯一匹配", project: nameMatches[0] };
  if (nameMatches.length > 1) return { status: "conflict", matchBy: "项目名称匹配到多个项目" };

  return { status: "new", matchBy: "未匹配，将新增" };
}

function buildExistingRefs(existingProjects: ExistingProject[]) {
  return {
    licensors: new Set(existingProjects.map((project) => normalizeKey(project.licensorName)).filter(Boolean)),
    ips: new Set(existingProjects.map((project) => normalizeKey(project.ipName)).filter(Boolean)),
    productTypes: new Set(existingProjects.map((project) => normalizeKey(project.productType)).filter(Boolean)),
    teams: new Set(existingProjects.map((project) => normalizeKey(project.projectTeamId)).filter(Boolean)),
  };
}

function collectReferenceChanges(rows: ProjectPreviewRow[], existingRefs: ReturnType<typeof buildExistingRefs>) {
  return {
    newLicensors: uniqueSorted(rows.map((row) => row.licensorName).filter((value) => value && !existingRefs.licensors.has(normalizeKey(value)))),
    newIpAssets: uniqueSorted(rows.map((row) => row.ipName).filter((value) => value && !existingRefs.ips.has(normalizeKey(value)))),
    newProductTypes: uniqueSorted(rows.map((row) => row.productType).filter((value) => value && !existingRefs.productTypes.has(normalizeKey(value)))),
    newTeams: uniqueSorted(rows.map((row) => row.projectTeam).filter((value) => value && !existingRefs.teams.has(normalizeKey(value)))),
  };
}

function buildMonthBuckets(rows: ProjectPreviewRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.plannedLaunchMonth) continue;
    counts.set(row.plannedLaunchMonth, (counts.get(row.plannedLaunchMonth) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      if (count > 5) {
        return { month, count, level: "error" as const, message: "超过每月 5 个项目硬上限。" };
      }
      if (count < 2) {
        return { month, count, level: "warning" as const, message: "低于每月 2 个项目硬下限；如果这是部分导入可忽略。" };
      }
      if (count < 3 || count > 4) {
        return { month, count, level: "warning" as const, message: "不在每月 3-4 个项目软目标内。" };
      }

      return { month, count, level: "ok" as const, message: "符合软目标。" };
    });
}

function duplicateIdentityIndexes(records: Array<Record<string, unknown>>) {
  const indexes = new Map<string, number[]>();

  records.forEach((record, index) => {
    const projectId = stringFieldAny(record, PROJECT_ID_FIELDS);
    const projectName = stringFieldAny(record, PROJECT_NAME_FIELDS);
    const licensorName = stringFieldAny(record, LICENSOR_FIELDS);
    const ipName = stringFieldAny(record, IP_FIELDS);
    const key = projectId ? `id:${normalizeKey(projectId)}` : [projectName, licensorName, ipName].map(normalizeKey).join("|");
    if (!key.replace(/\|/g, "")) return;
    indexes.set(key, [...(indexes.get(key) ?? []), index]);
  });

  return new Set(Array.from(indexes.values()).filter((items) => items.length > 1).flat());
}

function isProjectRecordCandidate(record: Record<string, unknown>) {
  const meaningfulKeys = [
    ...PROJECT_ID_FIELDS,
    ...PROJECT_NAME_FIELDS,
    ...PROJECT_CODE_FIELDS,
    ...LICENSOR_FIELDS,
    ...IP_FIELDS,
    ...PRODUCT_TYPE_FIELDS,
    ...PRODUCT_LINE_FIELDS,
    ...RETAIL_PRICE_FIELDS,
    ...PLANNED_LAUNCH_DATE_FIELDS,
    ...PLANNED_LAUNCH_MONTH_FIELDS,
    ...LAUNCH_ORDER_FIELDS,
    ...PROJECT_TEAM_FIELDS,
    ...MODELING_OWNER_FIELDS,
    ...STATUS_FIELDS,
  ];

  return meaningfulKeys.some((key) => stringField(record, key));
}

function countIssues(rows: ProjectPreviewRow[]) {
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

function field(record: Record<string, unknown>, key: string) {
  return record[key];
}

function fieldAny(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = field(record, key);
    if (!isBlankValue(value)) {
      return value;
    }
  }

  return undefined;
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = field(record, key);

  if (isBlankValue(value)) {
    return "";
  }

  return String(value).trim();
}

function stringFieldAny(record: Record<string, unknown>, keys: string[]) {
  const value = fieldAny(record, keys);

  return isBlankValue(value) ? "" : String(value).trim();
}

function numberFieldAny(record: Record<string, unknown>, keys: string[]) {
  const value = fieldAny(record, keys);
  if (isBlankValue(value)) return null;
  const number = Number(String(value).trim());

  return Number.isFinite(number) ? number : null;
}

function booleanFieldAny(record: Record<string, unknown>, keys: string[]) {
  const value = fieldAny(record, keys);
  if (isBlankValue(value)) return null;
  if (typeof value === "boolean") return value;

  const text = String(value).trim().toLowerCase();
  if (["是", "yes", "y", "true", "1", "需要"].includes(text)) return true;
  if (["否", "no", "n", "false", "0", "不需要"].includes(text)) return false;

  return null;
}

function calculatedFieldsInRecord(record: Record<string, unknown>) {
  const blockedKeys = new Set(CALCULATED_IMPORT_FIELDS.map(normalizeHeaderKey));

  return Object.keys(record).filter((key) => blockedKeys.has(normalizeHeaderKey(key)) && !isBlankValue(record[key]));
}

function plannedLaunchDateFromRecord(record: Record<string, unknown>, suggestedLaunchDate: string | undefined) {
  const plannedDate = exactDateFromValue(fieldAny(record, PLANNED_LAUNCH_DATE_FIELDS));
  if (plannedDate) {
    return plannedDate;
  }

  return suggestedLaunchDate ?? "";
}

function buildSuggestedLaunchDateByIndex(records: Array<Record<string, unknown>>) {
  const groups = new Map<string, Array<{ index: number; record: Record<string, unknown> }>>();

  records.forEach((record, index) => {
    if (exactDateFromValue(fieldAny(record, PLANNED_LAUNCH_DATE_FIELDS))) {
      return;
    }

    const plannedMonth = plannedLaunchMonthFromRecord(record);
    if (!plannedMonth) {
      return;
    }

    groups.set(plannedMonth, [...(groups.get(plannedMonth) ?? []), { index, record }]);
  });

  const result = new Map<number, string>();

  for (const [month, items] of groups.entries()) {
    const orderedItems = items.sort((a, b) => compareLaunchOrder(a.record, b.record, a.index, b.index));

    orderedItems.forEach((item, index) => {
      result.set(item.index, suggestedLaunchDateForMonthIndex(month, index, orderedItems.length));
    });
  }

  return result;
}

function plannedLaunchMonthFromRecord(record: Record<string, unknown>) {
  return (
    monthFromValue(fieldAny(record, PLANNED_LAUNCH_MONTH_FIELDS)) ||
    monthFromValue(fieldAny(record, PLANNED_LAUNCH_DATE_FIELDS))
  );
}

function compareLaunchOrder(a: Record<string, unknown>, b: Record<string, unknown>, aIndex: number, bIndex: number) {
  const launchOrder = compareNullableNumber(numberFieldAny(a, LAUNCH_ORDER_FIELDS), numberFieldAny(b, LAUNCH_ORDER_FIELDS));
  if (launchOrder !== 0) return launchOrder;

  const projectCodeOrder = compareNullableNumber(
    projectCodeSortValue(normalizeCode(fieldAny(a, PROJECT_CODE_FIELDS))),
    projectCodeSortValue(normalizeCode(fieldAny(b, PROJECT_CODE_FIELDS))),
  );
  if (projectCodeOrder !== 0) return projectCodeOrder;

  return aIndex - bIndex;
}

function compareNullableNumber(a: number | null, b: number | null) {
  if (a !== null && b !== null && a !== b) return a - b;
  if (a !== null && b === null) return -1;
  if (a === null && b !== null) return 1;
  return 0;
}

function projectCodeSortValue(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const number = Number(digits);
  return Number.isFinite(number) ? number : null;
}

function exactDateFromValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
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

  const shortDateMatch = text.match(/^(\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (shortDateMatch) {
    return `${2000 + Number(shortDateMatch[1])}-${String(Number(shortDateMatch[2])).padStart(2, "0")}-${String(Number(shortDateMatch[3])).padStart(2, "0")}`;
  }

  const chineseMatch = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (chineseMatch) {
    return `${chineseMatch[1]}-${String(Number(chineseMatch[2])).padStart(2, "0")}-${String(Number(chineseMatch[3])).padStart(2, "0")}`;
  }

  const shortChineseMatch = text.match(/^(\d{2})年(\d{1,2})月(\d{1,2})日?$/);
  if (shortChineseMatch) {
    return `${2000 + Number(shortChineseMatch[1])}-${String(Number(shortChineseMatch[2])).padStart(2, "0")}-${String(Number(shortChineseMatch[3])).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) || !/\d{1,2}[-/]\d{1,2}/.test(text) ? "" : formatDate(parsed);
}

function isBlankValue(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeHeaderKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeCode(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();
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

function monthFromValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const text = String(value).trim();
  const dateMatch = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  if (dateMatch) {
    return `${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, "0")}`;
  }

  const shortDateMatch = text.match(/^(\d{2})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  if (shortDateMatch) {
    return `${2000 + Number(shortDateMatch[1])}-${String(Number(shortDateMatch[2])).padStart(2, "0")}`;
  }

  const chineseMatch = text.match(/^(\d{4})年(\d{1,2})月/);
  if (chineseMatch) {
    return `${chineseMatch[1]}-${String(Number(chineseMatch[2])).padStart(2, "0")}`;
  }

  const shortChineseMatch = text.match(/^(\d{2})年(\d{1,2})月/);
  if (shortChineseMatch) {
    return `${2000 + Number(shortChineseMatch[1])}-${String(Number(shortChineseMatch[2])).padStart(2, "0")}`;
  }

  return "";
}

function monthFromDateString(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function dateFromValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30, 12);
    return formatDate(new Date(excelEpoch + Math.round(value) * 24 * 60 * 60 * 1000));
  }

  const text = String(value).trim();
  const dateMatch = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (dateMatch) {
    return `${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, "0")}-${String(Number(dateMatch[3] ?? 1)).padStart(2, "0")}`;
  }

  const shortDateMatch = text.match(/^(\d{2})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (shortDateMatch) {
    return `${2000 + Number(shortDateMatch[1])}-${String(Number(shortDateMatch[2])).padStart(2, "0")}-${String(Number(shortDateMatch[3] ?? 1)).padStart(2, "0")}`;
  }

  const chineseMatch = text.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日?)?/);
  if (chineseMatch) {
    return `${chineseMatch[1]}-${String(Number(chineseMatch[2])).padStart(2, "0")}-${String(Number(chineseMatch[3] ?? 1)).padStart(2, "0")}`;
  }

  const shortChineseMatch = text.match(/^(\d{2})年(\d{1,2})月(?:(\d{1,2})日?)?/);
  if (shortChineseMatch) {
    return `${2000 + Number(shortChineseMatch[1])}-${String(Number(shortChineseMatch[2])).padStart(2, "0")}-${String(Number(shortChineseMatch[3] ?? 1)).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : formatDate(parsed);
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function businessCodeYear(code: string) {
  const digits = code.replace(/\D/g, "");
  if (digits.length < 2) return null;
  const year = Number(digits.slice(0, 2));

  return Number.isFinite(year) ? 2000 + year : null;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}
