import Link from "next/link";
import { AlertTriangle, Pencil } from "lucide-react";
import type { FinanceProjectEstimate } from "@/lib/finance/finance-estimation-repository";

type FinanceProjectFactsTableProps = {
  projects: FinanceProjectEstimate[];
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const decimalFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function FinanceProjectFactsTable({ projects }: FinanceProjectFactsTableProps) {
  const negativeInventoryProjects = projects.filter((project) => project.hasNegativeInventory);

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">项目财务明细</h3>
          <p className="mt-1 text-sm text-slate-500">这里先看项目级测算结果。点击“编辑”进入单项目页面，录入实际开发成本、订单、销量、样品和展示盒数据。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{projects.length} 个项目</span>
      </div>

      {negativeInventoryProjects.length > 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={16} />
          <div>
            <div className="font-bold">有 {negativeInventoryProjects.length} 个项目总库存为负。</div>
            <div className="mt-1 text-xs leading-5">这通常表示总订单、实际销量或渠道样品量中至少一项录错；进入对应项目编辑页即可修正。</div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1520px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">项目</th>
              <th className="px-3 py-3">营收年度</th>
              <th className="px-3 py-3">子公司</th>
              <th className="px-3 py-3">规格 / 零售价</th>
              <th className="px-3 py-3 text-right">单件生产成本</th>
              <th className="px-3 py-3 text-right">理论营收</th>
              <th className="px-3 py-3 text-right">实际营收</th>
              <th className="px-3 py-3 text-right">实际开发成本</th>
              <th className="px-3 py-3 text-right">库存</th>
              <th className="px-3 py-3 text-right">浮动盈亏</th>
              <th className="px-3 py-3 text-right">当前盈亏</th>
              <th className="px-3 py-3">状态</th>
              <th className="px-3 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.projectId} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-3 py-3">
                  <div className="font-semibold text-slate-950">{project.projectName}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.projectCode || "未编号"}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {project.licensorName || "待补版权方"} / {project.ipName || "待补 IP"}
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <div className="font-semibold text-slate-900">{project.revenueYear} 年</div>
                  <div className="mt-1 text-xs text-slate-500">{formatMonth(project.plannedLaunchMonth)}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">{project.subsidiary?.trim() || "未填写子公司"}</td>
                <td className="px-3 py-3 text-slate-600">
                  <div>{project.productType || project.productLine || "待补规格"}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.specificationCount ? `${project.specificationCount} 款` : "待补规格"}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.retailPriceValue ? `¥${numberFormatter.format(project.retailPriceValue)}` : project.retailPrice || "待补零售价"}</div>
                </td>
                <td className="px-3 py-3 text-right text-slate-700">
                  <div className="font-semibold text-slate-900">{formatYuan(project.productionUnitCostForActual)}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatProductionUnitCostSource(project.productionUnitCostSource)}</div>
                </td>
                <td className="px-3 py-3 text-right font-black text-slate-950">{formatWan(project.estimatedRevenueWan)}</td>
                <td className="px-3 py-3 text-right text-slate-700">{formatWan(project.actualRevenueWan)}</td>
                <td className="px-3 py-3 text-right text-slate-700">{formatYuan(project.actualFact.actualDevelopmentCost)}</td>
                <td className={project.hasNegativeInventory ? "px-3 py-3 text-right font-black text-red-600" : "px-3 py-3 text-right font-semibold text-slate-800"}>
                  {numberFormatter.format(project.totalInventory)}
                </td>
                <td className={project.floatingProfit !== null && project.floatingProfit < 0 ? "px-3 py-3 text-right font-black text-red-600" : "px-3 py-3 text-right font-black text-slate-950"}>
                  {formatWan(project.floatingProfitWan)}
                </td>
                <td className={project.actualResult !== null && project.actualResult < 0 ? "px-3 py-3 text-right font-black text-red-600" : "px-3 py-3 text-right font-black text-slate-950"}>
                  {formatWan(project.actualResultWan)}
                </td>
                <td className="px-3 py-3">
                  <StatusCell project={project} />
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/finance/projects/${project.projectId}`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    <Pencil size={14} />
                    编辑
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusCell({ project }: { project: FinanceProjectEstimate }) {
  const issues = [...project.issues, ...project.actualIssues];

  if (issues.length === 0) {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">可测算</span>;
  }

  return <div className="max-w-[240px] text-xs leading-5 text-amber-700">{issues.slice(0, 3).join("；")}</div>;
}

function formatYuan(value: number | null) {
  return value === null ? "未录入" : `¥${decimalFormatter.format(value)}`;
}

function formatWan(value: number | null) {
  return value === null ? "-" : `${decimalFormatter.format(value)} 万`;
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year.slice(2)}年${Number(monthNumber)}月`;
}

function formatProductionUnitCostSource(value: "actual" | "theoretical" | "missing") {
  if (value === "actual") {
    return "实际录入";
  }

  if (value === "theoretical") {
    return "理论兜底";
  }

  return "待补";
}
