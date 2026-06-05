export type FinanceProductRevenueRule = {
  id: string;
  label: string;
  keywords: string[];
  baseRevenuePerStyle: number;
};

export type FinanceLevelMultiplierRule = {
  id: string;
  label: string;
  aliases: string[];
  multiplier: number;
};

export const financeRuleVersion = "finance-mvp-20260606";

export const financeProductRevenueRules: FinanceProductRevenueRule[] = [
  { id: "scaled-figure", label: "正比例手办", keywords: ["正比例"], baseRevenuePerStyle: 250000 },
  { id: "vinyl-plush", label: "搪胶毛绒", keywords: ["搪胶毛绒"], baseRevenuePerStyle: 160000 },
  { id: "soft-vinyl", label: "搪胶", keywords: ["搪胶"], baseRevenuePerStyle: 180000 },
  { id: "plush", label: "毛绒", keywords: ["毛绒"], baseRevenuePerStyle: 120000 },
  { id: "q-figure", label: "Q版手办", keywords: ["Q版", "q版", "手办"], baseRevenuePerStyle: 120000 },
  { id: "pvc-mini", label: "PVC mini / 盲盒", keywords: ["PVCmini", "PVC mini", "mini", "盲盒"], baseRevenuePerStyle: 90000 },
  { id: "pvc-pendant", label: "PVC挂件", keywords: ["PVC挂件", "挂件"], baseRevenuePerStyle: 60000 },
  { id: "expression-pack", label: "表情包", keywords: ["表情包"], baseRevenuePerStyle: 50000 },
];

export const financeLevelMultiplierRules: FinanceLevelMultiplierRule[] = [
  { id: "s", label: "S 级", aliases: ["S", "S级", "S 级"], multiplier: 1.35 },
  { id: "a", label: "A 级", aliases: ["A", "A级", "A 级"], multiplier: 1.15 },
  { id: "b", label: "B 级", aliases: ["B", "B级", "B 级"], multiplier: 1 },
  { id: "c", label: "C 级", aliases: ["C", "C级", "C 级"], multiplier: 0.75 },
];

export function matchFinanceProductRule(productType: string | null | undefined, productLine: string | null | undefined) {
  const sourceText = normalizeRuleText([productType, productLine].filter(Boolean).join(" "));

  if (!sourceText) {
    return null;
  }

  return (
    financeProductRevenueRules.find((rule) => {
      return rule.keywords.some((keyword) => sourceText.includes(normalizeRuleText(keyword)));
    }) ?? null
  );
}

export function matchFinanceLevelRule(projectLevel: string | null | undefined) {
  const sourceText = normalizeRuleText(projectLevel ?? "");

  if (!sourceText) {
    return null;
  }

  return (
    financeLevelMultiplierRules.find((rule) => {
      return rule.aliases.some((alias) => sourceText === normalizeRuleText(alias) || sourceText.includes(normalizeRuleText(alias)));
    }) ?? null
  );
}

function normalizeRuleText(value: string) {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}
