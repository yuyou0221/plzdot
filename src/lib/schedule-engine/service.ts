import { persistScheduleAnalysis } from "@/lib/schedule-engine/adapters";
import type {
  ScheduleAnalyzeOptions,
  ScheduleEnginePayload,
  ScheduleEnginePort,
  ScheduleEngineResultStore,
} from "@/lib/schedule-engine/port";
import { loadProjectAnalysisV5InputFromDatabase } from "@/lib/schedule-engine/project-analysis-v5-input";
import { createProjectAnalysisV5ScheduleEnginePort } from "@/lib/schedule-engine/project-analysis-v5-port";

export const projectAnalysisV5ScheduleEnginePort: ScheduleEnginePort = createProjectAnalysisV5ScheduleEnginePort({
  loadInput: loadProjectAnalysisV5InputFromDatabase,
});

export const defaultScheduleEnginePort = projectAnalysisV5ScheduleEnginePort;

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
  const engine = deps.engine ?? defaultScheduleEnginePort;
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
