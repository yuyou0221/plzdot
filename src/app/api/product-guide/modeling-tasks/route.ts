import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { prisma } from "@/lib/db/prisma";
import { ModelingContractError, submitModelingStyleSubmission } from "@/lib/modeling-product-guide-contract";

export const runtime = "nodejs";

type ProductGuideStylePayload = {
  sourceStyleId?: string;
  projectTaskId: string;
  taskNo: 7 | 10;
  styleCode?: string;
  styleSequence: string;
  styleName: string;
  isFirstModelingStyle: boolean;
  isRequired: boolean;
  difficulty?: string;
  estimatedWorkdays?: number;
  originalArtStatus?: string;
  originalArtApprovedDate?: string;
  referenceImageUrls?: Array<{ url: string; name?: string; type?: string }>;
  notes?: string;
};

type ProductGuideStyleRow = {
  sourceStyleId?: string;
  styleCode?: string;
  styleSequence: string;
  styleName: string;
  isFirstModelingStyle: boolean;
  isRequired: boolean;
  difficulty?: string;
  estimatedWorkdays?: number;
  originalArtApprovedDate?: string;
  originalArtStatus?: string;
  referenceImageUrls?: Array<{ url: string; name?: string; type?: string }>;
  notes?: string;
};

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const projectId = optionalText(payload.projectId);
  const operatorName = optionalText(payload.operatorName) ?? auth.user.name ?? "产品组工作指引";

  if (!projectId) {
    return NextResponse.json({ ok: false, message: "缺少项目。" }, { status: 400 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, projectName: true },
    });

    if (!project) {
      return NextResponse.json({ ok: false, message: "找不到对应项目。" }, { status: 404 });
    }

    const styleRows = parseProductGuideStyleRows(payload.styles);
    const firstStyleCount = styleRows.filter((style) => style.isFirstModelingStyle).length;

    if (firstStyleCount !== 1) {
      return NextResponse.json({ ok: false, message: "必须且只能选择 1 款作为第一款建模款式。" }, { status: 400 });
    }

    const projectTasks = await prisma.projectTask.findMany({
      where: { projectId: project.id, taskNo: { in: [7, 10] } },
      select: { id: true, taskNo: true },
    });
    const task7 = projectTasks.find((task) => task.taskNo === 7);
    const task10 = projectTasks.find((task) => task.taskNo === 10);
    const hasRemainingStyles = styleRows.some((style) => !style.isFirstModelingStyle);

    if (!task7) {
      return NextResponse.json({ ok: false, message: "项目缺少任务 7，不能提交第一款建模款式。" }, { status: 400 });
    }

    if (hasRemainingStyles && !task10) {
      return NextResponse.json({ ok: false, message: "项目存在非第一款，但缺少任务 10，不能提交完整系列款式。" }, { status: 400 });
    }

    const pendingBatch = await prisma.modelingTask.findFirst({
      where: {
        projectId: project.id,
        status: { in: ["待确认", "退回补充"] },
        styleSubmissionBatchId: { not: null },
      },
      orderBy: [{ styleSubmissionVersion: "desc" }, { updatedAt: "desc" }],
      select: { styleSubmissionBatchId: true },
    });

    const styles: ProductGuideStylePayload[] = styleRows.map((style) => {
      const taskNo = style.isFirstModelingStyle ? 7 : 10;
      const targetProjectTaskId = style.isFirstModelingStyle ? task7.id : task10?.id;

      if (!targetProjectTaskId) {
        throw new ModelingContractError("找不到对应的建模项目任务。", 400);
      }

      return {
        ...style,
        projectTaskId: targetProjectTaskId,
        taskNo,
        sourceStyleId: style.sourceStyleId ?? `product-guide:${project.id}:${taskNo}:${style.styleSequence}`,
        originalArtStatus: style.originalArtStatus ?? (style.originalArtApprovedDate ? "已过审" : "未过审"),
      };
    });

    const result = await submitModelingStyleSubmission(
      {
        projectId: project.id,
        submittedByName: operatorName,
        ...(pendingBatch?.styleSubmissionBatchId ? { styleSubmissionBatchId: pendingBatch.styleSubmissionBatchId } : {}),
        styles,
      },
      { id: auth.user.id, name: operatorName },
    );

    return NextResponse.json({
      ok: true,
      message: "已提交建模款式清单，等待建模侧确认。",
      styleSubmissionBatchId: result.styleSubmissionBatchId,
      styleSubmissionVersion: result.styleSubmissionVersion,
      styles: result.styles,
      todos: result.todos,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      pendingConfirmationCount: result.pendingConfirmationCount,
    });
  } catch (error) {
    if (error instanceof ModelingContractError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `提交款式清单失败：${error.message}` : "提交款式清单失败。",
      },
      { status: 500 },
    );
  }
}

function parseProductGuideStyleRows(value: unknown): ProductGuideStyleRow[] {
  if (!Array.isArray(value)) {
    throw new ModelingContractError("请使用系列款式表格提交，并明确第一款。");
  }

  const rows = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ModelingContractError(`第 ${index + 1} 行款式格式不正确。`);
    }

    const record = item as Record<string, unknown>;
    const styleName = optionalText(record.styleName);
    const styleSequence = optionalText(record.styleSequence) ?? String(index + 1);

    if (!styleName) {
      throw new ModelingContractError(`第 ${index + 1} 行缺少款式名称。`);
    }

    return {
      sourceStyleId: optionalText(record.sourceStyleId) ?? undefined,
      styleCode: optionalText(record.styleCode) ?? undefined,
      styleSequence,
      styleName,
      isFirstModelingStyle: record.isFirstModelingStyle === true,
      isRequired: typeof record.isRequired === "boolean" ? record.isRequired : true,
      difficulty: optionalText(record.difficulty) ?? "常规款",
      estimatedWorkdays: optionalPositiveNumber(record.estimatedWorkdays) ?? undefined,
      originalArtApprovedDate: optionalDateString(record.originalArtApprovedDate) ?? undefined,
      originalArtStatus: optionalText(record.originalArtStatus) ?? undefined,
      referenceImageUrls: parseReferenceImageUrls(record),
      notes: optionalText(record.notes ?? record.note) ?? undefined,
    };
  });

  if (rows.length === 0) {
    throw new ModelingContractError("请至少提交 1 款建模款式。");
  }

  const sequenceCounts = new Map<string, number>();
  for (const row of rows) {
    sequenceCounts.set(row.styleSequence, (sequenceCounts.get(row.styleSequence) ?? 0) + 1);
  }
  const duplicatedSequence = [...sequenceCounts.entries()].find(([, count]) => count > 1)?.[0];

  if (duplicatedSequence) {
    throw new ModelingContractError(`款式序号 ${duplicatedSequence} 重复，请调整后重新提交。`);
  }

  return rows;
}

function parseReferenceImageUrls(record: Record<string, unknown>) {
  const urls: Array<{ url: string; name?: string; type?: string }> = [];
  const singleUrl = optionalText(record.referenceImageUrl ?? record.referenceUrl);

  if (singleUrl) {
    urls.push({ url: singleUrl, type: "参考图" });
  }

  if (Array.isArray(record.referenceImageUrls)) {
    for (const item of record.referenceImageUrls) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      const image = item as Record<string, unknown>;
      const url = optionalText(image.url);

      if (!url || urls.some((entry) => entry.url === url)) {
        continue;
      }

      urls.push({
        url,
        name: optionalText(image.name) ?? undefined,
        type: optionalText(image.type) ?? undefined,
      });
    }
  }

  return urls.length > 0 ? urls : undefined;
}

function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function optionalPositiveNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function optionalDateString(value: unknown) {
  const text = optionalText(value);

  if (!text) {
    return null;
  }

  const normalized = text.slice(0, 10);
  const date = new Date(`${normalized}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new ModelingContractError("原画过审日期格式不正确。");
  }

  return normalized;
}
