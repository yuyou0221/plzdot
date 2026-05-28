import { scheduleMilestones, type ScheduleMilestone } from "@/lib/schedule-domain";

export type RiskLevel = "done" | "doneLate" | "normal" | "risk" | "delay";

export type Milestone = ScheduleMilestone;

export type ProjectCard = {
  id: string;
  projectId: string;
  name: string;
  month: string;
  plannedMonth?: string;
  forecastMonth?: string;
  milestone: Milestone;
  riskLevel: RiskLevel;
};

export type CalendarProject = {
  id: string;
  projectId: string;
  name: string;
  month: string;
  plannedLaunchDate: string;
  forecastLaunchDate?: string;
  delayDays?: number;
  routeType: string;
  projectTeam: string;
  owner: string;
  artOwner: string;
  modelingOwner: string;
  riskLevel: RiskLevel;
};

export type ScheduleTaskRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStage: string;
  plannedLaunchDate: string;
  forecastLaunchDate: string;
  launchDeltaDays: number | null;
  taskNo: number;
  taskName: string;
  milestoneType: string;
  durationDays: number | null;
  taskStatus: string;
  shouldStartLabel: string;
  missingActualPredecessorIds: string;
  actualStartDate: string;
  actualFinishDate: string;
  expectedFinishDate: string;
  inferredCompletedLabel: string;
  inferredCompletionDate: string;
  plannedStartDate: string;
  plannedFinishDate: string;
  progressForecastStartDate: string;
  progressForecastFinishDate: string;
  calculatedStartDate: string;
  calculatedFinishDate: string;
  currentDdlDate: string;
  originalLatestStartDate: string;
  originalLatestFinishDate: string;
  latestStartDate: string;
  latestFinishDate: string;
  floatDays: number | null;
  planDeltaDays: number | null;
  deadlineRiskDays: number | null;
  warningWindowDays: number | null;
  impactStatus: string;
  riskLevel: RiskLevel;
  riskText: string;
  isBlockingLaunchLabel: string;
};

export type Metric = {
  label: string;
  value: number;
  helper: string;
};

export type ProjectDetail = {
  id: string;
  name: string;
  projectTeam: string;
  owner: string;
  artOwner: string;
  modelingOwner: string;
  currentTask: string;
  plannedFinish: string;
  forecastFinish: string;
  riskLevel: RiskLevel;
  riskMessage: string;
  progressPercent: number;
  modelingProgress: {
    approved: number;
    total: number;
    inProgress: number;
    submitted: number;
    outsourced: number;
    unassigned: number;
  };
  weeklyTasks: string[];
};

export type ScheduleWorkbenchData = {
  sourceLabel: string;
  months: string[];
  initialMonth?: string;
  milestones: Milestone[];
  metrics: Metric[];
  projectCards: ProjectCard[];
  calendarMonths: string[];
  calendarProjects: CalendarProject[];
  scheduleTasks: ScheduleTaskRow[];
  projectDetails: Record<string, ProjectDetail>;
};

export const months = ["26年10月", "26年11月", "26年12月", "27年1月"];

export const milestones: Milestone[] = [...scheduleMilestones];

export const projectCards: ProjectCard[] = [
  card("p-pink-rabbit", "粉红兔子X恋与制作人", "26年10月", "原画里程碑", "done"),
  card("p-toothless-cat", "无牙仔猫猫", "26年10月", "建模里程碑", "risk"),
  card("p-minion-tv", "海绵宝宝电视机", "26年10月", "建模里程碑", "delay"),
  card("p-dog-6", "小狗6代27年", "26年10月", "红蜡里程碑", "risk"),
  card("p-iron-desk", "铁甲小宝的桌面表情包", "26年10月", "平面里程碑", "delay"),
  card("p-shark-cat", "鲨猫", "26年10月", "产前里程碑", "done"),
  card("p-rabbit-mini", "粉红兔子mini3", "26年10月", "大货里程碑", "done"),
  card("p-bird-5", "小鸟5代", "26年11月", "原画里程碑", "done"),
  card("p-kamen-2", "假面骑士2代", "26年11月", "建模里程碑", "delay"),
  card("p-inner-child", "内心小孩mini4代27年", "26年11月", "红蜡里程碑", "normal"),
  card("p-zhenhuan", "甄嬛传mini", "26年11月", "平面里程碑", "normal"),
  card("p-penguin", "马达加斯加的企鹅", "26年11月", "产前里程碑", "normal"),
  card("p-shrek", "史瑞克baby", "26年11月", "大货里程碑", "normal"),
  card("p-penguin", "马达加斯加的企鹅", "26年12月", "原画里程碑", "risk"),
  card("p-godzilla", "哥斯拉", "26年12月", "建模里程碑", "risk"),
  card("p-magic-hair", "魔发精灵", "26年12月", "红蜡里程碑", "risk"),
  card("p-dragon", "驯龙高手27年", "26年12月", "平面里程碑", "normal"),
  card("p-penguin", "马达加斯加的企鹅", "26年12月", "产前里程碑", "normal"),
  card("p-iron-desk", "铁甲小宝的桌面表情包", "26年12月", "大货里程碑", "delay"),
  card("p-oteman-1", "奥特曼1", "27年1月", "原画里程碑", "normal"),
  card("p-oteman-real", "奥特曼正比例", "27年1月", "建模里程碑", "risk"),
  card("p-sponge-tv", "海绵宝宝电视机2", "27年1月", "红蜡里程碑", "normal"),
  card("p-ito", "伊藤润二2代27年留位", "27年1月", "平面里程碑", "normal"),
  card("p-inner-child", "内心小孩mini4代27年", "27年1月", "产前里程碑", "normal"),
  card("p-godzilla", "哥斯拉", "27年1月", "大货里程碑", "risk"),
];

export const projectDetails: Record<string, ProjectDetail> = {
  "p-toothless-cat": detail({
    id: "p-toothless-cat",
    name: "无牙仔猫猫",
    projectTeam: "产品一组",
    owner: "张娜",
    artOwner: "李桃",
    currentTask: "根据效果图建模",
    plannedFinish: "2026-11-18",
    forecastFinish: "2026-11-26",
    riskLevel: "risk",
    riskMessage: "若 11.20 前无法补上两名建模产能，建模里程碑会再次延期。",
    progressPercent: 42,
    modelingProgress: { approved: 3, total: 8, inProgress: 2, submitted: 1, outsourced: 1, unassigned: 1 },
    weeklyTasks: ["确认外包补位名单", "补录 03 款检修意见", "跟进版权方反馈状态"],
  }),
  "p-iron-desk": detail({
    id: "p-iron-desk",
    name: "铁甲小宝的桌面表情包",
    projectTeam: "产品三组",
    owner: "高烁",
    artOwner: "钱童",
    currentTask: "贴纸平面设计",
    plannedFinish: "2026-12-12",
    forecastFinish: "2026-12-28",
    riskLevel: "delay",
    riskMessage: "已再次延期 18 天，原定 DDL 已无法追回。",
    progressPercent: 58,
    modelingProgress: { approved: 0, total: 0, inProgress: 0, submitted: 0, outsourced: 0, unassigned: 0 },
    weeklyTasks: ["补齐版权方修改意见记录", "明确最终送审版本", "重新测算大货节点"],
  }),
  "p-pink-rabbit": detail({
    id: "p-pink-rabbit",
    name: "粉红兔子X恋与制作人",
    projectTeam: "产品二组",
    owner: "陈佳",
    artOwner: "孙黎",
    currentTask: "原画细化送审",
    plannedFinish: "2026-11-08",
    forecastFinish: "2026-11-09",
    riskLevel: "normal",
    riskMessage: "原画通过后会产生 12 款建模任务，需要提前两周检查内部产能。",
    progressPercent: 63,
    modelingProgress: { approved: 0, total: 12, inProgress: 0, submitted: 0, outsourced: 0, unassigned: 12 },
    weeklyTasks: ["确认 4 款角色表情差异", "版权方反馈后拆分建模款式"],
  }),
  "p-penguin": detail({
    id: "p-penguin",
    name: "马达加斯加的企鹅",
    projectTeam: "产品一组",
    owner: "林圆",
    artOwner: "王绮",
    currentTask: "产前样确认",
    plannedFinish: "2026-12-20",
    forecastFinish: "2026-12-19",
    riskLevel: "normal",
    riskMessage: "当前正常推进。",
    progressPercent: 82,
    modelingProgress: { approved: 7, total: 7, inProgress: 0, submitted: 0, outsourced: 0, unassigned: 0 },
    weeklyTasks: ["样品团队确认工程可行性", "供应链同步产前样修改点"],
  }),
  "p-oteman-real": detail({
    id: "p-oteman-real",
    name: "奥特曼正比例",
    projectTeam: "产品四组",
    owner: "刘然",
    artOwner: "赵航",
    currentTask: "正比例复杂款建模",
    plannedFinish: "2027-01-15",
    forecastFinish: "2027-02-05",
    riskLevel: "risk",
    riskMessage: "困难正比例款式平均接近 20 个工作日，当前分配不足。",
    progressPercent: 28,
    modelingProgress: { approved: 1, total: 6, inProgress: 2, submitted: 1, outsourced: 0, unassigned: 2 },
    weeklyTasks: ["拆出困难款和简单款", "决定是否外包两款"],
  }),
};

export const metrics: Metric[] = [
  { label: "排期中的项目", value: 47, helper: "当前样例区间内" },
  { label: "有延期风险", value: 8, helper: "需要项目负责人处理" },
  { label: "必然延期", value: 3, helper: "需要管理层关注" },
  { label: "3 天未更新", value: 12, helper: "进行中任务需提醒" },
];

export const sampleScheduleData: ScheduleWorkbenchData = {
  sourceLabel: "样例数据",
  months,
  initialMonth: months[0],
  milestones,
  metrics,
  projectCards,
  calendarMonths: ["26年3月", "26年4月", "26年5月", "26年6月", "26年7月", "26年8月", "26年9月", "26年10月", "26年11月", "26年12月", "27年1月", "27年2月"],
  calendarProjects: [],
  scheduleTasks: [],
  projectDetails,
};

function card(
  projectId: string,
  name: string,
  month: string,
  milestone: Milestone,
  riskLevel: RiskLevel,
): ProjectCard {
  return {
    id: `${projectId}-${month}-${milestone}`,
    projectId,
    name,
    month,
    plannedMonth: month,
    forecastMonth: month,
    milestone,
    riskLevel,
  };
}

function detail(project: Omit<ProjectDetail, "modelingOwner"> & { modelingOwner?: string }): ProjectDetail {
  return {
    modelingOwner: "待补充建模负责人",
    ...project,
  };
}
