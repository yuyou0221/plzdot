import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  financeLevelMultiplierRules,
  financeProductRevenueRules,
  financeRuleVersion,
  matchFinanceLevelRule,
  matchFinanceProductRule,
} from "@/lib/finance/finance-estimation-rules";

export type FinanceProjectEstimate = {
  projectId: string;
  projectCode: string | null;
  projectName: string;
  licensorName: string | null;
  ipName: string | null;
  productType: string | null;
  productLine: string | null;
  styleCount: number | null;
  retailPrice: string | null;
  projectLevel: string | null;
  status: string;
  plannedLaunchDate: string;
  plannedLaunchMonth: string;
  productRuleLabel: string | null;
  baseRevenuePerStyle: number | null;
  levelRuleLabel: string | null;
  levelMultiplier: number | null;
  estimatedRevenue: number | null;
  issues: string[];
  isExcluded: boolean;
};

export type FinanceBucket = {
  key: string;
  label: string;
  projectCount: number;
  estimatedProjectCount: number;
  totalEstimatedRevenue: number;
};

export type FinanceEstimationData = {
  generatedAt: string;
  sourceLabel: string;
  ruleVersion: string;
  assumptions: string[];
  summary: {
    projectCount: number;
    activeProjectCount: number;
    estimatedProjectCount: number;
    blockedProjectCount: number;
    excludedProjectCount: number;
    totalEstimatedRevenue: number;
    averageEstimatedRevenue: number;
  };
  projects: FinanceProjectEstimate[];
  monthBuckets: FinanceBucket[];
  productBuckets: FinanceBucket[];
  levelBuckets: FinanceBucket[];
  productRules: typeof financeProductRevenueRules;
  levelRules: typeof financeLevelMultiplierRules;
};

export async function getFinanceEstimationData(): Promise<FinanceEstimationData> {
  const projects = await prisma.project.findMany({
    orderBy: [{ plannedLaunchDate: "asc" }, { projectCode: "asc" }, { projectName: "asc" }],
    select: {
      id: true,
      projectCode: true,
      projectName: true,
      licensorName: true,
      ipName: true,
      productType: true,
      productLine: true,
      styleCount: true,
      retailPrice: true,
      projectLevel: true,
      plannedLaunchDate: true,
      status: true,
    },
  });

  const estimates = projects.map(toFinanceProjectEstimate);
  const activeEstimates = estimates.filter((project) => !project.isExcluded);
  const estimatedProjects = activeEstimates.filter((project) => project.estimatedRevenue !== null);
  const blockedProjects = activeEstimates.filter((project) => project.estimatedRevenue === null);
  const totalEstimatedRevenue = estimatedProjects.reduce((total, project) => total + (project.estimatedRevenue ?? 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    sourceLabel: "Project 项目主数据",
    ruleVersion: financeRuleVersion,
    assumptions: [
      "当前为基础试算规则，最终营收口径需要财务确认后再固化。",
      "测算公式：款式数 × 产品规格基础营收 × 项目等级倍率。",
      "缺少款式数、产品规格规则或项目等级规则时，不做猜测，列入待补规则。",
      "状态为取消的项目暂不计入预计营收。",
    ],
    summary: {
      projectCount: estimates.length,
      activeProjectCount: activeEstimates.length,
      estimatedProjectCount: estimatedProjects.length,
      blockedProjectCount: blockedProjects.length,
      excludedProjectCount: estimates.length - activeEstimates.length,
      totalEstimatedRevenue,
      averageEstimatedRevenue: estimatedProjects.length > 0 ? Math.round(totalEstimatedRevenue / estimatedProjects.length) : 0,
    },
    projects: estimates,
    monthBuckets: buildBuckets(activeEstimates, (project) => project.plannedLaunchMonth, (project) => formatMonthLabel(project.plannedLaunchMonth)),
    productBuckets: buildBuckets(
      activeEstimates.filter((project) => project.productRuleLabel),
      (project) => project.productRuleLabel ?? "未匹配规格",
      (project) => project.productRuleLabel ?? "未匹配规格",
    ),
    levelBuckets: buildBuckets(
      activeEstimates.filter((project) => project.levelRuleLabel),
      (project) => project.levelRuleLabel ?? "未匹配等级",
      (project) => project.levelRuleLabel ?? "未匹配等级",
    ),
    productRules: financeProductRevenueRules,
    levelRules: financeLevelMultiplierRules,
  };
}

function toFinanceProjectEstimate(project: {
  id: string;
  projectCode: string | null;
  projectName: string;
  licensorName: string | null;
  ipName: string | null;
  productType: string | null;
  productLine: string | null;
  styleCount: number | null;
  retailPrice: string | null;
  projectLevel: string | null;
  plannedLaunchDate: Date;
  status: string;
}): FinanceProjectEstimate {
  const productRule = matchFinanceProductRule(project.productType, project.productLine);
  const levelRule = matchFinanceLevelRule(project.projectLevel);
  const issues: string[] = [];
  const isExcluded = project.status.includes("取消");

  if (!isExcluded) {
    if (!project.styleCount || project.styleCount <= 0) {
      issues.push("缺少有效款式数");
    }

    if (!productRule) {
      issues.push("产品规格未匹配营收规则");
    }

    if (!levelRule) {
      issues.push("项目等级未匹配倍率规则");
    }
  }

  const estimatedRevenue =
    !isExcluded && issues.length === 0 && productRule && levelRule && project.styleCount
      ? Math.round(project.styleCount * productRule.baseRevenuePerStyle * levelRule.multiplier)
      : null;
  const plannedLaunchDate = toDateString(project.plannedLaunchDate);

  return {
    projectId: project.id,
    projectCode: project.projectCode,
    projectName: project.projectName,
    licensorName: project.licensorName,
    ipName: project.ipName,
    productType: project.productType,
    productLine: project.productLine,
    styleCount: project.styleCount,
    retailPrice: project.retailPrice,
    projectLevel: project.projectLevel,
    status: project.status,
    plannedLaunchDate,
    plannedLaunchMonth: plannedLaunchDate.slice(0, 7),
    productRuleLabel: productRule?.label ?? null,
    baseRevenuePerStyle: productRule?.baseRevenuePerStyle ?? null,
    levelRuleLabel: levelRule?.label ?? null,
    levelMultiplier: levelRule?.multiplier ?? null,
    estimatedRevenue,
    issues: isExcluded ? ["项目已取消，暂不计入"] : issues,
    isExcluded,
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
    };

    existing.projectCount += 1;

    if (project.estimatedRevenue !== null) {
      existing.estimatedProjectCount += 1;
      existing.totalEstimatedRevenue += project.estimatedRevenue;
    }

    bucketMap.set(key, existing);
  }

  return [...bucketMap.values()].sort((left, right) => left.key.localeCompare(right.key));
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
