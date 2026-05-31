import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function getActivePeopleForModules() {
  return prisma.user.findMany({
    where: { status: { not: "停用" } },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      roleTitle: true,
      businessRoles: true,
      teamId: true,
      departmentTeamId: true,
      projectGroupTeamId: true,
      isModeler: true,
      isSchedulable: true,
      weeklyAvailableWorkdays: true,
      authRole: true,
      permissionLevel: true,
    },
  });
}

export async function getTeamStructureForModules() {
  return prisma.team.findMany({
    where: { status: { not: "停用" } },
    orderBy: [{ teamType: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      teamType: true,
      parentTeamId: true,
      leaderUserId: true,
      status: true,
    },
  });
}

export async function getModelerCapacityForModules() {
  return prisma.user.findMany({
    where: { isModeler: true, status: { not: "停用" } },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      weeklyAvailableWorkdays: true,
      isSchedulable: true,
      status: true,
    },
  });
}

export async function getAvailabilityBlocksForModules() {
  return prisma.userAvailabilityBlock.findMany({
    where: { status: { not: "取消" } },
    orderBy: [{ startDate: "asc" }, { userId: "asc" }],
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
  });
}

export async function getActiveOutsourceVendorsForModules() {
  return prisma.outsourceVendor.findMany({
    where: { status: { not: "停用" } },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      contactName: true,
      stableCapacity: true,
      status: true,
      notes: true,
    },
  });
}

