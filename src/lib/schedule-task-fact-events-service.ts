import { prisma } from "@/lib/db/prisma";
import { legacyScheduleEnginePort, runAndPersistScheduleAnalysis } from "@/lib/schedule-engine/service";
import {
  ingestProjectTaskFactEvent,
  type IngestResult,
  type ProjectTaskFactEvent,
} from "@/lib/schedule-task-fact-events-core";

export type TaskFactIngestWithRecalculationResult = IngestResult & {
  scheduleRunId?: string;
  recalculation: {
    ok: boolean;
    status: "skipped" | "success" | "failed";
    projectCount?: number;
    futureTaskCount?: number;
    message: string;
  };
};

export async function ingestTaskFactEventAndRecalculate(
  event: ProjectTaskFactEvent,
): Promise<TaskFactIngestWithRecalculationResult> {
  const ingestResult = await ingestProjectTaskFactEvent(event);

  if (!ingestResult.ok || !ingestResult.needsRecalculation) {
    return {
      ...ingestResult,
      recalculation: {
        ok: true,
        status: "skipped",
        message: ingestResult.duplicate ? "重复事件未重复重算。" : "任务事实未写入，不触发重算。",
      },
    };
  }

  const scheduleRun = await prisma.scheduleRun.create({
    data: {
      runName: `任务事实重算 ${event.projectId} #${event.taskNo}`,
      runType: "任务事实重算",
      scriptName: legacyScheduleEnginePort.engineName,
      scriptVersion: legacyScheduleEnginePort.engineVersion,
      inputSnapshot: {
        source: "task-fact-event",
        eventId: event.eventId,
        eventType: event.eventType,
        sourceModule: event.sourceModule,
        projectId: event.projectId,
        taskNo: event.taskNo,
      },
      runStatus: "进行中",
      createdBy: event.operatorId,
    },
  });

  try {
    const analysis = await runAndPersistScheduleAnalysis(scheduleRun.id);

    await prisma.scheduleRun.update({
      where: { id: scheduleRun.id },
      data: {
        runStatus: "成功",
        scriptName: analysis.engineName,
        scriptVersion: analysis.engineVersion,
      },
    });

    return {
      ...ingestResult,
      scheduleRunId: scheduleRun.id,
      recalculation: {
        ok: true,
        status: "success",
        projectCount: analysis.payload.projectCount,
        futureTaskCount: analysis.payload.futureTaskCount,
        message: "任务事实已接收，并已完成排期重算。",
      },
      message: "项目排期已接收任务事实事件，并已完成排期重算。",
    };
  } catch (error) {
    const errorMessage = error instanceof Error && error.message ? error.message : "排期重算失败。";
    await prisma.scheduleRun.update({
      where: { id: scheduleRun.id },
      data: {
        runStatus: "失败",
        errorMessage,
      },
    });

    return {
      ...ingestResult,
      scheduleRunId: scheduleRun.id,
      recalculation: {
        ok: false,
        status: "failed",
        message: `任务事实已接收，但排期重算失败：${errorMessage}`,
      },
      message: `任务事实已接收，但排期重算失败：${errorMessage}`,
    };
  }
}
