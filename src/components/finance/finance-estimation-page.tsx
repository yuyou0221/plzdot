import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CircleDollarSign, FileWarning, LockKeyhole, ReceiptText } from "lucide-react";
import { AccountPanel } from "@/components/auth/account-panel";
import { FinanceConfigPanel } from "@/components/finance/finance-config-panel";
import { AppSideNav } from "@/components/layout/app-side-nav";
import type { AuthUser } from "@/lib/auth/permissions";
import type { FinanceBucket, FinanceEstimationData, FinanceProjectEstimate } from "@/lib/finance/finance-estimation-repository";

type FinanceEstimationPageProps = {
  currentUser: AuthUser;
  data: FinanceEstimationData;
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const decimalFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function FinanceEstimationPage({ currentUser, data }: FinanceEstimationPageProps) {
  const blockedProjects = data.projects.filter((project) => !project.isExcluded && project.estimatedRevenue === null);

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-5 py-6 max-xl:border-b max-xl:border-r-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">PLZDOT</p>
            <h1 className="mt-2 text-xl font-black text-slate-950">项目管理平台</h1>
            <p className="mt-1 text-sm text-slate-500">管理员财务测算</p>
          </div>
          <AppSideNav currentPath="/finance" currentUser={currentUser} />
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="px-6 py-6 max-md:px-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-rose-600">财务测算</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">年度项目营收测算</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  读取项目主数据，按规格、零售价、统一折扣和项目等级预测销量计算营收。页面金额统一按万元展示。
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">测算公式</div>
                <div className="mt-1">规格 × 零售价 × 折扣 × 预测销量</div>
                <div className="mt-1 text-xs">规则版本：{data.ruleVersion}</div>
              </div>
            </div>

            <YearTabs availableYears={data.availableYears} selectedYear={data.selectedYear} />

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <MetricCard
                icon={<CircleDollarSign size={18} />}
                label={data.selectedYear ? `${data.selectedYear} 年预计营收` : "预计总营收"}
                value={formatWan(data.summary.totalEstimatedRevenueWan)}
                helper={`${data.summary.estimatedProjectCount} 个项目已测算`}
              />
              <MetricCard
                icon={<ReceiptText size={18} />}
                label="纳入测算项目"
                value={numberFormatter.format(data.summary.activeProjectCount)}
                helper={`当前年度项目 ${data.summary.projectCount} 个`}
              />
              <MetricCard
                icon={<FileWarning size={18} />}
                label="待配置 / 待补字段"
                value={numberFormatter.format(data.summary.blockedProjectCount)}
                helper="缺字段或缺销量配置"
              />
              <MetricCard
                icon={<BarChart3 size={18} />}
                label="平均单项目营收"
                value={formatWan(data.summary.averageEstimatedRevenueWan)}
                helper={`${data.summary.excludedProjectCount} 个取消项目未计入`}
              />
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="grid gap-5">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">年度汇总</h3>
                    <p className="mt-1 text-sm text-slate-500">按计划上线年份列出每年预计营收。</p>
                  </div>
                </div>
                <BucketList buckets={data.yearBuckets} />
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">月份汇总</h3>
                    <p className="mt-1 text-sm text-slate-500">当前年度按上线月份聚合营收。</p>
                  </div>
                </div>
                <BucketList buckets={data.monthBuckets} />
              </section>
            </div>

            <div className="grid gap-5">
              <FinanceConfigPanel config={data.config} levelDefinitions={data.levelDefinitions} />
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-black text-slate-950">等级汇总</h3>
                <p className="mt-1 text-sm text-slate-500">按项目等级聚合当前年度营收。</p>
                <BucketList buckets={data.levelBuckets} />
              </section>
            </div>
          </section>

          {blockedProjects.length > 0 ? (
            <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <div>
                  <h3 className="font-black">有 {blockedProjects.length} 个项目暂时无法测算</h3>
                  <p className="mt-1 text-sm leading-6">
                    常见原因是项目缺少规格、零售价、项目等级，或该等级预测销量还没有配置。
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

function YearTabs({ availableYears, selectedYear }: { availableYears: number[]; selectedYear: number | null }) {
  if (availableYears.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {availableYears.map((year) => {
        const isActive = selectedYear === year;

        return (
          <Link
            key={year}
            href={`/finance?year=${year}`}
            className={isActive ? "rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white" : "rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200"}
          >
            {year} 年
          </Link>
        );
      })}
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

  const maxRevenue = Math.max(...buckets.map((bucket) => bucket.totalEstimatedRevenueWan), 1);

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
            <div className="text-right font-black text-slate-950">{formatWan(bucket.totalEstimatedRevenueWan)}</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.max(6, (bucket.totalEstimatedRevenueWan / maxRevenue) * 100)}%` }} />
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
          <h3 className="text-lg font-black text-slate-950">项目营收明细</h3>
          <p className="mt-1 text-sm text-slate-500">按年度列出每个项目营收，金额单位为万元。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{projects.length} 个项目</span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1260px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">上线月</th>
              <th className="px-3 py-3">项目</th>
              <th className="px-3 py-3">版权 / IP</th>
              <th className="px-3 py-3">规格</th>
              <th className="px-3 py-3">零售价</th>
              <th className="px-3 py-3">折扣</th>
              <th className="px-3 py-3">等级销量</th>
              <th className="px-3 py-3">公式</th>
              <th className="px-3 py-3 text-right">营收</th>
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
                  <div className="mt-1 text-xs text-slate-500">{project.specificationCount ? `${project.specificationCount} 款` : "待补规格"}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">{project.retailPriceValue ? `¥${numberFormatter.format(project.retailPriceValue)}` : project.retailPrice || "待补"}</td>
                <td className="px-3 py-3 text-slate-600">{formatPercent(project.discountRate)}</td>
                <td className="px-3 py-3 text-slate-600">
                  <div>{project.levelLabel || project.projectLevel || "待补等级"}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.predictedSales ? `${numberFormatter.format(project.predictedSales)} 件` : "待配置销量"}</div>
                </td>
                <td className="px-3 py-3 text-xs leading-5 text-slate-500">{project.formulaText || "-"}</td>
                <td className="px-3 py-3 text-right font-black text-slate-950">
                  {project.estimatedRevenueWan === null ? "-" : formatWan(project.estimatedRevenueWan)}
                </td>
                <td className="px-3 py-3">
                  {project.estimatedRevenueWan !== null ? (
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

function formatWan(value: number) {
  return `${decimalFormatter.format(value)} 万`;
}

function formatPercent(value: number) {
  return `${decimalFormatter.format(value * 100)}%`;
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year.slice(2)}年${Number(monthNumber)}月`;
}
