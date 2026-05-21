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
  Search,
  UserRound,
  UsersRound,
  Workflow,
} from "lucide-react";
import clsx from "clsx";
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
} from "@/lib/modeling-schedule-types";

type CapacityRow = ModelerCapacity & {
  queueTasks: ModelingTaskCard[];
  weekTasks: ModelingTaskCard[];
  staleTasks: ModelingTaskCard[];
  isOverloaded: boolean;
};
type ModelingView = "milestones" | "style-board";

const activeQueueStatuses = new Set<ModelingTaskStatus>(["已排期", "建模中", "已送审", "等反馈", "外包中", "暂停"]);
const reviewBlockedStatuses = new Set<ModelingTaskStatus>(["已送审", "等反馈"]);

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
  const [search, setSearch] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(data.tasks[0]?.id ?? "");
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string>>({});
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const modelerById = useMemo(() => new Map(data.modelers.map((modeler) => [modeler.id, modeler])), [data.modelers]);
  const visibleSearch = search.trim();
  const tasks = useMemo(() => {
    return data.tasks.map((task) => {
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
  }, [data.tasks, draftAssignments, modelerById]);
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
  const metrics = useMemo(() => buildLiveMetrics(tasks, data.modelers), [data.modelers, tasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const capacityRows = useMemo(() => buildCapacityRows(data.modelers, tasks), [data.modelers, tasks]);
  const filteredProjectSummaries = useMemo(() => {
    return data.projectSummaries.filter((project) => !visibleSearch || project.projectName.includes(visibleSearch));
  }, [data.projectSummaries, visibleSearch]);
  const filteredMilestoneOverview = useMemo(() => {
    return filterMilestoneOverview(data.milestoneOverview, visibleSearch);
  }, [data.milestoneOverview, visibleSearch]);
  const draftCount = Object.keys(draftAssignments).length;

  function handleDragStart(event: ReactDragEvent<HTMLButtonElement>, task: ModelingTaskCard) {
    if (!task.canDragAssign || task.status !== "未分配") {
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

    if (!task || task.status !== "未分配") {
      return;
    }

    setDraftAssignments((current) => ({ ...current, [task.id]: modelerId }));
    setSelectedTaskId(task.id);
    setDraggingTaskId(null);
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
          </nav>
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
                  : "本周任务、未分配、外包、卡审与耗时"}
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
                  onClick={() => setView("style-board")}
                  className={clsx(
                    "rounded-md px-3 text-sm font-semibold",
                    view === "style-board" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                  )}
                >
                  款式看板
                </button>
              </div>
              <div className="relative w-[320px] max-w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={view === "milestones" ? "搜索项目或阶段" : "搜索项目、款式、建模师"}
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
                setView("style-board");
              }}
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
                  <span>已形成 {draftCount} 条前端分配草稿，尚未写入数据库。</span>
                  <button
                    onClick={() => setDraftAssignments({})}
                    className="rounded-md border border-sky-200 bg-white px-2.5 py-1 font-semibold text-sky-800 hover:bg-sky-100"
                  >
                    清空草稿
                  </button>
                </div>
              ) : null}

              <section className="mt-5 grid grid-cols-[300px_minmax(0,1fr)_340px] gap-4 max-2xl:grid-cols-[280px_minmax(0,1fr)] max-xl:grid-cols-1">
                <div className="min-w-0">
                  <SectionTitle icon={<UsersRound size={18} />} title="建模师产能" helper="本周任务 / 排队款式 / 超载" />
                  <div className="mt-3 grid gap-3">
                    {capacityRows.map((modeler) => (
                      <ModelerCapacityCard
                        key={modeler.id}
                        modeler={modeler}
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
                    <TaskDetailPanel task={selectedTask} />
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
  onDrop,
}: {
  modeler: CapacityRow;
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

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <MiniStat label="本周" value={modeler.weekTasks.length} />
        <MiniStat label="排队" value={modeler.queueTasks.length} />
        <MiniStat label="产能" value={modeler.weeklyCapacityStyles} />
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
  const draggable = task.canDragAssign && task.status === "未分配";

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
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionTitle icon={<CheckCircle2 size={18} />} title="项目建模进度" helper={`${projects.length} 个项目`} compact />
      <div className="mt-3 max-h-[430px] overflow-y-auto pr-1">
        <div className="grid gap-3">
          {projects.map((project) => (
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
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskDetailPanel({ task }: { task?: ModelingTaskCard }) {
  if (!task) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        暂无款式详情
      </section>
    );
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
      helper: "按款式统计，虚拟款式会标注",
      tone: "neutral",
    },
    {
      label: "未分配款式数",
      value: tasks.filter((task) => task.status === "未分配").length,
      helper: "未进入建模师队列",
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
