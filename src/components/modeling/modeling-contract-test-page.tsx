"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Play, RefreshCw, RotateCcw, Send, ShieldCheck } from "lucide-react";

export type ModelingContractTestProject = {
  id: string;
  projectCode: string | null;
  projectName: string;
  currentStage: string | null;
  status: string;
  plannedLaunchDate: string;
  task7: ModelingContractTestProjectTask;
  task10: ModelingContractTestProjectTask;
};

type ModelingContractTestProjectTask = {
  id: string;
  taskNo: number;
  taskName: string;
  status: string;
};

type ModelingContractTestPageProps = {
  currentUserName?: string | null;
  projects: ModelingContractTestProject[];
};

type EditableStyle = {
  sourceStyleId: string;
  styleCode: string;
  styleSequence: string;
  styleName: string;
  isFirstModelingStyle: boolean;
  difficulty: string;
  estimatedWorkdays: number;
  originalArtApprovedDate: string;
  referenceImageUrl: string;
  notes: string;
};

type ProjectStyle = {
  modelingTaskId: string;
  sourceStyleId?: string | null;
  styleCode?: string | null;
  styleSequence?: string | null;
  styleName: string;
  isFirstModelingStyle: boolean;
  isRequired: boolean;
  taskNo?: number | null;
  taskName?: string | null;
  difficulty?: string | null;
  estimatedWorkdays?: number | null;
  modelingStatus: string;
  modelerName?: string | null;
  isOutsourced?: boolean;
  outsourceVendorName?: string | null;
  internalApprovedDate?: string | null;
  copyrightApprovedDate?: string | null;
  reviewRound?: number;
  latestFeedbackSummary?: string | null;
  blockedDays?: number;
  lastUpdatedAt?: string | null;
};

type ProjectProgress = {
  totalRequiredStyles: number;
  approvedStyles: number;
  inProgressStyles: number;
  submittedStyles: number;
  waitingSubmissionStyles: number;
  outsourcedStyles: number;
  unstartedStyles: number;
  unassignedStyles: number;
  progressPercent: number;
  canWritebackProjectTask: boolean;
  projectedAllApprovedDate?: string | null;
};

type ApiPayload = Record<string, unknown> | null;

const reviewActions = [
  { label: "内部通过可送审", value: "内部通过可送审", icon: ShieldCheck },
  { label: "内部不通过", value: "内部不通过", icon: RotateCcw },
  { label: "送审通过", value: "送审通过", icon: CheckCircle2 },
  { label: "送审不通过", value: "送审不通过", icon: RotateCcw },
] as const;

export function ModelingContractTestPage({ currentUserName, projects }: ModelingContractTestPageProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? "");
  const [styleDraft, setStyleDraft] = useState(() => {
    const initialSeed = buildSeed();

    return {
      seed: initialSeed,
      styles: buildDefaultStyles(initialSeed),
    };
  });
  const [projectStyles, setProjectStyles] = useState<ProjectStyle[]>([]);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [selectedModelingTaskId, setSelectedModelingTaskId] = useState("");
  const [feedbackContent, setFeedbackContent] = useState("本地接口测试反馈");
  const [lastResponse, setLastResponse] = useState<ApiPayload>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  );

  const selectedStyle = useMemo(
    () => projectStyles.find((style) => style.modelingTaskId === selectedModelingTaskId),
    [projectStyles, selectedModelingTaskId],
  );
  const { seed, styles } = styleDraft;

  function regenerateStyles() {
    const nextSeed = buildSeed();
    setStyleDraft({
      seed: nextSeed,
      styles: buildDefaultStyles(nextSeed),
    });
    setLastResponse(null);
    setErrorMessage("");
  }

  function updateStyle(index: number, patch: Partial<EditableStyle>) {
    setStyleDraft((current) => ({
      ...current,
      styles: current.styles.map((style, styleIndex) => (styleIndex === index ? { ...style, ...patch } : style)),
    }));
  }

  async function submitStyles() {
    if (!selectedProject) return;

    await runAction("提交款式清单", async () => {
      const data = await postJson("/api/modeling/style-submissions", {
        projectId: selectedProject.id,
        sourceRequestId: `local-contract-test-${seed}`,
        submittedByName: currentUserName || "本地测试页",
        firstStyleProjectTaskId: selectedProject.task7.id,
        remainingStylesProjectTaskId: selectedProject.task10.id,
        styles: styles.map((style) => ({
          sourceStyleId: style.sourceStyleId,
          styleCode: style.styleCode,
          styleSequence: style.styleSequence,
          styleName: style.styleName,
          isRequired: true,
          isFirstModelingStyle: style.isFirstModelingStyle,
          difficulty: style.difficulty,
          estimatedWorkdays: style.estimatedWorkdays,
          originalArtApprovedDate: style.originalArtApprovedDate || undefined,
          referenceImageUrls: style.referenceImageUrl
            ? [
                {
                  name: `${style.styleName}参考图`,
                  url: style.referenceImageUrl,
                },
              ]
            : [],
          notes: style.notes || undefined,
        })),
      });

      await refreshProjectState(selectedProject.id);
      const returnedStyles = Array.isArray(data.styles) ? (data.styles as unknown[]) : [];
      const firstTask = returnedStyles.find((style) => isRecord(style) && style.isFirstModelingStyle === true);
      const firstTaskId = isRecord(firstTask) && typeof firstTask.modelingTaskId === "string" ? firstTask.modelingTaskId : "";

      if (firstTaskId) {
        setSelectedModelingTaskId(firstTaskId);
      }

      return data;
    });
  }

  async function startStyles(taskNo: 7 | 10) {
    if (!selectedProject) return;

    await runAction(taskNo === 7 ? "启动任务7" : "启动任务10", async () => {
      const data = await postJson("/api/modeling/style-start-events", {
        projectId: selectedProject.id,
        projectTaskId: taskNo === 7 ? selectedProject.task7.id : selectedProject.task10.id,
        taskNo,
        startScope: taskNo === 7 ? "first-style" : "remaining-styles",
        operatorName: currentUserName || "本地测试页",
      });

      await refreshProjectState(selectedProject.id);
      return data;
    });
  }

  async function submitReviewResult(reviewResult: (typeof reviewActions)[number]["value"]) {
    if (!selectedProject || !selectedModelingTaskId) return;

    await runAction(reviewResult, async () => {
      const data = await postJson("/api/modeling/review-results", {
        projectId: selectedProject.id,
        modelingTaskId: selectedModelingTaskId,
        reviewResult,
        reviewAt: today(),
        reviewerName: currentUserName || "本地测试页",
        feedbackContent,
      });

      await refreshProjectState(selectedProject.id);
      return data;
    });
  }

  async function refreshProjectState(projectId = selectedProject?.id) {
    if (!projectId) return;

    await runAction("刷新数据", async () => {
      const [styleData, progressData] = await Promise.all([
        getJson(`/api/modeling/projects/${projectId}/styles`),
        getJson(`/api/modeling/projects/${projectId}/progress`),
      ]);

      const nextStyles = Array.isArray(styleData.styles) ? (styleData.styles as ProjectStyle[]) : [];
      setProjectStyles(nextStyles);
      setProgress(progressData as ProjectProgress);

      if (!selectedModelingTaskId && nextStyles[0]?.modelingTaskId) {
        setSelectedModelingTaskId(nextStyles[0].modelingTaskId);
      }

      return { styles: styleData, progress: progressData };
    });
  }

  async function runAction(label: string, action: () => Promise<ApiPayload>) {
    setLoadingAction(label);
    setErrorMessage("");

    try {
      const data = await action();
      setLastResponse(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      setErrorMessage(message);
      setLastResponse({ ok: false, message });
    } finally {
      setLoadingAction(null);
    }
  }

  if (projects.length === 0) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950">
        <div className="mx-auto max-w-4xl rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <h1 className="text-lg font-semibold">没有找到可测试项目</h1>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                当前数据库里没有同时包含任务 7 和任务 10 的项目，先导入或创建项目排期后再测试建模接口。
              </p>
              <Link className="mt-4 inline-flex text-sm font-medium text-slate-900 underline" href="/modeling">
                返回建模排期
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-5 text-slate-950">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <Link
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              href="/modeling"
              title="返回建模排期"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">建模排期接口本地测试</h1>
              <p className="mt-1 text-sm text-slate-500">测试款式清单、任务启动、审核结果和项目进度读取。</p>
            </div>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(loadingAction)}
            onClick={() => refreshProjectState()}
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${loadingAction === "刷新数据" ? "animate-spin" : ""}`} />
            刷新
          </button>
        </header>

        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          这是本地测试页，会写入当前数据库。建议选择测试项目或使用带“接口测试”的款式名，正式使用仍由产品组工作指引调用接口。
        </section>

        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            <Panel title="测试项目">
              <label className="block text-xs font-medium text-slate-500" htmlFor="project-select">
                项目
              </label>
              <select
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                id="project-select"
                onChange={(event) => {
                  const nextProjectId = event.target.value;
                  setSelectedProjectId(nextProjectId);
                  setProjectStyles([]);
                  setProgress(null);
                  setSelectedModelingTaskId("");
                  void refreshProjectState(nextProjectId);
                }}
                value={selectedProject?.id ?? ""}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectName}
                  </option>
                ))}
              </select>

              {selectedProject ? (
                <div className="mt-4 space-y-3 text-sm">
                  <InfoRow label="项目状态" value={selectedProject.status || "-"} />
                  <InfoRow label="当前阶段" value={selectedProject.currentStage || "-"} />
                  <InfoRow label="计划上线" value={selectedProject.plannedLaunchDate || "-"} />
                  <InfoRow label="任务 7" value={`${selectedProject.task7.taskName} · ${selectedProject.task7.status}`} />
                  <InfoRow label="任务 10" value={`${selectedProject.task10.taskName} · ${selectedProject.task10.status}`} />
                </div>
              ) : null}
            </Panel>

            <Panel
              title="测试款式"
              action={
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={regenerateStyles}
                  type="button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  换一组
                </button>
              }
            >
              <label className="block text-xs font-medium text-slate-500" htmlFor="style-seed">
                测试批次
              </label>
              <input
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                id="style-seed"
                onChange={(event) => {
                  const nextSeed = event.target.value.trim();
                  setStyleDraft({
                    seed: nextSeed,
                    styles: buildDefaultStyles(nextSeed),
                  });
                }}
                value={seed}
              />

              <div className="mt-4 space-y-4">
                {styles.map((style, index) => (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3" key={style.sourceStyleId}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">
                        {style.isFirstModelingStyle ? "第一款 · 任务 7" : "其余款 · 任务 10"}
                      </span>
                      <span className="rounded bg-white px-2 py-1 text-xs text-slate-500">{style.sourceStyleId}</span>
                    </div>
                    <div className="grid gap-3">
                      <LabeledInput
                        label="款式名称"
                        onChange={(value) => updateStyle(index, { styleName: value })}
                        value={style.styleName}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <LabeledInput
                          label="款式编号"
                          onChange={(value) => updateStyle(index, { styleCode: value })}
                          value={style.styleCode}
                        />
                        <LabeledInput
                          label="序号"
                          onChange={(value) => updateStyle(index, { styleSequence: value })}
                          value={style.styleSequence}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-medium text-slate-500">
                          难度
                          <select
                            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                            onChange={(event) => updateStyle(index, { difficulty: event.target.value })}
                            value={style.difficulty}
                          >
                            <option value="常规款">常规款</option>
                            <option value="简单款">简单款</option>
                            <option value="换色款">换色款</option>
                            <option value="困难正比例款">困难正比例款</option>
                          </select>
                        </label>
                        <LabeledInput
                          label="预计天数"
                          onChange={(value) => updateStyle(index, { estimatedWorkdays: Number(value) || 1 })}
                          type="number"
                          value={String(style.estimatedWorkdays)}
                        />
                      </div>
                      <LabeledInput
                        label="原画过审日期"
                        onChange={(value) => updateStyle(index, { originalArtApprovedDate: value })}
                        type="date"
                        value={style.originalArtApprovedDate}
                      />
                      <LabeledInput
                        label="参考图 URL"
                        onChange={(value) => updateStyle(index, { referenceImageUrl: value })}
                        value={style.referenceImageUrl}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(loadingAction)}
                onClick={submitStyles}
                type="button"
              >
                <Send className="h-4 w-4" />
                提交款式清单
              </button>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="启动与审核">
              <div className="grid gap-3 sm:grid-cols-2">
                <ActionButton loading={loadingAction === "启动任务7"} onClick={() => startStyles(7)}>
                  <Play className="h-4 w-4" />
                  启动任务 7
                </ActionButton>
                <ActionButton loading={loadingAction === "启动任务10"} onClick={() => startStyles(10)}>
                  <Play className="h-4 w-4" />
                  启动任务 10
                </ActionButton>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
                <label className="block text-xs font-medium text-slate-500">
                  审核对象
                  <select
                    className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                    onChange={(event) => setSelectedModelingTaskId(event.target.value)}
                    value={selectedModelingTaskId}
                  >
                    <option value="">请选择款式</option>
                    {projectStyles.map((style) => (
                      <option key={style.modelingTaskId} value={style.modelingTaskId}>
                        {style.styleName} · {style.modelingStatus}
                      </option>
                    ))}
                  </select>
                </label>
                <LabeledInput label="反馈内容" onChange={setFeedbackContent} value={feedbackContent} />
              </div>

              {selectedStyle ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  当前选择：{selectedStyle.styleName}，状态 {selectedStyle.modelingStatus}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {reviewActions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <ActionButton
                      disabled={!selectedModelingTaskId}
                      key={action.value}
                      loading={loadingAction === action.value}
                      onClick={() => submitReviewResult(action.value)}
                    >
                      <Icon className="h-4 w-4" />
                      {action.label}
                    </ActionButton>
                  );
                })}
              </div>
            </Panel>

            <Panel title="当前款式">
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-xs text-slate-500">
                    <tr>
                      <th className="w-[26%] px-3 py-2 font-medium">款式</th>
                      <th className="w-[16%] px-3 py-2 font-medium">来源</th>
                      <th className="w-[16%] px-3 py-2 font-medium">状态</th>
                      <th className="w-[14%] px-3 py-2 font-medium">任务</th>
                      <th className="w-[14%] px-3 py-2 font-medium">内部通过</th>
                      <th className="w-[14%] px-3 py-2 font-medium">版权通过</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {projectStyles.length > 0 ? (
                      projectStyles.map((style) => (
                        <tr
                          className={`cursor-pointer hover:bg-slate-50 ${
                            style.modelingTaskId === selectedModelingTaskId ? "bg-sky-50" : ""
                          }`}
                          key={style.modelingTaskId}
                          onClick={() => setSelectedModelingTaskId(style.modelingTaskId)}
                        >
                          <td className="px-3 py-2">
                            <div className="truncate font-medium text-slate-900">{style.styleName}</div>
                            <div className="truncate text-xs text-slate-500">{style.styleCode || style.sourceStyleId || "-"}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{style.isFirstModelingStyle ? "第一款" : "其余款"}</td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                              {style.modelingStatus}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{style.taskNo ? `任务 ${style.taskNo}` : "-"}</td>
                          <td className="px-3 py-2 text-slate-600">{style.internalApprovedDate || "-"}</td>
                          <td className="px-3 py-2 text-slate-600">{style.copyrightApprovedDate || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={6}>
                          暂无款式，先提交测试款式清单。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="项目建模进度">
              {progress ? (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">完成进度</span>
                      <span className="text-slate-500">{progress.progressPercent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress.progressPercent}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Metric label="必做款式" value={progress.totalRequiredStyles} />
                    <Metric label="已通过" value={progress.approvedStyles} />
                    <Metric label="未启动" value={progress.unstartedStyles} />
                    <Metric label="未分配" value={progress.unassignedStyles} />
                    <Metric label="待送审" value={progress.waitingSubmissionStyles} />
                    <Metric label="送审中" value={progress.submittedStyles} />
                    <Metric label="建模中" value={progress.inProgressStyles} />
                    <Metric label="外包中" value={progress.outsourcedStyles} />
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    回写条件：{progress.canWritebackProjectTask ? "已满足" : "未满足"}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">暂无进度数据。</div>
              )}
            </Panel>

            <Panel title="接口返回">
              {errorMessage ? (
                <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</div>
              ) : null}
              <pre className="max-h-[520px] overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                {lastResponse ? JSON.stringify(lastResponse, null, 2) : "等待操作..."}
              </pre>
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

function LabeledInput({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block text-xs font-medium text-slate-500">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function ActionButton({
  children,
  disabled = false,
  loading,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled || loading}
      onClick={onClick}
      type="button"
    >
      {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

async function getJson(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  return parseJsonResponse(response);
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return parseJsonResponse(response);
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.message || `请求失败：${response.status}`);
  }

  return data;
}

function buildSeed() {
  return String(Date.now()).slice(-8);
}

function buildDefaultStyles(seedValue: string): EditableStyle[] {
  const safeSeed = seedValue || buildSeed();

  return [
    {
      sourceStyleId: `local-${safeSeed}-first`,
      styleCode: `LOCAL-${safeSeed}-S01`,
      styleSequence: "1",
      styleName: `接口测试第一款-${safeSeed}`,
      isFirstModelingStyle: true,
      difficulty: "常规款",
      estimatedWorkdays: 7,
      originalArtApprovedDate: today(),
      referenceImageUrl: "",
      notes: "本地接口测试第一款",
    },
    {
      sourceStyleId: `local-${safeSeed}-rest`,
      styleCode: `LOCAL-${safeSeed}-S02`,
      styleSequence: "2",
      styleName: `接口测试其余款-${safeSeed}`,
      isFirstModelingStyle: false,
      difficulty: "简单款",
      estimatedWorkdays: 4,
      originalArtApprovedDate: today(),
      referenceImageUrl: "",
      notes: "本地接口测试其余款",
    },
  ];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
