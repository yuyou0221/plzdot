"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Database, ListChecks, PlusCircle, RefreshCw, Trash2 } from "lucide-react";

type MockKind = "taskFactEvents" | "styleSubmissions" | "styleStartEvents" | "reviewResults";

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

const emptySnapshot: MockSnapshot = {
  taskFactEvents: [],
  styleSubmissions: [],
  styleStartEvents: [],
  reviewResults: [],
};

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
      const response = await fetch("/api/product-guide/mock-lab", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as ApiSnapshotResponse;

      if (!response.ok || !result.ok || !result.snapshot) {
        setMessage(result.message ?? "读取模拟记录失败。");
        return;
      }

      setSnapshot(result.snapshot);
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
      setMessage(result.message ?? "已清空本地模拟记录。");
    } catch {
      setMessage("清空模拟记录失败。");
    } finally {
      setLoading(false);
    }
  }

  async function seedSample() {
    setLoading(true);
    const sampleProjectId = `mock-project-${Date.now()}`;
    const projectTaskId = `${sampleProjectId}-task-7`;
    const occurredAt = "2026-05-29T10:30:00+08:00";
    const firstModelingTaskId = `mock-${safeId(sampleProjectId)}-${safeId(projectTaskId)}-ST-001`;

    try {
      await postJson("/api/schedule/task-fact-events", {
        eventId: crypto.randomUUID(),
        eventType: "task_started",
        sourceModule: "product-guide",
        projectId: sampleProjectId,
        taskNo: 7,
        taskKey: "#7",
        taskName: "精细建模确认风格",
        occurredAt,
        operatorId: "mock-user-001",
        operatorName: currentUserName,
        payload: {
          actualStartDate: "2026-05-29",
          status: "进行中",
          note: "联调台生成的任务开始样例。",
        },
      });

      await postJson("/api/modeling/style-submissions", {
        sourceRequestId: crypto.randomUUID(),
        submittedAt: occurredAt,
        submittedByUserId: "mock-user-001",
        submittedByName: currentUserName,
        projectId: sampleProjectId,
        projectName: "联调测试项目",
        projectTaskId,
        taskNo: 7,
        styles: [
          {
            sourceStyleId: "style-source-001",
            styleCode: "ST-001",
            styleName: "主角标准款",
            styleSequence: 1,
            isRequired: true,
            isFirstModelingStyle: true,
            difficulty: "中",
            estimatedWorkdays: 7,
            originalArtApprovedDate: "2026-05-29",
            referenceImageUrls: [{ name: "主角原画", url: "https://example.com/mock-style-001.png", type: "原画图" }],
            notes: "第一款建模启动样例。",
          },
          {
            sourceStyleId: "style-source-002",
            styleCode: "ST-002",
            styleName: "武器配件款",
            styleSequence: 2,
            isRequired: true,
            isFirstModelingStyle: false,
            difficulty: "低",
            estimatedWorkdays: 4,
            originalArtApprovedDate: "2026-05-29",
            referenceImageUrls: [{ name: "武器参考", url: "https://example.com/mock-style-002.png", type: "参考图" }],
          },
        ],
      });

      await postJson("/api/modeling/style-start-events", {
        sourceRequestId: crypto.randomUUID(),
        projectId: sampleProjectId,
        projectTaskId,
        taskNo: 7,
        taskName: "精细建模确认风格",
        startScope: "first-style",
        startedAt: occurredAt,
        startedByUserId: "mock-user-001",
        startedByName: currentUserName,
      });

      await postJson("/api/modeling/review-results", {
        sourceRequestId: crypto.randomUUID(),
        projectId: sampleProjectId,
        projectTaskId,
        modelingTaskId: firstModelingTaskId,
        reviewResult: "内部通过可送审",
        reviewAt: "2026-05-30",
        reviewerId: "mock-user-001",
        reviewerName: currentUserName,
        feedbackContent: "联调样例：内部审核通过，可以送审。",
      });

      setProjectId(sampleProjectId);
      await refresh();
      await loadReadableData(sampleProjectId);
      setMessage("已生成一组本地联调样例，并读取建模排期模拟可读数据。");
    } catch {
      setMessage("生成联调样例失败。");
    } finally {
      setLoading(false);
    }
  }

  async function loadReadableData(projectIdOverride?: string) {
    const targetProjectId = projectIdOverride?.trim() || projectId.trim() || latestProjectId(snapshot);
    if (!targetProjectId) {
      setMessage("请先输入项目 ID，或先从产品组页面提交一条款式清单。");
      return;
    }

    setLoading(true);
    try {
      const [stylesResponse, progressResponse] = await Promise.all([
        fetch(`/api/modeling/projects/${encodeURIComponent(targetProjectId)}/styles`, { cache: "no-store" }),
        fetch(`/api/modeling/projects/${encodeURIComponent(targetProjectId)}/progress`, { cache: "no-store" }),
      ]);
      const [styles, progress] = await Promise.all([stylesResponse.json(), progressResponse.json()]);

      setProjectId(targetProjectId);
      setReadableData({ styles, progress });
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
          <h1 className="mt-1 text-2xl font-semibold">模块模拟联调台</h1>
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
            生成样例
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
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
            暂无记录。
          </div>
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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
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

function latestProjectId(snapshot: MockSnapshot) {
  for (const group of [snapshot.styleSubmissions, snapshot.styleStartEvents, snapshot.reviewResults, snapshot.taskFactEvents]) {
    const projectId = group.find((entry) => typeof entry.payload.projectId === "string")?.payload.projectId;
    if (typeof projectId === "string" && projectId.trim()) {
      return projectId.trim();
    }
  }

  return "";
}

async function postJson(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Request failed: ${path}`);
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "item";
}
