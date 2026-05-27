import "server-only";

import { prisma } from "@/lib/db/prisma";
import { authRoleLabels } from "@/lib/auth/permissions";
import type {
  UserDataPerson,
  UserDataTeam,
  UserDataVendor,
  UserDataWorkbenchData,
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

export async function getUserDataWorkbenchData(): Promise<UserDataWorkbenchData> {
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

    return {
      sourceLabel: "数据库",
      generatedAt: new Date().toISOString(),
      metrics: buildMetrics(people, teams, vendors),
      people,
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
      metrics: buildMetrics([], teams, []),
      people: [],
      teams,
      vendors: [],
      availabilityBlocks: [],
    };
  }
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
