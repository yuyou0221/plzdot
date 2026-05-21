import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
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

export async function getUserDataWorkbenchData(): Promise<UserDataWorkbenchData> {
  try {
    await ensureBaseUserData();

    const [teamRows, userRows, tagRows, vendorRows] = await Promise.all([
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
          roleTitle: true,
          userType: true,
          isModeler: true,
          weeklyCapacityStyles: true,
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
          contactName: true,
          contactInfo: true,
          specialtyTags: true,
          stableCapacity: true,
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
      const missingCapacity = user.isModeler && (!user.weeklyCapacityStyles || user.weeklyCapacityStyles <= 0);

      return {
        id: user.id,
        name: user.name,
        teamId: user.teamId ?? undefined,
        teamName: user.teamId ? (teamNameById.get(user.teamId) ?? "未匹配团队") : "未分配",
        roleTitle: user.roleTitle ?? "未填写",
        userType: user.userType,
        isModeler: user.isModeler,
        weeklyCapacityStyles: user.weeklyCapacityStyles ?? undefined,
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
      contactName: vendor.contactName ?? "",
      contactInfo: vendor.contactInfo ?? "",
      specialtyTags: jsonStringList(vendor.specialtyTags),
      stableCapacity: vendor.stableCapacity,
      status: vendor.status,
      notes: vendor.notes ?? "",
    }));

    return {
      sourceLabel: "数据库",
      generatedAt: new Date().toISOString(),
      metrics: buildMetrics(people, teams, vendors),
      people,
      teams,
      vendors,
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

    const seededModelers = await tx.user.findMany({
      where: { name: { in: ["建模师待补充 A", "建模师待补充 B"] } },
      select: { id: true, name: true },
    });
    const modelerA = seededModelers.find((user) => user.name === "建模师待补充 A");
    const modelerB = seededModelers.find((user) => user.name === "建模师待补充 B");

    await ensureSeedTags(tx, modelerA?.id, [
      { tagName: "Q版", tagType: "擅长" },
      { tagName: "常规款", tagType: "擅长" },
      { tagName: "复杂机械", tagType: "不擅长" },
    ]);
    await ensureSeedTags(tx, modelerB?.id, [{ tagName: "正比例", tagType: "擅长" }]);

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
      roleTitle: "产品研发",
      userType: "内部",
      isModeler: false,
      status: "启用",
      notes: "基础占位数据，可编辑为真实人员。",
    },
    {
      name: "产品研发美术待补充",
      teamId: teamIdByName.get("产品团队"),
      roleTitle: "产品研发美术",
      userType: "内部",
      isModeler: false,
      status: "启用",
      notes: "基础占位数据，可编辑为真实人员。",
    },
    {
      name: "建模师待补充 A",
      teamId: teamIdByName.get("建模团队"),
      roleTitle: "建模师",
      userType: "内部",
      isModeler: true,
      weeklyCapacityStyles: 4,
      status: "启用",
      notes: "基础占位数据，可编辑为真实人员。",
    },
    {
      name: "建模师待补充 B",
      teamId: teamIdByName.get("建模团队"),
      roleTitle: "建模师",
      userType: "内部",
      isModeler: true,
      status: "启用",
      notes: "基础占位数据，当前故意保留产能缺口用于配置提醒。",
    },
  ];
}

async function ensureSeedTags(
  tx: Prisma.TransactionClient,
  userId: string | undefined,
  tags: Array<{ tagName: string; tagType: string }>,
) {
  if (!userId) {
    return;
  }

  const existingTags = await tx.modelerCapabilityTag.findMany({
    where: { userId },
    select: { tagName: true, tagType: true },
  });
  const existingTagKeys = new Set(existingTags.map((tag) => `${tag.tagType}:${tag.tagName}`));
  const missingTags = tags.filter((tag) => !existingTagKeys.has(`${tag.tagType}:${tag.tagName}`));

  if (missingTags.length > 0) {
    await tx.modelerCapabilityTag.createMany({
      data: missingTags.map((tag) => ({ userId, ...tag })),
    });
  }
}

function buildSeedVendors() {
  return [
    {
      name: "稳定外包供应商待补充",
      contactName: "联系人待补充",
      specialtyTags: ["Q版", "常规款"],
      stableCapacity: true,
      status: "启用",
      notes: "基础占位数据，可编辑为真实供应商。",
    },
    {
      name: "临时外包供应商待补充",
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
  const productTeamIds = new Set(teams.filter((team) => team.name.includes("产品")).map((team) => team.id));
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
      value: activePeople.filter((person) => person.teamId && productTeamIds.has(person.teamId)).length,
      helper: "所属团队包含产品",
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
      helper: "建模师未填写每周产能",
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
