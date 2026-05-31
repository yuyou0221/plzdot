"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  Clock3,
  FileText,
  Gauge,
  ListChecks,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AppSideNav } from "@/components/layout/app-side-nav";
import type { AuthUser } from "@/lib/auth/permissions";
import type { ProductGuideStyleSummary } from "@/lib/product-guide-types";
import type { ProjectCard, ScheduleTaskRow, ScheduleWorkbenchData } from "@/lib/sample-schedule";

type PageKey = "workbench" | "plan" | "forecast" | "week" | "detail";
type WorkbenchPageKey = "task" | "messages" | "approval";
type RiskLevel = "done" | "doneLate" | "normal" | "risk" | "delay";

type ProductGuidePrototypeScheduleData = ScheduleWorkbenchData & {
  productGuideProjectMasters?: Record<string, ProductGuideProjectMaster>;
  productGuideStyleSummaries?: ProductGuideStyleSummary[];
};

type ProductGuideProjectMaster = {
  projectId: string;
  projectCode?: string;
  projectName: string;
  licensorName?: string;
  ipName?: string;
  productType?: string;
  productLine?: string;
  projectTeamName?: string;
  projectOwnerName?: string;
  artOwnerName?: string;
};

type PrototypeProject = {
  id: string;
  name: string;
  code: string;
  team: string;
  productOwner: string;
  artOwner: string;
  licensor: string;
  ip: string;
  productType: string;
  status: string;
  plannedLaunch: string;
  forecastLaunch: string;
  progress: number;
  modelingProgress: {
    approved: number;
    total: number;
    inProgress: number;
    submitted: number;
    outsourced: number;
    unassigned: number;
  };
  currentMilestone: string;
  currentTask: string;
  riskLabel: string;
  riskMessage: string;
  planned: Record<string, string>;
  forecast: Record<string, string>;
  tasks: PrototypeTask[];
  styles: PrototypeStyle[];
  updates: string[];
};

type PrototypeTask = {
  id: string;
  projectTaskId?: string;
  no: number;
  name: string;
  milestone: string;
  owner: string;
  plannedStart: string;
  forecastStart: string;
  plannedFinish: string;
  forecastFinish: string;
  expectedFinish: string;
  actualStart?: string;
  actualFinish?: string;
  status: string;
  risk: RiskLevel;
  ddl: string;
  delayLine: string;
  reason: string;
  missingPredecessors: string[];
  missingPredecessorIds: string[];
};

type PrototypeStyle = {
  modelingTaskId?: string;
  styleCode?: string;
  sequence: string;
  name: string;
  isFirst: boolean;
  required: boolean;
  status: string;
  owner: string;
  latestFeedback: string;
  referenceImageCount: number;
  referenceImageUrls?: Array<{
    name?: string;
    url: string;
    type?: string;
  }>;
};

type GuideTask = {
  bucket: "due" | "progress" | "start" | "risk" | "licensor";
  projectId: string;
  taskNo: number;
  taskName: string;
  ddl: string;
  delayLine: string;
  sortDate: string;
};

type ReturnMessage = {
  id: string;
  eventType?: string;
  sourceModule: string;
  title: string;
  target: "task" | "approval" | "project" | "reserved";
  projectId?: string;
  projectTaskId?: string;
  taskNo?: number;
  projectName?: string;
  styleName?: string;
  modelingTaskId?: string;
  reviewRound?: number;
  submissionFeedbackId?: string;
  feedbackId?: string;
  deliverableUrls?: string[];
  summary: string;
  receivedAt: string;
  status: "未读" | "待处理" | "已处理" | "预留";
};

type TaskOperationKind = "fact" | "upload" | "modeling" | "review";

type TaskOperation = {
  label: string;
  kind: TaskOperationKind;
  helper: string;
};

type IntegrationExchange = {
  label: string;
  method: "GET" | "POST";
  path: string;
  payload?: Record<string, unknown>;
  haltOnFailure?: boolean;
  ok: boolean;
  status: number;
  response: Record<string, unknown>;
};

type IntegrationRequest = {
  label: string;
  method: "GET" | "POST";
  path: string;
  payload?: Record<string, unknown>;
  haltOnFailure?: boolean;
};

type IntegrationLog = {
  title: string;
  summary: string;
  exchanges: IntegrationExchange[];
};

type ModelingProductGuideEvent = {
  eventId: string;
  eventType: "style_list_confirmed" | "style_list_returned" | "modeling_work_submitted";
  sourceModule: string;
  targetModule: string;
  projectId: string;
  projectTaskId: string | null;
  modelingTaskId: string | null;
  status: string;
  occurredAt: string;
  payload: unknown;
};

type TaskOperationOptions = {
  actualStartDate?: string;
  actualFinishDate?: string;
  note?: string;
  override?: boolean;
  overrideType?: "force_start" | "force_complete";
  overrideReason?: string;
  missingPredecessorIds?: string[];
};

type QuickTaskAction = "expected-finish" | "block" | "unblock" | "submit-review" | "note";

type TaskOperationAvailability = {
  canRun: boolean;
  reason: string;
  displayLabel?: string;
};

type TaskOperationDraft = {
  taskKey: string;
  actualStartDate: string;
  actualFinishDate: string;
  expectedFinishDate: string;
  note: string;
  blockReason: string;
  reviewTarget: string;
  submittedAt: string;
  overrideReason: string;
};

type StyleListContext = {
  project: PrototypeProject;
  task: PrototypeTask;
  completionOptions?: TaskOperationOptions;
  returnMessage?: ReturnMessage;
};

type ReviewResultOptions = {
  feedbackContent?: string;
  attachmentUrls?: string[];
};

type StyleImageDraft = {
  id: string;
  name: string;
  url: string;
  type: string;
};

type TaskAttachmentDraft = StyleImageDraft & {
  operationLabel: string;
  uploadedAt: string;
};

type TaskReviewRecord = {
  id: string;
  operationLabel: string;
  reviewTarget: string;
  submittedAt: string;
  expectedFeedbackDate: string;
  result: string;
  feedbackContent: string;
  attachmentUrls: string[];
  recordedAt: string;
};

type StyleListDraftRow = {
  rowId: string;
  styleSequence: string;
  styleName: string;
  isRequired: boolean;
  isFirstModelingStyle: boolean;
  difficulty: string;
  estimatedWorkdays: string;
  originalArtApprovedDate: string;
  referenceImageUrlsText: string;
  referenceImages: StyleImageDraft[];
  notes: string;
};

const milestones = ["原画里程碑", "建模里程碑", "红蜡里程碑", "平面里程碑", "产前里程碑", "大货里程碑"];
const fallbackMonths = ["26年5月", "26年6月", "26年7月", "26年8月", "26年9月", "26年10月", "26年11月"];

const taskOperationSourceLabel = "任务处理.xlsx";
const standardTaskNos = Array.from({ length: 31 }, (_, index) => index + 1);

const taskOperationConfig: Record<number, { taskName: string; operations: TaskOperation[] }> = {
  1: taskOps("市场调研", ["开始", "结束", "上传调研结果"]),
  2: taskOps("可行性研究", ["开始", "结束", "上传调研结果"]),
  3: taskOps("项目企划", ["开始", "结束", "上传企划pdf"]),
  4: taskOps("绘制款式草稿", ["开始", "结束", "上传草稿png"]),
  5: taskOps("绘制款式效果图", ["开始", "结束", "上传效果图png", "填写建模款式清单"]),
  6: taskOps("绘制款式三视图", ["开始", "结束", "上传三视图png", "填写建模款式清单"]),
  7: taskOps("精细建模确认风格", ["开始", "结束", "上传渲染图png"]),
  8: taskOps("打印灰模实物确认", ["开始", "结束", "上传渲染图png"]),
  9: taskOps("工程审核", ["开始", "记录审核意见", "结束"]),
  10: taskOps("根据效果图建模", ["开始", "结束"]),
  11: taskOps("拆件和样品说明文档", ["开始", "结束"]),
  12: taskOps("成本核算确认", ["开始", "结束"]),
  13: taskOps("水贴AI文档制作", ["开始", "结束"]),
  14: taskOps("拆件确认", ["开始", "结束"]),
  15: taskOps("白蜡送审", ["开始", "提交送审记录", "结束"]),
  16: taskOps("包装设计", ["开始", "结束"]),
  17: taskOps("红蜡确认", ["开始", "记录审核意见", "结束"]),
  18: taskOps("样品制作", ["开始", "结束"]),
  19: taskOps("展示盒设计", ["开始", "结束"]),
  20: taskOps("渲染图设计", ["开始", "结束"]),
  21: taskOps("T1灰模", ["开始", "结束"]),
  22: taskOps("颜色样", ["开始", "结束"]),
  23: taskOps("T2灰模", ["开始", "结束"]),
  24: taskOps("模具确认", ["开始", "结束"]),
  25: taskOps("大货样", ["开始", "结束"]),
  26: taskOps("展示盒打样", ["开始", "结束"]),
  27: taskOps("包装样品打样", ["开始", "结束"]),
  28: taskOps("包装模拟", ["开始", "结束"]),
  29: taskOps("实拍图拍摄", ["开始", "结束"]),
  30: taskOps("首批大货生产", ["开始", "结束"]),
  31: taskOps("详情页设计", ["开始", "结束"]),
};

const bucketMeta: Record<GuideTask["bucket"], { title: string; helper: string }> = {
  due: { title: "本周需完成", helper: "到期任务优先补录事实" },
  progress: { title: "本周在推进", helper: "进行中任务保持更新时间" },
  start: { title: "本周要开始", helper: "启动前确认上游资料" },
  risk: { title: "风险任务", helper: "先确认卡点和预计完成时间" },
  licensor: { title: "版权方反馈", helper: "记录送审和反馈边界" },
};

const riskClass: Record<RiskLevel, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-950",
  doneLate: "border-emerald-700 bg-emerald-700 text-white",
  normal: "border-slate-200 bg-white text-slate-900",
  risk: "border-amber-300 bg-amber-100 text-amber-950",
  delay: "border-rose-500 bg-rose-500 text-white",
};

const pages: Array<{ key: PageKey; label: string; icon: typeof Gauge }> = [
  { key: "workbench", label: "工作台", icon: Gauge },
  { key: "plan", label: "产品规划", icon: CalendarDays },
  { key: "forecast", label: "压力预测", icon: AlertTriangle },
  { key: "week", label: "本周工作指引", icon: ListChecks },
  { key: "detail", label: "项目明细", icon: FileText },
];

function taskOps(taskName: string, labels: string[]) {
  return {
    taskName,
    operations: labels.map((rawLabel) => {
      const label = normalizeOperationLabel(rawLabel);

      return {
        label,
        kind: operationKind(label),
        helper: operationHelper(label),
      };
    }),
  };
}

function normalizeOperationLabel(label: string) {
  return label === "结束" ? "完成" : label;
}

function operationKind(label: string): TaskOperationKind {
  if (label.includes("上传")) return "upload";
  if (label.includes("建模款式")) return "modeling";
  if (label.includes("审核") || label.includes("送审")) return "review";
  return "fact";
}

function operationHelper(label: string) {
  if (label === "开始") return "写入 task_started，并在任务 7 / 10 时联动建模启动。";
  if (label === "完成" || label === "结束") return "写入 task_completed，记录实际完成日期。";
  if (label.includes("上传")) return "上传附件后续走独立附件接口，本轮不写项目排期。";
  if (label.includes("建模款式")) return "打开建模款式清单大弹窗，提交给建模排期。";
  if (label.includes("审核") || label.includes("送审")) return "任务送审会写入 task_submitted_for_review；普通附件记录不代表任务完成。";
  return "按该任务的业务规则提交处理结果。";
}

function operationAvailability(project: PrototypeProject, task: PrototypeTask, operation: TaskOperation): TaskOperationAvailability {
  if (operation.kind === "upload") {
    const missingIdentityReason = missingTaskIdentityReason(project, task);
    if (missingIdentityReason) return { canRun: false, reason: missingIdentityReason };
    if (isCancelledStatus(task.status)) return { canRun: false, reason: "当前任务已取消，不能继续上传附件。" };
    return { canRun: true, reason: "上传或登记附件；本动作不向项目排期发送任务事实事件。" };
  }

  if (operation.kind === "review") {
    const missingIdentityReason = missingTaskIdentityReason(project, task);
    if (missingIdentityReason) return { canRun: false, reason: missingIdentityReason };
    if (isCancelledStatus(task.status)) return { canRun: false, reason: "当前任务已取消，不能继续记录审核 / 送审。" };
    return { canRun: true, reason: "记录审核 / 送审事实；任务完成仍需单独点击完成。" };
  }

  if (operation.label !== "开始" && operation.label !== "完成") {
    return task.no === 0
      ? { canRun: false, reason: "任务数据不完整，无法提交。" }
      : { canRun: true, reason: operation.helper };
  }

  const missingIdentityReason = missingTaskIdentityReason(project, task);
  if (missingIdentityReason) {
    return { canRun: false, reason: missingIdentityReason };
  }

  if (isDoneStatus(task.status)) {
    return { canRun: false, reason: "该任务已完成，无需再次处理。" };
  }

  if (isCancelledStatus(task.status)) {
    return { canRun: false, reason: "当前任务已取消，不能处理。" };
  }

  const predecessorReason = missingPredecessorReason(task);

  if (operation.label === "开始") {
    if (isBlockedStatus(task.status)) {
      return { canRun: false, reason: "当前任务处于阻塞状态，请先解除阻塞或由管理层补录。" };
    }

    if (isPausedStatus(task.status)) {
      return { canRun: false, reason: "当前任务处于暂停状态，请先恢复或由管理层补录。" };
    }

    if (isStartedStatus(task)) {
      return { canRun: false, reason: "该任务已经开始。" };
    }

    if (predecessorReason) {
      return { canRun: false, reason: predecessorReason };
    }

    return { canRun: true, reason: operation.helper };
  }

  if (isBlockedStatus(task.status)) {
    return { canRun: false, reason: "当前任务处于阻塞状态，请先解除阻塞或由管理层补录。" };
  }

  if (isPausedStatus(task.status)) {
    return { canRun: false, reason: "当前任务处于暂停状态，请先恢复或由管理层补录。" };
  }

  if (predecessorReason) {
    return { canRun: false, reason: predecessorReason };
  }

  if (isLastOriginalArtTask(project, task) && project.styles.length === 0) {
    return {
      canRun: true,
      reason: "完成前需要先填写完整建模款式清单，提交成功后再发送任务完成事件。",
      displayLabel: task.actualStart ? "完成" : "补录完成",
    };
  }

  return {
    canRun: true,
    reason: task.actualStart ? operation.helper : "该任务未记录开始时间，可以直接补录完成。",
    displayLabel: task.actualStart ? "完成" : "补录完成",
  };
}

function missingTaskIdentityReason(project: PrototypeProject, task: PrototypeTask) {
  if (!project.id || project.id === "empty" || task.no <= 0) {
    return "任务缺少真实项目 ID 或任务编号，无法提交。";
  }

  return "";
}

function missingPredecessorReason(task: PrototypeTask) {
  if (task.missingPredecessors.length === 0) return "";

  return `请先完成前置任务：${task.missingPredecessors.join("、")}。`;
}

function canUseManagerOverride(role: string) {
  return role === "admin" || role === "manager";
}

function needsManagerOverride(task: PrototypeTask) {
  return task.missingPredecessors.length > 0 || isBlockedStatus(task.status) || isPausedStatus(task.status);
}

function isLastOriginalArtTask(project: PrototypeProject, task: PrototypeTask) {
  if (task.milestone !== "原画里程碑") return false;

  const originalArtTasks = project.tasks.filter((item) => item.milestone === "原画里程碑");
  const lastTaskNo = Math.max(0, ...originalArtTasks.map((item) => item.no));

  return task.no > 0 && task.no === lastTaskNo;
}

function managerOverrideDisabledReason(
  project: PrototypeProject,
  task: PrototypeTask,
  action: "start" | "complete",
  overrideReason: string,
  actualStartDate: string,
  actualFinishDate: string,
) {
  if (missingTaskIdentityReason(project, task)) return missingTaskIdentityReason(project, task);
  if (isDoneStatus(task.status)) return "该任务已完成，无需管理层强制处理。";
  if (isCancelledStatus(task.status)) return "该任务已取消，不建议通过强制完成处理。";
  if (action === "start" && isStartedStatus(task)) return "该任务已经开始，无需强制开始。";
  if (!needsManagerOverride(task)) return "当前任务可走普通操作，无需强制处理。";
  if (action === "start" && !actualStartDate) return "请填写实际开始日期。";
  if (action === "complete" && !actualFinishDate) return "请填写实际完成日期。";
  if (!overrideReason.trim()) return "请填写强制处理原因。";
  return "";
}

function defaultTaskOperationDraft(taskKey: string, task: PrototypeTask): TaskOperationDraft {
  const expectedFinishDate = parseDateText(task.expectedFinish) ? task.expectedFinish : todayDateOnly();

  return {
    taskKey,
    actualStartDate: task.actualStart || "",
    actualFinishDate: todayDateOnly(),
    expectedFinishDate,
    note: "",
    blockReason: "",
    reviewTarget: "版权方 / 审核方",
    submittedAt: todayDateOnly(),
    overrideReason: "",
  };
}

function defaultStyleDraftRows(project: PrototypeProject): StyleListDraftRow[] {
  if (project.styles.length > 0) {
    const rows = project.styles
      .slice()
      .sort((a, b) => Number(a.isFirst ? 0 : 1) - Number(b.isFirst ? 0 : 1) || a.sequence.localeCompare(b.sequence, "zh-CN"))
      .map((style, index) => ({
        rowId: createLocalRowId("style-row"),
        styleSequence: style.sequence || String(index + 1),
        styleName: style.name,
        isRequired: style.required,
        isFirstModelingStyle: style.isFirst,
        difficulty: styleDifficultyFromFeedback(style.latestFeedback),
        estimatedWorkdays: styleEstimatedWorkdaysFromFeedback(style.latestFeedback),
        originalArtApprovedDate: styleOriginalArtApprovedDateFromFeedback(style.latestFeedback),
        referenceImageUrlsText: "",
        referenceImages: (style.referenceImageUrls ?? []).map((image, imageIndex) => ({
          id: createLocalRowId("style-image"),
          name: image.name ?? `${style.name}参考图${imageIndex + 1}`,
          url: image.url,
          type: image.type ?? "参考图",
        })),
        notes: style.latestFeedback && style.latestFeedback !== "建模排期未返回更多说明。" ? style.latestFeedback : style.isFirst ? "第一款，由任务 7 启动。" : "其余款式，由任务 10 启动。",
      }));

    if (rows.length > 0 && !rows.some((row) => row.isFirstModelingStyle)) {
      return rows.map((row, index) => ({ ...row, isFirstModelingStyle: index === 0 }));
    }

    return rows;
  }

  return [
    createStyleDraftRow(project, 1, true),
    createStyleDraftRow(project, 2, false),
  ];
}

function styleDifficultyFromFeedback(feedback: string) {
  const match = feedback.match(/难度\s*([^/\s]+)/);
  return match?.[1] ?? "中";
}

function styleEstimatedWorkdaysFromFeedback(feedback: string) {
  const match = feedback.match(/预计\s*(\d+)\s*天/);
  return match?.[1] ?? "5";
}

function styleOriginalArtApprovedDateFromFeedback(feedback: string) {
  const match = feedback.match(/原画过审\s*(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? todayDateOnly();
}

function createStyleDraftRow(project: PrototypeProject, sequence: number, isFirstModelingStyle = false): StyleListDraftRow {
  return {
    rowId: createLocalRowId("style-row"),
    styleSequence: String(sequence),
    styleName: isFirstModelingStyle ? "第一款建模款式" : `款式 ${sequence}`,
    isRequired: true,
    isFirstModelingStyle,
    difficulty: isFirstModelingStyle ? "中" : "低",
    estimatedWorkdays: isFirstModelingStyle ? "7" : "4",
    originalArtApprovedDate: todayDateOnly(),
    referenceImageUrlsText: "",
    referenceImages: [],
    notes: isFirstModelingStyle ? "第一款，由任务 7 启动。" : "其余款式，由任务 10 启动。",
  };
}

function createLocalRowId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${id}`;
}

function nextStyleSequence(rows: StyleListDraftRow[]) {
  const numericSequences = rows
    .map((row) => Number(row.styleSequence))
    .filter((value) => Number.isFinite(value));

  return Math.max(0, ...numericSequences) + 1;
}

function validateStyleDraftRows(rows: StyleListDraftRow[]) {
  const errors: string[] = [];

  if (rows.length === 0) {
    errors.push("请至少填写 1 个款式。");
  }

  if (rows.filter((row) => row.isFirstModelingStyle).length !== 1) {
    errors.push("必须且只能选择 1 个第一款建模款式。");
  }

  const sequenceCounts = new Map<string, number>();
  for (const row of rows) {
    const sequence = row.styleSequence.trim();
    if (sequence) {
      sequenceCounts.set(sequence, (sequenceCounts.get(sequence) ?? 0) + 1);
    }
  }

  for (const [sequence, count] of sequenceCounts) {
    if (count > 1) {
      errors.push(`款式序号 ${sequence} 重复。`);
    }
  }

  rows.forEach((row, index) => {
    const line = `第 ${index + 1} 行`;
    const estimatedWorkdays = Number(row.estimatedWorkdays);

    if (!row.styleSequence.trim()) errors.push(`${line} 缺少款式序号。`);
    if (!row.styleName.trim()) errors.push(`${line} 缺少款式名称。`);
    if (!row.difficulty.trim()) errors.push(`${line} 缺少难度。`);
    if (!Number.isInteger(estimatedWorkdays) || estimatedWorkdays <= 0) errors.push(`${line} 的预计建模天数必须是正整数。`);
    if (!row.originalArtApprovedDate) errors.push(`${line} 缺少原画过审日期。`);
  });

  return [...new Set(errors)];
}

function operationsForTask(task: PrototypeTask) {
  return taskOperationConfig[task.no]?.operations ?? taskOps(task.name, ["开始", "结束"]).operations;
}

function operationTone(kind: TaskOperationKind) {
  const tones: Record<TaskOperationKind, string> = {
    fact: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    upload: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
    modeling: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
    review: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  };

  return tones[kind];
}

async function executeIntegrationRequests(title: string, requests: IntegrationRequest[]): Promise<IntegrationLog> {
  if (requests.length === 0) {
    return {
      title,
      summary: "该操作本轮不写入外部模块。",
      exchanges: [],
    };
  }

  const exchanges: IntegrationExchange[] = [];
  let scheduleProjectTaskId = "";

  for (const request of requests) {
    const exchange = await executeIntegrationRequest(withScheduleProjectTaskId(request, scheduleProjectTaskId));
    exchanges.push(exchange);

    if (exchange.ok && exchange.path.includes("/api/schedule/task-fact-events")) {
      scheduleProjectTaskId = textOrUndefined(exchange.response.projectTaskId) ?? scheduleProjectTaskId;
    }

    if (!exchange.ok && (exchange.haltOnFailure || exchange.path.includes("/api/schedule/task-fact-events"))) {
      break;
    }
  }

  const failedCount = exchanges.filter((exchange) => !exchange.ok).length;

  return {
    title,
    summary: failedCount > 0 ? `${failedCount} 个接口未通过，已展示返回原因。` : "所有接口已返回成功。",
    exchanges,
  };
}

function withScheduleProjectTaskId(request: IntegrationRequest, projectTaskId: string): IntegrationRequest {
  if (!projectTaskId || !request.path.includes("/api/modeling/style-start-events") || !isRecord(request.payload)) {
    return request;
  }

  if (textOrUndefined(request.payload.projectTaskId)) {
    return request;
  }

  return {
    ...request,
    payload: {
      ...request.payload,
      projectTaskId,
    },
  };
}

async function executeIntegrationRequest(request: IntegrationRequest): Promise<IntegrationExchange> {
  try {
    const response = await fetch(request.path, {
      method: request.method,
      headers: request.method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: request.method === "POST" ? JSON.stringify(request.payload ?? {}) : undefined,
      cache: "no-store",
    });
    const parsed = await response.json().catch(() => ({ message: "接口没有返回 JSON。" }));
    const body: Record<string, unknown> = isRecord(parsed) ? parsed : { value: parsed };

    return {
      ...request,
      ok: response.ok && body.ok !== false,
      status: response.status,
      response: body,
    };
  } catch (error) {
    return {
      ...request,
      ok: false,
      status: 0,
      response: {
        ok: false,
        message: error instanceof Error ? error.message : "接口调用失败。",
      },
    };
  }
}

async function uploadProductGuideImages(files: File[]): Promise<StyleImageDraft[]> {
  return uploadProductGuideFiles(files);
}

async function uploadProductGuideFiles(files: File[]): Promise<StyleImageDraft[]> {
  const formData = new FormData();

  files.forEach((file) => formData.append("files", file));

  const response = await fetch("/api/product-guide/uploads", {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  const parsed = await response.json().catch(() => ({ message: "上传接口没有返回 JSON。" }));
  const body: Record<string, unknown> = isRecord(parsed) ? parsed : { value: parsed };

  if (!response.ok || body.ok === false) {
    throw new Error(textOrUndefined(body.message) ?? `上传失败，状态 ${response.status}`);
  }

  const filesValue: unknown[] = Array.isArray(body.files) ? body.files : [];
  const uploaded = filesValue.map(uploadedImageDraft).filter((item): item is StyleImageDraft => Boolean(item));

  if (uploaded.length === 0) {
    throw new Error("上传接口没有返回可用文件地址。");
  }

  return uploaded;
}

function uploadedImageDraft(value: unknown): StyleImageDraft | null {
  if (!isRecord(value)) return null;
  const url = textOrUndefined(value.url);
  if (!url) return null;

  return {
    id: createLocalRowId("style-image"),
    name: textOrUndefined(value.name) ?? "产品组附件",
    url,
    type: textOrUndefined(value.type) ?? "附件",
  };
}

function taskAttachmentFromFile(file: StyleImageDraft, operationLabel: string): TaskAttachmentDraft {
  return {
    ...file,
    id: createLocalRowId("task-attachment"),
    operationLabel,
    uploadedAt: todayDateOnly(),
  };
}

function taskAttachmentKey(project: PrototypeProject, task: PrototypeTask) {
  return `${project.id}:${task.no}`;
}

function buildAttachmentIntegrationLog(project: PrototypeProject, task: PrototypeTask, operation: TaskOperation, attachments: TaskAttachmentDraft[]): IntegrationLog {
  return {
    title: operation.label,
    summary: `已记录 ${attachments.length} 个附件；该动作不写入项目排期任务事实。`,
    exchanges: [
      {
        label: `${operation.label} -> 产品组附件记录`,
        method: "POST",
        path: "product-guide-local:task-attachments",
        payload: {
          sourceModule: "product-guide",
          projectId: project.id,
          projectName: project.name,
          projectTaskId: task.projectTaskId,
          taskNo: task.no,
          taskName: task.name,
          operation: operation.label,
          attachmentUrls: attachments.map((attachment) => ({
            name: attachment.name,
            url: attachment.url,
            type: attachment.type,
          })),
          note: "附件记录暂存在产品组工作台本地状态；不触发项目排期重算。",
        },
        ok: true,
        status: 200,
        response: {
          ok: true,
          message: "产品组工作台已记录附件。",
          attachmentCount: attachments.length,
        },
      },
    ],
  };
}

function defaultTaskReviewRecordDraft() {
  return {
    reviewTarget: "版权方",
    submittedAt: todayDateOnly(),
    expectedFeedbackDate: "",
    result: "已送审",
    feedbackContent: "",
    attachmentUrlsText: "",
  };
}

function buildReviewRecordIntegrationLog(project: PrototypeProject, task: PrototypeTask, record: TaskReviewRecord): IntegrationLog {
  return {
    title: record.operationLabel,
    summary: "已记录审核 / 送审事实；该动作不写入项目排期任务事实。",
    exchanges: [
      {
        label: `${record.operationLabel} -> 产品组审核记录`,
        method: "POST",
        path: "product-guide-local:review-records",
        payload: {
          sourceModule: "product-guide",
          projectId: project.id,
          projectName: project.name,
          projectTaskId: task.projectTaskId,
          taskNo: task.no,
          taskName: task.name,
          operation: record.operationLabel,
          reviewTarget: record.reviewTarget,
          submittedAt: record.submittedAt,
          expectedFeedbackDate: record.expectedFeedbackDate,
          result: record.result,
          feedbackContent: record.feedbackContent,
          attachmentUrls: record.attachmentUrls,
          note: "审核 / 送审记录暂存在产品组工作台本地状态；不触发项目排期重算。",
        },
        ok: true,
        status: 200,
        response: {
          ok: true,
          message: "产品组工作台已记录审核 / 送审事实。",
        },
      },
    ],
  };
}

function buildOperationRequests(
  project: PrototypeProject,
  task: PrototypeTask,
  operation: TaskOperation,
  operatorId: string,
  operatorName: string,
  options: TaskOperationOptions = {},
): IntegrationRequest[] {
  if (operation.label === "开始") {
    const payload = withTaskOperationOptions(
      {
        actualStartDate: options.actualStartDate || todayDateOnly(),
        status: "进行中",
        note: options.note || `产品组从工作台启动 #${task.no} ${task.name}。`,
      },
      options,
    );
    const requests = [
      taskFactEventRequest(project, task, operatorId, operatorName, "task_started", payload),
    ];

    if (task.no === 7 || task.no === 10) {
      requests.push(styleStartEventRequest(project, task, operatorId, operatorName));
    }

    return requests;
  }

  if (operation.label === "完成" || operation.label === "结束") {
    const payload = withTaskOperationOptions(
      {
        actualFinishDate: options.actualFinishDate || todayDateOnly(),
        ...(options.actualStartDate ? { actualStartDate: options.actualStartDate } : {}),
        status: "已完成",
        note: options.note || `产品组从工作台标记 #${task.no} ${task.name} 完成。`,
      },
      options,
    );

    return [
      taskFactEventRequest(project, task, operatorId, operatorName, "task_completed", payload),
    ];
  }

  if (operation.label.includes("建模款式")) {
    return [styleSubmissionRequest(project, operatorId, operatorName)];
  }

  return [];
}

function withTaskOperationOptions(payload: Record<string, unknown>, options: TaskOperationOptions) {
  if (!options.override) return payload;

  return {
    ...payload,
    override: true,
    overrideType: options.overrideType,
    overrideReason: options.overrideReason,
    missingPredecessorIds: options.missingPredecessorIds ?? [],
  };
}

function taskFactEventRequest(project: PrototypeProject, task: PrototypeTask, operatorId: string, operatorName: string, eventType: string, payload: Record<string, unknown>): IntegrationRequest {
  return {
    label: `${operationEventLabel(eventType)} -> 项目排期`,
    method: "POST",
    path: "/api/schedule/task-fact-events",
    payload: {
      eventId: createPrototypeRequestId("task-event"),
      eventType,
      sourceModule: "product-guide",
      projectId: project.id,
      taskNo: task.no,
      taskKey: `#${task.no}`,
      taskName: task.name,
      occurredAt: occurredAtWithChinaOffset(),
      operatorId,
      operatorName,
      payload,
    },
  };
}

function styleSubmissionRequest(project: PrototypeProject, operatorId: string, operatorName: string, rows: StyleListDraftRow[] = defaultStyleDraftRows(project)): IntegrationRequest {
  const task7 = project.tasks.find((task) => task.no === 7);
  const task10 = project.tasks.find((task) => task.no === 10);

  return {
    label: "建模款式清单 -> 建模排期",
    method: "POST",
    path: "/api/modeling/style-submissions",
    payload: {
      sourceRequestId: createPrototypeRequestId("style-submission"),
      submittedAt: occurredAtWithChinaOffset(),
      submittedByUserId: operatorId,
      submittedByName: operatorName,
      projectId: project.id,
      projectName: project.name,
      projectTaskId: task7?.projectTaskId,
      taskNo: 7,
      firstStyleProjectTaskId: task7?.projectTaskId,
      remainingStylesProjectTaskId: task10?.projectTaskId,
      note: "产品组原画里程碑完成后，提交完整系列款式清单。",
      styles: rows.map((row, index) => {
        const styleSequence = row.styleSequence.trim() || String(index + 1);
        const isFirstModelingStyle = row.isFirstModelingStyle;

        return {
          sourceStyleId: `${project.id}:style:${styleSequence}`,
          styleCode: productGuideStyleCode(project, styleSequence),
          styleName: row.styleName.trim(),
          styleSequence,
          isRequired: row.isRequired,
          isFirstModelingStyle,
          projectTaskId: isFirstModelingStyle ? task7?.projectTaskId : task10?.projectTaskId,
          taskNo: isFirstModelingStyle ? 7 : 10,
          difficulty: row.difficulty.trim(),
          estimatedWorkdays: Number(row.estimatedWorkdays),
          originalArtStatus: "已过审",
          originalArtApprovedDate: row.originalArtApprovedDate,
          referenceImageUrls: referenceImagesForStyleRow(row),
          notes: row.notes.trim() || undefined,
        };
      }),
    },
  };
}

function productGuideStyleCode(project: PrototypeProject, styleSequence: string) {
  const projectCode = (project.code || project.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18) || "PG";
  const sequence = styleSequence.replace(/[^a-zA-Z0-9]/g, "").padStart(2, "0");

  return `${projectCode}-STYLE-${sequence || "00"}`;
}

function referenceImagesForStyleRow(row: StyleListDraftRow) {
  const pastedImages = row.referenceImageUrlsText
    .split(/[\n,，]/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url, index) => ({
      name: `${row.styleName.trim() || "款式"}参考图${index + 1}`,
      url,
      type: "参考图",
    }));

  return [
    ...row.referenceImages.map((image) => ({
      name: image.name,
      url: image.url,
      type: image.type,
    })),
    ...pastedImages,
  ];
}

function styleStartEventRequest(project: PrototypeProject, task: PrototypeTask, operatorId: string, operatorName: string): IntegrationRequest {
  const taskNo = task.no === 7 ? 7 : 10;

  return {
    label: `任务 ${taskNo} 启动 -> 建模排期`,
    method: "POST",
    path: "/api/modeling/style-start-events",
    payload: {
      sourceRequestId: createPrototypeRequestId("style-start"),
      projectId: project.id,
      projectTaskId: task.projectTaskId,
      taskNo,
      taskName: task.name,
      startScope: taskNo === 7 ? "first-style" : "remaining-styles",
      startedAt: occurredAtWithChinaOffset(),
      startedByUserId: operatorId,
      startedByName: operatorName,
    },
  };
}

function reviewResultRequest(message: ReturnMessage, reviewResult: string, reviewerId: string, reviewerName: string, options: ReviewResultOptions = {}): IntegrationRequest {
  const feedbackContent = options.feedbackContent?.trim() || (requiresReviewFeedback(reviewResult) ? "" : "产品组已提交审核结果。");

  return {
    label: `${reviewResult} -> 建模排期`,
    method: "POST",
    path: "/api/modeling/review-results",
    payload: {
      sourceRequestId: createPrototypeRequestId("review-result"),
      projectId: message.projectId ?? "",
      projectTaskId: message.projectTaskId ?? "",
      modelingTaskId: message.modelingTaskId ?? "",
      submissionFeedbackId: message.submissionFeedbackId ?? message.feedbackId ?? "",
      feedbackId: message.feedbackId ?? message.submissionFeedbackId ?? "",
      sourceEventId: message.eventType === "modeling_work_submitted" ? message.id : undefined,
      reviewResult,
      reviewAt: todayDateOnly(),
      reviewerId,
      reviewerName,
      feedbackContent,
      attachmentUrls: options.attachmentUrls ?? [],
    },
  };
}

function requiresReviewFeedback(reviewResult: string) {
  return reviewResult === "内部不通过" || reviewResult === "送审不通过";
}

function operationEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    task_started: "任务开始",
    task_completed: "任务完成",
    task_expected_finish_updated: "更新预计完成",
    task_submitted_for_review: "任务送审",
    task_blocked: "标记阻塞",
    task_unblocked: "解除阻塞",
    task_note_updated: "记录备注",
  };

  return labels[eventType] ?? eventType;
}

function quickTaskActionLabel(action: QuickTaskAction) {
  const labels: Record<QuickTaskAction, string> = {
    "expected-finish": "更新预计完成",
    block: "标记阻塞",
    unblock: "解除阻塞",
    "submit-review": "送审",
    note: "记录备注",
  };

  return labels[action];
}

function quickTaskActionHelper(action: QuickTaskAction) {
  const helpers: Record<QuickTaskAction, string> = {
    "expected-finish": "写入预计完成日期，并触发项目排期重算。",
    block: "写入阻塞原因，项目排期会重新判断压力。",
    unblock: "解除阻塞并恢复进行中。",
    "submit-review": "记录送审节点，不等同于任务完成。",
    note: "只更新当前进度说明，也会记录为任务事实。",
  };

  return helpers[action];
}

function quickTaskActionDisabledReason(action: QuickTaskAction, draft: TaskOperationDraft, project: PrototypeProject, task: PrototypeTask) {
  const identityReason = missingTaskIdentityReason(project, task);
  if (identityReason) return identityReason;
  if (action === "expected-finish" && !draft.expectedFinishDate) return "请先填写预计完成日期。";
  if (action === "block" && !draft.blockReason.trim()) return "请先填写阻塞原因。";
  if (action === "submit-review" && !draft.submittedAt) return "请先填写送审日期。";
  if (action === "submit-review" && !draft.reviewTarget.trim()) return "请先填写送审对象。";
  if (action === "note" && !draft.note.trim()) return "请先填写备注。";
  if (action === "unblock" && !isBlockedStatus(task.status)) return "当前任务未标记阻塞。";
  return "";
}

function buildQuickTaskFactRequest(
  project: PrototypeProject,
  task: PrototypeTask,
  action: QuickTaskAction,
  operatorId: string,
  operatorName: string,
  draft: TaskOperationDraft,
): IntegrationRequest {
  const baseNote = draft.note.trim();

  if (action === "expected-finish") {
    return taskFactEventRequest(project, task, operatorId, operatorName, "task_expected_finish_updated", {
      expectedFinishDate: draft.expectedFinishDate,
      status: "进行中",
      ...(baseNote ? { note: baseNote } : {}),
    });
  }

  if (action === "block") {
    return taskFactEventRequest(project, task, operatorId, operatorName, "task_blocked", {
      status: "阻塞",
      blockReason: draft.blockReason.trim(),
      ...(draft.expectedFinishDate ? { expectedFinishDate: draft.expectedFinishDate } : {}),
      ...(baseNote ? { note: baseNote } : {}),
    });
  }

  if (action === "unblock") {
    return taskFactEventRequest(project, task, operatorId, operatorName, "task_unblocked", {
      status: "进行中",
      ...(draft.expectedFinishDate ? { expectedFinishDate: draft.expectedFinishDate } : {}),
      ...(baseNote ? { note: baseNote } : {}),
    });
  }

  if (action === "submit-review") {
    return taskFactEventRequest(project, task, operatorId, operatorName, "task_submitted_for_review", {
      submittedAt: draft.submittedAt,
      expectedFinishDate: draft.expectedFinishDate || draft.submittedAt,
      status: "送审中",
      reviewTarget: draft.reviewTarget.trim(),
      ...(baseNote ? { note: baseNote } : {}),
    });
  }

  return taskFactEventRequest(project, task, operatorId, operatorName, "task_note_updated", {
    status: task.status,
    note: baseNote,
  });
}

function summarizeIntegrationLog(log: IntegrationLog) {
  const failedExchange = log.exchanges.find((exchange) => !exchange.ok);
  if (failedExchange) {
    return `${failedExchange.label} 未成功，返回状态 ${failedExchange.status || "ERR"}；请展开下方接口详情查看原因。`;
  }

  const scheduleExchange = log.exchanges.find((exchange) => exchange.path.includes("/api/schedule/task-fact-events"));
  const modelingExchange = log.exchanges.find((exchange) => exchange.path.includes("/api/modeling/"));

  if (scheduleExchange) {
    const eventType = textOrUndefined(scheduleExchange.payload?.eventType) ?? "";
    const taskNo = numberOrUndefined(scheduleExchange.payload?.taskNo);
    const taskName = textOrUndefined(scheduleExchange.payload?.taskName);
    const taskLabel = taskNo ? `#${taskNo}${taskName ? ` ${taskName}` : ""}` : "当前任务";
    const projectTaskId = textOrUndefined(scheduleExchange.response.projectTaskId);
    const recalculation = isRecord(scheduleExchange.response.recalculation) ? scheduleExchange.response.recalculation : undefined;
    const recalculationStatus = textOrUndefined(recalculation?.status);
    const recalculationMessage = textOrUndefined(recalculation?.message);
    const recalculationText =
      recalculationStatus === "success"
        ? `已完成项目排期重算${textOrUndefined(scheduleExchange.response.scheduleRunId) ? `（批次 ${scheduleExchange.response.scheduleRunId}）` : ""}。`
        : recalculationStatus === "failed"
          ? `任务事实已写入，但重算失败：${recalculationMessage ?? "请联系中控检查排期内核"}。`
          : recalculationStatus === "skipped"
            ? `${recalculationMessage ?? "本次未触发重算"}。`
            : scheduleExchange.response.needsRecalculation === true
              ? "已标记需要重算。"
              : "";
    const projectTaskText = projectTaskId ? `任务记录：${projectTaskId}。` : "";
    const modelingText = modelingExchange ? "同时已通知建模排期。" : "";

    return `已发送给项目排期：${taskLabel} / ${operationEventLabel(eventType)}。${projectTaskText}${recalculationText}${modelingText}`;
  }

  if (modelingExchange) {
    return "已发送给建模排期，建模排期收到后负责维护建模状态和回传结果。";
  }

  return log.summary;
}

function applyTaskFactLogToScheduleRows(rows: ScheduleTaskRow[], log: IntegrationLog): ScheduleTaskRow[] {
  let nextRows = rows;

  for (const exchange of log.exchanges) {
    nextRows = applyTaskFactExchangeToScheduleRows(nextRows, exchange);
  }

  return nextRows;
}

function applyTaskFactExchangeToScheduleRows(rows: ScheduleTaskRow[], exchange: IntegrationExchange): ScheduleTaskRow[] {
  if (!exchange.ok || !exchange.path.includes("/api/schedule/task-fact-events") || !isRecord(exchange.payload)) {
    return rows;
  }

  const eventType = textOrUndefined(exchange.payload.eventType);
  const projectId = textOrUndefined(exchange.payload.projectId);
  const taskNo = numberOrUndefined(exchange.payload.taskNo);
  const payload = isRecord(exchange.payload.payload) ? exchange.payload.payload : {};
  const responseProjectTaskId = textOrUndefined(exchange.response.projectTaskId);

  if (!eventType || !projectId || !taskNo) {
    return rows;
  }

  let changed = false;
  const nextRows = rows.map((row) => {
    const matchesTask =
      row.projectId === projectId &&
      (row.taskNo === taskNo || (responseProjectTaskId && (row.projectTaskId === responseProjectTaskId || row.id === responseProjectTaskId)));

    if (!matchesTask) {
      return row;
    }

    changed = true;
    const nextProjectTaskId = responseProjectTaskId ?? row.projectTaskId;

    if (eventType === "task_started") {
      const actualStartDate = textOrUndefined(payload.actualStartDate) ?? row.actualStartDate;
      const status = textOrUndefined(payload.status) ?? "进行中";

      return {
        ...row,
        projectTaskId: nextProjectTaskId,
        actualStartDate,
        taskStatus: status,
        shouldStartLabel: status,
        impactStatus: status,
        inferredCompletedLabel: "",
        inferredCompletionDate: "",
      };
    }

    if (eventType === "task_completed") {
      const actualFinishDate = textOrUndefined(payload.actualFinishDate) ?? todayDateOnly();
      const actualStartDate = textOrUndefined(payload.actualStartDate) ?? row.actualStartDate;

      return {
        ...row,
        projectTaskId: nextProjectTaskId,
        actualStartDate,
        actualFinishDate,
        taskStatus: "已完成",
        shouldStartLabel: "已完成",
        impactStatus: "已完成",
        inferredCompletedLabel: "已完成",
        inferredCompletionDate: actualFinishDate,
        progressForecastFinishDate: actualFinishDate,
        calculatedFinishDate: actualFinishDate,
        riskLevel: "done" as RiskLevel,
        riskText: "产品组工作指引已记录任务完成事实。",
      };
    }

    if (eventType === "task_expected_finish_updated") {
      const expectedFinishDate = textOrUndefined(payload.expectedFinishDate) ?? row.expectedFinishDate;

      return {
        ...row,
        projectTaskId: nextProjectTaskId,
        expectedFinishDate,
        progressForecastFinishDate: expectedFinishDate || row.progressForecastFinishDate,
        calculatedFinishDate: expectedFinishDate || row.calculatedFinishDate,
        taskStatus: "进行中",
        shouldStartLabel: "进行中",
        impactStatus: "进行中",
        riskText: textOrUndefined(payload.note) ?? "产品组工作指引已更新预计完成日期。",
      };
    }

    if (eventType === "task_blocked") {
      const expectedFinishDate = textOrUndefined(payload.expectedFinishDate) ?? row.expectedFinishDate;

      return {
        ...row,
        projectTaskId: nextProjectTaskId,
        expectedFinishDate,
        taskStatus: "阻塞",
        shouldStartLabel: "阻塞",
        impactStatus: "阻塞",
        riskLevel: "delay" as RiskLevel,
        riskText: textOrUndefined(payload.blockReason) ?? textOrUndefined(payload.note) ?? "产品组工作指引已标记阻塞。",
      };
    }

    if (eventType === "task_unblocked") {
      const expectedFinishDate = textOrUndefined(payload.expectedFinishDate) ?? row.expectedFinishDate;

      return {
        ...row,
        projectTaskId: nextProjectTaskId,
        expectedFinishDate,
        taskStatus: "进行中",
        shouldStartLabel: "进行中",
        impactStatus: "进行中",
        riskLevel: "normal" as RiskLevel,
        riskText: textOrUndefined(payload.note) ?? "产品组工作指引已解除阻塞。",
      };
    }

    if (eventType === "task_submitted_for_review") {
      const expectedFinishDate = textOrUndefined(payload.expectedFinishDate) ?? row.expectedFinishDate;

      return {
        ...row,
        projectTaskId: nextProjectTaskId,
        expectedFinishDate,
        taskStatus: "送审中",
        shouldStartLabel: "送审中",
        impactStatus: "送审中",
        riskText: textOrUndefined(payload.note) ?? `产品组工作指引已记录送审：${textOrUndefined(payload.reviewTarget) ?? "审核方"}。`,
      };
    }

    if (eventType === "task_note_updated") {
      return {
        ...row,
        projectTaskId: nextProjectTaskId,
        taskStatus: textOrUndefined(payload.status) ?? row.taskStatus,
        riskText: textOrUndefined(payload.note) ?? row.riskText,
      };
    }

    return row;
  });

  return changed ? nextRows : rows;
}

function createPrototypeRequestId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `product-guide:prototype:${prefix}:${id}`;
}

function todayDateOnly() {
  return chinaNowIso().slice(0, 10);
}

function occurredAtWithChinaOffset() {
  return `${chinaNowIso().slice(0, 19)}+08:00`;
}

function chinaNowIso() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
}

function buildProjectsFromScheduleData(data: ProductGuidePrototypeScheduleData): PrototypeProject[] {
  const tasksByProjectId = groupBy(data.scheduleTasks, (task) => task.projectId);
  const cardsByProjectId = groupBy(data.projectCards, (card) => card.projectId);
  const stylesByProjectId = groupBy(data.productGuideStyleSummaries ?? [], (style) => style.projectId);
  const projectIds = uniqueStrings([...data.scheduleTasks.map((task) => task.projectId), ...data.projectCards.map((card) => card.projectId), ...Object.keys(data.projectDetails)]);

  return projectIds
    .map((projectId) => {
      const taskRows = tasksByProjectId.get(projectId) ?? [];
      const cards = cardsByProjectId.get(projectId) ?? [];
      const detail = data.projectDetails[projectId];
      const master = data.productGuideProjectMasters?.[projectId];
      const firstTask = taskRows[0];
      const planned = buildMilestoneMonthMap(cards, "planned");
      const forecast = buildMilestoneMonthMap(cards, "forecast");
      const productOwner = businessText(master?.projectOwnerName, detail?.owner, "待补充产品研发");
      const artOwner = businessText(master?.artOwnerName, detail?.artOwner, "待补充产品美术");
      const tasks = taskRows.map((task) => scheduleTaskToPrototypeTask(task, { productOwner, artOwner }));
      const currentTask = detail?.currentTask ?? firstActionableTask(tasks)?.name ?? "待同步";
      const currentTaskRow = tasks.find((task) => task.name === currentTask) ?? firstActionableTask(tasks);
      const risk = normalizeRiskLevel(detail?.riskLevel ?? worstRisk(tasks));
      const styles = (stylesByProjectId.get(projectId) ?? []).map(styleSummaryToPrototypeStyle);
      const modelingProgress = detail?.modelingProgress ?? modelingProgressFromStyles(styles);

      return {
        id: projectId,
        name: master?.projectName ?? detail?.name ?? firstTask?.projectName ?? cards[0]?.name ?? projectId,
        code: master?.projectCode ?? firstTask?.projectCode ?? projectId,
        team: businessText(master?.projectTeamName, detail?.projectTeam, "待补充项目组"),
        productOwner,
        artOwner,
        licensor: businessText(master?.licensorName, undefined, "待补充版权方"),
        ip: businessText(master?.ipName, undefined, "待补充 IP"),
        productType: businessText(master?.productType, master?.productLine, "待补充品类"),
        status: firstTask?.projectStage || "项目排期",
        plannedLaunch: firstTask?.plannedLaunchDate || detail?.plannedFinish || "-",
        forecastLaunch: firstTask?.forecastLaunchDate || detail?.forecastFinish || "-",
        progress: detail?.progressPercent ?? projectProgressFromTasks(tasks),
        modelingProgress,
        currentMilestone: currentTaskRow?.milestone ?? cards[0]?.milestone ?? "待同步",
        currentTask,
        riskLabel: riskLabelFromLevel(risk),
        riskMessage: detail?.riskMessage ?? currentTaskRow?.reason ?? "项目排期未返回风险说明。",
        planned,
        forecast,
        tasks,
        styles,
        updates: [`任务来源：项目排期 / ${data.sourceLabel}`, master ? "项目基础信息来源：Project 主数据" : "项目基础信息待项目主数据补齐"],
      } satisfies PrototypeProject;
    })
    .filter((project) => project.tasks.length > 0 || Object.keys(project.planned).length > 0 || Object.keys(project.forecast).length > 0)
    .sort((a, b) => a.plannedLaunch.localeCompare(b.plannedLaunch, "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
}

function scheduleTaskToPrototypeTask(row: ScheduleTaskRow, owners: { productOwner: string; artOwner: string }): PrototypeTask {
  const actualStart = textOrUndefined(row.actualStartDate);
  const actualFinish = textOrUndefined(row.actualFinishDate) ?? textOrUndefined(row.inferredCompletionDate);
  const plannedStart = textOrDash(row.plannedStartDate || row.originalLatestStartDate);
  const forecastStart = textOrDash(row.progressForecastStartDate || row.calculatedStartDate || row.latestStartDate || row.plannedStartDate);
  const plannedFinish = textOrDash(row.plannedFinishDate || row.currentDdlDate);
  const forecastFinish = textOrDash(row.progressForecastFinishDate || row.calculatedFinishDate || row.expectedFinishDate || row.currentDdlDate);
  const expectedFinish = textOrDash(row.expectedFinishDate || row.progressForecastFinishDate || row.calculatedFinishDate || row.currentDdlDate);
  const ddl = textOrDash(row.currentDdlDate || row.latestFinishDate || row.plannedFinishDate);
  const delayLine = textOrDash(row.latestFinishDate || row.originalLatestFinishDate || row.currentDdlDate);
  const risk = normalizeRiskLevel(row.riskLevel);

  return {
    id: row.id,
    projectTaskId: textOrUndefined(row.projectTaskId),
    no: row.taskNo,
    name: row.taskName || `任务 ${row.taskNo}`,
    milestone: row.milestoneType || milestoneByTaskNoLabel(row.taskNo),
    owner: ownerForTaskNo(row.taskNo, owners),
    plannedStart,
    forecastStart,
    plannedFinish,
    forecastFinish,
    expectedFinish,
    actualStart,
    actualFinish,
    status: row.taskStatus || row.impactStatus || row.inferredCompletedLabel || "待同步",
    risk,
    ddl,
    delayLine,
    reason: row.riskText || row.impactStatus || row.shouldStartLabel || "项目排期未返回判断依据。",
    missingPredecessors: parseMissingPredecessors(row.missingActualPredecessorIds),
    missingPredecessorIds: parseMissingPredecessorIds(row.missingActualPredecessorIds),
  };
}

function styleSummaryToPrototypeStyle(summary: ProductGuideStyleSummary): PrototypeStyle {
  const feedback = [
    summary.difficulty ? `难度 ${summary.difficulty}` : "",
    summary.estimatedWorkdays ? `预计 ${summary.estimatedWorkdays} 天` : "",
    summary.originalArtApprovedDate ? `原画过审 ${summary.originalArtApprovedDate}` : "",
    summary.lastUpdatedAt ? `更新 ${summary.lastUpdatedAt}` : "",
  ].filter(Boolean);

  return {
    modelingTaskId: summary.modelingTaskId,
    styleCode: summary.styleCode,
    sequence: summary.styleSequence || summary.styleCode || summary.id,
    name: summary.styleName,
    isFirst: summary.isFirstModelingStyle === true,
    required: summary.isRequired,
    status: summary.status || "待同步",
    owner: summary.modelingTaskId ? "建模排期维护" : "待建模确认",
    latestFeedback: feedback.length > 0 ? feedback.join(" / ") : "建模排期未返回更多说明。",
    referenceImageCount: summary.referenceImageUrls?.length ?? 0,
    referenceImageUrls: summary.referenceImageUrls,
  };
}

function businessText(primary: string | undefined, secondary: string | undefined, fallback: string) {
  const value = textOrUndefined(primary) ?? textOrUndefined(secondary);
  if (!value || value === "项目排期未返回") return fallback;
  return value;
}

function ownerForTaskNo(taskNo: number, owners: { productOwner: string; artOwner: string }) {
  if (taskNo >= 4 && taskNo <= 10) return owners.artOwner;
  return owners.productOwner;
}

function styleSummariesFromSubmissionResponse(
  project: PrototypeProject,
  rows: StyleListDraftRow[],
  response: Record<string, unknown>,
): ProductGuideStyleSummary[] {
  const responseStyles = Array.isArray(response.styles) ? response.styles.filter(isRecord) : [];
  const styleSubmissionBatchId = textOrUndefined(response.styleSubmissionBatchId);
  const styleSubmissionVersion = numberOrUndefined(response.styleSubmissionVersion);

  return responseStyles.map((style, index) => {
    const sequence = textOrUndefined(style.styleSequence) ?? String(index + 1);
    const matchingRow =
      rows.find((row) => row.styleSequence.trim() === sequence) ??
      rows.find((row) => row.styleName.trim() === textOrUndefined(style.styleName)) ??
      rows[index] ??
      createStyleDraftRow(project, index + 1, style.isFirstModelingStyle === true);

    return {
      id: textOrUndefined(style.modelingTaskId) ?? textOrUndefined(style.sourceStyleId) ?? `${project.id}:style:${sequence}`,
      modelingTaskId: textOrUndefined(style.modelingTaskId),
      sourceStyleId: textOrUndefined(style.sourceStyleId),
      styleSubmissionBatchId,
      styleSubmissionVersion,
      projectId: project.id,
      projectTaskId: textOrUndefined(style.projectTaskId) ?? (matchingRow.isFirstModelingStyle ? project.tasks.find((task) => task.no === 7)?.projectTaskId : project.tasks.find((task) => task.no === 10)?.projectTaskId) ?? "",
      styleCode: textOrUndefined(style.styleCode) ?? productGuideStyleCode(project, sequence),
      styleName: textOrUndefined(style.styleName) ?? matchingRow.styleName.trim() ?? `款式 ${sequence}`,
      styleSequence: sequence,
      isFirstModelingStyle: style.isFirstModelingStyle === true,
      isRequired: matchingRow.isRequired,
      referenceImageUrls: referenceImagesForStyleRow(matchingRow),
      originalArtStatus: "已过审",
      originalArtApprovedDate: matchingRow.originalArtApprovedDate,
      difficulty: matchingRow.difficulty.trim(),
      estimatedWorkdays: Number(matchingRow.estimatedWorkdays),
      status: textOrUndefined(style.modelingStatus) ?? "待确认",
      lastUpdatedAt: todayDateOnly(),
    };
  });
}

function mergeProductGuideStyleSummaries(current: ProductGuideStyleSummary[], incoming: ProductGuideStyleSummary[]) {
  const byKey = new Map(current.map((style) => [styleSummaryKey(style), style]));

  for (const style of incoming) {
    byKey.set(styleSummaryKey(style), style);
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.projectId.localeCompare(b.projectId) ||
      Number(a.isFirstModelingStyle === true ? 0 : 1) - Number(b.isFirstModelingStyle === true ? 0 : 1) ||
      (a.styleSequence ?? a.styleCode).localeCompare(b.styleSequence ?? b.styleCode, "zh-CN"),
  );
}

function styleSummaryKey(style: ProductGuideStyleSummary) {
  return style.modelingTaskId || style.sourceStyleId || `${style.projectId}:${style.projectTaskId}:${style.styleCode}`;
}

function modelingProgressFromStyles(styles: PrototypeStyle[]): PrototypeProject["modelingProgress"] {
  const requiredStyles = styles.filter((style) => style.required);
  const total = requiredStyles.length;

  return {
    total,
    approved: requiredStyles.filter((style) => style.status.includes("通过")).length,
    inProgress: requiredStyles.filter((style) => style.status.includes("建模") || style.status.includes("修改") || style.status.includes("排期")).length,
    submitted: requiredStyles.filter((style) => style.status.includes("送审") || style.status.includes("反馈") || style.status.includes("验收")).length,
    outsourced: requiredStyles.filter((style) => style.status.includes("外包")).length,
    unassigned: requiredStyles.filter((style) => style.status.includes("未分配") || style.status.includes("待确认") || style.status.includes("退回")).length,
  };
}

function buildGuideTasksFromProjects(projects: PrototypeProject[]): GuideTask[] {
  const week = currentNaturalWeek();
  const rows: GuideTask[] = [];

  for (const project of projects) {
    for (const task of project.tasks) {
      if (isDoneStatus(task.status)) continue;

      const baseTask = {
        projectId: project.id,
        taskNo: task.no,
        taskName: task.name,
        ddl: task.ddl,
        delayLine: task.delayLine,
      };
      const isRiskTask = task.risk === "delay" || task.risk === "risk";
      const isLicensorTask = hasLicensorSignal(task);

      if (isRiskTask) {
        rows.push({ ...baseTask, bucket: "risk", sortDate: firstDateText(task.ddl, task.delayLine, task.forecastFinish) });
      }

      if (isLicensorTask) {
        rows.push({ ...baseTask, bucket: "licensor", sortDate: firstDateText(task.ddl, task.delayLine, task.forecastFinish) });
      }

      if (isDueThisWeek(task, week)) {
        rows.push({ ...baseTask, bucket: "due", sortDate: firstDateText(task.ddl, task.expectedFinish, task.forecastFinish) });
      } else if (shouldStartThisWeek(task, week)) {
        rows.push({ ...baseTask, bucket: "start", sortDate: firstDateText(task.forecastStart, task.plannedStart) });
      } else if (isProgressThisWeek(task, week)) {
        rows.push({ ...baseTask, bucket: "progress", sortDate: firstDateText(task.forecastFinish, task.ddl, task.delayLine) });
      }
    }
  }

  return rows.sort(sortGuideTasks).slice(0, 160);
}

function buildReturnMessages(): ReturnMessage[] {
  const rows: ReturnMessage[] = [];

  rows.push({
    id: "msg-future-schedule",
    sourceModule: "项目排期",
    title: "排期重算结果回传",
    target: "reserved",
    projectName: "后续预留",
    summary: "后续项目排期、版权、工厂等模块的回传通知也进入这里。",
    receivedAt: "-",
    status: "预留",
  });

  return rows;
}

async function fetchModelingReturnMessages(projects: PrototypeProject[]) {
  const response = await fetch("/api/modeling/product-guide-events?limit=100", { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  const events = isRecord(result) && Array.isArray(result.events) ? result.events : [];

  return modelingEventsToReturnMessages(events.filter(isModelingProductGuideEvent), projects);
}

function modelingEventsToReturnMessages(events: ModelingProductGuideEvent[], projects: PrototypeProject[]): ReturnMessage[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return events.map((event) => {
    const payload = isRecord(event.payload) ? event.payload : {};
    const project = projectById.get(event.projectId);
    const projectTaskId = textOrUndefined(payload.projectTaskId) ?? event.projectTaskId ?? undefined;
    const task = project?.tasks.find((item) => item.projectTaskId === projectTaskId || item.id === projectTaskId);
    const projectName = textOrUndefined(payload.projectName) ?? project?.name ?? event.projectId;
    const receivedAt = formatDisplayDateTime(event.occurredAt);

    if (event.eventType === "modeling_work_submitted") {
      return {
        id: event.eventId,
        eventType: event.eventType,
        sourceModule: "建模排期",
        title: "建模成果已提交",
        target: "approval",
        projectId: event.projectId,
        projectTaskId,
        taskNo: task?.no,
        projectName,
        styleName: textOrUndefined(payload.styleName),
        modelingTaskId: textOrUndefined(payload.modelingTaskId) ?? event.modelingTaskId ?? undefined,
        reviewRound: numberOrUndefined(payload.reviewRound),
        submissionFeedbackId: textOrUndefined(payload.submissionFeedbackId) ?? textOrUndefined(payload.feedbackId),
        feedbackId: textOrUndefined(payload.feedbackId),
        deliverableUrls: stringArray(payload.deliverableUrls),
        summary: textOrUndefined(payload.content) ?? "建模排期提交了建模成果，需要产品研发美术审批。",
        receivedAt,
        status: event.status === "consumed" ? "已处理" : "待处理",
      } satisfies ReturnMessage;
    }

    if (event.eventType === "style_list_returned") {
      const firstStyle = firstStylePayload(payload);
      return {
        id: event.eventId,
        eventType: event.eventType,
        sourceModule: "建模排期",
        title: "款式清单退回补充",
        target: firstStyle?.taskNo ? "task" : "project",
        projectId: event.projectId,
        projectTaskId: firstStyle?.projectTaskId,
        taskNo: firstStyle?.taskNo,
        projectName,
        styleName: firstStyle?.styleName,
        modelingTaskId: firstStyle?.modelingTaskId,
        summary: textOrUndefined(payload.returnReason) ?? "建模排期退回款式清单，需要产品组补充完整系列后重新提交。",
        receivedAt,
        status: event.status === "consumed" ? "已处理" : "待处理",
      } satisfies ReturnMessage;
    }

    const firstStyle = firstStylePayload(payload);
    return {
      id: event.eventId,
      eventType: event.eventType,
      sourceModule: "建模排期",
      title: "款式清单已确认",
      target: firstStyle?.taskNo ? "task" : "project",
      projectId: event.projectId,
      projectTaskId: firstStyle?.projectTaskId,
      taskNo: firstStyle?.taskNo,
      projectName,
      styleName: firstStyle?.styleName,
      modelingTaskId: firstStyle?.modelingTaskId,
      summary: `建模排期已确认 ${numberOrUndefined(payload.confirmedStyleCount) ?? 0} 个款式，并返回正式建模任务映射。`,
      receivedAt,
      status: event.status === "consumed" ? "已处理" : "待处理",
    } satisfies ReturnMessage;
  });
}

function isModelingProductGuideEvent(value: unknown): value is ModelingProductGuideEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.eventId === "string" &&
    (value.eventType === "style_list_confirmed" || value.eventType === "style_list_returned" || value.eventType === "modeling_work_submitted") &&
    typeof value.projectId === "string"
  );
}

function firstStylePayload(payload: Record<string, unknown>) {
  const styles = Array.isArray(payload.styles) ? payload.styles.filter(isRecord) : [];
  const first = styles.find((style) => style.isFirstModelingStyle === true) ?? styles[0];
  if (!first) return null;

  return {
    projectTaskId: textOrUndefined(first.projectTaskId),
    taskNo: numberOrUndefined(first.taskNo),
    styleName: textOrUndefined(first.styleName),
    modelingTaskId: textOrUndefined(first.modelingTaskId),
  };
}

function buildMilestoneMonthMap(cards: ProjectCard[], mode: "planned" | "forecast") {
  const result: Record<string, string> = {};

  for (const card of cards) {
    result[card.milestone] = mode === "planned" ? card.plannedMonth ?? card.month : card.forecastMonth ?? card.month;
  }

  return result;
}

function groupBy<T>(items: T[], keyForItem: (item: T) => string) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyForItem(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return groups;
}

function uniqueStrings(items: Array<string | undefined | null>) {
  return [...new Set(items.filter((item): item is string => Boolean(item)))];
}

function normalizeRiskLevel(value?: string | null): RiskLevel {
  if (value === "done" || value === "doneLate" || value === "normal" || value === "risk" || value === "delay") return value;
  if (value?.includes("完成") && value.includes("延期")) return "doneLate";
  if (value?.includes("完成")) return "done";
  if (value?.includes("必然") || value?.includes("严重")) return "delay";
  if (value?.includes("风险") || value?.includes("延期")) return "risk";
  return "normal";
}

function riskLabelFromLevel(level: RiskLevel) {
  const labels: Record<RiskLevel, string> = {
    done: "已完成",
    doneLate: "延期完成",
    normal: "正常推进",
    risk: "延期风险",
    delay: "必然延期",
  };

  return labels[level];
}

function worstRisk(tasks: PrototypeTask[]) {
  if (tasks.some((task) => task.risk === "delay")) return "delay";
  if (tasks.some((task) => task.risk === "risk")) return "risk";
  if (tasks.every((task) => isDoneStatus(task.status)) && tasks.length > 0) return "done";
  return "normal";
}

function firstActionableTask(tasks: PrototypeTask[]) {
  return tasks.find((task) => task.risk === "delay" || task.risk === "risk") ?? tasks.find((task) => !isDoneStatus(task.status)) ?? tasks[0];
}

function projectProgressFromTasks(tasks: PrototypeTask[]) {
  if (tasks.length === 0) return 0;

  return Math.round((tasks.filter((task) => isDoneStatus(task.status)).length / tasks.length) * 100);
}

function currentNaturalWeek(today = new Date()) {
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);

  return { start, end };
}

function hasLicensorSignal(task: PrototypeTask) {
  const text = `${task.name}${task.status}${task.reason}`;
  return text.includes("版权") || text.includes("反馈") || text.includes("送审") || text.includes("等反馈");
}

function isDueThisWeek(task: PrototypeTask, week: { start: Date; end: Date }) {
  return [task.ddl, task.expectedFinish, task.forecastFinish, task.plannedFinish].some((dateText) =>
    isDateTextInRange(dateText, week.start, week.end),
  );
}

function shouldStartThisWeek(task: PrototypeTask, week: { start: Date; end: Date }) {
  if (!task.status.includes("未开始") && !task.status.includes("待")) return false;
  return [task.forecastStart, task.plannedStart].some((dateText) => isDateTextInRange(dateText, week.start, week.end));
}

function isProgressThisWeek(task: PrototypeTask, week: { start: Date; end: Date }) {
  if (!task.status.includes("进行") && !task.status.includes("推进") && !task.status.includes("送审")) return false;

  const start = firstDate(task.forecastStart, task.plannedStart);
  const end = firstDate(task.forecastFinish, task.expectedFinish, task.ddl);

  if (!start && !end) return true;
  return (!start || start <= week.end) && (!end || end >= week.start);
}

function isDateTextInRange(value: string, start: Date, end: Date) {
  const date = parseDateText(value);
  return Boolean(date && date >= start && date <= end);
}

function firstDate(...values: string[]) {
  for (const value of values) {
    const date = parseDateText(value);
    if (date) return date;
  }

  return null;
}

function firstDateText(...values: string[]) {
  return values.find((value) => Boolean(parseDateText(value))) ?? "-";
}

function parseDateText(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function sortGuideTasks(a: GuideTask, b: GuideTask) {
  const bucketOrder: Record<GuideTask["bucket"], number> = {
    due: 0,
    progress: 1,
    start: 2,
    risk: 3,
    licensor: 4,
  };
  const order = bucketOrder[a.bucket] - bucketOrder[b.bucket];
  if (order !== 0) return order;

  const dateOrder = compareDateText(a.sortDate, b.sortDate);
  if (dateOrder !== 0) return dateOrder;

  return a.taskNo - b.taskNo;
}

function compareDateText(a: string, b: string) {
  const aDate = parseDateText(a);
  const bDate = parseDateText(b);
  if (aDate && bDate) return aDate.getTime() - bDate.getTime();
  if (aDate) return -1;
  if (bDate) return 1;
  return 0;
}

function isDoneStatus(status: string) {
  return status.includes("完成") || status.includes("已通过") || status.toLowerCase() === "done";
}

function isCancelledStatus(status: string) {
  return status.includes("取消") || status.toLowerCase() === "cancelled";
}

function isBlockedStatus(status: string) {
  return status.includes("阻塞");
}

function isPausedStatus(status: string) {
  return status.includes("暂停");
}

function isStartedStatus(task: PrototypeTask) {
  if (task.actualStart) return true;
  if (task.status.includes("未开始") || task.status.includes("待确认") || task.status.includes("待同步")) return false;
  return task.status.includes("进行中") || task.status.includes("送审") || task.status.includes("阻塞") || task.status.includes("暂停");
}

function parseMissingPredecessors(value?: unknown) {
  const raw = textOrUndefined(value);
  if (!raw || raw === "[]" || raw === "否" || raw === "无" || raw.toLowerCase() === "false") return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(missingPredecessorLabel).filter((item): item is string => Boolean(item));
    }
  } catch {
    // Schedule rows may return a plain text description instead of JSON.
  }

  return raw
    .split(/[、,，;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMissingPredecessorIds(value?: unknown) {
  const raw = textOrUndefined(value);
  if (!raw || raw === "[]" || raw === "否" || raw === "无" || raw.toLowerCase() === "false") return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(missingPredecessorId).filter((item): item is string => Boolean(item));
    }
  } catch {
    // Schedule rows may return a plain text description instead of JSON.
  }

  return raw
    .split(/[、,，;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function missingPredecessorLabel(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!isRecord(value)) return "";

  return (
    textOrUndefined(value.taskName) ??
    textOrUndefined(value.name) ??
    textOrUndefined(value.taskKey) ??
    (numberOrUndefined(value.taskNo) ? `#${numberOrUndefined(value.taskNo)}` : undefined) ??
    textOrUndefined(value.id) ??
    ""
  );
}

function missingPredecessorId(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!isRecord(value)) return "";

  return (
    textOrUndefined(value.projectTaskId) ??
    textOrUndefined(value.taskId) ??
    textOrUndefined(value.id) ??
    textOrUndefined(value.taskKey) ??
    (numberOrUndefined(value.taskNo) ? `#${numberOrUndefined(value.taskNo)}` : undefined) ??
    ""
  );
}

function textOrUndefined(value?: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

function textOrDash(value?: unknown) {
  return textOrUndefined(value) ?? "-";
}

function numberOrUndefined(value?: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function stringArray(value?: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : undefined;
}

function parseUrlList(value: string) {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDisplayDateTime(value?: string) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function milestoneByTaskNoLabel(taskNo: number) {
  if (taskNo <= 6) return "原画里程碑";
  if (taskNo <= 13) return "建模里程碑";
  if (taskNo <= 18) return "红蜡里程碑";
  if (taskNo <= 22) return "平面里程碑";
  if (taskNo <= 26) return "产前里程碑";
  return "大货里程碑";
}

const emptyTask: PrototypeTask = {
  id: "empty-task",
  projectTaskId: undefined,
  no: 0,
  name: "项目排期未返回任务",
  milestone: "待同步",
  owner: "待同步",
  plannedStart: "-",
  forecastStart: "-",
  plannedFinish: "-",
  forecastFinish: "-",
  expectedFinish: "-",
  actualStart: undefined,
  actualFinish: undefined,
  status: "待同步",
  risk: "normal",
  ddl: "-",
  delayLine: "-",
  reason: "当前项目排期没有返回可操作任务。",
  missingPredecessors: [],
  missingPredecessorIds: [],
};

const emptyProject: PrototypeProject = {
  id: "empty",
  name: "项目排期未返回项目",
  code: "-",
  team: "无任务",
  productOwner: "-",
  artOwner: "-",
  licensor: "-",
  ip: "-",
  productType: "-",
  status: "待同步",
  plannedLaunch: "-",
  forecastLaunch: "-",
  progress: 0,
  modelingProgress: {
    approved: 0,
    total: 0,
    inProgress: 0,
    submitted: 0,
    outsourced: 0,
    unassigned: 0,
  },
  currentMilestone: "-",
  currentTask: "-",
  riskLabel: "正常推进",
  riskMessage: "当前没有可展示的项目排期任务。",
  planned: {},
  forecast: {},
  tasks: [],
  styles: [],
  updates: ["等待项目排期返回任务清单"],
};

export function ProductGuidePrototype({
  currentUser,
  currentUserId,
  currentUserName,
  currentUserRole,
  scheduleData,
  formal = false,
}: {
  currentUser: AuthUser;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  scheduleData: ProductGuidePrototypeScheduleData;
  formal?: boolean;
}) {
  const [activePage, setActivePage] = useState<PageKey>("workbench");
  const [workbenchPage, setWorkbenchPage] = useState<WorkbenchPageKey>("task");
  const [activeTeam, setActiveTeam] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskNo, setSelectedTaskNo] = useState(0);
  const [riskOnly, setRiskOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [localScheduleTasks, setLocalScheduleTasks] = useState<ScheduleTaskRow[]>(() => scheduleData.scheduleTasks);
  const [localStyleSummaries, setLocalStyleSummaries] = useState<ProductGuideStyleSummary[]>(() => scheduleData.productGuideStyleSummaries ?? []);
  const effectiveScheduleData = useMemo(
    () => ({
      ...scheduleData,
      scheduleTasks: localScheduleTasks,
      productGuideStyleSummaries: localStyleSummaries,
    }),
    [localScheduleTasks, localStyleSummaries, scheduleData],
  );
  const projects = useMemo(() => buildProjectsFromScheduleData(effectiveScheduleData), [effectiveScheduleData]);
  const teamOptions = useMemo(() => uniqueStrings(projects.map((project) => project.team)), [projects]);
  const effectiveTeam = activeTeam || teamOptions[0] || "无任务";
  const boardMonths = scheduleData.months.length > 0 ? scheduleData.months : fallbackMonths;
  const boardMilestones = scheduleData.milestones.length > 0 ? scheduleData.milestones : milestones;
  const guideTasks = useMemo(() => buildGuideTasksFromProjects(projects), [projects]);
  const fallbackReturnMessages = useMemo(() => buildReturnMessages(), []);
  const [liveReturnMessages, setLiveReturnMessages] = useState<ReturnMessage[]>([]);
  const [handledReturnMessageIds, setHandledReturnMessageIds] = useState<string[]>([]);
  const [returnMessageSource, setReturnMessageSource] = useState("正在读取建模回传");
  const returnMessages = useMemo(() => {
    const baseMessages =
      liveReturnMessages.length > 0
        ? [...liveReturnMessages, ...fallbackReturnMessages.filter((message) => message.status === "预留")]
        : fallbackReturnMessages;

    if (handledReturnMessageIds.length === 0) {
      return baseMessages;
    }

    const handledIds = new Set(handledReturnMessageIds);

    return baseMessages.map((message) => (handledIds.has(message.id) ? { ...message, status: "已处理" as const } : message));
  }, [fallbackReturnMessages, handledReturnMessageIds, liveReturnMessages]);

  function markReturnMessageHandled(messageId: string) {
    setHandledReturnMessageIds((current) => (current.includes(messageId) ? current : [...current, messageId]));
  }

  const teamProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesTeam = project.team === effectiveTeam;
        const matchesSearch = !search.trim() || project.name.includes(search.trim()) || project.code.includes(search.trim());
        const matchesRisk = !riskOnly || project.riskLabel.includes("延期") || project.riskLabel.includes("风险") || project.riskLabel.includes("后移");

        return matchesTeam && matchesSearch && matchesRisk;
      }),
    [effectiveTeam, projects, riskOnly, search],
  );
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? teamProjects[0] ?? projects[0] ?? emptyProject;
  const selectedTask =
    selectedProject.tasks.find((task) => task.no === selectedTaskNo) ??
    selectedProject.tasks.find((task) => !isDoneStatus(task.status)) ??
    selectedProject.tasks[0] ??
    emptyTask;
  const visibleGuideTasks = guideTasks.filter((task) => teamProjects.some((project) => project.id === task.projectId));
  const teamProjectCards = useMemo(() => {
    const visibleProjectIds = new Set(teamProjects.map((project) => project.id));
    return scheduleData.projectCards.filter((card) => visibleProjectIds.has(card.projectId));
  }, [scheduleData.projectCards, teamProjects]);

  useEffect(() => {
    let cancelled = false;

    fetchModelingReturnMessages(projects)
      .then((messages) => {
        if (cancelled) return;
        setLiveReturnMessages(messages);
        setReturnMessageSource(messages.length > 0 ? "建模排期真实回传" : "暂无真实回传");
      })
      .catch(() => {
        if (cancelled) return;
        setLiveReturnMessages([]);
        setReturnMessageSource("建模回传读取失败");
      });

    return () => {
      cancelled = true;
    };
  }, [projects]);

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setActivePage("detail");
  }

  function openTask(projectId: string, taskNo: number) {
    setSelectedProjectId(projectId);
    setSelectedTaskNo(taskNo);
    setWorkbenchPage("task");
    setActivePage("workbench");
  }

  function mergeSubmittedStyles(styles: ProductGuideStyleSummary[]) {
    setLocalStyleSummaries((current) => mergeProductGuideStyleSummaries(current, styles));
  }

  function mergeTaskFactLog(log: IntegrationLog) {
    setLocalScheduleTasks((current) => applyTaskFactLogToScheduleRows(current, log));
  }

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[232px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-4 py-5 max-lg:border-b max-lg:border-r-0">
          <div className="border-b border-slate-200 pb-4">
            <div className="text-lg font-semibold">产品组工作指引</div>
            <div className="mt-1 text-sm text-slate-500">{formal ? "正式工作页" : `五页原型 · ${currentUserName}`}</div>
          </div>
          <div className="mt-4 grid gap-2">
            {pages.map((page) => {
              const Icon = page.icon;

              return (
                <button
                  key={page.key}
                  type="button"
                  onClick={() => setActivePage(page.key)}
                  className={clsx(
                    "flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition",
                    activePage === page.key ? "bg-rose-50 text-rose-700" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Icon size={16} />
                  {page.label}
                </button>
              );
            })}
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="mb-2 px-1 text-xs font-medium text-slate-500">其他模块</div>
            <AppSideNav currentPath="/product-guide" currentUser={currentUser} />
          </div>
          <div className="mt-5 rounded-lg border border-slate-200 p-3">
            <div className="text-xs font-medium text-slate-500">项目组</div>
            <select
              value={effectiveTeam}
              onChange={(event) => setActiveTeam(event.target.value)}
              className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            >
              {(teamOptions.length > 0 ? teamOptions : ["无任务"]).map((team) => (
                <option key={team}>{team}</option>
              ))}
            </select>
          </div>
        </aside>

        <main className="min-w-0 px-6 py-5 max-md:px-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{pages.find((page) => page.key === activePage)?.label}</h1>
              <div className="mt-1 text-sm text-slate-500">{effectiveTeam} / {teamProjects.length} 个项目 / 任务来自项目排期：{scheduleData.sourceLabel}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索项目"
                  className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                />
              </label>
              <button
                type="button"
                onClick={() => setRiskOnly((value) => !value)}
                className={clsx(
                  "h-9 rounded-lg border px-3 text-sm font-semibold",
                  riskOnly ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600",
                )}
              >
                只看风险
              </button>
            </div>
          </header>

          <div className="mt-5">
            {activePage === "workbench" ? (
              <WorkbenchPage
                projects={teamProjects}
                guideTasks={visibleGuideTasks}
                selectedProject={selectedProject}
                selectedTask={selectedTask}
                workbenchPage={workbenchPage}
                returnMessages={returnMessages}
                returnMessageSource={returnMessageSource}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserRole={currentUserRole}
                setWorkbenchPage={setWorkbenchPage}
                onOpenProject={openProject}
                onOpenTask={openTask}
                onModelingStylesSubmitted={mergeSubmittedStyles}
                onTaskFactLog={mergeTaskFactLog}
                onReturnMessageHandled={markReturnMessageHandled}
                setActivePage={setActivePage}
              />
            ) : null}
            {activePage === "plan" ? <MilestoneBoard mode="plan" months={boardMonths} milestones={boardMilestones} cards={teamProjectCards} onOpenProject={openProject} /> : null}
            {activePage === "forecast" ? <MilestoneBoard mode="forecast" months={boardMonths} milestones={boardMilestones} cards={teamProjectCards} onOpenProject={openProject} /> : null}
            {activePage === "week" ? <WeekGuidePage tasks={visibleGuideTasks} projects={projects} onOpenTask={openTask} /> : null}
            {activePage === "detail" ? <ProjectDetailPage project={selectedProject} setActivePage={setActivePage} onOpenTask={openTask} /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
function WorkbenchPage({
  projects,
  guideTasks,
  selectedProject,
  selectedTask,
  workbenchPage,
  returnMessages,
  returnMessageSource,
  currentUserId,
  currentUserName,
  currentUserRole,
  setWorkbenchPage,
  onOpenProject,
  onOpenTask,
  onModelingStylesSubmitted,
  onTaskFactLog,
  onReturnMessageHandled,
  setActivePage,
}: {
  projects: PrototypeProject[];
  guideTasks: GuideTask[];
  selectedProject: PrototypeProject;
  selectedTask: PrototypeTask;
  workbenchPage: WorkbenchPageKey;
  returnMessages: ReturnMessage[];
  returnMessageSource: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  setWorkbenchPage: (page: WorkbenchPageKey) => void;
  onOpenProject: (projectId: string) => void;
  onOpenTask: (projectId: string, taskNo: number) => void;
  onModelingStylesSubmitted: (styles: ProductGuideStyleSummary[]) => void;
  onTaskFactLog: (log: IntegrationLog) => void;
  onReturnMessageHandled: (messageId: string) => void;
  setActivePage: (page: PageKey) => void;
}) {
  const [selectedApprovalMessageId, setSelectedApprovalMessageId] = useState("");
  const [operationDraft, setOperationDraft] = useState<TaskOperationDraft>(() => defaultTaskOperationDraft("", emptyTask));
  const allVisibleTasks = projects
    .flatMap((project) => project.tasks.filter((task) => !isDoneStatus(task.status)).map((task) => ({ project, task })))
    .sort((a, b) => a.task.no - b.task.no);
  const visibleMessages = returnMessages.filter((message) => !message.projectId || projects.some((project) => project.id === message.projectId));
  const approvalMessages = visibleMessages.filter((message) => message.target === "approval");
  const pendingApprovalMessages = approvalMessages.filter((message) => message.status !== "已处理" && message.status !== "预留");
  const selectedApprovalMessage = approvalMessages.find((message) => message.id === selectedApprovalMessageId) ?? pendingApprovalMessages[0] ?? approvalMessages[0];
  const taskOperations = operationsForTask(selectedTask);
  const operationConfig = taskOperationConfig[selectedTask.no];
  const modelingStartText =
    selectedTask.no === 7 ? "任务 7 启动时，同时通知建模排期启动第一款建模任务。" : selectedTask.no === 10 ? "任务 10 启动时，同时通知建模排期启动其余款式建模任务。" : "普通任务只写入项目排期任务事实。";
  const [runningOperation, setRunningOperation] = useState("");
  const [integrationLog, setIntegrationLog] = useState<IntegrationLog | null>(null);
  const [styleListOpen, setStyleListOpen] = useState(false);
  const [styleListContext, setStyleListContext] = useState<StyleListContext | null>(null);
  const [styleDraftRows, setStyleDraftRows] = useState<StyleListDraftRow[]>(() => defaultStyleDraftRows(emptyProject));
  const [styleUploadingRowId, setStyleUploadingRowId] = useState("");
  const [styleUploadMessage, setStyleUploadMessage] = useState("");
  const [pendingStyleCompletion, setPendingStyleCompletion] = useState<TaskOperationOptions | null>(null);
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [attachmentOperation, setAttachmentOperation] = useState<TaskOperation | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [attachmentLinksText, setAttachmentLinksText] = useState("");
  const [taskAttachments, setTaskAttachments] = useState<Record<string, TaskAttachmentDraft[]>>({});
  const [reviewRecordModalOpen, setReviewRecordModalOpen] = useState(false);
  const [reviewRecordOperation, setReviewRecordOperation] = useState<TaskOperation | null>(null);
  const [reviewRecordDraft, setReviewRecordDraft] = useState(defaultTaskReviewRecordDraft());
  const [taskReviewRecords, setTaskReviewRecords] = useState<Record<string, TaskReviewRecord[]>>({});
  const canManageOverride = canUseManagerOverride(currentUserRole);
  const operationDraftKey = `${selectedProject.id}:${selectedTask.id}`;
  const activeDraft = operationDraft.taskKey === operationDraftKey ? operationDraft : defaultTaskOperationDraft(operationDraftKey, selectedTask);
  const activeStyleListProject = styleListContext?.project ?? selectedProject;
  const activeStyleListTask = styleListContext?.task ?? selectedTask;
  const activeStyleCompletion = styleListContext?.completionOptions ?? pendingStyleCompletion;
  const selectedTaskAttachments = taskAttachments[taskAttachmentKey(selectedProject, selectedTask)] ?? [];
  const selectedTaskReviewRecords = taskReviewRecords[taskAttachmentKey(selectedProject, selectedTask)] ?? [];

  function updateOperationDraft(patch: Partial<Omit<TaskOperationDraft, "taskKey">>) {
    setOperationDraft((current) => {
      const base = current.taskKey === operationDraftKey ? current : defaultTaskOperationDraft(operationDraftKey, selectedTask);
      return { ...base, ...patch };
    });
  }

  function openStyleListModal(completionOptions?: TaskOperationOptions, context?: Pick<StyleListContext, "project" | "task" | "returnMessage">) {
    const targetProject = context?.project ?? selectedProject;
    const targetTask = context?.task ?? selectedTask;

    setStyleDraftRows(defaultStyleDraftRows(targetProject));
    setStyleUploadMessage("");
    setStyleUploadingRowId("");
    setPendingStyleCompletion(completionOptions ?? null);
    setStyleListContext({
      project: targetProject,
      task: targetTask,
      completionOptions,
      returnMessage: context?.returnMessage,
    });
    setStyleListOpen(true);
  }

  function openReturnedStyleList(message: ReturnMessage) {
    const targetProject = projects.find((project) => project.id === message.projectId) ?? selectedProject;
    const targetTask =
      targetProject.tasks.find((task) => (message.taskNo ? task.no === message.taskNo : false)) ??
      targetProject.tasks.find((task) => task.no === 7) ??
      targetProject.tasks.find((task) => task.no === 10) ??
      selectedTask;

    onOpenTask(targetProject.id, targetTask.no);
    openStyleListModal(undefined, { project: targetProject, task: targetTask, returnMessage: message });
  }

  function openAttachmentModal(operation: TaskOperation) {
    setAttachmentOperation(operation);
    setAttachmentMessage("");
    setAttachmentLinksText("");
    setAttachmentModalOpen(true);
  }

  function openReviewRecordModal(operation: TaskOperation) {
    setReviewRecordOperation(operation);
    setReviewRecordDraft(defaultTaskReviewRecordDraft());
    setReviewRecordModalOpen(true);
  }

  function updateStyleDraftRow(rowId: string, patch: Partial<StyleListDraftRow>) {
    setStyleDraftRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }

  function addStyleDraftRow() {
    setStyleDraftRows((current) => [...current, createStyleDraftRow(selectedProject, nextStyleSequence(current), false)]);
  }

  function removeStyleDraftRow(rowId: string) {
    setStyleDraftRows((current) => {
      const nextRows = current.filter((row) => row.rowId !== rowId);
      if (nextRows.length === 0) return nextRows;
      if (nextRows.some((row) => row.isFirstModelingStyle)) return nextRows;

      return nextRows.map((row, index) => (index === 0 ? { ...row, isFirstModelingStyle: true } : row));
    });
  }

  function setFirstStyleDraftRow(rowId: string) {
    setStyleDraftRows((current) => current.map((row) => ({ ...row, isFirstModelingStyle: row.rowId === rowId })));
  }

  function removeStyleImage(rowId: string, imageId: string) {
    setStyleDraftRows((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, referenceImages: row.referenceImages.filter((image) => image.id !== imageId) } : row)),
    );
  }

  async function uploadStyleImages(rowId: string, files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setStyleUploadMessage("请上传 JPG、PNG、WebP 或 GIF 图片。");
      return;
    }

    setStyleUploadingRowId(rowId);
    setStyleUploadMessage("正在上传图片...");
    try {
      const uploadedImages = await uploadProductGuideImages(imageFiles);
      setStyleDraftRows((current) =>
        current.map((row) => (row.rowId === rowId ? { ...row, referenceImages: [...row.referenceImages, ...uploadedImages] } : row)),
      );
      setStyleUploadMessage(`已上传 ${uploadedImages.length} 张图片。`);
    } catch (error) {
      setStyleUploadMessage(error instanceof Error ? error.message : "图片上传失败。");
    } finally {
      setStyleUploadingRowId("");
    }
  }

  async function uploadTaskAttachments(files: File[]) {
    if (files.length === 0 || !attachmentOperation) return;

    setAttachmentUploading(true);
    setAttachmentMessage("正在上传附件...");
    try {
      const uploadedFiles = await uploadProductGuideFiles(files);
      const attachmentRows = uploadedFiles.map((file) => taskAttachmentFromFile(file, attachmentOperation.label));
      mergeTaskAttachments(selectedProject, selectedTask, attachmentRows);
      setIntegrationLog(buildAttachmentIntegrationLog(selectedProject, selectedTask, attachmentOperation, attachmentRows));
      setAttachmentMessage(`已上传 ${uploadedFiles.length} 个附件。`);
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : "附件上传失败。");
    } finally {
      setAttachmentUploading(false);
    }
  }

  function submitAttachmentLinks() {
    if (!attachmentOperation) return;

    const links = parseUrlList(attachmentLinksText);
    if (links.length === 0) {
      setAttachmentMessage("请先填写附件链接。");
      return;
    }

    const attachmentRows = links.map((url, index) => ({
      id: createLocalRowId("task-attachment"),
      name: `${attachmentOperation.label}链接${index + 1}`,
      url,
      type: "外部链接",
      operationLabel: attachmentOperation.label,
      uploadedAt: todayDateOnly(),
    }));
    mergeTaskAttachments(selectedProject, selectedTask, attachmentRows);
    setIntegrationLog(buildAttachmentIntegrationLog(selectedProject, selectedTask, attachmentOperation, attachmentRows));
    setAttachmentLinksText("");
    setAttachmentMessage(`已记录 ${attachmentRows.length} 条附件链接。`);
  }

  function mergeTaskAttachments(project: PrototypeProject, task: PrototypeTask, attachments: TaskAttachmentDraft[]) {
    const key = taskAttachmentKey(project, task);
    setTaskAttachments((current) => ({
      ...current,
      [key]: [...(current[key] ?? []), ...attachments],
    }));
  }

  function submitReviewRecord() {
    if (!reviewRecordOperation) return;
    if (!reviewRecordDraft.reviewTarget.trim()) return;
    if (!reviewRecordDraft.submittedAt) return;

    const record: TaskReviewRecord = {
      id: createLocalRowId("task-review-record"),
      operationLabel: reviewRecordOperation.label,
      reviewTarget: reviewRecordDraft.reviewTarget.trim(),
      submittedAt: reviewRecordDraft.submittedAt,
      expectedFeedbackDate: reviewRecordDraft.expectedFeedbackDate,
      result: reviewRecordDraft.result,
      feedbackContent: reviewRecordDraft.feedbackContent.trim(),
      attachmentUrls: parseUrlList(reviewRecordDraft.attachmentUrlsText),
      recordedAt: todayDateOnly(),
    };
    const key = taskAttachmentKey(selectedProject, selectedTask);
    setTaskReviewRecords((current) => ({
      ...current,
      [key]: [...(current[key] ?? []), record],
    }));
    setIntegrationLog(buildReviewRecordIntegrationLog(selectedProject, selectedTask, record));
    setReviewRecordModalOpen(false);
  }

  async function submitStyleList() {
    if (validateStyleDraftRows(styleDraftRows).length > 0) return;

    const shouldCompleteTaskAfterStyleSubmit = Boolean(activeStyleCompletion);
    const label = shouldCompleteTaskAfterStyleSubmit ? "提交款式清单并完成任务" : "提交建模款式清单";
    setRunningOperation(label);
    try {
      const requests: IntegrationRequest[] = [
        {
          ...styleSubmissionRequest(activeStyleListProject, currentUserId, currentUserName, styleDraftRows),
          haltOnFailure: shouldCompleteTaskAfterStyleSubmit,
        },
      ];

      if (activeStyleCompletion) {
        const completeOperation = taskOps(activeStyleListTask.name, ["完成"]).operations[0];
        requests.push(
          ...buildOperationRequests(activeStyleListProject, activeStyleListTask, completeOperation, currentUserId, currentUserName, activeStyleCompletion),
        );
      }

      const log = await executeIntegrationRequests(label, requests);
      setIntegrationLog(log);
      onTaskFactLog(log);
      const styleSubmissionExchange = log.exchanges.find((exchange) => exchange.path.includes("/api/modeling/style-submissions"));
      if (styleSubmissionExchange?.ok) {
        onModelingStylesSubmitted(styleSummariesFromSubmissionResponse(activeStyleListProject, styleDraftRows, styleSubmissionExchange.response));
        setStyleListOpen(false);
        setPendingStyleCompletion(null);
        setStyleListContext(null);
        if (styleListContext?.returnMessage) {
          onReturnMessageHandled(styleListContext.returnMessage.id);
        }
        if (log.exchanges.every((exchange) => exchange.ok)) {
          setActivePage("detail");
        }
      } else {
        setStyleUploadMessage("款式清单提交未成功，已停止后续任务完成动作。请查看接口返回原因。");
      }
    } finally {
      setRunningOperation("");
    }
  }

  async function runTaskOperation(operation: TaskOperation) {
    const availability = operationAvailability(selectedProject, selectedTask, operation);
    if (!availability.canRun) return;

    if (operation.kind === "modeling") {
      openStyleListModal();
      return;
    }

    if (operation.kind === "upload") {
      openAttachmentModal(operation);
      return;
    }

    if (operation.kind === "review") {
      openReviewRecordModal(operation);
      return;
    }

    const operationOptions = {
      actualStartDate: activeDraft.actualStartDate,
      actualFinishDate: activeDraft.actualFinishDate,
      note: activeDraft.note.trim() || undefined,
    };

    if (operation.label === "完成" && isLastOriginalArtTask(selectedProject, selectedTask) && selectedProject.styles.length === 0) {
      openStyleListModal(operationOptions);
      return;
    }

    setRunningOperation(operation.label);
    try {
      const requests = buildOperationRequests(selectedProject, selectedTask, operation, currentUserId, currentUserName, operationOptions);
      const log = await executeIntegrationRequests(operation.label, requests);
      setIntegrationLog(log);
      onTaskFactLog(log);
    } finally {
      setRunningOperation("");
    }
  }

  async function runQuickTaskAction(action: QuickTaskAction) {
    const disabledReason = quickTaskActionDisabledReason(action, activeDraft, selectedProject, selectedTask);
    if (disabledReason) return;

    const label = quickTaskActionLabel(action);
    setRunningOperation(label);
    try {
      const log = await executeIntegrationRequests(label, [
        buildQuickTaskFactRequest(selectedProject, selectedTask, action, currentUserId, currentUserName, activeDraft),
      ]);
      setIntegrationLog(log);
      onTaskFactLog(log);
    } finally {
      setRunningOperation("");
    }
  }

  async function runManagerOverride(action: "start" | "complete") {
    if (!canManageOverride) return;

    const disabledReason = managerOverrideDisabledReason(
      selectedProject,
      selectedTask,
      action,
      activeDraft.overrideReason,
      activeDraft.actualStartDate,
      activeDraft.actualFinishDate,
    );
    if (disabledReason) return;

    const operation = taskOps(selectedTask.name, [action === "start" ? "开始" : "完成"]).operations[0];
    const label = action === "start" ? "管理层强制开始" : "管理层强制完成";
    const operationOptions = {
      actualStartDate: activeDraft.actualStartDate,
      actualFinishDate: activeDraft.actualFinishDate,
      note: activeDraft.note.trim() || `管理层补录：${activeDraft.overrideReason.trim()}`,
      override: true,
      overrideType: action === "start" ? ("force_start" as const) : ("force_complete" as const),
      overrideReason: activeDraft.overrideReason.trim(),
      missingPredecessorIds: selectedTask.missingPredecessorIds.length > 0 ? selectedTask.missingPredecessorIds : selectedTask.missingPredecessors,
    };

    if (action === "complete" && isLastOriginalArtTask(selectedProject, selectedTask) && selectedProject.styles.length === 0) {
      openStyleListModal(operationOptions);
      return;
    }

    setRunningOperation(label);
    try {
      const requests = buildOperationRequests(selectedProject, selectedTask, operation, currentUserId, currentUserName, operationOptions);
      const log = await executeIntegrationRequests(label, requests);
      setIntegrationLog(log);
      onTaskFactLog(log);
    } finally {
      setRunningOperation("");
    }
  }

  return (
    <div className="grid gap-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div>
          <h2 className="text-base font-semibold">工作台</h2>
          <div className="mt-1 text-xs text-slate-500">任务处理和外部模块回传消息分开查看。</div>
        </div>
        <div className="inline-grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setWorkbenchPage("task")}
            className={clsx("inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold", workbenchPage === "task" ? "bg-white text-rose-700 shadow-sm" : "text-slate-600")}
          >
            <ListChecks size={15} />
            任务处理
          </button>
          <button
            type="button"
            onClick={() => setWorkbenchPage("messages")}
            className={clsx("inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold", workbenchPage === "messages" ? "bg-white text-rose-700 shadow-sm" : "text-slate-600")}
          >
            <Bell size={15} />
            消息提醒
            <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-700">{visibleMessages.filter((message) => message.status !== "已处理" && message.status !== "预留").length}</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkbenchPage("approval")}
            className={clsx("inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold", workbenchPage === "approval" ? "bg-white text-rose-700 shadow-sm" : "text-slate-600")}
          >
            <FileText size={15} />
            审批中心
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">{pendingApprovalMessages.length}</span>
          </button>
        </div>
      </section>

      {workbenchPage === "messages" ? (
        <MessageReminderPage
          messages={visibleMessages}
          sourceLabel={returnMessageSource}
          onOpenProject={onOpenProject}
          onOpenTask={onOpenTask}
          onOpenStyleList={openReturnedStyleList}
          onOpenApproval={(messageId) => {
            setSelectedApprovalMessageId(messageId);
            setWorkbenchPage("approval");
          }}
        />
      ) : workbenchPage === "approval" ? (
        <ApprovalCenterPage
          message={selectedApprovalMessage}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onOpenProject={onOpenProject}
          onMessageHandled={onReturnMessageHandled}
          setWorkbenchPage={setWorkbenchPage}
        />
      ) : (
        <>
      <section className="grid grid-cols-[320px_minmax(0,1fr)] gap-3 max-xl:grid-cols-1">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">任务队列</h2>
              <div className="mt-1 text-xs text-slate-500">来源：项目排期任务清单</div>
            </div>
            <button type="button" onClick={() => setActivePage("week")} className="text-xs font-semibold text-rose-700">
              本周指引
            </button>
          </div>
          <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto pr-1">
            {allVisibleTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                当前项目组没有未完成任务
              </div>
            ) : null}
            {allVisibleTasks.map(({ project, task }) => (
              <button
                key={`${project.id}-${task.no}`}
                type="button"
                onClick={() => onOpenTask(project.id, task.no)}
                className={clsx(
                  "rounded-lg border px-3 py-2 text-left transition hover:bg-slate-50",
                  selectedProject.id === project.id && selectedTask.no === task.no ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">#{task.no} {task.name}</span>
                  <StatusPill status={task.status} risk={task.risk} />
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{project.name}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <InfoPair label="DDL" value={task.ddl} />
                  <InfoPair label="延期线" value={task.delayLine} strong={task.risk === "risk" || task.risk === "delay"} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-rose-700">{selectedProject.code} / {selectedProject.name}</div>
                <h2 className="mt-1 text-xl font-semibold">#{selectedTask.no} {selectedTask.name}</h2>
                <div className="mt-2 text-sm text-slate-500">任务来源：项目排期 ProjectTask；排期预测、风险和延期线由项目排期返回。</div>
              </div>
              <button type="button" onClick={() => onOpenProject(selectedProject.id)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                查看项目明细
              </button>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-2 max-xl:grid-cols-3 max-md:grid-cols-2">
              <Metric label="里程碑" value={selectedTask.milestone} />
              <Metric label="负责人" value={selectedTask.owner} />
              <Metric label="当前状态" value={selectedTask.status} />
              <Metric label="DDL" value={selectedTask.ddl} />
              <Metric label="延期线" value={selectedTask.delayLine} />
              <Metric label="预计完成" value={selectedTask.expectedFinish} />
              <Metric label="实际开始" value={selectedTask.actualStart ?? "-"} />
            </div>
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{selectedTask.reason}</div>
            {selectedTask.missingPredecessors.length > 0 ? (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
                前置未完成：{selectedTask.missingPredecessors.join("、")}。普通开始 / 完成已禁用，管理层可补录事实。
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                前置任务已满足，可以按当前任务状态处理。
              </div>
            )}
          </section>

          <section className="grid grid-cols-[1fr_0.85fr] gap-3 max-xl:grid-cols-1">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">任务操作</h3>
                  <div className="mt-1 text-xs text-slate-500">
                    操作配置来源：{taskOperationSourceLabel}
                    {operationConfig ? ` / #${selectedTask.no} ${operationConfig.taskName}` : " / 暂无专用配置，使用基础动作"}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[150px_150px_150px_minmax(0,1fr)] gap-2 max-lg:grid-cols-2 max-md:grid-cols-1">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  实际开始（开始为空默认今天，补录可选）
                  <input
                    type="date"
                    value={activeDraft.actualStartDate}
                    onChange={(event) => updateOperationDraft({ actualStartDate: event.target.value })}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  实际完成
                  <input
                    type="date"
                    value={activeDraft.actualFinishDate}
                    onChange={(event) => updateOperationDraft({ actualFinishDate: event.target.value })}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  预计完成
                  <input
                    type="date"
                    value={activeDraft.expectedFinishDate}
                    onChange={(event) => updateOperationDraft({ expectedFinishDate: event.target.value })}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  备注
                  <input
                    type="text"
                    value={activeDraft.note}
                    onChange={(event) => updateOperationDraft({ note: event.target.value })}
                    placeholder="可填写补录依据、附件说明或当前处理说明"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
              </div>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_180px_160px] gap-2 max-lg:grid-cols-1">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  阻塞原因
                  <input
                    type="text"
                    value={activeDraft.blockReason}
                    onChange={(event) => updateOperationDraft({ blockReason: event.target.value })}
                    placeholder="例如：版权方反馈未回 / 资料缺失 / 工厂确认中"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  送审日期
                  <input
                    type="date"
                    value={activeDraft.submittedAt}
                    onChange={(event) => updateOperationDraft({ submittedAt: event.target.value })}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  送审对象
                  <input
                    type="text"
                    value={activeDraft.reviewTarget}
                    onChange={(event) => updateOperationDraft({ reviewTarget: event.target.value })}
                    placeholder="版权方 / 内部审核"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 max-lg:grid-cols-2 max-md:grid-cols-1">
                {taskOperations.map((operation) => {
                  const availability = operationAvailability(selectedProject, selectedTask, operation);
                  const missingDate = operation.label === "完成" && !activeDraft.actualFinishDate;
                  const disabled = Boolean(runningOperation) || !availability.canRun || missingDate;
                  const displayLabel = availability.displayLabel ?? operation.label;
                  const helper = missingDate ? "请先填写对应日期。" : availability.reason;

                  return (
                    <button
                      key={operation.label}
                      type="button"
                      onClick={() => void runTaskOperation(operation)}
                      disabled={disabled}
                      className={clsx(
                        "min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                        operationTone(operation.kind),
                      )}
                    >
                      <div>{displayLabel}</div>
                      <div className="mt-1 text-xs font-normal opacity-80">{runningOperation === operation.label ? "正在调用真实接口..." : helper}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold">进度事实补充</h4>
                    <div className="mt-1 text-xs text-slate-500">这些动作会写入项目排期任务事实，并自动触发正式重算。</div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">普通成员可用</span>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2 max-xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
                  {(["expected-finish", "block", "unblock", "submit-review", "note"] as const).map((action) => {
                    const disabledReason = quickTaskActionDisabledReason(action, activeDraft, selectedProject, selectedTask);
                    const label = quickTaskActionLabel(action);
                    const disabled = Boolean(runningOperation) || Boolean(disabledReason);

                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void runQuickTaskAction(action)}
                        disabled={disabled}
                        className="min-h-10 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div>{label}</div>
                        <div className="mt-1 text-xs font-normal text-emerald-800">{runningOperation === label ? "正在写入任务事实..." : disabledReason || quickTaskActionHelper(action)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold">管理层补录 / 强制处理</h4>
                    <div className="mt-1 text-xs text-slate-500">
                      {canManageOverride ? "仅用于前置缺失、阻塞、暂停等需要补录事实的场景。" : "当前账号不是管理层，仅可查看此规则。"}
                    </div>
                  </div>
                  <span className={clsx("rounded-full px-2 py-1 text-xs font-semibold", canManageOverride ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-600")}>
                    {canManageOverride ? "管理层可用" : "管理层入口"}
                  </span>
                </div>
                <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600">
                  强制原因
                  <input
                    type="text"
                    value={activeDraft.overrideReason}
                    onChange={(event) => updateOperationDraft({ overrideReason: event.target.value })}
                    placeholder="例如：历史项目已在线下完成，现补录系统事实"
                    disabled={!canManageOverride}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-100"
                  />
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2 max-md:grid-cols-1">
                  {(["start", "complete"] as const).map((action) => {
                    const disabledReason = managerOverrideDisabledReason(
                      selectedProject,
                      selectedTask,
                      action,
                      activeDraft.overrideReason,
                      activeDraft.actualStartDate,
                      activeDraft.actualFinishDate,
                    );
                    const disabled = Boolean(runningOperation) || !canManageOverride || Boolean(disabledReason);
                    const label = action === "start" ? "管理层强制开始" : "管理层强制完成";

                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void runManagerOverride(action)}
                        disabled={disabled}
                        className="min-h-10 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm font-semibold text-amber-900 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div>{label}</div>
                        <div className="mt-1 text-xs font-normal text-amber-800">{runningOperation === label ? "正在提交强制处理..." : disabledReason || "发送带 override 的任务事实事件。"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <OperationFeedback log={integrationLog} runningOperation={runningOperation} />
              <TaskAttachmentList attachments={selectedTaskAttachments} />
              <TaskReviewRecordList records={selectedTaskReviewRecords} />
              <div className="mt-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                <InfoPair label="操作写回" value="项目排期任务事实事件" strong />
                <InfoPair label="建模联动" value={modelingStartText} />
                <InfoPair label="人工填写" value="实际完成日期、预计完成日期、阻塞原因、备注、附件" />
              </div>
            </div>

          </section>
          <IntegrationLogPanel log={integrationLog} runningOperation={runningOperation} />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
        <NavTile icon={<CalendarDays size={18} />} title="产品规划视图" value={`${projects.length} 个项目`} onClick={() => setActivePage("plan")} />
        <NavTile icon={<ListChecks size={18} />} title="本周工作指引" value={`${guideTasks.length} 个事项`} onClick={() => setActivePage("week")} />
        <NavTile icon={<FileText size={18} />} title="项目明细" value={selectedProject.name} onClick={() => onOpenProject(selectedProject.id)} />
      </section>
        </>
      )}
      <StyleListModal
        open={styleListOpen}
        project={activeStyleListProject}
        rows={styleDraftRows}
        running={runningOperation === "提交建模款式清单" || runningOperation === "提交款式清单并完成任务"}
        completeTaskAfterSubmit={Boolean(activeStyleCompletion)}
        returnMessage={styleListContext?.returnMessage}
        uploadingRowId={styleUploadingRowId}
        uploadMessage={styleUploadMessage}
        onClose={() => {
          setStyleListOpen(false);
          setPendingStyleCompletion(null);
          setStyleListContext(null);
        }}
        onSubmit={() => void submitStyleList()}
        onAddRow={addStyleDraftRow}
        onRemoveRow={removeStyleDraftRow}
        onSetFirstStyle={setFirstStyleDraftRow}
        onUpdateRow={updateStyleDraftRow}
        onUploadImages={(rowId, files) => void uploadStyleImages(rowId, files)}
        onRemoveImage={removeStyleImage}
      />
      <TaskAttachmentModal
        open={attachmentModalOpen}
        project={selectedProject}
        task={selectedTask}
        operation={attachmentOperation}
        uploading={attachmentUploading}
        message={attachmentMessage}
        linksText={attachmentLinksText}
        onLinksTextChange={setAttachmentLinksText}
        onUploadFiles={(files) => void uploadTaskAttachments(files)}
        onSubmitLinks={submitAttachmentLinks}
        onClose={() => setAttachmentModalOpen(false)}
      />
      <TaskReviewRecordModal
        open={reviewRecordModalOpen}
        project={selectedProject}
        task={selectedTask}
        operation={reviewRecordOperation}
        draft={reviewRecordDraft}
        onDraftChange={(patch) => setReviewRecordDraft((current) => ({ ...current, ...patch }))}
        onSubmit={submitReviewRecord}
        onClose={() => setReviewRecordModalOpen(false)}
      />
    </div>
  );
}

function TaskAttachmentList({ attachments }: { attachments: TaskAttachmentDraft[] }) {
  if (attachments.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-400">
        当前任务尚未记录附件。
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold">任务附件</div>
      <div className="mt-2 grid gap-2">
        {attachments.map((attachment) => (
          <a
            key={attachment.id}
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="grid grid-cols-[92px_1fr_86px] items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50 max-md:grid-cols-1"
          >
            <span className="rounded-full bg-slate-100 px-2 py-1 text-center text-xs font-semibold text-slate-600">{attachment.type}</span>
            <span className="min-w-0 truncate font-semibold text-slate-800" title={attachment.url}>{attachment.name}</span>
            <span className="text-xs text-slate-400">{attachment.uploadedAt}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function TaskAttachmentModal({
  open,
  project,
  task,
  operation,
  uploading,
  message,
  linksText,
  onLinksTextChange,
  onUploadFiles,
  onSubmitLinks,
  onClose,
}: {
  open: boolean;
  project: PrototypeProject;
  task: PrototypeTask;
  operation: TaskOperation | null;
  uploading: boolean;
  message: string;
  linksText: string;
  onLinksTextChange: (value: string) => void;
  onUploadFiles: (files: File[]) => void;
  onSubmitLinks: () => void;
  onClose: () => void;
}) {
  if (!open || !operation) return null;

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onUploadFiles(Array.from(fileList));
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35 p-5 backdrop-blur-sm">
      <div className="mx-auto flex max-h-[92vh] max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-xs font-semibold text-rose-700">{project.code} / #{task.no} {task.name}</div>
            <h2 className="mt-1 text-xl font-semibold">{operation.label}</h2>
            <div className="mt-1 text-sm text-slate-500">上传或登记任务附件。本动作只记录产品组工作台附件，不向项目排期发送任务事实事件。</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 overflow-auto px-5 py-4">
          <label
            className={clsx(
              "grid min-h-40 cursor-pointer place-items-center rounded-xl border border-dashed px-4 py-8 text-center transition",
              uploading ? "border-slate-200 bg-slate-50 text-slate-400" : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
            )}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!uploading) handleFiles(event.dataTransfer.files);
            }}
          >
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              disabled={uploading}
              onChange={(event) => handleFiles(event.target.files)}
              className="hidden"
            />
            <div>
              <Upload className="mx-auto" size={24} />
              <div className="mt-2 text-sm font-semibold">{uploading ? "正在上传..." : "拖拽文件到这里，或点击选择文件"}</div>
              <div className="mt-1 text-xs text-slate-500">支持 JPG、PNG、WebP、GIF、PDF、PPT、PPTX，单个文件不超过 8MB。</div>
            </div>
          </label>

          <div className="grid gap-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              外部附件链接
              <textarea
                value={linksText}
                onChange={(event) => onLinksTextChange(event.target.value)}
                placeholder="可以粘贴网盘、飞书、版权方链接等，多条用换行或逗号分隔"
                className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">{message || "上传文件或记录链接后，会在任务工作台展示附件记录。"}</div>
              <button
                type="button"
                onClick={onSubmitLinks}
                disabled={!linksText.trim() || uploading}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                记录链接
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
            <InfoPair label="边界" value="上传动作不代表任务开始或完成；开始/完成仍需单独点击任务事实按钮。" strong />
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskReviewRecordList({ records }: { records: TaskReviewRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-400">
        当前任务尚未记录审核 / 送审事实。
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold">审核 / 送审记录</div>
      <div className="mt-2 grid gap-2">
        {records.map((record) => (
          <div key={record.id} className="grid grid-cols-[112px_1fr_110px_110px] items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm max-lg:grid-cols-2 max-md:grid-cols-1">
            <span className="rounded-full bg-amber-100 px-2 py-1 text-center text-xs font-semibold text-amber-900">{record.result}</span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-800">{record.operationLabel} / {record.reviewTarget}</div>
              <div className="truncate text-xs text-slate-500">{record.feedbackContent || "未填写反馈内容"} / 附件 {record.attachmentUrls.length} 条</div>
            </div>
            <InfoPair label="提交日期" value={record.submittedAt} />
            <InfoPair label="预计反馈" value={record.expectedFeedbackDate || "-"} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskReviewRecordModal({
  open,
  project,
  task,
  operation,
  draft,
  onDraftChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  project: PrototypeProject;
  task: PrototypeTask;
  operation: TaskOperation | null;
  draft: ReturnType<typeof defaultTaskReviewRecordDraft>;
  onDraftChange: (patch: Partial<ReturnType<typeof defaultTaskReviewRecordDraft>>) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!open || !operation) return null;

  const disabled = !draft.reviewTarget.trim() || !draft.submittedAt;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35 p-5 backdrop-blur-sm">
      <div className="mx-auto flex max-h-[92vh] max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-xs font-semibold text-amber-700">{project.code} / #{task.no} {task.name}</div>
            <h2 className="mt-1 text-xl font-semibold">{operation.label}</h2>
            <div className="mt-1 text-sm text-slate-500">记录审核 / 送审事实。本动作不进入建模审批中心，也不向项目排期发送任务事实事件。</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 overflow-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              审核 / 送审对象
              <input
                value={draft.reviewTarget}
                onChange={(event) => onDraftChange({ reviewTarget: event.target.value })}
                placeholder="例如：版权方、内部工程、工厂"
                className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              当前结果
              <select
                value={draft.result}
                onChange={(event) => onDraftChange({ result: event.target.value })}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              >
                {["已送审", "等反馈", "通过", "不通过", "需修改"].map((result) => (
                  <option key={result}>{result}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              提交日期
              <input
                type="date"
                value={draft.submittedAt}
                onChange={(event) => onDraftChange({ submittedAt: event.target.value })}
                className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              预计反馈日期
              <input
                type="date"
                value={draft.expectedFeedbackDate}
                onChange={(event) => onDraftChange({ expectedFeedbackDate: event.target.value })}
                className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
            </label>
          </div>

          <label className="grid gap-1 text-xs font-medium text-slate-600">
            反馈 / 备注
            <textarea
              value={draft.feedbackContent}
              onChange={(event) => onDraftChange({ feedbackContent: event.target.value })}
              placeholder="记录送审说明、审核意见、等待反馈内容或修改要求"
              className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </label>

          <label className="grid gap-1 text-xs font-medium text-slate-600">
            附件链接
            <textarea
              value={draft.attachmentUrlsText}
              onChange={(event) => onDraftChange({ attachmentUrlsText: event.target.value })}
              placeholder="可粘贴送审文件、反馈截图、版权方邮件链接，多条用换行或逗号分隔"
              className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="text-sm text-slate-600">记录后会显示在当前任务工作台；任务是否完成仍由“完成”按钮写入项目排期。</div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled}
              className="h-9 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              保存记录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StyleListModal({
  open,
  project,
  rows,
  running,
  completeTaskAfterSubmit,
  returnMessage,
  uploadingRowId,
  uploadMessage,
  onClose,
  onSubmit,
  onAddRow,
  onRemoveRow,
  onSetFirstStyle,
  onUpdateRow,
  onUploadImages,
  onRemoveImage,
}: {
  open: boolean;
  project: PrototypeProject;
  rows: StyleListDraftRow[];
  running: boolean;
  completeTaskAfterSubmit: boolean;
  returnMessage?: ReturnMessage;
  uploadingRowId: string;
  uploadMessage: string;
  onClose: () => void;
  onSubmit: () => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: string) => void;
  onSetFirstStyle: (rowId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<StyleListDraftRow>) => void;
  onUploadImages: (rowId: string, files: File[]) => void;
  onRemoveImage: (rowId: string, imageId: string) => void;
}) {
  if (!open) return null;

  const validationErrors = validateStyleDraftRows(rows);
  const firstStyle = rows.find((row) => row.isFirstModelingStyle);

  function handleFiles(rowId: string, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onUploadImages(rowId, Array.from(fileList));
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 px-4 py-6">
      <section className="mx-auto max-w-6xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-xs font-semibold text-rose-700">{project.code} / {project.name}</div>
            <h2 className="mt-1 text-xl font-semibold">建模款式清单</h2>
            <div className="mt-1 text-sm text-slate-500">
              {returnMessage
                ? "建模排期退回了款式清单，请补齐完整系列后重新提交。"
                : completeTaskAfterSubmit
                ? "完成原画收口任务前，先提交完整系列款式清单；提交成功后会继续完成当前任务。"
                : "原画里程碑完成后提交完整系列；第一款挂任务 7，其余款式挂任务 10。"}
            </div>
            {returnMessage ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                退回原因：{returnMessage.summary}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm max-lg:grid-cols-2 max-md:grid-cols-1">
          <Metric label="款式数量" value={`${rows.length}`} />
          <Metric label="第一款" value={firstStyle ? `${firstStyle.styleSequence} / ${firstStyle.styleName}` : "未选择"} />
          <Metric label="任务 7" value="启动第一款" />
          <Metric label="任务 10" value="启动其余款式" />
        </div>

        <div className="max-h-[68vh] overflow-auto px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">款式明细</h3>
              <div className="mt-1 text-xs text-slate-500">款式名称、第一款标记、过审日期和预计建模天数会提交给建模排期。</div>
            </div>
            <button type="button" onClick={onAddRow} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus size={15} />
              增加款式
            </button>
          </div>

          <div className="mt-3 grid gap-3">
            {rows.map((row, index) => (
              <div key={row.rowId} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="grid grid-cols-[72px_86px_minmax(160px,1fr)_88px_110px_120px_128px_40px] items-end gap-2 max-xl:grid-cols-3 max-md:grid-cols-1">
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    第一款
                    <button
                      type="button"
                      onClick={() => onSetFirstStyle(row.rowId)}
                      className={clsx("h-9 rounded-lg border text-sm font-semibold", row.isFirstModelingStyle ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600")}
                    >
                      {row.isFirstModelingStyle ? "是" : "否"}
                    </button>
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    序号
                    <input
                      value={row.styleSequence}
                      onChange={(event) => onUpdateRow(row.rowId, { styleSequence: event.target.value })}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    款式名称
                    <input
                      value={row.styleName}
                      onChange={(event) => onUpdateRow(row.rowId, { styleName: event.target.value })}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    必做
                    <button
                      type="button"
                      onClick={() => onUpdateRow(row.rowId, { isRequired: !row.isRequired })}
                      className={clsx("h-9 rounded-lg border text-sm font-semibold", row.isRequired ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600")}
                    >
                      {row.isRequired ? "必做" : "非必做"}
                    </button>
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    难度
                    <select
                      value={row.difficulty}
                      onChange={(event) => onUpdateRow(row.rowId, { difficulty: event.target.value })}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    >
                      {["低", "中", "高"].map((difficulty) => (
                        <option key={difficulty}>{difficulty}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    预计天数
                    <input
                      type="number"
                      min={1}
                      value={row.estimatedWorkdays}
                      onChange={(event) => onUpdateRow(row.rowId, { estimatedWorkdays: event.target.value })}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    原画过审日
                    <input
                      type="date"
                      value={row.originalArtApprovedDate}
                      onChange={(event) => onUpdateRow(row.rowId, { originalArtApprovedDate: event.target.value })}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onRemoveRow(row.rowId)}
                    disabled={rows.length <= 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`删除第 ${index + 1} 行`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-[minmax(220px,0.8fr)_minmax(240px,1fr)_minmax(200px,0.9fr)] gap-3 max-xl:grid-cols-1">
                  <div>
                    <label
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleFiles(row.rowId, event.dataTransfer.files);
                      }}
                      className={clsx(
                        "flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-3 py-4 text-center text-sm transition hover:bg-slate-50",
                        uploadingRowId === row.rowId ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-500",
                      )}
                    >
                      <Upload size={18} />
                      <span className="mt-2 font-semibold">{uploadingRowId === row.rowId ? "正在上传..." : "拖拽图片或点击上传"}</span>
                      <span className="mt-1 text-xs">支持 JPG / PNG / WebP / GIF</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          handleFiles(row.rowId, event.currentTarget.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {row.referenceImages.length > 0 ? (
                      <div className="mt-2 grid gap-1">
                        {row.referenceImages.map((image) => (
                          <div key={image.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
                            <span className="truncate" title={image.url}>{image.name}</span>
                            <button type="button" onClick={() => onRemoveImage(row.rowId, image.id)} className="font-semibold text-rose-600">
                              移除
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    图片链接
                    <textarea
                      value={row.referenceImageUrlsText}
                      onChange={(event) => onUpdateRow(row.rowId, { referenceImageUrlsText: event.target.value })}
                      placeholder="可粘贴外部图片链接，多条用换行或逗号分隔"
                      className="min-h-24 rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    />
                  </label>

                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    备注
                    <textarea
                      value={row.notes}
                      onChange={(event) => onUpdateRow(row.rowId, { notes: event.target.value })}
                      className="min-h-24 rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {uploadMessage ? <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">{uploadMessage}</div> : null}
          {validationErrors.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {validationErrors.slice(0, 4).map((error) => (
                <div key={error}>{error}</div>
              ))}
              {validationErrors.length > 4 ? <div>还有 {validationErrors.length - 4} 条待处理。</div> : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <div className="text-sm text-slate-500">
            {completeTaskAfterSubmit
              ? "提交成功后会继续通知项目排期完成当前任务；建模任务初始进入待确认，不代表已经启动建模。"
              : "提交后建模排期生成或更新款式级建模任务，初始进入待确认，不代表已经启动建模。"}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              取消
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={running || uploadingRowId.length > 0 || validationErrors.length > 0}
              className="h-9 rounded-lg border border-rose-200 bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? "提交中..." : completeTaskAfterSubmit ? "提交清单并完成任务" : "提交完整款式清单"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function OperationFeedback({ log, runningOperation }: { log: IntegrationLog | null; runningOperation: string }) {
  if (!runningOperation && !log) return null;

  const ok = log ? log.exchanges.every((exchange) => exchange.ok) : false;

  return (
    <div
      className={clsx(
        "mt-3 rounded-lg border px-3 py-2 text-sm",
        runningOperation ? "border-blue-200 bg-blue-50 text-blue-950" : ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-950",
      )}
    >
      <div className="font-semibold">{runningOperation ? `正在通知外部模块：${runningOperation}` : ok ? "已通知外部模块" : "通知外部模块失败"}</div>
      <div className="mt-1 text-xs leading-relaxed opacity-85">
        {runningOperation ? "正在发送标准任务事实事件，请稍候。" : log ? summarizeIntegrationLog(log) : ""}
      </div>
    </div>
  );
}

function IntegrationLogPanel({ log, runningOperation }: { log: IntegrationLog | null; runningOperation: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">真实接口结果</h3>
          <div className="mt-1 text-xs text-slate-500">点击任务操作后，这里显示产品组实际发给项目排期 / 建模排期的请求和返回。</div>
        </div>
        <div className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", runningOperation ? "bg-blue-100 text-blue-800" : log ? (log.exchanges.every((exchange) => exchange.ok) ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700") : "bg-slate-100 text-slate-600")}>
          {runningOperation ? `调用中：${runningOperation}` : log ? log.summary : "等待操作"}
        </div>
      </div>

      {!log ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
          还没有调用真实接口。请点击左侧任务操作后查看请求和返回。
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <div className="text-sm font-semibold text-slate-800">{log.title}</div>
          {log.exchanges.map((exchange, index) => (
            <div key={`${exchange.path}-${index}`} className={clsx("rounded-lg border p-3", exchange.ok ? "border-emerald-100 bg-emerald-50/60" : "border-rose-100 bg-rose-50/70")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">{exchange.label}</div>
                <div className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", exchange.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700")}>
                  {exchange.method} {exchange.status || "ERR"}
                </div>
              </div>
              <div className="mt-1 break-all text-xs text-slate-500">{exchange.path}</div>
              {exchange.payload ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">查看请求内容</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">{JSON.stringify(exchange.payload, null, 2)}</pre>
                </details>
              ) : null}
              <details className="mt-2" open={!exchange.ok}>
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">查看返回结果</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">{JSON.stringify(exchange.response, null, 2)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MessageReminderPage({
  messages,
  sourceLabel,
  onOpenProject,
  onOpenTask,
  onOpenStyleList,
  onOpenApproval,
}: {
  messages: ReturnMessage[];
  sourceLabel: string;
  onOpenProject: (projectId: string) => void;
  onOpenTask: (projectId: string, taskNo: number) => void;
  onOpenStyleList: (message: ReturnMessage) => void;
  onOpenApproval: (messageId: string) => void;
}) {
  const actionableMessages = messages.filter((message) => message.status !== "预留");
  const reservedMessages = messages.filter((message) => message.status === "预留");

  return (
    <div className="grid gap-3">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">消息提醒</h2>
            <div className="mt-1 text-sm text-slate-500">存放其他模块回传给产品组的通知；当前来源：{sourceLabel}。</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Metric label="待处理" value={`${messages.filter((message) => message.status === "待处理").length}`} />
            <Metric label="未读" value={`${messages.filter((message) => message.status === "未读").length}`} />
            <Metric label="来源模块" value={`${new Set(messages.map((message) => message.sourceModule)).size}`} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold">回传通知</h3>
        <div className="mt-3 grid gap-2">
          {actionableMessages.map((message) => (
            <MessageRow key={message.id} message={message} onOpenProject={onOpenProject} onOpenTask={onOpenTask} onOpenStyleList={onOpenStyleList} onOpenApproval={onOpenApproval} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <h3 className="text-base font-semibold">后续模块预留</h3>
        <div className="mt-3 grid gap-2">
          {reservedMessages.map((message) => (
            <MessageRow key={message.id} message={message} onOpenProject={onOpenProject} onOpenTask={onOpenTask} onOpenStyleList={onOpenStyleList} onOpenApproval={onOpenApproval} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MessageRow({
  message,
  onOpenProject,
  onOpenTask,
  onOpenStyleList,
  onOpenApproval,
}: {
  message: ReturnMessage;
  onOpenProject: (projectId: string) => void;
  onOpenTask: (projectId: string, taskNo: number) => void;
  onOpenStyleList: (message: ReturnMessage) => void;
  onOpenApproval: (messageId: string) => void;
}) {
  const canOpenApproval = message.target === "approval" && message.status !== "已处理" && message.status !== "预留";
  const canOpenTask = message.target === "task" && message.projectId && message.taskNo;
  const canOpenProject = message.target === "project" && message.projectId;
  const canSupplementStyleList = message.eventType === "style_list_returned" && message.status !== "已处理" && message.status !== "预留" && Boolean(message.projectId);

  return (
    <div className={clsx("grid grid-cols-[132px_1fr_112px] items-center gap-3 rounded-lg border px-3 py-3 max-lg:grid-cols-1", message.status === "预留" ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white")}>
      <div>
        <div className="text-xs font-semibold text-slate-500">{message.sourceModule}</div>
        <div className="mt-1 text-xs text-slate-400">{message.receivedAt}</div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold text-slate-950">{message.title}</h4>
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", message.status === "未读" ? "bg-rose-100 text-rose-700" : message.status === "待处理" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500")}>{message.status}</span>
        </div>
        <div className="mt-1 text-sm text-slate-500">{message.projectName ?? "无项目绑定"}</div>
        <div className="mt-1 text-sm text-slate-700">{message.summary}</div>
      </div>
      <div className="grid gap-2">
        {canSupplementStyleList ? (
          <button type="button" onClick={() => onOpenStyleList(message)} className="h-9 rounded-lg border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-900 hover:bg-amber-100">
            补充款式清单
          </button>
        ) : null}
        {canOpenApproval ? (
          <button type="button" onClick={() => onOpenApproval(message.id)} className="h-9 rounded-lg border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700 hover:bg-rose-100">
            进入审批中心
          </button>
        ) : null}
        {canOpenTask ? (
          <button type="button" onClick={() => onOpenTask(message.projectId!, message.taskNo!)} className="h-9 rounded-lg border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700 hover:bg-rose-100">
            进入工作台
          </button>
        ) : null}
        {canOpenProject ? (
          <button type="button" onClick={() => onOpenProject(message.projectId!)} className="h-9 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            查看项目
          </button>
        ) : null}
        {message.status === "已处理" ? <div className="text-center text-xs font-semibold text-slate-400">已处理</div> : null}
        {message.status !== "已处理" && !canOpenApproval && !canOpenTask && !canOpenProject ? <div className="text-center text-xs text-slate-400">等待接入</div> : null}
      </div>
    </div>
  );
}

function ApprovalCenterPage({
  message,
  currentUserId,
  currentUserName,
  onOpenProject,
  onMessageHandled,
  setWorkbenchPage,
}: {
  message?: ReturnMessage;
  currentUserId: string;
  currentUserName: string;
  onOpenProject: (projectId: string) => void;
  onMessageHandled: (messageId: string) => void;
  setWorkbenchPage: (page: WorkbenchPageKey) => void;
}) {
  const [runningReviewResult, setRunningReviewResult] = useState("");
  const [reviewIntegrationLog, setReviewIntegrationLog] = useState<IntegrationLog | null>(null);
  const [reviewFeedbackContent, setReviewFeedbackContent] = useState("");
  const [reviewAttachmentUrlsText, setReviewAttachmentUrlsText] = useState("");

  async function submitReviewResult(reviewResult: string) {
    if (!message) return;
    if (requiresReviewFeedback(reviewResult) && !reviewFeedbackContent.trim()) return;

    setRunningReviewResult(reviewResult);
    try {
      const log = await executeIntegrationRequests(reviewResult, [
        reviewResultRequest(message, reviewResult, currentUserId, currentUserName, {
          feedbackContent: reviewFeedbackContent,
          attachmentUrls: parseUrlList(reviewAttachmentUrlsText),
        }),
      ]);
      setReviewIntegrationLog(log);
      if (log.exchanges.every((exchange) => exchange.ok)) {
        onMessageHandled(message.id);
        setReviewFeedbackContent("");
        setReviewAttachmentUrlsText("");
      }
    } finally {
      setRunningReviewResult("");
    }
  }

  if (!message) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <h2 className="text-base font-semibold">审批中心</h2>
        <div className="mt-2 text-sm text-slate-500">暂无需要审批的建模成果。</div>
        <button type="button" onClick={() => setWorkbenchPage("messages")} className="mt-4 h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          返回消息提醒
        </button>
      </section>
    );
  }

  return (
    <div className="grid gap-3">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-rose-700">{message.sourceModule} / {message.receivedAt}</div>
            <h2 className="mt-1 text-xl font-semibold">审批中心</h2>
            <div className="mt-2 text-sm text-slate-500">建模成果提交后进入这里，由产品研发美术审批；不要进入普通任务处理。</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setWorkbenchPage("messages")} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              返回消息提醒
            </button>
            {message.projectId ? (
              <button type="button" onClick={() => onOpenProject(message.projectId!)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                查看项目明细
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[1fr_0.9fr] gap-3 max-xl:grid-cols-1">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">待审批成果</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 max-md:grid-cols-1">
            <Metric label="项目" value={message.projectName ?? "-"} />
            <Metric label="关联任务" value={message.taskNo ? `#${message.taskNo}` : "-"} />
            <Metric label="款式" value={message.styleName ?? "-"} />
            <Metric label="审核轮次" value={message.reviewRound ? `第 ${message.reviewRound} 轮` : "-"} />
            <Metric label="modelingTaskId" value={message.modelingTaskId ?? "-"} />
            <Metric label="submissionFeedbackId" value={message.submissionFeedbackId ?? "-"} />
            <Metric label="feedbackId" value={message.feedbackId ?? "-"} />
          </div>
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">{message.summary}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 max-md:grid-cols-1">
            {(message.deliverableUrls && message.deliverableUrls.length > 0 ? message.deliverableUrls : ["暂无成果附件"]).map((file) => (
              <div key={file} className="truncate rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" title={file}>
                {file}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">审批动作</h3>
          <div className="mt-3 grid gap-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              反馈内容
              <textarea
                value={reviewFeedbackContent}
                onChange={(event) => setReviewFeedbackContent(event.target.value)}
                placeholder="内部不通过或送审不通过必须填写；通过类可选"
                className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              附件链接
              <textarea
                value={reviewAttachmentUrlsText}
                onChange={(event) => setReviewAttachmentUrlsText(event.target.value)}
                placeholder="可粘贴图片 / PDF / PPT 链接，多条用换行或逗号分隔"
                className="min-h-16 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            {reviewAttachmentUrlsText.trim() ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                将提交 {parseUrlList(reviewAttachmentUrlsText).length} 个附件链接。
              </div>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 max-md:grid-cols-1">
            {["内部通过可送审", "内部不通过", "已送审", "等反馈", "送审通过", "送审不通过"].map((label) => {
              const missingRequiredFeedback = requiresReviewFeedback(label) && !reviewFeedbackContent.trim();
              const disabled = message.status === "已处理" || Boolean(runningReviewResult) || !message.modelingTaskId || !(message.submissionFeedbackId || message.feedbackId) || missingRequiredFeedback;

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => void submitReviewResult(label)}
                  disabled={disabled}
                  className={clsx(
                    "min-h-10 rounded-lg border px-2 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                    label.includes("不通过") ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <div>{runningReviewResult === label ? "提交中..." : label}</div>
                  {missingRequiredFeedback ? <div className="mt-1 text-xs font-normal">请先填写反馈内容</div> : null}
                  {message.status === "已处理" ? <div className="mt-1 text-xs font-normal">该消息已处理</div> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
            <InfoPair label="提交对象" value="建模排期 /api/modeling/review-results" strong />
            <InfoPair label="必须携带" value="modelingTaskId、submissionFeedbackId、feedbackId、reviewRound" />
            <InfoPair label="边界" value="产品组提交审批结果，不直接维护建模状态。" />
          </div>
        </div>
      </section>
      <IntegrationLogPanel log={reviewIntegrationLog} runningOperation={runningReviewResult} />
    </div>
  );
}

function MilestoneBoard({
  mode,
  months,
  milestones: boardMilestones,
  cards,
  onOpenProject,
}: {
  mode: "plan" | "forecast";
  months: string[];
  milestones: string[];
  cards: ProjectCard[];
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          {mode === "plan" ? <CalendarDays size={16} /> : <Gauge size={16} />}
          {mode === "plan" ? "里程碑看板（规划）" : "压力预测"}
        </div>
        <div className="text-xs text-slate-500">可上下滚动查看历史月份</div>
      </div>
      <div className="max-h-[72vh] overflow-auto scroll-smooth">
        <div className="grid min-w-[1120px] grid-cols-[96px_repeat(6,minmax(160px,1fr))]">
          <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-50 p-3 text-center text-sm font-semibold">
            月份
          </div>
          {boardMilestones.map((milestone) => (
            <div
              key={`${mode}:${milestone}:head`}
              className="sticky top-0 z-20 border-b border-r border-slate-200 bg-rose-50 p-3 text-center text-sm font-semibold last:border-r-0"
            >
              {milestone}
            </div>
          ))}
          {months.map((month) => (
            <div key={`${mode}:${month}`} className="contents">
              <div className="flex min-h-36 items-center justify-center border-b border-r border-slate-200 bg-slate-50 p-3 text-lg font-semibold">
                {month}
              </div>
              {boardMilestones.map((milestone) => {
                const cellCards = cards.filter((card) => card.milestone === milestone && cardMonth(card, mode) === month);

                return (
                  <div key={`${mode}:${month}:${milestone}`} className="min-h-36 border-b border-r border-slate-200 p-3 last:border-r-0">
                    <div className="grid gap-2">
                      {cellCards.length > 0 ? (
                        cellCards.map((card) => (
                          <button
                            key={`${mode}:${month}:${milestone}:${card.id}`}
                            type="button"
                            onClick={() => onOpenProject(card.projectId)}
                            title={card.name}
                            className={clsx("h-8 truncate rounded-full border px-3 text-sm font-medium shadow-sm transition hover:ring-2 hover:ring-blue-400", riskClass[card.riskLevel])}
                          >
                            {card.name}
                          </button>
                        ))
                      ) : (
                        <div className="flex h-8 items-center justify-center rounded-full border border-dashed border-slate-200 text-xs text-slate-400">
                          无项目
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WeekGuidePage({ tasks, projects, onOpenTask }: { tasks: GuideTask[]; projects: PrototypeProject[]; onOpenTask: (projectId: string, taskNo: number) => void }) {
  return (
    <div className="grid gap-3">
      {Object.entries(bucketMeta).map(([bucket, meta]) => {
        const bucketTasks = tasks.filter((task) => task.bucket === bucket);

        return (
          <section key={bucket} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">{meta.title}</h2>
                <div className="mt-1 text-xs text-slate-500">{meta.helper}</div>
              </div>
              <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{bucketTasks.length} 项</div>
            </div>
            <div className="mt-3 grid gap-2">
              {bucketTasks.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-400">暂无事项</div> : null}
              {bucketTasks.map((task) => {
                const project = projects.find((item) => item.id === task.projectId);

                return (
                  <button key={`${task.projectId}-${task.bucket}-${task.taskNo}`} type="button" onClick={() => onOpenTask(task.projectId, task.taskNo)} className="grid grid-cols-[1fr_1.2fr_120px_140px_32px] items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:bg-slate-50 max-lg:grid-cols-2 max-md:grid-cols-1">
                    <InfoPair label="项目" value={project?.name ?? task.projectId} strong />
                    <InfoPair label="任务" value={`#${task.taskNo} ${task.taskName}`} />
                    <InfoPair label="DDL" value={task.ddl} />
                    <InfoPair label="延期线" value={task.delayLine} />
                    <ArrowRight size={16} className="text-slate-400" />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProjectDetailPage({ project, setActivePage, onOpenTask }: { project: PrototypeProject; setActivePage: (page: PageKey) => void; onOpenTask: (projectId: string, taskNo: number) => void }) {
  const sortedTasks = [...project.tasks].sort((a, b) => a.no - b.no);
  const currentTask = sortedTasks.find((task) => task.name === project.currentTask);
  const riskTasks = sortedTasks.filter((task) => task.risk === "risk" || task.risk === "delay");
  const movedMilestones = milestones.filter((milestone) => project.planned[milestone] !== project.forecast[milestone]);
  const missingTaskNos = missingStandardTaskNos(sortedTasks);

  return (
    <div className="grid min-w-0 gap-3">
      <section className="grid min-w-0 grid-cols-[1.05fr_0.95fr] gap-3 max-xl:grid-cols-1">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-rose-700">{project.code}</div>
              <h2 className="mt-1 truncate text-lg font-semibold">{project.name}</h2>
              <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2 text-xs max-md:grid-cols-2">
                <InfoPair label="项目组" value={project.team} />
                <InfoPair label="IP" value={project.ip} />
                <InfoPair label="品类" value={project.productType} />
                <InfoPair label="产品研发" value={project.productOwner} />
                <InfoPair label="产品美术" value={project.artOwner} />
                <InfoPair label="版权方" value={project.licensor} />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <SmallButton icon={<CalendarDays size={14} />} label="规划" onClick={() => setActivePage("plan")} />
              <SmallButton icon={<Gauge size={14} />} label="压力预测" onClick={() => setActivePage("forecast")} />
              <SmallButton icon={<ListChecks size={14} />} label="本周指引" onClick={() => setActivePage("week")} />
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">排期总览</h3>
            <StatusPill status={project.riskLabel} risk={project.riskLabel.includes("必然") ? "delay" : project.riskLabel.includes("后移") ? "risk" : "normal"} />
          </div>
          <div className="grid grid-cols-[92px_1fr] items-center gap-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center">
              <div className="text-[11px] font-medium text-slate-500">进度</div>
              <div className="mt-0.5 text-lg font-semibold">{project.progress}%</div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs max-md:grid-cols-1">
              <InfoPair label="当前里程碑" value={project.currentMilestone} strong />
              <InfoPair label="当前任务" value={project.currentTask} strong />
              <InfoPair label="计划上线" value={project.plannedLaunch} />
              <InfoPair label="预测上线" value={project.forecastLaunch} strong={project.plannedLaunch !== project.forecastLaunch} />
            </div>
          </div>
          <div className="mt-2 line-clamp-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{project.riskMessage}</div>
        </div>
      </section>

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">全部项目任务</h3>
            <div className="mt-1 text-xs text-slate-500">共 {sortedTasks.length} 项，来自项目排期任务清单；点击任一任务进入工作台处理。</div>
            {missingTaskNos.length > 0 ? (
              <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                缺失任务编号：{missingTaskNos.join("、")}。需由项目排期初始化确认，产品组不要手动补任务编号。
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">当前：#{currentTask?.no ?? "-"} {project.currentTask}</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">风险任务 {riskTasks.length} 项</span>
          </div>
        </div>
        <div className="mt-3 overflow-auto">
          <div className="min-w-[1280px] text-sm">
            <div className="grid grid-cols-[64px_1.25fr_110px_86px_92px_100px_100px_100px_100px_100px_1.2fr_34px] gap-2 border-b border-slate-200 pb-2 text-xs font-semibold text-slate-500">
              <div>编号</div>
              <div>任务名称</div>
              <div>里程碑</div>
              <div>负责人</div>
              <div>状态</div>
              <div>计划完成</div>
              <div>预计完成</div>
              <div>实际完成</div>
              <div>DDL</div>
              <div>延期线</div>
              <div>判断依据</div>
              <div />
            </div>
            <div className="grid gap-1 pt-2">
              {sortedTasks.map((task) => (
                <button
                  key={task.no}
                  type="button"
                  onClick={() => onOpenTask(project.id, task.no)}
                  className={clsx(
                    "grid grid-cols-[64px_1.25fr_110px_86px_92px_100px_100px_100px_100px_100px_1.2fr_34px] items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50",
                    task.name === project.currentTask ? "bg-rose-50" : "bg-white",
                  )}
                >
                  <div className="font-semibold text-slate-500">#{task.no}</div>
                  <div className="font-semibold text-slate-900">{task.name}</div>
                  <div className="text-slate-600">{task.milestone}</div>
                  <div className="text-slate-600">{task.owner}</div>
                  <div><StatusPill status={task.status} risk={task.risk} /></div>
                  <div className="text-slate-600">{task.plannedFinish}</div>
                  <div className="text-slate-600">{task.expectedFinish}</div>
                  <div className="text-slate-600">{task.actualFinish ?? "-"}</div>
                  <div className="text-slate-600">{task.ddl}</div>
                  <div className={clsx("font-medium", task.risk === "risk" || task.risk === "delay" ? "text-amber-700" : "text-slate-600")}>{task.delayLine}</div>
                  <div className="truncate text-slate-600">{task.reason}</div>
                  <ArrowRight size={16} className="text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-[0.95fr_1.05fr] gap-3 max-xl:grid-cols-1">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold">规划 vs 压力预测</h3>
          <div className="mt-2 grid gap-2">
            {milestones.map((milestone) => (
              <div key={milestone} className="grid grid-cols-[110px_1fr_1fr] items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="font-medium text-slate-700">{milestone}</div>
                <InfoPair label="规划" value={project.planned[milestone] ?? "-"} />
                <InfoPair label="预测" value={project.forecast[milestone] ?? "-"} strong={project.planned[milestone] !== project.forecast[milestone]} />
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-500">{movedMilestones.length > 0 ? `${movedMilestones.length} 个里程碑预测后移。` : "规划和压力预测一致。"}</div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">建模进度摘要</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 max-md:grid-cols-1">
            <Metric label="总款式" value={`${project.modelingProgress.total || project.styles.length}`} />
            <Metric label="已通过" value={`${project.modelingProgress.approved}`} />
            <Metric label="进行中" value={`${project.modelingProgress.inProgress}`} />
            <Metric label="待验收/送审" value={`${project.modelingProgress.submitted}`} />
            <Metric label="外包中" value={`${project.modelingProgress.outsourced}`} />
            <Metric label="未分配/待确认" value={`${project.modelingProgress.unassigned}`} />
          </div>
          <div className="mt-3 grid gap-2">
            <div className="text-sm font-semibold text-slate-700">建模款式列表</div>
            {project.styles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-5 text-center text-sm text-slate-400">
                尚未读取到建模款式清单；提交成功后会在这里显示建模任务编号和款式编码。
              </div>
            ) : null}
            {project.styles.map((style) => (
              <div key={style.sequence} className="grid grid-cols-[44px_1fr_96px_1.2fr] items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm max-md:grid-cols-1">
                <div className="font-semibold text-slate-500">#{style.sequence}</div>
                <div>
                  <div className="font-semibold">{style.name}</div>
                  <div className="text-xs text-slate-500">
                    {style.isFirst ? "第一款" : "其余款"} / {style.required ? "必做" : "非必做"} / 图片 {style.referenceImageCount} 张
                  </div>
                  <div className="truncate text-xs text-slate-400" title={style.modelingTaskId ?? style.styleCode ?? ""}>
                    {style.modelingTaskId ? `建模任务 ${style.modelingTaskId}` : style.styleCode ? `款式编码 ${style.styleCode}` : "等待建模返回正式编号"}
                  </div>
                </div>
                <StatusPill status={style.status} risk={style.status.includes("待确认") || style.status.includes("退回") ? "risk" : style.status.includes("通过") ? "done" : "normal"} />
                <div className="text-xs text-slate-500">{style.latestFeedback}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-[1fr_1fr] gap-3 max-xl:grid-cols-1">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">最近进度记录</h3>
          <div className="mt-3 grid gap-2">
            {project.updates.map((update) => (
              <div key={update} className="flex gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700">
                <Clock3 className="mt-0.5 shrink-0 text-slate-400" size={15} />
                {update}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => currentTask && onOpenTask(project.id, currentTask.no)} className="mt-4 h-9 w-full rounded-lg border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700 hover:bg-rose-100">
            进入当前任务工作台
          </button>
        </div>
      </section>
    </div>
  );
}

function missingStandardTaskNos(tasks: PrototypeTask[]) {
  const existingNos = new Set(tasks.map((task) => task.no));
  return standardTaskNos.filter((taskNo) => !existingNos.has(taskNo));
}

function NavTile({ icon, title, value, onClick }: { icon: React.ReactNode; title: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:bg-slate-50">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function InfoPair({ label, value, strong }: { label: string; value?: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className={clsx("mt-0.5 truncate text-sm", strong ? "font-semibold text-slate-950" : "font-medium text-slate-600")}>{value || "-"}</div>
    </div>
  );
}

function SmallButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ status, risk }: { status: string; risk: RiskLevel }) {
  return <span className={clsx("inline-flex rounded-full border px-2 py-1 text-xs font-semibold", riskClass[risk])}>{status}</span>;
}

function cardMonth(card: ProjectCard, mode: "plan" | "forecast") {
  return mode === "plan" ? card.plannedMonth ?? card.month : card.forecastMonth ?? card.month;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
