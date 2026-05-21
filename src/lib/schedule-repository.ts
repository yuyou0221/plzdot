import { prisma } from "@/lib/db/prisma";
import {
  type CalendarProject,
  milestones,
  type Milestone,
  type ProjectCard,
  type ProjectDetail,
  type RiskLevel,
  type ScheduleWorkbenchData,
  sampleScheduleData,
} from "@/lib/sample-schedule";

const milestoneSet = new Set<Milestone>(milestones);

const riskMap: Record<string, RiskLevel> = {
  已完成: "done",
  延期完成: "doneLate",
  正常: "normal",
  正常推进: "normal",
  延期风险: "risk",
  必然延期: "delay",
  严重延期: "delay",
  done: "done",
  doneLate: "doneLate",
  normal: "normal",
  risk: "risk",
  delay: "delay",
};

type ProjectRow = {
  id: string;
  projectName: string;
  plannedLaunchDate: Date;
  projectTeamId: string | null;
  projectOwnerId: string | null;
  artOwnerId: string | null;
  routeType: string | null;
  currentStage: string | null;
  status: string;
};

type ProjectResultRow = {
  projectId: string;
  plannedLaunchDate: Date;
  forecastLaunchDate: Date | null;
  delayDays: number | null;
  riskLevel: string;
  currentTaskName: string | null;
  riskMessage: string | null;
  projectProgressPercent: number | null;
  rawResult: unknown;
};

type TaskResultRow = {
  id: string;
  projectId: string;
  taskNo: number;
  taskName: string;
  milestoneType: string;
  plannedFinishDate: Date | null;
  forecastFinishDate: Date | null;
  expectedFinishDate: Date | null;
  taskActionType: string | null;
  displayStatus: string | null;
  riskLevel: string;
  rawResult: unknown;
};

type MonthPoint = {
  year: number;
  month: number;
};

export async function getScheduleWorkbenchData(): Promise<ScheduleWorkbenchData> {
  try {
    const [projects, latestRun] = await Promise.all([
      prisma.project.findMany({ orderBy: { plannedLaunchDate: "asc" }, take: 300 }),
      prisma.scheduleRun.findFirst({
        where: { runStatus: "成功" },
        orderBy: { calculatedAt: "desc" },
      }),
    ]);

    if (projects.length === 0 || !latestRun) {
      return sampleScheduleData;
    }

    const projectIds = projects.map((project) => project.id);
    const [taskResults, projectResults, modelingProgress, alerts, workTasks] = await Promise.all([
      prisma.scheduleTaskResult.findMany({
        where: { scheduleRunId: latestRun.id, projectId: { in: projectIds } },
        orderBy: [{ projectId: "asc" }, { taskNo: "asc" }],
      }),
      prisma.scheduleProjectResult.findMany({
        where: { scheduleRunId: latestRun.id, projectId: { in: projectIds } },
      }),
      prisma.projectModelingProgress.findMany({ where: { projectId: { in: projectIds } } }),
      prisma.alert.findMany({
        where: { status: "未处理", createdFromRunId: latestRun.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.workTask.findMany({ where: { projectId: { in: projectIds } }, take: 300 }),
    ]);

    if (taskResults.length === 0) {
      return sampleScheduleData;
    }

    const projectById = new Map(projects.map((project) => [project.id, project]));
    const resultByProjectId = new Map(projectResults.map((result) => [result.projectId, result]));
    const modelingByProjectId = new Map(modelingProgress.map((progress) => [progress.projectId, progress]));
    const activeAlerts = alerts.filter((alert) => {
      const project = alert.projectId ? projectById.get(alert.projectId) : null;
      const result = alert.projectId ? resultByProjectId.get(alert.projectId) : undefined;
      const displayLevel = project ? projectDisplayRiskLevel(project, result) : toRiskLevel(alert.alertType);

      return displayLevel === "risk" || displayLevel === "delay";
    });

    const projectCards = buildMilestoneCards(taskResults, projectById);
    const { months, initialMonth } = buildMonthTimeline(projectCards);
    const calendarMonths = buildPlanningCalendarMonths();
    const calendarProjects = buildCalendarProjects(projects, resultByProjectId);
    const projectDetails: Record<string, ProjectDetail> = {};

    for (const project of projects) {
      const result = resultByProjectId.get(project.id);
      const progress = modelingByProjectId.get(project.id);
      const riskLevel = projectDisplayRiskLevel(project, result);
      const projectAlerts = activeAlerts.filter((alert) => alert.projectId === project.id);
      const projectWorkTasks = workTasks.filter((task) => task.projectId === project.id);

      projectDetails[project.id] = {
        id: project.id,
        name: project.projectName,
        projectTeam: project.projectTeamId ?? "待补充项目组",
        owner: project.projectOwnerId ?? "待补充",
        artOwner: project.artOwnerId ?? "待补充",
        currentTask: isFinishedRiskLevel(riskLevel) ? "项目已完成" : (result?.currentTaskName ?? "待从测算结果同步"),
        plannedFinish: formatDate(project.plannedLaunchDate),
        forecastFinish: formatDate(result?.forecastLaunchDate),
        riskLevel,
        riskMessage: projectDisplayRiskMessage(project, result, riskLevel, projectAlerts[0]?.message),
        progressPercent: result?.projectProgressPercent ?? 0,
        modelingProgress: {
          approved: progress?.approvedStyles ?? 0,
          total: progress?.totalRequiredStyles ?? 0,
          inProgress: progress?.inProgressStyles ?? 0,
          submitted: progress?.submittedStyles ?? 0,
          outsourced: progress?.outsourcedStyles ?? 0,
          unassigned: progress?.unassignedStyles ?? 0,
        },
        weeklyTasks:
          projectWorkTasks.length > 0
            ? projectWorkTasks.slice(0, 5).map((task) => task.taskTitle)
            : ["等待生成周度任务"],
      };
    }

    return {
      sourceLabel: "数据库",
      months: months.length > 0 ? months : sampleScheduleData.months,
      initialMonth: initialMonth ?? sampleScheduleData.initialMonth,
      milestones,
      metrics: [
        { label: "看板项目数", value: projects.length, helper: "包含已完结项目" },
        {
          label: "有延期风险",
          value: projectResults.filter((result) => {
            const project = projectById.get(result.projectId);
            return project ? projectDisplayRiskLevel(project, result) === "risk" : false;
          }).length,
          helper: "仅统计未完成项目",
        },
        {
          label: "必然延期",
          value: projectResults.filter((result) => {
            const project = projectById.get(result.projectId);
            return project ? projectDisplayRiskLevel(project, result) === "delay" : false;
          }).length,
          helper: "仅统计未完成项目",
        },
        {
          label: "未处理提醒",
          value: activeAlerts.length,
          helper: "延期、阻塞或异常任务",
        },
      ],
      projectCards,
      calendarMonths,
      calendarProjects,
      projectDetails,
    };
  } catch (error) {
    console.error("Failed to build schedule workbench data", error);
    return sampleScheduleData;
  }
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const data = await getScheduleWorkbenchData();
  return data.projectDetails[projectId] ?? null;
}

export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      ok: true,
      message: "数据库连接正常",
    };
  } catch {
    return {
      ok: false,
      message: "数据库不可用，当前页面会回退到样例数据",
    };
  }
}

function projectDisplayRiskLevel(project: ProjectRow, result: ProjectResultRow | undefined): RiskLevel {
  if (isCompletedProject(project, result)) {
    return projectCompletionDelayDays(project, result) > 0 ? "doneLate" : "done";
  }

  return toRiskLevel(result?.riskLevel ?? "正常");
}

function projectDisplayRiskMessage(
  project: ProjectRow,
  result: ProjectResultRow | undefined,
  riskLevel: RiskLevel,
  alertMessage?: string,
) {
  const plannedDate = formatDate(result?.plannedLaunchDate ?? project.plannedLaunchDate);
  const finishDate = formatDate(result?.forecastLaunchDate);
  const delayDays = projectCompletionDelayDays(project, result);

  if (riskLevel === "doneLate") {
    return `${project.projectName} 已于 ${finishDate} 完成，较计划上线 ${plannedDate} 晚 ${delayDays} 天。`;
  }

  if (riskLevel === "done") {
    return result?.forecastLaunchDate
      ? `${project.projectName} 已完成，计划上线 ${plannedDate}，实际完成 ${finishDate}。`
      : `${project.projectName} 已完成。`;
  }

  return result?.riskMessage ?? alertMessage ?? (riskLevel === "normal" ? "当前正常推进。" : "当前项目存在风险，请查看提醒。");
}

function isCompletedProject(project: ProjectRow, result: ProjectResultRow | undefined) {
  const raw = rawTaskResult(result?.rawResult);
  const summary = raw.summary;
  const unfinishedTasks =
    summary && typeof summary === "object" && !Array.isArray(summary)
      ? Number((summary as Record<string, unknown>).unfinishedTasks)
      : Number.NaN;
  const statusText = [project.status, project.currentStage, raw.status].filter(Boolean).join(" ");

  return (
    statusText.includes("已完") ||
    statusText.includes("完结") ||
    (result?.projectProgressPercent ?? 0) >= 100 ||
    unfinishedTasks === 0
  );
}

function projectCompletionDelayDays(project: ProjectRow, result: ProjectResultRow | undefined) {
  if (typeof result?.delayDays === "number" && result.delayDays > 0) {
    return result.delayDays;
  }

  if (!result?.forecastLaunchDate) {
    return 0;
  }

  return Math.max(daysBetween(result.forecastLaunchDate, result.plannedLaunchDate ?? project.plannedLaunchDate), 0);
}

function daysBetween(later: Date, earlier: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((dateOnlyTime(later) - dateOnlyTime(earlier)) / dayMs);
}

function dateOnlyTime(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildCalendarProjects(
  projects: ProjectRow[],
  resultByProjectId: Map<string, ProjectResultRow>,
) {
  return projects
    .map((project): CalendarProject => {
      const result = resultByProjectId.get(project.id);
      const month = formatMonthLabel(dateToMonthPoint(project.plannedLaunchDate));
      const delayDays = projectCompletionDelayDays(project, result);

      return {
        id: `calendar:${project.id}`,
        projectId: project.id,
        name: project.projectName,
        month,
        plannedLaunchDate: formatDate(project.plannedLaunchDate),
        forecastLaunchDate: result?.forecastLaunchDate ? formatDate(result.forecastLaunchDate) : undefined,
        delayDays: delayDays > 0 ? delayDays : undefined,
        routeType: project.routeType ?? "未填写路线",
        projectTeam: project.projectTeamId ?? "待补充项目组",
        owner: project.projectOwnerId ?? "待补充",
        artOwner: project.artOwnerId ?? "待补充",
        riskLevel: projectDisplayRiskLevel(project, result),
      };
    })
    .sort((a, b) => {
      const monthOrder = compareMonthLabel(a.month, b.month);
      if (monthOrder !== 0) return monthOrder;

      const dateOrder = a.plannedLaunchDate.localeCompare(b.plannedLaunchDate);
      if (dateOrder !== 0) return dateOrder;

      return a.name.localeCompare(b.name, "zh-CN");
    });
}

function buildPlanningCalendarMonths(today = new Date()) {
  const startMonth = planningCycleStart(today);
  return monthsBetween(startMonth, addMonths(startMonth, 11)).map(formatMonthLabel);
}

function planningCycleStart(today: Date) {
  const currentMonth = dateToMonthPoint(today);
  const thisYearStart = monthAfterChineseNewYear(currentMonth.year);
  const nextYearStart = monthAfterChineseNewYear(currentMonth.year + 1);

  if (compareMonthPoint(currentMonth, thisYearStart) >= 0 && compareMonthPoint(currentMonth, nextYearStart) < 0) {
    return thisYearStart;
  }

  if (compareMonthPoint(currentMonth, thisYearStart) < 0) {
    return monthAfterChineseNewYear(currentMonth.year - 1);
  }

  return nextYearStart;
}

function monthAfterChineseNewYear(year: number): MonthPoint {
  const springFestival = chineseNewYearByYear[year] ?? { year, month: 2, day: 1 };
  const month = springFestival.month + 1;

  if (month > 12) {
    return { year: springFestival.year + 1, month: 1 };
  }

  return { year: springFestival.year, month };
}

const chineseNewYearByYear: Record<number, { year: number; month: number; day: number }> = {
  2025: { year: 2025, month: 1, day: 29 },
  2026: { year: 2026, month: 2, day: 17 },
  2027: { year: 2027, month: 2, day: 6 },
  2028: { year: 2028, month: 1, day: 26 },
  2029: { year: 2029, month: 2, day: 13 },
  2030: { year: 2030, month: 2, day: 3 },
  2031: { year: 2031, month: 1, day: 23 },
};

function addMonths(monthPoint: MonthPoint, offset: number): MonthPoint {
  const zeroBasedMonthIndex = monthPoint.year * 12 + (monthPoint.month - 1) + offset;
  return {
    year: Math.floor(zeroBasedMonthIndex / 12),
    month: (zeroBasedMonthIndex % 12) + 1,
  };
}

function buildMilestoneCards(taskResults: TaskResultRow[], projectById: Map<string, ProjectRow>) {
  const grouped = new Map<string, { projectId: string; name: string; milestone: Milestone; rows: TaskResultRow[] }>();
  const rowsByProjectId = new Map<string, TaskResultRow[]>();

  for (const row of taskResults) {
    const projectRows = rowsByProjectId.get(row.projectId);
    if (projectRows) {
      projectRows.push(row);
    } else {
      rowsByProjectId.set(row.projectId, [row]);
    }
  }

  for (const row of taskResults) {
    const project = projectById.get(row.projectId);
    const milestone = normalizeMilestone(row.milestoneType, row.taskNo);

    if (!project || !milestone) {
      continue;
    }

    const key = `${row.projectId}:${milestone}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.rows.push(row);
    } else {
      grouped.set(key, {
        projectId: row.projectId,
        name: project.projectName,
        milestone,
        rows: [row],
      });
    }
  }

  return Array.from(grouped.values())
    .map((group): ProjectCard | null => {
      const plannedDate = maxDate(
        group.rows.map((row) => row.plannedFinishDate ?? row.expectedFinishDate ?? row.forecastFinishDate),
      );
      const plannedMonth = plannedDate ? formatMonthLabel(dateToMonthPoint(plannedDate)) : null;
      const baseRiskLevel = groupRiskLevel(group.rows);
      const completedDate =
        baseRiskLevel === "done"
          ? completedMilestoneDate(group.rows, rowsByProjectId.get(group.projectId) ?? [], group.milestone)
          : null;
      const completedMonth = completedDate ? formatMonthLabel(dateToMonthPoint(completedDate)) : null;
      const riskLevel =
        baseRiskLevel === "done" && completedDate && plannedDate && completedDate.getTime() > plannedDate.getTime()
          ? "doneLate"
          : baseRiskLevel;
      const forecastMonth = completedMonth ?? maxDateMonth(group.rows.map(displayDateForForecastView));
      const month = plannedMonth ?? forecastMonth;

      if (!month) {
        return null;
      }

      return {
        id: `${group.projectId}:${group.milestone}`,
        projectId: group.projectId,
        name: group.name,
        month,
        plannedMonth: plannedMonth ?? month,
        forecastMonth: forecastMonth ?? month,
        milestone: group.milestone,
        riskLevel,
      };
    })
    .filter(isProjectCard)
    .sort((a, b) => {
      const monthOrder = compareMonthLabel(a.plannedMonth ?? a.month, b.plannedMonth ?? b.month);
      if (monthOrder !== 0) return monthOrder;

      const milestoneOrder = milestones.indexOf(a.milestone) - milestones.indexOf(b.milestone);
      if (milestoneOrder !== 0) return milestoneOrder;

      return a.name.localeCompare(b.name, "zh-CN");
    });
}

function normalizeMilestone(value: string, taskNo: number): Milestone | null {
  if (milestoneSet.has(value as Milestone)) {
    return value as Milestone;
  }

  return milestoneByTaskNo(taskNo);
}

function milestoneByTaskNo(taskNo: number): Milestone {
  if (taskNo >= 1 && taskNo <= 6) return "原画里程碑";
  if (taskNo >= 7 && taskNo <= 10) return "建模里程碑";
  if ((taskNo >= 11 && taskNo <= 15) || taskNo === 17 || taskNo === 18) return "红蜡里程碑";
  if (taskNo >= 21 && taskNo <= 27) return "产前里程碑";
  if (taskNo === 30) return "大货里程碑";
  return "平面里程碑";
}

function groupRiskLevel(rows: TaskResultRow[]): RiskLevel {
  if (rows.length > 0 && rows.every(isCompletedTask)) {
    return "done";
  }

  return rows.filter((row) => !isCompletedTask(row)).reduce<RiskLevel>((level, row) => {
    return worseRiskLevel(level, toRiskLevel(row.riskLevel));
  }, "normal");
}

function isCompletedTask(row: TaskResultRow) {
  return [row.displayStatus, row.taskActionType].some((value) => {
    if (!value) return false;
    return value.includes("已完成") || value.includes("已通过");
  });
}

function displayDateForForecastView(row: TaskResultRow) {
  if (isCompletedTask(row)) {
    return completionDateForRow(row) ?? row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate;
  }

  return row.forecastFinishDate ?? row.expectedFinishDate ?? row.plannedFinishDate;
}

function completedMilestoneDate(rows: TaskResultRow[], projectRows: TaskResultRow[], milestone: Milestone) {
  const ownCompletionDate = maxDate(rows.map(completionDateForRow));

  if (!ownCompletionDate) {
    return null;
  }

  const downstreamCompletionDate = immediateDependencyCompletionDate(projectRows, milestone);
  const completionDate =
    downstreamCompletionDate && downstreamCompletionDate.getTime() < ownCompletionDate.getTime()
      ? downstreamCompletionDate
      : ownCompletionDate;

  return completionDate;
}

const directDependencyTaskNos: Partial<Record<Milestone, number[]>> = {
  原画里程碑: [7, 10],
  建模里程碑: [11, 14, 15, 17, 18],
  红蜡里程碑: [21],
  产前里程碑: [30],
};

function immediateDependencyCompletionDate(projectRows: TaskResultRow[], milestone: Milestone) {
  const dependencyTaskNos = directDependencyTaskNos[milestone] ?? [];

  if (dependencyTaskNos.length === 0) {
    return null;
  }

  const completionDates = projectRows
    .filter((row) => dependencyTaskNos.includes(row.taskNo) && isCompletedTask(row))
    .map(completionDateForRow)
    .filter(isDate);

  return minDate(completionDates);
}

function completionDateForRow(row: TaskResultRow) {
  const raw = rawTaskResult(row.rawResult);
  return (
    dateFromRawValue(raw.actualFinishDate) ??
    dateFromRawValue(raw.inferredCompletionDate) ??
    row.forecastFinishDate ??
    row.expectedFinishDate ??
    row.plannedFinishDate
  );
}

function rawTaskResult(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function dateFromRawValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function toRiskLevel(value: string | null | undefined): RiskLevel {
  if (!value) {
    return "normal";
  }

  return riskMap[value] ?? "normal";
}

function isProjectCard(card: ProjectCard | null): card is ProjectCard {
  return card !== null;
}

function worseRiskLevel(a: RiskLevel, b: RiskLevel) {
  const weight: Record<RiskLevel, number> = {
    done: 0,
    doneLate: 0,
    normal: 1,
    risk: 2,
    delay: 3,
  };

  return weight[b] > weight[a] ? b : a;
}

function isFinishedRiskLevel(riskLevel: RiskLevel) {
  return riskLevel === "done" || riskLevel === "doneLate";
}

function maxDateMonth(values: Array<Date | null | undefined>) {
  const latest = maxDate(values);
  if (!latest) {
    return null;
  }

  return formatMonthLabel(dateToMonthPoint(latest));
}

function isDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function maxDate(values: Array<Date | null | undefined>) {
  const dates = values.filter(isDate);
  if (dates.length === 0) {
    return null;
  }

  return dates.reduce((max, date) => (date.getTime() > max.getTime() ? date : max));
}

function minDate(values: Array<Date | null | undefined>) {
  const dates = values.filter(isDate);
  if (dates.length === 0) {
    return null;
  }

  return dates.reduce((min, date) => (date.getTime() < min.getTime() ? date : min));
}

function buildMonthTimeline(cards: ProjectCard[], today = new Date()) {
  const cardMonths = cards
    .flatMap((card) => [parseMonthLabel(card.plannedMonth ?? card.month), parseMonthLabel(card.forecastMonth ?? card.month)])
    .filter(isMonthPoint);

  if (cardMonths.length === 0) {
    return { months: [], initialMonth: undefined };
  }

  const earliestMonth = minMonth(cardMonths);
  const latestMonth = maxMonth(cardMonths);

  if (!earliestMonth || !latestMonth) {
    return { months: [], initialMonth: undefined };
  }

  const months = monthsBetween(earliestMonth, latestMonth).map(formatMonthLabel);
  const currentMonth = { year: today.getFullYear(), month: today.getMonth() + 1 };
  const unfinishedPlannedMonths = cards
    .filter((card) => !isFinishedRiskLevel(card.riskLevel))
    .map((card) => parseMonthLabel(card.plannedMonth ?? card.month))
    .filter(isMonthPoint);
  const earliestUnfinishedBeforeCurrent = minMonth(
    unfinishedPlannedMonths.filter((month) => compareMonthPoint(month, currentMonth) < 0),
  );
  const firstCurrentOrFuture = minMonth(cardMonths.filter((month) => compareMonthPoint(month, currentMonth) >= 0));
  const initialMonth = earliestUnfinishedBeforeCurrent ?? currentMonthInRange(currentMonth, earliestMonth, latestMonth) ?? firstCurrentOrFuture ?? earliestMonth;

  return {
    months,
    initialMonth: formatMonthLabel(initialMonth),
  };
}

function currentMonthInRange(currentMonth: MonthPoint, earliestMonth: MonthPoint, latestMonth: MonthPoint) {
  if (compareMonthPoint(currentMonth, earliestMonth) < 0 || compareMonthPoint(currentMonth, latestMonth) > 0) {
    return null;
  }

  return currentMonth;
}

function parseMonthLabel(label: string | undefined, shortLabelYear = new Date().getFullYear()): MonthPoint | null {
  if (!label) {
    return null;
  }

  const fullYearMonth = label.match(/^(\d{4})年(\d{1,2})月$/);
  if (fullYearMonth) {
    return { year: Number(fullYearMonth[1]), month: Number(fullYearMonth[2]) };
  }

  const shortYearMonth = label.match(/^(\d{2})年(\d{1,2})月$/);
  if (shortYearMonth) {
    return { year: 2000 + Number(shortYearMonth[1]), month: Number(shortYearMonth[2]) };
  }

  const currentYearMonth = label.match(/^(\d{1,2})月$/);
  if (currentYearMonth) {
    return { year: shortLabelYear, month: Number(currentYearMonth[1]) };
  }

  return null;
}

function isMonthPoint(month: MonthPoint | null): month is MonthPoint {
  return month !== null;
}

function formatMonthLabel(month: MonthPoint) {
  return `${String(month.year).slice(-2)}年${month.month}月`;
}

function dateToMonthPoint(date: Date): MonthPoint {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function compareMonthLabel(a: string, b: string) {
  return monthSortValue(a) - monthSortValue(b);
}

function monthSortValue(label: string) {
  const month = parseMonthLabel(label);
  return month ? toMonthIndex(month) : Number.MAX_SAFE_INTEGER;
}

function minMonth(months: MonthPoint[]) {
  if (months.length === 0) {
    return null;
  }

  return months.reduce((min, month) => (compareMonthPoint(month, min) < 0 ? month : min));
}

function maxMonth(months: MonthPoint[]) {
  if (months.length === 0) {
    return null;
  }

  return months.reduce((max, month) => (compareMonthPoint(month, max) > 0 ? month : max));
}

function compareMonthPoint(a: MonthPoint, b: MonthPoint) {
  return toMonthIndex(a) - toMonthIndex(b);
}

function toMonthIndex(month: MonthPoint) {
  return month.year * 12 + month.month;
}

function monthsBetween(start: MonthPoint, end: MonthPoint) {
  const months: MonthPoint[] = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push({ year, month });
    month += 1;

    if (month > 12) {
      year += 1;
      month = 1;
    }
  }

  return months;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "待测算";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "待测算";
  }

  return date.toISOString().slice(0, 10);
}
