export function displayTaskStatus(status?: string | null) {
  if (!status) return "未开始";
  if (status.includes("已完成")) return "已完成";
  if (status.includes("进行")) return "正在推进";
  if (status.includes("当前应开始")) return "现在该开始了";
  if (status.includes("等待前置")) return "等前置任务完成";
  if (status.includes("未开始")) return "还未开始";
  return status;
}

export function isCompletedTaskStatus(status?: string | null) {
  if (!status) return false;
  return status.includes("已完成") || status.includes("已通过");
}

export function isInferredCompletedTaskStatus(status?: string | null) {
  if (!status) return false;
  return status.includes("推断") || status.includes("由后置任务");
}

export function isFinishedProjectStatus(status?: string | null) {
  if (!status) return false;
  return status.includes("已完") || status.includes("完结");
}

export function isDoneLate(delayDays?: number | null) {
  return Number(delayDays || 0) > 0;
}

