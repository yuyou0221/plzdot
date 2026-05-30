import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type MockIntegrationKind = "taskFactEvents" | "styleSubmissions" | "styleStartEvents" | "reviewResults";

export type MockIntegrationEntry = {
  id: string;
  kind: MockIntegrationKind;
  receivedAt: string;
  payload: Record<string, unknown>;
};

export type MockIntegrationSnapshot = Record<MockIntegrationKind, MockIntegrationEntry[]>;

type MockStyle = {
  projectId: string;
  projectTaskId: string;
  modelingTaskId: string;
  sourceStyleId?: string;
  styleCode: string;
  styleName: string;
  styleSequence: string;
  isFirstModelingStyle: boolean;
  isRequired: boolean;
  status: string;
  estimatedWorkdays: number;
  internalApprovedDate: string | null;
  copyrightApprovedDate: string | null;
  reviewRound: number;
  lastFeedbackAt: string | null;
  latestFeedbackSummary: string;
  blockType: string | null;
  blockedDays: number | null;
};

const storeDir = path.join(process.cwd(), ".local", "product-guide-mock");
const kinds: MockIntegrationKind[] = ["taskFactEvents", "styleSubmissions", "styleStartEvents", "reviewResults"];

export async function appendMockIntegrationEntry(kind: MockIntegrationKind, payload: Record<string, unknown>) {
  const entries = await readEntries(kind);
  const entry: MockIntegrationEntry = {
    id: randomUUID(),
    kind,
    receivedAt: occurredAtInChina(new Date()),
    payload,
  };

  entries.unshift(entry);
  await writeEntries(kind, entries.slice(0, 200));

  return entry;
}

export async function getMockIntegrationSnapshot(): Promise<MockIntegrationSnapshot> {
  const entries = await Promise.all(kinds.map(async (kind) => [kind, await readEntries(kind)] as const));

  return Object.fromEntries(entries) as MockIntegrationSnapshot;
}

export async function clearMockIntegrationStore() {
  await rm(storeDir, { recursive: true, force: true });
}

export async function buildMockStyleCreateResult(payload: Record<string, unknown>) {
  const projectId = text(payload.projectId);
  const projectTaskId = text(payload.projectTaskId);
  const taskNo = numberValue(payload.taskNo) ?? 7;
  const styles = arrayOfRecords(payload.styles);

  return {
    projectId,
    projectTaskId,
    taskNo,
    styles: styles.map((style) => {
      const styleCode = text(style.styleCode) || `S${text(style.styleSequence) || "1"}`;
      const styleName = text(style.styleName) || styleCode;

      return {
        sourceStyleId: optionalText(style.sourceStyleId),
        styleCode,
        styleName,
        modelingTaskId: mockModelingTaskId(projectId, text(style.projectTaskId) || projectTaskId, styleCode, text(style.styleSequence)),
        modelingStatus: "待确认",
        createdOrUpdated: "created" as const,
      };
    }),
  };
}

export async function buildMockModelingStyles(projectId: string) {
  const snapshot = await getMockIntegrationSnapshot();
  const styleMap = new Map<string, MockStyle>();

  for (const entry of [...snapshot.styleSubmissions].reverse()) {
    const payload = entry.payload;
    if (text(payload.projectId) !== projectId) continue;

    for (const style of arrayOfRecords(payload.styles)) {
      const styleCode = text(style.styleCode) || `S${text(style.styleSequence) || "1"}`;
      const projectTaskId = text(style.projectTaskId) || text(payload.projectTaskId);
      const styleSequence = text(style.styleSequence) || String(styleMap.size + 1);
      const modelingTaskId = mockModelingTaskId(projectId, projectTaskId, styleCode, styleSequence);

      styleMap.set(modelingTaskId, {
        projectId,
        projectTaskId,
        modelingTaskId,
        sourceStyleId: optionalText(style.sourceStyleId),
        styleCode,
        styleName: text(style.styleName) || styleCode,
        styleSequence,
        isFirstModelingStyle: style.isFirstModelingStyle === true,
        isRequired: style.isRequired !== false,
        status: "待确认",
        estimatedWorkdays: numberValue(style.estimatedWorkdays) ?? 7,
        internalApprovedDate: null,
        copyrightApprovedDate: null,
        reviewRound: 0,
        lastFeedbackAt: null,
        latestFeedbackSummary: "",
        blockType: null,
        blockedDays: null,
      });
    }
  }

  applyStartEvents(styleMap, snapshot.styleStartEvents, projectId);
  applyReviewResults(styleMap, snapshot.reviewResults, projectId);

  return [...styleMap.values()].sort((a, b) => a.styleSequence.localeCompare(b.styleSequence, "zh-CN"));
}

export async function buildMockModelingProgress(projectId: string) {
  const styles = await buildMockModelingStyles(projectId);
  const requiredStyles = styles.filter((style) => style.isRequired);
  const totalRequiredStyles = requiredStyles.length;
  const approvedStyles = requiredStyles.filter((style) => style.status === "已通过").length;
  const inProgressStyles = requiredStyles.filter((style) => ["已排期", "建模中", "修改中"].includes(style.status)).length;
  const submittedStyles = requiredStyles.filter((style) => ["待验收", "待送审", "已送审", "等反馈"].includes(style.status)).length;
  const unassignedStyles = requiredStyles.filter((style) => style.status === "未分配").length;
  const unstartedStyles = requiredStyles.filter((style) => style.status === "待确认" || style.status === "未启动").length;

  return {
    projectId,
    projectTaskId: styles[0]?.projectTaskId ?? "",
    totalRequiredStyles,
    approvedStyles,
    inProgressStyles,
    submittedStyles,
    waitingSubmissionStyles: requiredStyles.filter((style) => style.status === "待送审").length,
    outsourcedStyles: 0,
    unstartedStyles,
    unassignedStyles,
    progressPercent: totalRequiredStyles > 0 ? Math.round((approvedStyles / totalRequiredStyles) * 100) : 0,
    canWritebackProjectTask: totalRequiredStyles > 0 && approvedStyles === totalRequiredStyles,
  };
}

function applyStartEvents(styleMap: Map<string, MockStyle>, entries: MockIntegrationEntry[], projectId: string) {
  for (const entry of [...entries].reverse()) {
    const payload = entry.payload;
    if (text(payload.projectId) !== projectId) continue;

    const taskNo = numberValue(payload.taskNo);
    const scope = text(payload.startScope);

    for (const style of styleMap.values()) {
      if (taskNo === 7 && scope === "first-style" && style.isFirstModelingStyle && style.status === "未启动") {
        style.status = "未分配";
      }

      if (taskNo === 10 && scope === "remaining-styles" && !style.isFirstModelingStyle && style.status === "未启动") {
        style.status = "未分配";
      }
    }
  }
}

function applyReviewResults(styleMap: Map<string, MockStyle>, entries: MockIntegrationEntry[], projectId: string) {
  for (const entry of [...entries].reverse()) {
    const payload = entry.payload;
    if (text(payload.projectId) !== projectId) continue;

    const modelingTaskId = text(payload.modelingTaskId);
    const style = styleMap.get(modelingTaskId);
    if (!style) continue;

    const result = text(payload.reviewResult);
    style.reviewRound += 1;
    style.lastFeedbackAt = text(payload.reviewAt) || entry.receivedAt;
    style.latestFeedbackSummary = text(payload.feedbackContent) || result;

    if (result === "内部通过可送审") {
      style.status = "待送审";
      style.internalApprovedDate = text(payload.reviewAt) || null;
    } else if (result === "已送审") {
      style.status = "已送审";
    } else if (result === "等反馈") {
      style.status = "等反馈";
    } else if (result === "送审通过") {
      style.status = "已通过";
      style.copyrightApprovedDate = text(payload.reviewAt) || null;
    } else {
      style.status = "排队中";
      style.blockType = result === "内部不通过" ? "内部审核反馈" : "版权方反馈";
      style.blockedDays = 0;
    }
  }
}

async function readEntries(kind: MockIntegrationKind): Promise<MockIntegrationEntry[]> {
  try {
    const raw = await readFile(filePathForKind(kind), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEntries(kind: MockIntegrationKind, entries: MockIntegrationEntry[]) {
  await mkdir(storeDir, { recursive: true });
  await writeFile(filePathForKind(kind), JSON.stringify(entries, null, 2), "utf8");
}

function filePathForKind(kind: MockIntegrationKind) {
  return path.join(storeDir, `${kind}.json`);
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => isRecord(item)) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const output = text(value);
  return output || undefined;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mockModelingTaskId(projectId: string, projectTaskId: string, styleCode: string, styleSequence: string) {
  return `mock-${safeId(projectId)}-${safeId(projectTaskId)}-${safeId(styleCode || styleSequence)}`;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "item";
}

function occurredAtInChina(date: Date) {
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${chinaDate.toISOString().slice(0, 19)}+08:00`;
}
