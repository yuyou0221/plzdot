"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Database, FileJson, ShieldAlert } from "lucide-react";
import { AccountPanel } from "@/components/auth/account-panel";
import type { AuthUser } from "@/lib/auth/permissions";

type TestImportPreview = {
  payloadPath: string | null;
  sourceFileName: string;
  incoming: {
    projects: number;
    projectTasks: number;
    futureTasks: number;
  };
  clearScope: {
    projects: number;
    projectTasks: number;
    scheduleRuns: number;
    scheduleTaskResults: number;
    taskCards: number;
    alerts: number;
    progressUpdates: number;
  };
};

type TestImportResponse = {
  ok: boolean;
  message: string;
  preview?: TestImportPreview;
  confirmationText?: string;
  result?: {
    runId: string;
    projects: number;
    projectTasks: number;
    futureTasks: number;
  };
};

export function ScheduleTestImportWorkbench({ currentUser }: { currentUser: AuthUser }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<TestImportPreview | null>(null);
  const [confirmationText, setConfirmationText] = useState("确认全量替换测试数据");
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [tone, setTone] = useState<"info" | "warning" | "error">("info");

  const isAdmin = currentUser.authRole === "admin";
  const canApply = isAdmin && Boolean(preview) && confirmation === confirmationText && !isBusy;

  async function submit(action: "preview" | "apply") {
    if (!file) {
      setTone("warning");
      setMessage("请上传 JSON 文件。");
      return;
    }

    setIsBusy(true);
    setTone("info");
    setMessage(action === "preview" ? "正在生成测试导入预览。" : "正在执行测试数据全量替换。");

    const formData = new FormData();
    formData.set("action", action);
    formData.set("confirmation", confirmation);
    if (file) formData.set("file", file);

    try {
      const response = await fetch("/api/schedule/test-import-actual", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as TestImportResponse;

      if (!response.ok || !result.ok) {
        setTone("error");
        setMessage(result.message || "测试导入失败。");
        if (result.preview) setPreview(result.preview);
        if (result.confirmationText) setConfirmationText(result.confirmationText);
        return;
      }

      setTone("info");
      setMessage(result.message);
      if (result.preview) setPreview(result.preview);
      if (result.confirmationText) setConfirmationText(result.confirmationText);
      if (action === "apply") router.refresh();
    } catch {
      setTone("error");
      setMessage("测试导入接口暂时不可用。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-4 py-5 max-xl:border-b max-xl:border-r-0">
          <div className="border-b border-slate-200 pb-5">
            <div className="text-lg font-semibold">项目经营管理中台</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">P0 工程版 · {currentUser.name}</div>
          </div>
          <nav className="mt-5 grid gap-2">
            <SideButton label="项目排期" badge="P0" onClick={() => router.push("/")} />
            <SideButton label="数据导入" badge="预览" onClick={() => router.push("/imports")} />
            <button className="flex h-10 items-center justify-between rounded-lg bg-rose-50 px-3 text-sm font-semibold text-rose-700">
              测试工具
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs">Admin</span>
            </button>
          </nav>
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="min-w-0 px-6 py-5 max-md:px-4">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
                <ShieldAlert size={15} />
                Admin 测试功能
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">项目排期测试数据导入</h1>
              <div className="mt-2 text-sm text-slate-500">旧 JS 输出 JSON · 全量替换测试数据</div>
            </div>
          </header>

          {!isAdmin ? (
            <section className="mt-5 rounded-lg border border-red-200 bg-white p-5 text-sm text-red-700">
              当前账号没有权限执行测试数据导入。
            </section>
          ) : (
            <>
              <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
                  <div>
                    <label className="text-sm font-semibold text-slate-700" htmlFor="actual-json-file">
                      JSON 文件
                    </label>
                    <input
                      id="actual-json-file"
                      type="file"
                      accept=".json"
                      onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null);
                        setPreview(null);
                        setMessage(null);
                      }}
                      className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                    />
                  </div>
                  <div className="self-end">
                    <button
                      type="button"
                      onClick={() => submit("preview")}
                      disabled={isBusy}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <FileJson size={16} />
                      {isBusy ? "处理中" : "生成预览"}
                    </button>
                  </div>
                </div>
              </section>

              {message ? (
                <div
                  className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                    tone === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : tone === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {message}
                </div>
              ) : null}

              {preview ? (
                <>
                  <section className="mt-5 grid gap-4 xl:grid-cols-3">
                    <SummaryTile label="将导入项目" value={preview.incoming.projects} />
                    <SummaryTile label="将导入任务" value={preview.incoming.projectTasks} />
                    <SummaryTile label="未来任务" value={preview.incoming.futureTasks} />
                  </section>

                  <section className="mt-5 rounded-lg border border-amber-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <AlertTriangle size={16} />
                      将清空并重建的测试数据
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <ScopeTile label="项目" value={preview.clearScope.projects} />
                      <ScopeTile label="项目任务" value={preview.clearScope.projectTasks} />
                      <ScopeTile label="测算批次" value={preview.clearScope.scheduleRuns} />
                      <ScopeTile label="任务结果" value={preview.clearScope.scheduleTaskResults} />
                      <ScopeTile label="任务卡" value={preview.clearScope.taskCards} />
                      <ScopeTile label="提醒" value={preview.clearScope.alerts} />
                      <ScopeTile label="进度记录" value={preview.clearScope.progressUpdates} />
                      <ScopeTile label="来源" value={preview.sourceFileName} />
                    </div>
                  </section>

                  <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div>
                        <label className="text-sm font-semibold text-slate-700" htmlFor="confirmation">
                          确认短语
                        </label>
                        <input
                          id="confirmation"
                          value={confirmation}
                          onChange={(event) => setConfirmation(event.target.value)}
                          placeholder={confirmationText}
                          className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => submit("apply")}
                        disabled={!canApply}
                        className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Database size={16} />
                        全量替换测试数据
                      </button>
                    </div>
                  </section>
                </>
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function SideButton({ label, badge, onClick }: { label: string; badge: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
    >
      {label}
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{badge}</span>
    </button>
  );
}

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ScopeTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
