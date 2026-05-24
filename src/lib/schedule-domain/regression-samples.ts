export type ScheduleRegressionSample = {
  projectName: string;
  focus: string;
  expectedSignal: string;
};

export const scheduleRegressionSamples: ScheduleRegressionSample[] = [
  {
    projectName: "小鸟4代",
    focus: "延期完成口径",
    expectedSignal: "已完成项目如果实际完成晚于规划完成，应显示为延期完成，而不是当前风险。",
  },
  {
    projectName: "兔老大表情包mini",
    focus: "前置任务填表错误识别",
    expectedSignal: "任务 10 不应被已补完成的任务 7 长期卡住；如果再次卡住，优先检查实际进度填表。",
  },
  {
    projectName: "无牙仔猫猫",
    focus: "启动晚导致整体预测晚",
    expectedSignal: "项目有效启动显著晚于理论启动时，预测上线整体后移是合理结果。",
  },
  {
    projectName: "插画小人mini2代",
    focus: "任务 10 已开始但任务 7 未完成",
    expectedSignal: "任务 10 有实际开始而任务 7 未完成时，应提示前置事实缺失，而不是改脚本绕过。",
  },
];

