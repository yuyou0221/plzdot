"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Gauge,
  PackageCheck,
  Plus,
  Save,
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
  UserDataPerson,
  UserDataTeam,
  UserDataVendor,
  UserDataWorkbenchData,
} from "@/lib/user-data-types";

type TabKey = "people" | "teams" | "modeling" | "availability" | "vendors";

type PersonDraft = {
  id?: string;
  name: string;
  departmentTeamId: string;
  projectGroupTeamId: string;
  businessRolesInput: string;
  userType: string;
  loginName: string;
  authRole: string;
  permissionLevel: string;
  password: string;
  isModeler: boolean;
  weeklyAvailableWorkdays: string;
  isSchedulable: boolean;
  status: string;
  notes: string;
};

type TeamDraft = {
  id?: string;
  name: string;
  teamType: string;
  parentTeamId: string;
  leaderUserId: string;
  status: string;
  notes: string;
};

type CapabilityDraft = {
  userId: string;
  weeklyAvailableWorkdays: string;
  isSchedulable: boolean;
};

type VendorDraft = {
  id?: string;
  name: string;
  vendorType: string;
  contactName: string;
  contactInfo: string;
  specialtyTagsInput: string;
  stableCapacity: boolean;
  status: string;
  notes: string;
};

type AvailabilityDraft = {
  id?: string;
  userId: string;
  blockType: string;
  startDate: string;
  endDate: string;
  workdayCount: string;
  status: string;
  notes: string;
};

type MutationResponse = {
  ok?: boolean;
  id?: string;
  message?: string;
};

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

type ImportPreviewResponse = MutationResponse & {
  preview?: ImportPreview;
};

const tabLabels: Record<TabKey, string> = {
  people: "人员名单",
  teams: "团队结构",
  modeling: "建模排期参数",
  availability: "不可排期记录",
  vendors: "外包供应商",
};

const metricToneClass: Record<UserDataMetric["tone"], string> = {
  neutral: "border-slate-200 bg-white",
  info: "border-sky-200 bg-sky-50/75",
  warning: "border-amber-200 bg-amber-50/80",
  success: "border-emerald-200 bg-emerald-50/80",
};

export function UserDataWorkbench({ data, currentUser }: { data: UserDataWorkbenchData; currentUser: AuthUser }) {
  const router = useRouter();
  const canManage = false;
  const canImport = data.viewer.canImportExcel;
  const canExportPasswords = data.viewer.canExportPasswords;
  const canDeleteDisabledUsers = data.viewer.canDeleteDisabledUsers;
  const canSeeSensitiveUserFields = data.viewer.canSeeSensitiveUserFields;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("people");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("全部团队");
  const [modelerFilter, setModelerFilter] = useState("全部");
  const [missingCapacityOnly, setMissingCapacityOnly] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState(data.people[0]?.id ?? "");
  const [personDraft, setPersonDraft] = useState<PersonDraft | null>(null);
  const [teamDraft, setTeamDraft] = useState<TeamDraft | null>(null);
  const [capabilityDraft, setCapabilityDraft] = useState<CapabilityDraft | null>(null);
  const [vendorDraft, setVendorDraft] = useState<VendorDraft | null>(null);
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityDraft | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "warning">("info");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null);
  const [fieldPolicyOpen, setFieldPolicyOpen] = useState(false);
  const [activeSnapshotModule, setActiveSnapshotModule] = useState(data.moduleReadSnapshots[0]?.moduleName ?? "");

  const visibleSearch = search.trim();
  const filteredPeople = useMemo(() => {
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
  }, [data.people, modelerFilter, missingCapacityOnly, teamFilter, visibleSearch]);

  const modelers = useMemo(() => data.people.filter((person) => person.isModeler), [data.people]);
  const availabilityByUserId = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const block of data.availabilityBlocks) {
      grouped.set(block.userId, (grouped.get(block.userId) ?? 0) + 1);
    }
    return grouped;
  }, [data.availabilityBlocks]);
  const selectedPerson =
    data.people.find((person) => person.id === selectedPersonId) ?? filteredPeople[0] ?? data.people[0];

  function openTab(tab: TabKey) {
    setActiveTab(tab);
    setMessage(null);
  }

  function notify(nextMessage: string, tone: "info" | "warning" = "info") {
    setMessageTone(tone);
    setMessage(nextMessage);
  }

  async function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!personDraft) return;
    if (!canManage) {
      notify("当前账号没有权限保存人员。", "warning");
      return;
    }

    const payload = {
      name: personDraft.name,
      teamId: personDraft.departmentTeamId,
      departmentTeamId: personDraft.departmentTeamId,
      projectGroupTeamId: personDraft.projectGroupTeamId,
      businessRoles: splitTags(personDraft.businessRolesInput),
      roleTitle: personDraft.businessRolesInput,
      userType: personDraft.userType,
      loginName: personDraft.loginName,
      authRole: personDraft.authRole,
      permissionLevel: nullableNumber(personDraft.permissionLevel),
      password: personDraft.password,
      isModeler: personDraft.isModeler,
      weeklyAvailableWorkdays: nullableNumber(personDraft.weeklyAvailableWorkdays),
      isSchedulable: personDraft.isSchedulable,
      status: personDraft.status,
      notes: personDraft.notes,
    };

    await saveMutation({
      path: personDraft.id ? `/api/users/people/${personDraft.id}` : "/api/users/people",
      method: personDraft.id ? "PATCH" : "POST",
      payload,
      onSuccess: (result) => {
        if (result.id) {
          setSelectedPersonId(result.id);
        }
        setPersonDraft(null);
      },
    });
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamDraft) return;
    if (!canManage) {
      notify("当前账号没有权限保存团队。", "warning");
      return;
    }

    await saveMutation({
      path: teamDraft.id ? `/api/users/teams/${teamDraft.id}` : "/api/users/teams",
      method: teamDraft.id ? "PATCH" : "POST",
      payload: teamDraft,
      onSuccess: () => setTeamDraft(null),
    });
  }

  async function saveCapabilities(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      notify("当前账号没有权限保存建模排期参数。", "warning");
      return;
    }
    if (!capabilityDraft?.userId) {
      notify("请先选择人员。", "warning");
      return;
    }

    await saveMutation({
      path: `/api/users/modeler-capabilities/${capabilityDraft.userId}`,
      method: "PATCH",
      payload: {
        weeklyAvailableWorkdays: nullableNumber(capabilityDraft.weeklyAvailableWorkdays),
        weeklyCapacityStyles: nullableNumber(capabilityDraft.weeklyAvailableWorkdays),
        isSchedulable: capabilityDraft.isSchedulable,
        specialtyTags: [],
        weaknessTags: [],
      },
      onSuccess: () => setCapabilityDraft(null),
    });
  }

  async function saveVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vendorDraft) return;
    if (!canManage) {
      notify("当前账号没有权限保存外包供应商。", "warning");
      return;
    }

    await saveMutation({
      path: vendorDraft.id ? `/api/users/vendors/${vendorDraft.id}` : "/api/users/vendors",
      method: vendorDraft.id ? "PATCH" : "POST",
      payload: {
        ...vendorDraft,
        specialtyTags: splitTags(vendorDraft.specialtyTagsInput),
      },
      onSuccess: () => setVendorDraft(null),
    });
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!availabilityDraft) return;
    if (!canImport) {
      notify("当前账号没有权限保存不可排期记录。", "warning");
      return;
    }

    await saveMutation({
      path: availabilityDraft.id ? `/api/users/availability/${availabilityDraft.id}` : "/api/users/availability",
      method: availabilityDraft.id ? "PATCH" : "POST",
      payload: {
        userId: availabilityDraft.userId,
        blockType: availabilityDraft.blockType,
        startDate: availabilityDraft.startDate,
        endDate: availabilityDraft.endDate,
        workdayCount: nullableNumber(availabilityDraft.workdayCount),
        status: availabilityDraft.status,
        notes: availabilityDraft.notes,
      },
      onSuccess: () => setAvailabilityDraft(null),
    });
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

      setSelectedPersonId(data.people.find((item) => item.id !== person.id)?.id ?? "");
      notify(result.message ?? "已删除停用账号。");
      router.refresh();
    } catch {
      notify("删除接口暂时不可用。", "warning");
    } finally {
      setDeletingPersonId(null);
    }
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
      const result = await readMutationResponse(response);

      if (!response.ok || !result.ok) {
        notify(result.message ?? "保存失败。", "warning");
        return;
      }

      onSuccess(result);
      notify(result.message ?? "已保存。");
      router.refresh();
    } catch {
      notify("保存接口暂时不可用。", "warning");
    } finally {
      setSaving(false);
    }
  }

  function openNewPerson() {
    setActiveTab("people");
    setPersonDraft({
      name: "",
      departmentTeamId: data.teams.find((team) => team.name === "产品团队")?.id ?? "",
      projectGroupTeamId: "",
      businessRolesInput: "",
      userType: "内部",
      loginName: "",
      authRole: "viewer",
      permissionLevel: "9",
      password: "",
      isModeler: false,
      weeklyAvailableWorkdays: "",
      isSchedulable: true,
      status: "启用",
      notes: "",
    });
  }

  function openCapabilityEditor(person?: UserDataPerson) {
    const target = person ?? selectedPerson ?? modelers[0] ?? data.people[0];

    setActiveTab("modeling");
    setCapabilityDraft({
      userId: target?.id ?? "",
      weeklyAvailableWorkdays: target?.weeklyAvailableWorkdays ? String(target.weeklyAvailableWorkdays) : "",
      isSchedulable: target?.isSchedulable ?? true,
    });
  }

  function changeCapabilityUser(userId: string) {
    const person = data.people.find((item) => item.id === userId);

    setCapabilityDraft({
      userId,
      weeklyAvailableWorkdays: person?.weeklyAvailableWorkdays ? String(person.weeklyAvailableWorkdays) : "",
      isSchedulable: person?.isSchedulable ?? true,
    });
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
            <SideNavButton label="产品组工作指引" badge="P0" onClick={() => router.push("/product-guide")} />
            <SideNavButton label="建模排期" badge="P0" onClick={() => router.push("/modeling")} />
            <SideNavButton label="用户数据" badge="基础" active />
          </nav>
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="min-w-0 px-6 py-5 max-md:px-4">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
                <Pill icon={<Database size={14} />} label={data.sourceLabel} />
                <Pill icon={<Clock3 size={14} />} label={`刷新：${formatDateTime(data.generatedAt)}`} />
              </div>
              <h1 className="mt-3 text-2xl font-semibold">用户数据</h1>
              <div className="mt-2 text-sm text-slate-500">
                人员、团队、建模能力与外包供应商
              </div>
              <div className="mt-1 text-xs font-medium text-slate-400">
                当前账号：{currentUser.name} · {authRoleOptions.find((role) => role.value === currentUser.authRole)?.label ?? currentUser.authRole} · {data.viewer.permissionLevelLabel}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                icon={fieldPolicyOpen ? <Eye size={16} /> : <ShieldCheck size={16} />}
                label={fieldPolicyOpen ? "收起字段权限" : "字段权限 / 模块读取"}
                onClick={() => setFieldPolicyOpen((value) => !value)}
              />
              {canManage ? (
                <>
                <ActionButton icon={<Plus size={16} />} label="新增人员" onClick={openNewPerson} />
                <ActionButton
                  icon={<Building2 size={16} />}
                  label="新增团队"
                  onClick={() => {
                    setActiveTab("teams");
                    setTeamDraft({
                      name: "",
                      teamType: "产品",
                      parentTeamId: "",
                      leaderUserId: "",
                      status: "启用",
                      notes: "",
                    });
                  }}
                />
                <ActionButton icon={<PackageCheck size={16} />} label="新增外包" onClick={openNewVendor} />
                </>
              ) : null}
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

          {fieldPolicyOpen ? renderFieldPolicyPanel() : null}

          <section className="mt-5 grid grid-cols-5 gap-3 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {data.metrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                  <FileSpreadsheet size={16} />
                  用户数据 Excel 导入
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                  <button
                    type="button"
                    disabled={previewing || importing || !canImport}
                    onClick={openImportFilePicker}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileSpreadsheet size={16} />
                    {previewing ? "安全测试中" : "导入 Excel"}
                  </button>
                  <button
                    type="button"
                    disabled={importing || previewing || !importPreview?.canApply}
                    onClick={importUserDataExcel}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    {importing ? "更新中" : "覆盖更新"}
                  </button>
                  <button
                    type="button"
                    disabled={exporting || !canExportPasswords}
                    onClick={exportUserDataExcel}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={16} />
                    {exporting ? "导出中" : "导出 Excel"}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {canImport
                  ? "点击导入 Excel 选择文件后会先跑安全测试预览；预览通过后，点击覆盖更新才会写入数据库。"
                  : "当前账号没有导入权限。导入、覆盖更新和密码导出仅权限等级 0 可用。"}
              </div>
              {importFile || importPreview || previewing ? (
                <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                  {importFile ? (
                    <div className="flex flex-wrap items-center gap-2 text-slate-600">
                      <span className="font-medium text-slate-800">已选择：</span>
                      <span>{importFile.name}</span>
                    </div>
                  ) : null}
                  {previewing ? (
                    <div className="mt-2 text-slate-500">正在进行安全测试预览...</div>
                  ) : null}
                  {importPreview ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          value={importPreview.canApply ? "安全测试预览通过" : "安全测试预览未通过"}
                          tone={importPreview.canApply ? "success" : "warning"}
                        />
                        <span className="text-xs text-slate-500">
                          人员 {importPreview.counts.people} · 权限 {importPreview.counts.permissionRoles} · 团队 {importPreview.counts.teams} · 外包 {importPreview.counts.vendors}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs text-slate-600 max-lg:grid-cols-2 max-sm:grid-cols-1">
                        <PreviewMetric label="登录账号" value={importPreview.checks.loginUsers} />
                        <PreviewMetric label="有密码行" value={importPreview.checks.passwordRows} />
                        <PreviewMetric label="短密码行" value={importPreview.checks.shortPasswordRows} />
                        <PreviewMetric label="等级 0 可登录" value={importPreview.checks.activeLevelZeroAfterImport ? 1 : 0} />
                        <PreviewMetric label="缺密码账号" value={importPreview.checks.activeLoginUsersMissingPassword} />
                      </div>
                      {importPreview.errors.length > 0 ? (
                        <PreviewList title="必须处理" tone="warning" items={importPreview.errors} />
                      ) : null}
                      {importPreview.warnings.length > 0 ? (
                        <PreviewList title="预览提示" tone="info" items={importPreview.warnings.slice(0, 8)} />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex h-9 rounded-lg bg-slate-100 p-1">
                <TabButton active={activeTab === "people"} icon={<UsersRound size={15} />} label="人员名单" onClick={() => openTab("people")} />
                <TabButton active={activeTab === "teams"} icon={<Building2 size={15} />} label="团队结构" onClick={() => openTab("teams")} />
                <TabButton active={activeTab === "modeling"} icon={<Gauge size={15} />} label="建模排期" onClick={() => openTab("modeling")} />
                <TabButton active={activeTab === "availability"} icon={<CalendarDays size={15} />} label="不可排期" onClick={() => openTab("availability")} />
                <TabButton active={activeTab === "vendors"} icon={<PackageCheck size={15} />} label="外包供应商" onClick={() => openTab("vendors")} />
              </div>
              <div className="text-sm font-medium text-slate-500">
                {tabLabels[activeTab]}
              </div>
            </div>
          </section>

          <div className="mt-4">
            {activeTab === "people" ? renderPeopleTab() : null}
            {activeTab === "teams" ? renderTeamsTab() : null}
            {activeTab === "modeling" ? renderModelingTab() : null}
            {activeTab === "availability" ? renderAvailabilityTab() : null}
            {activeTab === "vendors" ? renderVendorsTab() : null}
          </div>
        </main>
      </div>
    </div>
  );

  function renderFieldPolicyPanel() {
    const activeSnapshot =
      data.moduleReadSnapshots.find((snapshot) => snapshot.moduleName === activeSnapshotModule) ??
      data.moduleReadSnapshots[0];

    return (
      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ShieldCheck size={16} />
              字段权限与模块读取视图
            </div>
            <p className="mt-1 text-sm text-slate-500">
              等级 0 可见全部字段；非等级 0 仅人力资源账号可进入本页，并隐藏账号权限类字段。
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

        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">模块读取实际数据</div>
              <div className="mt-1 text-xs text-slate-500">
                这里展示当前数据库按约定提供给各模块读取的实际行和字段。
              </div>
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

          {activeSnapshot ? (
            <div className="mt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {activeSnapshot.recordName} · 共 {activeSnapshot.totalRows} 条
                  {activeSnapshot.totalRows > activeSnapshot.rows.length ? `，当前显示前 ${activeSnapshot.rows.length} 条` : ""}
                </span>
                <span>{activeSnapshot.notes}</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 bg-white">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                    <tr>
                      {activeSnapshot.columns.map((column) => (
                        <th key={column} className="px-3 py-2">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeSnapshot.rows.map((row, rowIndex) => (
                      <tr key={`${activeSnapshot.moduleName}-${rowIndex}`}>
                        {row.map((value, columnIndex) => (
                          <td key={`${activeSnapshot.moduleName}-${rowIndex}-${columnIndex}`} className="px-3 py-3 text-slate-700">
                            {value || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {activeSnapshot.rows.length === 0 ? (
                      <tr>
                        <td colSpan={activeSnapshot.columns.length} className="px-3 py-8 text-center text-sm text-slate-400">
                          暂无可读取数据
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  function renderPeopleTab() {
    return (
      <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
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
            {canManage ? <ActionButton icon={<Plus size={16} />} label="新增人员" onClick={openNewPerson} /> : null}
          </div>

          <div className="overflow-x-auto">
            <table className={clsx("w-full text-left text-sm", canSeeSensitiveUserFields ? "min-w-[1380px]" : "min-w-[1120px]")}>
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
                  <th className="px-3 py-2">建模师</th>
                  <th className="px-3 py-2">每周可用工作日</th>
                  <th className="px-3 py-2">可排期</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">备注</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.map((person) => (
                  <tr
                    key={person.id}
                    onClick={() => setSelectedPersonId(person.id)}
                    className={clsx(
                      "cursor-pointer hover:bg-slate-50",
                      selectedPerson?.id === person.id ? "bg-rose-50/70" : "",
                    )}
                  >
                    <td className="px-3 py-3 font-semibold text-slate-900">{person.name}</td>
                    <td className="px-3 py-3 text-slate-600">{person.departmentTeamName}</td>
                    <td className="px-3 py-3 text-slate-600">{person.projectGroupTeamName}</td>
                    <td className="px-3 py-3 text-slate-600">{person.roleTitle}</td>
                    <td className="px-3 py-3">
                      <TypeBadge value={person.userType} />
                    </td>
                    {canSeeSensitiveUserFields ? <td className="px-3 py-3 text-slate-600">{person.loginName || "-"}</td> : null}
                    {canSeeSensitiveUserFields ? (
                      <td className="px-3 py-3">
                        <StatusBadge value={person.authRoleLabel} tone={person.authRole === "admin" ? "warning" : "neutral"} />
                      </td>
                    ) : null}
                    {canSeeSensitiveUserFields ? <td className="px-3 py-3 text-slate-600">{person.permissionLevelLabel}</td> : null}
                    <td className="px-3 py-3">
                      {person.isModeler ? <StatusBadge value="是" tone="success" /> : <StatusBadge value="否" tone="neutral" />}
                    </td>
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
                    <td className="px-3 py-3">
                      {person.isSchedulable ? <StatusBadge value="可排期" tone="success" /> : <StatusBadge value="不可排期" tone="warning" />}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge value={person.status} tone={person.status === "停用" ? "neutral" : "success"} />
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-slate-500">{person.notes || "-"}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {canManage ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPersonDraft(personDraftFromPerson(person));
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 size={14} />
                            编辑
                          </button>
                        ) : null}
                        {canDeleteDisabledUsers && person.status === "停用" ? (
                          <button
                            type="button"
                            disabled={deletingPersonId === person.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteDisabledPerson(person);
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-200 bg-white px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            {deletingPersonId === person.id ? "删除中" : "删除"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-12 text-center text-sm text-slate-400">
                      暂无人员数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="min-w-0">
          {personDraft ? renderPersonForm() : renderPersonDetail()}
        </aside>
      </section>
    );
  }

  function renderPersonDetail() {
    if (!selectedPerson) {
      return (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          暂无人员详情
        </section>
      );
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
        </div>
        {selectedPerson.missingCapacity ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            缺少每周可用工作日参数。
          </div>
        ) : null}

        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {selectedPerson.notes || "暂无备注"}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canManage ? (
            <>
              <ActionButton icon={<Edit3 size={16} />} label="编辑人员" onClick={() => setPersonDraft(personDraftFromPerson(selectedPerson))} />
              <ActionButton icon={<Gauge size={16} />} label="维护排期参数" onClick={() => openCapabilityEditor(selectedPerson)} />
            </>
          ) : null}
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

  function renderPersonForm() {
    if (!personDraft) return null;

    return (
      <form onSubmit={savePerson} className="rounded-lg border border-slate-200 bg-white p-4">
        <FormHeader title={personDraft.id ? "编辑人员" : "新增人员"} onCancel={() => setPersonDraft(null)} />
        <div className="mt-4 grid gap-3">
          <TextInput label="姓名" value={personDraft.name} onChange={(value) => setPersonDraft({ ...personDraft, name: value })} required />
          <SelectField label="公司部门" value={personDraft.departmentTeamId} onChange={(value) => setPersonDraft({ ...personDraft, departmentTeamId: value })}>
            <option value="">未分配</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="项目小组" value={personDraft.projectGroupTeamId} onChange={(value) => setPersonDraft({ ...personDraft, projectGroupTeamId: value })}>
            <option value="">未分配</option>
            {data.teams
              .filter((team) => team.teamType === "产品" || team.parentTeamId)
              .map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
          </SelectField>
          <TextInput label="岗位（多个用逗号分隔）" value={personDraft.businessRolesInput} onChange={(value) => setPersonDraft({ ...personDraft, businessRolesInput: value })} />
          <SelectField label="用户类型" value={personDraft.userType} onChange={(value) => setPersonDraft({ ...personDraft, userType: value })}>
            <option>内部</option>
            <option>外包</option>
          </SelectField>
          <TextInput label="登录名" value={personDraft.loginName} onChange={(value) => setPersonDraft({ ...personDraft, loginName: value })} />
          <SelectField label="权限角色" value={personDraft.authRole} onChange={(value) => setPersonDraft({ ...personDraft, authRole: value })}>
            {authRoleOptions.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </SelectField>
          <TextInput
            label="权限等级"
            type="number"
            min={0}
            value={personDraft.permissionLevel}
            onChange={(value) => setPersonDraft({ ...personDraft, permissionLevel: value })}
          />
          <TextInput
            label={personDraft.id ? "重置密码" : "初始密码"}
            type="password"
            value={personDraft.password}
            onChange={(value) => setPersonDraft({ ...personDraft, password: value })}
          />
          <ToggleField label="是否建模师" checked={personDraft.isModeler} onChange={(value) => setPersonDraft({ ...personDraft, isModeler: value })} />
          <TextInput
            label="每周可用工作日"
            type="number"
            min={0}
            value={personDraft.weeklyAvailableWorkdays}
            onChange={(value) => setPersonDraft({ ...personDraft, weeklyAvailableWorkdays: value })}
          />
          <ToggleField label="是否可排期" checked={personDraft.isSchedulable} onChange={(value) => setPersonDraft({ ...personDraft, isSchedulable: value })} />
          <SelectField label="状态" value={personDraft.status} onChange={(value) => setPersonDraft({ ...personDraft, status: value })}>
            <option>启用</option>
            <option>停用</option>
          </SelectField>
          <TextArea label="备注" value={personDraft.notes} onChange={(value) => setPersonDraft({ ...personDraft, notes: value })} />
        </div>
        <FormActions saving={saving} submitLabel="保存人员" />
      </form>
    );
  }

  function renderTeamsTab() {
    return (
      <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={16} />
              团队结构
            </div>
            {canManage ? (
              <ActionButton
                icon={<Plus size={16} />}
                label="新增团队"
                onClick={() =>
                  setTeamDraft({
                    name: "",
                    teamType: "产品",
                    parentTeamId: "",
                    leaderUserId: "",
                    status: "启用",
                    notes: "",
                  })
                }
              />
            ) : null}
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
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.teams.map((team) => (
                  <tr key={team.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-900">{team.name}</td>
                    <td className="px-3 py-3 text-slate-600">{team.teamType}</td>
                    <td className="px-3 py-3 text-slate-600">{team.parentTeamName}</td>
                    <td className="px-3 py-3 text-slate-600">{team.leaderName}</td>
                    <td className="px-3 py-3">
                      <StatusBadge value={team.status} tone={team.status === "停用" ? "neutral" : "success"} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setTeamDraft(teamDraftFromTeam(team))}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 size={14} />
                          编辑
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="min-w-0">
          {teamDraft ? renderTeamForm() : renderTeamSummary()}
        </aside>
      </section>
    );
  }

  function renderTeamSummary() {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Building2 size={16} />
          团队概览
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <DetailItem label="团队总数" value={data.teams.length} />
          <DetailItem label="启用团队" value={data.teams.filter((team) => team.status !== "停用").length} />
          <DetailItem label="已设负责人" value={data.teams.filter((team) => team.leaderUserId).length} />
          <DetailItem label="产品团队人数" value={data.metrics.find((metric) => metric.label === "产品组人数")?.value ?? 0} />
        </div>
      </section>
    );
  }

  function renderTeamForm() {
    if (!teamDraft) return null;

    return (
      <form onSubmit={saveTeam} className="rounded-lg border border-slate-200 bg-white p-4">
        <FormHeader title={teamDraft.id ? "编辑团队" : "新增团队"} onCancel={() => setTeamDraft(null)} />
        <div className="mt-4 grid gap-3">
          <TextInput label="团队名称" value={teamDraft.name} onChange={(value) => setTeamDraft({ ...teamDraft, name: value })} required />
          <SelectField label="团队类型" value={teamDraft.teamType} onChange={(value) => setTeamDraft({ ...teamDraft, teamType: value })}>
            {["产品", "制作", "设计", "打样", "运营", "商务", "供应链"].map((teamType) => (
              <option key={teamType} value={teamType}>
                {teamType}
              </option>
            ))}
          </SelectField>
          <SelectField label="上级团队" value={teamDraft.parentTeamId} onChange={(value) => setTeamDraft({ ...teamDraft, parentTeamId: value })}>
            <option value="">无</option>
            {data.teams
              .filter((team) => team.id !== teamDraft.id)
              .map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
          </SelectField>
          <SelectField label="负责人" value={teamDraft.leaderUserId} onChange={(value) => setTeamDraft({ ...teamDraft, leaderUserId: value })}>
            <option value="">未设置</option>
            {data.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="状态" value={teamDraft.status} onChange={(value) => setTeamDraft({ ...teamDraft, status: value })}>
            <option>启用</option>
            <option>停用</option>
          </SelectField>
          <TextArea label="备注" value={teamDraft.notes} onChange={(value) => setTeamDraft({ ...teamDraft, notes: value })} />
        </div>
        <FormActions saving={saving} submitLabel="保存团队" />
      </form>
    );
  }

  function renderModelingTab() {
    return (
      <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Gauge size={16} />
              建模排期参数
            </div>
            {canManage ? <ActionButton icon={<Gauge size={16} />} label="维护参数" onClick={() => openCapabilityEditor()} /> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">建模师</th>
                  <th className="px-3 py-2">公司部门</th>
                  <th className="px-3 py-2">项目小组</th>
                  <th className="px-3 py-2">每周可用工作日</th>
                  <th className="px-3 py-2">可排期</th>
                  <th className="px-3 py-2">不可排期记录</th>
                  <th className="px-3 py-2">配置状态</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelers.map((person) => (
                  <tr key={person.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{person.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{person.roleTitle}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{person.departmentTeamName}</td>
                    <td className="px-3 py-3 text-slate-600">{person.projectGroupTeamName}</td>
                    <td className="px-3 py-3">{person.weeklyAvailableWorkdays ?? "-"}</td>
                    <td className="px-3 py-3">
                      {person.isSchedulable ? <StatusBadge value="可排期" tone="success" /> : <StatusBadge value="不可排期" tone="warning" />}
                    </td>
                    <td className="px-3 py-3">{availabilityByUserId.get(person.id) ?? 0}</td>
                    <td className="px-3 py-3">
                      {capabilityStateBadge(person)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => openCapabilityEditor(person)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 size={14} />
                          编辑参数
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {modelers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-slate-400">
                      暂无建模师
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="min-w-0">
          {capabilityDraft ? renderCapabilityForm() : renderModelingSummary()}
        </aside>
      </section>
    );
  }

  function renderModelingSummary() {
    const missingCapacity = modelers.filter((person) => person.missingCapacity);
    const notSchedulable = modelers.filter((person) => !person.isSchedulable);

    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Gauge size={16} />
          建模排期参数
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <DetailItem label="建模师" value={modelers.length} />
          <DetailItem label="缺少工作日" value={missingCapacity.length} />
          <DetailItem label="不可排期" value={notSchedulable.length} />
          <DetailItem label="总周工作日" value={modelers.reduce((sum, person) => sum + (person.weeklyAvailableWorkdays ?? 0), 0)} />
        </div>
        {canManage && missingCapacity.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {missingCapacity.slice(0, 5).map((person) => (
              <button
                type="button"
                key={person.id}
                onClick={() => openCapabilityEditor(person)}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900"
              >
                <span>{person.name}</span>
                <AlertTriangle size={15} />
              </button>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  function renderCapabilityForm() {
    if (!capabilityDraft) return null;

    return (
      <form onSubmit={saveCapabilities} className="rounded-lg border border-slate-200 bg-white p-4">
        <FormHeader title="维护建模排期参数" onCancel={() => setCapabilityDraft(null)} />
        <div className="mt-4 grid gap-3">
          <SelectField label="人员" value={capabilityDraft.userId} onChange={changeCapabilityUser}>
            <option value="">未选择</option>
            {data.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </SelectField>
          <TextInput
            label="每周可用工作日"
            type="number"
            min={0}
            value={capabilityDraft.weeklyAvailableWorkdays}
            onChange={(value) => setCapabilityDraft({ ...capabilityDraft, weeklyAvailableWorkdays: value })}
          />
          <ToggleField label="是否可排期" checked={capabilityDraft.isSchedulable} onChange={(value) => setCapabilityDraft({ ...capabilityDraft, isSchedulable: value })} />
        </div>
        <FormActions saving={saving} submitLabel="保存排期参数" />
      </form>
    );
  }

  function renderAvailabilityTab() {
    return (
      <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays size={16} />
              请假 / 不可排期记录
            </div>
            {canManage ? <ActionButton icon={<Plus size={16} />} label="新增记录" onClick={openNewAvailability} /> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">人员</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">开始日期</th>
                  <th className="px-3 py-2">结束日期</th>
                  <th className="px-3 py-2">工作日</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">备注</th>
                  <th className="px-3 py-2 text-right">操作</th>
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
                    <td className="px-3 py-3">
                      <StatusBadge value={block.status} tone={block.status === "停用" ? "neutral" : "warning"} />
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-slate-500">{block.notes || "-"}</td>
                    <td className="px-3 py-3 text-right">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setAvailabilityDraft(availabilityDraftFromBlock(block))}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 size={14} />
                          编辑
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {data.availabilityBlocks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-slate-400">
                      暂无不可排期记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="min-w-0">
          {availabilityDraft ? renderAvailabilityForm() : renderAvailabilitySummary()}
        </aside>
      </section>
    );
  }

  function openNewAvailability() {
    setActiveTab("availability");
    setAvailabilityDraft({
      userId: selectedPerson?.id ?? data.people[0]?.id ?? "",
      blockType: "不可排期",
      startDate: "",
      endDate: "",
      workdayCount: "",
      status: "启用",
      notes: "",
    });
  }

  function renderAvailabilitySummary() {
    const activeBlocks = data.availabilityBlocks.filter((block) => block.status !== "停用");

    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <CalendarDays size={16} />
          不可排期概览
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <DetailItem label="记录数" value={data.availabilityBlocks.length} />
          <DetailItem label="启用记录" value={activeBlocks.length} />
          <DetailItem label="涉及人员" value={new Set(activeBlocks.map((block) => block.userId)).size} />
          <DetailItem label="工作日合计" value={activeBlocks.reduce((sum, block) => sum + (block.workdayCount ?? 0), 0)} />
        </div>
      </section>
    );
  }

  function renderAvailabilityForm() {
    if (!availabilityDraft) return null;

    return (
      <form onSubmit={saveAvailability} className="rounded-lg border border-slate-200 bg-white p-4">
        <FormHeader title={availabilityDraft.id ? "编辑不可排期记录" : "新增不可排期记录"} onCancel={() => setAvailabilityDraft(null)} />
        <div className="mt-4 grid gap-3">
          <SelectField label="人员" value={availabilityDraft.userId} onChange={(value) => setAvailabilityDraft({ ...availabilityDraft, userId: value })}>
            <option value="">未选择</option>
            {data.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="类型" value={availabilityDraft.blockType} onChange={(value) => setAvailabilityDraft({ ...availabilityDraft, blockType: value })}>
            <option>不可排期</option>
            <option>请假</option>
            <option>外出</option>
            <option>其他</option>
          </SelectField>
          <TextInput label="开始日期" type="date" value={availabilityDraft.startDate} onChange={(value) => setAvailabilityDraft({ ...availabilityDraft, startDate: value })} required />
          <TextInput label="结束日期" type="date" value={availabilityDraft.endDate} onChange={(value) => setAvailabilityDraft({ ...availabilityDraft, endDate: value })} required />
          <TextInput label="占用工作日" type="number" min={0} value={availabilityDraft.workdayCount} onChange={(value) => setAvailabilityDraft({ ...availabilityDraft, workdayCount: value })} />
          <SelectField label="状态" value={availabilityDraft.status} onChange={(value) => setAvailabilityDraft({ ...availabilityDraft, status: value })}>
            <option>启用</option>
            <option>停用</option>
          </SelectField>
          <TextArea label="备注" value={availabilityDraft.notes} onChange={(value) => setAvailabilityDraft({ ...availabilityDraft, notes: value })} />
        </div>
        <FormActions saving={saving} submitLabel="保存记录" />
      </form>
    );
  }

  function renderVendorsTab() {
    return (
      <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PackageCheck size={16} />
              外包供应商
            </div>
            {canManage ? <ActionButton icon={<Plus size={16} />} label="新增外包" onClick={openNewVendor} /> : null}
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
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.vendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-900">{vendor.name}</td>
                    <td className="px-3 py-3 text-slate-600">{vendor.vendorType}</td>
                    <td className="px-3 py-3 text-slate-600">{vendor.contactName || "-"}</td>
                    <td className="px-3 py-3 text-slate-600">{vendor.contactInfo || "-"}</td>
                    <td className="px-3 py-3">
                      {vendor.stableCapacity ? <StatusBadge value="稳定" tone="success" /> : <StatusBadge value="非稳定" tone="neutral" />}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge value={vendor.status} tone={vendor.status === "停用" ? "neutral" : "success"} />
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-slate-500">{vendor.notes || "-"}</td>
                    <td className="px-3 py-3 text-right">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setVendorDraft(vendorDraftFromVendor(vendor))}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 size={14} />
                          编辑
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {data.vendors.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-slate-400">
                      暂无外包供应商
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="min-w-0">
          {vendorDraft ? renderVendorForm() : renderVendorSummary()}
        </aside>
      </section>
    );
  }

  function openNewVendor() {
    setActiveTab("vendors");
    setVendorDraft({
      name: "",
      vendorType: "建模外包",
      contactName: "",
      contactInfo: "",
      specialtyTagsInput: "",
      stableCapacity: false,
      status: "启用",
      notes: "",
    });
  }

  function renderVendorSummary() {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <PackageCheck size={16} />
          外包概览
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <DetailItem label="供应商" value={data.vendors.length} />
          <DetailItem label="稳定外包" value={data.vendors.filter((vendor) => vendor.stableCapacity && vendor.status !== "停用").length} />
          <DetailItem label="启用供应商" value={data.vendors.filter((vendor) => vendor.status !== "停用").length} />
          <DetailItem label="停用供应商" value={data.vendors.filter((vendor) => vendor.status === "停用").length} />
        </div>
      </section>
    );
  }

  function renderVendorForm() {
    if (!vendorDraft) return null;

    return (
      <form onSubmit={saveVendor} className="rounded-lg border border-slate-200 bg-white p-4">
        <FormHeader title={vendorDraft.id ? "编辑外包供应商" : "新增外包供应商"} onCancel={() => setVendorDraft(null)} />
        <div className="mt-4 grid gap-3">
          <TextInput label="供应商名称" value={vendorDraft.name} onChange={(value) => setVendorDraft({ ...vendorDraft, name: value })} required />
          <TextInput label="供应商类型" value={vendorDraft.vendorType} onChange={(value) => setVendorDraft({ ...vendorDraft, vendorType: value })} />
          <TextInput label="联系人" value={vendorDraft.contactName} onChange={(value) => setVendorDraft({ ...vendorDraft, contactName: value })} />
          <TextInput label="联系方式" value={vendorDraft.contactInfo} onChange={(value) => setVendorDraft({ ...vendorDraft, contactInfo: value })} />
          <ToggleField label="稳定外包" checked={vendorDraft.stableCapacity} onChange={(value) => setVendorDraft({ ...vendorDraft, stableCapacity: value })} />
          <TextArea
            label="擅长类型"
            value={vendorDraft.specialtyTagsInput}
            onChange={(value) => setVendorDraft({ ...vendorDraft, specialtyTagsInput: value })}
            placeholder="Q版, 正比例, 复杂结构"
          />
          <SelectField label="状态" value={vendorDraft.status} onChange={(value) => setVendorDraft({ ...vendorDraft, status: value })}>
            <option>启用</option>
            <option>停用</option>
          </SelectField>
          <TextArea label="备注" value={vendorDraft.notes} onChange={(value) => setVendorDraft({ ...vendorDraft, notes: value })} />
        </div>
        <FormActions saving={saving} submitLabel="保存供应商" />
      </form>
    );
  }
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

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-semibold max-sm:px-2",
        active ? "bg-white text-rose-700 shadow-sm" : "text-slate-500",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex h-8 items-center justify-between border-b border-slate-100">
      <span>{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function PreviewList({ title, tone, items }: { title: string; tone: "info" | "warning"; items: string[] }) {
  return (
    <div className={clsx("text-xs leading-5", tone === "warning" ? "text-amber-800" : "text-slate-500")}>
      <div className="font-semibold">{title}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
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

function TextInput({
  label,
  value,
  onChange,
  required,
  type = "text",
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "number" | "password" | "date";
  min?: number;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        type={type}
        min={min}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-20 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none placeholder:text-slate-400 focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
      >
        {children}
      </select>
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-rose-600"
      />
    </label>
  );
}

function FormHeader({ title, onCancel }: { title: string; onCancel: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">
        取消
      </button>
    </div>
  );
}

function FormActions({ saving, submitLabel }: { saving: boolean; submitLabel: string }) {
  return (
    <div className="mt-4 flex justify-end">
      <button
        type="submit"
        disabled={saving}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save size={16} />
        {saving ? "保存中" : submitLabel}
      </button>
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

function personDraftFromPerson(person: UserDataPerson): PersonDraft {
  return {
    id: person.id,
    name: person.name,
    departmentTeamId: person.departmentTeamId ?? person.teamId ?? "",
    projectGroupTeamId: person.projectGroupTeamId ?? "",
    businessRolesInput: joinTags(person.businessRoles.length > 0 ? person.businessRoles : [person.roleTitle === "未填写" ? "" : person.roleTitle]),
    userType: person.userType,
    loginName: person.loginName,
    authRole: person.authRole,
    permissionLevel: typeof person.permissionLevel === "number" ? String(person.permissionLevel) : "9",
    password: "",
    isModeler: person.isModeler,
    weeklyAvailableWorkdays: person.weeklyAvailableWorkdays ? String(person.weeklyAvailableWorkdays) : "",
    isSchedulable: person.isSchedulable,
    status: person.status,
    notes: person.notes,
  };
}

function teamDraftFromTeam(team: UserDataTeam): TeamDraft {
  return {
    id: team.id,
    name: team.name,
    teamType: team.teamType,
    parentTeamId: team.parentTeamId ?? "",
    leaderUserId: team.leaderUserId ?? "",
    status: team.status,
    notes: team.notes,
  };
}

function vendorDraftFromVendor(vendor: UserDataVendor): VendorDraft {
  return {
    id: vendor.id,
    name: vendor.name,
    vendorType: vendor.vendorType,
    contactName: vendor.contactName,
    contactInfo: vendor.contactInfo,
    specialtyTagsInput: joinTags(vendor.specialtyTags),
    stableCapacity: vendor.stableCapacity,
    status: vendor.status,
    notes: vendor.notes,
  };
}

function availabilityDraftFromBlock(block: UserDataWorkbenchData["availabilityBlocks"][number]): AvailabilityDraft {
  return {
    id: block.id,
    userId: block.userId,
    blockType: block.blockType,
    startDate: block.startDate,
    endDate: block.endDate,
    workdayCount: block.workdayCount ? String(block.workdayCount) : "",
    status: block.status,
    notes: block.notes,
  };
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n，、;；]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function joinTags(tags: string[]) {
  return tags.join(", ");
}

function nullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
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
