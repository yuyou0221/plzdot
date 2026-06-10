"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Save } from "lucide-react";
import type { FinanceProjectEstimate } from "@/lib/finance/finance-estimation-repository";

type FinanceProjectFactsTableProps = {
  projects: FinanceProjectEstimate[];
};

type FinanceFactDraft = {
  actualDevelopmentCost: string;
  totalOrderQuantity: string;
  actualSales: string;
  channelSampleQuantity: string;
  displayBoxQuantity: string;
  displayBoxUnitPrice: string;
  notes: string;
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const decimalFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function FinanceProjectFactsTable({ projects }: FinanceProjectFactsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(() => buildInitialDrafts(projects));
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { tone: "success" | "error"; text: string }>>({});

  const negativeInventoryProjects = useMemo(() => projects.filter((project) => project.hasNegativeInventory), [projects]);

  function updateDraft(projectId: string, field: keyof FinanceFactDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [projectId]: {
        ...current[projectId],
        [field]: value,
      },
    }));
  }

  async function saveProjectFact(projectId: string) {
    const draft = drafts[projectId];

    if (!draft) {
      return;
    }

    setSavingProjectId(projectId);
    setMessages((current) => ({ ...current, [projectId]: { tone: "success", text: "保存中..." } }));

    const response = await fetch(`/api/finance/projects/${projectId}/facts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actualDevelopmentCost: emptyToNull(draft.actualDevelopmentCost),
        totalOrderQuantity: emptyToNull(draft.totalOrderQuantity),
        actualSales: emptyToNull(draft.actualSales),
        channelSampleQuantity: emptyToNull(draft.channelSampleQuantity),
        displayBoxQuantity: emptyToNull(draft.displayBoxQuantity),
        displayBoxUnitPrice: emptyToNull(draft.displayBoxUnitPrice),
        notes: emptyToNull(draft.notes),
      }),
    });

    const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

    setSavingProjectId(null);

    if (!response.ok || !result?.ok) {
      setMessages((current) => ({
        ...current,
        [projectId]: { tone: "error", text: result?.message ?? "保存失败，请稍后重试。" },
      }));
      return;
    }

    setMessages((current) => ({ ...current, [projectId]: { tone: "success", text: "已保存，测算已刷新。" } }));
    startTransition(() => router.refresh());
  }

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">项目财务明细</h3>
          <p className="mt-1 text-sm text-slate-500">
            每个项目维护一条实际财务记录。金额录入单位为元，汇总和计算结果按万元展示；库存由系统自动计算，不能手动填写。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{projects.length} 个项目</span>
      </div>

      {negativeInventoryProjects.length > 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={16} />
          <div>
            <div className="font-bold">有 {negativeInventoryProjects.length} 个项目总库存为负。</div>
            <div className="mt-1 text-xs leading-5">这通常表示总订单、实际销量或渠道样品量中至少一项录错；系统允许保存，但会在项目行继续提示。</div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[2780px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">上线月</th>
              <th className="px-3 py-3">营收年度</th>
              <th className="px-3 py-3">子公司</th>
              <th className="px-3 py-3">项目</th>
              <th className="px-3 py-3">版权 / IP</th>
              <th className="px-3 py-3">规格</th>
              <th className="px-3 py-3">零售价</th>
              <th className="px-3 py-3">等级销量</th>
              <th className="px-3 py-3 text-right">理论营收</th>
              <th className="px-3 py-3 text-right">理论开发成本</th>
              <th className="px-3 py-3 text-right">理论生产单件</th>
              <th className="px-3 py-3">实际开发成本</th>
              <th className="px-3 py-3">总订单</th>
              <th className="px-3 py-3">实际销量</th>
              <th className="px-3 py-3">渠道样品量</th>
              <th className="px-3 py-3">展示盒数量</th>
              <th className="px-3 py-3">展示盒单价</th>
              <th className="px-3 py-3 text-right">总库存</th>
              <th className="px-3 py-3 text-right">实际营收</th>
              <th className="px-3 py-3 text-right">样品成本</th>
              <th className="px-3 py-3 text-right">展示盒成本</th>
              <th className="px-3 py-3 text-right">库存成本</th>
              <th className="px-3 py-3 text-right">实际测算结果</th>
              <th className="px-3 py-3 text-right">开发成本差异</th>
              <th className="px-3 py-3">备注</th>
              <th className="px-3 py-3">状态</th>
              <th className="px-3 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const draft = drafts[project.projectId] ?? emptyDraft;
              const message = messages[project.projectId];
              const isSaving = savingProjectId === project.projectId || isPending;

              return (
                <tr key={project.projectId} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-3 font-medium text-slate-700">{formatMonth(project.plannedLaunchMonth)}</td>
                  <td className="px-3 py-3 text-slate-600">
                    <div className="font-semibold text-slate-900">{project.revenueYear} 年</div>
                    <div className="mt-1 text-xs text-slate-500">{formatRevenueYearSource(project.revenueYearSource)}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{project.subsidiary?.trim() || "未填写子公司"}</td>
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
                  <td className="px-3 py-3 text-slate-600">
                    <div>{project.levelLabel || project.projectLevel || "待补等级"}</div>
                    <div className="mt-1 text-xs text-slate-500">{project.predictedSales ? `${numberFormatter.format(project.predictedSales)} 件` : "待配置销量"}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-black text-slate-950">{formatWan(project.estimatedRevenueWan)}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{formatWan(project.theoreticalDevelopmentCostWan)}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{formatYuan(project.theoreticalProductionUnitCost)}</td>
                  <td className="px-3 py-3">
                    <MoneyInput value={draft.actualDevelopmentCost} onChange={(value) => updateDraft(project.projectId, "actualDevelopmentCost", value)} />
                  </td>
                  <td className="px-3 py-3">
                    <QuantityInput value={draft.totalOrderQuantity} onChange={(value) => updateDraft(project.projectId, "totalOrderQuantity", value)} />
                  </td>
                  <td className="px-3 py-3">
                    <QuantityInput value={draft.actualSales} onChange={(value) => updateDraft(project.projectId, "actualSales", value)} />
                  </td>
                  <td className="px-3 py-3">
                    <QuantityInput value={draft.channelSampleQuantity} onChange={(value) => updateDraft(project.projectId, "channelSampleQuantity", value)} />
                  </td>
                  <td className="px-3 py-3">
                    <QuantityInput value={draft.displayBoxQuantity} onChange={(value) => updateDraft(project.projectId, "displayBoxQuantity", value)} />
                  </td>
                  <td className="px-3 py-3">
                    <MoneyInput value={draft.displayBoxUnitPrice} onChange={(value) => updateDraft(project.projectId, "displayBoxUnitPrice", value)} />
                  </td>
                  <td className={project.hasNegativeInventory ? "px-3 py-3 text-right font-black text-red-600" : "px-3 py-3 text-right font-semibold text-slate-800"}>
                    {numberFormatter.format(project.totalInventory)}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">{formatWan(project.actualRevenueWan)}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{formatWan(project.channelSampleCostWan)}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{formatWan(project.displayBoxCostWan)}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{formatWan(project.inventoryCostWan)}</td>
                  <td className={project.actualResult !== null && project.actualResult < 0 ? "px-3 py-3 text-right font-black text-red-600" : "px-3 py-3 text-right font-black text-slate-950"}>
                    {formatWan(project.actualResultWan)}
                  </td>
                  <td className={project.developmentCostVariance !== null && project.developmentCostVariance > 0 ? "px-3 py-3 text-right font-semibold text-amber-700" : "px-3 py-3 text-right text-slate-700"}>
                    {formatWan(project.developmentCostVarianceWan)}
                  </td>
                  <td className="px-3 py-3">
                    <textarea
                      value={draft.notes}
                      onChange={(event) => updateDraft(project.projectId, "notes", event.target.value)}
                      className="min-h-20 w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-rose-300 focus:bg-white"
                      placeholder="补充说明"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <StatusCell project={project} message={message} />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => saveProjectFact(project.projectId)}
                      disabled={isSaving}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <Save size={14} />
                      {isSaving ? "保存中" : "保存"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusCell({ project, message }: { project: FinanceProjectEstimate; message?: { tone: "success" | "error"; text: string } }) {
  if (message) {
    return (
      <div className={message.tone === "success" ? "max-w-[220px] rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-semibold leading-5 text-emerald-700" : "max-w-[220px] rounded-lg bg-red-50 px-2.5 py-2 text-xs font-semibold leading-5 text-red-700"}>
        {message.text}
      </div>
    );
  }

  const issues = [...project.issues, ...project.actualIssues];

  if (issues.length === 0) {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">可测算</span>;
  }

  return <div className="max-w-[240px] text-xs leading-5 text-amber-700">{issues.slice(0, 4).join("；")}</div>;
}

function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="decimal"
      className="h-9 w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-900 outline-none focus:border-rose-300 focus:bg-white"
      placeholder="元"
    />
  );
}

function QuantityInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="numeric"
      className="h-9 w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-900 outline-none focus:border-rose-300 focus:bg-white"
      placeholder="数量"
    />
  );
}

function buildInitialDrafts(projects: FinanceProjectEstimate[]) {
  return Object.fromEntries(
    projects.map((project) => [
      project.projectId,
      {
        actualDevelopmentCost: toInputValue(project.actualFact.actualDevelopmentCost),
        totalOrderQuantity: toInputValue(project.actualFact.totalOrderQuantity),
        actualSales: toInputValue(project.actualFact.actualSales),
        channelSampleQuantity: toInputValue(project.actualFact.channelSampleQuantity),
        displayBoxQuantity: toInputValue(project.actualFact.displayBoxQuantity),
        displayBoxUnitPrice: toInputValue(project.actualFact.displayBoxUnitPrice),
        notes: project.actualFact.notes ?? "",
      } satisfies FinanceFactDraft,
    ]),
  );
}

const emptyDraft: FinanceFactDraft = {
  actualDevelopmentCost: "",
  totalOrderQuantity: "",
  actualSales: "",
  channelSampleQuantity: "",
  displayBoxQuantity: "",
  displayBoxUnitPrice: "",
  notes: "",
};

function toInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatYuan(value: number | null) {
  return value === null ? "待补" : `¥${decimalFormatter.format(value)}`;
}

function formatWan(value: number | null) {
  return value === null ? "-" : `${decimalFormatter.format(value)} 万`;
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year.slice(2)}年${Number(monthNumber)}月`;
}

function formatRevenueYearSource(source: FinanceProjectEstimate["revenueYearSource"]) {
  return source === "projectCode" ? "按项目编号" : "按上线日期";
}
