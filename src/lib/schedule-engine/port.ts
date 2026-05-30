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
  plannedStartDate?: string;
  plannedFinishDate?: string;
  forecastStartDate?: string;
  forecastFinishDate?: string;
  expectedFinishDate?: string;
  taskStatus?: string;
  delayDays?: number;
  planDeltaDays?: number;
  remainingSafeDays?: number;
  warningWindowDays?: number;
  deadlineRiskDays?: number;
  riskLevel?: string;
  impactStatus?: string;
  isBlockingLaunch?: boolean;
  missingActualPredecessorIds?: string;
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
