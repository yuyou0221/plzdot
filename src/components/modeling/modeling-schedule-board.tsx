"use client";

import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BellRing,
  Boxes,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileSpreadsheet,
  GripVertical,
  ListChecks,
  Loader2,
  Maximize2,
  PackageCheck,
  Save,
  Search,
  Send,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AccountPanel } from "@/components/auth/account-panel";
import { canAccessUserData, type AuthUser } from "@/lib/auth/permissions";
import { canDisplayModelingFieldValue, isModelingTestFieldValue } from "@/lib/modeling-test-fields";
import type {
  ModelerCapacity,
  ModelingMilestoneCard,
  ModelingMilestoneOverview,
  ModelingMilestoneRiskLevel,
  ModelingMetric,
  ModelingTodoItem,
  ProjectModelingSummary,
  ModelingScheduleData,
  ModelingTaskCard,
  ModelingTaskStatus,
  ModelingTaskUpdateRequest,
  ModelingTaskUpdateResponse,
  ModelingWorkSubmissionRequest,
  OutsourceVendorOption,
} from "@/lib/modeling-schedule-types";

type CapacityRow = ModelerCapacity & {
  queueTasks: ModelingTaskCard[];
  weekTasks: ModelingTaskCard[];
  staleTasks: ModelingTaskCard[];
  isOverloaded: boolean;
};
type ModelingView = "milestones" | "style-board" | "profile";
type StyleBoardMode = "active" | "approved";

const activeQueueStatuses = new Set<ModelingTaskStatus>(["已排期", "排队中", "建模中", "修改中", "待验收", "已送审", "等反馈", "外包中", "暂停"]);
const reviewBlockedStatuses = new Set<ModelingTaskStatus>(["待验收", "已送审", "等反馈"]);
const statusOptions: ModelingTaskStatus[] = ["待确认", "退回补充", "未启动", "未分配", "已排期", "排队中", "建模中", "修改中", "待验收", "待送审", "已送审", "等反馈", "已通过", "外包中", "暂停", "取消"];
const productReviewManagedStatuses = new Set<ModelingTaskStatus>(["待验收", "待送审", "已送审", "等反馈", "已通过"]);
const preConfirmationStatuses = new Set<ModelingTaskStatus>(["待确认", "退回补充"]);
const workTimerRefreshMs = 5 * 60 * 1000;

const statusMeta: Record<
  ModelingTaskStatus,
  {
    title: string;
    dotClass: string;
    cardClass: string;
    columnClass: string;
  }
> = {
  待确认: {
    title: "待确认",
    dotClass: "bg-amber-500",
    cardClass: "border-amber-200 bg-amber-50",
    columnClass: "border-amber-200 bg-amber-50/70",
  },
  退回补充: {
    title: "退回补充",
    dotClass: "bg-rose-500",
    cardClass: "border-rose-200 bg-rose-50",
    columnClass: "border-rose-200 bg-rose-50/70",
  },
  未启动: {
    title: "未启动",
    dotClass: "bg-stone-400",
    cardClass: "border-stone-200 bg-stone-50",
    columnClass: "border-stone-200 bg-stone-50/70",
  },
  未分配: {
    title: "未分配",
    dotClass: "bg-slate-400",
    cardClass: "border-slate-200 bg-white",
    columnClass: "border-slate-200 bg-slate-50",
  },
  已排期: {
    title: "已排期",
    dotClass: "bg-sky-500",
    cardClass: "border-sky-200 bg-sky-50",
    columnClass: "border-sky-200 bg-sky-50/70",
  },
  排队中: {
    title: "排队中",
    dotClass: "bg-teal-500",
    cardClass: "border-teal-200 bg-teal-50",
    columnClass: "border-teal-200 bg-teal-50/70",
  },
  建模中: {
    title: "建模中",
    dotClass: "bg-blue-600",
    cardClass: "border-blue-200 bg-white",
    columnClass: "border-blue-200 bg-blue-50/60",
  },
  修改中: {
    title: "修改中",
    dotClass: "bg-orange-500",
    cardClass: "border-orange-200 bg-orange-50",
    columnClass: "border-orange-200 bg-orange-50/70",
  },
  待验收: {
    title: "待验收",
    dotClass: "bg-fuchsia-500",
    cardClass: "border-fuchsia-200 bg-fuchsia-50",
    columnClass: "border-fuchsia-200 bg-fuchsia-50/70",
  },
  待送审: {
    title: "待送审",
    dotClass: "bg-indigo-500",
    cardClass: "border-indigo-200 bg-indigo-50",
    columnClass: "border-indigo-200 bg-indigo-50/70",
  },
  已送审: {
    title: "已送审",
    dotClass: "bg-violet-500",
    cardClass: "border-violet-200 bg-violet-50",
    columnClass: "border-violet-200 bg-violet-50/70",
  },
  等反馈: {
    title: "等反馈",
    dotClass: "bg-amber-500",
    cardClass: "border-amber-300 bg-amber-50",
    columnClass: "border-amber-200 bg-amber-50/80",
  },
  已通过: {
    title: "已通过",
    dotClass: "bg-emerald-500",
    cardClass: "border-emerald-200 bg-emerald-50",
    columnClass: "border-emerald-200 bg-emerald-50/80",
  },
  外包中: {
    title: "外包中",
    dotClass: "bg-cyan-600",
    cardClass: "border-cyan-200 bg-cyan-50",
    columnClass: "border-cyan-200 bg-cyan-50/70",
  },
  暂停: {
    title: "暂停",
    dotClass: "bg-zinc-500",
    cardClass: "border-zinc-200 bg-zinc-50",
    columnClass: "border-zinc-200 bg-zinc-50",
  },
  取消: {
    title: "取消",
    dotClass: "bg-rose-500",
    cardClass: "border-rose-200 bg-rose-50",
    columnClass: "border-rose-200 bg-rose-50/70",
  },
};

const metricToneClass: Record<ModelingMetric["tone"], string> = {
  neutral: "border-slate-200 bg-white",
  warning: "border-amber-200 bg-amber-50/70",
  danger: "border-rose-200 bg-rose-50/75",
  info: "border-sky-200 bg-sky-50/75",
};
const milestoneRiskClass: Record<ModelingMilestoneRiskLevel, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-800",
  normal: "border-slate-200 bg-white text-slate-700",
  risk: "border-amber-200 bg-amber-50 text-amber-800",
  delay: "border-rose-200 bg-rose-50 text-rose-700",
};
const milestoneRiskLabel: Record<ModelingMilestoneRiskLevel, string> = {
  done: "已完成",
  normal: "正常",
  risk: "有风险",
  delay: "必然延期",
};

export function ModelingScheduleBoard({ currentUser, data }: { currentUser: AuthUser; data: ModelingScheduleData }) {
  const router = useRouter();
  const canOpenUserData = canAccessUserData(currentUser);
  const [view, setView] = useState<ModelingView>("milestones");
  const [styleBoardMode, setStyleBoardMode] = useState<StyleBoardMode>("active");
  const [profileModelerId, setProfileModelerId] = useState(
    data.modelers.find((modeler) => data.tasks.some((task) => task.modelerId === modeler.id && task.status !== "已通过"))?.id ??
      data.modelers[0]?.id ??
      "",
  );
  const [search, setSearch] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(data.tasks.find((task) => task.status !== "已通过")?.id ?? "");
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string>>({});
  const [savedTasksById, setSavedTasksById] = useState<Record<string, ModelingTaskCard>>({});
  const [savedProjectSummariesById, setSavedProjectSummariesById] = useState<Record<string, ProjectModelingSummary>>({});
  const [operationMessage, setOperationMessage] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState("");
  const [confirmationProjectId, setConfirmationProjectId] = useState("");
  const [clockNow, setClockNow] = useState<number | null>(null);
  const canViewTestFields = currentUser.authRole === "admin";

  useEffect(() => {
    const syncClock = () => setClockNow(Date.now());
    const startupTimerId = window.setTimeout(syncClock, 0);
    const timerId = window.setInterval(syncClock, workTimerRefreshMs);

    return () => {
      window.clearTimeout(startupTimerId);
      window.clearInterval(timerId);
    };
  }, []);

  const modelerById = useMemo(() => new Map(data.modelers.map((modeler) => [modeler.id, modeler])), [data.modelers]);
  const visibleSearch = search.trim();
  const allTasks = useMemo(() => {
    return data.tasks.map((task) => {
      const savedTask = savedTasksById[task.id];

      if (savedTask) {
        return savedTask;
      }

      const draftModelerId = draftAssignments[task.id];
      const draftModeler = draftModelerId ? modelerById.get(draftModelerId) : undefined;

      if (!draftModeler) {
        return task;
      }

      return {
        ...task,
        status: "已排期" as ModelingTaskStatus,
        modelerId: draftModeler.id,
        modelerName: draftModeler.name,
        isOutsourced: false,
        outsourceVendorId: undefined,
        outsourceVendorName: undefined,
        canDragAssign: false,
      };
    });
  }, [data.tasks, draftAssignments, modelerById, savedTasksById]);
  const tasks = useMemo(() => allTasks.filter((task) => task.status !== "已通过"), [allTasks]);
  const approvedTasks = useMemo(() => allTasks.filter((task) => task.status === "已通过"), [allTasks]);
  const projectSummaries = useMemo(() => {
    const baseIds = new Set(data.projectSummaries.map((project) => project.projectId));

    return [
      ...data.projectSummaries.map((project) => savedProjectSummariesById[project.projectId] ?? project),
      ...Object.values(savedProjectSummariesById).filter((project) => !baseIds.has(project.projectId)),
    ];
  }, [data.projectSummaries, savedProjectSummariesById]);
  const filteredTasks = useMemo(() => {
    if (!visibleSearch) {
      return tasks;
    }

    return tasks.filter((task) => {
      return [task.projectName, task.styleName, task.status, task.modelerName, task.outsourceVendorName]
        .filter(Boolean)
        .some((value) => value?.includes(visibleSearch));
    });
  }, [tasks, visibleSearch]);
  const filteredApprovedTasks = useMemo(() => {
    if (!visibleSearch) {
      return approvedTasks;
    }

    return approvedTasks.filter((task) => {
      return [task.projectName, task.styleName, task.status, task.modelerName, task.outsourceVendorName]
        .filter(Boolean)
        .some((value) => value?.includes(visibleSearch));
    });
  }, [approvedTasks, visibleSearch]);
  const isApprovedStyleView = view === "style-board" && styleBoardMode === "approved";
  const metrics = useMemo(
    () => (isApprovedStyleView ? buildApprovedMetrics(approvedTasks) : buildLiveMetrics(tasks, data.modelers)),
    [approvedTasks, data.modelers, isApprovedStyleView, tasks],
  );
  const selectedTaskPool = isApprovedStyleView ? approvedTasks : tasks;
  const selectedTask = selectedTaskPool.find((task) => task.id === selectedTaskId) ?? selectedTaskPool[0];
  const activeTodos = data.todos;
  const detailTask = detailTaskId ? allTasks.find((task) => task.id === detailTaskId) : undefined;
  const detailProjectTasks = detailTask ? allTasks.filter((task) => task.projectId === detailTask.projectId) : [];
  const detailProjectSummary = detailTask ? projectSummaries.find((project) => project.projectId === detailTask.projectId) : undefined;
  const confirmationProjectTasks = confirmationProjectId ? allTasks.filter((task) => task.projectId === confirmationProjectId) : [];
  const confirmationTodo = confirmationProjectId ? activeTodos.find((todo) => todo.projectId === confirmationProjectId) : undefined;
  const styleCapacityRows = useMemo(
    () => buildCapacityRows(data.modelers, styleBoardMode === "approved" ? approvedTasks : tasks),
    [approvedTasks, data.modelers, styleBoardMode, tasks],
  );
  const filteredStyleTasks = styleBoardMode === "approved" ? filteredApprovedTasks : filteredTasks;
  const filteredProjectSummaries = useMemo(() => {
    return projectSummaries.filter((project) => !visibleSearch || project.projectName.includes(visibleSearch));
  }, [projectSummaries, visibleSearch]);
  const filteredMilestoneOverview = useMemo(() => {
    return filterMilestoneOverview(data.milestoneOverview, visibleSearch);
  }, [data.milestoneOverview, visibleSearch]);
  const draftCount = Object.keys(draftAssignments).length;

  function handleDragStart(event: ReactDragEvent<HTMLElement>, task: ModelingTaskCard) {
    if (!task.canDragAssign) {
      return;
    }

    setDraggingTaskId(task.id);
    event.dataTransfer.setData("text/plain", task.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDropOnModeler(event: ReactDragEvent<HTMLDivElement>, modelerId: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
    const task = tasks.find((item) => item.id === taskId);
    const modeler = modelerById.get(modelerId);

    if (!task || task.modelerId || task.isOutsourced || task.status === "已通过") {
      return;
    }

    if (!modeler) {
      setOperationMessage({ tone: "danger", text: "没有找到目标建模师。" });
      return;
    }

    if (task.isVirtual) {
      setDraftAssignments((current) => ({ ...current, [task.id]: modelerId }));
      setOperationMessage({ tone: "warning", text: "虚拟款式已形成前端草稿，录入真实款式后才能保存。" });
      setSelectedTaskId(task.id);
      setDraggingTaskId(null);
      return;
    }

    if (modeler.isVirtual) {
      setOperationMessage({ tone: "danger", text: "真实款式不能分配给占位建模师，请先在用户数据中维护人员。" });
      setDraggingTaskId(null);
      return;
    }

    if (!modeler.isSchedulable) {
      setOperationMessage({ tone: "danger", text: "该建模师当前标记为不可排期，请先在用户数据中调整排期状态。" });
      setDraggingTaskId(null);
      return;
    }

    void saveTaskUpdate(task, { modelerId });
    setSelectedTaskId(task.id);
    setDraggingTaskId(null);
  }

  async function saveTaskUpdate(task: ModelingTaskCard, payload: ModelingTaskUpdateRequest) {
    if (task.isVirtual) {
      setOperationMessage({ tone: "warning", text: "虚拟款式不能保存，请先由产品组工作指引录入真实款式。" });
      return;
    }

    setSavingTaskId(task.id);
    setOperationMessage(null);

    try {
      const response = await fetch(`/api/modeling/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ModelingTaskUpdateResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "保存建模款式失败。");
      }

      if (result.task) {
        const updatedTask = result.task;
        setSavedTasksById((current) => ({ ...current, [updatedTask.id]: updatedTask }));
        setSelectedTaskId(updatedTask.id);
      }

      if (result.projectSummary) {
        const updatedProject = result.projectSummary;
        setSavedProjectSummariesById((current) => ({ ...current, [updatedProject.projectId]: updatedProject }));
      }

      setDraftAssignments((current) => omitKey(current, task.id));
      setOperationMessage({ tone: result.writebackDraft ? "warning" : "success", text: result.message });
    } catch (error) {
      setOperationMessage({
        tone: "danger",
        text: error instanceof Error && error.message ? error.message : "保存建模款式失败。",
      });
    } finally {
      setSavingTaskId(null);
    }
  }

  async function submitTaskWork(task: ModelingTaskCard, payload: ModelingWorkSubmissionRequest) {
    if (task.isVirtual) {
      setOperationMessage({ tone: "warning", text: "虚拟款式不能提交成果，请先录入真实款式。" });
      return;
    }

    if (!isOriginalArtApproved(task)) {
      setOperationMessage({ tone: "danger", text: "原画未过审的款式不能提交建模成果。" });
      return;
    }

    setSavingTaskId(task.id);
    setOperationMessage(null);

    try {
      const response = await fetch(`/api/modeling/tasks/${task.id}/work-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ModelingTaskUpdateResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "提交建模成果失败。");
      }

      if (result.task) {
        const updatedTask = result.task;
        setSavedTasksById((current) => ({ ...current, [updatedTask.id]: updatedTask }));
        setSelectedTaskId(updatedTask.id);
        setClockNow(Date.now());
      }

      if (result.updatedTasks && result.updatedTasks.length > 0) {
        setSavedTasksById((current) =>
          result.updatedTasks!.reduce<Record<string, ModelingTaskCard>>(
            (next, updatedTask) => ({ ...next, [updatedTask.id]: updatedTask }),
            current,
          ),
        );
        setClockNow(Date.now());
      }

      if (result.projectSummary) {
        const updatedProject = result.projectSummary;
        setSavedProjectSummariesById((current) => ({ ...current, [updatedProject.projectId]: updatedProject }));
      }

      setClockNow(Date.now());
      setOperationMessage({ tone: "success", text: result.message });
    } catch (error) {
      setOperationMessage({
        tone: "danger",
        text: error instanceof Error && error.message ? error.message : "提交建模成果失败。",
      });
    } finally {
      setSavingTaskId(null);
    }
  }

  async function submitWorkTimer(task: ModelingTaskCard, action: "start") {
    if (task.isVirtual) {
      setOperationMessage({ tone: "warning", text: "虚拟款式不能记录工时，请先录入真实款式。" });
      return;
    }

    if (!isOriginalArtApproved(task)) {
      setOperationMessage({ tone: "danger", text: "原画未过审的款式不能开始建模计时。" });
      return;
    }

    setSavingTaskId(task.id);
    setOperationMessage(null);

    try {
      const response = await fetch(`/api/modeling/tasks/${task.id}/work-timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as ModelingTaskUpdateResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "记录建模工时失败。");
      }

      if (result.task) {
        const updatedTask = result.task;
        setSavedTasksById((current) => ({ ...current, [updatedTask.id]: updatedTask }));
        setSelectedTaskId(updatedTask.id);
      }

      if (result.updatedTasks && result.updatedTasks.length > 0) {
        setSavedTasksById((current) =>
          result.updatedTasks!.reduce<Record<string, ModelingTaskCard>>(
            (next, updatedTask) => ({ ...next, [updatedTask.id]: updatedTask }),
            current,
          ),
        );
      }

      if (result.projectSummary) {
        const updatedProject = result.projectSummary;
        setSavedProjectSummariesById((current) => ({ ...current, [updatedProject.projectId]: updatedProject }));
      }

      setClockNow(Date.now());
      setOperationMessage({ tone: "success", text: result.message });
    } catch (error) {
      setOperationMessage({
        tone: "danger",
        text: error instanceof Error && error.message ? error.message : "记录建模工时失败。",
      });
    } finally {
      setSavingTaskId(null);
    }
  }

  async function submitStyleListConfirmation(task: ModelingTaskCard, action: "confirm" | "return", note?: string) {
    if (task.isVirtual) {
      setOperationMessage({ tone: "warning", text: "虚拟款式不能确认，请先接收真实款式清单。" });
      return;
    }

    if (!preConfirmationStatuses.has(task.status)) {
      setOperationMessage({ tone: "warning", text: "当前款式不在待确认或退回补充状态。" });
      return;
    }

    setSavingTaskId(task.id);
    setOperationMessage(null);

    try {
      const response = await fetch("/api/modeling/style-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: task.projectId,
          action,
          note,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "提交款式清单确认失败。");
      }

      setOperationMessage({ tone: action === "confirm" ? "success" : "warning", text: result.message || "款式清单确认已提交。" });
      router.refresh();
    } catch (error) {
      setOperationMessage({
        tone: "danger",
        text: error instanceof Error && error.message ? error.message : "提交款式清单确认失败。",
      });
    } finally {
      setSavingTaskId(null);
    }
  }

  function handleStyleBoardModeChange(nextMode: StyleBoardMode) {
    setStyleBoardMode(nextMode);
  }

  function openTaskDetail(task: ModelingTaskCard) {
    setSelectedTaskId(task.id);
    setDetailTaskId(task.id);
  }

  function openTodo(todo: ModelingTodoItem) {
    setView("style-board");
    setStyleBoardMode("active");
    setSearch(todo.projectName);
    setConfirmationProjectId(todo.projectId);
    setDetailTaskId("");
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      {detailTask ? (
        <RealTaskDetailOverlay
                key={`${detailTask.id}:${detailTask.status}:${detailTask.outsourceVendorId ?? ""}:${detailTask.actualFinishDate ?? ""}:${detailTask.activeWorkStartedAt ?? ""}:${detailTask.actualWorkMinutes}:${detailTask.feedbackCount}:${detailTask.remainingWorkdays ?? ""}:${detailTask.notes ?? ""}`}
          task={detailTask}
          projectTasks={detailProjectTasks}
          projectSummary={detailProjectSummary}
          vendors={data.vendors}
          saving={savingTaskId === detailTask.id}
          clockNow={clockNow}
          canViewTestFields={canViewTestFields}
          onClose={() => setDetailTaskId("")}
          onSelectTask={(task) => {
            setSelectedTaskId(task.id);
            setDetailTaskId(task.id);
          }}
          currentUser={currentUser}
          onSave={saveTaskUpdate}
          onSubmitWork={submitTaskWork}
          onWorkTimer={submitWorkTimer}
          onConfirmStyleList={submitStyleListConfirmation}
        />
      ) : null}
      {confirmationTodo && confirmationProjectTasks.length > 0 ? (
        <ProjectStyleListConfirmationOverlay
          canViewTestFields={canViewTestFields}
          canConfirm={currentUser.authRole === "admin" || currentUser.authRole === "manager"}
          projectTasks={confirmationProjectTasks}
          savingTaskId={savingTaskId}
          todo={confirmationTodo}
          onClose={() => setConfirmationProjectId("")}
          onConfirm={(task, action, note) => submitStyleListConfirmation(task, action, note)}
        />
      ) : null}
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-4 py-5 max-xl:border-b max-xl:border-r-0">
          <div className="border-b border-slate-200 pb-5">
            <div className="text-lg font-semibold">项目经营管理中台</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">
              P0 工程版 · 当前数据源：{data.sourceLabel}
            </div>
          </div>
          <nav className="mt-5 grid gap-2">
            <button
              onClick={() => router.push("/")}
              className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              项目排期
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">P0</span>
            </button>
            <button
              onClick={() => router.push("/product-guide")}
              className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              产品组工作指引
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">P0</span>
            </button>
            <button className="flex h-10 items-center justify-between rounded-lg bg-rose-50 px-3 text-sm font-semibold text-rose-700">
              建模排期
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs">P0</span>
            </button>
            {canOpenUserData ? (
              <button
                onClick={() => router.push("/users")}
                className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                用户数据
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">基础</span>
              </button>
            ) : null}
            <button
              onClick={() => router.push("/imports")}
              className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              数据导入
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">预览</span>
            </button>
          </nav>
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="min-w-0 px-6 py-5 max-md:px-4">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
                <Pill icon={<Workflow size={14} />} label={data.sourceLabel} />
                <Pill icon={<Clock3 size={14} />} label={`刷新：${formatDateTime(data.generatedAt)}`} />
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">建模排期</h1>
              <div className="mt-2 text-sm text-slate-500">
                {view === "milestones"
                  ? `${data.milestoneOverview.currentMonthLabel} / 之前未完成 / ${data.milestoneOverview.nextMonthLabel} 建模里程碑`
                  : view === "profile"
                    ? "个人信息 · 查看当前建模师名下款式"
                    : styleBoardMode === "approved"
                      ? "款式看板 · 已通过款式归档 · 按建模师分组"
                      : "款式看板 · 按建模师分组，未分配单独显示"}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push("/modeling/contract-test")}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Workflow size={16} />
                模拟器
              </button>
              <button
                type="button"
                onClick={() => router.push("/imports?importType=modeling")}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
              >
                <FileSpreadsheet size={16} />
                导入建模款式
              </button>
              <div className="inline-flex h-10 rounded-lg bg-slate-100 p-1">
                <button
                  onClick={() => setView("milestones")}
                  className={clsx(
                    "rounded-md px-3 text-sm font-semibold",
                    view === "milestones" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                  )}
                >
                  里程碑
                </button>
                <button
                  onClick={() => setView("style-board")}
                  className={clsx(
                    "rounded-md px-3 text-sm font-semibold",
                    view === "style-board" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                  )}
                >
                  款式看板
                </button>
                <button
                  onClick={() => setView("profile")}
                  className={clsx(
                    "rounded-md px-3 text-sm font-semibold",
                    view === "profile" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                  )}
                >
                  个人信息
                </button>
              </div>
              <div className="relative w-[320px] max-w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    view === "milestones"
                      ? "搜索项目或阶段"
                      : view === "profile"
                        ? "搜索我的项目或款式"
                        : "搜索项目、款式、建模师"
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>
          </header>

          {activeTodos.length > 0 ? (
            <ModelingTodoBanner
              todos={activeTodos}
              onOpenTodo={openTodo}
            />
          ) : null}

          {view === "milestones" ? (
            <MilestoneOverviewView
              overview={filteredMilestoneOverview}
              onOpenStyleBoard={(projectName) => {
                setSearch(projectName);
                setView("style-board");
              }}
            />
          ) : view === "profile" ? (
            <ModelerProfileView
              modelers={data.modelers}
              tasks={allTasks}
              selectedModelerId={profileModelerId}
              search={visibleSearch}
              onSelectModeler={setProfileModelerId}
            />
          ) : (
            <>
              <section className="mt-5 grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                {metrics.map((metric) => (
                  <MetricCard key={metric.label} metric={metric} />
                ))}
              </section>

              {draftCount > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  <span>已有 {draftCount} 条虚拟款式前端草稿；真实款式拖拽会直接保存。</span>
                  <button
                    onClick={() => setDraftAssignments({})}
                    className="rounded-md border border-sky-200 bg-white px-2.5 py-1 font-semibold text-sky-800 hover:bg-sky-100"
                  >
                    清空草稿
                  </button>
                </div>
              ) : null}

              {operationMessage ? (
                <div
                  className={clsx(
                    "mt-4 rounded-lg border px-3 py-2 text-sm font-medium",
                    operationMessage.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "",
                    operationMessage.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "",
                    operationMessage.tone === "danger" ? "border-rose-200 bg-rose-50 text-rose-800" : "",
                  )}
                >
                  {operationMessage.text}
                </div>
              ) : null}

              <section className="mt-5 grid grid-cols-[minmax(0,1fr)_340px] gap-4 max-xl:grid-cols-1">
                <StyleBoardByModeler
                  modelers={styleCapacityRows}
                  tasks={filteredStyleTasks}
                  mode={styleBoardMode}
                  activeCount={tasks.length}
                  approvedCount={approvedTasks.length}
                  selectedTaskId={selectedTask?.id}
                  draftAssignments={draftAssignments}
                  onModeChange={handleStyleBoardModeChange}
                  onDropOnModeler={handleDropOnModeler}
                  onSelectTask={setSelectedTaskId}
                  onOpenTaskDetail={openTaskDetail}
                  onDragStart={handleDragStart}
                  onDragEnd={() => setDraggingTaskId(null)}
                />

                <aside className="min-w-0">
                  <div className="grid gap-4">
                    <ProjectProgressPanel projects={filteredProjectSummaries} />
                    <TaskDetailPanel
                      key={`${selectedTask?.id ?? "empty-task"}:${selectedTask?.status ?? ""}:${selectedTask?.outsourceVendorId ?? ""}:${selectedTask?.actualFinishDate ?? ""}:${selectedTask?.activeWorkStartedAt ?? ""}:${selectedTask?.actualWorkMinutes ?? 0}:${selectedTask?.feedbackCount ?? 0}:${selectedTask?.remainingWorkdays ?? ""}:${selectedTask?.notes ?? ""}`}
                      task={selectedTask}
                      vendors={data.vendors}
                      currentUser={currentUser}
                      saving={selectedTask ? savingTaskId === selectedTask.id : false}
                      clockNow={clockNow}
                      canViewTestFields={canViewTestFields}
                      onSave={saveTaskUpdate}
                      onSubmitWork={submitTaskWork}
                      onWorkTimer={submitWorkTimer}
                      onConfirmStyleList={submitStyleListConfirmation}
                    />
                  </div>
                </aside>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function MetricCard({ metric }: { metric: ModelingMetric }) {
  return (
    <div className={clsx("rounded-lg border p-4", metricToneClass[metric.tone])}>
      <div className="text-sm font-medium text-slate-500">{metric.label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{metric.value}</div>
      <div className="mt-2 text-sm leading-5 text-slate-500">{metric.helper}</div>
    </div>
  );
}

function ModelingTodoBanner({
  todos,
  onOpenTodo,
}: {
  todos: ModelingTodoItem[];
  onOpenTodo: (todo: ModelingTodoItem) => void;
}) {
  return (
    <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700">
            <BellRing size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-950">建模任务待办</div>
            <div className="mt-1 text-sm leading-6 text-amber-900">
              {todos.length === 1 ? todos[0].helper : `当前有 ${todos.length} 个项目的款式清单等待建模侧确认。`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {todos.slice(0, 3).map((todo) => (
            <button
              key={todo.id}
              type="button"
              onClick={() => onOpenTodo(todo)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              <ClipboardList size={14} />
              打开清单
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs">{todo.styleCount} 款</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectStyleListConfirmationOverlay({
  canViewTestFields,
  canConfirm,
  projectTasks,
  savingTaskId,
  todo,
  onClose,
  onConfirm,
}: {
  canViewTestFields: boolean;
  canConfirm: boolean;
  projectTasks: ModelingTaskCard[];
  savingTaskId: string | null;
  todo: ModelingTodoItem;
  onClose: () => void;
  onConfirm: (task: ModelingTaskCard, action: "confirm" | "return", note?: string) => Promise<void>;
}) {
  const [returnNote, setReturnNote] = useState("");
  const confirmableTasks = projectTasks.filter((task) => preConfirmationStatuses.has(task.status));
  const actionTask = confirmableTasks[0];
  const saving = Boolean(actionTask && savingTaskId === actionTask.id);
  const sortedTasks = [...projectTasks].sort(compareStyleListTasks);

  function handleConfirm() {
    if (!canConfirm || !actionTask || saving) {
      return;
    }

    void onConfirm(actionTask, "confirm");
  }

  function handleReturn() {
    const note = returnNote.trim();

    if (!canConfirm || !actionTask || saving || !note) {
      return;
    }

    void onConfirm(actionTask, "return", note);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-lg bg-slate-50 shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              <h2 className="truncate text-lg font-semibold text-slate-950">款式清单待确认</h2>
              <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{todo.styleCount} 款待确认</span>
            </div>
            <div className="mt-1 truncate text-sm text-slate-500">{todo.projectName}</div>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
            onClick={onClose}
            title="关闭清单"
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <SectionTitle icon={<Boxes size={18} />} title="本次提交款式" helper={`${sortedTasks.length} 款`} compact />
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">序号</th>
                      <th className="px-3 py-2 font-medium">款式</th>
                      <th className="px-3 py-2 font-medium">任务</th>
                      <th className="px-3 py-2 font-medium">难度</th>
                      <th className="px-3 py-2 font-medium">预计天数</th>
                      <th className="px-3 py-2 font-medium">原画状态</th>
                      <th className="px-3 py-2 font-medium">当前状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sortedTasks.map((task) => (
                      <tr key={task.id} className={preConfirmationStatuses.has(task.status) ? "bg-amber-50/45" : ""}>
                        <td className="px-3 py-3 text-slate-600">{task.styleSequence || "-"}</td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">{task.styleName}</div>
                          <ModelingTestFieldLine canViewTestFields={canViewTestFields} sourceStyleId={task.sourceStyleId} styleCode={task.styleCode} />
                        </td>
                        <td className="px-3 py-3 text-slate-600">{task.isFirstModelingStyle ? "任务 7 · 第一款" : "任务 10 · 其余款"}</td>
                        <td className="px-3 py-3 text-slate-600">{task.difficulty}</td>
                        <td className="px-3 py-3 text-slate-600">{task.estimatedWorkdays} 天</td>
                        <td className="px-3 py-3 text-slate-600">{task.originalArtStatus}</td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{task.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-950">整批确认</div>
                <div className="mt-2 text-sm leading-6 text-amber-900">
                  确认后，待确认款式会统一进入“未启动”。退回补充会要求产品组补齐信息，本批款式不进入正式排期。
                </div>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!canConfirm || !actionTask || saving}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    确认整批清单
                  </button>
                  <textarea
                    className="min-h-24 w-full resize-none rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    onChange={(event) => setReturnNote(event.target.value)}
                    placeholder="退回补充时必须填写原因。"
                    value={returnNote}
                  />
                  <button
                    type="button"
                    onClick={handleReturn}
                    disabled={!canConfirm || !actionTask || saving || returnNote.trim().length === 0}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
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

function MilestoneOverviewView({
  overview,
  onOpenStyleBoard,
}: {
  overview: ModelingMilestoneOverview;
  onOpenStyleBoard: (projectName: string) => void;
}) {
  return (
    <section className="mt-5">
      <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
        <MilestoneColumn
          icon={<AlertTriangle size={18} />}
          title="之前未完成"
          helper="计划完成早于本月，且还未进入后续阶段"
          tone="danger"
          cards={overview.previousUnfinished}
          onOpenStyleBoard={onOpenStyleBoard}
        />
        <MilestoneColumn
          icon={<CalendarRange size={18} />}
          title={`${overview.currentMonthLabel} 要完成`}
          helper="本月计划完成的建模里程碑"
          tone="current"
          cards={overview.currentMonth}
          onOpenStyleBoard={onOpenStyleBoard}
        />
        <MilestoneColumn
          icon={<ListChecks size={18} />}
          title={`${overview.nextMonthLabel} 要完成`}
          helper="下月计划完成的建模里程碑"
          tone="next"
          cards={overview.nextMonth}
          onOpenStyleBoard={onOpenStyleBoard}
        />
      </div>
    </section>
  );
}

function MilestoneColumn({
  icon,
  title,
  helper,
  tone,
  cards,
  onOpenStyleBoard,
}: {
  icon: ReactNode;
  title: string;
  helper: string;
  tone: "danger" | "current" | "next";
  cards: ModelingMilestoneCard[];
  onOpenStyleBoard: (projectName: string) => void;
}) {
  const toneClass = {
    danger: "border-rose-200 bg-rose-50/60",
    current: "border-slate-200 bg-white",
    next: "border-sky-200 bg-sky-50/60",
  }[tone];

  return (
    <div className={clsx("rounded-lg border p-3", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className={tone === "danger" ? "text-rose-600" : tone === "next" ? "text-sky-700" : "text-rose-600"}>
              {icon}
            </span>
            {title}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{helper}</div>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{cards.length}</span>
      </div>

      <div className="mt-3 grid gap-3">
        {cards.length > 0 ? (
          cards.map((card) => (
            <MilestoneCard key={card.id} card={card} onOpenStyleBoard={() => onOpenStyleBoard(card.projectName)} />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-10 text-center text-sm text-slate-400">
            暂无项目
          </div>
        )}
      </div>
    </div>
  );
}

function MilestoneCard({ card, onOpenStyleBoard }: { card: ModelingMilestoneCard; onOpenStyleBoard: () => void }) {
  return (
    <button
      onClick={onOpenStyleBoard}
      className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-rose-200 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-slate-900">{card.projectName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{card.projectStage}</span>
            <span className="text-slate-300">/</span>
            <span>{card.styleCount || "待补充"} 款</span>
          </div>
        </div>
        <span className={clsx("shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold", milestoneRiskClass[card.riskLevel])}>
          {milestoneRiskLabel[card.riskLevel]}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <MiniStat label="计划完成" value={card.plannedFinishDate} />
        <MiniStat label="预测完成" value={card.forecastFinishDate ?? "待测算"} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-1">
          任务 {card.completedTaskCount}/{card.totalTaskCount}
        </span>
        {card.delayDays > 0 && !card.isCompleted ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">预计晚 {card.delayDays} 天</span>
        ) : null}
      </div>

      {!card.isCompleted && card.unfinishedTaskNames.length > 0 ? (
        <div className="mt-3 text-xs leading-5 text-slate-500">
          未完成：{card.unfinishedTaskNames.slice(0, 3).join("、")}
        </div>
      ) : null}
    </button>
  );
}

function ModelerProfileView({
  modelers,
  tasks,
  selectedModelerId,
  search,
  onSelectModeler,
}: {
  modelers: ModelerCapacity[];
  tasks: ModelingTaskCard[];
  selectedModelerId: string;
  search: string;
  onSelectModeler: (modelerId: string) => void;
}) {
  const selectedModeler = modelers.find((modeler) => modeler.id === selectedModelerId) ?? modelers[0];
  const ownedTasks = useMemo(() => {
    if (!selectedModeler) {
      return [];
    }

    return tasks
      .filter((task) => task.modelerId === selectedModeler.id && !task.isOutsourced)
      .filter((task) => {
        if (!search) {
          return true;
        }

        return [task.projectName, task.styleName, task.status, task.difficulty].some((value) => value.includes(search));
      })
      .sort(compareModelingTasks);
  }, [search, selectedModeler, tasks]);
  const activeTasks = ownedTasks.filter((task) => task.status !== "已通过" && task.status !== "取消");
  const blockedTasks = activeTasks.filter((task) => reviewBlockedStatuses.has(task.status) || task.blockType || task.isStale);
  const approvedTasks = ownedTasks.filter((task) => task.status === "已通过");
  const thisWeekTasks = activeTasks.filter(isThisWeekTask);
  const profileMetrics: ModelingMetric[] = [
    {
      label: "我的排期中款式",
      value: activeTasks.length,
      helper: "不含已通过款式",
      tone: activeTasks.length > 4 ? "danger" : "neutral",
    },
    {
      label: "本周任务",
      value: thisWeekTasks.length,
      helper: "计划区间落在本周",
      tone: "info",
    },
    {
      label: "提醒事项",
      value: blockedTasks.length,
      helper: "送审、等反馈或超过 3 天未更新",
      tone: blockedTasks.length > 0 ? "danger" : "neutral",
    },
    {
      label: "已通过款式",
      value: approvedTasks.length,
      helper: "个人完成记录",
      tone: "neutral",
    },
  ];

  return (
    <section className="mt-5 grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <SectionTitle icon={<UserRound size={18} />} title="个人信息" helper="当前建模师" compact />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                value={selectedModeler?.id ?? ""}
                onChange={(event) => onSelectModeler(event.target.value)}
                className="h-10 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              >
                {modelers.map((modeler) => (
                  <option key={modeler.id} value={modeler.id}>
                    {modeler.name}
                  </option>
                ))}
              </select>
              {selectedModeler ? (
                <div className="text-sm text-slate-500">
                  {selectedModeler.roleTitle}
                  {!selectedModeler.isSchedulable ? " · 不可排期" : ""}
                  {selectedModeler.isVirtual ? " · 待补充人员名" : ""}
                </div>
              ) : null}
            </div>
            {selectedModeler && selectedModeler.specialtyTags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedModeler.specialtyTags.slice(0, 5).map((tag) => (
                  <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {selectedModeler ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-xs font-medium text-slate-500">周可用工作日</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{selectedModeler.weeklyAvailableWorkdays}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {profileMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-xl:grid-cols-1">
        <div className="grid gap-4">
          <ProfileTaskSection title="我的建模款式" helper={`${activeTasks.length} 款`} tasks={activeTasks} emptyText="暂无排期中款式" />
          <ProfileTaskSection title="已通过款式" helper={`${approvedTasks.length} 款`} tasks={approvedTasks} emptyText="暂无已通过款式" compact />
        </div>

        <aside className="min-w-0">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <SectionTitle icon={<AlertTriangle size={18} />} title="我的提醒" helper={`${blockedTasks.length} 条`} compact />
            <div className="mt-3 grid gap-2">
              {blockedTasks.length > 0 ? (
                blockedTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <div className="font-semibold">{task.styleName}</div>
                    <div className="mt-0.5 text-xs text-amber-800">{task.projectName}</div>
                    <div className="mt-2 text-xs leading-5">
                      {task.isStale ? `${task.staleDays} 天未更新` : task.blockType ?? task.status}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-400">
                  暂无提醒
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ProfileTaskSection({
  title,
  helper,
  tasks,
  emptyText,
  compact = false,
}: {
  title: string;
  helper: string;
  tasks: ModelingTaskCard[];
  emptyText: string;
  compact?: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionTitle icon={<Boxes size={18} />} title={title} helper={helper} compact />
      <div className={clsx("mt-3 grid gap-3", compact ? "grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1" : "grid-cols-2 max-lg:grid-cols-1")}>
        {tasks.length > 0 ? (
          tasks.map((task) => <ProfileTaskCard key={task.id} task={task} compact={compact} />)
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-400">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileTaskCard({ task, compact }: { task: ModelingTaskCard; compact: boolean }) {
  return (
    <div className={clsx("rounded-lg border p-3", statusMeta[task.status].cardClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-slate-900">{task.styleName}</div>
          <div className="mt-1 break-words text-xs text-slate-500">{task.projectName}</div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{task.status}</span>
      </div>

      <div className={clsx("mt-3 grid gap-2 text-xs", compact ? "grid-cols-2" : "grid-cols-4 max-sm:grid-cols-2")}>
        <MiniStat label="计划完成" value={task.plannedFinishDate ?? "待定"} />
        <MiniStat label="已耗" value={`${task.consumedWorkdays} 天`} />
        {!compact ? <MiniStat label="预估" value={`${task.estimatedWorkdays} 天`} /> : null}
        {!compact ? <MiniStat label="难度" value={task.difficulty} /> : null}
      </div>

      {task.isStale || task.blockType ? (
        <div className="mt-3 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-800">
          {task.isStale ? `${task.staleDays} 天未更新` : task.blockType}
        </div>
      ) : null}
    </div>
  );
}

function StyleBoardByModeler({
  modelers,
  tasks,
  mode,
  activeCount,
  approvedCount,
  selectedTaskId,
  draftAssignments,
  onModeChange,
  onDropOnModeler,
  onSelectTask,
  onOpenTaskDetail,
  onDragStart,
  onDragEnd,
}: {
  modelers: CapacityRow[];
  tasks: ModelingTaskCard[];
  mode: StyleBoardMode;
  activeCount: number;
  approvedCount: number;
  selectedTaskId?: string;
  draftAssignments: Record<string, string>;
  onModeChange: (mode: StyleBoardMode) => void;
  onDropOnModeler: (event: ReactDragEvent<HTMLDivElement>, modelerId: string) => void;
  onSelectTask: (taskId: string) => void;
  onOpenTaskDetail: (task: ModelingTaskCard) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>, task: ModelingTaskCard) => void;
  onDragEnd: () => void;
}) {
  const isApprovedMode = mode === "approved";
  const unassignedTasks = tasks.filter((task) => !task.modelerId && !task.isOutsourced);
  const outsourcedTasks = tasks.filter((task) => task.isOutsourced && task.status !== "未分配");

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          icon={<Boxes size={18} />}
          title="款式看板"
          helper={isApprovedMode ? "已通过款式归档，按建模师分组" : "按建模师分组，未分配单独显示"}
        />
        <div className="inline-flex h-9 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => onModeChange("active")}
            className={clsx(
              "rounded-md px-3 text-sm font-semibold",
              mode === "active" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
            )}
          >
            排期中
            <span className="ml-1 text-xs font-medium text-slate-400">{activeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange("approved")}
            className={clsx(
              "rounded-md px-3 text-sm font-semibold",
              mode === "approved" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
            )}
          >
            已通过
            <span className="ml-1 text-xs font-medium text-slate-400">{approvedCount}</span>
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="text-sm font-medium text-slate-600">当前结果 {tasks.length} 款</div>
        <div className="text-xs font-medium text-slate-400">单款查看与操作</div>
      </div>
      <div className="mt-3 grid gap-3">
        <StyleBoardRow
          title="未分配"
          helper={isApprovedMode ? "已通过但负责人待补充" : "等待产品总监分配"}
          tasks={unassignedTasks}
          selectedTaskId={selectedTaskId}
          draftAssignments={draftAssignments}
          tone="warning"
          onSelectTask={onSelectTask}
          onOpenTaskDetail={onOpenTaskDetail}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />

        {modelers.map((modeler) => {
          const modelerTasks = tasks.filter((task) => task.modelerId === modeler.id && !task.isOutsourced);

          return (
            <StyleBoardRow
              key={modeler.id}
              title={modeler.name}
              helper={isApprovedMode ? `${modelerTasks.length} 款已通过` : `${modelerTasks.length} 款${modeler.isOverloaded ? " · 超载" : ""}`}
              tasks={modelerTasks}
              selectedTaskId={selectedTaskId}
              draftAssignments={draftAssignments}
              tone={!isApprovedMode && modeler.isOverloaded ? "danger" : "neutral"}
              onDrop={isApprovedMode ? undefined : (event) => onDropOnModeler(event, modeler.id)}
              onSelectTask={onSelectTask}
              onOpenTaskDetail={onOpenTaskDetail}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          );
        })}

        {outsourcedTasks.length > 0 ? (
          <StyleBoardRow
            title={isApprovedMode ? "外包已通过" : "外包中"}
            helper={isApprovedMode ? `${outsourcedTasks.length} 款已通过` : `${outsourcedTasks.length} 款`}
            tasks={outsourcedTasks}
            selectedTaskId={selectedTaskId}
            draftAssignments={draftAssignments}
            tone="info"
            onSelectTask={onSelectTask}
            onOpenTaskDetail={onOpenTaskDetail}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ) : null}
      </div>
    </section>
  );
}

function StyleBoardRow({
  title,
  helper,
  tasks,
  selectedTaskId,
  draftAssignments,
  tone,
  onDrop,
  onSelectTask,
  onOpenTaskDetail,
  onDragStart,
  onDragEnd,
}: {
  title: string;
  helper: string;
  tasks: ModelingTaskCard[];
  selectedTaskId?: string;
  draftAssignments: Record<string, string>;
  tone: "neutral" | "warning" | "danger" | "info";
  onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onSelectTask: (taskId: string) => void;
  onOpenTaskDetail: (task: ModelingTaskCard) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>, task: ModelingTaskCard) => void;
  onDragEnd: () => void;
}) {
  const rowClass = {
    neutral: "border-slate-200 bg-white",
    warning: "border-amber-200 bg-amber-50/75",
    danger: "border-rose-200 bg-rose-50/75",
    info: "border-cyan-200 bg-cyan-50/70",
  }[tone];

  return (
    <div
      onDragOver={onDrop ? (event) => event.preventDefault() : undefined}
      onDrop={onDrop}
      className={clsx("grid grid-cols-[150px_minmax(0,1fr)] gap-3 rounded-lg border p-3 max-md:grid-cols-1", rowClass)}
    >
      <div className="min-w-0">
        <div className="break-words text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-xs font-medium text-slate-500">{helper}</div>
      </div>

      <div className="min-w-0 overflow-x-auto pb-1">
        <div className="flex min-h-[104px] gap-2">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <CompactTaskCard
                key={task.id}
                task={task}
                selected={selectedTaskId === task.id}
                isDraft={Boolean(draftAssignments[task.id])}
                onClick={() => onSelectTask(task.id)}
                onOpenDetail={() => onOpenTaskDetail(task)}
                onDragStart={(event) => onDragStart(event, task)}
                onDragEnd={onDragEnd}
              />
            ))
          ) : (
            <div className="flex min-w-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/70 px-4 text-sm text-slate-400">
              暂无款式
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactTaskCard({
  task,
  selected,
  isDraft,
  onClick,
  onOpenDetail,
  onDragStart,
  onDragEnd,
}: {
  task: ModelingTaskCard;
  selected: boolean;
  isDraft: boolean;
  onClick: () => void;
  onOpenDetail: () => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const draggable = task.canDragAssign;

  return (
    <div
      data-modeling-task-id={task.id}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={clsx(
        "min-h-[116px] w-[178px] shrink-0 cursor-pointer rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm",
        statusMeta[task.status].cardClass,
        selected ? "ring-2 ring-rose-300" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 break-words text-sm font-semibold text-slate-900">{task.styleName}</div>
        {draggable ? <GripVertical className="shrink-0 text-slate-300" size={16} /> : null}
      </div>
      <div className="mt-1 truncate text-xs text-slate-500">{task.projectName}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{task.status}</span>
        {task.isVirtual ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">虚拟</span> : null}
        {isDraft ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">草稿</span> : null}
        {task.isStale ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">未更新</span> : null}
      </div>
      <div className="mt-2 truncate text-xs text-slate-500">{task.modelerName ?? task.outsourceVendorName ?? "待分配"}</div>
      <div className="mt-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail();
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Maximize2 size={13} />
          详情
        </button>
      </div>
    </div>
  );
}

function ProjectProgressPanel({ projects }: { projects: ProjectModelingSummary[] }) {
  const activeProjects = projects.filter((project) => project.totalStyles === 0 || project.approvedStyles < project.totalStyles);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionTitle icon={<CheckCircle2 size={18} />} title="项目建模进度" helper={`${activeProjects.length} 个项目`} compact />
      <div className="mt-3 max-h-[430px] overflow-y-auto pr-1">
        <div className="grid gap-3">
          {activeProjects.length > 0 ? (
            activeProjects.map((project) => (
              <div key={project.projectId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold text-slate-900">{project.projectName}</div>
                    <div className="mt-1 text-xs text-slate-500">{project.currentStage}</div>
                  </div>
                  {project.isVirtual ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">虚拟</span>
                  ) : null}
                </div>
                <div className="mt-3">
                  <ProgressBar value={project.progressPercent} />
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[11px] text-slate-500">
                  <PanelMiniStat label="总款" value={project.totalStyles} />
                  <PanelMiniStat label="通过" value={project.approvedStyles} />
                  <PanelMiniStat label="进行" value={project.inProgressStyles} />
                  <PanelMiniStat label="未分" value={project.unassignedStyles} />
                  <PanelMiniStat label="外包" value={project.outsourcedStyles} />
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-400">
              暂无未完成项目
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RealTaskDetailOverlay({
  task,
  projectTasks,
  projectSummary,
  vendors,
  saving,
  clockNow,
  canViewTestFields,
  currentUser,
  onClose,
  onSelectTask,
  onSave,
  onSubmitWork,
  onWorkTimer,
  onConfirmStyleList,
}: {
  task: ModelingTaskCard;
  projectTasks: ModelingTaskCard[];
  projectSummary?: ProjectModelingSummary;
  vendors: OutsourceVendorOption[];
  saving: boolean;
  clockNow: number | null;
  canViewTestFields: boolean;
  currentUser: AuthUser;
  onClose: () => void;
  onSelectTask: (task: ModelingTaskCard) => void;
  onSave: (task: ModelingTaskCard, payload: ModelingTaskUpdateRequest) => Promise<void>;
  onSubmitWork: (task: ModelingTaskCard, payload: ModelingWorkSubmissionRequest) => Promise<void>;
  onWorkTimer: (task: ModelingTaskCard, action: "start") => Promise<void>;
  onConfirmStyleList: (task: ModelingTaskCard, action: "confirm" | "return", note?: string) => Promise<void>;
}) {
  const approvedCount = projectSummary?.approvedStyles ?? projectTasks.filter((item) => item.status === "已通过").length;
  const totalCount = projectSummary?.totalStyles ?? projectTasks.length;
  const progressPercent = projectSummary?.progressPercent ?? (totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0);
  const workSummary = buildWorkTimeSummary(task, clockNow);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-lg bg-slate-50 shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-5 w-5 text-rose-600" />
              <h2 className="truncate text-lg font-semibold text-slate-950">{task.styleName}</h2>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{task.status}</span>
              {task.isVirtual ? <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">虚拟</span> : null}
            </div>
            <div className="mt-1 truncate text-sm text-slate-500">{task.projectName}</div>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
            onClick={onClose}
            title="关闭详情"
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_360px] lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-auto border-b border-slate-200 bg-white p-4 lg:border-b-0 lg:border-r">
            <SectionTitle icon={<Boxes size={18} />} title="项目款式" helper={`${projectTasks.length} 款`} compact />
            <div className="mt-3 grid gap-2">
              {projectTasks.length > 0 ? (
                projectTasks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTask(item)}
                    className={clsx(
                      "rounded-lg border px-3 py-2 text-left transition",
                      item.id === task.id ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-semibold text-slate-900">{item.styleName}</div>
                        <ModelingTestFieldLine canViewTestFields={canViewTestFields} sourceStyleId={item.sourceStyleId} styleCode={item.styleCode} />
                      </div>
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {item.isFirstModelingStyle ? "任务 7" : "任务 10"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{item.status}</span>
                      {item.isOutsourced ? <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">外包</span> : null}
                      {item.reviewRound > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">第 {item.reviewRound} 轮</span> : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-400">
                  暂无项目款式
                </div>
              )}
            </div>
          </aside>

          <main className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4">
            <div className="grid gap-4">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <SectionTitle icon={<UserRound size={18} />} title="款式概览" helper={task.status} compact />
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <ModelingTestFieldDetailItem canViewTestFields={canViewTestFields} sourceStyleId={task.sourceStyleId} styleCode={task.styleCode} />
                  <DetailItem label="原画状态" value={task.originalArtStatus} />
                  <DetailItem label="负责人" value={task.modelerName ?? task.outsourceVendorName ?? "待分配"} />
                  <DetailItem label="难度" value={task.difficulty} />
                  <DetailItem label="预估工期" value={`${task.estimatedWorkdays} 天`} />
                  <DetailItem label="已消耗" value={`${task.consumedWorkdays} 天`} />
                  <DetailItem label="剩余工时" value={task.remainingWorkdays === null || task.remainingWorkdays === undefined ? "待填写" : `${task.remainingWorkdays} 天`} />
                  <DetailItem label="累计工时" value={formatWorkTimeSummary(workSummary)} />
                  <DetailItem label="反馈次数" value={`${task.feedbackCount} 次`} />
                  <DetailItem label="实际开始" value={task.actualStartDate ?? "待定"} />
                  <DetailItem label="实际完成" value={task.actualFinishDate ?? "待定"} />
                </div>
                {task.notes ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                    备注：{task.notes}
                  </div>
                ) : null}
                {task.latestFeedback ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                    最新反馈：{task.latestFeedback}
                  </div>
                ) : null}
              </section>

              <TaskDetailPanel
                key={`${task.id}:${task.status}:${task.outsourceVendorId ?? ""}:${task.actualFinishDate ?? ""}:${task.activeWorkStartedAt ?? ""}:${task.actualWorkMinutes}:${task.feedbackCount}:${task.remainingWorkdays ?? ""}:${task.notes ?? ""}`}
                task={task}
                vendors={vendors}
                currentUser={currentUser}
                saving={saving}
                clockNow={clockNow}
                canViewTestFields={canViewTestFields}
                onSave={onSave}
                onSubmitWork={onSubmitWork}
                onWorkTimer={onWorkTimer}
                onConfirmStyleList={onConfirmStyleList}
              />
            </div>
          </main>

          <aside className="min-h-0 overflow-auto border-t border-slate-200 bg-white p-4 xl:border-l xl:border-t-0">
            <SectionTitle icon={<CheckCircle2 size={18} />} title="项目进度" helper={`${progressPercent}%`} compact />
            <div className="mt-4">
              <ProgressBar value={progressPercent} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
              <PanelMiniStat label="总款" value={totalCount} />
              <PanelMiniStat label="通过" value={approvedCount} />
              <PanelMiniStat label="进行" value={projectSummary?.inProgressStyles ?? projectTasks.filter((item) => activeQueueStatuses.has(item.status)).length} />
              <PanelMiniStat label="未分" value={projectSummary?.unassignedStyles ?? projectTasks.filter((item) => item.status === "未分配").length} />
              <PanelMiniStat label="送审" value={projectSummary?.submittedStyles ?? projectTasks.filter((item) => reviewBlockedStatuses.has(item.status)).length} />
              <PanelMiniStat label="外包" value={projectSummary?.outsourcedStyles ?? projectTasks.filter((item) => item.isOutsourced).length} />
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
              {approvedCount === totalCount && totalCount > 0
                ? "所有款式已通过，产品组工作指引可读取建模完成事实。"
                : "所有必做款式通过前，不会推进项目排期完成。"}
            </div>

            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">状态流转</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                {statusOptions.map((status) => (
                  <div key={status} className="flex items-center gap-2">
                    <span className={clsx("h-2.5 w-2.5 rounded-full", task.status === status ? statusMeta[status].dotClass : "bg-slate-200")} />
                    <span className={task.status === status ? "font-semibold text-slate-900" : ""}>{status}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}

function TaskDetailPanel({
  task,
  vendors,
  currentUser,
  saving,
  clockNow,
  canViewTestFields,
  onSave,
  onSubmitWork,
  onWorkTimer,
  onConfirmStyleList,
}: {
  task?: ModelingTaskCard;
  vendors: OutsourceVendorOption[];
  currentUser: AuthUser;
  saving: boolean;
  clockNow: number | null;
  canViewTestFields: boolean;
  onSave: (task: ModelingTaskCard, payload: ModelingTaskUpdateRequest) => Promise<void>;
  onSubmitWork: (task: ModelingTaskCard, payload: ModelingWorkSubmissionRequest) => Promise<void>;
  onWorkTimer: (task: ModelingTaskCard, action: "start") => Promise<void>;
  onConfirmStyleList: (task: ModelingTaskCard, action: "confirm" | "return", note?: string) => Promise<void>;
}) {
  const realVendors = useMemo(() => vendors.filter((vendor) => !vendor.isVirtual), [vendors]);
  const [vendorId, setVendorId] = useState(task?.outsourceVendorId ?? realVendors[0]?.id ?? "");
  const [remainingWorkdaysDraft, setRemainingWorkdaysDraft] = useState(task?.remainingWorkdays === null || task?.remainingWorkdays === undefined ? "" : String(task.remainingWorkdays));
  const [notesDraft, setNotesDraft] = useState(task?.notes ?? "");
  const [submissionContent, setSubmissionContent] = useState("");
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [confirmationNote, setConfirmationNote] = useState("");

  if (!task) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        暂无款式详情
      </section>
    );
  }

  const currentTask = task;
  const disabled = saving || currentTask.isVirtual;
  const canManageTask = currentUser.authRole === "admin" || currentUser.authRole === "manager";
  const canUseModelerActions = !disabled && (canManageTask || currentUser.id === currentTask.modelerId);
  const canEditManagementFields = !disabled && canManageTask;
  const isTimerActive = Boolean(currentTask.activeWorkStartedAt);
  const isReviewManagedStatus = productReviewManagedStatuses.has(currentTask.status);
  const canEditOperationalFields = canEditManagementFields && !isReviewManagedStatus;
  const canEditModelerInputs = canUseModelerActions && !isReviewManagedStatus;
  const canStartTimer =
    canUseModelerActions &&
    !isTimerActive &&
    !currentTask.isOutsourced &&
    ["已排期", "排队中", "建模中", "修改中"].includes(currentTask.status);
  const canSubmitWork =
    canUseModelerActions &&
    !["待确认", "退回补充", "未启动", "未分配", "待验收", "待送审", "已送审", "等反馈", "已通过", "取消"].includes(currentTask.status) &&
    (submissionContent.trim().length > 0 || submissionUrl.trim().length > 0);

  function handleOutsource() {
    if (!canEditOperationalFields || !vendorId) {
      return;
    }

    void onSave(currentTask, {
      isOutsourced: true,
      outsourceVendorId: vendorId,
    });
  }

  function handleSaveModelerInputs() {
    if (!canEditModelerInputs) {
      return;
    }

    void onSave(currentTask, {
      remainingWorkdays: remainingWorkdaysDraft === "" ? null : Number(remainingWorkdaysDraft),
      notes: notesDraft.trim() || null,
    });
  }

  function handleStartWorkTimer() {
    if (!canStartTimer) {
      return;
    }

    void onWorkTimer(currentTask, "start");
  }

  const workSummary = buildWorkTimeSummary(task, clockNow);

  function handleConfirmStyleList(action: "confirm" | "return") {
    if (!canEditManagementFields || !preConfirmationStatuses.has(currentTask.status)) {
      return;
    }

    if (action === "return" && !confirmationNote.trim()) {
      return;
    }

    void onConfirmStyleList(currentTask, action, confirmationNote.trim() || undefined);
  }

  function handleSubmitWork() {
    if (!canSubmitWork) {
      return;
    }

    void onSubmitWork(currentTask, {
      content: submissionContent.trim(),
      deliverableUrl: submissionUrl.trim() || undefined,
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionTitle icon={<UserRound size={18} />} title="款式详情" helper={task.status} compact />
      <div className="mt-3">
        <div className="break-words text-base font-semibold text-slate-900">{task.styleName}</div>
        <div className="mt-1 break-words text-sm text-slate-500">{task.projectName}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <ModelingTestFieldDetailItem canViewTestFields={canViewTestFields} sourceStyleId={task.sourceStyleId} styleCode={task.styleCode} />
        <DetailItem label="原画状态" value={task.originalArtStatus} />
        <DetailItem label="负责人" value={task.modelerName ?? task.outsourceVendorName ?? "待分配"} />
        <DetailItem label="难度" value={task.difficulty} />
        <DetailItem label="预估工期" value={`${task.estimatedWorkdays} 天`} />
        <DetailItem label="已消耗" value={`${task.consumedWorkdays} 天`} />
        <DetailItem label="剩余工时" value={task.remainingWorkdays === null || task.remainingWorkdays === undefined ? "待填写" : `${task.remainingWorkdays} 天`} />
        <DetailItem label="累计工时" value={formatWorkTimeSummary(workSummary)} />
        <DetailItem label="反馈次数" value={`${task.feedbackCount} 次`} />
        <DetailItem label="计划开始" value={task.plannedStartDate ?? "待定"} />
        <DetailItem label="计划完成" value={task.plannedFinishDate ?? "待定"} />
      </div>

      {task.notes ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
          备注：{task.notes}
        </div>
      ) : null}

      {task.isStale ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          建模中已 {task.staleDays} 天未更新，需要跟进。
        </div>
      ) : null}

      {reviewBlockedStatuses.has(task.status) || task.blockType ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          <div className="font-semibold">{task.blockType ?? (task.status === "待验收" ? "待产品美术验收" : "送审 / 等反馈")}</div>
          <div className="mt-1 leading-5">{task.latestFeedback ?? "等待补充本轮检修问题和版权方反馈。"}</div>
        </div>
      ) : null}

      {task.isVirtual ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          当前是虚拟款式，只能做前端草稿。保存分配、外包、工时和备注前，需要先录入真实款式。
        </div>
      ) : null}

      {preConfirmationStatuses.has(task.status) ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-950">款式清单确认</div>
          <div className="mt-1 text-sm leading-6 text-amber-900">
            当前项目存在待确认款式。确认前不会进入正式产能计算，也不能分配、计时、提交成果或送审。
          </div>
          <textarea
            value={confirmationNote}
            onChange={(event) => setConfirmationNote(event.target.value)}
            disabled={!canEditManagementFields}
            placeholder="退回补充时必须填写原因；确认通过可不填。"
            className="mt-3 min-h-20 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100"
          />
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <button
              type="button"
              onClick={() => handleConfirmStyleList("confirm")}
              disabled={!canEditManagementFields || saving}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              确认整批清单
            </button>
            <button
              type="button"
              onClick={() => handleConfirmStyleList("return")}
              disabled={!canEditManagementFields || saving || confirmationNote.trim().length === 0}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              退回补充
            </button>
          </div>
        </div>
      ) : null}

      {isTimerActive ? (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          本款式正在计时，开始时间：{formatDateTimeForDisplay(task.activeWorkStartedAt)}。
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-500">当前状态</div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{currentTask.status}</span>
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-500">状态由分配、外包、开始建模、提交成果和产品组审核 / 送审结果自动生成。</div>
        </div>

        <div className="grid gap-2">
          <label className="text-xs font-semibold text-slate-500">外包供应商</label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
              disabled={!canEditOperationalFields || realVendors.length === 0}
              className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-100"
            >
              {realVendors.length > 0 ? (
                realVendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                    {vendor.stableCapacity ? " · 稳定产能" : ""}
                  </option>
                ))
              ) : (
                <option value="">待补充供应商</option>
              )}
            </select>
            <button
              onClick={handleOutsource}
              disabled={!canEditOperationalFields || realVendors.length === 0 || !vendorId}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <PackageCheck size={15} />
              外包
            </button>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="text-xs font-semibold text-slate-700">剩余工时与备注</label>
          <input
            type="number"
            min={0}
            step={1}
            value={remainingWorkdaysDraft}
            onChange={(event) => setRemainingWorkdaysDraft(event.target.value)}
            disabled={!canEditModelerInputs}
            placeholder="剩余工时，按工作日填写"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100"
          />
          <textarea
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            disabled={!canEditModelerInputs}
            rows={3}
            placeholder="填写建模侧备注，不用于产品检修或版权反馈结论"
            className="min-h-[84px] resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100"
          />
          <button
            type="button"
            onClick={handleSaveModelerInputs}
            disabled={!canEditModelerInputs}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            保存剩余工时和备注
          </button>
        </div>

        <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-blue-900">建模工时</label>
            <span className="text-xs font-medium text-blue-800">
              累计 {formatWorkTimeSummary(workSummary)}
            </span>
          </div>
          <div className="grid gap-2 text-sm">
            <button
              type="button"
              onClick={handleStartWorkTimer}
              disabled={!canStartTimer}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving && !isTimerActive ? <Loader2 size={15} className="animate-spin" /> : <Clock3 size={15} />}
              开始建模
            </button>
          </div>
          <div className="text-xs leading-5 text-blue-900">
            {isTimerActive
              ? `当前款式正在计时，本次已运行 ${formatApproxWorkMinutes(workSummary.activeMinutes)}。页面每 5 分钟自动刷新一次。`
              : "系统会自动结束计时：开始另一个款式或提交成果时，会结束同一建模师当前正在计时的款式。"}
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-fuchsia-100 bg-fuchsia-50/60 p-3">
          <label className="text-xs font-semibold text-fuchsia-800">建模师提交成果</label>
          <textarea
            value={submissionContent}
            onChange={(event) => setSubmissionContent(event.target.value)}
            disabled={!canUseModelerActions}
            rows={3}
            placeholder="填写本次提交的内容、文件位置、注意事项或需要产品美术检修的问题"
            className="min-h-[84px] resize-none rounded-lg border border-fuchsia-100 bg-white px-3 py-2 text-sm leading-5 outline-none transition focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-100 disabled:bg-slate-100"
          />
          <input
            type="url"
            value={submissionUrl}
            onChange={(event) => setSubmissionUrl(event.target.value)}
            disabled={!canUseModelerActions}
            placeholder="成果链接，可填网盘、图包或文件地址"
            className="h-10 rounded-lg border border-fuchsia-100 bg-white px-3 text-sm outline-none transition focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-100 disabled:bg-slate-100"
          />
          <button
            type="button"
            onClick={handleSubmitWork}
            disabled={!canSubmitWork}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-fuchsia-700 px-3 text-sm font-semibold text-white transition hover:bg-fuchsia-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            提交给产品美术验收
          </button>
          <div className="text-xs leading-5 text-fuchsia-900">
            提交后状态会变为“待验收”，产品组工作指引会看到该款式和提交内容。
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-700">产品检修 / 送审反馈</label>
            <span className="text-xs text-slate-500">{task.feedbackCount} 次反馈</span>
          </div>
          {task.latestFeedback ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700">
              {task.latestFeedback}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-400">
              暂无检修或送审反馈。
            </div>
          )}
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-500">
            检修和送审结果由产品组工作指引回传，建模排期页只读展示。
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({
  icon,
  title,
  helper,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  helper: string;
  compact?: boolean;
}) {
  return (
    <div className={clsx("flex items-center justify-between gap-3", compact ? "" : "min-h-8")}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="text-rose-600">{icon}</span>
        {title}
      </div>
      <div className="text-xs font-medium text-slate-500">{helper}</div>
    </div>
  );
}

function Pill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1">
      {icon}
      {label}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-white px-2 py-1.5">
      <div className="font-semibold text-slate-900">{value}</div>
      <div className="mt-0.5 text-slate-400">{label}</div>
    </div>
  );
}

function PanelMiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-white px-1.5 py-1">
      <div className="font-semibold text-slate-800">{value}</div>
      <div>{label}</div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-800">{value}</div>
    </div>
  );
}

function ModelingTestFieldLine({
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

function ModelingTestFieldDetailItem({
  canViewTestFields,
  sourceStyleId,
  styleCode,
}: {
  canViewTestFields: boolean;
  sourceStyleId?: string | null;
  styleCode?: string | null;
}) {
  const value = [styleCode, sourceStyleId].find((fieldValue) => canDisplayModelingFieldValue(fieldValue, canViewTestFields));

  if (!value) {
    return null;
  }

  return <DetailItem label={isModelingTestFieldValue(value) ? "测试字段" : "款式编号"} value={value} />;
}

function buildWorkTimeSummary(task: ModelingTaskCard, now: number | null) {
  const persistedMinutes = Math.max(0, Math.floor(task.actualWorkMinutes || 0));
  const activeSeconds = activeWorkSeconds(task.activeWorkStartedAt, now);
  const activeMinutes = Math.floor(activeSeconds / 60);

  return {
    persistedMinutes,
    activeSeconds,
    activeMinutes,
    totalMinutes: persistedMinutes + activeMinutes,
    isActive: Boolean(task.activeWorkStartedAt),
  };
}

function activeWorkSeconds(startedAt: string | undefined, now: number | null) {
  if (!startedAt || now === null) {
    return 0;
  }

  const startedAtMs = new Date(startedAt).getTime();

  if (!Number.isFinite(startedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((now - startedAtMs) / 1000));
}

function formatWorkTimeSummary(summary: {
  totalMinutes: number;
  activeMinutes: number;
  isActive: boolean;
}) {
  const base = formatWorkMinutes(summary.totalMinutes);

  if (!summary.isActive) {
    return base;
  }

  return `${base}（本次 ${formatApproxWorkMinutes(summary.activeMinutes)}）`;
}

function formatApproxWorkMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.floor(minutes || 0));

  if (safeMinutes <= 0) {
    return "不足 1 分钟";
  }

  return `约 ${safeMinutes} 分钟`;
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

function formatDateTimeForDisplay(value?: string) {
  if (!value) {
    return "未开始";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProgressBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${width}%` }} />
    </div>
  );
}

function compareModelingTasks(a: ModelingTaskCard, b: ModelingTaskCard) {
  const statusDiff = statusOptions.indexOf(a.status) - statusOptions.indexOf(b.status);

  if (statusDiff !== 0) {
    return statusDiff;
  }

  const finishDiff = (a.plannedFinishDate ?? "9999-12-31").localeCompare(b.plannedFinishDate ?? "9999-12-31");

  if (finishDiff !== 0) {
    return finishDiff;
  }

  const projectDiff = a.projectName.localeCompare(b.projectName, "zh-CN");

  if (projectDiff !== 0) {
    return projectDiff;
  }

  return a.styleName.localeCompare(b.styleName, "zh-CN");
}

function compareStyleListTasks(a: ModelingTaskCard, b: ModelingTaskCard) {
  const sequenceDiff = compareStyleSequence(a.styleSequence, b.styleSequence);

  if (sequenceDiff !== 0) {
    return sequenceDiff;
  }

  if (a.isFirstModelingStyle !== b.isFirstModelingStyle) {
    return a.isFirstModelingStyle ? -1 : 1;
  }

  return a.styleName.localeCompare(b.styleName, "zh-CN", { numeric: true });
}

function compareStyleSequence(a?: string, b?: string) {
  const normalizedA = a?.trim() ?? "";
  const normalizedB = b?.trim() ?? "";
  const numericA = Number.parseInt(normalizedA, 10);
  const numericB = Number.parseInt(normalizedB, 10);
  const hasNumericA = Number.isFinite(numericA);
  const hasNumericB = Number.isFinite(numericB);

  if (hasNumericA && hasNumericB && numericA !== numericB) {
    return numericA - numericB;
  }

  if (hasNumericA !== hasNumericB) {
    return hasNumericA ? -1 : 1;
  }

  return normalizedA.localeCompare(normalizedB, "zh-CN", { numeric: true });
}

function buildCapacityRows(modelers: ModelerCapacity[], tasks: ModelingTaskCard[]): CapacityRow[] {
  return modelers.map((modeler) => {
    const queueTasks = tasks.filter((task) => task.modelerId === modeler.id && activeQueueStatuses.has(task.status));
    const weekTasks = queueTasks.filter(isThisWeekTask);
    const staleTasks = queueTasks.filter((task) => task.isStale);

    return {
      ...modeler,
      queueTasks,
      weekTasks,
      staleTasks,
      isOverloaded: queueTasks.length > modeler.weeklyAvailableWorkdays,
    };
  });
}

function buildLiveMetrics(tasks: ModelingTaskCard[], modelers: ModelerCapacity[]): ModelingMetric[] {
  const overloadedModelerCount = modelers.filter((modeler) => {
    return tasks.filter((task) => task.modelerId === modeler.id && activeQueueStatuses.has(task.status)).length > modeler.weeklyAvailableWorkdays;
  }).length;
  const stuckTasks = tasks.filter((task) => task.status === "修改中" || reviewBlockedStatuses.has(task.status) || Boolean(task.blockType));

  return [
    {
      label: "建模任务总数",
      value: tasks.length,
      helper: "不含已通过款式",
      tone: "neutral",
    },
    {
      label: "未分配款式数",
      value: tasks.filter((task) => !task.modelerId && !task.isOutsourced).length,
      helper: "负责人待手动录入",
      tone: "warning",
    },
    {
      label: "超载建模师数",
      value: overloadedModelerCount,
      helper: "排队款式超过每周可用工作日",
      tone: overloadedModelerCount > 0 ? "danger" : "neutral",
    },
    {
      label: "待验收 / 送审卡住款式数",
      value: stuckTasks.length,
      helper: "待验收、已送审、等反馈或修改阻塞",
      tone: stuckTasks.length > 0 ? "danger" : "info",
    },
  ];
}

function buildApprovedMetrics(tasks: ModelingTaskCard[]): ModelingMetric[] {
  const outsourcedTasks = tasks.filter((task) => task.isOutsourced).length;
  const modelerCount = new Set(tasks.map((task) => task.modelerId).filter(Boolean)).size;
  const projectCount = new Set(tasks.map((task) => task.projectId)).size;

  return [
    {
      label: "已通过款式数",
      value: tasks.length,
      helper: "只显示已通过款式",
      tone: "neutral",
    },
    {
      label: "涉及项目数",
      value: projectCount,
      helper: "按项目去重统计",
      tone: "info",
    },
    {
      label: "涉及建模师数",
      value: modelerCount,
      helper: "按负责人去重统计",
      tone: "neutral",
    },
    {
      label: "外包已通过款式数",
      value: outsourcedTasks,
      helper: "外包款式单独成行",
      tone: outsourcedTasks > 0 ? "info" : "neutral",
    },
  ];
}

function filterMilestoneOverview(
  overview: ModelingMilestoneOverview,
  search: string,
): ModelingMilestoneOverview {
  if (!search) {
    return overview;
  }

  const filterCards = (cards: ModelingMilestoneCard[]) => {
    return cards.filter((card) => {
      return [card.projectName, card.projectStage, card.riskMessage, card.statusLabel]
        .filter(Boolean)
        .some((value) => value?.includes(search));
    });
  };

  return {
    ...overview,
    previousUnfinished: filterCards(overview.previousUnfinished),
    currentMonth: filterCards(overview.currentMonth),
    nextMonth: filterCards(overview.nextMonth),
  };
}

function isThisWeekTask(task: ModelingTaskCard) {
  if (!task.plannedStartDate && !task.plannedFinishDate) {
    return activeQueueStatuses.has(task.status);
  }

  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const start = parseDate(task.plannedStartDate) ?? parseDate(task.plannedFinishDate);
  const finish = parseDate(task.plannedFinishDate) ?? start;

  if (!start || !finish) {
    return activeQueueStatuses.has(task.status);
  }

  return start <= sunday && finish >= monday;
}

function parseDate(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function isOriginalArtApproved(task: ModelingTaskCard) {
  const text = task.originalArtStatus.trim();

  if (text.includes("未") || text.includes("待") || text.includes("不通过") || text.includes("驳回")) {
    return false;
  }

  return Boolean(task.originalArtApprovedDate) || text.includes("已过审") || text.includes("过审") || text.includes("通过") || text.includes("确认");
}
