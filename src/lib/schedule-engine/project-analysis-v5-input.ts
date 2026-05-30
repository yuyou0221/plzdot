import { prisma } from "@/lib/db/prisma";
import type { ScheduleAnalyzeOptions } from "@/lib/schedule-engine/port";
import type { ProjectAnalysisV5ExtractedInput } from "@/lib/schedule-engine/project-analysis-v5-port";
import { excludeScheduleSimulationProjectsWhere } from "@/lib/schedule-simulation";
import { canonicalTaskRuleWhere } from "@/lib/schedule-task-rules";

export async function loadProjectAnalysisV5InputFromDatabase(
  options: ScheduleAnalyzeOptions = {},
): Promise<ProjectAnalysisV5ExtractedInput> {
  const projects = await prisma.project.findMany({
    where: options.projectIds?.length ? { id: { in: options.projectIds } } : excludeScheduleSimulationProjectsWhere(),
    orderBy: { plannedLaunchDate: "asc" },
  });

  const projectIdList = projects.map((project) => project.id);
  const [projectTasks, taskRules] = await Promise.all([
    prisma.projectTask.findMany({
      where: projectIdList.length ? { projectId: { in: projectIdList } } : undefined,
      orderBy: [{ projectId: "asc" }, { taskNo: "asc" }],
    }),
    prisma.taskRule.findMany({
      where: canonicalTaskRuleWhere(),
      orderBy: { taskNo: "asc" },
    }),
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return {
    workbook: "database",
    projects: projects.map((project) => ({
      projectId: project.id,
      "项目编号": project.id,
      "业务项目编号": project.projectCode ?? "",
      projectName: project.projectName,
      "项目名称": project.projectName,
      projectStartDate: formatDate(project.projectStartDate ?? fallbackProjectStart(project.plannedLaunchDate)),
      "启动日期": formatDate(project.projectStartDate ?? fallbackProjectStart(project.plannedLaunchDate)),
      plannedLaunchDate: formatDate(project.plannedLaunchDate),
      "预估出货日期": formatDate(project.plannedLaunchDate),
      route: project.routeType ?? "",
      "路线": project.routeType ?? "",
      "红蜡路线or手板路线": project.routeType ?? "",
      hasThreeView: project.needThreeView ?? false,
      "是否需要三视图": project.needThreeView ?? false,
      "项目管理": project.projectOwnerId ?? "",
      "产品美术": project.artOwnerId ?? "",
      "所属团队": project.projectTeamId ?? "",
      "当前阶段": project.currentStage || project.status,
      "项目等级": project.projectLevel ?? "",
      "产品类型": project.productType ?? "",
      status: project.currentStage || project.status,
    })),
    actuals: projectTasks
      .filter((task) => task.actualStartDate || task.actualFinishDate || task.expectedFinishDate || task.status !== "未开始")
      .map((task) => {
        const project = projectById.get(task.projectId);

        return {
          projectName: project?.projectName ?? task.projectId,
          "项目名称": project?.projectName ?? task.projectId,
          taskName: task.taskName,
          recordKey: `${task.projectId}-${task.taskNo}`,
          actualStartDate: task.actualStartDate ? formatDate(task.actualStartDate) : undefined,
          "实际开始日期": task.actualStartDate ? formatDate(task.actualStartDate) : undefined,
          actualFinishDate: task.actualFinishDate ? formatDate(task.actualFinishDate) : undefined,
          "实际完成日期": task.actualFinishDate ? formatDate(task.actualFinishDate) : undefined,
          expectedFinishDate: task.expectedFinishDate ? formatDate(task.expectedFinishDate) : undefined,
          "推进中任务预期完成时间": task.expectedFinishDate ? formatDate(task.expectedFinishDate) : undefined,
          taskStatus: task.status,
        };
      }),
    taskRules: taskRules.map((rule) => ({
      taskId: rule.taskNo,
      taskName: rule.taskName,
    })),
  };
}

function fallbackProjectStart(plannedLaunchDate: Date) {
  const date = new Date(plannedLaunchDate);
  date.setDate(date.getDate() - 180);
  return date;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
