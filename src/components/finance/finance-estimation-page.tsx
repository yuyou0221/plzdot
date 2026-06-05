import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, CircleDollarSign, FileWarning, LockKeyhole, ReceiptText } from "lucide-react";
import { AccountPanel } from "@/components/auth/account-panel";
import { AppSideNav } from "@/components/layout/app-side-nav";
import type { AuthUser } from "@/lib/auth/permissions";
import type { FinanceBucket, FinanceEstimationData, FinanceProjectEstimate } from "@/lib/finance/finance-estimation-repository";

type FinanceEstimationPageProps = {
  currentUser: AuthUser;
  data: FinanceEstimationData;
};

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("zh-CN");

export function FinanceEstimationPage({ currentUser, data }: FinanceEstimationPageProps) {
  const blockedProjects = data.projects.filter((project) => !project.isExcluded && project.estimatedRevenue === null);

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-5 py-6 max-xl:border-b max-xl:border-r-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">PLZDOT</p>
            <h1 className="mt-2 text-xl font-black text-slate-950">项目管理平台</h1>
            <p className="mt-1 text-sm text-slate-500">管理员财务试算</p>
          </div>
          <AppSideNav currentPath="/finance" currentUser={currentUser} />
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="px-6 py-6 max-md:px-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-rose-600">财务测算</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">项目营收基础试算</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  读取项目主数据，按项目规格、款式数和项目等级自动测算预计营收。当前规则用于内部试算，缺少字段或规则时不会硬算。
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">规则版本</div>
                <div className="mt-1">{data.ruleVersion}</div>
                <div className="mt-1 text-xs">数据来源：{data.sourceLabel}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <MetricCard
                icon={<CircleDollarSign size={18} />}
                label="预计总营收"
                value={formatCurrency(data.summary.totalEstimatedRevenue)}
                helper={`${data.summary.estimatedProjectCount} 个项目已测算`}
              />
              <MetricCard
                icon={<ReceiptText size={18} />}
                label="纳入测算项目"
                value={numberFormatter.format(data.summary.activeProjectCount)}
                helper={`全部项目 ${data.summary.projectCount} 个`}
              />
              <MetricCard
                icon={<FileWarning size={18} />}
                label="待补规则"
                value={numberFormatter.format(data.summary.blockedProjectCount)}
                helper="缺字段或规则，不猜测"
              />
              <MetricCard
                icon={<BarChart3 size={18} />}
                label="平均单项目营收"
                value={formatCurrency(data.summary.averageEstimatedRevenue)}
                helper={`${data.summary.excludedProjectCount} 个取消项目未计入`}
              />
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-950">上线月份汇总</h3>
                  <p className="mt-1 text-sm text-slate-500">按项目计划上线月份聚合已测算营收。</p>
                </div>
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">{data.monthBuckets.length} 个月</span>
              </div>
              <BucketList buckets={data.monthBuckets} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-black text-slate-950">当前试算规则</h3>
              <p className="mt-1 text-sm text-slate-500">这组规则先让页面跑起来，后续可以替换为正式财务口径。</p>
              <div className="mt-4 grid gap-3">
                {data.productRules.map((rule) => (
                  <div key={rule.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-900">{rule.label}</span>
                      <span className="text-sm font-semibold text-rose-700">{formatCurrency(rule.baseRevenuePerStyle)} / 款</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">匹配关键词：{rule.keywords.join("、")}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.levelRules.map((rule) => (
                  <span key={rule.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {rule.label} × {rule.multiplier}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-black text-slate-950">规格汇总</h3>
              <BucketList buckets={data.productBuckets} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-black text-slate-950">等级汇总</h3>
              <BucketList buckets={data.levelBuckets} />
            </div>
          </section>

          {blockedProjects.length > 0 ? (
            <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <div>
                  <h3 className="font-black">有 {blockedProjects.length} 个项目暂时无法测算</h3>
                  <p className="mt-1 text-sm leading-6">
                    主要原因是缺少款式数、项目等级，或产品规格没有匹配到营收规则。请先补项目主数据或确认新规则。
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <ProjectEstimateTable projects={data.projects} />
        </main>
      </div>
    </div>
  );
}

export function FinanceAccessDeniedPage({ currentUser }: { currentUser: AuthUser }) {
  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-5 py-6 max-xl:border-b max-xl:border-r-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">PLZDOT</p>
          <h1 className="mt-2 text-xl font-black text-slate-950">项目管理平台</h1>
          <AppSideNav currentPath="/finance" currentUser={currentUser} />
          <AccountPanel currentUser={currentUser} />
        </aside>
        <main className="flex items-center justify-center px-6 py-10">
          <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <LockKeyhole size={22} />
            </div>
            <h2 className="mt-4 text-xl font-black text-slate-950">财务测算仅管理员可见</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">当前账号没有进入财务测算页的权限。</p>
          </section>
        </main>
      </div>
    </div>
  );
}

export function FinanceDataErrorPage({ currentUser }: { currentUser: AuthUser }) {
  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-5 py-6 max-xl:border-b max-xl:border-r-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">PLZDOT</p>
          <h1 className="mt-2 text-xl font-black text-slate-950">项目管理平台</h1>
          <AppSideNav currentPath="/finance" currentUser={currentUser} />
          <AccountPanel currentUser={currentUser} />
        </aside>
        <main className="flex items-center justify-center px-6 py-10">
          <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertTriangle size={22} />
            </div>
            <h2 className="mt-4 text-xl font-black text-slate-950">项目数据读取失败</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              财务测算页没有显示样例数据。请确认数据库连接正常，或稍后重新打开页面。
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: ReactNode; label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        <span className="text-rose-500">{icon}</span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-black text-slate-950">{value}</div>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function BucketList({ buckets }: { buckets: FinanceBucket[] }) {
  if (buckets.length === 0) {
    return <div className="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">暂无可汇总数据</div>;
  }

  const maxRevenue = Math.max(...buckets.map((bucket) => bucket.totalEstimatedRevenue), 1);

  return (
    <div className="mt-4 grid gap-3">
      {buckets.map((bucket) => (
        <div key={bucket.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{bucket.label}</div>
              <div className="mt-1 text-xs text-slate-500">
                {bucket.projectCount} 个项目，{bucket.estimatedProjectCount} 个已测算
              </div>
            </div>
            <div className="text-right font-black text-slate-950">{formatCurrency(bucket.totalEstimatedRevenue)}</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.max(6, (bucket.totalEstimatedRevenue / maxRevenue) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectEstimateTable({ projects }: { projects: FinanceProjectEstimate[] }) {
  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">项目测算明细</h3>
          <p className="mt-1 text-sm text-slate-500">只展示测算结果和缺失原因，不在财务页修改项目主数据。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{projects.length} 个项目</span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1120px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">上线月</th>
              <th className="px-3 py-3">项目</th>
              <th className="px-3 py-3">版权 / IP</th>
              <th className="px-3 py-3">规格</th>
              <th className="px-3 py-3">等级</th>
              <th className="px-3 py-3">规则</th>
              <th className="px-3 py-3 text-right">预计营收</th>
              <th className="px-3 py-3">状态</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.projectId} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-3 py-3 font-medium text-slate-700">{formatMonth(project.plannedLaunchMonth)}</td>
                <td className="px-3 py-3">
                  <div className="font-semibold text-slate-950">{project.projectName}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.projectCode || "未编号"}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <div>{project.licensorName || "待补版权方"}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.ipName || "待补 IP"}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <div>{project.productType || project.productLine || "待补规格"}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.styleCount ? `${project.styleCount} 款` : "待补款式数"}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">{project.projectLevel || "待补等级"}</td>
                <td className="px-3 py-3 text-slate-600">
                  <div>{project.productRuleLabel || "待补规格规则"}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.levelRuleLabel ? `${project.levelRuleLabel} × ${project.levelMultiplier}` : "待补等级规则"}</div>
                </td>
                <td className="px-3 py-3 text-right font-black text-slate-950">
                  {project.estimatedRevenue === null ? "-" : formatCurrency(project.estimatedRevenue)}
                </td>
                <td className="px-3 py-3">
                  {project.estimatedRevenue !== null ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">已测算</span>
                  ) : (
                    <div className="max-w-[220px] text-xs leading-5 text-amber-700">{project.issues.join("；")}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year.slice(2)}年${Number(monthNumber)}月`;
}
