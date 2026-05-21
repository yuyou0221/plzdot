const fs = require('fs');
const path = require('path');

function generateWeeklyAnalysis(inputOrData, outDir, weekStart, weekEnd, today, dataVersion) {
const input = typeof inputOrData === 'string' ? inputOrData : '';
outDir = outDir || 'C:/Users/yuyou/Documents/Codex/2026-05-17/files-mentioned-by-the-user-v5/outputs/weekly-analysis-v5-txt';
weekStart = weekStart || '2026-05-18';
weekEnd = weekEnd || '2026-05-24';
today = today || dataDateFromWeek(weekStart);

const TXT = {
  doneProject: '\u5df2\u5b8c\u7ed3',
  currentShouldStart: '\u5f53\u524d\u5e94\u5f00\u59cb',
  inProgress: '\u8fdb\u884c\u4e2d',
  waitingActualPred: '\u7b49\u5f85\u524d\u7f6e\u5b9e\u9645\u5b8c\u6210',
  waitingShort: '\u7b49\u5f85\u524d\u7f6e\u5b8c\u6210',
  ungrouped: '\u672a\u5206\u7ec4',
};

function dataDateFromWeek(start) {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `weekly-analysis-${weekStart}-to-${weekEnd}.txt`);
const data = typeof inputOrData === 'string' ? JSON.parse(fs.readFileSync(input, 'utf8')) : inputOrData;
const activeProjects = data.projects.filter(p => p.status !== TXT.doneProject);
const activeProjectIds = new Set(activeProjects.map(p => p.projectId));
const projectById = new Map(activeProjects.map(p => [p.projectId, p]));
const rowsByProject = new Map();
for (const r of data.rows) {
  if (!rowsByProject.has(r.projectId)) rowsByProject.set(r.projectId, []);
  rowsByProject.get(r.projectId).push(r);
}

function cmp(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function inWeek(d) {
  return d && cmp(d, weekStart) >= 0 && cmp(d, weekEnd) <= 0;
}

function overlapsWeek(s, f) {
  return s && f && cmp(s, weekEnd) <= 0 && cmp(f, weekStart) >= 0;
}

function scheduleDaysBetween(a, b) {
  if (!a || !b || a >= b) return 0;
  const start = new Date(`${a}T00:00:00Z`);
  const end = new Date(`${b}T00:00:00Z`);
  let days = 0;
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0) days += 1;
  }
  return days;
}

function addScheduleDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00Z`);
  let left = Number(days || 0);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

function signedScheduleDays(a, b) {
  if (!a || !b || a === b) return 0;
  return a < b ? scheduleDaysBetween(a, b) : -scheduleDaysBetween(b, a);
}

function fmtDate(d) {
  if (!d) return '-';
  const match = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return d;
  return `${Number(match[2])}.${match[3]}`;
}

function fmtCnDate(d) {
  if (!d) return '-';
  const match = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return d;
  return `${Number(match[2])}月${Number(match[3])}日`;
}

function signedPrefix(days) {
  const n = Number(days || 0);
  return `${n > 0 ? '+' : ''}${n}\u5929`;
}

function delayDaysFromOriginalPlan(r) {
  return Math.max(0, signedScheduleDays(r.originalLatestFinishDate, r.forecastFinishDate));
}

function taskName(projectId, idText) {
  const id = Number(String(idText).replace('#', ''));
  const row = (rowsByProject.get(projectId) || []).find(x => Number(x.taskId) === id);
  return row?.taskName || idText;
}

function waitingText(r) {
  const missing = String(r.missingActualPredecessorIds || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(id => taskName(r.projectId, id));
  if (!missing.length) return '';
  return ` \u7b49\u5f85\u201c${missing.join('\u3001')}\u201d\u4e2d`;
}

function delaySentence(r) {
  const startSlack = signedScheduleDays(r.forecastStartDate || weekStart, r.latestStartDate);
  const finishDelay = Math.max(0, signedScheduleDays(r.latestFinishDate, r.forecastFinishDate));
  if (startSlack > 0 && finishDelay === 0) {
    return `\u82e5\u518d\u62d6\u5ef6${startSlack}\u5929\u5f00\u59cb\u4f1a\u518d\u6b21\u5ef6\u671f`;
  }
  const originalDelay = delayDaysFromOriginalPlan(r);
  return `\u5df2\u518d\u6b21\u5ef6\u671f${Math.max(0, finishDelay, originalDelay, -startSlack)}\u5929`;
}

function catchUpSentence(r) {
  if (Number(r.launchDeltaDays || 0) <= 0) return '';
  if (!r.originalLatestFinishDate || !r.forecastFinishDate) return '';
  if (cmp(r.forecastFinishDate, r.originalLatestFinishDate) <= 0) return '';
  if (cmp(r.originalLatestFinishDate, today) < 0) return ' \u539f\u5b9aDDL\u5df2\u65e0\u6cd5\u8ffd\u56de';
  return ` \u82e5\u4e8e${fmtDate(r.originalLatestFinishDate)}\u524d\u5b8c\u6210\u53ef\u8ffd\u56de\u539f\u5b9aDDL`;
}

function lineFor(r) {
  if (r.missingActualPredecessorIds) {
    return `- ${r.projectName}  \u201c${r.taskName}\u201d${waitingText(r)} \u9884\u6d4bDDL ${fmtDate(r.forecastFinishDate)} ${delaySentence(r)}${catchUpSentence(r)}`;
  }
  const status = r.taskStatus === TXT.waitingActualPred ? TXT.waitingShort : r.taskStatus;
  return `- ${r.projectName}  ${status}\u201c${r.taskName}\u201d \u9884\u6d4bDDL ${fmtDate(r.forecastFinishDate)} ${delaySentence(r)}${catchUpSentence(r)}`;
}

function projectLine(p) {
  return `- ${p.projectName} ${p.status || '-'} 计划${fmtCnDate(p.plannedLaunchDate)}，当前测算${fmtCnDate(p.projectedLaunchDate)} ${signedPrefix(p.launchDeltaDays || 0)}`;
}

const unfinished = data.rows.filter(r => activeProjectIds.has(r.projectId) && !r.actualFinishDate && !r.inferredCompleted);
const byTeam = new Map();

for (const p of activeProjects) {
  const team = p.team || TXT.ungrouped;
  if (!byTeam.has(team)) byTeam.set(team, { projects: [], rows: [] });
  byTeam.get(team).projects.push(p);
}

for (const r of unfinished) {
  const p = projectById.get(r.projectId) || {};
  const team = p.team || TXT.ungrouped;
  if (!byTeam.has(team)) byTeam.set(team, { projects: [], rows: [] });
  byTeam.get(team).rows.push(r);
}

const teamNames = [...byTeam.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
const allFinish = unfinished.filter(r => inWeek(r.forecastFinishDate));
const allUsed = new Set(allFinish.map(r => r.recordKey));
const allShouldStart = unfinished.filter(r => !allUsed.has(r.recordKey) && r.taskStatus !== TXT.inProgress && (r.taskStatus === TXT.currentShouldStart || inWeek(r.forecastStartDate)));
for (const r of allShouldStart) allUsed.add(r.recordKey);
const allProgress = unfinished.filter(r => !allUsed.has(r.recordKey) && r.taskStatus !== TXT.currentShouldStart && (r.taskStatus === TXT.inProgress || overlapsWeek(r.forecastStartDate, r.forecastFinishDate)));
const attentionCutoff = addScheduleDays(weekEnd, 14);
const delayedProjects = activeProjects
  .filter(p => Number(p.launchDeltaDays || 0) > 0)
  .sort((a, b) => Number(b.launchDeltaDays || 0) - Number(a.launchDeltaDays || 0));
const blockingRows = unfinished
  .filter(r => r.isBlockingLaunch)
  .sort((a, b) => Number(b.launchDeltaDays || 0) - Number(a.launchDeltaDays || 0));

const lines = [];
lines.push('\u672c\u5468\u9879\u76ee\u7ba1\u7406\u5206\u6790');
lines.push(`\u5468\u671f\uff1a${weekStart} \u81f3 ${weekEnd}`);
lines.push(`\u6570\u636e\u7248\u672c\uff1a${dataVersion || (input ? path.basename(path.dirname(input)) : 'memory')}`);
lines.push(`\u751f\u6210\u65e5\u671f\uff1a${data.generatedAt}`);
lines.push(`\u5224\u65ad\u65e5\u671f\uff1a${today}`);
lines.push('');
lines.push('\u53e3\u5f84\u8bf4\u660e');
lines.push('1. \u672c\u5468\u8981\u5b8c\u6210\uff1a\u672a\u5b8c\u6210\u4efb\u52a1\u4e2d\uff0c\u9884\u6d4b\u5b8c\u6210\u65e5\u5728\u672c\u5468\u5185\u3002');
lines.push('2. \u672c\u5468\u5e94\u5f00\u59cb\uff1a\u72b6\u6001\u4e3a\u201c\u5f53\u524d\u5e94\u5f00\u59cb\u201d\uff0c\u6216\u672a\u5b8c\u6210\u4efb\u52a1\u4e2d\u9884\u6d4b\u5f00\u59cb\u65e5\u5728\u672c\u5468\u5185\u3002');
lines.push('3. \u672c\u5468\u63a8\u8fdb\u4e2d\uff1a\u72b6\u6001\u4e3a\u201c\u8fdb\u884c\u4e2d\u201d\uff0c\u6216\u9884\u6d4b\u5468\u671f\u4e0e\u672c\u5468\u6709\u4ea4\u96c6\uff1b\u201c\u5f53\u524d\u5e94\u5f00\u59cb\u201d\u4e0d\u518d\u653e\u5165\u63a8\u8fdb\u4e2d\u3002');
lines.push('4. \u5df2\u518d\u6b21\u5ef6\u671f\u5929\u6570\uff1a\u7528\u9884\u6d4bDDL\u76f8\u5bf9\u201c\u539f\u8ba1\u5212\u4e0a\u7ebf\u6700\u665a\u5b8c\u6210\u65e5\u201d\u8ba1\u7b97\u3002');
lines.push('');
lines.push('\u603b\u89c8');
lines.push(`- \u9879\u76ee\u6570\uff1a${activeProjects.length}`);
lines.push(`- \u672a\u5b8c\u6210\u4efb\u52a1\u6570\uff1a${unfinished.length}`);
lines.push(`- \u672c\u5468\u8981\u5b8c\u6210\uff1a${allFinish.length}`);
lines.push(`- \u672c\u5468\u5e94\u5f00\u59cb\uff1a${allShouldStart.length}`);
lines.push(`- \u672c\u5468\u63a8\u8fdb\u4e2d\uff1a${allProgress.length}`);
lines.push(`- \u5f53\u524d\u6d4b\u7b97\u5df2\u504f\u79bb\u8ba1\u5212\u51fa\u8d27\u7684\u9879\u76ee\uff1a${delayedProjects.length}`);
lines.push(`- \u963b\u585e\u51fa\u8d27\u8def\u5f84\u7684\u672a\u5b8c\u6210\u4efb\u52a1\uff1a${blockingRows.length}`);
lines.push('');
lines.push('\u504f\u5dee\u6700\u5927\u7684\u9879\u76ee Top 10');
for (const p of delayedProjects.slice(0, 10)) lines.push(projectLine(p));
if (!delayedProjects.length) lines.push('- \u65e0');
lines.push('');

for (const team of teamNames) {
  const group = byTeam.get(team);
  const projects = group.projects.sort((a, b) => Number(b.launchDeltaDays || 0) - Number(a.launchDeltaDays || 0));
  const rows = group.rows;
  const finish = rows
    .filter(r => inWeek(r.forecastFinishDate))
    .sort((a, b) => (a.forecastFinishDate || '').localeCompare(b.forecastFinishDate || '') || Number(a.taskId) - Number(b.taskId));
  const used = new Set(finish.map(r => r.recordKey));
  const start = rows
    .filter(r => !used.has(r.recordKey) && r.taskStatus !== TXT.inProgress && (r.taskStatus === TXT.currentShouldStart || inWeek(r.forecastStartDate)))
    .sort((a, b) => (a.forecastStartDate || '').localeCompare(b.forecastStartDate || '') || Number(a.taskId) - Number(b.taskId));
  for (const r of start) used.add(r.recordKey);
  const progress = rows
    .filter(r => !used.has(r.recordKey) && r.taskStatus !== TXT.currentShouldStart && (r.taskStatus === TXT.inProgress || overlapsWeek(r.forecastStartDate, r.forecastFinishDate)))
    .sort((a, b) => Number(b.isBlockingLaunch) - Number(a.isBlockingLaunch)
      || Number(b.launchDeltaDays || 0) - Number(a.launchDeltaDays || 0)
      || (a.forecastFinishDate || '').localeCompare(b.forecastFinishDate || ''));
  for (const r of progress) used.add(r.recordKey);
  const delayed = projects.filter(p => Number(p.launchDeltaDays || 0) > 0);
  const blockers = rows.filter(r => r.isBlockingLaunch);
  const attention = rows.filter(r => {
    if (used.has(r.recordKey)) return false;
    const nearCurrentStage = r.taskStatus === TXT.inProgress
      || r.taskStatus === TXT.currentShouldStart
      || (r.forecastStartDate && cmp(r.forecastStartDate, attentionCutoff) <= 0);
    if (!nearCurrentStage) return false;
    return r.isBlockingLaunch || (r.impactStatus && r.impactStatus !== '\u6b63\u5e38');
  });
  const dedupAttention = [...new Map(attention.map(r => [r.recordKey, r])).values()]
    .sort((a, b) => Number(b.isBlockingLaunch) - Number(a.isBlockingLaunch)
      || Number(b.launchDeltaDays || 0) - Number(a.launchDeltaDays || 0));

  lines.push('='.repeat(64));
  lines.push(`\u9879\u76ee\u7ec4\uff1a${team}`);
  lines.push(`\u9879\u76ee\u6570\uff1a${projects.length} | \u5ef6\u671f\u9879\u76ee\uff1a${delayed.length} | \u672c\u5468\u8981\u5b8c\u6210\uff1a${finish.length} | \u672c\u5468\u5e94\u5f00\u59cb\uff1a${start.length} | \u672c\u5468\u63a8\u8fdb\u4e2d\uff1a${progress.length} | \u963b\u585e\u51fa\u8d27\u4efb\u52a1\uff1a${blockers.length}`);
  lines.push('');
  lines.push('\u9879\u76ee\u72b6\u6001');
  for (const p of projects) lines.push(projectLine(p));
  if (!projects.length) lines.push('- \u65e0');
  lines.push('');
  lines.push('\u672c\u5468\u8981\u5b8c\u6210');
  for (const r of finish) lines.push(lineFor(r));
  if (!finish.length) lines.push('- \u65e0');
  lines.push('');
  lines.push('\u672c\u5468\u5e94\u5f00\u59cb');
  for (const r of start) lines.push(lineFor(r));
  if (!start.length) lines.push('- \u65e0');
  lines.push('');
  lines.push('\u672c\u5468\u63a8\u8fdb\u4e2d');
  for (const r of progress) lines.push(lineFor(r));
  if (!progress.length) lines.push('- \u65e0');
  lines.push('');
  lines.push('\u7ba1\u7406\u5173\u6ce8\u70b9');
  for (const r of dedupAttention.slice(0, 12)) lines.push(lineFor(r));
  if (!dedupAttention.length) lines.push('- \u65e0\u660e\u663e\u98ce\u9669\u4efb\u52a1');
  lines.push('');
}

fs.writeFileSync(outFile, lines.join('\r\n'), 'utf8');
const summary = {
  outFile,
  teams: teamNames.length,
  allFinish: allFinish.length,
  allShouldStart: allShouldStart.length,
  allProgress: allProgress.length,
  delayedProjects: delayedProjects.length,
  blockers: blockingRows.length,
};
return summary;
}

if (require.main === module) {
  const input = process.argv[2] || 'C:/Users/yuyou/Documents/Codex/2026-05-17/files-mentioned-by-the-user-v5/outputs/v24-infer-8-9-from-inferred-10-full/project-task-estimates-v5.json';
  const outDir = process.argv[3] || 'C:/Users/yuyou/Documents/Codex/2026-05-17/files-mentioned-by-the-user-v5/outputs/weekly-analysis-v5-txt';
  const weekStart = process.argv[4] || '2026-05-18';
  const weekEnd = process.argv[5] || '2026-05-24';
  const today = process.argv[6] || dataDateFromWeek(weekStart);
  const summary = generateWeeklyAnalysis(input, outDir, weekStart, weekEnd, today);
  console.log(summary.outFile);
  console.log(JSON.stringify({
    teams: summary.teams,
    allFinish: summary.allFinish,
    allShouldStart: summary.allShouldStart,
    allProgress: summary.allProgress,
    delayedProjects: summary.delayedProjects,
    blockers: summary.blockers,
  }, null, 2));
}

module.exports = { generateWeeklyAnalysis };
