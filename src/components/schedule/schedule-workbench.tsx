"use client";

import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FilePenLine,
  Gauge,
  ListFilter,
  Plus,
  Save,
  Search,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import clsx from "clsx";
import { AccountPanel } from "@/components/auth/account-panel";
import type { AuthUser } from "@/lib/auth/permissions";
import {
  type CalendarProject,
  type Metric,
  type Milestone,
  type ProjectCard,
  type ProjectDetail,
  type RiskLevel,
  type ScheduleWorkbenchData,
  type ScheduleTaskRow,
} from "@/lib/sample-schedule";

type MainView = "planning" | "forecast";
type PlanningView = "milestone-plan" | "calendar" | "table" | "task-detail" | "project-entry";
type ViewMode = "plan" | "forecast";
type MonthPoint = { year: number; month: number };
type CalendarMoveDraft = {
  projectId: string;
  projectName: string;
  fromMonth: string;
  toMonth: string;
  fromDate: string;
  toDate: string;
  riskLevel: RiskLevel;
};
type CalendarCycleOption = {
  startMonth: string;
  label: string;
  rangeLabel: string;
  months: string[];
};

const riskLabel: Record<RiskLevel, string> = {
  done: "已完成",
  doneLate: "延期完成",
  normal: "正常推进",
  risk: "延期风险",
  delay: "必然延期",
};

const cardClass: Record<RiskLevel, string> = {
  done: "border-emerald-200 bg-emerald-100 text-emerald-950",
  doneLate: "border-emerald-700 bg-emerald-700 text-white",
  normal: "border-slate-200 bg-white text-slate-900",
  risk: "border-amber-300 bg-amber-100 text-amber-950",
  delay: "border-red-500 bg-red-500 text-white",
};

const badgeClass: Record<RiskLevel, string> = {
  done: "bg-emerald-100 text-emerald-800",
  doneLate: "bg-emerald-800 text-white",
  normal: "bg-slate-100 text-slate-700",
  risk: "bg-amber-100 text-amber-800",
  delay: "bg-red-100 text-red-700",
};

const riskAccentClass: Record<RiskLevel, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-900",
  doneLate: "border-emerald-700 bg-emerald-50 text-emerald-950",
  normal: "border-blue-200 bg-blue-50 text-blue-900",
  risk: "border-amber-200 bg-amber-50 text-amber-900",
  delay: "border-red-200 bg-red-50 text-red-900",
};

const metricToneClass = [
  "border-slate-200 bg-white",
  "border-amber-200 bg-amber-50/70",
  "border-red-200 bg-red-50/70",
  "border-blue-200 bg-blue-50/70",
];

const planningViewLabel: Record<PlanningView, string> = {
  "milestone-plan": "里程碑看板（规划）",
  calendar: "上线日历",
  table: "表格视图",
  "task-detail": "任务明细",
  "project-entry": "项目录入视图",
};

export function ScheduleWorkbench({ currentUser, data }: { currentUser: AuthUser; data: ScheduleWorkbenchData }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [milestone, setMilestone] = useState<Milestone | "全部里程碑">("全部里程碑");
  const [riskOnly, setRiskOnly] = useState(false);
  const [mainView, setMainView] = useState<MainView>("planning");
  const [planningView, setPlanningView] = useState<PlanningView>("milestone-plan");
  const [selectedCalendarCycleStart, setSelectedCalendarCycleStart] = useState(data.calendarMonths[0] ?? "");
  const [calendarDateOverrides, setCalendarDateOverrides] = useState<Record<string, string>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string>(data.projectCards[0]?.projectId ?? "");
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [operationTone, setOperationTone] = useState<"info" | "warning">("info");
  const [isSavingCalendarDrafts, setIsSavingCalendarDrafts] = useState(false);

  const visibleCards = useMemo(() => {
    return data.projectCards.filter((card) => {
      const matchSearch = !search.trim() || card.name.includes(search.trim());
      const matchMilestone = milestone === "全部里程碑" || card.milestone === milestone;
      const matchRisk = !riskOnly || card.riskLevel === "risk" || card.riskLevel === "delay";
      return matchSearch && matchMilestone && matchRisk;
    });
  }, [data.projectCards, milestone, riskOnly, search]);

  const calendarProjects = useMemo(() => {
    return data.calendarProjects.map((project) => {
      const plannedLaunchDate = calendarDateOverrides[project.projectId] ?? project.plannedLaunchDate;

      return {
        ...project,
        month: monthLabelFromDateString(plannedLaunchDate) ?? project.month,
        plannedLaunchDate,
      };
    });
  }, [calendarDateOverrides, data.calendarProjects]);
  const calendarCycleOptions = useMemo(() => {
    return buildCalendarCycleOptions(data.calendarMonths, calendarProjects);
  }, [calendarProjects, data.calendarMonths]);
  const selectedCalendarCycle =
    calendarCycleOptions.find((option) => option.startMonth === selectedCalendarCycleStart) ?? calendarCycleOptions[0];
  const selectedCalendarMonths = selectedCalendarCycle?.months ?? data.calendarMonths;

  const visibleCalendarProjects = useMemo(() => {
    return calendarProjects.filter((project) => {
      const matchSearch = !search.trim() || project.name.includes(search.trim());
      const matchRisk = !riskOnly || project.riskLevel === "risk" || project.riskLevel === "delay";
      return matchSearch && matchRisk;
    });
  }, [calendarProjects, riskOnly, search]);

  const visibleScheduleTaskRows = useMemo(() => {
    return data.scheduleTasks.filter((task) => {
      const keyword = search.trim();
      const matchSearch = !keyword || task.projectName.includes(keyword) || task.taskName.includes(keyword);
      const matchRisk = !riskOnly || task.riskLevel === "risk" || task.riskLevel === "delay";

      return matchSearch && matchRisk;
    });
  }, [data.scheduleTasks, riskOnly, search]);

  const calendarDrafts = useMemo(() => {
    return Object.entries(calendarDateOverrides)
      .map(([projectId, toDate]): CalendarMoveDraft | null => {
        const project = data.calendarProjects.find((item) => item.projectId === projectId);

        if (!project || project.plannedLaunchDate === toDate) {
          return null;
        }

        return {
          projectId,
          projectName: project.name,
          fromMonth: project.month,
          toMonth: monthLabelFromDateString(toDate) ?? project.month,
          fromDate: project.plannedLaunchDate,
          toDate,
          riskLevel: project.riskLevel,
        };
      })
      .filter((item): item is CalendarMoveDraft => item !== null);
  }, [calendarDateOverrides, data.calendarProjects]);
  const movedCalendarProjectIds = useMemo(() => new Set(calendarDrafts.map((draft) => draft.projectId)), [calendarDrafts]);
  const isTaskDetailView = mainView === "planning" && planningView === "task-detail";
  const isPlanningCalendarLikeView = mainView === "planning" && planningView !== "milestone-plan";
  const isMilestoneBoardView = mainView === "forecast" || (mainView === "planning" && planningView === "milestone-plan");
  const visibleProjectIds = useMemo(() => {
    if (isTaskDetailView) {
      return Array.from(new Set(visibleScheduleTaskRows.map((task) => task.projectId)));
    }

    return isPlanningCalendarLikeView
      ? visibleCalendarProjects.map((project) => project.projectId)
      : visibleCards.map((card) => card.projectId);
  }, [isPlanningCalendarLikeView, isTaskDetailView, visibleCalendarProjects, visibleCards, visibleScheduleTaskRows]);
  const activeProjectId =
    visibleProjectIds.length > 0 && !visibleProjectIds.includes(selectedProjectId) ? visibleProjectIds[0] : selectedProjectId;
  const selectedProject = data.projectDetails[activeProjectId] ?? fallbackDetail(activeProjectId, data.projectCards);
  const dateRangeLabel =
    isPlanningCalendarLikeView && selectedCalendarMonths.length > 0
      ? `${selectedCalendarMonths[0]} - ${selectedCalendarMonths[selectedCalendarMonths.length - 1]}`
      : data.months.length > 0
        ? `${data.months[0]} - ${data.months[data.months.length - 1]}`
        : "暂无排期月份";
  const focusMonthLabel = data.initialMonth ? `初始定位：${data.initialMonth}` : "暂无初始定位";
  const visibleProjectCount = isTaskDetailView
    ? visibleScheduleTaskRows.length
    : isPlanningCalendarLikeView
      ? visibleCalendarProjects.length
      : visibleCards.length;
  const filterSummary = riskOnly ? "只看延期风险与必然延期" : "显示全部状态";
  const currentViewLabel = mainView === "forecast" ? "压力预测" : planningViewLabel[planningView];

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
            <button className="flex h-10 items-center justify-between rounded-lg bg-rose-50 px-3 text-sm font-semibold text-rose-700">
              项目排期
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs">P0</span>
            </button>
            <button
              onClick={() => router.push("/product-guide")}
              className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              产品组工作指引
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">P0</span>
            </button>
            <button
              onClick={() => router.push("/modeling")}
              className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              建模排期
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">P0</span>
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
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="min-w-0 px-6 py-5 max-md:px-4">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                  <CalendarRange size={14} />
                  {dateRangeLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                  <Clock3 size={14} />
                  {focusMonthLabel}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">项目排期</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{currentViewLabel}</span>
                <span className="text-slate-300">/</span>
                <span>{filterSummary}</span>
                <span className="text-slate-300">/</span>
                <span>当前筛选 {visibleProjectCount} 条</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={<Database size={16} />} label="重新测算" onClick={handleAnalyze} />
              <ActionButton
                icon={<Download size={16} />}
                label="导出视图"
                onClick={() => notifyPlaceholder("导出视图会在真实数据版看板稳定后开放。")}
              />
            </div>
          </header>

          {operationMessage ? (
            <div
              className={clsx(
                "mt-4 rounded-lg border px-3 py-2 text-sm",
                operationTone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-blue-200 bg-blue-50 text-blue-900",
              )}
            >
              {operationMessage}
            </div>
          ) : null}

          <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-slate-600">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Upload size={16} />
                  项目主数据导入
                </div>
                <p className="mt-1 text-xs text-slate-500">Excel 导入必须先生成预览并校验，确认后才会写入项目主数据。</p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/imports")}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Upload size={14} />
                打开数据导入
              </button>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {data.metrics.map((metric, index) => (
              <MetricCard key={metric.label} metric={metric} index={index} />
            ))}
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex h-9 rounded-lg bg-slate-100 p-1">
                  <button
                    onClick={() => setMainView("planning")}
                    className={clsx(
                      "rounded-md px-3 text-sm font-semibold",
                      mainView === "planning" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                    )}
                  >
                    规划视图
                  </button>
                  <button
                    onClick={() => setMainView("forecast")}
                    className={clsx(
                      "rounded-md px-3 text-sm font-semibold",
                      mainView === "forecast" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                    )}
                  >
                    压力预测
                  </button>
                </div>
                {mainView === "planning" ? (
                  <div className="inline-flex h-9 rounded-lg bg-slate-100 p-1">
                    <PlanningViewButton
                      active={planningView === "milestone-plan"}
                      icon={<CalendarRange size={15} />}
                      label="里程碑看板（规划）"
                      onClick={() => setPlanningView("milestone-plan")}
                    />
                    <PlanningViewButton
                      active={planningView === "calendar"}
                      icon={<CalendarDays size={15} />}
                      label="上线日历"
                      onClick={() => setPlanningView("calendar")}
                    />
                    <PlanningViewButton
                      active={planningView === "table"}
                      icon={<Table2 size={15} />}
                      label="表格视图"
                      onClick={() => setPlanningView("table")}
                    />
                    <PlanningViewButton
                      active={planningView === "task-detail"}
                      icon={<ListFilter size={15} />}
                      label="任务明细"
                      onClick={() => setPlanningView("task-detail")}
                    />
                    <PlanningViewButton
                      active={planningView === "project-entry"}
                      icon={<FilePenLine size={15} />}
                      label="项目录入视图"
                      onClick={() => setPlanningView("project-entry")}
                    />
                  </div>
                ) : null}
                <label className="flex h-9 min-w-64 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder="搜索项目名称"
                  />
                </label>
                {isMilestoneBoardView ? (
                  <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                    <ListFilter size={15} />
                    <select
                      value={milestone}
                      onChange={(event) => setMilestone(event.target.value as Milestone | "全部里程碑")}
                      className="bg-transparent text-slate-900 outline-none"
                    >
                      <option>全部里程碑</option>
                      {data.milestones.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  onClick={() => setRiskOnly((value) => !value)}
                  className={clsx(
                    "inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold",
                    riskOnly ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600",
                  )}
                >
                  <Bell size={15} />
                  只看风险
                </button>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                <Legend color="bg-emerald-500" label="已完成" />
                <Legend color="bg-emerald-800" label="延期完成" />
                <Legend color="bg-white ring-1 ring-slate-300" label="正常推进" />
                <Legend color="bg-amber-400" label="延期风险" />
                <Legend color="bg-red-500" label="必然延期" />
              </div>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
            {mainView === "forecast" ? (
              <ScheduleBoard
                months={data.months}
                initialMonth={data.initialMonth}
                milestones={data.milestones}
                cards={visibleCards}
                selectedProjectId={activeProjectId}
                viewMode="forecast"
                onSelect={setSelectedProjectId}
              />
            ) : planningView === "milestone-plan" ? (
              <ScheduleBoard
                months={data.months}
                initialMonth={data.initialMonth}
                milestones={data.milestones}
                cards={visibleCards}
                selectedProjectId={activeProjectId}
                viewMode="plan"
                onSelect={setSelectedProjectId}
              />
            ) : planningView === "calendar" ? (
              <LaunchCalendarView
                months={selectedCalendarMonths}
                projects={visibleCalendarProjects}
                cycleOptions={calendarCycleOptions}
                selectedCycleStart={selectedCalendarCycle?.startMonth ?? ""}
                onCycleChange={setSelectedCalendarCycleStart}
                selectedProjectId={activeProjectId}
                onSelect={setSelectedProjectId}
                onMoveProject={handleCalendarMove}
                onPlanDateChange={handleCalendarPlanDateChange}
                movedProjectIds={movedCalendarProjectIds}
                drafts={calendarDrafts}
                onClearDrafts={clearCalendarDrafts}
                onSaveDrafts={saveCalendarDrafts}
                isSavingDrafts={isSavingCalendarDrafts}
              />
            ) : planningView === "table" ? (
              <PlanningTableView
                projects={visibleCalendarProjects}
                selectedProjectId={activeProjectId}
                onSelect={setSelectedProjectId}
                onNotify={notifyOperation}
                onSaved={handlePlanningTableSaved}
              />
            ) : planningView === "task-detail" ? (
              <TaskDetailView
                tasks={visibleScheduleTaskRows}
                selectedProjectId={activeProjectId}
                onSelect={setSelectedProjectId}
                onNotify={notifyOperation}
              />
            ) : (
              <ProjectEntryView project={selectedProject} onNotify={notifyPlaceholder} />
            )}
            <ProjectDetailPanel project={selectedProject} />
          </div>
        </main>
      </div>
    </div>
  );

  function notifyPlaceholder(message: string) {
    notifyOperation(message);
  }

  function notifyOperation(message: string, tone: "info" | "warning" = "info") {
    setOperationTone(tone);
    setOperationMessage(message);
  }

  async function handlePlanningTableSaved(message: string) {
    setOperationTone("info");
    setOperationMessage(`${message} 正在重新测算...`);

    const analyzeResult = await requestScheduleAnalyze();

    setCalendarDateOverrides({});
    setOperationTone(analyzeResult.ok ? "info" : "warning");
    setOperationMessage(
      analyzeResult.ok ? `${message} 重新测算已完成。` : `${message} 但重新测算未完成：${analyzeResult.message}`,
    );
    router.refresh();
  }

  function handleCalendarMove(projectId: string, month: string) {
    const project = calendarProjects.find((item) => item.projectId === projectId);
    const originalProject = data.calendarProjects.find((item) => item.projectId === projectId);
    if (!project) {
      return;
    }

    const targetDate = dateStringInTargetMonth(project.plannedLaunchDate, month);
    if (!targetDate) {
      return;
    }

    setCalendarDateOverrides((value) => {
      const nextValue = { ...value };

      if (originalProject?.plannedLaunchDate === targetDate) {
        delete nextValue[projectId];
      } else {
        nextValue[projectId] = targetDate;
      }

      return nextValue;
    });
    setSelectedProjectId(projectId);
    setOperationTone(originalProject?.plannedLaunchDate === targetDate ? "info" : "warning");
    setOperationMessage(
      originalProject?.plannedLaunchDate === targetDate
        ? `${project.name} 已移回原计划上线日期 ${targetDate}。`
        : `${project.name} 计划上线已调整为 ${targetDate}。当前是规划草稿，保存后会回写项目信息表并触发重新测算。`,
    );
  }

  function handleCalendarPlanDateChange(projectId: string, plannedLaunchDate: string) {
    const project = data.calendarProjects.find((item) => item.projectId === projectId);

    if (!project || !isValidDateString(plannedLaunchDate)) {
      return;
    }

    setCalendarDateOverrides((value) => {
      const nextValue = { ...value };

      if (project.plannedLaunchDate === plannedLaunchDate) {
        delete nextValue[projectId];
      } else {
        nextValue[projectId] = plannedLaunchDate;
      }

      return nextValue;
    });
    setSelectedProjectId(projectId);
    setOperationTone(project.plannedLaunchDate === plannedLaunchDate ? "info" : "warning");
    setOperationMessage(
      project.plannedLaunchDate === plannedLaunchDate
        ? `${project.name} 已恢复原计划上线日期 ${plannedLaunchDate}。`
        : `${project.name} 计划上线已调整为 ${plannedLaunchDate}。当前是规划草稿，保存后会回写项目信息表并触发重新测算。`,
    );
  }

  function clearCalendarDrafts() {
    setCalendarDateOverrides({});
    setOperationTone("info");
    setOperationMessage("已清空上线日历的规划草稿。");
  }

  async function saveCalendarDrafts() {
    if (calendarDrafts.length === 0 || isSavingCalendarDrafts) {
      return;
    }

    setIsSavingCalendarDrafts(true);
    setOperationTone("info");
    setOperationMessage("正在保存上线日历调整...");

    try {
      const response = await fetch("/api/schedule/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adjustments: calendarDrafts.map((draft) => ({
            projectId: draft.projectId,
            toMonth: draft.toMonth,
            toDate: draft.toDate,
            reason: `${draft.projectName} 计划上线从 ${draft.fromDate} 调整到 ${draft.toDate}`,
          })),
        }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setOperationTone("warning");
        setOperationMessage(result.message ?? "上线日历调整没有保存成功。");
        return;
      }

      setCalendarDateOverrides({});
      setOperationTone("info");
      setOperationMessage("上线日历调整已保存，正在重新测算...");
      const analyzeResult = await requestScheduleAnalyze();

      setOperationTone(analyzeResult.ok ? "info" : "warning");
      setOperationMessage(
        analyzeResult.ok
          ? `${result.message ?? "上线日历调整已保存。"} 重新测算已完成。`
          : `${result.message ?? "上线日历调整已保存。"} 但重新测算未完成：${analyzeResult.message}`,
      );
      router.refresh();
    } catch {
      setOperationTone("warning");
      setOperationMessage("保存接口暂时不可用，当前草稿仍保留在页面上。");
    } finally {
      setIsSavingCalendarDrafts(false);
    }
  }

  async function handleAnalyze() {
    setOperationTone("info");
    setOperationMessage("正在创建测算批次...");

    const result = await requestScheduleAnalyze();

    setOperationTone(result.ok ? "info" : "warning");
    setOperationMessage(result.message);
    router.refresh();
  }

  async function requestScheduleAnalyze() {
    try {
      const response = await fetch("/api/schedule/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          today: new Date().toISOString().slice(0, 10),
        }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string };

      return {
        ok: response.ok && result.ok === true,
        message: result.message ?? "测算接口已响应。",
      };
    } catch {
      return {
        ok: false,
        message: "测算接口暂时不可用。",
      };
    }
  }
}

function ScheduleBoard({
  months,
  initialMonth,
  milestones,
  cards,
  selectedProjectId,
  viewMode,
  onSelect,
}: {
  months: string[];
  initialMonth?: string;
  milestones: Milestone[];
  cards: ProjectCard[];
  selectedProjectId: string;
  viewMode: ViewMode;
  onSelect: (projectId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!initialMonth || !scrollRef.current) {
      return;
    }

    const target = monthRefs.current.get(initialMonth);
    if (!target) {
      return;
    }

    scrollRef.current.scrollTop = Math.max(target.offsetTop - 48, 0);
  }, [initialMonth, months, viewMode]);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          {viewMode === "plan" ? <CalendarRange size={16} /> : <Gauge size={16} />}
          {viewMode === "plan" ? "里程碑看板（规划）" : "压力预测"}
        </div>
        <div className="text-xs text-slate-500">可上下滚动查看历史月份</div>
      </div>
      <div ref={scrollRef} className="max-h-[72vh] overflow-auto scroll-smooth">
        <div className="grid min-w-[1120px] grid-cols-[96px_repeat(6,minmax(160px,1fr))]">
          <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-50 p-3 text-center text-sm font-semibold">
            月份
          </div>
          {milestones.map((item) => (
            <div
              key={item}
              className="sticky top-0 z-20 border-b border-r border-slate-200 bg-rose-50 p-3 text-center text-sm font-semibold last:border-r-0"
            >
              {item}
            </div>
          ))}
          {months.map((month) => (
            <BoardMonthRow
              key={month}
              milestones={milestones}
              month={month}
              cards={cards}
              selectedProjectId={selectedProjectId}
              viewMode={viewMode}
              onSelect={onSelect}
              monthRef={(node) => {
                if (node) {
                  monthRefs.current.set(month, node);
                } else {
                  monthRefs.current.delete(month);
                }
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function BoardMonthRow({
  milestones,
  month,
  cards,
  selectedProjectId,
  viewMode,
  onSelect,
  monthRef,
}: {
  milestones: Milestone[];
  month: string;
  cards: ProjectCard[];
  selectedProjectId: string;
  viewMode: ViewMode;
  onSelect: (projectId: string) => void;
  monthRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <>
      <div
        ref={monthRef}
        data-month={month}
        className="flex min-h-36 items-center justify-center border-b border-r border-slate-200 bg-slate-50 p-3 text-lg font-semibold"
      >
        {month}
      </div>
      {milestones.map((milestone) => {
        const laneCards = cards.filter((card) => cardMonth(card, viewMode) === month && card.milestone === milestone);
        return (
          <div key={`${month}-${milestone}`} className="min-h-36 border-b border-r border-slate-200 p-3 last:border-r-0">
            <div className="grid gap-2">
              {laneCards.length > 0 ? (
                laneCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => onSelect(card.projectId)}
                    title={card.name}
                    className={clsx(
                      "h-8 truncate rounded-full border px-3 text-sm font-medium shadow-sm transition hover:ring-2 hover:ring-blue-400",
                      cardClass[card.riskLevel],
                      selectedProjectId === card.projectId && "ring-2 ring-blue-500",
                    )}
                  >
                    {card.name}
                  </button>
                ))
              ) : (
                <div className="flex h-8 items-center justify-center rounded-full border border-dashed border-slate-200 text-xs text-slate-400">
                  无项目
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function cardMonth(card: ProjectCard, viewMode: ViewMode) {
  return viewMode === "forecast" ? card.forecastMonth ?? card.month : card.plannedMonth ?? card.month;
}

function LaunchCalendarView({
  months,
  projects,
  cycleOptions,
  selectedCycleStart,
  onCycleChange,
  selectedProjectId,
  onSelect,
  onMoveProject,
  onPlanDateChange,
  movedProjectIds,
  drafts,
  onClearDrafts,
  onSaveDrafts,
  isSavingDrafts,
}: {
  months: string[];
  projects: CalendarProject[];
  cycleOptions: CalendarCycleOption[];
  selectedCycleStart: string;
  onCycleChange: (startMonth: string) => void;
  selectedProjectId: string;
  onSelect: (projectId: string) => void;
  onMoveProject: (projectId: string, month: string) => void;
  onPlanDateChange: (projectId: string, plannedLaunchDate: string) => void;
  movedProjectIds: Set<string>;
  drafts: CalendarMoveDraft[];
  onClearDrafts: () => void;
  onSaveDrafts: () => void;
  isSavingDrafts: boolean;
}) {
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollSpeedRef = useRef(0);
  const isCalendarDraggingRef = useRef(false);
  const monthSet = useMemo(() => new Set(months), [months]);
  const projectsByMonth = useMemo(() => {
    return months.reduce<Record<string, CalendarProject[]>>((acc, month) => {
      acc[month] = projects
        .filter((project) => project.month === month)
        .sort((a, b) => a.plannedLaunchDate.localeCompare(b.plannedLaunchDate) || a.name.localeCompare(b.name, "zh-CN"));
      return acc;
    }, {});
  }, [months, projects]);
  const outOfCycleProjects = useMemo(() => {
    return projects
      .filter((project) => !monthSet.has(project.month))
      .sort((a, b) => a.month.localeCompare(b.month, "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
  }, [monthSet, projects]);

  function handleProjectDragStart() {
    isCalendarDraggingRef.current = true;
  }

  function handleProjectDragEnd() {
    isCalendarDraggingRef.current = false;
    stopAutoScroll();
  }

  function handleProjectDragMove(clientY: number) {
    if (!isCalendarDraggingRef.current) {
      return;
    }

    handleCalendarDragPosition(clientY);
  }

  function stopAutoScroll() {
    autoScrollSpeedRef.current = 0;

    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }

  function startAutoScroll(speed: number) {
    autoScrollSpeedRef.current = speed;

    if (autoScrollFrameRef.current !== null) {
      return;
    }

    const scroll = () => {
      const scrollElement = calendarScrollRef.current;

      if (!scrollElement || autoScrollSpeedRef.current === 0) {
        autoScrollFrameRef.current = null;
        return;
      }

      scrollElement.scrollTop += autoScrollSpeedRef.current;
      autoScrollFrameRef.current = requestAnimationFrame(scroll);
    };

    autoScrollFrameRef.current = requestAnimationFrame(scroll);
  }

  function handleCalendarDragPosition(clientY: number) {
    const scrollElement = calendarScrollRef.current;
    if (!scrollElement || clientY <= 0) {
      return;
    }

    const rect = scrollElement.getBoundingClientRect();
    const visibleBounds = visibleDragBounds(rect);
    const edgeSize = Math.min(140, visibleBounds.height / 3);
    const distanceToTop = clientY - visibleBounds.top;
    const distanceToBottom = visibleBounds.bottom - clientY;

    if (distanceToTop < edgeSize) {
      startAutoScroll(-autoScrollSpeed(edgeSize - distanceToTop, edgeSize));
      return;
    }

    if (distanceToBottom < edgeSize) {
      startAutoScroll(autoScrollSpeed(edgeSize - distanceToBottom, edgeSize));
      return;
    }

    stopAutoScroll();
  }

  function handleCalendarDragOver(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    handleCalendarDragPosition(event.clientY);
  }

  useEffect(() => {
    function stopWindowAutoScroll() {
      autoScrollSpeedRef.current = 0;

      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    }

    function startWindowAutoScroll(speed: number) {
      autoScrollSpeedRef.current = speed;

      if (autoScrollFrameRef.current !== null) {
        return;
      }

      const scroll = () => {
        const scrollElement = calendarScrollRef.current;

        if (!scrollElement || autoScrollSpeedRef.current === 0) {
          autoScrollFrameRef.current = null;
          return;
        }

        scrollElement.scrollTop += autoScrollSpeedRef.current;
        autoScrollFrameRef.current = requestAnimationFrame(scroll);
      };

      autoScrollFrameRef.current = requestAnimationFrame(scroll);
    }

    function handleWindowDragPosition(clientY: number) {
      const scrollElement = calendarScrollRef.current;
      if (!scrollElement || clientY <= 0) {
        return;
      }

      const rect = scrollElement.getBoundingClientRect();
      const visibleBounds = visibleDragBounds(rect);
      const edgeSize = Math.min(140, visibleBounds.height / 3);
      const distanceToTop = clientY - visibleBounds.top;
      const distanceToBottom = visibleBounds.bottom - clientY;

      if (distanceToTop < edgeSize) {
        startWindowAutoScroll(-autoScrollSpeed(edgeSize - distanceToTop, edgeSize));
        return;
      }

      if (distanceToBottom < edgeSize) {
        startWindowAutoScroll(autoScrollSpeed(edgeSize - distanceToBottom, edgeSize));
        return;
      }

      stopWindowAutoScroll();
    }

    function handleWindowDragOver(event: DragEvent) {
      if (!isCalendarDraggingRef.current) {
        return;
      }

      event.preventDefault();
      handleWindowDragPosition(event.clientY);
    }

    function handleWindowDragEnd() {
      isCalendarDraggingRef.current = false;
      stopWindowAutoScroll();
    }

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDragEnd);
    window.addEventListener("dragend", handleWindowDragEnd);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDragEnd);
      window.removeEventListener("dragend", handleWindowDragEnd);

      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
      }
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <CalendarDays size={16} />
              上线日历
            </div>
            <div className="mt-1 text-xs text-slate-500">
              按项目信息表的预估出货日期生成，拖到边缘会自动滚动
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              {cycleOptions.map((option) => (
                <button
                  key={option.startMonth}
                  onClick={() => onCycleChange(option.startMonth)}
                  title={option.rangeLabel}
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-xs font-semibold",
                    selectedCycleStart === option.startMonth ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {outOfCycleProjects.length > 0 ? (
              <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                其他年度 {outOfCycleProjects.length} 个
              </div>
            ) : null}
          </div>
        </div>

        {drafts.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle size={15} />
                待保存调整 {drafts.length} 项
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onSaveDrafts}
                  disabled={isSavingDrafts}
                  className="rounded-md bg-amber-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-amber-300"
                >
                  {isSavingDrafts ? "保存中" : "保存调整"}
                </button>
                <button
                  onClick={onClearDrafts}
                  disabled={isSavingDrafts}
                  className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:text-amber-300"
                >
                  清空草稿
                </button>
              </div>
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {drafts.map((draft) => (
                <div
                  key={draft.projectId}
                  className={clsx("min-w-56 rounded-md border px-2.5 py-2 text-xs", riskAccentClass[draft.riskLevel])}
                >
                  <div className="truncate font-semibold">{draft.projectName}</div>
                  <div className="mt-1 text-current/75">
                    {draft.fromDate} → {draft.toDate}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div
        ref={calendarScrollRef}
        onDragOver={handleCalendarDragOver}
        onDrop={handleProjectDragEnd}
        className="grid max-h-[72vh] grid-cols-3 gap-px overflow-auto scroll-smooth bg-slate-200 max-xl:grid-cols-2 max-md:grid-cols-1"
      >
        {months.map((month) => {
          const monthProjects = projectsByMonth[month] ?? [];
          return (
            <CalendarMonthCell
              key={month}
              month={month}
              projects={monthProjects}
              selectedProjectId={selectedProjectId}
              onSelect={onSelect}
              onMoveProject={onMoveProject}
              onPlanDateChange={onPlanDateChange}
              onProjectDragStart={handleProjectDragStart}
              onProjectDragMove={handleProjectDragMove}
              onProjectDragEnd={handleProjectDragEnd}
              movedProjectIds={movedProjectIds}
            />
          );
        })}
      </div>
    </section>
  );
}

function CalendarMonthCell({
  month,
  projects,
  selectedProjectId,
  onSelect,
  onMoveProject,
  onPlanDateChange,
  onProjectDragStart,
  onProjectDragMove,
  onProjectDragEnd,
  movedProjectIds,
}: {
  month: string;
  projects: CalendarProject[];
  selectedProjectId: string;
  onSelect: (projectId: string) => void;
  onMoveProject: (projectId: string, month: string) => void;
  onPlanDateChange: (projectId: string, plannedLaunchDate: string) => void;
  onProjectDragStart: () => void;
  onProjectDragMove: (clientY: number) => void;
  onProjectDragEnd: () => void;
  movedProjectIds: Set<string>;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const riskProjectCount = projects.filter((project) => project.riskLevel === "risk" || project.riskLevel === "delay").length;
  const finishedProjectCount = projects.filter((project) => isFinishedStatus(project.riskLevel)).length;
  const monthPressureTone = projects.length >= 5 ? "高" : projects.length >= 3 ? "中" : "低";

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const projectId = event.dataTransfer.getData("text/plain");
    if (projectId) {
      onMoveProject(projectId, month);
    }
  }

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={clsx(
        "min-h-64 bg-white p-3 transition",
        isDragOver ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-rose-50/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{month}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
            <span>{projects.length} 个项目</span>
            <span>压力 {monthPressureTone}</span>
            {riskProjectCount > 0 ? <span className="font-semibold text-red-600">风险 {riskProjectCount}</span> : null}
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          已完 {finishedProjectCount}
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {projects.length > 0 ? (
          projects.map((project) => (
            <CalendarProjectButton
              key={project.projectId}
              project={project}
              selected={selectedProjectId === project.projectId}
              onSelect={onSelect}
              onPlanDateChange={onPlanDateChange}
              onProjectDragStart={onProjectDragStart}
              onProjectDragMove={onProjectDragMove}
              onProjectDragEnd={onProjectDragEnd}
              moved={movedProjectIds.has(project.projectId)}
            />
          ))
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
            暂无上线项目
          </div>
        )}
      </div>
    </div>
  );
}

function autoScrollSpeed(distanceInsideEdge: number, edgeSize: number) {
  const ratio = Math.min(Math.max(distanceInsideEdge / edgeSize, 0), 1);
  return Math.max(Math.round(ratio * 22), 4);
}

function visibleDragBounds(rect: DOMRect) {
  const viewportBottom = window.innerHeight || document.documentElement.clientHeight;
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, viewportBottom);

  return {
    top,
    bottom,
    height: Math.max(bottom - top, 1),
  };
}

function CalendarProjectButton({
  project,
  selected,
  onSelect,
  onPlanDateChange,
  onProjectDragStart,
  onProjectDragMove,
  onProjectDragEnd,
  moved,
}: {
  project: CalendarProject;
  selected: boolean;
  onSelect: (projectId: string) => void;
  onPlanDateChange: (projectId: string, plannedLaunchDate: string) => void;
  onProjectDragStart: () => void;
  onProjectDragMove: (clientY: number) => void;
  onProjectDragEnd: () => void;
  moved: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => {
        onProjectDragStart();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", project.projectId);
      }}
      onDrag={(event) => {
        if (event.clientY > 0) {
          onProjectDragMove(event.clientY);
        }
      }}
      onDragEnd={onProjectDragEnd}
      onClick={() => onSelect(project.projectId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onSelect(project.projectId);
        }
      }}
      className={clsx(
        "min-h-20 cursor-grab rounded-lg border p-2.5 text-left text-sm shadow-sm transition active:cursor-grabbing hover:ring-2 hover:ring-blue-400",
        cardClass[project.riskLevel],
        selected && "ring-2 ring-blue-500",
        moved && "outline outline-2 outline-offset-2 outline-amber-400",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 font-semibold leading-5">{project.name}</div>
        {moved ? <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">草稿</span> : null}
      </div>
      <div className="mt-2 grid gap-1.5 text-xs">
        <label className="grid gap-1 rounded bg-white/65 px-2 py-1 text-slate-700">
          <span className="font-semibold text-slate-500">计划上线</span>
          <input
            type="date"
            value={project.plannedLaunchDate}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onInput={(event) => onPlanDateChange(project.projectId, event.currentTarget.value)}
            onChange={(event) => onPlanDateChange(project.projectId, event.target.value)}
            className="h-7 rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400"
          />
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <PlanningCardField label="预测上线" value={project.forecastLaunchDate ?? "待测算"} />
          <PlanningCardField label="项目组" value={project.projectTeam} />
        </div>
      </div>
    </div>
  );
}

function PlanningCardField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/65 px-2 py-1 text-slate-700">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 truncate font-semibold">{value}</div>
    </div>
  );
}

type TaskDetailColumn = {
  label: string;
  value: (task: ScheduleTaskRow) => string | number | null;
  className?: string;
  render?: (task: ScheduleTaskRow) => ReactNode;
};

const taskDetailColumns: TaskDetailColumn[] = [
  { label: "项目编号", value: (task) => task.projectCode },
  { label: "项目名称", value: (task) => task.projectName, className: "min-w-44 font-semibold text-slate-900" },
  { label: "项目阶段", value: (task) => task.projectStage },
  { label: "计划出货日期", value: (task) => task.plannedLaunchDate },
  { label: "当前测算出货日期", value: (task) => task.forecastLaunchDate },
  { label: "出货偏差天数", value: (task) => task.launchDeltaDays },
  { label: "任务ID", value: (task) => task.taskNo },
  { label: "任务名称", value: (task) => task.taskName, className: "min-w-44 font-semibold text-slate-900" },
  { label: "里程碑", value: (task) => task.milestoneType },
  { label: "标准工期", value: (task) => task.durationDays },
  { label: "任务状态", value: (task) => task.taskStatus, className: "min-w-32" },
  { label: "是否当前应开始", value: (task) => task.shouldStartLabel },
  { label: "缺少实际完成的前置任务", value: (task) => task.missingActualPredecessorIds, className: "min-w-44" },
  { label: "实际开始日期", value: (task) => task.actualStartDate },
  { label: "实际完成日期", value: (task) => task.actualFinishDate },
  { label: "推进中任务预期完成时间", value: (task) => task.expectedFinishDate, className: "min-w-40" },
  { label: "是否推断完成", value: (task) => task.inferredCompletedLabel },
  { label: "推断完成参考日期", value: (task) => task.inferredCompletionDate, className: "min-w-36" },
  { label: "正常节奏开始日", value: (task) => task.plannedStartDate, className: "min-w-36" },
  { label: "正常节奏完成日", value: (task) => task.plannedFinishDate, className: "min-w-36" },
  { label: "根据当前进度预测开始日", value: (task) => task.progressForecastStartDate, className: "min-w-44" },
  { label: "根据当前进度预测完成日", value: (task) => task.progressForecastFinishDate, className: "min-w-44" },
  { label: "当前测算开始日", value: (task) => task.calculatedStartDate, className: "min-w-36" },
  { label: "当前测算完成日", value: (task) => task.calculatedFinishDate, className: "min-w-36" },
  { label: "当前DDL日期", value: (task) => task.currentDdlDate, className: "min-w-32" },
  { label: "原计划上线最晚开始日", value: (task) => task.originalLatestStartDate, className: "min-w-44" },
  { label: "原计划上线最晚完成日", value: (task) => task.originalLatestFinishDate, className: "min-w-44" },
  { label: "再次延期警告最晚开始日", value: (task) => task.latestStartDate, className: "min-w-48" },
  { label: "再次延期警告最晚完成日", value: (task) => task.latestFinishDate, className: "min-w-48" },
  { label: "安全缓冲天数", value: (task) => task.floatDays },
  { label: "相对正常节奏偏差天数", value: (task) => task.planDeltaDays, className: "min-w-44" },
  { label: "再次延期风险天数", value: (task) => task.deadlineRiskDays, className: "min-w-40" },
  { label: "距离再次延期剩余天数", value: (task) => task.warningWindowDays, className: "min-w-44" },
  { label: "影响状态", value: (task) => task.impactStatus },
  {
    label: "风险等级",
    value: (task) => task.riskText || riskLabel[task.riskLevel],
    render: (task) => (
      <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", badgeClass[task.riskLevel])}>
        {task.riskText || riskLabel[task.riskLevel]}
      </span>
    ),
  },
  { label: "是否阻塞出货", value: (task) => task.isBlockingLaunchLabel },
];

function TaskDetailView({
  tasks,
  selectedProjectId,
  onSelect,
  onNotify,
}: {
  tasks: ScheduleTaskRow[];
  selectedProjectId: string;
  onSelect: (projectId: string) => void;
  onNotify: (message: string, tone?: "info" | "warning") => void;
}) {
  const riskCount = tasks.filter((task) => task.riskLevel === "risk" || task.riskLevel === "delay").length;
  const blockingCount = tasks.filter((task) => task.isBlockingLaunchLabel === "是").length;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <ListFilter size={16} />
          任务明细
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">
            {tasks.length} 条任务 · {riskCount} 条风险 · {blockingCount} 条阻塞出货
          </span>
          <button
            onClick={exportTaskDetails}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download size={14} />
            导出 Excel
          </button>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-auto">
        <table className="w-full min-w-[3600px] border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              {taskDetailColumns.map((column) => (
                <th key={column.label} className={clsx("border-b border-slate-200 px-3 py-2", column.className)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => onSelect(task.projectId)}
                  className={clsx(
                    "cursor-pointer bg-white hover:bg-blue-50/60",
                    selectedProjectId === task.projectId && "bg-blue-50",
                  )}
                >
                  {taskDetailColumns.map((column) => (
                    <td
                      key={`${task.id}:${column.label}`}
                      className={clsx("border-b border-slate-100 px-3 py-2 text-slate-700", column.className)}
                    >
                      {column.render ? column.render(task) : displayTaskDetailValue(column.value(task))}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={taskDetailColumns.length} className="px-3 py-10 text-center text-sm text-slate-400">
                  暂无匹配任务
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  function exportTaskDetails() {
    if (tasks.length === 0) {
      onNotify("当前没有可导出的任务明细。", "warning");
      return;
    }

    downloadPlanningTableCsv("项目任务明细.csv", [
      taskDetailColumns.map((column) => column.label),
      ...tasks.map((task) => taskDetailColumns.map((column) => column.value(task))),
    ]);
    onNotify(`已导出 ${tasks.length} 条任务明细，可直接用 Excel 打开。`);
  }
}

function displayTaskDetailValue(value: string | number | null) {
  if (value === null || value === "") {
    return "—";
  }

  return value;
}

type PlanningTableDraft = {
  rowId: string;
  projectId?: string;
  name: string;
  plannedLaunchDate: string;
  routeType: string;
  projectTeam: string;
};

type ProjectMutationResponse = {
  ok?: boolean;
  message?: string;
  project?: { id?: string };
};

function PlanningTableView({
  projects,
  selectedProjectId,
  onSelect,
  onNotify,
  onSaved,
}: {
  projects: CalendarProject[];
  selectedProjectId: string;
  onSelect: (projectId: string) => void;
  onNotify: (message: string, tone?: "info" | "warning") => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, PlanningTableDraft>>({});
  const [newRows, setNewRows] = useState<PlanningTableDraft[]>([]);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const hasRows = projects.length > 0 || newRows.length > 0;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <Table2 size={16} />
          表格视图
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={addNewProjectRow}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={14} />
            新增项目
          </button>
          <button
            onClick={exportProjects}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download size={14} />
            导出 Excel
          </button>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-auto">
        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2">项目</th>
              <th className="border-b border-slate-200 px-3 py-2">上线月份</th>
              <th className="border-b border-slate-200 px-3 py-2">计划上线</th>
              <th className="border-b border-slate-200 px-3 py-2">预测 / 完成</th>
              <th className="border-b border-slate-200 px-3 py-2">状态</th>
              <th className="border-b border-slate-200 px-3 py-2">路线</th>
              <th className="border-b border-slate-200 px-3 py-2">项目组</th>
              <th className="border-b border-slate-200 px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {newRows.map((row) => (
              <tr key={row.rowId} className="bg-rose-50/30">
                <td className="border-b border-slate-100 px-3 py-2">
                  <PlanningTableInput
                    ariaLabel="新项目名称"
                    value={row.name}
                    placeholder="项目名称"
                    onChange={(value) => updateNewRow(row.rowId, { name: value })}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                  {monthLabelFromDateString(row.plannedLaunchDate) ?? "待定"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
                  <PlanningTableInput
                    ariaLabel={`${row.name || "新项目"} 计划上线`}
                    type="date"
                    value={row.plannedLaunchDate}
                    onChange={(value) => updateNewRow(row.rowId, { plannedLaunchDate: value })}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-500">待测算</td>
                <td className="border-b border-slate-100 px-3 py-2">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">新项目</span>
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
                  <PlanningTableInput
                    ariaLabel={`${row.name || "新项目"} 路线`}
                    value={row.routeType}
                    placeholder="路线"
                    onChange={(value) => updateNewRow(row.rowId, { routeType: value })}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
                  <PlanningTableInput
                    ariaLabel={`${row.name || "新项目"} 项目组`}
                    value={row.projectTeam}
                    placeholder="项目组"
                    onChange={(value) => updateNewRow(row.rowId, { projectTeam: value })}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <TableActionButton
                      icon={<Save size={14} />}
                      label="保存"
                      disabled={savingRowId === row.rowId}
                      onClick={() => saveNewProject(row)}
                    />
                    <TableActionButton
                      icon={<Trash2 size={14} />}
                      label="删除"
                      tone="danger"
                      disabled={savingRowId === row.rowId}
                      onClick={() => removeNewProjectRow(row.rowId)}
                    />
                  </div>
                </td>
              </tr>
            ))}

            {projects.map((project) => {
              const draft = drafts[project.projectId] ?? draftFromProject(project);
              const isDirty = isDraftChanged(project, draft);
              const isSaving = savingRowId === project.projectId;

              return (
                <tr
                  key={project.projectId}
                  onClick={() => onSelect(project.projectId)}
                  className={clsx(
                    "cursor-pointer bg-white hover:bg-blue-50/60",
                    selectedProjectId === project.projectId && "bg-blue-50",
                    isDirty && "bg-amber-50/60",
                  )}
                >
                  <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-900">{project.name}</td>
                  <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                    {monthLabelFromDateString(draft.plannedLaunchDate) ?? project.month}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <PlanningTableInput
                      ariaLabel={`${project.name} 计划上线`}
                      type="date"
                      value={draft.plannedLaunchDate}
                      onChange={(value) => updateProjectDraft(project, { plannedLaunchDate: value })}
                    />
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                    {project.forecastLaunchDate ?? "待测算"}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", badgeClass[project.riskLevel])}>
                      {riskLabel[project.riskLevel]}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <PlanningTableInput
                      ariaLabel={`${project.name} 路线`}
                      value={draft.routeType}
                      onChange={(value) => updateProjectDraft(project, { routeType: value })}
                    />
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <PlanningTableInput
                      ariaLabel={`${project.name} 项目组`}
                      value={draft.projectTeam}
                      onChange={(value) => updateProjectDraft(project, { projectTeam: value })}
                    />
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <TableActionButton
                        icon={<Save size={14} />}
                        label="保存"
                        disabled={!isDirty || isSaving}
                        onClick={() => saveProject(project, draft)}
                      />
                      <TableActionButton
                        icon={<Trash2 size={14} />}
                        label="删除"
                        tone="danger"
                        disabled={isSaving}
                        onClick={() => deleteProject(project)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}

            {!hasRows ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-400">
                  暂无匹配项目
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );

  function addNewProjectRow() {
    setNewRows((rows) => [
      {
        rowId: `new-${Date.now()}`,
        name: "",
        plannedLaunchDate: new Date().toISOString().slice(0, 10),
        routeType: "",
        projectTeam: "",
      },
      ...rows,
    ]);
    onNotify("已新增一行项目规划，填写后点击保存。");
  }

  function removeNewProjectRow(rowId: string) {
    setNewRows((rows) => rows.filter((row) => row.rowId !== rowId));
  }

  function updateNewRow(rowId: string, patch: Partial<PlanningTableDraft>) {
    setNewRows((rows) => rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }

  function updateProjectDraft(project: CalendarProject, patch: Partial<PlanningTableDraft>) {
    setDrafts((value) => {
      const next = { ...value };
      const draft = { ...(next[project.projectId] ?? draftFromProject(project)), ...patch };

      if (isDraftChanged(project, draft)) {
        next[project.projectId] = draft;
      } else {
        delete next[project.projectId];
      }

      return next;
    });
  }

  async function saveNewProject(row: PlanningTableDraft) {
    const name = row.name.trim();
    const plannedLaunchDate = row.plannedLaunchDate.trim();

    if (!name) {
      onNotify("请先填写项目名称。", "warning");
      return;
    }

    if (!isValidDateString(plannedLaunchDate)) {
      onNotify("请填写有效的计划上线日期。", "warning");
      return;
    }

    setSavingRowId(row.rowId);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: name,
          plannedLaunchDate,
          routeType: row.routeType,
          projectTeamId: row.projectTeam,
        }),
      });
      const result = await readProjectMutationResponse(response);

      if (!response.ok || !result.ok) {
        onNotify(result.message ?? "新增项目没有保存成功。", "warning");
        return;
      }

      setNewRows((rows) => rows.filter((item) => item.rowId !== row.rowId));
      if (result.project?.id) {
        onSelect(result.project.id);
      }
      await onSaved(result.message ?? `${name} 已新增。`);
    } catch {
      onNotify("新增项目接口暂时不可用。", "warning");
    } finally {
      setSavingRowId(null);
    }
  }

  async function saveProject(project: CalendarProject, draft: PlanningTableDraft) {
    if (!isDraftChanged(project, draft)) {
      onNotify(`${project.name} 没有需要保存的改动。`);
      return;
    }

    if (!isValidDateString(draft.plannedLaunchDate)) {
      onNotify("请填写有效的计划上线日期。", "warning");
      return;
    }

    setSavingRowId(project.projectId);
    try {
      const response = await fetch(`/api/projects/${project.projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedLaunchDate: draft.plannedLaunchDate,
          routeType: draft.routeType,
          projectTeamId: draft.projectTeam,
        }),
      });
      const result = await readProjectMutationResponse(response);

      if (!response.ok || !result.ok) {
        onNotify(result.message ?? "项目规划没有保存成功。", "warning");
        return;
      }

      setDrafts((value) => {
        const next = { ...value };
        delete next[project.projectId];
        return next;
      });
      await onSaved(result.message ?? `${project.name} 已保存。`);
    } catch {
      onNotify("项目规划保存接口暂时不可用。", "warning");
    } finally {
      setSavingRowId(null);
    }
  }

  async function deleteProject(project: CalendarProject) {
    if (!window.confirm(`确定删除「${project.name}」吗？删除后会同时清理它的排期结果和提醒。`)) {
      return;
    }

    setSavingRowId(project.projectId);
    try {
      const response = await fetch(`/api/projects/${project.projectId}`, { method: "DELETE" });
      const result = await readProjectMutationResponse(response);

      if (!response.ok || !result.ok) {
        onNotify(result.message ?? "项目没有删除成功。", "warning");
        return;
      }

      setDrafts((value) => {
        const next = { ...value };
        delete next[project.projectId];
        return next;
      });
      await onSaved(result.message ?? `${project.name} 已删除。`);
    } catch {
      onNotify("删除项目接口暂时不可用。", "warning");
    } finally {
      setSavingRowId(null);
    }
  }

  function exportProjects() {
    const rows = [
      ...newRows.map((row) => ({
        name: row.name || "未命名项目",
        month: monthLabelFromDateString(row.plannedLaunchDate) ?? "",
        plannedLaunchDate: row.plannedLaunchDate,
        forecastLaunchDate: "待测算",
        status: "新项目",
        routeType: row.routeType,
        projectTeam: row.projectTeam,
      })),
      ...projects.map((project) => {
        const draft = drafts[project.projectId] ?? draftFromProject(project);

        return {
          name: project.name,
          month: monthLabelFromDateString(draft.plannedLaunchDate) ?? project.month,
          plannedLaunchDate: draft.plannedLaunchDate,
          forecastLaunchDate: project.forecastLaunchDate ?? "待测算",
          status: riskLabel[project.riskLevel],
          routeType: draft.routeType,
          projectTeam: draft.projectTeam,
        };
      }),
    ];

    if (rows.length === 0) {
      onNotify("当前没有可导出的项目。", "warning");
      return;
    }

    downloadPlanningTableCsv(
      "项目上线规划.csv",
      [
        ["项目名称", "上线月份", "计划上线", "预测 / 完成", "状态", "路线", "项目组"],
        ...rows.map((row) => [
          row.name,
          row.month,
          row.plannedLaunchDate,
          row.forecastLaunchDate,
          row.status,
          row.routeType,
          row.projectTeam,
        ]),
      ],
    );
    onNotify(`已导出 ${rows.length} 条项目规划，可直接用 Excel 打开。`);
  }
}

function PlanningTableInput({
  ariaLabel,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "date" | "text";
}) {
  return (
    <input
      aria-label={ariaLabel}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      className={clsx(
        "h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
        type === "date" ? "w-36" : "w-40",
      )}
    />
  );
}

function TableActionButton({
  icon,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45",
        tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function draftFromProject(project: CalendarProject): PlanningTableDraft {
  return {
    rowId: project.projectId,
    projectId: project.projectId,
    name: project.name,
    plannedLaunchDate: project.plannedLaunchDate,
    routeType: project.routeType,
    projectTeam: project.projectTeam,
  };
}

function isDraftChanged(project: CalendarProject, draft: PlanningTableDraft) {
  return (
    draft.plannedLaunchDate !== project.plannedLaunchDate ||
    draft.routeType !== project.routeType ||
    draft.projectTeam !== project.projectTeam
  );
}

async function readProjectMutationResponse(response: Response): Promise<ProjectMutationResponse> {
  try {
    return (await response.json()) as ProjectMutationResponse;
  } catch {
    return {};
  }
}

function downloadPlanningTableCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function ProjectEntryView({ project, onNotify }: { project: ProjectDetail; onNotify: (message: string) => void }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <FilePenLine size={16} />
          项目录入视图
        </div>
        <button
          type="button"
          onClick={() => onNotify("项目录入保存会在项目规划字段确认后接入。")}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
        >
          保存项目草稿
        </button>
      </div>

      <div className="grid gap-4 p-4">
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <ReadonlyField label="项目名称" value={project.name} />
          <ReadonlyField label="计划上线" value={project.plannedFinish} />
          <ReadonlyField label="项目组" value={project.projectTeam} />
          <ReadonlyField label="产品研发" value={project.owner} />
          <ReadonlyField label="产品美术" value={project.artOwner} />
          <ReadonlyField label="当前阶段" value={project.currentTask} />
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold text-slate-500">规划备注</span>
          <textarea
            className="min-h-28 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-blue-300 focus:bg-white"
            placeholder="记录项目规划依据、版权方要求、上线窗口或需要管理层确认的问题"
          />
        </label>
      </div>
    </section>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        value={value}
        readOnly
        className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 font-semibold text-slate-900 outline-none"
      />
    </label>
  );
}

function ProjectDetailPanel({ project }: { project: ProjectDetail }) {
  const modelingPercent =
    project.modelingProgress.total > 0
      ? Math.round((project.modelingProgress.approved / project.modelingProgress.total) * 100)
      : 0;
  const forecastLabel = isFinishedStatus(project.riskLevel) ? "实际完成" : "预测上线";

  return (
    <aside className="rounded-lg border border-slate-200 bg-white xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-auto">
      <div className="border-b border-slate-200 p-4">
        <div className="mb-2 text-xs font-semibold text-slate-400">项目详情</div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <div className="mt-1 text-sm text-slate-500">
              {project.projectTeam} · 产品研发：{project.owner} · 产品美术：{project.artOwner}
            </div>
          </div>
          <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", badgeClass[project.riskLevel])}>
            {riskLabel[project.riskLevel]}
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        <InfoGrid
          items={[
            ["当前任务", project.currentTask],
            ["计划上线", project.plannedFinish],
            [forecastLabel, project.forecastFinish],
            ["项目进度", `${project.progressPercent}%`],
          ]}
        />

        <section>
          <SectionTitle title="项目进度" value={`${project.progressPercent}%`} />
          <Progress value={project.progressPercent} tone={project.riskLevel} />
        </section>

        <section>
          <SectionTitle
            title="建模进度"
            value={`${project.modelingProgress.approved}/${project.modelingProgress.total} 款通过`}
          />
          <Progress value={modelingPercent} tone="done" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
            <MiniStat label="建模中" value={project.modelingProgress.inProgress} />
            <MiniStat label="送审/等反馈" value={project.modelingProgress.submitted} />
            <MiniStat label="未分配" value={project.modelingProgress.unassigned} />
          </div>
        </section>

        <section className={clsx("rounded-lg border p-3", riskAccentClass[project.riskLevel])}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {project.riskLevel === "delay" || project.riskLevel === "risk" ? (
              <AlertTriangle size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            状态提示
          </div>
          <p className="mt-2 text-sm leading-6">{project.riskMessage}</p>
        </section>

        <section>
          <SectionTitle title="本周需要处理" />
          <ul className="mt-2 grid gap-2">
            {project.weeklyTasks.map((task) => (
              <li key={task} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {task}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50",
        disabled ? "cursor-not-allowed opacity-60" : "",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PlanningViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-semibold",
        active ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MetricCard({ metric, index }: { metric: Metric; index: number }) {
  const Icon = index === 0 ? CheckCircle2 : index === 1 || index === 2 ? AlertTriangle : Bell;

  return (
    <div className={clsx("rounded-lg border p-4 shadow-sm", metricToneClass[index] ?? "border-slate-200 bg-white")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">{metric.value}</div>
          <div className="mt-1 text-sm font-medium">{metric.label}</div>
        </div>
        <span className="rounded-lg bg-white/80 p-2 text-slate-600 ring-1 ring-slate-200">
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-500">{metric.helper}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("h-2.5 w-2.5 rounded-full", color)} />
      {label}
    </span>
  );
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="mt-1 text-sm font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ title, value }: { title: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span>{title}</span>
      {value ? <span className="text-slate-500">{value}</span> : null}
    </div>
  );
}

function Progress({ value, tone }: { value: number; tone: RiskLevel }) {
  return (
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className={clsx(
          "h-full rounded-full",
          tone === "delay" ? "bg-red-500" : tone === "risk" ? "bg-amber-400" : "bg-emerald-500",
        )}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

function isFinishedStatus(status: RiskLevel) {
  return status === "done" || status === "doneLate";
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <div className="text-sm font-semibold text-slate-900">{value}</div>
      <div>{label}</div>
    </div>
  );
}

function buildCalendarCycleOptions(currentMonths: string[], projects: CalendarProject[]): CalendarCycleOption[] {
  const starts = new Map<string, MonthPoint>();

  for (const label of currentMonths) {
    const month = parseCalendarMonthLabel(label);
    if (month) {
      const start = planningCycleStartForMonth(month);
      starts.set(formatCalendarMonthLabel(start), start);
    }
  }

  for (const project of projects) {
    const month = parseCalendarMonthLabel(project.month);
    if (month) {
      const start = planningCycleStartForMonth(month);
      starts.set(formatCalendarMonthLabel(start), start);
    }
  }

  return Array.from(starts.values())
    .sort((a, b) => calendarMonthIndex(a) - calendarMonthIndex(b))
    .map((start) => {
      const months = monthsFrom(start, 12).map(formatCalendarMonthLabel);
      return {
        startMonth: formatCalendarMonthLabel(start),
        label: `${String(start.year).slice(-2)}年度`,
        rangeLabel: `${months[0]} - ${months[months.length - 1]}`,
        months,
      };
    });
}

function planningCycleStartForMonth(month: MonthPoint): MonthPoint {
  const thisYearStart = monthAfterChineseNewYear(month.year);

  if (calendarMonthIndex(month) >= calendarMonthIndex(thisYearStart)) {
    return thisYearStart;
  }

  return monthAfterChineseNewYear(month.year - 1);
}

function monthAfterChineseNewYear(year: number): MonthPoint {
  const springFestival = chineseNewYearByYear[year] ?? { year, month: 2, day: 1 };
  const nextMonth = springFestival.month + 1;

  if (nextMonth > 12) {
    return { year: springFestival.year + 1, month: 1 };
  }

  return { year: springFestival.year, month: nextMonth };
}

const chineseNewYearByYear: Record<number, { year: number; month: number; day: number }> = {
  2025: { year: 2025, month: 1, day: 29 },
  2026: { year: 2026, month: 2, day: 17 },
  2027: { year: 2027, month: 2, day: 6 },
  2028: { year: 2028, month: 1, day: 26 },
  2029: { year: 2029, month: 2, day: 13 },
  2030: { year: 2030, month: 2, day: 3 },
  2031: { year: 2031, month: 1, day: 23 },
};

function monthsFrom(start: MonthPoint, count: number) {
  return Array.from({ length: count }, (_, index) => addCalendarMonths(start, index));
}

function addCalendarMonths(month: MonthPoint, offset: number): MonthPoint {
  const zeroBasedMonthIndex = month.year * 12 + (month.month - 1) + offset;

  return {
    year: Math.floor(zeroBasedMonthIndex / 12),
    month: (zeroBasedMonthIndex % 12) + 1,
  };
}

function monthLabelFromDateString(value: string) {
  const date = parseDateString(value);
  return date ? formatCalendarMonthLabel(date) : null;
}

function dateStringInTargetMonth(sourceDate: string, targetMonthLabel: string) {
  const source = parseDateString(sourceDate);
  const targetMonth = parseCalendarMonthLabel(targetMonthLabel);

  if (!source || !targetMonth) {
    return null;
  }

  const day = Math.min(source.day, daysInCalendarMonth(targetMonth));
  return `${targetMonth.year}-${padDatePart(targetMonth.month)}-${padDatePart(day)}`;
}

function isValidDateString(value: string) {
  return parseDateString(value) !== null;
}

function parseDateString(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > daysInCalendarMonth({ year, month })) {
    return null;
  }

  return { year, month, day };
}

function daysInCalendarMonth(month: MonthPoint) {
  return new Date(Date.UTC(month.year, month.month, 0, 12)).getUTCDate();
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function parseCalendarMonthLabel(label: string | undefined): MonthPoint | null {
  if (!label) {
    return null;
  }

  const fullYearMonth = label.match(/^(\d{4})年(\d{1,2})月$/);
  if (fullYearMonth) {
    return { year: Number(fullYearMonth[1]), month: Number(fullYearMonth[2]) };
  }

  const shortYearMonth = label.match(/^(\d{2})年(\d{1,2})月$/);
  if (shortYearMonth) {
    return { year: 2000 + Number(shortYearMonth[1]), month: Number(shortYearMonth[2]) };
  }

  return null;
}

function formatCalendarMonthLabel(month: MonthPoint) {
  return `${String(month.year).slice(-2)}年${month.month}月`;
}

function calendarMonthIndex(month: MonthPoint) {
  return month.year * 12 + month.month;
}

function fallbackDetail(projectId: string, cards: ProjectCard[]): ProjectDetail {
  const card = cards.find((item) => item.projectId === projectId);
  return {
    id: projectId,
    name: card?.name ?? "待补充项目",
    projectTeam: "待补充",
    owner: "待补充",
    artOwner: "待补充",
    currentTask: "待从测算结果同步",
    plannedFinish: "待补充",
    forecastFinish: "待补充",
    riskLevel: card?.riskLevel ?? "normal",
    riskMessage: "接入真实测算结果后，这里会显示项目风险文案。",
    progressPercent: 0,
    modelingProgress: { approved: 0, total: 0, inProgress: 0, submitted: 0, outsourced: 0, unassigned: 0 },
    weeklyTasks: ["等待导入真实项目数据"],
  };
}
