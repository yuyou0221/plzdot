import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  authRoleLabels,
  canSeeSensitiveUserData,
  formatUserPermissionLevel,
  isHighestPermissionLevel,
  isHumanResourcesUser,
  type AuthUser,
} from "@/lib/auth/permissions";
import type {
  UserDataPerson,
  UserDataTeam,
  UserAvailabilityBlock,
  UserDataVendor,
  UserDataWorkbenchData,
  UserDataViewerPolicy,
} from "@/lib/user-data-types";

const baseTeams = [
  { name: "产品团队", teamType: "产品" },
  { name: "原画团队", teamType: "制作" },
  { name: "建模团队", teamType: "制作" },
  { name: "平面设计团队", teamType: "设计" },
  { name: "样品团队", teamType: "打样" },
  { name: "新媒体运营团队", teamType: "运营" },
  { name: "商务团队", teamType: "商务" },
  { name: "供应链团队", teamType: "供应链" },
];

const baseProductGroups = ["忍者组", "迪no组", "丹东组", "易特凡组"];

export async function getUserDataWorkbenchData(currentUser: AuthUser): Promise<UserDataWorkbenchData> {
  try {
    await ensureBaseUserData();

    const [teamRows, userRows, tagRows, vendorRows, availabilityRows] = await Promise.all([
      prisma.team.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          teamType: true,
          parentTeamId: true,
          leaderUserId: true,
          status: true,
          notes: true,
        },
      }),
      prisma.user.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          teamId: true,
          departmentTeamId: true,
          projectGroupTeamId: true,
          roleTitle: true,
          businessRoles: true,
          userType: true,
          loginName: true,
          passwordHash: true,
          authRole: true,
          permissionLevel: true,
          isModeler: true,
          weeklyCapacityStyles: true,
          weeklyAvailableWorkdays: true,
          isSchedulable: true,
          status: true,
          notes: true,
        },
      }),
      prisma.modelerCapabilityTag.findMany({
        orderBy: [{ userId: "asc" }, { tagType: "asc" }, { tagName: "asc" }],
        select: {
          userId: true,
          tagName: true,
          tagType: true,
        },
      }),
      prisma.outsourceVendor.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          vendorType: true,
          contactName: true,
          contactInfo: true,
          specialtyTags: true,
          stableCapacity: true,
          status: true,
          notes: true,
        },
      }),
      prisma.userAvailabilityBlock.findMany({
        where: { status: { not: "停用" } },
        orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
        take: 300,
        select: {
          id: true,
          userId: true,
          blockType: true,
          startDate: true,
          endDate: true,
          workdayCount: true,
          status: true,
          notes: true,
        },
      }),
    ]);

    const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));
    const userNameById = new Map(userRows.map((user) => [user.id, user.name]));
    const tagsByUserId = groupTagsByUserId(tagRows);

    const people: UserDataPerson[] = userRows.map((user) => {
      const tags = tagsByUserId.get(user.id) ?? { specialtyTags: [], weaknessTags: [] };
      const weeklyAvailableWorkdays = user.weeklyAvailableWorkdays ?? user.weeklyCapacityStyles ?? undefined;
      const departmentTeamId = user.departmentTeamId ?? user.teamId ?? undefined;
      const projectGroupTeamId = user.projectGroupTeamId ?? undefined;
      const missingCapacity = user.isModeler && (!weeklyAvailableWorkdays || weeklyAvailableWorkdays <= 0);
      const businessRoles = jsonStringList(user.businessRoles);
      const roleTitle = businessRoles.length > 0 ? businessRoles.join("、") : (user.roleTitle ?? "未填写");

      return {
        id: user.id,
        name: user.name,
        teamId: departmentTeamId,
        teamName: departmentTeamId ? (teamNameById.get(departmentTeamId) ?? "未匹配团队") : "未分配",
        departmentTeamId,
        departmentTeamName: departmentTeamId ? (teamNameById.get(departmentTeamId) ?? "未匹配部门") : "未分配",
        projectGroupTeamId,
        projectGroupTeamName: projectGroupTeamId ? (teamNameById.get(projectGroupTeamId) ?? "未匹配项目小组") : "未分配",
        roleTitle,
        businessRoles,
        userType: user.userType,
        loginName: user.loginName ?? "",
        authRole: user.authRole,
        authRoleLabel: authRoleLabels[user.authRole] ?? user.authRole,
        permissionLevel: user.permissionLevel,
        permissionLevelLabel: formatUserPermissionLevel(user.permissionLevel),
        canLogin: Boolean(user.loginName && user.passwordHash),
        isModeler: user.isModeler,
        weeklyCapacityStyles: weeklyAvailableWorkdays,
        weeklyAvailableWorkdays,
        isSchedulable: user.isSchedulable,
        status: user.status,
        notes: user.notes ?? "",
        specialtyTags: tags.specialtyTags,
        weaknessTags: tags.weaknessTags,
        missingCapacity,
      };
    });

    const teams: UserDataTeam[] = teamRows.map((team) => ({
      id: team.id,
      name: team.name,
      teamType: team.teamType,
      parentTeamId: team.parentTeamId ?? undefined,
      parentTeamName: team.parentTeamId ? (teamNameById.get(team.parentTeamId) ?? "未匹配上级团队") : "无",
      leaderUserId: team.leaderUserId ?? undefined,
      leaderName: team.leaderUserId ? (userNameById.get(team.leaderUserId) ?? "未匹配负责人") : "未设置",
      status: team.status,
      notes: team.notes ?? "",
    }));

    const vendors: UserDataVendor[] = vendorRows.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      vendorType: vendor.vendorType ?? "建模外包",
      contactName: vendor.contactName ?? "",
      contactInfo: vendor.contactInfo ?? "",
      specialtyTags: jsonStringList(vendor.specialtyTags),
      stableCapacity: vendor.stableCapacity,
      status: vendor.status,
      notes: vendor.notes ?? "",
    }));

    const availabilityBlocks = availabilityRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: userNameById.get(row.userId) ?? "未匹配人员",
      blockType: row.blockType,
      startDate: dateOnly(row.startDate),
      endDate: dateOnly(row.endDate),
      workdayCount: row.workdayCount ?? undefined,
      status: row.status,
      notes: row.notes ?? "",
    }));

    const viewer = buildViewerPolicy(currentUser);

    return {
      sourceLabel: "数据库",
      generatedAt: new Date().toISOString(),
      viewer,
      fieldVisibility: buildFieldVisibilityRows(),
      moduleReadModels: buildModuleReadModels(),
      moduleReadSnapshots: buildModuleReadSnapshots(people, teams, vendors, availabilityBlocks, viewer.canSeeSensitiveUserFields),
      metrics: buildMetrics(people, teams, vendors),
      people: people.map((person) => maskPersonForViewer(person, viewer.canSeeSensitiveUserFields)),
      teams,
      vendors,
      availabilityBlocks,
    };
  } catch (error) {
    console.error("Failed to build user data workbench", error);

    const teams = baseTeams.map((team, index): UserDataTeam => ({
      id: `fallback-team-${index}`,
      name: team.name,
      teamType: team.teamType,
      parentTeamName: "无",
      leaderName: "未设置",
      status: "启用",
      notes: "",
    }));

    return {
      sourceLabel: "基础团队样例",
      generatedAt: new Date().toISOString(),
      viewer: buildViewerPolicy(currentUser),
      fieldVisibility: buildFieldVisibilityRows(),
      moduleReadModels: buildModuleReadModels(),
      moduleReadSnapshots: buildModuleReadSnapshots([], teams, [], [], buildViewerPolicy(currentUser).canSeeSensitiveUserFields),
      metrics: buildMetrics([], teams, []),
      people: [],
      teams,
      vendors: [],
      availabilityBlocks: [],
    };
  }
}

function buildViewerPolicy(currentUser: AuthUser): UserDataViewerPolicy {
  const isLevelZero = isHighestPermissionLevel(currentUser);
  const isHumanResources = isHumanResourcesUser(currentUser);

  return {
    permissionLevel: currentUser.permissionLevel,
    permissionLevelLabel: formatUserPermissionLevel(currentUser.permissionLevel),
    isLevelZero,
    isHumanResources,
    canSeeSensitiveUserFields: canSeeSensitiveUserData(currentUser),
    canImportExcel: isLevelZero,
    canExportPasswords: isLevelZero,
    canDeleteDisabledUsers: isLevelZero,
  };
}

function maskPersonForViewer(person: UserDataPerson, canSeeSensitiveUserFields: boolean): UserDataPerson {
  if (canSeeSensitiveUserFields) {
    return person;
  }

  return {
    ...person,
    loginName: "",
    authRole: "",
    authRoleLabel: "仅等级 0 可见",
    permissionLevel: undefined,
    permissionLevelLabel: "仅等级 0 可见",
  };
}

function buildFieldVisibilityRows() {
  return [
    { scope: "人员名单", field: "姓名", levelZero: "可见", humanResources: "可见", moduleRead: "可读取" },
    { scope: "人员名单", field: "公司部门 / 项目小组", levelZero: "可见", humanResources: "可见", moduleRead: "可读取" },
    { scope: "人员名单", field: "岗位 / 业务角色", levelZero: "可见", humanResources: "可见", moduleRead: "按模块需要读取" },
    { scope: "人员名单", field: "内部 / 外包", levelZero: "可见", humanResources: "可见", moduleRead: "按模块需要读取" },
    { scope: "建模排期参数", field: "是否建模师", levelZero: "可见", humanResources: "可见", moduleRead: "建模排期可读取" },
    { scope: "建模排期参数", field: "每周可用工作日", levelZero: "可见", humanResources: "可见", moduleRead: "建模排期可读取" },
    { scope: "建模排期参数", field: "是否可排期 / 不可排期记录", levelZero: "可见", humanResources: "可见", moduleRead: "建模排期可读取" },
    { scope: "账号权限", field: "登录名", levelZero: "可见", humanResources: "隐藏", moduleRead: "登录功能内部读取" },
    { scope: "账号权限", field: "权限角色 admin / manager / viewer", levelZero: "可见", humanResources: "隐藏", moduleRead: "登录功能内部读取；其他模块自行判断" },
    { scope: "账号权限", field: "权限等级", levelZero: "可见", humanResources: "隐藏", moduleRead: "登录功能内部读取" },
    { scope: "账号权限", field: "初始 / 重置密码", levelZero: "仅导入导出时可见", humanResources: "隐藏", moduleRead: "不可读取明文" },
    { scope: "团队结构", field: "团队名称 / 类型 / 上级 / 负责人", levelZero: "可见", humanResources: "可见", moduleRead: "按模块需要读取" },
    { scope: "外包供应商", field: "供应商名称 / 类型 / 稳定状态", levelZero: "可见", humanResources: "可见", moduleRead: "建模排期可读取稳定产能" },
    { scope: "外包供应商", field: "联系人 / 联系方式 / 备注", levelZero: "可见", humanResources: "可见", moduleRead: "默认不提供给业务模块" },
  ];
}

function buildModuleReadModels() {
  return [
    {
      moduleName: "产品组工作指引",
      readableFields: "姓名、公司部门、项目小组、岗位 / 业务角色、启停状态",
      hiddenFields: "登录名、密码、权限等级、账号权限细节",
      notes: "用于人员筛选、任务归属和项目小组展示；不由用户数据模块分配任务。",
    },
    {
      moduleName: "建模排期",
      readableFields: "建模师名单、每周可用工作日、是否可排期、不可排期记录、稳定外包供应商",
      hiddenFields: "登录名、密码、权限等级、非建模必要备注",
      notes: "用于排期候选人和产能参数；具体排期算法由建模排期模块负责。",
    },
    {
      moduleName: "项目排期",
      readableFields: "人员姓名、团队、岗位、启停状态、项目小组",
      hiddenFields: "密码、权限等级、账号权限细节、联系方式",
      notes: "用于项目负责人、产品研发、产品研发美术等候选数据。",
    },
    {
      moduleName: "登录功能",
      readableFields: "登录名、密码哈希、权限角色、权限等级、启停状态",
      hiddenFields: "不向业务模块输出明文密码；明文只按等级 0 的 Excel 导出规则处理",
      notes: "登录是用户数据模块唯一主动功能；其他模块访问判断仍由各模块自行决定。",
    },
  ];
}

function buildModuleReadSnapshots(
  people: UserDataPerson[],
  teams: UserDataTeam[],
  vendors: UserDataVendor[],
  availabilityBlocks: UserAvailabilityBlock[],
  includeLoginSnapshot: boolean,
) {
  const activePeople = people.filter((person) => person.status !== "停用");
  const productTeamIds = new Set(
    teams.filter((team) => team.status !== "停用" && (team.teamType === "产品" || team.name.includes("产品"))).map((team) => team.id),
  );
  const availabilityCountByUserId = new Map<string, number>();

  for (const block of availabilityBlocks) {
    availabilityCountByUserId.set(block.userId, (availabilityCountByUserId.get(block.userId) ?? 0) + 1);
  }

  const productGuideRows = activePeople
    .filter((person) => {
      const roleText = [person.roleTitle, ...person.businessRoles].join(" ");
      return (
        roleText.includes("产品") ||
        roleText.includes("总监") ||
        (person.departmentTeamId ? productTeamIds.has(person.departmentTeamId) : false) ||
        (person.projectGroupTeamId ? productTeamIds.has(person.projectGroupTeamId) : false)
      );
    })
    .map((person) => [
      person.name,
      person.departmentTeamName,
      person.projectGroupTeamName,
      person.roleTitle,
      person.userType,
      person.status,
    ]);

  const modelingRows = [
    ...activePeople
      .filter((person) => person.isModeler)
      .map((person) => [
        "建模师",
        person.name,
        person.departmentTeamName,
        person.projectGroupTeamName,
        person.weeklyAvailableWorkdays ? String(person.weeklyAvailableWorkdays) : "未填写",
        person.isSchedulable ? "可排期" : "不可排期",
        String(availabilityCountByUserId.get(person.id) ?? 0),
      ]),
    ...vendors
      .filter((vendor) => vendor.status !== "停用" && vendor.stableCapacity)
      .map((vendor) => [
        "稳定外包",
        vendor.name,
        vendor.vendorType,
        "-",
        "-",
        vendor.stableCapacity ? "稳定产能" : "非稳定",
        "-",
      ]),
  ];

  const projectScheduleRows = activePeople.map((person) => [
    person.name,
    person.departmentTeamName,
    person.projectGroupTeamName,
    person.roleTitle,
    person.userType,
    person.status,
  ]);

  const teamRows = teams
    .filter((team) => team.status !== "停用")
    .map((team) => [team.name, team.teamType, team.parentTeamName, team.leaderName, team.status]);

  const snapshots = [
    {
      moduleName: "产品组工作指引",
      recordName: "产品相关人员",
      columns: ["姓名", "公司部门", "项目小组", "岗位 / 业务角色", "内部 / 外包", "状态"],
      rows: productGuideRows,
      totalRows: productGuideRows.length,
      notes: "按产品相关团队、项目小组和岗位筛出；只展示任务归属需要的人员主数据。",
    },
    {
      moduleName: "建模排期",
      recordName: "建模师与稳定外包",
      columns: ["类型", "名称", "部门 / 供应商类型", "项目小组", "每周可用工作日", "排期状态", "不可排期记录数"],
      rows: modelingRows,
      totalRows: modelingRows.length,
      notes: "展示建模排期可读取的建模师产能、可排期状态和稳定外包供应商。",
    },
    {
      moduleName: "项目排期",
      recordName: "项目人员候选数据",
      columns: ["姓名", "公司部门", "项目小组", "岗位 / 业务角色", "内部 / 外包", "状态"],
      rows: projectScheduleRows,
      totalRows: projectScheduleRows.length,
      notes: "展示项目排期可读取的负责人、产品研发、产品研发美术等候选人员基础数据。",
    },
    {
      moduleName: "团队结构",
      recordName: "启用团队",
      columns: ["团队名称", "团队类型", "上级团队", "负责人", "状态"],
      rows: teamRows,
      totalRows: teamRows.length,
      notes: "展示其他模块可读取的团队主数据，不包含账号权限信息。",
    },
  ];

  if (includeLoginSnapshot) {
    const loginRows = people
      .filter((person) => person.loginName)
      .map((person) => [
        person.name,
        person.loginName,
        person.authRoleLabel,
        person.permissionLevelLabel,
        person.canLogin ? "可登录" : "未配置密码",
        person.status,
      ]);

    snapshots.push({
      moduleName: "登录功能",
      recordName: "账号数据",
      columns: ["姓名", "登录名", "权限角色", "权限等级", "登录状态", "人员状态"],
      rows: loginRows,
      totalRows: loginRows.length,
      notes: "这是用户数据模块内部登录功能读取的账号数据；不展示密码明文或密码哈希。",
    });
  }

  return snapshots.map((snapshot) => ({
    ...snapshot,
    rows: snapshot.rows.slice(0, 80),
  }));
}

async function ensureBaseUserData() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1779396801)`;

    const existingTeams = await tx.team.findMany({ select: { id: true, name: true } });
    const existingTeamNames = new Set(existingTeams.map((team) => team.name));
    const missingTeams = baseTeams.filter((team) => !existingTeamNames.has(team.name));

    if (missingTeams.length > 0) {
      await tx.team.createMany({
        data: missingTeams.map((team) => ({
          name: team.name,
          teamType: team.teamType,
          status: "启用",
        })),
      });
    }

    const teamsAfterBase = await tx.team.findMany({ select: { id: true, name: true } });
    const productTeam = teamsAfterBase.find((team) => team.name === "产品团队");
    const existingProjectGroups = new Set(teamsAfterBase.map((team) => team.name));
    const missingProjectGroups = baseProductGroups.filter((name) => !existingProjectGroups.has(name));

    if (missingProjectGroups.length > 0) {
      await tx.team.createMany({
        data: missingProjectGroups.map((name) => ({
          name,
          teamType: "产品",
          parentTeamId: productTeam?.id,
          status: "启用",
          notes: "产品部门下的项目小组。",
        })),
      });
    }

    const teams = await tx.team.findMany({ select: { id: true, name: true } });
    const teamIdByName = new Map(teams.map((team) => [team.name, team.id]));
    const userRows = await tx.user.findMany({ select: { name: true } });
    const existingUserNames = new Set(userRows.map((user) => user.name));
    const seedUsers = buildSeedUsers(teamIdByName);
    const seedUserNames = seedUsers.map((user) => user.name);
    const shouldSeedUsers =
      userRows.length === 0 || seedUserNames.some((name) => existingUserNames.has(name));
    const missingUsers = shouldSeedUsers ? seedUsers.filter((user) => !existingUserNames.has(user.name)) : [];

    if (missingUsers.length > 0) {
      await tx.user.createMany({ data: missingUsers });
    }

    const vendorRows = await tx.outsourceVendor.findMany({ select: { name: true } });
    const existingVendorNames = new Set(vendorRows.map((vendor) => vendor.name));
    const seedVendors = buildSeedVendors();
    const seedVendorNames = seedVendors.map((vendor) => vendor.name);
    const shouldSeedVendors =
      vendorRows.length === 0 || seedVendorNames.some((name) => existingVendorNames.has(name));
    const missingVendors = shouldSeedVendors
      ? seedVendors.filter((vendor) => !existingVendorNames.has(vendor.name))
      : [];

    if (missingVendors.length > 0) {
      await tx.outsourceVendor.createMany({ data: missingVendors });
    }
  });
}

function buildSeedUsers(teamIdByName: Map<string, string>) {
  return [
    {
      name: "产品研发待补充",
      teamId: teamIdByName.get("产品团队"),
      departmentTeamId: teamIdByName.get("产品团队"),
      roleTitle: "产品研发",
      businessRoles: ["产品研发"],
      userType: "内部",
      isModeler: false,
      isSchedulable: true,
      status: "启用",
      notes: "基础占位数据，可编辑为真实人员。",
    },
    {
      name: "产品研发美术待补充",
      teamId: teamIdByName.get("产品团队"),
      departmentTeamId: teamIdByName.get("产品团队"),
      roleTitle: "产品研发美术",
      businessRoles: ["产品研发美术"],
      userType: "内部",
      isModeler: false,
      isSchedulable: true,
      status: "启用",
      notes: "基础占位数据，可编辑为真实人员。",
    },
    {
      name: "建模师待补充 A",
      teamId: teamIdByName.get("建模团队"),
      departmentTeamId: teamIdByName.get("建模团队"),
      roleTitle: "建模师",
      businessRoles: ["建模师"],
      userType: "内部",
      isModeler: true,
      weeklyCapacityStyles: 4,
      weeklyAvailableWorkdays: 4,
      isSchedulable: true,
      status: "启用",
      notes: "基础占位数据，可编辑为真实人员。",
    },
    {
      name: "建模师待补充 B",
      teamId: teamIdByName.get("建模团队"),
      departmentTeamId: teamIdByName.get("建模团队"),
      roleTitle: "建模师",
      businessRoles: ["建模师"],
      userType: "内部",
      isModeler: true,
      isSchedulable: true,
      status: "启用",
      notes: "基础占位数据，当前故意保留产能缺口用于配置提醒。",
    },
  ];
}

function buildSeedVendors() {
  return [
    {
      name: "稳定外包供应商待补充",
      vendorType: "稳定建模外包",
      contactName: "联系人待补充",
      specialtyTags: ["Q版", "常规款"],
      stableCapacity: true,
      status: "启用",
      notes: "基础占位数据，可编辑为真实供应商。",
    },
    {
      name: "临时外包供应商待补充",
      vendorType: "临时建模外包",
      contactName: "联系人待补充",
      specialtyTags: ["复杂结构"],
      stableCapacity: false,
      status: "启用",
      notes: "基础占位数据，可编辑为真实供应商。",
    },
  ];
}

function groupTagsByUserId(
  rows: Array<{ userId: string; tagName: string; tagType: string }>,
) {
  const tagsByUserId = new Map<string, { specialtyTags: string[]; weaknessTags: string[] }>();

  for (const row of rows) {
    const tags = tagsByUserId.get(row.userId) ?? { specialtyTags: [], weaknessTags: [] };

    if (isWeaknessTag(row.tagType)) {
      tags.weaknessTags.push(row.tagName);
    } else {
      tags.specialtyTags.push(row.tagName);
    }

    tagsByUserId.set(row.userId, tags);
  }

  return tagsByUserId;
}

function isWeaknessTag(tagType: string) {
  return tagType.includes("不擅长") || tagType.includes("弱项") || tagType.toLowerCase() === "weakness";
}

function buildMetrics(people: UserDataPerson[], teams: UserDataTeam[], vendors: UserDataVendor[]) {
  const activePeople = people.filter((person) => person.status !== "停用");
  const productTeamIds = new Set(
    teams.filter((team) => team.teamType === "产品" || team.name.includes("产品")).map((team) => team.id),
  );
  const modelers = activePeople.filter((person) => person.isModeler);

  return [
    {
      label: "启用人员数",
      value: activePeople.length,
      helper: "状态为启用的人员",
      tone: "neutral" as const,
    },
    {
      label: "产品组人数",
      value: activePeople.filter(
        (person) =>
          (person.departmentTeamId && productTeamIds.has(person.departmentTeamId)) ||
          (person.projectGroupTeamId && productTeamIds.has(person.projectGroupTeamId)),
      ).length,
      helper: "公司部门或项目小组属于产品",
      tone: "info" as const,
    },
    {
      label: "建模师人数",
      value: modelers.length,
      helper: "已标记为建模师",
      tone: "success" as const,
    },
    {
      label: "缺少产能参数人数",
      value: modelers.filter((person) => person.missingCapacity).length,
      helper: "建模师未填写每周可用工作日",
      tone: "warning" as const,
    },
    {
      label: "稳定外包数",
      value: vendors.filter((vendor) => vendor.status !== "停用" && vendor.stableCapacity).length,
      helper: "可纳入后续产能测算",
      tone: "info" as const,
    },
  ];
}

function jsonStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
