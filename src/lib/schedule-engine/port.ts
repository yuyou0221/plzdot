export type ScheduleAnalyzeOptions = {
  projectIds?: string[];
  today?: string;
};

export type ScheduleEngineProjectResult = {
  projectId: string;
  projectName: string;
  plannedLaunchDate: string;
  projectedLaunchDate?: string;
  launchDeltaDays?: number;
  riskLevel?: string;
  status?: string;
  summary?: {
    unfinishedTasks?: number;
    blockingLaunchTasks?: number;
  };
};

export type ScheduleEngineTaskResult = {
  recordKey: string;
  projectId: string;
  projectName: string;
  taskId: number;
  taskName: string;
  durationDays?: number;
  startAfterRules?: string;
  finishAfterRules?: string;
  plannedLaunchDate?: string;
  projectStartDate?: string;
  effectiveProjectStartDate?: string;
  effectiveLaunchDate?: string;
  projectedLaunchDate?: string;
  plannedStartDate?: string;
  plannedFinishDate?: string;
  originalLatestStartDate?: string;
  originalLatestFinishDate?: string;
  latestStartDate?: string;
  latestFinishDate?: string;
  currentLatestStartDate?: string;
  currentLatestFinishDate?: string;
  calculatedStartDate?: string;
  calculatedFinishDate?: string;
  forecastStartDate?: string;
  forecastFinishDate?: string;
  currentDdlDate?: string;
  actualStartDate?: string;
  actualFinishDate?: string;
  expectedFinishDate?: string;
  taskStatus?: string;
  delayDays?: number;
  floatDays?: number;
  planDeltaDays?: number;
  remainingSafeDays?: number;
  warningWindowDays?: number;
  deadlineRiskDays?: number;
  currentDeadlineRiskDays?: number;
  riskLevel?: string;
  impactStatus?: string;
  isBlockingLaunch?: boolean;
  isLaunchPath?: boolean;
  missingPredecessorIds?: string;
  missingActualPredecessorIds?: string;
  ddlBasis?: string;
};

export type ScheduleEnginePayload = {
  generatedAt: string;
  projectCount: number;
  futureTaskCount: number;
  projects: ScheduleEngineProjectResult[];
  rows: ScheduleEngineTaskResult[];
  futureRows: ScheduleEngineTaskResult[];
  warnings?: unknown;
};

export type ScheduleEnginePort = {
  engineName: string;
  engineVersion: string;
  runAnalysis: (options?: ScheduleAnalyzeOptions) => Promise<ScheduleEnginePayload>;
};

export type ScheduleEngineResultStore = {
  persistAnalysis: (scheduleRunId: string, payload: ScheduleEnginePayload) => Promise<void>;
};
