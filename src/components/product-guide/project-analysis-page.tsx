import Link from "next/link";
import clsx from "clsx";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Gauge,
  ListChecks,
  Palette,
} from "lucide-react";
import { AccountPanel } from "@/components/auth/account-panel";
import { canAccessUserData, type AuthUser } from "@/lib/auth/permissions";
import type {
  ProjectAnalysisData,
  ProjectAnalysisMetric,
  ProjectAnalysisRiskLevel,
  ProjectAnalysisTask,
} from "@/lib/project-analysis-types";

const riskBadgeClass: Record<ProjectAnalysisRiskLevel, string> = {
  done: "bg-emerald-100 text-emerald-800",
  doneLate: "bg-emerald-700 text-white",
  normal: "bg-slate-100 text-slate-700",
  risk: "bg-amber-100 text-amber-900",
  delay: "bg-rose-100 text-rose-800",
};

const riskRowClass: Record<ProjectAnalysisRiskLevel, string> = {
  done: "bg-emerald-50/40",
  doneLate: "bg-emerald-50",
  normal: "bg-white",
  risk: "bg-amber-50/60",
  delay: "bg-rose-50/70",
};

const metricClass: Record<ProjectAnalysisMetric["tone"], string> = {
  neutral: "border-slate-200 bg-white",
  good: "border-emerald-200 bg-emerald-50",
  warning: "border-amber-200 bg-amber-50",
  danger: "border-rose-200 bg-rose-50",
};

export function ProjectAnalysisPage({ currentUser, data }: { currentUser: AuthUser; data: ProjectAnalysisData }) {
  const canOpenUserData = canAccessUserData(currentUser);

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-4 py-5 max-xl:border-b max-xl:border-r-0">
          <div className="border-b border-slate-200 pb-5">
            <div className="text-lg font-semibold">项目经营管理中台</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">P0 工程版 · 当前数据源：{data.sourceLabel}</div>
          </div>
          <nav className="mt-5 grid gap-2">
            <NavLink href="/" label="项目排期" badge="P0" />
            <NavLink href="/product-guide" label="产品组工作指引" badge="P0" active />
            <NavLink href="/modeling" label="建模排期" badge="P0" />
            {canOpenUserData ? <NavLink href="/users" label="用户数据" badge="基础" /> : null}
          </nav>
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="min-w-0 px-6 py-4 max-md:px-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href="/product-guide"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft size={14} />
                返回产品组工作指引
              </Link>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{data.project.name}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>项目分析</span>
                    <span className="text-slate-300">/</span>
                    <span>{data.project.projectTeamName}</span>
                    <span className="text-slate-300">/</span>
                    <span>产品研发：{data.project.productOwnerName}</span>
                    <span className="text-slate-300">/</span>
                    <span>产品美术：{data.project.artOwnerName}</span>
                  </div>
                </div>
                <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold", riskBadgeClass[data.result.riskLevel])}>
                  {data.result.riskLabel}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <TopLink href="/" icon={<CalendarDays size={14} />} label="项目排期" />
              <TopLink href="/modeling" icon={<Palette size={14} />} label="建模排期" />
            </div>
          </header>

          <section className="mt-4 grid grid-cols-4 gap-3 max-2xl:grid-cols-2 max-md:grid-cols-1">
            {data.metrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </section>

          <section className="mt-4 grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-2xl:grid-cols-1">
            <div className="grid gap-4">
              <AnalysisSection
                icon={<BarChart3 size={18} />}
                title="测算结论"
                helper={data.latestRun ? `${data.latestRun.name} · ${data.latestRun.calculatedAt}` : "暂无成功测算，先展示项目录入状态"}
              >
                <div className="grid grid-cols-4 gap-2 max-xl:grid-cols-2 max-md:grid-cols-1">
                  <InfoTile label="计划上线" value={data.result.plannedLaunchDate} />
                  <InfoTile label="预测上线" value={data.result.forecastLaunchDate ?? "待测算"} />
                  <InfoTile label="当前任务" value={data.result.currentTaskName} />
                  <InfoTile label="缺少预计完成" value={`${data.result.missingExpectedFinishCount} 项`} />
                </div>
                <div className={clsx("mt-3 rounded-lg border p-3 text-sm leading-6", riskPanelClass(data.result.riskLevel))}>
                  {data.result.riskMessage}
                </div>
              </AnalysisSection>

              <AnalysisSection
                icon={<ListChecks size={18} />}
                title="全部任务状态与测算结果"
                helper="每一行合并项目任务录入状态和最新排期测算字段"
              >
                <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                      <tr>
                        <Th>No.</Th>
                        <Th>任务</Th>
                        <Th>里程碑</Th>
                        <Th>负责人</Th>
                        <Th>实际状态</Th>
                        <Th>计划完成</Th>
                        <Th>预计完成</Th>
                        <Th>预测完成</Th>
                        <Th>实际完成</Th>
                        <Th>测算风险</Th>
                        <Th>安全余量</Th>
                        <Th>判断依据</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tasks.map((task) => (
                        <TaskRow key={task.id} task={task} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </AnalysisSection>
            </div>

            <aside className="grid h-fit gap-4">
              <AnalysisSection icon={<Gauge size={18} />} title="项目基础信息">
                <InfoList
                  items={[
                    ["项目编号", data.project.code ?? "待补"],
                    ["IP", data.project.ipName ?? "待补"],
                    ["版权方", data.project.licensorName ?? "待补"],
                    ["产品类型", data.project.productType ?? "待补"],
                    ["项目等级", data.project.projectLevel ?? "待补"],
                    ["路线", data.project.routeType ?? "待补"],
                    ["款式数", typeof data.project.styleCount === "number" ? `${data.project.styleCount} 款` : "待补"],
                    ["当前阶段", data.project.currentStage],
                    ["项目状态", data.project.status],
                    ["项目开始", data.project.projectStartDate ?? "待补"],
                    ["数据更新", data.project.updatedAt],
                  ]}
                />
              </AnalysisSection>

              <AnalysisSection icon={<CheckCircle2 size={18} />} title="建模摘要">
                {data.modelingProgress ? (
                  <div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <div className="text-2xl font-semibold">{data.modelingProgress.progressPercent}%</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {data.modelingProgress.approvedStyles}/{data.modelingProgress.totalRequiredStyles} 款通过
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>预测全通过</div>
                        <div className="mt-1 font-semibold text-slate-800">
                          {data.modelingProgress.projectedAllApprovedDate ?? "待测算"}
                        </div>
                      </div>
                    </div>
                    <Progress value={data.modelingProgress.progressPercent} tone={data.result.riskLevel} />
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                      <MiniStat label="建模中" value={data.modelingProgress.inProgressStyles} />
                      <MiniStat label="送审" value={data.modelingProgress.submittedStyles} />
                      <MiniStat label="未分配" value={data.modelingProgress.unassignedStyles} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    暂无建模进度摘要。
                  </div>
                )}
              </AnalysisSection>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

function NavLink({ href, label, badge, active }: { href: string; label: string; badge: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium",
        active ? "bg-rose-50 text-rose-700" : "text-slate-600 hover:bg-slate-50",
      )}
    >
      <span>{label}</span>
      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">{badge}</span>
    </Link>
  );
}

function TopLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
    >
      {icon}
      {label}
    </Link>
  );
}

function MetricCard({ metric }: { metric: ProjectAnalysisMetric }) {
  return (
    <div className={clsx("rounded-lg border p-4 shadow-sm", metricClass[metric.tone])}>
      <div className="text-2xl font-semibold">{metric.value}</div>
      <div className="mt-1 text-sm font-semibold">{metric.label}</div>
      <div className="mt-2 text-xs text-slate-500">{metric.helper}</div>
    </div>
  );
}

function AnalysisSection({
  icon,
  title,
  helper,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {icon}
          {title}
        </div>
        {helper ? <div className="text-xs text-slate-400">{helper}</div> : null}
      </div>
      {children}
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function InfoList({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid gap-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
          <span className="text-slate-500">{label}</span>
          <span className="max-w-[220px] text-right font-semibold text-slate-900">{value}</span>
        </div>
      ))}
    </div>
  );
}

function TaskRow({ task }: { task: ProjectAnalysisTask }) {
  return (
    <tr className={clsx("border-t border-slate-100 align-top", riskRowClass[task.riskLevel])}>
      <Td className="font-semibold text-slate-500">{String(task.taskNo).padStart(2, "0")}</Td>
      <Td>
        <div className="font-semibold text-slate-900">{task.taskName}</div>
        {task.blockingPredecessorNames.length > 0 ? (
          <div className="mt-1 text-[11px] text-slate-500">前置：{task.blockingPredecessorNames.join("、")}</div>
        ) : null}
      </Td>
      <Td>{task.milestone}</Td>
      <Td>{task.ownerName}</Td>
      <Td>
        <div>{task.status}</div>
        <div className="mt-1 text-[11px] text-slate-400">{task.displayStatus}</div>
      </Td>
      <Td>{task.plannedFinishDate ?? "待补"}</Td>
      <Td>{task.expectedFinishDate ?? "待补"}</Td>
      <Td>{task.forecastFinishDate ?? "待测算"}</Td>
      <Td>{task.actualFinishDate ?? "-"}</Td>
      <Td>
        <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", riskBadgeClass[task.riskLevel])}>
          {task.riskLabel}
        </span>
      </Td>
      <Td>{safeDaysText(task)}</Td>
      <Td>
        <div className="max-w-[280px] leading-5 text-slate-700">{task.basis}</div>
        {task.recoverableByDate ? <div className="mt-1 text-[11px] text-slate-500">可追回日期：{task.recoverableByDate}</div> : null}
      </Td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={clsx("px-3 py-2 text-slate-700", className)}>{children}</td>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <div className="text-sm font-semibold text-slate-900">{value}</div>
      <div>{label}</div>
    </div>
  );
}

function Progress({ value, tone }: { value: number; tone: ProjectAnalysisRiskLevel }) {
  return (
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className={clsx(
          "h-full rounded-full",
          tone === "delay" ? "bg-rose-500" : tone === "risk" ? "bg-amber-400" : "bg-emerald-500",
        )}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

function safeDaysText(task: ProjectAnalysisTask) {
  if (task.riskLevel === "done" || task.riskLevel === "doneLate") {
    return "已完成";
  }

  if (typeof task.remainingSafeDays !== "number") {
    return "待测算";
  }

  if (task.remainingSafeDays < 0) {
    return `超 ${Math.abs(task.remainingSafeDays)} 天`;
  }

  return `${task.remainingSafeDays} 天`;
}

function riskPanelClass(value: ProjectAnalysisRiskLevel) {
  if (value === "delay") return "border-rose-200 bg-rose-50 text-rose-900";
  if (value === "risk") return "border-amber-200 bg-amber-50 text-amber-900";
  if (value === "done" || value === "doneLate") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}
