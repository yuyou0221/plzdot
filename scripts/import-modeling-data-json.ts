import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db/prisma";

type ModelingPayload = {
  sourceFileName?: string;
  sourceFilePath?: string;
  tasks: Record<string, unknown>[];
};

const payloadPath = process.argv[2] ? path.resolve(process.argv[2]) : "";

async function main() {
  if (!payloadPath) {
    throw new Error("Usage: tsx scripts/import-modeling-data-json.ts <modeling-json-path>");
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8")) as ModelingPayload;
  const rows = payload.tasks.filter((row) => text(row["项目ID"]) && text(row["款式名称"]));
  const importId = `modeling-data-import-${Date.now()}`;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const projects = await tx.project.findMany({ select: { id: true, projectCode: true } });
    const projectIds = new Set(projects.flatMap((project) => [project.id, project.projectCode].filter(Boolean) as string[]));
    const users = await tx.user.findMany({ select: { id: true, name: true } });
    const userIds = new Set(users.map((user) => user.id));
    const userIdByName = new Map(users.map((user) => [user.name, user.id]));
    const vendorRows = await tx.outsourceVendor.findMany({ select: { id: true, name: true } });
    const vendorIds = new Set(vendorRows.map((vendor) => vendor.id));
    const vendorIdByName = new Map(vendorRows.map((vendor) => [vendor.name, vendor.id]));
    const skippedRows: Array<{ row: number; reason: string; projectId?: string; styleName?: string }> = [];
    const feedbackRows: Array<{
      modelingTaskId: string;
      feedbackType: string;
      roundNo: number;
      feedbackAt: Date;
      content: string;
      status: string;
    }> = [];

    await tx.modelingFeedback.deleteMany();
    await tx.projectModelingProgress.deleteMany();
    await tx.modelingTask.deleteMany();

    const taskCreates = [];

    for (const [index, row] of rows.entries()) {
      const projectId = text(row["项目ID"]);
      const styleName = text(row["款式名称"]);

      if (!projectId || !styleName || !projectIds.has(projectId)) {
        skippedRows.push({ row: index + 2, reason: "项目不存在或款式名称为空", projectId: projectId ?? undefined, styleName: styleName ?? undefined });
        continue;
      }

      const projectTaskId = await resolveProjectTaskId(tx, projectId, text(row["项目任务ID"]), intValue(row["项目任务编号"]));

      if (!projectTaskId) {
        skippedRows.push({ row: index + 2, reason: "找不到项目建模任务", projectId, styleName });
        continue;
      }

      const modelerId = await resolveModelerId(tx, row, userIds, userIdByName);
      const outsourceVendorId = await resolveVendorId(tx, row, vendorIds, vendorIdByName);
      const id = text(row["建模任务ID"]) || `${projectId}-${text(row["款式编号"]) || index + 1}`;
      const feedbackContent = text(row["最新反馈内容"]);

      taskCreates.push({
        id,
        projectId,
        projectTaskId,
        styleCode: text(row["款式编号"]) || `${projectId}-S${String(index + 1).padStart(2, "0")}`,
        styleName,
        isRequired: bool(row["是否必做"], true),
        originalArtStatus: text(row["原画状态"]) || "未过审",
        originalArtApprovedDate: dateValue(row["原画过审日期"]),
        difficulty: text(row["难度"]) || "常规款",
        estimatedWorkdays: intValue(row["预计工作日"]) ?? 7,
        actualWorkdays: intValue(row["已用工作日"]),
        remainingWorkdays: intValue(row["剩余工作日"]),
        modelerId,
        isOutsourced: bool(row["是否外包"]),
        outsourceVendorId,
        stableOutsourceCapacity: bool(row["稳定外包产能"]),
        plannedStartDate: dateValue(row["计划开始"]),
        plannedFinishDate: dateValue(row["计划完成"]),
        actualStartDate: dateValue(row["实际开始"]),
        actualFinishDate: dateValue(row["实际完成"]),
        status: normalizeModelingStatus(row["状态"], bool(row["是否外包"])),
        reviewRound: intValue(row["修改轮次"]),
        lastFeedbackAt: dateValue(row["最后反馈时间"]),
        blockedSince: dateValue(row["阻塞开始"]),
        blockedDays: intValue(row["阻塞天数"]),
        blockType: text(row["阻塞类型"]),
        affectsProjectSchedule: bool(row["影响项目排期"], true),
        lastUpdatedAt: dateValue(row["最后更新"]) ?? now,
        lastUpdatedBy: text(row["最后更新人"]) || "建模 Excel 导入",
      });

      if (feedbackContent) {
        feedbackRows.push({
          modelingTaskId: id,
          feedbackType: text(row["最新反馈类型"]) || "建模反馈",
          roundNo: intValue(row["修改轮次"]) ?? 1,
          feedbackAt: dateValue(row["最后反馈时间"]) ?? now,
          content: feedbackContent,
          status: text(row["最新反馈状态"]) || "待处理",
        });
      }
    }

    if (taskCreates.length > 0) {
      await tx.modelingTask.createMany({ data: taskCreates });
    }

    if (feedbackRows.length > 0) {
      await tx.modelingFeedback.createMany({
        data: feedbackRows.map((row) => ({
          ...row,
          severity: "普通",
        })),
      });
    }

    await createProgressRows(tx, taskCreates, now);

    await tx.dataImport.create({
      data: {
        id: importId,
        importType: "建模款式 Excel JSON 导入",
        sourceFileName: payload.sourceFileName ?? path.basename(payloadPath),
        sourceFilePath: payload.sourceFilePath ?? payloadPath,
        sheetName: "上传用款式明细",
        rowCount: rows.length,
        importStatus: skippedRows.length > 0 ? "部分成功" : "成功",
        rawMetadata: {
          createdTasks: taskCreates.length,
          feedbackRows: feedbackRows.length,
          skippedRows,
        },
      },
    });

    return {
      importId,
      rows: rows.length,
      createdTasks: taskCreates.length,
      feedbackRows: feedbackRows.length,
      skippedRows,
    };
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

async function resolveProjectTaskId(
  tx: PrismaTransaction,
  projectId: string,
  projectTaskId: string | null,
  taskNo: number | null,
) {
  if (projectTaskId) {
    const task = await tx.projectTask.findFirst({ where: { id: projectTaskId, projectId }, select: { id: true } });

    if (task) {
      return task.id;
    }
  }

  const task = await tx.projectTask.findFirst({
    where: {
      projectId,
      ...(taskNo ? { taskNo } : { taskNo: { in: [7, 8, 9, 10] } }),
    },
    orderBy: { taskNo: "asc" },
    select: { id: true },
  });

  return task?.id ?? null;
}

async function resolveModelerId(
  tx: PrismaTransaction,
  row: Record<string, unknown>,
  userIds: Set<string>,
  userIdByName: Map<string, string>,
) {
  const modelerId = text(row["建模师ID"]);
  const modelerName = text(row["建模师"]);

  if (modelerId && userIds.has(modelerId)) {
    return modelerId;
  }

  if (modelerName && userIdByName.has(modelerName)) {
    return userIdByName.get(modelerName) ?? null;
  }

  if (!modelerName) {
    return null;
  }

  await tx.user.create({
    data: {
      id: modelerName,
      name: modelerName,
      roleTitle: text(row["建模师岗位"]) || "建模师",
      userType: "内部",
      isModeler: true,
      weeklyCapacityStyles: 4,
      status: "启用",
      notes: "由建模款式导入时自动补齐。",
    },
  });
  userIds.add(modelerName);
  userIdByName.set(modelerName, modelerName);

  return modelerName;
}

async function resolveVendorId(
  tx: PrismaTransaction,
  row: Record<string, unknown>,
  vendorIds: Set<string>,
  vendorIdByName: Map<string, string>,
) {
  if (!bool(row["是否外包"])) {
    return null;
  }

  const vendorId = text(row["外包供应商ID"]);
  const vendorName = text(row["外包供应商"]) || vendorId || "稳定外包供应商待补充";

  if (vendorId && vendorIds.has(vendorId)) {
    return vendorId;
  }

  if (vendorName && vendorIdByName.has(vendorName)) {
    return vendorIdByName.get(vendorName) ?? null;
  }

  const id = vendorId || vendorName;
  await tx.outsourceVendor.upsert({
    where: { id },
    create: {
      id,
      name: vendorName,
      stableCapacity: bool(row["稳定外包产能"]),
      status: "启用",
      notes: "由建模款式导入时自动补齐。",
    },
    update: {
      name: vendorName,
      stableCapacity: bool(row["稳定外包产能"]),
      status: "启用",
    },
  });
  vendorIds.add(id);
  vendorIdByName.set(vendorName, id);

  return id;
}

async function createProgressRows(tx: PrismaTransaction, tasks: Array<Record<string, unknown>>, now: Date) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();

  for (const task of tasks) {
    const key = `${task.projectId}::${task.projectTaskId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  }

  for (const rows of grouped.values()) {
    const required = rows.filter((row) => row.isRequired !== false);
    const totalRequiredStyles = required.length;
    const approvedStyles = required.filter((row) => row.status === "已通过").length;
    const submittedStyles = required.filter((row) => row.status === "已送审" || row.status === "等反馈").length;
    const outsourcedStyles = required.filter((row) => row.isOutsourced === true).length;
    const unassignedStyles = required.filter((row) => row.status === "未分配").length;
    const inProgressStyles = required.filter((row) =>
      ["已排期", "建模中", "已送审", "等反馈", "外包中", "暂停"].includes(String(row.status)),
    ).length;
    const completionDates = required
      .map((row) => row.actualFinishDate)
      .filter((date): date is Date => date instanceof Date);

    await tx.projectModelingProgress.create({
      data: {
        projectId: String(rows[0].projectId),
        projectTaskId: String(rows[0].projectTaskId),
        totalRequiredStyles,
        approvedStyles,
        inProgressStyles,
        submittedStyles,
        outsourcedStyles,
        unassignedStyles,
        progressPercent: totalRequiredStyles > 0 ? Math.round((approvedStyles / totalRequiredStyles) * 100) : 0,
        projectedAllApprovedDate:
          totalRequiredStyles > 0 && approvedStyles === totalRequiredStyles && completionDates.length > 0
            ? completionDates.sort((a, b) => b.getTime() - a.getTime())[0]
            : null,
        canWritebackProjectTask: totalRequiredStyles > 0 && approvedStyles === totalRequiredStyles,
        lastCalculatedAt: now,
      },
    });
  }
}

type PrismaTransaction = Prisma.TransactionClient;

function text(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const output = String(value).trim();
  return output.length > 0 ? output : null;
}

function bool(value: unknown, defaultValue = false) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  return value === true || value === "true" || value === "是" || value === "稳定";
}

function intValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function dateValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialDate(value);
  }

  const raw = text(value);

  if (!raw) {
    return null;
  }

  const numericRaw = Number(raw);

  if (Number.isFinite(numericRaw) && numericRaw >= 20_000 && numericRaw <= 60_000) {
    return excelSerialDate(numericRaw);
  }

  const normalized = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);

  if (normalized) {
    return new Date(
      Date.UTC(
        Number(normalized[1]),
        Number(normalized[2]) - 1,
        Number(normalized[3]),
        Number(normalized[4] ?? 12),
        Number(normalized[5] ?? 0),
        Number(normalized[6] ?? 0),
      ),
    );
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function excelSerialDate(value: number) {
  const wholeDays = Math.trunc(value);
  const fractionalDay = value - wholeDays;
  const excelEpoch = Date.UTC(1899, 11, 30);
  const milliseconds = Math.round(fractionalDay * 86_400_000);
  return new Date(excelEpoch + wholeDays * 86_400_000 + milliseconds);
}

function normalizeModelingStatus(value: unknown, isOutsourced: boolean) {
  const status = text(value);
  const validStatuses = new Set(["未启动", "未分配", "已排期", "建模中", "修改中", "待送审", "已送审", "等反馈", "已通过", "外包中", "暂停", "取消"]);

  if (status && validStatuses.has(status)) {
    return status;
  }

  if (status?.includes("修改")) return "修改中";

  return isOutsourced ? "外包中" : "未分配";
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
