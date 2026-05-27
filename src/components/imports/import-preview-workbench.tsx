"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Info, RefreshCw, Search, Upload } from "lucide-react";
import clsx from "clsx";
import { AccountPanel } from "@/components/auth/account-panel";
import type { AuthUser } from "@/lib/auth/permissions";

type PreviewIssue = {
  severity: "error" | "warning" | "info";
  message: string;
};

type ImportType = "project-main" | "modeling";

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
  status: string;
  annualPlan: string;
  urgency: string;
  notes: string;
  matchStatus: "matched" | "new" | "conflict" | "invalid" | "unverified";
  matchBy: string;
  matchedProjectName?: string;
  issues: PreviewIssue[];
};

type ProjectImportPreview = {
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

type ModelingStylePreviewRow = {
  rowNumber: number;
  styleId: string;
  projectName: string;
  styleName: string;
  styleSequence: string;
  status: string;
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
  issues: PreviewIssue[];
};

type ModelingFeedbackPreviewRow = {
  rowNumber: number;
  projectName: string;
  styleName: string;
  feedbackDate: string;
  feedbackSource: string;
  feedbackType: string;
  feedbackContent: string;
  processStatus: string;
  matchStatus: "matched" | "conflict" | "invalid";
  matchBy: string;
  issues: PreviewIssue[];
};

type ModelingImportPreview = {
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
  rows: ModelingStylePreviewRow[];
  feedbackRows: ModelingFeedbackPreviewRow[];
};

type ImportPreview = ProjectImportPreview | ModelingImportPreview;
type ProjectMonthBucket = ProjectImportPreview["monthBuckets"][number];

type PreviewResponse = {
  ok: boolean;
  message: string;
  preview?: ImportPreview;
};

type ApplyResponse = {
  ok: boolean;
  message: string;
  result?: {
    importId: string;
    createdProjects?: number;
    updatedProjects?: number;
    createdTasks?: number;
    updatedTasks?: number;
    feedbackRows?: number;
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

const bucketClass: Record<ProjectMonthBucket["level"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

export function ImportPreviewWorkbench({
  currentUser,
  initialImportType = "project-main",
}: {
  currentUser: AuthUser;
  initialImportType?: ImportType;
}) {
  const router = useRouter();
  const [importType, setImportType] = useState<ImportType>(initialImportType);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"info" | "warning" | "error">("info");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResponse["result"] | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [search, setSearch] = useState("");
  const [rowFilter, setRowFilter] = useState<"all" | ProjectPreviewRow["matchStatus"]>("all");

  const canApply =
    !!preview &&
    preview.summary.errorCount === 0 &&
    preview.summary.invalidRows === 0 &&
    preview.summary.conflictRows === 0 &&
    (!("unverifiedRows" in preview.summary) || preview.summary.unverifiedRows === 0);
  const projectPreview = preview?.importType === "project-main" ? preview : null;
  const modelingPreview = preview?.importType === "modeling" ? preview : null;

  const filteredRows = useMemo(() => {
    const keyword = search.trim();

    if (preview?.importType !== "project-main") {
      return [];
    }

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

  const filteredModelingRows = useMemo(() => {
    const keyword = search.trim();

    if (preview?.importType !== "modeling") {
      return [];
    }

    return preview.rows.filter((row) => {
      const matchFilter = rowFilter === "all" || row.matchStatus === rowFilter;
      const matchSearch =
        !keyword ||
        row.projectName.includes(keyword) ||
        row.styleName.includes(keyword) ||
        row.modelerName.includes(keyword) ||
        row.vendorName.includes(keyword);

      return matchFilter && matchSearch;
    });
  }, [preview, rowFilter, search]);

  async function generatePreview() {
    if (!file) {
      setTone("warning");
      setMessage("请先选择一份 Excel 文件。");
      return;
    }

    setIsLoading(true);
    setTone("info");
    setMessage("正在生成预览。");
    setAnalyzeResult(null);

    const formData = new FormData();
    formData.set("importType", importType);
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
    setMessage(importType === "modeling" ? "正在写入建模款式。" : "正在写入项目主数据。");
    setApplyResult(null);
    setAnalyzeResult(null);

    const formData = new FormData();
    formData.set("importType", importType);
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
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-4 py-5 max-xl:border-b max-xl:border-r-0">
          <div className="border-b border-slate-200 pb-5">
            <div className="text-lg font-semibold">项目经营管理中台</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">
              P0 工程版 · {currentUser.name}
            </div>
          </div>
          <nav className="mt-5 grid gap-2">
            <SideButton label="项目排期" badge="P0" onClick={() => router.push("/")} />
            <SideButton label="产品组工作指引" badge="P0" onClick={() => router.push("/product-guide")} />
            <SideButton label="建模排期" badge="P0" onClick={() => router.push("/modeling")} />
            <SideButton label="用户数据" badge="基础" onClick={() => router.push("/users")} />
            <button className="flex h-10 items-center justify-between rounded-lg bg-rose-50 px-3 text-sm font-semibold text-rose-700">
              数据导入
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs">预览</span>
            </button>
          </nav>
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="min-w-0 px-6 py-5 max-md:px-4">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-500">
                <Database size={15} />
                只读预览 · 不写入数据库
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">数据导入预览</h1>
              <div className="mt-2 text-sm text-slate-500">当前支持：项目主数据 Excel、建模款式 Excel</div>
            </div>
          </header>

          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_180px]">
              <div className="min-w-0">
                <label className="text-sm font-semibold text-slate-700" htmlFor="import-type">
                  导入类型
                </label>
                <select
                  id="import-type"
                  value={importType}
                  onChange={(event) => {
                    setImportType(event.target.value as ImportType);
                    setPreview(null);
                    setApplyResult(null);
                    setAnalyzeResult(null);
                    setMessage(null);
                  }}
                  className="mt-2 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-300"
                >
                  <option value="project-main">项目主数据导入</option>
                  <option value="modeling">建模款式导入</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="text-sm font-semibold text-slate-700" htmlFor="project-main-excel">
                  Excel 文件
                </label>
                <input
                  id="project-main-excel"
                  type="file"
                  accept=".xlsx"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setPreview(null);
                    setApplyResult(null);
                    setAnalyzeResult(null);
                    setMessage(null);
                  }}
                  className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{file ? file.name : "未选择文件"}</span>
                  {preview ? <span>已解析工作表：{preview.sheets.join("、")}</span> : null}
                </div>
              </div>
              <div className="grid gap-2 self-end">
                <button
                  type="button"
                  onClick={generatePreview}
                  disabled={isLoading || isApplying || isAnalyzing}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Upload size={16} />
                  {isLoading ? "生成中" : "生成预览"}
                </button>
                <button
                  type="button"
                  onClick={applyImport}
                  disabled={!canApply || isApplying || isLoading || isAnalyzing}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Database size={16} />
                  {isApplying ? "导入中" : "确认导入"}
                </button>
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
            {preview?.globalIssues.length ? (
              <div className="mt-3 grid gap-2">
                {preview.globalIssues.map((issue, index) => (
                  <div key={`${issue.severity}-${index}`} className={clsx("rounded-lg px-3 py-2 text-sm", issueToneClass[issue.severity])}>
                    {issue.message}
                  </div>
                ))}
              </div>
            ) : null}
            {preview && !canApply ? (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                当前预览存在未校验、冲突或错误，暂不能确认导入。
              </div>
            ) : null}
            {applyResult ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span>
                  {preview?.importType === "modeling"
                    ? `已写入数据库：新增 ${applyResult.createdTasks ?? 0} 款，更新 ${applyResult.updatedTasks ?? 0} 款，反馈 ${applyResult.feedbackRows ?? 0} 条。`
                    : `已写入数据库：新增 ${applyResult.createdProjects ?? 0} 个项目，更新 ${applyResult.updatedProjects ?? 0} 个项目。`}
                  {applyResult.requiresRecalculation
                    ? analyzeResult
                      ? ` 已完成排期重算：${analyzeResult.projectCount ?? "-"} 个项目，${analyzeResult.futureTaskCount ?? "-"} 条未来任务。`
                      : " 下一步需要重新测算排期。"
                    : ""}
                </span>
                <div className="flex flex-wrap gap-2">
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
                  {analyzeResult ? (
                    <button
                      type="button"
                      onClick={() => router.push("/")}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                    >
                      查看项目排期
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          {preview ? (
            <>
              <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <SummaryTile label="总行数" value={preview.summary.totalRows} />
                <SummaryTile label="已匹配" value={preview.summary.matchedRows} tone="green" />
                <SummaryTile label="待新增" value={preview.summary.newRows} tone="blue" />
                <SummaryTile
                  label="需确认"
                  value={
                    preview.summary.conflictRows +
                    preview.summary.invalidRows +
                    ("unverifiedRows" in preview.summary ? preview.summary.unverifiedRows : 0)
                  }
                  tone="amber"
                />
                <SummaryTile label="错误 / 警告" value={`${preview.summary.errorCount} / ${preview.summary.warningCount}`} tone="red" />
                <SummaryTile label="重算排期" value={preview.summary.requiresRecalculation ? "需要" : "不需要"} tone="slate" />
              </section>

              {projectPreview ? (
                <>
              <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <FileSpreadsheet size={16} />
                    基础资料变化
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <ReferenceBlock label="新版权方" values={projectPreview.referenceChanges.newLicensors} />
                    <ReferenceBlock label="新 IP" values={projectPreview.referenceChanges.newIpAssets} />
                    <ReferenceBlock label="新产品类型" values={projectPreview.referenceChanges.newProductTypes} />
                    <ReferenceBlock label="新项目组" values={projectPreview.referenceChanges.newTeams} />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <CheckCircle2 size={16} />
                    月度上线数量
                  </div>
                  <div className="mt-3 grid max-h-56 gap-2 overflow-auto pr-1">
                    {projectPreview.monthBuckets.length > 0 ? (
                      projectPreview.monthBuckets.map((bucket) => (
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
              </section>

              <section className="mt-5 rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">项目行预览</div>
                    <div className="mt-1 text-xs text-slate-500">
                      项目 {projectPreview.parsed.projectRows} 行 · 进度记录 {projectPreview.parsed.actualRows} 行 · 任务规则 {projectPreview.parsed.taskRules} 条
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
                      onChange={(event) => setRowFilter(event.target.value as typeof rowFilter)}
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
                <div className="overflow-auto">
                  <table className="min-w-[1400px] w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                      <tr>
                        <th className="px-4 py-3">行</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3">项目ID</th>
                        <th className="px-4 py-3">项目名称</th>
                        <th className="px-4 py-3">编号</th>
                        <th className="px-4 py-3">版权方 / IP</th>
                        <th className="px-4 py-3">产品类型</th>
                        <th className="px-4 py-3">上线月份</th>
                        <th className="px-4 py-3">年度 / 紧急</th>
                        <th className="px-4 py-3">项目组</th>
                        <th className="px-4 py-3">负责人</th>
                        <th className="px-4 py-3">提示</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.projectName}`} className="align-top hover:bg-slate-50/70">
                          <td className="px-4 py-3 text-slate-500">{row.rowNumber}</td>
                          <td className="px-4 py-3">
                            <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", matchStatusClass[row.matchStatus])}>
                              {matchStatusLabel[row.matchStatus]}
                            </span>
                            <div className="mt-1 text-xs text-slate-400">{row.matchBy}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{row.projectId || "-"}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div>{row.projectName || "未填写"}</div>
                            {row.matchedProjectName ? <div className="mt-1 text-xs text-slate-400">匹配到：{row.matchedProjectName}</div> : null}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.projectCode || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{row.licensorName || "-"}</div>
                            <div className="mt-1 text-xs text-slate-400">{row.ipName || "-"}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.productType || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.plannedLaunchMonth || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{row.annualPlan || "-"}</div>
                            <div className="mt-1 text-xs text-slate-400">{row.urgency || "-"}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.projectTeam || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{row.productOwner || "-"}</div>
                            <div className="mt-1 text-xs text-slate-400">{row.productArtist || "-"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex max-w-72 flex-wrap gap-1.5">
                              {row.issues.length > 0 ? (
                                row.issues.slice(0, 4).map((issue, index) => (
                                  <span key={`${issue.severity}-${index}`} className={clsx("rounded-md px-2 py-1 text-xs", issueToneClass[issue.severity])}>
                                    {issue.message}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400">无</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
                </>
              ) : (
                modelingPreview ? (
                <ModelingImportPreviewSection
                  preview={modelingPreview}
                  filteredRows={filteredModelingRows}
                  search={search}
                  rowFilter={rowFilter}
                  onSearchChange={setSearch}
                  onRowFilterChange={setRowFilter}
                />
                ) : null
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function ModelingImportPreviewSection({
  preview,
  filteredRows,
  search,
  rowFilter,
  onSearchChange,
  onRowFilterChange,
}: {
  preview: ModelingImportPreview;
  filteredRows: ModelingStylePreviewRow[];
  search: string;
  rowFilter: "all" | ProjectPreviewRow["matchStatus"];
  onSearchChange: (value: string) => void;
  onRowFilterChange: (value: "all" | ProjectPreviewRow["matchStatus"]) => void;
}) {
  return (
    <>
      <section className="mt-5 grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">款式明细</div>
          <div className="mt-2 text-3xl font-semibold">{preview.summary.styleRows}</div>
          <div className="mt-1 text-sm text-slate-500">工作表：建模款式</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">反馈记录</div>
          <div className="mt-2 text-3xl font-semibold">{preview.summary.feedbackRows}</div>
          <div className="mt-1 text-sm text-slate-500">工作表：建模反馈</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">导入方式</div>
          <div className="mt-2 text-lg font-semibold">合并更新</div>
          <div className="mt-1 text-sm text-slate-500">款式ID优先，其次项目名称 + 款式名称 + 序号</div>
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">建模款式预览</div>
            <div className="mt-1 text-xs text-slate-500">
              款式 {preview.parsed.styleRows} 行 · 反馈 {preview.parsed.feedbackRows} 行
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="搜索项目 / 款式 / 建模师"
                className="h-9 w-60 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
              />
            </div>
            <select
              value={rowFilter}
              onChange={(event) => onRowFilterChange(event.target.value as "all" | ProjectPreviewRow["matchStatus"])}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
            >
              <option value="all">全部</option>
              <option value="matched">已匹配</option>
              <option value="new">待新增</option>
              <option value="conflict">需确认</option>
              <option value="invalid">不可导入</option>
            </select>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[1320px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">行</th>
                <th className="px-4 py-3">匹配</th>
                <th className="px-4 py-3">项目 / 款式</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">建模师</th>
                <th className="px-4 py-3">外包供应商</th>
                <th className="px-4 py-3">预计天数</th>
                <th className="px-4 py-3">开始 / 内部通过 / 版权过审</th>
                <th className="px-4 py-3">提示</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={`${row.rowNumber}-${row.styleId}`} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-3 text-slate-500">{row.rowNumber}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", matchStatusClass[row.matchStatus])}>
                      {matchStatusLabel[row.matchStatus]}
                    </span>
                    <div className="mt-1 text-xs text-slate-400">{row.matchBy}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.projectName || "未填写项目"}</div>
                    <div className="mt-1 text-slate-600">{row.styleName || "未填写款式"}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.styleId || row.styleSequence || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.status || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.modelerName || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.vendorName || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.estimatedWorkdays ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.plannedStartDate || "-"}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.internalApprovedDate || "-"} / {row.copyrightApprovedDate || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <IssueList issues={row.issues} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview.feedbackRows.length > 0 ? (
        <section className="mt-5 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">建模反馈预览</div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">行</th>
                  <th className="px-4 py-3">匹配</th>
                  <th className="px-4 py-3">项目 / 款式</th>
                  <th className="px-4 py-3">反馈日期</th>
                  <th className="px-4 py-3">来源 / 类型</th>
                  <th className="px-4 py-3">反馈内容</th>
                  <th className="px-4 py-3">处理状态</th>
                  <th className="px-4 py-3">提示</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.feedbackRows.slice(0, 80).map((row) => (
                  <tr key={`${row.rowNumber}-${row.projectName}-${row.styleName}`} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-500">{row.rowNumber}</td>
                    <td className="px-4 py-3">
                      <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", matchStatusClass[row.matchStatus])}>
                        {matchStatusLabel[row.matchStatus]}
                      </span>
                      <div className="mt-1 text-xs text-slate-400">{row.matchBy}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{row.projectName}</div>
                      <div className="mt-1 text-xs text-slate-500">{row.styleName}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.feedbackDate || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{row.feedbackSource || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">{row.feedbackType || "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.feedbackContent || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.processStatus || "-"}</td>
                    <td className="px-4 py-3">
                      <IssueList issues={row.issues} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
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

function SideButton({ label, badge, onClick }: { label: string; badge: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
    >
      {label}
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{badge}</span>
    </button>
  );
}

function SummaryTile({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "green" | "blue" | "amber" | "red" }) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
  }[tone];

  return (
    <div className={clsx("rounded-lg border p-4", toneClass)}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ReferenceBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 flex min-h-8 flex-wrap gap-1.5">
        {values.length > 0 ? (
          values.slice(0, 12).map((value) => (
            <span key={value} className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">
              {value}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-400">无</span>
        )}
        {values.length > 12 ? <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-500">+{values.length - 12}</span> : null}
      </div>
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
