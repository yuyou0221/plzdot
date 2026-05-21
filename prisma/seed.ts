import "dotenv/config";

import { prisma } from "../src/lib/db/prisma";
import { projectCards, projectDetails } from "../src/lib/sample-schedule";

const sampleRunId = "sample-run-p0";

async function main() {
  await prisma.scheduleRun.upsert({
    where: { id: sampleRunId },
    update: {
      runName: "P0 样例测算批次",
      runType: "正式测算",
      scriptName: "sample-seed",
      runStatus: "成功",
      calculatedAt: new Date(),
    },
    create: {
      id: sampleRunId,
      runName: "P0 样例测算批次",
      runType: "正式测算",
      scriptName: "sample-seed",
      runStatus: "成功",
      calculatedAt: new Date(),
    },
  });

  for (const detail of Object.values(projectDetails)) {
    await prisma.project.upsert({
      where: { id: detail.id },
      update: {
        projectName: detail.name,
        plannedLaunchDate: toDate(detail.plannedFinish),
        projectTeamId: detail.projectTeam,
        projectOwnerId: detail.owner,
        artOwnerId: detail.artOwner,
        currentStage: detail.currentTask,
        status: "进行中",
      },
      create: {
        id: detail.id,
        projectName: detail.name,
        plannedLaunchDate: toDate(detail.plannedFinish),
        projectTeamId: detail.projectTeam,
        projectOwnerId: detail.owner,
        artOwnerId: detail.artOwner,
        currentStage: detail.currentTask,
        status: "进行中",
      },
    });

    const projectTaskId = `${detail.id}-current-task`;

    await prisma.projectTask.upsert({
      where: { id: projectTaskId },
      update: {
        projectId: detail.id,
        taskNo: detail.currentTask.includes("建模") ? 7 : 1,
        taskName: detail.currentTask,
        milestoneType: detail.currentTask.includes("建模") ? "建模" : "原画",
        plannedFinishDate: toDate(detail.plannedFinish),
        expectedFinishDate: toDate(detail.forecastFinish),
        status: detail.riskLevel === "done" ? "已完成" : "进行中",
        lastUpdatedAt: new Date(),
      },
      create: {
        id: projectTaskId,
        projectId: detail.id,
        taskNo: detail.currentTask.includes("建模") ? 7 : 1,
        taskName: detail.currentTask,
        milestoneType: detail.currentTask.includes("建模") ? "建模" : "原画",
        plannedFinishDate: toDate(detail.plannedFinish),
        expectedFinishDate: toDate(detail.forecastFinish),
        status: detail.riskLevel === "done" ? "已完成" : "进行中",
        lastUpdatedAt: new Date(),
      },
    });

    await prisma.scheduleProjectResult.upsert({
      where: { id: `${sampleRunId}-${detail.id}` },
      update: {
        scheduleRunId: sampleRunId,
        projectId: detail.id,
        plannedLaunchDate: toDate(detail.plannedFinish),
        forecastLaunchDate: toDate(detail.forecastFinish),
        riskLevel: toDbRisk(detail.riskLevel),
        currentStage: detail.currentTask,
        currentTaskId: projectTaskId,
        currentTaskName: detail.currentTask,
        riskMessage: detail.riskMessage,
        projectProgressPercent: detail.progressPercent,
      },
      create: {
        id: `${sampleRunId}-${detail.id}`,
        scheduleRunId: sampleRunId,
        projectId: detail.id,
        plannedLaunchDate: toDate(detail.plannedFinish),
        forecastLaunchDate: toDate(detail.forecastFinish),
        riskLevel: toDbRisk(detail.riskLevel),
        currentStage: detail.currentTask,
        currentTaskId: projectTaskId,
        currentTaskName: detail.currentTask,
        riskMessage: detail.riskMessage,
        projectProgressPercent: detail.progressPercent,
      },
    });

    await prisma.projectModelingProgress.upsert({
      where: { id: `${detail.id}-modeling-progress` },
      update: {
        projectId: detail.id,
        projectTaskId,
        totalRequiredStyles: detail.modelingProgress.total,
        approvedStyles: detail.modelingProgress.approved,
        inProgressStyles: detail.modelingProgress.inProgress,
        submittedStyles: detail.modelingProgress.submitted,
        outsourcedStyles: detail.modelingProgress.outsourced,
        unassignedStyles: detail.modelingProgress.unassigned,
        progressPercent:
          detail.modelingProgress.total > 0
            ? Math.round((detail.modelingProgress.approved / detail.modelingProgress.total) * 100)
            : 0,
        canWritebackProjectTask:
          detail.modelingProgress.total > 0 && detail.modelingProgress.approved === detail.modelingProgress.total,
        lastCalculatedAt: new Date(),
      },
      create: {
        id: `${detail.id}-modeling-progress`,
        projectId: detail.id,
        projectTaskId,
        totalRequiredStyles: detail.modelingProgress.total,
        approvedStyles: detail.modelingProgress.approved,
        inProgressStyles: detail.modelingProgress.inProgress,
        submittedStyles: detail.modelingProgress.submitted,
        outsourcedStyles: detail.modelingProgress.outsourced,
        unassignedStyles: detail.modelingProgress.unassigned,
        progressPercent:
          detail.modelingProgress.total > 0
            ? Math.round((detail.modelingProgress.approved / detail.modelingProgress.total) * 100)
            : 0,
        canWritebackProjectTask:
          detail.modelingProgress.total > 0 && detail.modelingProgress.approved === detail.modelingProgress.total,
        lastCalculatedAt: new Date(),
      },
    });

    if (detail.riskLevel === "risk" || detail.riskLevel === "delay") {
      await prisma.alert.upsert({
        where: { id: `${detail.id}-risk-alert` },
        update: {
          alertType: detail.riskLevel === "delay" ? "必然延期" : "延期风险",
          severity: detail.riskLevel === "delay" ? "紧急" : "重要",
          projectId: detail.id,
          title: `${detail.name}：${toDbRisk(detail.riskLevel)}`,
          message: detail.riskMessage,
          status: "未处理",
          createdFromRunId: sampleRunId,
        },
        create: {
          id: `${detail.id}-risk-alert`,
          alertType: detail.riskLevel === "delay" ? "必然延期" : "延期风险",
          severity: detail.riskLevel === "delay" ? "紧急" : "重要",
          projectId: detail.id,
          title: `${detail.name}：${toDbRisk(detail.riskLevel)}`,
          message: detail.riskMessage,
          status: "未处理",
          createdFromRunId: sampleRunId,
        },
      });
    }
  }

  for (const [index, card] of projectCards.entries()) {
    const detail = projectDetails[card.projectId];

    if (!detail) {
      continue;
    }

    await prisma.taskCard.upsert({
      where: { id: card.id },
      update: {
        cardType: "项目任务卡",
        entityType: "project_task",
        entityId: `${card.projectId}-current-task`,
        projectId: card.projectId,
        title: card.name,
        visualStatus: card.riskLevel,
        riskLevel: toDbRisk(card.riskLevel),
        laneType: "month_milestone",
        laneKey: `${card.month}:${card.milestone}`,
        sortOrder: index,
        draggable: true,
        lastRenderedFromRunId: sampleRunId,
      },
      create: {
        id: card.id,
        cardType: "项目任务卡",
        entityType: "project_task",
        entityId: `${card.projectId}-current-task`,
        projectId: card.projectId,
        title: card.name,
        visualStatus: card.riskLevel,
        riskLevel: toDbRisk(card.riskLevel),
        laneType: "month_milestone",
        laneKey: `${card.month}:${card.milestone}`,
        sortOrder: index,
        draggable: true,
        lastRenderedFromRunId: sampleRunId,
      },
    });
  }
}

function toDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date("2026-12-31") : parsed;
}

function toDbRisk(value: string) {
  if (value === "done") return "已完成";
  if (value === "risk") return "延期风险";
  if (value === "delay") return "必然延期";
  return "正常";
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
