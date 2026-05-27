export type ModelingTaskStatus =
  | "未分配"
  | "已排期"
  | "建模中"
  | "修改中"
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
  internalApprovedDate?: string;
  copyrightApprovedDate?: string;
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
  weeklyAvailableWorkdays: number;
  isSchedulable: boolean;
  specialtyTags: string[];
  isVirtual: boolean;
};

export type OutsourceVendorOption = {
  id: string;
  name: string;
  stableCapacity: boolean;
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

export type ModelingTaskUpdateRequest = {
  modelerId?: string | null;
  status?: ModelingTaskStatus;
  isOutsourced?: boolean;
  outsourceVendorId?: string | null;
  plannedStartDate?: string | null;
  plannedFinishDate?: string | null;
  actualStartDate?: string | null;
  actualFinishDate?: string | null;
  remainingWorkdays?: number | null;
  feedbackType?: string | null;
  feedbackContent?: string | null;
  blockType?: string | null;
};

export type ModelingWritebackDraft = {
  projectId: string;
  projectTaskId: string;
  actualFinishDate: string;
  requiredStyles: number;
  approvedStyles: number;
  message: string;
};

export type ModelingTaskUpdateResponse = {
  ok: boolean;
  message: string;
  task?: ModelingTaskCard;
  projectSummary?: ProjectModelingSummary;
  writebackDraft?: ModelingWritebackDraft;
};

export type ModelingScheduleData = {
  sourceLabel: string;
  generatedAt: string;
  milestoneOverview: ModelingMilestoneOverview;
  metrics: ModelingMetric[];
  tasks: ModelingTaskCard[];
  modelers: ModelerCapacity[];
  vendors: OutsourceVendorOption[];
  projectSummaries: ProjectModelingSummary[];
  statusColumns: ModelingTaskStatus[];
};
