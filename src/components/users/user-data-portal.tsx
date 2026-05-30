"use client";

import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  Gauge,
  GitBranch,
  PackageCheck,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import clsx from "clsx";
import { AccountPanel } from "@/components/auth/account-panel";
import { authRoleOptions, type AuthUser } from "@/lib/auth/permissions";
import type {
  UserDataMetric,
  UserDataModuleReadSnapshot,
  UserDataPerson,
  UserDataWorkbenchData,
} from "@/lib/user-data-types";

export type UserDataView =
  | "overview"
  | "import"
  | "people"
  | "teams"
  | "modeling"
  | "availability"
  | "vendors"
  | "moduleViews";

type ImportPreview = {
  fileName: string;
  counts: {
    people: number;
    permissionRoles: number;
    teams: number;
    vendors: number;
    total: number;
  };
  checks: {
    loginUsers: number;
    passwordRows: number;
    shortPasswordRows: number;
    activeAdminAfterImport: boolean;
    activeLevelZeroAfterImport: boolean;
    duplicateLoginNames: string[];
    loginConflicts: number;
    activeLoginUsersMissingPassword: number;
  };
  canApply: boolean;
  warnings: string[];
  errors: string[];
};

type MutationResponse = {
  ok?: boolean;
  id?: string;
  message?: string;
};

type ImportPreviewResponse = MutationResponse & {
  preview?: ImportPreview;
};

const viewMeta: Record<UserDataView, { title: string; subtitle: string; icon: ReactNode }> = {
  overview: {
    title: "用户数据",
    subtitle: "人和组织主数据的入口：看状态、找人员、更新 Excel、检查模块读取结果。",
    icon: <Database size={18} />,
  },
  import: {
    title: "Excel 更新",
    subtitle: "唯一数据输入入口。先安全预览，再确认覆盖数据库。",
    icon: <FileSpreadsheet size={18} />,
  },
  people: {
    title: "人员名单",
    subtitle: "查看人员、岗位、团队、账号状态、建模参数和停用账号。",
    icon: <UsersRound size={18} />,
  },
  teams: {
    title: "团队结构",
    subtitle: "查看公司部门、产品项目小组、上级团队、负责人和状态。",
    icon: <Building2 size={18} />,
  },
  modeling: {
    title: "建模排期参数",
    subtitle: "查看建模师、每周可用工作日、可排期状态和产能缺口。",
    icon: <Gauge size={18} />,
  },
  availability: {
    title: "不可排期记录",
    subtitle: "查看请假、外出和不可排期记录，作为建模排期的基础数据。",
    icon: <CalendarDays size={18} />,
  },
  vendors: {
    title: "外包供应商",
    subtitle: "查看供应商、联系人、稳定外包状态和启停状态。",
    icon: <PackageCheck size={18} />,
  },
  moduleViews: {
    title: "模块读取视图",
    subtitle: "查看其他模块可以读取哪些字段，以及它们实际看到的数据。",
    icon: <Eye size={18} />,
  },
};

const userDataNavItems: Array<{ view: UserDataView; href: string; label: string; icon: ReactNode }> = [
  { view: "overview", href: "/users", label: "总览", icon: <Database size={16} /> },
  { view: "import", href: "/users/import", label: "Excel 更新", icon: <FileSpreadsheet size={16} /> },
  { view: "people", href: "/users/people", label: "人员名单", icon: <UsersRound size={16} /> },
  { view: "teams", href: "/users/teams", label: "团队结构", icon: <Building2 size={16} /> },
  { view: "modeling", href: "/users/modeling", label: "建模参数", icon: <Gauge size={16} /> },
  { view: "availability", href: "/users/availability", label: "不可排期", icon: <CalendarDays size={16} /> },
  { view: "vendors", href: "/users/vendors", label: "外包供应商", icon: <PackageCheck size={16} /> },
  { view: "moduleViews", href: "/users/module-views", label: "模块读取", icon: <Eye size={16} /> },
];

const metricToneClass: Record<UserDataMetric["tone"], string> = {
  neutral: "border-slate-200 bg-white",
  info: "border-sky-200 bg-sky-50/75",
  warning: "border-amber-200 bg-amber-50/80",
  success: "border-emerald-200 bg-emerald-50/80",
};

export function UserDataPortal({
  data,
  currentUser,
  selectedPersonId,
  view,
}: {
  data: UserDataWorkbenchData;
  currentUser: AuthUser;
  selectedPersonId?: string;
  view: UserDataView;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("全部团队");
  const [modelerFilter, setModelerFilter] = useState("全部");
  const [missingCapacityOnly, setMissingCapacityOnly] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "warning">("info");
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null);
  const [activeSnapshotModule, setActiveSnapshotModule] = useState(data.moduleReadSnapshots[0]?.moduleName ?? "");

  const canImport = data.viewer.canImportExcel;
  const canExportPasswords = data.viewer.canExportPasswords;
  const canDeleteDisabledUsers = data.viewer.canDeleteDisabledUsers;
  const canSeeSensitiveUserFields = data.viewer.canSeeSensitiveUserFields;
  const modelers = useMemo(() => data.people.filter((person) => person.isModeler), [data.people]);
  const activePeople = useMemo(() => data.people.filter((person) => person.status !== "停用"), [data.people]);
  const availabilityByUserId = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const block of data.availabilityBlocks) {
      grouped.set(block.userId, (grouped.get(block.userId) ?? 0) + 1);
    }
    return grouped;
  }, [data.availabilityBlocks]);
  const filteredPeople = useMemo(() => {
    const visibleSearch = search.trim();

    return data.people.filter((person) => {
      const matchSearch =
        !visibleSearch ||
        [person.name, person.departmentTeamName, person.projectGroupTeamName, person.roleTitle, person.userType, person.notes]
          .filter(Boolean)
          .some((value) => value.includes(visibleSearch));
      const matchTeam = teamFilter === "全部团队" || person.departmentTeamId === teamFilter || person.projectGroupTeamId === teamFilter;
      const matchModeler =
        modelerFilter === "全部" ||
        (modelerFilter === "建模师" && person.isModeler) ||
        (modelerFilter === "非建模师" && !person.isModeler);
      const matchMissing = !missingCapacityOnly || person.missingCapacity;

      return matchSearch && matchTeam && matchModeler && matchMissing;
    });
  }, [data.people, modelerFilter, missingCapacityOnly, search, teamFilter]);
  const selectedPerson =
    data.people.find((person) => person.id === selectedPersonId) ?? filteredPeople[0] ?? data.people[0];
  const meta = viewMeta[view];

  function notify(nextMessage: string, tone: "info" | "warning" = "info") {
    setMessageTone(tone);
    setMessage(nextMessage);
  }

  function openImportFilePicker() {
    if (!canImport) {
      notify("当前账号没有权限导入用户数据。", "warning");
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleImportFileSelected(file: File | null) {
    setImportFile(file);
    setImportPreview(null);

    if (!file) {
      return;
    }

    if (!canImport) {
      notify("当前账号没有权限导入用户数据。", "warning");
      return;
    }

    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/users/import-excel/preview", {
        method: "POST",
        body: formData,
      });
      const result = (await readMutationResponse(response)) as ImportPreviewResponse;

      if (!response.ok || !result.ok || !result.preview) {
        notify(result.message ?? "安全测试预览失败。", "warning");
        return;
      }

      setImportPreview(result.preview);
      notify(result.message ?? "安全测试预览完成。", result.preview.canApply ? "info" : "warning");
    } catch {
      notify("安全测试预览接口暂时不可用。", "warning");
    } finally {
      setPreviewing(false);
    }
  }

  async function importUserDataExcel() {
    if (!importFile) {
      notify("请先点击导入 Excel 选择文件。", "warning");
      return;
    }
    if (!canImport) {
      notify("当前账号没有权限导入用户数据。", "warning");
      return;
    }
    if (!importPreview) {
      notify("请先完成安全测试预览。", "warning");
      return;
    }
    if (!importPreview.canApply) {
      notify("安全测试预览未通过，不能覆盖更新。", "warning");
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.set("file", importFile);
      formData.set("mode", "replace");
      const response = await fetch("/api/users/import-excel", {
        method: "POST",
        body: formData,
      });
      const result = await readMutationResponse(response);

      if (!response.ok || !result.ok) {
        notify(result.message ?? "用户数据导入失败。", "warning");
        return;
      }

      setImportFile(null);
      setImportPreview(null);
      notify(result.message ?? "用户数据导入完成。");
      router.refresh();
    } catch {
      notify("用户数据导入接口暂时不可用。", "warning");
    } finally {
      setImporting(false);
    }
  }

  async function exportUserDataExcel() {
    if (!canExportPasswords) {
      notify("当前账号没有权限导出密码。", "warning");
      return;
    }

    setExporting(true);
    try {
      const response = await fetch("/api/users/export-excel");

      if (!response.ok) {
        const result = await readMutationResponse(response);
        notify(result.message ?? "用户数据导出失败。", "warning");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `用户数据标准导出-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify("用户数据 Excel 已导出，包含可导出的明文密码。");
    } catch {
      notify("用户数据导出接口暂时不可用。", "warning");
    } finally {
      setExporting(false);
    }
  }

  async function deleteDisabledPerson(person: UserDataPerson) {
    if (!canDeleteDisabledUsers) {
      notify("当前账号没有权限删除停用账号。", "warning");
      return;
    }
    if (person.status !== "停用") {
      notify("只能删除停用状态的账号。", "warning");
      return;
    }
    if (!window.confirm(`确认删除停用账号「${person.name}」？删除后只能通过重新导入 Excel 恢复。`)) {
      return;
    }

    setDeletingPersonId(person.id);
    try {
      const response = await fetch(`/api/users/people/${person.id}`, { method: "DELETE" });
      const result = await readMutationResponse(response);

      if (!response.ok || !result.ok) {
        notify(result.message ?? "删除失败。", "warning");
        return;
      }

      notify(result.message ?? "已删除停用账号。");
      router.push("/users/people");
      router.refresh();
    } catch {
      notify("删除接口暂时不可用。", "warning");
    } finally {
      setDeletingPersonId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[250px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-4 py-5 max-xl:border-b max-xl:border-r-0">
          <div className="border-b border-slate-200 pb-5">
            <div className="text-lg font-semibold">项目经营管理中台</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">P0 工程版 · 当前数据源：{data.sourceLabel}</div>
          </div>

          <nav className="mt-5 grid gap-2">
            <SideNavLink href="/" label="项目排期" badge="P0" />
            <SideNavLink href="/product-guide" label="产品组工作指引" badge="P0" />
            <SideNavLink href="/modeling" label="建模排期" badge="P0" />
          </nav>

          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">用户数据</div>
            <nav className="mt-2 grid gap-1">
              {userDataNavItems.map((item) => (
                <UserDataNavLink key={item.view} href={item.href} active={isActiveUserDataPath(pathname, item.href)} icon={item.icon} label={item.label} />
              ))}
            </nav>
          </div>

          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="min-w-0 px-6 py-5 max-md:px-4">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
                <Pill icon={<Database size={14} />} label={data.sourceLabel} />
                <Pill icon={<Clock3 size={14} />} label={`刷新：${formatDateTime(data.generatedAt)}`} />
                <Pill icon={<ShieldCheck size={14} />} label={data.viewer.permissionLevelLabel} />
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold">
                {meta.icon}
                {meta.title}
              </h1>
              <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{meta.subtitle}</div>
              <div className="mt-1 text-xs font-medium text-slate-400">
                当前账号：{currentUser.name} · {authRoleOptions.find((role) => role.value === currentUser.authRole)?.label ?? currentUser.authRole}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TopLink href="/users/import" icon={<FileSpreadsheet size={16} />} label="Excel 更新" active={view === "import"} />
              <TopLink href="/users/module-views" icon={<Eye size={16} />} label="模块读取" active={view === "moduleViews"} />
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

          {view === "overview" ? renderOverview() : null}
          {view === "import" ? renderImportPage() : null}
          {view === "people" ? renderPeoplePage() : null}
          {view === "teams" ? renderTeamsPage() : null}
          {view === "modeling" ? renderModelingPage() : null}
          {view === "availability" ? renderAvailabilityPage() : null}
          {view === "vendors" ? renderVendorsPage() : null}
          {view === "moduleViews" ? renderModuleViewsPage() : null}
        </main>
      </div>
    </div>
  );

  function renderOverview() {
    const missingModelers = modelers.filter((person) => person.missingCapacity);
    const stableVendors = data.vendors.filter((vendor) => vendor.status !== "停用" && vendor.stableCapacity);
    const staleTeams = data.teams.filter((team) => team.status === "停用");

    return (
      <div className="mt-5 grid gap-5">
        <section className="grid grid-cols-5 gap-3 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {data.metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </section>

        <section className="grid gap-3 lg:grid-cols-4">
          <WorkflowCard
            href="/users/import"
            icon={<FileSpreadsheet size={18} />}
            title="更新数据"
            helper="从标准 Excel 安全预览后覆盖更新。"
            tone="danger"
          />
          <WorkflowCard
            href="/users/people"
            icon={<UsersRound size={18} />}
            title="查人员"
            helper="搜索人员，查看团队、岗位、账号和建模参数。"
          />
          <WorkflowCard
            href="/users/modeling"
            icon={<Gauge size={18} />}
            title="看建模产能"
            helper="集中查看每周可用工作日和缺少配置。"
          />
          <WorkflowCard
            href="/users/module-views"
            icon={<Eye size={18} />}
            title="查模块读取"
            helper="确认其他模块实际读到的数据。"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <GitBranch size={16} />
              使用路径
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <FlowStep index="1" title="看总览" helper="先确认人员、团队、建模和外包数据状态。" />
              <FlowStep index="2" title="按页查看" helper="人员、团队、建模、外包分别进入独立页面。" />
              <FlowStep index="3" title="Excel 更新" helper="需要改数据时只走标准 Excel 覆盖更新。" />
              <FlowStep index="4" title="模块读取" helper="上线前查看其他模块会读到的实际数据。" />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <AlertTriangle size={16} />
              当前提醒
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <NoticeRow label="缺少建模工作日" value={missingModelers.length} tone={missingModelers.length > 0 ? "warning" : "success"} />
              <NoticeRow label="稳定外包供应商" value={stableVendors.length} tone="info" />
              <NoticeRow label="停用团队" value={staleTeams.length} tone={staleTeams.length > 0 ? "warning" : "neutral"} />
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-3">
          <PreviewListPanel
            title="最近人员"
            href="/users/people"
            rows={activePeople.slice(0, 6).map((person) => ({
              label: person.name,
              value: `${person.departmentTeamName} · ${person.roleTitle}`,
              warning: person.missingCapacity,
            }))}
          />
          <PreviewListPanel
            title="建模师"
            href="/users/modeling"
            rows={modelers.slice(0, 6).map((person) => ({
              label: person.name,
              value: person.weeklyAvailableWorkdays ? `每周 ${person.weeklyAvailableWorkdays} 天` : "缺少每周可用工作日",
              warning: person.missingCapacity,
            }))}
          />
          <PreviewListPanel
            title="稳定外包"
            href="/users/vendors"
            rows={stableVendors.slice(0, 6).map((vendor) => ({
              label: vendor.name,
              value: vendor.vendorType || "供应商",
              warning: false,
            }))}
          />
        </section>
      </div>
    );
  }

  function renderImportPage() {
    return (
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileSpreadsheet size={16} />
                覆盖更新
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                点击导入 Excel 后选择文件，系统会先跑安全测试预览。预览通过后，才可以覆盖更新数据库。
              </p>
            </div>
            <StatusBadge value={canImport ? "等级 0 可操作" : "无导入权限"} tone={canImport ? "success" : "warning"} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            disabled={!canImport}
            onChange={(event) => {
              void handleImportFileSelected(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
            className="hidden"
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={previewing || importing || !canImport}
              onClick={openImportFilePicker}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet size={16} />
              {previewing ? "安全测试中" : "导入 Excel"}
            </button>
            <button
              type="button"
              disabled={importing || previewing || !importPreview?.canApply}
              onClick={importUserDataExcel}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={16} />
              {importing ? "更新中" : "覆盖更新"}
            </button>
            <button
              type="button"
              disabled={exporting || !canExportPasswords}
              onClick={exportUserDataExcel}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              {exporting ? "导出中" : "导出 Excel"}
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <ImportStep title="1. 选择标准 Excel" state={importFile ? importFile.name : "未选择"} active={Boolean(importFile)} />
            <ImportStep
              title="2. 安全测试预览"
              state={previewing ? "预览中" : importPreview ? (importPreview.canApply ? "通过" : "未通过") : "等待文件"}
              active={Boolean(importPreview)}
              warning={Boolean(importPreview && !importPreview.canApply)}
            />
            <ImportStep
              title="3. 覆盖更新"
              state={importPreview?.canApply ? "可执行" : "等待通过预览"}
              active={Boolean(importPreview?.canApply)}
            />
          </div>

          {previewing ? <div className="mt-5 text-sm text-slate-500">正在进行安全测试预览...</div> : null}
          {importPreview ? renderImportPreview(importPreview) : null}
        </section>

        <aside className="grid h-fit gap-4">
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} />
              覆盖更新注意
            </div>
            <p className="mt-2 leading-6">
              该入口会覆盖用户数据主表。服务器操作前建议先备份数据库，并确认 Excel 是最新标准格式。
            </p>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-700">当前数据</div>
            <div className="mt-3 grid gap-2 text-sm">
              <DetailLine label="人员" value={data.people.length} />
              <DetailLine label="团队" value={data.teams.length} />
              <DetailLine label="外包供应商" value={data.vendors.length} />
              <DetailLine label="不可排期记录" value={data.availabilityBlocks.length} />
            </div>
          </section>
        </aside>
      </div>
    );
  }

  function renderPeoplePage() {
    return (
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex flex-wrap gap-2">
              <label className="flex h-9 min-w-72 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 max-sm:min-w-full">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="搜索姓名、团队、职位"
                />
              </label>
              <FilterSelect value={teamFilter} onChange={setTeamFilter} label="团队">
                <option>全部团队</option>
                {data.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect value={modelerFilter} onChange={setModelerFilter} label="建模师">
                <option>全部</option>
                <option>建模师</option>
                <option>非建模师</option>
              </FilterSelect>
              <button
                type="button"
                onClick={() => setMissingCapacityOnly((value) => !value)}
                className={clsx(
                  "inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold",
                  missingCapacityOnly ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600",
                )}
              >
                <AlertTriangle size={15} />
                缺少产能
              </button>
            </div>
            <span className="text-sm font-medium text-slate-500">显示 {filteredPeople.length} / {data.people.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className={clsx("w-full text-left text-sm", canSeeSensitiveUserFields ? "min-w-[1280px]" : "min-w-[1040px]")}>
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">姓名</th>
                  <th className="px-3 py-2">公司部门</th>
                  <th className="px-3 py-2">项目小组</th>
                  <th className="px-3 py-2">岗位</th>
                  <th className="px-3 py-2">用户类型</th>
                  {canSeeSensitiveUserFields ? <th className="px-3 py-2">登录名</th> : null}
                  {canSeeSensitiveUserFields ? <th className="px-3 py-2">权限</th> : null}
                  {canSeeSensitiveUserFields ? <th className="px-3 py-2">权限等级</th> : null}
                  <th className="px-3 py-2">建模</th>
                  <th className="px-3 py-2">每周工作日</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.map((person) => (
                  <tr
                    key={person.id}
                    onClick={() => router.push(`/users/people/${person.id}`)}
                    className={clsx("cursor-pointer hover:bg-slate-50", selectedPerson?.id === person.id ? "bg-rose-50/70" : "")}
                  >
                    <td className="px-3 py-3 font-semibold text-slate-900">{person.name}</td>
                    <td className="px-3 py-3 text-slate-600">{person.departmentTeamName}</td>
                    <td className="px-3 py-3 text-slate-600">{person.projectGroupTeamName}</td>
                    <td className="px-3 py-3 text-slate-600">{person.roleTitle}</td>
                    <td className="px-3 py-3"><TypeBadge value={person.userType} /></td>
                    {canSeeSensitiveUserFields ? <td className="px-3 py-3 text-slate-600">{person.loginName || "-"}</td> : null}
                    {canSeeSensitiveUserFields ? (
                      <td className="px-3 py-3"><StatusBadge value={person.authRoleLabel} tone={person.authRole === "admin" ? "warning" : "neutral"} /></td>
                    ) : null}
                    {canSeeSensitiveUserFields ? <td className="px-3 py-3 text-slate-600">{person.permissionLevelLabel}</td> : null}
                    <td className="px-3 py-3">{person.isModeler ? <StatusBadge value="是" tone="success" /> : <StatusBadge value="否" tone="neutral" />}</td>
                    <td className="px-3 py-3">
                      {person.missingCapacity ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <AlertTriangle size={13} />
                          缺少
                        </span>
                      ) : (
                        <span className="text-slate-700">{person.weeklyAvailableWorkdays ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-3 py-3"><StatusBadge value={person.status} tone={person.status === "停用" ? "neutral" : "success"} /></td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/users/people/${person.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        查看
                        <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan={canSeeSensitiveUserFields ? 12 : 9} className="px-3 py-12 text-center text-sm text-slate-400">
                      暂无人员数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="min-w-0">{renderPersonDetail()}</aside>
      </div>
    );
  }

  function renderPersonDetail() {
    if (!selectedPerson) {
      return <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">暂无人员详情</section>;
    }

    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <UserRound size={16} />
              人员详情
            </div>
            <h2 className="mt-2 text-xl font-semibold">{selectedPerson.name}</h2>
            <div className="mt-1 text-sm text-slate-500">{selectedPerson.departmentTeamName} · {selectedPerson.roleTitle}</div>
          </div>
          <StatusBadge value={selectedPerson.status} tone={selectedPerson.status === "停用" ? "neutral" : "success"} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <DetailItem label="用户类型" value={selectedPerson.userType} />
          {canSeeSensitiveUserFields ? <DetailItem label="登录名" value={selectedPerson.loginName || "未开通"} /> : null}
          {canSeeSensitiveUserFields ? <DetailItem label="权限角色" value={selectedPerson.authRoleLabel} /> : null}
          {canSeeSensitiveUserFields ? <DetailItem label="权限等级" value={selectedPerson.permissionLevelLabel} /> : null}
          <DetailItem label="是否建模师" value={selectedPerson.isModeler ? "是" : "否"} />
          <DetailItem label="每周可用工作日" value={selectedPerson.weeklyAvailableWorkdays ?? "未填写"} />
          <DetailItem label="公司部门" value={selectedPerson.departmentTeamName} />
          <DetailItem label="项目小组" value={selectedPerson.projectGroupTeamName} />
          <DetailItem label="排期状态" value={selectedPerson.isSchedulable ? "可排期" : "不可排期"} />
          <DetailItem label="不可排期记录" value={availabilityByUserId.get(selectedPerson.id) ?? 0} />
        </div>

        {selectedPerson.missingCapacity ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            缺少每周可用工作日参数。
          </div>
        ) : null}

        <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
          {selectedPerson.notes || "暂无备注"}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/users/people/${selectedPerson.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            固定详情页
          </Link>
          {canDeleteDisabledUsers && selectedPerson.status === "停用" ? (
            <button
              type="button"
              disabled={deletingPersonId === selectedPerson.id}
              onClick={() => void deleteDisabledPerson(selectedPerson)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={16} />
              {deletingPersonId === selectedPerson.id ? "删除中" : "删除停用账号"}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  function renderTeamsPage() {
    const byType = groupCount(data.teams.map((team) => team.teamType));

    return (
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={16} />
              团队结构
            </div>
            <span className="text-sm text-slate-500">{data.teams.length} 个团队</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">团队名称</th>
                  <th className="px-3 py-2">团队类型</th>
                  <th className="px-3 py-2">上级团队</th>
                  <th className="px-3 py-2">负责人</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.teams.map((team) => (
                  <tr key={team.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-900">{team.name}</td>
                    <td className="px-3 py-3 text-slate-600">{team.teamType}</td>
                    <td className="px-3 py-3 text-slate-600">{team.parentTeamName}</td>
                    <td className="px-3 py-3 text-slate-600">{team.leaderName}</td>
                    <td className="px-3 py-3"><StatusBadge value={team.status} tone={team.status === "停用" ? "neutral" : "success"} /></td>
                    <td className="max-w-[240px] truncate px-3 py-3 text-slate-500">{team.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-700">团队概览</div>
          <div className="mt-4 grid gap-2 text-sm">
            <DetailLine label="团队总数" value={data.teams.length} />
            <DetailLine label="启用团队" value={data.teams.filter((team) => team.status !== "停用").length} />
            <DetailLine label="已设负责人" value={data.teams.filter((team) => team.leaderUserId).length} />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="text-xs font-semibold text-slate-500">按类型</div>
            <div className="mt-2 grid gap-2">
              {Array.from(byType.entries()).map(([teamType, count]) => (
                <DetailLine key={teamType} label={teamType} value={count} />
              ))}
            </div>
          </div>
        </aside>
      </div>
    );
  }

  function renderModelingPage() {
    const missingCapacity = modelers.filter((person) => person.missingCapacity);
    const notSchedulable = modelers.filter((person) => !person.isSchedulable);

    return (
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Gauge size={16} />
              建模师产能
            </div>
            <span className="text-sm text-slate-500">{modelers.length} 位建模师</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">建模师</th>
                  <th className="px-3 py-2">公司部门</th>
                  <th className="px-3 py-2">项目小组</th>
                  <th className="px-3 py-2">每周可用工作日</th>
                  <th className="px-3 py-2">可排期</th>
                  <th className="px-3 py-2">不可排期记录</th>
                  <th className="px-3 py-2">配置状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelers.map((person) => (
                  <tr key={person.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <Link href={`/users/people/${person.id}`} className="font-semibold text-slate-900 hover:text-rose-700">
                        {person.name}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">{person.roleTitle}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{person.departmentTeamName}</td>
                    <td className="px-3 py-3 text-slate-600">{person.projectGroupTeamName}</td>
                    <td className="px-3 py-3">{person.weeklyAvailableWorkdays ?? "-"}</td>
                    <td className="px-3 py-3">
                      {person.isSchedulable ? <StatusBadge value="可排期" tone="success" /> : <StatusBadge value="不可排期" tone="warning" />}
                    </td>
                    <td className="px-3 py-3">{availabilityByUserId.get(person.id) ?? 0}</td>
                    <td className="px-3 py-3">{capabilityStateBadge(person)}</td>
                  </tr>
                ))}
                {modelers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-sm text-slate-400">
                      暂无建模师
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="grid h-fit gap-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-700">建模参数概览</div>
            <div className="mt-4 grid gap-2 text-sm">
              <DetailLine label="建模师" value={modelers.length} />
              <DetailLine label="缺少工作日" value={missingCapacity.length} />
              <DetailLine label="不可排期" value={notSchedulable.length} />
              <DetailLine label="总周工作日" value={modelers.reduce((sum, person) => sum + (person.weeklyAvailableWorkdays ?? 0), 0)} />
            </div>
          </section>
          {missingCapacity.length > 0 ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle size={16} />
                缺少产能参数
              </div>
              <div className="mt-3 grid gap-2">
                {missingCapacity.slice(0, 8).map((person) => (
                  <Link key={person.id} href={`/users/people/${person.id}`} className="text-sm font-medium text-amber-900 hover:underline">
                    {person.name}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    );
  }

  function renderAvailabilityPage() {
    const activeBlocks = data.availabilityBlocks.filter((block) => block.status !== "停用");

    return (
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays size={16} />
              请假 / 不可排期记录
            </div>
            <span className="text-sm text-slate-500">{data.availabilityBlocks.length} 条记录</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">人员</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">开始日期</th>
                  <th className="px-3 py-2">结束日期</th>
                  <th className="px-3 py-2">工作日</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.availabilityBlocks.map((block) => (
                  <tr key={block.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-900">{block.userName}</td>
                    <td className="px-3 py-3 text-slate-600">{block.blockType}</td>
                    <td className="px-3 py-3 text-slate-600">{block.startDate}</td>
                    <td className="px-3 py-3 text-slate-600">{block.endDate}</td>
                    <td className="px-3 py-3 text-slate-600">{block.workdayCount ?? "-"}</td>
                    <td className="px-3 py-3"><StatusBadge value={block.status} tone={block.status === "停用" ? "neutral" : "warning"} /></td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-slate-500">{block.notes || "-"}</td>
                  </tr>
                ))}
                {data.availabilityBlocks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-sm text-slate-400">
                      暂无不可排期记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-700">记录概览</div>
          <div className="mt-4 grid gap-2 text-sm">
            <DetailLine label="记录数" value={data.availabilityBlocks.length} />
            <DetailLine label="启用记录" value={activeBlocks.length} />
            <DetailLine label="涉及人员" value={new Set(activeBlocks.map((block) => block.userId)).size} />
            <DetailLine label="工作日合计" value={activeBlocks.reduce((sum, block) => sum + (block.workdayCount ?? 0), 0)} />
          </div>
        </aside>
      </div>
    );
  }

  function renderVendorsPage() {
    const stableVendors = data.vendors.filter((vendor) => vendor.status !== "停用" && vendor.stableCapacity);

    return (
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PackageCheck size={16} />
              外包供应商
            </div>
            <span className="text-sm text-slate-500">{data.vendors.length} 家供应商</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">供应商名称</th>
                  <th className="px-3 py-2">供应商类型</th>
                  <th className="px-3 py-2">联系人</th>
                  <th className="px-3 py-2">联系方式</th>
                  <th className="px-3 py-2">稳定外包</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.vendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-900">{vendor.name}</td>
                    <td className="px-3 py-3 text-slate-600">{vendor.vendorType}</td>
                    <td className="px-3 py-3 text-slate-600">{vendor.contactName || "-"}</td>
                    <td className="px-3 py-3 text-slate-600">{vendor.contactInfo || "-"}</td>
                    <td className="px-3 py-3">{vendor.stableCapacity ? <StatusBadge value="稳定" tone="success" /> : <StatusBadge value="非稳定" tone="neutral" />}</td>
                    <td className="px-3 py-3"><StatusBadge value={vendor.status} tone={vendor.status === "停用" ? "neutral" : "success"} /></td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-slate-500">{vendor.notes || "-"}</td>
                  </tr>
                ))}
                {data.vendors.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-sm text-slate-400">
                      暂无外包供应商
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-700">外包概览</div>
          <div className="mt-4 grid gap-2 text-sm">
            <DetailLine label="供应商" value={data.vendors.length} />
            <DetailLine label="稳定外包" value={stableVendors.length} />
            <DetailLine label="启用供应商" value={data.vendors.filter((vendor) => vendor.status !== "停用").length} />
            <DetailLine label="停用供应商" value={data.vendors.filter((vendor) => vendor.status === "停用").length} />
          </div>
        </aside>
      </div>
    );
  }

  function renderModuleViewsPage() {
    const activeSnapshot =
      data.moduleReadSnapshots.find((snapshot) => snapshot.moduleName === activeSnapshotModule) ?? data.moduleReadSnapshots[0];

    return (
      <div className="mt-5 grid gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <ShieldCheck size={16} />
                字段权限
              </div>
              <p className="mt-1 text-sm text-slate-500">
                等级 0 可见全部字段；非等级 0 仅人力资源账号可进入用户数据页，并隐藏账号权限类字段。
              </p>
            </div>
            <StatusBadge
              value={data.viewer.canSeeSensitiveUserFields ? "当前可见全部字段" : "当前为受限视图"}
              tone={data.viewer.canSeeSensitiveUserFields ? "success" : "warning"}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">范围</th>
                  <th className="px-3 py-2">字段</th>
                  <th className="px-3 py-2">等级 0</th>
                  <th className="px-3 py-2">人力资源</th>
                  <th className="px-3 py-2">其他模块读取</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.fieldVisibility.map((row) => (
                  <tr key={`${row.scope}-${row.field}`}>
                    <td className="px-3 py-3 text-slate-500">{row.scope}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{row.field}</td>
                    <td className="px-3 py-3 text-slate-600">{row.levelZero}</td>
                    <td className="px-3 py-3 text-slate-600">{row.humanResources}</td>
                    <td className="px-3 py-3 text-slate-600">{row.moduleRead}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">模块读取约定</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">模块</th>
                  <th className="px-3 py-2">默认可读取</th>
                  <th className="px-3 py-2">默认不可读取</th>
                  <th className="px-3 py-2">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.moduleReadModels.map((row) => (
                  <tr key={row.moduleName}>
                    <td className="px-3 py-3 font-medium text-slate-900">{row.moduleName}</td>
                    <td className="px-3 py-3 text-slate-600">{row.readableFields}</td>
                    <td className="px-3 py-3 text-slate-600">{row.hiddenFields}</td>
                    <td className="px-3 py-3 text-slate-500">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">模块读取实际数据</div>
              <div className="mt-1 text-xs text-slate-500">展示当前数据库按约定提供给各模块读取的实际行和字段。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.moduleReadSnapshots.map((snapshot) => (
                <button
                  key={snapshot.moduleName}
                  type="button"
                  onClick={() => setActiveSnapshotModule(snapshot.moduleName)}
                  className={clsx(
                    "h-8 rounded-md px-3 text-xs font-semibold",
                    activeSnapshot?.moduleName === snapshot.moduleName
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
                  )}
                >
                  {snapshot.moduleName}
                </button>
              ))}
            </div>
          </div>

          {activeSnapshot ? <ModuleSnapshotTable snapshot={activeSnapshot} /> : null}
        </section>
      </div>
    );
  }

  function renderImportPreview(preview: ImportPreview) {
    return (
      <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={preview.canApply ? "安全测试预览通过" : "安全测试预览未通过"} tone={preview.canApply ? "success" : "warning"} />
          <span className="text-xs text-slate-500">
            人员 {preview.counts.people} · 权限 {preview.counts.permissionRoles} · 团队 {preview.counts.teams} · 外包 {preview.counts.vendors}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2 text-xs text-slate-600 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <PreviewMetric label="登录账号" value={preview.checks.loginUsers} />
          <PreviewMetric label="有密码行" value={preview.checks.passwordRows} />
          <PreviewMetric label="短密码行" value={preview.checks.shortPasswordRows} />
          <PreviewMetric label="等级 0 可登录" value={preview.checks.activeLevelZeroAfterImport ? 1 : 0} />
          <PreviewMetric label="缺密码账号" value={preview.checks.activeLoginUsersMissingPassword} />
        </div>
        {preview.errors.length > 0 ? <PreviewMessages title="必须处理" tone="warning" items={preview.errors} /> : null}
        {preview.warnings.length > 0 ? <PreviewMessages title="预览提示" tone="info" items={preview.warnings.slice(0, 10)} /> : null}
      </div>
    );
  }
}

function SideNavLink({ href, label, badge }: { href: string; label: string; badge: string }) {
  return (
    <Link href={href} className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50">
      {label}
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{badge}</span>
    </Link>
  );
}

function UserDataNavLink({ href, active, icon, label }: { href: string; active: boolean; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold",
        active ? "bg-rose-50 text-rose-700" : "text-slate-500 hover:bg-slate-50",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function TopLink({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold shadow-sm",
        active ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function MetricCard({ metric }: { metric: UserDataMetric }) {
  const Icon =
    metric.tone === "warning" ? AlertTriangle : metric.tone === "success" ? CheckCircle2 : metric.tone === "info" ? Gauge : UsersRound;

  return (
    <div className={clsx("rounded-lg border p-4", metricToneClass[metric.tone])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">{metric.value}</div>
          <div className="mt-1 text-sm font-medium text-slate-700">{metric.label}</div>
        </div>
        <span className="rounded-lg bg-white/80 p-2 text-slate-600 ring-1 ring-slate-200">
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-500">{metric.helper}</div>
    </div>
  );
}

function WorkflowCard({
  href,
  icon,
  title,
  helper,
  tone = "normal",
}: {
  href: string;
  icon: ReactNode;
  title: string;
  helper: string;
  tone?: "normal" | "danger";
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "group rounded-lg border bg-white p-4 shadow-sm hover:border-slate-300",
        tone === "danger" ? "border-rose-200" : "border-slate-200",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={clsx("rounded-lg p-2", tone === "danger" ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600")}>{icon}</span>
        <ArrowRight className="text-slate-300 group-hover:text-slate-500" size={16} />
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-500">{helper}</div>
    </Link>
  );
}

function FlowStep({ index, title, helper }: { index: string; title: string; helper: string }) {
  return (
    <div className="min-w-0 border-l-2 border-slate-200 pl-3">
      <div className="text-xs font-semibold text-slate-400">步骤 {index}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-500">{helper}</div>
    </div>
  );
}

function NoticeRow({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "info" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-slate-600">{label}</span>
      <StatusBadge value={String(value)} tone={tone === "info" ? "neutral" : tone} />
    </div>
  );
}

function PreviewListPanel({ title, href, rows }: { title: string; href: string; rows: Array<{ label: string; value: string; warning: boolean }> }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        <Link href={href} className="text-xs font-semibold text-rose-700 hover:underline">
          查看
        </Link>
      </div>
      <div className="mt-3 divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-900">{row.label}</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{row.value}</div>
            </div>
            {row.warning ? <AlertTriangle className="shrink-0 text-amber-600" size={15} /> : null}
          </div>
        ))}
        {rows.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">暂无数据</div> : null}
      </div>
    </section>
  );
}

function ImportStep({ title, state, active, warning }: { title: string; state: string; active: boolean; warning?: boolean }) {
  return (
    <div className={clsx("flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-sm", active ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white")}>
      <span className="font-semibold text-slate-800">{title}</span>
      <StatusBadge value={state} tone={warning ? "warning" : active ? "success" : "neutral"} />
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex h-9 items-center justify-between rounded-lg bg-slate-50 px-3">
      <span>{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function PreviewMessages({ title, tone, items }: { title: string; tone: "info" | "warning"; items: string[] }) {
  return (
    <div className={clsx("rounded-lg px-3 py-2 text-sm leading-6", tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600")}>
      <div className="font-semibold">{title}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ModuleSnapshotTable({ snapshot }: { snapshot: UserDataModuleReadSnapshot }) {
  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {snapshot.recordName} · 共 {snapshot.totalRows} 条
          {snapshot.totalRows > snapshot.rows.length ? `，当前显示前 ${snapshot.rows.length} 条` : ""}
        </span>
        <span>{snapshot.notes}</span>
      </div>
      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              {snapshot.columns.map((column) => (
                <th key={column} className="px-3 py-2">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {snapshot.rows.map((row, rowIndex) => (
              <tr key={`${snapshot.moduleName}-${rowIndex}`}>
                {row.map((value, columnIndex) => (
                  <td key={`${snapshot.moduleName}-${rowIndex}-${columnIndex}`} className="px-3 py-3 text-slate-700">
                    {value || "-"}
                  </td>
                ))}
              </tr>
            ))}
            {snapshot.rows.length === 0 ? (
              <tr>
                <td colSpan={snapshot.columns.length} className="px-3 py-8 text-center text-sm text-slate-400">
                  暂无可读取数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
      <span className="text-xs font-semibold">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-slate-900 outline-none">
        {children}
      </select>
    </label>
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

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-800">{value}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function TypeBadge({ value }: { value: string }) {
  return (
    <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", value === "外包" ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-700")}>
      {value}
    </span>
  );
}

function StatusBadge({ value, tone }: { value: string; tone: "success" | "neutral" | "warning" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        tone === "success"
          ? "bg-emerald-100 text-emerald-700"
          : tone === "warning"
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-600",
      )}
    >
      {value}
    </span>
  );
}

function capabilityStateBadge(person: UserDataPerson) {
  if (person.missingCapacity) {
    return <StatusBadge value="缺少工作日" tone="warning" />;
  }

  if (!person.isSchedulable) {
    return <StatusBadge value="不可排期" tone="warning" />;
  }

  return <StatusBadge value="可排期" tone="success" />;
}

function isActiveUserDataPath(pathname: string, href: string) {
  if (href === "/users") {
    return pathname === "/users";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupCount(values: string[]) {
  const grouped = new Map<string, number>();
  for (const value of values) {
    grouped.set(value, (grouped.get(value) ?? 0) + 1);
  }
  return grouped;
}

async function readMutationResponse(response: Response): Promise<MutationResponse> {
  try {
    return (await response.json()) as MutationResponse;
  } catch {
    return {};
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  const shanghaiFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(shanghaiFormatter.formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}
