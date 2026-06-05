"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Save } from "lucide-react";
import type { FinanceLevelDefinition } from "@/lib/finance/finance-estimation-rules";
import type { FinanceEstimationData } from "@/lib/finance/finance-estimation-repository";

type FinanceConfigPanelProps = {
  config: FinanceEstimationData["config"];
  levelDefinitions: FinanceLevelDefinition[];
};

export function FinanceConfigPanel({ config, levelDefinitions }: FinanceConfigPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [discountPercent, setDiscountPercent] = useState(() => String(Math.round(config.discountRate * 10000) / 100));
  const [salesByLevel, setSalesByLevel] = useState(() => {
    return Object.fromEntries(levelDefinitions.map((definition) => [definition.key, String(config.salesByLevel[definition.key] ?? 0)]));
  });
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  const updatedAtLabel = useMemo(() => {
    const date = new Date(config.updatedAt);
    return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN", { hour12: false });
  }, [config.updatedAt]);

  async function saveConfig() {
    setMessage(null);
    const parsedDiscountPercent = Number(discountPercent);

    if (!Number.isFinite(parsedDiscountPercent) || parsedDiscountPercent < 0) {
      setMessageTone("error");
      setMessage("折扣必须是大于等于 0 的数字。");
      return;
    }

    const nextSalesByLevel = Object.fromEntries(
      levelDefinitions.map((definition) => {
        const value = Number(salesByLevel[definition.key]);
        return [definition.key, Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0];
      }),
    );

    const response = await fetch("/api/finance/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discountRate: parsedDiscountPercent / 100,
        salesByLevel: nextSalesByLevel,
      }),
    });

    const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

    if (!response.ok || !result?.ok) {
      setMessageTone("error");
      setMessage(result?.message ?? "保存失败。");
      return;
    }

    setMessageTone("success");
    setMessage("配置已保存，测算结果已刷新。");
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">测算配置</h3>
          <p className="mt-1 text-sm text-slate-500">管理员可配置统一折扣和不同项目等级的预测销量。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">更新：{updatedAtLabel}</span>
      </div>

      <div className="mt-4 grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm font-semibold text-slate-700">统一折扣（%）</span>
          <input
            value={discountPercent}
            onChange={(event) => setDiscountPercent(event.target.value)}
            inputMode="decimal"
            className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-300 focus:bg-white"
            placeholder="例如 65"
          />
          <span className="text-xs text-slate-500">例如填 65，代表所有项目统一按 65% 折扣计算。</span>
        </label>

        <div className="grid gap-3">
          {levelDefinitions.map((definition) => (
            <label key={definition.key} className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-sm font-semibold text-slate-700">{definition.label} 预测销量</span>
              <input
                value={salesByLevel[definition.key] ?? "0"}
                onChange={(event) => setSalesByLevel((current) => ({ ...current, [definition.key]: event.target.value }))}
                inputMode="numeric"
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-300"
                placeholder="请输入销量"
              />
            </label>
          ))}
        </div>

        {message ? (
          <div className={messageTone === "success" ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700" : "rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"}>
            {message}
          </div>
        ) : null}

        <button
          type="button"
          onClick={saveConfig}
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Save size={16} />
          {isPending ? "保存中" : "保存配置"}
        </button>
      </div>
    </section>
  );
}
