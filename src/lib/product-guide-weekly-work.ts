export type ProductGuideWeeklyBucket = "due" | "progress" | "start" | "none";

export type ProductGuideWeekWindow = {
  startDate: string;
  endDate: string;
};

export type ProductGuideWeeklyTaskInput = {
  calculatedStartDate?: string | null;
  calculatedFinishDate?: string | null;
  actualStartDate?: string | null;
  actualFinishDate?: string | null;
  statusLabel?: string | null;
  taskEnabled?: boolean | null;
};

export function classifyProductGuideWeeklyTask(
  task: ProductGuideWeeklyTaskInput,
  weekWindow: ProductGuideWeekWindow = currentProductGuideWeekWindow(),
): ProductGuideWeeklyBucket {
  if (isExcludedWeeklyTask(task)) {
    return "none";
  }

  const dueDate = normalizeDateText(task.calculatedFinishDate);
  const startDate = normalizeDateText(task.calculatedStartDate);
  const started = hasWeeklyTaskStarted(task);

  if (dueDate && dueDate <= weekWindow.endDate) {
    return "due";
  }

  if (started && (!dueDate || dueDate > weekWindow.endDate)) {
    return "progress";
  }

  if (!started && startDate && startDate <= weekWindow.endDate) {
    return "start";
  }

  return "none";
}

export function currentProductGuideWeekWindow(today: Date = new Date()): ProductGuideWeekWindow {
  return productGuideWeekWindowFromDateText(formatDateInTimeZone(today, "Asia/Shanghai"));
}

export function productGuideWeekWindowFromDateText(today: string): ProductGuideWeekWindow {
  const normalized = normalizeDateText(today);

  if (!normalized) {
    throw new Error(`Invalid week window date: ${today}`);
  }

  const date = dateFromDateText(normalized);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = addDays(date, -daysSinceMonday);
  const end = addDays(start, 6);

  return {
    startDate: formatDateText(start),
    endDate: formatDateText(end),
  };
}

export function productGuideWorkDueDate(task: ProductGuideWeeklyTaskInput) {
  return normalizeDateText(task.calculatedFinishDate);
}

export function hasWeeklyTaskStarted(task: ProductGuideWeeklyTaskInput) {
  if (normalizeDateText(task.actualStartDate)) {
    return true;
  }

  const status = task.statusLabel ?? "";
  return ["进行中", "送审中", "阻塞中", "修改中", "待反馈", "等反馈"].some((text) => status.includes(text));
}

function isExcludedWeeklyTask(task: ProductGuideWeeklyTaskInput) {
  if (task.taskEnabled === false) {
    return true;
  }

  if (normalizeDateText(task.actualFinishDate)) {
    return true;
  }

  const status = task.statusLabel ?? "";
  return ["已完成", "已通过", "已处理", "完结", "暂停", "取消"].some((text) => status.includes(text)) || status === "完成";
}

function normalizeDateText(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function dateFromDateText(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDateText(date: Date) {
  return date.toISOString().slice(0, 10);
}
