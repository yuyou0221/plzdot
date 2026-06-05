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
  formulaText: string | null;
  issues: string[];
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
  };
  projects: FinanceProjectEstimate[];
  yearBuckets: FinanceBucket[];
  subsidiaryYearBuckets: FinanceBucket[];
  subsidiaryBuckets: FinanceBucket[];
  monthBuckets: FinanceBucket[];
  levelBuckets: FinanceBucket[];
  levelDefinitions: typeof financeLevelDefinitions;
};

export async function getFinanceEstimationData(options: { year?: number | null } = {}): Promise<FinanceEstimationData> {
  const [config, projects] = await Promise.all([
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
  ]);

  const allEstimates = projects.map((project) => toFinanceProjectEstimate(project, config));
  const availableYears = [...new Set(allEstimates.map((project) => project.revenueYear))].sort((left, right) => left - right);
  const selectedYear = resolveSelectedYear(options.year, availableYears);
  const selectedEstimates =
    selectedYear === null ? allEstimates : allEstimates.filter((project) => project.revenueYear === selectedYear);
  const activeEstimates = selectedEstimates.filter((project) => !project.isExcluded);
  const estimatedProjects = activeEstimates.filter((project) => project.estimatedRevenue !== null);
  const blockedProjects = activeEstimates.filter((project) => project.estimatedRevenue === null);
  const totalEstimatedRevenue = estimatedProjects.reduce((total, project) => total + (project.estimatedRevenue ?? 0), 0);
  const averageEstimatedRevenue = estimatedProjects.length > 0 ? Math.round(totalEstimatedRevenue / estimatedProjects.length) : 0;

  return {
    generatedAt: new Date().toISOString(),
    sourceLabel: "Project 项目主数据",
    ruleVersion: financeRuleVersion,
    selectedYear,
    availableYears,
    assumptions: [
      "测算公式：规格（款式数）× 零售价 × 统一折扣 × 项目等级预测销量。",
      "营收年度优先取项目编号前两位：26xx 计入 2026 年，27xx 计入 2027 年。",
      "年度营收按子公司拆分统计，未填写子公司的项目单独列为“未填写子公司”。",
      "折扣和各等级预测销量由管理员在财务测算页维护。",
      "缺少规格、零售价、项目等级或预测销量时，不做猜测，列入待配置。",
      "状态为取消的项目暂不计入预计营收。",
      "页面金额统一按万元展示。",
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

function toFinanceProjectEstimate(
  project: {
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
  },
  config: FinanceConfigData,
): FinanceProjectEstimate {
  const level = matchFinanceLevel(project.projectLevel);
  const retailPriceValue = parseProjectRetailPrice(project.retailPrice);
  const predictedSales = level ? config.salesByLevel[level.key] : null;
  const issues: string[] = [];
  const isExcluded = project.status.includes("取消");

  if (!isExcluded) {
    if (!project.styleCount || project.styleCount <= 0) {
      issues.push("缺少有效规格 / 款式数");
    }

    if (!retailPriceValue) {
      issues.push("缺少有效零售价");
    }

    if (!level) {
      issues.push("项目等级未匹配");
    }

    if (level && (!predictedSales || predictedSales <= 0)) {
      issues.push(`${level.label}预测销量未配置`);
    }

    if (config.discountRate <= 0) {
      issues.push("统一折扣未配置");
    }
  }

  const estimatedRevenue =
    !isExcluded && issues.length === 0 && project.styleCount && retailPriceValue && predictedSales
      ? Math.round(project.styleCount * retailPriceValue * config.discountRate * predictedSales)
      : null;
  const plannedLaunchDate = toDateString(project.plannedLaunchDate);
  const revenueYearResult = revenueYearFromProjectCode(project.projectCode, plannedLaunchDate);

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
    formulaText:
      estimatedRevenue === null || !project.styleCount || !retailPriceValue || !predictedSales
        ? null
        : `${project.styleCount} × ${retailPriceValue} × ${config.discountRate} × ${predictedSales}`,
    issues: isExcluded ? ["项目已取消，暂不计入"] : issues,
    isExcluded,
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
