import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CircleDollarSign,
  FileWarning,
  LockKeyhole,
  PackageOpen,
  ReceiptText,
  TrendingDown,
} from "lucide-react";
import { AccountPanel } from "@/components/auth/account-panel";
import { FinanceConfigPanel } from "@/components/finance/finance-config-panel";
import { FinanceProjectFactsTable } from "@/components/finance/finance-project-facts-table";
import { AppSideNav } from "@/components/layout/app-side-nav";
import type { AuthUser } from "@/lib/auth/permissions";
import type { FinanceBucket, FinanceEstimationData } from "@/lib/finance/finance-estimation-repository";

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
  const negativeInventoryProjects = data.projects.filter((project) => !project.isExcluded && project.hasNegativeInventory);

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
                <h2 className="mt-1 text-2xl font-black text-slate-950">年度项目营收与实际结果测算</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  读取项目主数据，按规格、零售价、统一折扣和项目等级预测销量计算理论营收；同时维护项目级实际开发成本、实际单件生产成本、订单、销量、渠道样品和展示盒数据，形成更接近真实经营结果的项目测算。
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">核心公式</div>
                <div className="mt-1">实际结果 = 实际营收 - 开发成本 - 样品成本 - 展示盒成本 - 库存成本</div>
                <div className="mt-1 text-xs">规则版本：{data.ruleVersion}</div>
              </div>
            </div>

            <YearTabs availableYears={data.availableYears} selectedYear={data.selectedYear} />

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <MetricCard
                icon={<CircleDollarSign size={18} />}
                label={data.selectedYear ? `${data.selectedYear} 年理论营收` : "理论总营收"}
                value={formatWan(data.summary.totalEstimatedRevenueWan)}
                helper={`${data.summary.estimatedProjectCount} 个项目已测算，按项目编号归年`}
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
                label="平均单项目理论营收"
                value={formatWan(data.summary.averageEstimatedRevenueWan)}
                helper={`${data.summary.excludedProjectCount} 个取消项目未计入`}
              />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <MetricCard
                icon={<CircleDollarSign size={18} />}
                label="实际营收"
                value={formatWan(data.summary.totalActualRevenueWan)}
                helper={`${data.summary.actualCalculatedProjectCount} 个项目可计算实际结果`}
              />
              <MetricCard
                icon={<TrendingDown size={18} />}
                label="实际开发成本"
                value={formatWan(data.summary.totalActualDevelopmentCostWan)}
                helper="项目研发、打样、建模、平面、模具、拍摄等"
              />
              <MetricCard
                icon={<PackageOpen size={18} />}
                label="样品 + 展示盒 + 库存成本"
                value={formatWan(data.summary.totalChannelSampleCostWan + data.summary.totalDisplayBoxCostWan + data.summary.totalInventoryCostWan)}
                helper={`样品 ${formatWan(data.summary.totalChannelSampleCostWan)}，展示盒 ${formatWan(data.summary.totalDisplayBoxCostWan)}，库存 ${formatWan(data.summary.totalInventoryCostWan)}`}
              />
              <MetricCard
                icon={<Boxes size={18} />}
                label="实际测算结果"
                value={formatWan(data.summary.totalActualResultWan)}
                helper={`${data.summary.negativeInventoryProjectCount} 个项目库存为负`}
              />
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="grid gap-5">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">年度汇总</h3>
                    <p className="mt-1 text-sm text-slate-500">按项目编号前两位列出每年理论营收。</p>
                  </div>
                </div>
                <BucketList buckets={data.yearBuckets} />
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">年度子公司汇总</h3>
                    <p className="mt-1 text-sm text-slate-500">按营收年度和子公司拆分理论营收。</p>
                  </div>
                </div>
                <BucketList buckets={data.subsidiaryYearBuckets} />
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">月份汇总</h3>
                    <p className="mt-1 text-sm text-slate-500">当前营收年度内，按上线月份聚合理论营收。</p>
                  </div>
                </div>
                <BucketList buckets={data.monthBuckets} />
              </section>
            </div>

            <div className="grid gap-5">
              <FinanceConfigPanel config={data.config} levelDefinitions={data.levelDefinitions} />
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-black text-slate-950">当前年度子公司</h3>
                <p className="mt-1 text-sm text-slate-500">当前营收年度按上海、厦门等子公司聚合。</p>
                <BucketList buckets={data.subsidiaryBuckets} />
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-black text-slate-950">等级汇总</h3>
                <p className="mt-1 text-sm text-slate-500">按项目等级聚合当前年度理论营收。</p>
                <BucketList buckets={data.levelBuckets} />
              </section>
            </div>
          </section>

          {blockedProjects.length > 0 ? (
            <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <div>
                  <h3 className="font-black">有 {blockedProjects.length} 个项目暂时无法做理论营收测算</h3>
                  <p className="mt-1 text-sm leading-6">常见原因是项目缺少规格、零售价、项目等级，或该等级预测销量还没有配置。</p>
                </div>
              </div>
            </section>
          ) : null}

          {negativeInventoryProjects.length > 0 ? (
            <section className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <div>
                  <h3 className="font-black">有 {negativeInventoryProjects.length} 个项目总库存为负</h3>
                  <p className="mt-1 text-sm leading-6">系统不会阻止保存，但这通常说明总订单、实际销量或渠道样品量需要复核。</p>
                </div>
              </div>
            </section>
          ) : null}

          <FinanceProjectFactsTable key={data.generatedAt} projects={data.projects} />
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
            <p className="mt-2 text-sm leading-6 text-slate-500">财务测算页不会显示样例数据。请确认数据库连接正常，或稍后重新打开页面。</p>
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

function formatWan(value: number) {
  return `${decimalFormatter.format(value)} 万`;
}
