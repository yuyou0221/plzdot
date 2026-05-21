export type ModelingTaskStatus =
  | "未分配"
  | "已排期"
  | "建模中"
  | "已送审"
  | "等反馈"
  | "已通过"
  | "外包中"
  | "暂停"
  | "取消";

export type ModelingMetric = {
  label: string;
  value: number;
  helper: string;
  tone: "neutral" | "warning" | "danger" | "info";
};

export type ModelingTaskCard = {
  id: string;
  projectId: string;
  projectTaskId: string;
  projectName: string;
  projectStage: string;
  styleCode: string;
  styleName: string;
  status: ModelingTaskStatus;
  difficulty: string;
  estimatedWorkdays: number;
  consumedWorkdays: number;
  originalArtStatus: string;
  originalArtApprovedDate?: string;
  modelerId?: string;
  modelerName?: string;
  isOutsourced: boolean;
  outsourceVendorId?: string;
  outsourceVendorName?: string;
  stableOutsourceCapacity: boolean;
  plannedStartDate?: string;
  plannedFinishDate?: string;
  actualStartDate?: string;
  actualFinishDate?: string;
  reviewRound: number;
  lastFeedbackAt?: string;
  lastUpdatedAt?: string;
  staleDays: number;
  isStale: boolean;
  blockedDays: number;
  blockType?: string;
  latestFeedback?: string;
  feedbackStatus?: string;
  isVirtual: boolean;
  canDragAssign: boolean;
};

export type ModelerCapacity = {
  id: string;
  name: string;
  roleTitle: string;
  weeklyCapacityStyles: number;
  specialtyTags: string[];
  isVirtual: boolean;
};

export type ProjectModelingSummary = {
  projectId: string;
  projectName: string;
  currentStage: string;
  plannedLaunchDate: string;
  totalStyles: number;
  approvedStyles: number;
  inProgressStyles: number;
  submittedStyles: number;
  outsourcedStyles: number;
  unassignedStyles: number;
  progressPercent: number;
  isVirtual: boolean;
};

export type ModelingMilestoneRiskLevel = "done" | "normal" | "risk" | "delay";

export type ModelingMilestoneCard = {
  id: string;
  projectId: string;
  projectName: string;
  projectStage: string;
  styleCount: number;
  plannedFinishDate: string;
  forecastFinishDate?: string;
  statusLabel: string;
  riskLevel: ModelingMilestoneRiskLevel;
  riskMessage?: string;
  completedTaskCount: number;
  totalTaskCount: number;
  unfinishedTaskNames: string[];
  delayDays: number;
  isCompleted: boolean;
};

export type ModelingMilestoneOverview = {
  currentMonthLabel: string;
  nextMonthLabel: string;
  previousUnfinished: ModelingMilestoneCard[];
  currentMonth: ModelingMilestoneCard[];
  nextMonth: ModelingMilestoneCard[];
};

export type ModelingScheduleData = {
  sourceLabel: string;
  generatedAt: string;
  milestoneOverview: ModelingMilestoneOverview;
  metrics: ModelingMetric[];
  tasks: ModelingTaskCard[];
  modelers: ModelerCapacity[];
  projectSummaries: ProjectModelingSummary[];
  statusColumns: ModelingTaskStatus[];
};
