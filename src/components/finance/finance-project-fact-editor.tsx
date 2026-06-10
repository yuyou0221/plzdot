"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Save } from "lucide-react";
import type { FinanceProjectEstimate } from "@/lib/finance/finance-estimation-repository";

type FinanceProjectFactEditorProps = {
  project: FinanceProjectEstimate;
};

type FinanceFactDraft = {
  actualDevelopmentCost: string;
  actualProductionUnitCost: string;
  actualRevenue: string;
  totalOrderQuantity: string;
  actualSales: string;
  channelSampleQuantity: string;
  displayBoxQuantity: string;
  displayBoxUnitPrice: string;
  notes: string;
};

const decimalFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat("zh-CN");

export function FinanceProjectFactEditor({ project }: FinanceProjectFactEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<FinanceFactDraft>(() => ({
    actualDevelopmentCost: toInputValue(project.actualFact.actualDevelopmentCost),
    actualProductionUnitCost: toInputValue(project.actualFact.actualProductionUnitCost),
    actualRevenue: toInputValue(project.actualFact.actualRevenue),
    totalOrderQuantity: toInputValue(project.actualFact.totalOrderQuantity),
    actualSales: toInputValue(project.actualFact.actualSales),
    channelSampleQuantity: toInputValue(project.actualFact.channelSampleQuantity),
    displayBoxQuantity: toInputValue(project.actualFact.displayBoxQuantity),
    displayBoxUnitPrice: toInputValue(project.actualFact.displayBoxUnitPrice),
    notes: project.actualFact.notes ?? "",
  }));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const preview = useMemo(() => buildPreview(project, draft), [project, draft]);
  const backHref = `/finance?year=${project.revenueYear}`;

  function updateDraft(field: keyof FinanceFactDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveProjectFact() {
    setMessage(null);

    const response = await fetch(`/api/finance/projects/${project.projectId}/facts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actualDevelopmentCost: emptyToNull(draft.actualDevelopmentCost),
        actualProductionUnitCost: emptyToNull(draft.actualProductionUnitCost),
        actualRevenue: emptyToNull(draft.actualRevenue),
        totalOrderQuantity: emptyToNull(draft.totalOrderQuantity),
        actualSales: emptyToNull(draft.actualSales),
        channelSampleQuantity: emptyToNull(draft.channelSampleQuantity),
        displayBoxQuantity: emptyToNull(draft.displayBoxQuantity),
        displayBoxUnitPrice: emptyToNull(draft.displayBoxUnitPrice),
        notes: emptyToNull(draft.notes),
      }),
    });

    const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

    if (!response.ok || !result?.ok) {
      setMessage({ tone: "error", text: result?.message ?? "保存失败，请稍后重试。" });
      return;
    }

    setMessage({ tone: "success", text: "已保存，财务测算结果已刷新。" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
              <ArrowLeft size={16} />
              返回财务测算
            </Link>
            <h2 className="mt-3 text-2xl font-black text-slate-950">{project.projectName}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {project.projectCode || "未编号"} · {project.licensorName || "待补版权方"} / {project.ipName || "待补 IP"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-right text-sm text-slate-600">
            <div className="font-semibold text-slate-900">{project.revenueYear} 年营收</div>
            <div className="mt-1">{project.subsidiary?.trim() || "未填写子公司"}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ReadOnlyField label="规格 / 款式数" value={project.specificationCount ? `${project.specificationCount} 款` : "待补"} />
          <ReadOnlyField label="零售价" value={project.retailPriceValue ? `¥${formatNumber(project.retailPriceValue)}` : project.retailPrice || "待补"} />
          <ReadOnlyField label="项目等级 / 预测销量" value={`${project.levelLabel || project.projectLevel || "待补等级"} / ${project.predictedSales ? `${formatInteger(project.predictedSales)} 件` : "待配置"}`} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <InputField
            label="实际开发成本"
            helper="单位：元。包含打样样品、建模、平面设计、模具、拍摄等项目开发阶段实际成本。"
            value={draft.actualDevelopmentCost}
            onChange={(value) => updateDraft("actualDevelopmentCost", value)}
            placeholder="例如 120000"
            inputMode="decimal"
          />
          <InputField
            label="实际单件生产成本"
            helper="单位：元。用于计算渠道样品成本和库存成本；不填时暂按理论生产单件成本计算。"
            value={draft.actualProductionUnitCost}
            onChange={(value) => updateDraft("actualProductionUnitCost", value)}
            placeholder="例如 12.5"
            inputMode="decimal"
          />
          <InputField
            label="实际营收"
            helper="单位：元。不填时暂按零售价 × 折扣 × 实际销量计算。"
            value={draft.actualRevenue}
            onChange={(value) => updateDraft("actualRevenue", value)}
            placeholder="例如 320000"
            inputMode="decimal"
          />
          <InputField
            label="总订单数量"
            helper="项目总订单数量。库存由总订单减去实际销量和渠道样品量自动计算。"
            value={draft.totalOrderQuantity}
            onChange={(value) => updateDraft("totalOrderQuantity", value)}
            placeholder="例如 30000"
            inputMode="numeric"
          />
          <InputField
            label="实际销量"
            helper="项目总实际销量，不乘款式数。"
            value={draft.actualSales}
            onChange={(value) => updateDraft("actualSales", value)}
            placeholder="例如 18000"
            inputMode="numeric"
          />
          <InputField
            label="渠道样品量"
            helper="送给渠道的展示样品数量，不等同于开发阶段打样样品。"
            value={draft.channelSampleQuantity}
            onChange={(value) => updateDraft("channelSampleQuantity", value)}
            placeholder="例如 120"
            inputMode="numeric"
          />
          <InputField
            label="展示盒数量"
            helper="项目使用的展示盒数量。"
            value={draft.displayBoxQuantity}
            onChange={(value) => updateDraft("displayBoxQuantity", value)}
            placeholder="例如 300"
            inputMode="numeric"
          />
          <InputField
            label="展示盒单价"
            helper="单位：元。"
            value={draft.displayBoxUnitPrice}
            onChange={(value) => updateDraft("displayBoxUnitPrice", value)}
            placeholder="例如 9.5"
            inputMode="decimal"
          />
        </div>

        <label className="mt-4 grid gap-1">
          <span className="text-sm font-semibold text-slate-700">备注</span>
          <textarea
            value={draft.notes}
            onChange={(event) => updateDraft("notes", event.target.value)}
            className="min-h-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-rose-300 focus:bg-white"
            placeholder="记录订单口径、特殊成本或后续需要复核的事项"
          />
        </label>

        {message ? (
          <div className={message.tone === "success" ? "mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700" : "mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"}>
            {message.text}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveProjectFact}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Save size={16} />
            {isPending ? "保存中" : "保存财务数据"}
          </button>
          <Link href={backHref} className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">
            返回列表
          </Link>
        </div>
      </section>

      <aside className="grid gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-black text-slate-950">实时测算预览</h3>
          <p className="mt-1 text-sm text-slate-500">保存前可先看当前录入会怎样影响结果。</p>

          {preview.hasNegativeInventory ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              <div>
                <div className="font-bold">总库存为负</div>
                <div className="mt-1 text-xs leading-5">请检查总订单、实际销量和渠道样品量。系统允许保存，但建议复核。</div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            <PreviewRow label="理论营收" value={formatWan(project.estimatedRevenueWan)} />
            <PreviewRow label="理论开发成本" value={formatWan(project.theoreticalDevelopmentCostWan)} />
            <PreviewRow label="理论生产单件成本" value={formatYuan(project.theoreticalProductionUnitCost)} />
            <PreviewRow label="实际测算用单件成本" value={formatYuan(preview.productionUnitCostForActual)} />
            <PreviewRow label="单件成本来源" value={formatProductionUnitCostSource(preview.productionUnitCostSource)} />
            <PreviewRow label="单件成本差异" value={formatYuan(preview.productionUnitCostVariance)} tone={preview.productionUnitCostVariance !== null && preview.productionUnitCostVariance > 0 ? "warning" : "default"} />
            <PreviewRow label="实际营收" value={formatWan(toWanOrNull(preview.actualRevenue))} />
            <PreviewRow label="实际营收来源" value={formatActualRevenueSource(preview.actualRevenueSource)} />
            <PreviewRow label="渠道样品成本" value={formatWan(toWanOrNull(preview.channelSampleCost))} />
            <PreviewRow label="已售生产成本" value={formatWan(toWanOrNull(preview.actualSalesProductionCost))} />
            <PreviewRow label="展示盒成本" value={formatWan(toWan(preview.displayBoxCost))} />
            <PreviewRow label="总库存" value={formatInteger(preview.totalInventory)} tone={preview.hasNegativeInventory ? "danger" : "default"} />
            <PreviewRow label="库存成本" value={formatWan(toWanOrNull(preview.inventoryCost))} />
            <PreviewRow label="当前盈亏" value={formatWan(toWanOrNull(preview.actualResult))} tone={preview.actualResult !== null && preview.actualResult < 0 ? "danger" : "strong"} />
            <PreviewRow label="开发成本差异" value={formatWan(toWanOrNull(preview.developmentCostVariance))} tone={preview.developmentCostVariance !== null && preview.developmentCostVariance > 0 ? "warning" : "default"} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-black text-slate-950">计算口径</h3>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-600">
            <p>理论开发成本 = 零售价 × 10000 × 规格 / 6</p>
            <p>理论生产单件成本 = 零售价 × 32.5%</p>
            <p>实际测算用单件生产成本优先取实际录入；未录入时用理论生产单件成本。</p>
            <p>实际营收优先取实际录入；未录入时用零售价 × 折扣 × 实际销量。</p>
            <p>渠道样品成本 = 渠道样品量 × 实际测算用单件生产成本</p>
            <p>已售生产成本 = 实际销量 × 实际测算用单件生产成本</p>
            <p>总库存 = 总订单 - 实际销量 - 渠道样品量</p>
            <p>当前盈亏 = 实际营收 - 实际开发成本 - 样品成本 - 展示盒成本 - 库存成本 - 已售生产成本</p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function InputField({
  label,
  helper,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode: "decimal" | "numeric";
}) {
  return (
    <label className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-300"
        placeholder={placeholder}
      />
      <span className="text-xs leading-5 text-slate-500">{helper}</span>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function PreviewRow({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "strong" | "warning" | "danger" }) {
  const valueClass =
    tone === "danger"
      ? "font-black text-red-600"
      : tone === "warning"
        ? "font-black text-amber-700"
        : tone === "strong"
          ? "font-black text-slate-950"
          : "font-semibold text-slate-800";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-right text-sm ${valueClass}`}>{value}</div>
    </div>
  );
}

function buildPreview(project: FinanceProjectEstimate, draft: FinanceFactDraft) {
  const actualDevelopmentCost = parseDraftNumber(draft.actualDevelopmentCost);
  const actualProductionUnitCost = parseOptionalDraftNumber(draft.actualProductionUnitCost);
  const actualRevenueInput = parseOptionalDraftNumber(draft.actualRevenue);
  const totalOrderQuantity = parseDraftNumber(draft.totalOrderQuantity);
  const actualSales = parseDraftNumber(draft.actualSales);
  const channelSampleQuantity = parseDraftNumber(draft.channelSampleQuantity);
  const displayBoxQuantity = parseDraftNumber(draft.displayBoxQuantity);
  const displayBoxUnitPrice = parseDraftNumber(draft.displayBoxUnitPrice);
  const productionUnitCostForActual = actualProductionUnitCost ?? project.theoreticalProductionUnitCost;
  const productionUnitCostSource: FinanceProjectEstimate["productionUnitCostSource"] =
    actualProductionUnitCost !== null ? "actual" : project.theoreticalProductionUnitCost !== null ? "theoretical" : "missing";
  const productionUnitCostVariance =
    actualProductionUnitCost !== null && project.theoreticalProductionUnitCost !== null
      ? roundMoney(actualProductionUnitCost - project.theoreticalProductionUnitCost)
      : null;
  const actualRevenueFormula = project.retailPriceValue === null ? null : roundMoney(project.retailPriceValue * project.discountRate * actualSales);
  const actualRevenue = actualRevenueInput ?? actualRevenueFormula;
  const actualRevenueSource: FinanceProjectEstimate["actualRevenueSource"] =
    actualRevenueInput !== null ? "actual" : actualRevenueFormula !== null ? "formula" : "missing";
  const channelSampleCost =
    productionUnitCostForActual === null ? null : roundMoney(channelSampleQuantity * productionUnitCostForActual);
  const actualSalesProductionCost =
    productionUnitCostForActual === null ? null : roundMoney(actualSales * productionUnitCostForActual);
  const displayBoxCost = roundMoney(displayBoxQuantity * displayBoxUnitPrice);
  const totalInventory = totalOrderQuantity - actualSales - channelSampleQuantity;
  const inventoryCost = productionUnitCostForActual === null ? null : roundMoney(totalInventory * productionUnitCostForActual);
  const actualResult =
    actualRevenue === null || channelSampleCost === null || actualSalesProductionCost === null || inventoryCost === null
      ? null
      : roundMoney(actualRevenue - actualDevelopmentCost - channelSampleCost - displayBoxCost - inventoryCost - actualSalesProductionCost);
  const developmentCostVariance =
    project.theoreticalDevelopmentCost === null ? null : roundMoney(actualDevelopmentCost - project.theoreticalDevelopmentCost);

  return {
    actualRevenue,
    actualRevenueSource,
    productionUnitCostForActual,
    productionUnitCostSource,
    productionUnitCostVariance,
    channelSampleCost,
    actualSalesProductionCost,
    displayBoxCost,
    totalInventory,
    inventoryCost,
    actualResult,
    developmentCostVariance,
    hasNegativeInventory: totalInventory < 0,
  };
}

function parseDraftNumber(value: string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function parseOptionalDraftNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function toInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toWan(value: number) {
  return Math.round((value / 10000) * 100) / 100;
}

function toWanOrNull(value: number | null) {
  return value === null ? null : toWan(value);
}

function formatYuan(value: number | null) {
  return value === null ? "待补" : `¥${decimalFormatter.format(value)}`;
}

function formatWan(value: number | null) {
  return value === null ? "-" : `${decimalFormatter.format(value)} 万`;
}

function formatInteger(value: number) {
  return integerFormatter.format(value);
}

function formatNumber(value: number) {
  return decimalFormatter.format(value);
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

function formatActualRevenueSource(value: "actual" | "formula" | "missing") {
  if (value === "actual") {
    return "实际录入";
  }

  if (value === "formula") {
    return "公式兜底";
  }

  return "待补";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
