import "server-only";

import { write, utils } from "xlsx";
import { prisma } from "@/lib/db/prisma";
import { excludeScheduleSimulationProjectsWhere } from "@/lib/schedule-simulation";
import { canonicalTaskRuleWhere } from "@/lib/schedule-task-rules";

const PROJECT_SHEET = "项目信息表2026";
const ACTUAL_SHEET = "实际进度录入表";
const TASK_RULE_SHEET = "任务规则v4";

const projectHeaders = [
  "项目ID",
  "项目管理系统（统一）",
  "项目名称",
  "授权方",
  "产品类型",
  "IP",
  "项目编号",
  "产品线",
  "规格",
  "零售价",
  "项目等级",
  "当前阶段",
  "启动日期",
  "预估出货日期",
  "所属团队",
  "项目管理",
  "产品美术",
  "建模负责人",
  "子公司",
  "授权金比例",
  "是否需要三视图",
  "红蜡路线or手板路线",
];

const actualHeaders = [
  "项目ID",
  "项目任务ID",
  "taskNo",
  "recordKey",
  "项目名称",
  "taskName",
  "taskStatus",
  "实际开始日期",
  "实际完成日期",
  "项目组",
  "推进中任务预期完成时间",
  "父记录",
];

const taskRuleHeaders = [
  "taskKey",
  "taskId",
  "taskName",
  "durationDays",
  "condition",
  "startAfterRules",
  "finishAfterRules",
  "sideTask",
  "legacyTaskId",
  "note",
];

export async function buildSchedulePlanningSourceExportBuffer() {
  const projects = await prisma.project.findMany({
    where: excludeScheduleSimulationProjectsWhere(),
    orderBy: [{ plannedLaunchDate: "asc" }, { projectCode: "asc" }, { projectName: "asc" }],
  });
  const projectIds = projects.map((project) => project.id);
  const [tasks, taskRules] = await Promise.all([
    projectIds.length
      ? prisma.projectTask.findMany({
          where: {
            projectId: { in: projectIds },
            OR: [
              { actualStartDate: { not: null } },
              { actualFinishDate: { not: null } },
              { expectedFinishDate: { not: null } },
              { progressNote: { not: null } },
              { isBlocked: true },
            ],
          },
          orderBy: [{ projectId: "asc" }, { taskNo: "asc" }],
        })
      : Promise.resolve([]),
    prisma.taskRule.findMany({
      where: canonicalTaskRuleWhere(),
      orderBy: [{ taskNo: "asc" }],
    }),
  ]);

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const workbook = utils.book_new();
  workbook.Props = {
    Title: "项目排期规划源表",
    Subject: "项目排期 Excel 导入导出",
    CreatedDate: new Date(),
  };

  const projectSheet = utils.aoa_to_sheet([
    projectHeaders,
    ...projects.map((project) => [
      project.id,
      project.projectName,
      project.projectName,
      project.licensorName,
      project.productType,
      project.ipName,
      project.projectCode,
      project.productLine,
      project.styleCount,
      project.retailPrice,
      project.projectLevel,
      project.currentStage ?? project.status,
      formatDate(project.projectStartDate),
      formatDate(project.plannedLaunchDate),
      project.projectTeamId,
      project.projectOwnerId,
      project.artOwnerId,
      project.modelingOwnerId,
      project.subsidiary,
      project.royaltyRate,
      project.needThreeView ? "1" : "",
      project.routeType,
    ]),
  ]);
  projectSheet["!cols"] = [{ hidden: true }, ...projectHeaders.slice(1).map(() => ({ wch: 16 }))];
  utils.book_append_sheet(workbook, projectSheet, PROJECT_SHEET);

  const actualSheet = utils.aoa_to_sheet([
    actualHeaders,
    ...tasks.map((task) => {
      const project = projectById.get(task.projectId);
      const recordProjectKey = project?.projectCode || project?.id || task.projectId;

      return [
        task.projectId,
        task.id,
        task.taskNo,
        `${recordProjectKey}-${task.taskNo}`,
        project?.projectName ?? task.projectId,
        task.taskName,
        task.status,
        formatDate(task.actualStartDate),
        formatDate(task.actualFinishDate),
        project?.projectTeamId ?? "",
        formatDate(task.expectedFinishDate),
        task.progressNote,
      ];
    }),
  ]);
  actualSheet["!cols"] = [{ hidden: true }, { hidden: true }, { hidden: true }, ...actualHeaders.slice(3).map(() => ({ wch: 18 }))];
  utils.book_append_sheet(workbook, actualSheet, ACTUAL_SHEET);

  const latestRuleByTaskNo = new Map<number, (typeof taskRules)[number]>();
  for (const rule of taskRules) {
    if (!latestRuleByTaskNo.has(rule.taskNo)) {
      latestRuleByTaskNo.set(rule.taskNo, rule);
    }
  }
  const taskRuleSheet = utils.aoa_to_sheet([
    taskRuleHeaders,
    ...Array.from(latestRuleByTaskNo.values())
      .sort((a, b) => a.taskNo - b.taskNo)
      .map((rule) => [
        `#${rule.taskNo}`,
        rule.taskNo,
        rule.taskName,
        rule.standardWorkdays,
        rule.routeCondition ?? (rule.needThreeViewCondition === true ? "hasThreeView=true" : ""),
        jsonText(rule.predecessorRule),
        rule.startFinishRule,
        "",
        "",
        rule.sourceVersion,
      ]),
  ]);
  taskRuleSheet["!cols"] = taskRuleHeaders.map(() => ({ wch: 18 }));
  utils.book_append_sheet(workbook, taskRuleSheet, TASK_RULE_SHEET);

  return write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

function formatDate(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function jsonText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}
