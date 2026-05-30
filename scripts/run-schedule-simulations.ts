import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import type { ProjectTaskFactEvent } from "../src/lib/schedule-task-fact-events-core";

const simulationPrefix = "schedule-simulation:";
const defaultScenarioDir = path.resolve("test-fixtures", "schedule-scenarios");

let prisma: typeof import("../src/lib/db/prisma").prisma;
let milestoneByTaskNo: typeof import("../src/lib/schedule-domain").milestoneByTaskNo;
let runAndPersistScheduleAnalysis: typeof import("../src/lib/schedule-engine/service").runAndPersistScheduleAnalysis;
let getScheduleWorkbenchData: typeof import("../src/lib/schedule-repository").getScheduleWorkbenchData;
let ingestProjectTaskFactEvent: typeof import("../src/lib/schedule-task-fact-events-core").ingestProjectTaskFactEvent;
let parseProjectTaskFactEvent: typeof import("../src/lib/schedule-task-fact-events-core").parseProjectTaskFactEvent;
let ingestTaskFactEventAndRecalculate: typeof import("../src/lib/schedule-task-fact-events-service").ingestTaskFactEventAndRecalculate;
let runtimeLoaded = false;

type Scenario = {
  id: string;
  name: string;
  description?: string;
  today: string;
  taskRules?: ScenarioTaskRule[];
  projects: ScenarioProject[];
  events?: ScenarioEvent[];
  expect?: ScenarioExpect;
};

type ScenarioTaskRule = {
  taskNo: number;
  taskName: string;
  milestoneType?: string;
  standardWorkdays?: number;
};

type ScenarioProject = {
  ref: string;
  projectCode?: string;
  projectName: string;
  licensorName: string;
  ipName: string;
  productType?: string;
  styleCount?: number;
  projectLevel?: string;
  routeType?: string;
  needThreeView?: boolean;
  plannedLaunchDate: string;
  projectStartDate?: string;
  projectTeamId?: string;
  projectOwnerId?: string;
  artOwnerId?: string;
  currentStage?: string;
  status?: string;
  notes?: string;
  tasks?: ScenarioTask[];
};

type ScenarioTask = {
  taskNo: number;
  taskName: string;
  milestoneType?: string;
  status?: string;
  plannedStartDate?: string;
  plannedFinishDate?: string;
};

type ScenarioEvent = {
  ref: string;
  projectRef: string;
  replayCount?: number;
  eventType: ProjectTaskFactEvent["eventType"];
  taskNo: number;
  taskKey: string;
  taskName: string;
  occurredAt: string;
  operatorId: string;
  operatorName: string;
  payload: Record<string, unknown>;
  autoRecalculate?: boolean;
};

type ScenarioExpect = {
  processedEvents?: number;
  duplicateResponses?: number;
  autoRecalculationRuns?: number;
  projects?: ProjectExpectation[];
  workbench?: {
    calendarYears?: number[];
    minimumProjectCards?: number;
  };
};

type ProjectExpectation = {
  ref: string;
  taskCount?: number;
  taskNos?: number[];
  tasks?: TaskExpectation[];
  scheduleResult?: {
    exists?: boolean;
    riskLevel?: string;
  };
};

type TaskExpectation = {
  taskNo: number;
  status?: string;
  actualStartDate?: string | null;
  actualFinishDate?: string | null;
  expectedFinishDate?: string | null;
  isBlocked?: boolean;
  blockReason?: string | null;
};

type CliOptions = {
  scenarioId?: string;
  list: boolean;
  cleanupOnly: boolean;
  cleanupAfter: boolean;
};

type ScenarioRuntime = {
  scenario: Scenario;
  batchId: string;
  projectIdByRef: Map<string, string>;
  duplicateResponses: number;
  autoRecalculationRuns: number;
  scheduleRunId: string;
};

type AssertionResult = {
  ok: boolean;
  label: string;
  detail?: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenarios = await loadScenarios(defaultScenarioDir);

  if (options.list) {
    for (const scenario of scenarios) {
      console.log(`${scenario.id} - ${scenario.name}${scenario.description ? `：${scenario.description}` : ""}`);
    }
    return;
  }

  await loadRuntime();

  if (options.cleanupOnly) {
    const result = await cleanupSimulationData();
    console.log(`已清理模拟数据：项目 ${result.projectCount} 个，测算批次 ${result.runCount} 个，任务规则 ${result.taskRuleCount} 条。`);
    return;
  }

  const selected = selectScenarios(scenarios, options.scenarioId);
  const allAssertions: AssertionResult[] = [];

  for (const scenario of selected) {
    await cleanupSimulationData();
    const runtime = await runScenario(scenario);
    const assertions = await assertScenario(runtime);
    allAssertions.push(...assertions.map((assertion) => ({ ...assertion, label: `${scenario.id} / ${assertion.label}` })));
    printScenarioReport(scenario, assertions);

    if (options.cleanupAfter) {
      await cleanupSimulationData();
    }
  }

  const failed = allAssertions.filter((assertion) => !assertion.ok);
  const passedCount = allAssertions.length - failed.length;

  console.log("");
  console.log(`模拟测试完成：${passedCount}/${allAssertions.length} 项通过。`);

  if (failed.length > 0) {
    console.log("失败项：");
    for (const assertion of failed) {
      console.log(`- ${assertion.label}${assertion.detail ? `：${assertion.detail}` : ""}`);
    }
    process.exitCode = 1;
  }
}

async function loadRuntime() {
  if (runtimeLoaded) {
    return;
  }

  const [db, domain, adapters, repository, events, eventService] = await Promise.all([
    import("../src/lib/db/prisma"),
    import("../src/lib/schedule-domain"),
    import("../src/lib/schedule-engine/service"),
    import("../src/lib/schedule-repository"),
    import("../src/lib/schedule-task-fact-events-core"),
    import("../src/lib/schedule-task-fact-events-service"),
  ]);

  prisma = db.prisma;
  milestoneByTaskNo = domain.milestoneByTaskNo;
  runAndPersistScheduleAnalysis = adapters.runAndPersistScheduleAnalysis;
  getScheduleWorkbenchData = repository.getScheduleWorkbenchData;
  ingestProjectTaskFactEvent = events.ingestProjectTaskFactEvent;
  parseProjectTaskFactEvent = events.parseProjectTaskFactEvent;
  ingestTaskFactEventAndRecalculate = eventService.ingestTaskFactEventAndRecalculate;
  runtimeLoaded = true;
}

async function runScenario(scenario: Scenario): Promise<ScenarioRuntime> {
  validateScenario(scenario);

  const batchId = `${simulationPrefix}${scenario.id}:${timestampKey()}`;
  const projectIdByRef = new Map<string, string>();

  await ensureTaskRules(scenario, batchId);

  for (const project of scenario.projects) {
    const projectId = `${batchId}:${project.ref}`;
    projectIdByRef.set(project.ref, projectId);
    await prisma.project.create({
      data: {
        id: projectId,
        projectCode: project.projectCode,
        projectName: `[模拟:${scenario.id}] ${project.projectName}`,
        ipName: project.ipName,
        licensorName: project.licensorName,
        productType: project.productType,
        styleCount: project.styleCount,
        projectLevel: project.projectLevel,
        routeType: project.routeType ?? "A",
        needThreeView: project.needThreeView ?? false,
        plannedLaunchDate: dateOnly(project.plannedLaunchDate),
        projectStartDate: project.projectStartDate ? dateOnly(project.projectStartDate) : undefined,
        projectTeamId: project.projectTeamId,
        projectOwnerId: project.projectOwnerId,
        artOwnerId: project.artOwnerId,
        currentStage: project.currentStage,
        status: project.status ?? "进行中",
        sourceImportId: batchId,
        notes: project.notes,
      },
    });

    await createScenarioTasks(batchId, projectId, project.tasks ?? []);
  }

  let duplicateResponses = 0;
  let autoRecalculationRuns = 0;

  for (const event of scenario.events ?? []) {
    const replayCount = event.replayCount ?? 1;

    for (let index = 0; index < replayCount; index += 1) {
      const parsedEvent = parseProjectTaskFactEvent(buildEvent(batchId, event, projectIdByRef));
      const result = event.autoRecalculate
        ? await ingestTaskFactEventAndRecalculate(parsedEvent)
        : await ingestProjectTaskFactEvent(parsedEvent);

      if (result.duplicate) {
        duplicateResponses += 1;
      }

      if (recalculationStatus(result) === "success") {
        autoRecalculationRuns += 1;
      }

      if (!result.ok) {
        throw new Error(`场景 ${scenario.id} 的事件 ${event.ref} 写入失败：${result.message}`);
      }
    }
  }

  const scheduleRunId = await runScenarioScheduleAnalysis(scenario, batchId, Array.from(projectIdByRef.values()));

  return {
    scenario,
    batchId,
    projectIdByRef,
    duplicateResponses,
    autoRecalculationRuns,
    scheduleRunId,
  };
}

async function ensureTaskRules(scenario: Scenario, batchId: string) {
  const rules = new Map<number, ScenarioTaskRule>();

  for (const rule of scenario.taskRules ?? []) {
    rules.set(rule.taskNo, rule);
  }

  for (const project of scenario.projects) {
    for (const task of project.tasks ?? []) {
      if (!rules.has(task.taskNo)) {
        rules.set(task.taskNo, { taskNo: task.taskNo, taskName: task.taskName });
      }
    }
  }

  for (const event of scenario.events ?? []) {
    if (!rules.has(event.taskNo)) {
      rules.set(event.taskNo, { taskNo: event.taskNo, taskName: event.taskName });
    }
  }

  for (const rule of rules.values()) {
    await prisma.taskRule.upsert({
      where: {
        taskNo_sourceVersion: {
          taskNo: rule.taskNo,
          sourceVersion: batchId,
        },
      },
      update: {
        taskName: rule.taskName,
        milestoneType: rule.milestoneType ?? milestoneByTaskNo(rule.taskNo),
        standardWorkdays: rule.standardWorkdays,
        isActive: true,
      },
      create: {
        taskNo: rule.taskNo,
        taskName: rule.taskName,
        milestoneType: rule.milestoneType ?? milestoneByTaskNo(rule.taskNo),
        standardWorkdays: rule.standardWorkdays,
        sourceVersion: batchId,
        isActive: true,
      },
    });
  }
}

async function createScenarioTasks(batchId: string, projectId: string, tasks: ScenarioTask[]) {
  if (tasks.length === 0) {
    return;
  }

  const taskRules = await prisma.taskRule.findMany({
    where: { sourceVersion: batchId, taskNo: { in: tasks.map((task) => task.taskNo) } },
  });
  const ruleByTaskNo = new Map(taskRules.map((rule) => [rule.taskNo, rule]));

  await prisma.projectTask.createMany({
    data: tasks.map((task) => {
      const taskRule = ruleByTaskNo.get(task.taskNo);

      return {
        projectId,
        taskRuleId: taskRule?.id,
        taskNo: task.taskNo,
        taskName: task.taskName,
        milestoneType: task.milestoneType ?? taskRule?.milestoneType ?? milestoneByTaskNo(task.taskNo),
        status: task.status ?? "未开始",
        plannedStartDate: task.plannedStartDate ? dateOnly(task.plannedStartDate) : undefined,
        plannedFinishDate: task.plannedFinishDate ? dateOnly(task.plannedFinishDate) : undefined,
        sourceImportId: batchId,
      };
    }),
  });
}

function buildEvent(
  batchId: string,
  event: ScenarioEvent,
  projectIdByRef: Map<string, string>,
): ProjectTaskFactEvent {
  const projectId = projectIdByRef.get(event.projectRef);
  if (!projectId) {
    throw new Error(`事件 ${event.ref} 引用了不存在的项目 ref：${event.projectRef}`);
  }

  return {
    eventId: `${batchId}:${event.ref}`,
    eventType: event.eventType,
    sourceModule: "product-guide",
    projectId,
    taskNo: event.taskNo,
    taskKey: event.taskKey,
    taskName: event.taskName,
    occurredAt: event.occurredAt,
    operatorId: event.operatorId,
    operatorName: event.operatorName,
    payload: event.payload,
  };
}

function recalculationStatus(result: unknown) {
  if (!result || typeof result !== "object" || !("recalculation" in result)) {
    return undefined;
  }

  const recalculation = (result as { recalculation?: unknown }).recalculation;
  if (!recalculation || typeof recalculation !== "object" || !("status" in recalculation)) {
    return undefined;
  }

  return (recalculation as { status?: unknown }).status;
}

async function runScenarioScheduleAnalysis(scenario: Scenario, batchId: string, projectIds: string[]) {
  const calculatedAt = new Date();
  const scheduleRun = await prisma.scheduleRun.create({
    data: {
      runName: `[模拟:${scenario.id}] ${scenario.name}`,
      runType: "模拟测试",
      sourceImportId: batchId,
      scriptName: "schedule-simulation",
      scriptVersion: "scenario-v1",
      inputSnapshot: toJson({
        simulationBatchId: batchId,
        scenarioId: scenario.id,
        projectIds,
        today: scenario.today,
      }),
      runStatus: "进行中",
      calculatedAt,
      createdBy: batchId,
    },
  });

  await runAndPersistScheduleAnalysis(scheduleRun.id, { projectIds, today: scenario.today });

  await prisma.scheduleRun.update({
    where: { id: scheduleRun.id },
    data: {
      runStatus: "成功",
      calculatedAt,
    },
  });

  return scheduleRun.id;
}

async function assertScenario(runtime: ScenarioRuntime) {
  const assertions: AssertionResult[] = [];
  const { scenario, batchId, projectIdByRef, scheduleRunId } = runtime;

  if (typeof scenario.expect?.processedEvents === "number") {
    const processedEvents = await prisma.projectTaskFactEventLog.count({
      where: { eventId: { startsWith: `${batchId}:` }, processingStatus: "processed" },
    });
    assertions.push(equalResult("任务事实事件处理数量", processedEvents, scenario.expect.processedEvents));
  }

  if (typeof scenario.expect?.duplicateResponses === "number") {
    assertions.push(equalResult("重复事件响应数量", runtime.duplicateResponses, scenario.expect.duplicateResponses));
  }

  if (typeof scenario.expect?.autoRecalculationRuns === "number") {
    assertions.push(equalResult("任务事实自动重算次数", runtime.autoRecalculationRuns, scenario.expect.autoRecalculationRuns));
  }

  for (const expectation of scenario.expect?.projects ?? []) {
    const projectId = projectIdByRef.get(expectation.ref);

    if (!projectId) {
      assertions.push({ ok: false, label: `项目 ${expectation.ref}`, detail: "找不到项目 ref" });
      continue;
    }

    if (expectation.scheduleResult?.exists !== undefined) {
      const result = await prisma.scheduleProjectResult.findFirst({
        where: { scheduleRunId, projectId },
        select: { riskLevel: true },
      });

      assertions.push(
        equalResult(`项目 ${expectation.ref} 测算结果存在`, Boolean(result), expectation.scheduleResult.exists),
      );

      if (expectation.scheduleResult.riskLevel && result) {
        assertions.push(
          equalResult(`项目 ${expectation.ref} 风险等级`, result.riskLevel, expectation.scheduleResult.riskLevel),
        );
      }
    }

    if (typeof expectation.taskCount === "number") {
      const taskCount = await prisma.projectTask.count({ where: { projectId } });
      assertions.push(equalResult(`项目 ${expectation.ref} 任务数量`, taskCount, expectation.taskCount));
    }

    if (expectation.taskNos?.length) {
      const tasks = await prisma.projectTask.findMany({
        where: { projectId, taskNo: { in: expectation.taskNos } },
        select: { taskNo: true },
      });
      const actualTaskNos = new Set(tasks.map((task) => task.taskNo));
      const missingTaskNos = expectation.taskNos.filter((taskNo) => !actualTaskNos.has(taskNo));
      assertions.push({
        ok: missingTaskNos.length === 0,
        label: `项目 ${expectation.ref} 标准任务编号覆盖`,
        detail: missingTaskNos.length > 0 ? `缺少任务：${missingTaskNos.join(", ")}` : undefined,
      });
    }

    for (const taskExpectation of expectation.tasks ?? []) {
      const task = await prisma.projectTask.findFirst({
        where: { projectId, taskNo: taskExpectation.taskNo },
        select: {
          status: true,
          actualStartDate: true,
          actualFinishDate: true,
          expectedFinishDate: true,
          isBlocked: true,
          blockReason: true,
        },
      });

      if (!task) {
        assertions.push({
          ok: false,
          label: `项目 ${expectation.ref} 任务 ${taskExpectation.taskNo}`,
          detail: "找不到任务",
        });
        continue;
      }

      if (taskExpectation.status !== undefined) {
        assertions.push(equalResult(`项目 ${expectation.ref} 任务 ${taskExpectation.taskNo} 状态`, task.status, taskExpectation.status));
      }
      if (taskExpectation.actualStartDate !== undefined) {
        assertions.push(
          equalResult(
            `项目 ${expectation.ref} 任务 ${taskExpectation.taskNo} 实际开始`,
            formatDate(task.actualStartDate),
            taskExpectation.actualStartDate,
          ),
        );
      }
      if (taskExpectation.actualFinishDate !== undefined) {
        assertions.push(
          equalResult(
            `项目 ${expectation.ref} 任务 ${taskExpectation.taskNo} 实际完成`,
            formatDate(task.actualFinishDate),
            taskExpectation.actualFinishDate,
          ),
        );
      }
      if (taskExpectation.expectedFinishDate !== undefined) {
        assertions.push(
          equalResult(
            `项目 ${expectation.ref} 任务 ${taskExpectation.taskNo} 预计完成`,
            formatDate(task.expectedFinishDate),
            taskExpectation.expectedFinishDate,
          ),
        );
      }
      if (taskExpectation.isBlocked !== undefined) {
        assertions.push(
          equalResult(`项目 ${expectation.ref} 任务 ${taskExpectation.taskNo} 阻塞状态`, task.isBlocked, taskExpectation.isBlocked),
        );
      }
      if (taskExpectation.blockReason !== undefined) {
        assertions.push(
          equalResult(`项目 ${expectation.ref} 任务 ${taskExpectation.taskNo} 阻塞原因`, task.blockReason, taskExpectation.blockReason),
        );
      }
    }
  }

  if (scenario.expect?.workbench) {
    const data = await getScheduleWorkbenchData();
    const scenarioProjectIds = new Set(projectIdByRef.values());
    const scenarioCalendarProjects = data.calendarProjects.filter((project) => scenarioProjectIds.has(project.projectId));
    const scenarioCards = data.projectCards.filter((card) => scenarioProjectIds.has(card.projectId));

    for (const year of scenario.expect.workbench.calendarYears ?? []) {
      const exists = scenarioCalendarProjects.some((project) => {
        const dateText = project.plannedLaunchDate || "";
        return dateText.startsWith(`${year}-`);
      });
      assertions.push(equalResult(`上线日历包含 ${year} 年模拟项目`, exists, true));
    }

    if (typeof scenario.expect.workbench.minimumProjectCards === "number") {
      assertions.push(
        atLeastResult("里程碑看板模拟卡片数量", scenarioCards.length, scenario.expect.workbench.minimumProjectCards),
      );
    }
  }

  return assertions;
}

async function cleanupSimulationData() {
  const [projects, runs, taskRules] = await Promise.all([
    prisma.project.findMany({
      where: { sourceImportId: { startsWith: simulationPrefix } },
      select: { id: true },
    }),
    prisma.scheduleRun.findMany({
      where: { createdBy: { startsWith: simulationPrefix } },
      select: { id: true },
    }),
    prisma.taskRule.findMany({
      where: { sourceVersion: { startsWith: simulationPrefix } },
      select: { id: true },
    }),
  ]);

  const projectIds = projects.map((project) => project.id);
  const runIds = runs.map((run) => run.id);
  const taskRuleIds = taskRules.map((rule) => rule.id);
  const taskCardWhere = buildTaskCardWhere(projectIds, runIds);
  const taskCards = await prisma.taskCard.findMany({
    where: taskCardWhere,
    select: { id: true },
  });
  const taskCardIds = taskCards.map((card) => card.id);

  await prisma.$transaction([
    runIds.length > 0
      ? prisma.scheduleSimulation.deleteMany({
          where: { OR: [{ baseScheduleRunId: { in: runIds } }, { simulationRunId: { in: runIds } }] },
        })
      : prisma.scheduleSimulation.deleteMany({ where: { id: "__never__" } }),
    taskCardIds.length > 0
      ? prisma.scheduleAdjustment.deleteMany({ where: { taskCardId: { in: taskCardIds } } })
      : prisma.scheduleAdjustment.deleteMany({ where: { id: "__never__" } }),
    taskCardIds.length > 0
      ? prisma.taskDragLog.deleteMany({ where: { taskCardId: { in: taskCardIds } } })
      : prisma.taskDragLog.deleteMany({ where: { id: "__never__" } }),
    projectIds.length > 0 || runIds.length > 0
      ? prisma.taskCard.deleteMany({ where: taskCardWhere })
      : prisma.taskCard.deleteMany({ where: { id: "__never__" } }),
    projectIds.length > 0 || runIds.length > 0
      ? prisma.alert.deleteMany({ where: buildAlertWhere(projectIds, runIds) })
      : prisma.alert.deleteMany({ where: { id: "__never__" } }),
    projectIds.length > 0 || runIds.length > 0
      ? prisma.scheduleTaskResult.deleteMany({ where: buildScheduleTaskResultWhere(projectIds, runIds) })
      : prisma.scheduleTaskResult.deleteMany({ where: { id: "__never__" } }),
    projectIds.length > 0 || runIds.length > 0
      ? prisma.scheduleProjectResult.deleteMany({ where: buildScheduleProjectResultWhere(projectIds, runIds) })
      : prisma.scheduleProjectResult.deleteMany({ where: { id: "__never__" } }),
    projectIds.length > 0
      ? prisma.projectTaskFactEventLog.deleteMany({ where: { projectId: { in: projectIds } } })
      : prisma.projectTaskFactEventLog.deleteMany({ where: { id: "__never__" } }),
    projectIds.length > 0
      ? prisma.progressUpdate.deleteMany({ where: { projectId: { in: projectIds } } })
      : prisma.progressUpdate.deleteMany({ where: { id: "__never__" } }),
    projectIds.length > 0
      ? prisma.projectTask.deleteMany({ where: { projectId: { in: projectIds } } })
      : prisma.projectTask.deleteMany({ where: { id: "__never__" } }),
    projectIds.length > 0
      ? prisma.project.deleteMany({ where: { id: { in: projectIds } } })
      : prisma.project.deleteMany({ where: { id: "__never__" } }),
    taskRuleIds.length > 0
      ? prisma.taskRule.deleteMany({ where: { id: { in: taskRuleIds } } })
      : prisma.taskRule.deleteMany({ where: { id: "__never__" } }),
    runIds.length > 0
      ? prisma.scheduleRun.deleteMany({ where: { id: { in: runIds } } })
      : prisma.scheduleRun.deleteMany({ where: { id: "__never__" } }),
  ]);

  return {
    projectCount: projectIds.length,
    runCount: runIds.length,
    taskRuleCount: taskRuleIds.length,
  };
}

function buildTaskCardWhere(projectIds: string[], runIds: string[]): Prisma.TaskCardWhereInput {
  const or: Prisma.TaskCardWhereInput[] = [];
  if (projectIds.length > 0) or.push({ projectId: { in: projectIds } });
  if (runIds.length > 0) or.push({ lastRenderedFromRunId: { in: runIds } });
  return or.length > 0 ? { OR: or } : { id: "__never__" };
}

function buildAlertWhere(projectIds: string[], runIds: string[]): Prisma.AlertWhereInput {
  const or: Prisma.AlertWhereInput[] = [];
  if (projectIds.length > 0) or.push({ projectId: { in: projectIds } });
  if (runIds.length > 0) or.push({ createdFromRunId: { in: runIds } });
  return or.length > 0 ? { OR: or } : { id: "__never__" };
}

function buildScheduleTaskResultWhere(projectIds: string[], runIds: string[]): Prisma.ScheduleTaskResultWhereInput {
  const or: Prisma.ScheduleTaskResultWhereInput[] = [];
  if (projectIds.length > 0) or.push({ projectId: { in: projectIds } });
  if (runIds.length > 0) or.push({ scheduleRunId: { in: runIds } });
  return or.length > 0 ? { OR: or } : { id: "__never__" };
}

function buildScheduleProjectResultWhere(projectIds: string[], runIds: string[]): Prisma.ScheduleProjectResultWhereInput {
  const or: Prisma.ScheduleProjectResultWhereInput[] = [];
  if (projectIds.length > 0) or.push({ projectId: { in: projectIds } });
  if (runIds.length > 0) or.push({ scheduleRunId: { in: runIds } });
  return or.length > 0 ? { OR: or } : { id: "__never__" };
}

async function loadScenarios(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b));
  const scenarios: Scenario[] = [];

  for (const file of files) {
    const scenario = JSON.parse(await fs.readFile(file, "utf8")) as Scenario;
    validateScenario(scenario);
    scenarios.push(scenario);
  }

  return scenarios;
}

function validateScenario(scenario: Scenario) {
  if (!scenario.id || !scenario.name || !scenario.today) {
    throw new Error("模拟场景必须包含 id、name 和 today。");
  }

  if (!Array.isArray(scenario.projects) || scenario.projects.length === 0) {
    throw new Error(`模拟场景 ${scenario.id} 至少需要一个项目。`);
  }

  const refs = new Set<string>();
  for (const project of scenario.projects) {
    if (!project.ref || !project.projectName || !project.licensorName || !project.ipName || !project.plannedLaunchDate) {
      throw new Error(`模拟场景 ${scenario.id} 的项目缺少必填字段。`);
    }

    if (refs.has(project.ref)) {
      throw new Error(`模拟场景 ${scenario.id} 的项目 ref 重复：${project.ref}`);
    }
    refs.add(project.ref);
  }

  for (const event of scenario.events ?? []) {
    if (!refs.has(event.projectRef)) {
      throw new Error(`模拟场景 ${scenario.id} 的事件 ${event.ref} 引用了不存在的项目：${event.projectRef}`);
    }
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    list: false,
    cleanupOnly: false,
    cleanupAfter: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--list") {
      options.list = true;
      continue;
    }

    if (arg === "--cleanup-only") {
      options.cleanupOnly = true;
      continue;
    }

    if (arg === "--cleanup-after") {
      options.cleanupAfter = true;
      continue;
    }

    if (arg === "--scenario") {
      options.scenarioId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--scenario=")) {
      options.scenarioId = arg.slice("--scenario=".length);
      continue;
    }

    throw new Error(`无法识别参数：${arg}`);
  }

  return options;
}

function selectScenarios(scenarios: Scenario[], scenarioId?: string) {
  if (!scenarioId) {
    return scenarios;
  }

  const selected = scenarios.filter((scenario) => scenario.id === scenarioId);
  if (selected.length === 0) {
    throw new Error(`找不到模拟场景：${scenarioId}`);
  }

  return selected;
}

function equalResult(label: string, actual: unknown, expected: unknown): AssertionResult {
  const ok = actual === expected;

  return {
    ok,
    label,
    detail: ok ? undefined : `期望 ${String(expected)}，实际 ${String(actual)}`,
  };
}

function atLeastResult(label: string, actual: number, expected: number): AssertionResult {
  const ok = actual >= expected;

  return {
    ok,
    label,
    detail: ok ? undefined : `期望至少 ${expected}，实际 ${actual}`,
  };
}

function printScenarioReport(scenario: Scenario, assertions: AssertionResult[]) {
  const passed = assertions.filter((assertion) => assertion.ok).length;

  console.log("");
  console.log(`${scenario.id} - ${scenario.name}：${passed}/${assertions.length} 项通过`);

  for (const assertion of assertions) {
    console.log(`${assertion.ok ? "PASS" : "FAIL"} ${assertion.label}${assertion.detail ? ` - ${assertion.detail}` : ""}`);
  }
}

function dateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`日期必须是 YYYY-MM-DD：${value}`);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function timestampKey() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (runtimeLoaded) {
      await prisma.$disconnect();
    }
  });
