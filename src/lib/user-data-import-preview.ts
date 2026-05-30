import "server-only";

import { createHash } from "node:crypto";
import type { DataImport } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import type { UserDataImportPreviewResult } from "@/lib/user-data-import";

export const userDataImportPreviewType = "用户数据Excel预览";
const previewTtlMinutes = 30;

export function hashUserDataImportBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function createUserDataImportPreviewRecord({
  actor,
  fileName,
  fileHash,
  preview,
}: {
  actor: AuthUser;
  fileName: string;
  fileHash: string;
  preview: UserDataImportPreviewResult;
}) {
  const expiresAt = new Date(Date.now() + previewTtlMinutes * 60 * 1000).toISOString();
  const record = await prisma.dataImport.create({
    data: {
      importType: userDataImportPreviewType,
      sourceFileName: fileName,
      sourceFilePath: null,
      rowCount: preview.counts.total,
      importStatus: preview.canApply ? "预览通过" : "预览未通过",
      importedBy: actor.name,
      rawMetadata: {
        actorUserId: actor.id,
        actorLoginName: actor.loginName,
        fileHash,
        fileName,
        canApply: preview.canApply,
        expiresAt,
        counts: preview.counts,
        checks: preview.checks,
        warnings: preview.warnings.slice(0, 80),
        errors: preview.errors.slice(0, 80),
      },
    },
    select: { id: true },
  });

  return { previewId: record.id, expiresAt };
}

export async function validateUserDataImportPreview({
  previewId,
  actor,
  fileHash,
}: {
  previewId: string | null;
  actor: AuthUser;
  fileHash: string;
}): Promise<
  | { ok: true; record: DataImport }
  | { ok: false; status: number; reason: string; metadata?: Record<string, unknown> }
> {
  if (!previewId) {
    return { ok: false, status: 400, reason: "请先完成安全测试预览。" };
  }

  const record = await prisma.dataImport.findUnique({ where: { id: previewId } });

  if (!record || record.importType !== userDataImportPreviewType) {
    return { ok: false, status: 400, reason: "未找到对应的用户数据预览记录。" };
  }

  const metadata = jsonRecord(record.rawMetadata);
  const expiresAt = stringValue(metadata.expiresAt);
  const expiresAtTime = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;

  if (record.importStatus === "已使用") {
    return {
      ok: false,
      status: 400,
      reason: "该预览记录已经使用过，请重新预览。",
      metadata: { previewStatus: record.importStatus },
    };
  }

  if (record.importStatus !== "预览通过" || metadata.canApply !== true) {
    return {
      ok: false,
      status: 400,
      reason: "该预览未通过安全测试，不能覆盖更新。",
      metadata: { previewStatus: record.importStatus },
    };
  }

  if (stringValue(metadata.actorUserId) !== actor.id) {
    return { ok: false, status: 403, reason: "该预览记录不属于当前账号。" };
  }

  if (stringValue(metadata.fileHash) !== fileHash) {
    return { ok: false, status: 400, reason: "当前文件和预览文件不一致，请重新预览。" };
  }

  if (!Number.isFinite(expiresAtTime) || expiresAtTime <= Date.now()) {
    return { ok: false, status: 400, reason: "安全测试预览已过期，请重新选择 Excel。" };
  }

  return { ok: true, record };
}

export async function markUserDataImportPreviewUsed(previewId: string, importId: string) {
  const record = await prisma.dataImport.findUnique({ where: { id: previewId }, select: { rawMetadata: true } });
  const metadata = jsonRecord(record?.rawMetadata);

  await prisma.dataImport.update({
    where: { id: previewId },
    data: {
      importStatus: "已使用",
      rawMetadata: {
        ...metadata,
        usedAt: new Date().toISOString(),
        importId,
      },
    },
  });
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}
