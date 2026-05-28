"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Info, RefreshCw, Search, Upload } from "lucide-react";
import clsx from "clsx";
import type { AuthUser } from "@/lib/auth/permissions";

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
  plannedLaunchMonth: string;
  projectTeam: string;
  productOwner: string;
  productArtist: string;
  modelingOwner: string;
  annualPlan: string;
  urgency: string;
  matchStatus: "matched" | "new" | "conflict" | "invalid" | "unverified";
  matchBy: string;
  matchedProjectName?: string;
  issues: PreviewIssue[];
};

type ProjectImportPreview = {
  importType: "project-main";
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

type PreviewResponse = {
  ok: boolean;
  message: string;
  preview?: ProjectImportPreview;
};

type ApplyResponse = {
  ok: boolean;
  message: string;
  result?: {
    importId: string;
    createdProjects?: number;
    updatedProjects?: number;
    rowCount: number;
    requiresRecalculation: boolean;
  };
};

type AnalyzeResponse = {
  ok: boolean;
  message: string;
  scheduleRunId?: string;
  projectCount?: number;
  futureTaskCount?: number;
};

type RowFilter = "all" | ProjectPreviewRow["matchStatus"];

const matchStatusLabel: Record<ProjectPreviewRow["matchStatus"], string> = {
  matched: "已匹配",
  new: "待新增",
  conflict: "需确认",
  invalid: "不可导入",
  unverified: "未校验",
};

const matchStatusClass: Record<ProjectPreviewRow["matchStatus"], string> = {
  matched: "border-emerald-200 bg-emerald-50 text-emerald-800",
  new: "border-blue-200 bg-blue-50 text-blue-800",
  conflict: "border-amber-200 bg-amber-50 text-amber-800",
  invalid: "border-red-200 bg-red-50 text-red-800",
  unverified: "border-slate-200 bg-slate-50 text-slate-700",
};

const issueToneClass: Record<PreviewIssue["severity"], string> = {
  error: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800",
  info: "bg-slate-100 text-slate-600",
};

const bucketClass: Record<ProjectImportPreview["monthBuckets"][number]["level"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

export function ScheduleProjectImportPanel({ currentUser }: { currentUser: AuthUser }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProjectImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"info" | "warning" | "error">("info");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResponse["result"] | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [search, setSearch] = useState("");
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");

  const canImport = currentUser.authRole === "admin" || currentUser.authRole === "manager";
  const canApply =
    canImport &&
    !!preview &&
    preview.summary.errorCount === 0 &&
    preview.summary.invalidRows === 0 &&
    preview.summary.conflictRows === 0 &&
    preview.summary.unverifiedRows === 0;

  const filteredRows = useMemo(() => {
    const keyword = search.trim();

    return (preview?.rows ?? []).filter((row) => {
      const matchFilter = rowFilter === "all" || row.matchStatus === rowFilter;
      const matchSearch =
        !keyword ||
        row.projectId.includes(keyword) ||
        row.projectName.includes(keyword) ||
        row.projectCode.includes(keyword) ||
        row.licensorName.includes(keyword) ||
        row.ipName.includes(keyword);

      return matchFilter && matchSearch;
    });
  }, [preview, rowFilter, search]);

  function resetImportState(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setApplyResult(null);
    setAnalyzeResult(null);
    setMessage(null);
    setSearch("");
    setRowFilter("all");
  }

  async function generatePreview() {
    if (!canImport) {
      setTone("warning");
      setMessage("当前账号没有导入权限，请使用 admin 或 manager 账号。");
      return;
    }
    if (!file) {
      setTone("warning");
      setMessage("请先选择一份 Excel 文件。");
      return;
    }

    setIsLoading(true);
    setTone("info");
    setMessage("正在生成预览，本次不会写入数据库。");
    setApplyResult(null);
    setAnalyzeResult(null);

    const formData = new FormData();
    formData.set("importType", "project-main");
    formData.set("file", file);

    try {
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as PreviewResponse;

      if (!response.ok || !result.ok || !result.preview) {
        setTone("error");
        setMessage(result.message || "生成预览失败。");
        return;
      }

      setPreview(result.preview);
      setTone(result.preview.summary.errorCount > 0 || result.preview.summary.warningCount > 0 ? "warning" : "info");
      setMessage(result.message);
    } catch {
      setTone("error");
      setMessage("生成预览失败，请确认文件格式。");
    } finally {
      setIsLoading(false);
    }
  }

  async function applyImport() {
    if (!file) {
      setTone("warning");
      setMessage("请先选择一份 Excel 文件。");
      return;
    }
    if (!preview) {
      setTone("warning");
      setMessage("请先生成预览。");
      return;
    }
    if (!canApply) {
      setTone("warning");
      setMessage("当前预览存在未校验、冲突或错误，暂不能确认导入。");
      return;
    }

    setIsApplying(true);
    setTone("info");
    setMessage("正在写入项目主数据。");
    setApplyResult(null);
    setAnalyzeResult(null);

    const formData = new FormData();
    formData.set("importType", "project-main");
    formData.set("file", file);

    try {
      const response = await fetch("/api/imports/apply", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as ApplyResponse;

      if (!response.ok || !result.ok || !result.result) {
        setTone("error");
        setMessage(result.message || "项目主数据导入失败。");
        return;
      }

      setApplyResult(result.result);
      setTone("info");
      setMessage(result.message);
    } catch {
      setTone("error");
      setMessage("项目主数据导入失败，请稍后再试。");
    } finally {
      setIsApplying(false);
    }
  }

  async function runScheduleAnalysis() {
    if (!applyResult?.requiresRecalculation) {
      setTone("warning");
      setMessage("当前没有需要重算的导入结果。");
      return;
    }

    setIsAnalyzing(true);
    setTone("info");
    setMessage("正在重新测算排期。");
    setAnalyzeResult(null);

    try {
      const response = await fetch("/api/schedule/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: `project-main-import:${applyResult.importId}`,
          today: shanghaiToday(),
        }),
      });
      const result = (await response.json()) as AnalyzeResponse;

      if (!response.ok || !result.ok) {
        setTone("error");
        setMessage(result.message || "排期重算失败。");
        return;
      }

      setAnalyzeResult(result);
      setTone("info");
      setMessage(result.message || "排期重算完成。");
      router.refresh();
    } catch {
      setTone("error");
      setMessage("排期重算失败，请稍后再试。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-4 text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Upload size={16} />
            项目主数据导入
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            在项目排期页直接上传 Excel，先生成预览校验，确认后写入项目主数据并生成导入批次。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generatePreview}
            disabled={!canImport || isLoading || isApplying || isAnalyzing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Upload size={14} />
            {isLoading ? "生成中" : "生成预览"}
          </button>
          <button
            type="button"
            onClick={applyImport}
            disabled={!canApply || isApplying || isLoading || isAnalyzing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Database size={14} />
            {isApplying ? "导入中" : "确认导入"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <label className="text-xs font-semibold text-slate-600" htmlFor="schedule-project-main-excel">
            Excel 文件
          </label>
          <input
            id="schedule-project-main-excel"
            type="file"
            accept=".xlsx"
            disabled={!canImport}
            onChange={(event) => resetImportState(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{file ? file.name : "未选择文件"}</span>
            {preview ? <span>已解析工作表：{preview.sheets.join("、")}</span> : null}
          </div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
          {canImport
            ? "支持项目主数据模板；预测完成时间、风险等级、延期判断等计算字段不会从 Excel 写入。"
            : "当前账号没有导入权限，请使用 admin 或 manager 账号。"}
        </div>
      </div>

      {message ? (
        <div
          className={clsx(
            "mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            tone === "error" && "border-red-200 bg-red-50 text-red-700",
            tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
            tone === "info" && "border-blue-200 bg-blue-50 text-blue-800",
          )}
        >
          {tone === "info" ? <Info size={16} /> : <AlertTriangle size={16} />}
          <span>{message}</span>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <SummaryTile label="总行数" value={preview.summary.totalRows} />
            <SummaryTile label="已匹配" value={preview.summary.matchedRows} tone="green" />
            <SummaryTile label="待新增" value={preview.summary.newRows} tone="blue" />
            <SummaryTile
              label="需确认"
              value={preview.summary.conflictRows + preview.summary.invalidRows + preview.summary.unverifiedRows}
              tone="amber"
            />
            <SummaryTile label="错误/警告" value={`${preview.summary.errorCount}/${preview.summary.warningCount}`} tone="red" />
            <SummaryTile label="重算排期" value={preview.summary.requiresRecalculation ? "需要" : "不需要"} />
          </div>

          {preview.globalIssues.length > 0 ? (
            <div className="grid gap-2">
              {preview.globalIssues.map((issue, index) => (
                <div key={`${issue.severity}-${index}`} className={clsx("rounded-lg px-3 py-2 text-sm", issueToneClass[issue.severity])}>
                  {issue.message}
                </div>
              ))}
            </div>
          ) : null}

          {applyResult ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>
                已写入数据库：新增 {applyResult.createdProjects ?? 0} 个项目，更新 {applyResult.updatedProjects ?? 0} 个项目。
                {applyResult.requiresRecalculation
                  ? analyzeResult
                    ? ` 已完成排期重算：${analyzeResult.projectCount ?? "-"} 个项目，${analyzeResult.futureTaskCount ?? "-"} 条未来任务。`
                    : " 下一步需要重新测算排期。"
                  : ""}
              </span>
              {applyResult.requiresRecalculation ? (
                <button
                  type="button"
                  onClick={runScheduleAnalysis}
                  disabled={isAnalyzing || !!analyzeResult}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-200"
                >
                  <RefreshCw size={14} className={clsx(isAnalyzing && "animate-spin")} />
                  {isAnalyzing ? "重算中" : analyzeResult ? "已重算" : "一键重算排期"}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileSpreadsheet size={16} />
                基础资料变化
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ReferenceBlock label="新版权方" values={preview.referenceChanges.newLicensors} />
                <ReferenceBlock label="新 IP" values={preview.referenceChanges.newIpAssets} />
                <ReferenceBlock label="新产品类型" values={preview.referenceChanges.newProductTypes} />
                <ReferenceBlock label="新项目组" values={preview.referenceChanges.newTeams} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CheckCircle2 size={16} />
                月度上线数量
              </div>
              <div className="mt-3 grid max-h-52 gap-2 overflow-auto pr-1">
                {preview.monthBuckets.length > 0 ? (
                  preview.monthBuckets.map((bucket) => (
                    <div key={bucket.month} className={clsx("rounded-lg border px-3 py-2 text-sm", bucketClass[bucket.level])}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{bucket.month}</span>
                        <span>{bucket.count} 个项目</span>
                      </div>
                      <div className="mt-1 text-xs opacity-80">{bucket.message}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-400">未识别到计划上线月份。</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">项目行预览</div>
                <div className="mt-1 text-xs text-slate-500">
                  项目 {preview.parsed.projectRows} 行 / 进度记录 {preview.parsed.actualRows} 行 / 任务规则 {preview.parsed.taskRules} 条
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索项目 / IP"
                    className="h-9 w-52 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
                  />
                </div>
                <select
                  value={rowFilter}
                  onChange={(event) => setRowFilter(event.target.value as RowFilter)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                >
                  <option value="all">全部</option>
                  <option value="matched">已匹配</option>
                  <option value="new">待新增</option>
                  <option value="conflict">需确认</option>
                  <option value="invalid">不可导入</option>
                  <option value="unverified">未校验</option>
                </select>
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-[1320px] w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-3">行</th>
                    <th className="px-3 py-3">状态</th>
                    <th className="px-3 py-3">项目ID</th>
                    <th className="px-3 py-3">项目名称</th>
                    <th className="px-3 py-3">编号</th>
                    <th className="px-3 py-3">版权方 / IP</th>
                    <th className="px-3 py-3">产品类型</th>
                    <th className="px-3 py-3">上线月份</th>
                    <th className="px-3 py-3">年度 / 紧急</th>
                    <th className="px-3 py-3">项目组</th>
                    <th className="px-3 py-3">负责人</th>
                    <th className="px-3 py-3">提示</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.projectName}`} className="align-top hover:bg-slate-50/70">
                      <td className="px-3 py-3 text-slate-500">{row.rowNumber}</td>
                      <td className="px-3 py-3">
                        <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", matchStatusClass[row.matchStatus])}>
                          {matchStatusLabel[row.matchStatus]}
                        </span>
                        <div className="mt-1 text-xs text-slate-400">{row.matchBy}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">{row.projectId || "-"}</td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        <div>{row.projectName || "未填写"}</div>
                        {row.matchedProjectName ? <div className="mt-1 text-xs text-slate-400">匹配到：{row.matchedProjectName}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{row.projectCode || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <div>{row.licensorName || "-"}</div>
                        <div className="mt-1 text-xs text-slate-400">{row.ipName || "-"}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{row.productType || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">{row.plannedLaunchMonth || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <div>{row.annualPlan || "-"}</div>
                        <div className="mt-1 text-xs text-slate-400">{row.urgency || "-"}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{row.projectTeam || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <div>{row.productOwner || "-"}</div>
                        <div className="mt-1 text-xs text-slate-400">{row.productArtist || "-"}</div>
                        <div className="mt-1 text-xs text-slate-400">{row.modelingOwner || "-"}</div>
                      </td>
                      <td className="px-3 py-3">
                        <IssueList issues={row.issues} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryTile({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "green" | "blue" | "amber" | "red";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
  }[tone];

  return (
    <div className={clsx("rounded-lg border p-3", toneClass)}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ReferenceBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 flex min-h-8 flex-wrap gap-1.5">
        {values.length > 0 ? (
          values.slice(0, 10).map((value) => (
            <span key={value} className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">
              {value}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-400">无</span>
        )}
        {values.length > 10 ? <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-500">+{values.length - 10}</span> : null}
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: PreviewIssue[] }) {
  return (
    <div className="flex max-w-72 flex-wrap gap-1.5">
      {issues.length > 0 ? (
        issues.slice(0, 4).map((issue, index) => (
          <span key={`${issue.severity}-${index}`} className={clsx("rounded-md px-2 py-1 text-xs", issueToneClass[issue.severity])}>
            {issue.message}
          </span>
        ))
      ) : (
        <span className="text-xs text-slate-400">无</span>
      )}
    </div>
  );
}

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}
