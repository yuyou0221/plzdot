import { persistScheduleAnalysis, runScheduleAnalysisFromDatabase } from "@/lib/schedule-engine/adapters";
import type {
  ScheduleAnalyzeOptions,
  ScheduleEnginePayload,
  ScheduleEnginePort,
  ScheduleEngineResultStore,
} from "@/lib/schedule-engine/port";

export const legacyScheduleEnginePort: ScheduleEnginePort = {
  engineName: "legacy-project-schedule-core",
  engineVersion: "v5-excel-adapter",
  runAnalysis: runScheduleAnalysisFromDatabase,
};

export const prismaScheduleEngineResultStore: ScheduleEngineResultStore = {
  persistAnalysis: persistScheduleAnalysis,
};

type ScheduleEngineServiceDeps = {
  engine?: ScheduleEnginePort;
  resultStore?: ScheduleEngineResultStore;
};

export async function runAndPersistScheduleAnalysis(
  scheduleRunId: string,
  options: ScheduleAnalyzeOptions = {},
  deps: ScheduleEngineServiceDeps = {},
) {
  const engine = deps.engine ?? legacyScheduleEnginePort;
  const resultStore = deps.resultStore ?? prismaScheduleEngineResultStore;
  const payload = await engine.runAnalysis(options);

  await resultStore.persistAnalysis(scheduleRunId, payload);

  return {
    engineName: engine.engineName,
    engineVersion: engine.engineVersion,
    payload,
  };
}

export async function persistScheduleEngineResult(
  scheduleRunId: string,
  payload: ScheduleEnginePayload,
  deps: Pick<ScheduleEngineServiceDeps, "resultStore"> = {},
) {
  const resultStore = deps.resultStore ?? prismaScheduleEngineResultStore;
  await resultStore.persistAnalysis(scheduleRunId, payload);
}
