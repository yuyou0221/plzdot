"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Database, ListChecks, PlusCircle, RefreshCw, Trash2 } from "lucide-react";

type MockKind = "taskFactEvents" | "styleSubmissions" | "styleStartEvents" | "reviewResults";
type MockActionKey =
  | "complete"
  | "progress"
  | "expected-finish"
  | "block"
  | "unblock"
  | "submit-review"
  | "style-list"
  | "task-7-start"
  | "task-10-start"
  | "modeling-review";

type MockEntry = {
  id: string;
  kind: MockKind;
  receivedAt: string;
  payload: Record<string, unknown>;
};

type MockSnapshot = Record<MockKind, MockEntry[]>;

type ApiSnapshotResponse = {
  ok?: boolean;
  snapshot?: MockSnapshot;
  message?: string;
};

type MockActionMeta = {
  key: MockActionKey;
  title: string;
  target: string;
  output: string;
  description: string;
};

type SimulationContext = {
  projectId: string;
  projectName: string;
  firstTaskId: string;
  remainingTaskId: string;
  operatorName: string;
  occurredAt: string;
  date: string;
  firstModelingTaskId: string;
};

type SimulationRequest = {
  label: string;
  path: string;
  payload: Record<string, unknown>;
};

type ExecutedSimulationRequest = SimulationRequest & {
  response: Record<string, unknown>;
};

type LastSimulation = {
  title: string;
  summary: string;
  requests: ExecutedSimulationRequest[];
};

const mockDate = "2026-05-29";
const mockOccurredAt = "2026-05-29T10:30:00+08:00";
const mockOperatorId = "mock-user-001";

const emptySnapshot: MockSnapshot = {
  taskFactEvents: [],
  styleSubmissions: [],
  styleStartEvents: [],
  reviewResults: [],
};

const mockActions: MockActionMeta[] = [
  {
    key: "complete",
    title: "标记完成",
    target: "项目排期",
    output: "task_completed",
    description: "模拟任务完成后，产品组提交实际完成日期。",
  },
  {
    key: "progress",
    title: "更新进度",
    target: "项目排期",
    output: "task_started",
    description: "默认模拟未开始任务被更新为进行中。",
  },
  {
    key: "expected-finish",
    title: "更新预计时间",
    target: "项目排期",
    output: "task_expected_finish_updated",
    description: "提交新的预计完成日期，供排期内核重算。",
  },
  {
    key: "block",
    title: "标记阻塞",
    target: "项目排期",
    output: "task_blocked",
    description: "提交阻塞原因和预计恢复/完成时间。",
  },
  {
    key: "unblock",
    title: "解除阻塞",
    target: "项目排期",
    output: "task_unblocked",
    description: "提交阻塞解除说明，并恢复为进行中。",
  },
  {
    key: "submit-review",
    title: "任务送审",
    target: "项目排期",
    output: "task_submitted_for_review",
    description: "记录任务已送审、送审日期和预计反馈日期。",
  },
  {
    key: "style-list",
    title: "录入款式清单",
    target: "建模排期",
    output: "style-submissions",
    description: "提交两条款式，并标记第一款建模款式。",
  },
  {
    key: "task-7-start",
    title: "任务 7 启动",
    target: "项目排期 + 建模排期",
    output: "task_started + first-style",
    description: "任务 7 开始时，同时通知建模排期启动第一款。",
  },
  {
    key: "task-10-start",
    title: "任务 10 启动",
    target: "项目排期 + 建模排期",
    output: "task_started + remaining-styles",
    description: "任务 10 开始时，同时通知建模排期启动其余款式。",
  },
  {
    key: "modeling-review",
    title: "建模审核结果",
    target: "建模排期",
    output: "review-results",
    description: "模拟产品美术提交内部通过可送审。",
  },
];

const sectionMeta: Record<MockKind, { title: string; helper: string }> = {
  taskFactEvents: {
    title: "项目排期接收",
    helper: "ProjectTaskFactEvent / task-fact-events",
  },
  styleSubmissions: {
    title: "款式清单提交",
    helper: "modeling/style-submissions",
  },
  styleStartEvents: {
    title: "建模启动事件",
    helper: "modeling/style-start-events",
  },
  reviewResults: {
    title: "审核 / 送审结果",
    helper: "modeling/review-results",
  },
};

export function ProductGuideMockLab({ currentUserName }: { currentUserName: string }) {
  const [snapshot, setSnapshot] = useState<MockSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState("");
  const [readableData, setReadableData] = useState<Record<string, unknown> | null>(null);
  const [lastSimulation, setLastSimulation] = useState<LastSimulation | null>(null);

  const counts = useMemo(
    () => ({
      taskFactEvents: snapshot.taskFactEvents.length,
      styleSubmissions: snapshot.styleSubmissions.length,
      styleStartEvents: snapshot.styleStartEvents.length,
      reviewResults: snapshot.reviewResults.length,
    }),
    [snapshot],
  );

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setSnapshot(await fetchSnapshot());
      setMessage("已刷新本地模拟记录。");
    } catch {
      setMessage("读取模拟记录失败。");
    } finally {
      setLoading(false);
    }
  }

  async function clear() {
    setLoading(true);
    try {
      const response = await fetch("/api/product-guide/mock-lab", { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as ApiSnapshotResponse;

      if (!response.ok || !result.ok) {
        setMessage(result.message ?? "清空模拟记录失败。");
        return;
      }

      setSnapshot(emptySnapshot);
      setReadableData(null);
      setLastSimulation(null);
      setMessage(result.message ?? "已清空本地模拟记录。");
    } catch {
      setMessage("清空模拟记录失败。");
    } finally {
      setLoading(false);
    }
  }

  async function simulateInput(actionKey: MockActionKey) {
    const action = mockActions.find((item) => item.key === actionKey);
    if (!action) return;

    await runSimulationSequence([actionKey], action.title);
  }

  async function seedSample() {
    await runSimulationSequence(
      mockActions.map((action) => action.key),
      "全链路样例",
    );
  }

  async function runSimulationSequence(actionKeys: MockActionKey[], title: string) {
    setLoading(true);
    const context = buildSimulationContext(projectId.trim() || latestProjectId(snapshot), currentUserName);

    try {
      const requests = actionKeys.flatMap((actionKey) => buildSimulationRequests(actionKey, context));
      const executedRequests: ExecutedSimulationRequest[] = [];

      for (const request of requests) {
        executedRequests.push({
          ...request,
          response: await postJson(request.path, request.payload),
        });
      }

      const nextSnapshot = await fetchSnapshot();
      const readable = await fetchReadableData(context.projectId);

      setSnapshot(nextSnapshot);
      setProjectId(context.projectId);
      setReadableData(readable);
      setLastSimulation({
        title,
        summary: `已模拟 ${actionKeys.length} 类输入，实际提交 ${executedRequests.length} 条信息。`,
        requests: executedRequests,
      });
      setMessage(`已模拟：${title}。下方可查看业务事件和提交内容。`);
    } catch (error) {
      setMessage(error instanceof Error && error.message ? `模拟失败：${error.message}` : "模拟失败。");
    } finally {
      setLoading(false);
    }
  }

  async function loadReadableData(projectIdOverride?: string) {
    const targetProjectId = projectIdOverride?.trim() || projectId.trim() || latestProjectId(snapshot);
    if (!targetProjectId) {
      setMessage("请先输入项目 ID，或先模拟一条款式清单。");
      return;
    }

    setLoading(true);
    try {
      setProjectId(targetProjectId);
      setReadableData(await fetchReadableData(targetProjectId));
      setMessage("已读取建模排期模拟可读数据。");
    } catch {
      setMessage("读取建模排期模拟可读数据失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] px-6 py-5 text-slate-950">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">产品组工作指引 / 本地联调</div>
          <h1 className="mt-1 text-2xl font-semibold">输入测试台</h1>
          <div className="mt-1 text-sm text-slate-500">当前账号：{currentUserName}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/product-guide"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ListChecks size={16} />
            打开工作指引
          </a>
          <button
            type="button"
            onClick={seedSample}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <PlusCircle size={16} />
            生成全链路样例
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Trash2 size={16} />
            清空
          </button>
        </div>
      </header>

      {message ? <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{message}</div> : null}

      <section className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="任务事实事件" value={counts.taskFactEvents} />
        <Metric label="款式清单" value={counts.styleSubmissions} />
        <Metric label="建模启动" value={counts.styleStartEvents} />
        <Metric label="审核结果" value={counts.reviewResults} />
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">写入型输入模拟</h2>
            <div className="mt-1 text-sm text-slate-500">每个按钮代表产品组工作指引的一类输入。点击后会模拟实际要提交的事件或数据。</div>
          </div>
          <div className="text-xs text-slate-500">当前项目：{projectId || "自动生成"}</div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {mockActions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => simulateInput(action.key)}
              disabled={loading}
              className="grid min-h-[132px] content-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-rose-200 hover:bg-rose-50 disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-950">{action.title}</span>
                <PlusCircle size={16} className="text-slate-400" />
              </div>
              <span className="text-xs font-medium text-slate-500">{action.target}</span>
              <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-rose-700">{action.output}</span>
              <span className="text-xs leading-5 text-slate-500">{action.description}</span>
            </button>
          ))}
        </div>
      </section>

      {lastSimulation ? <SimulationResultPanel result={lastSimulation} /> : null}

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-[320px] flex-1 gap-1 text-xs font-medium text-slate-500">
            项目 ID
            <input
              value={projectId}
              placeholder="可留空，默认读取最近一条款式清单的 projectId"
              onChange={(event) => setProjectId(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <button
            type="button"
            onClick={() => loadReadableData()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            <Database size={16} />
            读取建模可读数据
          </button>
        </div>
        {readableData ? <JsonBlock value={readableData} /> : null}
      </section>

      <main className="mt-4 grid gap-4 xl:grid-cols-2">
        {(Object.keys(sectionMeta) as MockKind[]).map((kind) => (
          <MockSection key={kind} kind={kind} entries={snapshot[kind]} />
        ))}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

function SimulationResultPanel({ result }: { result: LastSimulation }) {
  return (
    <section className="mt-4 rounded-lg border border-rose-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">最近一次模拟结果：{result.title}</h2>
          <div className="mt-1 text-sm text-slate-500">{result.summary}</div>
        </div>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">{result.requests.length} 条提交</span>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {result.requests.map((request, index) => (
          <article key={`${request.path}:${index}`} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">{request.label}</div>
                <div className="mt-0.5 text-xs text-slate-500">{request.path}</div>
              </div>
              <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-emerald-700">
                {request.response.ok === false ? "失败" : "成功"}
              </span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <JsonBlock title="提交信息" value={request.payload} />
              <JsonBlock title="模拟返回" value={request.response} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MockSection({ kind, entries }: { kind: MockKind; entries: MockEntry[] }) {
  const meta = sectionMeta[kind];

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{meta.title}</h2>
          <div className="mt-1 text-xs text-slate-500">{meta.helper}</div>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{entries.length}</span>
      </div>
      <div className="mt-3 grid max-h-[520px] gap-3 overflow-auto pr-1">
        {entries.length > 0 ? (
          entries.map((entry) => <EntryBlock key={entry.id} entry={entry} />)
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">暂无记录。</div>
        )}
      </div>
    </section>
  );
}

function EntryBlock({ entry }: { entry: MockEntry }) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
          <BarChart3 size={14} />
          {entryTitle(entry)}
        </span>
        <span>{entry.receivedAt}</span>
      </div>
      <JsonBlock value={entry.payload} />
    </article>
  );
}

function JsonBlock({ value, title }: { value: unknown; title?: string }) {
  return (
    <div className="min-w-0">
      {title ? <div className="mb-1 text-xs font-semibold text-slate-500">{title}</div> : null}
      <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function entryTitle(entry: MockEntry) {
  const payload = entry.payload;
  const eventType = typeof payload.eventType === "string" ? payload.eventType : "";
  const reviewResult = typeof payload.reviewResult === "string" ? payload.reviewResult : "";
  const startScope = typeof payload.startScope === "string" ? payload.startScope : "";
  const projectName = typeof payload.projectName === "string" ? payload.projectName : "";

  return eventType || reviewResult || startScope || projectName || entry.kind;
}

async function fetchSnapshot() {
  const response = await fetch("/api/product-guide/mock-lab", { cache: "no-store" });
  const result = (await response.json().catch(() => ({}))) as ApiSnapshotResponse;

  if (!response.ok || !result.ok || !result.snapshot) {
    throw new Error(result.message ?? "读取模拟记录失败。");
  }

  return result.snapshot;
}

async function fetchReadableData(projectId: string) {
  const [stylesResponse, progressResponse] = await Promise.all([
    fetch(`/api/modeling/projects/${encodeURIComponent(projectId)}/styles`, { cache: "no-store" }),
    fetch(`/api/modeling/projects/${encodeURIComponent(projectId)}/progress`, { cache: "no-store" }),
  ]);
  const [styles, progress] = await Promise.all([stylesResponse.json(), progressResponse.json()]);

  return { styles, progress };
}

async function postJson(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok || result.ok === false) {
    throw new Error(typeof result.message === "string" ? result.message : `Request failed: ${path}`);
  }

  return result;
}

function buildSimulationContext(projectId: string, operatorName: string): SimulationContext {
  const targetProjectId = projectId || `mock-project-input-${Date.now()}`;
  const firstTaskId = `${targetProjectId}-task-7`;

  return {
    projectId: targetProjectId,
    projectName: "产品组输入测试项目",
    firstTaskId,
    remainingTaskId: `${targetProjectId}-task-10`,
    operatorName,
    occurredAt: mockOccurredAt,
    date: mockDate,
    firstModelingTaskId: mockModelingTaskId(targetProjectId, firstTaskId, "ST-001", "1"),
  };
}

function buildSimulationRequests(actionKey: MockActionKey, context: SimulationContext): SimulationRequest[] {
  if (actionKey === "complete") {
    return [
      taskFactEventRequest("标记完成 -> 项目排期任务事实", context, {
        eventType: "task_completed",
        taskNo: 6,
        taskName: "原画最终确认",
        payload: {
          actualStartDate: "2026-05-24",
          actualFinishDate: context.date,
          status: "已完成",
          note: "产品组确认该任务已经完成。",
        },
      }),
    ];
  }

  if (actionKey === "progress") {
    return [
      taskFactEventRequest("更新进度 -> 项目排期任务事实", context, {
        eventType: "task_started",
        taskNo: 4,
        taskName: "版权方确认原画方向",
        payload: {
          actualStartDate: context.date,
          status: "进行中",
          note: "已开始推进，等待版权方反馈。",
        },
      }),
    ];
  }

  if (actionKey === "expected-finish") {
    return [
      taskFactEventRequest("更新预计时间 -> 项目排期任务事实", context, {
        eventType: "task_expected_finish_updated",
        taskNo: 4,
        taskName: "版权方确认原画方向",
        payload: {
          expectedFinishDate: "2026-06-05",
          status: "进行中",
          note: "版权方反馈较慢，预计下周五完成。",
        },
      }),
    ];
  }

  if (actionKey === "block") {
    return [
      taskFactEventRequest("标记阻塞 -> 项目排期任务事实", context, {
        eventType: "task_blocked",
        taskNo: 5,
        taskName: "版权方反馈修改意见",
        payload: {
          status: "阻塞",
          blockReason: "等待版权方反馈",
          expectedFinishDate: "2026-06-10",
          note: "已催版权方，需要产品组继续跟进。",
        },
      }),
    ];
  }

  if (actionKey === "unblock") {
    return [
      taskFactEventRequest("解除阻塞 -> 项目排期任务事实", context, {
        eventType: "task_unblocked",
        taskNo: 5,
        taskName: "版权方反馈修改意见",
        payload: {
          status: "进行中",
          expectedFinishDate: "2026-06-04",
          note: "版权方已反馈，恢复推进。",
        },
      }),
    ];
  }

  if (actionKey === "submit-review") {
    return [
      taskFactEventRequest("任务送审 -> 项目排期任务事实", context, {
        eventType: "task_submitted_for_review",
        taskNo: 6,
        taskName: "原画提交版权方审核",
        payload: {
          actualStartDate: "2026-05-24",
          submittedAt: context.date,
          expectedFinishDate: "2026-06-03",
          status: "送审中",
          reviewTarget: "版权方",
          note: "已提交版权方审核。",
        },
      }),
    ];
  }

  if (actionKey === "style-list") {
    return [styleSubmissionRequest(context)];
  }

  if (actionKey === "task-7-start") {
    return [
      taskFactEventRequest("任务 7 开始 -> 项目排期任务事实", context, {
        eventType: "task_started",
        taskNo: 7,
        taskName: "精细建模确认风格",
        payload: {
          actualStartDate: context.date,
          status: "进行中",
          note: "任务 7 启动，第一款建模款式可以进入建模排期。",
        },
      }),
      styleStartRequest("任务 7 开始 -> 建模排期启动第一款", context, 7),
    ];
  }

  if (actionKey === "task-10-start") {
    return [
      taskFactEventRequest("任务 10 开始 -> 项目排期任务事实", context, {
        eventType: "task_started",
        taskNo: 10,
        taskName: "其余款式建模推进",
        payload: {
          actualStartDate: context.date,
          status: "进行中",
          note: "任务 10 启动，其余建模款式可以进入建模排期。",
        },
      }),
      styleStartRequest("任务 10 开始 -> 建模排期启动其余款式", context, 10),
    ];
  }

  return [modelingReviewRequest(context)];
}

function taskFactEventRequest(
  label: string,
  context: SimulationContext,
  options: {
    eventType: string;
    taskNo: number;
    taskName: string;
    payload: Record<string, unknown>;
  },
): SimulationRequest {
  return {
    label,
    path: "/api/schedule/task-fact-events",
    payload: {
      eventId: createRequestId("event"),
      eventType: options.eventType,
      sourceModule: "product-guide",
      projectId: context.projectId,
      taskNo: options.taskNo,
      taskKey: `#${options.taskNo}`,
      taskName: options.taskName,
      occurredAt: context.occurredAt,
      operatorId: mockOperatorId,
      operatorName: context.operatorName,
      payload: options.payload,
    },
  };
}

function styleSubmissionRequest(context: SimulationContext): SimulationRequest {
  return {
    label: "录入款式清单 -> 建模排期创建未启动款式任务",
    path: "/api/modeling/style-submissions",
    payload: {
      sourceRequestId: createRequestId("styles"),
      submittedAt: context.occurredAt,
      submittedByUserId: mockOperatorId,
      submittedByName: context.operatorName,
      projectId: context.projectId,
      projectName: context.projectName,
      projectTaskId: context.firstTaskId,
      taskNo: 7,
      firstStyleProjectTaskId: context.firstTaskId,
      remainingStylesProjectTaskId: context.remainingTaskId,
      note: "原画里程碑完成后，产品组提交完整建模款式清单。",
      styles: [
        {
          sourceStyleId: "style-source-001",
          styleCode: "ST-001",
          styleName: "主角标准款",
          styleSequence: 1,
          isRequired: true,
          isFirstModelingStyle: true,
          projectTaskId: context.firstTaskId,
          taskNo: 7,
          productType: "手办",
          difficulty: "中",
          estimatedWorkdays: 7,
          originalArtStatus: "已过审",
          originalArtApprovedDate: context.date,
          referenceImageUrls: [{ name: "主角原画", url: "https://example.com/mock-style-001.png", type: "原画图" }],
          notes: "第一款建模款式，由任务 7 启动。",
        },
        {
          sourceStyleId: "style-source-002",
          styleCode: "ST-002",
          styleName: "武器配件款",
          styleSequence: 2,
          isRequired: true,
          isFirstModelingStyle: false,
          projectTaskId: context.remainingTaskId,
          taskNo: 10,
          productType: "手办",
          difficulty: "低",
          estimatedWorkdays: 4,
          originalArtStatus: "已过审",
          originalArtApprovedDate: context.date,
          referenceImageUrls: [{ name: "武器参考", url: "https://example.com/mock-style-002.png", type: "参考图" }],
          notes: "其余建模款式，由任务 10 启动。",
        },
      ],
    },
  };
}

function styleStartRequest(label: string, context: SimulationContext, taskNo: 7 | 10): SimulationRequest {
  return {
    label,
    path: "/api/modeling/style-start-events",
    payload: {
      sourceRequestId: createRequestId("start"),
      projectId: context.projectId,
      projectTaskId: taskNo === 7 ? context.firstTaskId : context.remainingTaskId,
      taskNo,
      taskName: taskNo === 7 ? "精细建模确认风格" : "其余款式建模推进",
      startScope: taskNo === 7 ? "first-style" : "remaining-styles",
      startedAt: context.occurredAt,
      startedByUserId: mockOperatorId,
      startedByName: context.operatorName,
    },
  };
}

function modelingReviewRequest(context: SimulationContext): SimulationRequest {
  return {
    label: "建模审核结果 -> 建模排期更新款式状态",
    path: "/api/modeling/review-results",
    payload: {
      sourceRequestId: createRequestId("review"),
      projectId: context.projectId,
      projectTaskId: context.firstTaskId,
      modelingTaskId: context.firstModelingTaskId,
      reviewResult: "内部通过可送审",
      reviewAt: "2026-05-30",
      reviewerId: mockOperatorId,
      reviewerName: context.operatorName,
      feedbackContent: "内部审核通过，可以提交版权方送审。",
    },
  };
}

function latestProjectId(snapshot: MockSnapshot) {
  for (const group of [snapshot.styleSubmissions, snapshot.styleStartEvents, snapshot.reviewResults, snapshot.taskFactEvents]) {
    const projectId = group.find((entry) => typeof entry.payload.projectId === "string")?.payload.projectId;
    if (typeof projectId === "string" && projectId.trim()) {
      return projectId.trim();
    }
  }

  return "";
}

function createRequestId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `product-guide:mock:${prefix}:${id}`;
}

function mockModelingTaskId(projectId: string, projectTaskId: string, styleCode: string, styleSequence: string) {
  return `mock-${safeId(projectId)}-${safeId(projectTaskId)}-${safeId(styleCode || styleSequence)}`;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "item";
}
