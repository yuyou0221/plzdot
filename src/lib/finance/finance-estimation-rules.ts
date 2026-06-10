export const financeRuleVersion = "finance-actuals-v4-20260611";

export type FinanceLevelKey = "S" | "A" | "B" | "C";

export type FinanceLevelDefinition = {
  key: FinanceLevelKey;
  label: string;
  aliases: string[];
};

export type FinanceConfigData = {
  id: string;
  discountRate: number;
  salesByLevel: Record<FinanceLevelKey, number>;
  updatedAt: string;
};

export const financeLevelDefinitions: FinanceLevelDefinition[] = [
  { key: "S", label: "S 级", aliases: ["S", "S级", "S 级"] },
  { key: "A", label: "A 级", aliases: ["A", "A级", "A 级"] },
  { key: "B", label: "B 级", aliases: ["B", "B级", "B 级"] },
  { key: "C", label: "C 级", aliases: ["C", "C级", "C 级"] },
];

export const defaultFinanceConfig = {
  discountRate: 1,
  salesByLevel: {
    S: 0,
    A: 0,
    B: 0,
    C: 0,
  } satisfies Record<FinanceLevelKey, number>,
};

export function matchFinanceLevel(projectLevel: string | null | undefined) {
  const sourceText = normalizeRuleText(projectLevel ?? "");

  if (!sourceText) {
    return null;
  }

  return (
    financeLevelDefinitions.find((definition) => {
      return definition.aliases.some((alias) => {
        const normalizedAlias = normalizeRuleText(alias);
        return sourceText === normalizedAlias || sourceText.includes(normalizedAlias);
      });
    }) ?? null
  );
}

export function normalizeFinanceDiscount(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return defaultFinanceConfig.discountRate;
  }

  return roundTo(numberValue, 4);
}

export function normalizeFinanceSalesByLevel(value: unknown): Record<FinanceLevelKey, number> {
  const source = isRecord(value) ? value : {};
  const result = { ...defaultFinanceConfig.salesByLevel };

  for (const definition of financeLevelDefinitions) {
    const rawValue = source[definition.key];
    const numberValue = Number(rawValue);
    result[definition.key] = Number.isFinite(numberValue) && numberValue >= 0 ? Math.trunc(numberValue) : 0;
  }

  return result;
}

export function parseProjectRetailPrice(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalizedValue = value.replace(/,/g, "").replace(/[￥¥元]/g, " ");
  const match = normalizedValue.match(/\d+(?:\.\d+)?/);
  const numberValue = match ? Number(match[0]) : Number.NaN;

  return Number.isFinite(numberValue) && numberValue > 0 ? roundTo(numberValue, 2) : null;
}

function normalizeRuleText(value: string) {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

function roundTo(value: number, precision: number) {
  const unit = 10 ** precision;
  return Math.round(value * unit) / unit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
