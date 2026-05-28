export type LaunchMonth = {
  year: number;
  month: number;
};

const suggestedLaunchDaysByCount: Record<number, number[]> = {
  1: [1],
  2: [1, 15],
  3: [1, 10, 20],
  4: [1, 8, 15, 22],
  5: [1, 7, 13, 19, 25],
};

export function suggestedLaunchDateForMonthIndex(monthKey: string, index: number, count: number) {
  const month = parseLaunchMonthKey(monthKey);
  if (!month || count <= 0 || index < 0 || index >= count) {
    return "";
  }

  const days = suggestedLaunchDays(count);
  const day = Math.min(days[index] ?? days[days.length - 1] ?? 1, daysInMonth(month));

  return `${month.year}-${padDatePart(month.month)}-${padDatePart(day)}`;
}

export function suggestedLaunchDays(count: number) {
  if (count <= 0) {
    return [];
  }

  if (suggestedLaunchDaysByCount[count]) {
    return suggestedLaunchDaysByCount[count];
  }

  if (count === 1) {
    return [1];
  }

  const firstDay = 1;
  const lastSuggestedDay = 25;
  const step = (lastSuggestedDay - firstDay) / (count - 1);

  return Array.from({ length: count }, (_, index) => Math.round(firstDay + step * index));
}

export function parseLaunchMonthKey(value: string | undefined | null): LaunchMonth | null {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

export function launchMonthKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}`;
}

export function dateOnlyFromString(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return new Date(value);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

export function launchMonthStart(month: LaunchMonth) {
  return new Date(Date.UTC(month.year, month.month - 1, 1, 0));
}

export function nextLaunchMonthStart(month: LaunchMonth) {
  return month.month === 12
    ? new Date(Date.UTC(month.year + 1, 0, 1, 0))
    : new Date(Date.UTC(month.year, month.month, 1, 0));
}

function daysInMonth(month: LaunchMonth) {
  return new Date(Date.UTC(month.year, month.month, 0, 12)).getUTCDate();
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
