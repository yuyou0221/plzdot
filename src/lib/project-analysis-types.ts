export type ProjectAnalysisRiskLevel = "done" | "doneLate" | "normal" | "risk" | "delay";

export type ProjectAnalysisMetric = {
  label: string;
  value: string;
  helper: string;
  tone: "neutral" | "good" | "warning" | "danger";
};

export type ProjectAnalysisTask = {
  id: string;
  projectTaskId?: string;
  taskNo: number;
  taskName: string;
  milestone: string;
  ownerName: string;
  status: string;
  displayStatus: string;
  isBlocked: boolean;
  plannedStartDate?: string;
  plannedFinishDate?: string;
  actualStartDate?: string;
  actualFinishDate?: string;
  expectedFinishDate?: string;
  forecastStartDate?: string;
  forecastFinishDate?: string;
  delayDays?: number;
  remainingSafeDays?: number;
  recoverableByDate?: string;
  isRecoverable?: boolean;
  riskLevel: ProjectAnalysisRiskLevel;
  riskLabel: string;
  riskMessage?: string;
  blockingPredecessorNames: string[];
  staleDays: number;
  basis: string;
};

export type ProjectAnalysisData = {
  sourceLabel: string;
  generatedAt: string;
  latestRun?: {
    id: string;
    name: string;
    calculatedAt: string;
    scriptVersion?: string;
  };
  project: {
    id: string;
    code?: string;
    name: string;
    ipName?: string;
    licensorName?: string;
    productType?: string;
    styleCount?: number;
    projectLevel?: string;
    routeType?: string;
    projectTeamName: string;
    productOwnerName: string;
    artOwnerName: string;
    currentStage: string;
    status: string;
    plannedLaunchDate: string;
    projectStartDate?: string;
    updatedAt: string;
  };
  result: {
    riskLevel: ProjectAnalysisRiskLevel;
    riskLabel: string;
    plannedLaunchDate: string;
    forecastLaunchDate?: string;
    delayDays?: number;
    currentTaskName: string;
    riskMessage: string;
    projectProgressPercent: number;
    blockedTaskCount: number;
    staleTaskCount: number;
    missingExpectedFinishCount: number;
  };
  modelingProgress?: {
    totalRequiredStyles: number;
    approvedStyles: number;
    inProgressStyles: number;
    submittedStyles: number;
    outsourcedStyles: number;
    unassignedStyles: number;
    progressPercent: number;
    projectedAllApprovedDate?: string;
    lastCalculatedAt: string;
  };
  metrics: ProjectAnalysisMetric[];
  tasks: ProjectAnalysisTask[];
};
