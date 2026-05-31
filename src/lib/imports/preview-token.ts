import "server-only";

import { prisma } from "@/lib/db/prisma";

const PREVIEW_TTL_MINUTES = 30;

export type ManagedImportType = "project-main" | "modeling";

type PreviewMetadata = {
  importType: ManagedImportType;
  fileHash: string;
  expiresAt: string;
  usedAt?: string;
  fileName?: string;
};

export function previewRecordType(importType: ManagedImportType) {
  return importType === "project-main" ? "项目主数据Excel预览" : "建模款式Excel预览";
}

export async function createImportPreviewToken(input: {
  importType: ManagedImportType;
  fileName: string;
  fileHash: string;
  importedBy: string;
  rowCount?: number;
}) {
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MINUTES * 60 * 1000);
  const record = await prisma.dataImport.create({
    data: {
      importType: previewRecordType(input.importType),
      sourceFileName: input.fileName,
      rowCount: input.rowCount,
      importStatus: "预览通过",
      importedBy: input.importedBy,
      rawMetadata: {
        importType: input.importType,
        fileHash: input.fileHash,
        expiresAt: expiresAt.toISOString(),
        fileName: input.fileName,
      } satisfies PreviewMetadata,
    },
  });

  return {
    previewId: record.id,
    expiresAt: expiresAt.toISOString(),
    fileHash: input.fileHash,
  };
}

export async function validateImportPreviewToken(input: {
  previewId?: string | null;
  fileHash?: string | null;
  importType: ManagedImportType;
  importedBy: string;
}) {
  if (!input.previewId || !input.fileHash) {
    return { ok: false as const, message: "请先完成预览，再确认导入。" };
  }

  const preview = await prisma.dataImport.findUnique({ where: { id: input.previewId } });
  if (!preview || preview.importType !== previewRecordType(input.importType)) {
    return { ok: false as const, message: "找不到对应的导入预览，请重新预览。" };
  }

  if (preview.importedBy !== input.importedBy) {
    return { ok: false as const, message: "导入预览和确认导入不是同一个账号，请重新预览。" };
  }

  const metadata = parsePreviewMetadata(preview.rawMetadata);
  if (!metadata || metadata.importType !== input.importType) {
    return { ok: false as const, message: "导入预览信息已失效，请重新预览。" };
  }

  if (metadata.usedAt) {
    return { ok: false as const, message: "这个导入预览已经使用过，请重新预览。" };
  }

  if (metadata.fileHash !== input.fileHash) {
    return { ok: false as const, message: "确认导入的文件和预览文件不一致，请重新预览。" };
  }

  if (Date.parse(metadata.expiresAt) <= Date.now()) {
    return { ok: false as const, message: "导入预览已过期，请重新预览。" };
  }

  return { ok: true as const, previewId: preview.id, metadata };
}

export async function markImportPreviewTokenUsed(previewId: string, metadata: PreviewMetadata) {
  await prisma.dataImport.update({
    where: { id: previewId },
    data: {
      importStatus: "已导入",
      rawMetadata: {
        ...metadata,
        usedAt: new Date().toISOString(),
      },
    },
  });
}

function parsePreviewMetadata(value: unknown): PreviewMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const metadata = value as Record<string, unknown>;
  const importType = metadata.importType === "project-main" || metadata.importType === "modeling" ? metadata.importType : null;
  const fileHash = typeof metadata.fileHash === "string" ? metadata.fileHash : null;
  const expiresAt = typeof metadata.expiresAt === "string" ? metadata.expiresAt : null;

  if (!importType || !fileHash || !expiresAt) {
    return null;
  }

  return {
    importType,
    fileHash,
    expiresAt,
    usedAt: typeof metadata.usedAt === "string" ? metadata.usedAt : undefined,
    fileName: typeof metadata.fileName === "string" ? metadata.fileName : undefined,
  };
}

