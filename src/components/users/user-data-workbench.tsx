"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Edit3,
  Gauge,
  PackageCheck,
  Plus,
  Save,
  Search,
  Tags,
  UserRound,
  UsersRound,
} from "lucide-react";
import clsx from "clsx";
import { LogoutButton } from "@/components/auth/logout-button";
import { authRoleOptions, canManageUsers, type AuthUser } from "@/lib/auth/permissions";
import type {
  UserDataMetric,
  UserDataPerson,
  UserDataTeam,
  UserDataVendor,
  UserDataWorkbenchData,
} from "@/lib/user-data-types";

type TabKey = "people" | "teams" | "modeling" | "vendors";

type PersonDraft = {
  id?: string;
  name: string;
  teamId: string;
  roleTitle: string;
  userType: string;
  loginName: string;
  authRole: string;
  password: string;
  isModeler: boolean;
  weeklyCapacityStyles: string;
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
  weeklyCapacityStyles: string;
  specialtyTagsInput: string;
  weaknessTagsInput: string;
};

type VendorDraft = {
  id?: string;
  name: string;
  contactName: string;
  contactInfo: string;
  specialtyTagsInput: string;
  stableCapacity: boolean;
  status: string;
  notes: string;
};

type MutationResponse = {
  ok?: boolean;
  id?: string;
  message?: string;
};

const tabLabels: Record<TabKey, string> = {
  people: "人员名单",
  teams: "团队结构",
  modeling: "建模能力",
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
  const canManage = canManageUsers(currentUser);
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
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "warning">("info");
  const [saving, setSaving] = useState(false);

  const visibleSearch = search.trim();
  const filteredPeople = useMemo(() => {
    return data.people.filter((person) => {
      const matchSearch =
        !visibleSearch ||
        [person.name, person.teamName, person.roleTitle, person.userType, person.notes]
          .filter(Boolean)
          .some((value) => value.includes(visibleSearch));
      const matchTeam = teamFilter === "全部团队" || person.teamId === teamFilter;
      const matchModeler =
        modelerFilter === "全部" ||
        (modelerFilter === "建模师" && person.isModeler) ||
        (modelerFilter === "非建模师" && !person.isModeler);
      const matchMissing = !missingCapacityOnly || person.missingCapacity;

      return matchSearch && matchTeam && matchModeler && matchMissing;
    });
  }, [data.people, modelerFilter, missingCapacityOnly, teamFilter, visibleSearch]);

  const modelers = useMemo(() => data.people.filter((person) => person.isModeler), [data.people]);
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
      teamId: personDraft.teamId,
      roleTitle: personDraft.roleTitle,
      userType: personDraft.userType,
      loginName: personDraft.loginName,
      authRole: personDraft.authRole,
      password: personDraft.password,
      isModeler: personDraft.isModeler,
      weeklyCapacityStyles: nullableNumber(personDraft.weeklyCapacityStyles),
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
      notify("当前账号没有权限保存建模能力。", "warning");
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
        weeklyCapacityStyles: nullableNumber(capabilityDraft.weeklyCapacityStyles),
        specialtyTags: splitTags(capabilityDraft.specialtyTagsInput),
        weaknessTags: splitTags(capabilityDraft.weaknessTagsInput),
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
      teamId: data.teams.find((team) => team.name === "产品团队")?.id ?? "",
      roleTitle: "",
      userType: "内部",
      loginName: "",
      authRole: "viewer",
      password: "",
      isModeler: false,
      weeklyCapacityStyles: "",
      status: "启用",
      notes: "",
    });
  }

  function openCapabilityEditor(person?: UserDataPerson) {
    const target = person ?? selectedPerson ?? modelers[0] ?? data.people[0];

    setActiveTab("modeling");
    setCapabilityDraft({
      userId: target?.id ?? "",
      weeklyCapacityStyles: target?.weeklyCapacityStyles ? String(target.weeklyCapacityStyles) : "",
      specialtyTagsInput: joinTags(target?.specialtyTags ?? []),
      weaknessTagsInput: joinTags(target?.weaknessTags ?? []),
    });
  }

  function changeCapabilityUser(userId: string) {
    const person = data.people.find((item) => item.id === userId);

    setCapabilityDraft({
      userId,
      weeklyCapacityStyles: person?.weeklyCapacityStyles ? String(person.weeklyCapacityStyles) : "",
      specialtyTagsInput: joinTags(person?.specialtyTags ?? []),
      weaknessTagsInput: joinTags(person?.weaknessTags ?? []),
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
          <LogoutButton />
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
                当前账号：{currentUser.name} · {authRoleOptions.find((role) => role.value === currentUser.authRole)?.label ?? currentUser.authRole}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
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
                        teamType: "业务团队",
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

          <section className="mt-5 grid grid-cols-5 gap-3 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {data.metrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex h-9 rounded-lg bg-slate-100 p-1">
                <TabButton active={activeTab === "people"} icon={<UsersRound size={15} />} label="人员名单" onClick={() => openTab("people")} />
                <TabButton active={activeTab === "teams"} icon={<Building2 size={15} />} label="团队结构" onClick={() => openTab("teams")} />
                <TabButton active={activeTab === "modeling"} icon={<Gauge size={15} />} label="建模能力" onClick={() => openTab("modeling")} />
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
            {activeTab === "vendors" ? renderVendorsTab() : null}
          </div>
        </main>
      </div>
    </div>
  );

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
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">姓名</th>
                  <th className="px-3 py-2">团队</th>
                  <th className="px-3 py-2">职位</th>
                  <th className="px-3 py-2">用户类型</th>
                  <th className="px-3 py-2">登录名</th>
                  <th className="px-3 py-2">权限</th>
                  <th className="px-3 py-2">建模师</th>
                  <th className="px-3 py-2">每周产能</th>
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
                    <td className="px-3 py-3 text-slate-600">{person.teamName}</td>
                    <td className="px-3 py-3 text-slate-600">{person.roleTitle}</td>
                    <td className="px-3 py-3">
                      <TypeBadge value={person.userType} />
                    </td>
                    <td className="px-3 py-3 text-slate-600">{person.loginName || "-"}</td>
                    <td className="px-3 py-3">
                      <StatusBadge value={person.authRoleLabel} tone={person.authRole === "admin" ? "warning" : "neutral"} />
                    </td>
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
                        <span className="text-slate-700">{person.weeklyCapacityStyles ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge value={person.status} tone={person.status === "停用" ? "neutral" : "success"} />
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-slate-500">{person.notes || "-"}</td>
                    <td className="px-3 py-3 text-right">
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
                    </td>
                  </tr>
                ))}
                {filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-12 text-center text-sm text-slate-400">
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
            <div className="mt-1 text-sm text-slate-500">{selectedPerson.teamName} · {selectedPerson.roleTitle}</div>
          </div>
          <StatusBadge value={selectedPerson.status} tone={selectedPerson.status === "停用" ? "neutral" : "success"} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <DetailItem label="用户类型" value={selectedPerson.userType} />
          <DetailItem label="登录名" value={selectedPerson.loginName || "未开通"} />
          <DetailItem label="权限角色" value={selectedPerson.authRoleLabel} />
          <DetailItem label="是否建模师" value={selectedPerson.isModeler ? "是" : "否"} />
          <DetailItem label="每周产能" value={selectedPerson.weeklyCapacityStyles ?? "未填写"} />
          <DetailItem label="团队" value={selectedPerson.teamName} />
        </div>

        {selectedPerson.isModeler ? (
          <div className="mt-4 grid gap-3">
            <TagGroup title="擅长类型" tags={selectedPerson.specialtyTags} />
            <TagGroup title="不擅长类型" tags={selectedPerson.weaknessTags} />
            {selectedPerson.missingCapacity ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                缺少每周建模产能参数。
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {selectedPerson.notes || "暂无备注"}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canManage ? (
            <>
              <ActionButton icon={<Edit3 size={16} />} label="编辑人员" onClick={() => setPersonDraft(personDraftFromPerson(selectedPerson))} />
              <ActionButton icon={<Tags size={16} />} label="编辑标签" onClick={() => openCapabilityEditor(selectedPerson)} />
            </>
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
          <SelectField label="团队" value={personDraft.teamId} onChange={(value) => setPersonDraft({ ...personDraft, teamId: value })}>
            <option value="">未分配</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </SelectField>
          <TextInput label="职位 / 角色" value={personDraft.roleTitle} onChange={(value) => setPersonDraft({ ...personDraft, roleTitle: value })} />
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
            label={personDraft.id ? "重置密码" : "初始密码"}
            type="password"
            value={personDraft.password}
            onChange={(value) => setPersonDraft({ ...personDraft, password: value })}
          />
          <ToggleField label="是否建模师" checked={personDraft.isModeler} onChange={(value) => setPersonDraft({ ...personDraft, isModeler: value })} />
          <TextInput
            label="每周建模产能"
            type="number"
            min={0}
            value={personDraft.weeklyCapacityStyles}
            onChange={(value) => setPersonDraft({ ...personDraft, weeklyCapacityStyles: value })}
          />
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
                    teamType: "业务团队",
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
          <TextInput label="团队类型" value={teamDraft.teamType} onChange={(value) => setTeamDraft({ ...teamDraft, teamType: value })} />
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
              建模能力
            </div>
            {canManage ? <ActionButton icon={<Tags size={16} />} label="新增标签" onClick={() => openCapabilityEditor()} /> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">建模师</th>
                  <th className="px-3 py-2">擅长标签</th>
                  <th className="px-3 py-2">不擅长标签</th>
                  <th className="px-3 py-2">每周产能</th>
                  <th className="px-3 py-2">配置状态</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelers.map((person) => (
                  <tr key={person.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{person.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{person.teamName} · {person.roleTitle}</div>
                    </td>
                    <td className="px-3 py-3">
                      <TagList tags={person.specialtyTags} emptyLabel="未填写" />
                    </td>
                    <td className="px-3 py-3">
                      <TagList tags={person.weaknessTags} emptyLabel="未填写" muted />
                    </td>
                    <td className="px-3 py-3">
                      {person.weeklyCapacityStyles ?? "-"}
                    </td>
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
                          编辑标签
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {modelers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-sm text-slate-400">
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
    const missingTags = modelers.filter((person) => person.specialtyTags.length === 0);

    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Gauge size={16} />
          建模配置
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <DetailItem label="建模师" value={modelers.length} />
          <DetailItem label="缺少产能" value={missingCapacity.length} />
          <DetailItem label="缺少擅长标签" value={missingTags.length} />
          <DetailItem label="总周产能" value={modelers.reduce((sum, person) => sum + (person.weeklyCapacityStyles ?? 0), 0)} />
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
        <FormHeader title="新增 / 编辑建模能力标签" onCancel={() => setCapabilityDraft(null)} />
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
            label="每周建模产能"
            type="number"
            min={0}
            value={capabilityDraft.weeklyCapacityStyles}
            onChange={(value) => setCapabilityDraft({ ...capabilityDraft, weeklyCapacityStyles: value })}
          />
          <TextArea
            label="擅长标签"
            value={capabilityDraft.specialtyTagsInput}
            onChange={(value) => setCapabilityDraft({ ...capabilityDraft, specialtyTagsInput: value })}
            placeholder="Q版, 常规款, 正比例"
          />
          <TextArea
            label="不擅长标签"
            value={capabilityDraft.weaknessTagsInput}
            onChange={(value) => setCapabilityDraft({ ...capabilityDraft, weaknessTagsInput: value })}
            placeholder="复杂机械, 超写实"
          />
        </div>
        <FormActions saving={saving} submitLabel="保存能力标签" />
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
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">供应商名称</th>
                  <th className="px-3 py-2">联系人</th>
                  <th className="px-3 py-2">稳定外包</th>
                  <th className="px-3 py-2">擅长类型</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">备注</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.vendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-900">{vendor.name}</td>
                    <td className="px-3 py-3 text-slate-600">{vendor.contactName || "-"}</td>
                    <td className="px-3 py-3">
                      {vendor.stableCapacity ? <StatusBadge value="稳定" tone="success" /> : <StatusBadge value="非稳定" tone="neutral" />}
                    </td>
                    <td className="px-3 py-3">
                      <TagList tags={vendor.specialtyTags} emptyLabel="未填写" />
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
                    <td colSpan={7} className="px-3 py-12 text-center text-sm text-slate-400">
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

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      {icon}
      {label}
    </button>
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
  type?: "text" | "number" | "password";
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

function TagGroup({ title, tags }: { title: string; tags: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-slate-500">{title}</div>
      <TagList tags={tags} emptyLabel="未填写" />
    </div>
  );
}

function TagList({ tags, emptyLabel, muted }: { tags: string[]; emptyLabel: string; muted?: boolean }) {
  if (tags.length === 0) {
    return <span className="text-sm text-slate-400">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className={clsx(
            "rounded-full border px-2 py-0.5 text-xs font-medium",
            muted ? "border-slate-200 bg-slate-50 text-slate-500" : "border-sky-200 bg-sky-50 text-sky-700",
          )}
        >
          {tag}
        </span>
      ))}
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
    return <StatusBadge value="缺少产能" tone="warning" />;
  }

  if (person.specialtyTags.length === 0) {
    return <StatusBadge value="缺少标签" tone="warning" />;
  }

  return <StatusBadge value="完整" tone="success" />;
}

function personDraftFromPerson(person: UserDataPerson): PersonDraft {
  return {
    id: person.id,
    name: person.name,
    teamId: person.teamId ?? "",
    roleTitle: person.roleTitle === "未填写" ? "" : person.roleTitle,
    userType: person.userType,
    loginName: person.loginName,
    authRole: person.authRole,
    password: "",
    isModeler: person.isModeler,
    weeklyCapacityStyles: person.weeklyCapacityStyles ? String(person.weeklyCapacityStyles) : "",
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
    contactName: vendor.contactName,
    contactInfo: vendor.contactInfo,
    specialtyTagsInput: joinTags(vendor.specialtyTags),
    stableCapacity: vendor.stableCapacity,
    status: vendor.status,
    notes: vendor.notes,
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

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
