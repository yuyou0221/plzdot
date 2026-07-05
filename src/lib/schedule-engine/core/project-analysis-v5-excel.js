/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unused-vars */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_ENGINE = path.join(__dirname, 'project-schedule-core.js');
const DEFAULT_EXCEL = 'C:/Users/yuyou/Downloads/番茄项目规划信息收集 (3).xlsx';
const DEFAULT_PYTHON = 'C:/Users/yuyou/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';

function parseArgs(argv) {
  const args = {
    excel: DEFAULT_EXCEL,
    engine: DEFAULT_ENGINE,
    python: DEFAULT_PYTHON,
    outDir: path.join(process.cwd(), 'outputs'),
    scenario: 'A',
    hasThreeView: false,
    project: '',
    projectName: '',
    today: '',
    plannedBufferDays: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--excel') args.excel = next, i++;
    else if (key === '--engine') args.engine = next, i++;
    else if (key === '--python') args.python = next, i++;
    else if (key === '--out') args.outDir = next, i++;
    else if (key === '--project') args.project = String(next || '').trim(), i++;
    else if (key === '--project-name') args.projectName = String(next || '').trim(), i++;
    else if (key === '--today') args.today = next, i++;
    else if (key === '--scenario') args.scenario = String(next || 'A').trim().toUpperCase(), i++;
    else if (key === '--has-three-view') args.hasThreeView = !['false', '0', 'no'].includes(String(next || '').toLowerCase()), i++;
    else if (key === '--planned-buffer-days') args.plannedBufferDays = Number(next || 0), i++;
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!Number.isFinite(args.plannedBufferDays) || args.plannedBufferDays < 0) {
    throw new Error('--planned-buffer-days must be a non-negative number');
  }
  return args;
}

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function runExcelExtractor(args) {
  const helper = path.join(__dirname, 'extract_project_excel.py');
  const res = spawnSync(args.python, [helper, args.excel], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Excel extraction failed:\n${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout);
}

function exportChineseWorkbook(args, jsonFile, xlsxFile) {
  const helper = path.join(__dirname, 'export_chinese_excel.py');
  const res = spawnSync(args.python, [helper, jsonFile, xlsxFile], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Chinese Excel export failed:\n${res.stderr || res.stdout}`);
  }
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function text(v) {
  if (isBlank(v)) return '';
  return String(v).trim();
}

function dateText(v) {
  const s = text(v);
  if (!s) return '';
  const match = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

function idText(v) {
  const s = text(v);
  if (!s) return '';
  return s.replace(/\.0$/, '');
}

function toBool(v) {
  const s = text(v).toLowerCase();
  return v === true || v === 1 || s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === '是' || s === '需要' || s === '有';
}

function hasValue(v) {
  return !isBlank(v);
}

function routeToScenario(v, fallback) {
  const s = text(v).toUpperCase();
  if (!s) return fallback;
  if (s.includes('手板') || s === 'B' || s.includes('路线B')) return 'B';
  if (s.includes('红蜡') || s === 'A' || s.includes('路线A')) return 'A';
  return fallback;
}

function normalizeProjects(rawProjects, defaults) {
  const byId = new Map();
  const duplicates = [];
  for (const r of rawProjects) {
    const projectId = idText(r['项目编号'] ?? r.projectId);
    const projectName = text(r['项目名称'] ?? r.projectName ?? r['项目管理系统（统一）']);
    const projectStartDate = dateText(r['启动日期'] ?? r.projectStartDate ?? r.kickoffDate);
    const plannedLaunchDate = dateText(r['预估出货日期'] ?? r.plannedLaunchDate);
    if (!projectId || !projectName || !plannedLaunchDate) continue;
    const routeRaw = r['红蜡路线or手板路线'] ?? r['路线'] ?? r['route'] ?? r.scenario;
    const threeViewRaw = r['是否需要三视图'] ?? r['是否有三视图'] ?? r['hasThreeView'];
    const scenario = routeToScenario(routeRaw, defaults.scenario);
    const hasThreeView = hasValue(threeViewRaw) ? toBool(threeViewRaw) : defaults.hasThreeView;
    const project = {
      projectId,
      projectName,
      owner: text(r['项目管理']),
      artist: text(r['产品美术']),
      team: text(r['所属团队']),
      status: text(r['当前阶段']),
      level: text(r['项目等级']),
      productType: text(r['产品类型']),
      spec: text(r['规格']),
      projectStartDate,
      plannedLaunchDate,
      route: text(routeRaw),
      scenario,
      hasThreeView,
      baselineVersion: 'excel-v5',
      assumptions: [
        text(routeRaw) ? '' : `scenario默认${defaults.scenario}`,
        hasValue(threeViewRaw) ? '' : `hasThreeView默认${defaults.hasThreeView}`,
      ].filter(Boolean),
    };
    if (byId.has(projectId)) duplicates.push(projectId);
    else byId.set(projectId, project);
  }
  return { projects: [...byId.values()], duplicateProjectIds: [...new Set(duplicates)] };
}

function normalizeActuals(rawActuals, projects, taskNameToId, taskIdToName = new Map()) {
  const projectIds = new Set(projects.map(p => p.projectId));
  const projectIdByName = new Map(projects.map(p => [p.projectName, p.projectId]));
  const out = [];
  const unmatched = [];
  const nameMatched = [];
  for (const r of rawActuals) {
    const projectName = text(r['项目名称'] ?? r.projectName);
    const recordKey = text(r.recordKey);
    const keyMatch = recordKey.match(/-(\d+)$/);
    const recordProjectId = keyMatch ? recordKey.slice(0, -keyMatch[0].length) : '';
    const explicitProjectId = idText(r.projectId ?? r.systemProjectId ?? r['项目ID'] ?? r['系统项目ID']);
    let projectId = '';
    if (recordProjectId && projectIds.has(recordProjectId)) projectId = recordProjectId;
    else if (explicitProjectId && projectIds.has(explicitProjectId)) projectId = explicitProjectId;
    else if (projectIdByName.has(projectName)) {
      projectId = projectIdByName.get(projectName);
      nameMatched.push({ projectName, taskName: text(r.taskName), recordKey });
    }
    const rawTaskName = text(r.taskName ?? r['任务名称']);
    const explicitTaskId = optionalNumber(r.taskId ?? r.taskNo ?? r['任务编号'] ?? r['任务ID']);
    let taskId = Number.NaN;
    if (Number.isFinite(explicitTaskId)) taskId = explicitTaskId;
    else if (keyMatch) taskId = Number(keyMatch[1]);
    if (!Number.isFinite(taskId)) taskId = taskNameToId.get(rawTaskName);
    const taskName = rawTaskName || taskIdToName.get(taskId) || '';
    if (!projectId || !Number.isFinite(taskId)) {
      if (projectName || rawTaskName || recordKey) unmatched.push({ projectName, taskName: rawTaskName, recordKey });
      continue;
    }
    out.push({
      projectId,
      projectName,
      taskId,
      taskName,
      taskStatus: text(r.taskStatus),
      actualStartDate: dateText(r['实际开始日期'] ?? r.actualStartDate),
      actualFinishDate: dateText(r['实际完成日期'] ?? r.actualFinishDate),
      expectedFinishDate: dateText(r['推进中任务预期完成时间'] ?? r.expectedFinishDate),
      remainingDays: optionalNumber(r.remainingDays),
      updatedAt: dateTimeText(r.updatedAt ?? r.rowUpdatedAt ?? r['更新时间'] ?? r['更新日期']),
      createdAt: dateTimeText(r.createdAt ?? r['创建时间'] ?? r['创建日期']),
      recordKey,
    });
  }
  return { actuals: out, unmatchedActuals: unmatched, nameMatchedActuals: nameMatched };
}

function optionalNumber(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function dateTimeText(v) {
  const s = text(v);
  if (!s) return '';
  const date = new Date(s);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  const d = dateText(s);
  return d ? `${d}T00:00:00.000Z` : '';
}

function latestActualMap(rows) {
  const grouped = new Map();
  const duplicates = [];
  for (const row of rows) {
    const id = Number(row.taskId);
    const group = grouped.get(id) || [];
    if (group.length) duplicates.push(id);
    group.push(row);
    grouped.set(id, group);
  }
  const byTask = new Map();
  for (const [id, taskRows] of grouped) {
    byTask.set(id, mergeActualRows(taskRows));
  }
  return { actualById: byTask, duplicateTaskIds: [...new Set(duplicates)] };
}

function mergeActualRows(rows) {
  const ordered = [...rows].sort(compareActual);
  const latest = ordered[ordered.length - 1] || {};
  const latestNonEmpty = field => {
    for (let i = ordered.length - 1; i >= 0; i--) {
      const value = ordered[i][field];
      if (!isBlank(value)) return value;
    }
    return '';
  };
  const latestFiniteNumber = field => {
    for (let i = ordered.length - 1; i >= 0; i--) {
      const value = ordered[i][field];
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  };
  return {
    ...latest,
    projectName: latestNonEmpty('projectName') || latest.projectName,
    taskName: latestNonEmpty('taskName') || latest.taskName,
    taskStatus: latestNonEmpty('taskStatus') || latest.taskStatus,
    actualStartDate: latestNonEmpty('actualStartDate'),
    actualFinishDate: latestNonEmpty('actualFinishDate'),
    expectedFinishDate: latestNonEmpty('expectedFinishDate'),
    remainingDays: latestFiniteNumber('remainingDays'),
    recordKey: latestNonEmpty('recordKey') || latest.recordKey,
  };
}

function compareActual(a, b) {
  const au = a.updatedAt || a.createdAt || '';
  const bu = b.updatedAt || b.createdAt || '';
  if (au !== bu) return au > bu ? 1 : -1;
  const af = a.actualFinishDate || '';
  const bf = b.actualFinishDate || '';
  if (af !== bf) return af > bf ? 1 : -1;
  const as = a.actualStartDate || '';
  const bs = b.actualStartDate || '';
  if (as !== bs) return as > bs ? 1 : -1;
  return 0;
}

function cmpDate(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function makeDateHelpers(engine) {
  function signedDays(a, b) {
    if (!a || !b || a === b) return 0;
    return cmpDate(a, b) < 0 ? engine.scheduleDaysBetween(a, b) : -engine.scheduleDaysBetween(b, a);
  }
  function addDays(dateStr, days) {
    return engine.fmt(engine.addScheduleDays(engine.parseDate(dateStr), Number(days || 0)));
  }
  function subDays(dateStr, days) {
    return engine.fmt(engine.subScheduleDays(engine.parseDate(dateStr), Number(days || 0)));
  }
  function maxDate(...dates) {
    return dates.filter(Boolean).sort().at(-1) || '';
  }
  function finishFromStart(startDate, days) {
    return addDays(startDate, Number(days || 0));
  }
  function nextScheduleDate(dateStr) {
    let d = engine.parseDate(dateStr);
    if (!d) throw new Error(`Invalid plannedLaunchDate: ${dateStr}`);
    while (engine.isHoliday(d)) d = engine.addScheduleDays(d, 1);
    return engine.fmt(d);
  }
  return { signedDays, addDays, subDays, maxDate, finishFromStart, nextScheduleDate };
}

function taskMap(result) {
  return new Map(result.tasks.map(t => [Number(t.id), t]));
}

function detailPageAnchorMap(anchorDate, helpers) {
  return {
    30: { finish: anchorDate },
    20: { finish: helpers.subDays(anchorDate, 14) },
    29: { finish: helpers.subDays(anchorDate, 1) },
  };
}

function applyDetailPageSchedule(schedule, anchorDate, helpers) {
  return {
    ...schedule,
    tasks: schedule.tasks.map(task => Number(task.id) === 31
      ? {
          ...task,
          days: 14,
          startDate: helpers.subDays(anchorDate, 14),
          finishDate: anchorDate,
          startAfter: [{ id: 20, lagDays: 0 }],
          finishAfter: [{ id: 29, lagDays: 1 }],
        }
      : task),
  };
}

function applyDetailPageTaskRule(tasks) {
  return tasks.map(task => Number(task.id) === 31
    ? {
        ...task,
        days: 14,
        startAfter: [{ id: 20, lagDays: 0 }],
        finishAfter: [{ id: 29, lagDays: 1 }],
      }
    : task);
}

function buildProjectAnalysisTasks(engine, params) {
  return applyDetailPageTaskRule(engine.buildTasks(params));
}

function applyVirtualProjectAnalysisRules(result, engine) {
  const tasks = (result.tasks || []).map(task => ({ ...task }));
  const byId = new Map(tasks.map(task => [Number(task.id), task]));
  const detail = byId.get(31);
  const render = byId.get(20);
  const photo = byId.get(29);
  if (detail && render?.finishDate && photo?.finishDate) {
    const startDate = render.finishDate;
    const durationFinish = engine.fmt(engine.addScheduleDays(engine.parseDate(startDate), 14));
    const photoGateFinish = engine.fmt(engine.addScheduleDays(engine.parseDate(photo.finishDate), 1));
    detail.days = 14;
    detail.startDate = startDate;
    detail.finishDate = [durationFinish, photoGateFinish].filter(Boolean).sort().at(-1) || '';
    detail.startAfter = [{ id: 20, lagDays: 0 }];
    detail.finishAfter = [{ id: 29, lagDays: 1 }];
  }

  const productionMilestone = [byId.get(30)?.finishDate, byId.get(31)?.finishDate]
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    ...result,
    productionMilestone: productionMilestone || result.productionMilestone,
    tasks: tasks.sort((a, b) => Number(a.id) - Number(b.id)),
    calculationMode: 'project-analysis-v5-virtual',
  };
}

function computeVirtualSchedule(engine, params, taskId, dateType, date) {
  const id = Number(taskId);
  if (!Number.isFinite(id)) throw new Error(`Invalid taskId: ${taskId}`);
  if (dateType !== 'start' && dateType !== 'finish') throw new Error(`Invalid dateType: ${dateType}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error(`Invalid date: ${date}`);
  const input = {};
  input[id] = dateType === 'start' ? { start: date, finish: null } : { start: null, finish: date };
  return applyVirtualProjectAnalysisRules(engine.compute(input, params), engine);
}

function createPlannedScheduleFromProjectStart(engine, params, projectStartDate, helpers) {
  const tasks = applyDetailPageTaskRule(engine.buildTasks(params));
  const byId = new Map(tasks.map(task => [Number(task.id), task]));
  const dates = new Map();

  for (const task of topologicalSortTasks(tasks)) {
    const id = Number(task.id);
    let start = id === 1 ? projectStartDate : '';

    for (const dep of task.startAfter || []) {
      const depDate = dates.get(Number(dep.id));
      if (depDate?.finishDate) {
        start = helpers.maxDate(start, helpers.addDays(depDate.finishDate, dep.lagDays || 0));
      }
    }

    if (!start) start = projectStartDate;

    let finish = helpers.finishFromStart(start, task.days);
    for (const dep of task.finishAfter || []) {
      const depDate = dates.get(Number(dep.id));
      if (depDate?.finishDate) {
        finish = helpers.maxDate(finish, helpers.addDays(depDate.finishDate, dep.lagDays || 0));
      }
    }

    dates.set(id, { startDate: start, finishDate: finish });
  }

  const resultTasks = tasks
    .map(task => ({
      ...byId.get(Number(task.id)),
      startDate: dates.get(Number(task.id)).startDate,
      finishDate: dates.get(Number(task.id)).finishDate,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));

  return {
    params,
    productionMilestone: helpers.maxDate(
      dates.get(30)?.finishDate,
      dates.get(31)?.finishDate
    ),
    plannedProjectStartDate: projectStartDate,
    plannedTotalScheduleDays: helpers.signedDays(
      projectStartDate,
      helpers.maxDate(dates.get(30)?.finishDate, dates.get(31)?.finishDate)
    ),
    plannedReferenceStartDate: projectStartDate,
    plannedReferenceProductionMilestone: helpers.maxDate(
      dates.get(30)?.finishDate,
      dates.get(31)?.finishDate
    ),
    tasks: resultTasks,
  };
}

function createPlannedScheduleForLaunch(engine, params, plannedLaunchDate, referenceStartDate, helpers) {
  const reference = createPlannedScheduleFromProjectStart(engine, params, referenceStartDate, helpers);
  const totalScheduleDays = helpers.signedDays(referenceStartDate, reference.productionMilestone);
  let plannedProjectStartDate = helpers.subDays(plannedLaunchDate, totalScheduleDays);
  let planned = null;

  for (let i = 0; i < 20; i += 1) {
    planned = createPlannedScheduleFromProjectStart(engine, params, plannedProjectStartDate, helpers);
    const diff = helpers.signedDays(planned.productionMilestone, plannedLaunchDate);
    if (diff === 0) break;
    plannedProjectStartDate = diff > 0
      ? helpers.addDays(plannedProjectStartDate, diff)
      : helpers.subDays(plannedProjectStartDate, -diff);
  }

  return {
    ...planned,
    plannedProjectStartDate,
    plannedTotalScheduleDays: totalScheduleDays,
    plannedReferenceStartDate: referenceStartDate,
    plannedReferenceProductionMilestone: reference.productionMilestone,
  };
}

const EARLY_PLANNED_TASK_IDS = new Set([13, 16, 19]);
const DISPLAY_ONLY_SIDE_TASK_IDS = new Set([8, 9]);

function isDisplayOnlySideTaskId(taskId) {
  return DISPLAY_ONLY_SIDE_TASK_IDS.has(Number(taskId));
}

function applyEarlyPlannedTasks(schedule, helpers) {
  const tasks = schedule.tasks.map(task => ({ ...task }));
  const byId = new Map(tasks.map(task => [Number(task.id), task]));

  for (const task of topologicalSortTasks(tasks)) {
    const id = Number(task.id);
    if (!EARLY_PLANNED_TASK_IDS.has(id)) continue;

    let start = '';
    for (const dep of task.startAfter || []) {
      const depTask = byId.get(Number(dep.id));
      if (depTask?.finishDate) {
        start = helpers.maxDate(start, helpers.addDays(depTask.finishDate, dep.lagDays || 0));
      }
    }
    if (!start) start = task.startDate;

    let finish = helpers.finishFromStart(start, task.days);
    for (const dep of task.finishAfter || []) {
      const depTask = byId.get(Number(dep.id));
      if (depTask?.finishDate) {
        finish = helpers.maxDate(finish, helpers.addDays(depTask.finishDate, dep.lagDays || 0));
      }
    }

    task.startDate = start;
    task.finishDate = finish;
  }

  return { ...schedule, tasks };
}

function topologicalSortTasks(tasks) {
  const byId = new Map(tasks.map(t => [Number(t.id), t]));
  const indegree = new Map(tasks.map(t => [Number(t.id), 0]));
  const edges = new Map(tasks.map(t => [Number(t.id), []]));
  const order = new Map(tasks.map((t, i) => [Number(t.id), i]));
  for (const t of tasks) {
    const seen = new Set();
    for (const dep of [...(t.startAfter || []), ...(t.finishAfter || [])]) {
      const depId = Number(dep.id);
      if (!byId.has(depId) || seen.has(depId)) continue;
      seen.add(depId);
      indegree.set(Number(t.id), (indegree.get(Number(t.id)) || 0) + 1);
      edges.get(depId).push(Number(t.id));
    }
  }
  const queue = [...tasks.map(t => Number(t.id)).filter(id => (indegree.get(id) || 0) === 0)]
    .sort((a, b) => (order.get(a) || 0) - (order.get(b) || 0));
  const out = [];
  while (queue.length) {
    const id = queue.shift();
    out.push(byId.get(id));
    for (const child of edges.get(id) || []) {
      indegree.set(child, (indegree.get(child) || 0) - 1);
      if ((indegree.get(child) || 0) === 0) {
        queue.push(child);
        queue.sort((a, b) => (order.get(a) || 0) - (order.get(b) || 0));
      }
    }
  }
  if (out.length !== tasks.length) throw new Error('任务依赖存在环，无法排序。');
  return out;
}

function launchPathChecker(tasks) {
  const downstream = new Map(tasks.map(t => [Number(t.id), new Set()]));
  for (const t of tasks) {
    for (const dep of [...(t.startAfter || []), ...(t.finishAfter || [])]) {
      const depId = Number(dep.id);
      if (downstream.has(depId)) downstream.get(depId).add(Number(t.id));
    }
  }
  const memo = new Map();
  function reaches(id, seen = new Set()) {
    id = Number(id);
    if (id === 30 || id === 31) return true;
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return false;
    seen.add(id);
    for (const child of downstream.get(id) || []) {
      if (reaches(child, seen)) {
        memo.set(id, true);
        return true;
      }
    }
    memo.set(id, false);
    return false;
  }
  return reaches;
}

function inferCompletionFromDownstream(tasks, actualById) {
  const downstream = new Map(tasks.map(t => [Number(t.id), new Set()]));
  for (const t of tasks) {
    for (const dep of [...(t.startAfter || []), ...(t.finishAfter || [])]) {
      const depId = Number(dep.id);
      if (downstream.has(depId)) downstream.get(depId).add(Number(t.id));
    }
  }

  const memo = new Map();
  function collect(id, seen = new Set()) {
    id = Number(id);
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return [];
    seen.add(id);

    const hits = [];
    for (const childId of downstream.get(id) || []) {
      const childActual = actualById.get(childId);
      if (childActual?.actualFinishDate) {
        hits.push({ taskId: childId, date: childActual.actualFinishDate });
      }
      hits.push(...collect(childId, seen));
    }

    const deduped = [...new Map(hits.map(hit => [`${hit.taskId}-${hit.date}`, hit])).values()]
      .sort((a, b) => a.date === b.date ? a.taskId - b.taskId : cmpDate(a.date, b.date));
    memo.set(id, deduped);
    return deduped;
  }

  const inferred = new Map();
  for (const t of tasks) {
    const id = Number(t.id);
    if (actualById.get(id)?.actualFinishDate) continue;
    const hits = collect(id);
    if ((id === 8 || id === 9) && actualById.get(10)?.actualFinishDate) {
      hits.push({ taskId: 10, date: actualById.get(10).actualFinishDate });
    }
    if ((id === 8 || id === 9) && !actualById.get(10)?.actualFinishDate) {
      const inferredTask10 = collect(10)[0];
      if (inferredTask10?.date) hits.push({ taskId: 10, date: inferredTask10.date });
    }
    if (hits.length) {
      const sortedHits = [...new Map(hits.map(hit => [`${hit.taskId}-${hit.date}`, hit])).values()]
        .sort((a, b) => a.date === b.date ? a.taskId - b.taskId : cmpDate(a.date, b.date));
      inferred.set(id, {
        inferredCompleted: true,
        inferredCompletionDate: sortedHits[0].date,
        inferredCompletionFromTaskIds: sortedHits.slice(0, 5).map(hit => `#${hit.taskId}`).join(','),
      });
    }
  }
  return inferred;
}

function ddlBasis(task, actualById, inferredById = new Map()) {
  const predecessors = [...(task.startAfter || []), ...(task.finishAfter || [])].map(d => Number(d.id));
  const unique = [...new Set(predecessors)];
  const hasCompletion = id => actualById.get(id)?.actualFinishDate || inferredById.get(id)?.inferredCompleted;
  const missing = unique.filter(id => !hasCompletion(id));
  let basis = 'no_predecessor';
  if (unique.length && missing.length === 0) {
    basis = unique.every(id => actualById.get(id)?.actualFinishDate) ? 'actual_only' : 'actual_or_inferred';
  }
  else if (unique.length && missing.length < unique.length) basis = 'actual_plus_baseline';
  else if (unique.length) basis = 'baseline_only';
  return { basis, missingPredecessorIds: missing.map(id => `#${id}`).join(',') };
}

function actualPredecessorStatus(task, actualById, inferredById = new Map()) {
  const predecessorIds = [...new Set([...(task.startAfter || []), ...(task.finishAfter || [])].map(d => Number(d.id)))];
  const missing = predecessorIds.filter(id => !actualById.get(id)?.actualFinishDate && !inferredById.get(id)?.inferredCompleted);
  return {
    predecessorIds,
    missingActualPredecessorIds: missing,
    allActualPredecessorsDone: missing.length === 0,
  };
}

function calculateFromPlannedWithActuals(tasks, plannedById, actualById, inferredById, helpers, today) {
  const calc = new Map();
  for (const t of topologicalSortTasks(tasks)) {
    const id = Number(t.id);
    const p = plannedById.get(id);
    const a = actualById.get(id);
    const inferred = inferredById.get(id);
    const predecessorIds = [...new Set([...(t.startAfter || []), ...(t.finishAfter || [])].map(d => Number(d.id)))];
    const allPredecessorsDone = predecessorIds.every(depId => !!actualById.get(depId)?.actualFinishDate || !!inferredById.get(depId)?.inferredCompleted);
    const shouldAutoStart = !a?.actualFinishDate
      && !a?.actualStartDate
      && !inferred?.inferredCompleted
      && allPredecessorsDone
      && (predecessorIds.length > 0 || cmpDate(today, p.startDate) >= 0);

    let start = p.startDate;
    for (const dep of t.startAfter || []) {
      const depCalc = calc.get(Number(dep.id))?.forecastFinish;
      if (depCalc) start = helpers.maxDate(start, helpers.addDays(depCalc, dep.lagDays || 0));
    }
    if (shouldAutoStart && !(t.startAfter || []).length) {
      const predecessorFinish = predecessorIds
        .map(depId => calc.get(depId)?.forecastFinish)
        .filter(Boolean)
        .sort()
        .at(-1);
      if (predecessorFinish) start = helpers.maxDate(start, predecessorFinish);
    }
    if (!start) start = p.startDate;
    if (a?.actualStartDate && !a?.actualFinishDate) {
      start = helpers.maxDate(start, a.actualStartDate);
    }
    if (shouldAutoStart) {
      start = helpers.maxDate(start, today);
    }
    let finish = helpers.finishFromStart(start, t.days);
    for (const dep of t.finishAfter || []) {
      const depCalc = calc.get(Number(dep.id))?.forecastFinish;
      if (depCalc) finish = helpers.maxDate(finish, helpers.addDays(depCalc, dep.lagDays || 0));
    }
    if (a?.actualFinishDate) {
      if (a.actualStartDate) start = a.actualStartDate;
      finish = a.actualFinishDate;
    }
    if (!a?.actualFinishDate && inferred?.inferredCompleted) {
      finish = inferred.inferredCompletionDate;
      if (cmpDate(start, finish) > 0) start = cmpDate(p.startDate, finish) <= 0 ? p.startDate : finish;
    }
    if (!a?.actualFinishDate && a?.actualStartDate) {
      finish = helpers.maxDate(finish, today);
    }
    if (!a?.actualFinishDate && Number.isFinite(a?.remainingDays)) {
      finish = helpers.maxDate(finish, helpers.addDays(today, a.remainingDays));
    }
    if (!a?.actualFinishDate && a?.expectedFinishDate && cmpDate(a.expectedFinishDate, today) >= 0) {
      finish = helpers.maxDate(finish, a.expectedFinishDate);
    }
    if (!a?.actualFinishDate && !inferred?.inferredCompleted && cmpDate(finish, today) < 0) {
      if (!a?.actualStartDate && !Number.isFinite(a?.remainingDays)) {
        start = helpers.maxDate(start, today);
        finish = helpers.finishFromStart(start, t.days);
      } else {
        finish = today;
        if (cmpDate(start, finish) > 0) start = finish;
      }
    }
    const forecastStart = start;
    const forecastFinish = finish;
    const basis = a?.actualFinishDate
      ? 'actual_finish'
      : Number.isFinite(a?.remainingDays)
        ? 'remaining_days'
        : a?.actualStartDate
          ? 'actual_start_plus_duration'
          : inferred?.inferredCompleted
            ? 'downstream_inferred'
            : shouldAutoStart
              ? 'predecessors_done_auto_start'
              : 'baseline';
    let displayedStart = '';
    let displayedFinish = '';
    let displayedBasis = 'not_started';
    if (a?.actualFinishDate) {
      displayedStart = a.actualStartDate || '';
      displayedFinish = a.actualFinishDate;
      displayedBasis = 'actual_finish';
    } else if (a?.actualStartDate) {
      displayedStart = a.actualStartDate;
      displayedFinish = forecastFinish;
      displayedBasis = basis;
    } else if (inferred?.inferredCompleted) {
      displayedStart = '';
      displayedFinish = inferred.inferredCompletionDate;
      displayedBasis = 'downstream_inferred';
    }
    calc.set(id, {
      start: displayedStart,
      finish: displayedFinish,
      basis: displayedBasis,
      forecastStart,
      forecastFinish,
      forecastBasis: basis,
    });
  }
  applyDisplayOnlySideTaskDates(tasks, plannedById, actualById, inferredById, calc, helpers);
  return calc;
}

function applyDisplayOnlySideTaskDates(tasks, plannedById, actualById, inferredById, calc, helpers) {
  const projectStartDate = plannedById.get(1)?.startDate || '';
  const task10Actual = actualById.get(10) || {};
  const task10Inferred = inferredById.get(10) || {};
  const task10Calc = calc.get(10) || {};
  const task10Finish = task10Actual.actualFinishDate
    || task10Inferred.inferredCompletionDate
    || task10Calc.forecastFinish
    || '';
  const task10Basis = task10Actual.actualFinishDate
    ? 'display_only_follow_task_10_actual'
    : task10Inferred.inferredCompleted
      ? 'display_only_follow_task_10_inferred'
      : 'display_only_follow_task_10_calculated';

  if (!task10Finish) return;

  for (const task of tasks) {
    const id = Number(task.id);
    if (!isDisplayOnlySideTaskId(id)) continue;

    const actual = actualById.get(id) || {};
    const ownActualFinish = actual.actualFinishDate || '';
    const finish = ownActualFinish || task10Finish;
    const calculatedStart = helpers.maxDate(projectStartDate, helpers.subDays(finish, Number(task.days || 0)));
    const basis = ownActualFinish ? 'actual_finish' : task10Basis;

    calc.set(id, {
      start: ownActualFinish ? actual.actualStartDate || calculatedStart : '',
      finish: ownActualFinish ? ownActualFinish : '',
      basis,
      forecastStart: calculatedStart,
      forecastFinish: finish,
      forecastBasis: basis,
    });
  }
}

function impactStatus({ actualFinishDate, inferredCompleted, planDeltaDays, deadlineRiskDays, currentDeadlineRiskDays, sideTask }) {
  if (sideTask) {
    if (actualFinishDate) {
      if (planDeltaDays > 0) return '旁路任务已完成-晚于计划';
      return '旁路任务已完成';
    }
    if (inferredCompleted) {
      if (planDeltaDays > 0 || deadlineRiskDays > 0 || currentDeadlineRiskDays > 0) return '旁路任务推断完成-晚于计划';
      return '旁路任务推断完成';
    }
    if (planDeltaDays > 0 || deadlineRiskDays > 0 || currentDeadlineRiskDays > 0) return '旁路任务落后';
    return '旁路任务正常';
  }
  if (actualFinishDate) {
    if (deadlineRiskDays > 0) return '已完成-影响上线';
    if (planDeltaDays > 0) return '已完成-晚于计划';
    return '已完成';
  }
  if (inferredCompleted) {
    if (deadlineRiskDays > 0) return '已完成(推断)-影响上线';
    if (planDeltaDays > 0) return '已完成(推断)-晚于计划';
    return '已完成(由后置任务推断)';
  }
  if (planDeltaDays <= 0) return '正常';
  if (deadlineRiskDays <= 0) return '落后计划未影响上线';
  if (currentDeadlineRiskDays > 0) return '继续影响当前上线';
  return '影响上线';
}

function riskLevel({ actualFinishDate, inferredCompleted, taskStatus, planDeltaDays, deadlineRiskDays, currentDeadlineRiskDays, floatDays, isLaunchPath, sideTask }) {
  if (actualFinishDate) return '\u5df2\u5b8c\u6210';
  if (inferredCompleted) return '\u5df2\u5b8c\u6210(\u63a8\u65ad)';
  if (sideTask) {
    if (planDeltaDays > 0 || deadlineRiskDays > 0 || currentDeadlineRiskDays > 0) return '\u63d0\u9192';
    return '\u6b63\u5e38';
  }
  if (isLaunchPath && (deadlineRiskDays > 0 || currentDeadlineRiskDays > 0)) return '\u4e25\u91cd';
  if (taskStatus === '\u903e\u671f\u672a\u5b8c\u6210') return '\u9ad8';
  if (floatDays < 0) return '\u4e25\u91cd';
  if (floatDays === 0) return '\u9ad8';
  if (planDeltaDays > 0) return '\u4e2d';
  return '\u4f4e';
}

function calculateProject(project, projectActualRows, engine, helpers, today, options = {}) {
  if (!project.plannedLaunchDate) {
    throw new Error(`项目 ${project.projectId} ${project.projectName} 缺少计划出货日期，无法生成 planned/latest 日期`);
  }
  if (!project.projectStartDate) {
    throw new Error(`项目 ${project.projectId} ${project.projectName} 缺少启动日期，无法生成 planned 日期`);
  }
  const params = { scenario: project.scenario, hasThreeView: project.hasThreeView };
  const effectiveProjectStartDate = helpers.nextScheduleDate(project.projectStartDate);
  const effectiveLaunchDate = helpers.nextScheduleDate(project.plannedLaunchDate);
  const plannedBufferDays = Number(options.plannedBufferDays || 0);
  const planned = createPlannedScheduleFromProjectStart(engine, params, effectiveProjectStartDate, helpers);
  const plannedById = taskMap(planned);
  const originLatest = applyDetailPageSchedule(
    engine.fromTasks(detailPageAnchorMap(effectiveLaunchDate, helpers), params),
    effectiveLaunchDate,
    helpers
  );
  const originLatestById = taskMap(originLatest);
  const { actualById, duplicateTaskIds } = latestActualMap(projectActualRows);
  const calculationTasks = applyDetailPageTaskRule(planned.tasks);
  const inferredById = inferCompletionFromDownstream(calculationTasks, actualById);
  const calc = calculateFromPlannedWithActuals(calculationTasks, plannedById, actualById, inferredById, helpers, today);
  const currentProjectedLaunchDate = helpers.maxDate(effectiveLaunchDate, calc.get(30)?.forecastFinish, calc.get(31)?.forecastFinish);
  const currentLatest = applyDetailPageSchedule(
    engine.fromTasks(detailPageAnchorMap(currentProjectedLaunchDate, helpers), params),
    currentProjectedLaunchDate,
    helpers
  );
  const currentLatestById = taskMap(currentLatest);
  const reachesLaunch = launchPathChecker(calculationTasks);

  const rows = calculationTasks.map(t => {
    const id = Number(t.id);
    const p = plannedById.get(id);
    const o = originLatestById.get(id);
    const l = currentLatestById.get(id);
    const c = calc.get(id);
    const a = actualById.get(id) || {};
    const inferred = inferredById.get(id) || {};
    const inferredCompleted = inferred.inferredCompleted === true;
    const measuredFinish = c.forecastFinish || '';
    const launchDeltaDays = helpers.signedDays(effectiveLaunchDate, currentProjectedLaunchDate);
    const sideTask = !!t.sideTask || isDisplayOnlySideTaskId(id);
    const isLaunchPath = !sideTask && reachesLaunch(id);
    const basis = ddlBasis(t, actualById, inferredById);
    const predStatus = actualPredecessorStatus(t, actualById, inferredById);
    const actualStarted = !!a.actualStartDate && !a.actualFinishDate;
    const autoStarted = !a.actualFinishDate
      && !a.actualStartDate
      && !inferredCompleted
      && predStatus.allActualPredecessorsDone
      && predStatus.predecessorIds.length > 0;
    const forecastFinishForStatus = measuredFinish || c.forecastFinish || '';
    const floatDays = helpers.signedDays(p.finishDate, o.finishDate);
    const planDeltaDays = helpers.signedDays(p.finishDate, c.forecastFinish);
    const deadlineRiskDays = helpers.signedDays(o.finishDate, c.forecastFinish);
    const currentDeadlineRiskDays = helpers.signedDays(l.finishDate, c.forecastFinish);
    const warningWindowDays = helpers.signedDays(c.forecastFinish, l.finishDate);
    const overdueUnfinished = !a.actualFinishDate
      && !a.actualStartDate
      && !inferredCompleted
      && cmpDate(p.finishDate, today) < 0
      && predStatus.missingActualPredecessorIds.length === 0;
    const taskStatus = a.actualFinishDate
      ? '已完成'
      : inferredCompleted
        ? '已完成(由后置任务推断)'
        : actualStarted
          ? '进行中'
          : overdueUnfinished
            ? '逾期未完成'
            : autoStarted
            ? '当前应开始'
            : predStatus.missingActualPredecessorIds.length
            ? '等待前置实际完成'
            : '未开始';
    const rowImpactStatus = impactStatus({
      actualFinishDate: a.actualFinishDate,
      inferredCompleted,
      planDeltaDays,
      deadlineRiskDays,
      currentDeadlineRiskDays,
      sideTask,
    });
    return {
      recordKey: `${project.projectId}-${id}`,
      projectId: project.projectId,
      projectName: project.projectName,
      projectStatus: project.status,
      baselineVersion: project.baselineVersion,
      scenario: project.scenario,
      hasThreeView: project.hasThreeView,
      plannedLaunchDate: project.plannedLaunchDate,
      projectStartDate: project.projectStartDate,
      effectiveProjectStartDate,
      effectiveLaunchDate,
      plannedProjectStartDate: planned.plannedProjectStartDate,
      plannedProductionMilestone: planned.productionMilestone,
      plannedTotalScheduleDays: planned.plannedTotalScheduleDays,
      projectStartDeltaDays: helpers.signedDays(planned.plannedProjectStartDate, effectiveProjectStartDate),
      projectFeasibility: cmpDate(planned.productionMilestone, effectiveLaunchDate) > 0 ? 'planned_path_exceeds_launch' : 'planned_path_within_launch',
      plannedBufferDays,
      plannedScheduleBasis: 'project_start_forward',
      projectedLaunchDate: currentProjectedLaunchDate,
      taskId: id,
      taskName: t.name,
      legacyTaskId: t.legacyId,
      taskEnabled: true,
      sideTask,
      nonSchedulingTask: sideTask,
      displayOnlySideTask: sideTask,
      durationDays: t.days,
      startAfterRules: (t.startAfter || []).map(rule => `#${rule.id}`).join(','),
      finishAfterRules: (t.finishAfter || []).map(rule => `#${rule.id}+${rule.lagDays || 0}`).join(','),
      plannedStartDate: p.startDate,
      plannedFinishDate: p.finishDate,
      originalLatestStartDate: o.startDate,
      originalLatestFinishDate: o.finishDate,
      latestStartDate: o.startDate,
      latestFinishDate: o.finishDate,
      currentLatestStartDate: l.startDate,
      currentLatestFinishDate: l.finishDate,
      calculatedStartDate: c.forecastStart,
      calculatedFinishDate: c.forecastFinish,
      calculationBasis: c.basis,
      forecastStartDate: c.forecastStart,
      forecastFinishDate: c.forecastFinish,
      forecastBasis: c.forecastBasis,
      currentDdlDate: c.forecastFinish,
      actualStartDate: a.actualStartDate || '',
      actualFinishDate: a.actualFinishDate || '',
      expectedFinishDate: a.expectedFinishDate || '',
      inferredCompleted,
      inferredCompletionDate: inferred.inferredCompletionDate || '',
      inferredCompletionFromTaskIds: inferred.inferredCompletionFromTaskIds || '',
      remainingDays: a.remainingDays ?? '',
      taskStatus,
      actualStarted,
      autoStarted,
      missingActualPredecessorIds: predStatus.missingActualPredecessorIds.map(depId => `#${depId}`).join(','),
      floatDays,
      planDeltaDays,
      deadlineRiskDays,
      currentDeadlineRiskDays,
      warningWindowDays,
      launchDeltaDays,
      impactStatus: rowImpactStatus,
      riskLevel: riskLevel({
        actualFinishDate: a.actualFinishDate,
        inferredCompleted,
        taskStatus,
        planDeltaDays,
        deadlineRiskDays,
        currentDeadlineRiskDays,
        floatDays,
        isLaunchPath,
        sideTask,
      }),
      isBlockingLaunch: !sideTask
        && isLaunchPath
        && !a.actualFinishDate
        && !inferredCompleted
        && helpers.signedDays(o.finishDate, c.forecastFinish) > 0,
      isLaunchPath,
      missingPredecessorIds: basis.missingPredecessorIds,
      ddlBasis: basis.basis,
      calculationMode: 'v5_excel_planned_actuals',
      calculatedAt: today,
      note: [
        `planned=${p.startDate}~${p.finishDate}`,
        `latest=${o.startDate}~${o.finishDate}`,
        `currentLatest=${l.startDate}~${l.finishDate}`,
        `calculated=${c.forecastStart}~${forecastFinishForStatus}`,
        `forecast=${c.forecastStart}~${c.forecastFinish}`,
        project.assumptions.length ? `assumptions=${project.assumptions.join(';')}` : '',
        `actualProjectStart=${effectiveProjectStartDate}`,
        `plannedProjectStart=${planned.plannedProjectStartDate}`,
        `plannedTotalScheduleDays=${planned.plannedTotalScheduleDays}`,
        `plannedBufferDays=${plannedBufferDays}`,
      ].filter(Boolean).join(' | '),
    };
  });

  const futureRows = rows.filter(r => !r.actualFinishDate && !r.inferredCompleted);
  const schedulingFutureRows = futureRows.filter(r => !r.nonSchedulingTask);
  return {
    project: {
      ...project,
      effectiveProjectStartDate,
      effectiveLaunchDate,
      plannedProjectStartDate: planned.plannedProjectStartDate,
      plannedProductionMilestone: planned.productionMilestone,
      plannedTotalScheduleDays: planned.plannedTotalScheduleDays,
      projectStartDeltaDays: helpers.signedDays(planned.plannedProjectStartDate, effectiveProjectStartDate),
      plannedBufferDays,
      plannedScheduleBasis: 'project_start_forward',
      projectFeasibility: cmpDate(planned.productionMilestone, effectiveLaunchDate) > 0 ? 'planned_path_exceeds_launch' : 'planned_path_within_launch',
      projectedLaunchDate: currentProjectedLaunchDate,
      launchDeltaDays: helpers.signedDays(effectiveLaunchDate, currentProjectedLaunchDate),
      duplicateActualTaskIds: duplicateTaskIds,
      summary: {
        totalTasks: rows.length,
        unfinishedTasks: futureRows.length,
        inferredCompletedTasks: rows.filter(r => r.inferredCompleted).length,
        behindPlanTasks: schedulingFutureRows.filter(r => r.planDeltaDays > 0).length,
        blockingLaunchTasks: schedulingFutureRows.filter(r => r.isBlockingLaunch).length,
        noBufferTasks: schedulingFutureRows.filter(r => r.floatDays <= 0).length,
      },
    },
    rows,
    futureRows,
  };
}

function csvEscape(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file, rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map(c => csvEscape(row[c])).join(','));
  fs.writeFileSync(file, `\uFEFF${lines.join('\n')}`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  const today = args.today || shanghaiToday();
  const runtimeRequire = eval('require');
  const engine = runtimeRequire(args.engine);
  const helpers = makeDateHelpers(engine);
  const extracted = runExcelExtractor(args);
  const payload = analyzeExtracted(extracted, args, engine, helpers, today);

  fs.mkdirSync(args.outDir, { recursive: true });
  const jsonFile = path.join(args.outDir, 'project-task-estimates-v5.json');
  const csvFile = path.join(args.outDir, 'project-future-tasks-v5.csv');
  const xlsxFile = path.join(args.outDir, '项目后续任务测算-v5.xlsx');
  fs.writeFileSync(jsonFile, JSON.stringify(payload, null, 2), 'utf8');
  writeCsv(csvFile, payload.futureRows, [
    'projectId', 'projectName', 'projectStatus', 'plannedLaunchDate', 'projectedLaunchDate', 'launchDeltaDays',
    'taskId', 'taskName', 'durationDays', 'startAfterRules', 'finishAfterRules', 'taskStatus', 'autoStarted', 'missingActualPredecessorIds',
    'actualStartDate', 'actualFinishDate', 'inferredCompleted', 'inferredCompletionDate',
    'plannedStartDate', 'plannedFinishDate', 'forecastStartDate', 'forecastFinishDate',
    'originalLatestStartDate', 'originalLatestFinishDate', 'latestStartDate', 'latestFinishDate',
    'currentLatestStartDate', 'currentLatestFinishDate',
    'floatDays', 'planDeltaDays', 'deadlineRiskDays', 'currentDeadlineRiskDays', 'warningWindowDays',
    'impactStatus', 'riskLevel', 'isBlockingLaunch',
  ]);
  exportChineseWorkbook(args, jsonFile, xlsxFile);

  const summary = {
    generatedAt: today,
    projectCount: payload.projectCount,
    futureTaskCount: payload.futureTaskCount,
    blockingLaunchTasks: payload.futureRows.filter(r => !r.nonSchedulingTask && r.isBlockingLaunch).length,
    behindPlanTasks: payload.futureRows.filter(r => !r.nonSchedulingTask && r.planDeltaDays > 0).length,
    jsonFile,
    csvFile,
    xlsxFile,
    errors: payload.warnings.errors.length,
    unmatchedActualCount: payload.warnings.unmatchedActualCount,
  };
  console.log(JSON.stringify(summary, null, 2));
}

function analyzeExtracted(extracted, args, engine, helpers, today) {
  const taskNameToId = new Map((extracted.taskRules || []).map(r => [text(r.taskName), Number(r.taskId)]).filter(([name, id]) => name && Number.isFinite(id)));
  const taskIdToName = new Map((extracted.taskRules || []).map(r => [Number(r.taskId), text(r.taskName)]).filter(([id, name]) => Number.isFinite(id) && name));
  const { projects, duplicateProjectIds } = normalizeProjects(extracted.projects || [], args);
  const { actuals, unmatchedActuals, nameMatchedActuals } = normalizeActuals(extracted.actuals || [], projects, taskNameToId, taskIdToName);
  const filteredProjects = projects.filter(p => {
    if (args.project && p.projectId !== args.project) return false;
    if (args.projectName && !p.projectName.includes(args.projectName)) return false;
    return true;
  });
  const actualsByProject = new Map();
  for (const actual of actuals) {
    if (!actualsByProject.has(actual.projectId)) actualsByProject.set(actual.projectId, []);
    actualsByProject.get(actual.projectId).push(actual);
  }

  const results = [];
  const errors = [];
  for (const project of filteredProjects) {
    try {
      results.push(calculateProject(project, actualsByProject.get(project.projectId) || [], engine, helpers, today, {
        plannedBufferDays: args.plannedBufferDays,
      }));
    } catch (err) {
      errors.push({ projectId: project.projectId, projectName: project.projectName, error: err.message });
    }
  }

  const futureRows = results.flatMap(r => r.futureRows);
  return {
    generatedAt: today,
    sourceWorkbook: extracted.workbook,
    projectCount: results.length,
    futureTaskCount: futureRows.length,
    assumptions: {
      scenarioDefault: args.scenario,
      hasThreeViewDefault: args.hasThreeView,
      plannedBufferDays: args.plannedBufferDays,
      plannedScheduleBasis: 'project_start_forward',
      actualTaskMatching: 'projectId + taskId/taskNo/recordKey is sufficient; taskName is optional and can be filled from 任务规则v4',
    },
    warnings: {
      duplicateProjectIds,
      unmatchedActualCount: unmatchedActuals.length,
      unmatchedActualSamples: unmatchedActuals.slice(0, 20),
      nameMatchedActualCount: nameMatchedActuals.length,
      nameMatchedActualSamples: nameMatchedActuals.slice(0, 20),
      errors,
    },
    projects: results.map(r => r.project),
    rows: results.flatMap(r => r.rows),
    futureRows,
  };
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeExtracted,
  buildProjectAnalysisTasks,
  computeVirtualSchedule,
  makeDateHelpers,
  shanghaiToday,
  writeCsv,
};
