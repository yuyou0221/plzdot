"use client";

import type { DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ExternalLink,
  Gauge,
  Inbox,
  ListChecks,
  MoveRight,
  Palette,
  Search,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import { AccountPanel } from "@/components/auth/account-panel";
import type { AuthUser } from "@/lib/auth/permissions";
import type {
  ProductGuideData,
  ProductGuideFilterOption,
  ProductGuideItem,
  ProductGuideMilestoneBoard,
  ProductGuideMilestoneCard,
  ProductGuideMilestoneRiskLevel,
  ProductGuideRiskLevel,
  ProductGuideStyleSummary,
  ProductGuideUnassignedProject,
} from "@/lib/product-guide-types";

type GroupPageKey = "milestones" | "week-guide" | "unassigned-projects";
type MilestoneBoardMode = "plan" | "forecast";
type ProductStartMonthPoint = { year: number; month: number };
type ProductStartCycleOption = {
  startMonth: string;
  label: string;
  rangeLabel: string;
  months: string[];
};

type WeeklyGuideBucket = {
  key: "due" | "progress" | "start" | "risk" | "licensor";
  title: string;
  helper: string;
  emptyText: string;
  items: ProductGuideItem[];
};

type GuideActionKind = "complete" | "progress" | "expected-finish" | "block" | "unblock" | "submit-review" | "style-list";

type TaskActionForm = {
  taskStatus: string;
  actualFinishDate: string;
  expectedFinishDate: string;
  submittedAt: string;
  reviewTarget: string;
  blockReason: string;
  note: string;
};

type StyleListForm = {
  styleNames: string;
  styleCount: string;
  difficulty: string;
  estimatedWorkdays: string;
  originalArtStatus: string;
  originalArtApprovedDate: string;
  note: string;
};

type MutationResponse = {
  ok?: boolean;
  message?: string;
  needsRecalculation?: boolean;
};

const teamStorageKey = "product-guide:team-key";
const milestoneLaneOrder = ["原画里程碑", "建模里程碑", "红蜡里程碑", "平面里程碑", "产前里程碑", "大货里程碑"];

const riskMeta: Record<
  ProductGuideRiskLevel,
  {
    label: string;
    cardClass: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  normal: {
    label: "正常推进",
    cardClass: "border-slate-200 bg-white",
    badgeClass: "bg-slate-100 text-slate-700",
    dotClass: "bg-slate-400",
  },
  watch: {
    label: "需关注",
    cardClass: "border-sky-200 bg-sky-50/70",
    badgeClass: "bg-sky-100 text-sky-800",
    dotClass: "bg-sky-500",
  },
  risk: {
    label: "延期风险",
    cardClass: "border-amber-300 bg-amber-50",
    badgeClass: "bg-amber-100 text-amber-900",
    dotClass: "bg-amber-500",
  },
  delay: {
    label: "必然延期",
    cardClass: "border-rose-300 bg-rose-50",
    badgeClass: "bg-rose-100 text-rose-800",
    dotClass: "bg-rose-500",
  },
};

const milestoneCardClass: Record<ProductGuideMilestoneRiskLevel, string> = {
  done: "border-emerald-200 bg-emerald-100 text-emerald-950",
  doneLate: "border-emerald-700 bg-emerald-700 text-white",
  normal: "border-slate-200 bg-white text-slate-900",
  risk: "border-amber-300 bg-amber-100 text-amber-950",
  delay: "border-red-500 bg-red-500 text-white",
};

const weeklyTaskGridClass =
  "grid-cols-[minmax(120px,0.95fr)_minmax(180px,1.45fr)_96px_minmax(170px,1.2fr)] max-xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";
const taskStatusOptions = ["未开始", "进行中", "送审中", "阻塞", "暂停", "取消"];
const emptyProductStartMonths: string[] = [];

export function ProductGuideWorkbench({ currentUser, data }: { currentUser: AuthUser; data: ProductGuideData }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [artFilter, setArtFilter] = useState("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [activeGroupPage, setActiveGroupPage] = useState<GroupPageKey>("milestones");
  const [minePersonFilter, setMinePersonFilter] = useState(data.filters.people[0]?.value ?? "all");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedMilestoneCardId, setSelectedMilestoneCardId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "warning">("info");
  const [pendingUpdateCount, setPendingUpdateCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [activeAction, setActiveAction] = useState<GuideActionKind | null>(null);
  const [taskForm, setTaskForm] = useState<TaskActionForm>(() => defaultTaskActionForm());
  const [styleForm, setStyleForm] = useState<StyleListForm>(() => defaultStyleListForm());
  const [draggedProjectId, setDraggedProjectId] = useState("");
  const [hoverTeamKey, setHoverTeamKey] = useState("");
  const [assigningProjectId, setAssigningProjectId] = useState("");
  const [assignedProjectIds, setAssignedProjectIds] = useState<Set<string>>(() => new Set());

  const visibleSearch = search.trim();
  const activeMineKey = minePersonFilter === "all" ? data.filters.people[0]?.value : minePersonFilter;
  const teamOptions = data.filters.teams;
  const teamTargets = data.teamTargets;
  const rememberedTeamKey = useSyncExternalStore(subscribeTeamPreference, readTeamPreference, () => "");
  const activeTeamKey = normalizeTeamKey(rememberedTeamKey, teamOptions);
  const activeTeamLabel =
    teamOptions.find((option) => option.value === activeTeamKey)?.label ??
    teamOptions[0]?.label ??
    "暂无项目组";
  const filteredItems = useMemo(() => {
    return data.items.filter((item) => {
      const matchSearch =
        !visibleSearch ||
        [
          item.projectName,
          item.taskName,
          item.milestone,
          item.ownerName,
          item.productOwnerName,
          item.artOwnerName,
          item.statusLabel,
          item.suggestion,
          ...item.reasonTags,
        ].some((value) => value.includes(visibleSearch));
      const matchTeam = activeTeamKey === "all" || item.projectTeamKey === activeTeamKey;
      const matchOwner = ownerFilter === "all" || item.productOwnerKey === ownerFilter;
      const matchArt = artFilter === "all" || item.artOwnerKey === artFilter;
      const matchRisk = !riskOnly || item.riskLevel === "risk" || item.riskLevel === "delay" || item.isStale || item.isBlocked;
      const matchMine =
        !mineOnly ||
        !activeMineKey ||
        [item.ownerKey, item.productOwnerKey, item.artOwnerKey].includes(activeMineKey);

      return matchSearch && matchTeam && matchOwner && matchArt && matchRisk && matchMine;
    });
  }, [activeMineKey, activeTeamKey, artFilter, data.items, mineOnly, ownerFilter, riskOnly, visibleSearch]);
  const groupMilestoneCards = useMemo(() => {
    return data.milestoneBoard.cards.filter((card) => {
      const matchTeam = activeTeamKey === "all" || card.projectTeamKey === activeTeamKey;
      const matchSearch = !visibleSearch || card.name.includes(visibleSearch);

      return matchTeam && matchSearch;
    });
  }, [activeTeamKey, data.milestoneBoard.cards, visibleSearch]);
  const milestoneBoard = useMemo<ProductGuideMilestoneBoard>(
    () => ({
      ...data.milestoneBoard,
      cards: groupMilestoneCards,
    }),
    [data.milestoneBoard, groupMilestoneCards],
  );
  const visibleUnassignedProjects = useMemo(() => {
    return data.unassignedProjects.filter((project) => {
      if (assignedProjectIds.has(project.id)) {
        return false;
      }

      return (
        !visibleSearch ||
        [
          project.projectName,
          project.projectCode,
          project.ipName,
          project.licensorName,
          project.productType,
          project.projectStartDate,
          project.shouldStartDate,
          project.shouldStartSource,
          project.plannedLaunchDate,
          project.currentStage,
          project.status,
          project.productOwnerName,
          project.artOwnerName,
        ].some((value) => value?.includes(visibleSearch))
      );
    });
  }, [assignedProjectIds, data.unassignedProjects, visibleSearch]);
  const selectedMilestoneCard = groupMilestoneCards.find((card) => card.id === selectedMilestoneCardId);
  const selectedItem = selectedMilestoneCard
    ? filteredItems.find((item) => item.id === selectedItemId) ??
      filteredItems.find((item) => item.projectId === selectedMilestoneCard.projectId)
    : filteredItems.find((item) => item.id === selectedItemId);
  const activeDetailProjectId = selectedItem?.projectId ?? selectedMilestoneCard?.projectId;
  const selectedStyleSummaries = useMemo(
    () => data.styleSummaries.filter((style) => style.projectId === activeDetailProjectId),
    [activeDetailProjectId, data.styleSummaries],
  );
  const weeklyBuckets = useMemo(() => buildWeeklyBuckets(filteredItems), [filteredItems]);
  const hasDetailPanel = activeGroupPage !== "unassigned-projects" && Boolean(selectedItem || selectedMilestoneCard);
  const activePageLabel =
    activeGroupPage === "milestones"
      ? "里程碑"
      : activeGroupPage === "week-guide"
        ? "本周工作指引"
        : "未分配的项目";
  const filterSummary = [
    activePageLabel,
    ownerFilter === "all" ? "全部产品研发" : data.filters.productOwners.find((option) => option.value === ownerFilter)?.label,
    artFilter === "all" ? "全部产品美术" : data.filters.artOwners.find((option) => option.value === artFilter)?.label,
    riskOnly ? "只看风险" : null,
    mineOnly ? "只看我负责" : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const pageTitle =
    activeGroupPage === "milestones"
      ? `${activeTeamLabel} 里程碑`
      : activeGroupPage === "week-guide"
        ? `${activeTeamLabel} 本周工作指引`
        : "未分配的项目";
  const pageHelper =
    activeGroupPage === "milestones"
      ? "按里程碑查看本组要推进的项目"
      : activeGroupPage === "week-guide"
        ? "先看本周怎么推进，再看风险和反馈"
        : "按项目应开始时间查看未分配项目，拖到右侧项目组完成分配";
  const pageIcon =
    activeGroupPage === "milestones" ? (
      <CalendarDays size={18} />
    ) : activeGroupPage === "week-guide" ? (
      <ListChecks size={18} />
    ) : (
      <Inbox size={18} />
    );
  const activeTeamIndex = Math.max(0, teamOptions.findIndex((option) => option.value === activeTeamKey));

  function notify(nextMessage: string, tone: "info" | "warning" = "info") {
    setMessage(nextMessage);
    setMessageTone(tone);
  }

  function selectItem(itemId: string) {
    const nextItem = filteredItems.find((item) => item.id === itemId);
    setSelectedItemId(itemId);
    setSelectedMilestoneCardId("");
    setActiveAction(null);
    setTaskForm(defaultTaskActionForm(nextItem));
    setStyleForm(defaultStyleListForm());
  }

  function selectMilestoneCard(card: ProductGuideMilestoneCard) {
    const nextItem = filteredItems.find((item) => item.projectId === card.projectId);
    setSelectedMilestoneCardId(card.id);
    setSelectedItemId(nextItem?.id ?? "");
    setActiveAction(null);
    setTaskForm(defaultTaskActionForm(nextItem));
    setStyleForm(defaultStyleListForm());
  }

  function chooseTeam(teamKey: string) {
    saveTeamPreference(teamKey);
    setSelectedItemId("");
    setSelectedMilestoneCardId("");
    setActiveAction(null);
  }

  function switchTeam(offset: number) {
    if (teamOptions.length === 0) {
      return;
    }

    const nextIndex = (activeTeamIndex + offset + teamOptions.length) % teamOptions.length;
    chooseTeam(teamOptions[nextIndex].value);
  }

  async function saveTaskAction(action: "complete" | "progress" | "expected-finish" | "block" | "unblock" | "submit-review") {
    if (!selectedItem?.taskId) {
      notify("当前指引没有关联项目任务，不能直接写入任务进度。", "warning");
      return;
    }

    const payload =
      action === "complete"
        ? {
            action,
            actualFinishDate: taskForm.actualFinishDate,
            note: taskForm.note,
          }
        : action === "progress"
          ? {
              action,
              status: taskForm.taskStatus,
              note: taskForm.note,
            }
        : action === "expected-finish"
          ? {
              action,
              expectedFinishDate: taskForm.expectedFinishDate,
              note: taskForm.note,
            }
          : action === "block"
          ? {
              action,
              blockReason: taskForm.blockReason,
              note: taskForm.note,
            }
            : action === "submit-review"
              ? {
                  action,
                  submittedAt: taskForm.submittedAt,
                  reviewTarget: taskForm.reviewTarget,
                  note: taskForm.note,
                }
              : {
                  action,
                  note: taskForm.note,
                };

    await saveMutation({
      path: `/api/product-guide/tasks/${selectedItem.taskId}`,
      method: "PATCH",
      payload,
      onSuccess: (result) => {
        setActiveAction(null);
        setPendingUpdateCount((count) => count + 1);
        notify(result.message ?? "已保存。");
        router.refresh();
      },
    });
  }

  async function saveStyleList() {
    if (!selectedItem) {
      return;
    }

    await saveMutation({
      path: "/api/product-guide/modeling-tasks",
      method: "POST",
      payload: {
        projectId: selectedItem.projectId,
        projectTaskId: selectedItem.taskId,
        styleNames: styleForm.styleNames,
        styleCount: styleForm.styleCount,
        difficulty: styleForm.difficulty,
        estimatedWorkdays: styleForm.estimatedWorkdays,
        originalArtStatus: styleForm.originalArtStatus,
        originalArtApprovedDate: styleForm.originalArtApprovedDate,
        note: styleForm.note,
      },
      onSuccess: (result) => {
        setActiveAction(null);
        setStyleForm(defaultStyleListForm());
        setPendingUpdateCount((count) => count + 1);
        notify(result.message ?? "已生成建模款式。");
        router.refresh();
      },
    });
  }

  function handleProjectDragStart(event: DragEvent<HTMLElement>, projectId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", projectId);
    setDraggedProjectId(projectId);
  }

  function handleProjectDragEnd() {
    setDraggedProjectId("");
    setHoverTeamKey("");
  }

  async function assignProjectTeam(projectId: string, teamKey: string) {
    if (!projectId || !teamKey || assigningProjectId) {
      return;
    }

    const targetTeam = teamTargets.find((team) => team.value === teamKey);
    if (!targetTeam) {
      notify("请选择有效的项目组。", "warning");
      return;
    }

    setAssigningProjectId(projectId);
    setHoverTeamKey("");
    await saveMutation({
      path: `/api/projects/${encodeURIComponent(projectId)}`,
      method: "PATCH",
      payload: { projectTeamId: teamKey },
      onSuccess: (result) => {
        setAssignedProjectIds((current) => {
          const next = new Set(current);
          next.add(projectId);
          return next;
        });
        notify(result.message ?? `已指定到${targetTeam.label}。`);
        router.refresh();
      },
    });
    setAssigningProjectId("");
    setDraggedProjectId("");
  }

  async function saveMutation({
    path,
    method,
    payload,
    onSuccess,
  }: {
    path: string;
    method: "POST" | "PATCH";
    payload: unknown;
    onSuccess: (result: MutationResponse) => void;
  }) {
    setSaving(true);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as MutationResponse;

      if (!response.ok || !result.ok) {
        notify(result.message ?? "保存失败。", "warning");
        return;
      }

      onSuccess(result);
    } catch {
      notify("保存接口暂时不可用。", "warning");
    } finally {
      setSaving(false);
    }
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
            <SideNavButton label="项目排期" badge="P0" onClick={() => router.push("/")} />
            <SideNavButton label="产品组工作指引" badge="P0" active />
            <SideNavButton label="建模排期" badge="P0" onClick={() => router.push("/modeling")} />
            <SideNavButton label="用户数据" badge="基础" onClick={() => router.push("/users")} />
            <SideNavButton label="数据导入" badge="预览" onClick={() => router.push("/imports")} />
          </nav>
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="min-w-0 px-6 py-4 max-md:px-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">产品组工作指引</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{activeTeamLabel}</span>
                <span className="text-slate-300">/</span>
                <span>{filterSummary}</span>
                <span className="text-slate-300">/</span>
                <span>刷新：{formatDateTime(data.generatedAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <CompactNavButton icon={<ExternalLink size={14} />} label="项目排期" onClick={() => router.push("/")} />
              <CompactNavButton icon={<Palette size={14} />} label="建模排期" onClick={() => router.push("/modeling")} />
            </div>
          </header>

          {message ? (
            <div
              className={clsx(
                "mt-4 rounded-lg border px-3 py-2 text-sm",
                messageTone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-blue-200 bg-blue-50 text-blue-900",
              )}
            >
              {message}
            </div>
          ) : null}

          {pendingUpdateCount > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>已有 {pendingUpdateCount} 项进度更新，建议重新测算后查看预测视图。</span>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-md border border-amber-200 bg-white px-2.5 py-1 font-semibold hover:bg-amber-100"
              >
                去项目排期
              </button>
            </div>
          ) : null}

          <section className="mt-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => switchTeam(-1)}
                  disabled={teamOptions.length <= 1}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  上一组
                </button>
                <select
                  value={activeTeamKey}
                  onChange={(event) => {
                    chooseTeam(event.target.value);
                  }}
                  className="h-8 min-w-[180px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                >
                  {teamOptions.length > 0 ? (
                    teamOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  ) : (
                    <option value="all">暂无项目组</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => switchTeam(1)}
                  disabled={teamOptions.length <= 1}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  下一组
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex rounded-md bg-slate-100 p-0.5">
                  <PageTabButton
                    active={activeGroupPage === "milestones"}
                    icon={<CalendarDays size={14} />}
                    label="里程碑"
                  onClick={() => {
                    setActiveGroupPage("milestones");
                    setSelectedItemId("");
                    setSelectedMilestoneCardId("");
                    setActiveAction(null);
                  }}
                />
                  <PageTabButton
                    active={activeGroupPage === "week-guide"}
                    icon={<ListChecks size={14} />}
                    label="本周工作指引"
                  onClick={() => {
                    setActiveGroupPage("week-guide");
                    setSelectedItemId("");
                    setSelectedMilestoneCardId("");
                    setActiveAction(null);
                  }}
                />
                  <PageTabButton
                    active={activeGroupPage === "unassigned-projects"}
                    icon={<Inbox size={14} />}
                    label="未分配的项目"
                    onClick={() => {
                      setActiveGroupPage("unassigned-projects");
                      setSelectedItemId("");
                      setSelectedMilestoneCardId("");
                      setActiveAction(null);
                    }}
                  />
                </div>
                <details className="relative">
                  <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <Search size={14} />
                    筛选
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 grid w-[min(760px,calc(100vw-2rem))] grid-cols-[minmax(220px,1fr)_repeat(3,minmax(130px,0.7fr))_auto] gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg max-xl:grid-cols-3 max-md:left-0 max-md:right-auto max-md:w-[calc(100vw-2rem)] max-md:grid-cols-1">
                    <label className="relative min-w-0">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="搜索项目、任务、负责人"
                        className="h-8 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      />
                    </label>
                    <SelectControl
                      label="产品研发"
                      value={ownerFilter}
                      onChange={setOwnerFilter}
                      allLabel="全部产品研发"
                      options={data.filters.productOwners}
                    />
                    <SelectControl
                      label="产品美术"
                      value={artFilter}
                      onChange={setArtFilter}
                      allLabel="全部产品美术"
                      options={data.filters.artOwners}
                    />
                    <SelectControl
                      label="我的视角"
                      value={minePersonFilter}
                      onChange={setMinePersonFilter}
                      allLabel="自动选择"
                      options={data.filters.people}
                    />
                    <div className="flex h-8 gap-1.5">
                      <ToggleButton
                        active={riskOnly}
                        icon={<AlertTriangle size={14} />}
                        label="只看风险"
                        onClick={() => setRiskOnly((current) => !current)}
                      />
                      <ToggleButton
                        active={mineOnly}
                        icon={<UserRound size={14} />}
                        label="只看我负责"
                        onClick={() => setMineOnly((current) => !current)}
                      />
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </section>

          <section
            className={clsx(
              "mt-2 grid gap-4 max-xl:grid-cols-1",
              hasDetailPanel ? "grid-cols-[minmax(0,1fr)_380px] max-2xl:grid-cols-[minmax(0,1fr)_350px]" : "grid-cols-1",
            )}
          >
            <div className="min-w-0">
              <SectionTitle
                icon={pageIcon}
                title={pageTitle}
                helper={pageHelper}
              />
              <div className="mt-3 grid gap-3">
                {activeGroupPage === "milestones" ? (
                  <MilestonePage
                    board={milestoneBoard}
                    selectedCardId={selectedMilestoneCard?.id}
                    onSelectCard={selectMilestoneCard}
                  />
                ) : activeGroupPage === "week-guide" ? (
                  <WeeklyGuidePage buckets={weeklyBuckets} selectedItemId={selectedItem?.id} onSelectItem={selectItem} />
                ) : (
                  <UnassignedProjectsPage
                    projects={visibleUnassignedProjects}
                    teamTargets={teamTargets}
                    draggedProjectId={draggedProjectId}
                    hoverTeamKey={hoverTeamKey}
                    assigningProjectId={assigningProjectId}
                    onProjectDragStart={handleProjectDragStart}
                    onProjectDragEnd={handleProjectDragEnd}
                    onTeamHover={setHoverTeamKey}
                    onTeamDrop={assignProjectTeam}
                  />
                )}
              </div>
            </div>

            {hasDetailPanel ? (
              <DetailPanel
                item={selectedItem}
                milestoneCard={selectedItem ? undefined : selectedMilestoneCard}
                styles={selectedStyleSummaries}
                activeAction={activeAction}
                setActiveAction={setActiveAction}
                taskForm={taskForm}
                setTaskForm={setTaskForm}
                styleForm={styleForm}
                setStyleForm={setStyleForm}
                saving={saving}
                onSaveTaskAction={saveTaskAction}
                onSaveStyleList={saveStyleList}
                onOpenSchedule={() => router.push("/")}
                onOpenModeling={() => router.push("/modeling")}
                onOpenProjectAnalysis={(projectId) => router.push(`/product-guide/project-analysis/${projectId}`)}
              />
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}

function MilestonePage({
  board,
  selectedCardId,
  onSelectCard,
}: {
  board: ProductGuideMilestoneBoard;
  selectedCardId?: string;
  onSelectCard: (card: ProductGuideMilestoneCard) => void;
}) {
  const [viewMode, setViewMode] = useState<MilestoneBoardMode>("plan");

  if (board.months.length === 0) {
    return <EmptyGuideState text="当前没有可展示的项目排期里程碑。" />;
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <div className="inline-flex rounded-md bg-slate-100 p-0.5">
          <MilestoneModeButton
            active={viewMode === "plan"}
            icon={<CalendarDays size={14} />}
            label="规划视图"
            onClick={() => setViewMode("plan")}
          />
          <MilestoneModeButton
            active={viewMode === "forecast"}
            icon={<Gauge size={14} />}
            label="压力预测"
            onClick={() => setViewMode("forecast")}
          />
        </div>
        <div className="text-xs text-slate-500">
          {viewMode === "plan" ? "查看原规划月份" : "查看当前测算压力月份"}
        </div>
      </div>
      <MilestoneMatrixBoard
        board={board}
        mode={viewMode}
        selectedCardId={selectedCardId}
        onSelectCard={onSelectCard}
      />
    </div>
  );
}

function MilestoneModeButton({
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
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-semibold transition",
        active ? "bg-white text-rose-700 shadow-sm" : "text-slate-500 hover:text-slate-800",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MilestoneMatrixBoard({
  board,
  mode,
  selectedCardId,
  onSelectCard,
}: {
  board: ProductGuideMilestoneBoard;
  mode: MilestoneBoardMode;
  selectedCardId?: string;
  onSelectCard: (card: ProductGuideMilestoneCard) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef(new Map<string, HTMLDivElement>());
  const title = mode === "plan" ? "里程碑看板（规划）" : "压力预测";
  const helper = mode === "plan" ? "按计划月份归位" : "按预测月份归位";

  useEffect(() => {
    if (!board.initialMonth || !scrollRef.current) {
      return;
    }

    const target = monthRefs.current.get(board.initialMonth);
    if (!target) {
      return;
    }

    scrollRef.current.scrollTop = Math.max(target.offsetTop - 48, 0);
  }, [board.initialMonth, board.months, mode]);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          {mode === "plan" ? <CalendarDays size={16} /> : <Gauge size={16} />}
          {title}
        </div>
        <div className="text-xs text-slate-500">{helper} · 可上下滚动查看历史月份</div>
      </div>
      <div ref={scrollRef} className="max-h-[72vh] overflow-auto scroll-smooth">
        <div className="grid min-w-[1120px] grid-cols-[96px_repeat(6,minmax(160px,1fr))]">
          <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-50 p-3 text-center text-sm font-semibold">
            月份
          </div>
          {board.milestones.map((milestone) => (
            <div
              key={`${mode}:${milestone}:head`}
              className="sticky top-0 z-20 border-b border-r border-slate-200 bg-rose-50 p-3 text-center text-sm font-semibold last:border-r-0"
            >
              {milestone}
            </div>
          ))}
          {board.months.map((month) => (
            <MilestoneMatrixRow
              key={`${mode}:${month}`}
              month={month}
              milestones={board.milestones}
              cards={board.cards}
              mode={mode}
              selectedCardId={selectedCardId}
              onSelectCard={onSelectCard}
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

function MilestoneMatrixRow({
  month,
  milestones,
  cards,
  mode,
  selectedCardId,
  onSelectCard,
  monthRef,
}: {
  month: string;
  milestones: string[];
  cards: ProductGuideMilestoneCard[];
  mode: MilestoneBoardMode;
  selectedCardId?: string;
  onSelectCard: (card: ProductGuideMilestoneCard) => void;
  monthRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <>
      <div
        ref={monthRef}
        data-month={month}
        className="flex min-h-28 items-center justify-center border-b border-r border-slate-200 bg-slate-50 p-3 text-base font-semibold"
      >
        {month}
      </div>
      {milestones.map((milestone) => {
        const laneCards = cards
          .filter((card) => cardMonth(card, mode) === month && card.milestone === milestone)
          .sort(sortMilestoneCards);

        return (
          <div key={`${mode}:${month}:${milestone}`} className="min-h-28 border-b border-r border-slate-200 p-3 last:border-r-0">
            <div className="grid gap-1.5">
              {laneCards.length > 0 ? (
                laneCards.map((card) => (
                  <button
                    key={`${mode}:${month}:${milestone}:${card.id}`}
                    type="button"
                    onClick={() => onSelectCard(card)}
                    title={card.name}
                    className={clsx(
                      "h-8 truncate rounded-full border px-3 text-sm font-medium shadow-sm transition hover:ring-2 hover:ring-blue-400",
                      milestoneCardClass[card.riskLevel],
                      selectedCardId === card.id ? "ring-2 ring-blue-500" : "",
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
function WeeklyGuidePage({
  buckets,
  selectedItemId,
  onSelectItem,
}: {
  buckets: WeeklyGuideBucket[];
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {buckets.map((bucket) => (
        <section
          key={bucket.key}
          className={clsx(
            "rounded-lg border bg-white p-2 shadow-sm",
            bucket.key === "risk" ? "border-amber-200" : bucket.key === "licensor" ? "border-violet-200" : "border-slate-200",
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="text-sm font-semibold text-slate-900">{bucket.title}</div>
          </div>
          <div className={clsx("mt-2 grid gap-2 px-2 text-[11px] font-medium text-slate-400", weeklyTaskGridClass)}>
            <span>项目</span>
            <span>任务</span>
            <span>DDL</span>
            <span>延期线</span>
          </div>
          <div className="mt-2 grid gap-1.5">
            {bucket.items.length > 0 ? (
              bucket.items.map((item) => (
                <WeeklyTaskRow
                  key={`${bucket.key}:${item.id}`}
                  item={item}
                  selected={selectedItemId === item.id}
                  onSelect={() => onSelectItem(item.id)}
                />
              ))
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-500">
                {bucket.emptyText}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function WeeklyTaskRow({
  item,
  selected,
  onSelect,
}: {
  item: ProductGuideItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${item.projectName} / ${item.taskName}`}
      className={clsx(
        "grid min-h-10 w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition hover:bg-slate-50",
        weeklyTaskGridClass,
        selected ? "border-rose-300 bg-rose-50 ring-1 ring-rose-100" : "border-slate-200 bg-white",
      )}
    >
      <span className="min-w-0 truncate font-semibold text-slate-900">{item.projectName}</span>
      <span className="min-w-0 truncate text-slate-700">{item.taskName}</span>
      <span className="whitespace-nowrap text-slate-500">{taskDeadline(item)}</span>
      <span className="min-w-0 truncate text-amber-700">{delayTriggerText(item)}</span>
    </button>
  );
}

function UnassignedProjectsPage({
  projects,
  teamTargets,
  draggedProjectId,
  hoverTeamKey,
  assigningProjectId,
  onProjectDragStart,
  onProjectDragEnd,
  onTeamHover,
  onTeamDrop,
}: {
  projects: ProductGuideUnassignedProject[];
  teamTargets: ProductGuideFilterOption[];
  draggedProjectId: string;
  hoverTeamKey: string;
  assigningProjectId: string;
  onProjectDragStart: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onProjectDragEnd: () => void;
  onTeamHover: (teamKey: string) => void;
  onTeamDrop: (projectId: string, teamKey: string) => void;
}) {
  const [selectedCycleStart, setSelectedCycleStart] = useState("");
  const draggedProject = projects.find((project) => project.id === draggedProjectId);
  const cycleOptions = useMemo(() => buildProductStartCycleOptions(projects), [projects]);
  const selectedCycle = cycleOptions.find((option) => option.startMonth === selectedCycleStart) ?? cycleOptions[0];
  const selectedMonths = selectedCycle?.months ?? emptyProductStartMonths;
  const monthSet = useMemo(() => new Set(selectedMonths), [selectedMonths]);
  const projectsByMonth = useMemo(() => {
    return selectedMonths.reduce<Record<string, ProductGuideUnassignedProject[]>>((acc, month) => {
      acc[month] = projects
        .filter((project) => productStartMonthLabel(project) === month)
        .sort(sortUnassignedProjectByStartDate);
      return acc;
    }, {});
  }, [projects, selectedMonths]);
  const noStartDateProjects = useMemo(
    () => projects.filter((project) => !project.shouldStartDate).sort(sortUnassignedProjectByStartDate),
    [projects],
  );
  const outOfCycleProjects = useMemo(
    () =>
      projects
        .filter((project) => {
          const month = productStartMonthLabel(project);
          return month && !monthSet.has(month);
        })
        .sort(sortUnassignedProjectByStartDate),
    [monthSet, projects],
  );

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-3 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <CalendarDays size={16} />
                项目开启日历
              </div>
              <div className="mt-1 text-xs text-slate-500">
                按项目应开始时间归入月份，共 {projects.length} 个未分配项目
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {cycleOptions.map((option) => (
                  <button
                    key={option.startMonth}
                    type="button"
                    onClick={() => setSelectedCycleStart(option.startMonth)}
                    title={option.rangeLabel}
                    className={clsx(
                      "rounded-md px-3 py-1.5 text-xs font-semibold",
                      selectedCycle?.startMonth === option.startMonth ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {outOfCycleProjects.length > 0 ? (
                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  其他周期 {outOfCycleProjects.length} 个
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {projects.length > 0 ? (
          <>
            <div className="grid max-h-[72vh] grid-cols-3 gap-px overflow-auto bg-slate-200 max-xl:grid-cols-2 max-md:grid-cols-1">
              {selectedMonths.map((month) => (
                <ProductStartMonthCell
                  key={month}
                  month={month}
                  projects={projectsByMonth[month] ?? []}
                  draggedProjectId={draggedProjectId}
                  assigningProjectId={assigningProjectId}
                  teamTargets={teamTargets}
                  onProjectDragStart={onProjectDragStart}
                  onProjectDragEnd={onProjectDragEnd}
                  onTeamDrop={onTeamDrop}
                />
              ))}
            </div>
            {noStartDateProjects.length > 0 ? (
              <div className="border-t border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold text-slate-900">待补开始日期</div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {noStartDateProjects.map((project) => (
                    <UnassignedProjectCalendarCard
                      key={project.id}
                      project={project}
                      dragged={draggedProjectId === project.id}
                      assigning={assigningProjectId === project.id}
                      teamTargets={teamTargets}
                      onProjectDragStart={onProjectDragStart}
                      onProjectDragEnd={onProjectDragEnd}
                      onTeamDrop={onTeamDrop}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="p-3">
            <EmptyGuideState text="当前没有未分配项目。" />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="border-b border-slate-100 pb-2">
          <div className="text-sm font-semibold text-slate-900">项目组</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {draggedProject ? `正在分配：${draggedProject.projectName}` : "从开启日历拖动项目到目标项目组"}
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          {teamTargets.length > 0 ? (
            teamTargets.map((team) => (
              <div
                key={team.value}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (draggedProjectId) {
                    onTeamHover(team.value);
                  }
                }}
                onDragOver={(event) => {
                  if (!draggedProjectId) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={(event) => {
                  const relatedTarget = event.relatedTarget;
                  if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
                    return;
                  }
                  if (hoverTeamKey === team.value) {
                    onTeamHover("");
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const projectId = event.dataTransfer.getData("text/plain") || draggedProjectId;
                  onTeamHover("");
                  if (projectId) {
                    onTeamDrop(projectId, team.value);
                  }
                }}
                className={clsx(
                  "rounded-lg border border-dashed p-3 transition",
                  hoverTeamKey === team.value
                    ? "border-rose-300 bg-rose-50 ring-2 ring-rose-100"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{team.label}</div>
                    <div className="mt-1 text-xs text-slate-500">放开后保存到该项目组</div>
                  </div>
                  <MoveRight className="shrink-0 text-slate-400" size={16} />
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              暂无可分配项目组，请先在用户数据里维护项目组。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProductStartMonthCell({
  month,
  projects,
  draggedProjectId,
  assigningProjectId,
  teamTargets,
  onProjectDragStart,
  onProjectDragEnd,
  onTeamDrop,
}: {
  month: string;
  projects: ProductGuideUnassignedProject[];
  draggedProjectId: string;
  assigningProjectId: string;
  teamTargets: ProductGuideFilterOption[];
  onProjectDragStart: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onProjectDragEnd: () => void;
  onTeamDrop: (projectId: string, teamKey: string) => void;
}) {
  const pressureTone = projects.length >= 5 ? "高" : projects.length >= 3 ? "中" : "低";

  return (
    <div className="min-h-64 bg-white p-3 transition hover:bg-rose-50/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{month}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
            <span>{projects.length} 个项目</span>
            <span>开启压力 {pressureTone}</span>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          未归组
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {projects.length > 0 ? (
          projects.map((project) => (
            <UnassignedProjectCalendarCard
              key={project.id}
              project={project}
              dragged={draggedProjectId === project.id}
              assigning={assigningProjectId === project.id}
              teamTargets={teamTargets}
              onProjectDragStart={onProjectDragStart}
              onProjectDragEnd={onProjectDragEnd}
              onTeamDrop={onTeamDrop}
            />
          ))
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
            暂无开启项目
          </div>
        )}
      </div>
    </div>
  );
}

function UnassignedProjectCalendarCard({
  project,
  dragged,
  assigning,
  teamTargets,
  onProjectDragStart,
  onProjectDragEnd,
  onTeamDrop,
}: {
  project: ProductGuideUnassignedProject;
  dragged: boolean;
  assigning: boolean;
  teamTargets: ProductGuideFilterOption[];
  onProjectDragStart: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onProjectDragEnd: () => void;
  onTeamDrop: (projectId: string, teamKey: string) => void;
}) {
  return (
    <article
      draggable={!assigning}
      onDragStart={(event) => onProjectDragStart(event, project.id)}
      onDragEnd={onProjectDragEnd}
      className={clsx(
        "min-h-24 rounded-lg border p-2.5 text-left text-sm shadow-sm transition",
        assigning
          ? "cursor-wait border-blue-200 bg-blue-50 opacity-80"
          : dragged
            ? "cursor-grabbing border-rose-300 bg-rose-50 opacity-80 ring-2 ring-rose-100"
            : "cursor-grab border-slate-200 bg-white hover:ring-2 hover:ring-blue-400",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 font-semibold leading-5 text-slate-950">{project.projectName}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
            {project.projectCode ? <span>{project.projectCode}</span> : null}
            {project.ipName ? <span>{project.ipName}</span> : null}
            {project.productType ? <span>{project.productType}</span> : null}
          </div>
        </div>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
          {assigning ? "保存中" : project.status}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
        <UnassignedProjectField label="应开始" value={project.shouldStartDate ?? "待补"} />
        <UnassignedProjectField label="计划上线" value={project.plannedLaunchDate ?? "待补"} />
        <UnassignedProjectField label="产品研发" value={project.productOwnerName} />
        <UnassignedProjectField label="产品美术" value={project.artOwnerName} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <span className="text-xs text-slate-500">{project.shouldStartSource}</span>
        <select
          value=""
          disabled={assigning || teamTargets.length === 0}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            if (event.target.value) {
              onTeamDrop(project.id, event.target.value);
            }
          }}
          className="h-7 max-w-28 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">指定到</option>
          {teamTargets.map((team) => (
            <option key={team.value} value={team.value}>
              {team.label}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function UnassignedProjectField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1 text-slate-700">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 truncate font-semibold">{value}</div>
    </div>
  );
}

function EmptyGuideState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
      {text}
    </div>
  );
}

function PageTabButton({
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
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-semibold transition",
        active ? "bg-white text-rose-700 shadow-sm" : "text-slate-500 hover:text-slate-800",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DetailPanel({
  item,
  milestoneCard,
  styles,
  activeAction,
  setActiveAction,
  taskForm,
  setTaskForm,
  styleForm,
  setStyleForm,
  saving,
  onSaveTaskAction,
  onSaveStyleList,
  onOpenSchedule,
  onOpenModeling,
  onOpenProjectAnalysis,
}: {
  item?: ProductGuideItem;
  milestoneCard?: ProductGuideMilestoneCard;
  styles: ProductGuideStyleSummary[];
  activeAction: GuideActionKind | null;
  setActiveAction: (action: GuideActionKind | null) => void;
  taskForm: TaskActionForm;
  setTaskForm: (form: TaskActionForm) => void;
  styleForm: StyleListForm;
  setStyleForm: (form: StyleListForm) => void;
  saving: boolean;
  onSaveTaskAction: (action: "complete" | "progress" | "expected-finish" | "block" | "unblock" | "submit-review") => void;
  onSaveStyleList: () => void;
  onOpenSchedule: () => void;
  onOpenModeling: () => void;
  onOpenProjectAnalysis: (projectId: string) => void;
}) {
  if (!item) {
    if (milestoneCard) {
      return (
        <aside className="sticky top-4 h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-xl:static">
          <div className="text-sm font-medium text-slate-500">{milestoneCard.projectTeamName}</div>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{milestoneCard.name}</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
            <MiniStat label="里程碑" value={milestoneCard.milestone} />
            <MiniStat label="状态" value={milestoneRiskLabel(milestoneCard.riskLevel)} />
            <MiniStat label="规划月份" value={milestoneCard.plannedMonth ?? "待补充"} />
            <MiniStat label="预测月份" value={milestoneCard.forecastMonth ?? "待测算"} />
          </div>
          <div className="mt-4 grid gap-3">
            <DetailBlock title="项目说明" body="该项目当前没有触发待处理工作指引，但仍属于本项目组完整排期里程碑。"/>
            <DetailBlock
              title="看板口径"
              body="规划视图按项目排期计划月份展示；压力预测按最新测算预测月份展示。"
              emphasis
            />
            <StyleSummaryBlock styles={styles} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<BarChart3 size={16} />} label="项目分析" onClick={() => onOpenProjectAnalysis(milestoneCard.projectId)} />
            <ActionButton icon={<CalendarDays size={16} />} label="项目排期" onClick={onOpenSchedule} />
            <ActionButton icon={<Palette size={16} />} label="建模排期" onClick={onOpenModeling} />
          </div>
        </aside>
      );
    }

    return (
      <aside className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
        请选择一条工作指引。
      </aside>
    );
  }

  return (
    <aside className="sticky top-4 h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-xl:static">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-500">{item.projectTeamName}</div>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{item.projectName}</h2>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", riskMeta[item.riskLevel].badgeClass)}>
            {item.riskLabel}
          </span>
          <button
            type="button"
            onClick={() => onOpenProjectAnalysis(item.projectId)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <BarChart3 size={14} />
            项目分析
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <MiniStat label="项目进度" value={`${item.projectProgressPercent}%`} />
        <MiniStat label="未更新" value={item.isStale ? `${item.staleDays} 天` : "正常"} />
        <MiniStat label="产品研发" value={item.productOwnerName} />
        <MiniStat label="产品美术" value={item.artOwnerName} />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>项目进度</span>
          <span>{item.projectProgressPercent}%</span>
        </div>
        <ProgressBar value={item.projectProgressPercent} riskLevel={item.riskLevel} />
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-slate-400">建议动作按钮</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.taskId ? (
            <>
              <SmallActionButton
                label="标记完成"
                onClick={() => {
                  setTaskForm(defaultTaskActionForm(item));
                  setActiveAction("complete");
                }}
              />
              <SmallActionButton
                label="更新进度"
                onClick={() => {
                  setTaskForm(defaultTaskActionForm(item));
                  setActiveAction("progress");
                }}
              />
              <SmallActionButton
                label="更新预计时间"
                onClick={() => {
                  setTaskForm(defaultTaskActionForm(item));
                  setActiveAction("expected-finish");
                }}
              />
              <SmallActionButton
                label="送审"
                onClick={() => {
                  setTaskForm(defaultTaskActionForm(item));
                  setActiveAction("submit-review");
                }}
              />
              {item.isBlocked ? (
                <SmallActionButton
                  label="解除阻塞"
                  onClick={() => {
                    setTaskForm(defaultTaskActionForm(item));
                    setActiveAction("unblock");
                  }}
                />
              ) : (
                <SmallActionButton
                  label="标记阻塞"
                  onClick={() => {
                    setTaskForm(defaultTaskActionForm(item));
                    setActiveAction("block");
                  }}
                />
              )}
            </>
          ) : null}
          {canShowStyleListAction(item) ? (
            <>
              <SmallActionButton
                label="录入款式"
                onClick={() => {
                  setStyleForm(defaultStyleListForm());
                  setActiveAction("style-list");
                }}
              />
              <SmallActionButton label="管理款式" onClick={onOpenModeling} />
            </>
          ) : null}
        </div>
      </div>

      {activeAction ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {activeAction === "complete" ? (
            <TaskCompleteForm
              form={taskForm}
              setForm={setTaskForm}
              saving={saving}
              onCancel={() => setActiveAction(null)}
              onSubmit={() => onSaveTaskAction("complete")}
            />
          ) : null}
          {activeAction === "progress" ? (
            <ProgressUpdateForm
              form={taskForm}
              setForm={setTaskForm}
              saving={saving}
              onCancel={() => setActiveAction(null)}
              onSubmit={() => onSaveTaskAction("progress")}
            />
          ) : null}
          {activeAction === "expected-finish" ? (
            <ExpectedFinishForm
              form={taskForm}
              setForm={setTaskForm}
              saving={saving}
              onCancel={() => setActiveAction(null)}
              onSubmit={() => onSaveTaskAction("expected-finish")}
            />
          ) : null}
          {activeAction === "block" ? (
            <BlockForm
              form={taskForm}
              setForm={setTaskForm}
              saving={saving}
              onCancel={() => setActiveAction(null)}
              onSubmit={() => onSaveTaskAction("block")}
            />
          ) : null}
          {activeAction === "unblock" ? (
            <UnblockForm
              form={taskForm}
              setForm={setTaskForm}
              saving={saving}
              onCancel={() => setActiveAction(null)}
              onSubmit={() => onSaveTaskAction("unblock")}
            />
          ) : null}
          {activeAction === "submit-review" ? (
            <SubmitReviewForm
              form={taskForm}
              setForm={setTaskForm}
              saving={saving}
              onCancel={() => setActiveAction(null)}
              onSubmit={() => onSaveTaskAction("submit-review")}
            />
          ) : null}
          {activeAction === "style-list" ? (
            <StyleListFormView
              form={styleForm}
              setForm={setStyleForm}
              saving={saving}
              onCancel={() => setActiveAction(null)}
              onSubmit={onSaveStyleList}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <DetailBlock title="任务说明" body={`${item.milestone} / ${item.taskName} / ${item.statusLabel}`} />
        <DetailBlock title="为什么提醒" body={item.reminderReason} />
        <DetailBlock title="建议下一步" body={item.nextStep} emphasis />
        <DetailBlock title="相关项目进度" body={item.relatedProjectProgress} />
        <DetailBlock title="建模进度摘要" body={item.modelingSummary} />
        <StyleSummaryBlock styles={styles} />
        <RecentUpdatesBlock updates={item.recentUpdates} />
        <DetailBlock title="风险文案" body={item.riskCopy} />
        <DetailBlock title="后续链接" body="SOP / 知识库链接后续补充。" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton icon={<BarChart3 size={16} />} label="项目分析" onClick={() => onOpenProjectAnalysis(item.projectId)} />
        <ActionButton icon={<CalendarDays size={16} />} label="项目排期" onClick={onOpenSchedule} />
        <ActionButton icon={<Palette size={16} />} label="建模排期" onClick={onOpenModeling} />
      </div>
    </aside>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="min-w-[132px]">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleButton({
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
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition",
        active
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SideNavButton({
  label,
  badge,
  active,
  onClick,
}: {
  label: string;
  badge: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold",
        active ? "bg-rose-50 text-rose-700" : "text-slate-500 hover:bg-slate-50",
      )}
    >
      {label}
      <span className={clsx("rounded-full px-2 py-0.5 text-xs", active ? "bg-rose-100" : "bg-slate-100")}>{badge}</span>
    </button>
  );
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      {icon}
      {label}
    </button>
  );
}

function CompactNavButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      {icon}
      {label}
    </button>
  );
}

function SmallActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

function TaskCompleteForm({
  form,
  setForm,
  saving,
  onCancel,
  onSubmit,
}: {
  form: TaskActionForm;
  setForm: (form: TaskActionForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="text-sm font-semibold text-slate-900">标记任务已完成</div>
      <LabeledInput
        label="实际完成日期"
        type="date"
        value={form.actualFinishDate}
        onChange={(value) => setForm({ ...form, actualFinishDate: value })}
      />
      <LabeledTextarea
        label="备注"
        value={form.note}
        placeholder="可填写完成说明"
        onChange={(value) => setForm({ ...form, note: value })}
      />
      <FormActions saving={saving} submitLabel="保存完成时间" onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  );
}

function ProgressUpdateForm({
  form,
  setForm,
  saving,
  onCancel,
  onSubmit,
}: {
  form: TaskActionForm;
  setForm: (form: TaskActionForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="text-sm font-semibold text-slate-900">更新任务进度</div>
      <label className="grid gap-1 text-xs font-medium text-slate-500">
        任务状态
        <select
          value={form.taskStatus}
          onChange={(event) => setForm({ ...form, taskStatus: event.target.value })}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
        >
          {taskStatusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <LabeledTextarea
        label="当前进度"
        value={form.note}
        placeholder="例如：已确认需求，等待版权方反馈；或已交给工厂打样"
        onChange={(value) => setForm({ ...form, note: value })}
      />
      <FormActions saving={saving} submitLabel="保存进度" onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  );
}

function ExpectedFinishForm({
  form,
  setForm,
  saving,
  onCancel,
  onSubmit,
}: {
  form: TaskActionForm;
  setForm: (form: TaskActionForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="text-sm font-semibold text-slate-900">更新预计完成日期</div>
      <LabeledInput
        label="预计完成日期"
        type="date"
        value={form.expectedFinishDate}
        onChange={(value) => setForm({ ...form, expectedFinishDate: value })}
      />
      <LabeledTextarea
        label="进度备注"
        value={form.note}
        placeholder="建议填写当前卡点或下一步"
        onChange={(value) => setForm({ ...form, note: value })}
      />
      <FormActions saving={saving} submitLabel="保存预计时间" onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  );
}

function BlockForm({
  form,
  setForm,
  saving,
  onCancel,
  onSubmit,
}: {
  form: TaskActionForm;
  setForm: (form: TaskActionForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="text-sm font-semibold text-slate-900">标记任务阻塞</div>
      <LabeledTextarea
        label="阻塞原因"
        value={form.blockReason}
        placeholder="请填写阻塞原因"
        onChange={(value) => setForm({ ...form, blockReason: value })}
      />
      <LabeledTextarea
        label="进度备注"
        value={form.note}
        placeholder="可补充下一步处理方式"
        onChange={(value) => setForm({ ...form, note: value })}
      />
      <FormActions saving={saving} submitLabel="保存阻塞原因" onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  );
}

function UnblockForm({
  form,
  setForm,
  saving,
  onCancel,
  onSubmit,
}: {
  form: TaskActionForm;
  setForm: (form: TaskActionForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="text-sm font-semibold text-slate-900">解除任务阻塞</div>
      <LabeledTextarea
        label="解除说明"
        value={form.note}
        placeholder="建议说明卡点如何解除，以及下一步由谁推进"
        onChange={(value) => setForm({ ...form, note: value })}
      />
      <FormActions saving={saving} submitLabel="保存解除记录" onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  );
}

function SubmitReviewForm({
  form,
  setForm,
  saving,
  onCancel,
  onSubmit,
}: {
  form: TaskActionForm;
  setForm: (form: TaskActionForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="text-sm font-semibold text-slate-900">记录任务已送审</div>
      <LabeledInput
        label="送审日期"
        type="date"
        value={form.submittedAt}
        onChange={(value) => setForm({ ...form, submittedAt: value })}
      />
      <LabeledInput
        label="送审对象"
        value={form.reviewTarget}
        placeholder="例如：版权方 / 内部评审 / 工厂"
        onChange={(value) => setForm({ ...form, reviewTarget: value })}
      />
      <LabeledTextarea
        label="送审备注"
        value={form.note}
        placeholder="建议写明送审版本、等待谁反馈、下一次跟进时间"
        onChange={(value) => setForm({ ...form, note: value })}
      />
      <FormActions saving={saving} submitLabel="保存送审记录" onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  );
}

function StyleListFormView({
  form,
  setForm,
  saving,
  onCancel,
  onSubmit,
}: {
  form: StyleListForm;
  setForm: (form: StyleListForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <div className="text-sm font-semibold text-slate-900">录入款式清单</div>
        <div className="mt-1 text-xs text-slate-500">有真实名称就逐行填写；没有名称时填写数量，会生成待补充款式。</div>
      </div>
      <LabeledTextarea
        label="款式名称"
        value={form.styleNames}
        placeholder={"例如：\n坐姿款\n站姿款\n表情替换款"}
        onChange={(value) => setForm({ ...form, styleNames: value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput
          label="款式数量"
          type="number"
          value={form.styleCount}
          onChange={(value) => setForm({ ...form, styleCount: value })}
        />
        <LabeledInput
          label="预估工时"
          type="number"
          value={form.estimatedWorkdays}
          onChange={(value) => setForm({ ...form, estimatedWorkdays: value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput
          label="难度"
          value={form.difficulty}
          onChange={(value) => setForm({ ...form, difficulty: value })}
        />
        <label className="grid gap-1 text-xs font-medium text-slate-500">
          原画状态
          <select
            value={form.originalArtStatus}
            onChange={(event) => setForm({ ...form, originalArtStatus: event.target.value })}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
          >
            <option value="未过审">未过审</option>
            <option value="已过审">已过审</option>
          </select>
        </label>
      </div>
      <LabeledInput
        label="原画过审日期"
        type="date"
        value={form.originalArtApprovedDate}
        onChange={(value) => setForm({ ...form, originalArtApprovedDate: value })}
      />
      <LabeledTextarea
        label="备注"
        value={form.note}
        placeholder="可填写款式拆分说明"
        onChange={(value) => setForm({ ...form, note: value })}
      />
      <FormActions saving={saving} submitLabel="生成款式" onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  );
}

function LabeledInput({
  label,
  value,
  type = "text",
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-slate-500">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-slate-500">
      {label}
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="resize-none rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
      />
    </label>
  );
}

function FormActions({
  saving,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 disabled:opacity-50"
      >
        取消
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={saving}
        className="h-9 rounded-md bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
      >
        {saving ? "保存中" : submitLabel}
      </button>
    </div>
  );
}

function SectionTitle({ icon, title, helper }: { icon: ReactNode; title: string; helper: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex items-center gap-2 text-sm font-semibold">
        <span className="rounded-lg bg-white p-2 text-slate-600 ring-1 ring-slate-200">{icon}</span>
        {title}
      </div>
      <div className="text-sm text-slate-500">{helper}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <div className="font-semibold text-slate-900">{value}</div>
      <div className="mt-0.5 text-slate-400">{label}</div>
    </div>
  );
}

function DetailBlock({ title, body, emphasis }: { title: string; body: string; emphasis?: boolean }) {
  return (
    <div className={clsx("rounded-lg border px-3 py-2", emphasis ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50")}>
      <div className="text-xs font-medium text-slate-400">{title}</div>
      <div className={clsx("mt-1 text-sm leading-6", emphasis ? "font-semibold text-rose-900" : "text-slate-700")}>{body}</div>
    </div>
  );
}

function StyleSummaryBlock({ styles }: { styles: ProductGuideStyleSummary[] }) {
  const visibleStyles = styles.slice(0, 8);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-slate-400">款式清单</div>
        <div className="text-xs text-slate-400">{styles.length > 0 ? `${styles.length} 款` : "待录入"}</div>
      </div>
      {visibleStyles.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {visibleStyles.map((style) => (
            <div key={style.id} className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs">
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-800">{style.styleName}</div>
                <div className="mt-0.5 truncate text-slate-400">
                  {style.styleCode} · {style.difficulty} · {style.estimatedWorkdays} 天
                </div>
              </div>
              <span className="truncate text-slate-600">{style.status}</span>
              <span className="truncate text-slate-500">
                {style.originalArtApprovedDate ?? style.originalArtStatus}
              </span>
            </div>
          ))}
          {styles.length > visibleStyles.length ? (
            <div className="text-xs text-slate-400">还有 {styles.length - visibleStyles.length} 款，可在建模排期中查看。</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-slate-200 bg-white px-2 py-2 text-xs text-slate-500">
          该项目尚未录入真实款式。录入后会进入建模排期。
        </div>
      )}
    </div>
  );
}

function RecentUpdatesBlock({ updates }: { updates: ProductGuideItem["recentUpdates"] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium text-slate-400">最近更新记录</div>
      {updates.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {updates.map((update) => (
            <div key={update.id} className="rounded-md bg-white px-2 py-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{update.updateType}</span>
                <span className="text-slate-400">{update.createdAt}</span>
              </div>
              <div className="mt-1 text-slate-500">
                {[update.newValueSummary, update.note, update.updatedByName].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-slate-200 bg-white px-2 py-2 text-xs text-slate-500">
          暂无进度更新记录。
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value, riskLevel }: { value: number; riskLevel: ProductGuideRiskLevel }) {
  const width = Math.max(0, Math.min(100, value));

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div
        className={clsx(
          "h-full rounded-full",
          riskLevel === "delay" ? "bg-rose-500" : riskLevel === "risk" ? "bg-amber-400" : "bg-emerald-500",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function milestoneRiskLabel(value: ProductGuideMilestoneRiskLevel) {
  if (value === "done") return "已完成";
  if (value === "doneLate") return "延期完成";
  if (value === "risk") return "延期风险";
  if (value === "delay") return "必然延期";
  return "正常推进";
}

function taskDeadline(item: ProductGuideItem) {
  return item.dueDate ?? item.plannedFinishDate ?? "待补";
}

function delayTriggerText(item: ProductGuideItem) {
  const triggerDate = item.plannedFinishDate ?? item.dueDate ?? item.forecastFinishDate;

  if (!triggerDate) {
    return "延期线待补";
  }

  if (item.riskLevel === "delay") {
    return `已晚于 ${triggerDate}`;
  }

  return `晚于 ${triggerDate} 会再次延期`;
}

function cardMonth(card: ProductGuideMilestoneCard, mode: MilestoneBoardMode) {
  return mode === "forecast" ? card.forecastMonth ?? card.plannedMonth ?? "" : card.plannedMonth ?? card.forecastMonth ?? "";
}

function sortMilestoneCards(a: ProductGuideMilestoneCard, b: ProductGuideMilestoneCard) {
  const milestoneOrder = milestoneLaneOrder.indexOf(a.milestone) - milestoneLaneOrder.indexOf(b.milestone);
  if (milestoneOrder !== 0) return milestoneOrder;

  return a.name.localeCompare(b.name, "zh-CN");
}

function buildWeeklyBuckets(items: ProductGuideItem[]): WeeklyGuideBucket[] {
  const sortedItems = [...items].sort(sortGuideItems);

  return [
    {
      key: "due",
      title: "本周需完成",
      helper: "优先确认是否已完成，未完成就补预计完成时间。",
      emptyText: "本周暂无明确到期事项。",
      items: sortedItems.filter((item) => item.dueBucket === "today" || item.dueBucket === "this-week"),
    },
    {
      key: "progress",
      title: "本周在推进",
      helper: "跟进当前关键路径，保证负责人知道下一步。",
      emptyText: "当前筛选下暂无推进中的关键事项。",
      items: sortedItems.filter(isInProgressItem),
    },
    {
      key: "start",
      title: "本周要开始",
      helper: "提前确认需求、素材、外包或反馈是否已经准备好。",
      emptyText: "当前筛选下暂无需要提前启动的事项。",
      items: sortedItems.filter(isStartSoonItem),
    },
    {
      key: "risk",
      title: "风险任务",
      helper: "先处理延期、阻塞和长时间未更新的任务。",
      emptyText: "当前筛选下暂无风险任务。",
      items: sortedItems.filter((item) => item.riskLevel === "risk" || item.riskLevel === "delay" || item.isStale || item.isBlocked),
    },
    {
      key: "licensor",
      title: "版权方反馈",
      helper: "需要产品研发或产品美术推动外部反馈闭环。",
      emptyText: "当前筛选下暂无等待版权方反馈事项。",
      items: sortedItems.filter((item) => item.waitingLicensor || item.reasonTags.some((tag) => tag.includes("版权"))),
    },
  ];
}

function isInProgressItem(item: ProductGuideItem) {
  return (
    item.statusLabel.includes("进行") ||
    item.statusLabel.includes("排期") ||
    item.source === "work-task" ||
    item.source === "project-task" ||
    item.requiresArtReview
  );
}

function isStartSoonItem(item: ProductGuideItem) {
  if (item.dueBucket !== "later") {
    return false;
  }

  return item.riskLevel === "normal" || item.riskLevel === "watch" || item.reasonTags.some((tag) => tag.includes("关键路径"));
}

function sortGuideItems(a: ProductGuideItem, b: ProductGuideItem) {
  const riskOrder = riskSortValue(b.riskLevel) - riskSortValue(a.riskLevel);
  if (riskOrder !== 0) return riskOrder;

  if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
  if (a.isBlocked !== b.isBlocked) return a.isBlocked ? -1 : 1;

  const dueOrder = dueBucketSortValue(a.dueBucket) - dueBucketSortValue(b.dueBucket);
  if (dueOrder !== 0) return dueOrder;

  const dateOrder = dateSortValue(a.dueDate ?? a.plannedFinishDate) - dateSortValue(b.dueDate ?? b.plannedFinishDate);
  if (dateOrder !== 0) return dateOrder;

  return a.projectName.localeCompare(b.projectName, "zh-CN");
}

function sortUnassignedProjectByStartDate(a: ProductGuideUnassignedProject, b: ProductGuideUnassignedProject) {
  const startOrder = dateSortValue(a.shouldStartDate) - dateSortValue(b.shouldStartDate);
  if (startOrder !== 0) return startOrder;

  const launchOrder = dateSortValue(a.plannedLaunchDate) - dateSortValue(b.plannedLaunchDate);
  if (launchOrder !== 0) return launchOrder;

  return a.projectName.localeCompare(b.projectName, "zh-CN");
}

function riskSortValue(value: ProductGuideRiskLevel) {
  return value === "delay" ? 4 : value === "risk" ? 3 : value === "watch" ? 2 : 1;
}

function dueBucketSortValue(value: ProductGuideItem["dueBucket"]) {
  if (value === "today") return 0;
  if (value === "this-week") return 1;
  if (value === "later") return 2;
  return 3;
}

function dateSortValue(value?: string) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const time = new Date(`${value}T12:00:00Z`).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function canShowStyleListAction(item: ProductGuideItem) {
  return Boolean(item.projectId);
}

function defaultTaskActionForm(item?: ProductGuideItem): TaskActionForm {
  return {
    taskStatus: normalizeTaskStatus(item?.statusLabel),
    actualFinishDate: todayString(),
    expectedFinishDate: item?.forecastFinishDate ?? item?.plannedFinishDate ?? todayString(),
    submittedAt: todayString(),
    reviewTarget: item?.waitingLicensor ? "版权方" : "版权方 / 审核方",
    blockReason: "",
    note: "",
  };
}

function defaultStyleListForm(): StyleListForm {
  return {
    styleNames: "",
    styleCount: "",
    difficulty: "常规款",
    estimatedWorkdays: "7",
    originalArtStatus: "未过审",
    originalArtApprovedDate: "",
    note: "",
  };
}

function normalizeTaskStatus(value?: string) {
  const text = value ?? "";

  if (text.includes("送审")) return "送审中";
  if (text.includes("阻塞")) return "阻塞";
  if (text.includes("暂停")) return "暂停";
  if (text.includes("取消")) return "取消";
  if (text.includes("进行")) return "进行中";
  if (text.includes("未开始")) return "未开始";

  return "进行中";
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function normalizeTeamKey(teamKey: string, teams: ProductGuideData["filters"]["teams"]) {
  if (teams.some((team) => team.value === teamKey)) {
    return teamKey;
  }

  return teams[0]?.value ?? "all";
}

function readTeamPreference() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(teamStorageKey) ?? "";
}

function subscribeTeamPreference(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const listener = () => onStoreChange();
  window.addEventListener("storage", listener);
  window.addEventListener("product-guide-team-change", listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("product-guide-team-change", listener);
  };
}

function saveTeamPreference(teamKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(teamStorageKey, teamKey);
  window.dispatchEvent(new Event("product-guide-team-change"));
}

function buildProductStartCycleOptions(projects: ProductGuideUnassignedProject[]): ProductStartCycleOption[] {
  const starts = new Map<string, ProductStartMonthPoint>();
  const currentStart = productStartPlanningCycleStart(new Date());
  starts.set(formatProductStartMonthLabel(currentStart), currentStart);

  for (const project of projects) {
    const month = productStartMonthLabel(project);
    const parsedMonth = parseProductStartMonthLabel(month);

    if (parsedMonth) {
      const start = productStartPlanningCycleStartForMonth(parsedMonth);
      starts.set(formatProductStartMonthLabel(start), start);
    }
  }

  return Array.from(starts.values())
    .sort((a, b) => productStartMonthIndex(a) - productStartMonthIndex(b))
    .map((start) => {
      const months = productStartMonthsFrom(start, 12).map(formatProductStartMonthLabel);

      return {
        startMonth: formatProductStartMonthLabel(start),
        label: `${String(start.year).slice(-2)}年度`,
        rangeLabel: `${months[0]} - ${months[months.length - 1]}`,
        months,
      };
    });
}

function productStartMonthLabel(project: ProductGuideUnassignedProject) {
  return project.shouldStartDate ? productStartMonthLabelFromDate(project.shouldStartDate) : null;
}

function productStartMonthLabelFromDate(value: string) {
  const date = parseProductStartDate(value);
  return date ? formatProductStartMonthLabel(date) : null;
}

function parseProductStartDate(value: string) {
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

  if (month < 1 || month > 12 || day < 1 || day > productStartDaysInMonth({ year, month })) {
    return null;
  }

  return { year, month, day };
}

function parseProductStartMonthLabel(label: string | null | undefined): ProductStartMonthPoint | null {
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

function productStartPlanningCycleStart(today: Date): ProductStartMonthPoint {
  return productStartPlanningCycleStartForMonth({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });
}

function productStartPlanningCycleStartForMonth(month: ProductStartMonthPoint): ProductStartMonthPoint {
  const thisYearStart = productStartMonthAfterChineseNewYear(month.year);

  if (productStartMonthIndex(month) >= productStartMonthIndex(thisYearStart)) {
    return thisYearStart;
  }

  return productStartMonthAfterChineseNewYear(month.year - 1);
}

function productStartMonthAfterChineseNewYear(year: number): ProductStartMonthPoint {
  const springFestival = productStartChineseNewYearByYear[year] ?? { year, month: 2, day: 1 };
  const nextMonth = springFestival.month + 1;

  if (nextMonth > 12) {
    return { year: springFestival.year + 1, month: 1 };
  }

  return { year: springFestival.year, month: nextMonth };
}

const productStartChineseNewYearByYear: Record<number, { year: number; month: number; day: number }> = {
  2025: { year: 2025, month: 1, day: 29 },
  2026: { year: 2026, month: 2, day: 17 },
  2027: { year: 2027, month: 2, day: 6 },
  2028: { year: 2028, month: 1, day: 26 },
  2029: { year: 2029, month: 2, day: 13 },
  2030: { year: 2030, month: 2, day: 3 },
  2031: { year: 2031, month: 1, day: 23 },
};

function productStartMonthsFrom(start: ProductStartMonthPoint, count: number) {
  return Array.from({ length: count }, (_, index) => productStartAddMonths(start, index));
}

function productStartAddMonths(month: ProductStartMonthPoint, offset: number): ProductStartMonthPoint {
  const zeroBasedMonthIndex = month.year * 12 + (month.month - 1) + offset;

  return {
    year: Math.floor(zeroBasedMonthIndex / 12),
    month: (zeroBasedMonthIndex % 12) + 1,
  };
}

function productStartDaysInMonth(month: ProductStartMonthPoint) {
  return new Date(Date.UTC(month.year, month.month, 0, 12)).getUTCDate();
}

function formatProductStartMonthLabel(month: ProductStartMonthPoint) {
  return `${String(month.year).slice(-2)}年${month.month}月`;
}

function productStartMonthIndex(month: ProductStartMonthPoint) {
  return month.year * 12 + month.month;
}
