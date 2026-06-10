# P0 API 路由

## GET /api/health

用途：检查系统和数据库状态。

返回示例：

```json
{
  "ok": true,
  "database": {
    "ok": false,
    "message": "数据库不可用，当前页面会回退到样例数据"
  }
}
```

## GET /api/schedule/board

用途：读取项目排期看板数据。

当前行为：

```text
1. 优先读取数据库。
2. 数据库不可用或没有项目卡片时，回退到样例数据。
```

返回核心字段：

```text
sourceLabel
months
milestones
metrics
projectCards
projectDetails
```

## GET /api/projects/:id

用途：读取单个项目详情。

当前行为：

```text
从统一排期数据源中读取 projectDetails[id]。
后续会改成直接查 projects、schedule results、alerts、work_tasks。
```

## POST /api/projects

用途：从表格视图新增项目规划。

当前行为：

```text
1. 创建 Project 记录。
2. 必填项目名称、版权方、IP 和计划上线日期。
3. 可选写入路线 routeType 和项目组 projectTeamId。
4. 页面保存成功后会触发 /api/schedule/analyze 刷新预测和风险。
```

请求示例：

```json
{
  "projectName": "小狗7代",
  "licensorName": "版权方",
  "ipName": "番茄IP",
  "plannedLaunchDate": "2026-09-15",
  "routeType": "常规路线",
  "projectTeamId": "产品一组"
}
```

## PATCH /api/projects/:id

用途：从表格视图编辑项目规划字段。

当前可编辑字段：

```text
plannedLaunchDate
routeType
projectTeamId
```

规则：

```text
1. plannedLaunchDate 可以提前，也可以延期。
2. 如果新日期晚于原计划上线日期，系统会明确提示“计划上线延期”，并记录 ScheduleAdjustment / TaskDragLog。
3. 产品组任务事实事件不能修改 plannedLaunchDate。
```

## DELETE /api/projects/:id

用途：从表格视图删除项目。

当前行为：

```text
1. 只允许删除尚未产生任务事实、排期结果、建模进度、工作任务、任务卡或提醒的新项目。
2. 已产生业务数据的项目会拒绝直接删除，后续应走归档或停用流程。
```

## POST /api/schedule/analyze

用途：触发重新测算。

当前行为：

```text
1. 如果数据库可用，先创建一个 schedule_runs 批次。
2. 现阶段还没有接入现有 JS 排期脚本，所以 runStatus 暂为“进行中”。
3. 如果数据库不可用，返回 503，并提示继续使用样例数据。
```

请求示例：

```json
{
  "source": "manual",
  "projectIds": [],
  "today": "2026-05-22"
}
```

当前测算入口已接入 `project-analysis-v5` 端口，成功后写入 `schedule_project_results`、`schedule_task_results`、`task_cards` 和 `alerts`。

## POST /api/schedule/adjustments

用途：保存上线日历拖拽形成的规划调整。

当前行为：

```text
1. 接收项目 ID 和目标上线日期，也兼容只传目标月份。
2. 如果传 `toDate`，精确写入该日期；如果只传 `toMonth`，保留原计划上线日期的“日”，只替换年月；如目标月份天数不足则自动落到月底。
3. 目标计划上线日期可以提前，也可以延期；延期会在返回消息和调整记录中明确标记。
4. 更新 Project.plannedLaunchDate。
5. 生成 ScheduleAdjustment 和 TaskDragLog。
6. 接口本身只负责保存；页面上的“保存调整”会在保存成功后继续调用 /api/schedule/analyze 刷新预测、风险和财务影响。
```

请求示例：

```json
{
  "adjustments": [
    {
      "projectId": "project-id",
      "toMonth": "26年5月",
      "toDate": "2026-05-12",
      "reason": "小狗5代 计划上线从 2026-06-06 调整到 2026-05-12"
    }
  ]
}
```

## POST /api/schedule/task-fact-events

用途：接收产品组工作指引输出的标准任务事实事件。

当前行为：

```text
1. 普通产品组任务事实允许所有已登录启用账号写入；强制、历史、Excel 类写入仅 admin / manager 可用。
2. 接收单条 ProjectTaskFactEvent；也兼容 { event } 或单条 { events: [...] } 包装。
3. 使用 eventId 做幂等，重复事件不重复写入。
4. 使用 projectId + taskNo 定位 ProjectTask；任务不存在时按 TaskRule 初始化。
5. taskNo 必须是 1-31 的标准任务编号。
6. 写入 ProjectTask 任务事实字段。
7. 写入 ProgressUpdate。
8. 写入 ProjectTaskFactEventLog。
9. 事件写入成功后创建 ScheduleRun，并通过统一排期内核端口触发重算。
10. 重算成功后返回 scheduleRunId、项目数和任务数；重算失败时保留任务事实，并明确返回“事实已接收，重算失败”。
11. 不在事件接收层计算风险、延期、预测上线和里程碑状态，这些结论只能来自统一排期内核结果。
```

请求示例：

```json
{
  "eventId": "uuid",
  "eventType": "task_completed",
  "sourceModule": "product-guide",
  "projectId": "system-project-id",
  "taskNo": 7,
  "taskKey": "#7",
  "taskName": "精细建模确认风格",
  "occurredAt": "2026-05-29T10:30:00+08:00",
  "operatorId": "user-id",
  "operatorName": "张三",
  "payload": {
    "actualFinishDate": "2026-05-29",
    "status": "已完成",
    "note": "版权方已确认通过"
  }
}
```

支持的事件：

```text
task_started
task_expected_finish_updated
task_submitted_for_review
task_completed
task_blocked
task_unblocked
task_paused
task_resumed
task_note_updated
```

产品组真实试用契约：

```text
1. 产品组工作指引正式页可发送 task_started、task_completed、task_expected_finish_updated、task_blocked、task_unblocked、task_submitted_for_review、task_note_updated。
2. 产品组只提交任务事实，不提交风险、预测、延期、里程碑状态或产能结论。
3. projectId 必须是系统项目 ID，不用项目编号或项目名匹配。
4. taskNo 必须是 1-31。
5. 日期字段统一 YYYY-MM-DD。
6. occurredAt 必须是带时区 ISO，例如 2026-05-31T10:30:00+08:00。
7. task_completed 如果 payload 带 actualStartDate，且原任务没有 actualStartDate，则补写；如果原任务已有 actualStartDate，不覆盖。
8. 接收成功返回 ok=true、message、needsRecalculation=true、scheduleRunId 和 recalculation。
9. 接收失败返回 ok=false 和可读 message，例如 缺少 projectId。
10. 普通任务事实可以由产品组执行人写入；override、force、backfill、bulk、importSource 等高风险字段仍只允许 admin / manager。
```

task_started 示例：

```json
{
  "eventId": "product-guide:task-event:uuid",
  "eventType": "task_started",
  "sourceModule": "product-guide",
  "projectId": "system-project-id",
  "taskNo": 1,
  "taskKey": "#1",
  "taskName": "市场调研",
  "occurredAt": "2026-05-31T10:30:00+08:00",
  "operatorId": "user-id",
  "operatorName": "张三",
  "payload": {
    "actualStartDate": "2026-05-31",
    "status": "进行中",
    "note": "产品组从工作台启动 #1 市场调研。"
  }
}
```

task_completed 示例：

```json
{
  "eventId": "product-guide:task-event:uuid",
  "eventType": "task_completed",
  "sourceModule": "product-guide",
  "projectId": "system-project-id",
  "taskNo": 1,
  "taskKey": "#1",
  "taskName": "市场调研",
  "occurredAt": "2026-05-31T10:35:00+08:00",
  "operatorId": "user-id",
  "operatorName": "张三",
  "payload": {
    "actualFinishDate": "2026-05-31",
    "status": "已完成",
    "note": "产品组从工作台标记 #1 市场调研 完成。"
  }
}
```

## POST /api/imports/preview

用途：生成 Excel 导入预览，不写入数据库。

当前支持：

```text
project-main：项目主数据 Excel，格式参考“番茄项目规划信息收集”。
```

当前行为：

```text
1. 仅 admin / manager 可用。
2. 接收 .xlsx 文件和 importType。
3. 复用 legacy/schedule-engine/extract_project_excel.py 解析项目信息表、实际进度录入表、任务规则。
4. 按项目编号、项目名称 + IP + 版权方、项目名称 + IP、项目名称依次尝试匹配现有项目。
5. `任务规则v4` 只做只读校验；如果 Excel 规则和系统规则不一致，只给警告，不修改系统 TaskRule。
6. 返回已匹配、待新增、需确认、不可导入、基础资料新增、月度上线数量异常和任务规则警告。
7. 只读预览，不会创建项目，不会覆盖项目，不会触发排期重算。
```

## POST /api/imports/apply

用途：确认写入 Excel 导入结果。

当前支持：

```text
project-main：项目主数据 Excel，合并补充模式。
```

当前行为：

```text
1. 仅 admin / manager 可用。
2. 会重新解析并重新生成预览，避免用户绕过预览直接写入。
3. 如果存在不可导入、匹配冲突、数据库不可校验，则拒绝写入。
4. 新项目会创建 Project。
5. 已匹配项目会更新 Project 的基础字段。
6. 会把“实际进度录入表”的开始 / 完成记录转成 ProjectTaskFactEvent 写入任务事实，sourceModule=manual-excel。
7. 写入 DataImport 批次记录。
8. 实际进度事件 ID 按 projectId + taskNo + 事件类型 + 日期生成，重复导入同一事实不会重复写入。
9. 导入时不写入 `任务规则v4` 到系统 TaskRule，只保留规则差异警告。
10. 已匹配项目的计划上线日期可以通过 Excel 提前或延期；延期会生成规划调整记录，不再作为导入失败处理。
11. 导入完成后只提示需要重新测算，不会静默触发排期内核。
12. 当前不支持全量替换，也不删除 Excel 中缺失的旧项目。
```

## GET /api/schedule/export-excel

用途：导出与当前项目排期导入文件同结构的 Excel。

当前行为：

```text
1. 仅 admin / manager 可用。
2. 导出一个 .xlsx 工作簿。
3. 工作表包含：项目信息表2026、实际进度录入表、任务规则v4。
4. 项目ID、项目任务ID、taskNo 用隐藏列保存，便于回传稳定匹配。
5. 任务规则v4 为只读规则快照，导入时只用于任务名称匹配，不允许通过 Excel 改核心排期逻辑。
```

## 财务测算 API

当前路由：

```text
PATCH /api/finance/config
PATCH /api/finance/projects/:projectId/facts
```

当前行为：

```text
1. 仅 admin 可写。
2. PATCH /api/finance/config 保存统一折扣和各项目等级预测销量。
3. PATCH /api/finance/projects/:projectId/facts 保存项目级财务事实，每个项目最多一条记录。
4. 项目级财务事实包含：实际开发成本、实际单件生产成本、实际营收、总订单数量、实际销量、渠道样品量、展示盒数量、展示盒单价和备注。
5. 库存不允许手填，由系统计算：总库存 = 总订单数量 - 实际销量 - 渠道样品量。
6. 财务事实只用于财务测算，不回写项目排期、产品组工作指引或建模排期。
```

页面入口：

```text
1. /finance 是年度财务测算总览页，展示年度、子公司、等级汇总和项目级关键结果。
2. /finance/projects/:projectId 是单项目财务编辑页，用于录入实际开发成本、实际单件生产成本、实际营收、总订单、实际销量、渠道样品量、展示盒数量、展示盒单价和备注。
3. 单项目编辑页会实时预览总库存、实际营收来源、单件成本来源、已售生产成本、样品成本、展示盒成本、库存成本、理论盈亏、浮动盈亏、当前盈亏和开发成本差异。
```

`PATCH /api/finance/projects/:projectId/facts` 请求示例：

```json
{
  "actualDevelopmentCost": 120000,
  "actualProductionUnitCost": 12.5,
  "actualRevenue": 320000,
  "totalOrderQuantity": 30000,
  "actualSales": 18000,
  "channelSampleQuantity": 120,
  "displayBoxQuantity": 300,
  "displayBoxUnitPrice": 9.5,
  "notes": "第一批订单已录入"
}
```

财务测算固定公式：

```text
理论开发成本 = 零售价 × 10000 × 规格 / 6
理论生产单件成本 = 零售价 × 32.5%
实际测算用单件生产成本 = 实际单件生产成本；未录入时使用理论生产单件成本
理论营收 = 规格 × 零售价 × 折扣 × 项目等级预测销量
理想销量 = 规格 × 项目等级预测销量
理论测算销量 = max(理想销量, 实际销量)
实际营收 = 实际录入营收；未录入时使用 零售价 × 折扣 × 实际销量
渠道样品成本 = 渠道样品量 × 实际测算用单件生产成本
实际销量的生产成本 = 实际销量 × 实际测算用单件生产成本
展示盒成本 = 展示盒数量 × 展示盒单价
库存成本 = 总库存 × 实际测算用单件生产成本
理论盈亏 = 理论测算销量 × 零售价 × 折扣 - 实际开发成本 - 渠道样品成本 - 展示盒成本 - 理论测算销量 × 实际测算用单件生产成本
理论盈亏不扣库存成本，因为它假设项目达到理想销量或实际销量中的较高值。
浮动盈亏 = 实际营收 - 实际开发成本 - 渠道样品成本 - 展示盒成本 - 实际销量的生产成本
当前盈亏 = 实际营收 - 实际开发成本 - 渠道样品成本 - 展示盒成本 - 库存成本 - 实际销量的生产成本
开发成本差异 = 实际开发成本 - 理论开发成本
```

## 排期内核调用边界

项目排期 API 不直接调用 legacy 排期脚本。当前统一入口：

```text
src/lib/schedule-engine/service.ts
```

服务层通过 `ScheduleEnginePort` 调用默认 `project-analysis-v5` 端口，并通过 `ScheduleEngineResultStore` 保存结果。数据库输入集中在 `src/lib/schedule-engine/project-analysis-v5-input.ts` 的 `loadProjectAnalysisV5InputFromDatabase()`，页面组件和业务 API 不直接调用 core JS 或旧适配器。

## 用户数据 API

用途：用户数据基础版的人员、团队、建模能力标签和外包供应商维护。

当前路由：

```text
POST /api/users/people
PATCH /api/users/people/:id
POST /api/users/teams
PATCH /api/users/teams/:id
PATCH /api/users/modeler-capabilities/:userId
POST /api/users/vendors
PATCH /api/users/vendors/:id
```

当前行为：

```text
1. 不做删除，停用通过 status=停用 保存。
2. 人员、团队、建模能力标签、外包供应商均写入现有 Prisma 表。
3. 建模能力标签接口会将用户标记为建模师，并重写该用户的擅长 / 不擅长标签。
```

## 登录与权限 API

当前路由：

```text
POST /api/auth/login
POST /api/auth/logout
```

当前行为：

```text
1. 登录成功后写入 httpOnly 会话 Cookie。
2. 未登录访问页面会跳转到 /login。
3. 未登录访问受保护 API 会返回 401。
4. 角色分为 admin、manager、viewer。
5. 用户数据维护接口仅 admin 可写。
6. 项目排期、建模任务、产品组工作指引等业务写接口允许 admin / manager，viewer 只读。
```

## 产品组工作指引 API

用途：产品组工作指引写入任务执行事实，并通过兼容入口提交建模款式清单。

当前路由：

```text
PATCH /api/product-guide/tasks/:id
POST /api/product-guide/modeling-tasks
```

当前行为：

```text
1. PATCH /api/product-guide/tasks/:id 是兼容层：页面动作先转换成 ProjectTaskFactEvent，再调用项目排期任务事实接收服务。
2. 该接口不再直接写 ProjectTask / ProgressUpdate。
3. progress 且状态为“进行中”、原任务没有 actualStartDate 时，转换为 task_started。
4. complete 转换为 task_completed；expected-finish、submit-review、block、unblock、note 转换为对应扩展事件。
5. 任务事实服务负责写入事实、记录事件日志，并触发统一排期内核重算。
6. POST /api/product-guide/modeling-tasks 作为旧入口保留，内部桥接到建模排期 style-submissions 契约，提交后 ModelingTask.status=待确认。
7. 产品组工作指引只提交执行事实和款式清单，不直接写项目排期规划基线、预测结果或建模分配。
```

## 建模排期 API

用途：建模排期基础版的真实款式分配、外包、建模计时、成果提交和产品审核 / 送审结果接收。

当前路由：

```text
PATCH /api/modeling/tasks/:id
POST /api/modeling/tasks/:id/work-submissions
POST /api/modeling/tasks/:id/work-timer
POST /api/modeling/style-submissions
POST /api/modeling/style-confirmations
POST /api/modeling/style-start-events
POST /api/modeling/review-results
POST /api/modeling/style-cancellations
POST /api/modeling/style-reopen-events
GET /api/modeling/product-guide-events
GET /api/modeling/projects/:projectId/styles
GET /api/modeling/projects/:projectId/progress
```

当前行为：

```text
1. 只保存真实 ModelingTask；虚拟款式会被拒绝，需先由产品组工作指引录入真实款式。
2. `PATCH /api/modeling/tasks/:id` 只允许保存 `modelerId`、`isOutsourced`、`outsourceVendorId`、`plannedStartDate`、`plannedFinishDate`、`actualStartDate`、`actualFinishDate`、`remainingWorkdays`、`notes` 等建模排期输入。
3. `status` 不能通过通用更新接口手动写入；状态由分配、外包、计时、提交成果和产品审核 / 送审结果自动生成。
4. `feedbackContent` / `feedbackType` 不能通过通用更新接口写入；产品检修、版权反馈、内部通过 / 不通过、送审通过 / 不通过由 `POST /api/modeling/review-results` 写入。
5. 建模师提交成果后状态进入“待验收”，写入 ModelingFeedback，供产品组工作指引读取。
6. 建模计时按分钟累计，同一建模师同时只能有一个正在运行的计时；停止计时不作为手动输入，由开始其他款式、提交成果、取消款式等事件自动生成，并写入 ModelingWorkLog。
7. 每次保存会重算 ProjectModelingProgress。
8. 所有任务 7 / 10 必做款式已通过时，只生成项目排期可读取的完成事实，不静默修改项目排期基线。
9. 输出给产品组工作指引的主动事件会写入 ModelingProductGuideEvent，并随当前接口返回。
10. 通用更新入口会返回 `eventType`，第一版用于标识当前保存动作，后续逐步拆成独立事件接口。
11. 分配建模师、清空建模师、标记外包、取消外包会写入 ModelingAssignmentHistory。
```

`PATCH /api/modeling/tasks/:id` 当前返回的 `eventType`：

```text
assign_modeler：分配建模师
clear_modeler：清空建模师
mark_outsourced：标记 / 更新外包
clear_outsource：取消外包
update_schedule_fields：更新排期日期类字段
update_modeler_inputs：保存建模侧可填写信息，例如剩余工时、备注
```

### POST /api/modeling/style-submissions

用途：接收产品组工作指引提交的完整建模款式清单，由建模排期创建或更新 `ModelingTask`。

核心规则：

```text
1. 只接受任务 7 / 10 相关款式。
2. 款式清单以系列为整体提交；一个系列有几款，就提交几款。
3. 款式清单必须且只能有 1 个 isFirstModelingStyle=true。
4. 第一款挂任务 7，其余款式挂任务 10。
5. 新建款式默认 status=待确认，先等待建模侧确认。
6. 已存在且仍处于待确认 / 退回补充的款式，重新提交后回到待确认；已推进的款式不重置状态。
7. 退回补充后的重新提交必须按系列完整提交，不能只提交部分款式。
8. 匹配顺序：sourceStyleId、projectId+projectTaskId+styleCode、projectId+projectTaskId+styleSequence、projectId+projectTaskId+styleName。
9. 返回建模排期专属 todos；存在待确认款式时生成“款式清单待确认”。
10. `FIX-...`、`LOCAL-...`、`RESUBMIT-...`、`fixture-...` 等本地模拟自动编号属于测试字段，不等同于业务款式编号；对外展示时仅 admin 可见。
11. 每次提交记录 `styleSubmissionBatchId` 和 `styleSubmissionVersion`；同一批次重复提交沿用原版本。
12. 退回补充后的重新提交如果缺少原系列款式，会被拒绝；删除 / 取消款式必须走单独取消事件。
```

### POST /api/modeling/style-confirmations

用途：建模侧确认或退回已接收的款式清单。

核心规则：

```text
1. action=confirm 时，当前系列待确认款式默认转为 未启动；若对应任务 7 / 10 已经启动，则补充款式直接转为 未分配。
2. action=return 时，必须填写 note，当前系列待确认款式统一转为 退回补充，并写入 ModelingFeedback。
3. 确认前，款式不能分配、外包、排期、计时、提交成果或进入审核/送审。
4. 确认时会校验第一款唯一、任务 7/10 归属、款式序号、难度、预计天数和原画过审信息。
5. 第一版不支持部分确认；确认 / 退回都按系列整批处理。
6. 如果对应任务 7 / 10 已经启动，补充确认的新款式会直接进入 未分配，并返回 autoStartedAfterConfirmation=true。
```

确认 / 退回成功后返回 `styles`，作为产品组程序保存映射用的款式级任务清单：

```text
projectId
projectTaskId
taskNo
modelingTaskId
sourceStyleId
styleSubmissionBatchId
styleSubmissionVersion
styleCode
styleSequence
styleName
isFirstModelingStyle
isRequired
referenceImageUrls
originalArtStatus
originalArtApprovedDate
difficulty
estimatedWorkdays
previousStatus
modelingStatus
autoStartedAfterConfirmation
```

同时返回顶层 `productGuideEvent`，其中 `productGuideEvent.eventType` 为：

```text
style_list_confirmed
style_list_returned
```

### POST /api/modeling/style-start-events

用途：接收产品组工作指引发出的任务启动事件，把已登记但未启动的款式释放到可分配池。

核心规则：

```text
1. taskNo=7 时 startScope 必须是 first-style，只启动第一款。
2. taskNo=10 时 startScope 必须是 remaining-styles，只启动其余款式。
3. 状态只从 未启动 推进到 未分配。
4. 任务 8、9 不接受款式启动事件。
5. 待确认、退回补充、已启动、已通过、取消状态不会被启动。
6. 重复启动应保持幂等，不重复生成任务或异常状态。
```

返回摘要：

```text
targetCount：本次事件命中的款式数
startedCount：本次从 未启动 推进到 未分配 的款式数
skippedCount：已启动 / 已通过 / 暂停 / 取消等被跳过的款式数
styles：本次命中的完整款式结果，包含 startResult 和 skipReason
skippedStyles：被跳过的款式和跳过原因
```

### POST /api/modeling/review-results

用途：接收产品组工作指引提交的内部审核 / 送审结果，由建模排期更新状态和反馈。

前置规则：

```text
1. 内部通过可送审 / 内部不通过：只能在款式状态为 待验收 时写入。
2. 已送审：只能在款式状态为 待送审 时写入。
3. 等反馈：只能在款式状态为 待送审 / 已送审 时写入。
4. 送审通过 / 送审不通过：只能在款式状态为 待送审 / 已送审 / 等反馈 时写入。
5. 未提交建模成果的款式不能直接写入产品审核或版权方送审结果。
6. 审核结果必须对应最近一次建模师提交成果；请求可传 `submissionFeedbackId` / `feedbackId`，若不是最新提交会被拒绝。
```

状态映射：

```text
内部通过可送审 -> 待送审，写入 internalApprovedDate
内部不通过 -> 排队中，必须有文字反馈，生成内部审核反馈
已送审 -> 已送审，生成送审记录
等反馈 -> 等反馈，生成等待版权方反馈记录
送审通过 -> 已通过，写入 copyrightApprovedDate
送审不通过 -> 排队中，必须有文字反馈，生成版权方反馈
```

补充规则：

```text
1. 通过类可以不填文字反馈，但仍允许附图片 / PDF / PPT。
2. 驳回类必须填写文字反馈，附件可选。
3. 内部通过可送审 / 送审通过会结束正在运行的建模计时。
4. 内部不通过 / 送审不通过不结束正在运行的建模计时。
```

请求字段：

```json
{
  "projectId": "project-id",
  "modelingTaskId": "modeling-task-id",
  "submissionFeedbackId": "latest-modeling-submission-feedback-id",
  "reviewResult": "内部不通过",
  "reviewAt": "2026-05-29",
  "reviewerName": "产品组",
  "feedbackContent": "驳回类必须填写文字反馈",
  "feedbackAttachments": {
    "imageUrl": "https://example.local/feedback/image.png",
    "pdfUrl": "https://example.local/feedback/notes.pdf",
    "pptUrl": "https://example.local/feedback/review.pptx"
  },
  "attachmentUrls": ["https://example.local/legacy-link"]
}
```

返回字段会包含 `submissionFeedbackId`、`reviewedSubmissionRound`、`feedbackContent`、`feedbackAttachments`、`attachmentUrls`、`modelingStatus`、`restoreStatusOnRejection` 和 `writebackDraft`。

### POST /api/modeling/style-cancellations

用途：管理侧取消一个建模款式，避免通过重新提交缺少款式的方式静默删除。

核心规则：

```text
1. 必须传 modelingTaskId 和 cancelReason / reason。
2. 已通过款式不能直接取消，应先走 style-reopen-events。
3. 必做款式取消必须显式传 releaseScheduleRequirement=true，表示该款不再计入项目必做建模完成口径。
4. 如果款式存在运行中的计时，会自动停止并写入 ModelingWorkLog。
5. 写入 ModelingFeedback，feedbackType=款式取消，并重算 ProjectModelingProgress。
```

### POST /api/modeling/style-reopen-events

用途：管理侧将已通过款式重开，让它重新进入建模队列。

核心规则：

```text
1. 必须传 modelingTaskId 和 reopenReason / reason。
2. 只有 已通过 款式可以重开。
3. 重开后状态回到 排队中，清空当前 internalApprovedDate、copyrightApprovedDate、actualFinishDate 和 actualWorkdays。
4. 已累计工时和历史反馈保留。
5. 写入 ModelingFeedback，feedbackType=已通过款式重开，并重算 ProjectModelingProgress。
```

### POST /api/modeling/tasks/:id/work-submissions

用途：建模师提交款式建模成果，回传给产品组工作指引等待产品美术检修。

核心规则：

```text
1. 接收 content、deliverableUrl / deliverableUrls。
2. 只允许真实 ModelingTask；虚拟款式会被拒绝。
3. 未启动、未分配、已通过、取消状态不能提交成果。
4. 提交后 status=待验收，remainingWorkdays=0。
5. 写入 ModelingFeedback，feedbackType=建模师提交，status=待产品美术验收。
6. viewer 角色只能提交分配给自己的款式；admin / manager 可提交全部款式。
7. 返回 reviewRequest，供产品组程序生成待审核入口。
```

`reviewRequest` 包含：

```text
eventType=modeling_work_submitted
eventId
occurredAt
projectId
projectTaskId
modelingTaskId
sourceStyleId
styleCode
styleSequence
styleName
modelingStatus=待验收
feedbackId
submissionFeedbackId
reviewRound
submittedFromStatus
restoreStatusOnRejection
submittedWorkMinutes
submittedAt
submittedBy
content
deliverableUrls
submissionSnapshot
```

接口同时返回顶层 `productGuideEvent`，用于产品组后续补读和对账。

### GET /api/modeling/product-guide-events

用途：给产品组工作指引补读建模排期已经生成的主动事件。

查询参数：

```text
projectId：可选，按项目过滤
eventType：可选，只支持 style_list_confirmed / style_list_returned / modeling_work_submitted
status：可选，默认不限制；第一版事件默认 pending
limit：可选，默认 50，最多 200
```

返回字段：

```text
eventId
eventType
sourceModule=modeling-schedule
targetModule=product-guide
projectId
projectTaskId
modelingTaskId
status
generatedBy
occurredAt
consumedAt
payload
```

### POST /api/modeling/tasks/:id/work-timer

用途：记录建模师开始某个款式的建模工时；停止计时由系统自动生成。

核心规则：

```text
1. 只接受 action=start，当前款式开始计时。
2. 同一建模师开始一个新款式时，自动停止该建模师其他正在运行的计时，并按分钟累计到 actualWorkMinutes。
3. 提交建模成果时，也会自动停止当前款式计时。
4. action=stop 会被拒绝，因为停止计时不是建模组手动输入。
5. 计时只记录建模工时，不允许建模师填写产品检修 / 送审记录。
6. 已通过、取消、待确认、退回补充、未启动状态不能开始计时。
```

### GET /api/modeling/projects/:projectId/styles

用途：给产品组工作指引读取项目下款式建模状态。

返回内容包括：

```text
modelingTaskId、款式编号、款式名称、是否第一款、建模状态、建模师、外包供应商、内部通过日期、版权方过审日期、最新反馈、修改轮次、是否卡住、参考图 URL。建模师提交成果后，最新反馈会包含成果说明和成果链接。
```

### GET /api/modeling/projects/:projectId/progress

用途：给产品组工作指引和项目排期读取项目级建模进度与建模完成事实。建模排期只提供可读事实，不主动写项目排期。

返回内容包括：

```text
sourceTaskNos、allRequiredStylesApproved、canProjectScheduleTreatModelingDone、requiredStyleCount、approvedRequiredStyleCount、lastRequiredStyleApprovedDate、unapprovedRequiredStyles、blockingStyles、submittedOrWaitingStyles、totalRequiredStyles、approvedStyles、inProgressStyles、submittedStyles、waitingSubmissionStyles、outsourcedStyles、unstartedStyles、unassignedStyles、progressPercent。
```
