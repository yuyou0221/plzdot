import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  defaultFinanceConfig,
  financeLevelDefinitions,
  financeRuleVersion,
  matchFinanceLevel,
  normalizeFinanceDiscount,
  normalizeFinanceSalesByLevel,
  parseProjectRetailPrice,
  type FinanceConfigData,
  type FinanceLevelKey,
} from "@/lib/finance/finance-estimation-rules";

const productionCostRate = 0.325;

export type FinanceProjectFactData = {
  actualDevelopmentCost: number | null;
  totalOrderQuantity: number | null;
  actualSales: number | null;
  channelSampleQuantity: number | null;
  displayBoxQuantity: number | null;
  displayBoxUnitPrice: number | null;
  notes: string | null;
  updatedAt: string | null;
};

export type FinanceProjectEstimate = {
  projectId: string;
  projectCode: string | null;
  projectName: string;
  licensorName: string | null;
  ipName: string | null;
  subsidiary: string | null;
  productType: string | null;
  productLine: string | null;
  specificationCount: number | null;
  retailPrice: string | null;
  retailPriceValue: number | null;
  projectLevel: string | null;
  levelKey: FinanceLevelKey | null;
  levelLabel: string | null;
  predictedSales: number | null;
  discountRate: number;
  status: string;
  plannedLaunchDate: string;
  plannedLaunchMonth: string;
  plannedLaunchYear: number;
  revenueYear: number;
  revenueYearSource: "projectCode" | "plannedLaunchDate";
  estimatedRevenue: number | null;
  estimatedRevenueWan: number | null;
  theoreticalDevelopmentCost: number | null;
  theoreticalDevelopmentCostWan: number | null;
  theoreticalProductionUnitCost: number | null;
  actualFact: FinanceProjectFactData;
  actualRevenue: number | null;
  actualRevenueWan: number | null;
  channelSampleCost: number | null;
  channelSampleCostWan: number | null;
  displayBoxCost: number;
  displayBoxCostWan: number;
  totalInventory: number;
  inventoryCost: number | null;
  inventoryCostWan: number | null;
  actualResult: number | null;
  actualResultWan: number | null;
  developmentCostVariance: number | null;
  developmentCostVarianceWan: number | null;
  formulaText: string | null;
  actualFormulaText: string | null;
  issues: string[];
  actualIssues: string[];
  hasNegativeInventory: boolean;
  isExcluded: boolean;
};

export type FinanceBucket = {
  key: string;
  label: string;
  projectCount: number;
  estimatedProjectCount: number;
  totalEstimatedRevenue: number;
  totalEstimatedRevenueWan: number;
};

export type FinanceEstimationData = {
  generatedAt: string;
  sourceLabel: string;
  ruleVersion: string;
  selectedYear: number | null;
  availableYears: number[];
  assumptions: string[];
  config: FinanceConfigData;
  summary: {
    projectCount: number;
    activeProjectCount: number;
    estimatedProjectCount: number;
    blockedProjectCount: number;
    excludedProjectCount: number;
    totalEstimatedRevenue: number;
    totalEstimatedRevenueWan: number;
    averageEstimatedRevenue: number;
    averageEstimatedRevenueWan: number;
    actualCalculatedProjectCount: number;
    negativeInventoryProjectCount: number;
    totalActualRevenue: number;
    totalActualRevenueWan: number;
    totalActualDevelopmentCost: number;
    totalActualDevelopmentCostWan: number;
    totalChannelSampleCost: number;
    totalChannelSampleCostWan: number;
    totalDisplayBoxCost: number;
    totalDisplayBoxCostWan: number;
    totalInventoryCost: number;
    totalInventoryCostWan: number;
    totalActualResult: number;
    totalActualResultWan: number;
  };
  projects: FinanceProjectEstimate[];
  yearBuckets: FinanceBucket[];
  subsidiaryYearBuckets: FinanceBucket[];
  subsidiaryBuckets: FinanceBucket[];
  monthBuckets: FinanceBucket[];
  levelBuckets: FinanceBucket[];
  levelDefinitions: typeof financeLevelDefinitions;
};

type ProjectRecord = {
  id: string;
  projectCode: string | null;
  projectName: string;
  licensorName: string | null;
  ipName: string | null;
  subsidiary: string | null;
  productType: string | null;
  productLine: string | null;
  styleCount: number | null;
  retailPrice: string | null;
  projectLevel: string | null;
  plannedLaunchDate: Date;
  status: string;
};

type FinanceFactRecord = {
  projectId: string;
  actualDevelopmentCost: number | null;
  totalOrderQuantity: number | null;
  actualSales: number | null;
  channelSampleQuantity: number | null;
  displayBoxQuantity: number | null;
  displayBoxUnitPrice: number | null;
  notes: string | null;
  updatedAt: Date;
};

export class FinanceProjectFactInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceProjectFactInputError";
  }
}

export async function getFinanceEstimationData(options: { year?: number | null } = {}): Promise<FinanceEstimationData> {
  const [config, projects, facts] = await Promise.all([
    getOrCreateFinanceConfig(),
    prisma.project.findMany({
      orderBy: [{ plannedLaunchDate: "asc" }, { projectCode: "asc" }, { projectName: "asc" }],
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        licensorName: true,
        ipName: true,
        subsidiary: true,
        productType: true,
        productLine: true,
        styleCount: true,
        retailPrice: true,
        projectLevel: true,
        plannedLaunchDate: true,
        status: true,
      },
    }),
    prisma.financeProjectFact.findMany({
      select: {
        projectId: true,
        actualDevelopmentCost: true,
        totalOrderQuantity: true,
        actualSales: true,
        channelSampleQuantity: true,
        displayBoxQuantity: true,
        displayBoxUnitPrice: true,
        notes: true,
        updatedAt: true,
      },
    }),
  ]);

  const factByProjectId = new Map(facts.map((fact) => [fact.projectId, fact]));
  const allEstimates = projects.map((project) => toFinanceProjectEstimate(project, config, factByProjectId.get(project.id) ?? null));
  const availableYears = [...new Set(allEstimates.map((project) => project.revenueYear))].sort((left, right) => left - right);
  const selectedYear = resolveSelectedYear(options.year, availableYears);
  const selectedEstimates =
    selectedYear === null ? allEstimates : allEstimates.filter((project) => project.revenueYear === selectedYear);
  const activeEstimates = selectedEstimates.filter((project) => !project.isExcluded);
  const estimatedProjects = activeEstimates.filter((project) => project.estimatedRevenue !== null);
  const blockedProjects = activeEstimates.filter((project) => project.estimatedRevenue === null);
  const actualCalculatedProjects = activeEstimates.filter((project) => project.actualResult !== null);
  const totalEstimatedRevenue = estimatedProjects.reduce((total, project) => total + (project.estimatedRevenue ?? 0), 0);
  const averageEstimatedRevenue = estimatedProjects.length > 0 ? Math.round(totalEstimatedRevenue / estimatedProjects.length) : 0;
  const actualSummary = buildActualSummary(activeEstimates);

  return {
    generatedAt: new Date().toISOString(),
    sourceLabel: "Project 项目主数据 + FinanceProjectFact 项目财务事实",
    ruleVersion: financeRuleVersion,
    selectedYear,
    availableYears,
    assumptions: [
      "理论营收 = 规格（款式数）× 零售价 × 统一折扣 × 项目等级预测销量。",
      "理论开发成本 = 零售价 × 10000 / 6。",
      "理论生产单件成本 = 零售价 × 32.5%。",
      "实际营收 = 零售价 × 统一折扣 × 实际销量。",
      "渠道样品成本 = 渠道展示样品数量 × 理论生产单件成本。",
      "展示盒成本 = 展示盒数量 × 展示盒单价。",
      "总库存 = 总订单数量 - 实际销量 - 渠道展示样品数量，库存成本 = 总库存 × 理论生产单件成本。",
      "实际测算结果 = 实际营收 - 实际开发成本 - 渠道样品成本 - 展示盒成本 - 库存成本。",
      "未录入的数量和金额字段按 0 参与实际测算，但会在项目行提示未录入。",
      "营收年度优先按项目编号前两位归属，例如 26xxx 计入 2026 年，27xxx 计入 2027 年。",
      "金额汇总按万元展示；编辑录入金额时使用元。",
      "状态为取消的项目暂不计入汇总。",
    ],
    config,
    summary: {
      projectCount: selectedEstimates.length,
      activeProjectCount: activeEstimates.length,
      estimatedProjectCount: estimatedProjects.length,
      blockedProjectCount: blockedProjects.length,
      excludedProjectCount: selectedEstimates.length - activeEstimates.length,
      totalEstimatedRevenue,
      totalEstimatedRevenueWan: toWan(totalEstimatedRevenue),
      averageEstimatedRevenue,
      averageEstimatedRevenueWan: toWan(averageEstimatedRevenue),
      actualCalculatedProjectCount: actualCalculatedProjects.length,
      negativeInventoryProjectCount: activeEstimates.filter((project) => project.hasNegativeInventory).length,
      ...actualSummary,
    },
    projects: selectedEstimates,
    yearBuckets: buildBuckets(allEstimates.filter((project) => !project.isExcluded), (project) => String(project.revenueYear), (project) => `${project.revenueYear} 年`),
    subsidiaryYearBuckets: buildBuckets(
      allEstimates.filter((project) => !project.isExcluded),
      (project) => `${project.revenueYear}:${normalizedSubsidiary(project.subsidiary)}`,
      (project) => `${project.revenueYear} 年 · ${normalizedSubsidiary(project.subsidiary)}`,
    ),
    subsidiaryBuckets: buildBuckets(
      activeEstimates,
      (project) => normalizedSubsidiary(project.subsidiary),
      (project) => normalizedSubsidiary(project.subsidiary),
    ),
    monthBuckets: buildBuckets(activeEstimates, (project) => project.plannedLaunchMonth, (project) => formatMonthLabel(project.plannedLaunchMonth)),
    levelBuckets: buildBuckets(
      activeEstimates.filter((project) => project.levelLabel),
      (project) => project.levelLabel ?? "未匹配等级",
      (project) => project.levelLabel ?? "未匹配等级",
    ),
    levelDefinitions: financeLevelDefinitions,
  };
}

export async function getFinanceProjectEstimate(projectId: string): Promise<FinanceProjectEstimate | null> {
  const normalizedProjectId = projectId.trim();

  if (!normalizedProjectId) {
    return null;
  }

  const [config, project, fact] = await Promise.all([
    getOrCreateFinanceConfig(),
    prisma.project.findUnique({
      where: { id: normalizedProjectId },
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        licensorName: true,
        ipName: true,
        subsidiary: true,
        productType: true,
        productLine: true,
        styleCount: true,
        retailPrice: true,
        projectLevel: true,
        plannedLaunchDate: true,
        status: true,
      },
    }),
    prisma.financeProjectFact.findUnique({
      where: { projectId: normalizedProjectId },
      select: {
        projectId: true,
        actualDevelopmentCost: true,
        totalOrderQuantity: true,
        actualSales: true,
        channelSampleQuantity: true,
        displayBoxQuantity: true,
        displayBoxUnitPrice: true,
        notes: true,
        updatedAt: true,
      },
    }),
  ]);

  return project ? toFinanceProjectEstimate(project, config, fact) : null;
}

export async function updateFinanceEstimationConfig(input: { discountRate: unknown; salesByLevel: unknown; updatedByUserId?: string | null }) {
  const discountRate = normalizeFinanceDiscount(input.discountRate);
  const salesByLevel = normalizeFinanceSalesByLevel(input.salesByLevel);

  const config = await prisma.financeEstimationConfig.upsert({
    where: { name: "default" },
    create: {
      name: "default",
      discountRate,
      salesByLevel,
      updatedByUserId: input.updatedByUserId ?? null,
    },
    update: {
      discountRate,
      salesByLevel,
      updatedByUserId: input.updatedByUserId ?? null,
    },
  });

  return toFinanceConfigData(config);
}

export async function updateFinanceProjectFact(input: {
  projectId: string;
  actualDevelopmentCost: unknown;
  totalOrderQuantity: unknown;
  actualSales: unknown;
  channelSampleQuantity: unknown;
  displayBoxQuantity: unknown;
  displayBoxUnitPrice: unknown;
  notes: unknown;
  updatedByUserId?: string | null;
}) {
  const projectId = String(input.projectId ?? "").trim();

  if (!projectId) {
    throw new FinanceProjectFactInputError("项目 ID 不正确。");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    throw new FinanceProjectFactInputError("项目不存在，无法保存财务事实。");
  }

  const fact = await prisma.financeProjectFact.upsert({
    where: { projectId },
    create: {
      projectId,
      actualDevelopmentCost: normalizeOptionalMoney(input.actualDevelopmentCost, "实际开发成本"),
      totalOrderQuantity: normalizeOptionalQuantity(input.totalOrderQuantity, "总订单数量"),
      actualSales: normalizeOptionalQuantity(input.actualSales, "实际销量"),
      channelSampleQuantity: normalizeOptionalQuantity(input.channelSampleQuantity, "渠道样品量"),
      displayBoxQuantity: normalizeOptionalQuantity(input.displayBoxQuantity, "展示盒数量"),
      displayBoxUnitPrice: normalizeOptionalMoney(input.displayBoxUnitPrice, "展示盒单价"),
      notes: normalizeOptionalText(input.notes),
      updatedByUserId: input.updatedByUserId ?? null,
    },
    update: {
      actualDevelopmentCost: normalizeOptionalMoney(input.actualDevelopmentCost, "实际开发成本"),
      totalOrderQuantity: normalizeOptionalQuantity(input.totalOrderQuantity, "总订单数量"),
      actualSales: normalizeOptionalQuantity(input.actualSales, "实际销量"),
      channelSampleQuantity: normalizeOptionalQuantity(input.channelSampleQuantity, "渠道样品量"),
      displayBoxQuantity: normalizeOptionalQuantity(input.displayBoxQuantity, "展示盒数量"),
      displayBoxUnitPrice: normalizeOptionalMoney(input.displayBoxUnitPrice, "展示盒单价"),
      notes: normalizeOptionalText(input.notes),
      updatedByUserId: input.updatedByUserId ?? null,
    },
  });

  return toFinanceProjectFactData(fact);
}

async function getOrCreateFinanceConfig(): Promise<FinanceConfigData> {
  const config = await prisma.financeEstimationConfig.upsert({
    where: { name: "default" },
    create: {
      name: "default",
      discountRate: defaultFinanceConfig.discountRate,
      salesByLevel: defaultFinanceConfig.salesByLevel,
    },
    update: {},
  });

  return toFinanceConfigData(config);
}

function toFinanceProjectEstimate(project: ProjectRecord, config: FinanceConfigData, fact: FinanceFactRecord | null): FinanceProjectEstimate {
  const level = matchFinanceLevel(project.projectLevel);
  const retailPriceValue = parseProjectRetailPrice(project.retailPrice);
  const predictedSales = level ? config.salesByLevel[level.key] : null;
  const issues: string[] = [];
  const actualIssues: string[] = [];
  const isExcluded = project.status.includes("取消");

  if (!isExcluded) {
    if (!project.styleCount || project.styleCount <= 0) {
      issues.push("缺少有效规格 / 款式数");
    }

    if (!retailPriceValue) {
      issues.push("缺少有效零售价");
      actualIssues.push("缺少有效零售价，实际营收和生产成本暂不能计算");
    }

    if (!level) {
      issues.push("项目等级未匹配");
    }

    if (level && (!predictedSales || predictedSales <= 0)) {
      issues.push(`${level.label} 预测销量未配置`);
    }

    if (config.discountRate <= 0) {
      issues.push("统一折扣未配置");
    }
  }

  const estimatedRevenue =
    !isExcluded && issues.length === 0 && project.styleCount && retailPriceValue && predictedSales
      ? roundMoney(project.styleCount * retailPriceValue * config.discountRate * predictedSales)
      : null;
  const plannedLaunchDate = toDateString(project.plannedLaunchDate);
  const revenueYearResult = revenueYearFromProjectCode(project.projectCode, plannedLaunchDate);
  const actualFact = toFinanceProjectFactData(fact);

  addMissingActualInputIssues(actualFact, actualIssues);

  const actualDevelopmentCostForCalc = actualFact.actualDevelopmentCost ?? 0;
  const totalOrderQuantityForCalc = actualFact.totalOrderQuantity ?? 0;
  const actualSalesForCalc = actualFact.actualSales ?? 0;
  const channelSampleQuantityForCalc = actualFact.channelSampleQuantity ?? 0;
  const displayBoxQuantityForCalc = actualFact.displayBoxQuantity ?? 0;
  const displayBoxUnitPriceForCalc = actualFact.displayBoxUnitPrice ?? 0;
  const theoreticalDevelopmentCost = retailPriceValue === null ? null : roundMoney((retailPriceValue * 10000) / 6);
  const theoreticalProductionUnitCost = retailPriceValue === null ? null : roundMoney(retailPriceValue * productionCostRate);
  const actualRevenue = retailPriceValue === null ? null : roundMoney(retailPriceValue * config.discountRate * actualSalesForCalc);
  const channelSampleCost =
    theoreticalProductionUnitCost === null ? null : roundMoney(channelSampleQuantityForCalc * theoreticalProductionUnitCost);
  const displayBoxCost = roundMoney(displayBoxQuantityForCalc * displayBoxUnitPriceForCalc);
  const totalInventory = totalOrderQuantityForCalc - actualSalesForCalc - channelSampleQuantityForCalc;
  const inventoryCost = theoreticalProductionUnitCost === null ? null : roundMoney(totalInventory * theoreticalProductionUnitCost);
  const actualResult =
    actualRevenue === null || channelSampleCost === null || inventoryCost === null
      ? null
      : roundMoney(actualRevenue - actualDevelopmentCostForCalc - channelSampleCost - displayBoxCost - inventoryCost);
  const developmentCostVariance =
    theoreticalDevelopmentCost === null ? null : roundMoney(actualDevelopmentCostForCalc - theoreticalDevelopmentCost);
  const hasNegativeInventory = totalInventory < 0;

  if (hasNegativeInventory) {
    actualIssues.push("总库存为负，请检查总订单、实际销量和渠道样品量");
  }

  return {
    projectId: project.id,
    projectCode: project.projectCode,
    projectName: project.projectName,
    licensorName: project.licensorName,
    ipName: project.ipName,
    subsidiary: project.subsidiary,
    productType: project.productType,
    productLine: project.productLine,
    specificationCount: project.styleCount,
    retailPrice: project.retailPrice,
    retailPriceValue,
    projectLevel: project.projectLevel,
    levelKey: level?.key ?? null,
    levelLabel: level?.label ?? null,
    predictedSales: predictedSales && predictedSales > 0 ? predictedSales : null,
    discountRate: config.discountRate,
    status: project.status,
    plannedLaunchDate,
    plannedLaunchMonth: plannedLaunchDate.slice(0, 7),
    plannedLaunchYear: Number(plannedLaunchDate.slice(0, 4)),
    revenueYear: revenueYearResult.year,
    revenueYearSource: revenueYearResult.source,
    estimatedRevenue,
    estimatedRevenueWan: estimatedRevenue === null ? null : toWan(estimatedRevenue),
    theoreticalDevelopmentCost,
    theoreticalDevelopmentCostWan: theoreticalDevelopmentCost === null ? null : toWan(theoreticalDevelopmentCost),
    theoreticalProductionUnitCost,
    actualFact,
    actualRevenue,
    actualRevenueWan: actualRevenue === null ? null : toWan(actualRevenue),
    channelSampleCost,
    channelSampleCostWan: channelSampleCost === null ? null : toWan(channelSampleCost),
    displayBoxCost,
    displayBoxCostWan: toWan(displayBoxCost),
    totalInventory,
    inventoryCost,
    inventoryCostWan: inventoryCost === null ? null : toWan(inventoryCost),
    actualResult,
    actualResultWan: actualResult === null ? null : toWan(actualResult),
    developmentCostVariance,
    developmentCostVarianceWan: developmentCostVariance === null ? null : toWan(developmentCostVariance),
    formulaText:
      estimatedRevenue === null || !project.styleCount || !retailPriceValue || !predictedSales
        ? null
        : `${project.styleCount} × ${retailPriceValue} × ${config.discountRate} × ${predictedSales}`,
    actualFormulaText:
      actualResult === null || retailPriceValue === null
        ? null
        : `实际营收 ${actualRevenue} - 开发 ${actualDevelopmentCostForCalc} - 样品 ${channelSampleCost} - 展示盒 ${displayBoxCost} - 库存 ${inventoryCost}`,
    issues: isExcluded ? ["项目已取消，暂不计入汇总"] : issues,
    actualIssues: isExcluded ? ["项目已取消，实际测算暂不计入汇总"] : actualIssues,
    hasNegativeInventory,
    isExcluded,
  };
}

function buildActualSummary(projects: FinanceProjectEstimate[]) {
  return {
    totalActualRevenue: sumNullable(projects, (project) => project.actualRevenue),
    totalActualRevenueWan: toWan(sumNullable(projects, (project) => project.actualRevenue)),
    totalActualDevelopmentCost: projects.reduce((total, project) => total + (project.actualFact.actualDevelopmentCost ?? 0), 0),
    totalActualDevelopmentCostWan: toWan(projects.reduce((total, project) => total + (project.actualFact.actualDevelopmentCost ?? 0), 0)),
    totalChannelSampleCost: sumNullable(projects, (project) => project.channelSampleCost),
    totalChannelSampleCostWan: toWan(sumNullable(projects, (project) => project.channelSampleCost)),
    totalDisplayBoxCost: projects.reduce((total, project) => total + project.displayBoxCost, 0),
    totalDisplayBoxCostWan: toWan(projects.reduce((total, project) => total + project.displayBoxCost, 0)),
    totalInventoryCost: sumNullable(projects, (project) => project.inventoryCost),
    totalInventoryCostWan: toWan(sumNullable(projects, (project) => project.inventoryCost)),
    totalActualResult: sumNullable(projects, (project) => project.actualResult),
    totalActualResultWan: toWan(sumNullable(projects, (project) => project.actualResult)),
  };
}

function addMissingActualInputIssues(actualFact: FinanceProjectFactData, issues: string[]) {
  if (actualFact.actualDevelopmentCost === null) {
    issues.push("实际开发成本未录入，暂按 0 计算");
  }
  if (actualFact.totalOrderQuantity === null) {
    issues.push("总订单数量未录入，暂按 0 计算");
  }
  if (actualFact.actualSales === null) {
    issues.push("实际销量未录入，暂按 0 计算");
  }
  if (actualFact.channelSampleQuantity === null) {
    issues.push("渠道样品量未录入，暂按 0 计算");
  }
  if (actualFact.displayBoxQuantity === null) {
    issues.push("展示盒数量未录入，暂按 0 计算");
  }
  if (actualFact.displayBoxUnitPrice === null) {
    issues.push("展示盒单价未录入，暂按 0 计算");
  }
}

function toFinanceProjectFactData(fact: FinanceFactRecord | null | undefined): FinanceProjectFactData {
  return {
    actualDevelopmentCost: fact?.actualDevelopmentCost ?? null,
    totalOrderQuantity: fact?.totalOrderQuantity ?? null,
    actualSales: fact?.actualSales ?? null,
    channelSampleQuantity: fact?.channelSampleQuantity ?? null,
    displayBoxQuantity: fact?.displayBoxQuantity ?? null,
    displayBoxUnitPrice: fact?.displayBoxUnitPrice ?? null,
    notes: fact?.notes ?? null,
    updatedAt: fact?.updatedAt ? fact.updatedAt.toISOString() : null,
  };
}

function revenueYearFromProjectCode(projectCode: string | null | undefined, plannedLaunchDate: string) {
  const normalizedCode = (projectCode ?? "").trim();
  const match = normalizedCode.match(/^(\d{2})/);

  if (match) {
    const shortYear = Number(match[1]);
    if (Number.isFinite(shortYear)) {
      return { year: 2000 + shortYear, source: "projectCode" as const };
    }
  }

  return { year: Number(plannedLaunchDate.slice(0, 4)), source: "plannedLaunchDate" as const };
}

function normalizedSubsidiary(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : "未填写子公司";
}

function toFinanceConfigData(config: { id: string; discountRate: number; salesByLevel: unknown; updatedAt: Date }): FinanceConfigData {
  return {
    id: config.id,
    discountRate: normalizeFinanceDiscount(config.discountRate),
    salesByLevel: normalizeFinanceSalesByLevel(config.salesByLevel),
    updatedAt: config.updatedAt.toISOString(),
  };
}

function buildBuckets(
  projects: FinanceProjectEstimate[],
  keyGetter: (project: FinanceProjectEstimate) => string,
  labelGetter: (project: FinanceProjectEstimate) => string,
): FinanceBucket[] {
  const bucketMap = new Map<string, FinanceBucket>();

  for (const project of projects) {
    const key = keyGetter(project);
    const existing = bucketMap.get(key) ?? {
      key,
      label: labelGetter(project),
      projectCount: 0,
      estimatedProjectCount: 0,
      totalEstimatedRevenue: 0,
      totalEstimatedRevenueWan: 0,
    };

    existing.projectCount += 1;

    if (project.estimatedRevenue !== null) {
      existing.estimatedProjectCount += 1;
      existing.totalEstimatedRevenue += project.estimatedRevenue;
      existing.totalEstimatedRevenueWan = toWan(existing.totalEstimatedRevenue);
    }

    bucketMap.set(key, existing);
  }

  return [...bucketMap.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function resolveSelectedYear(year: number | null | undefined, availableYears: number[]) {
  if (availableYears.length === 0) {
    return null;
  }

  if (year && availableYears.includes(year)) {
    return year;
  }

  const currentYear = new Date().getFullYear();
  return availableYears.includes(currentYear) ? currentYear : availableYears[0];
}

function normalizeOptionalMoney(value: unknown, label: string) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new FinanceProjectFactInputError(`${label}必须是大于等于 0 的数字。`);
  }

  return roundMoney(numberValue);
}

function normalizeOptionalQuantity(value: unknown, label: string) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new FinanceProjectFactInputError(`${label}必须是大于等于 0 的整数。`);
  }

  return Math.trunc(numberValue);
}

function normalizeOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text.slice(0, 2000) : null;
}

function sumNullable(projects: FinanceProjectEstimate[], valueGetter: (project: FinanceProjectEstimate) => number | null) {
  return projects.reduce((total, project) => total + (valueGetter(project) ?? 0), 0);
}

function toDateString(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year.slice(2)}年${Number(monthNumber)}月`;
}

function toWan(value: number) {
  return Math.round((value / 10000) * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
