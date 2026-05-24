export type ProductGuideRiskLevel = "normal" | "watch" | "risk" | "delay";

export type ProductGuideMilestoneRiskLevel = "done" | "doneLate" | "normal" | "risk" | "delay";

export type ProductGuideMetricTone = "neutral" | "info" | "warning" | "danger";

export type ProductGuideMetric = {
  label: string;
  value: number;
  helper: string;
  tone: ProductGuideMetricTone;
};

export type ProductGuideFilterOption = {
  value: string;
  label: string;
};

export type ProductGuideDueBucket = "today" | "this-week" | "later" | "none";

export type ProductGuideItemSource =
  | "schedule-task"
  | "project-task"
  | "project-risk"
  | "modeling"
  | "alert"
  | "work-task";

export type ProductGuideItem = {
  id: string;
  source: ProductGuideItemSource;
  projectId: string;
  projectName: string;
  projectTeamKey: string;
  projectTeamName: string;
  taskId?: string;
  taskName: string;
  milestone: string;
  ownerKey: string;
  ownerName: string;
  productOwnerKey: string;
  productOwnerName: string;
  artOwnerKey: string;
  artOwnerName: string;
  plannedFinishDate?: string;
  forecastFinishDate?: string;
  actualFinishDate?: string;
  statusLabel: string;
  riskLevel: ProductGuideRiskLevel;
  riskLabel: string;
  suggestion: string;
  lastUpdatedAt?: string;
  staleDays: number;
  isStale: boolean;
  isBlocked: boolean;
  requiresArtReview: boolean;
  waitingLicensor: boolean;
  dueDate?: string;
  dueBucket: ProductGuideDueBucket;
  reasonTags: string[];
  projectProgressPercent: number;
  modelingSummary: string;
  reminderReason: string;
  nextStep: string;
  relatedProjectProgress: string;
  riskCopy: string;
};

export type ProductGuideMilestoneCard = {
  id: string;
  projectId: string;
  name: string;
  plannedMonth?: string;
  forecastMonth?: string;
  milestone: string;
  riskLevel: ProductGuideMilestoneRiskLevel;
  projectTeamKey: string;
  projectTeamName: string;
};

export type ProductGuideMilestoneBoard = {
  months: string[];
  initialMonth?: string;
  milestones: string[];
  cards: ProductGuideMilestoneCard[];
};

export type ProductGuideData = {
  sourceLabel: string;
  generatedAt: string;
  metrics: ProductGuideMetric[];
  milestoneBoard: ProductGuideMilestoneBoard;
  filters: {
    teams: ProductGuideFilterOption[];
    productOwners: ProductGuideFilterOption[];
    artOwners: ProductGuideFilterOption[];
    people: ProductGuideFilterOption[];
  };
  items: ProductGuideItem[];
};
