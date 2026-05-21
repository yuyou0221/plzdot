// ========== task-engine v4.0 contiguous IDs ==========
// Business rules:
// - Schedule days skip only configured holidays; ordinary Saturdays/Sundays are counted.
// - Spring Festival holiday = 13 days before + festival day + 14 days after = 28 days.
// - Missing holiday year is a hard error. No silent fallback.
// - startAfter constrains task start.
// - finishAfter constrains task finish only; it does not move task start backward or forward.
// - Canonical task IDs are now contiguous: #1-#31.
// - legacyId keeps the previous v3 task ID for migration/debugging.
// - New #30 uses Method A: start after #24, finish not before #24/#25+30/#26+30/#27+30/#28+14.
//   This is equivalent to previous v3 #30: start after old #25, finish not before old #25/#26+30/#27+30/#28+30/#29+14.

// -----------------------------------------------------------------------------
// Date helpers
// -----------------------------------------------------------------------------
function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    ));
  }

  if (typeof value !== "string") return null;

  var match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;

  var y = Number(match[1]);
  var m = Number(match[2]);
  var d = Number(match[3]);
  var date = new Date(Date.UTC(y, m - 1, d));

  // Strict validation. Prevent JS from silently normalizing 2026-02-31 to March.
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return date;
}

function requireDate(value, label) {
  var d = parseDate(value);
  if (!d) {
    throw new Error((label || "date") + " 不是有效日期：" + value);
  }
  return d;
}

function fmt(d) {
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}

function addD(d, n) {
  var r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function eq(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
}

function cmpDateString(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function maxDateString(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return cmpDateString(a, b) >= 0 ? a : b;
}

function minDateString(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return cmpDateString(a, b) <= 0 ? a : b;
}

// -----------------------------------------------------------------------------
// Holiday data
// -----------------------------------------------------------------------------
var holidayData = {
  _description: "中国法定节假日。春节使用规则：前13天+春节当天+后14天=28天。普通周六/周日不跳过。",
  _note: "每年的具体日期可能调整，以业务配置为准。缺少年份配置时直接报错，不使用最近年份兜底。",
  ranges: {
    "2024": {
      "元旦": ["2024-01-01", "2024-01-01"],
      "春节": { rule: "spring_festival", lunarDate: "2024-02-10", beforeDays: 13, afterDays: 14 },
      "清明": ["2024-04-04", "2024-04-06"],
      "劳动节": ["2024-05-01", "2024-05-05"],
      "端午": ["2024-06-08", "2024-06-10"],
      "中秋": ["2024-09-15", "2024-09-17"],
      "国庆": ["2024-10-01", "2024-10-07"]
    },
    "2025": {
      "元旦": ["2025-01-01", "2025-01-03"],
      "春节": { rule: "spring_festival", lunarDate: "2025-01-29", beforeDays: 13, afterDays: 14 },
      "清明": ["2025-04-04", "2025-04-06"],
      "劳动节": ["2025-05-01", "2025-05-05"],
      "端午": ["2025-05-31", "2025-06-02"],
      "中秋国庆": ["2025-10-01", "2025-10-08"]
    },
    "2026": {
      "元旦": ["2026-01-01", "2026-01-03"],
      "春节": { rule: "spring_festival", lunarDate: "2026-02-06", beforeDays: 13, afterDays: 14 },
      "清明": ["2026-04-04", "2026-04-06"],
      "劳动节": ["2026-05-01", "2026-05-05"],
      "端午": ["2026-06-19", "2026-06-21"],
      "中秋国庆": ["2026-10-01", "2026-10-08"]
    },
    "2027": {
      "元旦": ["2027-01-01", "2027-01-03"],
      "春节": { rule: "spring_festival", lunarDate: "2027-01-28", beforeDays: 13, afterDays: 14 },
      "清明": ["2027-04-04", "2027-04-06"],
      "劳动节": ["2027-05-01", "2027-05-05"],
      "端午": ["2027-06-09", "2027-06-11"],
      "国庆中秋": ["2027-10-01", "2027-10-08"]
    },
    "2028": {
      "元旦": ["2028-01-01", "2028-01-03"],
      "春节": { rule: "spring_festival", lunarDate: "2028-02-17", beforeDays: 13, afterDays: 14 },
      "清明": ["2028-04-04", "2028-04-06"],
      "劳动节": ["2028-05-01", "2028-05-05"],
      "端午": ["2028-05-28", "2028-05-30"],
      "国庆中秋": ["2028-10-01", "2028-10-08"]
    }
  }
};

var holidayCache = {};

function buildHolidaySet(year) {
  var yearKey = String(year);
  var yr = holidayData.ranges[yearKey];

  if (!yr) {
    throw new Error("缺少 " + yearKey + " 年节假日配置，无法继续排期。");
  }

  var set = new Set();

  Object.keys(yr).forEach(function(name) {
    var def = yr[name];

    if (def && def.rule === "spring_festival") {
      var festivalDay = requireDate(def.lunarDate, yearKey + " 春节日期");
      var beforeDays = Number(def.beforeDays || 0);
      var afterDays = Number(def.afterDays || 0);

      for (var i = -beforeDays; i <= afterDays; i++) {
        set.add(fmt(addD(festivalDay, i)));
      }
      return;
    }

    if (Array.isArray(def)) {
      var start = requireDate(def[0], yearKey + " " + name + " 开始日期");
      var end = requireDate(def[1], yearKey + " " + name + " 结束日期");
      if (cmpDateString(fmt(start), fmt(end)) > 0) {
        throw new Error(yearKey + " " + name + " 节假日开始日期晚于结束日期。");
      }
      for (var cur = new Date(start); cmpDateString(fmt(cur), fmt(end)) <= 0; cur = addD(cur, 1)) {
        set.add(fmt(cur));
      }
      return;
    }

    throw new Error(yearKey + " " + name + " 节假日配置格式不正确。");
  });

  return set;
}

function isHoliday(d) {
  var date = parseDate(d);
  if (!date) throw new Error("isHoliday 收到无效日期：" + d);

  var year = date.getUTCFullYear();
  if (!holidayCache[year]) holidayCache[year] = buildHolidaySet(year);
  return holidayCache[year].has(fmt(date));
}

// Adds schedule days. A schedule day means: not in holidayData. Ordinary weekends count.
function addScheduleDays(start, days) {
  var cur = requireDate(start, "start");
  var remaining = Number(days || 0);

  if (!Number.isFinite(remaining) || remaining < 0) {
    throw new Error("days 必须是非负数字：" + days);
  }

  while (remaining > 0) {
    cur = addD(cur, 1);
    if (!isHoliday(cur)) remaining--;
  }

  return cur;
}

function subScheduleDays(end, days) {
  var cur = requireDate(end, "end");
  var remaining = Number(days || 0);

  if (!Number.isFinite(remaining) || remaining < 0) {
    throw new Error("days 必须是非负数字：" + days);
  }

  while (remaining > 0) {
    cur = addD(cur, -1);
    if (!isHoliday(cur)) remaining--;
  }

  return cur;
}

function scheduleDaysBetween(a, b) {
  var start = requireDate(a, "start");
  var end = requireDate(b, "end");
  var startStr = fmt(start);
  var endStr = fmt(end);

  if (cmpDateString(startStr, endStr) > 0) {
    throw new Error("scheduleDaysBetween 不支持开始日期晚于结束日期：" + startStr + " > " + endStr);
  }

  var count = 0;
  var cur = new Date(start);
  while (!eq(cur, end)) {
    cur = addD(cur, 1);
    if (!isHoliday(cur)) count++;
  }
  return count;
}

// Backward-compatible names. They are not real workdays because ordinary weekends count.
var addWorkdays = addScheduleDays;
var subWorkdays = subScheduleDays;
var workdaysBetween = scheduleDaysBetween;

// -----------------------------------------------------------------------------
// Task definitions
// -----------------------------------------------------------------------------
function normalizeParams(params) {
  var p = params || {};
  var scenario = String(p.scenario || "A").toUpperCase();

  if (scenario !== "A" && scenario !== "B") {
    throw new Error("scenario 只支持 A 或 B，当前值：" + p.scenario);
  }

  return {
    scenario: scenario,
    hasThreeView: !!p.hasThreeView
  };
}

function normalizeConstraint(item) {
  if (typeof item === "number") return { id: item, lagDays: 0 };
  if (typeof item === "string" && item.trim() !== "") return { id: Number(item), lagDays: 0 };

  if (item && typeof item === "object") {
    var id = item.id != null ? item.id : item.task != null ? item.task : item.t;
    var lag = item.lagDays != null ? item.lagDays : item.minDays != null ? item.minDays : item.md;
    return { id: Number(id), lagDays: Number(lag || 0) };
  }

  throw new Error("依赖配置格式不正确：" + JSON.stringify(item));
}

function normalizeConstraintList(list) {
  if (!list) return [];
  if (!Array.isArray(list)) list = [list];
  return list.map(normalizeConstraint).map(function(c) {
    if (!Number.isInteger(c.id) || c.id <= 0) {
      throw new Error("依赖节点 ID 不正确：" + JSON.stringify(c));
    }
    if (!Number.isFinite(c.lagDays) || c.lagDays < 0) {
      throw new Error("lagDays 必须是非负数字：" + JSON.stringify(c));
    }
    return c;
  });
}

function task(id, name, days, options) {
  var opts = options || {};
  return {
    id: id,
    legacyId: opts.legacyId || id,
    name: name,
    days: days,
    startAfter: normalizeConstraintList(opts.startAfter),
    finishAfter: normalizeConstraintList(opts.finishAfter),
    sideTask: !!opts.sideTask,
    condition: opts.condition || null,
    anchorType: opts.anchorType || "none"
  };
}

function cloneConstraintList(list) {
  return (list || []).map(function(c) {
    return { id: c.id, lagDays: c.lagDays };
  });
}

function buildTasks(params) {
  var p = normalizeParams(params);
  var mf = p.hasThreeView ? 6 : 5;

  // Canonical IDs are contiguous #1-#31.
  // legacyId records the previous v3 ID so existing data can be migrated safely.
  var tasks = [
    task(1, "市场调研", 7, { legacyId: 1, anchorType: "solo" }),
    task(2, "可行性研究", 7, { legacyId: 2, startAfter: [1], anchorType: "solo" }),
    task(3, "项目企划", 7, { legacyId: 3, startAfter: [2], anchorType: "solo" }),
    task(4, "绘制款式草稿", 7, { legacyId: 4, startAfter: [3], anchorType: "solo" }),
    task(5, "绘制款式效果图", 14, { legacyId: 5, startAfter: [4], anchorType: "solo" })
  ];

  if (p.hasThreeView) {
    tasks.push(task(6, "绘制款式三视图", 7, {
      legacyId: 6,
      startAfter: [5],
      condition: "hasThreeView=true",
      anchorType: "cond"
    }));
  }

  tasks = tasks.concat([
    task(7, "精细建模确认风格", 14, { legacyId: 8, startAfter: [mf], anchorType: "solo" }),
    task(8, "打印灰模实物确认", 56, { legacyId: 9, startAfter: [mf], sideTask: true, anchorType: "solo" }),
    task(9, "工程审核", 56, { legacyId: 10, startAfter: [mf], sideTask: true, anchorType: "solo" }),
    task(10, "根据效果图建模", 42, { legacyId: 7, startAfter: [7], anchorType: "solo" }),

    task(11, "拆件和样品说明文档", 1, { legacyId: 12, startAfter: [10], anchorType: "solo" }),
    task(12, "成本核算确认", 7, { legacyId: 16, startAfter: [10] }),
    task(13, "水贴AI文档制作", 14, { legacyId: 13, startAfter: [11] }),
    task(14, "拆件确认", 14, { legacyId: 14, startAfter: [11] })
  ]);

  if (p.scenario === "A") {
    tasks.push(task(15, "白蜡送审", 14, {
      legacyId: 15,
      startAfter: [11],
      condition: "scenario=A"
    }));
  }

  tasks = tasks.concat([
    task(16, "包装设计", 21, { legacyId: 19, startAfter: [10] }),
    task(17, "红蜡确认", 21, {
      legacyId: 17,
      startAfter: p.scenario === "B" ? [18] : [14, 15]
    }),
    task(18, "样品制作", 35, {
      legacyId: 18,
      startAfter: [14],
      finishAfter: [{ id: 13, lagDays: 4 }]
    }),
    task(19, "展示盒设计", 21, { legacyId: 20, startAfter: [10] }),
    task(20, "渲染图设计", 21, { legacyId: 21, startAfter: [18] }),
    task(21, "T1灰模", 45, { legacyId: 22, startAfter: [17, 12], anchorType: "cond", condition: "scenario" }),
    task(22, "颜色样", 14, { legacyId: 23, startAfter: [21, 18] }),
    task(23, "T2灰模", 15, { legacyId: 24, startAfter: [21], anchorType: "solo" }),
    task(24, "模具确认", 10, { legacyId: 25, startAfter: [23], anchorType: "solo" }),
    task(25, "大货样", 14, { legacyId: 26, startAfter: [23, 22], anchorType: "solo" }),
    task(26, "展示盒打样", 14, { legacyId: 27, startAfter: [22, 19] }),
    task(27, "包装样品打样", 14, { legacyId: 28, startAfter: [22, 16] }),
    task(28, "包装模拟", 14, { legacyId: 29, startAfter: [23] }),
    task(29, "实拍图拍摄", 21, { legacyId: 32, startAfter: [25] }),
    task(31, "详情页设计", 1, { legacyId: 33, startAfter: [29, 20] }),
    task(30, "首批大货生产", 40, {
      legacyId: 30,
      startAfter: [24],
      finishAfter: [
        { id: 24, lagDays: 0 },
        { id: 25, lagDays: 30 },
        { id: 26, lagDays: 30 },
        { id: 27, lagDays: 30 },
        { id: 28, lagDays: 14 }
      ],
      anchorType: "solo"
    })
  ]);

  validateTasks(tasks);
  tasks.sort(function(a, b) { return a.id - b.id; });
  return tasks.map(function(t) {
    return {
      id: t.id,
      legacyId: t.legacyId,
      name: t.name,
      days: t.days,
      startAfter: cloneConstraintList(t.startAfter),
      finishAfter: cloneConstraintList(t.finishAfter),
      sideTask: t.sideTask,
      condition: t.condition,
      anchorType: t.anchorType,
      // Backward-compatibility fields for old consumers.
      dependsOn: t.startAfter.length === 1 && t.startAfter[0].lagDays === 0 ? t.startAfter[0].id : null,
      gatedBy: t.finishAfter.length ? t.finishAfter.map(function(c) { return { t: c.id, md: c.lagDays }; }) : null
    };
  });
}

function validateTasks(tasks) {
  var ids = {};

  tasks.forEach(function(t) {
    if (ids[t.id]) throw new Error("任务 ID 重复：" + t.id);
    ids[t.id] = true;

    if (!Number.isInteger(t.id) || t.id <= 0) throw new Error("任务 ID 不正确：" + t.id);
    if (!t.name) throw new Error("任务缺少名称：" + t.id);
    if (!Number.isFinite(t.days) || t.days < 0) throw new Error("任务工期不正确：" + t.id);
  });

  tasks.forEach(function(t) {
    t.startAfter.concat(t.finishAfter).forEach(function(c) {
      if (!ids[c.id]) {
        throw new Error("任务 #" + t.id + " 依赖了未启用或不存在的任务 #" + c.id);
      }
    });
  });
}

function buildTaskMap(tasks) {
  var map = {};
  tasks.forEach(function(t) { map[t.id] = t; });
  return map;
}

function dependencyIds(task) {
  var seen = {};
  var out = [];
  task.startAfter.concat(task.finishAfter).forEach(function(c) {
    if (!seen[c.id]) {
      seen[c.id] = true;
      out.push(c.id);
    }
  });
  return out;
}

function topologicalSort(tasks) {
  var taskMap = buildTaskMap(tasks);
  var indegree = {};
  var edges = {};

  tasks.forEach(function(t) {
    indegree[t.id] = 0;
    edges[t.id] = [];
  });

  tasks.forEach(function(t) {
    dependencyIds(t).forEach(function(depId) {
      if (!taskMap[depId]) {
        throw new Error("任务 #" + t.id + " 依赖了不存在的任务 #" + depId);
      }
      indegree[t.id]++;
      edges[depId].push(t.id);
    });
  });

  var orderIndex = {};
  tasks.forEach(function(t, idx) { orderIndex[t.id] = idx; });

  var queue = tasks
    .filter(function(t) { return indegree[t.id] === 0; })
    .map(function(t) { return t.id; })
    .sort(function(a, b) { return orderIndex[a] - orderIndex[b]; });

  var result = [];

  while (queue.length) {
    var id = queue.shift();
    result.push(taskMap[id]);

    edges[id].forEach(function(nextId) {
      indegree[nextId]--;
      if (indegree[nextId] === 0) {
        queue.push(nextId);
        queue.sort(function(a, b) { return orderIndex[a] - orderIndex[b]; });
      }
    });
  }

  if (result.length !== tasks.length) {
    throw new Error("任务依赖存在环，无法排期。");
  }

  return result;
}

// -----------------------------------------------------------------------------
// Schedule engine
// -----------------------------------------------------------------------------
function normalizeInputDates(inputs, taskMap) {
  var dates = {};
  inputs = inputs || {};

  Object.keys(inputs).forEach(function(key) {
    var id = Number(key);
    var taskDef = taskMap[id];
    if (!taskDef) {
      throw new Error("输入任务 #" + key + " 不存在，或在当前参数下未启用。");
    }

    var inp = inputs[key] || {};
    var hasStart = inp.start != null && inp.start !== "";
    var hasFinish = inp.finish != null && inp.finish !== "";

    if (!hasStart && !hasFinish) {
      throw new Error("输入任务 #" + key + " 至少需要 start 或 finish。 ");
    }

    var d = dates[id] || {};

    if (hasStart) {
      d.start = fmt(requireDate(inp.start, "任务 #" + id + " start"));
      d._pinnedStart = true;
    }

    if (hasFinish) {
      d.finish = fmt(requireDate(inp.finish, "任务 #" + id + " finish"));
      d._pinnedFinish = true;
    }

    if (d.start && !d.finish) {
      d.finish = fmt(addScheduleDays(d.start, taskDef.days));
    }

    if (d.finish && !d.start) {
      d.start = fmt(subScheduleDays(d.finish, taskDef.days));
    }

    dates[id] = d;
  });

  return dates;
}

function ensureDateRecord(dates, id) {
  if (!dates[id]) dates[id] = {};
  return dates[id];
}

function durationFinish(taskDef, startDateString) {
  return fmt(addScheduleDays(startDateString, taskDef.days));
}

function durationStart(taskDef, finishDateString) {
  return fmt(subScheduleDays(finishDateString, taskDef.days));
}

function applyFinishAfter(taskDef, dates, currentFinish) {
  var finish = currentFinish;

  taskDef.finishAfter.forEach(function(c) {
    var dep = dates[c.id];
    if (!dep || !dep.finish) return;
    var requiredFinish = fmt(addScheduleDays(dep.finish, c.lagDays));
    finish = maxDateString(finish, requiredFinish);
  });

  return finish;
}

function earliestStartFromDependencies(taskDef, dates) {
  var start = null;

  for (var i = 0; i < taskDef.startAfter.length; i++) {
    var c = taskDef.startAfter[i];
    var dep = dates[c.id];
    if (!dep || !dep.finish) return null;

    var candidate = fmt(addScheduleDays(dep.finish, c.lagDays));
    start = maxDateString(start, candidate);
  }

  return start;
}

function setStartLowerBound(dates, id, value, errors) {
  var d = ensureDateRecord(dates, id);

  if (!d.start) {
    d.start = value;
    return true;
  }

  if (cmpDateString(d.start, value) < 0) {
    if (d._pinnedStart) {
      errors.push("任务 #" + id + " 的固定开始日期 " + d.start + " 早于依赖要求的最早开始日期 " + value + "。");
      return false;
    }
    d.start = value;
    return true;
  }

  return false;
}

function setFinishLowerBound(dates, id, value, errors) {
  var d = ensureDateRecord(dates, id);

  if (!d.finish) {
    d.finish = value;
    return true;
  }

  if (cmpDateString(d.finish, value) < 0) {
    if (d._pinnedFinish) {
      errors.push("任务 #" + id + " 的固定完成日期 " + d.finish + " 早于依赖要求的最早完成日期 " + value + "。");
      return false;
    }
    d.finish = value;
    return true;
  }

  return false;
}

function setFinishUpperBound(dates, id, value, taskMap, errors) {
  var d = ensureDateRecord(dates, id);
  var taskDef = taskMap[id];

  if (!d.finish) {
    d.finish = value;
    if (!d.start) d.start = durationStart(taskDef, value);
    return true;
  }

  if (cmpDateString(d.finish, value) > 0) {
    if (d._pinnedFinish) {
      errors.push("任务 #" + id + " 的固定完成日期 " + d.finish + " 晚于下游允许的最晚完成日期 " + value + "。");
      return false;
    }
    d.finish = value;
    if (!d._pinnedStart) d.start = durationStart(taskDef, value);
    return true;
  }

  return false;
}

function applyBackwardPass(order, taskMap, dates, errors) {
  var changed = false;

  for (var idx = order.length - 1; idx >= 0; idx--) {
    var taskDef = order[idx];
    var d = dates[taskDef.id];
    if (!d) continue;

    if (d.finish && !d.start) {
      d.start = durationStart(taskDef, d.finish);
      changed = true;
    }

    if (d.start && !d.finish) {
      d.finish = durationFinish(taskDef, d.start);
      changed = true;
    }

    if (d.start) {
      taskDef.startAfter.forEach(function(c) {
        var latestDepFinish = fmt(subScheduleDays(d.start, c.lagDays));
        if (setFinishUpperBound(dates, c.id, latestDepFinish, taskMap, errors)) changed = true;
      });
    }

    if (d.finish) {
      taskDef.finishAfter.forEach(function(c) {
        var latestDepFinish = fmt(subScheduleDays(d.finish, c.lagDays));
        if (setFinishUpperBound(dates, c.id, latestDepFinish, taskMap, errors)) changed = true;
      });
    }
  }

  return changed;
}

function applyForwardPass(order, dates, errors, options) {
  var changed = false;
  var opts = options || {};

  order.forEach(function(taskDef) {
    var d = dates[taskDef.id];
    var earliestStart = earliestStartFromDependencies(taskDef, dates);

    if (earliestStart) {
      if (setStartLowerBound(dates, taskDef.id, earliestStart, errors)) {
        d = dates[taskDef.id];
        changed = true;

        // If start moves later, the duration-based finish must be recalculated.
        if (!d._pinnedFinish) {
          var recalculatedFinish = durationFinish(taskDef, d.start);
          d.finish = maxDateString(d.finish, recalculatedFinish);
        }
      }
    }

    d = dates[taskDef.id];
    if (!d) return;

    if (d.start) {
      var minFinish = durationFinish(taskDef, d.start);
      minFinish = applyFinishAfter(taskDef, dates, minFinish);

      if (setFinishLowerBound(dates, taskDef.id, minFinish, errors)) {
        changed = true;
      }
    } else if (d.finish && !opts.forwardOnly) {
      // For non-forward-only solving, keep pair complete when finish is known.
      d.start = durationStart(taskDef, d.finish);
      changed = true;
    }
  });

  return changed;
}

function validateResolvedSchedule(tasks, dates) {
  var errors = [];

  tasks.forEach(function(taskDef) {
    var d = dates[taskDef.id];
    if (!d || !d.start || !d.finish) return;

    var minDurationFinish = durationFinish(taskDef, d.start);
    if (cmpDateString(d.finish, minDurationFinish) < 0) {
      errors.push("任务 #" + taskDef.id + " " + taskDef.name + " 完成日期 " + d.finish + " 早于工期要求 " + minDurationFinish + "。");
    }

    taskDef.startAfter.forEach(function(c) {
      var dep = dates[c.id];
      if (!dep || !dep.finish || !d.start) return;
      var requiredStart = fmt(addScheduleDays(dep.finish, c.lagDays));
      if (cmpDateString(d.start, requiredStart) < 0) {
        errors.push("任务 #" + taskDef.id + " " + taskDef.name + " 开始日期 " + d.start + " 早于 #" + c.id + " 完成后 " + c.lagDays + " 天：" + requiredStart + "。");
      }
    });

    taskDef.finishAfter.forEach(function(c) {
      var dep = dates[c.id];
      if (!dep || !dep.finish || !d.finish) return;
      var requiredFinish = fmt(addScheduleDays(dep.finish, c.lagDays));
      if (cmpDateString(d.finish, requiredFinish) < 0) {
        errors.push("任务 #" + taskDef.id + " " + taskDef.name + " 完成日期 " + d.finish + " 早于 #" + c.id + " 完成后 " + c.lagDays + " 天：" + requiredFinish + "。");
      }
    });
  });

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
}

function resolveSchedule(tasks, dates, options) {
  var taskMap = buildTaskMap(tasks);
  var order = topologicalSort(tasks);
  var errors = [];
  var maxIterations = (options && options.maxIterations) || 200;

  for (var i = 0; i < maxIterations; i++) {
    var changed = false;

    if (!(options && options.forwardOnly)) {
      changed = applyBackwardPass(order, taskMap, dates, errors) || changed;
    }

    changed = applyForwardPass(order, dates, errors, options) || changed;

    if (!changed) break;

    if (i === maxIterations - 1) {
      throw new Error("排期计算超过最大迭代次数，可能存在无法收敛的约束。");
    }
  }

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  validateResolvedSchedule(tasks, dates);
  return dates;
}

function buildResult(tasks, dates, meta) {
  var result = [];

  tasks.forEach(function(taskDef) {
    var d = dates[taskDef.id];
    if (!d || !d.start || !d.finish) return;

    result.push({
      id: taskDef.id,
      legacyId: taskDef.legacyId,
      name: taskDef.name,
      days: taskDef.days,
      startAfter: cloneConstraintList(taskDef.startAfter),
      finishAfter: cloneConstraintList(taskDef.finishAfter),
      dependsOn: taskDef.startAfter.length === 1 && taskDef.startAfter[0].lagDays === 0 ? taskDef.startAfter[0].id : null,
      gatedBy: taskDef.finishAfter.length ? taskDef.finishAfter.map(function(c) { return { t: c.id, md: c.lagDays }; }) : null,
      anchorType: taskDef.anchorType,
      condition: taskDef.condition,
      sideTask: taskDef.sideTask,
      startDate: d.start,
      finishDate: d.finish,
      _pinned: !!(d._pinnedStart || d._pinnedFinish)
    });
  });

  result.sort(function(a, b) { return a.id - b.id; });

  var productionMilestone = null;
  [30, 31].forEach(function(id) {
    var item = result.find(function(t) { return t.id === id; });
    if (item) productionMilestone = maxDateString(productionMilestone, item.finishDate);
  });

  return Object.assign({
    scenario: meta.params.scenario,
    params: meta.params,
    productionMilestone: productionMilestone,
    tasks: result
  }, meta.extra || {});
}

function compute(inputs, params) {
  var normalizedParams = normalizeParams(params);
  var tasks = buildTasks(normalizedParams);
  var taskMap = buildTaskMap(tasks);
  var dates = normalizeInputDates(inputs, taskMap);

  resolveSchedule(tasks, dates);

  return buildResult(tasks, dates, {
    params: normalizedParams
  });
}

// -----------------------------------------------------------------------------
// Convenience functions
// -----------------------------------------------------------------------------
function fromTask(taskId, finishDate, params) {
  var input = {};
  input[taskId] = { start: null, finish: finishDate };
  return compute(input, params);
}

function fromTasks(taskDateMap, params) {
  var input = {};
  Object.keys(taskDateMap || {}).forEach(function(k) {
    var v = taskDateMap[k];
    if (v && typeof v === "object" && (v.start || v.finish)) {
      input[k] = { start: v.start || null, finish: v.finish || null };
    } else {
      input[k] = { start: null, finish: v };
    }
  });
  return compute(input, params);
}

function fromTaskStart(taskId, startDate, params) {
  var input = {};
  input[taskId] = { start: startDate, finish: null };
  return compute(input, params);
}

function anchorInfo(params) {
  return buildTasks(params || { scenario: "A", hasThreeView: false }).map(function(t) {
    return {
      id: t.id,
      legacyId: t.legacyId,
      name: t.name,
      days: t.days,
      anchorType: t.anchorType,
      condition: t.condition,
      sideTask: t.sideTask,
      startAfter: cloneConstraintList(t.startAfter),
      finishAfter: cloneConstraintList(t.finishAfter),
      dependsOn: t.dependsOn,
      gatedBy: t.gatedBy
    };
  });
}

// For non-anchor task updates: compute a baseline first, then pin one task and only push downstream later.
// This intentionally does not pull upstream or parallel tasks around.
function fromTaskWithBaseline(taskId, taskDate, baselineTaskId, baselineDate, params) {
  var normalizedParams = normalizeParams(params);
  var tasks = buildTasks(normalizedParams);
  var taskMap = buildTaskMap(tasks);

  if (!taskMap[taskId]) {
    throw new Error("覆盖任务 #" + taskId + " 不存在，或在当前参数下未启用。");
  }

  var baseline = fromTask(baselineTaskId, baselineDate, normalizedParams);
  var dates = {};

  baseline.tasks.forEach(function(t) {
    dates[t.id] = { start: t.startDate, finish: t.finishDate };
  });

  var pinnedTask = taskMap[taskId];
  var finish = fmt(requireDate(taskDate, "覆盖任务 #" + taskId + " finish"));
  dates[taskId] = dates[taskId] || {};
  dates[taskId].finish = finish;
  dates[taskId].start = durationStart(pinnedTask, finish);
  dates[taskId]._pinnedFinish = true;
  dates[taskId]._pinned = true;

  resolveSchedule(tasks, dates, { forwardOnly: true });

  return buildResult(tasks, dates, {
    params: normalizedParams,
    extra: {
      baseline: baselineTaskId,
      baselineDate: baselineDate,
      pinned: taskId,
      pinnedDate: taskDate
    }
  });
}


// -----------------------------------------------------------------------------
// Legacy v3 ID helpers
// -----------------------------------------------------------------------------
// Previous v3 IDs had gaps (#11 and #31 were missing). These helpers are for
// migrating old data or accepting old IDs explicitly during a transition period.
var LEGACY_TO_ID = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 10,
  8: 7,
  9: 8,
  10: 9,
  12: 11,
  13: 13,
  14: 14,
  15: 15,
  16: 12,
  17: 17,
  18: 18,
  19: 16,
  20: 19,
  21: 20,
  22: 21,
  23: 22,
  24: 23,
  25: 24,
  26: 25,
  27: 26,
  28: 27,
  29: 28,
  30: 30,
  32: 29,
  33: 31
};

var ID_TO_LEGACY = Object.keys(LEGACY_TO_ID).reduce(function(acc, legacyId) {
  acc[LEGACY_TO_ID[legacyId]] = Number(legacyId);
  return acc;
}, {});

function legacyToId(legacyId) {
  var id = LEGACY_TO_ID[Number(legacyId)];
  if (!id) throw new Error("旧版任务 ID #" + legacyId + " 没有对应的新版连续 ID。");
  return id;
}

function idToLegacy(id) {
  var legacyId = ID_TO_LEGACY[Number(id)];
  if (!legacyId) throw new Error("新版任务 ID #" + id + " 没有对应的旧版 ID。");
  return legacyId;
}

function fromLegacyTask(legacyTaskId, finishDate, params) {
  return fromTask(legacyToId(legacyTaskId), finishDate, params);
}

function fromLegacyTaskStart(legacyTaskId, startDate, params) {
  return fromTaskStart(legacyToId(legacyTaskId), startDate, params);
}

function fromLegacyTasks(legacyTaskDateMap, params) {
  var mapped = {};
  Object.keys(legacyTaskDateMap || {}).forEach(function(legacyId) {
    mapped[legacyToId(legacyId)] = legacyTaskDateMap[legacyId];
  });
  return fromTasks(mapped, params);
}

function fromLegacyTaskWithBaseline(taskId, taskDate, baselineTaskId, baselineDate, params) {
  return fromTaskWithBaseline(
    legacyToId(taskId),
    taskDate,
    legacyToId(baselineTaskId),
    baselineDate,
    params
  );
}

module.exports = {
  compute: compute,
  fromTask: fromTask,
  fromTasks: fromTasks,
  fromTaskStart: fromTaskStart,
  fromTaskWithBaseline: fromTaskWithBaseline,
  fromLegacyTask: fromLegacyTask,
  fromLegacyTasks: fromLegacyTasks,
  fromLegacyTaskStart: fromLegacyTaskStart,
  fromLegacyTaskWithBaseline: fromLegacyTaskWithBaseline,
  legacyToId: legacyToId,
  idToLegacy: idToLegacy,
  LEGACY_TO_ID: LEGACY_TO_ID,
  ID_TO_LEGACY: ID_TO_LEGACY,
  anchorInfo: anchorInfo,
  buildTasks: buildTasks,
  holidayData: holidayData,
  isHoliday: isHoliday,
  addScheduleDays: addScheduleDays,
  subScheduleDays: subScheduleDays,
  scheduleDaysBetween: scheduleDaysBetween,
  // backward-compatible aliases
  addWorkdays: addWorkdays,
  subWorkdays: subWorkdays,
  workdaysBetween: workdaysBetween,
  parseDate: parseDate,
  fmt: fmt
};

