"use client";

import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  CalendarRange,
  CheckCircle2,
  Clock3,
  GripVertical,
  ListChecks,
  Loader2,
  PackageCheck,
  PenLine,
  Save,
  Search,
  Send,
  UserRound,
  UsersRound,
  Workflow,
} from "lucide-react";
import clsx from "clsx";
import { LogoutButton } from "@/components/auth/logout-button";
import type {
  ModelerCapacity,
  ModelingMilestoneCard,
  ModelingMilestoneOverview,
  ModelingMilestoneRiskLevel,
  ModelingMetric,
  ProjectModelingSummary,
  ModelingScheduleData,
  ModelingTaskCard,
  ModelingTaskStatus,
  ModelingTaskUpdateRequest,
  ModelingTaskUpdateResponse,
  OutsourceVendorOption,
} from "@/lib/modeling-schedule-types";

type CapacityRow = ModelerCapacity & {
  queueTasks: ModelingTaskCard[];
  weekTasks: ModelingTaskCard[];
  staleTasks: ModelingTaskCard[];
  isOverloaded: boolean;
};
type ModelingView = "milestones" | "management-board" | "style-board" | "profile";
type StyleBoardMode = "active" | "approved";

const activeQueueStatuses = new Set<ModelingTaskStatus>(["已排期", "建模中", "已送审", "等反馈", "外包中", "暂停"]);
const reviewBlockedStatuses = new Set<ModelingTaskStatus>(["已送审", "等反馈"]);
const statusOptions: ModelingTaskStatus[] = ["未分配", "已排期", "建模中", "已送审", "等反馈", "已通过", "外包中", "暂停", "取消"];
const formalModelingStatuses = new Set<ModelingTaskStatus>(["建模中", "已送审", "等反馈", "已通过", "外包中"]);

const statusMeta: Record<
  ModelingTaskStatus,
  {
    title: string;
    dotClass: string;
    cardClass: string;
    columnClass: string;
  }
> = {
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
  建模中: {
    title: "建模中",
    dotClass: "bg-blue-600",
    cardClass: "border-blue-200 bg-white",
    columnClass: "border-blue-200 bg-blue-50/60",
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

export function ModelingScheduleBoard({ data }: { data: ModelingScheduleData }) {
  const router = useRouter();
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
  const [selectedStyleTaskIds, setSelectedStyleTaskIds] = useState<Record<string, true>>({});

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
  const capacityRows = useMemo(() => buildCapacityRows(data.modelers, tasks), [data.modelers, tasks]);
  const styleCapacityRows = useMemo(
    () => buildCapacityRows(data.modelers, styleBoardMode === "approved" ? approvedTasks : tasks),
    [approvedTasks, data.modelers, styleBoardMode, tasks],
  );
  const filteredStyleTasks = styleBoardMode === "approved" ? filteredApprovedTasks : filteredTasks;
  const selectableStyleTaskIds = useMemo(
    () => filteredStyleTasks.filter((task) => !task.isVirtual).map((task) => task.id),
    [filteredStyleTasks],
  );
  const selectedStyleTaskCount = selectableStyleTaskIds.filter((taskId) => selectedStyleTaskIds[taskId]).length;
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

    void saveTaskUpdate(task, { modelerId });
    setSelectedTaskId(task.id);
    setDraggingTaskId(null);
  }

  async function saveTaskUpdate(task: ModelingTaskCard, payload: ModelingTaskUpdateRequest) {
    if (task.isVirtual) {
      setOperationMessage({ tone: "warning", text: "虚拟款式不能保存，请先由产品组工作指引录入真实款式。" });
      return;
    }

    if (payload.status && formalModelingStatuses.has(payload.status) && !isOriginalArtApproved(task)) {
      setOperationMessage({ tone: "danger", text: "原画未过审的款式不能进入正式建模、外包、送审或通过状态。" });
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

  function handleStyleBoardModeChange(nextMode: StyleBoardMode) {
    setStyleBoardMode(nextMode);
    setSelectedStyleTaskIds({});
  }

  function handleToggleStyleTaskSelection(task: ModelingTaskCard) {
    if (task.isVirtual) {
      setOperationMessage({ tone: "warning", text: "虚拟款式不能进入批量选择，请先录入真实款式。" });
      return;
    }

    setSelectedStyleTaskIds((current) => {
      if (current[task.id]) {
        return omitKey(current, task.id);
      }

      return { ...current, [task.id]: true };
    });
  }

  function handleSetStyleTaskSelection(taskIds: string[], selected: boolean) {
    setSelectedStyleTaskIds((current) => {
      if (selected) {
        return taskIds.reduce<Record<string, true>>((next, taskId) => {
          next[taskId] = true;
          return next;
        }, { ...current });
      }

      return taskIds.reduce<Record<string, true>>((next, taskId) => omitKey(next, taskId), current);
    });
  }

  function handleSelectAllVisibleStyleTasks() {
    handleSetStyleTaskSelection(selectableStyleTaskIds, true);
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
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
            <button
              onClick={() => router.push("/users")}
              className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              用户数据
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">基础</span>
            </button>
            <button
              onClick={() => router.push("/imports")}
              className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              数据导入
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">预览</span>
            </button>
          </nav>
          <LogoutButton />
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
                  : view === "management-board"
                    ? "管理层看板 · 总经理可见 · 本周任务、未分配、外包、卡审与耗时"
                    : view === "profile"
                      ? "个人信息 · 查看当前建模师名下款式"
                      : styleBoardMode === "approved"
                        ? "款式看板 · 已通过款式归档 · 按建模师分组"
                        : "款式看板副本 · 本周任务、未分配、外包、卡审与耗时"}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
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
                  onClick={() => setView("management-board")}
                  className={clsx(
                    "rounded-md px-3 text-sm font-semibold",
                    view === "management-board" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                  )}
                >
                  管理层看板
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

          {view === "milestones" ? (
            <MilestoneOverviewView
              overview={filteredMilestoneOverview}
              onOpenStyleBoard={(projectName) => {
                setSearch(projectName);
                setView("management-board");
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

              {view === "management-board" ? (
                <section className="mt-5 grid grid-cols-[300px_minmax(0,1fr)_340px] gap-4 max-2xl:grid-cols-[280px_minmax(0,1fr)] max-xl:grid-cols-1">
                  <div className="min-w-0">
                    <SectionTitle icon={<UsersRound size={18} />} title="建模师产能" helper="本周任务 / 排队款式 / 超载 / 产能" />
                    <div className="mt-3 grid gap-3">
                      {capacityRows.map((modeler) => (
                        <ModelerCapacityCard
                          key={modeler.id}
                          modeler={modeler}
                          showCapacity
                          onDrop={(event) => handleDropOnModeler(event, modeler.id)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <SectionTitle icon={<Boxes size={18} />} title="款式任务看板" helper={`当前显示 ${filteredTasks.length} 款`} />
                    <div className="mt-3 overflow-x-auto pb-2">
                      <div className="grid min-w-[2070px] grid-cols-9 gap-3">
                        {data.statusColumns.map((status) => {
                          const columnTasks = filteredTasks.filter((task) => task.status === status);

                          return (
                            <div
                              key={status}
                              className={clsx("rounded-lg border p-2", statusMeta[status].columnClass)}
                              onDragOver={(event) => {
                                if (status === "未分配") {
                                  event.preventDefault();
                                }
                              }}
                            >
                              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <span className={clsx("h-2.5 w-2.5 rounded-full", statusMeta[status].dotClass)} />
                                  {statusMeta[status].title}
                                </div>
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                                  {columnTasks.length}
                                </span>
                              </div>
                              <div className="grid gap-2">
                                {columnTasks.length > 0 ? (
                                  columnTasks.map((task) => (
                                    <TaskCard
                                      key={task.id}
                                      task={task}
                                      selected={selectedTask?.id === task.id}
                                      isDraft={Boolean(draftAssignments[task.id])}
                                      onClick={() => setSelectedTaskId(task.id)}
                                      onDragStart={(event) => handleDragStart(event, task)}
                                      onDragEnd={() => setDraggingTaskId(null)}
                                    />
                                  ))
                                ) : (
                                  <div className="rounded-md border border-dashed border-slate-200 bg-white/70 px-3 py-6 text-center text-xs text-slate-400">
                                    暂无款式
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <aside className="min-w-0 max-2xl:col-span-2 max-xl:col-span-1">
                    <div className="grid gap-4">
                      <ProjectProgressPanel projects={filteredProjectSummaries} />
                      <TaskDetailPanel
                        key={`${selectedTask?.id ?? "empty-task"}:${selectedTask?.status ?? ""}:${selectedTask?.outsourceVendorId ?? ""}:${selectedTask?.actualFinishDate ?? ""}`}
                        task={selectedTask}
                        vendors={data.vendors}
                        saving={selectedTask ? savingTaskId === selectedTask.id : false}
                        onSave={saveTaskUpdate}
                      />
                    </div>
                  </aside>
                </section>
              ) : (
                <section className="mt-5 grid grid-cols-[minmax(0,1fr)_340px] gap-4 max-xl:grid-cols-1">
                  <StyleBoardByModeler
                    modelers={styleCapacityRows}
                    tasks={filteredStyleTasks}
                    mode={styleBoardMode}
                    activeCount={tasks.length}
                    approvedCount={approvedTasks.length}
                    selectedTaskId={selectedTask?.id}
                    selectedTaskIds={selectedStyleTaskIds}
                    selectedCount={selectedStyleTaskCount}
                    selectableCount={selectableStyleTaskIds.length}
                    draftAssignments={draftAssignments}
                    onModeChange={handleStyleBoardModeChange}
                    onDropOnModeler={handleDropOnModeler}
                    onSelectTask={setSelectedTaskId}
                    onToggleTaskSelection={handleToggleStyleTaskSelection}
                    onSetTaskSelection={handleSetStyleTaskSelection}
                    onSelectAllVisible={handleSelectAllVisibleStyleTasks}
                    onClearSelection={() => setSelectedStyleTaskIds({})}
                    onDragStart={handleDragStart}
                    onDragEnd={() => setDraggingTaskId(null)}
                  />

                  <aside className="min-w-0">
                    <div className="grid gap-4">
                      <ProjectProgressPanel projects={filteredProjectSummaries} />
                      <TaskDetailPanel
                        key={`${selectedTask?.id ?? "empty-task"}:${selectedTask?.status ?? ""}:${selectedTask?.outsourceVendorId ?? ""}:${selectedTask?.actualFinishDate ?? ""}`}
                        task={selectedTask}
                        vendors={data.vendors}
                        saving={selectedTask ? savingTaskId === selectedTask.id : false}
                        onSave={saveTaskUpdate}
                      />
                    </div>
                  </aside>
                </section>
              )}
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

function ModelerCapacityCard({
  modeler,
  showCapacity,
  onDrop,
}: {
  modeler: CapacityRow;
  showCapacity: boolean;
  onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-modeler-drop-id={modeler.id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={clsx(
        "rounded-lg border bg-white p-3 transition",
        modeler.isOverloaded ? "border-rose-300 shadow-sm shadow-rose-100" : "border-slate-200",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="break-words text-sm font-semibold text-slate-900">{modeler.name}</div>
            {modeler.isVirtual ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">待补充人员名</span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-slate-500">{modeler.roleTitle}</div>
        </div>
        <div
          className={clsx(
            "rounded-md px-2 py-1 text-right text-xs font-semibold",
            modeler.isOverloaded ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600",
          )}
        >
          {modeler.queueTasks.length} 款
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {modeler.specialtyTags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
            {tag}
          </span>
        ))}
      </div>

      <div className={clsx("mt-3 grid gap-2 text-center text-xs", showCapacity ? "grid-cols-3" : "grid-cols-2")}>
        <MiniStat label="本周" value={modeler.weekTasks.length} />
        <MiniStat label="排队" value={modeler.queueTasks.length} />
        {showCapacity ? <MiniStat label="产能" value={modeler.weeklyCapacityStyles} /> : null}
      </div>

      {modeler.isOverloaded ? (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-700">
          <AlertTriangle size={14} />
          排队超过 4 款，已超载
        </div>
      ) : null}

      {modeler.staleTasks.length > 0 ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800">
          <Clock3 size={14} />
          {modeler.staleTasks.length} 款建模中超过 3 天未更新
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {modeler.weekTasks.slice(0, 4).map((task) => (
          <div
            key={task.id}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-xs hover:border-slate-300 hover:bg-white"
          >
            <div className="truncate font-medium text-slate-800">{task.styleName}</div>
            <div className="mt-0.5 truncate text-slate-500">{task.projectName}</div>
          </div>
        ))}
        {modeler.weekTasks.length === 0 ? <div className="rounded-md bg-slate-50 px-2 py-2 text-xs text-slate-400">本周暂无任务</div> : null}
      </div>
    </div>
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
                  {selectedModeler.isVirtual ? " · 待补充人员名" : ""}
                </div>
              ) : null}
            </div>
            {selectedModeler ? (
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
              <div className="text-xs font-medium text-slate-500">周产能</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{selectedModeler.weeklyCapacityStyles}</div>
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
  selectedTaskIds,
  selectedCount,
  selectableCount,
  draftAssignments,
  onModeChange,
  onDropOnModeler,
  onSelectTask,
  onToggleTaskSelection,
  onSetTaskSelection,
  onSelectAllVisible,
  onClearSelection,
  onDragStart,
  onDragEnd,
}: {
  modelers: CapacityRow[];
  tasks: ModelingTaskCard[];
  mode: StyleBoardMode;
  activeCount: number;
  approvedCount: number;
  selectedTaskId?: string;
  selectedTaskIds: Record<string, true>;
  selectedCount: number;
  selectableCount: number;
  draftAssignments: Record<string, string>;
  onModeChange: (mode: StyleBoardMode) => void;
  onDropOnModeler: (event: ReactDragEvent<HTMLDivElement>, modelerId: string) => void;
  onSelectTask: (taskId: string) => void;
  onToggleTaskSelection: (task: ModelingTaskCard) => void;
  onSetTaskSelection: (taskIds: string[], selected: boolean) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>, task: ModelingTaskCard) => void;
  onDragEnd: () => void;
}) {
  const isApprovedMode = mode === "approved";
  const unassignedTasks = tasks.filter((task) => !task.modelerId && !task.isOutsourced);
  const outsourcedTasks = tasks.filter((task) => task.isOutsourced && task.status !== "未分配");
  const allVisibleSelected = selectableCount > 0 && selectedCount === selectableCount;

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
        <div className="text-sm font-medium text-slate-600">
          当前结果 {selectableCount} 款
          {selectedCount > 0 ? <span className="ml-2 text-rose-700">已选择 {selectedCount} 款</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={allVisibleSelected ? onClearSelection : onSelectAllVisible}
            disabled={selectableCount === 0}
            className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {allVisibleSelected ? "取消全选" : "全选当前结果"}
          </button>
          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={onClearSelection}
              className="h-8 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              清空选择
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-3">
        <StyleBoardRow
          title="未分配"
          helper={isApprovedMode ? "已通过但负责人待补充" : "等待产品总监分配"}
          tasks={unassignedTasks}
          selectedTaskId={selectedTaskId}
          selectedTaskIds={selectedTaskIds}
          draftAssignments={draftAssignments}
          tone="warning"
          onSelectTask={onSelectTask}
          onToggleTaskSelection={onToggleTaskSelection}
          onSetTaskSelection={onSetTaskSelection}
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
              selectedTaskIds={selectedTaskIds}
              draftAssignments={draftAssignments}
              tone={!isApprovedMode && modeler.isOverloaded ? "danger" : "neutral"}
              onDrop={isApprovedMode ? undefined : (event) => onDropOnModeler(event, modeler.id)}
              onSelectTask={onSelectTask}
              onToggleTaskSelection={onToggleTaskSelection}
              onSetTaskSelection={onSetTaskSelection}
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
            selectedTaskIds={selectedTaskIds}
            draftAssignments={draftAssignments}
            tone="info"
            onSelectTask={onSelectTask}
            onToggleTaskSelection={onToggleTaskSelection}
            onSetTaskSelection={onSetTaskSelection}
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
  selectedTaskIds,
  draftAssignments,
  tone,
  onDrop,
  onSelectTask,
  onToggleTaskSelection,
  onSetTaskSelection,
  onDragStart,
  onDragEnd,
}: {
  title: string;
  helper: string;
  tasks: ModelingTaskCard[];
  selectedTaskId?: string;
  selectedTaskIds: Record<string, true>;
  draftAssignments: Record<string, string>;
  tone: "neutral" | "warning" | "danger" | "info";
  onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onSelectTask: (taskId: string) => void;
  onToggleTaskSelection: (task: ModelingTaskCard) => void;
  onSetTaskSelection: (taskIds: string[], selected: boolean) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>, task: ModelingTaskCard) => void;
  onDragEnd: () => void;
}) {
  const rowClass = {
    neutral: "border-slate-200 bg-white",
    warning: "border-amber-200 bg-amber-50/75",
    danger: "border-rose-200 bg-rose-50/75",
    info: "border-cyan-200 bg-cyan-50/70",
  }[tone];
  const selectableTaskIds = tasks.filter((task) => !task.isVirtual).map((task) => task.id);
  const selectedCount = selectableTaskIds.filter((taskId) => selectedTaskIds[taskId]).length;
  const allSelected = selectableTaskIds.length > 0 && selectedCount === selectableTaskIds.length;

  return (
    <div
      onDragOver={onDrop ? (event) => event.preventDefault() : undefined}
      onDrop={onDrop}
      className={clsx("grid grid-cols-[150px_minmax(0,1fr)] gap-3 rounded-lg border p-3 max-md:grid-cols-1", rowClass)}
    >
      <div className="min-w-0">
        <div className="break-words text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-xs font-medium text-slate-500">{helper}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSetTaskSelection(selectableTaskIds, !allSelected)}
            disabled={selectableTaskIds.length === 0}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {allSelected ? "取消本行" : "选择本行"}
          </button>
          {selectedCount > 0 ? (
            <span className="inline-flex h-8 items-center rounded-md bg-white px-2 text-xs font-semibold text-rose-700">
              已选 {selectedCount}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto pb-1">
        <div className="flex min-h-[104px] gap-2">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <CompactTaskCard
                key={task.id}
                task={task}
                selected={selectedTaskId === task.id}
                checked={Boolean(selectedTaskIds[task.id])}
                isDraft={Boolean(draftAssignments[task.id])}
                onClick={() => onSelectTask(task.id)}
                onToggleSelected={() => onToggleTaskSelection(task)}
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
  checked,
  isDraft,
  onClick,
  onToggleSelected,
  onDragStart,
  onDragEnd,
}: {
  task: ModelingTaskCard;
  selected: boolean;
  checked: boolean;
  isDraft: boolean;
  onClick: () => void;
  onToggleSelected: () => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const draggable = task.canDragAssign;
  const selectable = !task.isVirtual;

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
        checked ? "border-rose-300 bg-rose-50/70" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 break-words text-sm font-semibold text-slate-900">{task.styleName}</div>
        <button
          type="button"
          aria-label={checked ? "取消选择款式" : "选择款式"}
          aria-pressed={checked}
          disabled={!selectable}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelected();
          }}
          className={clsx(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition",
            checked ? "border-rose-500 bg-rose-600 text-white" : "border-slate-300 bg-white text-transparent hover:border-rose-300",
            !selectable ? "cursor-not-allowed border-slate-200 bg-slate-100" : "",
          )}
        >
          <CheckCircle2 size={15} />
        </button>
      </div>
      <div className="mt-1 truncate text-xs text-slate-500">{task.projectName}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{task.status}</span>
        {task.isVirtual ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">虚拟</span> : null}
        {isDraft ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">草稿</span> : null}
        {task.isStale ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">未更新</span> : null}
      </div>
      <div className="mt-2 truncate text-xs text-slate-500">{task.modelerName ?? task.outsourceVendorName ?? "待分配"}</div>
    </div>
  );
}

function TaskCard({
  task,
  selected,
  isDraft,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  task: ModelingTaskCard;
  selected: boolean;
  isDraft: boolean;
  onClick: () => void;
  onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  const draggable = task.canDragAssign;

  return (
    <button
      data-modeling-task-id={task.id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={clsx(
        "min-h-[168px] rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm",
        statusMeta[task.status].cardClass,
        selected ? "ring-2 ring-rose-300" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-slate-900">{task.styleName}</div>
          <div className="mt-1 break-words text-xs text-slate-500">{task.projectName}</div>
        </div>
        {draggable ? <GripVertical className="shrink-0 text-slate-300" size={16} /> : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {task.isVirtual ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">虚拟</span>
        ) : null}
        {isDraft ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">草稿</span>
        ) : null}
        {task.isOutsourced ? (
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">外包</span>
        ) : null}
        {task.reviewRound > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">第 {task.reviewRound} 轮</span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <MiniStat label="预估" value={`${task.estimatedWorkdays} 天`} />
        <MiniStat label="已耗" value={`${task.consumedWorkdays} 天`} />
      </div>

      <div className="mt-3 grid gap-1 text-xs text-slate-500">
        <div className="truncate">负责人：{task.modelerName ?? task.outsourceVendorName ?? "待分配"}</div>
        <div className="truncate">难度：{task.difficulty}</div>
      </div>

      {task.isStale ? (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
          <AlertTriangle size={13} />
          {task.staleDays} 天未更新
        </div>
      ) : null}
    </button>
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

function TaskDetailPanel({
  task,
  vendors,
  saving,
  onSave,
}: {
  task?: ModelingTaskCard;
  vendors: OutsourceVendorOption[];
  saving: boolean;
  onSave: (task: ModelingTaskCard, payload: ModelingTaskUpdateRequest) => Promise<void>;
}) {
  const realVendors = useMemo(() => vendors.filter((vendor) => !vendor.isVirtual), [vendors]);
  const [nextStatus, setNextStatus] = useState<ModelingTaskStatus>(task?.status ?? "未分配");
  const [vendorId, setVendorId] = useState(task?.outsourceVendorId ?? realVendors[0]?.id ?? "");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [actualFinishDate, setActualFinishDate] = useState(task?.actualFinishDate ?? todayDateString());

  if (!task) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        暂无款式详情
      </section>
    );
  }

  const currentTask = task;
  const disabled = saving || currentTask.isVirtual;
  const canSaveFeedback = !disabled && feedbackContent.trim().length > 0;

  function handleSaveStatus() {
    const payload: ModelingTaskUpdateRequest = { status: nextStatus };

    if (nextStatus === "已通过") {
      payload.actualFinishDate = actualFinishDate || todayDateString();
    }

    void onSave(currentTask, payload);
  }

  function handleOutsource() {
    if (!vendorId) {
      return;
    }

    void onSave(currentTask, {
      isOutsourced: true,
      outsourceVendorId: vendorId,
      status: "外包中",
    });
  }

  function handleRecordFeedback(status: ModelingTaskStatus, feedbackType: string, blockType?: string) {
    if (!feedbackContent.trim()) {
      return;
    }

    const payload: ModelingTaskUpdateRequest = {
      status,
      feedbackType,
      feedbackContent: feedbackContent.trim(),
      blockType,
    };

    if (status === "已通过") {
      payload.actualFinishDate = actualFinishDate || todayDateString();
    }

    void onSave(currentTask, payload);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionTitle icon={<UserRound size={18} />} title="款式详情" helper={task.status} compact />
      <div className="mt-3">
        <div className="break-words text-base font-semibold text-slate-900">{task.styleName}</div>
        <div className="mt-1 break-words text-sm text-slate-500">{task.projectName}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <DetailItem label="款式编号" value={task.styleCode} />
        <DetailItem label="原画状态" value={task.originalArtStatus} />
        <DetailItem label="负责人" value={task.modelerName ?? task.outsourceVendorName ?? "待分配"} />
        <DetailItem label="难度" value={task.difficulty} />
        <DetailItem label="预估工期" value={`${task.estimatedWorkdays} 天`} />
        <DetailItem label="已消耗" value={`${task.consumedWorkdays} 天`} />
        <DetailItem label="计划开始" value={task.plannedStartDate ?? "待定"} />
        <DetailItem label="计划完成" value={task.plannedFinishDate ?? "待定"} />
      </div>

      {task.isStale ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          建模中已 {task.staleDays} 天未更新，需要跟进。
        </div>
      ) : null}

      {reviewBlockedStatuses.has(task.status) || task.blockType ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          <div className="font-semibold">{task.blockType ?? "送审 / 等反馈"}</div>
          <div className="mt-1 leading-5">{task.latestFeedback ?? "等待补充本轮检修问题和版权方反馈。"}</div>
        </div>
      ) : null}

      {task.isVirtual ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          当前是虚拟款式，只能做前端草稿。保存分配、状态、外包和反馈前，需要先录入真实款式。
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4">
        <div className="grid gap-2">
          <label className="text-xs font-semibold text-slate-500">状态推进</label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as ModelingTaskStatus)}
              disabled={disabled}
              className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-100"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveStatus}
              disabled={disabled}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              保存
            </button>
          </div>
          {nextStatus === "已通过" ? (
            <input
              type="date"
              value={actualFinishDate}
              onChange={(event) => setActualFinishDate(event.target.value)}
              disabled={disabled}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-100"
            />
          ) : null}
        </div>

        <div className="grid gap-2">
          <label className="text-xs font-semibold text-slate-500">外包供应商</label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
              disabled={disabled || realVendors.length === 0}
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
              disabled={disabled || realVendors.length === 0 || !vendorId}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <PackageCheck size={15} />
              外包
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-xs font-semibold text-slate-500">检修 / 送审记录</label>
          <textarea
            value={feedbackContent}
            onChange={(event) => setFeedbackContent(event.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="填写本轮问题、反馈或通过说明"
            className="min-h-[84px] resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-100"
          />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button
              onClick={() => handleRecordFeedback("已送审", "送审记录", "送审中")}
              disabled={!canSaveFeedback}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 font-semibold text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Send size={14} />
              已送审
            </button>
            <button
              onClick={() => handleRecordFeedback("等反馈", "版权方反馈", "等版权方反馈")}
              disabled={!canSaveFeedback}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Clock3 size={14} />
              等反馈
            </button>
            <button
              onClick={() => handleRecordFeedback("建模中", "修改意见")}
              disabled={!canSaveFeedback}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 font-semibold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <PenLine size={14} />
              修改中
            </button>
            <button
              onClick={() => handleRecordFeedback("已通过", "通过记录")}
              disabled={!canSaveFeedback}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <CheckCircle2 size={14} />
              已通过
            </button>
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
      isOverloaded: queueTasks.length > 4,
    };
  });
}

function buildLiveMetrics(tasks: ModelingTaskCard[], modelers: ModelerCapacity[]): ModelingMetric[] {
  const overloadedModelerCount = modelers.filter((modeler) => {
    return tasks.filter((task) => task.modelerId === modeler.id && activeQueueStatuses.has(task.status)).length > 4;
  }).length;
  const stuckTasks = tasks.filter((task) => reviewBlockedStatuses.has(task.status) || task.blockType?.includes("修改"));

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
      helper: "排队款式超过 4 个",
      tone: overloadedModelerCount > 0 ? "danger" : "neutral",
    },
    {
      label: "修改 / 送审卡住款式数",
      value: stuckTasks.length,
      helper: "已送审、等反馈或修改阻塞",
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

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}
