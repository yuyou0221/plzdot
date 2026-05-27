import type { Prisma } from "@prisma/client";
import {
  dateOnlyFromString,
  launchMonthKeyFromDate,
  launchMonthStart,
  nextLaunchMonthStart,
  parseLaunchMonthKey,
  suggestedLaunchDateForMonthIndex,
} from "@/lib/planned-launch-rules";

type ProjectLaunchRow = {
  id: string;
  projectCode: string | null;
  projectName: string;
  plannedLaunchDate: Date;
};

type ProjectClient = Pick<Prisma.TransactionClient, "project">;

export async function normalizeProjectLaunchDatesForMonths(client: ProjectClient, monthKeys: Iterable<string>) {
  const normalizedMonthKeys = Array.from(new Set(Array.from(monthKeys).filter((monthKey) => parseLaunchMonthKey(monthKey)))).sort();

  for (const monthKey of normalizedMonthKeys) {
    const month = parseLaunchMonthKey(monthKey);
    if (!month) {
      continue;
    }

    const projects = await client.project.findMany({
      where: {
        plannedLaunchDate: {
          gte: launchMonthStart(month),
          lt: nextLaunchMonthStart(month),
        },
      },
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        plannedLaunchDate: true,
      },
    });
    const orderedProjects = projects.sort(compareLaunchOrder);

    for (let index = 0; index < orderedProjects.length; index += 1) {
      const project = orderedProjects[index];
      const suggestedDate = suggestedLaunchDateForMonthIndex(monthKey, index, orderedProjects.length);

      if (!suggestedDate || formatDate(project.plannedLaunchDate) === suggestedDate) {
        continue;
      }

      await client.project.update({
        where: { id: project.id },
        data: { plannedLaunchDate: dateOnlyFromString(suggestedDate) },
      });
    }
  }
}

export function affectedLaunchMonthKeys(...dates: Array<Date | null | undefined>) {
  return dates.filter((date): date is Date => date instanceof Date).map(launchMonthKeyFromDate);
}

function compareLaunchOrder(a: ProjectLaunchRow, b: ProjectLaunchRow) {
  const codeOrder = compareNullableNumber(projectCodeOrder(a.projectCode), projectCodeOrder(b.projectCode));
  if (codeOrder !== 0) {
    return codeOrder;
  }

  const dateOrder = a.plannedLaunchDate.getTime() - b.plannedLaunchDate.getTime();
  if (dateOrder !== 0) {
    return dateOrder;
  }

  const nameOrder = a.projectName.localeCompare(b.projectName, "zh-CN");
  if (nameOrder !== 0) {
    return nameOrder;
  }

  return a.id.localeCompare(b.id);
}

function compareNullableNumber(a: number | null, b: number | null) {
  if (a !== null && b !== null && a !== b) {
    return a - b;
  }

  if (a !== null && b === null) {
    return -1;
  }

  if (a === null && b !== null) {
    return 1;
  }

  return 0;
}

function projectCodeOrder(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) {
    return null;
  }

  const number = Number(digits);
  return Number.isFinite(number) ? number : null;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
