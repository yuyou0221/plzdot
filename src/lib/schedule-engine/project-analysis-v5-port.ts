import { createRequire } from "node:module";
import path from "node:path";
import type {
  ScheduleAnalyzeOptions,
  ScheduleEnginePayload,
  ScheduleEnginePort,
} from "@/lib/schedule-engine/port";

const scheduleEngineRequire = createRequire(
  path.join(process.cwd(), "src", "lib", "schedule-engine", "project-analysis-v5-port.cjs"),
);

export type ProjectAnalysisV5ExtractedInput = {
  workbook?: string;
  projects: Array<Record<string, unknown>>;
  actuals: Array<Record<string, unknown>>;
  taskRules: Array<Record<string, unknown>>;
};

export type ProjectAnalysisV5InputLoader = (
  options?: ScheduleAnalyzeOptions,
) => Promise<ProjectAnalysisV5ExtractedInput>;

type ProjectAnalysisV5Args = {
  scenario: string;
  hasThreeView: boolean;
  plannedBufferDays: number;
  project: string;
  projectName: string;
};

type ProjectAnalysisV5Module = {
  analyzeExtracted: (
    extracted: ProjectAnalysisV5ExtractedInput,
    args: ProjectAnalysisV5Args,
    engine: unknown,
    helpers: unknown,
    today: string,
  ) => ScheduleEnginePayload;
  makeDateHelpers: (engine: unknown) => unknown;
  shanghaiToday?: () => string;
};

export type ProjectAnalysisV5PortConfig = {
  loadInput: ProjectAnalysisV5InputLoader;
  coreEngine?: unknown;
  analysisModule?: ProjectAnalysisV5Module;
  defaultScenario?: string;
  defaultHasThreeView?: boolean;
  plannedBufferDays?: number;
  todayProvider?: () => string;
};

function loadDefaultCoreEngine() {
  return scheduleEngineRequire("./core/project-schedule-core.js");
}

function loadDefaultAnalysisModule() {
  return scheduleEngineRequire("./core/project-analysis-v5-excel.js") as ProjectAnalysisV5Module;
}

function fallbackShanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizeToday(
  options: ScheduleAnalyzeOptions | undefined,
  config: ProjectAnalysisV5PortConfig,
  analysis: ProjectAnalysisV5Module,
) {
  return options?.today || config.todayProvider?.() || analysis.shanghaiToday?.() || fallbackShanghaiToday();
}

export function createProjectAnalysisV5ScheduleEnginePort(config: ProjectAnalysisV5PortConfig): ScheduleEnginePort {
  let coreEngine = config.coreEngine;
  let analysisModule = config.analysisModule;

  function getCoreEngine() {
    coreEngine ??= loadDefaultCoreEngine();
    return coreEngine;
  }

  function getAnalysisModule() {
    analysisModule ??= loadDefaultAnalysisModule();
    return analysisModule;
  }

  return {
    engineName: "project-analysis-v5",
    engineVersion: "v5-web-port",
    async runAnalysis(options?: ScheduleAnalyzeOptions): Promise<ScheduleEnginePayload> {
      const analysis = getAnalysisModule();
      const engine = getCoreEngine();
      const today = normalizeToday(options, config, analysis);
      const extracted = await config.loadInput(options);
      const helpers = analysis.makeDateHelpers(engine);

      return analysis.analyzeExtracted(
        extracted,
        {
          scenario: config.defaultScenario ?? "A",
          hasThreeView: config.defaultHasThreeView ?? false,
          plannedBufferDays: config.plannedBufferDays ?? 0,
          project: "",
          projectName: "",
        },
        engine,
        helpers,
        today,
      );
    },
  };
}
