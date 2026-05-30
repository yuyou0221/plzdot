"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Database,
  Maximize2,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { buildModelingTodosFromTasks, type ModelingTodoItem } from "@/lib/modeling-todos";
import { canDisplayModelingFieldValue, isModelingTestFieldValue } from "@/lib/modeling-test-fields";

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

export type ModelingContractTestModeler = {
  id: string;
  name: string;
};

type ModelingContractTestPageProps = {
  currentUserName?: string | null;
  currentUserRole?: string | null;
  initialDate: string;
  initialSeed: string;
  projects: ModelingContractTestProject[];
  testModelers: ModelingContractTestModeler[];
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
  projectId: string;
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
  modelerId?: string | null;
  modelerName?: string | null;
  isOutsourced?: boolean;
  outsourceVendorName?: string | null;
  actualWorkMinutes?: number;
  activeWorkStartedAt?: string | null;
  internalApprovedDate?: string | null;
  copyrightApprovedDate?: string | null;
  reviewRound?: number;
  latestFeedbackSummary?: string | null;
  blockedDays?: number;
  lastUpdatedAt?: string | null;
};

type ProjectProgress = {
  sourceTaskNos: number[];
  allRequiredStylesApproved: boolean;
  canProjectScheduleTreatModelingDone: boolean;
  requiredStyleCount: number;
  approvedRequiredStyleCount: number;
  lastRequiredStyleApprovedDate?: string | null;
  unapprovedRequiredStyles: ProjectStyle[];
  blockingStyles: ProjectStyle[];
  submittedOrWaitingStyles: ProjectStyle[];
  totalRequiredStyles: number;
  approvedStyles: number;
  inProgressStyles: number;
  submittedStyles: number;
  waitingSubmissionStyles: number;
  outsourcedStyles: number;
  unstartedStyles: number;
  unassignedStyles: number;
  progressPercent: number;
  projectedAllApprovedDate?: string | null;
};

type ApiPayload = Record<string, unknown> | null;

type ScenarioId =
  | "normal"
  | "task7-only"
  | "unconfirmed-start-block"
  | "invalid-task-start"
  | "repeat-start"
  | "review-before-submit-block"
  | "reject-feedback-required"
  | "work-submit"
  | "internal-reject"
  | "copyright-reject"
  | "partial-pass";

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

type ReviewActionValue = (typeof reviewActions)[number]["value"];

type ReviewFeedbackAttachmentPayload = {
  feedbackAttachments?: {
    imageUrl?: string | null;
    pdfUrl?: string | null;
    pptUrl?: string | null;
  };
  attachmentUrls?: string[];
};

const internalReviewResults = new Set<ReviewActionValue>(["内部通过可送审", "内部不通过"]);
const copyrightReviewResults = new Set<ReviewActionValue>(["送审通过", "送审不通过"]);
const copyrightFeedbackStatuses = new Set(["待送审", "已送审", "等反馈"]);
const simulatorWorkSubmittableStatuses = new Set(["未分配", "已排期", "排队中", "建模中", "修改中", "外包中"]);
const simulatorTimerStartStatuses = new Set(["未分配", "已排期", "排队中", "建模中", "修改中"]);
const workTimerRefreshMs = 5 * 60 * 1000;

const scenarioOptions: Array<{ id: ScenarioId; label: string; description: string }> = [
  { id: "normal", label: "完整通过", description: "全部款式完成内部通过和版权方通过" },
  { id: "task7-only", label: "只启动任务 7", description: "第一款进入未分配，其余款保持未启动" },
  { id: "unconfirmed-start-block", label: "未确认拦截", description: "待确认款式不能被任务 7/10 启动" },
  { id: "invalid-task-start", label: "任务 8/9 拒绝", description: "支线任务不能启动款式级建模任务" },
  { id: "repeat-start", label: "重复启动幂等", description: "已启动款式不会被重复推进或重复生成" },
  { id: "review-before-submit-block", label: "未提交审核拦截", description: "建模未提交成果前产品组不能审核" },
  { id: "reject-feedback-required", label: "驳回文字必填", description: "内部驳回和版权驳回都必须填写文字反馈" },
  { id: "work-submit", label: "提交待验收", description: "建模师提交第一款成果，产品组可见待验收" },
  { id: "internal-reject", label: "内部驳回", description: "第一款回到排队中并生成内部反馈" },
  { id: "copyright-reject", label: "版权驳回", description: "第一款待送审后被版权方驳回" },
  { id: "partial-pass", label: "部分通过", description: "第一款通过，但项目排期不能读取为建模完成" },
];

export function ModelingContractTestPage({ currentUserName, currentUserRole, initialDate, initialSeed, projects, testModelers }: ModelingContractTestPageProps) {
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
  const [scenarioChecks, setScenarioChecks] = useState<ScenarioCheck[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [detailStyleId, setDetailStyleId] = useState("");
  const [confirmationListOpen, setConfirmationListOpen] = useState(false);
  const [selectedModelerId, setSelectedModelerId] = useState(testModelers[0]?.id ?? "");
  const [clockNow, setClockNow] = useState<number | null>(null);

  useEffect(() => {
    const syncClock = () => setClockNow(Date.now());
    const startupTimerId = window.setTimeout(syncClock, 0);
    const timerId = window.setInterval(syncClock, workTimerRefreshMs);

    return () => {
      window.clearTimeout(startupTimerId);
      window.clearInterval(timerId);
    };
  }, []);

  const selectedProject = useMemo(
    () => projectOptions.find((project) => project.id === selectedProjectId) ?? projectOptions[0],
    [projectOptions, selectedProjectId],
  );

  const selectedStyle = useMemo(
    () => projectStyles.find((style) => style.modelingTaskId === selectedModelingTaskId),
    [projectStyles, selectedModelingTaskId],
  );
  const detailStyle = useMemo(
    () => projectStyles.find((style) => style.modelingTaskId === detailStyleId),
    [detailStyleId, projectStyles],
  );
  const activeTodos = useMemo(
    () =>
      selectedProject
        ? buildModelingTodosFromTasks(
            projectStyles.map((style) => ({
              projectId: style.projectId,
              projectName: selectedProject.projectName,
              styleName: style.styleName,
              modelingStatus: style.modelingStatus,
              lastUpdatedAt: style.lastUpdatedAt,
            })),
          )
        : [],
    [projectStyles, selectedProject],
  );
  const activeTodo = activeTodos[0] ?? null;
  const canViewTestFields = currentUserRole === "admin";
  const pendingConfirmationStyleCount = projectStyles.filter((style) => style.modelingStatus === "待确认").length;
  const returnedStyles = projectStyles.filter((style) => style.modelingStatus === "退回补充");
  const hasReturnedStyles = returnedStyles.length > 0;
  const submittingStyleList = loadingAction === "提交款式清单" || loadingAction === "重新提交款式清单";
  const { seed, styles } = styleDraft;

  function regenerateStyles() {
    const nextSeed = buildSeed();
    setStyleDraft({
      seed: nextSeed,
      styles: buildDefaultStyles(nextSeed),
    });
    setScenarioChecks([]);
    setErrorMessage("");
  }

  function updateStyle(index: number, patch: Partial<EditableStyle>) {
    setStyleDraft((current) => ({
      ...current,
      styles: current.styles.map((style, styleIndex) => (styleIndex === index ? { ...style, ...patch } : style)),
    }));
  }

  function selectStyleForFeedback(style: ProjectStyle) {
    setSelectedModelingTaskId(style.modelingTaskId);

    if (!feedbackContent.trim() || feedbackContent === "本地接口测试反馈") {
      setFeedbackContent(buildFeedbackDraft(style));
    }
  }

  function openStyleDetail(style: ProjectStyle) {
    selectStyleForFeedback(style);
    setDetailStyleId(style.modelingTaskId);
  }

  function openTodo() {
    setConfirmationListOpen(true);
    setDetailStyleId("");
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

    await runAction(hasReturnedStyles ? "重新提交款式清单" : "提交款式清单", async () => {
      const submissionStyles = hasReturnedStyles && projectStyles.length > 0 ? buildEditableStylesFromProjectStyles(projectStyles) : styles;
      const submission = await submitStylesFor(selectedProject, submissionStyles, seed);
      const firstTaskId = submission.find((style) => style.isFirstModelingStyle)?.modelingTaskId ?? "";
      const state = await loadProjectState(selectedProject.id, firstTaskId);
      return {
        ok: true,
        submittedCount: submissionStyles.length,
        submittedStyles: submission,
        progress: state.progress,
      };
    });
  }

  async function confirmStyles() {
    if (!selectedProject) return;

    await runAction("确认款式清单", async () => {
      const data = await confirmStylesFor(selectedProject, "confirm");
      const state = await loadProjectState(selectedProject.id);
      return { ok: true, confirmationResult: data, progress: state.progress };
    });
  }

  async function returnStylesForSupplement() {
    if (!selectedProject) return;

    await runAction("退回款式清单", async () => {
      const data = await confirmStylesFor(selectedProject, "return", feedbackContent.trim() || "模拟器退回：款式信息需要补充。");
      const state = await loadProjectState(selectedProject.id);
      return { ok: true, confirmationResult: data, progress: state.progress };
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

  async function submitReviewResult(reviewResult: ReviewActionValue) {
    if (!selectedProject || !selectedStyle) return;

    if (!canSubmitReviewAction(selectedStyle, reviewResult)) {
      setErrorMessage(buildReviewActionDisabledReason(selectedStyle, reviewResult));
      return;
    }

    await runAction(reviewResult, async () => {
      const content = feedbackContent.trim() || buildDefaultReviewContent(selectedStyle, reviewResult);
      const data = await reviewStyle(selectedProject, selectedStyle.modelingTaskId, reviewResult, content);
      const state = await loadProjectState(selectedProject.id, selectedStyle.modelingTaskId);
      return { ok: true, reviewResult: data, progress: state.progress };
    });
  }

  async function submitSelectedWork() {
    if (!selectedProject || !selectedStyle) return;

    await runAction("提交成果", async () => {
      if (selectedStyle.modelingStatus === "未启动") {
        throw new Error("这款还没有被任务 7/10 启动，请先点击启动任务。");
      }

      if (!canSubmitWorkFromSimulator(selectedStyle)) {
        throw new Error(`当前状态是 ${selectedStyle.modelingStatus}，不能重复提交成果。`);
      }

      if (!selectedStyle.modelerId) {
        await assignStyleForWork(selectedStyle.modelingTaskId);
      }

      const data = await submitWork(
        selectedProject,
        selectedStyle.modelingTaskId,
        feedbackContent.trim() || "本地模拟：建模师提交成果，等待产品美术验收",
        `https://example.local/modeling/${seed}/${selectedStyle.modelingTaskId}`,
      );
      const state = await loadProjectState(selectedProject.id, selectedStyle.modelingTaskId);
      return { ok: true, submitResult: data, progress: state.progress };
    });
  }

  async function submitSelectedWorkTimer(action: "start") {
    if (!selectedProject || !selectedStyle) return;

    await runAction("开始计时", async () => {
      if (selectedStyle.modelingStatus === "未启动") {
        throw new Error("这款还没有被任务 7/10 启动，请先点击启动任务。");
      }

      if (!simulatorTimerStartStatuses.has(selectedStyle.modelingStatus)) {
        throw new Error(`当前状态是 ${selectedStyle.modelingStatus}，不能开始计时。`);
      }

      if (!selectedStyle.modelerId) {
        await assignStyleForWork(selectedStyle.modelingTaskId);
      }

      const data = await postJson(`/api/modeling/tasks/${selectedStyle.modelingTaskId}/work-timer`, { action });
      const state = await loadProjectState(selectedProject.id, selectedStyle.modelingTaskId);
      setClockNow(Date.now());

      return { ok: true, timerResult: data, progress: state.progress };
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

      if (!selectedProject) {
        throw new Error("请先生成或选择一个测试项目。");
      }

      const steps: ScenarioStep[] = [];

      if (scenarioId === "invalid-task-start") {
        const task8Rejection = await expectStartRejected(selectedProject, 8, "只接受任务 7 或任务 10");
        const task9Rejection = await expectStartRejected(selectedProject, 9, "只接受任务 7 或任务 10");
        const checks = [
          buildCheck("任务 8 启动", "拒绝", task8Rejection.message, task8Rejection.passed),
          buildCheck("任务 9 启动", "拒绝", task9Rejection.message, task9Rejection.passed),
        ];

        setScenarioChecks(checks);

        return {
          ok: true,
          scenario: scenario?.label ?? scenarioId,
          project: selectedProject.projectName,
          steps: [
            { name: "尝试启动任务 8", status: task8Rejection.message },
            { name: "尝试启动任务 9", status: task9Rejection.message },
          ],
          checks,
        };
      }

      if (scenarioId === "unconfirmed-start-block") {
        const fixture = await createFixtureProject(5);
        const submission = await submitStylesFor(fixture.project, fixture.styles, fixture.seed);
        const pendingState = await loadProjectState(fixture.project.id, submission[0]?.modelingTaskId ?? "");
        const task7Rejection = await expectStartRejected(fixture.project, 7, "还没有由建模侧确认");
        const task10Rejection = await expectStartRejected(fixture.project, 10, "还没有由建模侧确认");
        const afterRejectState = await loadProjectState(fixture.project.id, submission[0]?.modelingTaskId ?? "");
        const allPending = afterRejectState.styles.length > 0 && afterRejectState.styles.every((style) => style.modelingStatus === "待确认");
        const checks = [
          buildCheck("提交后状态", "待确认", pendingState.styles.map((style) => style.modelingStatus).join("、"), pendingState.styles.every((style) => style.modelingStatus === "待确认")),
          buildCheck("任务 7 未确认拦截", "拒绝", task7Rejection.message, task7Rejection.passed),
          buildCheck("任务 10 未确认拦截", "拒绝", task10Rejection.message, task10Rejection.passed),
          buildCheck("拦截后状态", "仍为待确认", allPending ? "仍为待确认" : afterRejectState.styles.map((style) => style.modelingStatus).join("、"), allPending),
        ];

        setScenarioChecks(checks);

        return {
          ok: true,
          scenario: scenario?.label ?? scenarioId,
          project: fixture.project.projectName,
          steps: [
            { name: "生成隔离测试项目", status: "完成" },
            { name: "提交款式清单", status: `${submission.length} 款待确认` },
            { name: "尝试启动任务 7", status: task7Rejection.message },
            { name: "尝试启动任务 10", status: task10Rejection.message },
          ],
          checks,
          styles: afterRejectState.styles.map((style) => ({
            styleName: style.styleName,
            status: style.modelingStatus,
            taskNo: style.taskNo,
          })),
        };
      }

      if (scenarioId === "review-before-submit-block") {
        const fixture = await createFixtureProject(5);
        const submission = await submitStylesFor(fixture.project, fixture.styles, fixture.seed);
        await confirmStylesFor(fixture.project, "confirm");
        const firstSubmittedStyle = submission.find((style) => style.isFirstModelingStyle);

        if (!firstSubmittedStyle) {
          throw new Error("测试清单缺少第一款。");
        }

        await startStylesFor(fixture.project, 7);
        const startedState = await loadProjectState(fixture.project.id, firstSubmittedStyle.modelingTaskId);
        const currentFirstStyle = startedState.styles.find((style) => style.modelingTaskId === firstSubmittedStyle.modelingTaskId);
        const internalRejection = await expectReviewRejected(fixture.project, firstSubmittedStyle.modelingTaskId, "内部通过可送审", "建模成果尚未提交");
        const copyrightRejection = await expectReviewRejected(fixture.project, firstSubmittedStyle.modelingTaskId, "送审通过", "尚未进入送审阶段");
        const afterRejectState = await loadProjectState(fixture.project.id, firstSubmittedStyle.modelingTaskId);
        const afterFirstStyle = afterRejectState.styles.find((style) => style.modelingTaskId === firstSubmittedStyle.modelingTaskId);
        const checks = [
          buildCheck("前置状态", "未分配", currentFirstStyle?.modelingStatus ?? "缺失", currentFirstStyle?.modelingStatus === "未分配"),
          buildCheck("内部审核拦截", "拒绝", internalRejection.message, internalRejection.passed),
          buildCheck("送审结果拦截", "拒绝", copyrightRejection.message, copyrightRejection.passed),
          buildCheck("拦截后状态", "仍为未分配", afterFirstStyle?.modelingStatus ?? "缺失", afterFirstStyle?.modelingStatus === "未分配"),
        ];

        setScenarioChecks(checks);

        return {
          ok: true,
          scenario: scenario?.label ?? scenarioId,
          project: fixture.project.projectName,
          steps: [
            { name: "生成隔离测试项目", status: "完成" },
            { name: "提交并确认款式清单", status: `${submission.length} 款` },
            { name: "启动任务 7", status: "完成" },
            { name: "尝试内部审核", status: internalRejection.message },
            { name: "尝试送审结果", status: copyrightRejection.message },
          ],
          checks,
          progress: afterRejectState.progress,
        };
      }

      if (scenarioId === "reject-feedback-required") {
        const fixture = await createFixtureProject(5);
        const submission = await submitStylesFor(fixture.project, fixture.styles, fixture.seed);
        await confirmStylesFor(fixture.project, "confirm");
        const firstSubmittedStyle = submission.find((style) => style.isFirstModelingStyle);

        if (!firstSubmittedStyle) {
          throw new Error("测试清单缺少第一款。");
        }

        await startStylesFor(fixture.project, 7);
        await assignStyleForWork(firstSubmittedStyle.modelingTaskId);
        await submitWork(fixture.project, firstSubmittedStyle.modelingTaskId, "第一款建模成果已提交，等待内部检修", `https://example.local/modeling/${fixture.seed}/first-style`);
        const internalRejection = await expectReviewRejected(fixture.project, firstSubmittedStyle.modelingTaskId, "内部不通过", "必须填写文字反馈");
        await reviewStyle(fixture.project, firstSubmittedStyle.modelingTaskId, "内部通过可送审", "");
        const copyrightRejection = await expectReviewRejected(fixture.project, firstSubmittedStyle.modelingTaskId, "送审不通过", "必须填写文字反馈");
        const afterRejectState = await loadProjectState(fixture.project.id, firstSubmittedStyle.modelingTaskId);
        const afterFirstStyle = afterRejectState.styles.find((style) => style.modelingTaskId === firstSubmittedStyle.modelingTaskId);
        const checks = [
          buildCheck("内部驳回空文字", "拒绝", internalRejection.message, internalRejection.passed),
          buildCheck("内部通过空文字", "待送审", afterFirstStyle?.modelingStatus ?? "缺失", afterFirstStyle?.modelingStatus === "待送审"),
          buildCheck("版权驳回空文字", "拒绝", copyrightRejection.message, copyrightRejection.passed),
        ];

        setScenarioChecks(checks);

        return {
          ok: true,
          scenario: scenario?.label ?? scenarioId,
          project: fixture.project.projectName,
          steps: [
            { name: "生成隔离测试项目", status: "完成" },
            { name: "提交并确认款式清单", status: `${submission.length} 款` },
            { name: "提交建模成果", status: "待验收" },
            { name: "内部驳回空文字", status: internalRejection.message },
            { name: "内部通过空文字", status: afterFirstStyle?.modelingStatus ?? "缺失" },
            { name: "版权驳回空文字", status: copyrightRejection.message },
          ],
          checks,
          progress: afterRejectState.progress,
        };
      }

      const initialState = await loadProjectState(selectedProject.id);
      const submittedStyles = initialState.styles;

      if (submittedStyles.length === 0) {
        throw new Error("当前项目还没有提交款式清单，没有可通过的建模款式。请先点击“提交款式清单”。");
      }

      steps.push({ name: "读取当前款式清单", status: `${submittedStyles.length} 款` });

      const firstTask = submittedStyles.find((style) => style.isFirstModelingStyle);
      const remainingTasks = submittedStyles.filter((style) => !style.isFirstModelingStyle);
      let workSubmissionResult: ApiPayload = null;

      if (!firstTask) {
        throw new Error("当前款式清单缺少第一款建模任务。");
      }

      if (submittedStyles.some((style) => style.modelingStatus === "待确认" || style.modelingStatus === "退回补充")) {
        await confirmStylesFor(selectedProject, "confirm");
        steps.push({ name: "建模侧确认款式清单", status: "完成" });
      } else {
        steps.push({ name: "建模侧确认款式清单", status: "已确认" });
      }

      if (scenarioId === "repeat-start") {
        const firstStart = await startStylesFor(selectedProject, 7);
        const repeatStart = await startStylesFor(selectedProject, 7);
        const state = await loadProjectState(selectedProject.id, firstTask.modelingTaskId);
        const startedCount = Number(firstStart.startedCount ?? 0);
        const repeatStartedCount = Number(repeatStart.startedCount ?? 0);
        const repeatSkippedCount = Number(repeatStart.skippedCount ?? 0);
        const updatedFirstStyle = state.styles.find((style) => style.modelingTaskId === firstTask.modelingTaskId);
        const checks = [
          buildCheck("首次启动", "启动 1 款", `启动 ${startedCount} 款`, startedCount === 1),
          buildCheck("重复启动", "启动 0 款", `启动 ${repeatStartedCount} 款`, repeatStartedCount === 0),
          buildCheck("重复跳过", "跳过 1 款", `跳过 ${repeatSkippedCount} 款`, repeatSkippedCount === 1),
          buildCheck("第一款状态", "未分配", updatedFirstStyle?.modelingStatus ?? "缺失", updatedFirstStyle?.modelingStatus === "未分配"),
        ];

        setScenarioChecks(checks);

        return {
          ok: true,
          scenario: scenario?.label ?? scenarioId,
          project: selectedProject.projectName,
          steps: [
            ...steps,
            { name: "首次启动任务 7", status: `启动 ${startedCount} 款` },
            { name: "再次启动任务 7", status: `启动 ${repeatStartedCount} 款，跳过 ${repeatSkippedCount} 款` },
          ],
          checks,
          firstStart,
          repeatStart,
          progress: state.progress,
        };
      }

      if (scenarioId === "task7-only") {
        await startStylesFor(selectedProject, 7);
        steps.push({ name: "启动任务 7", status: "完成" });
      } else {
        await startStylesFor(selectedProject, 7);
        steps.push({ name: "启动任务 7", status: "完成" });
        await startStylesFor(selectedProject, 10);
        steps.push({ name: "启动任务 10", status: "完成" });
      }

      if (scenarioId === "normal") {
        for (const style of submittedStyles) {
          await assignStyleForWork(style.modelingTaskId);
          await submitWork(selectedProject, style.modelingTaskId, `${style.styleName} 建模成果已提交`, `https://example.local/modeling/${seed}/${style.modelingTaskId}`);
          await reviewStyle(selectedProject, style.modelingTaskId, "内部通过可送审", `${style.styleName} 内部通过`);
          await reviewStyle(selectedProject, style.modelingTaskId, "送审通过", `${style.styleName} 版权方通过`);
        }
        steps.push({ name: "全部款式过审", status: "完成" });
      }

      if (scenarioId === "work-submit") {
        await assignStyleForWork(firstTask.modelingTaskId);
        workSubmissionResult = await submitWork(selectedProject, firstTask.modelingTaskId, "第一款建模成果已提交，等待产品美术检修", `https://example.local/modeling/${seed}/first-style`);
        steps.push({ name: "建模师提交第一款成果", status: "待验收" });
      }

      if (scenarioId === "internal-reject") {
        await assignStyleForWork(firstTask.modelingTaskId);
        await submitWork(selectedProject, firstTask.modelingTaskId, "第一款建模成果已提交，等待内部检修", `https://example.local/modeling/${seed}/first-style`);
        await reviewStyle(selectedProject, firstTask.modelingTaskId, "内部不通过", "内部检修发现比例问题，退回排队", {
          feedbackAttachments: {
            imageUrl: `https://example.local/feedback/${seed}/internal-proportion.png`,
            pdfUrl: `https://example.local/feedback/${seed}/internal-notes.pdf`,
          },
        });
        steps.push({ name: "内部驳回第一款", status: "完成" });
      }

      if (scenarioId === "copyright-reject") {
        await assignStyleForWork(firstTask.modelingTaskId);
        await submitWork(selectedProject, firstTask.modelingTaskId, "第一款建模成果已提交，等待内部检修", `https://example.local/modeling/${seed}/first-style`);
        await reviewStyle(selectedProject, firstTask.modelingTaskId, "内部通过可送审", "内部通过，待送审");
        await reviewStyle(selectedProject, firstTask.modelingTaskId, "送审不通过", "版权方反馈表情需要调整", {
          feedbackAttachments: {
            pptUrl: `https://example.local/feedback/${seed}/copyright-review.pptx`,
          },
        });
        steps.push({ name: "版权方驳回第一款", status: "完成" });
      }

      if (scenarioId === "partial-pass") {
        await assignStyleForWork(firstTask.modelingTaskId);
        await submitWork(selectedProject, firstTask.modelingTaskId, "第一款建模成果已提交，等待内部检修", `https://example.local/modeling/${seed}/first-style`);
        await reviewStyle(selectedProject, firstTask.modelingTaskId, "内部通过可送审", "第一款内部通过");
        await reviewStyle(selectedProject, firstTask.modelingTaskId, "送审通过", "第一款版权方通过");
        steps.push({ name: "只通过第一款", status: `剩余 ${remainingTasks.length} 款未通过` });
      }

      const state = await loadProjectState(selectedProject.id, firstTask.modelingTaskId);
      const checks = evaluateScenario(scenarioId, state.styles, state.progress, submittedStyles.length);
      if (scenarioId === "work-submit") {
        const reviewRequest = isRecord(workSubmissionResult) ? workSubmissionResult.reviewRequest : null;
        const productGuideEvent = isRecord(workSubmissionResult) ? workSubmissionResult.productGuideEvent : null;
        checks.push(buildCheck("产品审核入口", "返回 reviewRequest", isRecord(reviewRequest) ? "已返回" : "未返回", isRecord(reviewRequest)));
        checks.push(
          buildCheck(
            "主动事件",
            "modeling_work_submitted",
            isRecord(productGuideEvent) ? readString(productGuideEvent.eventType) || "缺失" : "缺失",
            isRecord(productGuideEvent) && readString(productGuideEvent.eventType) === "modeling_work_submitted" && Boolean(readString(productGuideEvent.eventId)),
          ),
        );
        checks.push(
          buildCheck(
            "恢复目标",
            "排队中",
            isRecord(reviewRequest) ? readString(reviewRequest.restoreStatusOnRejection) || "缺失" : "缺失",
            isRecord(reviewRequest) && readString(reviewRequest.restoreStatusOnRejection) === "排队中",
          ),
        );
      }
      setScenarioChecks(checks);

      return {
        ok: true,
        scenario: scenario?.label ?? scenarioId,
        project: selectedProject.projectName,
        seed,
        steps,
        checks,
        progress: state.progress,
        productGuideEvent: isRecord(workSubmissionResult) ? workSubmissionResult.productGuideEvent : null,
        reviewRequest: isRecord(workSubmissionResult) ? workSubmissionResult.reviewRequest : null,
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

  async function startStylesFor(project: ModelingContractTestProject, taskNo: number, startScope?: string) {
    return postJson("/api/modeling/style-start-events", {
      projectId: project.id,
      projectTaskId: taskNo === 7 ? project.task7.id : taskNo === 10 ? project.task10.id : undefined,
      taskNo,
      startScope: startScope ?? (taskNo === 7 ? "first-style" : taskNo === 10 ? "remaining-styles" : "side-task"),
      operatorName: currentUserName || "本地测试页",
    });
  }

  async function expectStartRejected(project: ModelingContractTestProject, taskNo: number, expectedMessage: string) {
    try {
      await startStylesFor(project, taskNo);
      return {
        message: "接口未拒绝",
        passed: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "接口已拒绝";

      return {
        message,
        passed: message.includes(expectedMessage),
      };
    }
  }

  async function confirmStylesFor(project: ModelingContractTestProject, action: "confirm" | "return", note?: string) {
    return postJson("/api/modeling/style-confirmations", {
      projectId: project.id,
      action,
      note,
      operatorName: currentUserName || "本地测试页",
    });
  }

  async function reviewStyle(
    project: ModelingContractTestProject,
    modelingTaskId: string,
    reviewResult: (typeof reviewActions)[number]["value"],
    content: string,
    attachments?: ReviewFeedbackAttachmentPayload,
  ) {
    return postJson("/api/modeling/review-results", {
      projectId: project.id,
      modelingTaskId,
      reviewResult,
      reviewAt: today(),
      reviewerName: currentUserName || "本地测试页",
      feedbackContent: content,
      ...(attachments ?? {}),
    });
  }

  async function expectReviewRejected(
    project: ModelingContractTestProject,
    modelingTaskId: string,
    reviewResult: (typeof reviewActions)[number]["value"],
    expectedMessage: string,
  ) {
    try {
      await reviewStyle(project, modelingTaskId, reviewResult, "");
      return {
        message: "接口未拒绝",
        passed: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "接口已拒绝";

      return {
        message,
        passed: message.includes(expectedMessage),
      };
    }
  }

  async function submitWork(project: ModelingContractTestProject, modelingTaskId: string, content: string, deliverableUrl: string) {
    return postJson(`/api/modeling/tasks/${modelingTaskId}/work-submissions`, {
      projectId: project.id,
      content,
      deliverableUrl,
    });
  }

  async function assignStyleForWork(modelingTaskId: string) {
    const modelerId = selectedModelerId || testModelers[0]?.id;

    if (!modelerId) {
      throw new Error("没有可用测试建模师，请先在用户数据里保留冷茂华或孟凡菲。");
    }

    return patchJson(`/api/modeling/tasks/${modelingTaskId}`, {
      modelerId,
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

    if (nextStyles.some((style) => style.modelingStatus === "退回补充")) {
      setStyleDraft((current) => ({
        ...current,
        styles: buildEditableStylesFromProjectStyles(nextStyles),
      }));
    }

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
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      setErrorMessage(message);
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

        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</div>
        ) : null}

        {activeTodo ? <ModelingTodoToast todo={activeTodo} onOpen={openTodo} /> : null}
        {hasReturnedStyles ? (
          <ReturnedStyleListNotice
            loading={submittingStyleList}
            onResubmit={submitStyles}
            styles={returnedStyles}
          />
        ) : null}

        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          本页会写入当前本地数据库。自动生成的数据都以 MT-TEST- 开头，可用清理按钮删除；正式业务数据不会被清理接口处理。场景按钮只推进当前项目已提交的款式清单，未提交款式清单时不会产生通过结果。
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

        {detailStyle ? (
          <StyleDetailOverlay
            clockNow={clockNow}
            feedbackContent={feedbackContent}
            loadingAction={loadingAction}
            onClose={() => setDetailStyleId("")}
            onFeedbackChange={setFeedbackContent}
            onModelerChange={setSelectedModelerId}
            onReview={submitReviewResult}
            onSelectStyle={(style) => {
              selectStyleForFeedback(style);
              setDetailStyleId(style.modelingTaskId);
            }}
            onSubmitWork={submitSelectedWork}
            onWorkTimer={submitSelectedWorkTimer}
            canViewTestFields={canViewTestFields}
            progress={progress}
            selectedModelerId={selectedModelerId}
            selectedStyle={detailStyle}
            styles={projectStyles}
            testModelers={testModelers}
          />
        ) : null}

        {confirmationListOpen && activeTodo ? (
          <SimulatorStyleListConfirmationOverlay
            feedbackContent={feedbackContent}
            loadingAction={loadingAction}
            onClose={() => setConfirmationListOpen(false)}
            onConfirm={confirmStyles}
            onFeedbackChange={setFeedbackContent}
            onReturn={returnStylesForSupplement}
            canViewTestFields={canViewTestFields}
            styles={projectStyles}
            todo={activeTodo}
          />
        ) : null}

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
              title="系列表单"
              action={
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={regenerateStyles}
                  type="button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  换一组系列
                </button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                <label className="block text-xs font-medium text-slate-500" htmlFor="style-seed">
                  系列批次
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
                </label>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">系列款式数</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">{hasReturnedStyles ? projectStyles.length : styles.length}</div>
                </div>
              </div>

              {hasReturnedStyles ? (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-900">
                  当前系列已被退回。重新提交会使用项目中的完整系列清单，共 {projectStyles.length} 款，不会只提交左侧草稿。
                </div>
              ) : null}

              <div className="mt-4 max-h-[560px] overflow-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-xs text-slate-500">
                    <tr>
                      <th className="w-20 px-3 py-2 font-medium">序号</th>
                      <th className="min-w-44 px-3 py-2 font-medium">款式名称</th>
                      {canViewTestFields ? <th className="min-w-44 px-3 py-2 font-medium">测试字段</th> : null}
                      <th className="w-32 px-3 py-2 font-medium">启动任务</th>
                      <th className="w-36 px-3 py-2 font-medium">难度</th>
                      <th className="w-28 px-3 py-2 font-medium">预计天数</th>
                      <th className="w-40 px-3 py-2 font-medium">原画过审日</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {styles.map((style, index) => (
                      <tr key={style.sourceStyleId}>
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                            onChange={(event) => updateStyle(index, { styleSequence: event.target.value })}
                            value={style.styleSequence}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                            onChange={(event) => updateStyle(index, { styleName: event.target.value })}
                            value={style.styleName}
                          />
                        </td>
                        {canViewTestFields ? (
                          <td className="px-3 py-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                              onChange={(event) => updateStyle(index, { styleCode: event.target.value })}
                              value={style.styleCode}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-slate-600">{style.isFirstModelingStyle ? "任务 7" : "任务 10"}</td>
                        <td className="px-3 py-2">
                          <select
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                            onChange={(event) => updateStyle(index, { difficulty: event.target.value })}
                            value={style.difficulty}
                          >
                            <option value="常规款">常规款</option>
                            <option value="简单款">简单款</option>
                            <option value="换色款">换色款</option>
                            <option value="困难正比例款">困难正比例款</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                            min={1}
                            onChange={(event) => updateStyle(index, { estimatedWorkdays: Number(event.target.value) || 1 })}
                            type="number"
                            value={String(style.estimatedWorkdays)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                            onChange={(event) => updateStyle(index, { originalArtApprovedDate: event.target.value })}
                            type="date"
                            value={style.originalArtApprovedDate}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(loadingAction) || !selectedProject}
                onClick={submitStyles}
                type="button"
              >
                <Send className={`h-4 w-4 ${submittingStyleList ? "animate-pulse" : ""}`} />
                {hasReturnedStyles ? "重新提交款式清单" : "提交款式清单"}
              </button>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="启动与产品反馈">
              <div className="grid gap-3 sm:grid-cols-2">
                <ActionButton disabled={!selectedProject || pendingConfirmationStyleCount === 0} loading={loadingAction === "确认款式清单"} onClick={confirmStyles}>
                  <CheckCircle2 className="h-4 w-4" />
                  确认款式清单
                </ActionButton>
                <ActionButton disabled={!selectedProject || pendingConfirmationStyleCount === 0} loading={loadingAction === "退回款式清单"} onClick={returnStylesForSupplement}>
                  <RotateCcw className="h-4 w-4" />
                  退回补充
                </ActionButton>
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

              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
                <label className="block text-xs font-medium text-slate-500">
                  反馈对象
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
                <LabeledTextarea label="反馈内容" onChange={setFeedbackContent} value={feedbackContent} />
              </div>

              {selectedStyle ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
                  <div>
                    当前选择：<span className="font-medium text-slate-900">{selectedStyle.styleName}</span>，状态 {selectedStyle.modelingStatus}
                  </div>
                  <div>{buildFeedbackHint(selectedStyle)}</div>
                  {selectedStyle.latestFeedbackSummary ? <div className="truncate">最新反馈：{selectedStyle.latestFeedbackSummary}</div> : null}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {reviewActions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <ActionButton
                      disabled={!canSubmitReviewAction(selectedStyle, action.value)}
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
                      <th className="w-[22%] px-3 py-2 font-medium">款式</th>
                      <th className="w-[12%] px-3 py-2 font-medium">来源</th>
                      <th className="w-[13%] px-3 py-2 font-medium">状态</th>
                      <th className="w-[11%] px-3 py-2 font-medium">任务</th>
                      <th className="w-[17%] px-3 py-2 font-medium">最新反馈</th>
                      <th className="w-[11%] px-3 py-2 font-medium">版权通过</th>
                      <th className="w-[14%] px-3 py-2 font-medium">操作</th>
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
                            <StyleTestFieldLine canViewTestFields={canViewTestFields} sourceStyleId={style.sourceStyleId} styleCode={style.styleCode} />
                          </td>
                          <td className="px-3 py-2 text-slate-600">{style.isFirstModelingStyle ? "第一款" : "其余款"}</td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{style.modelingStatus}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{style.taskNo ? `任务 ${style.taskNo}` : "-"}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            <div className="truncate">{style.latestFeedbackSummary || style.internalApprovedDate || "-"}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{style.copyrightApprovedDate || "-"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openStyleDetail(style);
                                }}
                                type="button"
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                                详情
                              </button>
                              <button
                                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canSelectForFeedback(style)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  selectStyleForFeedback(style);
                                }}
                                type="button"
                              >
                                反馈
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={7}>
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
                    <Metric label="必做款式" value={progress.requiredStyleCount} />
                    <Metric label="已通过" value={progress.approvedRequiredStyleCount} />
                    <Metric label="未启动" value={progress.unstartedStyles} />
                    <Metric label="未分配" value={progress.unassignedStyles} />
                    <Metric label="待送审" value={progress.waitingSubmissionStyles} />
                    <Metric label="送审中" value={progress.submittedStyles} />
                    <Metric label="建模中" value={progress.inProgressStyles} />
                    <Metric label="外包中" value={progress.outsourcedStyles} />
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    项目排期读取条件：{progress.canProjectScheduleTreatModelingDone ? "已满足" : "未满足"}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">暂无进度数据。</div>
              )}
            </Panel>

            <ProjectScheduleReadableInfoPanel canViewTestFields={canViewTestFields} progress={progress} />

            <ProductGuideReadableInfoPanel canViewTestFields={canViewTestFields} project={selectedProject} progress={progress} styles={projectStyles} />
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
      buildCheck("项目排期读取条件", "已满足", progress.canProjectScheduleTreatModelingDone ? "已满足" : "未满足", progress.canProjectScheduleTreatModelingDone),
    ];
  }

  if (scenarioId === "task7-only") {
    return [
      buildCheck("第一款状态", "未分配", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "未分配"),
      buildCheck("其余款状态", "未启动", remainingUnstarted ? "未启动" : remainingStyles.map((style) => style.modelingStatus).join("、"), remainingUnstarted),
      buildCheck("未启动数量", `${expectedTotal - 1} 款`, `${progress.unstartedStyles} 款`, progress.unstartedStyles === expectedTotal - 1),
      buildCheck("项目排期读取条件", "未满足", progress.canProjectScheduleTreatModelingDone ? "已满足" : "未满足", !progress.canProjectScheduleTreatModelingDone),
    ];
  }

  if (scenarioId === "internal-reject") {
    const latestFeedback = firstStyle?.latestFeedbackSummary ?? "";

    return [
      buildCheck("第一款状态", "排队中", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "排队中"),
      buildCheck("修改轮次", "大于 0", String(firstStyle?.reviewRound ?? 0), Number(firstStyle?.reviewRound ?? 0) > 0),
      buildCheck("驳回附件", "图片反馈 + PDF 反馈", latestFeedback || "无反馈", latestFeedback.includes("图片反馈") && latestFeedback.includes("PDF 反馈")),
      buildCheck("项目排期读取条件", "未满足", progress.canProjectScheduleTreatModelingDone ? "已满足" : "未满足", !progress.canProjectScheduleTreatModelingDone),
    ];
  }

  if (scenarioId === "work-submit") {
    return [
      buildCheck("第一款状态", "待验收", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "待验收"),
      buildCheck("待验收统计", "大于 0", `${progress.submittedStyles} 款`, progress.submittedStyles > 0),
      buildCheck("项目排期读取条件", "未满足", progress.canProjectScheduleTreatModelingDone ? "已满足" : "未满足", !progress.canProjectScheduleTreatModelingDone),
    ];
  }

  if (scenarioId === "copyright-reject") {
    const latestFeedback = firstStyle?.latestFeedbackSummary ?? "";

    return [
      buildCheck("第一款状态", "排队中", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "排队中"),
      buildCheck("最新反馈", "版权方反馈", latestFeedback || "无反馈", Boolean(latestFeedback)),
      buildCheck("版权附件", "PPT 反馈", latestFeedback || "无反馈", latestFeedback.includes("PPT 反馈")),
      buildCheck("项目排期读取条件", "未满足", progress.canProjectScheduleTreatModelingDone ? "已满足" : "未满足", !progress.canProjectScheduleTreatModelingDone),
    ];
  }

  return [
    buildCheck("第一款状态", "已通过", firstStyle?.modelingStatus ?? "缺失", firstStyle?.modelingStatus === "已通过"),
    buildCheck("已通过数量", "1 款", `${progress.approvedStyles} 款`, progress.approvedStyles === 1),
    buildCheck("项目进度", "小于 100%", `${progress.progressPercent}%`, progress.progressPercent > 0 && progress.progressPercent < 100),
    buildCheck("项目排期读取条件", "未满足", progress.canProjectScheduleTreatModelingDone ? "已满足" : "未满足", !progress.canProjectScheduleTreatModelingDone),
  ];
}

function buildCheck(label: string, expected: string, actual: string, passed: boolean): ScenarioCheck {
  return { label, expected, actual, passed };
}

function StyleDetailOverlay({
  clockNow,
  feedbackContent,
  loadingAction,
  onClose,
  onFeedbackChange,
  onModelerChange,
  onReview,
  onSelectStyle,
  onSubmitWork,
  onWorkTimer,
  canViewTestFields,
  progress,
  selectedModelerId,
  selectedStyle,
  styles,
  testModelers,
}: {
  clockNow: number | null;
  feedbackContent: string;
  loadingAction: string | null;
  onClose: () => void;
  onFeedbackChange: (value: string) => void;
  onModelerChange: (value: string) => void;
  onReview: (reviewResult: ReviewActionValue) => void | Promise<void>;
  onSelectStyle: (style: ProjectStyle) => void;
  onSubmitWork: () => void | Promise<void>;
  onWorkTimer: (action: "start") => void | Promise<void>;
  canViewTestFields: boolean;
  progress: ProjectProgress | null;
  selectedModelerId: string;
  selectedStyle: ProjectStyle;
  styles: ProjectStyle[];
  testModelers: ModelingContractTestModeler[];
}) {
  const workSummary = buildProjectStyleWorkTimeSummary(selectedStyle, clockNow);
  const isTimerActive = Boolean(selectedStyle.activeWorkStartedAt);
  const canStartTimer =
    !isTimerActive &&
    simulatorTimerStartStatuses.has(selectedStyle.modelingStatus) &&
    Boolean(selectedStyle.modelerId || selectedModelerId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-lg bg-slate-50 shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-5 w-5 text-slate-500" />
              <h2 className="truncate text-lg font-semibold text-slate-950">{selectedStyle.styleName}</h2>
              <StatusBadge status={selectedStyle.modelingStatus} />
            </div>
            <StyleTestFieldLine canViewTestFields={canViewTestFields} sourceStyleId={selectedStyle.sourceStyleId} styleCode={selectedStyle.styleCode} />
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            onClick={onClose}
            title="关闭详情"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 min-w-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-auto border-b border-slate-200 bg-white p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3 text-sm font-semibold text-slate-900">款式看板</div>
            <div className="space-y-2">
              {styles.map((style) => (
                <button
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    style.modelingTaskId === selectedStyle.modelingTaskId
                      ? "border-sky-200 bg-sky-50 text-sky-950"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  key={style.modelingTaskId}
                  onClick={() => onSelectStyle(style)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{style.styleName}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{style.isFirstModelingStyle ? "任务 7" : "任务 10"}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <StyleTestFieldLine canViewTestFields={canViewTestFields} sourceStyleId={style.sourceStyleId} styleCode={style.styleCode} />
                    <span className="shrink-0 text-slate-600">{style.modelingStatus}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4">
            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-4">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">款式详情</div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <StyleInfoItem label="来源" value={selectedStyle.isFirstModelingStyle ? "第一款" : "其余款"} />
                    <StyleInfoItem label="任务" value={selectedStyle.taskNo ? `任务 ${selectedStyle.taskNo}` : "-"} />
                    <StyleInfoItem label="难度" value={selectedStyle.difficulty || "-"} />
                    <StyleInfoItem label="预计天数" value={selectedStyle.estimatedWorkdays ? `${selectedStyle.estimatedWorkdays} 天` : "-"} />
                    <StyleInfoItem label="建模师" value={selectedStyle.modelerName || "-"} />
                    <StyleInfoItem label="外包" value={selectedStyle.isOutsourced ? selectedStyle.outsourceVendorName || "已外包" : "否"} />
                    <StyleInfoItem label="累计工时" value={formatWorkTimeSummary(workSummary)} />
                    <StyleInfoItem label="内部通过" value={selectedStyle.internalApprovedDate || "-"} />
                    <StyleInfoItem label="版权通过" value={selectedStyle.copyrightApprovedDate || "-"} />
                    <StyleInfoItem label="修改轮次" value={String(selectedStyle.reviewRound ?? 0)} />
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">当前处理</div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">{buildFeedbackHint(selectedStyle)}</div>
                  {selectedStyle.latestFeedbackSummary ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                      最新反馈：{selectedStyle.latestFeedbackSummary}
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-blue-950">建模计时</div>
                      <div className="text-sm font-medium text-blue-900">累计 {formatWorkTimeSummary(workSummary)}</div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <select
                        className="h-10 rounded-md border border-blue-100 bg-white px-3 text-sm outline-none focus:border-blue-300"
                        disabled={Boolean(selectedStyle.modelerId) || testModelers.length === 0}
                        onChange={(event) => onModelerChange(event.target.value)}
                        value={selectedStyle.modelerId || selectedModelerId}
                      >
                        {testModelers.length > 0 ? (
                          testModelers.map((modeler) => (
                            <option key={modeler.id} value={modeler.id}>
                              {modeler.name}
                            </option>
                          ))
                        ) : (
                          <option value="">暂无测试建模师</option>
                        )}
                      </select>
                      <ActionButton disabled={!canStartTimer} loading={loadingAction === "开始计时"} onClick={() => onWorkTimer("start")}>
                        <Play className="h-4 w-4" />
                        开始计时
                      </ActionButton>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-blue-900">
                      {isTimerActive
                        ? `当前款式正在计时，本次已运行 ${formatApproxWorkMinutes(workSummary.activeMinutes)}。页面每 5 分钟自动刷新一次。`
                        : "测试页会使用冷茂华或孟凡菲作为模拟建模师；开始另一款或提交成果时，会自动结束同一建模师当前计时。"}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ActionButton disabled={!canSubmitWorkFromSimulator(selectedStyle)} loading={loadingAction === "提交成果"} onClick={onSubmitWork}>
                      <Send className="h-4 w-4" />
                      提交成果
                    </ActionButton>
                    {reviewActions.map((action) => {
                      const Icon = action.icon;

                      return (
                        <ActionButton
                          disabled={!canSubmitReviewAction(selectedStyle, action.value)}
                          key={action.value}
                          loading={loadingAction === action.value}
                          onClick={() => onReview(action.value)}
                        >
                          <Icon className="h-4 w-4" />
                          {action.label}
                        </ActionButton>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <LabeledTextarea label="反馈内容" onChange={onFeedbackChange} value={feedbackContent} />
                </section>
              </div>

              <aside className="space-y-4">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">项目进度</div>
                  {progress ? (
                    <div className="space-y-3">
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-slate-600">完成进度</span>
                          <span className="font-medium text-slate-900">{progress.progressPercent}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress.progressPercent}%` }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <MiniProgress label="必做" value={progress.totalRequiredStyles} />
                        <MiniProgress label="已通过" value={progress.approvedStyles} />
                        <MiniProgress label="待验收/送审" value={progress.submittedStyles} />
                        <MiniProgress label="未分配" value={progress.unassignedStyles} />
                        <MiniProgress label="进行中" value={progress.inProgressStyles} />
                        <MiniProgress label="未启动" value={progress.unstartedStyles} />
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        项目排期读取条件：{progress.canProjectScheduleTreatModelingDone ? "已满足" : "未满足"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">暂无进度数据。</div>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">状态流转</div>
                  <div className="space-y-2 text-sm text-slate-600">
                    {["待确认", "退回补充", "未启动", "未分配", "排队中", "建模中", "待验收", "待送审", "已通过"].map((status) => (
                      <div className="flex items-center gap-2" key={status}>
                        <span className={`h-2.5 w-2.5 rounded-full ${selectedStyle.modelingStatus === status ? "bg-sky-500" : "bg-slate-200"}`} />
                        <span className={selectedStyle.modelingStatus === status ? "font-medium text-slate-900" : ""}>{status}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{status}</span>;
}

function StyleTestFieldLine({
  canViewTestFields,
  className = "mt-1 block truncate text-xs text-slate-500",
  sourceStyleId,
  styleCode,
}: {
  canViewTestFields: boolean;
  className?: string;
  sourceStyleId?: string | null;
  styleCode?: string | null;
}) {
  const value = [styleCode, sourceStyleId].find((fieldValue) => canDisplayModelingFieldValue(fieldValue, canViewTestFields));

  if (!value) {
    return null;
  }

  const label = isModelingTestFieldValue(value) ? "测试字段" : "款式编号";

  return (
    <span className={className}>
      {label}：{value}
    </span>
  );
}

function ModelingTodoToast({
  todo,
  onOpen,
}: {
  todo: ModelingTodoItem;
  onOpen: (todo: ModelingTodoItem) => void;
}) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <BellRing className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-950">任务待办：{todo.title}</div>
            <div className="mt-1 text-sm leading-6 text-amber-900">{todo.helper}</div>
          </div>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          onClick={() => onOpen(todo)}
          type="button"
        >
          <ClipboardList className="h-4 w-4" />
          打开清单
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs">{todo.styleCount} 款</span>
        </button>
      </div>
    </section>
  );
}

function ReturnedStyleListNotice({
  loading,
  onResubmit,
  styles,
}: {
  loading: boolean;
  onResubmit: () => void;
  styles: ProjectStyle[];
}) {
  const sortedStyles = [...styles].sort(compareProjectStyles);
  const styleNames = sortedStyles.map((style) => style.styleName).join("、");
  const latestFeedback = sortedStyles.find((style) => style.latestFeedbackSummary)?.latestFeedbackSummary;

  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-rose-950">款式清单已退回补充</div>
            <StatusBadge status={`${styles.length} 款`} />
          </div>
          <div className="mt-1 text-sm leading-6 text-rose-900">
            {styleNames} 需要产品侧补充后重新提交。重新提交后，建模侧会再次收到“款式清单待确认”。
          </div>
          {latestFeedback ? <div className="mt-1 truncate text-sm text-rose-800">退回原因：{latestFeedback}</div> : null}
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={loading}
          onClick={onResubmit}
          type="button"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          重新提交清单
        </button>
      </div>
    </section>
  );
}

function SimulatorStyleListConfirmationOverlay({
  feedbackContent,
  loadingAction,
  onClose,
  onConfirm,
  onFeedbackChange,
  onReturn,
  canViewTestFields,
  styles,
  todo,
}: {
  feedbackContent: string;
  loadingAction: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onFeedbackChange: (value: string) => void;
  onReturn: () => void;
  canViewTestFields: boolean;
  styles: ProjectStyle[];
  todo: ModelingTodoItem;
}) {
  const pendingStyles = styles.filter((style) => style.modelingStatus === "待确认");
  const sortedStyles = [...styles].sort(compareProjectStyles);
  const loadingConfirm = loadingAction === "确认款式清单";
  const loadingReturn = loadingAction === "退回款式清单";
  const canConfirm = pendingStyles.length > 0 && !loadingAction;
  const canReturn = canConfirm && feedbackContent.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-lg bg-slate-50 shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              <h2 className="truncate text-lg font-semibold text-slate-950">款式清单待确认</h2>
              <StatusBadge status={`${pendingStyles.length || todo.styleCount} 款待确认`} />
            </div>
            <div className="mt-1 truncate text-sm text-slate-500">{todo.projectName}</div>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            onClick={onClose}
            title="关闭清单"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">本次提交款式</div>
                  <div className="mt-1 text-xs text-slate-500">同一项目的提交清单统一在这里确认，不再逐款打开。</div>
                </div>
                <StatusBadge status={`${sortedStyles.length} 款`} />
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">序号</th>
                      <th className="px-3 py-2 font-medium">款式</th>
                      <th className="px-3 py-2 font-medium">启动任务</th>
                      <th className="px-3 py-2 font-medium">难度</th>
                      <th className="px-3 py-2 font-medium">预计天数</th>
                      <th className="px-3 py-2 font-medium">建模状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sortedStyles.length > 0 ? (
                      sortedStyles.map((style) => (
                        <tr key={style.modelingTaskId} className={style.modelingStatus === "待确认" ? "bg-amber-50/45" : ""}>
                          <td className="px-3 py-3 text-slate-600">{style.styleSequence || "-"}</td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-slate-900">{style.styleName}</div>
                            <StyleTestFieldLine canViewTestFields={canViewTestFields} sourceStyleId={style.sourceStyleId} styleCode={style.styleCode} />
                          </td>
                          <td className="px-3 py-3 text-slate-600">{style.isFirstModelingStyle ? "任务 7 · 第一款" : "任务 10 · 其余款"}</td>
                          <td className="px-3 py-3 text-slate-600">{style.difficulty || "-"}</td>
                          <td className="px-3 py-3 text-slate-600">{style.estimatedWorkdays ?? "-"} 天</td>
                          <td className="px-3 py-3">
                            <StatusBadge status={style.modelingStatus} />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-10 text-center text-sm text-slate-400" colSpan={6}>
                          当前项目还没有提交款式清单。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-950">整批确认</div>
                <div className="mt-2 text-sm leading-6 text-amber-900">
                  确认后，本项目待确认款式统一进入“未启动”。退回补充需要填写原因，产品组据此补齐款式信息。
                </div>
                <div className="mt-4 grid gap-2">
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={!canConfirm}
                    onClick={onConfirm}
                    type="button"
                  >
                    {loadingConfirm ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    确认整批清单
                  </button>
                  <textarea
                    className="min-h-24 w-full resize-none rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    onChange={(event) => onFeedbackChange(event.target.value)}
                    placeholder="退回补充时必须填写原因。"
                    value={feedbackContent}
                  />
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={!canReturn}
                    onClick={onReturn}
                    type="button"
                  >
                    {loadingReturn ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                    退回补充
                  </button>
                </div>
              </section>
            </aside>
          </div>
        </main>
      </section>
    </div>
  );
}

function StyleInfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 min-w-0 truncate text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function MiniProgress({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ProjectScheduleReadableInfoPanel({ canViewTestFields, progress }: { canViewTestFields: boolean; progress: ProjectProgress | null }) {
  const sourceTaskText = progress?.sourceTaskNos?.length ? `任务 ${progress.sourceTaskNos.join(" / ")}` : "任务 7 / 10";

  return (
    <Panel title="项目排期读取模拟">
      {progress ? (
        <div className="space-y-3">
          <div
            className={`rounded-md border px-3 py-2 text-sm leading-6 ${
              progress.canProjectScheduleTreatModelingDone
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="font-semibold">
              {progress.canProjectScheduleTreatModelingDone
                ? `${sourceTaskText} 必做款式已全部通过`
                : `${sourceTaskText} 必做款式尚未全部通过`}
            </div>
            <div>
              {progress.canProjectScheduleTreatModelingDone
                ? "项目排期主动读取时，可以把建模事实视为完成。"
                : "项目排期主动读取时，不能把建模事实视为完成。"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="必做通过" value={`${progress.approvedRequiredStyleCount}/${progress.requiredStyleCount}`} />
            <Metric label="最后通过日期" value={progress.lastRequiredStyleApprovedDate ?? "未满足"} />
            <Metric label="未通过必做" value={progress.unapprovedRequiredStyles.length} />
            <Metric label="送审/待验收" value={progress.submittedOrWaitingStyles.length} />
          </div>
          {progress.unapprovedRequiredStyles.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="mb-2 font-semibold text-slate-800">未完成必做款式</div>
              <div className="space-y-1 text-slate-600">
                {progress.unapprovedRequiredStyles.slice(0, 6).map((style) => (
                  <div key={style.modelingTaskId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{style.styleName}</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{style.modelingStatus}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {canViewTestFields ? (
            <pre className="max-h-[280px] overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
              {JSON.stringify(
                {
                  sourceTaskNos: progress.sourceTaskNos,
                  allRequiredStylesApproved: progress.allRequiredStylesApproved,
                  canProjectScheduleTreatModelingDone: progress.canProjectScheduleTreatModelingDone,
                  requiredStyleCount: progress.requiredStyleCount,
                  approvedRequiredStyleCount: progress.approvedRequiredStyleCount,
                  lastRequiredStyleApprovedDate: progress.lastRequiredStyleApprovedDate,
                  unapprovedRequiredStyles: progress.unapprovedRequiredStyles,
                  blockingStyles: progress.blockingStyles,
                  submittedOrWaitingStyles: progress.submittedOrWaitingStyles,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
          暂无建模进度，项目排期读取时不会得到建模完成事实。
        </div>
      )}
    </Panel>
  );
}

function ProductGuideReadableInfoPanel({
  canViewTestFields,
  project,
  progress,
  styles,
}: {
  canViewTestFields: boolean;
  project?: ModelingContractTestProject;
  progress: ProjectProgress | null;
  styles: ProjectStyle[];
}) {
  const readableInfo = project && progress ? buildProductGuideReadableInfo(project, styles, progress, canViewTestFields) : null;

  return (
    <Panel title="产品组可读信息">
      {readableInfo ? (
        <div className="space-y-3">
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-900">
            <div className="font-semibold">这里展示的是产品组可读取信息，不是主动输出事件。</div>
            <div>全部通过只作为可读进度和完成条件，不再生成发给产品组的主动事件。</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="项目进度" value={`${readableInfo.progressPercent}%`} />
            <Metric label="通过款式" value={`${readableInfo.approvedStyles}/${readableInfo.totalRequiredStyles}`} />
            <Metric label="是否全部通过" value={readableInfo.canProjectScheduleTreatModelingDone ? "是" : "否"} />
            <Metric label="待验收/送审" value={readableInfo.submittedStyles} />
          </div>
          {canViewTestFields ? (
            <pre className="max-h-[360px] overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
              {JSON.stringify(readableInfo, null, 2)}
            </pre>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
              可读原始数据包含测试字段，仅管理员可见。
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
          <div>暂无项目进度。产品组可通过读取接口查看款式状态和进度。</div>
        </div>
      )}
    </Panel>
  );
}

function buildProductGuideReadableInfo(project: ModelingContractTestProject, styles: ProjectStyle[], progress: ProjectProgress, canViewTestFields: boolean) {
  const requiredStyles = styles.filter((style) => style.isRequired);
  const approvedStyles = requiredStyles.filter((style) => style.modelingStatus === "已通过");

  return {
    projectId: project.id,
    projectName: project.projectName,
    progressPercent: progress.progressPercent,
    totalRequiredStyles: progress.totalRequiredStyles,
    approvedStyles: progress.approvedStyles,
    submittedStyles: progress.submittedStyles,
    waitingSubmissionStyles: progress.waitingSubmissionStyles,
    unstartedStyles: progress.unstartedStyles,
    unassignedStyles: progress.unassignedStyles,
    canProjectScheduleTreatModelingDone: progress.canProjectScheduleTreatModelingDone,
    projectedAllApprovedDate: progress.projectedAllApprovedDate,
    styles: requiredStyles.map((style) => ({
      modelingTaskId: style.modelingTaskId,
      sourceStyleId: canDisplayModelingFieldValue(style.sourceStyleId, canViewTestFields) ? style.sourceStyleId : null,
      styleCode: canDisplayModelingFieldValue(style.styleCode, canViewTestFields) ? style.styleCode : null,
      styleSequence: style.styleSequence,
      styleName: style.styleName,
      modelingStatus: style.modelingStatus,
      latestFeedbackSummary: style.latestFeedbackSummary,
      reviewRound: style.reviewRound ?? 0,
      copyrightApprovedDate: style.copyrightApprovedDate,
    })),
    approvedStyleIds: approvedStyles.map((style) => style.modelingTaskId),
  };
}

function compareProjectStyles(left: ProjectStyle, right: ProjectStyle) {
  const leftSequence = Number.parseInt(left.styleSequence ?? "", 10);
  const rightSequence = Number.parseInt(right.styleSequence ?? "", 10);

  if (Number.isFinite(leftSequence) && Number.isFinite(rightSequence) && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  return (left.styleSequence ?? "").localeCompare(right.styleSequence ?? "", "zh-Hans-CN", { numeric: true }) || left.styleName.localeCompare(right.styleName, "zh-Hans-CN");
}

function canSubmitWorkFromSimulator(style: ProjectStyle) {
  return simulatorWorkSubmittableStatuses.has(style.modelingStatus);
}

function canSelectForFeedback(style: ProjectStyle) {
  return style.modelingStatus === "待验收" || copyrightFeedbackStatuses.has(style.modelingStatus);
}

function canSubmitReviewAction(style: ProjectStyle | undefined, reviewResult: ReviewActionValue) {
  if (!style) return false;

  if (internalReviewResults.has(reviewResult)) {
    return style.modelingStatus === "待验收";
  }

  if (copyrightReviewResults.has(reviewResult)) {
    return copyrightFeedbackStatuses.has(style.modelingStatus);
  }

  return false;
}

function buildFeedbackDraft(style: ProjectStyle) {
  if (style.modelingStatus === "待验收") {
    return `${style.styleName} 内部检修反馈：`;
  }

  if (copyrightFeedbackStatuses.has(style.modelingStatus)) {
    return `${style.styleName} 版权方反馈：`;
  }

  return `${style.styleName} 反馈：`;
}

function buildDefaultReviewContent(style: ProjectStyle, reviewResult: ReviewActionValue) {
  if (reviewResult === "内部通过可送审") {
    return `${style.styleName} 内部检修通过，可以送审。`;
  }

  if (reviewResult === "内部不通过") {
    return `${style.styleName} 内部检修不通过，需要建模师修改。`;
  }

  if (reviewResult === "送审通过") {
    return `${style.styleName} 版权方送审通过。`;
  }

  return `${style.styleName} 版权方送审不通过，需要修改。`;
}

function buildReviewActionDisabledReason(style: ProjectStyle, reviewResult: ReviewActionValue) {
  if (internalReviewResults.has(reviewResult)) {
    return `只有“待验收”的款式可以提交内部反馈。当前状态是 ${style.modelingStatus}。`;
  }

  return `只有“待送审 / 已送审 / 等反馈”的款式可以提交版权反馈。当前状态是 ${style.modelingStatus}。`;
}

function buildFeedbackHint(style: ProjectStyle) {
  if (style.modelingStatus === "待验收") {
    return "这款已经提交成果，可以填写产品美术反馈，并选择内部通过或内部不通过。";
  }

  if (copyrightFeedbackStatuses.has(style.modelingStatus)) {
    return "这款处在送审阶段，可以记录版权通过或版权驳回。";
  }

  if (style.modelingStatus === "排队中") {
    return "这款已经退回排队，需等建模师重新提交成果后再反馈。";
  }

  if (style.modelingStatus === "修改中") {
    return "这款正在修改，需等建模师重新提交成果后再反馈。";
  }

  return "这款还没有进入可反馈状态。";
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

function LabeledTextarea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block text-xs font-medium text-slate-500">
      {label}
      <textarea
        className="mt-1 min-h-[96px] w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-2 text-sm leading-5 text-slate-900 outline-none focus:border-slate-500"
        onChange={(event) => onChange(event.target.value)}
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
      className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium leading-5 text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled || loading}
      onClick={onClick}
      type="button"
    >
      {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 min-w-0 truncate text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function buildProjectStyleWorkTimeSummary(style: ProjectStyle, now: number | null) {
  const persistedMinutes = Math.max(0, Math.floor(style.actualWorkMinutes || 0));
  const activeSeconds = activeWorkSeconds(style.activeWorkStartedAt, now);
  const activeMinutes = Math.floor(activeSeconds / 60);

  return {
    activeMinutes,
    totalMinutes: persistedMinutes + activeMinutes,
    isActive: Boolean(style.activeWorkStartedAt),
  };
}

function activeWorkSeconds(startedAt: string | null | undefined, now: number | null) {
  if (!startedAt || now === null) {
    return 0;
  }

  const startedAtMs = new Date(startedAt).getTime();

  if (!Number.isFinite(startedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((now - startedAtMs) / 1000));
}

function formatWorkTimeSummary(summary: { totalMinutes: number; activeMinutes: number; isActive: boolean }) {
  const base = formatWorkMinutes(summary.totalMinutes);

  if (!summary.isActive) {
    return base;
  }

  return `${base}（本次 ${formatApproxWorkMinutes(summary.activeMinutes)}）`;
}

function formatWorkMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.floor(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  if (hours <= 0) {
    return `${safeMinutes} 分钟`;
  }

  return `${safeMinutes} 分钟（${hours} 小时 ${restMinutes} 分）`;
}

function formatApproxWorkMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.floor(minutes || 0));

  if (safeMinutes <= 0) {
    return "不足 1 分钟";
  }

  return `约 ${safeMinutes} 分钟`;
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

function buildEditableStylesFromProjectStyles(styles: ProjectStyle[]): EditableStyle[] {
  return [...styles].sort(compareProjectStyles).map((style, index) => ({
    sourceStyleId: style.sourceStyleId || style.styleCode || `resubmit-${style.modelingTaskId}`,
    styleCode: style.styleCode || `RESUBMIT-${style.modelingTaskId.slice(0, 8)}`,
    styleSequence: style.styleSequence || String(index + 1),
    styleName: style.styleName,
    isFirstModelingStyle: style.isFirstModelingStyle,
    difficulty: style.difficulty || "常规款",
    estimatedWorkdays: Number(style.estimatedWorkdays) || 7,
    originalArtApprovedDate: today(),
    referenceImageUrl: "",
    notes: "模拟器重新提交：保留原项目款式清单",
  }));
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
