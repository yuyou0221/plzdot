import "server-only";

import { write, utils } from "xlsx";
import { decryptExportablePassword } from "@/lib/auth/password-export";
import { prisma } from "@/lib/db/prisma";

const peopleColumns = [
  "人员ID",
  "姓名",
  "公司部门",
  "项目小组",
  "岗位",
  "是否建模师",
  "每周可用工作日",
  "状态",
  "登录名",
  "权限角色",
  "权限等级",
  "初始/重置密码",
  "备注",
];

const teamColumns = ["团队ID", "团队名称", "团队类型", "上级团队", "负责人", "状态"];

const fixedFieldColumns = ["权限"];

const vendorColumns = ["供应商ID", "供应商名称", "供应商类型", "联系人", "联系方式", "状态", "备注"];

export async function buildUserDataExportWorkbookBuffer({ includePlainPasswords = false } = {}) {
  const [teams, users, permissionRoles, vendors] = await Promise.all([
    prisma.team.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    prisma.user.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    prisma.permissionRole.findMany({ orderBy: [{ status: "asc" }, { roleName: "asc" }] }),
    prisma.outsourceVendor.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
  ]);

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const userById = new Map(users.map((user) => [user.id, user]));

  const peopleRows = users.map((user) => {
    const department = user.departmentTeamId
      ? teamById.get(user.departmentTeamId)
      : user.teamId
        ? teamById.get(user.teamId)
        : null;
    const projectGroup = user.projectGroupTeamId ? teamById.get(user.projectGroupTeamId) : null;

    return {
      人员ID: user.id,
      姓名: user.name,
      公司部门: department?.name ?? "",
      项目小组: projectGroup?.name ?? "",
      岗位: businessRoleText(user.businessRoles, user.roleTitle),
      是否建模师: user.isModeler ? "是" : "否",
      每周可用工作日: user.weeklyAvailableWorkdays ?? user.weeklyCapacityStyles ?? "",
      状态: user.status,
      登录名: user.loginName ?? "",
      权限角色: user.authRole,
      权限等级: user.permissionLevel,
      "初始/重置密码": includePlainPasswords ? decryptExportablePassword(user.passwordExportCiphertext) : "",
      备注: user.notes ?? "",
    };
  });

  const teamRows = teams.map((team) => {
    const parent = team.parentTeamId ? teamById.get(team.parentTeamId) : null;
    const leader = team.leaderUserId ? userById.get(team.leaderUserId) : null;

    return {
      团队ID: team.id,
      团队名称: team.name,
      团队类型: team.teamType,
      上级团队: parent?.name ?? "",
      负责人: leader?.name ?? "",
      状态: team.status,
    };
  });

  const permissionRoleRows = normalizePermissionRoleRows(permissionRoles);

  const vendorRows = vendors.map((vendor) => ({
    供应商ID: vendor.id,
    供应商名称: vendor.name,
    供应商类型: vendor.vendorType ?? (vendor.stableCapacity ? "稳定建模外包" : "临时建模外包"),
    联系人: vendor.contactName ?? "",
    联系方式: vendor.contactInfo ?? "",
    状态: vendor.status,
    备注: vendor.notes ?? "",
  }));

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, rowsToSheet(peopleColumns, peopleRows), "人员名单");
  utils.book_append_sheet(workbook, rowsToSheet(fixedFieldColumns, permissionRoleRows), "固定字段");
  utils.book_append_sheet(workbook, rowsToSheet(teamColumns, teamRows), "团队结构");
  utils.book_append_sheet(workbook, rowsToSheet(vendorColumns, vendorRows), "外包供应商");

  return write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

function normalizePermissionRoleRows(
  rows: Array<{
    roleName: string;
    status: string;
    notes: string | null;
  }>,
) {
  const rowByRole = new Map(rows.map((row) => [row.roleName, row]));
  const normalized = [...rows];

  for (const builtin of [
    { roleName: "admin" },
    { roleName: "manager" },
    { roleName: "viewer" },
  ]) {
    if (!rowByRole.has(builtin.roleName)) {
      normalized.push({ ...builtin, status: "启用", notes: null });
    }
  }

  return normalized.filter((row) => row.status !== "停用").map((row) => ({ 权限: row.roleName }));
}

function rowsToSheet(columns: string[], rows: Record<string, unknown>[]) {
  const matrix = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))];
  const sheet = utils.aoa_to_sheet(matrix);
  sheet["!cols"] = columns.map((column) => ({ wch: column.includes("ID") ? 24 : Math.min(Math.max(column.length + 6, 12), 28) }));
  return sheet;
}

function businessRoleText(value: unknown, fallback: string | null) {
  const roles = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  if (roles.length > 0) {
    return roles.join("、");
  }

  return fallback ?? "";
}
