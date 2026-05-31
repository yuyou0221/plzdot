export type ModelingTaskStatus =
  | "待确认"
  | "退回补充"
  | "未启动"
  | "未分配"
  | "已排期"
  | "排队中"
  | "建模中"
  | "修改中"
  | "待验收"
  | "待送审"
  | "已送审"
  | "等反馈"
  | "已通过"
  | "外包中"
  | "暂停"
  | "取消";

export type ModelingReferenceImage = {
  name?: string;
  url: string;
  type?: string;
};

export type ModelingFeedbackSummary = {
  id: string;
  feedbackType: string;
  category:
    | "work-submission"
    | "internal-review"
    | "copyright-review"
    | "style-list-return"
    | "cancel-reopen"
    | "other";
  roundNo: number;
  feedbackByName?: string;
  feedbackAt: string;
  content: string;
  status: string;
  attachmentUrl?: string;
};

export type ModelingWorkLogSummary = {
  id: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes: number;
  stopReason: string;
  stoppedBy?: string;
};

export type ModelingMetric = {
  label: string;
  value: number | string;
  helper: string;
  tone: "neutral" | "warning" | "danger" | "info";
};

export type ModelingTaskCard = {
  id: string;
  projectId: string;
  projectTaskId: string;
  projectName: string;
  projectStage: string;
  sourceStyleId?: string;
  styleCode: string;
  styleSequence?: string;
  styleName: string;
  isFirstModelingStyle: boolean;
  isRequired: boolean;
  affectsProjectSchedule: boolean;
  referenceImageUrls: ModelingReferenceImage[];
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
  actualWorkMinutes: number;
  activeWorkStartedAt?: string;
  remainingWorkdays?: number | null;
  notes?: string;
  feedbackCount: number;
  reviewRound: number;
  lastFeedbackAt?: string;
  lastUpdatedAt?: string;
  staleDays: number;
  isStale: boolean;
  blockedDays: number;
  blockType?: string;
  latestFeedback?: string;
  feedbackStatus?: string;
  latestSubmissionFeedbackId?: string;
  latestSubmissionContent?: string;
  latestSubmissionDeliverableUrls: string[];
  latestSubmissionAt?: string;
  latestSubmissionBy?: string;
  latestSubmissionStatus?: string;
  feedbackHistory: ModelingFeedbackSummary[];
  workLogs: ModelingWorkLogSummary[];
  workLogCount: number;
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
  allRequiredStylesApproved: boolean;
  canProjectScheduleTreatModelingDone: boolean;
  requiredStyleCount: number;
  approvedRequiredStyleCount: number;
  lastRequiredStyleApprovedDate?: string;
  sourceTaskNos: number[];
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
  isOutsourced?: boolean;
  outsourceVendorId?: string | null;
  plannedStartDate?: string | null;
  plannedFinishDate?: string | null;
  actualStartDate?: string | null;
  actualFinishDate?: string | null;
  remainingWorkdays?: number | null;
  notes?: string | null;
  feedbackType?: string | null;
  feedbackContent?: string | null;
  feedbackAttachments?: ModelingFeedbackAttachments | null;
  blockType?: string | null;
};

export type ModelingTaskUpdateEventType =
  | "assign_modeler"
  | "clear_modeler"
  | "mark_outsourced"
  | "clear_outsource"
  | "update_schedule_fields"
  | "update_modeler_inputs";

export type ModelingTodoItem = {
  id: string;
  type: "style-list-confirmation";
  title: string;
  projectId: string;
  projectName: string;
  styleCount: number;
  status: "待处理";
  actionLabel: string;
  helper: string;
  styleNames: string[];
  lastUpdatedAt?: string | null;
};

export type ModelingFeedbackAttachments = {
  imageUrl?: string | null;
  pdfUrl?: string | null;
  pptUrl?: string | null;
};

export type ModelingWorkSubmissionRequest = {
  content: string;
  deliverableUrl?: string | null;
};

export type ModelingReviewResult =
  | "内部通过可送审"
  | "内部不通过"
  | "已送审"
  | "等反馈"
  | "送审通过"
  | "送审不通过";

export type ModelingReviewSimulationRequest = {
  reviewResult: ModelingReviewResult;
  reviewAt: string;
  feedbackContent?: string | null;
  feedbackAttachments?: ModelingFeedbackAttachments | null;
  submissionFeedbackId?: string | null;
};

export type ModelingWritebackDraft = {
  projectId: string;
  projectTaskId: string;
  actualFinishDate: string;
  requiredStyles: number;
  approvedStyles: number;
  message: string;
};

export type ModelingProjectScheduleReadiness = ModelingWritebackDraft;

export type ModelingTaskUpdateResponse = {
  ok: boolean;
  message: string;
  eventType?: ModelingTaskUpdateEventType;
  task?: ModelingTaskCard;
  updatedTasks?: ModelingTaskCard[];
  projectSummary?: ProjectModelingSummary;
  projectScheduleReadiness?: ModelingProjectScheduleReadiness;
};

export type ModelingScheduleData = {
  sourceLabel: string;
  generatedAt: string;
  todos: ModelingTodoItem[];
  milestoneOverview: ModelingMilestoneOverview;
  metrics: ModelingMetric[];
  tasks: ModelingTaskCard[];
  modelers: ModelerCapacity[];
  vendors: OutsourceVendorOption[];
  projectSummaries: ProjectModelingSummary[];
  statusColumns: ModelingTaskStatus[];
};
