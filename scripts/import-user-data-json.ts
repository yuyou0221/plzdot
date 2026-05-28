import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db/prisma";
import { encryptExportablePassword } from "../src/lib/auth/password-export";
import { hashPassword } from "../src/lib/auth/password";
import { normalizeAuthRole } from "../src/lib/auth/permissions";

type UserRow = Record<string, unknown>;

const payloadPath = process.argv[2] ? path.resolve(process.argv[2]) : "";

async function main() {
  if (!payloadPath) {
    throw new Error("Usage: tsx scripts/import-user-data-json.ts <personnel-json-path>");
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8")) as {
    sourceFileName?: string;
    sourceFilePath?: string;
    rows: UserRow[];
  };
  const rows = payload.rows.filter((row) => text(row["姓名"]) || text(row["人员ID"]));
  const importId = `user-data-import-${Date.now()}`;

  const result = await prisma.$transaction(async (tx) => {
    const teamIds = new Set<string>();
    const importedUserIds: string[] = [];
    let createdTeams = 0;
    let upsertedUsers = 0;
    let modelers = 0;
    let loginEnabled = 0;
    let createdTags = 0;

    for (const row of rows) {
      const teamId = text(row["团队ID"]) || text(row["团队"]);
      const teamName = text(row["团队"]) || teamId;

      if (teamId && teamName && !teamIds.has(teamId)) {
        const existing = await tx.team.findUnique({ where: { id: teamId }, select: { id: true } });
        await tx.team.upsert({
          where: { id: teamId },
          create: {
            id: teamId,
            name: teamName,
            teamType: inferTeamType(teamName),
            status: "启用",
            notes: "由人员 Excel 导入创建。",
          },
          update: {
            name: teamName,
            teamType: inferTeamType(teamName),
            status: "启用",
          },
        });
        teamIds.add(teamId);

        if (!existing) {
          createdTeams += 1;
        }
      }
    }

    for (const row of rows) {
      const id = text(row["人员ID"]) || text(row["姓名"]);
      const name = text(row["姓名"]) || id;

      if (!id || !name) {
        continue;
      }

      const teamId = text(row["团队ID"]) || text(row["团队"]);
      const loginName = text(row["登录名"]);
      const initialPassword = text(row["初始密码/重置密码"]);
      const passwordHash = initialPassword ? hashPassword(initialPassword) : undefined;
      const passwordExportCiphertext = initialPassword ? encryptExportablePassword(initialPassword) : undefined;
      const isModeler = bool(row["是否建模师"]);
      const weeklyCapacityStyles = nonNegativeInt(row["每周建模产能"]);
      const authRole = normalizeAuthRole(text(row["权限角色"]));

      const loginConflict = loginName
        ? await tx.user.findFirst({
            where: { loginName, NOT: { id } },
            select: { id: true },
          })
        : null;
      const safeLoginName = loginConflict ? null : loginName;

      await tx.user.upsert({
        where: { id },
        create: {
          id,
          name,
          teamId: teamId || null,
          roleTitle: text(row["职位/角色"]),
          userType: text(row["用户类型"]) || "内部",
          loginName: safeLoginName,
          passwordHash: passwordHash ?? null,
          passwordExportCiphertext: passwordExportCiphertext ?? null,
          authRole,
          mustChangePassword: Boolean(passwordHash),
          isModeler,
          weeklyCapacityStyles,
          status: normalizeStatus(row["状态"]),
          contactInfo: text(row["联系方式"]),
          notes: text(row["备注"]),
        },
        update: {
          name,
          teamId: teamId || null,
          roleTitle: text(row["职位/角色"]),
          userType: text(row["用户类型"]) || "内部",
          loginName: safeLoginName,
          ...(passwordHash ? { passwordHash, passwordExportCiphertext, mustChangePassword: true } : {}),
          authRole,
          isModeler,
          weeklyCapacityStyles,
          status: normalizeStatus(row["状态"]),
          contactInfo: text(row["联系方式"]),
          notes: text(row["备注"]),
        },
      });

      importedUserIds.push(id);
      upsertedUsers += 1;

      if (isModeler) {
        modelers += 1;
      }

      if (safeLoginName) {
        loginEnabled += 1;
      }
    }

    if (importedUserIds.length > 0) {
      await tx.modelerCapabilityTag.deleteMany({ where: { userId: { in: importedUserIds } } });
    }

    for (const row of rows) {
      const userId = text(row["人员ID"]) || text(row["姓名"]);

      if (!userId) {
        continue;
      }

      for (const tagName of stringList(row["擅长类型"])) {
        await tx.modelerCapabilityTag.create({
          data: {
            userId,
            tagName,
            tagType: "擅长",
          },
        });
        createdTags += 1;
      }

      for (const tagName of stringList(row["不擅长类型"])) {
        await tx.modelerCapabilityTag.create({
          data: {
            userId,
            tagName,
            tagType: "不擅长",
          },
        });
        createdTags += 1;
      }
    }

    await tx.dataImport.create({
      data: {
        id: importId,
        importType: "用户数据 Excel JSON 导入",
        sourceFileName: payload.sourceFileName ?? path.basename(payloadPath),
        sourceFilePath: payload.sourceFilePath ?? payloadPath,
        sheetName: "人员表单",
        rowCount: rows.length,
        importStatus: "成功",
        rawMetadata: {
          createdTeams,
          upsertedUsers,
          modelers,
          loginEnabled,
          createdTags,
        },
      },
    });

    return {
      importId,
      createdTeams,
      upsertedUsers,
      modelers,
      loginEnabled,
      createdTags,
    };
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

function inferTeamType(teamName: string) {
  if (teamName.includes("建模") || teamName.includes("原画")) return "制作";
  if (teamName.includes("平面")) return "设计";
  if (teamName.includes("样品")) return "打样";
  if (teamName.includes("商务")) return "商务";
  if (teamName.includes("运营") || teamName.includes("电商")) return "运营";
  if (teamName.includes("供应链")) return "供应链";
  return "产品";
}

function text(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const output = String(value).trim();
  return output.length > 0 ? output : null;
}

function bool(value: unknown) {
  return value === true || value === "true" || value === "是" || value === "稳定";
}

function normalizeStatus(value: unknown) {
  return text(value) === "停用" ? "停用" : "启用";
}

function nonNegativeInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

function stringList(value: unknown) {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.from(
    new Set(
      String(value)
        .split(/[,\n，、;；?？]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
