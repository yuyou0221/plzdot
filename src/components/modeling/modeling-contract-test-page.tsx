"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";

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
  initialDate: string;
  initialSeed: string;
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

type SubmittedStyle = {
  modelingTaskId: string;
  styleName: string;
  isFirstModelingStyle: boolean;
  modelingStatus: string;
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

type ScenarioId = "normal" | "task7-only" | "work-submit" | "internal-reject" | "copyright-reject" | "partial-pass";

type ScenarioCheck = {
  label: string;
  expected: string;
  actual: string;
  passed: boolean;
};

type ScenarioStep = {
  name: string;
  status: string;
};

const reviewActions = [
  { label: "内部通过可送审", value: "内部通过可送审", icon: ShieldCheck },
  { label: "内部不通过", value: "内部不通过", icon: RotateCcw },
  { label: "送审通过", value: "送审通过", icon: CheckCircle2 },
  { label: "送审不通过", value: "送审不通过", icon: RotateCcw },
] as const;

const scenarioOptions: Array<{ id: ScenarioId; label: string; description: string }> = [
  { id: "normal", label: "完整通过", description: "全部款式完成内部通过和版权方通过" },
  { id: "task7-only", label: "只启动任务 7", description: "第一款进入未分配，其余款保持未启动" },
  { id: "work-submit", label: "提交待验收", description: "建模师提交第一款成果，产品组可见待验收" },
  { id: "internal-reject", label: "内部驳回", description: "第一款进入修改中并生成内部反馈" },
  { id: "copyright-reject", label: "版权驳回", description: "第一款待送审后被版权方驳回" },
  { id: "partial-pass", label: "部分通过", description: "第一款通过，但项目不能回写完成" },
];

export function ModelingContractTestPage({ currentUserName, initialDate, initialSeed, projects }: ModelingContractTestPageProps) {
  const [projectOptions, setProjectOptions] = useState(projects);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? "");
  const [styleDraft, setStyleDraft] = useState(() => {
    return {
      seed: initialSeed,
      styles: buildDefaultStyles(initialSeed, initialDate),
    };
  });
  const [projectStyles, setProjectStyles] = useState<ProjectStyle[]>([]);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [selectedModelingTaskId, setSelectedModelingTaskId] = useState("");
  const [feedbackContent, setFeedbackContent] = useState("本地接口测试反馈");
  const [lastResponse, setLastResponse] = useState<ApiPayload>(null);
  const [scenarioChecks, setScenarioChecks] = useState<ScenarioCheck[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedProject = useMemo(
    () => projectOptions.find((project) => project.id === selectedProjectId) ?? projectOptions[0],
    [projectOptions, selectedProjectId],
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
    setScenarioChecks([]);
    setErrorMessage("");
  }

  function updateStyle(index: number, patch: Partial<EditableStyle>) {
    setStyleDraft((current) => ({
      ...current,
      styles: current.styles.map((style, styleIndex) => (styleIndex === index ? { ...style, ...patch } : style)),
    }));
  }

  async function createSimulatedProject() {
    await runAction("生成模拟项目", async () => {
      const fixture = await createFixtureProject(5);
      return {
        ok: true,
        message: "已生成模拟项目和款式草稿。",
        project: fixture.project,
        styles: fixture.styles,
      };
    });
  }

  async function cleanupCurrentProject() {
    if (!selectedProject) return;

    await runAction("清理当前测试项目", async () => {
      const data = await postJson("/api/modeling/contract-test/cleanup", {
        projectId: selectedProject.id,
        scope: "current",
      });

      if (isTestProject(selectedProject)) {
        const nextProjects = projectOptions.filter((project) => project.id !== selectedProject.id);
        setProjectOptions(nextProjects);
        setSelectedProjectId(nextProjects[0]?.id ?? "");
        setProjectStyles([]);
        setProgress(null);
        setSelectedModelingTaskId("");
      }

      setScenarioChecks([]);
      return data;
    });
  }

  async function cleanupAllTestProjects() {
    await runAction("清理全部测试数据", async () => {
      const data = await postJson("/api/modeling/contract-test/cleanup", { scope: "all" });
      const nextProjects = projectOptions.filter((project) => !isTestProject(project));
      setProjectOptions(nextProjects);
      setSelectedProjectId(nextProjects[0]?.id ?? "");
      setProjectStyles([]);
      setProgress(null);
      setSelectedModelingTaskId("");
      setScenarioChecks([]);
      return data;
    });
  }

  async function submitStyles() {
    if (!selectedProject) return;

    await runAction("提交款式清单", async () => {
      const submission = await submitStylesFor(selectedProject, styles, seed);
      const firstTaskId = submission.find((style) => style.isFirstModelingStyle)?.modelingTaskId ?? "";
      const state = await loadProjectState(selectedProject.id, firstTaskId);
      return {
        ok: true,
        submittedStyles: submission,
        progress: state.progress,
      };
    });
  }

  async function startStyles(taskNo: 7 | 10) {
    if (!selectedProject) return;

    await runAction(taskNo === 7 ? "启动任务 7" : "启动任务 10", async () => {
      const data = await startStylesFor(selectedProject, taskNo);
      const state = await loadProjectState(selectedProject.id);
      return { ok: true, startResult: data, progress: state.progress };
    });
  }

  async function submitReviewResult(reviewResult: (typeof reviewActions)[number]["value"]) {
    if (!selectedProject || !selectedModelingTaskId) return;

    await runAction(reviewResult, async () => {
      const data = await reviewStyle(selectedProject, selectedModelingTaskId, reviewResult, feedbackContent);
      const state = await loadProjectState(selectedProject.id, selectedModelingTaskId);
      return { ok: true, reviewResult: data, progress: state.progress };
    });
  }

  async function submitSelectedWork() {
    if (!selectedProject || !selectedModelingTaskId) return;

    await runAction("提交成果", async () => {
      const data = await submitWork(
        selectedProject,
        selectedModelingTaskId,
        feedbackContent || "本地模拟：建模师提交成果，等待产品美术验收",
        `https://example.local/modeling/${seed}/${selectedModelingTaskId}`,
      );
      const state = await loadProjectState(selectedProject.id, selectedModelingTaskId);
      return { ok: true, submitResult: data, progress: state.progress };
    });
  }

  async function refreshProjectState(projectId = selectedProject?.id) {
    if (!projectId) return;

    await runAction("刷新数据", async () => {
      const state = await loadProjectState(projectId);
      return { ok: true, styles: state.styles, progress: state.progress };
    });
  }

  async function runScenario(scenarioId: ScenarioId) {
    const scenario = scenarioOptions.find((option) => option.id === scenarioId);

    await runAction(`模拟：${scenario?.label ?? scenarioId}`, async () => {
      setScenarioChecks([]);
      const steps: ScenarioStep[] = [];
      const fixture = await createFixtureProject(5);
      steps.push({ name: "生成测试项目", status: "完成" });

      const submittedStyles = await submitStylesFor(fixture.project, fixture.styles, fixture.seed);
      steps.push({ name: "提交款式清单", status: `${submittedStyles.length} 款` });

      const firstTask = submittedStyles.find((style) => style.isFirstModelingStyle);
      const remainingTasks = submittedStyles.filter((style) => !style.isFirstModelingStyle);

      if (!firstTask) {
        throw new Error("模拟数据缺少第一款建模任务。");
      }

      if (scenarioId === "task7-only") {
        await startStylesFor(fixture.project, 7);
        steps.push({ name: "启动任务 7", status: "完成" });
      } else {
        await startStylesFor(fixture.project, 7);
        steps.push({ name: "启动任务 7", status: "完成" });
        await startStylesFor(fixture.project, 10);
        steps.push({ name: "启动任务 10", status: "完成" });
      }

      if (scenarioId === "normal") {
        for (const style of submittedStyles) {
          await markStyleModeling(style.modelingTaskId);
          await submitWork(fixture.project, style.modelingTaskId, `${style.styleName} 建模成果已提交`, `https://example.local/modeling/${fixture.seed}/${style.modelingTaskId}`);
          await reviewStyle(fixture.project, style.modelingTaskId, "内部通过可送审", `${style.styleName} 内部通过`);
          await reviewStyle(fixture.project, style.modelingTaskId, "送审通过", `${style.styleName} 版权方通过`);
        }
        steps.push({ name: "全部款式过审", status: "完成" });
      }

      if (scenarioId === "work-submit") {
        await markStyleModeling(firstTask.modelingTaskId);
        await submitWork(fixture.project, firstTask.modelingTaskId, "第一款建模成果已提交，等待产品美术检修", `https://example.local/modeling/${fixture.seed}/first-style`);
        steps.push({ name: "建模师提交第一款成果", status: "待验收" });
      }

      if (scenarioId === "internal-reject") {
        await markStyleModeling(firstTask.modelingTaskId);
        await submitWork(fixture.project, firstTask.modelingTaskId, "第一款建模成果已提交，等待内部检修", `https://example.local/modeling/${fixture.seed}/first-style`);
        await reviewStyle(fixture.project, firstTask.modelingTaskId, "内部不通过", "内部检修发现比例问题，退回修改");
        steps.push({ name: "内部驳回第一款", status: "完成" });
      }

      if (scenarioId === "copyright-reject") {
        await markStyleModeling(firstTask.modelingTaskId);
        await submitWork(fixture.project, firstTask.modelingTaskId, "第一款建模成果已提交，等待内部检修", `https://example.local/modeling/${fixture.seed}/first-style`);
        await reviewStyle(fixture.project, firstTask.modelingTaskId, "内部通过可送审", "内部通过，待送审");
        await reviewStyle(fixture.project, firstTask.modelingTaskId, "送审不通过", "版权方反馈表情需要调整");
        steps.push({ name: "版权方驳回第一款", status: "完成" });
      }

      if (scenarioId === "partial-pass") {
        await markStyleModeling(firstTask.modelingTaskId);
        await submitWork(fixture.project, firstTask.modelingTaskId, "第一款建模成果已提交，等待内部检修", `https://example.local/modeling/${fixture.seed}/first-style`);
        await reviewStyle(fixture.project, firstTask.modelingTaskId, "内部通过可送审", "第一款内部通过");
        await reviewStyle(fixture.project, firstTask.modelingTaskId, "送审通过", "第一款版权方通过");
        steps.push({ name: "只通过第一款", status: `剩余 ${remainingTasks.length} 款未通过` });
      }

      const state = await loadProjectState(fixture.project.id, firstTask.modelingTaskId);
      const checks = evaluateScenario(scenarioId, state.styles, state.progress, fixture.styles.length);
      setScenarioChecks(checks);

      return {
        ok: true,
        scenario: scenario?.label ?? scenarioId,
        project: fixture.project.projectName,
        seed: fixture.seed,
        steps,
        checks,
        progress: state.progress,
        styles: state.styles.map((style) => ({
          styleName: style.styleName,
          status: style.modelingStatus,
          taskNo: style.taskNo,
          reviewRound: style.reviewRound,
        })),
      };
    });
  }

  async function createFixtureProject(styleCount: number) {
    const nextSeed = buildSeed();
    const data = await postJson("/api/modeling/contract-test/projects", {
      seed: nextSeed,
      styleCount,
    });
    const project = readFixtureProject(data.project);
    const nextStyles = readFixtureStyles(data.styles, nextSeed);

    setProjectOptions((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    setSelectedProjectId(project.id);
    setStyleDraft({
      seed: typeof data.seed === "string" ? data.seed : nextSeed,
      styles: nextStyles,
    });
    setProjectStyles([]);
    setProgress(null);
    setSelectedModelingTaskId("");
    setErrorMessage("");

    return {
      project,
      seed: typeof data.seed === "string" ? data.seed : nextSeed,
      styles: nextStyles,
      raw: data,
    };
  }

  async function submitStylesFor(project: ModelingContractTestProject, draftStyles: EditableStyle[], batchSeed: string) {
    const data = await postJson("/api/modeling/style-submissions", {
      projectId: project.id,
      sourceRequestId: `local-contract-test-${batchSeed}`,
      submittedByName: currentUserName || "本地测试页",
      firstStyleProjectTaskId: project.task7.id,
      remainingStylesProjectTaskId: project.task10.id,
      styles: draftStyles.map((style) => ({
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

    const submittedStyles = Array.isArray(data.styles)
      ? data.styles.map(readSubmittedStyle).filter((style): style is SubmittedStyle => Boolean(style))
      : [];

    return submittedStyles;
  }

  async function startStylesFor(project: ModelingContractTestProject, taskNo: 7 | 10) {
    return postJson("/api/modeling/style-start-events", {
      projectId: project.id,
      projectTaskId: taskNo === 7 ? project.task7.id : project.task10.id,
      taskNo,
      startScope: taskNo === 7 ? "first-style" : "remaining-styles",
      operatorName: currentUserName || "本地测试页",
    });
  }

  async function reviewStyle(
    project: ModelingContractTestProject,
    modelingTaskId: string,
    reviewResult: (typeof reviewActions)[number]["value"],
    content: string,
  ) {
    return postJson("/api/modeling/review-results", {
      projectId: project.id,
      modelingTaskId,
      reviewResult,
      reviewAt: today(),
      reviewerName: currentUserName || "本地测试页",
      feedbackContent: content,
    });
  }

  async function submitWork(project: ModelingContractTestProject, modelingTaskId: string, content: string, deliverableUrl: string) {
    return postJson(`/api/modeling/tasks/${modelingTaskId}/work-submissions`, {
      projectId: project.id,
      content,
      deliverableUrl,
    });
  }

  async function markStyleModeling(modelingTaskId: string) {
    return patchJson(`/api/modeling/tasks/${modelingTaskId}`, {
      status: "建模中",
    });
  }

  async function loadProjectState(projectId: string, preferredTaskId = "") {
    const [styleData, progressData] = await Promise.all([
      getJson(`/api/modeling/projects/${projectId}/styles`),
      getJson(`/api/modeling/projects/${projectId}/progress`),
    ]);
    const nextStyles = Array.isArray(styleData.styles) ? (styleData.styles as ProjectStyle[]) : [];
    const nextProgress = progressData as unknown as ProjectProgress;
    const nextSelectedTaskId =
      preferredTaskId || (selectedModelingTaskId && nextStyles.some((style) => style.modelingTaskId === selectedModelingTaskId) ? selectedModelingTaskId : "");

    setProjectStyles(nextStyles);
    setProgress(nextProgress);
    setSelectedModelingTaskId(nextSelectedTaskId || nextStyles[0]?.modelingTaskId || "");

    return {
      styles: nextStyles,
      progress: nextProgress,
      raw: { styles: styleData, progress: progressData },
    };
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
              <h1 className="text-xl font-semibold tracking-normal">建模排期模拟器</h1>
              <p className="mt-1 text-sm text-slate-500">用模拟项目压测款式清单、任务启动、审核结果和进度回传。</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              href="/modeling"
            >
              进入建模排期
            </Link>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(loadingAction)}
              onClick={() => refreshProjectState()}
              type="button"
            >
              <RefreshCw className={`h-4 w-4 ${loadingAction === "刷新数据" ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>
        </header>

        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          本页会写入当前本地数据库。自动生成的数据都以 MT-TEST- 开头，可用清理按钮删除；正式业务数据不会被清理接口处理。
        </section>

        <Panel title="模拟数据">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="flex flex-wrap gap-2">
              <ActionButton loading={loadingAction === "生成模拟项目"} onClick={createSimulatedProject}>
                <Database className="h-4 w-4" />
                生成测试项目
              </ActionButton>
              <ActionButton disabled={!selectedProject || !isTestProject(selectedProject)} loading={loadingAction === "清理当前测试项目"} onClick={cleanupCurrentProject}>
                <Trash2 className="h-4 w-4" />
                清理当前
              </ActionButton>
              <ActionButton loading={loadingAction === "清理全部测试数据"} onClick={cleanupAllTestProjects}>
                <Trash2 className="h-4 w-4" />
                清理全部测试
              </ActionButton>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {scenarioOptions.map((scenario) => (
                <button
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={Boolean(loadingAction)}
                  key={scenario.id}
                  onClick={() => runScenario(scenario.id)}
                  type="button"
                >
                  <span className="block font-medium text-slate-900">{scenario.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{scenario.description}</span>
                </button>
              ))}
            </div>
          </div>

          {scenarioChecks.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs text-slate-500">
                  <tr>
                    <th className="w-[30%] px-3 py-2 font-medium">检查项</th>
                    <th className="w-[30%] px-3 py-2 font-medium">预期</th>
                    <th className="w-[30%] px-3 py-2 font-medium">实际</th>
                    <th className="w-[10%] px-3 py-2 font-medium">结果</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {scenarioChecks.map((check) => (
                    <tr key={check.label}>
                      <td className="px-3 py-2 font-medium text-slate-900">{check.label}</td>
                      <td className="px-3 py-2 text-slate-600">{check.expected}</td>
                      <td className="px-3 py-2 text-slate-600">{check.actual}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            check.passed ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {check.passed ? "通过" : "失败"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>

        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            <Panel title="测试项目">
              <label className="block text-xs font-medium text-slate-500" htmlFor="project-select">
                项目
              </label>
              <select
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                disabled={projectOptions.length === 0}
                id="project-select"
                onChange={(event) => {
                  const nextProjectId = event.target.value;
                  setSelectedProjectId(nextProjectId);
                  setProjectStyles([]);
                  setProgress(null);
                  setSelectedModelingTaskId("");
                  setScenarioChecks([]);
                  void refreshProjectState(nextProjectId);
                }}
                value={selectedProject?.id ?? ""}
              >
                {projectOptions.length > 0 ? (
                  projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.projectName}
                    </option>
                  ))
                ) : (
                  <option value="">暂无项目</option>
                )}
              </select>

              {selectedProject ? (
                <div className="mt-4 space-y-3 text-sm">
                  <InfoRow label="项目编号" value={selectedProject.projectCode || "-"} />
                  <InfoRow label="项目状态" value={selectedProject.status || "-"} />
                  <InfoRow label="当前阶段" value={selectedProject.currentStage || "-"} />
                  <InfoRow label="计划上线" value={selectedProject.plannedLaunchDate || "-"} />
                  <InfoRow label="任务 7" value={`${selectedProject.task7.taskName} · ${selectedProject.task7.status}`} />
                  <InfoRow label="任务 10" value={`${selectedProject.task10.taskName} · ${selectedProject.task10.status}`} />
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  点击“生成测试项目”即可开始。
                </div>
              )}
            </Panel>

            <Panel
              title="款式草稿"
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
                    styles: buildDefaultStyles(nextSeed, initialDate),
                  });
                }}
                value={seed}
              />

              <div className="mt-4 max-h-[560px] space-y-4 overflow-auto pr-1">
                {styles.map((style, index) => (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3" key={style.sourceStyleId}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {style.isFirstModelingStyle ? "第一款 · 任务 7" : "其余款 · 任务 10"}
                      </span>
                      <span className="truncate rounded bg-white px-2 py-1 text-xs text-slate-500">{style.sourceStyleId}</span>
                    </div>
                    <div className="grid gap-3">
                      <LabeledInput label="款式名称" onChange={(value) => updateStyle(index, { styleName: value })} value={style.styleName} />
                      <div className="grid grid-cols-2 gap-3">
                        <LabeledInput label="款式编号" onChange={(value) => updateStyle(index, { styleCode: value })} value={style.styleCode} />
                        <LabeledInput label="序号" onChange={(value) => updateStyle(index, { styleSequence: value })} value={style.styleSequence} />
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
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(loadingAction) || !selectedProject}
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
                <ActionButton disabled={!selectedProject} loading={loadingAction === "启动任务 7"} onClick={() => startStyles(7)}>
                  <Play className="h-4 w-4" />
                  启动任务 7
                </ActionButton>
                <ActionButton disabled={!selectedProject} loading={loadingAction === "启动任务 10"} onClick={() => startStyles(10)}>
                  <Play className="h-4 w-4" />
                  启动任务 10
                </ActionButton>
                <ActionButton disabled={!selectedProject || !selectedModelingTaskId} loading={loadingAction === "提交成果"} onClick={() => submitSelectedWork()}>
                  <Send className="h-4 w-4" />
                  提交成果
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
                          className={`cursor-pointer hover:bg-slate-50 ${style.modelingTaskId === selectedModelingTaskId ? "bg-sky-50" : ""}`}
                          key={style.modelingTaskId}
                          onClick={() => setSelectedModelingTaskId(style.modelingTaskId)}
                        >
                          <td className="px-3 py-2">
                            <div className="truncate font-medium text-slate-900">{style.styleName}</div>
                            <div className="truncate text-xs text-slate-500">{style.styleCode || style.sourceStyleId || "-"}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{style.isFirstModelingStyle ? "第一款" : "其余款"}</td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{style.modelingStatus}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{style.taskNo ? `任务 ${style.taskNo}` : "-"}</td>
                          <td className="px-3 py-2 text-slate-600">{style.internalApprovedDate || "-"}</td>
                          <td className="px-3 py-2 text-slate-600">{style.copyrightApprovedDate || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={6}>
                          暂无款式，先生成测试项目或提交款式清单。
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

function evaluateScenario(scenarioId: ScenarioId, styles: ProjectStyle[], progress: ProjectProgress, expectedTotal: number): ScenarioCheck[] {
  const firstStyle = styles.find((style) => style.isFirstModelingStyle);
  const remainingStyles = styles.filter((style) => !style.isFirstModelingStyle);
  const allApproved = styles.length > 0 && styles.every((style) => style.modelingStatus === "已通过");
  const remainingUnstarted = remainingStyles.every((style) => style.modelingStatus === "未启动");

  if (scenarioId === "normal") {
    return [
      buildCheck("款式数量", `${expectedTotal} 款`, `${styles.length} 款`, styles.length === expectedTotal),
      buildCheck("全部款式状态", "已通过", allApproved ? "已通过" : styles.map((style) => style.modelingStatus).join("、"), allApproved),
      buildCheck("项目进度", "100%", `${progress.progressPercent}%`, progress.progressPercent === 100),
      buildCheck("回写条件", "已满足", progress.canWritebackProjectTask ? "已满足" : "未满足", progress.canWritebackProjectTask),
    ];
  }

  if (scenarioId === "task7-only") {
    return [
      buildCheck("第一款状态", "未分配", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "未分配"),
      buildCheck("其余款状态", "未启动", remainingUnstarted ? "未启动" : remainingStyles.map((style) => style.modelingStatus).join("、"), remainingUnstarted),
      buildCheck("未启动数量", `${expectedTotal - 1} 款`, `${progress.unstartedStyles} 款`, progress.unstartedStyles === expectedTotal - 1),
      buildCheck("回写条件", "未满足", progress.canWritebackProjectTask ? "已满足" : "未满足", !progress.canWritebackProjectTask),
    ];
  }

  if (scenarioId === "internal-reject") {
    return [
      buildCheck("第一款状态", "修改中", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "修改中"),
      buildCheck("修改轮次", "大于 0", String(firstStyle?.reviewRound ?? 0), Number(firstStyle?.reviewRound ?? 0) > 0),
      buildCheck("回写条件", "未满足", progress.canWritebackProjectTask ? "已满足" : "未满足", !progress.canWritebackProjectTask),
    ];
  }

  if (scenarioId === "work-submit") {
    return [
      buildCheck("第一款状态", "待验收", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "待验收"),
      buildCheck("待验收统计", "大于 0", `${progress.submittedStyles} 款`, progress.submittedStyles > 0),
      buildCheck("回写条件", "未满足", progress.canWritebackProjectTask ? "已满足" : "未满足", !progress.canWritebackProjectTask),
    ];
  }

  if (scenarioId === "copyright-reject") {
    return [
      buildCheck("第一款状态", "修改中", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "修改中"),
      buildCheck("最新反馈", "版权方反馈", firstStyle?.latestFeedbackSummary || "无反馈", Boolean(firstStyle?.latestFeedbackSummary)),
      buildCheck("回写条件", "未满足", progress.canWritebackProjectTask ? "已满足" : "未满足", !progress.canWritebackProjectTask),
    ];
  }

  return [
    buildCheck("第一款状态", "已通过", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "已通过"),
    buildCheck("已通过数量", "1 款", `${progress.approvedStyles} 款`, progress.approvedStyles === 1),
    buildCheck("项目进度", "小于 100%", `${progress.progressPercent}%`, progress.progressPercent > 0 && progress.progressPercent < 100),
    buildCheck("回写条件", "未满足", progress.canWritebackProjectTask ? "已满足" : "未满足", !progress.canWritebackProjectTask),
  ];
}

function buildCheck(label: string, expected: string, actual: string, passed: boolean): ScenarioCheck {
  return { label, expected, actual, passed };
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

async function patchJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  return parseJsonResponse(response);
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  const data = (text ? JSON.parse(text) : {}) as Record<string, unknown>;

  if (!response.ok || data.ok === false) {
    throw new Error(typeof data.message === "string" ? data.message : `请求失败：${response.status}`);
  }

  return data;
}

function readFixtureProject(value: unknown): ModelingContractTestProject {
  if (!isRecord(value)) {
    throw new Error("测试项目返回格式不正确。");
  }

  return value as unknown as ModelingContractTestProject;
}

function readFixtureStyles(value: unknown, fallbackSeed: string): EditableStyle[] {
  if (!Array.isArray(value)) {
    return buildDefaultStyles(fallbackSeed);
  }

  const styles = value.map(readEditableStyle).filter((style): style is EditableStyle => Boolean(style));
  return styles.length > 0 ? styles : buildDefaultStyles(fallbackSeed);
}

function readEditableStyle(value: unknown): EditableStyle | null {
  if (!isRecord(value)) return null;

  return {
    sourceStyleId: readString(value.sourceStyleId),
    styleCode: readString(value.styleCode),
    styleSequence: readString(value.styleSequence),
    styleName: readString(value.styleName),
    isFirstModelingStyle: value.isFirstModelingStyle === true,
    difficulty: readString(value.difficulty) || "常规款",
    estimatedWorkdays: Number(value.estimatedWorkdays) || 7,
    originalArtApprovedDate: readString(value.originalArtApprovedDate) || today(),
    referenceImageUrl: readString(value.referenceImageUrl),
    notes: readString(value.notes),
  };
}

function readSubmittedStyle(value: unknown): SubmittedStyle | null {
  if (!isRecord(value)) return null;
  const modelingTaskId = readString(value.modelingTaskId);

  if (!modelingTaskId) return null;

  return {
    modelingTaskId,
    styleName: readString(value.styleName),
    isFirstModelingStyle: value.isFirstModelingStyle === true,
    modelingStatus: readString(value.modelingStatus),
  };
}

function isTestProject(project?: ModelingContractTestProject) {
  return Boolean(project?.projectCode?.startsWith("MT-TEST-") || project?.projectName.startsWith("[建模测试]"));
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function buildSeed() {
  return String(Date.now()).slice(-8);
}

function buildDefaultStyles(seedValue: string, approvedDate = today()): EditableStyle[] {
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
      originalArtApprovedDate: approvedDate,
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
      originalArtApprovedDate: approvedDate,
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
