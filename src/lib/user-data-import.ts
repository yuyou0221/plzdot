import "server-only";

import path from "node:path";
import type { Prisma } from "@prisma/client";
import { read, utils, type WorkBook } from "xlsx";
import { encryptExportablePassword } from "@/lib/auth/password-export";
import { hashPassword, isValidPassword } from "@/lib/auth/password";
import { normalizeAuthRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  businessRoleList,
  normalizeBoolean,
  normalizeStatus,
  normalizeTeamType,
  normalizeVendorType,
  optionalWorkdays,
  requiredText,
} from "@/lib/user-data-mutation";

type SheetRow = Record<string, unknown>;
type ImportMode = "replace";
type PermissionRoleImportData = {
  status: string;
  notes: string | null;
};

type MutableImportState = {
  teamIdByName: Map<string, string>;
  userIdByName: Map<string, string>;
  vendorIdByName: Map<string, string>;
  permissionRoleNameByKey: Map<string, string>;
  existingUsersById: Map<
    string,
    {
      id: string;
      name: string;
      loginName: string | null;
      passwordHash: string | null;
      passwordExportCiphertext: string | null;
    }
  >;
  existingUserByLoginName: Map<string, string>;
  importedTeamIds: Set<string>;
  importedUserIds: Set<string>;
  importedVendorIds: Set<string>;
  importedPermissionRoleNames: Set<string>;
  warnings: string[];
};

export class UserDataImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserDataImportValidationError";
  }
}

export type UserDataImportResult = {
  ok: true;
  importId: string;
  mode: ImportMode;
  people: { rows: number; created: number; updated: number; skipped: number };
  permissionRoles: { rows: number; created: number; updated: number; skipped: number };
  teams: { rows: number; created: number; updated: number; skipped: number };
  vendors: { rows: number; created: number; updated: number; skipped: number };
  loginUpdated: number;
  passwordsUpdated: number;
  deactivated: { people: number; teams: number; vendors: number };
  warnings: string[];
};

export async function importUserDataWorkbook({
  buffer,
  fileName,
  importedBy,
}: {
  buffer: Buffer;
  fileName: string;
  importedBy: string;
}): Promise<UserDataImportResult> {
  const mode: ImportMode = "replace";
  const workbook = read(buffer, { type: "buffer", cellDates: true });
  const peopleRows = workbookRows(workbook, ["人员名单", "人员", "工作表一"], 0).filter(hasAnyValue);
  const permissionRoleRows = workbookRows(workbook, ["固定字段", "权限角色", "角色权限"], -1).filter(hasAnyValue);
  const teamRows = workbookRows(workbook, ["团队结构", "团队", "工作表二"], 1).filter(hasAnyValue);
  const vendorRows = workbookRows(workbook, ["外包供应商", "供应商", "工作表三"], 2).filter(hasAnyValue);

  if (peopleRows.length === 0 && teamRows.length === 0 && vendorRows.length === 0) {
    throw new UserDataImportValidationError("Excel 中没有识别到可导入的数据。");
  }

  return prisma.$transaction(async (tx) => {
    const state = await buildImportState(tx);
    const importId = `user-data-import-${Date.now()}`;
    const teamResult = await importTeams(tx, teamRows, state);
    const ensuredTeamResult = await ensureTeamsFromPeople(tx, peopleRows, state);
    teamResult.created += ensuredTeamResult.created;
    teamResult.updated += ensuredTeamResult.updated;
    const permissionRoleResult = await importPermissionRoles(tx, permissionRoleRows, peopleRows, state);
    const peopleResult = await importPeople(tx, peopleRows, state);
    await applyTeamLeaders(tx, teamRows, state);
    const vendorResult = await importVendors(tx, vendorRows, state);
    const deactivated = await deactivateMissingRows(tx, state);
    await assertActiveLoginAdminExists(tx);

    await tx.dataImport.create({
      data: {
        id: importId,
        importType: "用户数据 Excel 导入",
        sourceFileName: fileName,
        sourceFilePath: fileName,
        rowCount: peopleRows.length + permissionRoleRows.length + teamRows.length + vendorRows.length,
        importStatus: state.warnings.length > 0 ? "部分成功" : "成功",
        importedBy,
        rawMetadata: {
          mode,
          peopleRows: peopleRows.length,
          permissionRoleRows: permissionRoleRows.length,
          teamRows: teamRows.length,
          vendorRows: vendorRows.length,
          warnings: state.warnings.slice(0, 200),
        },
      },
    });

    return {
      ok: true,
      importId,
      mode,
      people: peopleResult.rows,
      permissionRoles: permissionRoleResult,
      teams: teamResult,
      vendors: vendorResult,
      loginUpdated: peopleResult.loginUpdated,
      passwordsUpdated: peopleResult.passwordsUpdated,
      deactivated,
      warnings: state.warnings,
    };
  });
}

async function buildImportState(tx: Prisma.TransactionClient): Promise<MutableImportState> {
  const [teams, users, vendors, permissionRoles] = await Promise.all([
    tx.team.findMany({ select: { id: true, name: true } }),
    tx.user.findMany({ select: { id: true, name: true, loginName: true, passwordHash: true, passwordExportCiphertext: true } }),
    tx.outsourceVendor.findMany({ select: { id: true, name: true } }),
    tx.permissionRole.findMany({ select: { roleName: true } }),
  ]);

  return {
    teamIdByName: new Map(teams.map((team) => [normalizeKey(team.name), team.id])),
    userIdByName: new Map(users.map((user) => [normalizeKey(user.name), user.id])),
    vendorIdByName: new Map(vendors.map((vendor) => [normalizeKey(vendor.name), vendor.id])),
    permissionRoleNameByKey: new Map(permissionRoles.map((role) => [normalizeKey(role.roleName), role.roleName])),
    existingUsersById: new Map(users.map((user) => [user.id, user])),
    existingUserByLoginName: new Map(users.filter((user) => user.loginName).map((user) => [normalizeKey(user.loginName ?? ""), user.id])),
    importedTeamIds: new Set<string>(),
    importedUserIds: new Set<string>(),
    importedVendorIds: new Set<string>(),
    importedPermissionRoleNames: new Set<string>(),
    warnings: [],
  };
}

async function importTeams(tx: Prisma.TransactionClient, rows: SheetRow[], state: MutableImportState) {
  const result = { rows: rows.length, created: 0, updated: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const id = text(rowValue(row, ["团队ID", "团队 Id", "Team ID"]));
    const name = requiredText(rowValue(row, ["团队名称", "团队", "名称", "Team"]));

    if (!name) {
      result.skipped += 1;
      state.warnings.push(`团队结构第 ${rowNumber} 行缺少团队名称，已跳过。`);
      continue;
    }

    const matchedId = id || state.teamIdByName.get(normalizeKey(name));
    const parentRef = text(rowValue(row, ["上级团队", "父级团队", "Parent Team"]));
    const parentTeamId = parentRef ? resolveTeamRef(parentRef, state) : null;
    const teamType = normalizeTeamType(rowValue(row, ["团队类型", "类型", "Team Type"]));
    const status = normalizeStatus(rowValue(row, ["状态", "Status"]));

    if (matchedId) {
      await tx.team.upsert({
        where: { id: matchedId },
        create: {
          id: matchedId,
          name,
          teamType,
          parentTeamId: parentTeamId === matchedId ? null : parentTeamId,
          status,
        },
        update: {
          name,
          teamType,
          parentTeamId: parentTeamId === matchedId ? null : parentTeamId,
          status,
        },
      });
      result.updated += id && !state.teamIdByName.has(normalizeKey(name)) ? 0 : 1;
      result.created += id && !state.teamIdByName.has(normalizeKey(name)) ? 1 : 0;
      state.teamIdByName.set(normalizeKey(name), matchedId);
      state.importedTeamIds.add(matchedId);
      continue;
    }

    const created = await tx.team.create({
      data: { name, teamType, parentTeamId, status },
      select: { id: true },
    });
    result.created += 1;
    state.teamIdByName.set(normalizeKey(name), created.id);
    state.importedTeamIds.add(created.id);
  }

  return result;
}

async function ensureTeamsFromPeople(tx: Prisma.TransactionClient, rows: SheetRow[], state: MutableImportState) {
  const result = { created: 0, updated: 0 };
  if (rows.length === 0) {
    return result;
  }

  const productTeamId = await ensureTeamByName(tx, "产品团队", "产品", null, state);
  state.importedTeamIds.add(productTeamId);

  for (const row of rows) {
    const departmentName = referenceText(rowValue(row, ["公司部门", "部门", "团队", "所属团队"]));
    const projectGroupName = referenceText(rowValue(row, ["项目小组", "小组", "项目组"]));

    if (departmentName) {
      const before = state.teamIdByName.size;
      const id = await ensureTeamByName(tx, departmentName, inferTeamType(departmentName), null, state);
      state.importedTeamIds.add(id);
      if (state.teamIdByName.size > before) result.created += 1;
    }

    if (projectGroupName) {
      const before = state.teamIdByName.size;
      const id = await ensureTeamByName(tx, projectGroupName, "产品", productTeamId, state);
      state.importedTeamIds.add(id);
      if (state.teamIdByName.size > before) result.created += 1;
    }
  }

  return result;
}

async function importPermissionRoles(tx: Prisma.TransactionClient, rows: SheetRow[], peopleRows: SheetRow[], state: MutableImportState) {
  const result = { rows: rows.length, created: 0, updated: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const roleName = requiredText(rowValue(row, ["权限", "权限角色", "角色", "Role", "__EMPTY"]));

    if (!roleName) {
      result.skipped += 1;
      state.warnings.push(`固定字段第 ${rowNumber} 行缺少权限角色名称，已跳过。`);
      continue;
    }

    const normalizedRoleName = normalizeAuthRole(roleName);
    const data = permissionRoleDataFromRow(row);
    const existed = state.permissionRoleNameByKey.has(normalizeKey(normalizedRoleName));
    await upsertPermissionRole(tx, normalizedRoleName, data);
    state.permissionRoleNameByKey.set(normalizeKey(normalizedRoleName), normalizedRoleName);
    state.importedPermissionRoleNames.add(normalizedRoleName);

    if (existed) result.updated += 1;
    else result.created += 1;
  }

  for (const roleName of requiredRoleNamesFromPeople(peopleRows)) {
    if (state.permissionRoleNameByKey.has(normalizeKey(roleName))) {
      state.importedPermissionRoleNames.add(state.permissionRoleNameByKey.get(normalizeKey(roleName)) ?? roleName);
      continue;
    }

    const defaultData = defaultPermissionRoleData(roleName);
    await upsertPermissionRole(tx, roleName, defaultData);
    state.permissionRoleNameByKey.set(normalizeKey(roleName), roleName);
    state.importedPermissionRoleNames.add(roleName);
    result.created += 1;

    if (!isBuiltInRole(roleName)) {
      state.warnings.push(`人员名单中使用了权限角色「${roleName}」，但固定字段工作表没有配置该角色，已自动创建为启用。`);
    }
  }

  for (const builtinRole of ["admin", "manager", "viewer"]) {
    if (state.permissionRoleNameByKey.has(normalizeKey(builtinRole))) {
      continue;
    }

    await upsertPermissionRole(tx, builtinRole, defaultPermissionRoleData(builtinRole));
    state.permissionRoleNameByKey.set(normalizeKey(builtinRole), builtinRole);
    state.importedPermissionRoleNames.add(builtinRole);
    result.created += 1;
  }

  return result;
}

async function importPeople(tx: Prisma.TransactionClient, rows: SheetRow[], state: MutableImportState) {
  const result = {
    rows: { rows: rows.length, created: 0, updated: 0, skipped: 0 },
    loginUpdated: 0,
    passwordsUpdated: 0,
  };

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const id = text(rowValue(row, ["人员ID", "人员 Id", "用户ID", "User ID"]));
    const name = requiredText(rowValue(row, ["姓名", "人员姓名", "Name"]));

    if (!name) {
      result.rows.skipped += 1;
      state.warnings.push(`人员名单第 ${rowNumber} 行缺少姓名，已跳过。`);
      continue;
    }

    const matchedId = id || state.userIdByName.get(normalizeKey(name));
    const existingUser = matchedId ? state.existingUsersById.get(matchedId) : undefined;
    const departmentTeamId = resolveTeamRef(referenceText(rowValue(row, ["公司部门", "部门", "团队", "所属团队"])), state);
    const projectGroupTeamId = resolveTeamRef(referenceText(rowValue(row, ["项目小组", "小组", "项目组"])), state);
    const businessRoles = businessRoleList(rowValue(row, ["岗位", "职位", "业务岗位", "职位/角色"]));
    const roleTitle = businessRoles.length > 0 ? businessRoles.join("、") : null;
    const isModeler = normalizeBoolean(rowValue(row, ["是否建模师", "建模师"]));
    const weeklyAvailableWorkdays = optionalWorkdays(rowValue(row, ["每周可用工作日", "每周建模产能", "每周产能"]));
    const status = normalizeStatus(rowValue(row, ["状态", "Status"]));
    const loginName = text(rowValue(row, ["登录名", "Login"]));
    const initialPassword = text(rowValue(row, ["初始/重置密码", "初始密码", "重置密码", "Password"]));
    const migrationPasswordHash = text(rowValue(row, ["密码哈希（仅迁移用）", "密码哈希", "Password Hash"]));
    const authRole = normalizeAuthRole(text(rowValue(row, ["权限角色", "权限", "Role"])));
    const notes = text(rowValue(row, ["备注", "Notes"]));
    const userType = text(rowValue(row, ["用户类型"])) ?? "内部";
    const isSchedulable = status !== "停用" && (!isModeler || Boolean(weeklyAvailableWorkdays && weeklyAvailableWorkdays > 0));
    const loginConflictId = loginName ? state.existingUserByLoginName.get(normalizeKey(loginName)) : undefined;
    const loginHasConflict = Boolean(loginConflictId && loginConflictId !== matchedId);
    const safeLoginName = loginHasConflict ? existingUser?.loginName ?? null : loginName;
    const passwordImport = passwordForImport({
      initialPassword,
      migrationPasswordHash,
      existingPasswordHash: existingUser?.passwordHash,
      rowNumber,
      state,
    });

    if (loginHasConflict) {
      state.warnings.push(`人员名单第 ${rowNumber} 行登录名 ${loginName} 已被其他人员占用，已保留原登录名。`);
    }
    if (loginName && !passwordImport.passwordHash && !existingUser?.passwordHash) {
      state.warnings.push(`人员名单第 ${rowNumber} 行填写了登录名但没有有效初始密码，该账号暂不能登录。`);
    }

    const data = {
      name,
      teamId: departmentTeamId,
      departmentTeamId,
      projectGroupTeamId,
      roleTitle,
      businessRoles,
      userType,
      loginName: safeLoginName,
      ...(passwordImport.passwordHash
        ? {
            passwordHash: passwordImport.passwordHash,
            mustChangePassword: passwordImport.mustChangePassword,
            ...(passwordImport.passwordExportCiphertext
              ? { passwordExportCiphertext: passwordImport.passwordExportCiphertext }
              : {}),
          }
        : {}),
      authRole,
      isModeler,
      weeklyCapacityStyles: weeklyAvailableWorkdays,
      weeklyAvailableWorkdays,
      isSchedulable,
      status,
      notes,
    };

    if (matchedId) {
      await tx.user.upsert({
        where: { id: matchedId },
        create: {
          id: matchedId,
          ...data,
          passwordHash: passwordImport.passwordHash ?? null,
          passwordExportCiphertext: passwordImport.passwordExportCiphertext ?? null,
          mustChangePassword: Boolean(passwordImport.passwordHash),
        },
        update: {
          ...data,
          ...(safeLoginName ? {} : { passwordHash: null, passwordExportCiphertext: null }),
        },
      });
      if (existingUser) {
        result.rows.updated += 1;
      } else {
        result.rows.created += 1;
      }
      state.importedUserIds.add(matchedId);
      state.userIdByName.set(normalizeKey(name), matchedId);
      state.existingUsersById.set(matchedId, {
        id: matchedId,
        name,
        loginName: safeLoginName,
        passwordHash: passwordImport.passwordHash ?? existingUser?.passwordHash ?? null,
        passwordExportCiphertext: passwordImport.passwordExportCiphertext ?? existingUser?.passwordExportCiphertext ?? null,
      });
      if (safeLoginName) state.existingUserByLoginName.set(normalizeKey(safeLoginName), matchedId);
    } else {
      const created = await tx.user.create({
        data: {
          ...data,
          passwordHash: passwordImport.passwordHash ?? null,
          passwordExportCiphertext: passwordImport.passwordExportCiphertext ?? null,
          mustChangePassword: Boolean(passwordImport.passwordHash),
        },
        select: { id: true },
      });
      result.rows.created += 1;
      state.importedUserIds.add(created.id);
      state.userIdByName.set(normalizeKey(name), created.id);
      state.existingUsersById.set(created.id, {
        id: created.id,
        name,
        loginName: safeLoginName,
        passwordHash: passwordImport.passwordHash ?? null,
        passwordExportCiphertext: passwordImport.passwordExportCiphertext ?? null,
      });
      if (safeLoginName) state.existingUserByLoginName.set(normalizeKey(safeLoginName), created.id);
    }

    if (safeLoginName) result.loginUpdated += 1;
    if (passwordImport.passwordHash) result.passwordsUpdated += 1;
  }

  return result;
}

async function applyTeamLeaders(tx: Prisma.TransactionClient, rows: SheetRow[], state: MutableImportState) {
  for (const row of rows) {
    const teamRef = text(rowValue(row, ["团队ID", "团队名称", "团队", "名称"]));
    const leaderRef = text(rowValue(row, ["负责人", "负责人姓名", "Leader"]));
    const teamId = resolveTeamRef(teamRef, state);
    const leaderUserId = resolveUserRef(leaderRef, state);

    if (teamId && leaderRef) {
      await tx.team.update({
        where: { id: teamId },
        data: { leaderUserId },
      });
    }
  }
}

async function importVendors(tx: Prisma.TransactionClient, rows: SheetRow[], state: MutableImportState) {
  const result = { rows: rows.length, created: 0, updated: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const id = text(rowValue(row, ["供应商ID", "供应商 Id", "Vendor ID"]));
    const name = requiredText(rowValue(row, ["供应商名称", "供应商", "名称", "Vendor"]));

    if (!name) {
      result.skipped += 1;
      state.warnings.push(`外包供应商第 ${rowNumber} 行缺少供应商名称，已跳过。`);
      continue;
    }

    const matchedId = id || state.vendorIdByName.get(normalizeKey(name));
    const vendorType = normalizeVendorType(rowValue(row, ["供应商类型", "类型", "Vendor Type"]));
    const data = {
      name,
      vendorType,
      contactName: text(rowValue(row, ["联系人", "Contact"])),
      contactInfo: text(rowValue(row, ["联系方式", "联系电话", "Contact Info"])),
      stableCapacity: vendorType.includes("稳定"),
      status: normalizeStatus(rowValue(row, ["状态", "Status"])),
      notes: text(rowValue(row, ["备注", "Notes"])),
    };

    if (matchedId) {
      await tx.outsourceVendor.upsert({
        where: { id: matchedId },
        create: { id: matchedId, ...data },
        update: data,
      });
      if (state.vendorIdByName.get(normalizeKey(name))) result.updated += 1;
      else result.created += 1;
      state.importedVendorIds.add(matchedId);
      state.vendorIdByName.set(normalizeKey(name), matchedId);
      continue;
    }

    const created = await tx.outsourceVendor.create({
      data,
      select: { id: true },
    });
    result.created += 1;
    state.importedVendorIds.add(created.id);
    state.vendorIdByName.set(normalizeKey(name), created.id);
  }

  return result;
}

async function deactivateMissingRows(tx: Prisma.TransactionClient, state: MutableImportState) {
  const [people, teams, vendors] = await Promise.all([
    state.importedUserIds.size > 0
      ? tx.user.updateMany({ where: { id: { notIn: Array.from(state.importedUserIds) } }, data: { status: "停用", isSchedulable: false } })
      : Promise.resolve({ count: 0 }),
    state.importedTeamIds.size > 0
      ? tx.team.updateMany({ where: { id: { notIn: Array.from(state.importedTeamIds) } }, data: { status: "停用" } })
      : Promise.resolve({ count: 0 }),
    state.importedVendorIds.size > 0
      ? tx.outsourceVendor.updateMany({ where: { id: { notIn: Array.from(state.importedVendorIds) } }, data: { status: "停用" } })
      : Promise.resolve({ count: 0 }),
  ]);

  return { people: people.count, teams: teams.count, vendors: vendors.count };
}

async function assertActiveLoginAdminExists(tx: Prisma.TransactionClient) {
  const activeAdminCount = await tx.user.count({
    where: {
      status: { not: "停用" },
      authRole: "admin",
      loginName: { not: null },
      passwordHash: { not: null },
    },
  });

  if (activeAdminCount === 0) {
    throw new UserDataImportValidationError("覆盖导入后将没有可登录的 admin 账号，请在人员名单中保留至少一个启用 admin，并填写登录名。");
  }
}

async function ensureTeamByName(
  tx: Prisma.TransactionClient,
  name: string,
  teamType: string,
  parentTeamId: string | null,
  state: MutableImportState,
) {
  const existingId = state.teamIdByName.get(normalizeKey(name));

  if (existingId) {
    return existingId;
  }

  const team = await tx.team.create({
    data: {
      name,
      teamType: normalizeTeamType(teamType),
      parentTeamId,
      status: "启用",
      notes: parentTeamId ? "由人员导入自动创建的项目小组。" : "由人员导入自动创建的公司部门。",
    },
    select: { id: true },
  });
  state.teamIdByName.set(normalizeKey(name), team.id);
  return team.id;
}

function workbookRows(workbook: WorkBook, sheetNameCandidates: string[], fallbackIndex: number) {
  const sheetName =
    workbook.SheetNames.find((name) => sheetNameCandidates.some((candidate) => normalizeKey(name).includes(normalizeKey(candidate)))) ??
    workbook.SheetNames[fallbackIndex];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;

  if (!sheet) {
    return [] as SheetRow[];
  }

  return utils.sheet_to_json<SheetRow>(sheet, { defval: "", raw: false });
}

function rowValue(row: SheetRow, keys: string[]) {
  const normalizedKeys = keys.map(normalizeKey);

  for (const [key, value] of Object.entries(row)) {
    if (normalizedKeys.includes(normalizeKey(key))) {
      return value;
    }
  }

  return undefined;
}

function hasAnyValue(row: SheetRow) {
  return Object.values(row).some((value) => text(value));
}

function text(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const output = String(value).trim();
  return output.length > 0 ? output : null;
}

function referenceText(value: unknown) {
  const output = text(value);

  if (!output) {
    return null;
  }

  return ["无", "暂无", "未设置", "未分配", "-", "n/a", "none"].includes(output.toLowerCase()) ? null : output;
}

function normalizeKey(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function resolveTeamRef(value: string | null, state: MutableImportState) {
  if (!value) {
    return null;
  }

  return state.importedTeamIds.has(value) || value.length >= 8 ? value : (state.teamIdByName.get(normalizeKey(value)) ?? null);
}

function requiredRoleNamesFromPeople(rows: SheetRow[]) {
  const names = new Set<string>();

  for (const row of rows) {
    const roleName = normalizeAuthRole(text(rowValue(row, ["权限角色", "权限", "Role"])));
    if (roleName) {
      names.add(roleName);
    }
  }

  return names;
}

function permissionRoleDataFromRow(row: SheetRow): PermissionRoleImportData {
  return {
    status: normalizeStatus(rowValue(row, ["状态", "Status"])),
    notes: text(rowValue(row, ["备注", "Notes"])),
  };
}

async function upsertPermissionRole(tx: Prisma.TransactionClient, roleName: string, data: PermissionRoleImportData) {
  await tx.permissionRole.upsert({
    where: { roleName },
    create: { roleName, ...data },
    update: data,
  });
}

function defaultPermissionRoleData(roleName: string): PermissionRoleImportData {
  return { status: "启用", notes: isBuiltInRole(roleName) ? null : "由人员名单权限角色自动创建。" };
}

function isBuiltInRole(roleName: string) {
  return roleName === "admin" || roleName === "manager" || roleName === "viewer";
}

function resolveUserRef(value: string | null, state: MutableImportState) {
  if (!value) {
    return null;
  }

  return state.importedUserIds.has(value) || value.length >= 8 ? value : (state.userIdByName.get(normalizeKey(value)) ?? null);
}

function passwordForImport({
  initialPassword,
  migrationPasswordHash,
  existingPasswordHash,
  rowNumber,
  state,
}: {
  initialPassword: string | null;
  migrationPasswordHash: string | null;
  existingPasswordHash: string | null | undefined;
  rowNumber: number;
  state: MutableImportState;
}) {
  if (initialPassword) {
    if (!isValidPassword(initialPassword)) {
      state.warnings.push(`人员名单第 ${rowNumber} 行初始/重置密码少于 8 位，已跳过密码写入。`);
      return { passwordHash: existingPasswordHash ? undefined : null };
    }

    return {
      passwordHash: hashPassword(initialPassword),
      passwordExportCiphertext: encryptExportablePassword(initialPassword) ?? undefined,
      mustChangePassword: true,
    };
  }

  if (migrationPasswordHash) {
    if (!isSupportedPasswordHash(migrationPasswordHash)) {
      state.warnings.push(`人员名单第 ${rowNumber} 行密码哈希格式不正确，已跳过密码迁移。`);
      return { passwordHash: existingPasswordHash ? undefined : null };
    }

    return {
      passwordHash: migrationPasswordHash,
      mustChangePassword: false,
    };
  }

  return { passwordHash: undefined };
}

function isSupportedPasswordHash(value: string) {
  const [algorithm, salt, key] = value.split(":");
  return algorithm === "scrypt" && Boolean(salt) && Boolean(key);
}

function inferTeamType(teamName: string) {
  if (teamName.includes("建模") || teamName.includes("原画")) return "制作";
  if (teamName.includes("平面")) return "设计";
  if (teamName.includes("样品")) return "打样";
  if (teamName.includes("商务")) return "商务";
  if (teamName.includes("运营") || teamName.includes("新媒体")) return "运营";
  if (teamName.includes("供应链")) return "供应链";
  return "产品";
}

export function sanitizeUserDataImportFileName(value: string) {
  const basename = path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return basename || "user-data-import.xlsx";
}
