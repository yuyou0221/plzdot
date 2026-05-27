import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";

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
  projectName: string;
  projectCode: string;
  licensorName: string;
  ipName: string;
  productType: string;
  styleCount: number | null;
  projectLevel: string;
  routeType: string;
  needThreeView: boolean | null;
  plannedLaunchDate: string;
  plannedLaunchMonth: string;
  projectStartDate: string;
  projectTeam: string;
  productOwner: string;
  productArtist: string;
  status: string;
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

export async function previewProjectMainImport(workbookPath: string, fileName: string): Promise<ProjectMainImportPreview> {
  const workbook = await extractWorkbook(workbookPath);
  const projectRecords = workbook.projects.filter(isProjectRecordCandidate);
  const existingProjectResult = await loadExistingProjects();
  const existingProjects = existingProjectResult.projects;
  const existingRefs = buildExistingRefs(existingProjects);
  const duplicateIndexes = duplicateIdentityIndexes(projectRecords);
  const rows = projectRecords.map((record, index) =>
    previewProjectRow(record, index, existingProjects, existingRefs, duplicateIndexes, existingProjectResult.canMatchExisting),
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

async function extractWorkbook(workbookPath: string) {
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
): ProjectPreviewRow {
  const projectName = stringField(record, "项目名称") || stringField(record, "项目管理系统（统一）");
  const projectCode = normalizeCode(field(record, "项目编号"));
  const licensorName = stringField(record, "授权方");
  const ipName = stringField(record, "IP");
  const productType = stringField(record, "产品类型");
  const plannedLaunchDate = dateFromValue(field(record, "预估出货日期"));
  const plannedLaunchMonth = monthFromDateString(plannedLaunchDate) || monthFromValue(field(record, "预估出货日期"));
  const projectStartDate = dateFromValue(field(record, "启动日期"));
  const projectTeam = stringField(record, "所属团队");
  const productOwner = stringField(record, "项目管理");
  const productArtist = stringField(record, "产品美术");
  const status = stringField(record, "当前阶段");
  const styleCount = numberField(record, "规格");
  const projectLevel = stringField(record, "项目等级");
  const routeType = stringField(record, "红蜡路线or手板路线");
  const needThreeView = booleanField(record, "是否需要三视图");
  const issues: PreviewIssue[] = [];

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
    issues.push({ severity: "warning", message: "没有识别到计划上线月份 / 预估出货日期。" });
  }

  const match = canMatchExisting
    ? matchProject({ projectCode, projectName, licensorName, ipName }, existingProjects)
    : { status: "unverified" as const, matchBy: "数据库不可用，暂不能匹配现有项目", project: undefined };

  if (match.status === "new" && !plannedLaunchDate) {
    issues.push({ severity: "error", message: "新增项目缺少计划上线日期，无法创建。" });
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
    projectName,
    projectCode,
    licensorName,
    ipName,
    productType,
    styleCount,
    projectLevel,
    routeType,
    needThreeView,
    plannedLaunchDate,
    plannedLaunchMonth,
    projectStartDate,
    projectTeam,
    productOwner,
    productArtist,
    status,
    matchStatus: hasError ? "invalid" : match.status,
    matchBy: hasError ? "必填字段缺失" : match.matchBy,
    matchedProjectId: match.project?.id,
    matchedProjectName: match.project?.projectName,
    issues,
  };
}

function matchProject(
  candidate: { projectCode: string; projectName: string; licensorName: string; ipName: string },
  existingProjects: ExistingProject[],
): { status: "matched" | "new" | "conflict"; matchBy: string; project?: ExistingProject } {
  if (candidate.projectCode) {
    const matches = existingProjects.filter((project) => normalizeCode(project.projectCode) === candidate.projectCode);
    if (matches.length === 1) return { status: "matched", matchBy: "业务项目编号", project: matches[0] };
    if (matches.length > 1) return { status: "conflict", matchBy: "业务项目编号匹配到多个项目" };
  }

  const identityMatches = existingProjects.filter(
    (project) =>
      normalizeKey(project.projectName) === normalizeKey(candidate.projectName) &&
      normalizeKey(project.ipName) === normalizeKey(candidate.ipName) &&
      normalizeKey(project.licensorName) === normalizeKey(candidate.licensorName),
  );
  if (identityMatches.length === 1) return { status: "matched", matchBy: "项目名称 + IP + 版权方", project: identityMatches[0] };
  if (identityMatches.length > 1) return { status: "conflict", matchBy: "项目名称 + IP + 版权方匹配到多个项目" };

  const nameIpMatches = existingProjects.filter(
    (project) => normalizeKey(project.projectName) === normalizeKey(candidate.projectName) && normalizeKey(project.ipName) === normalizeKey(candidate.ipName),
  );
  if (nameIpMatches.length === 1) return { status: "matched", matchBy: "项目名称 + IP", project: nameIpMatches[0] };
  if (nameIpMatches.length > 1) return { status: "conflict", matchBy: "项目名称 + IP 匹配到多个项目" };

  const nameMatches = existingProjects.filter((project) => normalizeKey(project.projectName) === normalizeKey(candidate.projectName));
  if (nameMatches.length === 1) return { status: "matched", matchBy: "项目名称", project: nameMatches[0] };
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
    const projectName = stringField(record, "项目名称") || stringField(record, "项目管理系统（统一）");
    const key = [projectName, stringField(record, "授权方"), stringField(record, "IP")].map(normalizeKey).join("|");
    if (!key.replace(/\|/g, "")) return;
    indexes.set(key, [...(indexes.get(key) ?? []), index]);
  });

  return new Set(Array.from(indexes.values()).filter((items) => items.length > 1).flat());
}

function isProjectRecordCandidate(record: Record<string, unknown>) {
  const meaningfulKeys = [
    "项目名称",
    "项目管理系统（统一）",
    "项目编号",
    "授权方",
    "IP",
    "产品类型",
    "预估出货日期",
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

function stringField(record: Record<string, unknown>, key: string) {
  const value = field(record, key);

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = field(record, key);
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).trim());

  return Number.isFinite(number) ? number : null;
}

function booleanField(record: Record<string, unknown>, key: string) {
  const value = field(record, key);
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;

  const text = String(value).trim().toLowerCase();
  if (["是", "yes", "y", "true", "1", "需要"].includes(text)) return true;
  if (["否", "no", "n", "false", "0", "不需要"].includes(text)) return false;

  return null;
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

  const chineseMatch = text.match(/^(\d{4})年(\d{1,2})月/);
  if (chineseMatch) {
    return `${chineseMatch[1]}-${String(Number(chineseMatch[2])).padStart(2, "0")}`;
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

  const chineseMatch = text.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日?)?/);
  if (chineseMatch) {
    return `${chineseMatch[1]}-${String(Number(chineseMatch[2])).padStart(2, "0")}-${String(Number(chineseMatch[3] ?? 1)).padStart(2, "0")}`;
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
